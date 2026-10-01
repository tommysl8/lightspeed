/**
 * The lens box's composite (shaders/lensComposite.frag.glsl): the material, the uniforms the lens passes share (the
 * composite, the photon ring's band, the lensed spheres), and the chunk `lightspeed_lenspixel` (lensPixel.glsl, one
 * ray of the per-pixel lens) they include.
 *
 * What: the Galaxy layer's light resampled through the lens inside the box round the hole (docs/data/blackholes.md
 * §10); the box itself is geometry placed from the half's box uniform (lensGeometry.ts), drawn additively on layers
 * 3 and 1 at render order −999, beside the Galaxy layer's plain composite, which draws the frame round it
 * (scene/BlackHoleLens.tsx mounts it).
 *
 * How: every uniform object is shared by reference: the relativity chunk's (the half's observer), the lens's
 * (render/lens/lensUniforms.ts), the flow's (render/flow/flowMap.ts), a thin disc's (render/disk/diskMap.ts), the Galaxy layer's inputs (its targets, their
 * mipmaps, the drawn columns, the display law: render/galaxyLayer.ts) and lensPassUniforms here (the camera's
 * matrices, the pixel's angle, the sky cube, the Doppler skip, the debug sky), which scene/BlackHoleLens.tsx writes
 * each frame (setLensPassFrame).
 *
 * Cost: about 0.8 ms over the whole screen at rest on the target laptop, 0.08 ms for the box at 4,000 au. Its first
 * compile takes 0.6–2.4 s on a fresh page there: it is in the background list (lensMaterials.ts LENS_LATER), and
 * the lens waits for it.
 *
 * Twins: shaders/lensComposite.frag.glsl, lensPixel.glsl.
 */
import { AdditiveBlending, DataTexture, FloatType, Matrix4, NearestFilter, type PerspectiveCamera, RGBAFormat, ShaderChunk, ShaderMaterial, type Texture, Vector2, Vector3 } from 'three';
import { buildDopplerLut, DOPPLER_LUT_LN_MAX, DOPPLER_LUT_LN_MIN, DOPPLER_LUT_SIZE } from '../../physics/dopplerColor';
import { blackbodyRange, blackbodyTexture, relativityUniforms } from '../materials';
import { galaxyLayer } from '../galaxyLayer';
import { flowUniforms } from '../flow/flowMap';
import { diskUniforms } from '../disk/diskMap';
import { lensUniforms } from './lensUniforms';
import lensPixelGlsl from './lensPixel.glsl?raw';
import lensBoxVert from '../shaders/lensBox.vert.glsl?raw';
import lensCompositeFrag from '../shaders/lensComposite.frag.glsl?raw';

(ShaderChunk as unknown as Record<string, string>).lightspeed_lenspixel = lensPixelGlsl;

/** The Doppler colour table of the lens passes (the remap's, built the same way). */
let lut: DataTexture | null = null;
export function lensDopplerLut(): DataTexture {
  if (!lut) {
    lut = new DataTexture(buildDopplerLut(DOPPLER_LUT_SIZE), DOPPLER_LUT_SIZE, 3, RGBAFormat, FloatType);
    lut.minFilter = NearestFilter;
    lut.magFilter = NearestFilter;
    lut.needsUpdate = true;
  }
  return lut;
}

/** Texel angles of the sky cube's faces: particles 512 px, glow 128 px (a 90° face). */
export const SKY_CUBE_FACE_PX = 512;
export const SKY_CUBE_GLOW_FACE_PX = 128;

/** The uniforms every lens pass shares (by reference), written each frame by setLensPassFrame. */
export const lensPassUniforms = {
  uProjInv: { value: new Matrix4() },
  uCamWorld: { value: new Matrix4() },
  /** Projection × view (a rotation: the camera sits at the origin). */
  uViewProj: { value: new Matrix4() },
  /** The view's forward axis, world. */
  uViewFwd: { value: new Vector3(0, 0, -1) },
  /** A device pixel's angle at the screen's centre, rad. */
  uPixelAngle: { value: 1e-3 },
  /** The render target in device px. */
  uTargetPx: { value: new Vector2(1, 1) },
  uSkyCube: { value: null as Texture | null },
  uSkyCubeGlow: { value: null as Texture | null },
  uSkyCubeLive: { value: 0 },
  uCubeTexel: { value: new Vector2(Math.PI / 2 / SKY_CUBE_FACE_PX, Math.PI / 2 / SKY_CUBE_GLOW_FACE_PX) },
  /** |Δ ln ν| below which nothing is recoloured: 1e-4 (1e-2 at rung 2). */
  uDopplerSkip: { value: 1e-4 },
  /** 0 the sky; 1–4 the debug skies of dev/lensTest.ts. */
  uLensDebug: { value: 0 },
  uDopplerLut: { value: null as DataTexture | null },
  uDopplerLutRange: { value: new Vector3(DOPPLER_LUT_LN_MIN, DOPPLER_LUT_LN_MAX, DOPPLER_LUT_SIZE) },
};

const fwd = new Vector3();

/** This frame's camera, screen and settings into the shared uniforms (scene/BlackHoleLens.tsx, before the render). */
export function setLensPassFrame(camera: PerspectiveCamera, targetW: number, targetH: number, pxPerRad: number, dopplerSkip: number): void {
  const u = lensPassUniforms;
  u.uProjInv.value.copy(camera.projectionMatrixInverse);
  u.uCamWorld.value.copy(camera.matrixWorld);
  u.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  camera.getWorldDirection(fwd);
  u.uViewFwd.value.copy(fwd);
  u.uPixelAngle.value = 1 / pxPerRad;
  u.uTargetPx.value.set(targetW, targetH);
  u.uDopplerSkip.value = dopplerSkip;
}

/** The uniforms of a lens pass: everything it reads, shared by reference. */
export function lensPassUniformSet(): Record<string, { value: unknown }> {
  relativityUniforms.uBlackbody.value = blackbodyTexture();
  relativityUniforms.uBbRange.value.copy(blackbodyRange());
  lensPassUniforms.uDopplerLut.value = lensDopplerLut();
  return { ...relativityUniforms, ...lensUniforms, ...flowUniforms, ...diskUniforms, ...galaxyLayer.inputs, ...lensPassUniforms };
}

/** The lens box's composite: additive, no depth, drawn on layers 3 and 1 at render order −999. */
export function createLensCompositeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: lensPassUniformSet(),
    vertexShader: lensBoxVert,
    fragmentShader: lensCompositeFrag,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });
}
