/**
 * The 3D star catalogue: decoders for public/data/stars3d.bin.gz (magic "LSS3"), its bright
 * subset stars3d-bright.bin.gz (the same layout, the first stars only) and
 * stars3d-extra.bin.gz ("LSX1"), and the accessors of the per-star flags. The byte layout is in
 * docs/data/stars.md §3; the writers are scripts/build-stars3d.mjs and
 * scripts/build-stars3d-bright.mjs.
 *
 * Positions are parsecs from the Sun at J2000, J2000 ecliptic axes (x to the equinox, z to the
 * ecliptic pole), as the files store them; the app's world axes are (x, z, −y) of that. Stars
 * are sorted by apparent V seen from the Sun at J2000, brightest first, so the first k stars
 * are the k brightest in the sky.
 */

import type { NearSunCounts } from './visibility';

export interface Stars3D {
  /** Number of stars (the Sun is not included). */
  count: number;
  /** Epoch of the positions, Julian year TT (2000.0). */
  epochJy: number;
  /** x, y, z per star: parsecs from the Sun at the epoch, J2000 ecliptic axes. */
  positions: Float32Array;
  /** vx, vy, vz per star as stored: int16 steps of velocityUnitKms, heliocentric, ecliptic axes. Zero when unknown (see flags). */
  velocitiesInt16: Int16Array;
  /** km/s per int16 step of velocitiesInt16 (0.1). */
  velocityUnitKms: number;
  /** Absolute visual magnitude M_V as stored: int16 steps of absMagUnit (0.01 mag). */
  absMagInt16: Int16Array;
  /** Magnitudes per int16 step of absMagInt16 (0.01). */
  absMagUnit: number;
  /** Absolute visual magnitude M_V (Johnson V), not corrected for interstellar extinction. */
  absMag: Float32Array;
  /** Colour (or literature effective) temperature, K, rounded to 10 K; 0 when unknown. */
  teff: Uint16Array;
  /** Bit flags, see the accessors below. */
  flags: Uint16Array;
  /** How many of the first stars can be seen from near the Sun (visibility.ts; the loader sets it, for drawing). */
  nearSun?: NearSunCounts;
  /**
   * Stars whose `teff` is not their own but their companion's (borrowCompanionTemperatures;
   * the loader sets it), ascending.
   */
  teffBorrowed?: Int32Array;
}

export interface Stars3DExtra {
  count: number;
  /** Index into star-names.json `spectralTypes` (0 = none). */
  spectralType: Uint16Array;
  /** 1-based index into star-names.json `constellations` (IAU constellation containing the star), 0 = unknown. */
  constellation: Uint8Array;
}

interface Header {
  magic: string;
  version: number;
  count: number;
  floats: [number, number, number];
  offsets: number[];
}

function readHeader(buf: ArrayBuffer): Header {
  if (buf.byteLength < 64) throw new Error('stars3d: file too short');
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  const version = dv.getUint16(4, true);
  const count = dv.getUint32(8, true);
  const floats: [number, number, number] = [dv.getFloat32(12, true), dv.getFloat32(16, true), dv.getFloat32(20, true)];
  const n = dv.getUint32(24, true);
  const offsets: number[] = [];
  for (let k = 0; k < n && k < 8; k++) offsets.push(dv.getUint32(28 + 4 * k, true));
  return { magic, version, count, floats, offsets };
}

/** Undo the byte shuffle (byte k of element i is stored at k·n + i) into a fresh, aligned buffer. */
function unshuffle(buf: ArrayBuffer, offset: number, n: number, width: number): ArrayBuffer {
  if (offset + n * width > buf.byteLength) throw new Error('stars3d: section runs past the end of the file');
  const src = new Uint8Array(buf, offset, n * width);
  const out = new Uint8Array(n * width);
  for (let k = 0; k < width; k++) {
    const base = k * n;
    for (let i = 0; i < n; i++) out[i * width + k] = src[base + i];
  }
  return out.buffer;
}

/** Decode an already-decompressed stars3d.bin (or its bright subset). */
export function decodeStars3D(buf: ArrayBuffer): Stars3D {
  const h = readHeader(buf);
  if (h.magic !== 'LSS3') throw new Error(`stars3d: bad magic ${h.magic}`);
  if (h.version !== 1) throw new Error(`stars3d: unsupported version ${h.version}`);
  if (h.offsets.length < 5) throw new Error('stars3d: missing sections');
  const n = h.count;
  const positions = new Float32Array(unshuffle(buf, h.offsets[0], 3 * n, 4));
  const velocitiesInt16 = new Int16Array(unshuffle(buf, h.offsets[1], 3 * n, 2));
  const absMagInt16 = new Int16Array(unshuffle(buf, h.offsets[2], n, 2));
  const teff = new Uint16Array(unshuffle(buf, h.offsets[3], n, 2));
  const flags = new Uint16Array(unshuffle(buf, h.offsets[4], n, 2));
  const [epochJy, velocityUnitKms, absMagUnit] = h.floats;
  const absMag = new Float32Array(n);
  for (let i = 0; i < n; i++) absMag[i] = absMagInt16[i] * absMagUnit;
  return { count: n, epochJy, positions, velocitiesInt16, velocityUnitKms, absMagInt16, absMagUnit, absMag, teff, flags };
}

/** Decode an already-decompressed stars3d-extra.bin. */
export function decodeStars3DExtra(buf: ArrayBuffer): Stars3DExtra {
  const h = readHeader(buf);
  if (h.magic !== 'LSX1') throw new Error(`stars3d-extra: bad magic ${h.magic}`);
  const n = h.count;
  const spectralType = new Uint16Array(unshuffle(buf, h.offsets[0], n, 2));
  const constellation = new Uint8Array(buf.slice(h.offsets[1], h.offsets[1] + n));
  return { count: n, spectralType, constellation };
}

/** The typed arrays of a catalogue, for handing it between threads without copying. */
export function stars3DTransfer(s: Stars3D): ArrayBuffer[] {
  const out = [s.positions.buffer, s.velocitiesInt16.buffer, s.absMagInt16.buffer, s.absMag.buffer, s.teff.buffer, s.flags.buffer] as ArrayBuffer[];
  if (s.teffBorrowed) out.push(s.teffBorrowed.buffer as ArrayBuffer);
  return out;
}

/** A star with no temperature takes that of a star closer than this, pc (about 1,000 au): its companion. */
export const COMPANION_PC = 0.005;
/** Stars searched (brightest first): every one that can show from near the Sun, and a margin. */
const COMPANION_SCAN = 20_000;

/**
 * Give each star with no temperature of its own the temperature of the star it pairs with, so it
 * is not drawn at the Sun's 5,772 K. Such stars are companions whose light the catalogue split
 * from their primary's (Mintaka B, Hadar B, Algieba B): the pair's colour is the best measure
 * there is, though a companion can differ from its primary (the card says the temperature is
 * borrowed). Among the first 20,000 stars, where it shows; a few milliseconds, in the worker.
 * Sets `teffBorrowed`, and returns it.
 */
export function borrowCompanionTemperatures(s: Stars3D): Int32Array {
  const P = s.positions;
  const T = s.teff;
  const n = Math.min(s.count, COMPANION_SCAN);
  const r2 = COMPANION_PC * COMPANION_PC;
  const borrowed: number[] = [];
  for (let i = 0; i < n; i++) {
    if (T[i] !== 0) continue;
    const x = P[3 * i];
    const y = P[3 * i + 1];
    const z = P[3 * i + 2];
    let best = -1;
    let bestD = r2;
    for (let k = 0; k < n; k++) {
      if (k === i || T[k] === 0) continue;
      const dx = P[3 * k] - x;
      const dy = P[3 * k + 1] - y;
      const dz = P[3 * k + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) borrowed.push(i);
    if (best >= 0) T[i] = T[best];
  }
  s.teffBorrowed = Int32Array.from(borrowed);
  return s.teffBorrowed;
}

/** Whether star i's temperature is its companion's (borrowCompanionTemperatures). */
export function teffIsBorrowed(s: Stars3D, i: number): boolean {
  const b = s.teffBorrowed;
  if (!b) return false;
  let lo = 0;
  let hi = b.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (b[mid] < i) lo = mid + 1;
    else hi = mid;
  }
  return lo < b.length && b[lo] === i;
}

/**
 * Fetch a .gz file from a static host and return the decompressed bytes. Vercel serves .gz files
 * as application/gzip without Content-Encoding, so the browser hands over the gzip stream; if a
 * host did decode it on the way (Content-Encoding: gzip), the magic bytes are gone and the buffer
 * is returned as it is.
 */
export async function fetchGzip(url: string, init?: RequestInit): Promise<ArrayBuffer> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return gunzipIfNeeded(await res.arrayBuffer());
}

/** Decompress with DecompressionStream when the buffer starts with the gzip magic bytes 1f 8b. */
export async function gunzipIfNeeded(raw: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(raw, 0, Math.min(2, raw.byteLength));
  if (b.length < 2 || b[0] !== 0x1f || b[1] !== 0x8b) return raw;
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

// ─── Flags (uint16 per star) ─────────────────────────────────────────────────────────────

/** Where the distance comes from (bits 0–2). */
export const DistanceSource = {
  /** Gaia DR3 parallax corrected with the Lindegren et al. (2021) zero-point for its magnitude, colour and position. */
  GaiaDR3: 0,
  /** Gaia DR3 parallax, zero-point outside the recipe's validity (mostly G < 6) or the global −0.017 mas. */
  GaiaDR3Approx: 1,
  /** Gaia DR2 parallax corrected by the DR2 global zero-point (−0.029 mas). */
  GaiaDR2: 2,
  /** Hipparcos new reduction (van Leeuwen 2007). */
  Hipparcos: 3,
  /** Gliese–Jahreiß catalogue (via AT-HYG). */
  Gliese: 4,
  /** Literature value (systems.json: system members and added stars). */
  Literature: 5,
  /** Other source listed by AT-HYG. */
  Other: 6,
  /** No usable parallax: placed where M_V would be −10 (μ Sagittarii only). An upper limit, not an estimate. */
  Capped: 7,
} as const;

/** Relative distance uncertainty class (bits 3–4). */
export const DistancePrecision = { Under1Pct: 0, Under5Pct: 1, Under20Pct: 2, Poor: 3 } as const;

/** Velocity status (bits 5–6). */
export const VelocityStatus = {
  /** Proper motion and radial velocity known: full 3D space velocity. */
  Full: 0,
  /** Proper motion only; the radial velocity is unknown and set to 0, so motion along the line of sight is missing. */
  NoRadialVelocity: 1,
  /** No usable proper motion; velocity set to 0. */
  Unknown: 2,
  /** Rejected as implausible (> 1000 km/s, a symptom of a bad parallax); velocity set to 0. */
  Rejected: 3,
} as const;

/** Colour / temperature source (bits 8–9). */
export const ColourSource = {
  /** Johnson B−V from ground-based photometry (Hipparcos Catalogue or Gliese) → Ballesteros (2012). */
  JohnsonBV: 0,
  /** Tycho BT−VT converted to Johnson B−V (or Hipparcos B−V derived from Tycho) → Ballesteros (2012). */
  TychoBV: 1,
  /** No colour: B−V of the spectral type's main-sequence value (Pecaut & Mamajek 2013). */
  SpectralType: 2,
  /** Effective temperature from the literature (systems.json); or unknown when teff = 0. */
  Literature: 3,
} as const;

export const distanceSource = (f: number): number => f & 7;
export const distancePrecision = (f: number): number => (f >> 3) & 3;
export const velocityStatus = (f: number): number => (f >> 5) & 3;
/** Radial velocity from Gaia DR3 (corrected per Katz et al. 2023 / Blomme et al. 2023). */
export const hasGaiaRadialVelocity = (f: number): boolean => (f & (1 << 7)) !== 0;
export const colourSource = (f: number): number => (f >> 8) & 3;
/** The star has an entry in systems.json (orbit and/or literature radius, temperature, mass). */
export const inSystems = (f: number): boolean => (f & (1 << 10)) !== 0;
/** Gaia RUWE > 1.4: the astrometry is probably perturbed by an unresolved companion. */
export const ruweHigh = (f: number): boolean => (f & (1 << 11)) !== 0;
/** V was corrected for a companion inside Hipparcos' combined photometry. */
export const photometrySplit = (f: number): boolean => (f & (1 << 12)) !== 0;
export const isVariable = (f: number): boolean => (f & (1 << 13)) !== 0;
/** Added from the literature (not in AT-HYG), e.g. TRAPPIST-1. */
export const isAdded = (f: number): boolean => (f & (1 << 14)) !== 0;
/** V from Tycho-2 photometry transformed to Johnson V (otherwise Johnson V from Hipparcos, Gliese or literature). */
export const vFromTycho = (f: number): boolean => (f & (1 << 15)) !== 0;

/** Where a star's distance comes from, in words, for the card and the data sheet. */
export const DISTANCE_SOURCE_TEXT: Record<number, string> = {
  0: 'Gaia DR3 parallax, zero-point corrected',
  1: 'Gaia DR3 parallax, approximate zero-point',
  2: 'Gaia DR2 parallax',
  3: 'Hipparcos parallax (new reduction)',
  4: 'Gliese–Jahreiß catalogue',
  5: 'the published model of its system',
  6: 'AT-HYG catalogue',
  7: 'no usable parallax: an upper limit',
};

/** How precise a star's distance is, in words. */
export const DISTANCE_PRECISION_TEXT: Record<number, string> = {
  0: 'better than 1%',
  1: '1–5%',
  2: '5–20%',
  3: 'poor (20% or worse): indicative only',
};

/** A star's velocity, in words (null when it is fully known). */
export function velocityNote(f: number): string | null {
  switch (velocityStatus(f)) {
    case VelocityStatus.NoRadialVelocity:
      return 'No radial velocity is known: its motion along the line of sight is left out.';
    case VelocityStatus.Unknown:
      return 'No proper motion is known: it is held at its J2000 place.';
    case VelocityStatus.Rejected:
      return 'Its catalogue velocity was implausible and is not used: it is held at its J2000 place.';
    default:
      return null;
  }
}
