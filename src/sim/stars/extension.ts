/**
 * The catalogue's extension (docs/data/stars.md §12): about three million stars beyond the head, in band files
 * (public/data/stars3d/NNNN.bin.gz) listed by an index (public/data/stars3d-index.bin.gz). Decoders only: no DOM,
 * the star worker imports this. The loader is extensionLoad.ts.
 *
 * Index ("LSI1", 128-byte header): per file its first global star index, star count, cell count, gzipped size,
 * band, brightest M_V and fastest speed, and its box at J2000 and at ±1 Myr (cells.ts); per cell (files in order,
 * each file's cells in order) its brightest M_V, star count and box at J2000, quantised outward to 8 bits inside the
 * file's J2000 box. Band file ("LSB1", 64-byte header): each cell's star count, then the catalogue's columns in cell
 * order (positions, velocities, M_V delta-coded within each cell, temperature, flags; byte-shuffled), the origin
 * byte, spectral type (index into star-names.json's spectralTypes) and constellation.
 */
import type { Stars3D, Stars3DExtra } from './catalogue';
import { cellsFromCounts, type StarCells } from './cells';

export const STAR_HEAD_PATH = 'data/stars3d-head.bin.gz';
export const STAR_INDEX_PATH = 'data/stars3d-index.bin.gz';
/** Path of band file k. */
export const bandFilePath = (k: number): string => `data/stars3d/${String(k).padStart(4, '0')}.bin.gz`;

export interface StarIndex {
  /** Stars of the core. */
  coreCount: number;
  /** Stars of the head (core + pinned): the first band file starts here. */
  headCount: number;
  /** All stars. */
  total: number;
  /** Band files. */
  files: number;
  base: Uint32Array;
  count: Uint32Array;
  cells: Uint32Array;
  bytes: Uint32Array;
  band: Uint8Array;
  /** Brightest M_V of each file. */
  mMin: Float32Array;
  /** Fastest star of each file, km/s. */
  vmax: Float32Array;
  /** 18 floats a file: box at J2000 (lo, hi), at +1 Myr, at −1 Myr (pc, J2000 ecliptic). */
  boxes: Float32Array;
  /** First cell of each file (files + 1 values). */
  cellFirst: Uint32Array;
  /** Brightest M_V of each cell. */
  cellMin: Float32Array;
  /** 6 floats a cell: its J2000 box (lo, hi), rounded outward. */
  cellBox: Float32Array;
}

export interface BandFile {
  /** Global index of its first star. */
  base: number;
  stars: Stars3D;
  extra: Stars3DExtra;
  cells: StarCells;
}

interface Header {
  magic: string;
  count: number;
  offsets: number[];
  dv: DataView;
}
function header(buf: ArrayBuffer): Header {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  const n = dv.getUint32(24, true);
  const offsets: number[] = [];
  for (let k = 0; k < n; k++) offsets.push(dv.getUint32(28 + 4 * k, true));
  return { magic, count: dv.getUint32(8, true), offsets, dv };
}
function unshuffle(buf: ArrayBuffer, offset: number, n: number, width: number): ArrayBuffer {
  if (offset + n * width > buf.byteLength) throw new Error('star file: section runs past the end');
  const src = new Uint8Array(buf, offset, n * width);
  const out = new Uint8Array(n * width);
  for (let k = 0; k < width; k++) {
    const b = k * n;
    for (let i = 0; i < n; i++) out[i * width + k] = src[b + i];
  }
  return out.buffer;
}
const bytes = (buf: ArrayBuffer, offset: number, n: number) => new Uint8Array(buf.slice(offset, offset + n));

export function decodeStarIndex(buf: ArrayBuffer): StarIndex {
  const h = header(buf);
  if (h.magic !== 'LSI1') throw new Error(`stars3d-index: bad magic ${h.magic}`);
  const nF = h.count;
  const headCount = h.dv.getUint32(72, true);
  const total = h.dv.getUint32(76, true);
  const nC = h.dv.getUint32(80, true);
  const coreCount = h.dv.getUint32(84, true);
  const o = h.offsets;
  const base = new Uint32Array(unshuffle(buf, o[0], nF, 4));
  const count = new Uint32Array(unshuffle(buf, o[1], nF, 4));
  const cells = new Uint32Array(unshuffle(buf, o[2], nF, 4));
  const size = new Uint32Array(unshuffle(buf, o[3], nF, 4));
  const band = bytes(buf, o[4], nF);
  const mMin16 = new Int16Array(unshuffle(buf, o[5], nF, 2));
  const vmax = new Float32Array(unshuffle(buf, o[6], nF, 4));
  const boxes = new Float32Array(unshuffle(buf, o[7], 18 * nF, 4));
  const cMin16 = new Int16Array(unshuffle(buf, o[8], nC, 2));
  const cCount = new Uint16Array(unshuffle(buf, o[9], nC, 2));
  const cBox8 = bytes(buf, o[10], 6 * nC);
  const mMin = Float32Array.from(mMin16, (m) => m / 100);
  const cellMin = Float32Array.from(cMin16, (m) => m / 100);
  const cellFirst = new Uint32Array(nF + 1);
  for (let f = 0; f < nF; f++) cellFirst[f + 1] = cellFirst[f] + cells[f];
  if (cellFirst[nF] !== nC) throw new Error('stars3d-index: cell counts disagree');
  const cellBox = new Float32Array(6 * nC);
  for (let f = 0; f < nF; f++) {
    let stars = 0;
    for (let c = cellFirst[f]; c < cellFirst[f + 1]; c++) {
      stars += cCount[c];
      for (let a = 0; a < 3; a++) {
        const lo = boxes[18 * f + a];
        const span = boxes[18 * f + 3 + a] - lo || 1;
        // Outward: one more step each way for float rounding.
        cellBox[6 * c + a] = lo + (Math.max(0, cBox8[6 * c + a] - 1) / 255) * span;
        cellBox[6 * c + 3 + a] = lo + (Math.min(255, cBox8[6 * c + 3 + a] + 1) / 255) * span;
      }
    }
    if (stars !== count[f]) throw new Error(`stars3d-index: file ${f} has ${count[f]} stars but its cells ${stars}`);
  }
  return { coreCount, headCount, total, files: nF, base, count, cells, bytes: size, band, mMin, vmax, boxes, cellFirst, cellMin, cellBox };
}

export function starIndexTransfer(x: StarIndex): ArrayBuffer[] {
  return [x.base, x.count, x.cells, x.bytes, x.band, x.mMin, x.vmax, x.boxes, x.cellFirst, x.cellMin, x.cellBox].map((a) => a.buffer as ArrayBuffer);
}

/** Decode a band file whose first star has global index `base`. */
export function decodeBandFile(buf: ArrayBuffer, base: number): BandFile {
  const h = header(buf);
  if (h.magic !== 'LSB1') throw new Error(`star band file: bad magic ${h.magic}`);
  const n = h.count;
  const o = h.offsets;
  const velocityUnitKms = h.dv.getFloat32(16, true);
  const absMagUnit = h.dv.getFloat32(20, true);
  // Cell counts (uint16), up to the positions section.
  const nCells = (o[1] - o[0]) >> 1;
  const counts = new Uint16Array(buf.slice(o[0], o[0] + 2 * nCells));
  let sum = 0;
  let cellsN = 0;
  while (cellsN < nCells && sum < n) sum += counts[cellsN++];
  if (sum !== n) throw new Error('star band file: cell counts do not add up');
  const positions = new Float32Array(unshuffle(buf, o[1], 3 * n, 4));
  const velocitiesInt16 = new Int16Array(unshuffle(buf, o[2], 3 * n, 2));
  const absMagInt16 = new Int16Array(unshuffle(buf, o[3], n, 2));
  // Undo the delta coding within each cell.
  let q = 0;
  for (let c = 0; c < cellsN; c++) {
    for (let j = 1; j < counts[c]; j++) absMagInt16[q + j] += absMagInt16[q + j - 1];
    q += counts[c];
  }
  const teff = new Uint16Array(unshuffle(buf, o[4], n, 2));
  const flags = new Uint16Array(unshuffle(buf, o[5], n, 2));
  const origin = bytes(buf, o[6], n);
  const spectralType = new Uint16Array(unshuffle(buf, o[7], n, 2));
  const constellation = bytes(buf, o[8], n);
  const absMag = new Float32Array(n);
  for (let i = 0; i < n; i++) absMag[i] = absMagInt16[i] * absMagUnit;
  const stars: Stars3D = { count: n, epochJy: h.dv.getFloat32(12, true), positions, velocitiesInt16, velocityUnitKms, absMagInt16, absMagUnit, absMag, teff, flags, origin };
  const cells = cellsFromCounts(stars, counts.subarray(0, cellsN));
  return { base, stars, extra: { count: n, spectralType, constellation }, cells };
}

export function bandFileTransfer(f: BandFile): ArrayBuffer[] {
  const s = f.stars;
  return [s.positions, s.velocitiesInt16, s.absMagInt16, s.absMag, s.teff, s.flags, s.origin!, f.extra.spectralType, f.extra.constellation, f.cells.start, f.cells.box, f.cells.beta].map(
    (a) => a.buffer as ArrayBuffer,
  );
}
