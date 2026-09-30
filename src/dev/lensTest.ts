/**
 * Development hooks for checking the black hole's lens on the GPU (window.__ls.lensTest, development builds only;
 * scripts/lens-check/lens-check.js drives them; docs/data/blackholes.md §11 has what they found).
 *
 * What:
 *  - cameraMap(cam): a fixture camera of the Python reference (scripts/lens-check/ref/camera-maps.json)
 *    rendered through the real chunk lightspeed_lens (lensRay after the camera's own aberration) into an RGBA32F
 *    target of the camera's W × H and read back, top row first: per pixel the escape direction n∞ (xyz, world axes,
 *    the hole frame) with w = −1 where the ray is captured, and in a second read (ln g, |dΔφ/dα|, |sin Δφ/sin α|, 1),
 *    ln g the frequency ratio of light from far away as the fixture defines it (the observer's shift and the
 *    camera's Doppler factor). The tables are built for that camera alone; nothing of the app's lens is touched.
 *  - pointImages(cam, dirs, order): the per-vertex path (lensImage, tier 1) for sources at infinity in the
 *    directions dirs (xyz triples, world axes, hole frame): each image of that order (0 by default), its direction as
 *    that camera sees it (after its aberration) and ln(|μ|B0) in w (1e30 where there is no such image), in the order
 *    given.
 *  - exactImages(cam, rel, order, tier): sources at finite distances (camera → source, units of M) through the exact
 *    solver of the GPU (lensExact.glsl lensImageExact, tier 2; or with tier 1 lens.glsl lensImage) for a static camera:
 *    each image's direction and ln|μ| (w = 1e30 where unsolved), and ln g, to check against physics/lensPoint.ts
 *    pointImageExact (pointImageTier1).
 *  - pointImagesCheck(): the camera maps' second check: every uncaptured pixel of the 8 fixture camera maps through the
 *    per-vertex path (a source at infinity in the reference's escape direction, orders 0–3); the image nearest the
 *    pixel's own direction must be within 0.01 px at 1,484 px/rad. Per camera: pixels, the worst error, those over.
 *  - exactCheck(opts): the GPU's tier 2 against pointImageExact in float64 over a grid of static cameras (5 M to
 *    4,000 au from Sgr A*), sources (4 M to 1e5 M) and angles at the hole (1e-3 to π − 1e-3), orders 0 and 1: the
 *    worst and 99.9th-percentile image error in px, the images the CPU finds and the GPU does not, and ln|μ|.
 *  - tier1Check(opts): the same grid through the GPU's tier 1 (lensImage) against pointImageTier1 on the same tables.
 *  - debugSky(mode): 0 the sky; 1 the reference pictures' 15° checkerboard (render_views.py: cells coloured by
 *    octant, lines every 30°, black where captured) painted from n∞; 2 the escape direction as colour; 3 ln(ν_obs/ν_∞)
 *    from blue (−1.5) to red (+1.5); 4 a uniform-radiance sky (the targets and the cube faces filled as the
 *    particles and the glow fill them): the output must be uniform to 1 % times Y(gT)/Y(T) (drawn at half level,
 *    below saturation). The lens box is then the whole screen, only the lens's passes are drawn, and they go
 *    straight to the screen without bloom or tone mapping. Any view near a hole.
 *  - setCamera(cam, hole): the app's own view put at a fixture camera, kept there frame after frame until
 *    release() (or the next call): the lens's observer at the camera's r and frame (the raindrop's for
 *    'raindrop'), the camera's orientation, field and motion; one frame is drawn.
 *  - forceObserver(r, frame): the lens's observer at r (units of M) from Sgr A* in that frame, the hole straight
 *    ahead of the present view (before the gravity state was real; still handy for any radius).
 *  - bandCode(present): the lens box's composite with the band's early-out compiled in (true, as shipped) or out,
 *    for the check that it costs nothing where no band is drawn.
 *  - debugFrame(): the lens's passes of this view (a debug sky) rendered into a float target and read back, top row
 *    first (for the checks the 8-bit canvas cannot resolve: the uniform sky, ln g).
 *  - bloomHalf(on): bloom's luminance pass at half resolution (quality.bloomHalfLuminance), for the measurement
 *    that decides whether it ships.
 *
 * Why: the physics is checked in float64 against the reference in Node; these hooks check what the GPU draws.
 *
 * Cost: nothing unless called. Never imported by the production build (main.tsx imports it in development only).
 *
 * Twins: render/lens/lensState.ts (lensOverride), render/lens/lensPixel.glsl (the debug skies),
 * scripts/lens-check/lens-check.js (the checks), scripts/schwarzschild/render_views.py (the reference pictures).
 */
import { _roots, advance } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  FloatType,
  HalfFloatType,
  Matrix4,
  Mesh,
  NearestFilter,
  NoBlending,
  OrthographicCamera,
  type PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
  DataTexture,
  RedFormat,
  RGFormat,
} from 'three';
import type { BodyId } from '../sim/bodies/types';
import type { LensFrame } from '../physics/schwarzschild';
import { sim } from '../sim/sim';
import { FWD_NODES, INV_NODES, MU_BOUND_NODES, REL_NODES, buildForwardTable, buildInverseTable, buildMuBound } from '../physics/schwarzschildTables';
import { pointImageExact, pointImageTier1, REFERENCE_PX_PER_RAD, type PointImage } from '../physics/lensPoint';
import { lensUniforms } from '../render/lens/lensUniforms';
import { forceLensProgramsReady, lensOverride, lensTableValues, type LensTableValues } from '../render/lens/lensState';
import { b0zTexture, fillForwardTexels, fillInverseTexels, INV_TEXELS } from '../render/lens/lensTextures';
import { lensPassUniforms } from '../render/lens/lensComposite';
import { LENS_DEBUG_LAYER } from '../render/LightspeedScenePass';
import { relView, setPointUniforms } from '../render/relativisticView';
import { setLensView } from '../render/lens/lensState';
import { quality } from '../render/quality';

/** A reference camera, as the fixtures' camera maps give it (positions relative to the hole, units of M). */
export interface FixtureCamera {
  frame: LensFrame | 'raindrop';
  pos: [number, number, number];
  forward: [number, number, number];
  up: [number, number, number];
  /** Vertical field of view, degrees. */
  fovy: number;
  /** The camera's rapidity relative to the lens frame, and its direction (world axes), or none. */
  phi: number;
  vdir: [number, number, number] | null;
  W: number;
  H: number;
}

/** window.__ls.lensTest. */
export interface LensTestApi {
  cameraMap(cam: FixtureCamera): Promise<{ nInf: Float32Array; lnG: Float32Array }>;
  pointImages(cam: FixtureCamera, dirs: Float32Array | number[], order?: 0 | 1 | 2 | 3): Promise<Float32Array>;
  exactImages(cam: FixtureCamera, rel: Float32Array | number[], order?: 0 | 1, tier?: 1 | 2): Promise<{ img: Float32Array; lnG: Float32Array }>;
  pointImagesCheck(): Promise<PointImagesCheckRow[]>;
  exactCheck(opts?: ExactCheckOptions): Promise<ExactCheckResult>;
  tier1Check(opts?: ExactCheckOptions): Promise<ExactCheckResult>;
  debugSky(mode: 0 | 1 | 2 | 3 | 4): void;
  setCamera(cam: FixtureCamera, hole?: BodyId): void;
  forceObserver(r: number, frame: LensFrame): void;
  release(): void;
  bandCode(present: boolean): boolean;
  debugFrame(): Promise<{ w: number; h: number; data: Float32Array }>;
  bloomHalf(on: boolean): void;
}

function root() {
  const r = _roots.values().next().value;
  if (!r) throw new Error('[lightspeed] lensTest: no canvas yet');
  return r.store.getState();
}

function renderer(): WebGLRenderer {
  return root().gl;
}

/** Step the render loop one frame, as __ls.step does. */
function stepOne(): void {
  sim.debugDt = 1 / 60;
  try {
    advance(performance.now());
  } finally {
    sim.debugDt = 0;
  }
}

const lensFrameOf = (f: FixtureCamera['frame']): LensFrame => (f === 'static' ? 'static' : 'rain');

/** The camera's orientation (it looks along its local −z) from forward and up, as render_views.py builds it. */
function orientation(cam: FixtureCamera, out: Quaternion): Quaternion {
  const f = new Vector3(...cam.forward).normalize();
  const up = new Vector3(...cam.up);
  const right = new Vector3().crossVectors(f, up).normalize();
  const upv = new Vector3().crossVectors(right, f);
  const back = f.clone().negate();
  return out.setFromRotationMatrix(new Matrix4().makeBasis(right, upv, back));
}

// ─── The standalone passes: a camera map and point images through the real chunk ───────────────────────

const MAP_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** One pixel of a fixture camera: its ray, the camera's aberration (ship → lens frame), the lens. */
const MAP_FRAG = /* glsl */ `
#include <lightspeed_lens>
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanHalf;
uniform vec2 uSize;
uniform vec3 uVdir;
uniform float uMoveEPhi;
uniform float uMoveEmPhi;
uniform float uOut;
void main() {
  float x = (2.0 * gl_FragCoord.x / uSize.x - 1.0) * (uSize.x / uSize.y) * uTanHalf;
  float y = (2.0 * gl_FragCoord.y / uSize.y - 1.0) * uTanHalf;
  vec3 d = normalize(uCamFwd + x * uCamRight + y * uCamUp);
  float lnD;
  vec3 dr = relUnaberrateLens(d, uVdir, uMoveEPhi, uMoveEmPhi, lnD);
  vec3 nInf;
  vec2 jac;
  float lnG;
  bool esc = lensRay(dr, nInf, jac, lnG);
  gl_FragColor = uOut < 0.5 ? vec4(nInf, esc ? 1.0 : -1.0) : vec4(lnG + lnD, jac, 1.0);
}
`;

/** One source at infinity a point: its order-0 image (tier 1), as the moving camera sees it, into pixel i of the target. */
const POINTS_VERT = /* glsl */ `
#include <lightspeed_lens>
attribute float aIndex;
uniform vec2 uSize;
uniform vec3 uVdir;
uniform float uMoveEPhi;
uniform float uMoveEmPhi;
uniform float uOrder;
varying vec4 vOut;
void main() {
  vec3 dir;
  float lnMuB0;
  float lnG;
  // A source at infinity: 1e12 M away (its parallax, r_o/1e12, is nothing; float32 keeps only its direction).
  // No such image: w = 1e30.
  bool ok = lensImage(normalize(position) * 1e12, uOrder, 0.0, dir, lnMuB0, lnG);
  if (!ok) lnMuB0 = 1e30;
  float lnD;
  vec3 seen = uMoveEPhi > 1.0 ? lensBoost(dir, uVdir, uMoveEPhi, uMoveEmPhi, lnD) : dir;
  vOut = vec4(seen, lnMuB0);
  float px = mod(aIndex, uSize.x);
  float py = floor(aIndex / uSize.x);
  gl_Position = vec4((2.0 * (px + 0.5) / uSize.x - 1.0), (2.0 * (py + 0.5) / uSize.y - 1.0), 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;
const POINTS_FRAG = /* glsl */ `
varying vec4 vOut;
void main() {
  gl_FragColor = vOut;
}
`;

/**
 * One source a point (camera → source, units of M, world axes, the hole frame): its image of that order by the
 * exact solver (lensImageExact, tier 2) into pixel i: (direction, ln|μ|) or, with uOut 1, (ln g, 1 where solved, 0, 0).
 * Unsolved: w = 1e30 (the orbit program then falls back to tier 1).
 */
const EXACT_VERT = /* glsl */ `
#include <lightspeed_lens>
#include <lightspeed_lens_exact>
attribute float aIndex;
uniform vec2 uSize;
uniform float uOrder;
uniform float uOut;
varying vec4 vOut;
void main() {
  vec3 dir;
  float lnMu;
  float lnG;
#ifdef TIER1
  bool ok = lensImage(position, uOrder, 0.0, dir, lnMu, lnG);
#else
  bool ok = lensImageExact(position, uOrder, dir, lnMu, lnG);
#endif
  vOut = uOut < 0.5 ? vec4(dir, ok ? lnMu : 1e30) : vec4(lnG, ok ? 1.0 : 0.0, 0.0, 0.0);
  float px = mod(aIndex, uSize.x);
  float py = floor(aIndex / uSize.x);
  gl_Position = vec4((2.0 * (px + 0.5) / uSize.x - 1.0), (2.0 * (py + 0.5) / uSize.y - 1.0), 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

/** A private copy of the lens uniforms (nothing shared with the app's), set for a fixture camera. */
function fixtureUniforms(cam: FixtureCamera): Record<string, { value: unknown }> {
  const u: Record<string, { value: unknown }> = {};
  for (const [k, o] of Object.entries(lensUniforms)) {
    const v = (o as { value: unknown }).value;
    u[k] = { value: v instanceof Float32Array ? new Float32Array(v) : v && typeof (v as { clone?: unknown }).clone === 'function' && !(v as { isTexture?: boolean }).isTexture ? (v as Vector3).clone() : v };
  }
  const pos = new Vector3(...cam.pos);
  const r = pos.length();
  const fwd = buildForwardTable({ frame: lensFrameOf(cam.frame), r }, FWD_NODES);
  const inv = buildInverseTable(fwd, INV_NODES, REL_NODES);
  const tv: LensTableValues = { ro: 0, edge: 0, span: 0, frame: 0, lnG: 0, rainV: 0, rainOneMinusV: 1, fwd: [0, 1, 2, 3], inv: [0, 1, 2, 1], invRel: [0, 1, 2, 0], muAxis: [0, 1] };
  lensTableValues(fwd, inv, tv);
  const fTex = new DataTexture(fillForwardTexels(fwd, new Float32Array(FWD_NODES + 2)), FWD_NODES + 2, 1, RedFormat, FloatType);
  const iTex = new DataTexture(fillInverseTexels(inv, new Float32Array(4 * INV_TEXELS)), INV_TEXELS, 2, RGFormat, FloatType);
  for (const [t, f] of [
    [fTex, 'R32F'],
    [iTex, 'RG32F'],
  ] as const) {
    t.internalFormat = f;
    t.minFilter = NearestFilter;
    t.magFilter = NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
  }
  const mu = buildMuBound(inv, new Float32Array(MU_BOUND_NODES));
  u.uLensOn.value = 1;
  u.uLensHole.value = pos.clone().negate();
  u.uLensAxis.value = pos.clone().negate().normalize();
  u.uLensRo.value = tv.ro;
  u.uLensEdge.value = tv.edge;
  u.uLensSpan.value = tv.span;
  u.uLensFrame.value = tv.frame;
  u.uLensLnG.value = tv.lnG;
  u.uLensRain.value = new Vector2(tv.rainV, tv.rainOneMinusV);
  u.uLensFwd.value = new Vector4(...tv.fwd);
  u.uLensInv.value = new Vector4(...tv.inv);
  u.uLensInvRel.value = new Vector4(...tv.invRel);
  u.uLensMuBoundAxis.value = new Vector2(...tv.muAxis);
  u.uLensMuBound.value = mu;
  u.uLensFwdTab.value = fTex;
  u.uLensInvTab.value = iTex;
  u.uLensB0Z.value = b0zTexture();
  u.uLensPtCos.value = -1;
  u.uLensDiffCos.value = -1;
  u.uLensPxPerRad.value = cam.H / (2 * Math.tan((cam.fovy * Math.PI) / 360));
  u.uFramePhi.value = 0;
  u.uFrameEPhi.value = 1;
  u.uFrameEmPhi.value = 1;
  const moving = cam.phi > 0 && !!cam.vdir;
  u.uVdir = { value: moving ? new Vector3(...(cam.vdir as [number, number, number])).normalize() : new Vector3(0, 0, -1) };
  u.uMoveEPhi = { value: moving ? Math.exp(cam.phi) : 1 };
  u.uMoveEmPhi = { value: moving ? Math.exp(-cam.phi) : 1 };
  return u;
}

function disposeFixtureUniforms(u: Record<string, { value: unknown }>): void {
  (u.uLensFwdTab.value as DataTexture).dispose();
  (u.uLensInvTab.value as DataTexture).dispose();
}

/** Render `scene` into a float target of w × h and read it back, bottom row first (as WebGL gives it). */
function renderFloat(scene: Scene, camera: OrthographicCamera, w: number, h: number, rt: WebGLRenderTarget): Float32Array {
  const r = renderer();
  const back = r.getRenderTarget();
  const autoClear = r.autoClear;
  r.autoClear = true;
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 0);
  r.render(scene, camera);
  const out = new Float32Array(4 * w * h);
  const gl = r.getContext() as WebGL2RenderingContext;
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, out);
  r.setRenderTarget(back);
  r.autoClear = autoClear;
  return out;
}

/** Rows reversed (bottom first ↔ top first), 4 floats a pixel. */
function flipRows(a: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(a.length);
  const row = 4 * w;
  for (let y = 0; y < h; y++) out.set(a.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  return out;
}

async function cameraMap(cam: FixtureCamera): Promise<{ nInf: Float32Array; lnG: Float32Array }> {
  const W = cam.W;
  const H = cam.H;
  const u = fixtureUniforms(cam);
  const f = new Vector3(...cam.forward).normalize();
  const right = new Vector3().crossVectors(f, new Vector3(...cam.up)).normalize();
  const upv = new Vector3().crossVectors(right, f);
  Object.assign(u, {
    uCamRight: { value: right },
    uCamUp: { value: upv },
    uCamFwd: { value: f },
    uTanHalf: { value: Math.tan((cam.fovy * Math.PI) / 360) },
    uSize: { value: new Vector2(W, H) },
    uOut: { value: 0 },
  });
  const mat = new ShaderMaterial({ uniforms: u, vertexShader: MAP_VERT, fragmentShader: MAP_FRAG, blending: NoBlending, depthTest: false, depthWrite: false });
  const geo = new PlaneGeometry(2, 2);
  const scene = new Scene();
  const quad = new Mesh(geo, mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rt = new WebGLRenderTarget(W, H, { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
  try {
    const n = renderFloat(scene, ortho, W, H, rt);
    u.uOut.value = 1;
    const g = renderFloat(scene, ortho, W, H, rt);
    return { nInf: flipRows(n, W, H), lnG: flipRows(g, W, H) };
  } finally {
    rt.dispose();
    geo.dispose();
    mat.dispose();
    disposeFixtureUniforms(u);
  }
}

async function pointImages(cam: FixtureCamera, dirs: Float32Array | number[], order: 0 | 1 | 2 | 3 = 0): Promise<Float32Array> {
  const n = Math.floor(dirs.length / 3);
  const W = 256;
  const H = Math.max(1, Math.ceil(n / W));
  const u = fixtureUniforms(cam);
  u.uSize = { value: new Vector2(W, H) };
  u.uOrder = { value: order };
  const mat = new ShaderMaterial({ uniforms: u, vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG, blending: NoBlending, depthTest: false, depthWrite: false });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(Float32Array.from(dirs as ArrayLike<number>).subarray(0, 3 * n), 3));
  geo.setAttribute('aIndex', new BufferAttribute(Float32Array.from({ length: n }, (_, i) => i), 1));
  const scene = new Scene();
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const rt = new WebGLRenderTarget(W, H, { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
  try {
    const all = renderFloat(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1), W, H, rt);
    return all.slice(0, 4 * n);
  } finally {
    rt.dispose();
    geo.dispose();
    mat.dispose();
    disposeFixtureUniforms(u);
  }
}

/**
 * Sources at finite distances (camera → source, xyz triples in units of M, world axes, the hole frame) through the
 * exact solver of the GPU (lensImageExact) for a static fixture camera: per source (direction, ln|μ|) with w = 1e30
 * where unsolved, and (ln g, 1 where solved, 0, 0), in the order given.
 */
async function exactImages(cam: FixtureCamera, rel: Float32Array | number[], order: 0 | 1 = 0, tier: 1 | 2 = 2): Promise<{ img: Float32Array; lnG: Float32Array }> {
  const n = Math.floor(rel.length / 3);
  const W = 256;
  const H = Math.max(1, Math.ceil(n / W));
  const u = fixtureUniforms(cam);
  u.uSize = { value: new Vector2(W, H) };
  u.uOrder = { value: order };
  u.uOut = { value: 0 };
  const mat = new ShaderMaterial({ uniforms: u, vertexShader: EXACT_VERT, fragmentShader: POINTS_FRAG, blending: NoBlending, depthTest: false, depthWrite: false, defines: tier === 1 ? { TIER1: '' } : {} });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(Float32Array.from(rel as ArrayLike<number>).subarray(0, 3 * n), 3));
  geo.setAttribute('aIndex', new BufferAttribute(Float32Array.from({ length: n }, (_, i) => i), 1));
  const scene = new Scene();
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const rt = new WebGLRenderTarget(W, H, { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
  const ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  try {
    const img = renderFloat(scene, ortho, W, H, rt).slice(0, 4 * n);
    u.uOut.value = 1;
    const lnG = renderFloat(scene, ortho, W, H, rt).slice(0, 4 * n);
    return { img, lnG };
  } finally {
    rt.dispose();
    geo.dispose();
    mat.dispose();
    disposeFixtureUniforms(u);
  }
}

// ─── The app's own view at a fixture camera, and the debug skies ────────────────────────────────────────

/** The field of view the app's camera had before a fixture camera took it. */
let savedFov: number | null = null;

function debugSky(mode: 0 | 1 | 2 | 3 | 4): void {
  lensOverride.debug = mode;
  lensPassUniforms.uLensDebug.value = mode;
}

function setCamera(cam: FixtureCamera, hole: BodyId = 'sgr-a-star'): void {
  const camera = root().camera as PerspectiveCamera;
  if (savedFov === null) savedFov = camera.fov;
  const pos = new Vector3(...cam.pos);
  lensOverride.on = true;
  lensOverride.hole = hole;
  lensOverride.frame = lensFrameOf(cam.frame);
  lensOverride.rM = pos.length();
  lensOverride.camM.copy(pos);
  const moving = cam.phi > 0 && !!cam.vdir;
  lensOverride.phi = moving ? cam.phi : 0;
  if (moving) lensOverride.velDir.set(...(cam.vdir as [number, number, number])).normalize();
  const q = orientation(cam, new Quaternion());
  const fov = cam.fovy;
  lensOverride.apply = () => {
    sim.camera.quat.copy(q);
    sim.camera.fovDeg = fov;
    camera.quaternion.copy(q);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  };
  // A check may come before the background compiles have finished: the lens is drawn regardless (dev only).
  forceLensProgramsReady(true);
  stepOne();
}

function forceObserver(r: number, frame: LensFrame): void {
  const camera = root().camera as PerspectiveCamera;
  const fwd = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  lensOverride.on = true;
  lensOverride.hole = 'sgr-a-star';
  lensOverride.frame = frame;
  lensOverride.rM = r;
  lensOverride.camM.copy(fwd).multiplyScalar(-r);
  lensOverride.phi = 0;
  lensOverride.apply = null;
  forceLensProgramsReady(true);
  stepOne();
}

function release(): void {
  lensOverride.on = false;
  lensOverride.apply = null;
  debugSky(0);
  forceLensProgramsReady(null);
  if (savedFov !== null) {
    const camera = root().camera as PerspectiveCamera;
    camera.fov = savedFov;
    camera.updateProjectionMatrix();
    savedFov = null;
  }
  stepOne();
}

/** The lens box's composite with its band early-out compiled in (true) or out; returns whether one was found. */
function bandCode(present: boolean): boolean {
  let found = false;
  root().scene.traverse((o) => {
    const m = (o as Mesh).material as ShaderMaterial | undefined;
    if (!m?.isShaderMaterial || !/The lens box's composite/.test(m.fragmentShader)) return;
    found = true;
    const has = 'LENS_NO_BAND' in (m.defines ?? {});
    if (has === !present) return;
    m.defines = { ...(m.defines ?? {}) };
    if (present) delete m.defines.LENS_NO_BAND;
    else m.defines.LENS_NO_BAND = '';
    m.needsUpdate = true;
  });
  return found;
}

/** The lens's passes of this view (a debug sky), rendered into a half-float target and read back as floats, top row first. */
async function debugFrame(): Promise<{ w: number; h: number; data: Float32Array }> {
  const st = root();
  const r = st.gl;
  const camera = st.camera as PerspectiveCamera;
  stepOne();
  const gl = r.getContext() as WebGL2RenderingContext;
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const rt = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
  const mask = camera.layers.mask;
  const back = r.getRenderTarget();
  const autoClear = r.autoClear;
  try {
    camera.layers.set(LENS_DEBUG_LAYER);
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.autoClear = false;
    // Each half of a split view with its own observer, as the scene pass draws a debug sky.
    const xs = Math.round(relView.splitX * w);
    for (const rel of relView.split ? [false, true] : [relView.active]) {
      setPointUniforms(rel);
      setLensView(rel);
      if (relView.split) {
        rt.scissor.set(rel ? xs : 0, 0, rel ? w - xs : xs, h);
        rt.scissorTest = true;
        r.setRenderTarget(rt);
      }
      r.render(st.scene, camera);
    }
    rt.scissorTest = false;
    const out = new Float32Array(4 * w * h);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, out);
    return { w, h, data: flipRows(out, w, h) };
  } finally {
    camera.layers.mask = mask;
    r.setRenderTarget(back);
    r.autoClear = autoClear;
    rt.dispose();
  }
}

function bloomHalf(on: boolean): void {
  quality.bloomHalfLuminance = on;
}

/** One camera of pointImagesCheck. */
export interface PointImagesCheckRow {
  name: string;
  n: number;
  worstPx: number;
  over001: number;
  byOrder: number[];
}

const unit3 = (v: readonly number[]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross3 = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** The angle between two directions, in device px at the accuracy targets' 1,484 px/rad. */
const errPx = (a: readonly number[], b: readonly number[]): number => Math.atan2(Math.hypot(...cross3(a, b)), dot3(a, b)) * REFERENCE_PX_PER_RAD;

interface CameraMapRef extends FixtureCamera {
  name: string;
  captured: number[];
  nInf: [number, number, number][];
}

async function pointImagesCheck(): Promise<PointImagesCheckRow[]> {
  const maps = (await (await fetch('/scripts/lens-check/ref/camera-maps.json')).json()) as { cameras: CameraMapRef[] };
  const out: PointImagesCheckRow[] = [];
  for (const cam of maps.cameras) {
    const f = unit3(cam.forward);
    const rt = unit3(cross3(f, cam.up));
    const up = cross3(rt, f);
    const t = Math.tan((cam.fovy * Math.PI) / 360);
    const pts: { dv: [number, number, number]; n: [number, number, number] }[] = [];
    for (let j = 0; j < cam.H; j++)
      for (let i = 0; i < cam.W; i++) {
        const k = j * cam.W + i;
        if (cam.captured[k] === 1) continue;
        const x = ((2 * (i + 0.5)) / cam.W - 1) * (cam.W / cam.H) * t;
        const y = (1 - (2 * (j + 0.5)) / cam.H) * t;
        pts.push({ dv: unit3([f[0] + x * rt[0] + y * up[0], f[1] + x * rt[1] + y * up[1], f[2] + x * rt[2] + y * up[2]]), n: cam.nInf[k] });
      }
    const dirs = new Float32Array(pts.flatMap((p) => p.n));
    const res: Float32Array[] = [];
    for (const o of [0, 1, 2, 3] as const) res.push(await pointImages(cam, dirs, o));
    let worst = 0;
    let over = 0;
    const byOrder = [0, 0, 0, 0];
    pts.forEach((p, idx) => {
      let m = Infinity;
      let mo = -1;
      res.forEach((r, o) => {
        if (r[4 * idx + 3] > 1e29) return;
        const e = errPx(unit3([r[4 * idx], r[4 * idx + 1], r[4 * idx + 2]]), p.dv);
        if (e < m) {
          m = e;
          mo = o;
        }
      });
      if (mo >= 0) byOrder[mo]++;
      worst = Math.max(worst, m);
      if (!(m <= 0.01)) over++;
    });
    out.push({ name: cam.name, n: pts.length, worstPx: +worst.toFixed(5), over001: over, byOrder });
  }
  return out;
}

/** The grid of exactCheck: camera radii, source radii (units of M), angles at the hole and azimuths (rad). */
export interface ExactCheckOptions {
  ros?: number[];
  rss?: number[];
  gammas?: number[];
  azimuths?: number[];
}
export interface ExactCheckResult {
  cases: number;
  solvedBoth: number;
  worstPx: number;
  p999Px: number;
  over002: number;
  /** Images the float64 solver finds and the GPU does not. */
  gpuMissing: number;
  lnMuMedian: number;
  lnMu99: number;
}

/**
 * Tier 1 (lens.glsl lensImage) for sources at finite distances against its float64 twin pointImageTier1 on the same
 * tables, over exactCheck's grid (the Newton regime, which sources at infinity never reach, included): the same
 * figures, and the images one finds and the other does not (`gpuMissing` counts both ways).
 */
async function tier1Check(opts: ExactCheckOptions = {}): Promise<ExactCheckResult> {
  const ros = opts.ros ?? [5, 10, 20, 100, 1000, 1e4, 94_308];
  const rss = opts.rss ?? [4, 6, 10, 30, 100, 300, 1000, 3000, 1e4, 3e4, 1e5];
  const gammas = opts.gammas ?? [1e-3, 0.01, 0.1, 0.3, 0.6, 1, 1.3, 1.5, 1.7, 2, 2.4, 2.8, 3, 3.1, Math.PI - 1e-3];
  const azimuths = opts.azimuths ?? [0.3, 2.1, 4.4];
  const img: PointImage = { ok: false, alpha: 0, dir: { x: 0, y: 0, z: 0 }, lnMu: 0, lnG: 0, side: 1, branch: 'identity', emitDir: { x: 0, y: 0, z: 0 }, causticOffset: 0 };
  const errs: number[] = [];
  const mus: number[] = [];
  let cases = 0;
  let missing = 0;
  for (const ro of ros) {
    const cam: FixtureCamera = { frame: 'static', pos: [0, 0, ro], forward: [0, 0, -1], up: [0, 1, 0], fovy: 50, phi: 0, vdir: null, W: 1384, H: 1384 };
    const inv = buildInverseTable(buildForwardTable({ frame: 'static', r: ro }, FWD_NODES), INV_NODES, REL_NODES);
    const pxPerRad = cam.H / (2 * Math.tan((cam.fovy * Math.PI) / 360));
    const holeM = { x: 0, y: 0, z: -ro };
    const srcs: { x: number; y: number; z: number }[] = [];
    for (const rs of rss)
      for (const g of gammas)
        for (const az of azimuths) srcs.push({ x: rs * Math.sin(g) * Math.cos(az), y: rs * Math.sin(g) * Math.sin(az), z: -ro + rs * Math.cos(g) });
    const rel = new Float32Array(srcs.flatMap((s) => [s.x, s.y, s.z]));
    for (const order of [0, 1] as const) {
      const gpu = await exactImages(cam, rel, order, 1);
      srcs.forEach((src, i) => {
        cases++;
        pointImageTier1(inv, holeM, src, order, img, pxPerRad);
        const gpuOk = gpu.img[4 * i + 3] < 1e29;
        if (img.ok !== gpuOk) missing++;
        if (!img.ok || !gpuOk) return;
        errs.push(errPx(unit3([gpu.img[4 * i], gpu.img[4 * i + 1], gpu.img[4 * i + 2]]), [img.dir.x, img.dir.y, img.dir.z]));
        if (img.branch === 'outgoing' && Math.abs(img.lnMu) < 30) mus.push(Math.abs(gpu.img[4 * i + 3] - img.lnMu));
      });
    }
  }
  errs.sort((a, b) => b - a);
  mus.sort((a, b) => a - b);
  return {
    cases,
    solvedBoth: errs.length,
    worstPx: errs[0] ?? 0,
    p999Px: errs[Math.floor(errs.length * 0.001)] ?? 0,
    over002: errs.filter((e) => !(e <= 0.02)).length,
    gpuMissing: missing,
    lnMuMedian: mus[Math.floor(mus.length / 2)] ?? 0,
    lnMu99: mus[Math.floor(mus.length * 0.99)] ?? 0,
  };
}

async function exactCheck(opts: ExactCheckOptions = {}): Promise<ExactCheckResult> {
  const ros = opts.ros ?? [5, 10, 20, 100, 1000, 1e4, 94_308];
  const rss = opts.rss ?? [4, 6, 10, 30, 100, 300, 1000, 3000, 1e4, 3e4, 1e5];
  const gammas = opts.gammas ?? [1e-3, 0.01, 0.1, 0.3, 0.6, 1, 1.3, 1.5, 1.7, 2, 2.4, 2.8, 3, 3.1, Math.PI - 1e-3];
  const azimuths = opts.azimuths ?? [0.3, 2.1, 4.4];
  const img: PointImage = { ok: false, alpha: 0, dir: { x: 0, y: 0, z: 0 }, lnMu: 0, lnG: 0, side: 1, branch: 'identity', emitDir: { x: 0, y: 0, z: 0 }, causticOffset: 0 };
  const errs: number[] = [];
  const mus: number[] = [];
  let cases = 0;
  let missing = 0;
  for (const ro of ros) {
    const cam: FixtureCamera = { frame: 'static', pos: [0, 0, ro], forward: [0, 0, -1], up: [0, 1, 0], fovy: 50, phi: 0, vdir: null, W: 16, H: 16 };
    const holeM = { x: 0, y: 0, z: -ro };
    const srcs: { x: number; y: number; z: number }[] = [];
    for (const rs of rss)
      for (const g of gammas)
        for (const az of azimuths) srcs.push({ x: rs * Math.sin(g) * Math.cos(az), y: rs * Math.sin(g) * Math.sin(az), z: -ro + rs * Math.cos(g) });
    const rel = new Float32Array(srcs.flatMap((s) => [s.x, s.y, s.z]));
    for (const order of [0, 1] as const) {
      const gpu = await exactImages(cam, rel, order);
      srcs.forEach((src, i) => {
        cases++;
        pointImageExact(ro, holeM, src, order, img);
        const cpuOk = img.ok && img.branch !== 'unlensed';
        const gpuOk = gpu.img[4 * i + 3] < 1e29;
        if (cpuOk && !gpuOk) missing++;
        if (!cpuOk || !gpuOk) return;
        errs.push(errPx(unit3([gpu.img[4 * i], gpu.img[4 * i + 1], gpu.img[4 * i + 2]]), [img.dir.x, img.dir.y, img.dir.z]));
        if (Math.abs(img.lnMu) < 30) mus.push(Math.abs(gpu.img[4 * i + 3] - img.lnMu));
      });
    }
  }
  errs.sort((a, b) => b - a);
  mus.sort((a, b) => a - b);
  return {
    cases,
    solvedBoth: errs.length,
    worstPx: errs[0] ?? 0,
    p999Px: errs[Math.floor(errs.length * 0.001)] ?? 0,
    over002: errs.filter((e) => !(e <= 0.02)).length,
    gpuMissing: missing,
    lnMuMedian: mus[Math.floor(mus.length / 2)] ?? 0,
    lnMu99: mus[Math.floor(mus.length * 0.99)] ?? 0,
  };
}

/** The lens's test hooks. */
export const lensTest: LensTestApi = {
  cameraMap,
  pointImages,
  exactImages,
  pointImagesCheck,
  exactCheck,
  tier1Check,
  debugSky,
  setCamera,
  forceObserver,
  release,
  bandCode,
  debugFrame,
  bloomHalf,
};
