/**
 * Shader materials and shared GPU resources. Every custom shader includes three.js's
 * logarithmic-depth chunks, so objects from metres to light-years share one depth buffer.
 */
import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  FloatType,
  NearestFilter,
  NormalBlending,
  RGBAFormat,
  ShaderChunk,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { blackbodyLut, blackbodyRgb } from '../physics/blackbody';
import { SATURN_RING_INNER_KM, SATURN_RING_OUTER_KM, SUN_TEFF_K } from '../physics/constants';

import blackbodyGlsl from './shaders/blackbody.glsl?raw';
import relativityGlsl from './shaders/relativity.glsl?raw';
import cmbVert from './shaders/cmb.vert.glsl?raw';
import psfGlsl from './shaders/psf.glsl?raw';
import pointFrag from './shaders/point.frag.glsl?raw';
import starsVert from './shaders/stars.vert.glsl?raw';
import glintsVert from './shaders/glints.vert.glsl?raw';
import beltsVert from './shaders/belts.vert.glsl?raw';
import beltsFrag from './shaders/belts.frag.glsl?raw';
import orbitVert from './shaders/orbit.vert.glsl?raw';
import orbitFrag from './shaders/orbit.frag.glsl?raw';
import planetVert from './shaders/planet.vert.glsl?raw';
import planetFrag from './shaders/planet.frag.glsl?raw';
import sunFrag from './shaders/sun.frag.glsl?raw';
import ringVert from './shaders/ring.vert.glsl?raw';
import ringFrag from './shaders/ring.frag.glsl?raw';

// Register custom chunks so shaders can `#include <lightspeed_…>`.
const chunks = ShaderChunk as unknown as Record<string, string>;
chunks.lightspeed_blackbody = blackbodyGlsl;
chunks.lightspeed_relativity = relativityGlsl;
chunks.lightspeed_psf = psfGlsl;

/**
 * Blackbody lookup texture shared by the point-source shaders and the remap pass. Float32 with
 * nearest sampling (float32 linear filtering is an extension); the shaders interpolate by hand.
 */
let bbTexture: DataTexture | null = null;
export function blackbodyTexture(): DataTexture {
  if (!bbTexture) {
    const lut = blackbodyLut();
    bbTexture = new DataTexture(lut.data, lut.size, 1, RGBAFormat, FloatType);
    bbTexture.magFilter = NearestFilter;
    bbTexture.minFilter = NearestFilter;
    bbTexture.needsUpdate = true;
  }
  return bbTexture;
}

/** The blackbody table's range for the shaders: (ln T_min, ln T_max, size, cold-asymptote K). */
export function blackbodyRange(): Vector4 {
  const lut = blackbodyLut();
  return new Vector4(lut.lnTMin, lut.lnTMax, lut.size, lut.wienK);
}

/** Colour of sunlight (5772 K blackbody, white-balanced to 6500 K, luminance 1). */
export const SUN_COLOR = new Color(...blackbodyRgb(SUN_TEFF_K));

/**
 * Radiance of a 5,772 K surface as rendered (luminance, before any exposure). Other blackbodies
 * are calibrated against it, the CMB included, and V = −26.74 is the Sun's disc at this
 * radiance. 5,772 K is the Sun's effective temperature, which describes the disc as a whole, so
 * this is the disc's average: its centre is brighter and its limb darker (SUN_CENTRE_RADIANCE).
 */
export const SUN_SURFACE_RADIANCE = 8;

/**
 * Limb darkening of a star's disc, I(μ)/I(1) = 1 − u (1 − μ) with μ the cosine of the angle
 * from the disc's centre, per linear-RGB channel: about 0.8 in blue down to 0.5 in red
 * (approximating Neckel & Labs 1994, Solar Physics 153, 91). Used by sun.frag.glsl.
 */
export const LIMB_DARKENING_U = new Vector3(0.52, 0.64, 0.8);

/**
 * The disc's mean brightness as a fraction of its centre's: 1 − u (1 − μ) averaged over the
 * projected disc is 2∫(1 − u + uμ) μ dμ = 1 − u/3, here weighted by the luminance of sunlight
 * (about 0.79).
 */
export const SUN_LIMB_DISC_MEAN = (() => {
  const w = [0.2126 * SUN_COLOR.r, 0.7152 * SUN_COLOR.g, 0.0722 * SUN_COLOR.b];
  const u = [LIMB_DARKENING_U.x, LIMB_DARKENING_U.y, LIMB_DARKENING_U.z];
  return w.reduce((a, wi, i) => a + wi * (1 - u[i] / 3), 0) / (w[0] + w[1] + w[2]);
})();

/** Radiance at the centre of the Sun's disc, so that the disc as a whole averages SUN_SURFACE_RADIANCE. */
export const SUN_CENTRE_RADIANCE = SUN_SURFACE_RADIANCE / SUN_LIMB_DISC_MEAN;

/**
 * Uniforms shared (by reference) with every relativistic point shader. The ship's motion
 * enters as its rapidity φ and e^±φ (see shaders/relativity.glsl); all zero-motion values
 * (φ = 0, e^±φ = 1, ln exposure = 0) give the classical view.
 */
export const relativityUniforms = {
  uPhi: { value: 0 },
  uEPhi: { value: 1 },
  uEmPhi: { value: 1 },
  uLnExposure: { value: 0 },
  uVelDir: { value: new Vector3(0, 0, -1) },
  uBlackbody: { value: null as DataTexture | null },
  uBbRange: { value: new Vector4() },
};

/** The CMB's unresolved hot spot, written each frame by relativisticView.ts. */
export const cmbPointUniforms = {
  uCmbPointDir: { value: new Vector3(0, 0, -1) },
  uCmbPointMag: { value: 99 },
  uCmbPointColor: { value: new Color(1, 1, 1) },
  uCmbPointFade: { value: 0 },
};

/** Point-spread-function uniforms shared by stars and glints. */
export const psfUniforms = {
  uPixelRatio: { value: 1 },
  uMagZero: { value: 0 },
  uStarGain: { value: 1.6 },
};

function initBlackbodyUniforms(): void {
  relativityUniforms.uBlackbody.value = blackbodyTexture();
  relativityUniforms.uBbRange.value.copy(blackbodyRange());
}

function shared() {
  initBlackbodyUniforms();
  return { ...relativityUniforms, ...psfUniforms };
}

export function createCmbPointMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...shared(), ...cmbPointUniforms },
    vertexShader: cmbVert,
    fragmentShader: pointFrag,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: false, // with the stars: at infinity, under everything else
  });
}

export function createStarMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: shared(),
    vertexShader: starsVert,
    fragmentShader: pointFrag,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: false, // stays in the opaque pass so it draws before (under) everything else
  });
}

export function createGlintMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: shared(),
    vertexShader: glintsVert,
    fragmentShader: pointFrag,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    transparent: true,
  });
}

export function createBeltMaterial(): ShaderMaterial {
  initBlackbodyUniforms();
  return new ShaderMaterial({
    uniforms: {
      ...relativityUniforms,
      uDays: { value: 0 },
      uCamAU: { value: new Vector3() },
      uPointSize: { value: 1.5 },
      uOpacity: { value: 1 },
      uRefDistAU: { value: 16 },
      uRetarded: { value: 0 },
      uNearCap: { value: 0.3 },
      uColorMain: { value: new Color('#c9b8a3') },
      uColorTrojan: { value: new Color('#b7a98f') },
      uColorTno: { value: new Color('#9fb6d8') },
      uShowKuiper: { value: 1 },
      uShowAsteroids: { value: 1 },
    },
    vertexShader: beltsVert,
    fragmentShader: beltsFrag,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    transparent: true,
  });
}

export function createOrbitMaterial(color: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uBodyPos: { value: new Vector3() },
      uP: { value: new Vector3(1, 0, 0) },
      uQ: { value: new Vector3(0, 0, -1) },
      uA: { value: 1 },
      uB: { value: 1 },
      uAnomaly: { value: 0 },
      uHyperbolic: { value: 0 },
      uSpanMin: { value: -Math.PI },
      uSpanMax: { value: Math.PI },
      uClosed: { value: 1 },
      uSegments: { value: 1024 },
      uWidth: { value: 1.25 },
      uPixelRatio: { value: 1 },
      uResolution: { value: new Vector2(1, 1) },
      uNear: { value: 0.001 },
      uBodyRadius: { value: 1 },
      uAlphaBase: { value: 0.16 },
      uAlphaTrail: { value: 0.62 },
      uColor: { value: color },
      uOpacity: { value: 1 },
    },
    vertexShader: orbitVert,
    fragmentShader: orbitFrag,
    blending: NormalBlending,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    side: DoubleSide,
  });
}

export interface PlanetMaterialOptions {
  baseColor: Color;
  banded?: boolean;
  atmoColor?: Color;
  atmoStrength?: number;
  lonOffset?: number;
  fillBlack?: boolean;
  flat?: boolean;
  ambient?: number;
  /** Multiplies the surface map (to tint a greyscale map with the body's hue). */
  mapTint?: Color;
}

export function createPlanetMaterial(o: PlanetMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uNight: { value: null },
      uHasNight: { value: 0 },
      uClouds: { value: null },
      uHasClouds: { value: 0 },
      uBaseColor: { value: o.baseColor },
      uBanded: { value: o.banded ? 1 : 0 },
      uSunRel: { value: new Vector3() },
      uSunIntensity: { value: 1.6 },
      uSunColor: { value: SUN_COLOR },
      uAtmoColor: { value: o.atmoColor ?? new Color(0, 0, 0) },
      uAtmoStrength: { value: o.atmoStrength ?? 0 },
      uLonOffset: { value: o.lonOffset ?? 0 },
      uFillBlack: { value: o.fillBlack ? 1 : 0 },
      uAmbient: { value: o.ambient ?? 0.004 },
      uFlat: { value: o.flat ? 1 : 0 },
      uMapTint: { value: o.mapTint ?? new Color(1, 1, 1) },
      // The map is a single-channel greyscale texture holding sRGB values (textures.ts).
      uMapGrey: { value: 0 },
      uRingShadow: { value: 0 },
      uRingMap: { value: null },
      uRingNormalW: { value: new Vector3(0, 1, 0) },
      uCenterW: { value: new Vector3() },
      uRingInner: { value: 1 },
      uRingOuter: { value: 2 },
    },
    vertexShader: planetVert,
    fragmentShader: planetFrag,
  });
}

export function createSunMaterial(color: Color = SUN_COLOR): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uSunColor: { value: color },
      uIntensity: { value: SUN_CENTRE_RADIANCE },
      uLimbU: { value: LIMB_DARKENING_U },
    },
    vertexShader: planetVert,
    fragmentShader: sunFrag,
  });
}

export function createRingMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uSunRel: { value: new Vector3() },
      uCenterW: { value: new Vector3() },
      uNormalW: { value: new Vector3(0, 1, 0) },
      uPlanetRadius: { value: 1 },
      uSunIntensity: { value: 1.6 },
      uSunColor: { value: SUN_COLOR },
      uInner: { value: SATURN_RING_INNER_KM },
      uOuter: { value: SATURN_RING_OUTER_KM },
    },
    vertexShader: ringVert,
    fragmentShader: ringFrag,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
}
