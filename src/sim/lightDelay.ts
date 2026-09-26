/**
 * Light delay, all in the Sun's rest frame.
 *
 * - Apparent positions: with "light-delayed positions" on, each body is drawn where it was when
 *   the light now reaching the camera left it (its retarded position), and with the rotation
 *   it had then. Off, bodies are drawn where they are right now, which you could never
 *   actually see.
 * - Earth readouts: how old the image of Earth is, and how long a message to Earth would take.
 *
 * Retarded positions are worked out per system, not per body: a planet and its moons are
 * placed once at the planet's retarded time, and each moon is then carried back along its
 * velocity by the few seconds its own light-time differs by. Hundreds of moons cost one
 * ephemeris evaluation each rather than two chain walks each.
 *
 * The head of a system (a planet, a barycentre, a comet, a spacecraft) is itself carried back
 * along its velocity where that is good to LINEAR_KM (half its acceleration times the delay
 * squared: Pluto seen from Earth, 0.8 km); a system that is only its head then costs nothing
 * more. Heads whose providers ask for it (the built-in bodies) are evaluated at their retarded
 * time exactly, as are heads accelerating too hard for the straight line (a comet by the Sun).
 */
import { Vector3 } from 'three';
import { C_KM_S } from '../physics/constants';
import { retardedDelay, signalDelay } from '../physics/lightTime';
import { bodyPositionAt, type BodyId } from './bodies';
import { entryOf, lightTimeGroups, type Entry } from './bodies/registry';
import { evalGroupAt } from './bodies/world';
import { sim } from './sim';

const tmp = new Vector3();
const headAt = { pos: new Vector3(), vel: new Vector3() };

/** A head carried back along its velocity must be good to this, km. */
export const LINEAR_KM = 1;

/**
 * The retarded delay τ of a head carried back along a straight line (|x − vτ − cam| = cτ), in
 * three fixed-point steps from the present distance, into headAt.pos; NaN if the straight line
 * would be worse than LINEAR_KM. The acceleration is bounded by GM/r² of the root (when it has
 * a GM) and by v²/r of the orbit about it (exact for a circle, generous near perihelion).
 */
function linearDelay(head: Entry, cam: Vector3, rootGm: number): number {
  const b = head.state;
  let tau = b.pos.distanceTo(cam) / C_KM_S;
  for (let i = 0; i < 3; i++) tau = headAt.pos.copy(b.pos).addScaledVector(b.vel, -tau).distanceTo(cam) / C_KM_S;
  const r = head.rel.pos.length();
  if (!(r > 0)) return NaN;
  const acc = Math.max(head.rel.vel.lengthSq() / r, rootGm / (r * r));
  return 0.5 * acc * tau * tau <= LINEAR_KM ? tau : NaN;
}

export const earthLight = {
  /** "You are seeing Earth as it was … ago" (s). */
  seenAgo: 0,
  /** "A message to Earth would take …" (s). */
  messageTime: 0,
  /** sim.frame at the last update (the readouts are refreshed a few times a second). */
  frame: -1,
};

/** Set apparentPos/apparentQuat for every body (retarded when `retarded` is true). */
export function updateApparentPositions(retarded: boolean): void {
  const cam = sim.camera.pos;
  if (!retarded) {
    const list = sim.bodyList;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      b.apparentPos.copy(b.pos);
      b.apparentQuat.copy(b.quat);
      b.lightDelay = 0;
    }
    return;
  }
  const groups = lightTimeGroups();
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const head = g.head;
    if (g.members.length === 1 && head.record.provider.static) {
      // A body that does not move (the Sun, a star at its catalogue place) is where it was.
      const b = head.state;
      if (!head.isNode) {
        b.apparentPos.copy(b.pos);
        b.apparentQuat.copy(b.quat);
        b.lightDelay = b.pos.distanceTo(cam) / C_KM_S;
      }
      continue;
    }
    let tau: number;
    const linear = !head.record.provider.exactLightTime && head.centre ? linearDelay(head, cam, head.centre.record.physical.gmKm3S2 ?? 0) : NaN;
    if (!Number.isNaN(linear)) {
      // Carried back along its velocity (headAt.pos); only the members need the ephemeris.
      tau = linear;
      headAt.vel.copy(head.state.vel);
      if (g.members.length === 1) {
        placeLoneHead(head, tau);
        continue;
      }
      evalGroupAt(g, sim.astroTime.AddDays(-tau / 86_400), true, headAt);
    } else {
      // One fixed-point step from the geometric delay of the system's head, evaluated with the
      // exact ephemeris. Bodies move at ~10⁻⁴ c, so this is converged to well under a millisecond.
      tau = head.state.pos.distanceTo(cam) / C_KM_S;
      bodyPositionAt(head.id, sim.astroTime.AddDays(-tau / 86_400), tmp);
      tau = tmp.distanceTo(cam) / C_KM_S;
      evalGroupAt(g, sim.astroTime.AddDays(-tau / 86_400), true);
    }
    for (let i = 0; i < g.members.length; i++) {
      const m = g.members[i];
      if (m.isNode) continue;
      const b = m.state;
      if (m === head) {
        b.apparentPos.copy(m.t.pos);
        b.lightDelay = tau;
      } else {
        // Its own light-time differs from the head's by seconds: go back along its velocity,
        // with two fixed-point steps on that straight line (converged to ~10⁻⁸ s).
        let own = m.t.pos.distanceTo(cam) / C_KM_S;
        own = tmp.copy(m.t.pos).addScaledVector(m.t.vel, tau - own).distanceTo(cam) / C_KM_S;
        b.apparentPos.copy(m.t.pos).addScaledVector(m.t.vel, tau - own);
        b.lightDelay = own;
      }
      if (m.rotation) b.apparentQuat.copy(m.t.quat);
      else b.apparentQuat.copy(b.quat);
    }
  }
}

/**
 * A system that is only its head, carried back along its velocity (headAt.pos): no ephemeris
 * call. Its orientation is the one it had then only while it is drawn (a pixel wide or so);
 * a speck's is not seen.
 */
function placeLoneHead(head: Entry, tau: number): void {
  if (head.isNode) return;
  const b = head.state;
  b.apparentPos.copy(headAt.pos);
  b.lightDelay = tau;
  if (head.rotation && b.radiusPx >= 0.5) head.rotation.orientationAt(sim.astroTime.AddDays(-tau / 86_400), b.apparentQuat, head.rel);
  else b.apparentQuat.copy(b.quat);
}

/** Refresh the Earth light-delay readouts (a few ephemeris calls, so throttled by the caller). */
export function updateEarthLight(): void {
  const cam = sim.camera.pos.clone();
  const at = (id: BodyId) => (dt: number) => bodyPositionAt(id, sim.astroTime.AddDays(dt / 86_400), new Vector3());
  if (!entryOf('earth')) return;
  earthLight.seenAgo = retardedDelay(at('earth'), cam);
  earthLight.messageTime = signalDelay(at('earth'), cam);
  earthLight.frame = sim.frame;
}
