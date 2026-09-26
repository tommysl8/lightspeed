/**
 * Star names and catalogue numbers from public/data/star-names.json.gz (docs/data/stars.md §3.4),
 * as a compact search table: the proper names, Bayer and Flamsteed designations, variable-star
 * names and Gliese numbers of about 13,000 stars become sorted search keys (prefix search by
 * binary search), and the 340,000 HR, HIP and HD numbers stay numeric columns looked up by
 * number or by star. The table is built off the main thread (worker.ts) when search first opens.
 */

export interface StarNamesJson {
  format: 'lightspeed.star-names';
  version: number;
  count: number;
  /** [abbreviation, name, genitive] of the 88 IAU constellations; stars3d-extra's constellation index is 1-based. */
  constellations: [string, string, string][];
  spectralTypes: string[];
  /** [starIndex, name, iau]: iau = 1 when the name is on the IAU WGSN list. */
  proper: [number, string, number][];
  /** [starIndex, Greek letter, superscript (0 = none), constellation abbreviation]. */
  bayer: [number, string, number, string][];
  /** [starIndex, Flamsteed number, constellation abbreviation]. */
  flamsteed: [number, number, string][];
  /** [starIndex, variable-star designation]. */
  variable: [number, string][];
  /** [starIndex, Gliese/GJ number as written in the Gliese–Jahreiß catalogue, e.g. "551" or "244A"]. */
  gliese: [number, string][];
  /** Catalogue numbers as parallel columns; star indices are delta-coded (the running sum gives the index). */
  hr: { indexDelta: number[]; id: number[] };
  hip: { indexDelta: number[]; id: number[] };
  hd: { indexDelta: number[]; id: number[] };
}

export type CatalogueName = 'hr' | 'hip' | 'hd';

/** One numeric catalogue: its entries by star (for labels) and by number (for lookups). */
export interface NumberColumn {
  /** Star index of each entry, ascending. */
  star: Int32Array;
  /** The catalogue number of each entry (parallel to `star`). */
  id: Int32Array;
  /** Entry positions sorted by catalogue number. */
  byId: Int32Array;
}

export interface StarNameTable {
  count: number;
  /** [abbreviation, name, genitive] of the 88 IAU constellations. */
  constellations: [string, string, string][];
  spectralTypes: string[];
  /** Normalised search keys, sorted; keyStar[k] is the star key k names (a key naming two stars is there twice). */
  keys: string[];
  keyStar: Int32Array;
  /** Stars with names or designations (ascending), with their labels labels[labelStart[j] … labelStart[j + 1]). */
  labelStars: Int32Array;
  labelStart: Int32Array;
  labels: string[];
  /** Stars whose first label is an IAU-approved proper name (ascending). */
  iauStars: Int32Array;
  hr: NumberColumn;
  hip: NumberColumn;
  hd: NumberColumn;
}

const GREEK_NAMES: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota', κ: 'kappa',
  λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', ο: 'omicron', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', υ: 'upsilon',
  φ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
};
const GREEK_ABBR: Record<string, string> = {
  α: 'alp', β: 'bet', γ: 'gam', δ: 'del', ε: 'eps', ζ: 'zet', η: 'eta', θ: 'the', ι: 'iot', κ: 'kap', λ: 'lam',
  μ: 'mu', ν: 'nu', ξ: 'xi', ο: 'omi', π: 'pi', ρ: 'rho', σ: 'sig', τ: 'tau', υ: 'ups', φ: 'phi', χ: 'chi', ψ: 'psi',
  ω: 'ome',
};
const SUPERSCRIPT = ['', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const CATALOGUE_PREFIX: Record<CatalogueName, string> = { hr: 'HR', hip: 'HIP', hd: 'HD' };

/** Lower case, accents and apostrophes gone, hyphens as spaces, spaces collapsed: the key used for search. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`.ʻ‘]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function column(cols: { indexDelta: number[]; id: number[] }): NumberColumn {
  const n = cols.id.length;
  const star = new Int32Array(n);
  const id = new Int32Array(n);
  let i = 0;
  for (let k = 0; k < n; k++) {
    i += cols.indexDelta[k];
    star[k] = i;
    id[k] = cols.id[k];
  }
  const byId = new Int32Array(n);
  for (let k = 0; k < n; k++) byId[k] = k;
  byId.sort((a, b) => id[a] - id[b] || star[a] - star[b]);
  return { star, id, byId };
}

/** Build the search table from the parsed names file (in the worker; the tests call it directly). */
export function buildNameTable(json: StarNamesJson): StarNameTable {
  const con = new Map(json.constellations.map(([abbr, name, gen]) => [abbr.toLowerCase(), { abbr, name, gen }]));
  const pairs: [string, number][] = [];
  const seenKey = new Set<string>();
  const labelMap = new Map<number, string[]>();
  const iau = new Set<number>();
  const put = (key: string, i: number) => {
    const k = normalizeName(key);
    if (!k) return;
    const tag = `${k}\u0000${i}`;
    if (seenKey.has(tag)) return;
    seenKey.add(tag);
    pairs.push([k, i]);
  };
  const label = (i: number, s: string) => {
    const l = labelMap.get(i);
    if (!l) labelMap.set(i, [s]);
    else if (!l.includes(s)) l.push(s);
  };

  // IAU names first, so they lead each star's labels.
  for (const [i, name, isIau] of [...json.proper].sort((a, b) => b[2] - a[2])) {
    put(name, i);
    if (isIau && !labelMap.has(i)) iau.add(i);
    label(i, name);
  }
  for (const [i, greek, sup, abbr] of json.bayer) {
    const c = con.get(abbr.toLowerCase());
    const supTxt = sup ? String(sup) : '';
    label(i, `${greek}${SUPERSCRIPT[sup] ?? supTxt} ${c ? c.abbr : abbr}`);
    for (const g of [greek, GREEK_NAMES[greek] ?? greek, GREEK_ABBR[greek] ?? greek]) {
      put(`${g}${supTxt} ${abbr}`, i);
      put(`${g} ${supTxt} ${abbr}`, i);
      if (c) {
        put(`${g}${supTxt} ${c.gen}`, i);
        put(`${g} ${supTxt} ${c.gen}`, i);
      }
      if (sup === 1 || sup === 0) {
        put(`${g} ${abbr}`, i);
        if (c) put(`${g} ${c.gen}`, i);
      }
    }
  }
  for (const [i, n, abbr] of json.flamsteed) {
    const c = con.get(abbr.toLowerCase());
    label(i, `${n} ${c ? c.abbr : abbr}`);
    put(`${n} ${abbr}`, i);
    if (c) put(`${n} ${c.gen}`, i);
  }
  for (const [i, v] of json.variable) {
    label(i, v);
    put(v, i);
  }
  for (const [i, g] of json.gliese) {
    label(i, `GJ ${g}`);
    for (const p of ['gj', 'gl', 'gliese']) {
      put(`${p} ${g}`, i);
      put(`${p}${g}`, i);
    }
  }

  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  const keys = pairs.map((p) => p[0]);
  const keyStar = Int32Array.from(pairs, (p) => p[1]);
  const labelStars = Int32Array.from([...labelMap.keys()].sort((a, b) => a - b));
  const labelStart = new Int32Array(labelStars.length + 1);
  const labels: string[] = [];
  labelStars.forEach((i, j) => {
    labelStart[j] = labels.length;
    labels.push(...labelMap.get(i)!);
  });
  labelStart[labelStars.length] = labels.length;
  return {
    count: json.count,
    constellations: json.constellations,
    spectralTypes: json.spectralTypes,
    keys,
    keyStar,
    labelStars,
    labelStart,
    labels,
    iauStars: Int32Array.from([...iau].sort((a, b) => a - b)),
    hr: column(json.hr),
    hip: column(json.hip),
    hd: column(json.hd),
  };
}

/** First position in a sorted array whose value is ≥ x (numbers). */
function lowerBound(arr: ArrayLike<number>, x: number, lo = 0, hi = arr.length): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First key ≥ q. */
function lowerBoundKey(keys: readonly string[], q: string): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid] < q) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The catalogue number of star i in HR, HIP or HD, or null. */
export function catalogueNumber(t: StarNameTable, cat: CatalogueName, i: number): number | null {
  const c = t[cat];
  const k = lowerBound(c.star, i);
  return k < c.star.length && c.star[k] === i ? c.id[k] : null;
}

/** The stars with a given HR, HIP or HD number. */
export function starsByNumber(t: StarNameTable, cat: CatalogueName, id: number): number[] {
  const c = t[cat];
  let lo = 0;
  let hi = c.byId.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (c.id[c.byId[mid]] < id) lo = mid + 1;
    else hi = mid;
  }
  const out: number[] = [];
  for (let k = lo; k < c.byId.length && c.id[c.byId[k]] === id; k++) out.push(c.star[c.byId[k]]);
  return out;
}

/** All labels of a star, most prominent first: IAU name, other names, Bayer, Flamsteed, variable, GJ, HR, HIP, HD. */
export function starLabels(t: StarNameTable, i: number): string[] {
  const out: string[] = [];
  const j = lowerBound(t.labelStars, i);
  if (j < t.labelStars.length && t.labelStars[j] === i) for (let k = t.labelStart[j]; k < t.labelStart[j + 1]; k++) out.push(t.labels[k]);
  for (const cat of ['hr', 'hip', 'hd'] as const) {
    const n = catalogueNumber(t, cat, i);
    if (n !== null) out.push(`${CATALOGUE_PREFIX[cat]} ${n}`);
  }
  return out;
}

/** The name a star is shown by: its first label, or its catalogue index as a last resort. */
export function starDisplayName(t: StarNameTable, i: number): string {
  return starLabels(t, i)[0] ?? `Star ${i.toLocaleString('en-GB')} of the catalogue`;
}

/** Whether a star's display name is an IAU-approved proper name. */
export function hasIauName(t: StarNameTable, i: number): boolean {
  const k = lowerBound(t.iauStars, i);
  return k < t.iauStars.length && t.iauStars[k] === i;
}

const NUMBER_QUERY = /^(hip|hd|hr)\s?(\d+)$/;

/** Exact lookup (after normalisation): names, designations, and "HIP 70890", "HD 48915", "HR 2491". */
export function findStar(t: StarNameTable, query: string): number[] {
  const q = normalizeName(query);
  const m = q.match(NUMBER_QUERY);
  if (m) return starsByNumber(t, m[1] as CatalogueName, Number(m[2]));
  const out: number[] = [];
  for (let k = lowerBoundKey(t.keys, q); k < t.keys.length && t.keys[k] === q; k++) if (!out.includes(t.keyStar[k])) out.push(t.keyStar[k]);
  return out;
}

export interface StarHit {
  index: number;
  /** The key or number that matched. */
  match: string;
  /** The query names the star exactly (not just the start of one of its names). */
  exact: boolean;
}

/**
 * Stars whose names or designations start with the query: exact matches first, then brighter
 * stars first (lower indices are brighter). Catalogue numbers match exactly.
 */
export function searchStars(t: StarNameTable, query: string, limit = 20): StarHit[] {
  const q = normalizeName(query);
  if (!q) return [];
  const m = q.match(NUMBER_QUERY);
  if (m) return starsByNumber(t, m[1] as CatalogueName, Number(m[2])).slice(0, limit).map((index) => ({ index, match: q, exact: true }));
  const hits = new Map<number, StarHit>();
  // Keys sharing a prefix are adjacent; a short prefix can cover thousands, so the scan is capped.
  const start = lowerBoundKey(t.keys, q);
  for (let k = start, n = 0; k < t.keys.length && n < 20_000 && t.keys[k].startsWith(q); k++, n++) {
    const i = t.keyStar[k];
    const exact = t.keys[k] === q;
    const had = hits.get(i);
    if (!had) hits.set(i, { index: i, match: t.keys[k], exact });
    else if (exact && !had.exact) hits.set(i, { index: i, match: t.keys[k], exact });
  }
  return [...hits.values()].sort((a, b) => Number(b.exact) - Number(a.exact) || a.index - b.index).slice(0, limit);
}

/** The typed arrays of a table, for handing it from the worker without copying. */
export function nameTableTransfer(t: StarNameTable): ArrayBuffer[] {
  const out: ArrayBuffer[] = [t.keyStar.buffer, t.labelStars.buffer, t.labelStart.buffer, t.iauStars.buffer] as ArrayBuffer[];
  for (const c of [t.hr, t.hip, t.hd]) out.push(c.star.buffer as ArrayBuffer, c.id.buffer as ArrayBuffer, c.byId.buffer as ArrayBuffer);
  return out;
}
