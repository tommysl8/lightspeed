/**
 * The position provider of a planet (or companion) of another star: a fixed Kepler orbit on the
 * sky (the visual-binary conventions of orbit.ts), about its centre, evaluated on the observed
 * clock t + D(t)/c with D(t) the host's distance from the Sun as the app places it at t (read
 * from the registry). Published ephemerides are arrival times at the Solar System barycentre,
 * so with light-time on the Sun sees every transit at its published time, whatever distance the
 * app uses and however it moves the star (docs/data/exoplanets.md §3).
 *
 * Allocation-free: the perifocal axes are turned into J2000 ecliptic vectors once, and Kepler's
 * equation is solved inline.
 */
import type { AstroTime } from 'astronomy-engine';
import { ALWAYS, heliocentricEclAt, type Availability, type BodyId, type PositionProvider, type Regime, type Vec3Like } from '../bodies';
import { AU_KM, C_KM_S, DAY_S, DEG, J2000_JD, TAU } from './constants';
import type { KeplerOrbit } from './orbit';
import { skyToEcliptic } from './sky';

export interface SkyOrbitOptions {
  /** Direction of the host from the Sun (the sky basis at the host), degrees, J2000. */
  raDeg: number;
  decDeg: number;
  /** The body (or barycentre) whose distance from the Sun sets the light-time: the host. */
  lightTimeFrom: BodyId;
  /** The regime while the phase is trusted, and the span of UTC ms in which it is (outside: illustrative). */
  regime: Regime;
  validFromMs?: number;
  validToMs?: number;
  label: string;
}

/** GM that makes a two-body conic reproduce the orbit exactly: n²a³, km³/s². */
export function orbitMuKm3S2(o: KeplerOrbit): number {
  const n = TAU / (o.periodDays * DAY_S);
  const a = o.aAu * AU_KM;
  return n * n * a * a * a;
}

/** The provider of a body on a Kepler orbit on the sky (see the file comment). */
export function skyOrbitProvider(o: KeplerOrbit, opts: SkyOrbitOptions): PositionProvider {
  const e = o.e;
  if (!(e >= 0 && e < 1 && o.aAu > 0 && o.periodDays > 0)) throw new Error(`skyOrbitProvider: needs 0 ≤ e < 1, a > 0 and P > 0 (${opts.label})`);
  const ci = Math.cos(o.iDeg * DEG);
  const si = Math.sin(o.iDeg * DEG);
  const cO = Math.cos(o.nodeDeg * DEG);
  const sO = Math.sin(o.nodeDeg * DEG);
  const cw = Math.cos(o.argPeriDeg * DEG);
  const sw = Math.sin(o.argPeriDeg * DEG);
  // Perifocal axes in sky components (north, east, away): P towards periastron, Q 90° ahead.
  // From north = r[cos u cos Ω − sin u sin Ω cos i], east = r[cos u sin Ω + sin u cos Ω cos i],
  // away = r sin u sin i, with u = ω + f.
  const Pe = skyToEcliptic(opts.raDeg, opts.decDeg, { north: cw * cO - sw * sO * ci, east: cw * sO + sw * cO * ci, away: sw * si });
  const Qe = skyToEcliptic(opts.raDeg, opts.decDeg, { north: -sw * cO - cw * sO * ci, east: -sw * sO + cw * cO * ci, away: cw * si });
  const Px = Pe.x * AU_KM;
  const Py = Pe.y * AU_KM;
  const Pz = Pe.z * AU_KM;
  const Qx = Qe.x * AU_KM;
  const Qy = Qe.y * AU_KM;
  const Qz = Qe.z * AU_KM;
  const a = o.aAu;
  const b = a * Math.sqrt(1 - e * e);
  const period = o.periodDays;
  const nS = TAU / (period * DAY_S); // rad/s
  // Days from periastron at J2000 (TT); the observed clock adds the light-time.
  const base = J2000_JD - o.tPeriJd;
  const lightDaysPerKm = 1 / (C_KM_S * DAY_S);
  const host: Vec3Like = { x: 0, y: 0, z: 0 };
  const from = opts.lightTimeFrom;
  const lo = opts.validFromMs ?? -Infinity;
  const hi = opts.validToMs ?? Infinity;
  const good = ALWAYS[opts.regime];
  const outside = ALWAYS.illustrative;
  return {
    label: opts.label,
    availability: (ms: number): Availability => (ms >= lo && ms <= hi ? good : outside),
    positionAt(time: AstroTime, pos: Vec3Like, vel?: Vec3Like | null) {
      heliocentricEclAt(from, time, host);
      const D = Math.sqrt(host.x * host.x + host.y * host.y + host.z * host.z);
      const dt = (base + time.tt + D * lightDaysPerKm) % period; // the fmod keeps huge spans exact
      let M = (TAU * dt) / period;
      if (M < 0) M += TAU;
      let E = e < 0.8 ? M : Math.PI;
      for (let k = 0; k < 50; k++) {
        const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        E -= d;
        if (Math.abs(d) < 1e-14) break;
      }
      const cE = Math.cos(E);
      const sE = Math.sin(E);
      const x = a * (cE - e);
      const y = b * sE;
      pos.x = Px * x + Qx * y;
      pos.y = Py * x + Qy * y;
      pos.z = Pz * x + Qz * y;
      if (vel) {
        const Edot = nS / (1 - e * cE); // rad/s
        const vx = -a * sE * Edot;
        const vy = b * cE * Edot;
        vel.x = Px * vx + Qx * vy;
        vel.y = Py * vx + Qy * vy;
        vel.z = Pz * vx + Qz * vy;
      }
    },
  };
}
