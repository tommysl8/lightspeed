/**
 * The scene render at the start of the post-processing chain. It replaces postprocessing's
 * RenderPass, so bloom and tone mapping run after the relativistic stage, in the observer's frame.
 *
 * Naive (classical) view: render the scene normally.
 *
 * Relativistic view:
 *   1. Render everything except point sources into an HDR cube map from the ship's position.
 *      All cameras sit at the floating origin, and alpha records surface coverage.
 *   2. Draw the point sources (stars, glints, belts). Their shaders apply exact per-point
 *      aberration, Doppler shift and brightness change.
 *   3. Composite the cube map, remapped per pixel by aberration and recoloured by Doppler and
 *      beaming, over them (premultiplied "over").
 * Split view: the left part of the screen shows the naive render, the right the relativistic one.
 */
import {
  CubeCamera,
  CustomBlending,
  DataTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type PerspectiveCamera,
  type WebGLRenderer,
  type WebGLRenderTarget,
  WebGLCubeRenderTarget,
  Color,
} from 'three';
import { Pass } from 'postprocessing';
import { buildDopplerLut, DOPPLER_LUT_LN_MAX, DOPPLER_LUT_LN_MIN } from '../physics/dopplerColor';
import { relView, setPointUniforms } from './relativisticView';
import { quality } from './quality';
import remapVert from './shaders/remap.vert.glsl?raw';
import remapFrag from './shaders/remap.frag.glsl?raw';

/** Layer for point sources drawn analytically in the ship frame (stars, glints, belts). */
export const POINTS_LAYER = 1;
/**
 * Layer for guides (orbit lines). They are not light sources, so Doppler shifting them would be
 * meaningless. They appear in the classical view and are left out of the relativistic one.
 */
export const GUIDES_LAYER = 2;

const LUT_SIZE = 1024;

export class LightspeedScenePass extends Pass {
  private readonly world: Scene;
  private readonly viewCam: PerspectiveCamera;
  private cubeRT: WebGLCubeRenderTarget;
  private cubeCam: CubeCamera;
  private quadScene = new Scene();
  private quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private remap: ShaderMaterial;
  private clearColor = new Color();
  faceSize: number;

  constructor(scene: Scene, camera: PerspectiveCamera, faceSize = 1024) {
    super('LightspeedScenePass', scene, camera);
    this.world = scene;
    this.viewCam = camera;
    this.needsSwap = false;
    this.faceSize = faceSize;

    this.cubeRT = LightspeedScenePass.makeCubeTarget(faceSize);
    this.cubeCam = new CubeCamera(camera.near, camera.far, this.cubeRT);
    for (const c of this.cubeCam.children) c.layers.set(0);

    const lut = new DataTexture(buildDopplerLut(LUT_SIZE), LUT_SIZE, 3, RGBAFormat, FloatType);
    lut.minFilter = NearestFilter;
    lut.magFilter = NearestFilter;
    lut.needsUpdate = true;

    this.remap = new ShaderMaterial({
      uniforms: {
        uCube: { value: this.cubeRT.texture },
        uDopplerLut: { value: lut },
        uLnDMin: { value: DOPPLER_LUT_LN_MIN },
        uLnDMax: { value: DOPPLER_LUT_LN_MAX },
        uProjInv: { value: camera.projectionMatrixInverse },
        uCamWorld: { value: camera.matrixWorld },
        uVelDir: { value: relView.velDir },
        uBeta: { value: 0 },
        uGamma: { value: 1 },
        uK: { value: 1 },
        uPixelAngle: { value: 0.001 },
        uTexelAngle: { value: Math.PI / 2 / faceSize },
        uMaxLod: { value: Math.log2(faceSize) },
        uDoppler: { value: 1 },
        uExposure: { value: 1 },
      },
      vertexShader: remapVert,
      fragmentShader: remapFrag,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.remap);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  private static makeCubeTarget(size: number): WebGLCubeRenderTarget {
    return new WebGLCubeRenderTarget(size, {
      type: HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
    });
  }

  /** Change the cube-map resolution (adaptive quality). */
  private resizeCube(size: number): void {
    this.cubeRT.dispose();
    this.cubeRT = LightspeedScenePass.makeCubeTarget(size);
    this.cubeCam.renderTarget = this.cubeRT;
    this.faceSize = size;
    const u = this.remap.uniforms;
    u.uCube.value = this.cubeRT.texture;
    u.uTexelAngle.value = Math.PI / 2 / size;
    u.uMaxLod.value = Math.log2(size);
  }

  render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget | null): void {
    const target = this.renderToScreen ? null : inputBuffer;
    if (quality.cubeFace !== this.faceSize) this.resizeCube(quality.cubeFace);
    const scene = this.world;
    const camera = this.viewCam;
    const autoClear = renderer.autoClear;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);

    camera.layers.enableAll();

    if (!relView.active) {
      setPointUniforms(false);
      renderer.autoClear = true;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.autoClear = autoClear;
      return;
    }

    // 1. Cube map of the rest-frame scene (no point sources), transparent background.
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    this.cubeCam.position.set(0, 0, 0);
    this.cubeCam.updateMatrixWorld(true);
    this.cubeCam.update(renderer, scene);

    renderer.setClearColor(this.clearColor, clearAlpha);
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    const w = target ? target.width : renderer.domElement.width;
    const h = target ? target.height : renderer.domElement.height;

    // Split view: the naive (classical) render on the left.
    let x0 = 0;
    if (relView.split) {
      setPointUniforms(false);
      renderer.clear();
      renderer.render(scene, camera);
      x0 = Math.round(relView.splitX * w);
      this.setScissor(renderer, target, x0, 0, w - x0, h, true);
    }

    // 2. Point sources in the ship frame.
    setPointUniforms(true);
    renderer.clear();
    camera.layers.set(POINTS_LAYER);
    renderer.render(scene, camera);
    camera.layers.enableAll();

    // 3. Remapped scene composited on top.
    const u = this.remap.uniforms;
    u.uBeta.value = relView.beta;
    u.uGamma.value = relView.gamma;
    u.uK.value = relView.k;
    u.uDoppler.value = relView.doppler ? 1 : 0;
    u.uExposure.value = relView.exposure;
    u.uPixelAngle.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, h);
    renderer.render(this.quadScene, this.quadCamera);

    if (relView.split) this.setScissor(renderer, target, 0, 0, w, h, false);
    renderer.autoClear = autoClear;
  }

  private setScissor(
    renderer: WebGLRenderer,
    target: WebGLRenderTarget | null,
    x: number,
    y: number,
    w: number,
    h: number,
    enabled: boolean,
  ): void {
    if (target) {
      target.scissor.set(x, y, w, h);
      target.scissorTest = enabled;
      renderer.setRenderTarget(target); // re-apply the target's scissor state
    } else {
      const pr = renderer.getPixelRatio();
      renderer.setScissor(x / pr, y / pr, w / pr, h / pr);
      renderer.setScissorTest(enabled);
    }
  }

  dispose(): void {
    this.cubeRT.dispose();
    this.remap.dispose();
    super.dispose();
  }
}
