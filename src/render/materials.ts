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
} from 'three';
import { BB_LUT_LOG_T_MAX, BB_LUT_LOG_T_MIN, blackbodyRgb, buildBlackbodyLut } from '../physics/blackbody';
import { SATURN_RING_INNER_KM, SATURN_RING_OUTER_KM, SUN_TEFF_K } from '../physics/constants';

import relativityGlsl from './shaders/relativity.glsl?raw';
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
chunks.lightspeed_relativity = relativityGlsl;
chunks.lightspeed_psf = psfGlsl;

/** Blackbody lookup texture shared by all point-source shaders. */
let bbTexture: DataTexture | null = null;
export function blackbodyTexture(): DataTexture {
  if (!bbTexture) {
    const size = 1024;
    bbTexture = new DataTexture(buildBlackbodyLut(size), size, 1, RGBAFormat, FloatType);
    bbTexture.magFilter = NearestFilter;
    bbTexture.minFilter = NearestFilter;
    bbTexture.needsUpdate = true;
  }
  return bbTexture;
}

/** Colour of sunlight (5772 K blackbody, white-balanced to 6500 K, luminance 1). */
export const SUN_COLOR = new Color(...blackbodyRgb(SUN_TEFF_K));

/** Uniforms shared (by reference) with every relativistic point shader. */
export const relativityUniforms = {
  uBeta: { value: 0 },
  uGamma: { value: 1 },
  uVelDir: { value: new Vector3(0, 0, -1) },
  uBlackbody: { value: null as DataTexture | null },
  uLogTMin: { value: BB_LUT_LOG_T_MIN },
  uLogTMax: { value: BB_LUT_LOG_T_MAX },
};

/** Point-spread-function uniforms shared by stars and glints. */
export const psfUniforms = {
  uPixelRatio: { value: 1 },
  uMagZero: { value: 0 },
  uStarGain: { value: 1.6 },
};

function shared() {
  relativityUniforms.uBlackbody.value = blackbodyTexture();
  return { ...relativityUniforms, ...psfUniforms };
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
  relativityUniforms.uBlackbody.value = blackbodyTexture();
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
      uSunView: { value: new Vector3() },
      uSunIntensity: { value: 1.6 },
      uSunColor: { value: SUN_COLOR },
      uAtmoColor: { value: o.atmoColor ?? new Color(0, 0, 0) },
      uAtmoStrength: { value: o.atmoStrength ?? 0 },
      uLonOffset: { value: o.lonOffset ?? 0 },
      uFillBlack: { value: o.fillBlack ? 1 : 0 },
      uAmbient: { value: o.ambient ?? 0.004 },
      uFlat: { value: o.flat ? 1 : 0 },
      uRingShadow: { value: 0 },
      uRingMap: { value: null },
      uRingNormalV: { value: new Vector3(0, 1, 0) },
      uCenterV: { value: new Vector3() },
      uRingInner: { value: 1 },
      uRingOuter: { value: 2 },
    },
    vertexShader: planetVert,
    fragmentShader: planetFrag,
  });
}

export function createSunMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uSunColor: { value: SUN_COLOR },
      uIntensity: { value: 8 },
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
      uSunView: { value: new Vector3() },
      uCenterV: { value: new Vector3() },
      uNormalV: { value: new Vector3(0, 1, 0) },
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
