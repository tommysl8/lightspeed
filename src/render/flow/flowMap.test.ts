/**
 * The accretion flow's map (render/flow/flowMap.ts) on the processor side: its row table against its layout
 * (docs/data/blackholes.md §7: rows uniform in s = ln g + 3g on either side of the shadow's edge, crowding at the
 * photon ring, up to the flow's outer angle), the lookup's row function (the twin of flowLookup.glsl flowRowOf)
 * landing on every row's own gap, the raindrop's dark rays inside the horizon, the EHT blur's widths (the beam's
 * 20 µas as 3.90 M of impact parameter, carried into the view by db/dα and b) and that it blurs the 1.3 mm view
 * only, the display gains (the Sun's-calibration surface: μ_V −5.40 is radiance 0.066), the exposure the flow's
 * glare calls for, and the passes it compiles in the background.
 */
import { describe, expect, it } from 'vitest';
import { edgeAngle, spanAngle, type LensObserver } from '../../physics/schwarzschild';
import {
  buildFlowRows,
  EHT_BEAM_SIGMA_M,
  FLOW_EXPOSURE_MEAN,
  FLOW_LATER,
  FLOW_MAP_ROWS,
  FLOW_MAP_ROWS_IN,
  FLOW_SURFACE_GAIN,
  flowBlurOn,
  flowExposureTarget,
  flowGlare,
  flowHandoverGain,
  flowRingPx,
  FLOW_HANDOVER_END_PX,
  pointDrawnLight,
  flowMapRowOf,
  flowUniforms,
  type FlowRowAxes,
} from './flowMap';
import { FLOW_OUTER_M } from './flowRay';

const axes = (): FlowRowAxes => ({ obs: { frame: 'static', r: 1 }, edge: 0, span: 0, rows: 0, rowsIn: 0, sMin: 0, ds: 1, sTop: 0, dsIn: 1, gOut: 0 });

function build(obs: LensObserver, rows = FLOW_MAP_ROWS, rowsIn = FLOW_MAP_ROWS_IN) {
  const a = axes();
  const rowData = new Float32Array(4 * rows);
  const blur = new Float32Array(8 * rows);
  buildFlowRows(obs, rows, rowsIn, a, rowData, blur);
  return { a, rowData, blur };
}

describe('the row table', () => {
  it('runs from the axis through the edge to the flow’s outer angle, uniform in s on each side', () => {
    for (const obs of [
      { frame: 'static', r: 5000 },
      { frame: 'static', r: 1000 },
      { frame: 'static', r: 100 },
      { frame: 'static', r: 20 },
      { frame: 'static', r: 2.02 },
      { frame: 'rain', r: 2.5 },
      { frame: 'rain', r: 1 },
    ] as LensObserver[]) {
      const { a, blur } = build(obs);
      const n = a.rows;
      const g = (j: number) => blur[4 * j];
      expect(a.edge).toBeCloseTo(edgeAngle(obs), 12);
      expect(a.span).toBeCloseTo(spanAngle(obs), 12);
      // row 0 looks at the hole (α = 0); the last inside row and the first outside row sit either side of the edge
      expect(g(0)).toBeCloseTo(-a.edge, 6);
      expect(g(a.rowsIn - 1)).toBeLessThan(0);
      expect(-g(a.rowsIn - 1)).toBeLessThan(1.01e-6 * Math.max(1, a.edge));
      expect(g(a.rowsIn)).toBeGreaterThan(0);
      expect(g(a.rowsIn)).toBeCloseTo(1e-6 * a.span, 12);
      // the last row at the outer angle
      expect(g(n - 1)).toBeCloseTo(a.gOut, 5);
      for (let j = 1; j < n; j++) expect(g(j)).toBeGreaterThan(g(j - 1));
      // every row's width in look angle is positive and they add up to the angle the rows span
      let w = 0;
      for (let j = 0; j < n; j++) {
        expect(blur[4 * j + 3]).toBeGreaterThan(0);
        if (j > 0 && j < n - 1) w += blur[4 * j + 3];
      }
      expect(w).toBeCloseTo(0.5 * (g(n - 1) + g(n - 2)) - 0.5 * (g(0) + g(1)), 5);
    }
  });

  it('ends at the ray that grazes 400 M from a camera beyond it, and at straight out from within it', () => {
    const far = build({ frame: 'static', r: 5000 }).a;
    const bOut = FLOW_OUTER_M / Math.sqrt(1 - 2 / FLOW_OUTER_M);
    expect(far.gOut + far.edge).toBeCloseTo(Math.asin((bOut * Math.sqrt(1 - 2 / 5000)) / 5000), 12);
    expect(build({ frame: 'static', r: 100 }).a.gOut).toBeCloseTo(spanAngle({ frame: 'static', r: 100 }), 12);
    expect(build({ frame: 'rain', r: 1 }).a.gOut).toBeCloseTo(spanAngle({ frame: 'rain', r: 1 }), 12);
  });

  it('is read back at every row by the lookup’s own row function', () => {
    for (const obs of [
      { frame: 'static', r: 5000 },
      { frame: 'static', r: 20 },
      { frame: 'rain', r: 1 },
    ] as LensObserver[]) {
      const { a, blur } = build(obs);
      for (let j = 0; j < a.rows; j++) expect(flowMapRowOf(blur[4 * j], a)).toBeCloseTo(j, 3);
      // beyond either end, clamped to its own side of the edge
      expect(flowMapRowOf(-1e-12, a)).toBe(a.rowsIn - 1);
      expect(flowMapRowOf(1e-12, a)).toBe(a.rowsIn);
      expect(flowMapRowOf(10, a)).toBe(a.rows - 1);
    }
  });

  it('leaves dark the raindrop’s rays inside the horizon that bring no light from outside', () => {
    const { a, rowData, blur } = build({ frame: 'rain', r: 1 });
    const v = Math.sqrt(2);
    // look angles with 1 − v cos α ≤ 0 (within 45° of the hole at r = 1) are dark: b = −1
    for (let j = 0; j < a.rows; j++) {
      const alpha = a.edge + blur[4 * j];
      if (1 - v * Math.cos(alpha) <= 0) expect(rowData[4 * j]).toBe(-1);
      else expect(rowData[4 * j]).toBeGreaterThanOrEqual(0);
    }
    expect(rowData[0]).toBe(-1);
  });

  it('blurs to the EHT’s resolution only the 1.3 mm view: never the visible one, nor its meter, whatever the box says', () => {
    expect(flowBlurOn({ blur: true, band: 'mm' })).toBe(true);
    expect(flowBlurOn({ blur: true, band: 'visible' })).toBe(false);
    expect(flowBlurOn({ blur: false, band: 'mm' })).toBe(false);
    expect(flowBlurOn({ blur: false, band: 'visible' })).toBe(false);
  });

  it('gives the EHT blur its widths: 3.90 M FWHM of impact parameter, carried into the view', () => {
    expect(EHT_BEAM_SIGMA_M * 2 * Math.sqrt(2 * Math.log(2))).toBeCloseTo(3.903, 2);
    const r = 5000;
    const { a, blur } = build({ frame: 'static', r });
    // far away b ≈ r α: σ_α ≈ σ_b/r, σ_ω = σ_b/b
    const j = a.rowsIn + 100;
    const alpha = a.edge + blur[4 * j];
    const b = (r * Math.sin(alpha)) / Math.sqrt(1 - 2 / r);
    expect(blur[4 * j + 1]).toBeCloseTo(EHT_BEAM_SIGMA_M / ((r * Math.cos(alpha)) / Math.sqrt(1 - 2 / r)), 9);
    expect(blur[4 * j + 2]).toBeCloseTo(EHT_BEAM_SIGMA_M / b, 6);
    // near α = π/2 a hovering camera's b turns: σ_α is held at 0.5 rad
    const near = build({ frame: 'static', r: 20 });
    let held = false;
    for (let k = 0; k < near.a.rows; k++) if (near.blur[4 * k + 1] === 0.5) held = true;
    expect(held).toBe(true);
  });
});

describe('the handover from the point to the picture', () => {
  it('sums psf.glsl’s law: √ of the flux at the peak below the cap, then the peak held at 24 and the core widened', () => {
    // A faint point: peak uStarGain √f, σ 0.62 f^0.1 CSS px (at least 0.5); the shader's 2^(−1.3287712 m) for 10^(−0.4 m)
    const f = 10 ** (-0.4 * 3);
    expect(pointDrawnLight(3, 1.6, 0, 2) / (1.6 * Math.sqrt(f) * 2 * Math.PI * (2 * Math.max(0.5, 0.62 * f ** 0.1)) ** 2)).toBeCloseTo(1, 6);
    // A blazing one (the flow's point, V −11 from 4,000 au): peak 24, its core 1.6 times as wide (0.62 f^0.1 × 1.6 CSS px)
    const fb = 10 ** 4.4;
    expect(pointDrawnLight(-11, 1.6, 0, 2) / (24 * 2 * Math.PI * (2 * 0.62 * fb ** 0.1 * 1.6) ** 2)).toBeCloseTo(1, 6);
    // as the screen shows it: its core saturated, the light beyond display white counted logarithmically
    expect(pointDrawnLight(-11, 1.6, 0, 2, true) / pointDrawnLight(-11, 1.6, 0, 2)).toBeCloseTo((1 + Math.log(24)) / 24, 9);
    // a point under white shows all its light
    expect(pointDrawnLight(3, 1.6, 0, 2, true)).toBe(pointDrawnLight(3, 1.6, 0, 2));
  });

  it('keeps the drawn light continuous across the crossfade and gives the sky’s own law from a ring of 30 px', () => {
    const pPoint = 10_000;
    for (const ratio of [1, 18, 146, 1e4]) {
      const pPicture = ratio * pPoint;
      // across the crossfade (1.5–3 px) h is 0: the picture's drawn light is the point's, whatever its share
      for (const share of [1, 0.7, 0.3, 0]) {
        const total = share * pPoint + (1 - share) * flowHandoverGain(pPoint, pPicture, 2.5) * pPicture;
        expect(total / pPoint, `×${ratio}, share ${share}`).toBeCloseTo(1, 12);
      }
      // then it rises smoothly to the sky's law, never above it
      let last = 0;
      for (let ring = 3; ring <= 40; ring += 0.5) {
        const k = flowHandoverGain(pPoint, pPicture, ring);
        expect(k).toBeLessThanOrEqual(1);
        expect(k).toBeGreaterThanOrEqual(last);
        last = k;
      }
      expect(flowHandoverGain(pPoint, pPicture, FLOW_HANDOVER_END_PX)).toBe(1);
    }
    // a picture fainter than its point is left as it is; one not yet read waits for its reading, until the handover's end
    expect(flowHandoverGain(1, 0.5, 3)).toBe(1);
    expect(flowHandoverGain(1, 0, 3)).toBe(0);
    expect(flowHandoverGain(1, Infinity, 10)).toBe(0);
    expect(flowHandoverGain(1, 0, FLOW_HANDOVER_END_PX)).toBe(1);
  });

  it('measures the ring as the point’s share does, resolved in a fall', () => {
    // 1.5 px at about 4,900 M on a 1,415-px-per-radian screen
    const r = 5.33 * 1415 / 1.5;
    expect(flowRingPx({ frame: 'static', r }, 1415)).toBeCloseTo(1.5, 2);
    expect(flowRingPx({ frame: 'rain', r: 2.5 }, 1415)).toBe(Infinity);
  });
});

describe('the display', () => {
  it('as a surface of the Sun’s calibration: μ_V −5.40 is radiance 0.066', () => {
    // the map's unit is one V = 0 star per square arcsecond: μ_V −5.40 is 10^(0.4 × 5.40) of it
    expect(10 ** (0.4 * 5.4) * FLOW_SURFACE_GAIN).toBeGreaterThan(0.065);
    expect(10 ** (0.4 * 5.4) * FLOW_SURFACE_GAIN).toBeLessThan(0.069);
    // the Sun's own disc (V −26.74 from 1 au over its solid angle) is 8
    const sunPerArcsec2 = 10 ** (0.4 * 26.74) / (Math.PI * (695700 / 149597870.7) ** 2 * (180 / Math.PI) ** 2 * 3600 ** 2);
    expect(sunPerArcsec2 * FLOW_SURFACE_GAIN).toBeCloseTo(8, 9);
  });

  it('stops the view down for the flow’s glare, only while it is drawn and never brighter', () => {
    flowGlare.share = 0;
    expect(flowExposureTarget()).toBe(0);
    flowGlare.share = 1;
    flowGlare.lnMean = -Infinity;
    expect(flowExposureTarget()).toBe(0); // before the first reading
    flowGlare.lnMean = Math.log(0.5);
    flowGlare.lnToF = Math.log(1.33e5);
    flowGlare.lnGain = Math.log(1.6);
    // the mean display at no exposure, 1.6 √(1.33e5) × 0.5 ≈ 292, brought to FLOW_EXPOSURE_MEAN
    const e = flowExposureTarget();
    expect(1.6 * Math.sqrt(1.33e5 * Math.exp(e)) * 0.5).toBeCloseTo(FLOW_EXPOSURE_MEAN, 9);
    flowGlare.share = 0.5;
    expect(flowExposureTarget()).toBeCloseTo(0.5 * e, 12);
    // a faint flow (a ring a few pixels across in a dark view) never brightens the view
    flowGlare.share = 1;
    flowGlare.lnMean = -12;
    expect(flowExposureTarget()).toBe(0);
    flowGlare.share = 0;
    flowGlare.lnMean = -Infinity;
  });

  it('has the chunk’s uniforms off until the flow is drawn, and its passes in the background list', () => {
    expect(flowUniforms.uFlowOn.value).toBe(0);
    expect(FLOW_LATER.length).toBe(3);
    for (const [make, drawn] of FLOW_LATER) {
      expect(drawn).toBe('quad');
      const m = make();
      expect(m.fragmentShader.length).toBeGreaterThan(100);
      m.dispose();
    }
    // the false colour runs from black to white
    const fc = flowUniforms.uFlowFalseColour.value as unknown as { image: { data: Uint8Array; width: number } };
    const d = fc.image.data;
    expect([d[0], d[1], d[2]]).toEqual([0, 0, 0]);
    const last = 4 * (fc.image.width - 1);
    expect([d[last], d[last + 1], d[last + 2]]).toEqual([255, 255, 255]);
  });
});
