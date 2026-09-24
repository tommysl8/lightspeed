import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  type Group,
  LatheGeometry,
  type Mesh,
  type ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { BODIES, PROXIMA_TEFF_K, SATURN_RING_INNER_KM, SATURN_RING_OUTER_KM, type BodyId } from '../physics/constants';
import { blackbodyRgb } from '../physics/blackbody';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { createPlanetMaterial, createRingMaterial, createSunMaterial } from '../render/materials';
import { loadTexture } from '../render/textures';
import { VISUALS } from './visuals';

const SPHERE = new SphereGeometry(1, 128, 64);
const tmp = new Vector3();
const tmp2 = new Vector3();

/**
 * Sun position relative to the camera, in world axes. Lighting uses camera-relative world space,
 * so it is the same for the main camera and for the relativistic cube-map faces.
 */
function sunRelative(out: Vector3): Vector3 {
  return out.copy(sim.bodies.sun.apparentPos).sub(sim.camera.pos);
}

/** Should this body's textures load yet? (Lazy: only once it is more than a few pixels wide.) */
function wantsTextures(id: BodyId): boolean {
  const b = sim.bodies[id];
  const ui = useUI.getState();
  return b.radiusPx > 2 || ui.selected === id || ui.focus === id;
}

export function Planet({ id }: { id: BodyId }) {
  const group = useRef<Group>(null!);
  const mesh = useRef<Mesh>(null!);
  const vis = VISUALS[id];
  const data = BODIES[id];
  const material = useMemo(
    () =>
      createPlanetMaterial({
        baseColor: new Color(data.color),
        banded: vis.banded,
        atmoColor: vis.atmo ? new Color(vis.atmo) : undefined,
        atmoStrength: vis.atmoStrength,
        lonOffset: vis.lonOffset,
        fillBlack: vis.fillBlack,
      }),
    [data.color, vis],
  );
  const requested = useRef(false);

  useFrame(() => {
    const b = sim.bodies[id];
    // Floating origin: float64 world position minus float64 camera position.
    group.current.position.copy(b.apparentPos).sub(sim.camera.pos);
    group.current.quaternion.copy(b.apparentQuat);
    const eq = data.equatorialRadiusKm ?? data.radiusKm;
    const po = data.polarRadiusKm ?? eq;
    const k = b.displayRadius / eq;
    mesh.current.scale.set(eq * k, po * k, eq * k);
    mesh.current.visible = b.radiusPx > 0.35;
    sunRelative(material.uniforms.uSunRel.value);

    if (!requested.current && wantsTextures(id)) {
      requested.current = true;
      const u = material.uniforms;
      const assign = (file: string | undefined, tex: string, flag: string, color = true) => {
        if (!file) return;
        loadTexture(file, { color }).then((t) => {
          if (!t) return;
          u[tex].value = t;
          u[flag].value = 1;
        });
      };
      assign(vis.map, 'uMap', 'uHasMap');
      assign(vis.night, 'uNight', 'uHasNight');
      assign(vis.clouds, 'uClouds', 'uHasClouds', false);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={mesh} geometry={SPHERE} material={material} />
      {id === 'saturn' && <SaturnRings planetMaterial={material} />}
    </group>
  );
}

function ringGeometry(inner: number, outer: number, segments: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Slightly oversized outer rim so the (curved) outer edge is covered by the flat segments.
    pos.push(inner * c, 0, inner * s, outer * 1.001 * c, 0, outer * 1.001 * s);
    if (i < segments) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function SaturnRings({ planetMaterial }: { planetMaterial: ShaderMaterial }) {
  const mesh = useRef<Mesh>(null!);
  const material = useMemo(createRingMaterial, []);
  const geometry = useMemo(() => ringGeometry(SATURN_RING_INNER_KM, SATURN_RING_OUTER_KM, 256), []);
  const requested = useRef(false);

  useFrame(() => {
    const b = sim.bodies.saturn;
    const eq = BODIES.saturn.equatorialRadiusKm!;
    const k = b.displayRadius / eq;
    mesh.current.scale.setScalar(k);
    mesh.current.visible = b.radiusPx > 0.3;

    const u = material.uniforms;
    sunRelative(u.uSunRel.value);
    const center = tmp.copy(b.apparentPos).sub(sim.camera.pos);
    const normal = tmp2.set(0, 1, 0).applyQuaternion(b.apparentQuat);
    u.uCenterW.value.copy(center);
    u.uNormalW.value.copy(normal);
    u.uPlanetRadius.value = b.displayRadius;
    u.uInner.value = SATURN_RING_INNER_KM;
    u.uOuter.value = SATURN_RING_OUTER_KM;

    // Ring shadow on the planet (radii in displayed units).
    const p = planetMaterial.uniforms;
    p.uCenterW.value.copy(center);
    p.uRingNormalW.value.copy(normal);
    p.uRingInner.value = SATURN_RING_INNER_KM * k;
    p.uRingOuter.value = SATURN_RING_OUTER_KM * k;

    if (!requested.current && wantsTextures('saturn')) {
      requested.current = true;
      loadTexture('2k_saturn_ring_alpha.png').then((t) => {
        if (!t) return;
        u.uMap.value = t;
        u.uHasMap.value = 1;
        p.uRingMap.value = t;
        p.uRingShadow.value = 1;
      });
    }
  });

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={5} />;
}

export function Sun() {
  const mesh = useRef<Mesh>(null!);
  const material = useMemo(createSunMaterial, []);
  const requested = useRef(false);
  useFrame(() => {
    const b = sim.bodies.sun;
    mesh.current.position.copy(b.apparentPos).sub(sim.camera.pos);
    mesh.current.quaternion.copy(b.apparentQuat);
    mesh.current.scale.setScalar(b.displayRadius);
    mesh.current.visible = b.radiusPx > 0.35;
    // Simple auto-exposure: glaring when small, and dimmer up close so limb darkening and
    // granulation show.
    const t = Math.min(1, Math.max(0, (b.radiusPx - 30) / 170));
    material.uniforms.uIntensity.value = 8 - 4.6 * t * t * (3 - 2 * t);
    if (!requested.current && wantsTextures('sun')) {
      requested.current = true;
      loadTexture('2k_sun.jpg').then((t) => {
        if (!t) return;
        material.uniforms.uMap.value = t;
        material.uniforms.uHasMap.value = 1;
      });
    }
  });
  return <mesh ref={mesh} geometry={SPHERE} material={material} />;
}

/**
 * Voyager 1 at true size (metres, in km units): the 3.7 m high-gain antenna (always pointed
 * at Earth), the ten-sided bus, the RTG and science booms, and the 13 m magnetometer boom.
 * Simplified geometry.
 */
export function Voyager() {
  const group = useRef<Group>(null!);
  const parts = useMemo(() => {
    const m = (hex: string) =>
      createPlanetMaterial({ baseColor: new Color(hex), flat: true, ambient: 0.02 });
    const dish = new LatheGeometry(
      Array.from({ length: 12 }, (_, i) => {
        const r = (i / 11) * 0.00183;
        return new Vector2(r, (r * r) / (4 * 0.0012));
      }),
      48,
    );
    const dishMat = m('#e9e6df');
    dishMat.side = DoubleSide;
    return {
      dish,
      dishMat,
      bus: new CylinderGeometry(0.00089, 0.00089, 0.00047, 10),
      busMat: m('#9b8f7a'),
      boom: new CylinderGeometry(0.00004, 0.00004, 1, 6),
      boomMat: m('#b9b4aa'),
      rtg: new CylinderGeometry(0.0002, 0.0002, 0.0005, 12),
      rtgMat: m('#5f5a52'),
    };
  }, []);

  useFrame(() => {
    const b = sim.bodies.voyager1;
    const g = group.current;
    g.position.copy(b.apparentPos).sub(sim.camera.pos);
    // Point the antenna (+Y) at Earth.
    tmp.copy(sim.bodies.earth.pos).sub(b.apparentPos).normalize();
    g.quaternion.setFromUnitVectors(tmp2.set(0, 1, 0), tmp);
    const k = b.displayRadius / BODIES.voyager1.radiusKm;
    g.scale.setScalar(k);
    g.visible = b.radiusPx > 0.3;
    for (const mat of [parts.dishMat, parts.busMat, parts.boomMat, parts.rtgMat]) sunRelative(mat.uniforms.uSunRel.value);
  });

  return (
    <group ref={group}>
      <mesh geometry={parts.dish} material={parts.dishMat} />
      <mesh geometry={parts.bus} material={parts.busMat} position={[0, -0.0003, 0]} />
      {/* RTG boom with three generators */}
      <mesh geometry={parts.boom} material={parts.boomMat} position={[-0.0019, -0.0004, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 0.0026, 1]} />
      {[0.0012, 0.0019, 0.0026].map((x) => (
        <mesh key={x} geometry={parts.rtg} material={parts.rtgMat} position={[-x - 0.0006, -0.0004, 0]} rotation={[0, 0, Math.PI / 2]} />
      ))}
      {/* Science boom */}
      <mesh geometry={parts.boom} material={parts.boomMat} position={[0.00165, -0.0004, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 0.0023, 1]} />
      <mesh geometry={parts.bus} material={parts.busMat} position={[0.0029, -0.0004, 0]} scale={[0.35, 1.2, 0.35]} />
      {/* Magnetometer boom, 13 m */}
      <mesh geometry={parts.boom} material={parts.boomMat} position={[0, -0.0004, 0.0066]} rotation={[Math.PI / 2, 0, 0]} scale={[0.6, 0.013, 0.6]} />
    </group>
  );
}

/**
 * Proxima Centauri, a red dwarf drawn as a limb-darkened blackbody disc at 3042 K. The Sun's
 * granulation map is reused only as fine texture.
 */
export function Proxima() {
  const mesh = useRef<Mesh>(null!);
  const material = useMemo(() => createSunMaterial(new Color(...blackbodyRgb(PROXIMA_TEFF_K))), []);
  useFrame(() => {
    const b = sim.bodies.proxima;
    mesh.current.position.copy(b.apparentPos).sub(sim.camera.pos);
    mesh.current.scale.setScalar(b.displayRadius);
    mesh.current.visible = b.radiusPx > 0.35;
    const t = Math.min(1, Math.max(0, (b.radiusPx - 30) / 170));
    material.uniforms.uIntensity.value = 6 - 3.6 * t * t * (3 - 2 * t);
  });
  return <mesh ref={mesh} geometry={SPHERE} material={material} />;
}

export function Bodies() {
  return (
    <>
      <Sun />
      <Proxima />
      {(['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as BodyId[]).map((id) => (
        <Planet key={id} id={id} />
      ))}
      <Voyager />
    </>
  );
}
