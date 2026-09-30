/**
 * The nuclear star cluster's field round Sagittarius A* (sim/galaxy/nuclearCluster.ts): its 60,000 stars as
 * points, drawn within 60 pc of the hole with the star field's lensed program, and their images bent round the
 * far side of the hole.
 *
 * How: one draw of the field's own geometry (positions in parsecs from Sgr A*, J2000 ecliptic
 * axes; absolute V and temperature from the file; no motion) with the lensed variant of a star material of its
 * own (render/lensVariants.ts: the same program as the star field's lensed variant, so it compiles once, in the
 * background), whose camera uniforms are the field's own (the camera relative to Sgr A*: exact near the hole,
 * from the gravity state), whose stars nearer the camera than 0.01 pc are skipped (their light is the glow's
 * stand-in, sim/galaxy/glow.ts nuclearLocalColumn) and whose exposure is the view's plus ln w, so the field
 * fades in as the Galaxy model's own nuclear particles fade out (w = 1 within 30 pc of Sgr A*, 0 beyond 60).
 * The file is sorted brightest first as seen from the hole, so the lens's quality rungs 1 and 2 draw the first
 * 30,000 and 10,000 (the glow then holds the rest: sim/galaxy/nuclearCluster.ts). While Sgr A*'s lens is drawn, the images bent round the far side of the hole (order 1) are a second
 * draw of the same geometry, with the variant's order-1 clone, over a candidate list (sim/stars/
 * lensCandidates.ts: the field binned once by direction from the hole, the list made again in slices whenever
 * the lens, its axis or the brightness bound moves, as scene/Starfield.tsx does for the catalogue). Orders 2
 * and 3, the thin rings at the shadow's edge, are drawn for the catalogue's stars only.
 *
 * Why the lensed program even with the lens off: its LENS branch draws straight when uLensOn is 0, and only it
 * skips the stars beside the camera; so nothing is drawn until it has compiled (lensProgramsReady), which it
 * does in the background long before anyone reaches the Galactic Centre. Until then, and while the file loads (or if
 * it fails), the glow holds the points' share of the light as well (sim/galaxy/nuclearCluster.ts nscPointsGate, which
 * scene/SimDriver.tsx opens with the same test).
 *
 * Cost (the target laptop, pixel ratio 2, whole-frame A/B: docs/data/blackholes.md §6): all 60,000 points
 * 1.3 ms a frame, 30,000 at rung 1 0.65, 10,000 at rung 2 about 0.2–0.4, nearly all of it the lensed star
 * program's vertex work (about 20 ns a star: every field star is bright, so none is pre-culled); order 1 0.01 ms
 * over its few hundred stars near the hole, 0.18 at 10 pc where its list reaches its cap of 20,000. On the main thread the bins about 6 ms once, in slices of 3 ms, and each list a fraction of a
 * millisecond, in slices of 1 ms. Nothing beyond 60 pc of Sgr A*.
 *
 * Twins: scene/Starfield.tsx (the catalogue's draw and its lists, the same program), sim/galaxy/nuclearCluster.ts.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Sphere, Vector3, type Object3D, type ShaderMaterial } from 'three';
import { createStarMaterial, psfUniforms, relativityUniforms } from '../render/materials';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { imageOrderVariant, lensDrawn, lensedVariant } from '../render/lensVariants';
import { lens, lensProgramsReady } from '../render/lens/lensState';
import { quality } from '../render/quality';
import { relView } from '../render/relativisticView';
import { PARSEC_KM } from '../physics/constants';
import { muBoundAxisInto } from '../physics/schwarzschildTables';
import { NSC_EXCLUDE_PC, nscPointUniforms, nscStars, nscVersion, nuclear, subscribeNsc, updateNuclearPoints, type NuclearStars } from '../sim/galaxy/nuclearCluster';
import { SGR_A_ID } from '../sim/galaxy/records';
import { gravity } from '../sim/gravity';
import { starBoostMag } from '../sim/stars/visibility';
import { holeBinsBuilder, ListScan, type CandidateView, type HoleBins, type HoleBinsBuilder } from '../sim/stars/lensCandidates';
import { sim } from '../sim/sim';

const camSgrKm = new Vector3();

/** The camera relative to Sgr A*, km, world axes: exact near the hole (the gravity state's), else from the float64 positions. */
function cameraFromSgrA(): Vector3 | null {
  if (gravity.hole === SGR_A_ID) return camSgrKm.copy(gravity.camRelHoleKm);
  const b = sim.bodies[SGR_A_ID];
  return b?.present ? camSgrKm.copy(sim.camera.pos).sub(b.pos) : null;
}

/** The field's geometry: the file's arrays, no copies. */
function fieldGeometry(s: NuclearStars): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(s.positionsPc, 3));
  g.setAttribute('aAbsMag', new BufferAttribute(s.absMagInt16, 1, false));
  g.setAttribute('aTemp', new BufferAttribute(s.teffK, 1, false));
  // Never culled, drawn in a fixed order: skip three.js's bounding sphere over every point.
  g.boundingSphere = new Sphere(new Vector3(), Infinity);
  return g;
}

/** The order-1 draw's geometry: the field's attributes with an index of its own (the candidate list). */
function orderGeometry(field: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const name of ['position', 'aAbsMag', 'aTemp']) g.setAttribute(name, field.getAttribute(name));
  g.boundingSphere = new Sphere(new Vector3(), Infinity);
  g.setDrawRange(0, 0);
  return g;
}

/** The field's material: the lensed variant of a star material with the field's own camera, exposure and near skip. */
function fieldMaterial(): ShaderMaterial {
  const plain = createStarMaterial();
  const u = plain.uniforms;
  u.uCamHi = nscPointUniforms.uCamHi;
  u.uCamLo = nscPointUniforms.uCamLo;
  u.uYears = nscPointUniforms.uYears;
  u.uRetarded = nscPointUniforms.uRetarded;
  u.uLnExposure = nscPointUniforms.uLnExposure;
  // The stars stand still: no velocity attribute, read as (0, 0, 0).
  (plain.defaultAttributeValues as Record<string, number[]>).aVel = [0, 0, 0];
  plain.name = 'nuclear star cluster';
  const lensed = lensedVariant(plain);
  lensed.uniforms.uNearSkipPc.value = NSC_EXCLUDE_PC;
  return lensed;
}

/** Before each draw (each half of the split view has its own exposure): the view's exposure and the field's share. */
function setExposure(): void {
  nscPointUniforms.uLnExposure.value = relativityUniforms.uLnExposure.value + Math.log(Math.max(nuclear.w, 1e-30));
}

// ─── The images bent round the far side of the hole (order 1) ──────────────────────────────────

/** Main-thread time the bins and the list may take a frame, ms. */
const BINS_MS_PER_FRAME = 3;
const LIST_MS_PER_FRAME = 1;
/** A list stays valid while the axis turns less than this (the list allows for it), rad (0.1°, as the star field's). */
const AXIS_SLACK_RAD = 1.75e-3;
const ORIGIN = { x: 0, y: 0, z: 0 };

/** The field's bins (built once: its stars stand still) and its order-1 list. */
const images = {
  stars: null as NuclearStars | null,
  builder: null as HoleBinsBuilder | null,
  bins: null as HoleBins | null,
  scan: new ListScan(1),
  /** What the list (finished or under way) was made for. */
  madeFor: { valid: false, version: -1, axis: new Vector3(), boostMag: 0, magLimit: 0, points: 0 },
  index: null as BufferAttribute | null,
  count: 0,
  shown: false,
};

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

/** The largest gravitational blueshift, ln, of light reaching the camera from outside the edge (as scene/Starfield.tsx). */
function lnGMaxNow(): number {
  if (lens.obs.frame === 'rain') {
    const s = Math.sin(0.5 * lens.edge);
    return Math.max(0, -Math.log(gravity.rainOneMinusV + 2 * gravity.rainV * s * s));
  }
  return Math.max(0, lens.lnG);
}

/** The list's indices below `points` (the stars the main draw shows at this rung) into the order-1 geometry. */
function fillIndex(g: BufferGeometry, list: Uint32Array, points: number): void {
  let a = images.index;
  if (!a || a.array.length < list.length) {
    let cap = 1024;
    while (cap < list.length) cap *= 2;
    a = images.index = new BufferAttribute(new Uint32Array(cap), 1);
  }
  const out = a.array as Uint32Array;
  let n = 0;
  for (let i = 0; i < list.length; i++) if (list[i] < points) out[n++] = list[i];
  a.clearUpdateRanges();
  a.addUpdateRange(0, Math.max(1, n));
  a.needsUpdate = true;
  if (g.index !== a) g.setIndex(a);
  g.setDrawRange(0, n);
  images.count = n;
}

/**
 * Once a frame: while Sgr A*'s lens is drawn over the field, its bins (in slices, once), then its order-1 list made
 * again in slices whenever the lens, its axis (by more than half the list's allowance), the brightness bound, the
 * eye's limit or the number of points drawn has moved; a finished list goes into the order-1 draw.
 */
function updateOrder1(stars: NuclearStars, g: BufferGeometry): void {
  const inv = lens.inv;
  const on = nuclear.w > 0 && nuclear.points > 0 && lensDrawn() && lens.hole === SGR_A_ID && inv !== null && inv.thetaE > 0;
  if (!on || !inv) {
    images.shown = false;
    images.madeFor.valid = false;
    return;
  }
  if (images.stars !== stars) {
    images.stars = stars;
    images.bins = null;
    images.madeFor.valid = false;
    images.builder = holeBinsBuilder(
      SGR_A_ID,
      ORIGIN,
      { count: stars.count, positions: stars.positionsPc, ecliptic: true, absMag: stars.absMagInt16, absMagUnit: 0.01, teff: stars.teffK },
      { years: 0, retarded: false, camPc: ORIGIN },
    );
  }
  if (!images.bins && images.builder) {
    if (!images.builder.step(BINS_MS_PER_FRAME)) return;
    images.bins = images.builder.bins;
    images.builder = null;
  }
  const bins = images.bins;
  if (!bins) return;
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
  // The field's exposure is the view's plus ln w ≤ 0: the view's is a bound.
  view.lnExposure = Math.max(0, relView.lnExposure, relView.lnExposureClassical);
  const phiView = Math.max(relView.halves[0].phi, relView.halves[1].phi, 0);
  const lnG = lnGMaxNow();
  const phi = phiView + 2 * Math.max(0, gravity.framePhi);
  const boostMag = phi > 0 || lnG > 0 ? starBoostMag(phi, lnG) : 0;
  const magLimit = psfUniforms.uMagLimit.value;
  const key = images.madeFor;
  const scan = images.scan;
  const stale =
    !key.valid ||
    key.version !== lens.version ||
    key.axis.angleTo(lens.axis) > 0.5 * AXIS_SLACK_RAD ||
    Math.abs(key.boostMag - boostMag) > 0.01 ||
    key.magLimit !== magLimit ||
    key.points !== nuclear.points;
  if (stale && (!scan.busy || !key.valid)) {
    if (!scan.start(bins, magLimit, boostMag, view)) return;
    key.version = lens.version;
    key.axis.copy(lens.axis);
    key.boostMag = boostMag;
    key.magLimit = magLimit;
    key.points = nuclear.points;
    key.valid = true;
  }
  if (scan.busy) {
    const done = scan.step(LIST_MS_PER_FRAME);
    if (done) fillIndex(g, done, nuclear.points);
  }
  images.shown = key.valid && images.count > 0;
}

export function NuclearCluster() {
  const version = useSyncExternalStore(subscribeNsc, nscVersion);
  const stars = useMemo(() => nscStars(), [version]);
  const geometry = useMemo(() => (stars ? fieldGeometry(stars) : null), [stars]);
  const geometry1 = useMemo(() => (geometry ? orderGeometry(geometry) : null), [geometry]);
  const material = useMemo(fieldMaterial, []);
  const material1 = useMemo(() => imageOrderVariant(material, 1), [material]);
  const points = useRef<Object3D | null>(null);
  const points1 = useRef<Object3D | null>(null);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(
    () => () => {
      geometry1?.dispose();
      images.stars = null;
      images.index = null;
      images.count = 0;
    },
    [geometry1],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const w = updateNuclearPoints(cameraFromSgrA(), quality.lensRung);
    if (!geometry || !stars || !geometry1) return;
    const n = w > 0 && lensProgramsReady() ? nuclear.points : 0;
    if (geometry.drawRange.count !== n) geometry.setDrawRange(0, n);
    if (points.current) points.current.visible = n > 0;
    if (n > 0) updateOrder1(stars, geometry1);
    else images.shown = false;
    if (points1.current) points1.current.visible = images.shown;
  });

  if (!geometry || !geometry1) return null;
  return (
    <>
      <points
        geometry={geometry}
        material={material}
        frustumCulled={false}
        renderOrder={-100}
        visible={false}
        ref={(o) => {
          points.current = o;
          if (!o) return;
          o.layers.set(POINTS_LAYER);
          o.onBeforeRender = setExposure;
        }}
      />
      <points
        geometry={geometry1}
        material={material1}
        frustumCulled={false}
        renderOrder={-100}
        visible={false}
        ref={(o) => {
          points1.current = o;
          if (!o) return;
          o.layers.set(POINTS_LAYER);
          o.onBeforeRender = setExposure;
        }}
      />
    </>
  );
}
