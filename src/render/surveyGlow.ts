/**
 * The galaxy surveys' glows (shaders/surveyGlow.vert.glsl), drawn into a target of their own at a sixteenth of the view's
 * resolution in each direction and added to the view by one full-screen pass, as the Galaxy's particles are (galaxyLayer.ts), but in the
 * points' linear light: the glows stand in for points and must add up with them, so no display law is applied to their
 * sum (the Galaxy's composite takes a square root of its own).
 *
 * Why a target: a glow spans tens to hundreds of pixels (none is narrower than 11 device pixels), and a thousand of them
 * drawn at full resolution would blend hundreds of millions of pixels; they are smooth over many pixels, so 1/256 of
 * the pixels, filtered bilinearly when added, looks the same (2,000 glows cost 1.7 ms on the target laptop at an eighth
 * of the resolution, 0.6 ms at a sixteenth). The scene pass (LightspeedScenePass.ts) renders the
 * target before each half of the view with that half's point uniforms (classical or relativistic), so the glows are
 * aberrated and Doppler shifted like the points. Nothing is drawn, and the composite is hidden, while the survey layer
 * shows no glow.
 *
 * Cost: about 0.55 ms on the target laptop at 2,560 × 1,224 pixels, whether 500 glows or 2,000, nearly all of it the
 * composite's full-screen pass; nothing while no glow is drawn (Surveys.tsx leaves out those too faint to show).
 */
import {
  AdditiveBlending,
  type Camera,
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/** Layer of the surveys' glows: drawn only into their target. */
export const SURVEY_GLOW_LAYER = 7;

const COMPOSITE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uGlow;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(uGlow, vUv).rgb, 1.0);
}
`;

export class SurveyGlowLayer {
  /** Whether the glows are drawn this frame (scene/Surveys.tsx sets it). */
  active = false;
  /** Target pixels per device pixel. */
  readonly resScale = 0.0625;
  private rt: WebGLRenderTarget | null = null;
  private clearColor = new Color();
  /**
   * The glows' own scene (scene/Surveys.tsx puts its one draw in it): rendering the app's whole scene again, to find
   * one object on one layer, cost about a millisecond of the processor's time a frame.
   */
  readonly scene = new Scene();
  readonly composite: ShaderMaterial;
  /** The full-screen quad that adds the target to the view (scene/Surveys.tsx mounts it). */
  readonly quad: Mesh;

  constructor() {
    this.composite = new ShaderMaterial({
      uniforms: { uGlow: { value: null } },
      vertexShader: COMPOSITE_VERT,
      fragmentShader: COMPOSITE_FRAG,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quad.visible = false;
  }

  /**
   * Draw the glows (their own scene, above) into the target for a view of w × h device pixels, over the columns x0 … x1
   * (shares of the width: a half of the split view), then give the render target back. `_scene` is the app's, which
   * the Galaxy layer's render takes too (LightspeedScenePass.ts calls both alike).
   */
  render(renderer: WebGLRenderer, _scene: Scene, camera: Camera, back: WebGLRenderTarget | null, w: number, h: number, x0 = 0, x1 = 1): void {
    this.quad.visible = this.active;
    if (!this.active) {
      // Freed once the layer stops drawing glows (a few MB at pixel ratio 2); made again when next wanted.
      if (this.rt) {
        this.rt.dispose();
        this.rt = null;
      }
      return;
    }
    const tw = Math.max(1, Math.ceil(w * this.resScale));
    const th = Math.max(1, Math.ceil(h * this.resScale));
    if (!this.rt) this.rt = new WebGLRenderTarget(tw, th, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false });
    else if (this.rt.width !== tw || this.rt.height !== th) this.rt.setSize(tw, th);
    const rt = this.rt;
    this.composite.uniforms.uGlow.value = rt.texture;
    const mask = camera.layers.mask;
    const autoClear = renderer.autoClear;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    camera.layers.set(SURVEY_GLOW_LAYER);
    const a = x0 > 0 ? Math.max(0, Math.floor(x0 * tw) - 1) : 0;
    const b = x1 < 1 ? Math.min(tw, Math.ceil(x1 * tw) + 1) : tw;
    rt.scissor.set(a, 0, b - a, th);
    rt.scissorTest = a > 0 || b < tw;
    renderer.setRenderTarget(rt);
    renderer.clear(true, false, false);
    renderer.render(this.scene, camera);
    rt.scissorTest = false;
    camera.layers.mask = mask;
    renderer.autoClear = autoClear;
    renderer.setClearColor(this.clearColor, clearAlpha);
    renderer.setRenderTarget(back);
  }

  dispose(): void {
    this.rt?.dispose();
    this.rt = null;
    this.composite.dispose();
    this.quad.geometry.dispose();
  }
}

/** The one survey glow layer of the app. */
export const surveyGlow = new SurveyGlowLayer();
