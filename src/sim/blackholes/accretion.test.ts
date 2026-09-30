/**
 * Sagittarius A*'s accretion flow as a point (sim/blackholes/accretion.ts) against its model's numbers
 * (sgraFlow.json, written by scripts/sgra-flow/flow_tables.py from the fitted model A; docs/data/blackholes.md §7):
 * seen from 4,000 au at 30° from its axis it is V −11.0 ± 0.1 (17.15 at 8,277 pc); its brightness against viewing
 * angle follows the traced table, symmetric about the flow's mid-plane; its colour is the power law's (a white a
 * little bluer than the Sun's, like a 7,900 K star: B − V = +0.24), the same at any shift; it fades out as its ring
 * grows from 1.5 to 3 device px; it brightens as g^1.5 for an observer hovering deep in the hole's well; no other hole
 * has one; with the flow off, or with the lens off once it is resolved, it is gone; and it costs about a microsecond
 * and allocates nothing (it is asked for every black hole every frame).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { blackbodyRgb } from '../../physics/blackbody';
import { AU_KM, PARSEC_KM } from '../../physics/constants';
import { cpuMs } from '../../test/timing';
import { useUI } from '../../state/ui';
import { updateEphemeris } from '../ephemeris';
import { registerGalaxyCore } from '../galaxy/load';
import { setSimTime, sim } from '../sim';
import {
  FLOW_HOLE,
  FLOW_RING_M,
  FLOW_V_RGB,
  flowAxisWorld,
  flowMag8277,
  flowPixelScale,
  flowPoint,
  flowPointShare,
  flowView,
  SGRA_FLOW,
  type FlowPoint,
} from './accretion';

const T0 = Date.UTC(2026, 8, 29, 0, 0, 0);
const fp: FlowPoint = { magnitude: 0, spectralIndex: 0, rgb: [0, 0, 0], pointShare: 0 };
const PX_PER_RAD = 1415;

/** Put the camera `km` from Sgr A* at angle `deg` from the flow's axis (in the plane of the axis and world x or y). */
function placeCamera(km: number, deg: number): void {
  const b = sim.bodies[FLOW_HOLE];
  b.apparentPos.copy(b.pos);
  const a = flowAxisWorld;
  // a unit vector across the axis
  const cx = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const d = cx[0] * a[0] + cx[1] * a[1] + cx[2] * a[2];
  let px = cx[0] - d * a[0];
  let py = cx[1] - d * a[1];
  let pz = cx[2] - d * a[2];
  const pl = Math.hypot(px, py, pz);
  px /= pl;
  py /= pl;
  pz /= pl;
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  sim.camera.pos.set(b.pos.x + km * (c * a[0] + s * px), b.pos.y + km * (c * a[1] + s * py), b.pos.z + km * (c * a[2] + s * pz));
}

beforeAll(() => {
  registerGalaxyCore();
  setSimTime(T0);
  updateEphemeris();
  flowPixelScale.devicePxPerRad = PX_PER_RAD;
  useUI.setState({ accretionFlow: true, lensing: true });
});

describe('the flow seen as a point', () => {
  it('is V −11.0 ± 0.1 from 4,000 au at 30° from its axis', () => {
    const km = 4000 * AU_KM;
    placeCamera(km, 30);
    flowPoint(FLOW_HOLE, fp);
    expect(fp.magnitude).toBeGreaterThan(-11.1);
    expect(fp.magnitude).toBeLessThan(-10.9);
    // by the model's own numbers: 17.15 at 8,277 pc, 5 log10 of the distance, the hovering observer's g^1.5
    const expected = flowMag8277(30) + 5 * Math.log10(km / PARSEC_KM / 8277) - 2.5 * 1.5 * (-0.5 * Math.log1p(-2 / (km / (4.297e6 * 1.4766250385)))) / Math.LN10;
    expect(Math.abs(fp.magnitude - expected)).toBeLessThan(2e-4);
    expect(fp.pointShare).toBe(1);
    expect(fp.spectralIndex).toBe(-0.5);
  });

  it('follows the traced brightness against viewing angle, the same above and below the mid-plane', () => {
    const t = SGRA_FLOW.byAngle;
    expect(t.deg.length).toBe(37);
    // the fitted model is 17.15 at 30° (and within the table's resolution of the fit's own 200² image)
    expect(Math.abs(flowMag8277(30) - SGRA_FLOW.fit.vMag8277)).toBeLessThan(0.02);
    for (let k = 0; k < t.deg.length; k++) {
      expect(Math.abs(flowMag8277(t.deg[k]) + 2.5 * Math.log10(t.vJy[k] / 3636))).toBeLessThan(1e-9);
      expect(t.vJy[k]).toBeCloseTo(t.vJy[t.deg.length - 1 - k], 12);
    }
    // between the rows: between their magnitudes (log flux interpolated)
    const m1 = flowMag8277(60);
    const m2 = flowMag8277(65);
    const mid = flowMag8277(62.5);
    expect(mid).toBeLessThanOrEqual(Math.max(m1, m2) + 1e-12);
    expect(mid).toBeGreaterThanOrEqual(Math.min(m1, m2) - 1e-12);
    // seen edge-on it is brighter than face-on (more gas comes towards the camera)
    expect(flowMag8277(90)).toBeLessThan(flowMag8277(0));
    // the mirror check of the tracer: 150° traced both ways
    expect(Math.abs(SGRA_FLOW.byAngle.mirror.vRatio - 1)).toBeLessThan(1e-9);
  });

  it('has the power law’s colour: a white a little bluer than the Sun’s, near a 7,900 K star’s', () => {
    const lum = 0.2126 * FLOW_V_RGB[0] + 0.7152 * FLOW_V_RGB[1] + 0.0722 * FLOW_V_RGB[2];
    expect(lum).toBeCloseTo(1, 12);
    const sun = blackbodyRgb(5772);
    expect(FLOW_V_RGB[2] / FLOW_V_RGB[0]).toBeGreaterThan(sun[2] / sun[0]);
    const star = blackbodyRgb(7900);
    for (let c = 0; c < 3; c++) expect(Math.abs(FLOW_V_RGB[c] - star[c])).toBeLessThan(0.08);
    placeCamera(1e12, 80);
    flowPoint(FLOW_HOLE, fp);
    expect(fp.rgb).toEqual([...FLOW_V_RGB]);
  });

  it('fades out as its ring grows from 1.5 to 3 device px', () => {
    // the ring's look angle for a hovering observer: sin α = b √(1 − 2/r)/r
    const rAt = (px: number) => {
      // solve α(r) = px / PX_PER_RAD for r (far away α ≈ b/r)
      let lo = 10;
      let hi = 1e7;
      for (let k = 0; k < 200; k++) {
        const mid = Math.sqrt(lo * hi);
        const a = Math.asin((FLOW_RING_M * Math.sqrt(1 - 2 / mid)) / mid) * PX_PER_RAD;
        if (a > px) lo = mid;
        else hi = mid;
      }
      return Math.sqrt(lo * hi);
    };
    expect(flowPointShare(rAt(1.4), PX_PER_RAD)).toBe(1);
    expect(flowPointShare(rAt(3.1), PX_PER_RAD)).toBe(0);
    expect(flowPointShare(rAt(2.25), PX_PER_RAD)).toBeCloseTo(0.5, 6);
    // about 5,300 M (225 au) and 2,600 M (112 au) from Sgr A* on the measuring canvas (docs/data/blackholes.md §7)
    expect(rAt(1.5)).toBeGreaterThan(5000);
    expect(rAt(1.5)).toBeLessThan(5400);
    expect(rAt(3)).toBeGreaterThan(2400);
    expect(rAt(3)).toBeLessThan(2700);
    // inside the ring (a camera deep in the well) it is fully resolved
    expect(flowPointShare(4, PX_PER_RAD)).toBe(0);
    expect(flowPointShare(1.5, PX_PER_RAD)).toBe(0);
  });

  it('brightens as g^1.5 for a hovering observer deep in the well', () => {
    const b = sim.bodies[FLOW_HOLE];
    const mKm = 4.297e6 * 1.4766250385;
    placeCamera(20 * mKm, 30);
    flowView();
    flowPoint(FLOW_HOLE, fp);
    const lnG = -0.5 * Math.log1p(-2 / 20);
    const flat = flowMag8277(30) + 5 * Math.log10((20 * mKm) / PARSEC_KM / 8277);
    expect(fp.magnitude - flat).toBeCloseTo(-2.5 * 1.5 * (lnG / Math.LN10), 3);
    void b;
  });

  it('is nothing for other holes, with the flow off, or with the lens off once resolved', () => {
    placeCamera(4000 * AU_KM, 30);
    flowPoint('gaia-bh1', fp);
    expect(fp.magnitude).toBe(99);
    expect(fp.pointShare).toBe(1);
    useUI.setState({ accretionFlow: false });
    flowPoint(FLOW_HOLE, fp);
    expect(fp.magnitude).toBe(99);
    useUI.setState({ accretionFlow: true, lensing: false });
    flowPoint(FLOW_HOLE, fp);
    expect(fp.magnitude).toBeLessThan(0); // unresolved: the point stays
    placeCamera(50 * AU_KM, 30);
    flowPoint(FLOW_HOLE, fp);
    expect(fp.pointShare).toBe(0);
    expect(fp.magnitude).toBe(99); // resolved with the lens off: drawn straight it would be wrong
    useUI.setState({ lensing: true });
    flowPoint(FLOW_HOLE, fp);
    expect(fp.magnitude).toBeLessThan(-15);
  });

  it('costs about a microsecond and allocates nothing', () => {
    placeCamera(4000 * AU_KM, 30);
    let best = Infinity;
    for (let batch = 0; batch < 8; batch++) {
      const t0 = cpuMs();
      const n = 20000;
      for (let k = 0; k < n; k++) flowPoint(FLOW_HOLE, fp);
      best = Math.min(best, (cpuMs() - t0) / n);
    }
    // the budget: flowPoint ≤ 0.01 ms
    expect(best).toBeLessThan(0.01);
  });
});

describe('the model’s data', () => {
  it('holds model A, its axis and its fitted numbers', () => {
    const m = SGRA_FLOW.model;
    expect(m.n0Cm3).toBeCloseTo(2.613e6, -3);
    expect(m.t0K).toBeCloseTo(1.876e12, -9);
    expect(m.n0NonThermalCm3).toBeCloseTo(4.081e5, -2);
    expect(m.p).toBe(2);
    // the axis: unit, the flares' orbit (GRAVITY 2023), 25.1° from our line of sight, tilted away from us
    const a = flowAxisWorld;
    expect(Math.hypot(a[0], a[1], a[2])).toBeCloseTo(1, 5);
    expect(a[0]).toBeCloseTo(-0.47179, 4);
    expect(a[1]).toBeCloseTo(-0.1189, 4);
    expect(a[2]).toBeCloseTo(0.87366, 4);
    expect(SGRA_FLOW.axis.sunAngleDeg).toBeCloseTo(154.9, 1);
    // the fit: 17.15 at V, B − V +0.24, the ring of radius 5.33 M, 2.54 Jy at 230 GHz
    expect(SGRA_FLOW.fit.vMag8277).toBeCloseTo(17.15, 2);
    expect(SGRA_FLOW.fit.bMinusV).toBeCloseTo(0.24, 2);
    expect(FLOW_RING_M).toBeCloseTo(5.33, 2);
    // the scene sgr-a-star-flow's numbers exist for its note
    const s = SGRA_FLOW.scenes['sgr-a-star-flow'];
    expect(s.rM).toBe(20);
    expect(s.shadowRadiusDeg).toBeCloseTo(14.27, 2);
    expect(s.ringRadiusDeg).toBeGreaterThan(s.shadowRadiusDeg);
  });
});
