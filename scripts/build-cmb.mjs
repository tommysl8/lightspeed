// Builds the cosmic microwave background sky textures from the WMAP nine-year ILC map.
//
// Source: WMAP 9-year Internal Linear Combination (ILC) map, wmap_ilc_9yr_v5.fits, from NASA's
// LAMBDA archive (https://lambda.gsfc.nasa.gov/product/wmap/dr5/ilc_map_get.html). HEALPix,
// NESTED ordering, Nside = 512, galactic coordinates, 1 degree resolution, temperature in mK
// (thermodynamic), monopole and dipole removed. Bennett et al. 2013, ApJS 208, 20.
// Licence: NASA data, public domain. Credit: "NASA / WMAP Science Team".
//
// Input : data-raw/cosmos/wmap_ilc_9yr_v5.fits (25 MB; fetched if missing)
// Output: public/textures/cmb.png       colour, 8-bit palette PNG, 2048 x 1024
//         public/textures/cmb-data.png  8-bit greyscale, 1024 x 512: the linear temperature code, for
//                                       shaders that apply their own colour map (load it as linear
//                                       data, not sRGB). The map has 1 degree resolution, so 1024
//                                       columns (0.35 deg) still sample it at ~3 pixels per beam.
//
// Image layout (both files): equirectangular (plate carree) in galactic coordinates, drawn the way
// CMB maps are published, as seen from inside the sky: the Galactic centre (l = 0, b = 0) is in the
// middle and l increases to the LEFT.
//   pixel column i (0..W-1), row j (0..H-1), centres u = (i + 0.5)/W, v = (j + 0.5)/H
//   l = (180 - 360 u) mod 360 deg,  b = 90 - 180 v deg
// Temperature code (the palette index in cmb.png and the grey level in cmb-data.png):
//   k = clamp(round(127.5 + dT / STEP), 0, 255), STEP = 500/255 uK, so k = 0 is -250 uK and
//   k = 255 is +250 uK; decode dT = (k - 127.5) * STEP. 0.06 % of the sky (HEALPix pixels) lies outside +/-250 uK.
// Colour: Moreland's (2009) cool-warm diverging map, blue (cold) through light grey to red (hot).
// The anisotropies are 1 part in 10^4-10^5 of the 2.7255 K mean: any visible map is contrast
// enhanced by a factor of about 10^4, and the app must label it so.
//
// Run: node scripts/build-cmb.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const SRC = 'data-raw/cosmos/wmap_ilc_9yr_v5.fits';
const URL_SRC = 'https://lambda.gsfc.nasa.gov/data/map/dr5/dfp/ilc/wmap_ilc_9yr_v5.fits';
const SUB = 4; // SUB x SUB samples per output pixel
const RANGE_UK = 250;
const STEP_UK = (2 * RANGE_UK) / 255;

if (!existsSync(SRC)) {
  console.log(`fetching ${URL_SRC}`);
  const res = await fetch(URL_SRC);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  mkdirSync('data-raw/cosmos', { recursive: true });
  writeFileSync(SRC, Buffer.from(await res.arrayBuffer()));
}

// ---- FITS: primary HDU (no data) + BINTABLE with TEMPERATURE (E) and N_OBS (E) ----
const buf = readFileSync(SRC);
let off = 0;
function header() {
  const cards = {};
  for (;;) {
    const block = buf.toString('latin1', off, off + 2880);
    off += 2880;
    for (let k = 0; k < 36; k++) {
      const card = block.slice(k * 80, k * 80 + 80);
      const key = card.slice(0, 8).trim();
      if (key === 'END') return cards;
      if (card[8] === '=') {
        const v = card.slice(10);
        const q = v.match(/^\s*'([^']*)'/);
        cards[key] = q ? q[1].trim() : v.split('/')[0].trim();
      }
    }
  }
}
header(); // primary, NAXIS = 0
const h = header();
if (h.ORDERING !== 'NESTED' || Number(h.NSIDE) !== 512 || h.TTYPE1 !== 'TEMPERATURE') {
  throw new Error('unexpected FITS layout');
}
const NSIDE = Number(h.NSIDE);
const ORDER = Math.log2(NSIDE);
const NPIX = Number(h.NAXIS2);
const ROW = Number(h.NAXIS1);
const temp = new Float32Array(NPIX); // uK
for (let p = 0; p < NPIX; p++) temp[p] = buf.readFloatBE(off + p * ROW) * 1000;

// ---- HEALPix NESTED ang2pix (Gorski et al. 2005; as in healpix_base loc2pix) ----
function spread(v) {
  // interleave the bits of v (< 2^16) with zeros
  v = (v | (v << 8)) & 0x00ff00ff;
  v = (v | (v << 4)) & 0x0f0f0f0f;
  v = (v | (v << 2)) & 0x33333333;
  v = (v | (v << 1)) & 0x55555555;
  return v >>> 0;
}
const xyf2nest = (ix, iy, face) => face * NSIDE * NSIDE + spread(ix) + 2 * spread(iy);
function ang2pixNest(z, phi) {
  const za = Math.abs(z);
  let tt = (phi / (Math.PI / 2)) % 4;
  if (tt < 0) tt += 4;
  if (za <= 2 / 3) {
    const t1 = NSIDE * (0.5 + tt);
    const t2 = NSIDE * (z * 0.75);
    const jp = Math.floor(t1 - t2);
    const jm = Math.floor(t1 + t2);
    const ifp = jp >> ORDER;
    const ifm = jm >> ORDER;
    const face = ifp === ifm ? ifp | 4 : ifp < ifm ? ifp : ifm + 8;
    return xyf2nest(jm & (NSIDE - 1), NSIDE - (jp & (NSIDE - 1)) - 1, face);
  }
  const ntt = Math.min(3, Math.floor(tt));
  const tp = tt - ntt;
  const tmp = NSIDE * Math.sqrt(3 * (1 - za));
  const jp = Math.min(NSIDE - 1, Math.floor(tp * tmp));
  const jm = Math.min(NSIDE - 1, Math.floor((1 - tp) * tmp));
  return z >= 0 ? xyf2nest(NSIDE - jm - 1, NSIDE - jp - 1, ntt) : xyf2nest(jp, jm, ntt + 8);
}

// ---- resample to the equirectangular grid ----
const DEG = Math.PI / 180;
function render(W, H) {
const code = new Uint8Array(W * H);
let clipped = 0;
let sum = 0;
let sum2 = 0;
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    let acc = 0;
    for (let sj = 0; sj < SUB; sj++) {
      const v = (j + (sj + 0.5) / SUB) / H;
      const b = (90 - 180 * v) * DEG;
      const z = Math.sin(b);
      for (let si = 0; si < SUB; si++) {
        const u = (i + (si + 0.5) / SUB) / W;
        const l = (180 - 360 * u) * DEG; // HEALPix phi = l (any 2 pi multiple)
        acc += temp[ang2pixNest(z, l)];
      }
    }
    const t = acc / (SUB * SUB);
    sum += t;
    sum2 += t * t;
    const k = Math.round(127.5 + t / STEP_UK);
    if (k < 0 || k > 255) clipped++;
    code[j * W + i] = Math.max(0, Math.min(255, k));
  }
}
const n = W * H;
return { W, H, code, mean: sum / n, rms: Math.sqrt(sum2 / n - (sum / n) ** 2), clippedFraction: clipped / n };
}

// ---- Moreland (2009) cool-warm diverging colour map, interpolated in Msh space ----
const WHITE = [0.95047, 1.0, 1.08883]; // D65
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgbToMsh([r, g, b]) {
  const R = lin(r / 255);
  const G = lin(g / 255);
  const B = lin(b / 255);
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X / WHITE[0]);
  const fy = f(Y / WHITE[1]);
  const fz = f(Z / WHITE[2]);
  const L = 116 * fy - 16;
  const A = 500 * (fx - fy);
  const Bb = 200 * (fy - fz);
  const M = Math.sqrt(L * L + A * A + Bb * Bb);
  return [M, Math.acos(L / M), Math.atan2(Bb, A)];
}
function mshToRgb([M, s, hh]) {
  const L = M * Math.cos(s);
  const A = M * Math.sin(s) * Math.cos(hh);
  const Bb = M * Math.sin(s) * Math.sin(hh);
  const fy = (L + 16) / 116;
  const fx = fy + A / 500;
  const fz = fy - Bb / 200;
  const finv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = WHITE[0] * finv(fx);
  const Y = WHITE[1] * finv(fy);
  const Z = WHITE[2] * finv(fz);
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [R, G, B].map((c) => Math.round(255 * Math.max(0, Math.min(1, gam(c)))));
}
function adjustHue([M, s, hh], mUnsat) {
  if (M >= mUnsat) return hh;
  const spin = (s * Math.sqrt(mUnsat * mUnsat - M * M)) / (M * Math.sin(s));
  return hh > -Math.PI / 3 ? hh + spin : hh - spin;
}
function coolWarm(x) {
  // x in [0, 1]: 0 = cold end, 1 = hot end
  let m1 = rgbToMsh([59, 76, 192]);
  let m2 = rgbToMsh([180, 4, 38]);
  let t = x;
  const mMid = Math.max(m1[0], m2[0], 88);
  if (t < 0.5) {
    m2 = [mMid, 0, 0];
    t *= 2;
  } else {
    m1 = [mMid, 0, 0];
    t = 2 * t - 1;
  }
  if (m1[1] < 0.05 && m2[1] > 0.05) m1[2] = adjustHue(m2, m1[0]);
  else if (m2[1] < 0.05 && m1[1] > 0.05) m2[2] = adjustHue(m1, m2[0]);
  return mshToRgb([0, 1, 2].map((k) => (1 - t) * m1[k] + t * m2[k]));
}
const palette = Buffer.alloc(256 * 3);
for (let k = 0; k < 256; k++) palette.set(coolWarm(k / 255), 3 * k);

// ---- PNG writer (8-bit, greyscale or palette), adaptive per-row filtering ----
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
function png({ W, H, code: pixels }, colorType, plte, text) {
  const raw = Buffer.alloc((W + 1) * H);
  const prev = new Uint8Array(W);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(W));
  for (let j = 0; j < H; j++) {
    const row = pixels.subarray(j * W, (j + 1) * W);
    const up = j > 0 ? pixels.subarray((j - 1) * W, j * W) : prev;
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let score = 0;
      for (let i = 0; i < W; i++) {
        const a = i > 0 ? row[i - 1] : 0;
        const b = up[i];
        const c = i > 0 ? up[i - 1] : 0;
        let p;
        if (f === 0) p = 0;
        else if (f === 1) p = a;
        else if (f === 2) p = b;
        else if (f === 3) p = (a + b) >> 1;
        else {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const d = (row[i] - p) & 255;
        out[i] = d;
        score += d < 128 ? d : 256 - d;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    raw[j * (W + 1)] = best;
    raw.set(cand[best], j * (W + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (plte) parts.push(chunk('PLTE', plte));
  for (const [k, v] of Object.entries(text)) parts.push(chunk('tEXt', Buffer.from(`${k}\0${v}`, 'latin1')));
  parts.push(chunk('IDAT', deflateSync(raw, { level: 9, memLevel: 9 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

const TEXT = {
  Title: 'CMB temperature anisotropy, WMAP 9-year ILC map (contrast enhanced)',
  Author: 'NASA / WMAP Science Team',
  Copyright: 'Public domain (NASA). Credit: NASA / WMAP Science Team',
  Description:
    'Equirectangular, galactic coordinates, l = 0 at centre increasing to the left. Code k -> dT = (k - 127.5) * 500/255 microkelvin (clipped at +/-250 uK).',
  Source: 'https://lambda.gsfc.nasa.gov/product/wmap/dr5/ilc_map_get.html',
};
mkdirSync('public/textures', { recursive: true });
const big = render(2048, 1024);
const small = render(1024, 512);
const colour = png(big, 3, palette, TEXT);
const grey = png(small, 0, null, TEXT);
writeFileSync('public/textures/cmb.png', colour);
writeFileSync('public/textures/cmb-data.png', grey);
console.log(
  `cmb.png ${colour.length} bytes, cmb-data.png ${grey.length} bytes; ` +
    `pixel mean ${big.mean.toFixed(2)} uK, rms ${big.rms.toFixed(2)} uK, ` +
    `${(100 * big.clippedFraction).toFixed(3)} % of pixels clipped`,
);
