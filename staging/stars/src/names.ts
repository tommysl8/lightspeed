/**
 * Star names and catalogue numbers from public/data/star-names.json.gz, with a search index and display names.
 */

export interface StarNamesJson {
  format: 'lightspeed.star-names';
  version: number;
  count: number;
  /** [abbreviation, name, genitive] for the 88 IAU constellations; stars3d-extra's constellation index is 1-based. */
  constellations: [string, string, string][];
  spectralTypes: string[];
  /** [starIndex, name, iau] — iau = 1 when the name is on the IAU WGSN list. */
  proper: [number, string, number][];
  /** [starIndex, Greek letter, superscript (0 = none), constellation abbreviation]. */
  bayer: [number, string, number, string][];
  /** [starIndex, Flamsteed number, constellation abbreviation]. */
  flamsteed: [number, number, string][];
  /** [starIndex, variable-star designation]. */
  variable: [number, string][];
  /** [starIndex, Gliese/GJ number as written in the Gliese–Jahreiß catalogue, e.g. "551" or "244A"]. */
  gliese: [number, string][];
  /** Catalogue numbers as parallel columns; star indices are delta-coded (cumulative sum gives the index). */
  hr: { indexDelta: number[]; id: number[] };
  hip: { indexDelta: number[]; id: number[] };
  hd: { indexDelta: number[]; id: number[] };
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

/** Lower-case, strip accents and punctuation, collapse spaces: the key used for search. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface StarNameIndex {
  /** normalised key → star indices */
  keys: Map<string, number[]>;
  /** Best display name per star (only for stars that have any name). */
  display: Map<number, string>;
  /** All labels of a star, most prominent first. */
  labels: (i: number) => string[];
}

function expand(cols: { indexDelta: number[]; id: number[] }): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  for (let k = 0; k < cols.id.length; k++) {
    i += cols.indexDelta[k];
    out.push([i, cols.id[k]]);
  }
  return out;
}

/** Build the search index. Keys include "sirius", "alpha canis majoris", "alp cma", "α cma", "9 cma", "hip 32349". */
export function buildNameIndex(json: StarNamesJson): StarNameIndex {
  const con = new Map(json.constellations.map(([abbr, name, gen]) => [abbr.toLowerCase(), { abbr, name, gen }]));
  const keys = new Map<string, number[]>();
  const labels = new Map<number, string[]>();
  const put = (key: string, i: number) => {
    const k = normalizeName(key);
    if (!k) return;
    const list = keys.get(k);
    if (!list) keys.set(k, [i]);
    else if (!list.includes(i)) list.push(i);
  };
  const label = (i: number, s: string) => {
    const l = labels.get(i);
    if (!l) labels.set(i, [s]);
    else if (!l.includes(s)) l.push(s);
  };

  for (const [i, name] of [...json.proper].sort((a, b) => b[2] - a[2])) {
    put(name, i);
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
  for (const [prefix, cols] of [['HR', json.hr], ['HIP', json.hip], ['HD', json.hd]] as const) {
    for (const [i, id] of expand(cols)) {
      label(i, `${prefix} ${id}`);
      put(`${prefix} ${id}`, i);
      put(`${prefix}${id}`, i);
    }
  }

  const display = new Map<number, string>();
  for (const [i, l] of labels) display.set(i, l[0]);
  return { keys, display, labels: (i) => labels.get(i) ?? [] };
}

/** Exact lookup (after normalisation). */
export function findStar(index: StarNameIndex, query: string): number[] {
  return index.keys.get(normalizeName(query)) ?? [];
}

/** Prefix search over names, returning up to `limit` distinct stars (brighter stars have lower indices). */
export function searchStars(index: StarNameIndex, query: string, limit = 20): { index: number; match: string }[] {
  const q = normalizeName(query);
  if (!q) return [];
  const hits = new Map<number, string>();
  for (const [k, list] of index.keys) {
    if (!k.startsWith(q)) continue;
    for (const i of list) if (!hits.has(i)) hits.set(i, k);
  }
  return [...hits.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([i, match]) => ({ index: i, match }));
}
