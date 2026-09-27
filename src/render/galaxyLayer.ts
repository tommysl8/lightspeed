/**
 * The Galaxy's particles, drawn into a target of their own at a fraction of the view's resolution
 * and added to the view by one full-screen pass.
 *
 * Seen from inside the disc or from far above it, hundreds of thousands of soft splats overlap:
 * drawn at full resolution they would cost tens of millions of blended pixels a frame, several
 * milliseconds on an integrated GPU. The Galaxy's light is smooth at the scale of a few pixels, so
 * drawing it at a quarter of the resolution in each direction (a sixteenth of the pixels) and adding
 * the result with bilinear filtering looks the same and costs a sixteenth. The scene pass
 * (LightspeedScenePass.ts) renders the target before each half of the view, with that half's point
 * uniforms (classical or relativistic), so it is aberrated and Doppler shifted like the stars.
 *
 * Inside the Galaxy (in the bulge, or in the disc, and in flight near the centre, where the sky
 * crowds ahead) the large splats near the camera are most of the pixels blended. Every splat over 4
 * target pixels (1σ, half the budget over which they are drawn by lot: galaxy.vert.glsl) goes into
 * a second target of half the resolution, where it costs a quarter as much and looks the same (it
 * is smooth over several of that target's pixels); the composite adds the two. Measured on the
 * target laptop, this saves up to 3 ms a frame where there are many (the bulge seen from inside the
 * disc, the flight to the centre) and costs up to 0.8 ms where there are few (the second pass over
 * every particle). Each half of the split view draws all of its splats in one pass instead.
 *
 * The particles add linear light; the composite turns the sum into what is drawn with the same law
 * as the sky from the Sun (shaders/milkyway.glsl), and drops what the eye could not see: the
 * summed light fades out between the surface brightnesses of MW_MU_FADE. The Milky Way model's glow
 * near the camera (shaders/galaxyGlow.frag.glsl) is a quad drawn into the coarse target, in its
 * pass, and in a half of the split view on its own (layer GALAXY_GLOW_LAYER): drawn into the finer
 * target, with that half's splats, it cost four times as much (about 1 ms a half on the target
 * laptop) and looked the same.
 */
import {
  AdditiveBlending,
  type Camera,
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import remapVert from './shaders/remap.vert.glsl?raw';
import { galaxyUniforms, psfUniforms } from './materials';
import { MW_MU_FADE, patchFlux } from '../sim/galaxy/background';

/** Layer of the Galaxy's particles: drawn only into the Galaxy's target. */
export const GALAXY_LAYER = 4;
/** Layer of the Milky Way model's glow near the camera: drawn only into the Galaxy's coarse target. */
export const GALAXY_GLOW_LAYER = 5;

/**
 * The target holds linear light: at each pixel, the flux (in V = 0 stars) that falls within a
 * faint star's image area, f. It is drawn as the stars and the sky from the Sun are: luminance
 * uGain √f (a faint star of flux f peaks at uStarGain √f), with the stars' raised saturation, and
 * faded out below what the eye could see (uFade: f at 24 and at 22 mag/arcsec²).
 *
 * The Milky Way model's share of f is in alpha (shaders/galaxy.frag.glsl). Near the Sun the model
 * hands over from the sky map (sim/galaxy/background.ts modelShare): the view is then the picture
 * with the model, weighted by its share w, plus the picture without it, weighted 1 − w, while the
 * sky map is drawn with weight 1 − w (shaders/milkyway.glsl). Blending the two pictures, rather
 * than the light inside the square root, keeps the band from brightening half-way through the
 * handover (√(½) + √(½) > 1) and keeps the eye's threshold on the whole model's light.
 */
const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uGalaxy;
uniform sampler2D uGalaxyBig;
uniform vec2 uFade;
uniform float uGain;
uniform float uModelShare;
varying vec2 vUv;
vec3 shown(vec3 c, float f) {
  if (f <= uFade.x) return vec3(0.0);
  vec3 col = max(vec3(0.0), 1.0 + 1.5 * (c / f - 1.0));
  return col * (uGain * sqrt(f) * smoothstep(uFade.x, uFade.y, f));
}
void main() {
  vec4 t = texture2D(uGalaxy, vUv) + texture2D(uGalaxyBig, vUv);
  vec3 c = t.rgb;
  float f = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 withModel = shown(c, f);
  if (uModelShare >= 1.0 || t.a <= 0.0) {
    gl_FragColor = vec4(withModel, 1.0);
    return;
  }
  // Without the model: the rest of the light, in the same colour.
  float rest = max(f - t.a, 0.0);
  vec3 withoutModel = shown(c * (rest / max(f, 1e-30)), rest);
  gl_FragColor = vec4(mix(withoutModel, withModel, uModelShare), 1.0);
}
`;

export class GalaxyLayer {
  /**
   * Who has something to draw this frame: the model of the Milky Way (scene/GalaxyModel.tsx) and
   * the galaxies beyond it (scene/Galaxies.tsx).
   */
  readonly wants = { milkyWay: false, galaxies: false };
  /** The Milky Way model's share of the view near the Sun (scene/GalaxyModel.tsx; see COMPOSITE_FRAG). */
  modelShare = 1;
  /** Whether there is anything to draw this frame. */
  get active(): boolean {
    return this.wants.milkyWay || this.wants.galaxies;
  }
  /** Target pixels per device pixel. */
  resScale = 0.25;
  /** The large splats' target, as a share of the main one's resolution. */
  readonly bigScale = 0.5;
  private rt: WebGLRenderTarget | null = null;
  private rtBig: WebGLRenderTarget | null = null;
  private clearColor = new Color();
  readonly composite: ShaderMaterial;
  /** The full-screen quad that adds the target to the view (a mesh of the scene: scene/MilkyWay.tsx mounts it). */
  readonly quad: Mesh;

  constructor() {
    this.composite = new ShaderMaterial({
      uniforms: { uGalaxy: { value: null }, uGalaxyBig: { value: null }, uFade: { value: new Vector2(0, 1e-9) }, uGain: { value: 1.6 }, uModelShare: { value: 1 } },
      vertexShader: remapVert,
      fragmentShader: COMPOSITE_FRAG,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
  }

  /**
   * The settings every splat shares, for a view whose height is `heightCss` CSS px at `pixelRatio`
   * and whose vertical field is 2 atan(tanHalf): the target's pixels per radian, and what the eye
   * could see of the summed light (the same thresholds as the sky from the Sun). Called each frame
   * by whoever draws into the layer (the same values whoever calls).
   */
  display(tanHalf: number, heightCss: number, pixelRatio: number): void {
    const u = galaxyUniforms;
    u.uResScale.value = this.resScale;
    u.uPxPerRad.value = ((heightCss * pixelRatio) / 2 / tanHalf) * this.resScale;
    const cssPixel = (2 * tanHalf) / Math.max(1, heightCss);
    const m0 = psfUniforms.uMagZero.value;
    const faintest = patchFlux(MW_MU_FADE[1], cssPixel, m0);
    this.composite.uniforms.uFade.value.set(faintest, patchFlux(MW_MU_FADE[0], cssPixel, m0));
    this.composite.uniforms.uGain.value = psfUniforms.uStarGain.value;
    u.uFluxCut.value = 0.02 * faintest;
  }

  /** A target of `scale` × w × h pixels (the old one, resized). */
  private static sized(rt: WebGLRenderTarget | null, w: number, h: number, scale: number): WebGLRenderTarget {
    const tw = Math.max(1, Math.ceil(w * scale));
    const th = Math.max(1, Math.ceil(h * scale));
    if (!rt) return new WebGLRenderTarget(tw, th, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false });
    if (rt.width !== tw || rt.height !== th) rt.setSize(tw, th);
    return rt;
  }

  /** One pass: the small splats (0), the large ones (1) or all of them (−1), into `target`. */
  private static pass(renderer: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget, pass: number, x0: number, x1: number): void {
    galaxyUniforms.uBigPass.value = pass;
    // Only the columns shown (one half of the split view), and a texel either side for the filtering.
    const tw = target.width;
    const a = x0 > 0 ? Math.max(0, Math.floor(x0 * tw) - 1) : 0;
    const b = x1 < 1 ? Math.min(tw, Math.ceil(x1 * tw) + 1) : tw;
    target.scissor.set(a, 0, b - a, target.height);
    target.scissorTest = a > 0 || b < tw;
    renderer.setRenderTarget(target);
    renderer.clear(true, false, false);
    renderer.render(scene, camera);
    target.scissorTest = false;
  }

  /**
   * Draw the particles (layer GALAXY_LAYER of `scene`) and the glow (GALAXY_GLOW_LAYER) into the
   * targets, for a view of w × h device pixels, then give the render target back. The point uniforms
   * must already be the ones of the half of the view about to be drawn; x0 and x1 (shares of the
   * width) bound the columns it shows.
   */
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera, back: WebGLRenderTarget | null, w: number, h: number, x0 = 0, x1 = 1): void {
    this.quad.visible = this.active;
    if (!this.active) return;
    const rt = (this.rt = GalaxyLayer.sized(this.rt, w, h, this.resScale));
    const big = (this.rtBig = GalaxyLayer.sized(this.rtBig, w, h, this.resScale * this.bigScale));
    this.composite.uniforms.uGalaxy.value = rt.texture;
    this.composite.uniforms.uGalaxyBig.value = big.texture;
    this.composite.uniforms.uModelShare.value = this.wants.milkyWay ? this.modelShare : 1;
    const mask = camera.layers.mask;
    const autoClear = renderer.autoClear;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.setClearColor(0x000000, 0);
    camera.layers.set(GALAXY_LAYER);
    renderer.autoClear = false;
    galaxyUniforms.uBigScale.value = this.bigScale;
    if (x0 > 0 || x1 < 1) {
      // Half of the split view: its fill is halved already, and the particles are gone through
      // twice a frame (once for each half); a third and fourth time would cost more than it saves.
      // The glow is one quad: it still goes into the coarse target.
      GalaxyLayer.pass(renderer, scene, camera, rt, -1, x0, x1);
      camera.layers.set(GALAXY_GLOW_LAYER);
      GalaxyLayer.pass(renderer, scene, camera, big, 1, x0, x1);
    } else {
      GalaxyLayer.pass(renderer, scene, camera, rt, 0, x0, x1);
      camera.layers.enable(GALAXY_GLOW_LAYER);
      GalaxyLayer.pass(renderer, scene, camera, big, 1, x0, x1);
    }
    galaxyUniforms.uBigPass.value = 0;
    renderer.autoClear = autoClear;
    camera.layers.mask = mask;
    renderer.setClearColor(this.clearColor, clearAlpha);
    renderer.setRenderTarget(back);
  }

  dispose(): void {
    this.rt?.dispose();
    this.rt = null;
    this.rtBig?.dispose();
    this.rtBig = null;
    this.composite.dispose();
    this.quad.geometry.dispose();
  }
}

/** The one Galaxy layer of the app. */
export const galaxyLayer = new GalaxyLayer();
