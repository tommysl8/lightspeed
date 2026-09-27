import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import { createCmbPointMaterial, createStarMaterial, psfUniforms, relativityUniforms, starUniforms } from '../render/materials';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { PARSEC_KM } from '../physics/constants';
import { bodyRecords, registryVersion, subscribeRegistry } from '../sim/bodies';
import { motionYears, nearSunDrawCount, starData, starDrawList, starsVersion, subscribeStars, type Stars3D } from '../sim/stars';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';

/** aAbsMag value that hides a star (its registry body draws it instead). */
const HIDDEN = 32767;

/** Catalogue indices of the stars registered as bodies: their points give way to the bodies. */
function registeredStars(count: number): Set<number> {
  const out = new Set<number>();
  for (const r of bodyRecords()) {
    const i = r.star?.catalogueIndex;
    if (i !== undefined && i < count) out.add(i);
  }
  return out;
}

interface Field {
  geometry: BufferGeometry;
  stars: Stars3D;
  /** The magnitudes as drawn (a copy: hidden stars are overwritten). */
  absMag: Int16Array;
  hidden: Set<number>;
  /** What the classical view draws this frame: the first `count` stars, or the `count` of an index list. */
  classical: { count: number; index: BufferAttribute | null };
  /** The index lists of sim/stars/visibility.ts starDrawList, made into attributes as they are first wanted. */
  lists: Map<Uint32Array, BufferAttribute>;
}

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
  return { geometry: g, stars, absMag, hidden, classical: { count: stars.count, index: null }, lists: new Map() };
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

/**
 * Before each draw of the field (the split view draws it once for each half): with the point
 * uniforms of the classical view, only the stars that can be seen (field.classical); with those of
 * the relativistic view, which brightens stars ahead, all of them.
 */
function chooseStars(f: Field): void {
  const u = relativityUniforms;
  const classical = !(u.uPhi.value > 0) && !(u.uLnExposure.value > 0);
  const g = f.geometry;
  const index = classical ? f.classical.index : null;
  const count = classical ? f.classical.count : f.stars.count;
  if (g.index !== index) g.setIndex(index);
  if (g.drawRange.count !== count) g.setDrawRange(0, count);
}

/**
 * The stars in 3D: the 329,770 stars of the catalogue (sim/stars) in one draw call, each at its
 * own distance, moving with its own velocity, as bright and as coloured as it looks from where
 * the camera is (shaders/stars.vert.glsl). The 9,959 naked-eye stars come first (stars3d-bright),
 * then the full catalogue replaces them star for star. Stars registered as bodies (the named
 * stars, and any star the camera comes close to) are drawn by the registry instead. Also the
 * cosmic microwave background's hot spot, which joins the sky as a point source at extreme speed.
 */
export function Starfield() {
  const material = useMemo(createStarMaterial, []);
  const version = useSyncExternalStore(subscribeStars, starsVersion);
  const registry = useSyncExternalStore(subscribeRegistry, registryVersion);
  const [field, setField] = useState<Field | null>(null);

  useEffect(() => {
    const stars = starData.stars;
    if (!stars || stars === field?.stars) return;
    setField(makeField(stars));
    // `version` stands for starData.stars.
  }, [version]);
  useEffect(() => () => field?.geometry.dispose(), [field]);
  useEffect(() => {
    if (field) syncHidden(field);
  }, [registry, field]);

  useFrame(() => {
    // The camera in parsecs, J2000 ecliptic (world (x, y, z) = ecliptic (x, z, −y)), as hi + lo.
    const c = sim.camera.pos;
    const ex = c.x / PARSEC_KM;
    const ey = -c.z / PARSEC_KM;
    const ez = c.y / PARSEC_KM;
    const hi = starUniforms.uCamHi.value.set(Math.fround(ex), Math.fround(ey), Math.fround(ez));
    starUniforms.uCamLo.value.set(ex - hi.x, ey - hi.y, ez - hi.z);
    const years = motionYears(2000 + sim.astroTime.tt / 365.25);
    starUniforms.uYears.value = years;
    starUniforms.uRetarded.value = useUI.getState().retarded ? 1 : 0;
    // What the classical view draws (chooseStars; the relativistic view draws every star). Near the
    // Sun only the first stars can be seen (sim/stars/visibility.ts), and away from it, or near it
    // once the stars stand still, only those of a list (from outside the Milky Way, a hundred at
    // most, none of which shows): the rest are not drawn, which leaves the picture as it is and saves
    // the vertex shader most of its work.
    if (field) {
      const fromSun = Math.hypot(ex, ey, ez);
      const magLimit = psfUniforms.uMagLimit.value;
      const near = nearSunDrawCount(field.stars.nearSun, fromSun, years, magLimit);
      const list = near !== null ? null : starDrawList(field.stars.drawLists, fromSun, years, magLimit);
      const d = field.classical;
      d.index = list ? listIndex(field, list) : null;
      d.count = list ? list.length : Math.min(near ?? field.stars.count, field.stars.count);
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
            if (!o) return;
            o.layers.set(POINTS_LAYER);
            o.onBeforeRender = () => chooseStars(field);
          }}
        />
      )}
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
