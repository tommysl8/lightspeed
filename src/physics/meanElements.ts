/**
 * Approximate planet and Moon positions from mean Keplerian elements, for dates outside the
 * span where astronomy-engine's full theories are checked (see sim/ephemerisPolicy.ts).
 *
 * Planets: E. M. Standish, "Keplerian Elements for Approximate Positions of the Major
 * Planets" (JPL/Caltech; Standish & Williams 1992), Tables 2a and 2b, fitted to the DE200
 * ephemeris over 3000 BC – 3000 AD with respect to the mean ecliptic and equinox of J2000:
 *   https://ssd.jpl.nasa.gov/planets/approx_pos.html
 * The page has since dropped Pluto; its row (and its b term) are from the original data file,
 *   https://web.archive.org/web/2019/https://ssd.jpl.nasa.gov/txt/p_elem_t2.txt
 * Nominal errors over the fit span, per JPL: Mercury–Mars within 100″ in longitude, Jupiter
 * and Saturn 600–1000″, Uranus 2000″, Neptune 400″.
 *
 * Outside the fit span the elements are frozen at the nearest edge and only the mean anomaly
 * keeps advancing, at its rate on that edge. The orbits stay right; where each body sits along
 * its orbit does not (secular resonances and chaos make that unknowable after a few million
 * years anyway, Laskar 1989).
 *
 * The Moon: mean elements from Meeus, Astronomical Algorithms (2nd ed. 1998), eqs 47.1–47.5
 * (after Chapront-Touzé & Chapront's ELP-2000/82), with the NASA Moon Fact Sheet's semi-major
 * axis, eccentricity and inclination. Linear rates only: good for a picture, not a prediction.
 *
 * Angles grow without bound in the far future (10¹³ years is 10¹⁶ degrees of Earth's mean
 * anomaly), so every "rate × time" is reduced modulo one revolution with an exact fmod before
 * it is scaled, which keeps the result as precise as the time itself.
 */
import { AU_KM, DAY_S } from './constants';
import { solveKepler } from './kepler';

const DEG = Math.PI / 180;
/** Days per Julian century. */
const CY_D = 36_525;

export type MeanPlanet = 'mercury' | 'venus' | 'emb' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

interface Elements {
  /** a (au), e, I (deg), L (deg), ϖ longitude of perihelion (deg), Ω (deg): value at J2000 and rate per century. */
  a: [number, number];
  e: [number, number];
  I: [number, number];
  L: [number, number];
  w: [number, number];
  O: [number, number];
  /** Table 2b: M += bT² + c cos(fT) + s sin(fT), T in centuries, fT in degrees. */
  b?: number;
  c?: number;
  s?: number;
  f?: number;
}

// Standish Table 2a (3000 BC – 3000 AD), then Table 2b for Jupiter–Pluto. Values as published.
const TABLE: Record<MeanPlanet, Elements> = {
  mercury: {
    a: [0.38709843, 0.0],
    e: [0.20563661, 0.00002123],
    I: [7.00559432, -0.00590158],
    L: [252.25166724, 149472.67486623],
    w: [77.45771895, 0.15940013],
    O: [48.33961819, -0.12214182],
  },
  venus: {
    a: [0.72332102, -0.00000026],
    e: [0.00676399, -0.00005107],
    I: [3.39777545, 0.00043494],
    L: [181.9797085, 58517.8156026],
    w: [131.76755713, 0.05679648],
    O: [76.67261496, -0.27274174],
  },
  emb: {
    a: [1.00000018, -0.00000003],
    e: [0.01673163, -0.00003661],
    I: [-0.00054346, -0.01337178],
    L: [100.46691572, 35999.37306329],
    w: [102.93005885, 0.3179526],
    O: [-5.11260389, -0.24123856],
  },
  mars: {
    a: [1.52371243, 0.00000097],
    e: [0.09336511, 0.00009149],
    I: [1.85181869, -0.00724757],
    L: [-4.56813164, 19140.29934243],
    w: [-23.91744784, 0.45223625],
    O: [49.71320984, -0.26852431],
  },
  jupiter: {
    a: [5.20248019, -0.00002864],
    e: [0.0485359, 0.00018026],
    I: [1.29861416, -0.00322699],
    L: [34.33479152, 3034.90371757],
    w: [14.27495244, 0.18199196],
    O: [100.29282654, 0.13024619],
    b: -0.00012452,
    c: 0.0606406,
    s: -0.35635438,
    f: 38.35125,
  },
  saturn: {
    a: [9.54149883, -0.00003065],
    e: [0.05550825, -0.00032044],
    I: [2.49424102, 0.00451969],
    L: [50.07571329, 1222.11494724],
    w: [92.86136063, 0.54179478],
    O: [113.63998702, -0.25015002],
    b: 0.00025899,
    c: -0.13434469,
    s: 0.87320147,
    f: 38.35125,
  },
  uranus: {
    a: [19.18797948, -0.00020455],
    e: [0.0468574, -0.0000155],
    I: [0.77298127, -0.00180155],
    L: [314.20276625, 428.49512595],
    w: [172.43404441, 0.09266985],
    O: [73.96250215, 0.05739699],
    b: 0.00058331,
    c: -0.97731848,
    s: 0.17689245,
    f: 7.67025,
  },
  neptune: {
    a: [30.06952752, 0.00006447],
    e: [0.00895439, 0.00000818],
    I: [1.7700552, 0.000224],
    L: [304.22289287, 218.46515314],
    w: [46.68158724, 0.01009938],
    O: [131.78635853, -0.00606302],
    b: -0.00041348,
    c: 0.68346318,
    s: -0.10162547,
    f: 7.67025,
  },
  pluto: {
    a: [39.48686035, 0.00449751],
    e: [0.24885238, 0.00006016],
    I: [17.1410426, 0.00000501],
    L: [238.96535011, 145.18042903],
    w: [224.09702598, -0.00968827],
    O: [110.30167986, -0.00809981],
    b: -0.01262724,
  },
};

/** The fit span of Tables 2a/2b, in Julian centuries of TDB from J2000: 3000 BC to 3000 AD. */
export const STANDISH_T_MIN = -50;
export const STANDISH_T_MAX = 10;

/** Heliocentric (or geocentric, for the Moon) state in the J2000 ecliptic frame, km and km/s. */
export interface EclState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export const newEclState = (): EclState => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });

/** a0 + rate·T in degrees, with rate·T reduced modulo 360° exactly first. */
export function angleAt(a0: number, ratePerCy: number, T: number): number {
  if (ratePerCy === 0) return a0;
  const period = 360 / Math.abs(ratePerCy); // centuries per revolution
  return a0 + (T % period) * ratePerCy;
}

/** Mean anomaly (deg) and its rate (deg per century) at T inside the fit span. */
function meanAnomalyIn(el: Elements, T: number): [number, number] {
  const { b = 0, c = 0, s = 0, f = 0 } = el;
  const fT = f * T * DEG;
  const M = el.L[0] + el.L[1] * T - (el.w[0] + el.w[1] * T) + b * T * T + c * Math.cos(fT) + s * Math.sin(fT);
  const n = el.L[1] - el.w[1] + 2 * b * T + f * DEG * (s * Math.cos(fT) - c * Math.sin(fT));
  return [M, n];
}

/**
 * Standish mean-element state of a planet (the Earth–Moon barycentre for 'emb') at T Julian
 * centuries of TDB since J2000. Beyond 3000 BC – 3000 AD the elements are frozen at the edge
 * and the mean anomaly runs on at the edge rate, so position and velocity stay continuous.
 */
export function standishState(planet: MeanPlanet, T: number, out: EclState = newEclState()): EclState {
  const el = TABLE[planet];
  const Te = Math.min(STANDISH_T_MAX, Math.max(STANDISH_T_MIN, T));
  let [M, n] = meanAnomalyIn(el, Te);
  // Past the edge: M(T) = M(Te) + n(Te)·(T − Te), reduced exactly (T − Te reaches 10¹¹ centuries).
  if (T !== Te) M = angleAt(M, n, T - Te);
  const a = (el.a[0] + el.a[1] * Te) * AU_KM;
  const e = el.e[0] + el.e[1] * Te;
  const I = (el.I[0] + el.I[1] * Te) * DEG;
  const varpi = el.w[0] + el.w[1] * Te;
  const Om = (el.O[0] + el.O[1] * Te) * DEG;
  const om = varpi * DEG - Om;
  const nRadS = (n * DEG) / (CY_D * DAY_S);
  return keplerToEcl(a, e, I, Om, om, (M % 360) * DEG, nRadS, out);
}

/** Position and velocity on a Kepler ellipse, rotated into the reference frame. */
function keplerToEcl(a: number, e: number, I: number, Om: number, om: number, M: number, nRadS: number, out: EclState): EclState {
  const E = solveKepler(M, e);
  const cE = Math.cos(E);
  const sE = Math.sin(E);
  const q = Math.sqrt(1 - e * e);
  const xp = a * (cE - e);
  const yp = a * q * sE;
  const Edot = nRadS / (1 - e * cE);
  const vxp = -a * sE * Edot;
  const vyp = a * q * cE * Edot;
  const cw = Math.cos(om);
  const sw = Math.sin(om);
  const cO = Math.cos(Om);
  const sO = Math.sin(Om);
  const cI = Math.cos(I);
  const sI = Math.sin(I);
  const r11 = cw * cO - sw * sO * cI;
  const r12 = -sw * cO - cw * sO * cI;
  const r21 = cw * sO + sw * cO * cI;
  const r22 = -sw * sO + cw * cO * cI;
  const r31 = sw * sI;
  const r32 = cw * sI;
  out.x = r11 * xp + r12 * yp;
  out.y = r21 * xp + r22 * yp;
  out.z = r31 * xp + r32 * yp;
  out.vx = r11 * vxp + r12 * vyp;
  out.vy = r21 * vxp + r22 * vyp;
  out.vz = r31 * vxp + r32 * vyp;
  return out;
}

// ─── The Moon ────────────────────────────────────────────────────────────────────────────

/** Semi-major axis (km), eccentricity and inclination to the ecliptic. [NASA Moon Fact Sheet] */
const MOON_A_KM = 384_400;
const MOON_E = 0.0549;
const MOON_I_DEG = 5.145;
/**
 * Mean longitude L′, mean anomaly M′ and argument of latitude F: degrees and degrees per
 * century [Meeus 47.1, 47.4, 47.5]. Meeus's L′ counts from the equinox of date; the scene is
 * fixed to the J2000 equinox, so the general precession in longitude (5029.0966″ a century,
 * IAU 1976) comes off its rate. Left in, it would turn the Moon 70° off by 3000 BCE. The node
 * (L′ − F) and the perigee (L′ − M′) move with it; M′ and F are unaffected.
 */
const PRECESSION_DEG_PER_CY = 5029.0966 / 3600;
const MOON_L: [number, number] = [218.3164477, 481_267.88123421 - PRECESSION_DEG_PER_CY];
const MOON_M: [number, number] = [134.9633964, 477_198.8675055];
const MOON_F: [number, number] = [93.272095, 483_202.0175233];

/** The Moon's mean longitude (deg, unreduced beyond one revolution) at T centuries from J2000. */
export const moonMeanLongitude = (T: number): number => angleAt(MOON_L[0], MOON_L[1], T);

/**
 * Geocentric Moon from mean elements (J2000 ecliptic, km and km/s) at T centuries of TDB from
 * J2000. The node regresses (18.6 years) and the perigee advances (8.85 years) at their mean
 * rates; the Sun's perturbations (evection, variation: up to ~1.3°) are left out.
 */
export function moonMeanState(T: number, out: EclState = newEclState()): EclState {
  const L = angleAt(MOON_L[0], MOON_L[1], T);
  const M = angleAt(MOON_M[0], MOON_M[1], T);
  const F = angleAt(MOON_F[0], MOON_F[1], T);
  const Om = ((L - F) % 360) * DEG; // ascending node Ω = L′ − F
  const om = ((F - M) % 360) * DEG; // argument of perigee ω = ϖ − Ω = F − M′
  const nRadS = (MOON_M[1] * DEG) / (CY_D * DAY_S);
  return keplerToEcl(MOON_A_KM, MOON_E, MOON_I_DEG * DEG, Om, om, (M % 360) * DEG, nRadS, out);
}
