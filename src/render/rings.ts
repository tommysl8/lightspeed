/**
 * Ring textures for the ring shader: a radial strip, u = 0 at the inner edge of the system and
 * u = 1 at the outer edge, colour in RGB and opacity in alpha. Saturn has a photographic strip;
 * the other ring systems (phase-2 rings.json: Jupiter, Uranus, Neptune, Haumea, Quaoar) are
 * lists of bands, drawn here into a strip, with narrow rings kept visible as partial texels.
 */
import { Color, DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import { displayRadiusKm, type BodyRecord } from '../sim/bodies';

export interface RingBand {
  innerKm: number;
  outerKm: number;
  /** Fraction of the light blocked face-on (1 − e^(−τ) for a normal optical depth τ). */
  opacity: number;
  /** sRGB colour. */
  colour: string;
}

/** Inner and outer radius of a set of bands, km. */
export function bandsExtent(bands: readonly RingBand[]): { innerKm: number; outerKm: number } {
  let inner = Infinity;
  let outer = 0;
  for (const b of bands) {
    inner = Math.min(inner, b.innerKm);
    outer = Math.max(outer, b.outerKm);
  }
  // A single narrow ring still needs some width to draw on.
  if (outer - inner < 1) outer = inner + 1;
  return { innerKm: inner, outerKm: outer };
}

/** Outer radius of a ring system, km (what decides whether it is wide enough on screen to draw). */
export function ringOuterKm(spec: { kind: 'texture'; outerKm: number } | { kind: 'bands'; bands: readonly RingBand[] }): number {
  return spec.kind === 'texture' ? spec.outerKm : bandsExtent(spec.bands).outerKm;
}

/**
 * How much wider than the body its visual is: its rings' outer radius over its radius (1 without
 * rings). A ringed body is mounted and drawn while its rings are a pixel wide (Bodies.tsx).
 */
const extents = new WeakMap<BodyRecord, number>();
export function extentFactor(r: BodyRecord): number {
  let k = extents.get(r);
  if (k === undefined) {
    const rings = r.visual?.rings;
    k = rings ? Math.max(1, ringOuterKm(rings) / displayRadiusKm(r)) : 1;
    extents.set(r, k);
  }
  return k;
}

/**
 * Rasterise bands into RGBA texels (sRGB bytes). Each texel's opacity is the band's opacity
 * times the fraction of the texel it covers, so a 20 km ring in a 50 km texel still shows.
 */
export function rasteriseBands(bands: readonly RingBand[], innerKm: number, outerKm: number, width = 2048): Uint8Array {
  const data = new Uint8Array(width * 4);
  const span = (outerKm - innerKm) / width;
  const rgb = new Float32Array(width * 3);
  const alpha = new Float32Array(width);
  const c = new Color();
  for (const b of bands) {
    c.set(b.colour);
    const i0 = Math.max(0, Math.floor((b.innerKm - innerKm) / span));
    const i1 = Math.min(width - 1, Math.floor((b.outerKm - innerKm) / span));
    for (let i = i0; i <= i1; i++) {
      const t0 = innerKm + i * span;
      const cover = Math.max(0, Math.min(t0 + span, b.outerKm) - Math.max(t0, b.innerKm)) / span;
      const a = Math.min(1, b.opacity * cover);
      if (a <= 0) continue;
      // Over-composite this band on what is there.
      const keep = alpha[i] * (1 - a);
      const out = a + keep;
      rgb[3 * i] = (c.r * a + rgb[3 * i] * keep) / out;
      rgb[3 * i + 1] = (c.g * a + rgb[3 * i + 1] * keep) / out;
      rgb[3 * i + 2] = (c.b * a + rgb[3 * i + 2] * keep) / out;
      alpha[i] = out;
    }
  }
  for (let i = 0; i < width; i++) {
    // Color.set() gives linear components; store sRGB bytes.
    c.setRGB(rgb[3 * i], rgb[3 * i + 1], rgb[3 * i + 2]);
    const [r, g, bl] = [c.r, c.g, c.b].map((x) => Math.round(255 * Math.min(1, Math.max(0, linearToSrgb(x)))));
    data[4 * i] = r;
    data[4 * i + 1] = g;
    data[4 * i + 2] = bl;
    data[4 * i + 3] = Math.round(255 * Math.min(1, alpha[i]));
  }
  return data;
}

const linearToSrgb = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

/** A ring strip texture from bands. */
export function bandsTexture(bands: readonly RingBand[], innerKm: number, outerKm: number, width = 2048): DataTexture {
  const t = new DataTexture(rasteriseBands(bands, innerKm, outerKm, width), width, 1, RGBAFormat, UnsignedByteType);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}
