// A small reader for FITS binary tables (the DESI and SDSS large-scale-structure catalogues), for
// scripts/build-surveys.mjs. FITS is big-endian and row-major: every row of the table is NAXIS1 bytes, the
// columns at fixed offsets within it (Wells et al. 1981; FITS standard 4.0, section 7.3). Only the scalar
// column types the catalogues use are read (K int64, J int32, I int16, D float64, E float32, B uint8, and a
// repeat count such as 5E for SDSS's five-band fluxes); strings and variable-length arrays are skipped.
//
// The files are large (the DESI Bright Galaxy Survey's northern file is 478 MB, BOSS's is 345 MB once
// inflated), so rows are streamed: the file is read in chunks (inflated on the way for .fits.gz) and each
// chunk's whole rows handed to the caller, never the whole file at once.

import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';

const BLOCK = 2880;
const CARD = 80;

const SIZES = { K: 8, J: 4, I: 2, D: 8, E: 4, B: 1, A: 1, L: 1 };

/** Parse the header cards in `buf` from `offset`: { cards, end } (end at the next 2,880-byte block), or null if END is not in `buf` yet. */
function parseHeader(buf, offset) {
  const cards = {};
  for (let p = offset; p + CARD <= buf.length; p += CARD) {
    const card = buf.toString('latin1', p, p + CARD);
    const key = card.slice(0, 8).trim();
    if (key === 'END') return { cards, end: Math.ceil((p + CARD) / BLOCK) * BLOCK };
    if (card[8] !== '=') continue;
    let v = card.slice(10);
    if (v.trimStart().startsWith("'")) {
      const s = v.indexOf("'");
      v = v.slice(s + 1, v.indexOf("'", s + 1)).trim();
    } else v = v.split('/')[0].trim();
    cards[key] = v;
  }
  return null;
}

/** The columns of a BINTABLE header: name → { offset in the row, type letter, repeat }. */
function columnsOf(cards) {
  const n = Number(cards.TFIELDS);
  const cols = {};
  let offset = 0;
  for (let i = 1; i <= n; i++) {
    const name = cards[`TTYPE${i}`].trim();
    const m = /^(\d*)([A-Z])/.exec(cards[`TFORM${i}`].trim());
    const repeat = m[1] === '' ? 1 : Number(m[1]);
    const type = m[2];
    if (!(type in SIZES)) throw new Error(`FITS column ${name}: type ${type} not supported`);
    cols[name] = { offset, type, repeat };
    offset += repeat * SIZES[type];
  }
  if (offset !== Number(cards.NAXIS1)) throw new Error(`FITS row width ${offset} differs from NAXIS1 ${cards.NAXIS1}`);
  return cols;
}

/** A reader of one column's element `k` at a row's byte offset in `buf`, as a number. */
function getter(col, k) {
  const at = col.offset + k * SIZES[col.type];
  switch (col.type) {
    case 'K':
      // Int64 identifiers (DESI TARGETID) exceed 2^53 only past 9e15: TARGETIDs are below 2^59, so they are read as
      // BigInt and handed back as such; the build keeps them in a BigInt64Array.
      return (buf, row) => buf.readBigInt64BE(row + at);
    case 'J':
      return (buf, row) => buf.readInt32BE(row + at);
    case 'I':
      return (buf, row) => buf.readInt16BE(row + at);
    case 'D':
      return (buf, row) => buf.readDoubleBE(row + at);
    case 'E':
      return (buf, row) => buf.readFloatBE(row + at);
    case 'B':
      return (buf, row) => buf[row + at];
    default:
      throw new Error(`FITS column type ${col.type} cannot be read as a number`);
  }
}

/**
 * Stream the first binary table of `path` (.fits or .fits.gz). `want` maps output names to column names, with an
 * optional element index for repeated columns ('MODELFLUX[2]'). `onRows(values, count)` is called with, per wanted
 * name, an array of that chunk's values (Float64Array, or BigInt64Array for int64 columns). Resolves to the row count.
 */
export async function readFitsTable(path, want, onRows) {
  const input = createReadStream(path, { highWaterMark: 1 << 24 });
  const stream = path.endsWith('.gz') ? input.pipe(createGunzip({ chunkSize: 1 << 24 })) : input;
  let pending = Buffer.alloc(0);
  let stage = 'primary';
  let header = null;
  let getters = null;
  let rowBytes = 0;
  let rowsLeft = 0;
  let total = 0;
  let skip = 0;
  for await (const chunk of stream) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    for (;;) {
      if (stage === 'primary' || stage === 'table-header') {
        const h = parseHeader(pending, 0);
        if (!h) break;
        if (stage === 'primary') {
          // The primary HDU of these files holds no data (NAXIS = 0); skip any it has.
          const bytes = Number(h.cards.NAXIS) > 0 ? Math.ceil((Math.abs(Number(h.cards.BITPIX)) / 8) * [...Array(Number(h.cards.NAXIS))].reduce((a, _, i) => a * Number(h.cards[`NAXIS${i + 1}`]), 1) / BLOCK) * BLOCK : 0;
          pending = pending.subarray(h.end);
          skip = bytes;
          stage = 'skip';
          continue;
        }
        if (h.cards.XTENSION !== 'BINTABLE') throw new Error(`${path}: first extension is ${h.cards.XTENSION}, not a binary table`);
        header = h.cards;
        const cols = columnsOf(header);
        getters = Object.entries(want).map(([out, spec]) => {
          const m = /^(.+?)(?:\[(\d+)\])?$/.exec(spec);
          const col = cols[m[1]];
          if (!col) throw new Error(`${path}: no column ${m[1]} (has ${Object.keys(cols).join(', ')})`);
          return { out, get: getter(col, m[2] ? Number(m[2]) : 0), int64: col.type === 'K' };
        });
        rowBytes = Number(header.NAXIS1);
        rowsLeft = Number(header.NAXIS2);
        pending = pending.subarray(h.end);
        stage = 'rows';
        continue;
      }
      if (stage === 'skip') {
        const n = Math.min(skip, pending.length);
        pending = pending.subarray(n);
        skip -= n;
        if (skip > 0) break;
        stage = 'table-header';
        continue;
      }
      if (stage === 'rows') {
        const rows = Math.min(rowsLeft, Math.floor(pending.length / rowBytes));
        if (rows > 0) {
          const values = {};
          for (const g of getters) values[g.out] = g.int64 ? new BigInt64Array(rows) : new Float64Array(rows);
          for (let r = 0; r < rows; r++) {
            const at = r * rowBytes;
            for (const g of getters) values[g.out][r] = g.get(pending, at);
          }
          onRows(values, rows);
          rowsLeft -= rows;
          total += rows;
          pending = pending.subarray(rows * rowBytes);
        }
        if (rowsLeft === 0) stage = 'done';
        break;
      }
      break;
    }
    if (stage === 'done') {
      stream.destroy?.();
      input.destroy();
      break;
    }
    // Keep the unread tail in a buffer of its own, so the big chunk it came from can be freed.
    pending = Buffer.from(pending);
  }
  if (stage !== 'done') throw new Error(`${path}: table ended after ${total} rows, ${rowsLeft} missing`);
  return total;
}
