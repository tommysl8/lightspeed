/**
 * Comets' comae and tails: the ion tail straight down the solar wind, the dust tail curving back
 * along the orbit, and a faint coma, brightest near the Sun and gone beyond about 5 au
 * (render/cometTail.ts has the physical model). One small mesh per comet, rewritten each frame
 * only while its tail is active and at least a couple of pixels long on screen; otherwise
 * nothing is computed or drawn.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, type Mesh } from 'three';
import { AU_KM } from '../physics/constants';
import { bodyRecords, getBody, recordSerial, registryVersion, subscribeRegistry, type BodyId } from '../sim/bodies';
import { pixelsPerRadian, solarSystemHidden } from '../sim/derived';
import { sim } from '../sim/sim';
import { createTailMaterial } from '../render/materials';
import {
  DUST_AGE_S,
  DUST_BETAS,
  ION_TAIL_KM,
  grainOffset,
  ionTailDirection,
  releaseState,
  tailBrightness,
  type V3,
} from '../render/cometTail';

/** Dust samples along each syndyne (release ages), ion-tail samples, coma rim points. */
const K = 24;
const M = 24;
const RIM = 24;
const J = DUST_BETAS.length;
const DUST_V = J * K;
const ION_V = 2 * M;
const COMA_V = 1 + RIM;
const VERTS = DUST_V + ION_V + COMA_V;

/** Peak brightness (additive, before the saturation of tailBrightness) of each part: subtle by design. */
const DUST_GAIN = 0.32;
const ION_GAIN = 0.13;
const COMA_GAIN = 0.4;
/** Relative weight of each syndyne across the dust fan (large grains and the finest are fewer: soft edges). */
const BETA_WEIGHT = [0.12, 0.75, 1, 0.7, 0.15];
/** Dust dims with age as it spreads: e-folding time, s. */
const DUST_FADE_S = 10 * 86_400;
/** Coma radius at full activity, km. */
const COMA_KM = 3e5;

const DUST = new Color('#fff0d8');
const ION = new Color('#7aa6ff');
const COMA = new Color('#e4ecff');

function tailGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  const dyn = (n: number, size: number) => new BufferAttribute(new Float32Array(n * size), size).setUsage(DynamicDrawUsage);
  g.setAttribute('position', dyn(VERTS, 3));
  g.setAttribute('aColor', dyn(VERTS, 3));
  const side = new Float32Array(VERTS);
  for (let i = 0; i < M; i++) {
    side[DUST_V + 2 * i] = -1;
    side[DUST_V + 2 * i + 1] = 1;
  }
  g.setAttribute('aSide', new BufferAttribute(side, 1));
  const idx: number[] = [];
  // Dust: quads between neighbouring syndynes and ages.
  for (let j = 0; j < J - 1; j++)
    for (let k = 0; k < K - 1; k++) {
      const a = j * K + k;
      const b = (j + 1) * K + k;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  // Ion ribbon.
  for (let i = 0; i < M - 1; i++) {
    const a = DUST_V + 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // Coma: a fan around the head.
  const c = DUST_V + ION_V;
  for (let i = 0; i < RIM; i++) idx.push(c, c + 1 + i, c + 1 + ((i + 1) % RIM));
  g.setIndex(idx);
  return g;
}

// Scratch, shared by every comet (they are updated one after another).
const r = { x: 0, y: 0, z: 0 };
const v = { x: 0, y: 0, z: 0 };
const rel = { x: 0, y: 0, z: 0 };
const relR = { x: 0, y: 0, z: 0 };
const relV = { x: 0, y: 0, z: 0 };
const grain = { x: 0, y: 0, z: 0 };
const dir = { x: 0, y: 0, z: 0 };
const side = { x: 0, y: 0, z: 0 };
const u1 = { x: 0, y: 0, z: 0 };
const u2 = { x: 0, y: 0, z: 0 };

function cross(a: V3, b: V3, out: V3): V3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  const n = Math.hypot(x, y, z) || 1;
  out.x = x / n;
  out.y = y / n;
  out.z = z / n;
  return out;
}

function CometTail({ id }: { id: BodyId }) {
  const mesh = useRef<Mesh>(null!);
  const geometry = useMemo(tailGeometry, []);
  const material = useMemo(createTailMaterial, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const radiusKm = getBody(id)?.physical.radiusKm ?? 1;

  useFrame(() => {
    const m = mesh.current;
    const b = sim.bodies[id];
    const sun = sim.bodies.sun;
    m.visible = false;
    if (!b || !sun || !b.present || solarSystemHidden()) return;
    r.x = b.apparentPos.x - sun.apparentPos.x;
    r.y = b.apparentPos.y - sun.apparentPos.y;
    r.z = b.apparentPos.z - sun.apparentPos.z;
    const rKm = Math.hypot(r.x, r.y, r.z);
    const bright = tailBrightness(rKm / AU_KM, radiusKm);
    if (bright < 0.003) return;
    // Worth drawing only if the tail would be a couple of pixels long.
    if ((ION_TAIL_KM / Math.max(b.distCamera, 1)) * pixelsPerRadian() < 2) return;
    m.visible = true;
    v.x = b.vel.x;
    v.y = b.vel.y;
    v.z = b.vel.z;

    const P = (geometry.attributes.position as BufferAttribute).array as Float32Array;
    const C = (geometry.attributes.aColor as BufferAttribute).array as Float32Array;
    const cam = sim.camera.pos;
    // The head, relative to the camera (float64 until here: the floating origin).
    rel.x = b.apparentPos.x - cam.x;
    rel.y = b.apparentPos.y - cam.y;
    rel.z = b.apparentPos.z - cam.z;

    // Dust: syndynes of each β, sampled at ages that crowd towards the head.
    for (let k = 0; k < K; k++) {
      const f = k / (K - 1);
      const age = DUST_AGE_S * f * f;
      if (age > 0) releaseState(r, v, age, relR, relV);
      const fade = Math.exp(-age / DUST_FADE_S) * (k === 0 ? 1 : 1 - 0.3 * f);
      for (let j = 0; j < J; j++) {
        const i = j * K + k;
        if (age > 0) grainOffset(r, relR, relV, DUST_BETAS[j], age, grain);
        else grain.x = grain.y = grain.z = 0;
        P[3 * i] = rel.x + grain.x;
        P[3 * i + 1] = rel.y + grain.y;
        P[3 * i + 2] = rel.z + grain.z;
        const a = DUST_GAIN * bright * BETA_WEIGHT[j] * fade;
        C[3 * i] = DUST.r * a;
        C[3 * i + 1] = DUST.g * a;
        C[3 * i + 2] = DUST.b * a;
      }
    }

    // Ion tail: straight down the solar wind, widening and fading away from the head.
    ionTailDirection(r, v, dir);
    cross(dir, rel, side);
    for (let i = 0; i < M; i++) {
      const s = i / (M - 1);
      const along = ION_TAIL_KM * s ** 1.3;
      // Ion tails are narrow: a few hundred thousand km, widening down the tail.
      const half = 8e4 + 6e5 * s;
      const x = rel.x + dir.x * along;
      const y = rel.y + dir.y * along;
      const z = rel.z + dir.z * along;
      const a = ION_GAIN * bright * (1 - s) ** 1.6;
      for (let e = 0; e < 2; e++) {
        const n = DUST_V + 2 * i + e;
        const sgn = e === 0 ? -1 : 1;
        P[3 * n] = x + sgn * side.x * half;
        P[3 * n + 1] = y + sgn * side.y * half;
        P[3 * n + 2] = z + sgn * side.z * half;
        C[3 * n] = ION.r * a;
        C[3 * n + 1] = ION.g * a;
        C[3 * n + 2] = ION.b * a;
      }
    }

    // Coma: a disc facing the camera, bright at the head and fading to its rim.
    const c = DUST_V + ION_V;
    const rc = COMA_KM * Math.sqrt(bright);
    cross(rel, dir, u1);
    cross(rel, u1, u2);
    P[3 * c] = rel.x;
    P[3 * c + 1] = rel.y;
    P[3 * c + 2] = rel.z;
    const a0 = COMA_GAIN * bright;
    C[3 * c] = COMA.r * a0;
    C[3 * c + 1] = COMA.g * a0;
    C[3 * c + 2] = COMA.b * a0;
    for (let i = 0; i < RIM; i++) {
      const t = (2 * Math.PI * i) / RIM;
      const n = c + 1 + i;
      const cs = Math.cos(t) * rc;
      const sn = Math.sin(t) * rc;
      P[3 * n] = rel.x + u1.x * cs + u2.x * sn;
      P[3 * n + 1] = rel.y + u1.y * cs + u2.y * sn;
      P[3 * n + 2] = rel.z + u1.z * cs + u2.z * sn;
      C[3 * n] = C[3 * n + 1] = C[3 * n + 2] = 0;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={4} visible={false} />;
}

/** A tail for every registered body whose visual asks for one. */
export function CometTails() {
  const version = useSyncExternalStore(subscribeRegistry, registryVersion);
  const ids = useMemo(() => bodyRecords().filter((r) => r.visual?.tails).map((r) => r.id), [version]);
  return (
    <>
      {ids.map((id) => (
        <CometTail key={`${id}:${recordSerial(id)}`} id={id} />
      ))}
    </>
  );
}
