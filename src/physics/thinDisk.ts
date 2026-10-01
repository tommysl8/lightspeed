/**
 * A thin accretion disc round a Schwarzschild black hole, in float64: its temperature, the frequency shift of its
 * light, and where each backward ray from the camera meets it.
 *
 * What (docs/data/blackholes.md §12): a geometrically thin, optically thick disc in the hole's equatorial plane,
 * from the innermost stable circular orbit (6M) out, its gas on circular Keplerian orbits. Its temperature is the
 * Novikov–Thorne one (Page & Thorne 1974, in the closed form for no spin that Luminet 1979 quotes): the flux
 * F(r) = (3GMṀ/8πr_g³) f(r), f = [√r − √6 + (√3/2) ln((√r + √3)(√6 − √3)/((√r − √3)(√6 + √3)))]/((r − 3) r^(5/2)) in
 * units of r_g = GM/c², zero at the inner edge (no torque there) and 1/r³ far out, each ring a blackbody at
 * (F/σ)^(1/4). Its light reaches a distant observer shifted by g = √(1 − 3/r)/(1 − Ω L_z) (Ω = r^(−3/2), L_z the
 * photon's angular momentum about the disc's axis per unit energy), so a blackbody of temperature T arrives as one of
 * g T (I_ν/ν³ is conserved along the ray).
 *
 * How the rays meet it: a ray stays in a plane through the hole, where its orbit u(ψ) = 1/r is a function of its
 * impact parameter b alone if ψ is measured from where it comes in from infinity (or, for a ray that falls in, from
 * infinity along its incoming leg). So one table holds every orbit, for every camera: rows in b (orbits that fall in,
 * b < b_c, and orbits that escape, b > b_c, each crowding at b_c), columns uniform in ψ from infinity to the
 * periapsis (or the horizon), holding v = b·u (v″ = 3v²/b − v), integrated by RK4 both ways from a point known in
 * closed form (the periapsis, or where a falling orbit crosses the photon sphere): within 3e−8 in u of Carlson's
 * sweeps (physics/schwarzschild.ts). A camera at r_c sits on each orbit at ψ_c, the sweep from infinity to u_c = 1/r_c,
 * one number a row, rebuilt when r_c changes. A backward ray from the camera reaches the disc's plane at the swept
 * angles Δ_k = Δ_0 + kπ (Δ_0 from where the ray's plane cuts the disc's), the k-th crossing's radius read from the
 * table where the ray is on its orbit (diskRayCrossings). k = 0 is the direct
 * image, k = 1 the disc's far side lensed over the top of the shadow and under it, k = 2 a thin ring at the photon
 * ring. The disc is opaque: the first crossing between its edges ends the ray.
 *
 * Why one universal table: the disc's image depends on where the camera is and how the disc is tilted, but neither
 * changes the orbits, so tilting the disc or flying round it costs no rebuild; only r_c does, and that is 512 closed
 * forms.
 *
 * Cost: the orbit table once (19 ms of RK4 on the target laptop, the first time a disc is near), 1 MB as float32;
 * the camera's row data 512 closed-form sweeps when r_c changes (0.08 ms).
 *
 * Twins: render/shaders/diskLookup.glsl (the same crossing in float32, line for line with diskRayCrossings),
 * render/disk/diskMap.ts (the textures). Checked against scripts/thin-disk/disk_ref.py (mpmath and an independent
 * 3-D integration of the geodesic), whose output is src/physics/__fixtures__/thinDisk.json.
 */
import { BC, escapeSweepInto, rootsComplexInto, rootsRealInto, shadowAngle, sweepBetweenComplex, sweepBetweenReal, sweepToPeriapsis, type ComplexRoots, type LensObserver, type RealRoots, type SweepSample } from './schwarzschild';
import { C_KM_S, GM_SUN_KM3_S2 } from './constants';

/** The innermost stable circular orbit of a hole that does not spin, units of M. */
export const ISCO_M = 6;
/** The radiative efficiency of a Novikov–Thorne disc with no spin: 1 − E_isco = 1 − √(8/9). */
export const NT_EFFICIENCY = 1 - Math.sqrt(8 / 9);
/** Where f(r) peaks (its derivative's root, by bisection: tested), units of M. */
export const NT_PEAK_M = 9.550928;

const SQ3 = Math.sqrt(3);
const SQ6 = Math.sqrt(6);
const LN_ISCO = Math.log((SQ6 - SQ3) / (SQ6 + SQ3));

/**
 * The Novikov–Thorne flux's shape f(r) for no spin (units of M): F = (3GMṀ/8πr_g³) f(r). 0 at and inside the
 * inner edge; 1/r³ (1 − √(6/r) + …) far out.
 */
export function ntFluxShape(r: number): number {
  if (!(r > ISCO_M)) return 0;
  const x = Math.sqrt(r);
  const num = x - SQ6 + (SQ3 / 2) * (Math.log((x + SQ3) / (x - SQ3)) + LN_ISCO);
  return num / ((r - 3) * r * r * x);
}

/** Stefan–Boltzmann constant, erg cm⁻² s⁻¹ K⁻⁴ (CODATA 2018, exact from h, k and c). */
const SIGMA_CGS = 5.670374419e-5;
const C_CM_S = C_KM_S * 1e5;

/** ln of T* (K), T*⁴ = 3GMṀ/(8πσ r_g³) = 3c⁶Ṁ/(8πσ(GM)²): each ring's temperature is T* f(r)^(1/4). */
export function ntLnTStar(massMsun: number, mdotGs: number): number {
  const gm = massMsun * GM_SUN_KM3_S2 * 1e15; // cm³/s²
  const lnT4 = Math.log(3) + 6 * Math.log(C_CM_S) + Math.log(mdotGs) - Math.log(8 * Math.PI * SIGMA_CGS) - 2 * Math.log(gm);
  return lnT4 / 4;
}

/** ln T (K) of the ring at r (units of M) for ln T*; −Infinity at and inside the inner edge. */
export function ntLnTemperature(r: number, lnTStar: number): number {
  const f = ntFluxShape(r);
  return f > 0 ? lnTStar + 0.25 * Math.log(f) : -Infinity;
}

/**
 * The accretion rate (g/s) that gives a disc of no spin the luminosity l L_Edd: Ṁ = l L_Edd / (η c²), η the
 * Novikov–Thorne efficiency for no spin.
 */
export function mdotFromEddington(l: number, lEddErgS: number): number {
  return (l * lEddErgS) / (NT_EFFICIENCY * C_CM_S * C_CM_S);
}

/**
 * The frequency shift g = ν_∞/ν_emitted of light leaving the disc's gas at r (units of M; circular Keplerian
 * orbit, r > 3) with angular momentum lz per unit energy about the disc's axis (positive along the gas's motion),
 * for an observer at rest far away: √(1 − 3/r)/(1 − Ω lz), Ω = r^(−3/2).
 */
export function keplerRedshift(r: number, lz: number): number {
  return Math.sqrt(1 - 3 / r) / (1 - lz / (r * Math.sqrt(r)));
}

// ─── The orbit table ──────────────────────────────────────────────────────────────────────────

/** Rows of orbits that fall in (b < b_c), and that escape (b > b_c). */
export const ORBIT_ROWS_IN = 128;
export const ORBIT_ROWS_OUT = 384;
export const ORBIT_ROWS = ORBIT_ROWS_IN + ORBIT_ROWS_OUT;
/** Columns: ψ uniform from infinity (0) to the periapsis or the horizon (ψ_end). */
export const ORBIT_COLS = 512;
/** The rows' range in w = |b/b_c − 1|: from 1e−9 to a nearly radial ray (b = 5e−4 b_c), and out to b = 1e5 M. */
export const ORBIT_W_MIN = 1e-9;
export const ORBIT_W_IN_MAX = 1 - 1e-4;
export const ORBIT_B_MAX = 1e5;
/** RK4's largest step in ψ. */
const ORBIT_STEP = 0.004;

/** The falling-in rows' variable: q = ln w + 3w (as the lens tables' s, crowding at the edge and even near b = 0). */
export const orbitQIn = (w: number): number => Math.log(w) + 3 * w;
/** The escaping rows': q = ln w. */
export const orbitQOut = (w: number): number => Math.log(w);

export interface OrbitTable {
  /** q of row 0 and the step, for each family. */
  qIn0: number;
  dqIn: number;
  qOut0: number;
  dqOut: number;
  /** Per row: b (units of M), ψ_end, and whether the orbit escapes. */
  b: Float64Array;
  psiEnd: Float64Array;
  /** rows × cols, v = b·u at ψ = ψ_end · col/(cols − 1). */
  v: Float32Array;
  /** The same in float64 (the CPU's twin reads it). */
  v64: Float64Array;
}

/** w of row j of a family from its q (Newton in ln w for the falling-in rows' ln w + 3w). */
function wOfQIn(q: number): number {
  let y = q <= 3 ? q : Math.log(q / 3);
  for (let k = 0; k < 60; k++) {
    const e = 3 * Math.exp(y);
    const dy = (y + e - q) / (1 + e);
    y -= dy;
    if (Math.abs(dy) < 1e-16) break;
  }
  return Math.exp(y);
}

const realRoots: RealRoots = { b: 0, P: 0, eps: 0, u2: 0, mu1: 0, du32: 0, du21: 0 };
const complexRoots: ComplexRoots = { b: 0, u1: 0, m: 0, n: 0 };

/** One RK4 step of v″ = k v² − v (k = 3/b) from (v, p = v′) over h: into st. */
function rk4(k: number, h: number, st: { v: number; p: number }): void {
  const v = st.v;
  const p = st.p;
  const a1 = k * v * v - v;
  const v2 = v + 0.5 * h * p;
  const p2 = p + 0.5 * h * a1;
  const a2 = k * v2 * v2 - v2;
  const v3 = v + 0.5 * h * p2;
  const p3 = p + 0.5 * h * a2;
  const a3 = k * v3 * v3 - v3;
  const v4 = v + h * p3;
  const p4 = p + h * a3;
  const a4 = k * v4 * v4 - v4;
  st.v = v + (h / 6) * (p + 2 * p2 + 2 * p3 + p4);
  st.p = p + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
}

const state = { v: 0, p: 0 };

/**
 * One orbit, v″ = 3v²/b − v (v = b·u), by RK4 in steps of at most ORBIT_STEP, sampled at `cols` points uniform in ψ
 * from 0 to ψ_end, integrated both ways from a point known exactly (ψ_s, v_s, v′_s): the periapsis of an escaping
 * orbit, or where one that falls in crosses the photon sphere (u = 1/3). Integrating away from the photon sphere is
 * well conditioned (an error grows no faster than the orbit leaves it); integrating towards it from infinity is not:
 * the row nearest b_c, started at infinity, arrived at its periapsis 2e−4 out in u.
 */
function integrateRow(b: number, psiEnd: number, psiS: number, vS: number, pS: number, cols: number, out: Float64Array, o: number): void {
  const k = 3 / b;
  const dPsi = psiEnd / (cols - 1);
  const march = (from: number, to: number) => {
    const n = Math.max(1, Math.ceil(Math.abs(to - from) / ORBIT_STEP));
    const h = (to - from) / n;
    for (let i = 0; i < n; i++) rk4(k, h, state);
  };
  // forward from ψ_s through the columns after it, then back from ψ_s through those before it
  const c0 = Math.min(cols - 1, Math.ceil(psiS / dPsi - 1e-12));
  state.v = vS;
  state.p = pS;
  let at = psiS;
  for (let c = c0; c < cols; c++) {
    const psi = c * dPsi;
    march(at, psi);
    at = psi;
    out[o + c] = state.v;
  }
  state.v = vS;
  state.p = pS;
  at = psiS;
  for (let c = c0 - 1; c >= 0; c--) {
    const psi = c * dPsi;
    march(at, psi);
    at = psi;
    out[o + c] = state.v;
  }
  out[o] = 0;
}

/** The table's rows' b and ψ_end, and its axes (no integration): for the build and for tests. */
export function orbitRow(j: number, t: Pick<OrbitTable, 'qIn0' | 'dqIn' | 'qOut0' | 'dqOut'>): { b: number; d: number; escapes: boolean } {
  if (j < ORBIT_ROWS_IN) {
    const w = wOfQIn(t.qIn0 + j * t.dqIn);
    return { b: BC * (1 - w), d: -w, escapes: false };
  }
  const w = Math.exp(t.qOut0 + (j - ORBIT_ROWS_IN) * t.dqOut);
  return { b: BC * (1 + w), d: w, escapes: true };
}

let table: OrbitTable | null = null;

/** The orbit table, built the first time it is asked for (19 ms). */
export function orbitTable(): OrbitTable {
  if (table) return table;
  const qIn0 = orbitQIn(ORBIT_W_MIN);
  const dqIn = (orbitQIn(ORBIT_W_IN_MAX) - qIn0) / (ORBIT_ROWS_IN - 1);
  const qOut0 = orbitQOut(ORBIT_W_MIN);
  const dqOut = (orbitQOut(ORBIT_B_MAX / BC - 1) - qOut0) / (ORBIT_ROWS_OUT - 1);
  const t: OrbitTable = {
    qIn0,
    dqIn,
    qOut0,
    dqOut,
    b: new Float64Array(ORBIT_ROWS),
    psiEnd: new Float64Array(ORBIT_ROWS),
    v: new Float32Array(ORBIT_ROWS * ORBIT_COLS),
    v64: new Float64Array(ORBIT_ROWS * ORBIT_COLS),
  };
  for (let j = 0; j < ORBIT_ROWS; j++) {
    const row = orbitRow(j, t);
    // ψ_end from Carlson's closed forms: to the periapsis, or to the horizon (u = ½).
    const psiEnd = row.escapes ? sweepToPeriapsis(rootsRealInto(row.d, realRoots), 0) : sweepBetweenComplex(rootsComplexInto(row.d, complexRoots), 0, 0.5);
    t.b[j] = row.b;
    t.psiEnd[j] = psiEnd;
    if (row.escapes) integrateRow(row.b, psiEnd, psiEnd, row.b * realRoots.u2, 0, ORBIT_COLS, t.v64, j * ORBIT_COLS);
    else {
      const psiS = sweepBetweenComplex(complexRoots, 0, 1 / 3);
      integrateRow(row.b, psiEnd, psiS, row.b / 3, Math.sqrt(Math.max(0, 1 - (row.b * row.b) / 27)), ORBIT_COLS, t.v64, j * ORBIT_COLS);
    }
  }
  for (let i = 0; i < t.v.length; i++) t.v[i] = t.v64[i];
  table = t;
  return t;
}

/**
 * The camera's place on each orbit of the table: ψ_c, the sweep from infinity along the incoming leg to u_c = 1/r_c
 * (Carlson's closed forms). A camera inside an escaping orbit's periapsis (a ray within a hair of 90° from the hole
 * lies between two such rows) is put at the periapsis, so that the rows either side still interpolate; inside r = 3
 * those orbits are trapped and never reach the disc (−1). Into `out` (one number a row).
 */
export function cameraRows(t: OrbitTable, rCam: number, out: Float64Array): Float64Array {
  const uc = 1 / rCam;
  for (let j = 0; j < ORBIT_ROWS; j++) {
    const row = orbitRow(j, t);
    if (row.escapes) {
      const R = rootsRealInto(row.d, realRoots);
      out[j] = uc <= R.u2 ? sweepBetweenReal(R, 0, uc) : rCam > 3 ? t.psiEnd[j] : -1;
    } else out[j] = sweepBetweenComplex(rootsComplexInto(row.d, complexRoots), 0, uc);
  }
  return out;
}

// ─── A ray meets the disc (the shader's twin) ─────────────────────────────────────────────────

/**
 * v = b·u on row j at ψ from infinity (linear between columns; an escaping orbit reflected about its periapsis),
 * or NaN beyond its far end (escaped, or fallen in).
 */
export function orbitRowV(t: OrbitTable, j: number, psi: number): number {
  const psiEnd = t.psiEnd[j];
  if (!(psi >= 0)) return NaN;
  if (j >= ORBIT_ROWS_IN) {
    if (psi > 2 * psiEnd) return NaN;
    if (psi > psiEnd) psi = 2 * psiEnd - psi;
  } else if (psi > psiEnd) return NaN;
  const x = (psi / psiEnd) * (ORBIT_COLS - 1);
  const i = Math.min(Math.floor(x), ORBIT_COLS - 2);
  const f = x - i;
  const o = j * ORBIT_COLS + i;
  return t.v64[o] + (t.v64[o + 1] - t.v64[o]) * f;
}

/** The fractional row of a ray with w = |b/b_c − 1| on its side of b_c, clamped to the table. */
export function orbitRowOf(t: OrbitTable, w: number, famOut: boolean): number {
  if (!famOut) return Math.min(ORBIT_ROWS_IN - 1, Math.max(0, (orbitQIn(Math.max(w, ORBIT_W_MIN)) - t.qIn0) / t.dqIn));
  return ORBIT_ROWS_IN + Math.min(ORBIT_ROWS_OUT - 1, Math.max(0, (orbitQOut(Math.max(w, ORBIT_W_MIN)) - t.qOut0) / t.dqOut));
}

/** One crossing of the disc's plane by a backward ray. */
export interface DiskCrossing {
  /** Order: 0 direct, 1 the first image round the hole, 2 the next. */
  k: number;
  /** Swept angle from the camera, rad. */
  delta: number;
  /** Radius, units of M. */
  r: number;
  /** Unit vector from the hole to the crossing (the frame of the camera and axis passed in). */
  p: [number, number, number];
  /** The photon's angular momentum about the disc's axis per unit energy (positive along the gas's motion). */
  lz: number;
  /** g = ν_∞/ν_emitted for a Keplerian emitter there (NaN inside r = 3). */
  g: number;
}

/** A backward ray from a static camera: its geometry. */
export interface DiskRay {
  /** The camera's r (units of M), and the unit vector from the hole to the camera. */
  rCam: number;
  e1: [number, number, number];
  /** The look direction (unit), static observer's frame, any axes. */
  d: [number, number, number];
  /** The disc's axis (unit; the gas turns anticlockwise about it). */
  n: [number, number, number];
  /**
   * The ray's whole sweep to infinity Δφ (rad; NaN when it falls in): the lens's own (physics/schwarzschild.ts
   * escapeSweepInto here, the forward table on the GPU). Computed from the look angle when left out.
   */
  sweep?: number;
}

const dot3 = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sweepSample: SweepSample = { captured: false, dphi: 0, lnG: 0 };
const staticObs: LensObserver = { frame: 'static', r: 10 };

/**
 * Every crossing of the disc's plane by a backward ray (orders 0–2, up to where it escapes or falls in), with each
 * one's radius from the orbit table: the twin of diskLookup.glsl (the table's rows of b either side, linear in
 * their variable, v = b·u between them and u from the ray's own b; each row linear between columns). A ray that
 * is anchored where it is nearest to its own place on the orbit: before its periapsis at the camera (ψ_c + Δ_k from
 * each row's own ψ_c), past it at the far end (ψ = Δφ − Δ_k, what is left of its sweep to infinity, which the lens
 * already knows exactly). Anchored at the far end throughout, the near side's direct image was 2–5e−4 out in r;
 * at the camera throughout, a ray near 90° from the hole was 9 % out past its periapsis (the sweep from infinity to
 * the camera has a square root there, where the camera sits at the periapsis). The impact parameter comes from the look angle's gap to the shadow's edge
 * (x − 1 = cot α_e sin g + cos g − 1, as the shader has it).
 */
export function diskRayCrossings(t: OrbitTable, camRows: Float64Array, ray: DiskRay, kMax = 2): DiskCrossing[] {
  const { rCam, e1, d, n } = ray;
  const out: DiskCrossing[] = [];
  const ca = -dot3(d, e1); // cos α (α from the hole's direction, −e1)
  const sx = d[0] + ca * e1[0];
  const sy = d[1] + ca * e1[1];
  const sz = d[2] + ca * e1[2];
  const sl = Math.hypot(sx, sy, sz);
  if (!(sl > 1e-12)) return out;
  const s: [number, number, number] = [sx / sl, sy / sl, sz / sl];
  const alpha = Math.atan2(sl, ca);
  const edge = shadowAngle(rCam);
  const g = alpha - edge;
  const cotEdge = ((rCam - 3) * Math.sqrt(rCam + 6)) / (BC * Math.sqrt(rCam - 2));
  const xm1 = cotEdge * Math.sin(g) + (Math.cos(g) - 1);
  const famOut = xm1 > 0;
  const w = Math.abs(xm1);
  const b = BC * (1 + xm1);
  let sweep = ray.sweep;
  if (sweep === undefined) {
    staticObs.r = rCam;
    escapeSweepInto(staticObs, alpha, g, sweepSample);
    sweep = sweepSample.captured ? NaN : sweepSample.dphi;
  }
  const escapes = sweep === sweep;
  // A ray inside a camera's photon sphere with b > b_c is trapped there and never reaches the disc.
  if (!escapes && famOut) return out;
  const a = dot3(e1, n);
  const c = dot3(s, n);
  let d0 = Math.atan2(-a, c);
  if (d0 < 0) d0 += Math.PI;
  if (d0 < 1e-9) d0 += Math.PI;
  // The photon's angular momentum about the disc's axis: −b (e1 × s)·n (the backward ray's, reversed).
  const lz = -b * (n[0] * (e1[1] * s[2] - e1[2] * s[1]) + n[1] * (e1[2] * s[0] - e1[0] * s[2]) + n[2] * (e1[0] * s[1] - e1[1] * s[0]));
  const straight = famOut && b > ORBIT_B_MAX;
  const fr = orbitRowOf(t, w, famOut);
  const j0 = Math.min(Math.floor(fr), famOut ? ORBIT_ROWS - 2 : ORBIT_ROWS_IN - 2);
  // v is interpolated linearly in b (near the camera v = b u_c, exactly linear; from the far end v hardly depends on b)
  const fj = (b - t.b[j0]) / (t.b[j0 + 1] - t.b[j0]);
  const inward = ca > 0;
  // The ray's own sweep from infinity to its periapsis (between the rows'), so the camera reaches it after Δφ − ψ_p.
  const psiPeri = t.psiEnd[j0] + (t.psiEnd[j0 + 1] - t.psiEnd[j0]) * fj;
  for (let k = 0; k <= kMax; k++) {
    const delta = d0 + k * Math.PI;
    let v0: number;
    let v1: number;
    if (straight) {
      const psi = sweep - delta;
      v0 = v1 = psi > 0 ? Math.sin(Math.min(psi, Math.PI / 2)) : NaN;
    } else if (escapes && !(inward && delta < sweep - psiPeri)) {
      // past the periapsis (or an outward ray): from the far end
      v0 = orbitRowV(t, j0, sweep - delta);
      v1 = orbitRowV(t, j0 + 1, sweep - delta);
    } else {
      // before it, or falling in: from the camera
      v0 = orbitRowV(t, j0, camRows[j0] + delta);
      v1 = orbitRowV(t, j0 + 1, camRows[j0 + 1] + delta);
    }
    // v = b·u between the rows, then u from the ray's own b: v hardly depends on b far from the hole (a straight
    // line's is sin ψ), where u itself goes as 1/b.
    const u = (v0 + (v1 - v0) * fj) / b;
    if (!(u > 0)) break;
    const r = 1 / u;
    const cd = Math.cos(delta);
    const sd = Math.sin(delta);
    out.push({ k, delta, r, p: [cd * e1[0] + sd * s[0], cd * e1[1] + sd * s[1], cd * e1[2] + sd * s[2]], lz, g: r > 3 ? keplerRedshift(r, lz) : NaN });
  }
  return out;
}

/** The first crossing between the disc's edges (the disc is opaque), or null. */
export function diskRayHit(t: OrbitTable, camRows: Float64Array, ray: DiskRay, rIn: number, rOut: number): DiskCrossing | null {
  for (const c of diskRayCrossings(t, camRows, ray)) if (c.r >= rIn && c.r <= rOut) return c;
  return null;
}
