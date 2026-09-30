/**
 * The uniforms of the lens chunk (render/shaders/lens.glsl, `lightspeed_lens`): one object shared by
 * reference with every material that includes the chunk (render/materials.ts spreads it into their
 * factories), so one write a frame (render/lens/lensState.ts updateLens and setLensView) reaches them all.
 * The chunk declares exactly these uniforms and nothing else.
 *
 * Their values here are the identity: uLensOn 0 (no lens), straight light, no magnification, no boost. The
 * tables are 4 × 1 float placeholders until the first real build replaces them.
 *
 * Kept apart from lensState.ts so render/materials.ts can import it without importing the lens's state and
 * everything that state reads.
 */
import { DataTexture, FloatType, NearestFilter, RedFormat, RGFormat, Vector2, Vector3, Vector4 } from 'three';

/** A small float table: NEAREST (float32 filtering is an extension phones lack; the chunk reads it with texelFetch). */
function placeholder(format: typeof RedFormat | typeof RGFormat, internal: 'R32F' | 'RG32F'): DataTexture {
  const channels = format === RedFormat ? 1 : 2;
  const t = new DataTexture(new Float32Array(4 * channels), 4, 1, format, FloatType);
  t.internalFormat = internal;
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** A uniform: shared by reference between materials. */
interface Uniform<T> {
  value: T;
}

/** Uniforms of the lightspeed_lens chunk; units and meanings as the chunk's declarations say. */
export interface LensUniforms {
  /** 1: a lens is drawn this frame. */
  uLensOn: Uniform<number>;
  /** Camera → hole, world axes, units of M, from float64. */
  uLensHole: Uniform<Vector3>;
  /** Unit camera → hole, world axes, hole frame. */
  uLensAxis: Uniform<Vector3>;
  /** r in units of M. */
  uLensRo: Uniform<number>;
  /** α_edge, rad: the shadow (static) or the dark region (rain), from float64. */
  uLensEdge: Uniform<number>;
  /** π − α_edge, from float64 (used when α_edge > π/2). */
  uLensSpan: Uniform<number>;
  /** 0 the static observer, 1 the raindrop. */
  uLensFrame: Uniform<number>;
  /** Static: −½ ln(1 − 2/r). */
  uLensLnG: Uniform<number>;
  /** Rain: (v = √(2/r), 1 − v), from float64. */
  uLensRain: Uniform<Vector2>;
  /** Forward table: (s0, 1/Δs, n, κ). */
  uLensFwd: Uniform<Vector4>;
  /** R32F (n + 2) × 1, NEAREST: δ at nodes −1 … n (texel i = node i − 1). */
  uLensFwdTab: Uniform<DataTexture | null>;
  /** Inverse row 0: (z0, 1/Δz, n, 2θ_E). */
  uLensInv: Uniform<Vector4>;
  /** Inverse row 1: (2π, 1/ΔD, n1, 0). */
  uLensInvRel: Uniform<Vector4>;
  /** RG32F (n + 2) × 2: (y = ln(α − α_edge), m = −ln|dΔφ/dα|). */
  uLensInvTab: Uniform<DataTexture | null>;
  /** cos of the point zone's source-angle radius (outside it order 0 returns the direction with only ln g). */
  uLensPtCos: Uniform<number>;
  /** cos of the diffuse zone's image-angle radius, lens frame: the composite resamples only inside it. */
  uLensDiffCos: Uniform<number>;
  /** ln|μ₀| bounds against ln ψ (16 floats as vec4[4]). */
  uLensMuBound: Uniform<Float32Array>;
  /** (ln ψ_min, 1/Δ ln ψ) of those bounds. */
  uLensMuBoundAxis: Uniform<Vector2>;
  /** Units of M per (km, pc, kpc, Mpc). */
  uLensScale: Uniform<Vector4>;
  /** Device px per rad at the screen centre (thresholds, pass counts). */
  uLensPxPerRad: Uniform<number>;
  /** R32F 130 × 1: Gould's B0(z)/z at z = 0, 1/16, …, 8 (texel i + 1), ghosts at both ends. */
  uLensB0Z: Uniform<DataTexture | null>;
  /** Per half (setLensView): the lens box, NDC (x0, y0, x1, y1); the plain composite covers the rest. */
  uLensBox: Uniform<Vector4>;
  /** Per half: the edge circle's centre in the view observer's frame (unit), its radius (rad) and the band pass's half-width (device px). */
  uLensEdgeCentre: Uniform<Vector3>;
  uLensEdgeRadius: Uniform<number>;
  uLensSsBandPx: Uniform<number>;
  /**
   * Per half: the band's annulus as bounds on the squared chord |d − edge centre|² (d the view direction), from float64:
   * (4 sin²((R − w)/2), 4 sin²((R + w)/2)), R the edge's radius, w (uLensSsBandPx + 1) pixel angles; −1 and 5 where R − w
   * < 0 or R + w > π; (0, 0) with no band.
   */
  uLensBandChord2: Uniform<Vector2>;
  /** Per half: the diffuse zone as a cone in the view observer's frame (an early-out in the box). */
  uLensZoneCentre: Uniform<Vector3>;
  uLensZoneCos: Uniform<number>;
  /** The S → hole-frame boost: rapidity, e^±φ and unit direction (0 at Sgr A* and M87*, and during falls). */
  uFramePhi: Uniform<number>;
  uFrameEPhi: Uniform<number>;
  uFrameEmPhi: Uniform<number>;
  uFrameVelDir: Uniform<Vector3>;
}

/** The lens chunk's uniforms, at the identity (no lens) until updateLens writes them. */
export const lensUniforms: LensUniforms = {
  uLensOn: { value: 0 },
  uLensHole: { value: new Vector3(0, 0, 0) },
  uLensAxis: { value: new Vector3(0, 0, -1) },
  uLensRo: { value: 1e30 },
  uLensEdge: { value: 0 },
  uLensSpan: { value: Math.PI },
  uLensFrame: { value: 0 },
  uLensLnG: { value: 0 },
  uLensRain: { value: new Vector2(0, 1) },
  uLensFwd: { value: new Vector4(0, 1, 2, 3) },
  uLensFwdTab: { value: placeholder(RedFormat, 'R32F') },
  uLensInv: { value: new Vector4(0, 1, 2, 1) },
  uLensInvRel: { value: new Vector4(2 * Math.PI, 1, 2, 0) },
  uLensInvTab: { value: placeholder(RGFormat, 'RG32F') },
  uLensPtCos: { value: 1 },
  uLensDiffCos: { value: 1 },
  uLensMuBound: { value: new Float32Array(16) },
  uLensMuBoundAxis: { value: new Vector2(0, 1) },
  uLensScale: { value: new Vector4(0, 0, 0, 0) },
  uLensPxPerRad: { value: 1000 },
  uLensB0Z: { value: placeholder(RedFormat, 'R32F') },
  uLensBox: { value: new Vector4(0, 0, 0, 0) },
  uLensEdgeCentre: { value: new Vector3(0, 0, -1) },
  uLensEdgeRadius: { value: 0 },
  uLensSsBandPx: { value: 0 },
  uLensBandChord2: { value: new Vector2(0, 0) },
  uLensZoneCentre: { value: new Vector3(0, 0, -1) },
  uLensZoneCos: { value: 1 },
  uFramePhi: { value: 0 },
  uFrameEPhi: { value: 1 },
  uFrameEmPhi: { value: 1 },
  uFrameVelDir: { value: new Vector3(0, 0, -1) },
};
