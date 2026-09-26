/**
 * How a planet of another star is drawn. No image of any of them shows a surface, so each is a
 * plain sphere in an illustrative colour chosen by a simple, stated rule from its size and its
 * equilibrium temperature (the temperature of a black body at its distance from its star):
 *
 * Giants (6 R⊕ or more, or 50 M⊕ or more when the radius is only estimated) follow the cloud
 * classes of Sudarsky, Burrows & Pinto (2000, ApJ 538, 885), which predict what condenses at
 * each temperature and so what the planet reflects:
 *   below 150 K   class I    ammonia clouds, like Jupiter          pale tan     albedo 0.57
 *   150–300 K     class II   water clouds                         white        0.81
 *   300–850 K     class III  no clouds; gas absorbs the red       blue         0.12
 *   850–1,400 K   class IV   sodium and potassium absorb          very dark    0.03
 *   above 1,400 K class V    silicate clouds high up              grey         0.55
 * (the albedos are Sudarsky et al.'s Bond albedos, used as the geometric albedo).
 *
 * Planets under 1.6 R⊕ are probably rocky (above about that size most planets keep a thick
 * hydrogen envelope: Rogers 2015, ApJ 801, 41; Fulton et al. 2017, AJ 154, 109); their colour
 * follows the Solar System's bare and icy rocks by temperature. Planets from 1.6 to 6 R⊕ are
 * shaded like Uranus and Neptune when cold and grow hazier and darker as they warm.
 */
import { AU_KM, R_SUN_KM } from './constants';

export interface PlanetLook {
  /** sRGB display colour. */
  colour: string;
  /** Geometric albedo used for the point of light's magnitude. */
  albedo: number;
  /** The rule that chose it, in a few words (for the data sheet). */
  rule: string;
}

/** Radius below which a planet is taken to be rocky, R⊕. */
export const ROCKY_MAX_EARTH_RADII = 1.6;
/** Radius from which a planet is taken to be a giant, R⊕. */
export const GIANT_MIN_EARTH_RADII = 6;

/**
 * Equilibrium temperature of a planet at `aAu` from a star of `teffK` and `rStarRsun`, K, with no
 * albedo and the heat spread over the whole planet: T_eq = T_eff √(R_star / 2a).
 */
export function equilibriumTemperatureK(teffK: number, rStarRsun: number, aAu: number): number {
  return teffK * Math.sqrt((rStarRsun * R_SUN_KM) / (2 * aAu * AU_KM));
}

/**
 * The colour and albedo of a planet from its equilibrium temperature (NaN: unknown) and size.
 * `radiusMeasured`: false when the radius is only an estimate from the mass, so a heavy planet
 * counts as a giant by its mass.
 */
export function planetLook(teqK: number, radiusEarth: number, massEarth: number | null, radiusMeasured = true): PlanetLook {
  const giant = radiusEarth >= GIANT_MIN_EARTH_RADII || (!radiusMeasured && massEarth !== null && massEarth >= 50);
  if (!(teqK > 0)) return { colour: '#9a9a96', albedo: 0.3, rule: 'Temperature unknown: neutral grey' };
  const T = Math.round(teqK);
  if (giant) {
    if (teqK < 150) return { colour: '#d9c6a0', albedo: 0.57, rule: `Giant at ${T} K: Sudarsky class I (ammonia clouds)` };
    if (teqK < 300) return { colour: '#eeede6', albedo: 0.81, rule: `Giant at ${T} K: Sudarsky class II (water clouds)` };
    if (teqK < 850) return { colour: '#5b80b8', albedo: 0.12, rule: `Giant at ${T} K: Sudarsky class III (clear, blue)` };
    if (teqK < 1400) return { colour: '#34363f', albedo: 0.03, rule: `Giant at ${T} K: Sudarsky class IV (sodium and potassium absorb)` };
    return { colour: '#8f918a', albedo: 0.55, rule: `Giant at ${T} K: Sudarsky class V (silicate clouds)` };
  }
  if (radiusEarth < ROCKY_MAX_EARTH_RADII) {
    if (teqK < 200) return { colour: '#cfd6de', albedo: 0.5, rule: `Probably rocky, ${T} K: icy` };
    if (teqK < 400) return { colour: '#9c9184', albedo: 0.3, rule: `Probably rocky, ${T} K: temperate rock` };
    if (teqK < 1000) return { colour: '#86776a', albedo: 0.14, rule: `Probably rocky, ${T} K: hot bare rock` };
    return { colour: '#5c4239', albedo: 0.1, rule: `Probably rocky, ${T} K: lava` };
  }
  if (teqK < 250) return { colour: '#a7cdd6', albedo: 0.45, rule: `Sub-Neptune at ${T} K: cold, methane-tinted like Uranus` };
  if (teqK < 800) return { colour: '#c7c1ab', albedo: 0.3, rule: `Sub-Neptune at ${T} K: warm and hazy` };
  return { colour: '#8b8276', albedo: 0.1, rule: `Sub-Neptune at ${T} K: hot and dark` };
}

// ─── Radii from masses ───────────────────────────────────────────────────────────────────

/**
 * Mean radius of a planet of `massEarth`, R⊕, from the probabilistic mass–radius relation of
 * Chen & Kipping (2017, ApJ 834, 17), without its scatter: R = C M^S in three regimes (Terran
 * below 2.04 M⊕, Neptunian to 132 M⊕, Jovian above), continuous at the transitions.
 */
export function radiusFromMass(massEarth: number): number {
  if (massEarth < 2.04) return 1.008 * massEarth ** 0.279;
  // Continuous at the transitions: C₂ = C₁ 2.04^(0.279 − 0.589), C₃ = C₂ 132^(0.589 + 0.044).
  const c2 = 1.008 * 2.04 ** (0.279 - 0.589);
  if (massEarth < 132) return c2 * massEarth ** 0.589;
  const c3 = c2 * 132 ** (0.589 + 0.044);
  return c3 * massEarth ** -0.044;
}
