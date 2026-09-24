import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Float32BufferAttribute,
  type PerspectiveCamera,
  type ShaderMaterial,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from 'three';
import {
  BODIES,
  GM_SOLAR_SYSTEM_KM3_S2,
  GM_SUN_KM3_S2,
  VOYAGER1_SATURN_FLYBY_UTC,
  type BodyId,
} from '../physics/constants';
import { solveKepler, solveKeplerHyperbolic, stateToOrbit, type Orbit } from '../physics/kepler';
import { createOrbitMaterial } from '../render/materials';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { pixelsPerRadian } from '../sim/derived';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';

const SEGMENTS = 1024;
const ORBIT_BODIES: BodyId[] = [
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
  'voyager1',
];

function segmentGeometry(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  // Quad: (start|end) × (−1|+1 side)
  g.setAttribute('corner', new Float32BufferAttribute([0, -1, 0, 1, 1, -1, 1, 1], 2));
  // three.js needs a position attribute to size the draw; the shader ignores it.
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(12), 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  const idx = new Float32Array(SEGMENTS);
  for (let i = 0; i < SEGMENTS; i++) idx[i] = i;
  g.setAttribute('aIndex', new InstancedBufferAttribute(idx, 1));
  g.instanceCount = SEGMENTS;
  return g;
}

const FLYBY_MS = Date.parse(VOYAGER1_SATURN_FLYBY_UTC);

function anomalyAt(o: Orbit, M: number): number {
  if (!o.hyperbolic) {
    // Keep E continuous with the current anomaly (solveKepler wraps to [0, 2π)).
    const E = solveKepler(M, o.e);
    return E + Math.round((o.anomaly - E) / (2 * Math.PI)) * 2 * Math.PI;
  }
  return solveKeplerHyperbolic(M, o.e);
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function OrbitLine({ id }: { id: BodyId }) {
  const geometry = useMemo(segmentGeometry, []);
  const material = useMemo<ShaderMaterial>(() => {
    const c = new Color(BODIES[id].color).lerp(new Color('#cfd8ea'), 0.55);
    return createOrbitMaterial(c);
  }, [id]);

  useFrame(({ camera, gl }) => {
    const b = sim.bodies[id];
    const parent = id === 'moon' ? sim.bodies.earth : null;
    const mu =
      id === 'voyager1'
        ? GM_SOLAR_SYSTEM_KM3_S2
        : id === 'moon'
          ? BODIES.earth.gmKm3S2! + BODIES.moon.gmKm3S2!
          : GM_SUN_KM3_S2 + (BODIES[id].gmKm3S2 ?? 0);
    const r = parent ? b.pos.clone().sub(parent.pos) : b.pos;
    const v = parent ? b.vel.clone().sub(parent.vel) : b.vel;
    const o = stateToOrbit(r, v, mu);

    const u = material.uniforms;
    u.uBodyPos.value.copy(b.apparentPos).sub(sim.camera.pos);
    u.uP.value.set(o.P.x, o.P.y, o.P.z);
    u.uQ.value.set(o.Q.x, o.Q.y, o.Q.z);
    u.uA.value = Math.abs(o.a);
    u.uB.value = o.b;
    // Draw through where the body appears: step the anomaly back by the light delay.
    u.uAnomaly.value = b.lightDelay > 0 ? anomalyAt(o, o.meanAnomaly - o.meanMotion * b.lightDelay) : o.anomaly;
    u.uHyperbolic.value = o.hyperbolic ? 1 : 0;
    u.uClosed.value = o.hyperbolic ? 0 : 1;
    if (o.hyperbolic) {
      // Trail back to Voyager 1's Saturn flyby (1980), after which it has coasted on this hyperbola.
      const dt = (FLYBY_MS - sim.timeMs) / 1000;
      const H0 = solveKeplerHyperbolic(o.meanAnomaly + o.meanMotion * dt, o.e);
      u.uSpanMin.value = Math.min(0, H0 - o.anomaly);
    }
    u.uBodyRadius.value = b.displayRadius;
    const pr = gl.getPixelRatio();
    u.uPixelRatio.value = pr;
    u.uResolution.value.set(sim.viewport.width * pr, sim.viewport.height * pr);
    u.uNear.value = (camera as PerspectiveCamera).near;

    // Fade orbits that are tiny on screen (e.g. the Moon's orbit seen from Neptune), and dim
    // them in close-ups, where distant orbits only cross the view as edge-on streaks.
    const ui = useUI.getState();
    const centre = parent ? parent.distCamera : sim.bodies.sun.distCamera;
    const sizePx = (Math.abs(o.a) / Math.max(centre, 1)) * pixelsPerRadian();
    const selected = ui.selected === id ? 1.35 : 1;
    const closeUp = ui.controlMode === 'free' ? 0 : smoothstep(40, 220, sim.bodies[ui.focus].radiusPx);
    u.uOpacity.value = smoothstep(4, 40, sizePx) * selected * (1 - 0.85 * closeUp);
  });

  // Line width is in pixels of whatever is being rendered: the screen, or a relativistic
  // cube-map face.
  const onBeforeRender = useMemo(
    () => (renderer: WebGLRenderer) => {
      const rt = renderer.getRenderTarget();
      const u = material.uniforms;
      if (rt) {
        u.uResolution.value.set(rt.width, rt.height);
        u.uPixelRatio.value = rt instanceof WebGLCubeRenderTarget ? 1.1 : renderer.getPixelRatio();
      }
    },
    [material],
  );

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={10}
      onBeforeRender={onBeforeRender}
      ref={(o) => o?.layers.set(GUIDES_LAYER)}
    />
  );
}

export function Orbits() {
  const show = useUI((s) => s.showOrbits);
  return (
    <group visible={show}>
      {ORBIT_BODIES.map((id) => (
        <OrbitLine key={id} id={id} />
      ))}
    </group>
  );
}
