// Loads the shipped data files for tests (Node only; not part of the library).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decodeStars3D, decodeStars3DExtra, type Stars3D, type Stars3DExtra } from './stars3d';
import type { StarNamesJson } from './names';
import type { SystemsFile } from './orbits';

const repo = (p: string) => new URL(`../../../${p}`, import.meta.url);

const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

let stars: Stars3D | undefined;
let extra: Stars3DExtra | undefined;
let names: StarNamesJson | undefined;
let systems: SystemsFile | undefined;

export function loadStars(): Stars3D {
  stars ??= decodeStars3D(toArrayBuffer(gunzipSync(readFileSync(repo('public/data/stars3d.bin.gz')))));
  return stars;
}
export function loadExtra(): Stars3DExtra {
  extra ??= decodeStars3DExtra(toArrayBuffer(gunzipSync(readFileSync(repo('public/data/stars3d-extra.bin.gz')))));
  return extra;
}
export function loadNames(): StarNamesJson {
  names ??= JSON.parse(gunzipSync(readFileSync(repo('public/data/star-names.json.gz'))).toString('utf8')) as StarNamesJson;
  return names;
}
export function loadSystems(): SystemsFile {
  systems ??= JSON.parse(readFileSync(repo('staging/stars/systems.json'), 'utf8')) as SystemsFile;
  return systems;
}
export function readRepoFile(p: string): Buffer {
  return readFileSync(repo(p));
}
