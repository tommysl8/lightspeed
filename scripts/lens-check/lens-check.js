/**
 * The GPU checks of the black hole's lens, run in a tab of the development server against the
 * references scripts/lens-check/reference.py wrote into scripts/lens-check/ref/.
 *
 * What each check does (every result carries the canvas, pixel ratio, rung and time it was taken at):
 *   maps         the 8 fixture cameras through the real lens chunk (__ls.lensTest.cameraMap) against
 *                ref/camera-maps.json: every captured flag the same except within 1e-6 rad of the edge; the
 *                escape direction's error as an equivalent look angle (the error along the sweep divided by
 *                d(dphi)/d(theta), across it by sin(dphi)/sin(theta)) at most 0.006 px at 1,484 px/rad; ln g
 *                within 1e-5, or, where the raindrop's ln g changes faster than a float32 look direction can
 *                hold it (towards g → ∞ inside the horizon), within the look angle of 0.006 px. Also tells a map
 *                read back bottom row first from one that is simply wrong. (The per-vertex second run is
 *                lensTest.pointImagesCheck().)
 *   pictures     each view of ref/views/cameras.json rendered by the app at 360 × 240 (debug sky 1, the
 *                checkerboard; debug sky 3, ln g in false colour) against the Python pictures: at least 99.5 % of
 *                the pixels farther than 1 px from a class boundary in the same class, ln g within 0.005 on
 *                average (debug sky 3 read back as half floats from the lens passes, and as floats through the chunk
 *                alone; the 8-bit canvas's own reading, in steps of 0.0059, is reported beside them). The relativistic
 *                view is on, so the moving cameras are seen by their moving observers.
 *   horizon      The views the Learn article quotes: the dark patch ahead 42.10° at the horizon and 53.3° at
 *                0.5 r_s, measured on the app's frame (fixture cameras, and the app's own fall).
 *   continuity   luminance summed over lines and 1-px rings across the lens box's edge at 4,000 au and
 *                1,000 au and across the band's edges at 100 M and 20 M (no step over 1 %); switching the lens
 *                off and on at Gaia BH3 (the clock paused, each frame taken once it has stopped changing) moves
 *                nothing outside the lensed region: the point zone for the stars and glints, the diffuse zone for
 *                the rest (compared again with the point layers hidden), and on again gives the same frame.
 *   fades        the crossfades: the nuclear cluster's points against its glow (45 pc, total light within
 *                5 %), the flow's point against its picture (90–300 au, drawn light within a factor 1.5), a ring of
 *                light taking over from its two images (nothing jumps).
 *   compiles     the in-page half: cold compiles of every program drawn later (__ls.perf.compiles());
 *                `npm run check:shaders` does the headless half and the start-up total.
 *   brightness   the uniform-radiance sky (debug sky 4, read back as floats) at 20 M and 10 M: uniform to
 *                1 % over the box and the band for an observer at rest; in the split view, moving at 0.3c straight
 *                at the hole, the classical half uniform and the relativistic half uniform on every ring.
 *   regressions  the band's early-out in the composite against the composite without it (within 0.1 ms
 *                where no band is drawn); the sky cube drawn once an approach, not while hovering nor in a fall.
 *                (The lens code in the plain passes far from holes is budgets.js's deadLensCode.)
 *
 * How to run, in a tab on http://localhost:5190 (development build, so window.__ls exists):
 *   await import('/scripts/lens-check/lens-check.js');   (or paste this file into the console)
 *   lensCheck.start('maps');  lensCheck.status();        (checks run in the background: a long run outlives a
 *   await lensCheck.run('all');                           console call; start/status poll it)
 *   lensCheck.report();                                  (every result so far as text, for docs/data/blackholes.md §11)
 * In Node, the comparisons checked against the references themselves and against spoiled copies of them (a
 * check that cannot fail is caught): node scripts/lens-check/lens-check.js --self-test
 *
 * Why: the unit tests run in Node with no GPU, and the GPU's own arithmetic (its atan, its
 * float32, its texture filtering) is what these checks are for.
 *
 * Cost: none in the app (a development tool); the full run takes ten minutes or so with the tab busy.
 * Twins: scripts/lens-check/reference.py (the references), src/dev/perf.ts (timing, frames, canvas),
 * src/dev/lensTest.ts (the lens's own hooks), budgets.js (each part's cost), run-budgets.mjs (either of
 * them in a Chrome of its own: node scripts/lens-check/run-budgets.mjs --eval file.js).
 */
(() => {
  'use strict';

  // ─── Constants of the checks ────────────────────────────────────────────────────────────────

  const PX_PER_RAD = 1484; // device px per radian at 1,384 px tall (the target laptop's canvas): the accuracy targets' unit
  const MAP_LOOK_PX = 0.006; // maps: the escape direction as an equivalent look angle
  const MAP_EDGE_RAD = 1e-6; // maps: captured flags may differ this close to the edge
  const MAP_LNG = 1e-5; // maps: ln g
  const F32_FLOOR = 2.4e-7; // a unit vector read back as float32 holds its direction to about this (rad)
  const PIC_SAME = 0.995; // pictures: share of pixels away from boundaries in the same class
  const PIC_LNG_MEAN = 0.005; // pictures: mean |ln g − reference|
  const COLOUR_TOL = 12; // a rendered checkerboard colour within this of the palette's (per channel, 0–255)
  const RING_STEP = 0.01; // continuity: luminance step across a pass's edge
  const UNIFORM = 0.01; // brightness: the uniform sky's spread
  const REF = '/scripts/lens-check/ref/';

  const PALETTE = [
    [230, 90, 80], [240, 180, 60], [90, 180, 90], [70, 150, 220],
    [200, 110, 200], [120, 200, 200], [220, 220, 220], [150, 120, 90],
  ];

  // ─── PNG reading (8-bit RGB/RGBA/grey and 16-bit grey, non-interlaced: what reference.py writes) ──

  async function readPng(bytes, inflate) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let pos = 8;
    let w = 0, h = 0, depth = 0, type = 0;
    const idat = [];
    while (pos < u8.length) {
      const len = dv.getUint32(pos);
      const tag = String.fromCharCode(u8[pos + 4], u8[pos + 5], u8[pos + 6], u8[pos + 7]);
      const data = u8.subarray(pos + 8, pos + 8 + len);
      if (tag === 'IHDR') {
        w = dv.getUint32(pos + 8);
        h = dv.getUint32(pos + 12);
        depth = u8[pos + 16];
        type = u8[pos + 17];
        if (u8[pos + 20] !== 0) throw new Error('interlaced PNG not supported');
      } else if (tag === 'IDAT') idat.push(data);
      else if (tag === 'IEND') break;
      pos += 12 + len;
    }
    const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
    let o = 0;
    for (const d of idat) {
      joined.set(d, o);
      o += d.length;
    }
    const raw = await inflate(joined);
    const channels = type === 2 ? 3 : type === 6 ? 4 : type === 0 ? 1 : 0;
    if (!channels || (depth !== 8 && depth !== 16)) throw new Error(`PNG type ${type}/${depth} not supported`);
    const bpp = (channels * depth) / 8;
    const stride = w * bpp;
    const out = new Uint8Array(h * stride);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)];
      const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      const row = out.subarray(y * stride, (y + 1) * stride);
      const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0;
        const b = prev ? prev[x] : 0;
        const c = prev && x >= bpp ? prev[x - bpp] : 0;
        let v = src[x];
        if (f === 1) v += a;
        else if (f === 2) v += b;
        else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        row[x] = v & 255;
      }
    }
    if (depth === 16) {
      const v = new Uint16Array(w * h * channels);
      for (let i = 0; i < v.length; i++) v[i] = (out[2 * i] << 8) | out[2 * i + 1];
      return { w, h, channels, depth, data: v };
    }
    return { w, h, channels, depth, data: out };
  }

  // ─── Classes of the checkerboard sky ──────────────────────────────────────────────────────────

  /** Palette colours: class 0 captured (black), 1 line (white), 2 + 2k + cell for octant k (cell 1 light, 0 dark). */
  const CLASS_COLOURS = (() => {
    const c = [[0, 0, 0], [255, 255, 255]];
    for (const p of PALETTE) for (const s of [0.55, 1.0]) c.push(p.map((x) => Math.floor(x * s)));
    // order: 2 + 2k + cell, cell 0 dark (0.55), 1 light
    return c;
  })();

  /** The class of a colour (nearest palette colour within `tol` per channel), or −1. */
  function classOfColour(r, g, b, tol = 0) {
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < CLASS_COLOURS.length; k++) {
      const [cr, cg, cb] = CLASS_COLOURS[k];
      const d = Math.max(Math.abs(r - cr), Math.abs(g - cg), Math.abs(b - cb));
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return bestD <= tol ? best : -1;
  }

  /** Classes of an RGB(A) image, top row first. */
  function classesOf(img, tol = 0) {
    const n = img.w * img.h;
    const out = new Int8Array(n);
    const ch = img.channels ?? 4;
    for (let i = 0; i < n; i++) out[i] = classOfColour(img.data[i * ch], img.data[i * ch + 1], img.data[i * ch + 2], tol);
    return out;
  }

  /** The class of an escape direction (as render_views paints it), for maps that come back as directions. */
  function classOfDirection(x, y, z, captured) {
    if (captured) return 0;
    const lat = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI;
    const lon = (Math.atan2(y, x) * 180) / Math.PI;
    const line = Math.abs(((((lat + 15) % 30) + 30) % 30) - 15) < 0.6 || Math.abs(((((lon + 15) % 30) + 30) % 30) - 15) < 0.6;
    if (line) return 1;
    const cell = (Math.floor(lat / 15) + Math.floor(lon / 15)) & 1;
    const octant = (x > 0 ? 1 : 0) + (y > 0 ? 2 : 0) + (z > 0 ? 4 : 0);
    return 2 + 2 * octant + cell;
  }

  /** Pixels within 1 px (8-neighbourhood) of a different class in `cls`. */
  function nearBoundary(cls, w, h) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = cls[y * w + x];
        for (let dy = -1; dy <= 1 && !out[y * w + x]; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx, Y = y + dy;
            if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
            if (cls[Y * w + X] !== c) {
              out[y * w + x] = 1;
              break;
            }
          }
      }
    return out;
  }

  /** The pictures check's class test: the share of reference pixels away from its boundaries whose class the app matches. */
  function compareClasses(ref, got, w, h) {
    const edge = nearBoundary(ref, w, h);
    let eligible = 0, same = 0, unknown = 0;
    for (let i = 0; i < w * h; i++) {
      if (edge[i]) continue;
      eligible++;
      if (got[i] === ref[i]) same++;
      else if (got[i] < 0) unknown++;
    }
    const share = eligible ? same / eligible : NaN;
    return { eligible, same, unknown, share: +share.toFixed(5), pass: share >= PIC_SAME };
  }

  /**
   * ln g from render_views' false colour (blue −1.5, white 0, red +1.5): 8 bits give steps of 0.0059, and the
   * scale stops at ±1.5, so a saturated colour (green 0) says only "beyond": NaN, left out of the comparison.
   */
  function lnGOfColour(r, g, b) {
    if (g === 0) return NaN;
    if (r >= 255 && b < 255) return 1.5 * (1 - b / 255);
    if (b >= 255 && r < 255) return 1.5 * (r / 255 - 1);
    return 0;
  }

  const lnGOf16 = (v, meta) => (v === 0 ? NaN : v / meta.scale - meta.offset);

  /** The pictures check's ln g test: mean |got − ref| over pixels where both have light. */
  function compareLnG(ref, got) {
    let n = 0, sum = 0, max = 0;
    for (let i = 0; i < ref.length; i++) {
      if (!Number.isFinite(ref[i]) || !Number.isFinite(got[i])) continue;
      const d = Math.abs(got[i] - ref[i]);
      n++;
      sum += d;
      if (d > max) max = d;
    }
    const mean = n ? sum / n : NaN;
    return { n, mean: +mean.toFixed(5), max: +max.toFixed(4), pass: mean <= PIC_LNG_MEAN };
  }

  // ─── Camera maps ──────────────────────────────────────────────────────────────────────────────

  /**
   * Compare one camera map. `got.nInf` holds 4 floats a pixel (xyz, w < 0 where captured), `got.lnG` 1 or 4 a
   * pixel, both top row first. Returns counts, the worst errors and whether it passes; `flipped` compares
   * with the rows reversed, to tell a map read bottom row first.
   */
  function compareMap(ref, got, flipped = false) {
    const W = ref.W, H = ref.H, n = W * H;
    const lnStride = got.lnG.length >= 4 * n ? 4 : 1;
    const rhat = norm(ref.pos);
    // In the raindrop's frame ln g = −ln(1 − v cos θ) changes by v sin θ e^(ln g) per radian of look angle: where that
    // is steep (inside the horizon, towards cos θ = 1/v, g → ∞) a float32 look direction alone moves ln g by more
    // than 1e-5, so there the error is also judged as the look angle it is worth (0.006 px, as the directions are).
    const rainV = ref.frame === 'static' ? 0 : Math.sqrt(2 / Math.hypot(ref.pos[0], ref.pos[1], ref.pos[2]));
    let capMismatch = 0, capNearEdge = 0, radialMaxPx = 0, tangMaxPx = 0, tangMaxRad = 0, lnGMax = 0, compared = 0, nan = 0;
    let lnGMaxEscaping = 0, lnGMaxCaptured = 0, lnGOverPx = 0, lnGOver = 0;
    let worst = null;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const g = (flipped ? H - 1 - j : j) * W + i;
        const refCap = ref.captured[k] === 1;
        const gx = got.nInf[4 * g], gy = got.nInf[4 * g + 1], gz = got.nInf[4 * g + 2], gw = got.nInf[4 * g + 3];
        const gotCap = gw < 0;
        if (![gx, gy, gz, gw].every(Number.isFinite)) {
          nan++;
          continue;
        }
        if (refCap !== gotCap) {
          if (Math.abs(ref.theta[k] - ref.edgeRad) < MAP_EDGE_RAD) capNearEdge++;
          else capMismatch++;
          continue;
        }
        const lg = got.lnG[lnStride * g];
        if (ref.lnG[k] !== null && Number.isFinite(lg)) {
          const e = Math.abs(lg - ref.lnG[k]);
          lnGMax = Math.max(lnGMax, e);
          if (refCap) lnGMaxCaptured = Math.max(lnGMaxCaptured, e);
          else lnGMaxEscaping = Math.max(lnGMaxEscaping, e);
          if (e > MAP_LNG) {
            const slope = rainV * Math.sin(ref.theta[k]) * Math.exp(ref.lnG[k]);
            const px = slope > 0 ? (e / slope) * PX_PER_RAD : Infinity;
            lnGOverPx = Math.max(lnGOverPx, px);
            if (!(px <= MAP_LOOK_PX)) lnGOver++;
          }
        }
        if (refCap) continue;
        compared++;
        const r = ref.nInf[k];
        const gl = Math.hypot(gx, gy, gz);
        const a = [gx / gl, gy / gl, gz / gl];
        // Along the sweep (in the plane of the hole and the ray) and across it.
        let wv = cross(rhat, r);
        const wl = Math.hypot(wv[0], wv[1], wv[2]);
        const d = [a[0] - r[0], a[1] - r[1], a[2] - r[2]];
        let radial, across;
        if (wl < 1e-9) {
          radial = Math.hypot(d[0], d[1], d[2]);
          across = 0;
        } else {
          wv = [wv[0] / wl, wv[1] / wl, wv[2] / wl];
          const t = cross(wv, r);
          radial = Math.abs(dot(d, t));
          across = Math.abs(dot(d, wv));
        }
        const slope = Math.abs(ref.dDphiDTheta[k] ?? NaN);
        const rPx = (Number.isFinite(slope) && slope > 0 ? radial / slope : radial) * PX_PER_RAD;
        const sinTh = Math.sin(ref.theta[k]);
        const sinD = Math.abs(Math.sin(dphiOf(rhat, r)));
        // Across the sweep: the ring of directions round the hole is stretched by sin(dphi)/sin(theta); within the
        // float32 floor of the read-back vector no look-angle error is claimed.
        const tRad = across <= F32_FLOOR ? 0 : across * (sinD > 1e-9 ? sinTh / sinD : 1);
        const tPx = tRad * PX_PER_RAD;
        if (rPx > radialMaxPx) {
          radialMaxPx = rPx;
          worst = { i, j, radialRad: radial, slope, theta: ref.theta[k] };
        }
        tangMaxPx = Math.max(tangMaxPx, tPx);
        tangMaxRad = Math.max(tangMaxRad, across);
      }
    const pass = capMismatch === 0 && nan === 0 && radialMaxPx <= MAP_LOOK_PX && tangMaxPx <= MAP_LOOK_PX && lnGOver === 0;
    return {
      name: ref.name,
      pixels: n,
      compared,
      capturedMismatch: capMismatch,
      capturedNearEdge: capNearEdge,
      nonFinite: nan,
      lookAnglePx: { alongMax: +radialMaxPx.toPrecision(3), acrossMax: +tangMaxPx.toPrecision(3) },
      acrossMaxRad: +tangMaxRad.toPrecision(3),
      lnGMax: +lnGMax.toPrecision(3),
      // ln g where light arrives, and along captured rays (used only by the flow in front of the shadow)
      lnGMaxEscaping: +lnGMaxEscaping.toPrecision(3),
      lnGMaxCaptured: +lnGMaxCaptured.toPrecision(3),
      // pixels over 1e-5, and the largest look angle any of them is worth (px)
      lnGOver1e5: { pixels: lnGOver, worthPxMax: lnGOverPx ? +lnGOverPx.toPrecision(3) : 0 },
      worst,
      pass,
    };
  }

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  /** The angle of n from rhat, from chords (never acos of a dot product). */
  const dphiOf = (rhat, n) => 2 * Math.atan2(Math.hypot(n[0] - rhat[0], n[1] - rhat[1], n[2] - rhat[2]), Math.hypot(n[0] + rhat[0], n[1] + rhat[1], n[2] + rhat[2]));

  // ─── Rings (continuity) and uniformity (brightness) ───────────────────────────────────────────

  const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

  /** Mean luminance in 1-px rings about (cx, cy), radii 0…rMax (frame top row first, 4 channels). */
  function ringProfile(frame, cx, cy, rMax) {
    const sum = new Float64Array(rMax + 1);
    const cnt = new Float64Array(rMax + 1);
    for (let y = Math.max(0, Math.floor(cy - rMax)); y <= Math.min(frame.h - 1, Math.ceil(cy + rMax)); y++)
      for (let x = Math.max(0, Math.floor(cx - rMax)); x <= Math.min(frame.w - 1, Math.ceil(cx + rMax)); x++) {
        const r = Math.round(Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
        if (r > rMax) continue;
        sum[r] += lum(frame.data, 4 * (y * frame.w + x));
        cnt[r]++;
      }
    return Array.from(sum, (s, i) => (cnt[i] ? s / cnt[i] : NaN));
  }

  /** The largest step between neighbouring rings within ±3 px of radius r, relative, against the largest elsewhere nearby. */
  function stepAt(profile, r) {
    const rel = (i) => Math.abs(profile[i + 1] - profile[i]) / Math.max(1, 0.5 * (profile[i + 1] + profile[i]));
    let at = 0, around = 0;
    for (let i = Math.max(0, r - 3); i <= Math.min(profile.length - 2, r + 3); i++) at = Math.max(at, rel(i));
    for (let i = Math.max(0, r - 15); i <= Math.min(profile.length - 2, r + 15); i++) if (Math.abs(i - r) > 3) around = Math.max(around, rel(i));
    return { step: +at.toFixed(4), around: +around.toFixed(4), pass: at <= Math.max(RING_STEP, around) };
  }

  /** The spread of luminance over lit pixels: (99th − 1st percentile) / median. */
  function uniformity(frame) {
    const v = [];
    for (let i = 0; i < frame.w * frame.h; i++) {
      const l = lum(frame.data, 4 * i);
      if (l > 0) v.push(l);
    }
    v.sort((a, b) => a - b);
    if (!v.length) return { lit: 0, pass: false };
    const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    const med = q(0.5);
    const spread = (q(0.99) - q(0.01)) / med;
    return { lit: v.length, median: +med.toFixed(2), spread: +spread.toFixed(4), levelStep: +(1 / med).toFixed(4), pass: spread <= Math.max(UNIFORM, 2 / med) };
  }

  /**
   * A pass's circular boundary at radius rb (px) in a ring profile: the step across it less the median of the
   * neighbouring steps (two rings in and out, leaving out those within 1.5 px of the shadow's edge at rEdge, whose own
   * jump is real), relative to the luminance: a step shows, a steep smooth gradient (next to the edge) does not.
   * Pass under 1 %.
   */
  function boundaryStep(profile, rb, rEdge = Infinity) {
    const d = (i) => profile[i + 1] - profile[i];
    const nearEdge = (j) => Math.abs(j + 0.5 - rEdge) <= 1.5;
    let worst = 0;
    for (const i of [Math.round(rb) - 1, Math.round(rb)]) {
      if (i < 2 || i + 3 >= profile.length) continue;
      const nb = [i - 2, i - 1, i + 1, i + 2].filter((j) => !nearEdge(j)).map(d).sort((a, b) => a - b);
      if (!nb.length) continue;
      const m = nb.length % 2 ? nb[nb.length >> 1] : 0.5 * (nb[nb.length / 2 - 1] + nb[nb.length / 2]);
      const excess = Math.abs(d(i) - m) / Math.max(1, 0.5 * (profile[i] + profile[i + 1]));
      worst = Math.max(worst, excess);
    }
    return { atPx: +rb.toFixed(2), excess: +worst.toFixed(4), pass: worst <= RING_STEP };
  }

  /** Pixels that differ by more than `level` (0–255) in any channel. */
  function frameDiff(a, b, level = 2) {
    let over = 0, max = 0;
    const n = Math.min(a.data.length, b.data.length);
    for (let i = 0; i < n; i += 4) {
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
      if (d > level) over++;
      if (d > max) max = d;
    }
    return { share: over / (n / 4), max };
  }

  /**
   * ln g from debug sky 3's false colour read back as half floats (lensTest.debugFrame: the lens passes alone, top row
   * first, as the result is): the whole chain (composite, band, cube) at about 4e-4 in ln g, where the 8-bit frame's
   * steps are 0.0059. Black (captured) and saturated colours give NaN.
   */
  function lnGOfFloatFrame(fr) {
    const out = new Float64Array(fr.w * fr.h);
    for (let y = 0; y < fr.h; y++)
      for (let x = 0; x < fr.w; x++) {
        const i = 4 * (y * fr.w + x);
        const r = fr.data[i], g = fr.data[i + 1], b = fr.data[i + 2];
        out[y * fr.w + x] = !(g > 1e-3) ? NaN : r >= b ? 1.5 * (1 - b) : 1.5 * (r - 1);
      }
    return out;
  }

  const pure = { readPng, classOfColour, classesOf, classOfDirection, nearBoundary, compareClasses, lnGOfColour, lnGOf16, lnGOfFloatFrame, compareLnG, compareMap, ringProfile, stepAt, boundaryStep, uniformity, frameDiff, CLASS_COLOURS };

  // ─── Node: the self-test ────────────────────────────────────────────────────────────────────────

  const isNode = typeof window === 'undefined' && typeof globalThis.process !== 'undefined';
  if (isNode) {
    selfTest().then(
      (ok) => globalThis.process.exit(ok ? 0 : 1),
      (e) => {
        console.error(e);
        globalThis.process.exit(1);
      },
    );
    return;
  }

  async function selfTest() {
    const load = (m) => import(/* @vite-ignore */ m);
    const fs = await load('node:' + 'fs');
    const zlib = await load('node:' + 'zlib');
    const path = await load('node:' + 'path');
    // This file's folder from the command line (import.meta would not parse where the file is pasted as a script).
    const here = path.dirname(path.resolve(globalThis.process.argv[1]));
    const ref = (f) => path.join(here, 'ref', f);
    const inflate = async (b) => new Uint8Array(zlib.inflateSync(b));
    const results = [];
    const expect = (name, ok) => {
      results.push([name, ok]);
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
    };

    // Camera maps: the reference read back as float32 passes; spoiled copies fail.
    const maps = JSON.parse(fs.readFileSync(ref('camera-maps.json'), 'utf8'));
    const asGot = (cam, spoil) => {
      const n = cam.W * cam.H;
      const nInf = new Float32Array(4 * n);
      const lnG = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const v = cam.nInf[k];
        nInf.set(v ? [v[0], v[1], v[2], 1] : [0, 0, 0, -1], 4 * k);
        lnG[k] = cam.lnG[k] ?? NaN;
      }
      spoil?.(nInf, lnG, cam);
      return { nInf, lnG };
    };
    for (const cam of maps.cameras) {
      const r = compareMap(cam, asGot(cam));
      expect(`map ${cam.name}: the reference itself (float32) passes (along ${r.lookAnglePx.alongMax} px, across ${r.lookAnglePx.acrossMax} px)`, r.pass);
    }
    const cam = maps.cameras.find((c) => c.name === 'static-10M');
    const firstEsc = cam.captured.findIndex((c, k) => c === 0 && Math.abs(cam.theta[k] - cam.edgeRad) > 0.05);
    const firstCap = cam.captured.findIndex((c, k) => c === 1 && Math.abs(cam.theta[k] - cam.edgeRad) > 0.05);
    // Rotate one escape direction within its sweep plane by an error worth 0.02 px of look angle.
    const bad = compareMap(cam, asGot(cam, (nInf) => {
      const k = firstEsc;
      const r = cam.nInf[k];
      const rhat = norm(cam.pos);
      const w = norm(cross(rhat, r));
      const t = cross(w, r);
      const e = (0.02 / PX_PER_RAD) * Math.abs(cam.dDphiDTheta[k]);
      nInf.set([r[0] + e * t[0], r[1] + e * t[1], r[2] + e * t[2], 1], 4 * k);
    }));
    expect(`map: a direction 0.02 px off along the sweep fails (${bad.lookAnglePx.alongMax} px)`, !bad.pass && bad.lookAnglePx.alongMax > MAP_LOOK_PX);
    const badCap = compareMap(cam, asGot(cam, (nInf) => nInf.set([0, 0, 0, -1], 4 * firstEsc)));
    expect('map: a captured flag wrong far from the edge fails', !badCap.pass && badCap.capturedMismatch === 1);
    const badCap2 = compareMap(cam, asGot(cam, (nInf) => nInf.set([1, 0, 0, 1], 4 * firstCap)));
    expect('map: light where the reference is captured fails', !badCap2.pass && badCap2.capturedMismatch === 1);
    const badLn = compareMap(cam, asGot(cam, (_, lnG) => (lnG[firstEsc] += 3e-5)));
    expect('map: ln g off by 3e-5 fails', !badLn.pass && badLn.lnGMax > MAP_LNG);
    const moving = maps.cameras.find((c) => c.name === 'moving-10M');
    const flippedGot = asGot(moving, (nInf, lnG) => {
      const W = moving.W, H = moving.H;
      const a = nInf.slice(), b = lnG.slice();
      for (let j = 0; j < H; j++) {
        nInf.set(a.subarray(4 * (H - 1 - j) * W, 4 * (H - j) * W), 4 * j * W);
        lnG.set(b.subarray((H - 1 - j) * W, (H - j) * W), j * W);
      }
    });
    expect('map: rows read bottom first fail as they are and pass flipped', !compareMap(moving, flippedGot).pass && compareMap(moving, flippedGot, true).pass);

    // Pictures: every reference decodes into palette classes; itself passes, shifted by 3 px it fails;
    // the 8-bit false colour of ln g decodes within the tolerance of the 16-bit reference.
    const views = JSON.parse(fs.readFileSync(ref('views/cameras.json'), 'utf8'));
    let floatWorst = 0, floatOk = true;
    for (const v of views.views) {
      const img = await readPng(fs.readFileSync(ref(`views/${v.name}.png`)), inflate);
      const cls = classesOf(img, 0);
      const unknown = cls.filter((c) => c < 0).length;
      const same = compareClasses(cls, cls, img.w, img.h);
      const shifted = new Int8Array(cls.length);
      for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) shifted[y * img.w + x] = cls[y * img.w + Math.min(img.w - 1, x + 3)];
      const moved = compareClasses(cls, shifted, img.w, img.h);
      const lnf = await readPng(fs.readFileSync(ref(`views/${v.name}-lnf.png`)), inflate);
      const l16 = await readPng(fs.readFileSync(ref(`views/${v.name}-lng16.png`)), inflate);
      const refLn = Float64Array.from(l16.data, (x) => lnGOf16(x, views.lng16));
      const fromColour = new Float64Array(refLn.length);
      for (let i = 0; i < refLn.length; i++) fromColour[i] = lnGOfColour(lnf.data[3 * i], lnf.data[3 * i + 1], lnf.data[3 * i + 2]);
      const ln = compareLnG(refLn, fromColour);
      const capturedMatch = cls.every((c, i) => (c === 0) === !Number.isFinite(refLn[i]));
      // debug sky 3 as the lens passes write it (lensDebugShift), read back as floats, top row first
      const asFloat = (shift) => {
        const d = new Float32Array(4 * refLn.length);
        for (let y = 0; y < img.h; y++)
          for (let x = 0; x < img.w; x++) {
            const v = refLn[y * img.w + x] + shift;
            const o = 4 * (y * img.w + x);
            if (!Number.isFinite(v)) continue;
            const z = Math.max(-1, Math.min(1, v / 1.5));
            d.set([z > 0 ? 1 : 1 + z, 1 - Math.abs(z), z < 0 ? 1 : 1 - z, 1], o);
          }
        return { w: img.w, h: img.h, data: d };
      };
      const lnFloat = compareLnG(refLn, lnGOfFloatFrame(asFloat(0)));
      const lnFloatOff = compareLnG(refLn, lnGOfFloatFrame(asFloat(0.006)));
      floatWorst = Math.max(floatWorst, lnFloat.mean);
      if (lnFloatOff.pass) floatOk = false;
      expect(`view ${v.name}: classes decode (${unknown} unknown), itself ${same.share}, shifted 3 px ${moved.share}; ln g from 8-bit colour ${ln.mean}; captured agrees`, unknown === 0 && same.pass && !moved.pass && ln.pass && capturedMatch);
    }

    expect(`pictures: ln g read back as floats decodes every view (worst mean ${floatWorst.toExponential(1)}) and 0.006 off fails`, floatOk && floatWorst < 1e-5);

    // Rings and uniformity on synthetic frames.
    const synth = (w, h, f) => {
      const d = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([f(x, y), f(x, y), f(x, y), 255], 4 * (y * w + x));
      return { w, h, data: d };
    };
    const smooth = synth(200, 200, (x, y) => Math.round(100 + 0.3 * Math.hypot(x - 100, y - 100)));
    const stepped = synth(200, 200, (x, y) => Math.round(100 + 0.3 * Math.hypot(x - 100, y - 100) + (Math.hypot(x - 100, y - 100) > 50 ? 4 : 0)));
    expect('rings: a smooth profile passes at r = 50', stepAt(ringProfile(smooth, 100, 100, 90), 50).pass);
    expect('rings: a 4 % step at r = 50 fails', !stepAt(ringProfile(stepped, 100, 100, 90), 50).pass);
    const steep = Array.from({ length: 40 }, (_, i) => 100 + 3 * i);
    expect('band boundary: a steep smooth gradient (3 % a px) passes', boundaryStep(steep, 20.5).pass);
    expect('band boundary: a 2 % step on it fails', !boundaryStep(steep.map((x, i) => (i > 20 ? x + 3.2 : x)), 20.5).pass);
    expect('uniformity: a flat frame passes', uniformity(synth(50, 50, () => 128)).pass);
    expect('uniformity: a 5 % gradient fails', !uniformity(synth(50, 50, (x) => Math.round(122 + (12 * x) / 49))).pass);

    const failed = results.filter(([, ok]) => !ok).length;
    console.log(`${results.length - failed} of ${results.length} self-checks passed`);
    return failed === 0;
  }

  // ─── The browser: the checks against the running app ─────────────────────────────────────────

  const W = window;
  const inflateBrowser = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const fetchJson = async (f) => (await fetch(REF + f)).json();
  const fetchPng = async (f) => readPng(new Uint8Array(await (await fetch(REF + f)).arrayBuffer()), inflateBrowser);
  const results = [];
  const jobs = {};

  function env() {
    const ls = W.__ls;
    if (!ls) throw new Error('no window.__ls: open the development build on port 5190');
    return { ls, perf: ls.perf, lensTest: ls.lensTest };
  }

  /** Whether a lens hook is written yet (the stubs throw 'not yet'). */
  async function has(fn, ...args) {
    try {
      await fn(...args);
      return true;
    } catch (e) {
      if (/not yet/.test(String(e?.message ?? e))) return false;
      throw e;
    }
  }

  function record(check, pass, details) {
    const { perf } = env();
    const r = { check, pass, at: new Date().toISOString(), conditions: perf.info(), ...details };
    results.push(r);
    return r;
  }

  /** The frame, top row first. */
  function frameTopFirst() {
    const { perf } = env();
    const f = perf.readFrame();
    const row = f.w * 4;
    const out = new Uint8Array(f.data.length);
    for (let y = 0; y < f.h; y++) out.set(f.data.subarray((f.h - 1 - y) * row, (f.h - y) * row), y * row);
    return { w: f.w, h: f.h, data: out };
  }

  const fixtureCamera = (c, W_, H_) => ({ frame: c.frame, pos: c.pos, forward: c.forward, up: c.up, fovy: c.fovy, phi: c.phi, vdir: c.vdir, W: W_ ?? c.W, H: H_ ?? c.H });

  async function checkMaps() {
    const { lensTest } = env();
    const maps = await fetchJson('camera-maps.json');
    const out = [];
    for (const cam of maps.cameras) {
      let got;
      try {
        got = await lensTest.cameraMap(fixtureCamera(cam));
      } catch (e) {
        return record('maps', null, { skipped: `lensTest.cameraMap: ${e.message ?? e}` });
      }
      const r = compareMap(cam, got);
      if (!r.pass) {
        const f = compareMap(cam, got, true);
        if (f.pass) r.note = 'passes with the rows reversed: the map comes back bottom row first';
      }
      out.push(r);
    }
    // The second run: the same pixels through the per-vertex path (a source at infinity in each pixel's reference
    // direction, orders 0–3): the image nearest the pixel within 0.01 px.
    let perVertex = null;
    if (typeof lensTest.pointImagesCheck === 'function') {
      const rows = await lensTest.pointImagesCheck();
      perVertex = { rows, pass: rows.every((r) => r.over001 === 0) };
    }
    return record('maps', out.every((r) => r.pass) && perVertex?.pass !== false, { cameras: out, perVertex });
  }

  async function checkPictures() {
    const { ls, perf, lensTest } = env();
    const meta = await fetchJson('views/cameras.json');
    if (!(await has(() => lensTest.debugSky(0)))) return record('pictures', null, { skipped: 'lensTest.debugSky is not available' });
    const out = [];
    const size = await perf.canvasSize(meta.size[0], meta.size[1], 1);
    // The moving cameras are seen by the moving observer: the relativistic view on (a view of perf.view leaves it off).
    const relBefore = ls.ui.getState().relMode;
    ls.ui.setState({ relMode: 'on' });
    try {
      for (const v of meta.views) {
        const cam = fixtureCamera(v, meta.size[0], meta.size[1]);
        lensTest.debugSky(1);
        lensTest.setCamera(cam, 'sgr-a-star');
        const pic = frameTopFirst();
        lensTest.debugSky(3);
        lensTest.setCamera(cam, 'sgr-a-star');
        const lnPic = frameTopFirst();
        const lnFloat = typeof lensTest.debugFrame === 'function' ? lnGOfFloatFrame(await lensTest.debugFrame()) : null;
        const refImg = await fetchPng(`views/${v.name}.png`);
        const refCls = classesOf(refImg, 0);
        const gotCls = classesOf({ ...pic, channels: 4 }, COLOUR_TOL);
        const cls = compareClasses(refCls, gotCls, refImg.w, refImg.h);
        const l16 = await fetchPng(`views/${v.name}-lng16.png`);
        const refLn = Float64Array.from(l16.data, (x) => lnGOf16(x, meta.lng16));
        // ln g from the app's own frame (debug sky 3: the whole chain, 8-bit false colour, |ln g| < 1.5), and as
        // floats through the lens chunk alone (the camera map) where it can give it.
        const fromFrame = new Float64Array(refLn.length);
        for (let i = 0; i < fromFrame.length; i++) fromFrame[i] = lnGOfColour(lnPic.data[4 * i], lnPic.data[4 * i + 1], lnPic.data[4 * i + 2]);
        const lnCanvas = { source: 'debug sky 3 on the canvas (8-bit false colour, steps of 0.0059, |ln g| < 1.5): shown, not judged', ...compareLnG(refLn, fromFrame) };
        const ln = lnFloat ? { source: 'debug sky 3 read back as half floats (the lens passes: composite, band, cube; |ln g| < 1.5)', ...compareLnG(refLn, lnFloat) } : lnCanvas;
        let lnChunk = null;
        try {
          const m = await lensTest.cameraMap(cam);
          const stride = m.lnG.length >= 4 * refLn.length ? 4 : 1;
          lnChunk = { source: 'camera map (float32, the chunk alone)', ...compareLnG(refLn, Float64Array.from({ length: refLn.length }, (_, i) => (m.nInf[4 * i + 3] < 0 ? NaN : m.lnG[stride * i]))) };
        } catch (e) {
          lnChunk = { skipped: String(e?.message ?? e) };
        }
        out.push({ name: v.name, classes: cls, lnG: ln, lnGCanvas: lnFloat ? { mean: lnCanvas.mean, max: lnCanvas.max } : null, lnGChunk: lnChunk, pass: cls.pass && ln.pass && lnChunk.pass !== false });
      }
    } finally {
      lensTest.release();
      ls.ui.setState({ relMode: relBefore });
      await perf.canvasSize(null);
    }
    return record('pictures', out.every((r) => r.pass), { canvas: size, views: out });
  }

  /** A direction (world axes) on the canvas in device px, top row first, or null behind the camera. */
  function project(dir) {
    const { ls, perf } = env();
    const { camera } = perf.scene();
    const q = ls.sim.camera.quat;
    // Rotate by the inverse of the camera's orientation (it looks along its local −z).
    const [x, y, z] = [dir.x, dir.y, dir.z];
    const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    if (lz >= 0) return null;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const cv = document.querySelector('canvas');
    const ndcX = lx / -lz / (t * camera.aspect), ndcY = ly / -lz / t;
    return { x: (0.5 + 0.5 * ndcX) * cv.width, y: (0.5 - 0.5 * ndcY) * cv.height, pxPerRad: cv.height / (2 * t) };
  }

  /** Mean luminance of lines parallel to one edge of a box (device px), at offsets −n…n: the step at 0 against the rest. */
  function edgeSteps(frame, boxPx) {
    const [x0, y0, x1, y1] = boxPx;
    const col = (x) => {
      let s = 0, c = 0;
      for (let y = Math.max(0, Math.ceil(y0)); y < Math.min(frame.h, Math.floor(y1)); y++) {
        s += lum(frame.data, 4 * (y * frame.w + x));
        c++;
      }
      return c ? s / c : NaN;
    };
    const row = (y) => {
      let s = 0, c = 0;
      for (let x = Math.max(0, Math.ceil(x0)); x < Math.min(frame.w, Math.floor(x1)); x++) {
        s += lum(frame.data, 4 * (y * frame.w + x));
        c++;
      }
      return c ? s / c : NaN;
    };
    const out = {};
    for (const [name, at, line, max] of [['left', x0, col, frame.w], ['right', x1, col, frame.w], ['top', y0, row, frame.h], ['bottom', y1, row, frame.h]]) {
      const e = Math.round(at);
      if (e < 9 || e > max - 9) continue; // the edge is off the screen
      const prof = [];
      for (let k = -8; k <= 8; k++) prof.push(line(e + k));
      out[name] = stepAt(prof, 8);
    }
    return out;
  }

  async function checkContinuity() {
    const { ls, perf } = env();
    const out = [];
    // The box's edge far out; the band's edges close in (the flow off: it is the sky's light that must not step).
    for (const view of ['framing', '1000au', '100M', 'hover-20M']) {
      if (view === 'hover-20M') {
        await perf.view('framing');
        ls.ui.setState({ accretionFlow: false });
        const hole = ls.sim.bodies['sgr-a-star'];
        ls.controller.hoverAt('sgr-a-star', 20, ls.sim.camera.pos.clone().sub(hole.pos).normalize());
        await perf.settle(150);
      } else await perf.view(view);
      const lens = ls.lens;
      if (!lens?.active) {
        out.push({ view, skipped: 'no lens drawn' });
        continue;
      }
      // the classical view's lens (view[0]) unless the view is relativistic
      const v = lens.view[ls.relView.active ? 1 : 0];
      const f = frameTopFirst();
      const item = { view };
      if (!v.full) {
        const [bx0, by0, bx1, by1] = v.box;
        item.box = edgeSteps(f, [(0.5 + 0.5 * bx0) * f.w, (0.5 - 0.5 * by1) * f.h, (0.5 + 0.5 * bx1) * f.w, (0.5 - 0.5 * by0) * f.h]);
      }
      const c = project(v.edgeCentre);
      if (c && v.ssBandPx > 0) {
        const rPx = Math.tan(v.edgeRadius) * c.pxPerRad;
        const prof = ringProfile(f, c.x, c.y, Math.ceil(rPx + v.ssBandPx + 20));
        item.edgePx = +rPx.toFixed(2);
        item.bandInner = boundaryStep(prof, rPx - v.ssBandPx - 1, rPx);
        item.bandOuter = boundaryStep(prof, rPx + v.ssBandPx + 1, rPx);
      }
      const parts = [item.box && Object.values(item.box), item.bandInner, item.bandOuter].flat().filter(Boolean);
      item.pass = parts.length ? parts.every((p) => p.pass) : null;
      out.push(item);
    }
    // Lens off and on at Gaia BH3: nothing outside the lensed region moves. The region is the diffuse zone for the
    // light resampled per pixel (the lens moves it there by 0.5 px or more) and the point zone for the stars and glints
    // (lensed per vertex wherever it moves them by 0.02 px or more; docs/data/blackholes.md §10), so the comparison is
    // made twice, with every layer (nothing may move outside the point zone) and with the point layers hidden (nothing
    // may move outside the diffuse zone).
    if (ls.sim.bodies['gaia-bh3']) {
      ls.scenes.runScene('go:gaia-bh3');
      await perf.settle(600);
      // The clock paused: with it running the binary and the stars move between the two frames.
      // Each frame compared only once the view has settled: the star field's bins and candidate lists are built in
      // slices over frames after lensing is switched (sim/stars/lensCandidates.ts, a few ms a frame: a hundred frames
      // or more), so a frame is taken only when 30 more frames leave it unchanged.
      const settled = async () => {
        let prev = frameTopFirst();
        for (let k = 0; k < 40; k++) {
          await perf.settle(30);
          const f = frameTopFirst();
          if (frameDiff(prev, f, 1).share === 0) return { frame: f, frames: 30 * (k + 1) };
          prev = f;
        }
        return { frame: prev, frames: null };
      };
      const onOff = async () => {
        ls.ui.setState({ lensing: true });
        const s0 = await settled();
        ls.ui.setState({ lensing: false });
        const s1 = await settled();
        ls.ui.setState({ lensing: true });
        const s2 = await settled();
        return { on: s0.frame, off: s1.frame, onAgain: s2.frame, frames: [s0.frames, s1.frames, s2.frames] };
      };
      const pausedBefore = ls.sim.paused;
      ls.sim.paused = true;
      const all = await onOff();
      // the zones of the frame drawn (cones in the observer's frame; the point zone is a cone of sources about the
      // axis, and outside the diffuse zone a source is seen within 0.5 px of its own direction)
      const v = ls.lens.view[ls.relView.active ? 1 : 0];
      const zc = [v.zoneCentre.x, v.zoneCentre.y, v.zoneCentre.z];
      const zoneDeg = (Math.acos(Math.max(-1, Math.min(1, v.zoneCos))) * 180) / Math.PI;
      const pointDeg = (ls.lens.pointZoneSrc * 180) / Math.PI;
      const pxDeg = (Math.atan(1 / project(v.zoneCentre)?.pxPerRad || 0) * 180) / Math.PI;
      const POINTS = /The 3D star catalogue|Unresolved bodies drawn as point sources|The ring of light of a body lined up/;
      const hidden = [];
      perf.scene().scene.traverse((o) => {
        const m = o.material;
        if (m && !Array.isArray(m) && POINTS.test((m.vertexShader ?? '') + (m.fragmentShader ?? '')) && o.layers.mask) hidden.push([o, o.layers.mask]);
      });
      hidden.forEach(([o]) => (o.layers.mask = 0));
      let diffuse;
      try {
        diffuse = await onOff();
      } finally {
        hidden.forEach(([o, m]) => (o.layers.mask = m));
      }
      ls.sim.paused = pausedBefore;
      const moved = (a, b, limitDeg) => {
        let n = 0, max = 0;
        for (let y = 0; y < a.h; y++)
          for (let x = 0; x < a.w; x++) {
            const i = 4 * (y * a.w + x);
            const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
            if (d <= 2 || angleDeg(pixelDir(x, y, a.w, a.h), zc) <= limitDeg + 2 * pxDeg) continue;
            n++;
            if (d > max) max = d;
          }
        return { pixels: n, max };
      };
      const stable = [frameDiff(all.on, all.onAgain, 2).share, frameDiff(diffuse.on, diffuse.onAgain, 2).share];
      const outsidePoint = pointDeg >= 180 ? { pixels: 0, max: 0 } : moved(all.on, all.off, pointDeg);
      const outsideDiffuseAll = moved(all.on, all.off, zoneDeg);
      const outsideDiffuseNoPoints = moved(diffuse.on, diffuse.off, zoneDeg);
      out.push({
        view: 'gaia-bh3 lens on/off',
        zoneDeg: +zoneDeg.toFixed(3),
        pointZoneDeg: +pointDeg.toFixed(2),
        outsidePointZone: outsidePoint,
        outsideDiffuseZoneWithPoints: outsideDiffuseAll,
        outsideDiffuseZoneWithoutPoints: outsideDiffuseNoPoints,
        onAgainChangedShare: stable,
        settledAfterFrames: [all.frames, diffuse.frames],
        pass: outsidePoint.pixels === 0 && outsideDiffuseNoPoints.pixels === 0 && stable.every((x) => x === 0),
      });
    } else out.push({ view: 'gaia-bh3 lens on/off', skipped: 'gaia-bh3 not registered' });
    const done = out.filter((r) => r.pass === true || r.pass === false);
    return record('continuity', done.length ? done.every((r) => r.pass) : null, { items: out });
  }

  async function checkCompiles() {
    const { perf } = env();
    const c = await perf.compiles();
    return record('compiles', null, { compiles: c, note: 'npm run check:shaders does the error check and the start-up total on a fresh profile' });
  }

  /**
   * The uniform sky read back as floats (lensTest.debugFrame): the spread of luminance over the uncaptured pixels
   * farther than 1.5 px from the shadow's edge (a pixel across the edge is partly captured), the band's annulus and
   * the rest of the box reported apart; each half of a split view apart.
   */
  function floatUniformity(fr, edgePx, bandPx, splitX) {
    const cx = 0.5 * fr.w, cy = 0.5 * fr.h;
    const parts = { band: [], box: [] };
    const halves = splitX ? [[], []] : null;
    for (let y = 0; y < fr.h; y++)
      for (let x = 0; x < fr.w; x++) {
        const i = 4 * (y * fr.w + x);
        const l = 0.2126 * fr.data[i] + 0.7152 * fr.data[i + 1] + 0.0722 * fr.data[i + 2];
        const rr = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (Math.abs(rr - edgePx) <= 1.5 || rr < edgePx || !(l > 0)) continue;
        (rr <= edgePx + bandPx + 1 ? parts.band : parts.box).push(l);
        if (halves) halves[x < splitX ? 0 : 1].push(l);
      }
    const stats = (v) => {
      if (!v.length) return { n: 0 };
      v.sort((a, b) => a - b);
      const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
      const med = q(0.5);
      return { n: v.length, median: +med.toPrecision(5), spread: +((v[v.length - 1] - v[0]) / med).toPrecision(3), p01p99: +((q(0.99) - q(0.01)) / med).toPrecision(3) };
    };
    const out = { band: stats(parts.band), box: stats(parts.box) };
    if (halves) out.halves = halves.map(stats);
    return out;
  }

  /**
   * The moving half of a split view (debug sky 4, float read-back): the camera moves straight at the hole and looks at
   * it, so everything is symmetric about the screen's centre and the output may depend on the radius alone (the
   * shift, and Y(gT)/Y(T) with it, varies with the angle from the motion). Per 1-px ring of the half: the spread
   * (1st to 99th percentile over the median); and the largest step between neighbouring rings against the step the
   * shift's own gradient makes nearby (a surface-brightness error shows as a ring that is not uniform or a step at a
   * pass's edge).
   */
  function ringUniformity(fr, x0, x1, edgePx) {
    const cx = 0.5 * fr.w, cy = 0.5 * fr.h;
    const rings = new Map();
    for (let y = 0; y < fr.h; y++)
      for (let x = x0; x < x1; x++) {
        const i = 4 * (y * fr.w + x);
        const l = 0.2126 * fr.data[i] + 0.7152 * fr.data[i + 1] + 0.0722 * fr.data[i + 2];
        const rr = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (rr <= edgePx + 1.5 || !(l > 0)) continue;
        const k = Math.round(rr);
        if (!rings.has(k)) rings.set(k, []);
        rings.get(k).push(l);
      }
    let worst = 0, worstAt = 0, n = 0;
    const prof = [];
    for (const [k, v] of [...rings.entries()].sort((a, b) => a[0] - b[0])) {
      if (v.length < 16) continue;
      v.sort((a, b) => a - b);
      const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
      const med = q(0.5);
      const sp = (q(0.99) - q(0.01)) / med;
      n += v.length;
      if (sp > worst) {
        worst = sp;
        worstAt = k;
      }
      prof.push([k, med]);
    }
    // ring-to-ring: the second difference of ln(median) (a step shows; the smooth gradient does not)
    let kink = 0, kinkAt = 0;
    for (let j = 1; j + 1 < prof.length; j++) {
      if (prof[j + 1][0] - prof[j - 1][0] !== 2) continue;
      const d2 = Math.abs(Math.log(prof[j + 1][1]) - 2 * Math.log(prof[j][1]) + Math.log(prof[j - 1][1]));
      if (d2 > kink) {
        kink = d2;
        kinkAt = prof[j][0];
      }
    }
    return { n, rings: prof.length, worstRingSpread: +worst.toPrecision(3), worstRingPx: worstAt, worstKink: +kink.toPrecision(3), worstKinkPx: kinkAt };
  }

  async function checkBrightness() {
    const { ls, lensTest } = env();
    if (!(await has(() => lensTest.debugSky(0)))) return record('brightness', null, { skipped: 'lensTest.debugSky is not available' });
    const out = [];
    const relBefore = ls.ui.getState().relMode;
    const fovy = 50;
    try {
      // (1) the static observer, the classical view: uniform to 1 % over the box and the band
      ls.ui.setState({ relMode: 'off' });
      for (const r of [20, 10]) {
        lensTest.debugSky(4);
        lensTest.setCamera({ frame: 'static', pos: [0, 0, r], forward: [0, 0, -1], up: [0, 1, 0], fovy, phi: 0, vdir: null, W: 0, H: 0 }, 'sgr-a-star');
        ls.step(2);
        const fr = await lensTest.debugFrame();
        const f = fr.h / 2 / Math.tan((fovy * Math.PI) / 360);
        const edgePx = Math.tan(ls.lens.view[0].edgeRadius) * f;
        const u = floatUniformity(fr, edgePx, ls.lens.view[0].ssBandPx || 3, 0);
        const worst = Math.max(u.band.spread ?? 0, u.box.spread ?? 0);
        out.push({ view: 'classical, at rest', rM: r, edgePx: +edgePx.toFixed(1), ...u, worstSpread: worst, pass: worst <= UNIFORM && u.box.n > 0 && u.band.n > 0 });
      }
      // (2) the split view, the camera moving at 0.3c straight at the hole: the classical half (the static observer)
      // uniform, the relativistic half uniform on each ring about the centre and without steps between rings
      ls.ui.setState({ relMode: 'split' });
      for (const r of [20, 10]) {
        lensTest.debugSky(4);
        lensTest.setCamera({ frame: 'static', pos: [0, 0, r], forward: [0, 0, -1], up: [0, 1, 0], fovy, phi: Math.atanh(0.3), vdir: [0, 0, -1], W: 0, H: 0 }, 'sgr-a-star');
        ls.step(2);
        const fr = await lensTest.debugFrame();
        const split = ls.relView.split;
        const xs = Math.round(ls.relView.splitX * fr.w);
        const f = fr.h / 2 / Math.tan((fovy * Math.PI) / 360);
        const edge0 = Math.tan(ls.lens.view[0].edgeRadius) * f;
        const edge1 = Math.tan(ls.lens.view[1].edgeRadius) * f;
        const left = floatUniformity({ ...fr, w: fr.w, data: fr.data }, edge0, ls.lens.view[0].ssBandPx || 3, xs);
        const half0 = left.halves?.[0] ?? { n: 0 };
        const half1 = ringUniformity(fr, xs, fr.w, edge1);
        const pass = split && half0.n > 0 && (half0.spread ?? 1) <= UNIFORM && half1.n > 0 && half1.worstRingSpread <= UNIFORM && half1.worstKink <= UNIFORM;
        out.push({ view: 'split view, 0.3c towards the hole', rM: r, split, splitX: xs, classicalHalf: half0, relativisticHalf: half1, edgePx: [+edge0.toFixed(1), +edge1.toFixed(1)], pass });
      }
    } finally {
      lensTest.release();
      ls.ui.setState({ relMode: relBefore });
    }
    return record('brightness', out.every((r) => r.pass), { items: out, note: 'float read-back (lensTest.debugFrame); pixels within 1.5 px of the shadow edge (partly captured) left out' });
  }

  /**
   * The regressions: (1) the band's early-out compiled into the composite costs nothing where no band is drawn (500
   * au: the box the whole screen, the shadow under a pixel), five interleaved rounds, within 0.1 ms; (2) the sky cube
   * is drawn once an approach (6 faces and a mipmap pass on the way in from 4,000 au to 20 M), not while hovering
   * (600 frames) nor through a fall from 20 M (1,200 frames, to about 4 M). The lens code in the plain passes far
   * from holes, and the plain star program, are budgets.js's deadLensCode and check:shaders' structural check.
   */
  async function checkRegressions() {
    const { ls, perf } = env();
    const out = {};
    await perf.view('500au');
    const band = await perf.ab(() => ls.lensTest.bandCode(true), () => ls.lensTest.bandCode(false), 5);
    ls.lensTest.bandCode(true);
    out.bandCode = { costMs: +(-band.diffMed).toFixed(2), rounds: band.diffs.map((d) => +(-d).toFixed(2)), frame: band.aMed, pass: Math.abs(band.diffMed) <= 0.1 };
    const cubeMod = await import(/* @vite-ignore */ '/src/render/lens/skyCube.ts');
    await perf.view('framing');
    cubeMod.releaseSkyCube();
    const hole = ls.sim.bodies['sgr-a-star'];
    const dirOut = ls.sim.camera.pos.clone().sub(hole.pos).normalize();
    ls.controller.goTo('sgr-a-star', { distance: 20 * ls.gravity.mKm, direction: dirOut });
    const approach = await perf.cubeFaces(900);
    const approachDetail = { ...perf.last.cubeFaces, rM: +ls.gravity.rM.toFixed(3) };
    const hover = await perf.cubeFaces(600);
    const started = ls.fall.startFall({ hole: 'sgr-a-star', r0: ls.gravity.rM, e: 1, dirOut, rate: 'auto' });
    const fallDraws = started.ok ? await perf.cubeFaces(1200) : null;
    const rFall = ls.gravity.rM;
    if (ls.fall.fall.trip) ls.fall.endFall('stopped');
    out.skyCube = { approach, approachDetail, hover, fall: fallDraws, fallReachedM: +rFall.toFixed(2), pass: approach === 6 && approachDetail.mipmapsDrawn && hover === 0 && fallDraws === 0 };
    return record('regressions', out.bandCode.pass && out.skyCube.pass, { items: out });
  }

  /** Pixel (x, y), top row first, of the current frame as a world direction, from the view's camera. */
  function pixelDir(x, y, w, h) {
    const { perf } = env();
    const { camera } = perf.scene();
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const lx = ((2 * (x + 0.5)) / w - 1) * t * (w / h);
    const ly = (1 - (2 * (y + 0.5)) / h) * t;
    const q = env().ls.sim.camera.quat;
    // rotate the camera-space direction (lx, ly, −1) by the camera's orientation
    const v = [lx, ly, -1];
    const [qx, qy, qz, qw] = [q.x, q.y, q.z, q.w];
    const ix = qw * v[0] + qy * v[2] - qz * v[1], iy = qw * v[1] + qz * v[0] - qx * v[2], iz = qw * v[2] + qx * v[1] - qy * v[0], iw = -qx * v[0] - qy * v[1] - qz * v[2];
    return norm([ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]);
  }

  /** The angle between two unit vectors, from chords (never acos of a dot product), in degrees. */
  const angleDeg = (a, b) => (2 * Math.atan2(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), Math.hypot(a[0] + b[0], a[1] + b[1], a[2] + b[2])) * 180) / Math.PI;

  /**
   * Along the frame's centre row: the last black (captured) pixel and the first lit one, and the dark patch's
   * radius about `centre` between them (degrees). Debug sky 1 paints only captured pixels black.
   */
  function edgeOnRow(frame, centre) {
    const y = frame.h >> 1;
    let prev = null;
    const hits = [];
    for (let x = 0; x < frame.w; x++) {
      const i = 4 * (y * frame.w + x);
      const black = classOfColour(frame.data[i], frame.data[i + 1], frame.data[i + 2], COLOUR_TOL) === 0;
      if (prev !== null && black !== prev) hits.push(x);
      prev = black;
    }
    return hits.map((x) => {
      const a = angleDeg(pixelDir(x - 1, y, frame.w, frame.h), centre);
      const b = angleDeg(pixelDir(x, y, frame.w, frame.h), centre);
      return { x, deg: +(0.5 * (a + b)).toFixed(4), pxDeg: +Math.abs(b - a).toFixed(4) };
    });
  }

  /**
   * The views the Learn article quotes: falling from rest far away, the dark patch ahead is
   * arccos(23/31) = 42.10° in radius at the horizon and 53.3° at 0.5 r_s. Measured in the app's own frames (debug
   * sky 1, the canvas at its size and pixel ratio) two ways: a fixture camera at r = 2 M and 1 M in the raindrop's
   * frame, turned so the patch's edge crosses the middle of the screen; and the app's own fall into Sgr A*, stopped
   * just inside the horizon and at 0.5 r_s, looking the same way by the fall's free look.
   */
  async function checkHorizon() {
    const { ls, perf, lensTest } = env();
    if (!(await has(() => lensTest.debugSky(0)))) return record('horizon', null, { skipped: 'lensTest.debugSky is not available' });
    const phys = await import(/* @vite-ignore */ '/src/physics/schwarzschild.ts');
    const expect = (r) => (phys.raindropDarkRadius(r) * 180) / Math.PI;
    const out = [];
    const TOL_DEG = 0.1;
    // (1) fixture cameras
    try {
      for (const [r, quoted] of [[2, (Math.acos(23 / 31) * 180) / Math.PI], [1, 53.3]]) {
        const want = expect(r);
        const a = (want * Math.PI) / 180;
        lensTest.debugSky(1);
        lensTest.setCamera({ frame: 'raindrop', pos: [0, 0, r], forward: [Math.sin(a), 0, -Math.cos(a)], up: [0, 1, 0], fovy: 50, phi: 0, vdir: null, W: 0, H: 0 }, 'sgr-a-star');
        const f = frameTopFirst();
        const edges = edgeOnRow(f, [0, 0, -1]);
        const near = edges.reduce((m, e) => (m && Math.abs(m.deg - want) < Math.abs(e.deg - want) ? m : e), null);
        out.push({ how: 'fixture camera', rM: r, quotedDeg: +quoted.toFixed(2), expectedDeg: +want.toFixed(4), measuredDeg: near?.deg ?? null, pxDeg: near?.pxDeg ?? null, canvas: `${f.w}×${f.h}`, pass: !!near && Math.abs(near.deg - want) <= TOL_DEG && Math.abs(want - quoted) < 0.05 });
      }
    } finally {
      lensTest.release();
    }
    // (2) the app's own fall into Sgr A*, from 20 M
    const ctl = ls.controller;
    try {
      await perf.view('framing');
      const hole = ls.sim.bodies['sgr-a-star'];
      const dirOut = ls.sim.camera.pos.clone().sub(hole.pos).normalize();
      ctl.hoverAt('sgr-a-star', 20, dirOut);
      await perf.settle(30);
      const started = ls.fall.startFall({ hole: 'sgr-a-star', r0: 20, e: 1, dirOut, rate: 'auto' });
      if (!started.ok) throw new Error(`the fall did not start: ${started.reason}`);
      for (const r of [2 * (1 - 1e-4), 1]) {
        const t = ls.fall.fall.trip;
        t.tau = t.model.tauAtR(r);
        const want = () => expect(ls.gravity.rM);
        ctl.lookYaw = 0;
        ctl.lookPitch = 0;
        lensTest.debugSky(1);
        await perf.settle(2);
        ctl.lookYaw = (-want() * Math.PI) / 180;
        ls.step(1);
        const f = frameTopFirst();
        const rNow = ls.gravity.rM;
        const centre = [-dirOut.x, -dirOut.y, -dirOut.z];
        const edges = edgeOnRow(f, centre);
        const w = expect(rNow);
        const near = edges.reduce((m, e) => (m && Math.abs(m.deg - w) < Math.abs(e.deg - w) ? m : e), null);
        out.push({ how: "the app's fall", rM: +rNow.toFixed(5), lensFrame: ls.lens.obs.frame, lensEdgeDeg: +((ls.lens.edge * 180) / Math.PI).toFixed(4), expectedDeg: +w.toFixed(4), measuredDeg: near?.deg ?? null, pxDeg: near?.pxDeg ?? null, canvas: `${f.w}×${f.h}`, pass: !!near && Math.abs(near.deg - w) <= TOL_DEG });
      }
    } catch (e) {
      out.push({ how: "the app's fall", error: String(e?.message ?? e) });
    } finally {
      lensTest.debugSky(0);
      ctl.lookYaw = 0;
      ctl.lookPitch = 0;
      if (ls.fall.fall.trip) ls.fall.endFall('stopped');
    }
    return record('horizon', out.every((r) => r.pass === true), { items: out, toleranceDeg: TOL_DEG });
  }

  // ─── The crossfades: the nuclear cluster's field, the flow's point and image, a ring of light ────────────────────

  /** Luminance summed over a float frame (the scene pass's own light, before bloom and tone mapping). */
  function hdrSum(fr) {
    let s = 0;
    for (let i = 0; i < fr.data.length; i += 4) s += 0.2126 * fr.data[i] + 0.7152 * fr.data[i + 1] + 0.0722 * fr.data[i + 2];
    return s;
  }

  /** Go to Sgr A* at `km` along `dir` (world axes) and wait until the controller orbits it there. */
  async function atSgrA(km, dir) {
    const { ls, perf } = env();
    const hole = ls.sim.bodies['sgr-a-star'];
    ls.controller.goTo('sgr-a-star', { distance: km, direction: dir });
    for (let i = 0; i < 40 && !(ls.controller.mode === 'orbit' && Math.abs(ls.sim.camera.pos.distanceTo(hole.pos) / km - 1) < 1e-3); i++) await perf.settle(60);
    await perf.settle(30);
  }

  /**
   * The nuclear cluster's field against its glow: 45 pc from Sgr A*, where the points hold w = 0.5
   * of their light, the frame drawn with w forced to 1 (the points at full brightness, the glow without their share)
   * and to 0 (no points, the glow with all of it), the clock paused: the whole frame's light must agree to 5 %.
   */
  async function nscFade() {
    const { ls, perf } = env();
    await perf.view('framing');
    const PC = 3.0856775814913673e13;
    const hole = ls.sim.bodies['sgr-a-star'];
    await atSgrA(45 * PC, ls.sim.camera.pos.clone().sub(hole.pos).normalize());
    const w = ls.nsc.nuclear.w;
    const STAR = /The 3D star catalogue/;
    const pts = [];
    const glow = [];
    perf.scene().scene.traverse((o) => {
      const n = o.geometry?.attributes?.position?.count ?? 0;
      if (o.isPoints && STAR.test(o.material?.vertexShader ?? '') && n > 0 && n <= 70_000) pts.push(o);
      if (o.material?.uniforms?.uNscGlowOn) glow.push(o);
    });
    const force = (wf) => {
      const saved = [];
      for (const o of pts) {
        const before = o.onBeforeRender;
        const mask = o.layers.mask;
        saved.push(() => {
          o.onBeforeRender = before;
          o.layers.mask = mask;
        });
        if (wf === 0) o.layers.mask = 0;
        else
          o.onBeforeRender = function (...args) {
            before.apply(this, args);
            const u = this.material.uniforms.uLnExposure;
            if (u && w > 0) u.value += Math.log(wf / w);
          };
      }
      for (const o of glow) {
        const before = o.onBeforeRender;
        saved.push(() => (o.onBeforeRender = before));
        o.onBeforeRender = function (...args) {
          before.apply(this, args);
          this.material.uniforms.uNscGlowOn.value.x = wf;
        };
      }
      return () => saved.forEach((f) => f());
    };
    const paused = ls.sim.paused;
    ls.sim.paused = true;
    const total = {};
    try {
      for (const wf of [1, 0, null]) {
        const undo = wf === null ? () => {} : force(wf);
        try {
          await perf.settle(3);
          total[wf === null ? 'asShipped' : 'w' + wf] = hdrSum(perf.readHdr()) / Math.exp(ls.relView.lnExposure);
        } finally {
          undo();
        }
      }
    } finally {
      ls.sim.paused = paused;
    }
    const ratio = total.w0 / total.w1;
    return { dPc: +ls.nsc.nuclear.dPc.toFixed(2), w: +w.toFixed(3), pointObjects: pts.length, glowObjects: glow.length, asShippedOverW1: +(total.asShipped / total.w1).toFixed(4), glowOnlyOverPointsFull: +ratio.toFixed(4), pass: Math.abs(ratio - 1) <= 0.05 };
  }

  /** The screen's luminance (0–255, after bloom and tone mapping) summed over a disc of `r` device px about (cx, cy), top row first. */
  function shownDisc(fr, cx, cy, r) {
    let s = 0;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(fr.h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(fr.w - 1, Math.ceil(cx + r)); x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
        s += lum(fr.data, 4 * (y * fr.w + x));
      }
    return s;
  }

  /** Luminance summed over a disc of `r` device px about (cx, cy) (top row first) of a float frame (bottom row first). */
  function hdrDisc(fr, cx, cy, r) {
    let s = 0;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(fr.h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(fr.w - 1, Math.ceil(cx + r)); x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
        const i = 4 * ((fr.h - 1 - y) * fr.w + x);
        s += 0.2126 * fr.data[i] + 0.7152 * fr.data[i + 1] + 0.0722 * fr.data[i + 2];
      }
    return s;
  }

  /**
   * The flow's point and its lensed image: from 90 to 300 au from Sgr A* (the picture fades in as its
   * ring grows from 1.5 to 3 device px, about 225 to 112 au), the light drawn within 64 px of the hole with the flow
   * on, less the frame without it scaled to the same exposure (the flow's glare stops the view down): the flow's own
   * linear light, and on the screen (after bloom and tone mapping, within 128 px, the frame without it subtracted),
   * which may not jump across the crossfade (its largest over its smallest under 1.5). Drawn light, not flux: points and
   * the sky are drawn with the eye's √ law, and the view's exposure follows the flow's glare (so the clock runs: the
   * exposure eases with it).
   */
  async function flowFade() {
    const { ls, perf } = env();
    perf.pin(0);
    await perf.view('framing');
    const AU = 1.495978707e8;
    const hole = ls.sim.bodies['sgr-a-star'];
    const dir = ls.sim.camera.pos.clone().sub(hole.pos).normalize();
    const out = [];
    const paused = ls.sim.paused;
    try {
      for (const au of [90, 100, 112, 130, 150, 175, 200, 225, 260, 300]) {
        await atSgrA(au * AU, dir);
        ls.ui.setState({ accretionFlow: true });
        await perf.settle(90);
        const c = project(ls.sim.bodies['sgr-a-star'].pos.clone().sub(ls.sim.camera.pos).normalize());
        const fOn = perf.readHdr();
        const canvas = `${fOn.w}×${fOn.h}`;
        const on = hdrDisc(fOn, c.x, c.y, 64);
        const shownOn = shownDisc(frameTopFirst(), c.x, c.y, 128);
        const eOn = ls.relView.lnExposure;
        ls.ui.setState({ accretionFlow: false });
        await perf.settle(90);
        const off = hdrDisc(perf.readHdr(), c.x, c.y, 64) * Math.exp(eOn - ls.relView.lnExposure);
        const shownOff = shownDisc(frameTopFirst(), c.x, c.y, 128);
        ls.ui.setState({ accretionFlow: true });
        out.push({ au, flowLight: on - off, shown: shownOn - shownOff, lnExposure: +eOn.toFixed(3), canvas });
      }
    } finally {
      ls.sim.paused = paused;
      ls.ui.setState({ accretionFlow: true });
    }
    const s = out.map((r) => r.flowLight);
    const top = Math.max(...s);
    const factor = s.every((x) => x > 0) ? top / Math.min(...s) : NaN;
    const d = out.map((r) => r.shown);
    const topShown = Math.max(...d);
    const factorShown = d.every((x) => x > 0) ? topShown / Math.min(...d) : NaN;
    return {
      items: out.map(({ au, flowLight, shown, lnExposure, canvas }) => ({ au, linearRel: +(flowLight / top).toFixed(4), shownRel: +(shown / topShown).toFixed(4), lnExposure, canvas })),
      factorLinear: +factor.toFixed(3),
      factorShown: +factorShown.toFixed(3),
      pass: factorShown < 1.5,
    };
  }

  /**
   * A ring of light: the Sun seen from 10,000 au beyond Sgr A* (sky-from:sgr-a-star), the camera moved
   * sideways in steps of 1–10 km so that the alignment's z passes through the ring's crossfade (3.5 → 2.5), the clock
   * paused: the light drawn (the frame with the glints and the ring less the frame without them) over the light
   * lensBodies gives the Sun's images (each image's magnitude times its point share, and the ring's times its share).
   * The two are drawn with different laws (points with the eye's √ law, so the ratio drifts as the magnification
   * falls), so what must hold is that nothing jumps: each sample inside the crossfade within 3 % of the line through
   * its neighbours outside it.
   */
  async function ringFade() {
    const { ls, perf } = env();
    perf.pin(0);
    ls.scenes.runScene('sky-from:sgr-a-star');
    await perf.settle(600);
    const hole = ls.sim.bodies['sgr-a-star'];
    const sun = ls.sim.bodies['sun'];
    const rel = ls.sim.camera.pos.clone().sub(hole.pos);
    const r = rel.length();
    const axis = rel.clone().normalize();
    const side = axis.clone().set(0, 1, 0).cross(axis).normalize();
    const mKm = ls.gravity.mKm;
    const glints = [];
    perf.scene().scene.traverse((o) => {
      const src = (o.material?.vertexShader ?? '') + (o.material?.fragmentShader ?? '');
      if (/Unresolved bodies drawn as point sources|The ring of light of a body lined up/.test(src)) glints.push(o);
    });
    const out = [];
    const paused = ls.sim.paused;
    ls.sim.paused = true;
    try {
      for (const km of [0, 4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 30, 40]) {
        const d = axis.clone().multiplyScalar(r).addScaledVector(side, km).normalize();
        ls.controller.hoverAt('sgr-a-star', r / mKm, d);
        await perf.settle(10);
        const L = sun.lens;
        const ring = L?.ring ?? null;
        let given = 0;
        for (let i = 0; i < (L?.count ?? 0); i++) given += Math.pow(10, -0.4 * L.images[i].magnitude) * L.images[i].share;
        if (ring) given += Math.pow(10, -0.4 * ring.magnitude) * ring.share;
        const a = hdrSum(perf.readHdr()) / Math.exp(ls.relView.lnExposure);
        const masks = glints.map((o) => o.layers.mask);
        glints.forEach((o) => (o.layers.mask = 0));
        await perf.settle(2);
        const b = hdrSum(perf.readHdr()) / Math.exp(ls.relView.lnExposure);
        glints.forEach((o, i) => (o.layers.mask = masks[i]));
        out.push({ km, share: ring ? ring.share : 0, images: L?.count ?? 0, ratio: given > 0 ? (a - b) / given : NaN });
      }
    } finally {
      ls.sim.paused = paused;
    }
    // Inside the fade: against the line through the nearest samples outside it on either side.
    let worst = 0;
    const inside = out.filter((o) => o.share > 0 && o.share < 1);
    for (const o of inside) {
      const lo = [...out].reverse().find((p) => p.km < o.km && p.share === 1);
      const hi = out.find((p) => p.km > o.km && p.share === 0);
      if (!lo || !hi) continue;
      const line = lo.ratio + ((hi.ratio - lo.ratio) * (o.km - lo.km)) / (hi.km - lo.km);
      worst = Math.max(worst, Math.abs(o.ratio / line - 1));
    }
    const med = [...out.map((o) => o.ratio)].sort((x, y) => x - y)[out.length >> 1];
    return {
      glintObjects: glints.length,
      items: out.map(({ km, share, images, ratio }) => ({ km, ringShare: +share.toFixed(3), images, drawnOverGiven: +(ratio / med).toFixed(4) })),
      samplesInFade: inside.length,
      worstOffLine: +worst.toFixed(4),
      pass: inside.length > 0 && worst <= 0.03,
    };
  }

  async function checkFades() {
    const items = {};
    for (const [name, fn] of [['nsc', nscFade], ['flow', flowFade], ['ring', ringFade]]) {
      try {
        items[name] = await fn();
      } catch (e) {
        items[name] = { error: String(e?.stack ?? e) };
      }
    }
    const done = Object.values(items).filter((r) => r.pass === true || r.pass === false);
    return record('fades', done.length ? done.every((r) => r.pass) : null, { items });
  }

  const CHECKS = { maps: checkMaps, pictures: checkPictures, continuity: checkContinuity, fades: checkFades, compiles: checkCompiles, brightness: checkBrightness, regressions: checkRegressions, horizon: checkHorizon };

  async function run(name = 'all') {
    const { perf } = env();
    perf.pin(0);
    await perf.ready(90000);
    // A view waits for the background compiles (the lens is drawn only once they are done) and starts from a known place.
    await perf.view('framing');
    const names = name === 'all' ? Object.keys(CHECKS) : [name];
    const out = [];
    for (const n of names) {
      if (!CHECKS[n]) throw new Error(`no check ${n}: ${Object.keys(CHECKS).join(', ')}`);
      try {
        out.push(await CHECKS[n]());
      } catch (e) {
        out.push(record(n, false, { error: String(e?.stack ?? e) }));
      }
    }
    return out;
  }

  /** Run in the background (a console call times out long before a full run ends); poll with status(). */
  function start(name = 'all') {
    const job = (jobs[name] = { state: 'running', started: new Date().toISOString(), out: null });
    run(name).then(
      (r) => Object.assign(job, { state: 'done', out: r }),
      (e) => Object.assign(job, { state: 'error', out: String(e?.stack ?? e) }),
    );
    return job;
  }

  const status = (name) => (name ? jobs[name] : jobs);

  /** Every result so far, one line each, with its conditions. */
  function report() {
    return results
      .map((r) => {
        const c = r.conditions ?? {};
        const verdict = r.pass === true ? 'pass' : r.pass === false ? 'FAIL' : 'not run';
        return `${r.at} ${r.check}: ${verdict} (${c.canvas ?? '?'} at pixel ratio ${c.dpr ?? '?'}, rung ${c.lensRung ?? '?'}, ${c.hidden ? 'hidden tab' : 'visible tab'})${r.skipped ? ' — ' + r.skipped : ''}`;
      })
      .join('\n');
  }

  W.lensCheck = { run, start, status, report, results, ...pure };
})();
