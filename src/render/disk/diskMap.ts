/**
 * A black hole's thin accretion disc as the lens passes draw it (Cygnus X-1's): the uniforms and textures of the chunk
 * `lightspeed_disklookup` (render/shaders/diskLookup.glsl), which the lens box's composite, the photon ring's band and
 * the lensed spheres include, the disc's exposure, and its turning.
 *
 * What (docs/data/blackholes.md §12): the orbit table (physics/thinDisk.ts orbitTable: every orbit of light, made once,
 * 1 MB) and the camera's row data (cameraRows: where the camera sits on each orbit, rebuilt when its r changes), the
 * disc's plane (the binary's orbit, from its record), its temperatures and edges, and the noise of its illustrative
 * swirl, each frame the lens is drawn at a hole with a disc and View › Accretion discs is on. The camera must hover
 * (a fall is offered only into Sgr A* and M87*, which have no disc).
 *
 * Exposure: the disc is an opaque blackbody far brighter than any star's surface (Cygnus X-1's inner rings are about
 * 2 million kelvin, 10⁴ times the Sun's surface brightness in visible light). Its visible light is drawn as a surface
 * of the Sun's calibration, as the Sun's disc and the CMB are; all of its light (the default, as the published
 * pictures show a disc: σ(gT)⁴, mostly X-rays) as T⁴ against the same metered ring. Visible light alone is the
 * Rayleigh–Jeans tail of a blackbody millions of kelvin hot: brighter only as g T, one colour everywhere, so the disc
 * looks nearly even; with all its light the approaching side outshines the receding one as g⁴. It is metered on its
 * peak: the ring it resolves best (the hottest, at 9.55 M, or the innermost ring 10 px across from farther away) on its
 * approaching side (diskPeakLnT). All its light is drawn on the disc's own scale, the peak at DISK_KEY_ALL and the rest
 * with the contrast DISK_CONTRAST (a display choice: the view's logarithmic tone mapping would otherwise flatten its r⁻³
 * falloff into an evenly lit plate), while the view keeps the sky's exposure, so space and stars show round it; the
 * companion star beside it keeps its brightness relative to the disc's visible light (uDiskStarLnE). Visible light is
 * drawn linearly, its peak at DISK_KEY, and the rest of the view (stars, sky) dims with it, by the disc's share of the
 * view. Either way the disc fades in with that share (DISK_SHARE_PX: from an outer edge 3 px in radius to 30), so it
 * never shows as a white blot. render/relativisticView.ts takes diskLnExposure beside the flow's and the sky's.
 *
 * The swirl (illustrative): the gas turns the record's slowdown times slower than it really does (stated on the card:
 * Cygnus X-1's innermost ring goes round in 9.6 ms, drawn in 9.6 s), at the camera's own clock
 * (a hovering clock runs slow, so the disc turns faster by 1/√(1 − 2M/r)), paused with the simulation.
 *
 * Cost: the orbit table once (19 ms, the first time a disc is near); the camera's rows (512 closed-form sweeps,
 * 0.08 ms) whenever its r changes; the rest a few dozen flops a frame. Nothing far from a disc.
 *
 * Twins: render/shaders/diskLookup.glsl, physics/thinDisk.ts, sim/blackholes/records.ts diskInfo (the disc's numbers).
 */
import { DataTexture, FloatType, LinearFilter, NearestFilter, RedFormat, RGBAFormat, RepeatWrapping, UnsignedByteType, Vector3, Vector4 } from 'three';
import { BC } from '../../physics/schwarzschild';
import { sampleBlackbody, type BlackbodySample } from '../../physics/blackbody';
import { cameraRows, keplerRedshift, NT_PEAK_M, ntLnTemperature, ORBIT_COLS, ORBIT_ROWS, orbitTable, type OrbitTable } from '../../physics/thinDisk';
import type { BlackHoleDisk } from '../../sim/bodies/types';
import type { DiskLight } from '../../sim/blackholes/accretion';
import { SUN_SURFACE_RADIANCE } from '../materials';
import { lensBoxExtra } from '../lens/lensState';

/**
 * The display units the metered ring is brought to: its visible light, and all of its light (AgX's middle grey is
 * 0.18; the disc's hot side runs to a few times this, and with all its light, whose T⁴ falls fast, the outer disc
 * fades to dark).
 */
export const DISK_KEY = 1.0;
export const DISK_KEY_ALL = 4;
/**
 * The contrast γ of the disc's display with all its light, a display choice (labelled): its light relative to the
 * metered peak is drawn as its γ-th power. The view's tone mapping (AgX) is logarithmic over 16 stops: a ring five
 * stops below the peak still shows at a fifth of white, so a disc whose flux falls as r⁻³ would look evenly lit to the
 * frame's edge. γ = 1.6 restores the falloff and the approaching side's lead that the published pictures, linear in
 * flux, show: the inner tens of M blaze, the disc is near black by about 100 M.
 */
export const DISK_CONTRAST = 2;
/** The disc's share of the view, from its outer edge's radius on the screen (device px): none below the first, all from the second. */
export const DISK_SHARE_PX: readonly [number, number] = [3, 30];
/** The swirl's strength (its noise's ±½ becomes e^(±1.25 × this)), and how often each of its two layers restarts (inner orbits). */
export const DISK_SWIRL_AMPLITUDE = 0.15;
export const DISK_SWIRL_ORBITS = 2;
/** The share of the way to its target the view's exposure moves each frame (as the flow's). */
const DISK_EXPOSURE_ADAPT = 0.15;

const LN_SUN = Math.log(SUN_SURFACE_RADIANCE);

/** A uniform: shared by reference between materials. */
interface Uniform<T> {
  value: T;
}

/** Uniforms of the chunk `lightspeed_disklookup` (their meanings as the chunk declares them). */
export interface DiskUniforms {
  uDiskOn: Uniform<number>;
  uDiskOrbit: Uniform<DataTexture | null>;
  uDiskRows: Uniform<DataTexture | null>;
  uDiskAxes: Uniform<Vector4>;
  uDiskGeom: Uniform<Vector4>;
  uDiskNormal: Uniform<Vector3>;
  uDiskX: Uniform<Vector3>;
  uDiskY: Uniform<Vector3>;
  uDiskLight: Uniform<Vector3>;
  uDiskSwirl: Uniform<Vector4>;
  uDiskNoise: Uniform<DataTexture | null>;
  uDiskStarLnE: Uniform<number>;
}

/** A 1 × 1 float texture: what the chunk is bound to before a disc is ever near. */
function placeholder(format: typeof RedFormat | typeof RGBAFormat): DataTexture {
  const t = new DataTexture(new Float32Array(format === RedFormat ? 1 : 4), 1, 1, format, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

export const diskUniforms: DiskUniforms = {
  uDiskOn: { value: 0 },
  uDiskOrbit: { value: placeholder(RedFormat) },
  uDiskRows: { value: placeholder(RGBAFormat) },
  uDiskAxes: { value: new Vector4(0, 1, 0, 1) },
  uDiskGeom: { value: new Vector4(0, 6, 6, 0) },
  uDiskNormal: { value: new Vector3(0, 1, 0) },
  uDiskX: { value: new Vector3(1, 0, 0) },
  uDiskY: { value: new Vector3(0, 0, -1) },
  uDiskLight: { value: new Vector3(0, -100, 1) },
  uDiskSwirl: { value: new Vector4(0, 0, 1, 0) },
  uDiskNoise: { value: null },
  uDiskStarLnE: { value: 0 },
};

/**
 * The swirl's noise: 128 × 128, tiling, smooth value noise in four octaves, stretched along the orbit (6 cells round
 * it and 4 across a tile in ln r at the first octave: the shader takes 2 ln r, so a tile is a factor e^½ in r), so
 * its streaks lie along the flow as sheared turbulence would. Deterministic (a fixed hash).
 */
export function diskNoiseData(n = 128): Uint8Array {
  const hash = (i: number, j: number, o: number) => {
    let h = (i * 374761393 + j * 668265263 + o * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const out = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let s = 0;
      let wsum = 0;
      for (let o = 0; o < 4; o++) {
        const cx = 6 << o;
        const cy = 4 << o;
        const fx = (x / n) * cx;
        const fy = (y / n) * cy;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = smooth(fx - ix);
        const ty = smooth(fy - iy);
        const v = (i: number, j: number) => hash(((i % cx) + cx) % cx, ((j % cy) + cy) % cy, o);
        const top = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * tx;
        const bot = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * tx;
        const w = 0.55 ** o;
        s += w * (top + (bot - top) * ty);
        wsum += w;
      }
      out[y * n + x] = Math.round(255 * Math.min(1, Math.max(0, s / wsum)));
    }
  return out;
}

function noiseTexture(): DataTexture {
  const n = 128;
  const t = new DataTexture(diskNoiseData(n), n, n, RedFormat, UnsignedByteType);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** What the disc needs to know this frame (scene/AccretionDisk.tsx passes it: render/disk is below the lens state). */
export interface DiskFrame {
  /** The lens is drawn at a hole with a disc, View › Accretion discs is on and the camera hovers. */
  on: boolean;
  disk: BlackHoleDisk | null;
  /** M = GM/c² of the hole, km; the camera's r (units of M); ln g of light from far away there (the lens's). */
  mKm: number;
  rCam: number;
  lnG: number;
  /** Device px per radian at the screen's centre. */
  pxPerRad: number;
  /** Real seconds since the last frame (0 while the simulation is paused). */
  dt: number;
  /** ln of the view's exposure this frame (render/relativisticView.ts relView.lnExposure). */
  lnExposure: number;
  /** Its brightness: its visible light, or all of its light (σT⁴, mostly X-rays), each in its visible colour. */
  light: DiskLight;
  /** Unit camera → hole, world axes (the lens's axis). */
  axis: { x: number; y: number; z: number };
}


/** The disc's state (development tools and tests read it). */
export const diskState = {
  table: null as OrbitTable | null,
  rows: null as Float64Array | null,
  /** The camera's r the rows were built for. */
  builtR: NaN,
  /** The disc's share of the view (0–1), its spot exposure (ln) and the view's exposure it asks for, easing. */
  share: 0,
  lnSpot: 0,
  lnExposure: 0,
  /** The swirl's clock: coordinate time at the hole, units of M, modulo the layers' period; and that period. */
  tau: 0,
  period: 1,
  /** The disc's outer edge's image angle from the hole (rad; π when the camera is near or inside it): the lens box. */
  boxAngle: 0,
};

const bb: BlackbodySample = { r: 0, g: 0, b: 0, lnY: 0 };

/** The outer edge's image angle from the hole for a hovering camera at r (rad): the ray that grazes r_out, or π inside it. */
export function diskImageAngle(rCam: number, rOut: number): number {
  if (!(rCam > 1.1 * rOut)) return Math.PI;
  const bOut = rOut / Math.sqrt(1 - 2 / rOut);
  return Math.asin(Math.min(1, (bOut * Math.sqrt(1 - 2 / rCam)) / rCam));
}

/**
 * The spot exposure (ln) for a camera at r (units of M) with blueshift ln g, the disc's axis at sin i across the line
 * to the hole: its visible light at the metered peak (diskPeakLnT) brought to DISK_KEY display units.
 */
export function diskSpotExposure(disk: BlackHoleDisk, rCam: number, lnG: number, pxPerRad: number, sinI = 0): number {
  sampleBlackbody(diskPeakLnT(disk, rCam, lnG, pxPerRad, sinI), bb);
  return Math.log(DISK_KEY) - bb.lnY - LN_SUN;
}

/**
 * ln T (K) of the metered peak as the camera sees it: the best-resolved ring (the hottest, at 9.55 M, or the innermost
 * 10 px across from farther away) on its approaching side, the gas coming towards the camera as nearly as the tilt
 * allows (L_z = sin i times the largest impact parameter light leaving that ring can have, r/√(1 − 2/r)).
 */
export function diskPeakLnT(disk: BlackHoleDisk, rCam: number, lnG: number, pxPerRad: number, sinI: number): number {
  const r10 = (10 / pxPerRad) * rCam;
  const rRef = Math.max(NT_PEAK_M, Math.min(0.5 * disk.rOutM, r10));
  const lz = (rRef / Math.sqrt(1 - 2 / rRef)) * Math.min(1, Math.max(0, sinI));
  return ntLnTemperature(rRef, disk.lnTStarK) + Math.log(keplerRedshift(rRef, lz)) + lnG;
}

/** ln of the exposure the disc holds the view at (render/relativisticView.ts takes the smallest near a hole). */
export function diskLnExposure(): number {
  return diskState.lnExposure;
}

const xAxis = new Vector3();

/** The disc this frame: its uniforms, exposure and clock (scene/AccretionDisk.tsx, at priority 0 before the render). */
export function updateDisk(f: DiskFrame): void {
  const s = diskState;
  const u = diskUniforms;
  const disk = f.disk;
  if (!f.on || !disk) {
    u.uDiskOn.value = 0;
    s.share = 0;
    s.boxAngle = 0;
    lensBoxExtra.angle = 0;
    s.lnExposure += (0 - s.lnExposure) * DISK_EXPOSURE_ADAPT;
    if (Math.abs(s.lnExposure) < 1e-4) s.lnExposure = 0;
    return;
  }
  if (!s.table) {
    s.table = orbitTable();
    const orbit = new DataTexture(s.table.v, ORBIT_COLS, ORBIT_ROWS, RedFormat, FloatType);
    orbit.minFilter = NearestFilter;
    orbit.magFilter = NearestFilter;
    orbit.needsUpdate = true;
    u.uDiskOrbit.value = orbit;
    const rows = new DataTexture(new Float32Array(4 * ORBIT_ROWS), ORBIT_ROWS, 1, RGBAFormat, FloatType);
    rows.minFilter = NearestFilter;
    rows.magFilter = NearestFilter;
    u.uDiskRows.value = rows;
    u.uDiskNoise.value = noiseTexture();
    s.rows = new Float64Array(ORBIT_ROWS);
    const t = s.table;
    u.uDiskAxes.value.set(t.qIn0, 1 / t.dqIn, t.qOut0, 1 / t.dqOut);
  }
  const t = s.table;
  const r = f.rCam;
  if (r !== s.builtR) {
    cameraRows(t, r, s.rows!);
    const tex = u.uDiskRows.value!;
    const data = tex.image.data as Float32Array;
    for (let j = 0; j < ORBIT_ROWS; j++) {
      data[4 * j] = t.b[j];
      data[4 * j + 1] = t.psiEnd[j];
      data[4 * j + 2] = s.rows![j];
      data[4 * j + 3] = 0;
    }
    tex.needsUpdate = true;
    s.builtR = r;
  }
  // cot α_e of the shadow's edge, from float64: (r − 3)√(r + 6) / (b_c √(r − 2))
  u.uDiskGeom.value.set(((r - 3) * Math.sqrt(r + 6)) / (BC * Math.sqrt(r - 2)), disk.rInM, disk.rOutM, disk.lnTStarK);
  const n = disk.normalWorld;
  u.uDiskNormal.value.set(n[0], n[1], n[2]);
  xAxis.set(Math.abs(n[1]) < 0.9 ? 0 : 1, Math.abs(n[1]) < 0.9 ? 1 : 0, 0).cross(u.uDiskNormal.value).normalize();
  u.uDiskX.value.copy(xAxis);
  u.uDiskY.value.crossVectors(u.uDiskNormal.value, xAxis);
  // The share of the view, the spot exposure and the view's.
  s.boxAngle = diskImageAngle(r, disk.rOutM);
  // (a little wider: the lens moves the edge's image outwards)
  lensBoxExtra.angle = Math.min(Math.PI, 1.05 * s.boxAngle);
  const px = s.boxAngle * f.pxPerRad;
  const x = Math.min(1, Math.max(0, (Math.log(px) - Math.log(DISK_SHARE_PX[0])) / (Math.log(DISK_SHARE_PX[1]) - Math.log(DISK_SHARE_PX[0]))));
  s.share = x * x * (3 - 2 * x);
  // The disc's axis against the line from the hole to the camera: how nearly its gas can come towards the camera.
  const cosI = -(n[0] * f.axis.x + n[1] * f.axis.y + n[2] * f.axis.z);
  const sinI = Math.sqrt(Math.max(0, 1 - cosI * cosI));
  const lnPeak = diskPeakLnT(disk, r, f.lnG, f.pxPerRad, sinI);
  s.lnSpot = diskSpotExposure(disk, r, f.lnG, f.pxPerRad, sinI);
  const lnShare = s.share > 0 ? Math.log(s.share) : -100;
  if (f.light === 'all') {
    // All its light is not light the eye sees: the disc is drawn on its own scale, its peak's (g T)⁴ at DISK_KEY_ALL
    // with the contrast γ, and the view keeps the exposure the sky and the stars call for (a camera exposed for the
    // disc's visible glare would show no stars).
    u.uDiskLight.value.set(1, Math.log(DISK_KEY_ALL) - DISK_CONTRAST * 4 * lnPeak + lnShare, DISK_CONTRAST);
    // The companion star, drawn through the lens beside the disc, keeps its brightness relative to the disc's visible
    // light (a 31,000 K surface is some 60 times fainter in visible light than the disc's peak): at the disc's spot
    // exposure, as far as the disc fills the view.
    u.uDiskStarLnE.value = f.lnExposure + s.share * (Math.min(f.lnExposure, s.lnSpot) - f.lnExposure);
  } else {
    // Its visible light: at its spot exposure, or dimmer with the view, which stops down for it.
    const lnFade = Math.min(f.lnExposure, s.lnSpot) - s.lnSpot + lnShare;
    u.uDiskLight.value.set(0, LN_SUN + s.lnSpot + lnFade, 1);
    u.uDiskStarLnE.value = f.lnExposure;
  }
  const target = f.light === 'all' ? 0 : s.share * Math.min(0, s.lnSpot);
  s.lnExposure += (target - s.lnExposure) * DISK_EXPOSURE_ADAPT;
  if (Math.abs(target - s.lnExposure) < 1e-4) s.lnExposure = target;
  // The swirl's clock: real seconds slowed down, in the hole's coordinate time as the hovering camera sees it go.
  const mS = f.mKm / 299792.458;
  s.period = DISK_SWIRL_ORBITS * 2 * Math.PI * disk.rInM ** 1.5;
  s.tau = (s.tau + f.dt / disk.slowdown / mS / Math.sqrt(1 - 2 / r)) % s.period;
  const tA = s.tau;
  const tB = (s.tau + 0.5 * s.period) % s.period;
  u.uDiskSwirl.value.set(tA, tB, 1 - Math.abs((2 * tA) / s.period - 1), DISK_SWIRL_AMPLITUDE);
  u.uDiskOn.value = s.share > 0 ? 1 : 0;
}
