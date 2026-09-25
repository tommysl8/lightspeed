/**
 * Light-pulse wavefronts (Experiment 1). Each pulse is a sphere of radius c(t − t₀) about its
 * emission point. Two circles show it:
 *   - its cross-section with the ecliptic plane, where the planets are;
 *   - its outline on the sky, the circle where lines of sight graze the sphere
 *     (only when the camera is outside it).
 * Both reuse the orbit-line shader: a circle is an ellipse with e = 0, and the shader draws
 * it relative to a point on it, so it stays precise at any scale.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedBufferAttribute, InstancedBufferGeometry, Float32BufferAttribute, type Mesh, type PerspectiveCamera, type ShaderMaterial, Vector3 } from 'three';
import { C_KM_S } from '../physics/constants';
import { createOrbitMaterial } from '../render/materials';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { pulses } from '../sim/pulses';
import { sim } from '../sim/sim';

const SEGMENTS = 512;
const POOL = 4;

function segmentGeometry(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setAttribute('corner', new Float32BufferAttribute([0, -1, 0, 1, 1, -1, 1, 1], 2));
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(12), 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  const idx = new Float32Array(SEGMENTS);
  for (let i = 0; i < SEGMENTS; i++) idx[i] = i;
  g.setAttribute('aIndex', new InstancedBufferAttribute(idx, 1));
  g.instanceCount = SEGMENTS;
  return g;
}

const ECL_P = new Vector3(1, 0, 0); // ecliptic x in world axes
const ECL_Q = new Vector3(0, 0, -1); // ecliptic y in world axes
const c = new Vector3();
const n = new Vector3();
const p = new Vector3();
const q = new Vector3();

function setCircle(m: ShaderMaterial, centreRel: Vector3, radius: number, P: Vector3, Q: Vector3, alpha: number, camera: PerspectiveCamera, pr: number) {
  const u = m.uniforms;
  u.uBodyPos.value.copy(centreRel).addScaledVector(P, radius);
  u.uP.value.copy(P);
  u.uQ.value.copy(Q);
  u.uA.value = radius;
  u.uB.value = radius;
  u.uAnomaly.value = 0;
  u.uAlphaBase.value = alpha;
  u.uAlphaTrail.value = alpha;
  u.uBodyRadius.value = radius * 1e-7;
  u.uPixelRatio.value = pr;
  u.uResolution.value.set(sim.viewport.width * pr, sim.viewport.height * pr);
  u.uNear.value = camera.near;
}

function PulseRing({ slot, outline }: { slot: number; outline: boolean }) {
  const geometry = useMemo(segmentGeometry, []);
  const material = useMemo(() => {
    const m = createOrbitMaterial(new Color('#56c2ee'));
    m.uniforms.uSegments.value = SEGMENTS;
    m.uniforms.uWidth.value = outline ? 1 : 1.4;
    return m;
  }, [outline]);
  const mesh = useRef<Mesh>(null);

  useFrame(({ camera, gl }) => {
    const pulse = pulses.list[slot];
    const m = mesh.current;
    if (!m) return;
    const R = pulse ? (C_KM_S * (sim.timeMs - pulse.t0Ms)) / 1000 : 0;
    if (!pulse || !(R > 0)) {
      m.visible = false;
      return;
    }
    const pr = gl.getPixelRatio();
    c.copy(pulse.origin).sub(sim.camera.pos); // centre relative to the camera (float64 on the CPU)
    // Fade a pulse once every detector has fired.
    const fade = pulse.pending.size === 0 ? 0.35 : 1;
    if (!outline) {
      // Cross-section with the ecliptic plane (world y = 0): centred below or above the emission
      // point, radius √(R² − h²). None until the front reaches the plane.
      const h = pulse.origin.y;
      if (Math.abs(h) >= R) {
        m.visible = false;
        return;
      }
      p.set(pulse.origin.x, 0, pulse.origin.z).sub(sim.camera.pos);
      setCircle(material, p, Math.sqrt((R - h) * (R + h)), ECL_P, ECL_Q, 0.75 * fade, camera as PerspectiveCamera, pr);
      m.visible = true;
      return;
    }
    const d = c.length();
    if (d <= R * 1.0001) {
      m.visible = false;
      return;
    }
    // Silhouette: circle of radius R√(d²−R²)/d in the plane ⟂ to the line of sight, centred
    // (d² − R²)/d from the camera.
    n.copy(c).divideScalar(d);
    const rho = (R * Math.sqrt((d - R) * (d + R))) / d;
    const along = ((d - R) * (d + R)) / d;
    p.set(0, 1, 0).cross(n);
    if (p.lengthSq() < 1e-12) p.set(1, 0, 0).cross(n);
    p.normalize();
    q.crossVectors(n, p);
    setCircle(material, c.copy(n).multiplyScalar(along), rho, p, q, 0.22 * fade, camera as PerspectiveCamera, pr);
    m.visible = true;
  });

  return (
    <mesh
      ref={(o) => {
        mesh.current = o;
        o?.layers.set(GUIDES_LAYER);
      }}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={11}
      visible={false}
    />
  );
}

export function LightPulses() {
  return (
    <group>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i}>
          <PulseRing slot={i} outline={false} />
          <PulseRing slot={i} outline />
        </group>
      ))}
    </group>
  );
}
