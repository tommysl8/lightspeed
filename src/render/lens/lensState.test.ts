/**
 * The lens state (render/lens/lensState.ts): the zones against an independent computation in Python
 * (7.29° for 0.5 px at 4,000 au from Sgr A*, 14.52° at 2,000 au, 28.58° at 1,000 au, 64.97° for
 * 0.05 px at 4,000 au, on a 1,400-px-tall screen of 50°), the outermost-|δ| rule against brute force over the table in
 * both frames, the boxes against a brute-force projection of the displacement map on a 1,936 × 1,384 screen, the
 * aberrated cones against aberrated points, the full box in the raindrop's frame and when |ln g| passes the Doppler
 * skip, the mipmap and glow-target flags, the per-half views at rest, every uniform at the identity with no hole, and
 * the lensed spheres' box against the shader's hit test in float64 over every pixel near Gaia BH1.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Quaternion, Vector2, Vector3 } from 'three';
import { buildForwardTable, forwardEvalGap, type ForwardSample } from '../../physics/schwarzschildTables';
import { aberrateToShipRapidity } from '../../physics/relativity';
import { blackHoleGm, gravity } from '../../sim/gravity';
import { sim } from '../../sim/sim';
import { psfUniforms } from '../materials';
import { bandChord2, boostCone, DIFFUSE_ZONE_PX, forceLensProgramsReady, lens, lensUniforms, setLensView, updateLens, zoneAngle } from './lensState';
import { sphereBoxes } from './lensSphereUniforms';
import { registerUniverse } from '../../test/universe';
import { useUI } from '../../state/ui';
import { updateEphemeris } from '../../sim/ephemeris';
import { getBody } from '../../sim/bodies';
import { C_KM_S } from '../../physics/constants';

const DEG = Math.PI / 180;
/** Sgr A*'s M in km and 1 au in km. */
const SGRA_M_KM = 6_345_058;
const AU_KM = 1.495978707e8;

/** The reference's screen: 1,400 px tall, 50°. */
const F_REF = 700 / Math.tan(25 * DEG);

describe('the zones', () => {
  it('match an independent computation to 0.01°', () => {
    const cases: [number, number, number][] = [
      [4000, 0.5, 7.29],
      [2000, 0.5, 14.52],
      [1000, 0.5, 28.58],
      [4000, 0.05, 64.97],
      [42400, 0.5, 0.69],
      [42400, 0.05, 6.88],
    ];
    for (const [au, px, deg] of cases) {
      const r = (au * AU_KM) / 6.3451e6; // the reference's own M
      const fwd = buildForwardTable({ frame: 'static', r });
      expect(zoneAngle(fwd, px / F_REF) / DEG, `${au} au, ${px} px`).toBeCloseTo(deg, 1);
    }
  });

  it('cover every look angle where |δ| reaches the threshold (brute force over the table), in both frames', () => {
    const fs: ForwardSample = { captured: false, delta: 0, dDelta: 0, sweep: 0, dSweep: 0 };
    const obsList = [
      { frame: 'static' as const, r: 94_308 },
      { frame: 'static' as const, r: 1000 },
      { frame: 'static' as const, r: 20 },
      { frame: 'static' as const, r: 4 },
      { frame: 'rain' as const, r: 2.5 },
      { frame: 'rain' as const, r: 1 },
      { frame: 'rain' as const, r: 0.1 },
    ];
    for (const obs of obsList) {
      const fwd = buildForwardTable(obs);
      for (const px of [0.5, 0.02]) {
        const thr = px / 1484;
        const z = zoneAngle(fwd, thr);
        expect(Number.isNaN(z)).toBe(false);
        for (let k = 1; k < 4000; k++) {
          const a = z + ((Math.PI - z) * k) / 4000;
          forwardEvalGap(fwd, a - fwd.edge, fs);
          expect(Math.abs(fs.delta), `${obs.frame} r ${obs.r}, ${px} px, α ${a}`).toBeLessThan(thr * (1 + 1e-9));
        }
      }
    }
  });
});

describe('aberrated cones', () => {
  it('carry a cone to its image under a boost: every aberrated edge point on the new circle', () => {
    const c = new Vector3(0.2, -0.3, -0.9).normalize();
    const v = new Vector3(0.7, 0.1, -0.2).normalize();
    for (const rho of [1e-4, 0.05, 0.5, 1.5, 2.5]) {
      for (const phi of [0.01, 0.5, 2, 5]) {
        const out = new Vector3();
        const r2 = boostCone(c, rho, v, phi, out);
        // points on the original circle, aberrated one by one
        const e1 = new Vector3(1, 0, 0).addScaledVector(c, -c.x).normalize();
        const e2 = new Vector3().crossVectors(c, e1);
        for (let k = 0; k < 16; k++) {
          const t = (2 * Math.PI * k) / 16;
          const p = c.clone().multiplyScalar(Math.cos(rho)).addScaledVector(e1, Math.sin(rho) * Math.cos(t)).addScaledVector(e2, Math.sin(rho) * Math.sin(t));
          const q = aberrateToShipRapidity(p, v, phi);
          const ang = Math.acos(Math.min(1, Math.max(-1, q.x * out.x + q.y * out.y + q.z * out.z)));
          expect(Math.abs(ang - r2), `ρ ${rho}, φ ${phi}`).toBeLessThan(1e-7);
        }
      }
    }
  });

  it('carry a cone centred exactly on the boost, or exactly opposite it, about the same centre (a fall’s axis)', () => {
    // along an axis the cone's centre and the boost are exactly parallel (the degenerate branch); off it, nearly
    for (const v of [new Vector3(0, 0, -1), new Vector3(0.7, 0.1, -0.2).normalize()]) {
      for (const sign of [1, -1]) {
        const c = v.clone().multiplyScalar(sign);
        for (const rho of [1e-4, 0.2, 1, 2.5]) {
          for (const phi of [0.01, 1, 5]) {
            const out = new Vector3();
            const r2 = boostCone(c, rho, v, phi, out);
            expect(out.distanceTo(c), `centre, sign ${sign}`).toBeLessThan(1e-12);
            const e1 = new Vector3(0, 1, 0).addScaledVector(c, -c.y).normalize();
            const e2 = new Vector3().crossVectors(c, e1);
            for (let k = 0; k < 8; k++) {
              const t = (2 * Math.PI * k) / 8;
              const p = c.clone().multiplyScalar(Math.cos(rho)).addScaledVector(e1, Math.sin(rho) * Math.cos(t)).addScaledVector(e2, Math.sin(rho) * Math.sin(t));
              const q = aberrateToShipRapidity(p, v, phi);
              const ang = Math.acos(Math.min(1, Math.max(-1, q.x * out.x + q.y * out.y + q.z * out.z)));
              expect(Math.abs(ang - r2), `sign ${sign}, ρ ${rho}, φ ${phi}`).toBeLessThan(1e-7);
            }
          }
        }
      }
    }
    // ρ 0.2 about −v at φ 1: a radius of 0.5327 rad (not π − that).
    const z = new Vector3(0, 0, 1);
    expect(boostCone(z.clone().negate(), 0.2, z, 1, new Vector3())).toBeCloseTo(2 * Math.atan(Math.tan(0.1) * Math.E), 12);
  });
});

describe('the band’s annulus as a chord test', () => {
  it('holds exactly the directions within (half-width + 1) pixel angles of the edge circle', () => {
    const out = new Vector2();
    const c = new Vector3(0.3, -0.2, -0.93).normalize();
    const e1 = new Vector3(1, 0, 0).addScaledVector(c, -c.x).normalize();
    const e2 = new Vector3().crossVectors(c, e1);
    for (const [R, px, ppr] of [[0.05146, 3, 2960], [0.2491, 3, 1484], [1.9, 3, 2960], [3.1, 3, 1484], [0.0015, 3, 1484]]) {
      bandChord2(R, px, ppr, out);
      const w = (px + 1) / ppr;
      for (let k = 0; k < 2000; k++) {
        // angles within 3 w of the edge, and some right at its bounds
        const a = Math.max(0, Math.min(Math.PI, R + (k < 1000 ? (k / 1000 - 0.5) * 6 * w : (k % 2 ? 1 : -1) * w * (1 + (k % 7 ? 1e-9 : -1e-9)))));
        const t = k * 2.399;
        const d = c.clone().multiplyScalar(Math.cos(a)).addScaledVector(e1, Math.sin(a) * Math.cos(t)).addScaledVector(e2, Math.sin(a) * Math.sin(t));
        const dc = d.clone().sub(c);
        const c2 = dc.dot(dc);
        const byAngle = Math.abs(a - R) < w;
        const byChord = c2 > out.x && c2 < out.y;
        // bounds agree to the float64 rounding of the chord (a few 1e-16 of it)
        if (Math.abs(Math.abs(a - R) - w) > 1e-12) expect(byChord, `R ${R}, α ${a}`).toBe(byAngle);
      }
    }
    bandChord2(0.3, 0, 1484, out);
    expect([out.x, out.y]).toEqual([0, 0]);
  });
});

// ─── updateLens with a hole set up by hand ────────────────────────────────────────────────────────────

const quat = new Quaternion();

/** Sgr A* at r (units of M) straight ahead of a camera looking along −z; a 1,936 × 1,384 device-px screen. */
function hoverAt(rM: number, frame: 'static' | 'rain' = 'static'): void {
  const mKm = SGRA_M_KM;
  gravity.hole = 'sgr-a-star';
  gravity.mKm = mKm;
  gravity.rsKm = 2 * mKm;
  gravity.gmKm3S2 = 1;
  gravity.rM = rM;
  gravity.rKm = rM * mKm;
  gravity.heightKm = (rM - 2) * mKm;
  gravity.x = 2 / rM;
  gravity.frame = frame;
  gravity.camRelHoleKm.set(0, 0, rM * mKm);
  gravity.lnGStatic = frame === 'rain' ? 0 : -0.5 * Math.log1p(-2 / rM);
  gravity.framePhi = 0;
  gravity.fallView = frame === 'rain' ? { phi: 0.3, dir: new Vector3(0, 0, 1), rainPhi: 0 } : null;
  sim.viewport.width = 968;
  sim.viewport.height = 692;
  sim.camera.fovDeg = 50;
  sim.camera.quat.copy(quat);
  sim.ship.phi = 0;
  sim.ship.vel.set(0, 0, 0);
  psfUniforms.uPixelRatio.value = 2;
}

function noHole(): void {
  gravity.hole = null;
  gravity.x = 0;
  gravity.rM = Infinity;
  gravity.fallView = null;
  gravity.framePhi = 0;
}

beforeEach(() => {
  forceLensProgramsReady(true);
  quat.identity();
});
afterEach(() => {
  noHole();
  updateLens();
  forceLensProgramsReady(null);
});

describe('updateLens', () => {
  it('leaves every uniform at the identity with no hole', () => {
    hoverAt(100);
    updateLens();
    expect(lens.active).toBe(true);
    noHole();
    updateLens();
    const u = lensUniforms;
    expect(lens.active).toBe(false);
    expect(u.uLensOn.value).toBe(0);
    expect(u.uLensBox.value.toArray()).toEqual([0, 0, 0, 0]);
    expect(u.uLensPtCos.value).toBe(1);
    expect(u.uLensDiffCos.value).toBe(1);
    expect(u.uFramePhi.value).toBe(0);
    expect(u.uFrameEPhi.value).toBe(1);
    expect(u.uLensSsBandPx.value).toBe(0);
    expect(u.uLensBandChord2.value.toArray()).toEqual([0, 0]);
    expect(u.uLensEdge.value).toBe(0);
    expect(u.uLensLnG.value).toBe(0);
    setLensView(false);
    expect(u.uLensBox.value.toArray()).toEqual([0, 0, 0, 0]);
  });

  it('is not drawn until the lensed programs have compiled, nor with lensing off', () => {
    forceLensProgramsReady(false);
    hoverAt(94_308);
    updateLens();
    expect(lens.active).toBe(false);
    expect(lensUniforms.uLensOn.value).toBe(0);
    forceLensProgramsReady(true);
    updateLens();
    expect(lens.active).toBe(true);
    expect(lensUniforms.uLensOn.value).toBe(1);
  });

  it("at 4,000 au: a small box round the hole that holds every pixel the lens moves by 0.5 px (brute force over the screen)", () => {
    for (const turn of [0, 3 * DEG, -6 * DEG]) {
      quat.setFromAxisAngle(new Vector3(0.6, 0.8, 0).normalize(), turn);
      hoverAt(94_308);
      updateLens();
      const v = lens.view[0];
      expect(v.full).toBe(false);
      const [x0, y0, x1, y1] = v.box;
      expect(x1 - x0).toBeLessThan(0.6);
      // every device pixel whose look angle from the hole is inside the 0.5-px zone lies in the box
      const W = 1936;
      const H = 1384;
      const tanHalf = Math.tan(25 * DEG);
      const fwd = lens.fwd!;
      const fs: ForwardSample = { captured: false, delta: 0, dDelta: 0, sweep: 0, dSweep: 0 };
      const right = new Vector3(1, 0, 0).applyQuaternion(quat);
      const up = new Vector3(0, 1, 0).applyQuaternion(quat);
      const back = new Vector3(0, 0, 1).applyQuaternion(quat);
      const d = new Vector3();
      let inside = 0;
      for (let j = 0; j < H; j += 2) {
        for (let i = 0; i < W; i += 2) {
          const nx = (2 * (i + 0.5)) / W - 1;
          const ny = 1 - (2 * (j + 0.5)) / H;
          d.copy(right).multiplyScalar(nx * tanHalf * (W / H)).addScaledVector(up, ny * tanHalf).addScaledVector(back, -1).normalize();
          const a = d.angleTo(lens.axis);
          if (a <= fwd.edge) continue;
          forwardEvalGap(fwd, a - fwd.edge, fs);
          if (Math.abs(fs.delta) * lens.pxPerRad < DIFFUSE_ZONE_PX) continue;
          inside++;
          expect(nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1, `pixel (${i}, ${j}) at α ${a}`).toBe(true);
        }
      }
      expect(inside).toBeGreaterThan(1000);
    }
  });

  it('draws the whole screen close in (|ln g| over the Doppler skip) and in the raindrop’s frame', () => {
    hoverAt(1000);
    updateLens();
    expect(Math.abs(lens.lnG)).toBeGreaterThan(1e-4);
    expect(lens.view[0].full).toBe(true);
    expect(lens.view[0].box).toEqual([-1, -1, 1, 1]);
    hoverAt(20, 'rain');
    updateLens();
    expect(lens.view[0].full).toBe(true);
    expect(lens.view[1].full).toBe(true);
    expect(lensUniforms.uLensDiffCos.value).toBe(-1);
    expect(lensUniforms.uLensPtCos.value).toBe(-1);
  });

  it('sets the mipmap flag within 3,000 M and the glow target outside the split view', () => {
    hoverAt(94_308);
    updateLens();
    expect(lens.mipmaps).toBe(false);
    expect(lens.glowSeparate).toBe(true);
    hoverAt(2000);
    updateLens();
    expect(lens.mipmaps).toBe(true);
  });

  it('gives both halves the same view at rest, and a band pass once the shadow is a pixel wide', () => {
    hoverAt(94_308);
    updateLens();
    const [a, b] = lens.view;
    expect(a.box).toEqual(b.box);
    expect(a.edgeRadius).toBe(b.edgeRadius);
    expect(a.zoneCos).toBe(b.zoneCos);
    expect(a.ssBandPx).toBe(0); // the shadow is 0.08 px from 4,000 au
    hoverAt(100);
    updateLens();
    expect(lens.view[0].ssBandPx).toBe(3);
    expect(lens.view[0].edgeRadius).toBeCloseTo(0.05146, 4); // Synge's shadow at 100 M: 2.949°
    // the band's chord bounds follow the half's view
    setLensView(false);
    const w = 4 / lens.pxPerRad;
    const R = lens.view[0].edgeRadius;
    expect(lensUniforms.uLensBandChord2.value.x).toBeCloseTo(4 * Math.sin((R - w) / 2) ** 2, 12);
    expect(lensUniforms.uLensBandChord2.value.y).toBeCloseTo(4 * Math.sin((R + w) / 2) ** 2, 12);
  });

  it('writes the tables again when lensing is turned off and on while hovering (no observer left at infinity)', () => {
    hoverAt(20);
    updateLens();
    expect(lensUniforms.uLensRo.value).toBe(20);
    useUI.setState({ lensing: false });
    try {
      updateLens();
      expect(lens.active).toBe(false);
      expect(lensUniforms.uLensRo.value).toBe(1e30);
      useUI.setState({ lensing: true });
      updateLens();
      expect(lens.active).toBe(true);
      expect(lensUniforms.uLensRo.value).toBe(20);
      expect(lensUniforms.uLensEdge.value).toBeGreaterThan(0);
    } finally {
      useUI.setState({ lensing: true });
    }
  });

  it('scans the zones and the band again when the screen’s scale changes while hovering (a resize, a pixel-ratio step)', () => {
    hoverAt(94_308);
    updateLens();
    const zone = lens.diffuseZone;
    const band = lens.ringBandPx;
    const box = lens.view[0].box.slice();
    const v0 = lens.version;
    // the same tables (nothing moved), on a screen half as tall again: every pixel threshold is a smaller angle
    sim.viewport.height = 692 * 1.5;
    updateLens();
    expect(lens.version).toBeGreaterThan(v0);
    expect(lens.diffuseZone).toBeGreaterThan(zone);
    expect(lens.ringBandPx).toBeCloseTo(band * 1.5, 9);
    const fwd = lens.fwd!;
    expect(lens.diffuseZone).toBeCloseTo(zoneAngle(fwd, DIFFUSE_ZONE_PX / lens.pxPerRad), 12);
    expect(lens.view[0].box).not.toEqual(box);
    // under 1 % of change: left as it was
    const v1 = lens.version;
    sim.viewport.height = 692 * 1.5 * 1.004;
    updateLens();
    expect(lens.version).toBe(v1);
  });

  it('writes the tables into the uniforms: the edge, span, ln g and the forward and inverse axes', () => {
    hoverAt(20);
    updateLens();
    const u = lensUniforms;
    expect(u.uLensOn.value).toBe(1);
    expect(u.uLensEdge.value).toBeCloseTo(14.27 * DEG, 4);
    expect(u.uLensSpan.value).toBeCloseTo(Math.PI - u.uLensEdge.value, 12);
    expect(u.uLensLnG.value).toBeCloseTo(-0.5 * Math.log(0.9), 12);
    expect(u.uLensFwd.value.z).toBe(512);
    expect(u.uLensInv.value.w).toBeCloseTo(2 * lens.thetaE, 12);
    expect(u.uLensAxis.value.z).toBe(-1);
    expect(Math.abs(u.uLensAxis.value.x) + Math.abs(u.uLensAxis.value.y)).toBe(0);
    expect(u.uLensHole.value.z).toBeCloseTo(-20, 9);
    expect(u.uLensFwdTab.value?.image.width).toBe(514);
    expect(u.uLensInvTab.value?.image.height).toBe(2);
    expect(u.uLensB0Z.value?.image.width).toBe(130);
    expect(lens.ringBandPx).toBeGreaterThan(1);
  });
});

// ─── The lensed spheres ────────────────────────────────────────────────────────────────────────────

describe('the lensed spheres', () => {
  it("cover every pixel the companion's images light, with a box far smaller than the lens box (Gaia BH1 from 10⁶ km)", () => {
    registerUniverse();
    updateEphemeris();
    const hole = sim.bodies['gaia-bh1'];
    const star = sim.bodies['gaia-bh1-star'];
    const rec = getBody('gaia-bh1-star');
    expect(hole && star && rec).toBeTruthy();
    star.present = true;
    const mKm = blackHoleGm('gaia-bh1') / (C_KM_S * C_KM_S);
    // 10⁶ km from the hole on the side away from its star, looking at the hole (as go:gaia-bh1 frames it)
    const away = new Vector3().subVectors(hole.pos, star.pos).normalize();
    const rM = 1e6 / mKm;
    gravity.hole = 'gaia-bh1';
    gravity.mKm = mKm;
    gravity.rsKm = 2 * mKm;
    gravity.rM = rM;
    gravity.rKm = 1e6;
    gravity.heightKm = 1e6 - 2 * mKm;
    gravity.x = 2 / rM;
    gravity.frame = 'static';
    gravity.camRelHoleKm.copy(away).multiplyScalar(1e6);
    gravity.lnGStatic = -0.5 * Math.log1p(-2 / rM);
    gravity.framePhi = 0;
    gravity.fallView = null;
    quat.setFromUnitVectors(new Vector3(0, 0, -1), away.clone().negate());
    sim.viewport.width = 968;
    sim.viewport.height = 692;
    sim.camera.fovDeg = 50;
    sim.camera.quat.copy(quat);
    sim.ship.phi = 0;
    sim.ship.vel.set(0, 0, 0);
    psfUniforms.uPixelRatio.value = 2;
    updateLens();
    expect(lens.spheres).toEqual(['gaia-bh1-star']);
    const box = sphereBoxes[0];
    const lensBox = lens.view[0].box;
    expect((box[2] - box[0]) * (box[3] - box[1])).toBeLessThan(0.1 * (lensBox[2] - lensBox[0]) * (lensBox[3] - lensBox[1]));
    // The shader's hit test in float64 (shaders/lensSpheres.frag.glsl) over every device pixel within 200 px of the
    // hole: the straight ray before its closest approach, then the lensed ray's outgoing asymptote.
    const fwd = lens.fwd!;
    const fs: ForwardSample = { captured: false, delta: 0, dDelta: 0, sweep: 0, dSweep: 0 };
    const cam = gravity.camRelHoleKm.clone().divideScalar(mKm);
    const ro = cam.length();
    const rhat = cam.clone().divideScalar(ro);
    const axis = rhat.clone().negate();
    const k = new Vector3().subVectors(star.pos, hole.pos).divideScalar(mKm);
    const r = rec!.physical.radiusKm / mKm;
    const hits = (p: Vector3, u: Vector3): number => {
      const m = p.clone().sub(k);
      const bq = m.dot(u);
      const h2 = m.lengthSq() - bq * bq;
      if (h2 > r * r) return -1;
      const root = Math.sqrt(r * r - h2);
      return -bq - root > 0 ? -bq - root : -bq + root;
    };
    const W = 1936;
    const H = 1384;
    const tanHalf = Math.tan(25 * DEG);
    const right = new Vector3(1, 0, 0).applyQuaternion(quat);
    const up = new Vector3(0, 1, 0).applyQuaternion(quat);
    const back = new Vector3(0, 0, 1).applyQuaternion(quat);
    const d = new Vector3();
    let lit = 0;
    for (let j = H / 2 - 200; j < H / 2 + 200; j++) {
      for (let i = W / 2 - 200; i < W / 2 + 200; i++) {
        const nx = (2 * (i + 0.5)) / W - 1;
        const ny = 1 - (2 * (j + 0.5)) / H;
        d.copy(right).multiplyScalar(nx * tanHalf * (W / H)).addScaledVector(up, ny * tanHalf).addScaledVector(back, -1).normalize();
        const t = hits(cam, d);
        let on = t > 0 && t < -cam.dot(d);
        const alpha = d.angleTo(axis);
        if (!on && alpha > fwd.edge) {
          forwardEvalGap(fwd, alpha - fwd.edge, fs);
          const tv = axis.clone().addScaledVector(d, -axis.dot(d)).normalize();
          const nInf = d.clone().multiplyScalar(Math.cos(fs.delta)).addScaledVector(tv, Math.sin(fs.delta)).normalize();
          const b = ro * Math.exp(gravity.lnGStatic) * Math.sin(alpha);
          const sweep = fs.delta + fwd.span - (alpha - fwd.edge);
          const e = d.clone().addScaledVector(rhat, -d.dot(rhat)).normalize();
          const xPerp = rhat.clone().multiplyScalar(b * Math.sin(sweep)).addScaledVector(e, -b * Math.cos(sweep));
          on = hits(xPerp, nInf) > 0;
        }
        if (!on) continue;
        lit++;
        expect(nx >= box[0] && nx <= box[2] && ny >= box[1] && ny <= box[3], `pixel (${i}, ${j})`).toBe(true);
      }
    }
    expect(lit).toBeGreaterThan(50);
  });
});
