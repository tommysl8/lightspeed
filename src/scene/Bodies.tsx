/**
 * Body meshes, for every body in the registry, at a cost that stays near zero for the many that
 * are specks.
 *
 * A body gets a mesh (a React component) only while it is about a pixel wide or more; below
 * that it is only its point of light (Glints.tsx). Mounted bodies hide their mesh under a pixel
 * (visible = false: not drawn at all, not even into the relativistic cube map), use a low-poly
 * sphere under 50 px, and unmount after a couple of seconds as specks. Textures load once a
 * body is a few pixels wide, are held while its mesh is mounted, and live in an LRU cache with
 * a memory budget (render/textures.ts); the Sun's, Earth's and the focused system's stay
 * pinned. A body with rings counts as wide as its rings.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  type DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  type Group,
  LatheGeometry,
  type Mesh,
  Quaternion,
  type ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { blackbodyRgb } from '../physics/blackbody';
import { SUN_TEFF_K } from '../physics/constants';
import {
  bodyRecords,
  displayRadiusKm,
  getBody,
  isWithin,
  recordSerial,
  registryVersion,
  subscribeRegistry,
  systemOf,
  type BodyId,
  type BodyRecord,
  type RingSpec,
} from '../sim/bodies';
import { bodyEntries } from '../sim/bodies/registry';
import { raDecToWorld } from '../sim/frames';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { createOrbitMaterial, createPlanetMaterial, createRingMaterial, createSunMaterial, SUN_CENTRE_RADIANCE } from '../render/materials';
import { bandsExtent, bandsTexture, extentFactor } from '../render/rings';
import { loadShape } from '../render/shapes';
import { acquireTexture, pumpTextureUploads, releaseTexture, setPinnedTextures, type TextureOptions } from '../render/textures';

/** Full sphere for bodies drawn large; a low-poly one below LOD_PX. */
const SPHERE_HI = new SphereGeometry(1, 128, 64);
const SPHERE_LO = new SphereGeometry(1, 32, 16);
/** On-screen radius below which the low-poly sphere is used, CSS px. */
export const LOD_PX = 50;
/** Below a pixel a body is its point of light only: no mesh is drawn. */
export const MESH_MIN_PX = 1;
/** A body's component mounts from this size (a little before it is drawn, so its material is ready)… */
const MOUNT_PX = 0.8;
/** …and unmounts after this many frames below UNMOUNT_PX. */
const UNMOUNT_PX = 0.5;
const UNMOUNT_FRAMES = 120;

const tmp = new Vector3();
const tmp2 = new Vector3();
const UP = new Vector3(0, 1, 0);
const qInv = new Quaternion();

/**
 * Sun position relative to the camera, in world axes. Lighting uses camera-relative world space,
 * so it is the same for the main camera and for the relativistic cube-map faces.
 */
function sunRelative(out: Vector3): Vector3 {
  const s = sim.bodies.sun;
  return s ? out.copy(s.apparentPos).sub(sim.camera.pos) : out.set(0, 0, 0).sub(sim.camera.pos);
}

/**
 * Textures a mesh holds while mounted (so the cache never disposes them under it), released
 * when it unmounts. Returns the function that loads and holds one.
 */
function useHeldTextures() {
  const held = useRef<[string, TextureOptions][]>([]);
  useEffect(
    () => () => {
      for (const [file, opts] of held.current) releaseTexture(file, opts);
      held.current = [];
    },
    [],
  );
  return (file: string, opts: TextureOptions = {}) => {
    held.current.push([file, opts]);
    return acquireTexture(file, opts);
  };
}

/** Should this body's textures load yet? (Lazy: only once it is more than a few pixels wide.) */
function wantsTextures(id: BodyId): boolean {
  const b = sim.bodies[id];
  const ui = useUI.getState();
  return !!b && (b.radiusPx > 2 || ui.selected === id || ui.focus === id);
}

/** How a record is drawn. */
export function rendererOf(r: BodyRecord): NonNullable<NonNullable<BodyRecord['visual']>['renderer']> {
  const v = r.visual?.renderer;
  if (v) return v;
  switch (r.kind) {
    case 'star':
      return 'star';
    case 'spacecraft':
      return 'spacecraft';
    case 'galaxy':
    case 'cluster':
    case 'nebula':
    case 'barycentre':
      return 'point';
    default:
      return 'planet';
  }
}

/** The texture files a body's visuals use (for pinning). */
function textureFiles(r: BodyRecord | undefined): string[] {
  const v = r?.visual;
  if (!v) return [];
  const out = [v.map, v.night, v.clouds].filter((f): f is string => !!f);
  if (v.rings?.kind === 'texture') out.push(v.rings.texture);
  return out;
}

// ─── Planets, moons and small bodies ─────────────────────────────────────────────────────

export function Planet({ id }: { id: BodyId }) {
  const group = useRef<Group>(null!);
  const mesh = useRef<Mesh>(null!);
  const rec = getBody(id)!;
  const vis = rec.visual ?? {};
  const material = useMemo(
    () =>
      createPlanetMaterial({
        baseColor: new Color(rec.physical.colour),
        banded: vis.banded,
        atmoColor: vis.atmo ? new Color(vis.atmo) : undefined,
        atmoStrength: vis.atmoStrength,
        lonOffset: vis.lonOffset,
        fillBlack: vis.fillBlack,
        mapTint: vis.mapTint ? new Color(vis.mapTint) : undefined,
      }),
    [rec],
  );
  useEffect(() => () => material.dispose(), [material]);
  const requested = useRef(false);
  const hold = useHeldTextures();
  const shape = useRef<BufferGeometry | null>(null);
  const extent = extentFactor(rec);

  useEffect(() => {
    if (!vis.shape) return;
    let live = true;
    loadShape(vis.shape).then((s) => {
      if (live && s) shape.current = s.geometry;
    });
    return () => {
      live = false;
    };
  }, [vis.shape]);

  useFrame(() => {
    const b = sim.bodies[id];
    if (!b) return;
    // The group (body and rings) while either is a pixel wide; the body itself only while it is.
    const visible = b.present && b.radiusPx * extent >= MESH_MIN_PX;
    group.current.visible = visible;
    if (!visible) return;
    mesh.current.visible = b.radiusPx >= MESH_MIN_PX;
    // Floating origin: float64 world position minus float64 camera position.
    group.current.position.copy(b.apparentPos).sub(sim.camera.pos);
    group.current.quaternion.copy(b.apparentQuat);
    const p = rec.physical;
    const eq = displayRadiusKm(rec);
    const k = b.displayRadius / eq;
    const m = mesh.current;
    const geometry = shape.current ?? (b.radiusPx < LOD_PX ? SPHERE_LO : SPHERE_HI);
    if (m.geometry !== geometry) m.geometry = geometry;
    if (shape.current) m.scale.setScalar(k);
    else if (p.triaxialRadiiKm) m.scale.set(p.triaxialRadiiKm[0] * k, p.triaxialRadiiKm[2] * k, p.triaxialRadiiKm[1] * k);
    else m.scale.set(eq * k, (p.polarRadiusKm ?? eq) * k, eq * k);
    sunRelative(material.uniforms.uSunRel.value);

    if (!requested.current && wantsTextures(id)) {
      requested.current = true;
      const u = material.uniforms;
      const assign = (file: string | undefined, tex: string, flag: string, opts: TextureOptions = {}) => {
        if (!file) return;
        hold(file, opts).then((t) => {
          if (!t) return;
          u[tex].value = t;
          u[flag].value = 1;
          if (tex === 'uMap') u.uMapGrey.value = opts.grey ? 1 : 0;
        });
      };
      assign(vis.map, 'uMap', 'uHasMap', { grey: vis.mapChannels === 1 });
      assign(vis.night, 'uNight', 'uHasNight');
      assign(vis.clouds, 'uClouds', 'uHasClouds', { color: false });
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={mesh} geometry={SPHERE_LO} material={material} />
      {vis.rings && <Rings id={id} spec={vis.rings} planetMaterial={material} />}
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

/**
 * A ring system: Saturn's photographic strip, or bands (rings.json) drawn into a strip. The
 * ring plane is the body's equator unless the spec gives a pole. The rings can shade the body.
 */
function Rings({ id, spec, planetMaterial }: { id: BodyId; spec: RingSpec; planetMaterial: ShaderMaterial }) {
  const mesh = useRef<Mesh>(null!);
  const material = useMemo(createRingMaterial, []);
  const { inner, outer, strip } = useMemo(() => {
    if (spec.kind === 'texture') return { inner: spec.innerKm, outer: spec.outerKm, strip: null as DataTexture | null };
    const ext = bandsExtent(spec.bands);
    return { inner: ext.innerKm, outer: ext.outerKm, strip: bandsTexture(spec.bands, ext.innerKm, ext.outerKm) };
  }, [spec]);
  const geometry = useMemo(() => ringGeometry(inner, outer, 256), [inner, outer]);
  const pole = useMemo(() => (spec.kind === 'bands' && spec.pole ? raDecToWorld(spec.pole.raDeg, spec.pole.decDeg) : null), [spec]);
  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
      strip?.dispose();
    },
    [material, geometry, strip],
  );
  const requested = useRef(false);
  const hold = useHeldTextures();
  const eq = displayRadiusKm(getBody(id)!);

  useFrame(() => {
    const b = sim.bodies[id];
    if (!b) return;
    const k = b.displayRadius / eq;
    mesh.current.scale.setScalar(k);
    mesh.current.visible = b.radiusPx * (outer / eq) >= MESH_MIN_PX;

    const u = material.uniforms;
    sunRelative(u.uSunRel.value);
    const center = tmp.copy(b.apparentPos).sub(sim.camera.pos);
    let normal: Vector3;
    if (pole) {
      // The mesh sits in the body's frame: turn a ring with a pole of its own back into it.
      qInv.copy(b.apparentQuat).invert();
      mesh.current.quaternion.setFromUnitVectors(UP, tmp2.copy(pole).applyQuaternion(qInv));
      normal = tmp2.copy(pole);
    } else normal = tmp2.set(0, 1, 0).applyQuaternion(b.apparentQuat);
    u.uCenterW.value.copy(center);
    u.uNormalW.value.copy(normal);
    u.uPlanetRadius.value = b.displayRadius;
    u.uInner.value = inner;
    u.uOuter.value = outer;

    // Ring shadow on the body (radii in displayed units).
    const shadow = spec.shadow === true;
    const p = planetMaterial.uniforms;
    if (shadow) {
      p.uCenterW.value.copy(center);
      p.uRingNormalW.value.copy(normal);
      p.uRingInner.value = inner * k;
      p.uRingOuter.value = outer * k;
    }

    if (!requested.current && wantsTextures(id)) {
      requested.current = true;
      const use = (t: typeof u.uMap.value) => {
        u.uMap.value = t;
        u.uHasMap.value = 1;
        if (shadow) {
          p.uRingMap.value = t;
          p.uRingShadow.value = 1;
        }
      };
      if (strip) use(strip);
      else if (spec.kind === 'texture')
        hold(spec.texture).then((t) => {
          if (t) use(t);
        });
    }
  });

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={5} />;
}

// ─── The Sun and other stars ─────────────────────────────────────────────────────────────

export function Sun() {
  const mesh = useRef<Mesh>(null!);
  const material = useMemo(createSunMaterial, []);
  const requested = useRef(false);
  const hold = useHeldTextures();
  const map = getBody('sun')?.visual?.map;
  useFrame(() => {
    const b = sim.bodies.sun;
    if (!b) return;
    const m = mesh.current;
    m.visible = b.radiusPx >= MESH_MIN_PX;
    if (!m.visible) return;
    m.position.copy(b.apparentPos).sub(sim.camera.pos);
    m.quaternion.copy(b.apparentQuat);
    m.scale.setScalar(b.displayRadius);
    const geometry = b.radiusPx < LOD_PX ? SPHERE_LO : SPHERE_HI;
    if (m.geometry !== geometry) m.geometry = geometry;
    // Simple auto-exposure: at its true radiance when small (the disc then averages a 5,772 K
    // surface, as the stars and the CMB assume), and dimmer up close so limb darkening and
    // granulation show.
    const t = Math.min(1, Math.max(0, (b.radiusPx - 30) / 170));
    material.uniforms.uIntensity.value = SUN_CENTRE_RADIANCE * (1 - 0.575 * t * t * (3 - 2 * t));
    if (map && !requested.current && wantsTextures('sun')) {
      requested.current = true;
      hold(map).then((tex) => {
        if (!tex) return;
        material.uniforms.uMap.value = tex;
        material.uniforms.uHasMap.value = 1;
      });
    }
  });
  return <mesh ref={mesh} geometry={SPHERE_LO} material={material} visible={false} />;
}

/**
 * A star other than the Sun (Proxima Centauri): a limb-darkened blackbody disc at its effective
 * temperature. The Sun's granulation map is not used.
 */
export function StarBody({ id }: { id: BodyId }) {
  const mesh = useRef<Mesh>(null!);
  const teff = getBody(id)?.physical.luminous?.teffK ?? SUN_TEFF_K;
  const material = useMemo(() => createSunMaterial(new Color(...blackbodyRgb(teff))), [teff]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    const b = sim.bodies[id];
    if (!b) return;
    const m = mesh.current;
    m.visible = b.present && b.radiusPx >= MESH_MIN_PX;
    if (!m.visible) return;
    m.position.copy(b.apparentPos).sub(sim.camera.pos);
    m.quaternion.copy(b.apparentQuat);
    m.scale.setScalar(b.displayRadius);
    const geometry = b.radiusPx < LOD_PX ? SPHERE_LO : SPHERE_HI;
    if (m.geometry !== geometry) m.geometry = geometry;
    const t = Math.min(1, Math.max(0, (b.radiusPx - 30) / 170));
    material.uniforms.uIntensity.value = 6 - 3.6 * t * t * (3 - 2 * t);
  });
  return <mesh ref={mesh} geometry={SPHERE_LO} material={material} visible={false} />;
}

// ─── Spacecraft ──────────────────────────────────────────────────────────────────────────

/** Radius of the probe model as built (Voyager's, km): it is scaled from this to each spacecraft's radius. */
export const PROBE_MODEL_RADIUS_KM = 0.00185;

/**
 * A space probe at true size (metres, in km units), modelled on Voyager: the 3.7 m high-gain
 * antenna (always pointed at Earth), the ten-sided bus, the RTG and science booms, and the 13 m
 * magnetometer boom. Scaled to the body's radius. Simplified geometry.
 */
export function Spacecraft({ id }: { id: BodyId }) {
  const group = useRef<Group>(null!);
  const parts = useMemo(() => {
    const m = (hex: string) => createPlanetMaterial({ baseColor: new Color(hex), flat: true, ambient: 0.02 });
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
  useEffect(
    () => () => {
      for (const x of Object.values(parts)) x.dispose();
    },
    [parts],
  );

  useFrame(() => {
    const b = sim.bodies[id];
    const earth = sim.bodies.earth;
    if (!b) return;
    const g = group.current;
    g.visible = b.present && b.radiusPx >= MESH_MIN_PX;
    if (!g.visible) return;
    g.position.copy(b.apparentPos).sub(sim.camera.pos);
    // Point the antenna (+Y) at Earth.
    if (earth) {
      tmp.copy(earth.pos).sub(b.apparentPos).normalize();
      g.quaternion.setFromUnitVectors(tmp2.set(0, 1, 0), tmp);
    }
    // The model is built at Voyager's size: scale it to this craft's (displayed) radius.
    g.scale.setScalar(b.displayRadius / PROBE_MODEL_RADIUS_KM);
    for (const mat of [parts.dishMat, parts.busMat, parts.boomMat, parts.rtgMat]) sunRelative(mat.uniforms.uSunRel.value);
  });

  return (
    <group ref={group} visible={false}>
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

// ─── Shader programs kept compiled ───────────────────────────────────────────────────────

/**
 * One material of each body shader (and the orbit lines'), drawn once (invisibly: a speck at
 * the camera, inside the near plane) and never disposed. three.js frees a shader program when
 * the last material using it is disposed, so without these, zooming out until every planet has
 * unmounted would recompile the planet shader on the way back in (6 ms warm, 80 ms cold), and
 * leaving the relativistic view would recompile the orbit lines'. Drawing them once in the real
 * render gives them exactly the programs the bodies and lines use.
 */
function ShaderKeeper() {
  const materials = useMemo(
    () => [createPlanetMaterial({ baseColor: new Color('#808080') }), createRingMaterial(), createSunMaterial(), createOrbitMaterial(new Color('#808080'))],
    [],
  );
  return (
    <>
      {materials.map((m, i) => (
        <mesh
          key={i}
          geometry={SPHERE_LO}
          material={m}
          frustumCulled={false}
          scale={1e-9}
          ref={(o) => {
            if (o)
              o.onAfterRender = () => {
                o.visible = false;
              };
          }}
        />
      ))}
    </>
  );
}

// ─── Which bodies have meshes ────────────────────────────────────────────────────────────

function BodyMesh({ id }: { id: BodyId }) {
  const rec = getBody(id);
  if (!rec) return null;
  switch (rendererOf(rec)) {
    case 'star':
      return <StarBody id={id} />;
    case 'spacecraft':
      return <Spacecraft id={id} />;
    case 'planet':
      return <Planet id={id} />;
    default:
      return null;
  }
}

/**
 * Decides, each frame, which bodies have mesh components: those about a pixel wide or more,
 * with a couple of seconds' grace before a shrinking body loses its mesh. Only a change of that
 * set re-renders anything.
 */
export function Bodies() {
  const version = useSyncExternalStore(subscribeRegistry, registryVersion);
  const [mounted, setMounted] = useState<readonly BodyId[]>([]);
  const live = useRef({ set: new Set<BodyId>(), small: new Map<BodyId, number>(), focus: '', version: -1 });

  useFrame(({ gl }) => {
    // One texture upload a frame (render/textures.ts).
    pumpTextureUploads(gl);
    const st = live.current;
    let changed = false;
    const list = bodyEntries();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.id === 'sun') continue;
      const b = e.state;
      const has = st.set.has(e.id);
      // A ringed body counts as wide as its rings.
      const px = b.radiusPx * extentFactor(e.record);
      if (b.present && px >= MOUNT_PX) {
        if (!has) {
          if (rendererOf(e.record) === 'point') continue;
          st.set.add(e.id);
          changed = true;
        }
        st.small.delete(e.id);
      } else if (has) {
        const n = b.present && px >= UNMOUNT_PX ? 0 : (st.small.get(e.id) ?? 0) + 1;
        if (n > UNMOUNT_FRAMES || !b.present) {
          st.set.delete(e.id);
          st.small.delete(e.id);
          changed = true;
        } else st.small.set(e.id, n);
      }
    }
    // Bodies that left the registry.
    if (st.version !== version) {
      for (const id of st.set) {
        if (!sim.bodies[id]) {
          st.set.delete(id);
          changed = true;
        }
      }
    }
    if (changed) setMounted([...st.set]);

    // Pin the textures of the Sun, Earth and the system in focus.
    const focus = useUI.getState().focus;
    if (focus !== st.focus || version !== st.version) {
      st.focus = focus;
      st.version = version;
      const system = systemOf(focus)?.id;
      const files = [...textureFiles(getBody('sun')), ...textureFiles(getBody('earth'))];
      if (system && system !== 'sun') for (const r of bodyRecords()) if (isWithin(r.id, system)) files.push(...textureFiles(r));
      setPinnedTextures(files);
    }
  });

  return (
    <>
      <ShaderKeeper />
      <Sun />
      {mounted.map((id) => (
        // A record registered again (new data for the body) remounts its mesh.
        <BodyMesh key={`${id}:${recordSerial(id)}`} id={id} />
      ))}
    </>
  );
}
