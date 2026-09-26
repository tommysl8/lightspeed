import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage } from 'three';
import { blackbodyRgb } from '../physics/blackbody';
import { SUN_TEFF_K } from '../physics/constants';
import { registryVersion, subscribeRegistry } from '../sim/bodies';
import { bodyEntries } from '../sim/bodies/registry';
import { createGlintMaterial } from '../render/materials';
import { sim } from '../sim/sim';
import { POINTS_LAYER } from '../render/LightspeedScenePass';

/**
 * Glints farther than this are drawn at this distance along their true direction (their
 * brightness comes from the float64 magnitude, not the distance). The shader squares the
 * position, and float32 overflows above ~1.8 × 10¹⁹ km; 10¹⁶ km (about 1,000 light-years)
 * leaves a wide margin.
 */
const GLINT_MAX_KM = 1e16;

/**
 * Every body is also drawn as a point source with its real apparent magnitude. At true scale
 * a planet is usually far smaller than a pixel, yet it still shines, just as Jupiter or Venus
 * do in the night sky. The glint fades out once the disc is resolved. One draw for all of
 * them, however many are registered; the buffers are rebuilt when the registry changes.
 */
export function Glints() {
  const version = useSyncExternalStore(subscribeRegistry, registryVersion);
  const material = useMemo(createGlintMaterial, []);
  const geometry = useMemo(() => {
    const list = bodyEntries();
    const n = list.length;
    const g = new BufferGeometry();
    const dyn = (arr: Float32Array, size: number) => new BufferAttribute(arr, size).setUsage(DynamicDrawUsage);
    g.setAttribute('position', dyn(new Float32Array(n * 3), 3));
    g.setAttribute('aMag', dyn(new Float32Array(n).fill(99), 1));
    g.setAttribute('aFade', dyn(new Float32Array(n), 1));
    g.setAttribute('aRadius', dyn(new Float32Array(n), 1));
    const color = new Float32Array(n * 3);
    const temp = new Float32Array(n).fill(SUN_TEFF_K); // reflected sunlight has the Sun's spectrum
    const sun = blackbodyRgb(SUN_TEFF_K);
    list.forEach((e, i) => {
      const lum = e.record.physical.luminous;
      if (lum) {
        // A star: its own blackbody spectrum.
        temp[i] = lum.teffK;
        color.set(blackbodyRgb(lum.teffK), i * 3);
        return;
      }
      const c = new Color(e.record.physical.colour);
      const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b || 1;
      color.set([(c.r / l) * sun[0], (c.g / l) * sun[1], (c.b / l) * sun[2]], i * 3);
    });
    g.setAttribute('aColor', new BufferAttribute(color, 3));
    g.setAttribute('aTemp', new BufferAttribute(temp, 1));
    return g;
    // Rebuilt when bodies are registered or removed.
  }, [version]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ gl }) => {
    const list = bodyEntries();
    const pos = geometry.attributes.position as BufferAttribute;
    if (pos.count !== list.length) return; // the registry changed: a new geometry is on its way
    const mag = geometry.attributes.aMag as BufferAttribute;
    const fade = geometry.attributes.aFade as BufferAttribute;
    const rad = geometry.attributes.aRadius as BufferAttribute;
    // Straight into the typed arrays (setXYZ and setX cost a call and a boxed number each).
    const P = pos.array as Float32Array;
    const M = mag.array as Float32Array;
    const F = fade.array as Float32Array;
    const R = rad.array as Float32Array;
    const cam = sim.camera.pos;
    for (let i = 0; i < list.length; i++) {
      const b = list[i].state;
      // Floating origin: camera-relative position computed in float64.
      const p = b.apparentPos;
      const x = p.x - cam.x;
      const y = p.y - cam.y;
      const z = p.z - cam.z;
      const d = Math.sqrt(x * x + y * y + z * z);
      const k = d > GLINT_MAX_KM ? GLINT_MAX_KM / d : 1;
      P[3 * i] = x * k;
      P[3 * i + 1] = y * k;
      P[3 * i + 2] = z * k;
      M[i] = b.magnitude;
      F[i] = 1 - Math.min(1, Math.max(0, (b.radiusPx - 1.2) / 2.5));
      R[i] = b.displayRadius * k;
    }
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
