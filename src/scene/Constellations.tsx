/**
 * The 88 IAU constellation figures, drawn between the real 3D stars (sim/stars, from
 * public/data/constellations.json: d3-celestial's figures). From Earth they are the figures of any
 * star chart; fly away and they come apart, because their stars are at very different distances.
 * One draw call; each figure segment is cut into pieces so that it stays a straight 3D segment
 * (a curve on the sky) however close the camera comes. Shown per ui/constellations.ts; unless they
 * were turned on, a figure that has come apart fades away.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Sphere, Vector3, type LineSegments } from 'three';
import { CONSTELLATION_FIGURE_SLOTS, createConstellationMaterial } from '../render/materials';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { PARSEC_KM } from '../physics/constants';
import {
  C_PC_PER_YR,
  constellationSegments,
  KMS_TO_PC_PER_YR,
  motionYears,
  starData,
  starsVersion,
  subscribeStars,
  type ConstellationsFile,
  type Stars3D,
} from '../sim/stars';
import { constellationsNow, figureFade, figureOpacity } from '../ui/constellations';
import { pixelsPerRadian } from '../sim/derived';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';

/** Pieces per figure segment. */
const PIECES = 12;
/** The gap left between a line and each star it joins, CSS px. */
const GAP_PX = 5;
/** Opacity of the lines when shown. */
const OPACITY = 0.42;

function figureGeometry(file: ConstellationsFile, stars: Stars3D): BufferGeometry {
  const { pairs, owner } = constellationSegments(file);
  const nSeg = pairs.length / 2;
  const n = nSeg * PIECES * 2;
  const posA = new Float32Array(n * 3);
  const velA = new Float32Array(n * 3);
  const posB = new Float32Array(n * 3);
  const velB = new Float32Array(n * 3);
  const t = new Float32Array(n);
  const fig = new Float32Array(n);
  let v = 0;
  for (let s = 0; s < nSeg; s++) {
    const a = pairs[2 * s];
    const b = pairs[2 * s + 1];
    for (let k = 0; k < PIECES; k++) {
      for (const end of [k / PIECES, (k + 1) / PIECES]) {
        for (let c = 0; c < 3; c++) {
          posA[3 * v + c] = stars.positions[3 * a + c];
          velA[3 * v + c] = stars.velocitiesInt16[3 * a + c];
          posB[3 * v + c] = stars.positions[3 * b + c];
          velB[3 * v + c] = stars.velocitiesInt16[3 * b + c];
        }
        t[v] = end;
        fig[v] = Math.min(owner[s], CONSTELLATION_FIGURE_SLOTS - 1);
        v++;
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(posA, 3));
  g.setAttribute('aVelA', new Float32BufferAttribute(velA, 3));
  g.setAttribute('aPosB', new Float32BufferAttribute(posB, 3));
  g.setAttribute('aVelB', new Float32BufferAttribute(velB, 3));
  g.setAttribute('aT', new Float32BufferAttribute(t, 1));
  g.setAttribute('aFigure', new Float32BufferAttribute(fig, 1));
  // Never culled, drawn in its render order: no need for three.js to work out a bounding sphere.
  g.boundingSphere = new Sphere(new Vector3(), Infinity);
  return g;
}

/** The figures' segments (star pairs, and the figure each is in), with room to measure each figure. */
interface Figures {
  pairs: Uint32Array;
  owner: Uint8Array;
  /** Per figure: the most and the least any of its segments has grown on the sky, against the view from the Sun. */
  most: Float64Array;
  least: Float64Array;
}

function figures(file: ConstellationsFile): Figures {
  const { pairs, owner } = constellationSegments(file);
  const n = file.constellations.length;
  return { pairs, owner, most: new Float64Array(n), least: new Float64Array(n) };
}

/** The angle between two vectors, radians (exact for small angles too). */
function angle(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return Math.atan2(Math.hypot(cx, cy, cz), ax * bx + ay * by + az * bz);
}

const A = [0, 0, 0];
const B = [0, 0, 0];

/**
 * Each figure's opacity: in 'auto', by how far it has come apart seen from the camera
 * (ui/constellations.ts), and in full when the figures were turned on. Into figureFade and the
 * shader's uFigureFade.
 */
function updateFigureFade(f: Figures, stars: Stars3D, auto: boolean, out: Float32Array): void {
  const n = f.most.length;
  figureFade.length = n;
  if (!auto) {
    figureFade.fill(1);
    out.fill(1);
    return;
  }
  const P = stars.positions;
  const V = stars.velocitiesInt16;
  const kv = stars.velocityUnitKms * KMS_TO_PC_PER_YR;
  const years = motionYears(2000 + sim.astroTime.tt / 365.25);
  // The camera in parsecs, J2000 ecliptic (world (x, y, z) = ecliptic (x, z, −y)).
  const c = sim.camera.pos;
  const cx = c.x / PARSEC_KM;
  const cy = -c.z / PARSEC_KM;
  const cz = c.y / PARSEC_KM;
  // Where each star is now, pc from the Sun: as the shader moves it.
  const place = (i: number, o: number[]) => {
    const px = P[3 * i];
    const py = P[3 * i + 1];
    const pz = P[3 * i + 2];
    const t = years + Math.hypot(px, py, pz) / C_PC_PER_YR;
    o[0] = px + V[3 * i] * kv * t;
    o[1] = py + V[3 * i + 1] * kv * t;
    o[2] = pz + V[3 * i + 2] * kv * t;
  };
  f.most.fill(0);
  f.least.fill(Infinity);
  for (let s = 0; s < f.owner.length; s++) {
    place(f.pairs[2 * s], A);
    place(f.pairs[2 * s + 1], B);
    const fromSun = angle(A[0], A[1], A[2], B[0], B[1], B[2]);
    const here = angle(A[0] - cx, A[1] - cy, A[2] - cz, B[0] - cx, B[1] - cy, B[2] - cz);
    const grown = here / Math.max(fromSun, 1e-9);
    const k = f.owner[s];
    if (grown > f.most[k]) f.most[k] = grown;
    if (grown < f.least[k]) f.least[k] = grown;
  }
  for (let k = 0; k < n; k++) {
    const o = f.least[k] === Infinity ? 1 : figureOpacity(f.most[k], f.least[k]);
    figureFade[k] = o;
    if (k < out.length) out[k] = o;
  }
}

export function Constellations() {
  // Re-render when star data arrive; the figures are made again only when the file or the
  // catalogue itself changes (not for names or spectral types).
  useSyncExternalStore(subscribeStars, starsVersion);
  const material = useMemo(createConstellationMaterial, []);
  const lines = useRef<LineSegments>(null);
  const file = starData.constellations;
  const stars = starData.stars;
  // The figures only use naked-eye stars, which the bright subset has too: they are ready early.
  const geometry = useMemo(() => (file && stars ? figureGeometry(file, stars) : null), [file, stars]);
  const segments = useMemo(() => (file ? figures(file) : null), [file]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    // Leave GAP_PX clear round each star.
    material.uniforms.uGap.value = GAP_PX / Math.max(pixelsPerRadian(), 1);
    // Fade in and out over a third of a second.
    const want = constellationsNow() ? OPACITY : 0;
    const u = material.uniforms.uOpacity;
    const step = Math.min(1, dt * 3);
    u.value += (want - u.value) * step;
    if (Math.abs(want - u.value) < 0.002) u.value = want;
    const visible = u.value > 0.001;
    if (lines.current) lines.current.visible = visible;
    if (visible && segments && stars) {
      updateFigureFade(segments, stars, useUI.getState().constellations === 'auto', material.uniforms.uFigureFade.value as Float32Array);
    }
  });

  if (!geometry) return null;
  return (
    <lineSegments
      ref={(o) => {
        lines.current = o;
        o?.layers.set(POINTS_LAYER);
      }}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-98}
      visible={false}
    />
  );
}
