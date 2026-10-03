// Builds the Milky Way model's face-on maps for the view from outside it (src/sim/galaxy/faceOn.ts):
//   public/textures/galaxy-face-young.png   the young arm stars' surface brightness for 1 L☉ in all, 8-bit log: the
//                                           model's own young arm stars (scripts/build-galaxy.mjs sampleArms, with its
//                                           clumps), YOUNG_COUNT of them, each a Gaussian as wide as the distance to
//                                           its 8th nearest neighbour (as the app's particles, but 40 times as many,
//                                           so 6 times finer), down to half a texel
//   public/textures/galaxy-face-dust.png    the face-on V-band extinction through the disc, 8-bit log
//   src/sim/galaxy/faceOn.json              the two maps' log ranges (faceOn.ts decodeLog), and their grid
// Both are grey PNGs, FACE_RES square over ±FACE_EXTENT_KPC of frame G, row 0 at y = +extent (the top of the image;
// the app's textures are flipped on upload, so v = 0 is y = −extent, as the dust maps' row 0).
// The model's own code is run through Vite (it is TypeScript), so the maps are those of the app's model.json.
// Run: node scripts/build-galaxy-face.mjs   (about a minute)
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { png } from './build-faint-stars.mjs';
import { COUNTS, SEED, knnRadius, loadModel, makeRng, prepareArms, sampleArms } from './build-galaxy.mjs';

/** The young arm stars drawn into the map: 40 times the app's particles. */
const YOUNG_COUNT = 40 * COUNTS.youngArmStars;

/** The young arm stars' face-on surface brightness (L☉/pc² for 1 L☉ in all) on the faceOn grid. */
function youngFromParticles(res, extent) {
  const model = loadModel();
  const rng = makeRng(SEED + 1);
  const yc = model.components.youngArmStars;
  // As generate(): 70% in clumps of 8, 30 pc across.
  const pos = sampleArms(model, prepareArms(model), YOUNG_COUNT, rng, yc.hz.value ?? yc.hz, 0.7, 8, 0.03);
  const n = pos.length / 3;
  const h = knnRadius(pos, n, 8);
  const texel = (2 * extent) / res;
  const grid = new Float64Array(res * res);
  const per = 1 / n;
  for (let p = 0; p < n; p++) {
    const x = pos[3 * p], y = pos[3 * p + 1];
    const sig = Math.max(0.5 * texel, h[p]);
    const ci = (x + extent) / texel - 0.5, cj = (y + extent) / texel - 0.5;
    const r = Math.ceil((3 * sig) / texel);
    const i0 = Math.max(0, Math.floor(ci) - r), i1 = Math.min(res - 1, Math.ceil(ci) + r);
    const j0 = Math.max(0, Math.floor(cj) - r), j1 = Math.min(res - 1, Math.ceil(cj) + r);
    if (i0 > i1 || j0 > j1) continue;
    let w = 0;
    const k = (texel * texel) / (2 * sig * sig);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) w += Math.exp(-k * ((i - ci) ** 2 + (j - cj) ** 2));
    if (w <= 0) continue;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * res + i] += (per * Math.exp(-k * ((i - ci) ** 2 + (j - cj) ** 2))) / w;
  }
  // L☉ per texel → per pc².
  const area = (texel * 1000) ** 2;
  const out = new Float32Array(res * res);
  for (let i = 0; i < out.length; i++) out[i] = grid[i] / area;
  return out;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const face = await server.ssrLoadModule('/src/sim/galaxy/faceOn.ts');
  const json = (await server.ssrLoadModule('/src/sim/galaxy/model.json')).default;
  const t0 = Date.now();
  const av = face.faceOnDust(json, face.FACE_RES, face.FACE_EXTENT_KPC);
  const res = face.FACE_RES;
  const young = youngFromParticles(res, face.FACE_EXTENT_KPC);
  const max = (a) => a.reduce((m, v) => (v > m ? v : m), 0);
  // Ranges: the young stars down to 10⁻⁴ of their brightest (the arms' Gaussian tails, far below what shows), the dust
  // from 0.01 mag (nothing visible) to its densest.
  const ranges = {
    young: { v0: max(young) * 1e-4, vmax: max(young) },
    dust: { v0: 0.01, vmax: max(av) },
  };
  const write = (name, map, range) => {
    const bytes = new Uint8Array(res * res);
    // Image row 0 is the top: y = +extent (the last row of the map).
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) bytes[j * res + i] = face.encodeLog(map[(res - 1 - j) * res + i], range);
    const out = png(bytes, res, res);
    writeFileSync(resolve(ROOT, 'public/textures', name), out);
    return out.length;
  };
  const ny = write('galaxy-face-young.png', young, ranges.young);
  const nd = write('galaxy-face-dust.png', av, ranges.dust);
  const meta = { res, extentKpc: face.FACE_EXTENT_KPC, young: ranges.young, dust: ranges.dust };
  writeFileSync(resolve(ROOT, 'src/sim/galaxy/faceOn.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(JSON.stringify({ ...meta, bytes: { young: ny, dust: nd }, seconds: (Date.now() - t0) / 1000 }));
} finally {
  await server.close();
}
