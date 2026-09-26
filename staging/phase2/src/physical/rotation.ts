/**
 * Body orientation from the rotation models in staging/phase2/bodies.json.
 *
 * Models follow the IAU WGCCRE convention (Archinal et al. 2018, CMDA 130:22) exactly as the
 * SPICE Toolkit evaluates them (routine BODEUL):
 *
 *   α₀ = a₀ + a₁·T + a₂·T² + Σᵢ raTermsᵢ · sin θᵢ
 *   δ₀ = d₀ + d₁·T + d₂·T² + Σᵢ decTermsᵢ · cos θᵢ
 *   W  = w₀ + w₁·d + w₂·d² + Σᵢ pmTermsᵢ · sin θᵢ
 *   θᵢ = A₀ + A₁·T (+ A₂·T²)    (the phase angles of the planet's system, bodies.json → phaseAngles)
 *
 * with d = TDB days since J2000.0 and T = d / 36525. All angles in degrees.
 *
 * Body-fixed → ICRF:  R = Rz(α₀ + 90°) · Rx(90° − δ₀) · Rz(W). Body-fixed axes: +z the north (or
 * positive) pole, +x the prime meridian, +y 90° east. ICRF → ecliptic J2000: Rx(−ε), with
 * ε = 84381.448″ (the value in src/physics/constants.ts and SPICE's ECLIPJ2000).
 *
 * Measured agreement with CSPICE N0067 + pck00011.tpc (tests in rotation.test.ts): under 1e-9 rad
 * for every IAU-modelled body at every test epoch from 1900 to 2300. That is the implementation
 * error; the models themselves are claimed good to about 0.1° near the present (IAU report).
 *
 * Pure functions, no dependencies. Inputs are the JSON objects as parsed.
 */

export type Vec3 = [number, number, number];
/** Row-major 3×3 matrix: m[r][c]. Columns are the body axes expressed in the target frame. */
export type Mat3 = [Vec3, Vec3, Vec3];

export interface PhaseSystem {
  degree: number;
  /** Each angle: [A₀ (deg), A₁ (deg/century), A₂ (deg/century²)?]. */
  angles: number[][];
}

export interface RotationModel {
  model: string; // 'iau-2015' | 'fitted' | 'snapshot' | 'period-only' | 'chaotic' | 'complex' | 'unknown' | 'attitude-controlled'
  poleRaDeg?: number[];
  poleDecDeg?: number[];
  pmDeg?: number[];
  phaseSystem?: string;
  raTerms?: number[];
  decTerms?: number[];
  pmTerms?: number[];
  periodH?: number;
  validity?: { fromTdbDays: number; toTdbDays: number; note?: string };
}

/** How far to trust an evaluated orientation. */
export type RotationRegime =
  | 'model' // inside the model's validity window
  | 'extrapolated' // a full model evaluated outside its window: finite and smooth, less accurate
  | 'pole-only' // pole known, prime meridian undefined (w is a free spin at the known period)
  | 'none'; // no model: the caller should pick an arbitrary spin and say so

export interface Orientation {
  raDeg: number;
  decDeg: number;
  /** Prime meridian angle, degrees, wrapped to [0, 360). NaN when regime is 'none'. */
  wDeg: number;
  regime: RotationRegime;
}

const DEG = Math.PI / 180;
/** Obliquity of the J2000 ecliptic, degrees (84381.448″). */
export const OBLIQUITY_J2000_DEG = 84_381.448 / 3600;

const poly = (c: number[] | undefined, t: number) => (c ? (c[0] ?? 0) + (c[1] ?? 0) * t + (c[2] ?? 0) * t * t : 0);
const wrap360 = (x: number) => ((x % 360) + 360) % 360;

/** Evaluate α₀, δ₀, W at TDB days since J2000. */
export function orientationAt(rot: RotationModel, phaseAngles: Record<string, PhaseSystem>, tdbDays: number): Orientation {
  const T = tdbDays / 36525;
  const hasPole = rot.poleRaDeg && rot.poleDecDeg;
  if (!hasPole) {
    return { raDeg: NaN, decDeg: NaN, wDeg: NaN, regime: 'none' };
  }
  let ra = poly(rot.poleRaDeg, T);
  let dec = poly(rot.poleDecDeg, T);
  let w: number;
  if (rot.pmDeg) w = poly(rot.pmDeg, tdbDays);
  else if (rot.periodH) w = (360 * tdbDays * 24) / rot.periodH; // arbitrary phase, known rate
  else w = 0;
  if (rot.phaseSystem) {
    const sys = phaseAngles[rot.phaseSystem];
    if (!sys) throw new Error(`phase system ${rot.phaseSystem} missing`);
    const n = Math.max(rot.raTerms?.length ?? 0, rot.decTerms?.length ?? 0, rot.pmTerms?.length ?? 0);
    for (let i = 0; i < n; i++) {
      const a = sys.angles[i];
      const theta = ((a[0] ?? 0) + (a[1] ?? 0) * T + (a[2] ?? 0) * T * T) * DEG;
      const s = Math.sin(theta);
      if (rot.raTerms?.[i]) ra += rot.raTerms[i] * s;
      if (rot.decTerms?.[i]) dec += rot.decTerms[i] * Math.cos(theta);
      if (rot.pmTerms?.[i]) w += rot.pmTerms[i] * s;
    }
  }
  let regime: RotationRegime = 'model';
  if (!rot.pmDeg) regime = 'pole-only';
  else if (rot.validity && (tdbDays < rot.validity.fromTdbDays || tdbDays > rot.validity.toTdbDays)) regime = 'extrapolated';
  return { raDeg: wrap360(ra), decDeg: dec, wDeg: wrap360(w), regime };
}

/** Body-fixed → ICRF rotation matrix for pole (α₀, δ₀) and prime meridian W (degrees). */
export function bodyToIcrf(raDeg: number, decDeg: number, wDeg: number): Mat3 {
  const a = (raDeg + 90) * DEG;
  const b = (90 - decDeg) * DEG;
  const w = wDeg * DEG;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cw = Math.cos(w), sw = Math.sin(w);
  // Rz(a) · Rx(b) · Rz(w)
  return [
    [ca * cw - sa * cb * sw, -ca * sw - sa * cb * cw, sa * sb],
    [sa * cw + ca * cb * sw, -sa * sw + ca * cb * cw, -ca * sb],
    [sb * sw, sb * cw, cb],
  ];
}

/** ICRF → ecliptic-J2000 applied to a matrix's rows (i.e. left-multiplied by Rx(−ε)). */
export function icrfToEcliptic(m: Mat3): Mat3 {
  const e = OBLIQUITY_J2000_DEG * DEG;
  const c = Math.cos(e), s = Math.sin(e);
  const [r0, r1, r2] = m;
  return [
    [r0[0], r0[1], r0[2]],
    [c * r1[0] + s * r2[0], c * r1[1] + s * r2[1], c * r1[2] + s * r2[2]],
    [-s * r1[0] + c * r2[0], -s * r1[1] + c * r2[1], -s * r1[2] + c * r2[2]],
  ];
}

/** Body-fixed → ecliptic J2000 at a TDB epoch, or null when the body has no usable model. */
export function bodyToEclipticAt(
  rot: RotationModel,
  phaseAngles: Record<string, PhaseSystem>,
  tdbDays: number,
): { matrix: Mat3; orientation: Orientation } | null {
  const o = orientationAt(rot, phaseAngles, tdbDays);
  if (o.regime === 'none') return null;
  return { matrix: icrfToEcliptic(bodyToIcrf(o.raDeg, o.decDeg, o.wDeg)), orientation: o };
}

/** Planetocentric (lat, east lon) in degrees → unit vector in the body-fixed frame. */
export function bodyFixedDirection(latDeg: number, lonEastDeg: number): Vec3 {
  const la = latDeg * DEG, lo = lonEastDeg * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

/** Texture coordinate (u right, v down, both 0..1) of the equirectangular maps → (lat, east lon). */
export function textureUvToLatLon(u: number, v: number): { latDeg: number; lonEastDeg: number } {
  return { latDeg: 90 - 180 * v, lonEastDeg: -180 + 360 * u };
}

export function mulVec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Angle between two rotation matrices, radians (the rotation angle of A·Bᵀ). */
export function rotationDifference(A: Mat3, B: Mat3): number {
  let tr = 0;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) tr += A[i][k] * B[i][k];
  const c = Math.min(1, Math.max(-1, (tr - 1) / 2));
  // For tiny angles acos loses precision; use the norm of the antisymmetric part instead.
  if (c > 0.999999) {
    let s2 = 0;
    for (const [i, j] of [[1, 2], [2, 0], [0, 1]] as const) {
      let a = 0;
      for (let k = 0; k < 3; k++) a += A[i][k] * B[j][k] - A[j][k] * B[i][k];
      s2 += (a / 2) ** 2;
    }
    return Math.asin(Math.min(1, Math.sqrt(s2)));
  }
  return Math.acos(c);
}
