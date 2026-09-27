/**
 * Shader programs compiled ahead, in the background.
 *
 * three.js compiles a material's program when it is first drawn, and the frame waits for it. On an
 * integrated GPU the first compile of a large shader takes a tenth to a quarter of a second or more
 * (Intel Xe, Chrome/ANGLE: the Milky Way model's glow 270 ms, its particles 240, the cosmic web 130),
 * so the first time the camera leaves the Sun's neighbourhood, a flight starts, the CMB map or the
 * cosmic web shows, a frame would stop for that long. Once start-up's loading is over, these are
 * compiled with KHR_parallel_shader_compile (three.js compileAsync) on the driver's threads while
 * frames go on, one at a time, and what draws them later finds the program ready: three.js shares
 * one program between materials with the same shaders and settings. Browsers keep compiled programs
 * between visits, so this matters on a first visit and after an update that changes a shader.
 * Nothing drawn changes.
 *
 * What start-up itself draws (the stars, the nebulae, the galaxies beyond and the rest) is left to
 * compile when it first shows: compiled in the background at the same time, they only made those
 * frames wait longer (measured with every program compiled afresh: 0.95 s of stopped frames after
 * the first instead of 0.75 s), as the driver works through its compiles in turn.
 */
import { BufferAttribute, BufferGeometry, type Camera, HalfFloatType, Mesh, PlaneGeometry, Points, Scene, type ShaderMaterial, type WebGLRenderer, WebGLRenderTarget } from 'three';
import cosmicWebVert from './shaders/cosmicWeb.vert.glsl?raw';
import { createCmbMapMaterial, createCosmicWebMaterial, createGalaxyGlowMaterial, createGalaxyMaterial } from './materials';
import { cosmicSky } from '../sim/cosmos/expansion';

type Drawn = 'points' | 'quad';

/** The materials first drawn on the way out of the Solar neighbourhood or on demand, and what draws them. */
export const LATER_MATERIALS: readonly (readonly [() => ShaderMaterial, Drawn])[] = [
  [createGalaxyGlowMaterial, 'quad'],
  [() => createGalaxyMaterial(1, 0), 'points'],
  [createCmbMapMaterial, 'quad'],
];

/**
 * The cosmic web's material as scene/CosmicWeb.tsx draws it once the cosmology module's emission
 * lookup has replaced the stub (render/materials.ts withEmission), or null before its table arrives.
 */
export function cosmicWebMaterialWithTable(): ShaderMaterial | null {
  const t = cosmicSky.table;
  if (!t) return null;
  const m = createCosmicWebMaterial();
  m.vertexShader = cosmicWebVert.replace('//#emission', t.table.glsl);
  return m;
}

/** A one-point geometry: with a position attribute, as every real one has (three.js keys programs on that too). */
function onePoint(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
  return g;
}

/** A scene of one object drawing `m`. */
function sceneOf(m: ShaderMaterial, kind: Drawn): Scene {
  const scene = new Scene();
  const o = kind === 'points' ? new Points(onePoint(), m) : new Mesh(new PlaneGeometry(2, 2), m);
  o.frustumCulled = false;
  scene.add(o);
  return scene;
}

/** Compile a scene's materials in the background; resolves when their programs are ready. */
function compile(renderer: WebGLRenderer, scene: Scene, camera: Camera): Promise<void> {
  // All of them draw into render targets (the scene pass's buffer, the Galaxy layer's), never the
  // canvas, and three.js keys a program on that (no tone mapping or output colour conversion).
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  const back = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const ready = renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(back);
  const done = () => target.dispose();
  return ready.then(done, done);
}

/** How often, and for how long, to look for the cosmology module's emission table, ms. */
const TABLE_POLL_MS = 1000;
const TABLE_WAIT_MS = 300_000;

let started = false;

/**
 * Compile LATER_MATERIALS, then the `extra` scenes (the relativistic view's remap), then the cosmic
 * web once the emission table has arrived, one after another in the background; once. Resolves when
 * all of them are ready (or the table did not come).
 */
export async function precompileLater(renderer: WebGLRenderer, camera: Camera, extra: readonly (readonly [Scene, Camera])[] = []): Promise<void> {
  if (started) return;
  started = true;
  for (const [make, kind] of LATER_MATERIALS) await compile(renderer, sceneOf(make(), kind), camera);
  for (const [scene, cam] of extra) await compile(renderer, scene, cam);
  const t0 = performance.now();
  for (;;) {
    const web = cosmicWebMaterialWithTable();
    if (web) return compile(renderer, sceneOf(web, 'points'), camera);
    if (performance.now() - t0 > TABLE_WAIT_MS) return;
    await new Promise((resolve) => setTimeout(resolve, TABLE_POLL_MS));
  }
}
