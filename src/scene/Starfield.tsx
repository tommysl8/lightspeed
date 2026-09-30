import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, type NormalOrGLBufferAttributes, type Points, Sphere, type ShaderMaterial, Vector3 } from 'three';
import { createCmbPointMaterial, createStarMaterial, psfUniforms, relativityUniforms, starUniforms } from '../render/materials';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { imageOrderVariant, lensDrawn, lensedVariant, updateLensVariants, updateVertexLens, useLensVariant } from '../render/lensVariants';
import { lens } from '../render/lens/lensState';
import { quality } from '../render/quality';
import { relView } from '../render/relativisticView';
import { PARSEC_KM } from '../physics/constants';
import { muBoundAxisInto } from '../physics/schwarzschildTables';
import { bodyRecords, registryVersion, subscribeRegistry } from '../sim/bodies';
import type { BodyId } from '../sim/bodies/types';
import { gravity } from '../sim/gravity';
import { flightDrawList, motionYears, nearSunDrawCount, starBoostMag, starData, starDrawList, starsVersion, subscribeStars, type Stars3D } from '../sim/stars';
import { binsStale, holeBinsBuilder, ListScan, type CandidateView, type HoleBins, type HoleBinsBuilder, type StarEpoch } from '../sim/stars/lensCandidates';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';

/** aAbsMag value that hides a star (its registry body draws it instead). */
const HIDDEN = 32767;
/** Magnitudes per unit of ln flux. */
const MAG_PER_LN = 2.5 / Math.LN10;
/** A points object as React Three Fiber hands it over. */
type AnyPoints = Points<BufferGeometry<NormalOrGLBufferAttributes>>;

/** Catalogue indices of the stars registered as bodies: their points give way to the bodies. */
function registeredStars(count: number): Set<number> {
  const out = new Set<number>();
  for (const r of bodyRecords()) {
    const i = r.star?.catalogueIndex;
    if (i !== undefined && i < count) out.add(i);
  }
  return out;
}

/** An index list the field draws, as an attribute with room to grow, and how much of it is in use. */
interface IndexSlot {
  attr: BufferAttribute | null;
  count: number;
}

interface Field {
  geometry: BufferGeometry;
  stars: Stars3D;
  /** The magnitudes as drawn (a copy: hidden stars are overwritten). */
  absMag: Int16Array;
  hidden: Set<number>;
  /** Where the stars are drawn this frame (set in the frame callback, read by chooseStars for each half). */
  fromSun: number;
  years: number;
  magLimit: number;
  /** The index lists of sim/stars/visibility.ts (starDrawList, flightDrawList), made into attributes as they are first wanted. */
  lists: Map<Uint32Array, BufferAttribute>;
  /** Near a black hole: the images the lens adds (lensed draws of the same stars). */
  lensed: LensedImages;
}

/**
 * The images a black hole's lens adds to the star field: the stars its lens brightens past the
 * eye's limit that the field's own draw list leaves out (order 0, merged into that list), and the images bent
 * round the hole (orders 1–3, each an extra draw of the same geometry over its own list), from the candidate
 * lists of sim/stars/lensCandidates.ts, made in slices over frames.
 */
interface LensedImages {
  hole: BodyId | null;
  builder: HoleBinsBuilder | null;
  bins: HoleBins | null;
  scans: [ListScan, ListScan, ListScan, ListScan];
  /** What each order's list (finished or under way) was made for. */
  madeFor: ListKey[];
  /** Order 0's finished list, sorted, and a count that changes with it (the merged lists' cache key). */
  order0: Uint32Array;
  order0Count: number;
  order0Version: number;
  /** The main draw's list merged with order 0's, per main list. */
  merged: Map<Uint32Array, { version: number; slot: IndexSlot }>;
  /** Orders 1–3: each draw's geometry (the field's attributes, its own index) and whether it is drawn. */
  geometries: (BufferGeometry | null)[];
  slots: IndexSlot[];
  shown: boolean[];
}

/** The lens, brightness and date a list was made for (a list is made again when any of them moves). */
interface ListKey {
  version: number;
  hole: BodyId | null;
  axis: Vector3;
  boostMag: number;
  magLimit: number;
  years: number;
  retarded: boolean;
  valid: boolean;
}

/**
 * A list stays valid while the axis turns less than this (the lists allow for it), rad (0.0057°); the star field
 * makes it again once the axis has turned by half that. Kept small: the lists treat every star within it of an axis
 * as on the caustic, and from Sgr A* 0.1° of the Sun's direction holds thousands of stars (a list takes a tenth of
 * a millisecond, so making them again as the camera goes round the hole costs little).
 */
const AXIS_SLACK_RAD = 1e-4;
/** Main-thread time the lists and the bins may take a frame, ms. */
const LIST_MS_PER_FRAME = 1.5;
const BINS_MS_PER_FRAME = 3;

function makeField(stars: Stars3D): Field {
  const g = new BufferGeometry();
  // The typed arrays are the catalogue's own (no copy); only the magnitudes are copied, to hide stars.
  g.setAttribute('position', new BufferAttribute(stars.positions, 3));
  g.setAttribute('aVel', new BufferAttribute(stars.velocitiesInt16, 3, false));
  const absMag = new Int16Array(stars.absMagInt16);
  g.setAttribute('aAbsMag', new BufferAttribute(absMag, 1, false));
  g.setAttribute('aTemp', new BufferAttribute(stars.teff, 1, false));
  // three.js sorts what it draws by the centre of each geometry's bounding sphere, and would
  // work that out over all 329,770 positions on the first frame (34 ms on the main thread). The
  // field is never culled and draws first (renderOrder), so any sphere will do.
  g.boundingSphere = new Sphere(new Vector3(), Infinity);
  const hidden = registeredStars(stars.count);
  for (const i of hidden) absMag[i] = HIDDEN;
  const key = (): ListKey => ({ version: -1, hole: null, axis: new Vector3(), boostMag: 0, magLimit: 0, years: 0, retarded: false, valid: false });
  return {
    geometry: g,
    stars,
    absMag,
    hidden,
    fromSun: 0,
    years: 0,
    magLimit: 0,
    lists: new Map(),
    lensed: {
      hole: null,
      builder: null,
      bins: null,
      scans: [new ListScan(0), new ListScan(1), new ListScan(2), new ListScan(3)],
      madeFor: [key(), key(), key(), key()],
      order0: new Uint32Array(0),
      order0Count: 0,
      order0Version: 0,
      merged: new Map(),
      geometries: [null, null, null, null],
      slots: [0, 1, 2, 3].map(() => ({ attr: null, count: 0 })),
      shown: [false, false, false, false],
    },
  };
}

/** Show and hide stars as their bodies come and go, uploading only the magnitudes that changed. */
function syncHidden(f: Field): void {
  const now = registeredStars(f.stars.count);
  const attr = f.geometry.attributes.aAbsMag as BufferAttribute;
  let changed = false;
  for (const i of f.hidden) {
    if (now.has(i)) continue;
    f.absMag[i] = f.stars.absMagInt16[i];
    attr.addUpdateRange(i, 1);
    changed = true;
  }
  for (const i of now) {
    if (f.hidden.has(i)) continue;
    f.absMag[i] = HIDDEN;
    attr.addUpdateRange(i, 1);
    changed = true;
  }
  f.hidden = now;
  if (changed) attr.needsUpdate = true;
}

/** The index list as an attribute of the field's geometry. */
function listIndex(f: Field, list: Uint32Array): BufferAttribute {
  let a = f.lists.get(list);
  if (!a) f.lists.set(list, (a = new BufferAttribute(list, 1)));
  return a;
}

/** Copy `list` (its first `n`) into a slot's attribute, a new one only when it outgrows the old. */
function fillSlot(slot: IndexSlot, list: Uint32Array, n: number): BufferAttribute {
  let a = slot.attr;
  if (!a || a.array.length < n) {
    let cap = 1024;
    while (cap < n) cap *= 2;
    a = slot.attr = new BufferAttribute(new Uint32Array(cap), 1);
  }
  (a.array as Uint32Array).set(list.subarray(0, n));
  a.clearUpdateRanges();
  a.addUpdateRange(0, Math.max(1, n));
  a.needsUpdate = true;
  slot.count = n;
  return a;
}

/**
 * The brightening bound in magnitudes (sim/stars/visibility.ts starBoostMag), remembered for the last few values: a
 * ring of (φ, ln g, magnitude) in one preallocated array (nothing allocated per frame in motion).
 */
const BOOST_CACHE = 4;
const boostCache = new Float64Array(3 * BOOST_CACHE).fill(NaN);
let boostNext = 0;
function boostMagOf(phi: number, lnG: number): number {
  if (!(phi > 0) && !(lnG > 0)) return 0;
  for (let i = 0; i < BOOST_CACHE; i++) if (boostCache[3 * i] === phi && boostCache[3 * i + 1] === lnG) return boostCache[3 * i + 2];
  const mag = starBoostMag(phi, lnG);
  const o = 3 * boostNext;
  boostCache[o] = phi;
  boostCache[o + 1] = lnG;
  boostCache[o + 2] = mag;
  boostNext = (boostNext + 1) % BOOST_CACHE;
  return mag;
}

/** The largest gravitational blueshift, ln, of light reaching the camera from outside the edge (0 with no lens drawn). */
function lnGMaxNow(): number {
  if (!lensDrawn()) return 0;
  if (lens.obs.frame === 'rain') {
    // −ln(1 − v cos α) is largest at the edge: 1 − v cos α_edge = (1 − v) + 2v sin²(α_edge/2).
    const s = Math.sin(0.5 * lens.edge);
    return Math.max(0, -Math.log(gravity.rainOneMinusV + 2 * gravity.rainV * s * s));
  }
  return Math.max(0, lens.lnG);
}

/** Sorted a ∪ sorted b (b may hold members of a), into out; returns the count. */
function mergeSorted(a: Uint32Array, b: Uint32Array, nb: number, out: Uint32Array): number {
  let i = 0;
  let j = 0;
  let n = 0;
  while (i < a.length || j < nb) {
    const x = i < a.length ? a[i] : 0xffffffff;
    const y = j < nb ? b[j] : 0xffffffff;
    if (x < y) {
      out[n++] = x;
      i++;
    } else if (y < x) {
      out[n++] = y;
      j++;
    } else {
      out[n++] = x;
      i++;
      j++;
    }
  }
  return n;
}
let mergeScratch = new Uint32Array(1024);

/**
 * The stars a draw of the field shows (sim/stars/visibility.ts): with no brightening (at rest far from a black
 * hole, exposure at most 0) only those that can be seen from here (a first stretch near the Sun, a list away
 * from it); with the relativistic half's beaming, a black hole's blueshift or a raised exposure, the far list for
 * the limit raised by the most any star can brighten (flightDrawList), or all of them; and while a lens is drawn
 * also the stars its magnification can lift past the limit (order 0's candidate list, merged in).
 */
function chooseStars(f: Field): void {
  const u = relativityUniforms;
  const phi = u.uPhi.value > 0 ? u.uPhi.value : 0;
  const lensOn = lensDrawn();
  // A lens's frame boost, there and back, shifts the light by up to twice its rapidity too.
  const raise = boostMagOf(phi + (lensOn ? 2 * Math.max(0, gravity.framePhi) : 0), lnGMaxNow()) + MAG_PER_LN * u.uLnExposure.value;
  let list: Uint32Array | null;
  let count = f.stars.count;
  if (!(raise > 0)) {
    const near = nearSunDrawCount(f.stars.nearSun, f.fromSun, f.years, f.magLimit);
    list = near !== null ? null : starDrawList(f.stars.drawLists, f.fromSun, f.years, f.magLimit);
    if (near !== null) count = Math.min(near, f.stars.count);
  } else list = flightDrawList(f.stars.drawLists, f.fromSun, f.years, f.magLimit, raise);
  const L = f.lensed;
  let index: BufferAttribute | null = null;
  if (list && lensOn && L.order0Count > 0) {
    // The lens's own candidates join the list (both ascending, no star twice).
    let m = L.merged.get(list);
    if (!m) L.merged.set(list, (m = { version: -1, slot: { attr: null, count: 0 } }));
    if (m.version !== L.order0Version) {
      const need = list.length + L.order0Count;
      if (mergeScratch.length < need) mergeScratch = new Uint32Array(Math.max(need, 2 * mergeScratch.length));
      const n = mergeSorted(list, L.order0, L.order0Count, mergeScratch);
      fillSlot(m.slot, mergeScratch, n);
      m.version = L.order0Version;
    }
    index = m.slot.attr;
    count = m.slot.count;
  } else if (list) {
    index = listIndex(f, list);
    count = list.length;
  } else if (lensOn && L.order0Count > 0 && count < f.stars.count) {
    // A first stretch near the Sun and a lens: draw them all rather than merge a long stretch.
    count = f.stars.count;
  }
  const g = f.geometry;
  if (g.index !== index) g.setIndex(index);
  if (g.drawRange.count !== count) g.setDrawRange(0, count);
}

/** Order k's extra draw: the field's attributes with an index of its own. */
function orderGeometry(f: Field, k: number): BufferGeometry {
  const L = f.lensed;
  let g = L.geometries[k];
  if (!g) {
    g = new BufferGeometry();
    for (const name of ['position', 'aVel', 'aAbsMag', 'aTemp']) g.setAttribute(name, f.geometry.getAttribute(name));
    g.boundingSphere = new Sphere(new Vector3(), Infinity);
    g.setDrawRange(0, 0);
    L.geometries[k] = g;
  }
  return g;
}

const holePc = new Vector3();
const axisScratch = { lnPsiMin: 0, invDelta: 0 };
const view: CandidateView = {
  inv: null as unknown as CandidateView['inv'],
  muBound: new Float32Array(0),
  lnPsiMin: 0,
  invDelta: 0,
  axis: new Vector3(),
  rPc: 0,
  bSlope: 1,
  framePhi: 0,
  years: 0,
  retarded: false,
  lnExposure: 0,
  axisSlackRad: AXIS_SLACK_RAD,
};
const epochNow: StarEpoch = { years: 0, retarded: false, camPc: { x: 0, y: 0, z: 0 } };
/** Which image orders are drawn this frame (updateLensedImages). */
const needs = [false, false, false, false];

/** Whether the field draws a list (not every star) for a limit raised by `raise` magnitudes. */
function listed(f: Field, lists: Stars3D['drawLists'], raise: number): boolean {
  return raise > 0 ? flightDrawList(lists, f.fromSun, f.years, f.magLimit, raise) !== null : starDrawList(lists, f.fromSun, f.years, f.magLimit) !== null;
}

/**
 * Once a frame while a lens is drawn: the hole's bins (built in slices), then each order's list made again in
 * slices whenever the lens, its axis (by more than half the lists' allowance), the brightness bound or the date
 * has moved; a finished list goes into its draw.
 */
function updateLensedImages(f: Field, camPc: Vector3, retarded: boolean): void {
  const L = f.lensed;
  const hole = lens.hole;
  const on = lensDrawn() && hole !== null && lens.inv !== null && lens.inv.thetaE > 0;
  if (!on || !hole) {
    L.order0Count = 0;
    for (let k = 1; k < 4; k++) L.shown[k] = false;
    for (const key of L.madeFor) key.valid = false;
    return;
  }
  const body = sim.bodies[hole];
  if (!body) return;
  holePc.copy(body.pos).divideScalar(PARSEC_KM);
  epochNow.years = f.years;
  epochNow.retarded = retarded;
  epochNow.camPc = camPc;
  // The bins: built in slices for this hole, again once the stars have moved too far since.
  if (L.hole !== hole || (L.bins && binsStale(L.bins, epochNow))) {
    L.hole = hole;
    L.bins = null;
    L.order0Count = 0;
    for (const k of L.madeFor) k.valid = false;
    const s = f.stars;
    L.builder = holeBinsBuilder(
      hole,
      { x: holePc.x, y: holePc.y, z: holePc.z },
      { count: s.count, positions: s.positions, ecliptic: true, velocities: s.velocitiesInt16, velocityUnitKms: s.velocityUnitKms, absMag: f.absMag, absMagUnit: s.absMagUnit, teff: s.teff },
      { years: f.years, retarded, camPc: { x: camPc.x, y: camPc.y, z: camPc.z } },
    );
  }
  if (!L.bins && L.builder) {
    if (L.builder.step(BINS_MS_PER_FRAME)) {
      L.bins = L.builder.bins;
      L.builder = null;
    } else return;
  }
  const bins = L.bins;
  if (!bins) return;
  // This frame's lens, for the lists.
  const inv = lens.inv;
  if (!inv) return;
  view.inv = inv;
  view.muBound = lens.muBound;
  muBoundAxisInto(inv, axisScratch);
  view.lnPsiMin = axisScratch.lnPsiMin;
  view.invDelta = axisScratch.invDelta;
  (view.axis as Vector3).copy(lens.axis);
  view.rPc = (lens.obs.r * lens.mKm) / PARSEC_KM;
  if (lens.obs.frame === 'rain') {
    const s = Math.sin(0.5 * lens.edge);
    const den = gravity.rainOneMinusV + 2 * gravity.rainV * s * s;
    view.bSlope = Math.max(1 / den, (1 + gravity.rainV) / (den * den));
  } else view.bSlope = Math.exp(Math.max(0, lens.lnG));
  view.framePhi = gravity.framePhi;
  view.years = f.years;
  view.retarded = retarded;
  view.lnExposure = Math.max(0, relView.lnExposure, relView.lnExposureClassical);
  const phiView = Math.max(relView.halves[0].phi, relView.halves[1].phi, 0);
  const boostMag = boostMagOf(phiView + 2 * Math.max(0, gravity.framePhi), lnGMaxNow());
  // Which orders are drawn: order 0 only where the field draws a list (in either half); 2 and 3 once the ring
  // band is a pixel wide (and not at rung 2).
  const lists = f.stars.drawLists;
  const lnGMax = lnGMaxNow();
  const raise0 = boostMagOf(2 * Math.max(0, gravity.framePhi), lnGMax) + MAG_PER_LN * relView.lnExposureClassical;
  const raise1 = boostMagOf(relView.halves[1].phi + 2 * Math.max(0, gravity.framePhi), lnGMax) + MAG_PER_LN * relView.lnExposure;
  const wantBands = lens.ringBandPx >= 1 && quality.lensRung < 2;
  needs[0] = listed(f, lists, raise0) || listed(f, lists, raise1);
  needs[1] = true;
  needs[2] = wantBands;
  needs[3] = wantBands;
  if (!needs[0]) L.order0Count = 0;
  let budget = LIST_MS_PER_FRAME;
  for (let k = 0; k < 4; k++) {
    if (!needs[k]) {
      if (k > 0) L.shown[k] = false;
      continue;
    }
    const key = L.madeFor[k];
    const scan = L.scans[k];
    const stale =
      !key.valid ||
      key.version !== lens.version ||
      key.hole !== hole ||
      key.axis.angleTo(lens.axis) > 0.5 * AXIS_SLACK_RAD ||
      Math.abs(key.boostMag - boostMag) > 0.01 ||
      key.magLimit !== f.magLimit ||
      Math.abs(key.years - f.years) > 1 ||
      key.retarded !== retarded;
    if (stale && (!scan.busy || !key.valid)) {
      if (!scan.start(bins, f.magLimit, boostMag, view)) continue;
      key.version = lens.version;
      key.hole = hole;
      key.axis.copy(lens.axis);
      key.boostMag = boostMag;
      key.magLimit = f.magLimit;
      key.years = f.years;
      key.retarded = retarded;
      key.valid = true;
    }
    if (!scan.busy || budget <= 0) continue;
    const t0 = performance.now();
    const done = scan.step(budget);
    budget -= performance.now() - t0;
    if (!done) continue;
    if (k === 0) {
      if (L.order0.length < done.length) L.order0 = new Uint32Array(Math.max(done.length, 2 * L.order0.length, 256));
      L.order0.set(done);
      L.order0.subarray(0, done.length).sort();
      L.order0Count = done.length;
      L.order0Version++;
    } else {
      const g = orderGeometry(f, k);
      const a = fillSlot(L.slots[k], done, done.length);
      if (g.index !== a) g.setIndex(a);
      g.setDrawRange(0, done.length);
      L.shown[k] = done.length > 0;
    }
  }
}

/**
 * The stars in 3D: the 329,770 stars of the catalogue (sim/stars) in one draw call, each at its
 * own distance, moving with its own velocity, as bright and as coloured as it looks from where
 * the camera is (shaders/stars.vert.glsl). The 9,959 naked-eye stars come first (stars3d-bright),
 * then the full catalogue replaces them star for star. Stars registered as bodies (the named
 * stars, and any star the camera comes close to) are drawn by the registry instead. Also the
 * cosmic microwave background's hot spot, which joins the sky as a point source at extreme speed.
 *
 * Near a black hole: the field draws with its lensed variant (render/lensVariants.ts, which
 * this component's frame callback swaps for every lensed layer), each star at its primary image, and adds the
 * lens's other images of the stars that can show them (orders 1–3, extra draws of the same geometry over
 * candidate lists: sim/stars/lensCandidates.ts). In flight, and near a hole, the field draws the list of the
 * stars that can be seen for a limit raised by the most any star can brighten, not all of them.
 */
export function Starfield() {
  const material = useMemo(createStarMaterial, []);
  const version = useSyncExternalStore(subscribeStars, starsVersion);
  const registry = useSyncExternalStore(subscribeRegistry, registryVersion);
  const [field, setField] = useState<Field | null>(null);
  const points = useRef<AnyPoints | null>(null);
  useLensVariant(points);
  // The extra images' programs: the lensed variant with its image order (the same program).
  const orderMaterials = useMemo(() => {
    const lensed = lensedVariant(material);
    return [lensed, imageOrderVariant(lensed, 1), imageOrderVariant(lensed, 2), imageOrderVariant(lensed, 3)] as ShaderMaterial[];
  }, [material]);
  const orderPoints = useRef<(AnyPoints | null)[]>([null, null, null, null]);

  useEffect(() => {
    const stars = starData.stars;
    if (!stars || stars === field?.stars) return;
    setField(makeField(stars));
    // `version` stands for starData.stars.
  }, [version]);
  useEffect(
    () => () => {
      field?.geometry.dispose();
      for (const g of field?.lensed.geometries ?? []) g?.dispose();
    },
    [field],
  );
  useEffect(() => {
    if (field) syncHidden(field);
  }, [registry, field]);

  const camPc = useMemo(() => new Vector3(), []);
  useFrame(() => {
    // Every lensed layer's program for this frame (the lens was decided at priority −10), and the brightening
    // bound its stars' pre-cull uses.
    updateLensVariants();
    if (lensDrawn()) updateVertexLens(Math.max(relView.halves[0].phi, relView.halves[1].phi, 0), gravity.framePhi, lnGMaxNow());
    // The camera in parsecs, J2000 ecliptic (world (x, y, z) = ecliptic (x, z, −y)), as hi + lo.
    const c = sim.camera.pos;
    const ex = c.x / PARSEC_KM;
    const ey = -c.z / PARSEC_KM;
    const ez = c.y / PARSEC_KM;
    const hi = starUniforms.uCamHi.value.set(Math.fround(ex), Math.fround(ey), Math.fround(ez));
    starUniforms.uCamLo.value.set(ex - hi.x, ey - hi.y, ez - hi.z);
    const years = motionYears(2000 + sim.astroTime.tt / 365.25);
    starUniforms.uYears.value = years;
    const retarded = useUI.getState().retarded;
    starUniforms.uRetarded.value = retarded ? 1 : 0;
    // What each draw shows is chosen per half (chooseStars): near the Sun only the first stars can be seen
    // (sim/stars/visibility.ts), and away from it, or near it once the stars stand still, only those of a list
    // (from outside the Milky Way, a hundred at most, none of which shows): the rest are not drawn, which leaves
    // the picture as it is and saves the vertex shader most of its work.
    if (field) {
      field.fromSun = Math.hypot(ex, ey, ez);
      field.years = years;
      field.magLimit = psfUniforms.uMagLimit.value;
      camPc.copy(c).divideScalar(PARSEC_KM);
      updateLensedImages(field, camPc, retarded);
      for (let k = 1; k < 4; k++) {
        const o = orderPoints.current[k];
        if (o) o.visible = field.lensed.shown[k];
      }
    }
  });

  return (
    <>
      {field && (
        <points
          geometry={field.geometry}
          material={material}
          frustumCulled={false}
          renderOrder={-100}
          ref={(o) => {
            points.current = o;
            if (!o) return;
            o.layers.set(POINTS_LAYER);
            o.onBeforeRender = () => chooseStars(field);
          }}
        />
      )}
      {field &&
        [1, 2, 3].map((k) => (
          <points
            key={k}
            geometry={orderGeometry(field, k)}
            material={orderMaterials[k]}
            frustumCulled={false}
            renderOrder={-100}
            visible={false}
            ref={(o) => {
              orderPoints.current[k] = o;
              o?.layers.set(POINTS_LAYER);
            }}
          />
        ))}
      <CmbSpot />
    </>
  );
}

/**
 * The CMB's hot spot dead ahead once it is narrower than a pixel. One vertex; the shader places
 * it (its direction is a uniform) and hides it outside the relativistic view.
 */
function CmbSpot() {
  const material = useMemo(createCmbPointMaterial, []);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
    return g;
  }, []);
  return (
    <points
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-99}
      ref={(o) => o?.layers.set(POINTS_LAYER)}
    />
  );
}
