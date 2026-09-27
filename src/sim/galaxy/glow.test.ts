/**
 * The Galaxy model's light near the camera: the glow's laws hold the light the particles hold, its
 * integration along a line of sight is exact enough, and seen from the Sun the model it completes
 * is about as bright as the sky map it takes over from (docs/data/galaxy.md).
 */
import { describe, expect, it } from 'vitest';
import { gunzipFile, loadStars } from '../../test/stars';
import { readJson } from '../../test/files';
import { apply, ECL_TO_GAL, GAL_TO_G_ROT, galToG, ICRS_TO_GAL, unitFromAngles, anglesFromVector, type Vec3 } from './frames';
import { galaxyModel } from './arms';
import { particleBuffers } from './particles';
import { GALAXY_MODEL_JSON } from './galaxyData';
import { erf } from './model';
import { discSigma, glowDisc, GLOW_DISC_RANGE_KPC, GLOW_YOUNG_RANGE_KPC, nearGlow, particleShare, populationColour, populationLuminosity, THICK_DISC, THIN_DISC, YOUNG_ARM_STARS, youngHz, youngSurfaceMap, type GlowSetup } from './glow';

const json = GALAXY_MODEL_JSON;
const model = galaxyModel();
const particles = particleBuffers(gunzipFile('public/data/galaxy-particles.bin.gz'));
const L = populationLuminosity(particles.attrs, particles.count);
const RES = 256;
const EXT = 20;
const youngMap = youngSurfaceMap(json, L[YOUNG_ARM_STARS], RES, EXT, model);
const texelPc2 = ((2 * EXT * 1000) / RES) ** 2;

/** The young map bilinearly, as the GPU samples it. */
function young(x: number, y: number): number {
  const fi = ((x + EXT) / (2 * EXT)) * RES - 0.5;
  const fj = ((y + EXT) / (2 * EXT)) * RES - 0.5;
  const i = Math.floor(fi);
  const j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= RES - 1 || j >= RES - 1) return 0;
  const a = fi - i;
  const b = fj - j;
  const m = youngMap;
  return (1 - a) * (1 - b) * m[j * RES + i] + a * (1 - b) * m[j * RES + i + 1] + (1 - a) * b * m[(j + 1) * RES + i] + a * b * m[(j + 1) * RES + i + 1];
}

const setup: GlowSetup = {
  thin: glowDisc(json, 'thinDisc', L[THIN_DISC]),
  thick: glowDisc(json, 'thickDisc', L[THICK_DISC]),
  youngHz: youngHz(json),
  young,
  dust: model.dustMidplane,
};
const SUN_G = galToG([0, 0, 0]);
/** Everything as glow, out to 40 kpc. */
const ALL: Pick<GlowSetup, 'discRange' | 'youngRange'> = { discRange: [30, 40], youngRange: [30, 40] };
const noDust: GlowSetup['dust'] = (x, y) => ({ ...model.dustMidplane(x, y), discAV: 0, armAV: 0 });
const total = (g: { thin: number; young: number; thick: number }) => g.thin + g.young + g.thick;
/** A column S (L☉/pc²) along a line of sight as a surface brightness, mag/arcsec² (M☉,V = 4.83). */
const mu = (S: number) => 4.83 + 21.572 - 2.5 * Math.log10(S);
const dirG = (l: number, b: number): Vec3 => apply(GAL_TO_G_ROT, unitFromAngles(l, b));

describe('the glow’s laws', () => {
  it('hold the light the particles hold: each disc, and the young arm stars along the arms', () => {
    for (const [d, pop] of [
      [setup.thin, THIN_DISC],
      [setup.thick, THICK_DISC],
    ] as const) {
      let sum = 0;
      const dR = 0.01;
      for (let R = dR / 2; R < d.Rmax; R += dR) sum += discSigma(d, R) * 2 * Math.PI * R * dR * 1e6;
      expect(Math.abs(sum / L[pop] - 1)).toBeLessThan(1e-3);
    }
    let sum = 0;
    for (const v of youngMap) sum += v * texelPc2;
    expect(Math.abs(sum / L[YOUNG_ARM_STARS] - 1)).toBeLessThan(0.01);
  });

  it('match the particles about the Sun: the discs within 10%, the young stars (in clumps of 8) within 25%', () => {
    const near = new Float64Array(16);
    const Rc = 1.5;
    for (let i = 0; i < particles.count; i++) {
      const x = particles.position[3 * i] * particles.kpcPerUnit;
      const y = particles.position[3 * i + 1] * particles.kpcPerUnit;
      if (Math.hypot(x, y) < Rc) near[particles.attrs[4 * i]] += 2 ** (particles.attrs[4 * i + 1] / 8);
    }
    const area = Math.PI * (Rc * 1000) ** 2;
    const R0 = Math.hypot(SUN_G[0], SUN_G[1]);
    expect(Math.abs(near[THIN_DISC] / area / discSigma(setup.thin, R0) - 1)).toBeLessThan(0.1);
    // The map's mean over the same circle.
    let s = 0;
    let n = 0;
    for (let x = -Rc; x <= Rc; x += 0.05)
      for (let y = -Rc; y <= Rc; y += 0.05)
        if (Math.hypot(x, y) < Rc) {
          s += young(SUN_G[0] + x, SUN_G[1] + y);
          n++;
        }
    expect(Math.abs(near[YOUNG_ARM_STARS] / area / (s / n) - 1)).toBeLessThan(0.25);
  });

  it('colour the young arm stars blue-white and the discs yellow, as their particles', () => {
    const thin = populationColour(json, 'thinDisc');
    const youngC = populationColour(json, 'youngArmStars');
    expect(thin.temperatureK).toBeGreaterThan(4500);
    expect(thin.temperatureK).toBeLessThan(5500);
    expect(youngC.temperatureK).toBeGreaterThan(10000);
    expect(thin.rgb[0]).toBeGreaterThan(thin.rgb[2]);
    expect(youngC.rgb[2]).toBeGreaterThan(youngC.rgb[0]);
    for (const c of [thin, youngC]) expect(0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2]).toBeCloseTo(1, 9);
  });
});

describe('the glow along a line of sight', () => {
  it('without dust, straight up and down from the Sun, is the discs’ exponential layers', () => {
    const zw = model.dustMidplane(SUN_G[0], SUN_G[1]).warp;
    const R0 = Math.hypot(SUN_G[0], SUN_G[1]);
    for (const [b, sign] of [
      [90, 1],
      [-90, -1],
    ] as const) {
      const g = nearGlow(SUN_G, dirG(0, b), { ...setup, ...ALL, dust: noDust });
      for (const [d, got] of [
        [setup.thin, g.thin],
        [setup.thick, g.thick],
      ] as const) {
        const z0 = (SUN_G[2] - zw) * sign;
        // Σ/2 of the layer is above the midplane; the Sun is z0 above it.
        const want = sign > 0 ? (discSigma(d, R0) / 2) * Math.exp(-z0 / d.hz) : (discSigma(d, R0) / 2) * (2 - Math.exp(z0 / d.hz));
        expect(Math.abs(got / want - 1)).toBeLessThan(0.01);
      }
    }
  });

  it('through the dust, in 32 steps, agrees with a fine integration to 5%', () => {
    // The reference: 1-pc steps, the dust point by point, the populations' laws point by point.
    const reference = (cam: Vec3, u: Vec3, end: number) => {
      const ds = 0.001;
      let tau = 0;
      let S = 0;
      for (let s = ds / 2; s < end; s += ds) {
        const p: Vec3 = [cam[0] + u[0] * s, cam[1] + u[1] * s, cam[2] + u[2] * s];
        const R = Math.hypot(p[0], p[1]);
        const zw = model.dustMidplane(p[0], p[1]).warp;
        const z = Math.abs(p[2] - zw);
        const a = 0.921034 * model.dustAV(p) * ds;
        const seen = Math.exp(-tau - a / 2);
        const wD = 1 - particleShare(s, GLOW_DISC_RANGE_KPC);
        const wY = 1 - particleShare(s, GLOW_YOUNG_RANGE_KPC);
        const j =
          wD * ((discSigma(setup.thin, R) / (2 * setup.thin.hz)) * Math.exp(-z / setup.thin.hz) + (discSigma(setup.thick, R) / (2 * setup.thick.hz)) * Math.exp(-z / setup.thick.hz)) +
          wY * ((young(p[0], p[1]) / (2 * setup.youngHz)) * Math.exp(-z / setup.youngHz));
        S += j * seen * ds;
        tau += a;
      }
      return S;
    };
    const above = galToG([0, 0, 1]);
    for (const [cam, l, b] of [
      [SUN_G, 0, 0],
      [SUN_G, 90, 0],
      [SUN_G, 180, 0],
      [SUN_G, 20, 5],
      [SUN_G, 0, 30],
      [SUN_G, 0, -90],
      [above, 0, -90],
      [above, 30, -30],
    ] as const) {
      const u = dirG(l, b);
      const got = total(nearGlow(cam, u, setup));
      const want = reference(cam, u, GLOW_DISC_RANGE_KPC[1]);
      expect(Math.abs(got / want - 1), `${l}, ${b}`).toBeLessThan(0.05);
    }
  });
});

describe('the handover from the sky map to the model', () => {
  // The sky map's calibration: V surface brightness in caps of 2° radius (scripts/build-milkyway-bg.py).
  const samples = readJson<{ calibration: { samples: Record<string, { muV: number }> } }>('public/textures/milkyway-bg.json').calibration.samples;
  const CAPS: Record<string, [number, number]> = {
    northGalacticPole: [192.85948, 27.12825],
    southGalacticPole: [12.85948, -27.12825],
    galacticCentre: [266.405, -28.936],
    scutumStarCloud: [280.0, -8.0],
    galacticAnticentre: [86.405, 28.936],
  };
  const D = Math.PI / 180;
  const capDirs = (ra: number, dec: number): Vec3[] => {
    const icrs = unitFromAngles(ra, dec);
    const gal = apply(ICRS_TO_GAL, icrs);
    const { lon, lat } = anglesFromVector(gal);
    const out: Vec3[] = [unitFromAngles(lon, lat)];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      out.push(unitFromAngles(lon + (1.3 * Math.cos(a)) / Math.cos(lat * D), lat + 1.3 * Math.sin(a)));
    }
    return out;
  };
  /** The model seen from the Sun as the renderer draws it (the glow, and the particles' expectation), mag/arcsec². */
  function modelFromSun(dirs: Vec3[]): number {
    let glow = 0;
    for (const u of dirs) glow += total(nearGlow(SUN_G, apply(GAL_TO_G_ROT, u), setup));
    glow /= dirs.length;
    let parts = 0;
    const k = particles.kpcPerUnit;
    for (let i = 0; i < particles.count; i++) {
      const pop = particles.attrs[4 * i];
      const p: Vec3 = [particles.position[3 * i] * k, particles.position[3 * i + 1] * k, particles.position[3 * i + 2] * k];
      const d = Math.hypot(p[0], p[1], p[2]);
      const h = 2 ** (particles.attrs[4 * i + 2] / 16) / 1000;
      const w = pop === THIN_DISC || pop === THICK_DISC ? particleShare(d, GLOW_DISC_RANGE_KPC) : pop === YOUNG_ARM_STARS ? particleShare(d, GLOW_YOUNG_RANGE_KPC) : 1;
      if (w <= 0 || d <= h) continue;
      let s = 0;
      for (const u of dirs) {
        const c = (u[0] * p[0] + u[1] * p[1] + u[2] * p[2]) / d;
        const e = (d * d * Math.max(0, 1 - c * c)) / (2 * h * h);
        if (e > 30) continue;
        // The ray integral of the splat's Gaussian (per pc²).
        s += (1 / (2 * Math.PI * (h * 1000) ** 2)) * Math.exp(-e) * 0.5 * (1 + erf((d * c) / (Math.SQRT2 * h)));
      }
      if (s === 0) continue;
      const T = Math.exp(-0.921034 * model.columnAV(SUN_G, galToG(p), 16));
      parts += (w * 2 ** (particles.attrs[4 * i + 1] / 8) * s * T) / dirs.length;
    }
    return mu(glow + parts);
  }
  /** The catalogue's stars (V ≤ 10) in a cap of 2°, mag/arcsec²: the sky map leaves out stars brighter than about V = 11. */
  function starsInCap(ra: number, dec: number): number {
    const stars = loadStars();
    const icrs = unitFromAngles(ra, dec);
    const gal = apply(ICRS_TO_GAL, icrs);
    const cosR = Math.cos(2 * D);
    let f = 0;
    for (let i = 0; i < stars.count; i++) {
      const x = stars.positions[3 * i];
      const y = stars.positions[3 * i + 1];
      const z = stars.positions[3 * i + 2];
      const r = Math.hypot(x, y, z);
      if (!(r > 0)) continue;
      const g = apply(ECL_TO_GAL, [x / r, y / r, z / r]);
      if (g[0] * gal[0] + g[1] * gal[1] + g[2] * gal[2] < cosR) continue;
      f += 10 ** (-0.4 * (stars.absMag[i] + 5 * Math.log10(r / 10)));
    }
    const arcsec2 = 2 * Math.PI * (1 - cosR) * (180 / Math.PI) ** 2 * 3600 ** 2;
    return -2.5 * Math.log10(f / arcsec2);
  }
  const sum = (a: number, b: number) => -2.5 * Math.log10(10 ** (-0.4 * a) + 10 ** (-0.4 * b));

  it('is within half a magnitude of the real sky towards the anticentre and the galactic poles, and at most 1.6 fainter towards the inner Galaxy', () => {
    const got: Record<string, number> = {};
    for (const [name, [ra, dec]] of Object.entries(CAPS)) {
      const sky = sum(samples[name].muV, starsInCap(ra, dec));
      got[name] = modelFromSun(capDirs(ra, dec)) - sky;
    }
    // The model is smooth: its dust has no windows like those of the star clouds of Sagittarius
    // and Scutum, whose light the sky map shows (docs/data/galaxy.md, known limitations).
    for (const name of ['galacticAnticentre', 'northGalacticPole', 'southGalacticPole']) expect(Math.abs(got[name]), name).toBeLessThan(0.5);
    for (const name of ['galacticCentre', 'scutumStarCloud']) {
      expect(got[name], name).toBeGreaterThan(0);
      expect(got[name], name).toBeLessThan(1.6);
    }
  }, 60_000);
});
