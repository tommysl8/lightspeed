/**
 * The hole's sky cube: the Galaxy layer's light (its particles, clumps and galaxies, and its glow) all round the
 * camera, for the lens passes' rays whose source is off the screen (far-side images, which near the ring cover 23–29 %
 * of the screen at 10–20 M and 1.65 % at 100 M, and under 0.01 % beyond 3,000 M).
 *
 * What: two cube targets, RGBA16F with mipmaps: the particles at 512 px a face, the glow at 128; the unlensed sky seen
 * at rest in the hole frame from the camera's position (the point uniforms set to the hole's motion relative to the
 * Sun, exposure 0), whatever the lens frame: the lens reads it at n∞, a direction at infinity in the hole frame.
 * Within 3,000 M the camera is at most 127 au from Sgr A*, and the parallax for particles 1.2 pc and more away is
 * under 5e-4 rad in images that are themselves demagnified 10–100 times.
 *
 * When: built from r < 5,000 M on the way in (one face of each cube every other frame, every third at rung 1; then
 * their mipmaps), so that it is complete before 3,000 M, from where it is read; drawn again when the camera has moved
 * 0.005 pc (1,000 au) since, the clock has jumped more than 1,000 years or the rung changed (not when the exposure
 * changes: it is applied when the cube is read), face by face in place while the lens goes on reading it (the faces
 * change by a fraction of a texel's light, where going without the cube would take the far-side images' light away
 * for 12–20 frames), a redraw under way always finishing before the next begins; built afresh, and not read until it
 * is done, when the hole changes; frozen at rung 2 (but for a new hole); given back 30 s after it was last read, or
 * after the lens was last drawn (scene/BlackHoleLens.tsx asks every frame, with or without a lens).
 *
 * Cost: a particle face about 0.4 ms at 512 px (with the particles' frustum test), the glow face about 0.2 ms, the
 * mipmaps 0.2 ms once: spread over every other frame from 5,000 M, it never meets the close views. 16 MiB and 0.5 MiB.
 *
 * Twins: render/lens/lensPixel.glsl (reads it, with the faces' own cos³θ_face factor), render/galaxyLayer.ts
 * renderSkyCubeFace (draws a face).
 */
import { CubeCamera, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, type PerspectiveCamera, Scene, Vector3, WebGLCubeRenderTarget, type WebGLRenderer } from 'three';
import { galaxyLayer } from '../galaxyLayer';
import { relativityUniforms } from '../materials';
import { quality } from '../quality';
import { gravity } from '../../sim/gravity';
import { sim } from '../../sim/sim';
import { PARSEC_KM } from '../../physics/constants';
import { lens } from './lensState';
import { lensPassUniforms, SKY_CUBE_FACE_PX, SKY_CUBE_GLOW_FACE_PX } from './lensComposite';

/** Built from this r (units of M) on the way in, and read within READ_WITHIN_M. */
export const BUILD_WITHIN_M = 5000;
export const READ_WITHIN_M = 3000;
/** Built again when the camera has moved this far since (km: 0.005 pc). */
const REBUILD_MOVE_KM = 0.005 * PARSEC_KM;
/** Or the clock has jumped this far (Julian years). */
const REBUILD_YEARS = 1000;
/** Given back this long after it was last read, ms. */
const RELEASE_AFTER_MS = 30_000;
/** Faces in a cube. */
const FACES = 6;

interface CubeState {
  particles: WebGLCubeRenderTarget | null;
  glow: WebGLCubeRenderTarget | null;
  cam: CubeCamera | null;
  /** Faces drawn so far in the build under way (6: the faces are done; 7: the mipmaps too, no build under way). */
  done: number;
  /**
   * A complete build for `hole` is in the targets: the lens reads it (within READ_WITHIN_M), also while a redraw goes
   * on face by face.
   */
  live: boolean;
  /** Frames since the last face. */
  wait: number;
  hole: string | null;
  rung: number;
  /** Where the camera was (relative to the hole, km) and the clock (Julian years) when the build began. */
  at: Vector3;
  years: number;
  lastRead: number;
  /** Face renders, counted for the performance checks (dev/perf.ts: 7 an approach). */
  faceRenders: number;
}

export const skyCube: CubeState = {
  particles: null,
  glow: null,
  cam: null,
  done: 0,
  live: false,
  wait: 0,
  hole: null,
  rung: 0,
  at: new Vector3(),
  years: 0,
  lastRead: -Infinity,
  faceRenders: 0,
};

const saved = { phi: 0, ePhi: 1, emPhi: 1, lnExposure: 0, velDir: new Vector3() };
/** Nothing, rendered into a cube target to make its mipmaps. */
const emptyScene = new Scene();

function makeTarget(size: number, renderer: WebGLRenderer): WebGLCubeRenderTarget {
  const t = new WebGLCubeRenderTarget(size, { type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, depthBuffer: false });
  // Storage for every level now; the faces are then drawn without their mipmaps being made each time.
  renderer.initRenderTarget(t);
  t.texture.generateMipmaps = false;
  return t;
}

/** Give the cube's memory back. */
export function releaseSkyCube(): void {
  skyCube.particles?.dispose();
  skyCube.glow?.dispose();
  skyCube.particles = null;
  skyCube.glow = null;
  skyCube.done = 0;
  skyCube.live = false;
  skyCube.hole = null;
  lens.skyCubeLive = false;
  lensPassUniforms.uSkyCubeLive.value = 0;
}

/** Julian years of the clock since 1970 (only differences are used). */
function yearsNow(): number {
  return sim.timeMs / (365.25 * 86_400_000);
}

/** Draw face `face` of both cubes, with the point uniforms of an observer at rest in the hole frame. */
function drawFace(renderer: WebGLRenderer, scene: Scene, face: number, cssPxPerRad: number): void {
  const cam = skyCube.cam as CubeCamera;
  const u = relativityUniforms;
  saved.phi = u.uPhi.value;
  saved.ePhi = u.uEPhi.value;
  saved.emPhi = u.uEmPhi.value;
  saved.lnExposure = u.uLnExposure.value;
  saved.velDir.copy(u.uVelDir.value);
  const phi = gravity.framePhi;
  u.uPhi.value = phi;
  u.uEPhi.value = Math.exp(phi);
  u.uEmPhi.value = Math.exp(-phi);
  u.uLnExposure.value = 0;
  u.uVelDir.value.copy(gravity.frameVelDir);
  const back = renderer.getRenderTarget();
  const faceCam = cam.children[face] as PerspectiveCamera;
  galaxyLayer.renderSkyCubeFace(renderer, scene, faceCam, skyCube.particles as WebGLCubeRenderTarget, face, SKY_CUBE_FACE_PX / 2, cssPxPerRad, false);
  galaxyLayer.renderSkyCubeFace(renderer, scene, faceCam, skyCube.glow as WebGLCubeRenderTarget, face, SKY_CUBE_GLOW_FACE_PX / 2, cssPxPerRad, true);
  renderer.setRenderTarget(back);
  u.uPhi.value = saved.phi;
  u.uEPhi.value = saved.ePhi;
  u.uEmPhi.value = saved.emPhi;
  u.uLnExposure.value = saved.lnExposure;
  u.uVelDir.value.copy(saved.velDir);
  skyCube.faceRenders++;
}

/** The cubes' mipmaps, once their six faces are drawn. */
function drawMipmaps(renderer: WebGLRenderer): void {
  const back = renderer.getRenderTarget();
  // No clear before the empty render, whatever the renderer's setting (with autoClear on it would wipe face 5).
  const autoClear = renderer.autoClear;
  renderer.autoClear = false;
  for (const t of [skyCube.particles, skyCube.glow]) {
    if (!t) continue;
    t.texture.generateMipmaps = true;
    // Selecting the target and rendering nothing makes three.js generate its mipmaps at the end.
    renderer.setRenderTarget(t, 5);
    renderer.render(emptyScene, (skyCube.cam as CubeCamera).children[5] as PerspectiveCamera);
    t.texture.generateMipmaps = false;
  }
  renderer.autoClear = autoClear;
  renderer.setRenderTarget(back);
}

/** What the cube's schedule does about its contents this frame (skyCubeRestart). */
export type SkyCubeRestart = 'keep' | 'redraw' | 'rebuild';

/**
 * Whether the cube starts drawing again: 'rebuild' for another hole (not read until it is done), 'redraw' when it is
 * stale (the camera moved 1,000 au, the clock jumped 1,000 years, the rung changed) and no build is under way (not at
 * rung 2 once live: frozen there), read all the while; else 'keep'. A build under way always finishes first.
 */
export function skyCubeRestart(c: Pick<CubeState, 'hole' | 'rung' | 'years' | 'done' | 'live'>, hole: string | null, rung: number, movedKm: number, years: number): SkyCubeRestart {
  if (c.hole !== hole) return 'rebuild';
  if (c.done <= FACES) return 'keep';
  const stale = c.rung !== rung || movedKm > REBUILD_MOVE_KM || Math.abs(years - c.years) > REBUILD_YEARS;
  if (!stale || (rung >= 2 && c.live)) return 'keep';
  return 'redraw';
}

/**
 * With no lens, or none wanting the cube: it is not read, and its memory goes back 30 s after it last was (called every
 * frame by scheduleSkyCube and, with no lens drawn, by scene/BlackHoleLens.tsx).
 */
export function idleSkyCube(now?: number): void {
  lens.skyCubeLive = false;
  lensPassUniforms.uSkyCubeLive.value = 0;
  if (skyCube.particles && (now ?? performance.now()) - skyCube.lastRead > RELEASE_AFTER_MS) releaseSkyCube();
}

/**
 * Each frame (scene/BlackHoleLens.tsx, after the Galaxy layer's uniforms are current): build, redraw, read or release
 * the cube. cssPxPerRad: the view's CSS px per radian at its centre (to match the splats' kernel in angle).
 */
export function scheduleSkyCube(renderer: WebGLRenderer, scene: Scene, cssPxPerRad: number): void {
  const now = performance.now();
  const r = lens.obs.r;
  const wanted = lens.active && galaxyLayer.active && r < BUILD_WITHIN_M;
  if (!wanted) {
    idleSkyCube(now);
    return;
  }
  if (!skyCube.particles || !skyCube.glow) {
    skyCube.particles = makeTarget(SKY_CUBE_FACE_PX, renderer);
    skyCube.glow = makeTarget(SKY_CUBE_GLOW_FACE_PX, renderer);
    skyCube.done = 0;
    skyCube.live = false;
    skyCube.hole = null;
  }
  if (!skyCube.cam) {
    skyCube.cam = new CubeCamera(1e-3, 1e30, skyCube.particles);
    skyCube.cam.coordinateSystem = renderer.coordinateSystem;
    skyCube.cam.updateCoordinateSystem();
    skyCube.cam.updateMatrixWorld(true);
  }
  lensPassUniforms.uSkyCube.value = skyCube.particles.texture;
  lensPassUniforms.uSkyCubeGlow.value = skyCube.glow.texture;
  const rung = quality.lensRung;
  const years = yearsNow();
  const restart = skyCubeRestart(skyCube, lens.hole, rung, skyCube.at.distanceTo(gravity.camRelHoleKm), years);
  if (restart !== 'keep') {
    // Another hole: nothing of the old sky may be read. A redraw: the old faces are read until each is drawn again.
    if (restart === 'rebuild') skyCube.live = false;
    skyCube.done = 0;
    skyCube.wait = 0;
    skyCube.hole = lens.hole;
    skyCube.rung = rung;
    skyCube.at.copy(gravity.camRelHoleKm);
    skyCube.years = years;
  }
  if (skyCube.done <= FACES) {
    if (skyCube.wait > 0) skyCube.wait--;
    else {
      if (skyCube.done < FACES) drawFace(renderer, scene, skyCube.done, cssPxPerRad);
      else drawMipmaps(renderer);
      skyCube.done++;
      skyCube.wait = (rung >= 1 ? 3 : 2) - 1;
      if (skyCube.done > FACES) skyCube.live = true;
    }
  }
  const readable = skyCube.live && r < READ_WITHIN_M;
  lens.skyCubeLive = readable;
  lensPassUniforms.uSkyCubeLive.value = readable ? 1 : 0;
  if (readable) skyCube.lastRead = now;
}
