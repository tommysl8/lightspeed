/**
 * Camera controller. All state is float64 and lives in world coordinates; the three.js camera
 * itself stays at the origin (floating origin) and only receives the orientation.
 *
 * Modes
 *  - orbit:      orbit a body. Drag rotates, the wheel zooms on a log scale, motion is damped.
 *  - free:       free flight with pointer lock. WASD moves, Space/C go up and down,
 *                Q/E roll, the mouse looks around, and the wheel sets the throttle (0.3 m/s
 *                to 0.99999c on a logit scale). Motion is relative to the last body you
 *                orbited, combined with relativistic velocity addition.
 *  - transition: a smooth zoom-and-pan flight to a body (van Wijk & Nuij).
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { BODIES, C_KM_S, type BodyId } from '../physics/constants';
import { addVelocities } from '../physics/relativity';
import { logitToBeta } from '../physics/speedScale';
import { sim } from '../sim/sim';
import { useUI, type ControlMode } from '../state/ui';
import { easeInOut, zoomPanPath, type ZoomPanPath } from './zoomPan';
import { framingDistance, minDistance } from './framing';

export { framingDistance };

const UP = new Vector3(0, 1, 0);
const ZERO = new Vector3();
const MAX_DIST_KM = 1e12; // ~6,700 au
const FREE_LOGIT_MIN = -9; // ~0.3 m/s
const FREE_LOGIT_MAX = 5; // 0.99999c

interface Transition {
  fromBody: BodyId | null;
  fromPoint: Vector3;
  toBody: BodyId;
  w0: number;
  w1: number;
  dir0: Vector3;
  dir1: Vector3;
  rot: Quaternion;
  path: ZoomPanPath;
  t: number;
  duration: number;
}

const m4 = new Matrix4();
const v1 = new Vector3();
const v2 = new Vector3();
const qa = new Quaternion();
const qb = new Quaternion();

export class CameraController {
  mode: ControlMode = 'orbit';
  target: BodyId = 'earth';

  // Orbit state (azimuth/elevation of the camera around the target, world Y up).
  private az = 0;
  private el = 0.2;
  private logDist = Math.log(26_000);
  private goalAz = 0;
  private goalEl = 0.2;
  private goalLogDist = Math.log(26_000);

  // Free flight
  /** Throttle as a slider position in [0, 1] over the free-flight logit range. */
  throttle = (-4 - FREE_LOGIT_MIN) / (FREE_LOGIT_MAX - FREE_LOGIT_MIN); // 1e-4 c ≈ 30 km/s
  private keys = new Set<string>();
  private look = { x: 0, y: 0 };
  private frameBody: BodyId = 'earth';
  private thrustVel = new Vector3();

  // Travel: free look relative to the direction of motion.
  private lookYaw = 0;
  private lookPitch = 0;
  private travelDir = new Vector3(0, 0, -1);

  private tr: Transition | null = null;
  private dom: HTMLElement | null = null;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  private moved = 0;

  /** Called for a click (not a drag) on the canvas, in CSS px relative to the canvas. */
  onClick: ((x: number, y: number) => void) | null = null;
  onDoubleClick: ((x: number, y: number) => void) | null = null;

  // ── Setup ─────────────────────────────────────────────────────────────────────────────

  /** Put the camera in orbit around a body, facing its sunlit side. */
  placeAt(id: BodyId, dist = framingDistance(id)): void {
    this.target = id;
    this.frameBody = id;
    const dir = this.niceDirection(id);
    this.az = this.goalAz = Math.atan2(dir.x, dir.z);
    this.el = this.goalEl = Math.asin(dir.y);
    this.logDist = this.goalLogDist = Math.log(dist);
    this.setMode('orbit');
    useUI.setState({ focus: id });
  }

  attach(dom: HTMLElement): void {
    this.dom = dom;
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('dblclick', this.onDblClick);
    dom.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  detach(): void {
    const dom = this.dom;
    if (!dom) return;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('dblclick', this.onDblClick);
    dom.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.dom = null;
  }

  // ── Public actions ────────────────────────────────────────────────────────────────────

  /** Fly smoothly to a body and orbit it. */
  goTo(
    id: BodyId,
    opts: { keepDistance?: boolean; keepDirection?: boolean; distance?: number; direction?: Vector3 } = {},
  ): void {
    if (this.mode === 'travel') return;
    const eye = sim.camera.pos;
    const B = sim.bodies[id].pos;
    let fromBody: BodyId | null = null;
    const fromPoint = new Vector3();
    let w0: number;
    const dir0 = new Vector3();

    if (this.mode === 'orbit') {
      fromBody = this.target;
      w0 = Math.exp(this.logDist);
      dir0.copy(this.orbitDir(this.az, this.el));
    } else {
      // Look point in front of the camera, at a distance comparable to the destination's scale.
      const fwd = v1.set(0, 0, -1).applyQuaternion(sim.camera.quat);
      w0 = Math.min(Math.max(eye.distanceTo(B) * (opts.keepDistance ? 1 : 0.2), 1), 1e9);
      fromPoint.copy(eye).addScaledVector(fwd, w0);
      dir0.copy(fwd).negate();
    }

    const w1 = opts.distance
      ? Math.min(MAX_DIST_KM, Math.max(minDistance(id), opts.distance))
      : opts.keepDistance
        ? Math.max(minDistance(id), eye.distanceTo(B))
        : framingDistance(id);
    const dir1 = opts.direction
      ? opts.direction.clone().normalize()
      : opts.keepDirection
        ? v2.copy(eye).sub(B).normalize().clone()
        : this.niceDirection(id);
    const A = fromBody ? sim.bodies[fromBody].pos : fromPoint;
    const path = zoomPanPath(A.distanceTo(B), w0, w1);
    const duration = Math.min(6, Math.max(1.1, 0.8 + path.S * 0.3));
    const rot = new Quaternion().setFromUnitVectors(dir0, dir1);

    this.tr = { fromBody, fromPoint, toBody: id, w0, w1, dir0, dir1, rot, path, t: 0, duration };
    this.setMode('transition');
    this.frameBody = id;
    useUI.setState({ focus: id });
  }

  enterFreeFlight(): void {
    if (this.mode === 'travel') return;
    if (this.mode === 'transition') this.finishTransition();
    this.frameBody = this.target;
    this.setMode('free');
    this.dom?.requestPointerLock?.();
  }

  /** Leave free flight and orbit the nearest body from where we are. */
  exitFreeFlight(): void {
    if (this.mode !== 'free') return;
    if (document.pointerLockElement) document.exitPointerLock();
    const id = this.nearestBody();
    this.goTo(id, { keepDistance: true, keepDirection: true });
  }

  /** Ride along with a trip: the camera sits on the ship, looking along the course. */
  startTravel(dir: Vector3): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.tr = null;
    this.travelDir.copy(dir).normalize();
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.setMode('travel');
  }

  /** After arriving (or stopping), orbit a body from where the ship is. */
  finishTravel(id: BodyId): void {
    const B = sim.bodies[id].pos;
    const dir = v1.copy(sim.camera.pos).sub(B);
    const dist = Math.max(minDistance(id), dir.length());
    dir.normalize();
    this.target = id;
    this.frameBody = id;
    this.az = this.goalAz = Math.atan2(dir.x, dir.z);
    this.el = this.goalEl = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    this.logDist = this.goalLogDist = Math.log(dist);
    this.setMode('orbit');
    this.clampGoals();
    useUI.setState({ focus: id });
  }

  /** Leave travel mode mid-course: orbit the nearest body from where the ship stopped. */
  exitTravelToNearest(): void {
    this.setMode('free');
    const id = this.nearestBody();
    this.goTo(id, { keepDistance: true, keepDirection: true });
  }

  /** Point the travel view: 0 = straight ahead, π = straight back. */
  setTravelLook(yaw: number, pitch = 0): void {
    this.lookYaw = yaw;
    this.lookPitch = pitch;
  }

  get throttleBeta(): number {
    return logitToBeta(FREE_LOGIT_MIN + this.throttle * (FREE_LOGIT_MAX - FREE_LOGIT_MIN));
  }

  // ── Per-frame update ──────────────────────────────────────────────────────────────────

  update(dtReal: number, dtSim: number, shipPos?: Vector3): void {
    if (this.mode === 'transition') this.updateTransition(dtReal);
    else if (this.mode === 'orbit') this.updateOrbit(dtReal);
    else if (this.mode === 'travel') this.updateTravel(dtReal, shipPos);
    else this.updateFree(dtReal, dtSim);
  }

  private updateTravel(dt: number, shipPos?: Vector3): void {
    const k = this.keys;
    const rot = 1.4 * dt;
    if (k.has('ArrowLeft')) this.lookYaw += rot;
    if (k.has('ArrowRight')) this.lookYaw -= rot;
    if (k.has('ArrowUp')) this.lookPitch += rot;
    if (k.has('ArrowDown')) this.lookPitch -= rot;
    this.lookPitch = Math.max(-1.55, Math.min(1.55, this.lookPitch));
    if (shipPos) sim.camera.pos.copy(shipPos);
    // Base orientation looks along the course (world-up where possible), then free look.
    const fwd = this.travelDir;
    m4.lookAt(ZERO, fwd, Math.abs(fwd.y) > 0.9995 ? v2.set(0, 0, 1) : UP);
    sim.camera.quat.setFromRotationMatrix(m4);
    qa.setFromAxisAngle(v1.set(0, 1, 0), this.lookYaw);
    qb.setFromAxisAngle(v2.set(1, 0, 0), this.lookPitch);
    sim.camera.quat.multiply(qa).multiply(qb);
  }

  private updateOrbit(dt: number): void {
    // Keyboard orbiting (arrows, +/−) for accessibility.
    const k = this.keys;
    const rot = 1.4 * dt;
    if (k.has('ArrowLeft')) this.goalAz -= rot;
    if (k.has('ArrowRight')) this.goalAz += rot;
    if (k.has('ArrowUp')) this.goalEl += rot;
    if (k.has('ArrowDown')) this.goalEl -= rot;
    if (k.has('Equal') || k.has('NumpadAdd')) this.goalLogDist -= 1.6 * dt;
    if (k.has('Minus') || k.has('NumpadSubtract')) this.goalLogDist += 1.6 * dt;
    this.clampGoals();

    const a = 1 - Math.exp(-dt * 10);
    this.az += (this.goalAz - this.az) * a;
    this.el += (this.goalEl - this.el) * a;
    this.logDist += (this.goalLogDist - this.logDist) * (1 - Math.exp(-dt * 8));

    const target = sim.bodies[this.target];
    const dir = this.orbitDir(this.az, this.el);
    sim.camera.pos.copy(target.pos).addScaledVector(dir, Math.exp(this.logDist));
    this.lookAlong(dir.negate());
    sim.ship.vel.copy(target.vel);
  }

  private updateFree(dtReal: number, dtSim: number): void {
    const q = sim.camera.quat;
    const k = this.keys;
    // Mouse look (local yaw/pitch) and roll.
    if (this.look.x || this.look.y) {
      qa.setFromAxisAngle(v1.set(0, 1, 0), -this.look.x * 0.0022);
      qb.setFromAxisAngle(v2.set(1, 0, 0), -this.look.y * 0.0022);
      q.multiply(qa).multiply(qb);
      this.look.x = this.look.y = 0;
    }
    const roll = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);
    if (roll) q.multiply(qa.setFromAxisAngle(v1.set(0, 0, 1), roll * 1.2 * dtReal));
    q.normalize();

    const input = v1.set(
      (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      (k.has('KeyR') || k.has('Space') ? 1 : 0) - (k.has('KeyC') || k.has('ControlLeft') ? 1 : 0),
      (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0),
    );
    if (input.lengthSq() > 0) {
      input.normalize().applyQuaternion(q).multiplyScalar(this.throttleBeta * C_KM_S);
      this.thrustVel.copy(input);
    } else this.thrustVel.set(0, 0, 0);

    // Velocity relative to the reference body, composed relativistically.
    const ref = sim.bodies[this.frameBody].vel;
    const w = addVelocities(ref, this.thrustVel);
    sim.ship.vel.set(w.x, w.y, w.z);
    sim.camera.pos.addScaledVector(sim.ship.vel, dtSim);
  }

  private updateTransition(dt: number): void {
    const tr = this.tr!;
    tr.t = Math.min(1, tr.t + dt / tr.duration);
    const e = easeInOut(tr.t);
    const A = tr.fromBody ? sim.bodies[tr.fromBody].pos : tr.fromPoint;
    const B = sim.bodies[tr.toBody].pos;
    const { u, w } = tr.path.at(e);
    const dir = v1.copy(tr.dir0).applyQuaternion(qa.identity().slerp(tr.rot, e));
    // look point L = A + u (B − A); eye = L + dir · w
    sim.camera.pos.copy(B).sub(A).multiplyScalar(u).add(A).addScaledVector(dir, w);
    this.lookAlong(v2.copy(dir).negate());
    // Blend reference velocity from source to destination (only matters for relativity).
    sim.ship.vel.copy(sim.bodies[tr.toBody].vel);
    if (tr.t >= 1) this.finishTransition();
  }

  private finishTransition(): void {
    const tr = this.tr;
    if (!tr) return;
    this.target = tr.toBody;
    this.az = this.goalAz = Math.atan2(tr.dir1.x, tr.dir1.z);
    this.el = this.goalEl = Math.asin(Math.max(-1, Math.min(1, tr.dir1.y)));
    this.logDist = this.goalLogDist = Math.log(tr.w1);
    this.tr = null;
    this.setMode('orbit');
    this.clampGoals();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────────────

  private setMode(mode: ControlMode): void {
    this.mode = mode;
    if (useUI.getState().controlMode !== mode) useUI.setState({ controlMode: mode });
  }

  private orbitDir(az: number, el: number): Vector3 {
    return new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  }

  /** Orient the camera to look along `fwd` with world-up where possible. */
  private lookAlong(fwd: Vector3): void {
    m4.lookAt(ZERO, fwd, Math.abs(fwd.y) > 0.9995 ? v2.set(0, 0, 1) : UP);
    sim.camera.quat.setFromRotationMatrix(m4);
  }

  /** Viewing direction (from the body toward the camera) that shows a mostly sunlit disc. */
  private niceDirection(id: BodyId): Vector3 {
    const p = sim.bodies[id].pos;
    if (id === 'sun' || p.lengthSq() === 0) return this.orbitDir(0.6, 0.25);
    const toSun = p.clone().negate().normalize();
    const side = new Vector3().crossVectors(UP, toSun).normalize();
    return toSun.multiplyScalar(Math.cos(0.7)).addScaledVector(side, Math.sin(0.7)).addScaledVector(UP, 0.22).normalize();
  }

  private clampGoals(): void {
    this.goalEl = Math.max(-1.55, Math.min(1.55, this.goalEl));
    const lo = Math.log(minDistance(this.target));
    this.goalLogDist = Math.max(lo, Math.min(Math.log(MAX_DIST_KM), this.goalLogDist));
  }

  private nearestBody(): BodyId {
    let best: BodyId = 'sun';
    let bestScore = Infinity;
    for (const b of Object.values(sim.bodies)) {
      // Prefer bodies that are close relative to their size (so a nearby Moon beats a distant Sun).
      const score = b.pos.distanceTo(sim.camera.pos) / Math.sqrt(BODIES[b.id].radiusKm + 1);
      if (score < bestScore) {
        bestScore = score;
        best = b.id;
      }
    }
    return best;
  }

  // ── Input handlers ────────────────────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 2) return;
    if (this.mode === 'free') {
      if (!document.pointerLockElement) this.dom?.requestPointerLock?.();
      return;
    }
    this.dragging = true;
    this.moved = 0;
    this.lastX = this.downX = e.clientX;
    this.lastY = this.downY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.mode === 'free' && document.pointerLockElement === this.dom) {
      this.look.x += e.movementX;
      this.look.y += e.movementY;
      return;
    }
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.moved = Math.max(this.moved, Math.hypot(e.clientX - this.downX, e.clientY - this.downY));
    if (this.mode === 'orbit') {
      this.goalAz -= dx * 0.005;
      this.goalEl += dy * 0.005;
      this.clampGoals();
    } else if (this.mode === 'travel') {
      this.lookYaw += dx * 0.004;
      this.lookPitch = Math.max(-1.55, Math.min(1.55, this.lookPitch + dy * 0.004));
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.moved < 5 && e.button === 0 && this.dom) {
      const r = this.dom.getBoundingClientRect();
      this.onClick?.(e.clientX - r.left, e.clientY - r.top);
    }
  };

  private onDblClick = (e: MouseEvent): void => {
    if (!this.dom || this.mode === 'free') return;
    const r = this.dom.getBoundingClientRect();
    this.onDoubleClick?.(e.clientX - r.left, e.clientY - r.top);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (this.mode === 'free') {
      this.throttle = Math.min(1, Math.max(0, this.throttle - delta * 0.00035));
      useUI.setState({ throttleBeta: this.throttleBeta });
    } else if (this.mode === 'orbit') {
      this.goalLogDist += delta * 0.0022;
      this.clampGoals();
    }
  };

  private onContextMenu = (e: Event): void => e.preventDefault();

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTyping(e)) return;
    this.keys.add(e.code);
    if (this.mode === 'free' && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => this.keys.clear();

  private onPointerLockChange = (): void => {
    if (!document.pointerLockElement && this.mode === 'free') this.exitFreeFlight();
  };
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export const controller = new CameraController();
