import { bvToTemperature } from '../physics/blackbody';
import { assetUrl } from '../render/textures';

/** Stars on the HYG layout: x, y, z (pc, world axes), V magnitude, B−V. */
export interface StarCatalog {
  count: number;
  xyz: Float32Array;
  mag: Float32Array;
  temp: Float32Array;
}

let catalogPromise: Promise<StarCatalog> | null = null;
export function loadStarCatalog(): Promise<StarCatalog> {
  catalogPromise ??= fetch(assetUrl('data/stars.bin'))
    .then((r) => {
      if (!r.ok) throw new Error(`stars.bin: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const f = new Float32Array(buf);
      const count = f.length / 5;
      const xyz = new Float32Array(count * 3);
      const mag = new Float32Array(count);
      const temp = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        xyz[i * 3] = f[i * 5];
        xyz[i * 3 + 1] = f[i * 5 + 1];
        xyz[i * 3 + 2] = f[i * 5 + 2];
        mag[i] = f[i * 5 + 3];
        temp[i] = bvToTemperature(f[i * 5 + 4]);
      }
      return { count, xyz, mag, temp };
    });
  return catalogPromise;
}
