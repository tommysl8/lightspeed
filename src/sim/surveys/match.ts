/**
 * Finding the same galaxy in two catalogues by its place on the sky (scripts/build-surveys.mjs; docs/data/surveys.md
 * §2). Two surveys that took a spectrum of one galaxy list it at positions a fraction of an arcsecond apart: the
 * research measured 278,339 DESI galaxies within 1.5″ of an SDSS one, and all but 0.1 % of those pairs agree in
 * redshift to within 600 km/s. A match within SURVEY_MATCH_ARCSEC is therefore taken as the same galaxy whatever the
 * redshifts say, and the higher-priority survey keeps it.
 *
 * How: the indexed points are sorted into cells of a grid on the sky, bands of declination as high as the match
 * radius, each band cut into runs of right ascension about as wide (wider towards the poles, where a degree of right
 * ascension shrinks); a query looks in the cells within the radius (three bands, a few cells each, across 0h/24h too)
 * and compares the true angle to each point found there. Sorting is a two-pass radix sort of the cells' keys, so
 * indexing 11 million galaxies takes a second or two.
 */

/** Two survey entries this close on the sky are the same galaxy, arcsec (DESI's fibres are 1.5″ across). */
export const SURVEY_MATCH_ARCSEC = 1.5;
/** Cosmicflows-4's positions (from PGC) are coarser: its galaxies are matched within this, arcsec… */
export const CF4_MATCH_ARCSEC = 6;
/** …and only when the velocities agree to this, km/s (so a background galaxy behind a CF4 one is kept). */
export const CF4_MATCH_KM_S = 800;

const DEG = Math.PI / 180;
const LO_BITS = 2 ** 21;

/** An index of points on the sky (right ascension and declination in degrees) for matches within `radiusArcsec`. */
export class SkyIndex {
  readonly count: number;
  private readonly ra: ArrayLike<number>;
  private readonly dec: ArrayLike<number>;
  /** Band height and match radius, degrees. */
  private readonly h: number;
  private readonly cosR: number;
  private readonly bands: number;
  /** Each band's cell width in right ascension (degrees) and cell count. */
  private readonly width: Float64Array;
  private readonly cells: Uint32Array;
  /** The points' keys, sorted, and the point at each place. */
  private readonly keys: Float64Array;
  private readonly order: Uint32Array;

  constructor(ra: ArrayLike<number>, dec: ArrayLike<number>, radiusArcsec: number, count = ra.length) {
    this.count = count;
    this.ra = ra;
    this.dec = dec;
    this.h = radiusArcsec / 3600;
    this.cosR = Math.cos(this.h * DEG);
    this.bands = Math.ceil(180 / this.h) + 1;
    this.width = new Float64Array(this.bands);
    this.cells = new Uint32Array(this.bands);
    for (let b = 0; b < this.bands; b++) {
      const c = Math.cos(Math.min(90, Math.abs(-90 + (b + 0.5) * this.h)) * DEG);
      const n = Math.max(1, Math.min(Math.floor(360 / this.h), Math.floor((360 * c) / this.h)));
      this.cells[b] = n;
      this.width[b] = 360 / n;
    }
    const key = new Float64Array(count);
    for (let i = 0; i < count; i++) key[i] = this.keyOf(ra[i], dec[i]);
    this.order = radixOrder(key);
    this.keys = new Float64Array(count);
    for (let i = 0; i < count; i++) this.keys[i] = key[this.order[i]];
  }

  private band(dec: number): number {
    return Math.max(0, Math.min(this.bands - 1, Math.floor((dec + 90) / this.h)));
  }

  private keyOf(ra: number, dec: number): number {
    const b = this.band(dec);
    const r = ((ra % 360) + 360) % 360;
    return b * LO_BITS + Math.min(this.cells[b] - 1, Math.floor(r / this.width[b]));
  }

  /** First place whose key is at least k. */
  private lowerBound(k: number): number {
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (this.keys[m] < k) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  /**
   * The nearest indexed point within the radius of (ra, dec), degrees, or −1. `accept(i)` may turn a candidate down
   * (Cosmicflows-4's velocity test).
   */
  nearest(ra: number, dec: number, accept?: (i: number) => boolean): number {
    const a = ra * DEG;
    const d = dec * DEG;
    const x = Math.cos(d) * Math.cos(a);
    const y = Math.cos(d) * Math.sin(a);
    const z = Math.sin(d);
    const b0 = this.band(dec);
    // Half the width in right ascension a circle of the radius spans at its widest declination.
    const reach = Math.min(90, Math.abs(dec) + this.h);
    const cosReach = Math.cos(reach * DEG);
    const half = cosReach > 1e-9 ? this.h / cosReach : 360;
    let best = -1;
    let bestCos = this.cosR;
    for (let b = Math.max(0, b0 - 1); b <= Math.min(this.bands - 1, b0 + 1); b++) {
      const n = this.cells[b];
      const w = this.width[b];
      const r = ((ra % 360) + 360) % 360;
      let c0 = Math.floor((r - half) / w);
      let c1 = Math.floor((r + half) / w);
      if (c1 - c0 + 1 >= n) {
        c0 = 0;
        c1 = n - 1;
      }
      for (let c = c0; c <= c1; c++) {
        const cell = ((c % n) + n) % n;
        const k = b * LO_BITS + cell;
        for (let p = this.lowerBound(k); p < this.count && this.keys[p] === k; p++) {
          const i = this.order[p];
          const ai = this.ra[i] * DEG;
          const di = this.dec[i] * DEG;
          const cos = x * Math.cos(di) * Math.cos(ai) + y * Math.cos(di) * Math.sin(ai) + z * Math.sin(di);
          if (cos >= bestCos && (!accept || accept(i))) {
            bestCos = cos;
            best = i;
          }
        }
      }
    }
    return best;
  }
}

/** The permutation that sorts non-negative integer keys below 2^41 (two passes of a radix sort on 21 and 20 bits). */
function radixOrder(key: Float64Array): Uint32Array {
  const n = key.length;
  const lo = new Uint32Array(n);
  const hi = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const h = Math.floor(key[i] / LO_BITS);
    hi[i] = h;
    lo[i] = key[i] - h * LO_BITS;
  }
  const pass = (digit: Uint32Array, input: Uint32Array, size: number): Uint32Array => {
    const count = new Uint32Array(size + 1);
    for (let i = 0; i < n; i++) count[digit[input[i]] + 1]++;
    for (let i = 0; i < size; i++) count[i + 1] += count[i];
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[count[digit[input[i]]]++] = input[i];
    return out;
  };
  const start = new Uint32Array(n);
  for (let i = 0; i < n; i++) start[i] = i;
  let maxHi = 0;
  for (let i = 0; i < n; i++) if (hi[i] > maxHi) maxHi = hi[i];
  return pass(hi, pass(lo, start, LO_BITS), maxHi + 1);
}

/**
 * Merge catalogues in priority order: `sets` are {ra, dec, count} each; returns for each set a Uint8Array flag, 1
 * where the entry is new (no entry of an earlier set, or an earlier new entry of its own, lies within `radiusArcsec`).
 * Entries of the same set are not matched against each other.
 */
export function dedupe(sets: readonly { ra: ArrayLike<number>; dec: ArrayLike<number>; count: number }[], radiusArcsec = SURVEY_MATCH_ARCSEC): Uint8Array[] {
  const kept: Uint8Array[] = [];
  const indices: SkyIndex[] = [];
  for (const s of sets) {
    const flag = new Uint8Array(s.count);
    for (let i = 0; i < s.count; i++) {
      let dup = false;
      for (const ix of indices) {
        if (ix.nearest(s.ra[i], s.dec[i]) >= 0) {
          dup = true;
          break;
        }
      }
      flag[i] = dup ? 0 : 1;
    }
    kept.push(flag);
    // Index this set's new entries for the sets after it.
    let m = 0;
    for (let i = 0; i < s.count; i++) m += flag[i];
    const ra = new Float64Array(m);
    const dec = new Float64Array(m);
    for (let i = 0, j = 0; i < s.count; i++) {
      if (!flag[i]) continue;
      ra[j] = s.ra[i];
      dec[j++] = s.dec[i];
    }
    indices.push(new SkyIndex(ra, dec, radiusArcsec));
  }
  return kept;
}
