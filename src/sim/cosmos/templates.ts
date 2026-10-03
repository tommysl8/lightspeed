/**
 * Particle templates of galaxies: a few thousand points drawn from the light profiles of each
 * morphological type, which the renderer scales, tilts and brightens to each galaxy's measured
 * size, orientation and luminosity (scene/Galaxies.tsx). They are models: the laws and numbers are
 * typical of each type (below, with sources), not fits to any one galaxy, and every particle is a
 * random draw, not a star.
 *
 * Frame of a template: x along the major axis, y the other in-plane axis, z the disc's normal.
 * Units: 'r25' templates (the discs) are in units of the isophotal radius R25 (RC3's D25/2, where
 * the surface brightness falls to 25 mag/arcsec² in B); 'rh' templates in units of the projected
 * half-light radius (the dwarfs, the ellipticals, the young galaxies); the cluster in megaparsecs.
 *
 * Sources of the typical values:
 *  - Exponential discs with R25 ≈ 4 scale lengths and thin discs about a tenth as thick (van der
 *    Kruit & Freeman 2011, ARA&A 49, 301).
 *  - Bulge-to-total light by type (Sa ≈ 0.4, Sb ≈ 0.25, Sc ≈ 0.1; Simien & de Vaucouleurs 1986,
 *    ApJ 302, 564) and pitch angles of the arms by type (Kennicutt 1981, AJ 86, 1847: about 7° for
 *    Sa to 20° or more for Sc and later).
 *  - Colours: B − V ≈ 1.0 for bulges and ellipticals, 0.8 for old discs, 0 for young arm stars,
 *    typical of the types (Fukugita, Shimasaku & Ichikawa 1995, PASP 107, 945).
 *  - Dwarf spheroidals as Plummer spheres and ellipticals as Hernquist spheres (Hernquist 1990,
 *    ApJ 356, 359), both scaled to their half-light radius.
 * Each particle's splat is as wide as the distance to its eighth-nearest neighbour of the same
 * population, as in the Milky Way model (docs/data/galaxy.md), so the light adds up to a smooth
 * surface.
 */
import { bvToTemperature, blackbodyRgb } from '../../physics/blackbody';

export type TemplateId =
  | 'spiral-early'
  | 'spiral'
  | 'spiral-late'
  | 'barred'
  | 'magellanic'
  | 'lenticular'
  | 'irregular'
  | 'spheroidal'
  | 'elliptical'
  | 'compact'
  | 'cluster'
  | 'point';

export const TEMPLATE_IDS: readonly TemplateId[] = [
  'spiral-early',
  'spiral',
  'spiral-late',
  'barred',
  'magellanic',
  'lenticular',
  'irregular',
  'spheroidal',
  'elliptical',
  'compact',
  'cluster',
  'point',
];

export interface Template {
  id: TemplateId;
  unit: 'r25' | 'rh' | 'mpc';
  count: number;
  /** x, y, z in template units. */
  position: Float32Array;
  /** Linear RGB, luminance 1. */
  colour: Float32Array;
  /** Per particle: share of the galaxy's light, splat radius (1σ, template units), ln T of its colour (for the Doppler shift), population. */
  attrs: Float32Array;
  /** Projected half-light radius seen face-on, template units (1 for the 'rh' templates). */
  halfLightRadius: number;
  /** How many times the particles of the plain template it has (1; HD_DETAIL for the fine ones drawn up close). */
  detail: number;
}

/**
 * The fine templates, drawn for a galaxy large on screen (scene/Galaxies.tsx): this many times the particles of each
 * population but the H II regions (single objects), each splat correspondingly smaller (its 8th neighbour is nearer).
 */
export const HD_DETAIL: Partial<Record<TemplateId, number>> = {
  'spiral-early': 8,
  spiral: 8,
  'spiral-late': 8,
  barred: 8,
  magellanic: 8,
  lenticular: 8,
  irregular: 4,
};

/** What a population of a template is made of. */
interface Population {
  share: number;
  count: number;
  bv: number;
  /** A fixed colour (H II regions: their emission lines, not a blackbody). */
  rgb?: [number, number, number];
  sample: (r: () => number, out: number[]) => void;
  /** Single objects (the H II regions): as many in a fine template as in the plain one. */
  single?: boolean;
}

/** mulberry32: a small generator with a fixed seed, so every run draws the same galaxies. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r: () => number): number => {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};
/** A radius drawn from a face-on exponential disc of scale h (Σ ∝ e^(−R/h): R e^(−R/h), a Gamma(2) law), up to rMax. */
function discRadius(r: () => number, h: number, rMax: number): number {
  for (;;) {
    const R = -h * Math.log(Math.max(1e-12, r() * r()));
    if (R <= rMax) return R;
  }
}
/** A height from sech²(z / 2h0)-like law, approximated by a Laplace (exponential) law of scale hz. */
const discHeight = (r: () => number, hz: number): number => (r() < 0.5 ? 1 : -1) * -hz * Math.log(Math.max(1e-12, r()));

/** A radius from a Plummer sphere of scale a (its projected half-light radius is a). */
function plummerRadius(r: () => number, a: number, rMax: number): number {
  for (;;) {
    const m = r() * 0.999;
    const R = a / Math.sqrt(m ** (-2 / 3) - 1);
    if (R <= rMax) return R;
  }
}
/** A radius from a Hernquist sphere of scale a (projected half-light radius 1.8153 a). */
function hernquistRadius(r: () => number, a: number, rMax: number): number {
  for (;;) {
    const u = Math.sqrt(r() * 0.9999);
    const R = (a * u) / (1 - u);
    if (R <= rMax) return R;
  }
}
function isotropic(r: () => number, R: number, out: number[], qx = 1, qy = 1, qz = 1): void {
  const z = 2 * r() - 1;
  const phi = 2 * Math.PI * r();
  const s = Math.sqrt(1 - z * z);
  out.push(R * s * Math.cos(phi) * qx, R * s * Math.sin(phi) * qy, R * z * qz);
}

// ─── The building blocks ─────────────────────────────────────────────────────────────────

const H_R = 0.25; // disc scale length, R25 units (R25 ≈ 4 h)
const H_Z = 0.025; // thin old disc, R25 units (about a tenth of h)

const oldDisc = (share: number, count: number, bv = 0.8): Population => ({
  share,
  count,
  bv,
  sample(r, out) {
    const R = discRadius(r, H_R, 1.6);
    const phi = 2 * Math.PI * r();
    out.push(R * Math.cos(phi), R * Math.sin(phi), discHeight(r, H_Z));
  },
});

/** Young stars along m logarithmic arms of pitch ψ (degrees), from rStart outwards, winding counterclockwise outwards seen from +z. */
const arms = (share: number, count: number, pitchDeg: number, m = 2, rStart = 0.12, width = 0.035, bv = -0.05): Population => ({
  share,
  count,
  bv,
  sample(r, out) {
    const R = Math.max(rStart, discRadius(r, H_R * 1.2, 1.3));
    const k = Math.floor(r() * m);
    const ridge = Math.log(R / rStart) / Math.tan((pitchDeg * Math.PI) / 180) + (2 * Math.PI * k) / m;
    const phi = ridge + (gauss(r) * width) / R;
    out.push(R * Math.cos(phi), R * Math.sin(phi), discHeight(r, H_Z * 0.35));
  },
});

/** H II regions: clumps of glowing gas on the arms (their emission lines, pink). */
const hiiRegions = (share: number, count: number, pitchDeg: number, m = 2, rStart = 0.12): Population => {
  let centre: [number, number, number] = [0, 0, 0];
  let left = 0;
  return {
    share,
    count,
    bv: 0,
    rgb: [2.1, 0.62, 0.95],
    single: true,
    sample(r, out) {
      if (left <= 0) {
        const R = Math.max(rStart, discRadius(r, H_R * 1.2, 1.1));
        const k = Math.floor(r() * m);
        const phi = Math.log(R / rStart) / Math.tan((pitchDeg * Math.PI) / 180) + (2 * Math.PI * k) / m + (gauss(r) * 0.02) / R;
        centre = [R * Math.cos(phi), R * Math.sin(phi), discHeight(r, H_Z * 0.2)];
        left = 6;
      }
      left--;
      out.push(centre[0] + gauss(r) * 0.008, centre[1] + gauss(r) * 0.008, centre[2] + gauss(r) * 0.003);
    },
  };
};

/** A bulge: a flattened Hernquist sphere of half-light radius re (template units). */
const bulge = (share: number, count: number, re: number, q = 0.75, bv = 1.0): Population => ({
  share,
  count,
  bv,
  sample(r, out) {
    isotropic(r, hernquistRadius(r, re / 1.8153, 20 * re), out, 1, 1, q);
  },
});

/** A bar along x: exp(−√((x/a)² + (y/b)²)) with a thin vertical exponential. */
const bar = (share: number, count: number, a: number, b: number, c: number, bv = 0.9, offsetX = 0): Population => ({
  share,
  count,
  bv,
  sample(r, out) {
    const s = -Math.log(Math.max(1e-12, r() * r()));
    const t = 2 * Math.PI * r();
    out.push(offsetX + a * s * Math.cos(t), b * s * Math.sin(t), discHeight(r, c));
  },
});

/** Clumps of young stars scattered through an irregular body. */
const clumps = (share: number, count: number, spread: number, clumpSize: number, perClump: number, bv = 0.0, thick = 0.5): Population => {
  let centre: [number, number, number] = [0, 0, 0];
  let left = 0;
  return {
    share,
    count,
    bv,
    sample(r, out) {
      if (left <= 0) {
        const R = discRadius(r, spread, 3 * spread * 2);
        const phi = 2 * Math.PI * r();
        centre = [R * Math.cos(phi), R * Math.sin(phi), gauss(r) * spread * thick * 0.5];
        left = perClump;
      }
      left--;
      out.push(centre[0] + gauss(r) * clumpSize, centre[1] + gauss(r) * clumpSize, centre[2] + gauss(r) * clumpSize * thick);
    },
  };
};

/** An exponential ellipsoid (the smooth body of an irregular): axes 1 : 1 : c. */
const blob = (share: number, count: number, scale: number, c: number, bv: number): Population => ({
  share,
  count,
  bv,
  sample(r, out) {
    const R = -scale * Math.log(Math.max(1e-12, r() * r() * r()));
    isotropic(r, Math.min(R, 8 * scale), out, 1, 1, c);
  },
});

// ─── The templates ───────────────────────────────────────────────────────────────────────

interface TemplateDef {
  unit: 'r25' | 'rh' | 'mpc';
  seed: number;
  populations: Population[];
  /** Which neighbour sets the splat size (default the eighth; fewer for sharper detail, such as a dust lane across a bulge). */
  neighbour?: number;
}

const DEFS: Record<Exclude<TemplateId, 'point'>, () => TemplateDef> = {
  // Sa–Sab: a big bulge and tightly wound arms (M81).
  'spiral-early': () => ({
    unit: 'r25',
    seed: 11,
    populations: [bulge(0.38, 900, 0.07), oldDisc(0.47, 1900, 0.85), arms(0.13, 1100, 9), hiiRegions(0.02, 196, 9)],
  }),
  // Sb–Sbc: Andromeda, the Whirlpool.
  spiral: () => ({
    unit: 'r25',
    seed: 12,
    populations: [bulge(0.25, 700, 0.055), oldDisc(0.55, 2000, 0.8), arms(0.17, 1200, 13), hiiRegions(0.03, 196, 13)],
  }),
  // Sc–Sd: a small bulge and open, flocculent arms (Triangulum).
  'spiral-late': () => ({
    unit: 'r25',
    seed: 13,
    populations: [bulge(0.06, 300, 0.04, 0.8, 0.9), oldDisc(0.62, 2000, 0.7), arms(0.27, 1500, 20, 2, 0.08, 0.05), hiiRegions(0.05, 296, 20, 2, 0.08)],
  }),
  // SB: a bar a quarter of R25 long, with the arms starting at its ends.
  barred: () => ({
    unit: 'r25',
    seed: 14,
    populations: [bulge(0.12, 400, 0.04), bar(0.13, 600, 0.09, 0.03, 0.02), oldDisc(0.55, 1800, 0.8), arms(0.17, 1100, 14, 2, 0.24), hiiRegions(0.03, 196, 14, 2, 0.24)],
  }),
  // Sm, the Large Magellanic Cloud: an off-centre bar in a thick disc, one dominant arm and bright
  // star-forming regions (de Vaucouleurs & Freeman 1972, Vistas in Astronomy 14, 163).
  magellanic: () => ({
    unit: 'r25',
    seed: 15,
    populations: [
      bar(0.22, 700, 0.12, 0.04, 0.04, 0.75, 0.05),
      oldDisc(0.46, 1400, 0.6),
      arms(0.16, 600, 25, 1, 0.2, 0.06, 0.0),
      clumps(0.12, 350, 0.25, 0.02, 7, -0.1, 0.3),
      hiiRegions(0.04, 120, 25, 1, 0.2),
    ],
  }),
  // A big bulge and a thin smooth disc (the Sombrero Galaxy, drawn edge-on as seen).
  lenticular: () => ({
    unit: 'r25',
    seed: 16,
    populations: [bulge(0.72, 2800, 0.14, 0.8, 1.0), oldDisc(0.28, 1300, 0.9)],
    // Smaller splats, so the dust lane across the bulge is not filled in by its neighbours' light.
    neighbour: 4,
  }),
  // Dwarf irregulars, transition dwarfs and the Small Magellanic Cloud: a thick smooth body with
  // clumps of young stars.
  irregular: () => ({
    unit: 'rh',
    seed: 17,
    populations: [blob(0.7, 1300, 0.45, 0.55, 0.55), clumps(0.26, 640, 0.35, 0.06, 8, 0.0, 0.6), hiiRegions(0.04, 108, 40, 3, 0.2)],
  }),
  // Dwarf spheroidals and dwarf ellipticals: old stars in a Plummer sphere.
  spheroidal: () => ({
    unit: 'rh',
    seed: 18,
    populations: [
      {
        share: 1,
        count: 1024,
        bv: 0.72,
        sample(r, out) {
          isotropic(r, plummerRadius(r, 1, 6), out);
        },
      },
    ],
  }),
  // Giant and compact ellipticals: a Hernquist sphere.
  elliptical: () => ({
    unit: 'rh',
    seed: 19,
    populations: [
      {
        share: 1,
        count: 2048,
        bv: 0.96,
        sample(r, out) {
          isotropic(r, hernquistRadius(r, 1 / 1.8153, 15), out);
        },
      },
    ],
  }),
  // A young galaxy of the first few hundred million years: compact, blue and clumpy, as JWST
  // resolves them (Tacchella et al. 2023; Carniani et al. 2024).
  compact: () => ({
    unit: 'rh',
    seed: 20,
    populations: [blob(0.6, 600, 0.5, 0.8, -0.15), clumps(0.4, 424, 0.35, 0.08, 53, -0.2, 0.8)],
  }),
  // A cluster of galaxies: two groups of elliptical galaxies (the Bullet Cluster's two merging
  // clusters, about 0.7 Mpc apart on the sky; Clowe et al. 2006). Illustrative: where each galaxy
  // sits is a random draw. Unit: 1 Mpc.
  cluster: () => {
    const group = (share: number, count: number, x: number, a: number, perGalaxy: number): Population => {
      let centre: [number, number, number] = [0, 0, 0];
      let left = 0;
      let size = 0.01;
      return {
        share,
        count,
        bv: 0.96,
        sample(r, out) {
          if (left <= 0) {
            const R = plummerRadius(r, a, 4 * a);
            const t: number[] = [];
            isotropic(r, R, t);
            centre = [x + t[0], t[1], t[2]];
            size = 0.004 + 0.012 * r() * r();
            left = perGalaxy;
          }
          left--;
          const u: number[] = [];
          isotropic(r, hernquistRadius(r, size / 1.8153, 6 * size), u);
          out.push(centre[0] + u[0], centre[1] + u[1], centre[2] + u[2]);
        },
      };
    };
    return { unit: 'mpc', seed: 21, populations: [group(0.7, 2048, -0.25, 0.3, 32), group(0.3, 1024, 0.47, 0.15, 32)] };
  },
};

/** The eighth-nearest-neighbour distance of every point of one population (brute force: a few thousand points). */
/**
 * Each point's distance to its k-th nearest neighbour among points from…to − 1: exact, on a grid of cells (about two
 * points a cell) searched in growing shells until no nearer point can be left, so the fine templates' tens of
 * thousands of points take milliseconds rather than seconds.
 */
export function neighbourDistances(p: Float32Array, from: number, to: number, k = 8): Float32Array {
  const n = to - from;
  const out = new Float32Array(n);
  if (n < 2) return out;
  const kk = Math.min(k, n - 1);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = from; i < to; i++)
    for (let c = 0; c < 3; c++) {
      lo[c] = Math.min(lo[c], p[3 * i + c]);
      hi[c] = Math.max(hi[c], p[3 * i + c]);
    }
  const ext = hi.map((h, c) => Math.max(h - lo[c], 1e-9));
  // Cubic cells sized for about two points each over the bounding box (a flat disc gets one layer of cells).
  const cell = Math.max(Math.cbrt((ext[0] * ext[1] * ext[2] * 2) / n), Math.max(...ext) / 256, 1e-9);
  const dim = ext.map((e) => Math.max(1, Math.min(256, Math.ceil(e / cell))));
  const cellOf = (v: number, c: number) => Math.min(dim[c] - 1, Math.floor((v - lo[c]) / cell));
  const key = (a: number, b: number, c: number) => (c * dim[1] + b) * dim[0] + a;
  const start = new Int32Array(dim[0] * dim[1] * dim[2] + 1);
  const home = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const q = 3 * (from + i);
    home[i] = key(cellOf(p[q], 0), cellOf(p[q + 1], 1), cellOf(p[q + 2], 2));
    start[home[i] + 1]++;
  }
  for (let c = 1; c < start.length; c++) start[c] += start[c - 1];
  const fill = start.slice(0, -1);
  const members = new Int32Array(n);
  for (let i = 0; i < n; i++) members[fill[home[i]]++] = i;
  const best = new Float64Array(kk);
  for (let i = 0; i < n; i++) {
    best.fill(Infinity);
    const q = 3 * (from + i);
    const xi = p[q];
    const yi = p[q + 1];
    const zi = p[q + 2];
    const ci = [cellOf(xi, 0), cellOf(yi, 1), cellOf(zi, 2)];
    for (let r = 0; ; r++) {
      // The shell r cells out (its surface only).
      for (let c2 = Math.max(0, ci[2] - r); c2 <= Math.min(dim[2] - 1, ci[2] + r); c2++)
        for (let b = Math.max(0, ci[1] - r); b <= Math.min(dim[1] - 1, ci[1] + r); b++)
          for (let a = Math.max(0, ci[0] - r); a <= Math.min(dim[0] - 1, ci[0] + r); a++) {
            if (Math.max(Math.abs(a - ci[0]), Math.abs(b - ci[1]), Math.abs(c2 - ci[2])) !== r) continue;
            const kc = key(a, b, c2);
            for (let m = start[kc]; m < start[kc + 1]; m++) {
              const j = members[m];
              if (j === i) continue;
              const o = 3 * (from + j);
              const dx = p[o] - xi;
              const dy = p[o + 1] - yi;
              const dz = p[o + 2] - zi;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 >= best[kk - 1]) continue;
              let s = kk - 1;
              while (s > 0 && best[s - 1] > d2) {
                best[s] = best[s - 1];
                s--;
              }
              best[s] = d2;
            }
          }
      // Every point not yet searched is at least r cells of the grid away (less the point's offset in its own cell).
      const reach = r * cell;
      if (best[kk - 1] <= reach * reach) break;
      if (r > Math.max(...dim)) break;
    }
    out[i] = Math.sqrt(best[kk - 1]);
  }
  return out;
}

/** The face-on projected half-light radius of a set of weighted points. */
export function projectedHalfLight(position: Float32Array, weight: (i: number) => number, count: number): number {
  const r = new Float64Array(count);
  const idx = new Uint32Array(count);
  let total = 0;
  for (let i = 0; i < count; i++) {
    r[i] = Math.hypot(position[3 * i], position[3 * i + 1]);
    idx[i] = i;
    total += weight(i);
  }
  const sorted = Array.from(idx).sort((a, b) => r[a] - r[b]);
  let acc = 0;
  for (const i of sorted) {
    acc += weight(i);
    if (acc >= total / 2) return r[i];
  }
  return r[sorted[sorted.length - 1]];
}

const ATTRS = 4;

/** Build one template (deterministic). */
export function buildTemplate(id: TemplateId, detail = 1): Template {
  if (id === 'point') {
    // One splat holding all the light: a galaxy too small on screen for its shape to show. Its
    // Gaussian has the half-light radius of the galaxy (σ = r_h / 1.1774).
    const attrs = new Float32Array([1, 1 / 1.1774, Math.log(bvToTemperature(0.7)), 0]);
    const rgb = blackbodyRgb(bvToTemperature(0.7));
    return { id, unit: 'rh', count: 1, position: new Float32Array(3), colour: new Float32Array(rgb), attrs, halfLightRadius: 1, detail: 1 };
  }
  const plain = DEFS[id]();
  const def = detail === 1 ? plain : { ...plain, populations: plain.populations.map((p) => (p.single ? p : { ...p, count: p.count * detail })) };
  const r = rng(def.seed);
  const count = def.populations.reduce((a, p) => a + p.count, 0);
  const position = new Float32Array(3 * count);
  const colour = new Float32Array(3 * count);
  const attrs = new Float32Array(ATTRS * count);
  let at = 0;
  const tmp: number[] = [];
  def.populations.forEach((pop, pi) => {
    const T = bvToTemperature(pop.bv);
    const base = pop.rgb ?? blackbodyRgb(T);
    const lum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
    const from = at;
    for (let k = 0; k < pop.count; k++, at++) {
      tmp.length = 0;
      pop.sample(r, tmp);
      position.set(tmp, 3 * at);
      colour.set([base[0] / lum, base[1] / lum, base[2] / lum], 3 * at);
      attrs[ATTRS * at] = pop.share / pop.count;
      attrs[ATTRS * at + 2] = Math.log(T);
      attrs[ATTRS * at + 3] = pi;
    }
    const nn = neighbourDistances(position, from, at, def.neighbour ?? 8);
    for (let k = 0; k < nn.length; k++) attrs[ATTRS * (from + k) + 1] = nn[k];
  });
  let halfLight = projectedHalfLight(position, (i) => attrs[ATTRS * i], count);
  if (def.unit === 'rh') {
    // Scale to a projected half-light radius of exactly 1.
    const s = 1 / halfLight;
    for (let i = 0; i < 3 * count; i++) position[i] *= s;
    for (let i = 0; i < count; i++) attrs[ATTRS * i + 1] *= s;
    halfLight = 1;
  }
  // Splats no smaller than a thousandth of the unit nor larger than half of it.
  for (let i = 0; i < count; i++) attrs[ATTRS * i + 1] = Math.min(0.5, Math.max(0.001, attrs[ATTRS * i + 1]));
  return { id, unit: def.unit, count, position, colour, attrs, halfLightRadius: halfLight, detail };
}

/** Every plain template, and the fine ones (HD_DETAIL). */
export const buildTemplates = (): Template[] => [
  ...TEMPLATE_IDS.map((id) => buildTemplate(id)),
  ...(Object.entries(HD_DETAIL) as [TemplateId, number][]).map(([id, k]) => buildTemplate(id, k)),
];

export const templateTransfer = (ts: readonly Template[]): ArrayBuffer[] => ts.flatMap((t) => [t.position.buffer, t.colour.buffer, t.attrs.buffer] as ArrayBuffer[]);

/**
 * The template of a galaxy from its class and morphological type (RC3's, when there is one):
 * SA…a/ab → early spiral, SA…b/bc → spiral, SA…c/cd/d → late spiral, SB (not m) → barred, …m (the
 * Magellanic spirals) → Magellanic, E and cE → elliptical, dE and dwarf spheroidals → spheroidal,
 * dwarf irregulars, transition dwarfs and the SMC → irregular. The Sombrero Galaxy is drawn as a
 * lenticular (its bulge holds most of its light) and Centaurus A as an elliptical (its dust disc is
 * not modelled).
 */
export function templateFor(cls: string, type: string | null | undefined, id?: string): TemplateId {
  if (id === 'sombrero') return 'lenticular';
  switch (cls) {
    case 'high-z':
      return 'compact';
    case 'cluster':
      return 'cluster';
    case 'elliptical':
    case 'compact-elliptical':
    case 'lenticular-peculiar':
      return 'elliptical';
    case 'dwarf-spheroidal':
    case 'dwarf-elliptical':
    case 'unknown':
      return 'spheroidal';
    case 'dwarf-irregular':
    case 'transition':
    case 'irregular':
    case 'magellanic-irregular':
      return 'irregular';
    case 'magellanic-spiral':
      return 'magellanic';
  }
  const t = type ?? '';
  if (/^SB/.test(t) && !/\)m/.test(t)) return 'barred';
  if (/\)m/.test(t)) return 'magellanic';
  const stage = t.match(/\)\s*([a-d]{1,2})/)?.[1] ?? 'b';
  if (stage === 'a' || stage === 'ab') return 'spiral-early';
  if (stage === 'b' || stage === 'bc') return 'spiral';
  return 'spiral-late';
}
