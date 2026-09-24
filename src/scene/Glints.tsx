import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage } from 'three';
import { blackbodyRgb } from '../physics/blackbody';
import { BODIES, BODY_ORDER, PROXIMA_TEFF_K, SUN_TEFF_K } from '../physics/constants';
import { createGlintMaterial } from '../render/materials';
import { sim } from '../sim/sim';
import { POINTS_LAYER } from '../render/LightspeedScenePass';

/**
 * Every body is also drawn as a point source with its real apparent magnitude. At true scale
 * a planet is usually far smaller than a pixel, yet it still shines, just as Jupiter or Venus
 * do in the night sky. The glint fades out once the disc is resolved.
 */
export function Glints() {
  const material = useMemo(createGlintMaterial, []);
  const geometry = useMemo(() => {
    const n = BODY_ORDER.length;
    const g = new BufferGeometry();
    const dyn = (arr: Float32Array, size: number) => new BufferAttribute(arr, size).setUsage(DynamicDrawUsage);
    g.setAttribute('position', dyn(new Float32Array(n * 3), 3));
    g.setAttribute('aMag', dyn(new Float32Array(n), 1));
    g.setAttribute('aFade', dyn(new Float32Array(n), 1));
    g.setAttribute('aRadius', dyn(new Float32Array(n), 1));
    const color = new Float32Array(n * 3);
    const temp = new Float32Array(n).fill(SUN_TEFF_K); // reflected sunlight has the Sun's spectrum
    const sun = blackbodyRgb(SUN_TEFF_K);
    BODY_ORDER.forEach((id, i) => {
      if (id === 'proxima') {
        // A star: its own blackbody spectrum.
        temp[i] = PROXIMA_TEFF_K;
        color.set(blackbodyRgb(PROXIMA_TEFF_K), i * 3);
        return;
      }
      const c = new Color(BODIES[id].color);
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b || 1;
      const tint = id === 'sun' ? [1, 1, 1] : [c.r / lum, c.g / lum, c.b / lum];
      color.set([tint[0] * sun[0], tint[1] * sun[1], tint[2] * sun[2]], i * 3);
    });
    g.setAttribute('aColor', new BufferAttribute(color, 3));
    g.setAttribute('aTemp', new BufferAttribute(temp, 1));
    return g;
  }, []);

  useFrame(({ gl }) => {
    const pos = geometry.attributes.position as BufferAttribute;
    const mag = geometry.attributes.aMag as BufferAttribute;
    const fade = geometry.attributes.aFade as BufferAttribute;
    const rad = geometry.attributes.aRadius as BufferAttribute;
    BODY_ORDER.forEach((id, i) => {
      const b = sim.bodies[id];
      // Floating origin: camera-relative position computed in float64.
      const p = b.apparentPos;
      pos.setXYZ(i, p.x - sim.camera.pos.x, p.y - sim.camera.pos.y, p.z - sim.camera.pos.z);
      mag.setX(i, b.magnitude);
      const f = 1 - Math.min(1, Math.max(0, (b.radiusPx - 1.2) / 2.5));
      fade.setX(i, f);
      rad.setX(i, b.displayRadius);
    });
    pos.needsUpdate = mag.needsUpdate = fade.needsUpdate = rad.needsUpdate = true;
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
  });

  return (
    <points
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={20}
      ref={(o) => o?.layers.set(POINTS_LAYER)}
    />
  );
}
