/**
 * The shipped star files, decoded once per test run (Node's zlib through process.getBuiltinModule,
 * as test/files.ts reaches fs).
 */
import { decodeStars3D, decodeStars3DExtra, type Stars3D, type Stars3DExtra } from '../sim/stars/catalogue';
import { buildNameTable, type StarNameTable, type StarNamesJson } from '../sim/stars/names';
import { bandFilePath, decodeBandFile, decodeStarIndex, STAR_HEAD_PATH, type BandFile, type StarIndex } from '../sim/stars/extension';
import { decodeCatalogue } from '../sim/stars/catalogueDecode';
import type { SystemsFile } from '../sim/stars/orbits';
import type { ConstellationsFile } from '../sim/stars/constellations';
import { readBytes, readJson } from './files';

interface NodeZlib {
  gunzipSync(data: Uint8Array): Uint8Array;
}
const zlib = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:zlib') as NodeZlib;

/** A gzipped file's bytes, in a buffer of their own. */
export function gunzipFile(path: string): ArrayBuffer {
  const out = zlib.gunzipSync(readBytes(path));
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

let stars: Stars3D | undefined;
let bright: Stars3D | undefined;
let extra: Stars3DExtra | undefined;
let namesJson: StarNamesJson | undefined;
let names: StarNameTable | undefined;

export const loadStars = (): Stars3D => (stars ??= decodeStars3D(gunzipFile('public/data/stars3d.bin.gz')));
export const loadBrightStars = (): Stars3D => (bright ??= decodeStars3D(gunzipFile('public/data/stars3d-bright.bin.gz')));
export const loadExtra = (): Stars3DExtra => (extra ??= decodeStars3DExtra(gunzipFile('public/data/stars3d-extra.bin.gz')));
export const loadNamesJson = (): StarNamesJson => (namesJson ??= JSON.parse(new TextDecoder().decode(gunzipFile('public/data/star-names.json.gz'))) as StarNamesJson);
export const loadNames = (): StarNameTable => (names ??= buildNameTable(loadNamesJson()));
export const loadSystems = (): SystemsFile => readJson<SystemsFile>('src/sim/stars/systems.json');
export const loadConstellationsFile = (): ConstellationsFile => readJson<ConstellationsFile>('public/data/constellations.json');

// ─── The catalogue's extension (docs/data/stars.md §12) ───────────────────────────────────────────────────────────

let head: Stars3D | undefined;
let index: StarIndex | undefined;
const bands = new Map<number, BandFile>();

/** The head file on its own (the pinned stars). */
export const loadHeadFile = (): Stars3D => decodeStars3D(gunzipFile(STAR_HEAD_PATH_FILE));
/** The core with the head's pinned stars appended, as the app loads it (with its cells and lists). */
export const loadHeadCatalogue = async (): Promise<Stars3D> => (head ??= await decodeCatalogue(gunzipFile('public/data/stars3d.bin.gz'), gunzipFile(STAR_HEAD_PATH_FILE)));
export const loadStarIndex = (): StarIndex => (index ??= decodeStarIndex(gunzipFile('public/data/stars3d-index.bin.gz')));
/** Band file k, decoded as the app decodes it. */
export function loadBandFile(k: number): BandFile {
  let f = bands.get(k);
  if (!f) bands.set(k, (f = decodeBandFile(gunzipFile(`public/${bandFilePath(k)}`), loadStarIndex().base[k])));
  return f;
}
const STAR_HEAD_PATH_FILE = `public/${STAR_HEAD_PATH}`;
