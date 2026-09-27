/**
 * The background compiles (precompile.ts): every material is compiled into a render target (as the
 * app draws them, so three.js finds the same program later), with a position attribute, one at a
 * time, once; the cosmic web's only once the emission table has arrived, with the same shader
 * CosmicWeb.tsx draws.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Camera, Object3D, Scene, WebGLRenderer, WebGLRenderTarget } from 'three';
import { OrthographicCamera, PerspectiveCamera, Scene as ThreeScene } from 'three';
import cosmicWebVert from './shaders/cosmicWeb.vert.glsl?raw';
import { LATER_MATERIALS, cosmicWebMaterialWithTable, precompileLater } from './precompile';
import { updateSkyUniforms, withEmission } from './materials';
import { cosmicSky, type SkyTable } from '../sim/cosmos/expansion';

const GLSL = 'uniform highp sampler2D uEmitTable;\nfloat emissionLn1pZ(float chiMpc) { return 0.5 * chiMpc; }\n';
const fakeTable = () => ({ table: { glsl: GLSL, data: new Float32Array(4), n: 4, vMin: -1, vMax: 1 }, etaInfMpc: 1 }) as unknown as SkyTable;

function fakeRenderer() {
  let target: WebGLRenderTarget | null = null;
  let inFlight = 0;
  let mostInFlight = 0;
  const compiled: { scene: Scene; camera: Camera; target: WebGLRenderTarget | null }[] = [];
  const renderer = {
    getRenderTarget: () => target,
    setRenderTarget: (t: WebGLRenderTarget | null) => {
      target = t;
    },
    compileAsync: (scene: Scene, camera: Camera) => {
      compiled.push({ scene, camera, target });
      mostInFlight = Math.max(mostInFlight, ++inFlight);
      return new Promise<Scene>((resolve) =>
        setTimeout(() => {
          inFlight--;
          resolve(scene);
        }, 1),
      );
    },
  };
  return { renderer: renderer as unknown as WebGLRenderer, compiled, current: () => target, mostInFlight: () => mostInFlight };
}

const drawn = (scene: Scene): Object3D[] => {
  const out: Object3D[] = [];
  scene.traverse((o) => {
    if ((o as { isPoints?: boolean }).isPoints || (o as { isMesh?: boolean }).isMesh) out.push(o);
  });
  return out;
};

afterEach(() => {
  cosmicSky.table = null;
});

describe('background shader compiles', () => {
  it('build the cosmic web as it is drawn once the emission table has arrived', () => {
    expect(cosmicSky.table).toBeNull();
    expect(cosmicWebMaterialWithTable()).toBeNull();
    cosmicSky.table = fakeTable();
    updateSkyUniforms(); // what CosmicWeb.tsx does each frame it is shown: swaps in the table's lookup
    const m = cosmicWebMaterialWithTable();
    expect(m?.vertexShader).toBe(withEmission(cosmicWebVert));
    expect(m?.vertexShader).toContain('return 0.5 * chiMpc;');
  });

  it('compile every later material into a render target, one at a time, once, and give the target back', async () => {
    cosmicSky.table = fakeTable();
    const { renderer, compiled, current, mostInFlight } = fakeRenderer();
    const camera = new PerspectiveCamera();
    const extra: [Scene, Camera] = [new ThreeScene(), new OrthographicCamera()];
    await precompileLater(renderer, camera, [extra]);
    expect(current()).toBeNull();
    // The later materials, the extra scene, then the cosmic web.
    expect(compiled.length).toBe(LATER_MATERIALS.length + 2);
    expect(mostInFlight()).toBe(1);
    for (const c of compiled) expect(c.target).not.toBeNull();
    for (const c of [...compiled.slice(0, LATER_MATERIALS.length), compiled[compiled.length - 1]]) {
      const objects = drawn(c.scene);
      expect(objects.length).toBe(1);
      expect((objects[0] as unknown as { geometry: { attributes: Record<string, unknown> } }).geometry.attributes.position).toBeDefined();
    }
    expect(compiled[LATER_MATERIALS.length].scene).toBe(extra[0]);
    expect(compiled[LATER_MATERIALS.length].camera).toBe(extra[1]);
    const web = drawn(compiled[compiled.length - 1].scene)[0] as unknown as { material: { vertexShader: string } };
    expect(web.material.vertexShader).toContain('return 0.5 * chiMpc;');
    // Once only.
    await precompileLater(renderer, camera, [extra]);
    expect(compiled.length).toBe(LATER_MATERIALS.length + 2);
  });
});
