/**
 * Lensed variants of the layers that place light per vertex: the stars (and the nuclear cluster's stars, which
 * draw with the same program), the cosmic web, the nebula cards, the constellation figures, the planet-host
 * and cluster rings, and the orbit lines.
 *
 * What: each such material keeps its plain program, today's source, and gains a variant compiled with
 * `defines.LENS` (and `LENS_EXACT` for the orbit lines of bodies within 10⁵ M of the hole) that shares every
 * uniform object of the plain material by reference, so each per-frame write reaches both, and adds a few of
 * its own: uImageOrder (which image a draw shows), uNearSkipPc (the nuclear cluster's stars nearer the camera
 * than this are its glow's), uBodyHoleM (an orbit line's body relative to the hole) and uLensBoost (shared:
 * the most Doppler shift and gravity can brighten any star, for the stars' pre-cull). The shaders' LENS
 * branches (shaders/stars.vert.glsl and the others) apply the lens chunk (shaders/lens.glsl, render/lens/).
 *
 * How: the variants are compiled in the background after start-up (VERTEX_LENS_LATER, in
 * render/precompile.ts's list), and the lens is drawn only once they have (render/lens/lensState.ts:
 * lensProgramsReady), so no program ever compiles mid-flight; the exact orbit program, whose compile takes tens
 * of seconds, is compiled in the background when first wanted and used once it has (EXACT_ORBIT_LATER). A component mounting such a layer registers
 * its object with useLensVariant, and once a frame (updateLensVariants, from scene/Starfield.tsx) each
 * registered object is drawn with the variant while the lens is drawn (uLensOn, set by updateLens) and with
 * its plain material when it is not. The extra images of a star (orders 1–3) are extra
 * draws of the same geometry with a clone of the variant whose uImageOrder differs (imageOrderVariant): the
 * same program again.
 *
 * Why: with the lens behind a uniform instead, its code costs every frame everywhere (the star draw measured
 * 21 % and the particle draw 11 % dearer on the target laptop far from any hole); two programs make it cost
 * nothing far from holes.
 *
 * Cost: nothing per frame beyond a comparison per layer; the lensed programs' compiles happen in the background
 * (scripts/check-shaders.mjs, cold, the machine loaded by other work: the star program 1.9–2.2 s against 0.1–0.2
 * s plain; dev/perf.ts compiles, cold, three runs on a loaded machine: the tier-1 orbit program 0.5–0.7 s, the exact
 * one 0.55–0.6 s, since the orbit lines' two ends share one call of the lens: shaders/orbit.vert.glsl).
 *
 * Twins: the shaders' LENS branches, and their CPU twin physics/lensPoint.ts (pointImageTier1,
 * pointImageExact); sim/stars/visibility.ts (starBoostLn, the bound uLensBoost holds).
 *
 * This module imports no lens state (render/lens/lensState.ts imports render/precompile.ts, which imports
 * this): whether the lens is drawn it reads from the shared uLensOn. Nor React Three Fiber (whose CommonJS
 * build would load a second three.js into the tests that import this through render/precompile.ts).
 */
import { useEffect, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  HalfFloatType,
  LineSegments,
  Material,
  Mesh,
  PlaneGeometry,
  Points,
  Scene,
  ShaderChunk,
  ShaderMaterial,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import cosmicWebVert from './shaders/cosmicWeb.vert.glsl?raw';
import {
  createClusterRingMaterial,
  createConstellationMaterial,
  createCosmicWebMaterial,
  createHostRingMaterial,
  createNebulaMaterial,
  createOrbitMaterial,
  createStarMaterial,
} from './materials';
import { lensUniforms } from './lens/lensUniforms';
import type { Drawn, LaterMaterial } from './precompile';
import { cosmicSky } from '../sim/cosmos/expansion';
import { STAR_BOOST_T_MIN_K, starBoostLn } from '../sim/stars/visibility';

// ─── The shared uniform the variants add ─────────────────────────────────────────────────────────

/**
 * Uniforms the lensed variants share (by reference) beyond their plain materials'. uLensBoost: ln of the most
 * a star's flux can grow from Doppler shift and gravity anywhere in the sky this frame, the lens's
 * magnification aside (sim/stars/visibility.ts starBoostLn); the stars' pre-cull adds it to the magnification
 * bound. Written by updateVertexLens.
 */
export const vertexLensUniforms = {
  uLensBoost: { value: 0 },
};

let boostPhi = NaN;
let boostLnG = NaN;

/**
 * Once a frame while the lens is drawn (scene/Starfield.tsx): uLensBoost for the fastest view observer's
 * rapidity `phiView` (the relativistic half's; 0 at rest), the frame boost's `framePhi` (the frame's
 * aberration there and back can shift the light by up to twice it) and the largest gravitational blueshift
 * of the light at the observer, `lnGMax`. Recomputed only when they change.
 */
export function updateVertexLens(phiView: number, framePhi: number, lnGMax: number): void {
  const phi = Math.max(0, phiView) + 2 * Math.max(0, framePhi);
  if (phi === boostPhi && lnGMax === boostLnG) return;
  boostPhi = phi;
  boostLnG = lnGMax;
  vertexLensUniforms.uLensBoost.value = starBoostLn(phi, lnGMax, STAR_BOOST_T_MIN_K);
}

// ─── Variants ────────────────────────────────────────────────────────────────────────────────────

/** A uniform: an object with a value, shared by reference. */
type Uniform = { value: unknown };

/** The uniforms a variant adds where its plain material has none of that name: each variant its own, but uLensBoost. */
function extraUniforms(): Record<string, Uniform> {
  return {
    uImageOrder: { value: 0 },
    uNearSkipPc: { value: 0 },
    uBodyHoleM: { value: new Vector3() },
    uLensBoost: vertexLensUniforms.uLensBoost,
  };
}

const lensedOf = new WeakMap<ShaderMaterial, ShaderMaterial>();
const exactOf = new WeakMap<ShaderMaterial, ShaderMaterial>();
const plainOf = new WeakMap<ShaderMaterial, ShaderMaterial>();
const ordersOf = new WeakMap<ShaderMaterial, ShaderMaterial[]>();

/**
 * A material like `from` in every setting (blending, depth, side, transparency, …: Material.copy, which leaves
 * the uniforms alone), with its shaders, the given uniforms and defines.
 */
function sibling(from: ShaderMaterial, uniforms: Record<string, Uniform>, defines: Record<string, unknown>): ShaderMaterial {
  const m = new ShaderMaterial();
  Material.prototype.copy.call(m, from);
  m.vertexShader = from.vertexShader;
  m.fragmentShader = from.fragmentShader;
  m.uniforms = uniforms as ShaderMaterial['uniforms'];
  m.uniformsGroups = from.uniformsGroups;
  m.defines = defines;
  m.extensions = { ...from.extensions };
  m.wireframe = from.wireframe;
  m.wireframeLinewidth = from.wireframeLinewidth;
  m.linewidth = from.linewidth;
  m.fog = from.fog;
  m.lights = from.lights;
  m.clipping = from.clipping;
  m.glslVersion = from.glslVersion;
  m.defaultAttributeValues = { ...from.defaultAttributeValues };
  m.index0AttributeName = from.index0AttributeName;
  return m;
}

/** Whether the exact lens chunk (shaders/lensExact.glsl) has its solver yet; until it has, LENS_EXACT is not asked for. */
export function exactLensAvailable(): boolean {
  const chunk = (ShaderChunk as unknown as Record<string, string | undefined>).lightspeed_lens_exact ?? '';
  return /\bbool\s+lensImageExact\s*\(/.test(chunk);
}

/** The lensed variant of `plain` (made once, then the same object), exact (LENS_EXACT) or not. */
function variantOf(plain: ShaderMaterial, exact: boolean): ShaderMaterial {
  const base = plainOf.get(plain) ?? plain;
  const wantExact = exact && exactLensAvailable();
  const cache = wantExact ? exactOf : lensedOf;
  let v = cache.get(base);
  if (!v) {
    const defines: Record<string, unknown> = { ...base.defines, LENS: '' };
    if (wantExact) defines.LENS_EXACT = '';
    v = sibling(base, { ...extraUniforms(), ...(base.uniforms as Record<string, Uniform>) }, defines);
    v.name = `${base.name || base.type} (lensed${wantExact ? ', exact' : ''})`;
    cache.set(base, v);
    plainOf.set(v, base);
  }
  syncShaders(v, base);
  return v;
}

/** A plain material's source can change after it is made (the cosmic web's emission lookup): its variants follow. */
function syncShaders(v: ShaderMaterial, plain: ShaderMaterial): void {
  if (v.vertexShader === plain.vertexShader && v.fragmentShader === plain.fragmentShader) return;
  v.vertexShader = plain.vertexShader;
  v.fragmentShader = plain.fragmentShader;
  v.needsUpdate = true;
}

/**
 * The LENS-define variant of a per-vertex material: the same shaders, `defines.LENS`, the SAME uniform objects
 * (by reference) and a few of its own (see the module's header). three.js shares one program per source and
 * defines, so the nuclear cluster's material (a variant of its own star material) and the star field's variant
 * compile once. Made once per plain material; given a variant, returns it.
 */
export function lensedVariant(plain: ShaderMaterial): ShaderMaterial {
  return variantOf(plain, false);
}

/** The plain material of a variant (or the material itself when it is plain). */
export function plainMaterial(m: ShaderMaterial): ShaderMaterial {
  return plainOf.get(m) ?? m;
}

/**
 * A clone of the lensed variant `lensed` that draws image `order` (1, 2 or 3): every uniform shared with it but
 * its own uImageOrder, so the same program draws the extra images of the star field (and the web's second
 * image). Made once per order.
 */
export function imageOrderVariant(lensed: ShaderMaterial, order: 1 | 2 | 3): ShaderMaterial {
  let list = ordersOf.get(lensed);
  if (!list) ordersOf.set(lensed, (list = []));
  let c = list[order];
  if (!c) {
    c = sibling(lensed, { ...(lensed.uniforms as Record<string, Uniform>), uImageOrder: { value: order } }, { ...lensed.defines });
    c.name = `${lensed.name} order ${order}`;
    list[order] = c;
    plainOf.set(c, plainMaterial(lensed));
  }
  const plain = plainOf.get(lensed);
  if (plain) syncShaders(c, plain);
  return c;
}

/** Orbit lines within 1e5 M of the lensing hole: tier 1 (`exact` false) or the exact tier-2 program (LENS_EXACT). */
export function createLensedOrbitMaterial(colour: { r: number; g: number; b: number }, exact: boolean): ShaderMaterial {
  return variantOf(createOrbitMaterial(new Color(colour.r, colour.g, colour.b)), exact);
}

// ─── Swapping ────────────────────────────────────────────────────────────────────────────────────

/** The lens is drawn this frame (render/lens/lensState.ts sets uLensOn only then, and only once every lensed program has compiled). */
export const lensDrawn = (): boolean => lensUniforms.uLensOn.value > 0.5;

/** Something that draws with one material (Points, Mesh, LineSegments). */
type Drawable = { material: Material | Material[] };

/**
 * Put `o`'s plain material (`on` false) or its lensed variant (`on` true; `exact` for the tier-2 orbit program)
 * on it. Nothing when it draws with several materials or not with a ShaderMaterial.
 */
export function swapLensVariant(o: Drawable | null, on: boolean, exact = false): void {
  if (!o || Array.isArray(o.material) || !(o.material as ShaderMaterial).isShaderMaterial) return;
  const m = o.material as ShaderMaterial;
  const plain = plainOf.get(m) ?? m;
  const want = on ? variantOf(plain, exact) : plain;
  if (m !== want) o.material = want;
}

/** How a layer's variant is chosen, beyond the lens being drawn. */
export interface LensVariantOptions {
  /** A further condition (the web's own background compile: CosmicWeb.tsx). */
  ready?: () => boolean;
  /** The exact tier-2 program (orbit lines near the hole). */
  exact?: () => boolean;
}

/** An object registered by useLensVariant, with its options (the latest the component gave). */
interface Registered {
  obj: { current: Drawable | null };
  opts: LensVariantOptions | undefined;
}
const registered = new Set<Registered>();

/**
 * Register `obj` for updateLensVariants (the hook's work, outside React: tests); returns what unregisters it.
 * The entry is kept as given, so a caller may change its `obj` and `opts` later.
 */
export function registerLensVariant(entry: { obj: { current: Drawable | null }; opts?: LensVariantOptions }): () => void {
  const e = entry as Registered;
  registered.add(e);
  return () => {
    registered.delete(e);
  };
}

/**
 * Swap `obj.material` between its plain and lensed variants as the lens comes and goes (only once
 * lensProgramsReady(), which uLensOn implies). Each component mounting a lensed vertex layer calls it once with
 * its object (Starfield, Constellations, PlanetHosts, CosmicWeb, Orbits; GalaxyModel's cluster rings; Nebulae
 * swaps its many cards itself with swapLensVariant): it registers the object while mounted, and
 * updateLensVariants swaps every registered one each frame.
 */
export function useLensVariant(obj: { current: Drawable | null }, opts?: LensVariantOptions): void {
  const entry = useRef<Registered | null>(null);
  if (!entry.current) entry.current = { obj, opts };
  entry.current.obj = obj;
  entry.current.opts = opts;
  useEffect(() => registerLensVariant(entry.current as Registered), []);
}

/**
 * Once a frame, after updateLens and before the render (scene/Starfield.tsx calls it in its frame callback,
 * which every lensed layer's swap then shares): each registered object drawn with its lensed variant while the
 * lens is drawn, its plain material otherwise.
 */
export function updateLensVariants(): void {
  const drawn = lensDrawn();
  for (const e of registered) {
    const on = drawn && (e.opts?.ready ? e.opts.ready() : true);
    swapLensVariant(e.obj.current, on, on && e.opts?.exact ? e.opts.exact() : false);
  }
}

// ─── Background compiles ─────────────────────────────────────────────────────────────────────────

/** The cosmic web's material as it is drawn now: with the cosmology module's emission lookup once it has arrived. */
function webMaterialNow(): ShaderMaterial {
  const m = createCosmicWebMaterial();
  const t = cosmicSky.table;
  if (t) m.vertexShader = cosmicWebVert.replace('//#emission', t.table.glsl);
  return m;
}

const WHITE = { r: 1, g: 1, b: 1 };

/**
 * Every lensed variant the lens waits for, for the background compiles (render/precompile.ts LATER_MATERIALS):
 * the star program (the nuclear cluster's too, and every image order), the constellation figures (drawn as lines;
 * compiled as a point, which gives three.js the same program), the planet-host and cluster rings, the nebula
 * cards, the cosmic web (with the emission lookup if it has arrived; CosmicWeb.tsx compiles it again if it
 * arrives later), and the orbit lines' tier 1. Not the exact orbit program: EXACT_ORBIT_LATER.
 */
export const VERTEX_LENS_LATER: readonly LaterMaterial[] = [
  [() => lensedVariant(createStarMaterial()), 'points'],
  [() => lensedVariant(createConstellationMaterial()), 'points'],
  [() => lensedVariant(createHostRingMaterial()), 'points'],
  [() => lensedVariant(createClusterRingMaterial()), 'points'],
  [() => lensedVariant(createNebulaMaterial()), 'quad'],
  [() => lensedVariant(webMaterialNow()), 'points'],
  [() => createLensedOrbitMaterial(WHITE, false), 'quad'],
];

/**
 * The exact orbit program (LENS_EXACT, the tier-2 solver of shaders/lensExact.glsl), kept out of
 * VERTEX_LENS_LATER, which the lens waits for: it is compiled in the background when an orbit line near a hole first
 * wants it (scene/Orbits.tsx, through variantCompiled), and the line is drawn by tier 1 until then (0.55–0.6 s cold
 * on the target laptop, measured by dev/perf.ts compiles on a loaded machine; 17–40 s before the orbit shader's two
 * ends shared one call of the lens). For timing it (dev/perf.ts compiles) and the shader checks.
 */
export const EXACT_ORBIT_LATER: readonly LaterMaterial[] = [[() => createLensedOrbitMaterial(WHITE, true), 'quad']];

/** The exact (LENS_EXACT) variant of an orbit line's plain material: the tier-1 variant while the exact chunk is a stub. */
export function exactVariant(plain: ShaderMaterial): ShaderMaterial {
  return variantOf(plain, true);
}

/** Programs (by source and defines) compiled here, and those under way. */
const compiled = new Set<string>();
const compiling = new Set<string>();

/** Each material's program key as last worked out, with the sources and defines it was made from. */
const keys = new WeakMap<ShaderMaterial, { vs: string; fs: string; defines: unknown; key: string }>();

/** A material's program: its defines and sources (made again only when they change, so asking each frame costs nothing). */
function programKey(m: ShaderMaterial): string {
  const k = keys.get(m);
  if (k && k.vs === m.vertexShader && k.fs === m.fragmentShader && k.defines === m.defines) return k.key;
  const key = `${JSON.stringify(m.defines)}\n${m.vertexShader}\n${m.fragmentShader}`;
  keys.set(m, { vs: m.vertexShader, fs: m.fragmentShader, defines: m.defines, key });
  return key;
}

/**
 * Whether `material`'s program (as it is now: its source and defines) has been compiled here in the background;
 * the first call for a new program starts that compile (three.js compileAsync into a render target, as
 * render/precompile.ts does, so the program is the one drawn later) and says false until it is done. For a
 * variant whose source can change after the background list has run: the cosmic web's, when the emission table
 * arrives late.
 */
export function variantCompiled(renderer: WebGLRenderer, camera: Camera, material: ShaderMaterial, kind: Drawn): boolean {
  const key = programKey(material);
  if (compiled.has(key)) return true;
  if (compiling.has(key)) return false;
  compiling.add(key);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
  const scene = new Scene();
  const o = kind === 'points' ? new Points(g, material) : kind === 'lines' ? new LineSegments(g, material) : new Mesh(new PlaneGeometry(2, 2), material);
  o.frustumCulled = false;
  scene.add(o);
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  const back = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const ready = renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(back);
  const done = () => {
    compiling.delete(key);
    compiled.add(key);
    target.dispose();
    g.dispose();
  };
  ready.then(done, done);
  return false;
}
