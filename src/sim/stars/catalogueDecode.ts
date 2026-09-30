/**
 * Decoding the catalogue as the app draws it: the core (stars3d.bin.gz) with the head's pinned stars
 * (stars3d-head.bin.gz) appended, and what drawing needs worked out once (companions' temperatures, the near-Sun
 * counts, the far lists, the head's cells). Runs in the star worker (worker.ts); where there are no workers (the
 * tests), on the main thread (workerClient.ts). No DOM or three.js here: the worker imports it.
 */
import { appendStars3D, borrowCompanionTemperatures, decodeStars3D, fetchGzip, type Stars3D } from './catalogue';
import { buildCells } from './cells';
import { nearSunCounts, starDrawLists } from './visibility';

/** The catalogue with the head appended (when given), with what drawing needs worked out. */
export async function decodeCatalogue(buf: ArrayBuffer, headBuf: ArrayBuffer | null): Promise<Stars3D> {
  let stars = decodeStars3D(buf);
  if (headBuf) stars = appendStars3D(stars, decodeStars3D(headBuf));
  borrowCompanionTemperatures(stars);
  stars.nearSun = nearSunCounts(stars);
  stars.drawLists = starDrawLists(stars);
  if (headBuf) stars.cells = buildCells(stars, stars.count);
  return stars;
}

/** Fetch the head file, or null if it cannot be had (the core then goes on alone). */
export async function fetchHead(url: string): Promise<ArrayBuffer | null> {
  try {
    return await fetchGzip(url);
  } catch (err) {
    console.warn(`[lightspeed] ${url} did not load (${err}); the core catalogue goes on alone`);
    return null;
  }
}
