/**
 * Light delay, all in the Sun's rest frame.
 *
 * - Apparent positions: with "light-delayed positions" on, each body is drawn where it was when
 *   the light now reaching the camera left it (its retarded position), and with the rotation
 *   it had then. Off, bodies are drawn where they are right now, which you could never
 *   actually see.
 * - Earth readouts: how old the image of Earth is, and how long a message to Earth would take.
 */
import { Vector3 } from 'three';
import { C_KM_S, type BodyId } from '../physics/constants';
import { retardedDelay, signalDelay } from '../physics/lightTime';
import { bodyOrientation, bodyPositionAt } from './ephemeris';
import { sim } from './sim';

const tmp = new Vector3();

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
  for (const b of Object.values(sim.bodies)) {
    if (!retarded || b.id === 'sun') {
      b.apparentPos.copy(b.pos);
      b.apparentQuat.copy(b.quat);
      b.lightDelay = retarded ? b.pos.distanceTo(cam) / C_KM_S : 0;
      continue;
    }
    // One fixed-point step from the geometric delay, evaluated with the exact ephemeris.
    // Bodies move at ~10⁻⁴ c, so this is converged to well under a millisecond.
    let tau = b.pos.distanceTo(cam) / C_KM_S;
    bodyPositionAt(b.id, sim.astroTime.AddDays(-tau / 86_400), tmp);
    tau = tmp.distanceTo(cam) / C_KM_S;
    const t = sim.astroTime.AddDays(-tau / 86_400);
    bodyPositionAt(b.id, t, b.apparentPos);
    bodyOrientation(b.id, t, b.apparentQuat);
    b.lightDelay = tau;
  }
}

/** Refresh the Earth light-delay readouts (a few ephemeris calls, so throttled by the caller). */
export function updateEarthLight(): void {
  const cam = sim.camera.pos.clone();
  const at = (id: BodyId) => (dt: number) => bodyPositionAt(id, sim.astroTime.AddDays(dt / 86_400), new Vector3());
  earthLight.seenAgo = retardedDelay(at('earth'), cam);
  earthLight.messageTime = signalDelay(at('earth'), cam);
  earthLight.frame = sim.frame;
}
