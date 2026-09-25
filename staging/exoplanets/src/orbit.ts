/**
 * Keplerian orbits of exoplanets (and companion stars) on the sky, converted to the app's frames.
 *
 * CONVENTIONS (the visual-binary / direct-imaging convention; see exoplanets.md for the derivation)
 * - Elements describe the RELATIVE orbit of the body about its host (body minus host).
 * - iDeg in [0, 180]. i < 90 deg: the body moves counterclockwise on the sky as seen from the Sun,
 *   i.e. its position angle increases (north -> east). i = 90 deg is edge-on.
 * - nodeDeg (Omega): position angle of the ASCENDING node, measured from north through east. The
 *   ascending node is the node where the body moves AWAY from the Sun (its radial velocity relative to
 *   the host is positive there, i.e. redshifted).
 * - argPeriDeg (omega): argument of periastron OF THE BODY'S OWN ORBIT, from the ascending node in
 *   the direction of motion.
 * - Sky components (see sky.ts): north, east, and away (along the line of sight, away from the Sun):
 *     north = r [cos(w+f) cos(Om) - sin(w+f) sin(Om) cos i]
 *     east  = r [cos(w+f) sin(Om) + sin(w+f) cos(Om) cos i]
 *     away  = r  sin(w+f) sin i
 * - Relation to the radial-velocity / transit convention used by RV papers, transit papers and the
 *   NASA Exoplanet Archive (pl_orblper): there omega_star is the argument of periastron of the STAR's
 *   reflex orbit, with the star's RV v = K [cos(omega_star + f) + e cos(omega_star)], and a transit
 *   (inferior conjunction) happens at f = 90 deg - omega_star. With the ascending node defined as
 *   above for both bodies, omega_planet = omega_star + 180 deg, and the node is the same line.
 *   Check: at a transit w_planet + f = 270 deg, so away = -r sin i < 0: the planet is in front.
 * - Times: tPeriJd and all ephemeris times are Julian dates on the clock the observations use,
 *   i.e. arrival times at the Solar System barycentre (BJD_TDB). See observedTimeJd for how the app's
 *   coordinate time maps onto that clock.
 */
import { AU_KM, C_KM_S, DAY_S, DEG, TAU } from './constants.ts';
import { meanFromTrue, solveKepler, trueFromEccentric, wrap360 } from './kepler.ts';
import { type SkyVec, type Vec3, skyToEcliptic } from './sky.ts';

export interface KeplerOrbit {
  /** Period, days, on the observed (barycentric arrival-time) clock. */
  periodDays: number;
  /** Semi-major axis of the relative orbit, au. */
  aAu: number;
  /** Eccentricity, 0 <= e < 1. */
  e: number;
  /** Inclination, degrees, 0..180 (visual-binary sense, see above). */
  iDeg: number;
  /** Position angle of the ascending node (receding node), degrees east of north. */
  nodeDeg: number;
  /** Argument of periastron of the body's own relative orbit, degrees. */
  argPeriDeg: number;
  /** Time of periastron passage, JD (TDB), observed clock. */
  tPeriJd: number;
}

export interface SkyState {
  /** Position of the body relative to its host, au, sky components. */
  pos: SkyVec;
  /** Velocity relative to the host, au/day, sky components (vel.away > 0: receding). */
  vel: SkyVec;
  /** Mean, eccentric and true anomaly, radians. */
  meanAnomaly: number;
  eccentricAnomaly: number;
  trueAnomaly: number;
  /** Distance from the host, au. */
  r: number;
}

/** Argument of periastron of the planet from the star's (RV/transit convention) value, degrees. */
export function argPeriPlanetFromStar(omegaStarDeg: number): number {
  return wrap360(omegaStarDeg + 180);
}

/** True anomaly (radians) at inferior conjunction (the body closest to the Sun along the line of sight; a transit if the orbit is edge-on). */
export function trueAnomalyAtConjunction(argPeriDeg: number): number {
  return ((((270 - argPeriDeg) % 360) + 360) % 360) * DEG;
}

/** Time of periastron from a time of inferior conjunction / transit mid-time. */
export function tPeriFromConjunction(tConjJd: number, periodDays: number, e: number, argPeriDeg: number): number {
  const M = meanFromTrue(trueAnomalyAtConjunction(argPeriDeg), e);
  return tConjJd - (M / TAU) * periodDays;
}

/** Time of periastron from a mean anomaly (radians) at a reference time. */
export function tPeriFromMeanAnomaly(meanAnomaly: number, tRefJd: number, periodDays: number): number {
  return tRefJd - (meanAnomaly / TAU) * periodDays;
}

/** The inferior-conjunction time nearest to tJd (for a transiting planet: the nearest transit mid-time). */
export function conjunctionNear(o: KeplerOrbit, tJd: number): number {
  const Mc = meanFromTrue(trueAnomalyAtConjunction(o.argPeriDeg), o.e);
  const t0 = o.tPeriJd + (Mc / TAU) * o.periodDays;
  return t0 + Math.round((tJd - t0) / o.periodDays) * o.periodDays;
}

/** Position and velocity of the body relative to its host, in sky components, at an observed-clock time. */
export function orbitSky(o: KeplerOrbit, tObsJd: number): SkyState {
  const n = TAU / o.periodDays; // rad/day
  const M = n * (tObsJd - o.tPeriJd);
  const e = o.e;
  const E = solveKepler(M, e);
  const f = trueFromEccentric(E, e);
  const a = o.aAu;
  const r = a * (1 - e * Math.cos(E));
  const u = o.argPeriDeg * DEG + f;
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cO = Math.cos(o.nodeDeg * DEG);
  const sO = Math.sin(o.nodeDeg * DEG);
  const ci = Math.cos(o.iDeg * DEG);
  const si = Math.sin(o.iDeg * DEG);
  const pos: SkyVec = {
    north: r * (cu * cO - su * sO * ci),
    east: r * (cu * sO + su * cO * ci),
    away: r * su * si,
  };
  const q = Math.sqrt(1 - e * e);
  const rDot = (n * a * e * Math.sin(f)) / q; // au/day
  const rfDot = (n * a * (1 + e * Math.cos(f))) / q; // r * df/dt, au/day
  const vel: SkyVec = {
    north: rDot * (cu * cO - su * sO * ci) + rfDot * (-su * cO - cu * sO * ci),
    east: rDot * (cu * sO + su * cO * ci) + rfDot * (-su * sO + cu * cO * ci),
    away: rDot * su * si + rfDot * cu * si,
  };
  return { pos, vel, meanAnomaly: ((M % TAU) + TAU) % TAU, eccentricAnomaly: E, trueAnomaly: f, r };
}

/** Light travel time from a star at distanceKm to the Sun, days. */
export function lightTimeDays(distanceKm: number): number {
  return distanceKm / C_KM_S / DAY_S;
}

/**
 * Map the app's coordinate time (TDB JD in the Sun's rest frame) to the observed clock of the
 * ephemerides. Observed ephemerides (transit times, periods) describe what arrives at the Sun, so the
 * state of the system at coordinate time t is the one that will be SEEN from the Sun at
 * t + D(t)/c. Pass the host's distance from the Sun at time t, exactly as the app places the host.
 *
 * Consequences, both exact to first order in v/c:
 * - Looking from the Sun with light-time on (retarded positions), transits appear at the published
 *   times, whatever distance the app uses and whether or not it moves the star.
 * - If the app moves the host radially at v_r (D(t) = D0 + v_r t), the period in coordinate time
 *   becomes P_obs / (1 + v_r/c), the true period: the Doppler factor in observed periods is undone.
 *
 * The "true now" phase of a planet is uncertain by (distance error)/c: for TRAPPIST-1, the Gaia DR3
 * parallax error (~0.08 mas of 80.2) is ~0.01 pc, about 12 light-days, i.e. several orbits of planet b.
 * No observation can fix that; what the app shows from the Sun is still exactly right.
 */
export function observedTimeJd(tJd: number, hostDistanceKm: number): number {
  return tJd + lightTimeDays(hostDistanceKm);
}

/** Sky-frame offset (au) -> J2000 ecliptic offset (km). */
export function skyAuToEclipticKm(raDeg: number, decDeg: number, v: SkyVec): Vec3 {
  const w = skyToEcliptic(raDeg, decDeg, v);
  return { x: w.x * AU_KM, y: w.y * AU_KM, z: w.z * AU_KM };
}

/**
 * Geometric (true) offset of a body from its host at the app's coordinate time tJd, J2000 ecliptic,
 * km. raDeg/decDeg: the host's direction from the Sun; hostDistanceKm: the host's distance from the
 * Sun as placed by the app at tJd.
 */
export function offsetEclipticKm(o: KeplerOrbit, raDeg: number, decDeg: number, hostDistanceKm: number, tJd: number): Vec3 {
  const s = orbitSky(o, observedTimeJd(tJd, hostDistanceKm));
  return skyAuToEclipticKm(raDeg, decDeg, s.pos);
}

/** Velocity of a body relative to its host, J2000 ecliptic, km/s. */
export function velocityEclipticKmS(o: KeplerOrbit, raDeg: number, decDeg: number, hostDistanceKm: number, tJd: number): Vec3 {
  const s = orbitSky(o, observedTimeJd(tJd, hostDistanceKm));
  const k = AU_KM / DAY_S;
  const w = skyToEcliptic(raDeg, decDeg, s.vel);
  return { x: w.x * k, y: w.y * k, z: w.z * k };
}

/**
 * What an observer at the Sun sees at (observer) time tSeenJd, with light travel time: the offset of
 * the body from the host's CENTRE AS SEEN AT THE SAME INSTANT, in sky components (au). The body and
 * the host are each seen at their own retarded times, which differ by the light time across the
 * orbit (seconds to minutes). The host is assumed fixed at hostDistanceKm (the app may move it; the
 * difference over one light-crossing of a planetary orbit is negligible).
 */
export function apparentSkyOffsetFromSun(o: KeplerOrbit, hostDistanceKm: number, tSeenJd: number): SkyVec {
  const dLt = lightTimeDays(hostDistanceKm);
  // Retarded coordinate time of the body: te + |R + r(te)|/c = tSeen; |R + r| ~ D + r_away.
  let te = tSeenJd - dLt;
  for (let k = 0; k < 4; k++) {
    const s = orbitSky(o, te + dLt);
    te = tSeenJd - dLt - (s.pos.away * AU_KM) / C_KM_S / DAY_S;
  }
  return orbitSky(o, te + dLt).pos;
}

/** Semi-amplitude K (m/s) of the host's radial velocity induced by a companion. */
export function rvSemiAmplitudeMs(o: KeplerOrbit, companionMassMsun: number, hostMassMsun: number): number {
  const n = TAU / o.periodDays; // rad/day
  const vRel = (n * o.aAu * Math.sin(o.iDeg * DEG)) / Math.sqrt(1 - o.e * o.e); // au/day
  return ((vRel * AU_KM * 1000) / DAY_S) * (companionMassMsun / (companionMassMsun + hostMassMsun));
}
