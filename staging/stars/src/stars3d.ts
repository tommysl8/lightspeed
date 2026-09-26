/**
 * Decoder for public/data/stars3d.bin.gz (magic "LSS3") and public/data/stars3d-extra.bin.gz ("LSX1").
 * The byte layout is specified in staging/stars/stars.md; the writer is scripts/build-stars3d.mjs.
 */

export interface Stars3D {
  /** Number of stars (the Sun is not included). Stars are sorted by apparent V from the Sun, brightest first. */
  count: number;
  /** Epoch of the positions, Julian year TT (2000.0). */
  epochJy: number;
  /** x, y, z per star: parsecs from the Sun at the epoch, J2000 ecliptic axes. float32. */
  positions: Float32Array;
  /** vx, vy, vz per star: heliocentric space velocity, km/s, J2000 ecliptic axes. Zero when unknown (see flags). */
  velocities: Float32Array;
  /** The same velocities as stored: int16 in units of velocityUnitKms (handy for a GPU attribute). */
  velocitiesInt16: Int16Array;
  /** km/s per int16 step of velocitiesInt16. */
  velocityUnitKms: number;
  /** Absolute visual magnitude M_V (Johnson V), not corrected for interstellar extinction. */
  absMag: Float32Array;
  /** Effective (colour) temperature, K, rounded to 10 K; 0 when unknown. */
  teff: Uint16Array;
  /** Bit flags, see the accessors below. */
  flags: Uint16Array;
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
  byteLength: number;
}

function readHeader(buf: ArrayBuffer): Header {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  const version = dv.getUint16(4, true);
  const count = dv.getUint32(8, true);
  const floats: [number, number, number] = [dv.getFloat32(12, true), dv.getFloat32(16, true), dv.getFloat32(20, true)];
  const n = dv.getUint32(24, true);
  const offsets: number[] = [];
  for (let k = 0; k < n; k++) offsets.push(dv.getUint32(28 + 4 * k, true));
  return { magic, version, count, floats, offsets, byteLength: buf.byteLength };
}

/** Undo the byte shuffle: stored byte k of element i sits at k*n + i. Returns a fresh, aligned buffer. */
function unshuffle(buf: ArrayBuffer, offset: number, n: number, width: number): ArrayBuffer {
  const src = new Uint8Array(buf, offset, n * width);
  const out = new Uint8Array(n * width);
  for (let k = 0; k < width; k++) {
    const base = k * n;
    for (let i = 0; i < n; i++) out[i * width + k] = src[base + i];
  }
  return out.buffer;
}

/** Decode an already-decompressed stars3d.bin buffer. */
export function decodeStars3D(buf: ArrayBuffer): Stars3D {
  const h = readHeader(buf);
  if (h.magic !== 'LSS3') throw new Error(`stars3d: bad magic ${h.magic}`);
  if (h.version !== 1) throw new Error(`stars3d: unsupported version ${h.version}`);
  if (h.offsets.length < 5) throw new Error('stars3d: missing sections');
  const n = h.count;
  const positions = new Float32Array(unshuffle(buf, h.offsets[0], 3 * n, 4));
  const velocitiesInt16 = new Int16Array(unshuffle(buf, h.offsets[1], 3 * n, 2));
  const absMagQ = new Int16Array(unshuffle(buf, h.offsets[2], n, 2));
  const teff = new Uint16Array(unshuffle(buf, h.offsets[3], n, 2));
  const flags = new Uint16Array(unshuffle(buf, h.offsets[4], n, 2));
  const [epochJy, velocityUnitKms, absMagUnit] = h.floats;
  const velocities = new Float32Array(3 * n);
  for (let i = 0; i < 3 * n; i++) velocities[i] = velocitiesInt16[i] * velocityUnitKms;
  const absMag = new Float32Array(n);
  for (let i = 0; i < n; i++) absMag[i] = absMagQ[i] * absMagUnit;
  return { count: n, epochJy, positions, velocities, velocitiesInt16, velocityUnitKms, absMag, teff, flags };
}

/** Decode an already-decompressed stars3d-extra.bin buffer. */
export function decodeStars3DExtra(buf: ArrayBuffer): Stars3DExtra {
  const h = readHeader(buf);
  if (h.magic !== 'LSX1') throw new Error(`stars3d-extra: bad magic ${h.magic}`);
  const n = h.count;
  const spectralType = new Uint16Array(unshuffle(buf, h.offsets[0], n, 2));
  const constellation = new Uint8Array(buf.slice(h.offsets[1], h.offsets[1] + n));
  return { count: n, spectralType, constellation };
}

/**
 * Fetch a .gz file from a static host and return the decompressed bytes. Vercel serves .gz files as
 * application/gzip without Content-Encoding, so the browser hands us the gzip stream; if a host did decode it
 * (Content-Encoding: gzip), the gzip magic bytes are gone and the buffer is returned as is.
 */
export async function fetchGzip(url: string, init?: RequestInit): Promise<ArrayBuffer> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const raw = await res.arrayBuffer();
  return gunzipIfNeeded(raw);
}

/** Decompress with DecompressionStream when the buffer starts with the gzip magic bytes 1f 8b. */
export async function gunzipIfNeeded(raw: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(raw, 0, Math.min(2, raw.byteLength));
  if (b.length < 2 || b[0] !== 0x1f || b[1] !== 0x8b) return raw;
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

// ---------------------------------------------------------------------------------------------------------------
// Flags (uint16 per star)
// ---------------------------------------------------------------------------------------------------------------

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
  /** Literature value from systems.json (system members and added stars). */
  Literature: 5,
  /** Other source listed by AT-HYG. */
  Other: 6,
  /**
   * No usable parallax: a prominent star (V <= 4.5, in practice only mu Sagittarii) placed at the largest plausible
   * distance, where its absolute magnitude would be M_V = −10 (as luminous as the brightest known stars). An upper
   * limit, not an estimate.
   */
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
