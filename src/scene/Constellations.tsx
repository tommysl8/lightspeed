/**
 * The 88 IAU constellation figures, drawn between the real 3D stars (sim/stars, from
 * public/data/constellations.json: d3-celestial's figures). From Earth they are the figures of any
 * star chart; fly away and they come apart, because their stars are at very different distances.
 * One draw call; each figure segment is cut into pieces so that it stays a straight 3D segment
 * (a curve on the sky) however close the camera comes. Shown per ui/constellations.ts.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Sphere, Vector3, type LineSegments } from 'three';
import { createConstellationMaterial } from '../render/materials';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { constellationSegments, starData, starsVersion, subscribeStars, type ConstellationsFile, type Stars3D } from '../sim/stars';
import { constellationsNow } from '../ui/constellations';
import { pixelsPerRadian } from '../sim/derived';

/** Pieces per figure segment. */
const PIECES = 12;
/** The gap left between a line and each star it joins, CSS px. */
const GAP_PX = 5;
/** Opacity of the lines when shown. */
const OPACITY = 0.42;

function figureGeometry(file: ConstellationsFile, stars: Stars3D): BufferGeometry {
  const { pairs } = constellationSegments(file);
  const nSeg = pairs.length / 2;
  const n = nSeg * PIECES * 2;
  const posA = new Float32Array(n * 3);
  const velA = new Float32Array(n * 3);
  const posB = new Float32Array(n * 3);
  const velB = new Float32Array(n * 3);
  const t = new Float32Array(n);
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
  // Never culled, drawn in its render order: no need for three.js to work out a bounding sphere.
  g.boundingSphere = new Sphere(new Vector3(), Infinity);
  return g;
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
    if (lines.current) lines.current.visible = u.value > 0.001;
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
