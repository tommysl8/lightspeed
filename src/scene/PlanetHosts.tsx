/**
 * A small ring around every star of the star catalogue that the NASA Exoplanet Archive lists as
 * a planet host (sim/exoplanets: the hosts matched to the catalogue), within some tens of parsecs
 * of the camera: full within 20 pc, gone by 40 pc, and fading away inside 0.3 pc of the star,
 * where its planets, their orbits and their labels take over. One draw call; the shader moves each
 * ring with its star (shaders/hostRing.vert.glsl) and, like the constellation figures, aberrates
 * it with its star in the relativistic view, so it stays on the star at any speed. Shown per
 * ui/planetHosts.ts.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, type Material, type Object3D } from 'three';
import { createHostRingMaterial } from '../render/materials';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { useLensVariant } from '../render/lensVariants';
import { exoplanetData, exoplanetsVersion, subscribeExoplanets } from '../sim/exoplanets';
import { starData, type Stars3D } from '../sim/stars';
import { planetHostsNow } from '../ui/planetHosts';

/** Opacity of the rings when shown. */
const OPACITY = 0.6;

function hostGeometry(stars: Stars3D, hostStars: Int32Array): BufferGeometry | null {
  const idx = Array.from(hostStars).filter((s) => s >= 0 && s < stars.count);
  if (!idx.length) return null;
  const pos = new Float32Array(idx.length * 3);
  const vel = new Float32Array(idx.length * 3);
  idx.forEach((s, k) => {
    for (let c = 0; c < 3; c++) {
      pos[3 * k + c] = stars.positions[3 * s + c];
      vel[3 * k + c] = stars.velocitiesInt16[3 * s + c];
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aVel', new Float32BufferAttribute(vel, 3));
  return g;
}

export function PlanetHosts() {
  const version = useSyncExternalStore(subscribeExoplanets, exoplanetsVersion);
  const material = useMemo(createHostRingMaterial, []);
  const points = useRef<(Object3D & { material: Material | Material[] }) | null>(null);
  // Near a black hole each ring follows its star's primary image (the lensed variant: render/lensVariants.ts).
  useLensVariant(points);
  const matches = exoplanetData.matches;
  const stars = starData.full ? starData.stars : null;
  const geometry = useMemo(() => (matches && stars ? hostGeometry(stars, matches.star) : null), [matches, stars, version]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    // Fade in and out over a third of a second.
    const want = planetHostsNow() ? OPACITY : 0;
    const u = material.uniforms.uOpacity;
    u.value += (want - u.value) * Math.min(1, dt * 3);
    if (Math.abs(want - u.value) < 0.002) u.value = want;
    if (points.current) points.current.visible = u.value > 0.001;
  });

  if (!geometry) return null;
  return (
    <points
      ref={(o) => {
        points.current = o;
        o?.layers.set(POINTS_LAYER);
      }}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-97}
      visible={false}
    />
  );
}
