/**
 * Builds public/textures/faint-stars.png: the light of the star catalogue's stars too faint to be
 * drawn one by one, as a glow in the sky from the Sun.
 *
 * The sky map behind the stars (NASA SVS, public/textures/milkyway-bg*.jpg) is the light of the
 * stars fainter than about V = 11: the brighter ones were left out of it because the app draws
 * them as points. But the app draws only those brighter than the eye's limit (the star field fades
 * out between V = 6 and 7: src/render/shaders/psf.glsl, STAR_MAG_LIMIT = 6.5), so the light of the
 * catalogue's stars from V = 6.5 to its limit (V ≈ 10) was in neither: about an eighth of all the
 * starlight, and more than a third of the glow at high galactic latitudes. This map holds it, in the
 * sky map's projection and encoding, and the shader adds it to the sky map (shaders/milkyway.glsl).
 *
 * Input: public/data/stars3d.bin.gz (the star catalogue: AT-HYG v4.0 with Gaia DR3; CREDITS.md).
 * For each star, V as seen from the Sun (M_V + 5 log10(d / 10 pc), from the file), weighted by
 * smoothstep(6, 7, V): the share of its light the star field does not draw (1 − the fade of
 * psf.glsl, so the two add up to the star's light at every V). Each star's light is spread over the
 * sky as a Gaussian of 1σ = 0.5° (about the scale at which the eye gathers faint light, so a single
 * star makes no dot), summed on the grid, and divided by each texel's solid angle.
 *
 * Output: 1024 × 512 grey PNG, plate carrée in ICRS like the sky map: pixel (i, j), column i from
 * the left and row j from the top, covers RA = 360 (0.5 − (i + 0.5) / W) mod 360°,
 * Dec = 90 − 180 (j + 0.5) / H. Each byte is e · 255 with e = ln(1 + p / P0) / ln(1 + 1 / P0),
 * P0 = 2 × 10⁻⁴, where p is in the sky map's units: 1,790 p is the flux per steradian in V = 0 stars
 * (μ_V = 18.439 − 2.5 log10 p mag/arcsec²; public/textures/milkyway-bg.json).
 *
 * Run: node scripts/build-faint-stars.mjs   (about 10 s; the output is the same byte for byte each run)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, gunzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/textures/faint-stars.png');

export const W = 1024;
export const H = 512;
export const P0 = 2e-4;
export const LN_RANGE = Math.log(1 + 1 / P0);
/** Flux per steradian (V = 0 stars) of p = 1: 10^(−0.4 × 18.439) per square arcsecond. */
export const FLUX_PER_SR = 10 ** (-0.4 * 18.439) * (180 / Math.PI) ** 2 * 3600 ** 2;
/** The star field's fade: stars fade out over V = 6 to 7 (psf.glsl, STAR_MAG_LIMIT ± 0.5). */
export const FADE = [6, 7];
/** The glow's spread, degrees (1σ). */
export const SIGMA_DEG = 0.5;
const DEG = Math.PI / 180;
const EPS = (84381.448 / 3600) * DEG; // obliquity of the J2000 ecliptic

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The catalogue's positions (pc, J2000 ecliptic) and absolute magnitudes (src/sim/stars/catalogue.ts decodeStars3D). */
export function readStars(path = resolve(ROOT, 'public/data/stars3d.bin.gz')) {
  const raw = gunzipSync(readFileSync(path));
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'LSS3') throw new Error(`stars3d: bad magic ${magic}`);
  const n = dv.getUint32(8, true);
  const absMagUnit = dv.getFloat32(20, true);
  const offsets = [];
  for (let k = 0; k < dv.getUint32(24, true) && k < 8; k++) offsets.push(dv.getUint32(28 + 4 * k, true));
  // Sections are byte-shuffled: byte k of element i at k·count + i.
  const unshuffle = (offset, count, width) => {
    const src = new Uint8Array(buf, offset, count * width);
    const out = new Uint8Array(count * width);
    for (let k = 0; k < width; k++) for (let i = 0; i < count; i++) out[i * width + k] = src[k * count + i];
    return out.buffer;
  };
  const positions = new Float32Array(unshuffle(offsets[0], 3 * n, 4));
  const absMag = new Int16Array(unshuffle(offsets[2], n, 2));
  return { count: n, positions, absMag: Float32Array.from(absMag, (m) => m * absMagUnit) };
}

/** The glow map: p per texel (row 0 at the top, as the image), and what went into it. */
export function faintStarMap(stars = readStars()) {
  const flux = new Float64Array(W * H);
  const sigma = SIGMA_DEG * DEG;
  const reach = 3 * sigma;
  const dRow = Math.PI / H;
  const dCol = (2 * Math.PI) / W;
  let used = 0;
  let total = 0;
  const rows = [];
  const weights = [];
  for (let s = 0; s < stars.count; s++) {
    const x = stars.positions[3 * s];
    const y = stars.positions[3 * s + 1];
    const z = stars.positions[3 * s + 2];
    const r = Math.hypot(x, y, z);
    if (!(r > 0)) continue;
    const V = stars.absMag[s] + 5 * Math.log10(r / 10);
    const w = smoothstep(FADE[0], FADE[1], V);
    if (w <= 0) continue;
    const f = w * 10 ** (-0.4 * V);
    // Ecliptic → equatorial (ICRS): a rotation by ε about x.
    const ex = x / r;
    const ey = Math.cos(EPS) * (y / r) - Math.sin(EPS) * (z / r);
    const ez = Math.sin(EPS) * (y / r) + Math.cos(EPS) * (z / r);
    const dec = Math.asin(Math.max(-1, Math.min(1, ez)));
    const ra = Math.atan2(ey, ex);
    // The texels within 3σ, each weighted by the Gaussian of its angle from the star.
    const j0 = Math.max(0, Math.floor((Math.PI / 2 - dec - reach) / dRow));
    const j1 = Math.min(H - 1, Math.floor((Math.PI / 2 - dec + reach) / dRow));
    rows.length = 0;
    weights.length = 0;
    let sum = 0;
    for (let j = j0; j <= j1; j++) {
      const dj = Math.PI / 2 - (j + 0.5) * dRow;
      const cosDj = Math.cos(dj);
      const span = cosDj < Math.sin(reach) ? Math.PI : Math.asin(Math.min(1, Math.sin(reach) / Math.max(cosDj, 1e-9)));
      // Column of the star's RA (RA increases to the left: u = 0.5 − RA / 2π).
      const u = (((0.5 - ra / (2 * Math.PI)) % 1) + 1) % 1;
      const ic = u * W - 0.5;
      const half = Math.min(W / 2, Math.ceil(span / dCol) + 1);
      for (let di = -half; di <= half; di++) {
        const i = (((Math.round(ic) + di) % W) + W) % W;
        const ai = Math.PI - ((i + 0.5) / W) * 2 * Math.PI; // RA of the column, wrapped
        const c = Math.sin(dec) * Math.sin(dj) + Math.cos(dec) * cosDj * Math.cos(ai - ra);
        const th = Math.acos(Math.max(-1, Math.min(1, c)));
        if (th > reach) continue;
        // Weighted by the texel's solid angle too, so the light is spread evenly over the sky.
        const g = Math.exp((-0.5 * th * th) / (sigma * sigma)) * cosDj;
        rows.push(j * W + i);
        weights.push(g);
        sum += g;
      }
    }
    if (sum <= 0) continue;
    for (let k = 0; k < rows.length; k++) flux[rows[k]] += (f * weights[k]) / sum;
    used++;
    total += f;
  }
  const p = new Float64Array(W * H);
  for (let j = 0; j < H; j++) {
    const omega = dCol * dRow * Math.cos(Math.PI / 2 - (j + 0.5) * dRow);
    for (let i = 0; i < W; i++) p[j * W + i] = flux[j * W + i] / omega / FLUX_PER_SR;
  }
  return { p, used, total };
}

/** p → the sky map's 8-bit log encoding. */
export const encode = (p) => Math.max(0, Math.min(255, Math.round((Math.log(1 + p / P0) / LN_RANGE) * 255)));

/** A grey 8-bit PNG (each row filtered with Up). */
export function png(bytes, w, h) {
  const rows = Buffer.alloc((w + 1) * h);
  for (let j = 0; j < h; j++) {
    rows[j * (w + 1)] = 2;
    for (let i = 0; i < w; i++) rows[j * (w + 1) + 1 + i] = (bytes[j * w + i] - (j > 0 ? bytes[(j - 1) * w + i] : 0)) & 255;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grey
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function main() {
  const t0 = Date.now();
  const { p, used, total } = faintStarMap();
  const bytes = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) bytes[k] = encode(p[k]);
  const out = png(bytes, W, H);
  writeFileSync(OUT, out);
  let maxP = 0;
  for (const v of p) maxP = Math.max(maxP, v);
  console.log(`${used} stars, their light that of ${total.toFixed(1)} stars of V = 0; brightest texel p = ${maxP.toExponential(3)}; ${out.length} bytes; ${Date.now() - t0} ms`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
