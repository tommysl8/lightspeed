/**
 * The lensed variants of the layers that place light per vertex (render/lensVariants.ts), checked against their
 * plain materials and their shaders' sources: each variant shares every uniform object of its plain material by
 * reference and differs only by its defines (LENS, and LENS_EXACT for the exact orbit program when the exact
 * chunk has its solver), with the blending, depth and transparency of the plain one; each image order's clone
 * shares everything but uImageOrder; every lensed shader turns a direction into its image (lensImage) before
 * the view observer's aberration (relAberrate), and the ones that colour light gate that work on
 * uPhi > 0 ∨ uLensOn > 0.5 ∨ uFramePhi > 0; a registered object draws its lensed variant only while the lens is
 * drawn (uLensOn, which render/lens/lensState.ts sets only once lensProgramsReady()) and its own condition holds;
 * the background list holds every lensed program; the stars' brightening bound follows its inputs. The shaders'
 * plain programs are held to the base commit's by scripts/check-shaders.mjs (docs/data/blackholes.md §11), and their
 * expansions by render/shaderIncludes.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Color, Mesh, PlaneGeometry, Points, type ShaderMaterial } from 'three';
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
import {
  createLensedOrbitMaterial,
  EXACT_ORBIT_LATER,
  exactLensAvailable,
  exactVariant,
  imageOrderVariant,
  lensedVariant,
  plainMaterial,
  registerLensVariant,
  swapLensVariant,
  updateLensVariants,
  updateVertexLens,
  VERTEX_LENS_LATER,
  vertexLensUniforms,
} from './lensVariants';
import { starBoostLn, STAR_BOOST_T_MIN_K } from '../sim/stars/visibility';
import starsVert from './shaders/stars.vert.glsl?raw';
import cosmicWebVert from './shaders/cosmicWeb.vert.glsl?raw';
import nebulaVert from './shaders/nebula.vert.glsl?raw';
import nebulaFrag from './shaders/nebula.frag.glsl?raw';
import constellationVert from './shaders/constellation.vert.glsl?raw';
import hostRingVert from './shaders/hostRing.vert.glsl?raw';
import clusterRingVert from './shaders/clusterRing.vert.glsl?raw';
import orbitVert from './shaders/orbit.vert.glsl?raw';

const PLAIN: [string, () => ShaderMaterial][] = [
  ['stars', createStarMaterial],
  ['constellation figures', createConstellationMaterial],
  ['planet-host rings', createHostRingMaterial],
  ['cluster rings', createClusterRingMaterial],
  ['nebula cards', createNebulaMaterial],
  ['cosmic web', createCosmicWebMaterial],
  ['orbit lines', () => createOrbitMaterial(new Color(1, 1, 1))],
];

/** The settings a draw depends on besides the program. */
const SETTINGS = ['blending', 'transparent', 'depthTest', 'depthWrite', 'side', 'opacity', 'premultipliedAlpha', 'blendSrc', 'blendDst', 'blendEquation', 'visible'] as const;

describe('lensed variants', () => {
  for (const [name, make] of PLAIN) {
    it(`${name}: the same shaders and uniform objects, LENS added to the defines`, () => {
      const plain = make();
      const v = lensedVariant(plain);
      expect(v).not.toBe(plain);
      expect(v.vertexShader).toBe(plain.vertexShader);
      expect(v.fragmentShader).toBe(plain.fragmentShader);
      expect(v.defines).toEqual({ ...plain.defines, LENS: '' });
      for (const [k, u] of Object.entries(plain.uniforms)) expect(v.uniforms[k], k).toBe(u);
      for (const s of SETTINGS) expect(v[s], s).toBe(plain[s]);
      // Made once; a variant is its own variant; its plain material is found again.
      expect(lensedVariant(plain)).toBe(v);
      expect(lensedVariant(v)).toBe(v);
      expect(plainMaterial(v)).toBe(plain);
      // Only the variants' own uniforms besides: which image, the near skip, the orbit's body and the shared bound.
      const extra = Object.keys(v.uniforms).filter((k) => !(k in plain.uniforms));
      for (const k of extra) expect(['uImageOrder', 'uNearSkipPc', 'uBodyHoleM', 'uLensBoost']).toContain(k);
      expect(v.uniforms.uLensBoost).toBe(vertexLensUniforms.uLensBoost);
    });
  }

  it('image orders: clones of the variant sharing every uniform but uImageOrder', () => {
    const lensed = lensedVariant(createStarMaterial());
    for (const k of [1, 2, 3] as const) {
      const c = imageOrderVariant(lensed, k);
      expect(imageOrderVariant(lensed, k)).toBe(c);
      expect(c.defines).toEqual(lensed.defines);
      expect(c.vertexShader).toBe(lensed.vertexShader);
      expect(c.uniforms.uImageOrder.value).toBe(k);
      expect(c.uniforms.uImageOrder).not.toBe(lensed.uniforms.uImageOrder);
      for (const [name, u] of Object.entries(lensed.uniforms)) if (name !== 'uImageOrder') expect(c.uniforms[name], name).toBe(u);
      expect(plainMaterial(c)).toBe(plainMaterial(lensed));
    }
    expect(lensed.uniforms.uImageOrder.value).toBe(0);
  });

  it('orbit lines: the exact program (LENS_EXACT) only once the exact chunk has its solver', () => {
    const exact = createLensedOrbitMaterial({ r: 1, g: 1, b: 1 }, true);
    const tier1 = createLensedOrbitMaterial({ r: 1, g: 1, b: 1 }, false);
    expect('LENS' in tier1.defines).toBe(true);
    expect('LENS_EXACT' in tier1.defines).toBe(false);
    expect('LENS_EXACT' in exact.defines).toBe(exactLensAvailable());
  });

  it('a plain material whose source changes carries its variants with it (the cosmic web’s emission lookup)', () => {
    const plain = createCosmicWebMaterial();
    const v = lensedVariant(plain);
    const one = imageOrderVariant(v, 1);
    plain.vertexShader = plain.vertexShader.replace('//#emission', '// replaced');
    expect(lensedVariant(plain).vertexShader).toBe(plain.vertexShader);
    expect(imageOrderVariant(v, 1).vertexShader).toBe(plain.vertexShader);
    expect(one.vertexShader).toBe(plain.vertexShader);
  });
});

describe('the lensed shaders', () => {
  /** The text of a shader's LENS blocks (#ifdef LENS … #else / #endif), in order. */
  function lensBlocks(src: string): string {
    const out: string[] = [];
    let depth = 0;
    let inLens = false;
    for (const line of src.split(/\r?\n/)) {
      if (/^\s*#\s*ifdef\s+LENS\b/.test(line) && depth === 0) {
        inLens = true;
        depth = 1;
        continue;
      }
      if (inLens) {
        if (/^\s*#\s*if/.test(line)) depth++;
        else if (/^\s*#\s*endif/.test(line)) depth--;
        else if (/^\s*#\s*else/.test(line) && depth === 1) inLens = false;
        if (depth === 0) inLens = false;
        if (inLens) out.push(line);
      } else if (depth > 0) {
        if (/^\s*#\s*if/.test(line)) depth++;
        else if (/^\s*#\s*endif/.test(line)) depth--;
      }
    }
    return out.join('\n');
  }
  const code = (s: string) => s.replace(/\/\/[^\n]*/g, '');

  const SHADERS: [string, string, boolean][] = [
    ['stars.vert.glsl', starsVert, true],
    ['cosmicWeb.vert.glsl', cosmicWebVert, true],
    ['nebula.vert.glsl', nebulaVert, true],
    ['constellation.vert.glsl', constellationVert, true],
    ['hostRing.vert.glsl', hostRingVert, true],
    ['clusterRing.vert.glsl', clusterRingVert, true],
    ['orbit.vert.glsl', orbitVert, false],
  ];
  for (const [name, src, aberrated] of SHADERS) {
    it(`${name}: includes the lens chunk and finds the image${aberrated ? ' before the aberration' : ''}`, () => {
      const lens = code(lensBlocks(src));
      expect(lens).toMatch(/#include <lightspeed_lens>/);
      const at = lens.search(/\blensImage(Exact)?\s*\(/);
      expect(at).toBeGreaterThanOrEqual(0);
      if (aberrated) {
        const ab = lens.search(/\brelAberrate\s*\(/);
        expect(ab).toBeGreaterThan(at);
      }
      // The image goes back from the hole's frame to the Sun's before anything else sees it.
      expect(lens).toMatch(/frameUnaberrate\s*\(/);
    });
  }

  it('the shaders that colour light gate that work on the ship, the lens and the frame boost', () => {
    const gate = /uPhi\s*>\s*0\.0\s*\|\|\s*uLensOn\s*>\s*0\.5\s*\|\|\s*uFramePhi\s*>\s*0\.0/;
    for (const src of [nebulaFrag, cosmicWebVert]) expect(code(lensBlocks(src))).toMatch(gate);
    // The stars gate it on the shift itself (ln D holds the ship's, the lens's and the frame boost's), skipped only under
    // the lens passes' Doppler skip.
    expect(code(lensBlocks(starsVert))).toMatch(/if\s*\(abs\(lnD\)\s*>=\s*LENS_DOPPLER_SKIP\)/);
    expect(code(lensBlocks(starsVert))).toMatch(/const float LENS_DOPPLER_SKIP = 1e-4;/);
  });

  it('the frame boost at the image is taken off, not added (ln D = ln D_f(src) + ln g − ln D_f(img) + ln D_view)', () => {
    for (const src of [starsVert, cosmicWebVert, nebulaVert]) {
      const lens = code(lensBlocks(src));
      expect(lens).toMatch(/-\s*lnDfImg/);
      expect(lens).not.toMatch(/\+\s*lnDfImg/);
    }
  });
});

describe('swapping', () => {
  it('draws the lensed variant only while the lens is drawn and the layer is ready, and the plain one otherwise', () => {
    const plain = createStarMaterial();
    const obj = { current: new Points(new BufferGeometry(), plain) };
    let ready = true;
    const off = registerLensVariant({ obj, opts: { ready: () => ready } });
    const on0 = lensUniforms.uLensOn.value;
    try {
      lensUniforms.uLensOn.value = 0;
      updateLensVariants();
      expect(obj.current.material).toBe(plain);
      lensUniforms.uLensOn.value = 1;
      updateLensVariants();
      expect(obj.current.material).toBe(lensedVariant(plain));
      ready = false;
      updateLensVariants();
      expect(obj.current.material).toBe(plain);
      ready = true;
      updateLensVariants();
      expect(obj.current.material).toBe(lensedVariant(plain));
      lensUniforms.uLensOn.value = 0;
      updateLensVariants();
      expect(obj.current.material).toBe(plain);
    } finally {
      lensUniforms.uLensOn.value = on0;
      off();
    }
    // Once unregistered, nothing touches it.
    lensUniforms.uLensOn.value = 1;
    updateLensVariants();
    expect(obj.current.material).toBe(plain);
    lensUniforms.uLensOn.value = on0;
  });

  it('swaps an orbit line to the exact program when asked, and leaves other materials alone', () => {
    const plain = createOrbitMaterial(new Color(1, 0, 0));
    const mesh = new Mesh(new PlaneGeometry(1, 1), plain);
    swapLensVariant(mesh, true, true);
    expect('LENS' in (mesh.material as ShaderMaterial).defines).toBe(true);
    expect('LENS_EXACT' in (mesh.material as ShaderMaterial).defines).toBe(exactLensAvailable());
    swapLensVariant(mesh, true, false);
    expect('LENS_EXACT' in (mesh.material as ShaderMaterial).defines).toBe(false);
    swapLensVariant(mesh, false);
    expect(mesh.material).toBe(plain);
    swapLensVariant(null, true);
  });
});

describe('the background list and the brightening bound', () => {
  it('holds every lensed program: stars (and the nuclear cluster’s, and every image order), guides, cards, the web, orbits', () => {
    const made = VERTEX_LENS_LATER.map(([make]) => make());
    for (const m of made) expect('LENS' in m.defines).toBe(true);
    const sources = new Set(made.map((m) => m.vertexShader.replace('//#emission', '')));
    for (const src of [starsVert, constellationVert, hostRingVert, clusterRingVert, nebulaVert, orbitVert]) expect(sources.has(src)).toBe(true);
    expect(made.some((m) => m.vertexShader.startsWith(cosmicWebVert.slice(0, 200)))).toBe(true);
    // The exact orbit program, whose cold compile takes tens of seconds, is not one the lens waits for: it has a
    // list of its own and is compiled when a line first wants it.
    expect(made.some((m) => 'LENS_EXACT' in m.defines)).toBe(false);
    const exact = EXACT_ORBIT_LATER.map(([make]) => make());
    expect(exact.length).toBe(1);
    expect(exact[0].vertexShader).toBe(orbitVert);
    expect('LENS_EXACT' in exact[0].defines).toBe(exactLensAvailable());
    const plain = createOrbitMaterial(new Color(0, 1, 0));
    expect(exactVariant(plain)).toBe(exactVariant(plain));
    expect(exactVariant(plain).uniforms.uA).toBe(plain.uniforms.uA);
  });

  it('uLensBoost is the stars’ brightening bound for the fastest view, twice the frame boost and the observer’s blueshift', () => {
    updateVertexLens(0, 0, 0);
    expect(vertexLensUniforms.uLensBoost.value).toBe(0);
    updateVertexLens(0.3, 0.001, 0.02);
    expect(vertexLensUniforms.uLensBoost.value).toBeCloseTo(starBoostLn(0.302, 0.02, STAR_BOOST_T_MIN_K), 12);
    expect(vertexLensUniforms.uLensBoost.value).toBeGreaterThan(starBoostLn(0.3, 0, STAR_BOOST_T_MIN_K));
    updateVertexLens(0, 0, 0);
  });
});
