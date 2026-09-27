/**
 * The extragalactic data and their evaluators: the frames, the Local Group file and the named
 * objects (disc orientations included), the cosmic web and its distance modes, the CMB maps, and
 * the numbers named.json derived with its build script's own cosmology, checked against the app's
 * one cosmology module.
 */
import { describe, expect, it } from 'vitest';
import { loadLocalGalaxies, loadNamed, loadWeb, decodePng8 } from '../../test/cosmos';
import { fileSize } from '../../test/files';
import {
  add,
  apply,
  cross,
  dot,
  ECL_TO_GAL,
  eclToWorld,
  GAL_TO_ECL,
  GAL_TO_ICRS,
  GAL_TO_SGAL,
  ICRS_TO_ECL,
  ICRS_TO_GAL,
  mul,
  raDecToEcl,
  scale,
  skyBasis,
  sphToUnit,
  transpose,
  unitToSph,
  type Mat3,
} from './frames';
import { cosmology, dmToMpc, LOCAL_UNIVERSE_MPC, LOCAL_UNIVERSE_Z } from './cosmology';
import { distanceModulus, groupRuns, ksMagnitude, makeDistanceFn, memberRange, METHOD, NO_VELOCITY, webBuffers, webType, worldPositions, zCmb } from './cosmicWeb';
import { discAxes, discAxesEcl, discPoint } from './localGalaxies';
import { CMB_CONTRAST_FACTOR, CMB_STEP_UK, cmbCodeToMicroK, cmbUvToEclDirection, cmbUvToGalactic, eclDirectionToCmbUv, galacticToCmbUv, microKToCmbCode } from './cmb';
import { lbToEcl } from './frames';

const local = loadLocalGalaxies();
const named = loadNamed();
const cw = loadWeb();
const g = (id: string) => local.galaxies.find((x) => x.id === id)!;
const o = (id: string) => named.objects.find((x) => x.id === id)!;

function expectOrthonormal(m: Mat3) {
  const p = mul(m, transpose(m));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(p[i][j]).toBeCloseTo(i === j ? 1 : 0, 12);
}

describe('frames', () => {
  it('rotations are orthonormal', () => {
    for (const m of [ICRS_TO_ECL, ICRS_TO_GAL, GAL_TO_ECL, GAL_TO_SGAL]) expectOrthonormal(m);
  });

  it('puts the Galactic centre and poles where the IAU definition puts them', () => {
    const gc = unitToSph(apply(GAL_TO_ICRS, sphToUnit(0, 0)));
    expect(gc.lon).toBeCloseTo(266.40499, 4);
    expect(gc.lat).toBeCloseTo(-28.93617, 4);
    const ngp = unitToSph(apply(GAL_TO_ICRS, sphToUnit(0, 90)));
    expect(ngp.lon).toBeCloseTo(192.85948, 4);
    expect(ngp.lat).toBeCloseTo(27.12825, 4);
  });

  it('puts the ecliptic north pole at RA 270°, Dec 90° − ε', () => {
    const p = unitToSph(apply(transpose(ICRS_TO_ECL), [0, 0, 1]));
    expect(p.lon).toBeCloseTo(270, 9);
    expect(p.lat).toBeCloseTo(90 - 84381.448 / 3600, 9);
  });

  it('puts M87 on the supergalactic plane as Cosmicflows-4 does (SGB = −2.35°)', () => {
    const m87 = unitToSph(apply(GAL_TO_SGAL, apply(ICRS_TO_GAL, sphToUnit(187.7058, 12.3912))));
    expect(m87.lat).toBeCloseTo(-2.348, 1);
  });

  it('has a left-handed sky basis: east is left of north seen from inside', () => {
    const { r, e, n } = skyBasis(10, 41);
    const c = cross(n, e);
    for (let k = 0; k < 3; k++) expect(c[k]).toBeCloseTo(-r[k], 12);
  });
});

describe('the app’s one cosmology', () => {
  it('reproduces the numbers named.json was built with (a second implementation in the build script) to a few parts in a million', () => {
    const c = cosmology();
    expect(c.ageGyr()).toBeCloseTo(13.787, 2);
    for (const x of named.objects) {
      if (!x.cosmology || x.zCmb == null) continue;
      expect(c.comovingDistanceMpc(x.zCmb) / x.cosmology.comovingDistanceMpc, x.id).toBeCloseTo(1, 5);
      expect(c.lookbackTimeGyr(x.zCmb), x.id).toBeCloseTo(x.cosmology.lookbackTimeGyr, 3);
      expect(c.timeGyr(1 / (1 + x.zCmb)), x.id).toBeCloseTo(x.cosmology.ageAtEmissionGyr, 3);
    }
  });

  it('puts the edge of the local universe (z = 0.1) where the trail says', () => {
    expect(cosmology().comovingDistanceMpc(LOCAL_UNIVERSE_Z)).toBeCloseTo(LOCAL_UNIVERSE_MPC, 1);
  });
});

describe('local-galaxies.json.gz', () => {
  it('lists the Local Volume Database galaxies within 3 Mpc plus M31 and M33, nearest first, all cited, CC0', () => {
    expect(local.format).toBe('lightspeed-local-galaxies');
    expect(local.licence).toContain('CC0');
    expect(local.galaxies.length).toBe(169);
    for (let i = 1; i < local.galaxies.length; i++) expect(local.galaxies[i].distanceKpc).toBeGreaterThanOrEqual(local.galaxies[i - 1].distanceKpc);
    expect(local.galaxies.at(-1)!.distanceKpc).toBeLessThanOrEqual(3000);
    for (const x of local.galaxies) {
      expect(x.distanceRef, x.name).toBeTruthy();
      for (const r of x.refs ?? []) expect(local.references[r], r).toMatch(/^\d{4}\S{15}$/);
    }
  });

  it('keeps M32 next to M31 on one distance scale', () => {
    const m32 = local.galaxies.find((x) => x.name === 'M 32')!;
    const sep = Math.hypot(...m32.positionEclKpc.map((c, k) => c - g('andromeda').positionEclKpc[k]));
    expect(sep).toBeLessThan(20);
  });

  it('uses the modern distances of the four big galaxies', () => {
    expect(g('lmc').distanceKpc).toBeCloseTo(49.59, 2);
    expect(g('smc').distanceKpc).toBeCloseTo(62.44, 2);
    expect(g('andromeda').distanceKpc).toBeCloseTo(761, 0);
    expect(g('triangulum').distanceKpc).toBeCloseTo(840.2, 0);
  });

  it('places every galaxy at its distance along its ecliptic direction', () => {
    for (const x of local.galaxies) {
      const u = raDecToEcl(x.ra, x.dec);
      for (let k = 0; k < 3; k++) expect(x.positionEclKpc[k]).toBeCloseTo(u[k] * x.distanceKpc, 2);
    }
  });
});

describe('disc orientation', () => {
  it('M31’s spin agrees with Banik & Zhao (2017) to within 5°', () => {
    const spin = apply(ECL_TO_GAL, o('andromeda').disc!.axesEcl.spin!);
    expect((Math.acos(dot(spin, sphToUnit(238.65, -26.89))) * 180) / Math.PI).toBeLessThan(5);
  });

  it('rebuilds named.json’s disc axes from the angles (the file and the code agree)', () => {
    for (const x of named.objects) {
      if (!x.disc) continue;
      const d = x.disc;
      const ax = discAxesEcl(x.ra, x.dec, { inclination: d.inclination, recedingPA: d.recedingPA, pa: d.majorAxisPA, nearSidePA: d.nearSidePA, rotationOnSky: d.rotationOnSky });
      for (const key of ['major', 'minor', 'normal'] as const) for (let k = 0; k < 3; k++) expect(ax[key][k], `${x.id} ${key}`).toBeCloseTo(d.axesEcl[key][k], 4);
      expect(ax.nearSideAssumed).toBe(d.nearSideAssumed);
    }
  });

  it('puts M31’s near side to the north-west and its north-east half receding', () => {
    const x = o('andromeda');
    const d = x.disc!;
    const ax = discAxes(x.ra, x.dec, { inclination: d.inclination, recedingPA: d.recedingPA, nearSidePA: d.nearSidePA });
    const { r, e, n } = skyBasis(x.ra, x.dec);
    const nw = discPoint(ax, 1, -Math.PI / 2);
    const sky = add(scale(n, dot(nw, n)), scale(e, dot(nw, e)));
    expect((((Math.atan2(dot(sky, e), dot(sky, n)) * 180) / Math.PI) + 360) % 360).toBeCloseTo(307.7, 1);
    expect(dot(nw, r)).toBeLessThan(0);
    const v = cross(ax.spin!, ax.major);
    expect(dot(v, r)).toBeGreaterThan(0);
  });

  it('gives every normal normal · lineOfSight = −cos i', () => {
    for (const x of named.objects) {
      if (!x.disc) continue;
      expect(dot(x.disc.axesEcl.normal, raDecToEcl(x.ra, x.dec))).toBeCloseTo(-Math.cos((x.disc.inclination * Math.PI) / 180), 5);
    }
  });
});

describe('named.json', () => {
  it('names MoM-z14 as the redshift record on 2026-09-25', () => {
    expect(named.redshiftRecord.id).toBe('mom-z14');
    expect(o('mom-z14').zHelio!.value).toBe(14.44);
    expect(o('jades-gs-z14-0').zHelio!.value).toBeCloseTo(14.1796, 4);
    expect(o('gn-z11').zHelio!.value).toBeCloseTo(10.603, 3);
  });

  it('carries every object the articles use, each with a position reference and consistent galactic angles', () => {
    for (const id of ['andromeda', 'triangulum', 'lmc', 'smc', 'm81', 'm87', 'centaurus-a', 'sombrero', 'whirlpool', 'virgo-cluster', 'coma-cluster', 'bullet-cluster', 'gn-z11', 'jades-gs-z14-0', 'mom-z14'])
      expect(o(id), id).toBeTruthy();
    for (const x of named.objects) {
      expect(x.positionRef.length).toBeGreaterThan(5);
      const { lon, lat } = unitToSph(apply(ECL_TO_GAL, raDecToEcl(x.ra, x.dec)));
      expect(lon).toBeCloseTo(x.galactic.l, 3);
      expect(lat).toBeCloseTo(x.galactic.b, 3);
    }
  });
});

describe('cosmic-web.bin.gz', () => {
  it('holds all 55,877 Cosmicflows-4 galaxies in under 1 MB', () => {
    expect(cw.count).toBe(55877);
    expect(fileSize('public/data/cosmic-web.bin.gz')).toBeLessThan(1_000_000);
  });

  it('starts with the LMC and is sorted by group distance', () => {
    expect(cw.ra[0]).toBeCloseTo(80.894, 2);
    expect(distanceModulus(cw, 0)).toBeCloseTo(18.469, 3);
    let prev = 0;
    for (let i = 0; i < cw.count; i++) {
      const key = cw.dmgroup[i] || cw.dm[i];
      expect(key).toBeGreaterThanOrEqual(prev);
      prev = key;
    }
  });

  it('holds M87 where named.json says, with its Cosmicflows-4 values', () => {
    const i = o('m87').cosmicWeb!.index!;
    expect(cw.ra[i]).toBeCloseTo(187.7058, 3);
    expect(cw.vcmb[i]).toBe(1608);
    expect(distanceModulus(cw, i)).toBeCloseTo(31.134, 3);
    expect(cw.methods[i] & METHOD.sbf).toBeTruthy();
    expect(ksMagnitude(cw, i)).toBeCloseTo(5.812, 3);
  });

  it('keeps Virgo and Coma members contiguous, one group velocity each', () => {
    for (const id of ['virgo-cluster', 'coma-cluster']) {
      const { first, count } = o(id).cosmicWeb!.members!;
      for (let i = first; i < first + count; i++) expect(cw.vgroup[i]).toBe(cw.vgroup[first]);
    }
    const coma = o('coma-cluster').cosmicWeb!.members!.first;
    expect(cw.vgroup[coma]).toBe(7193);
    expect(dmToMpc(cw.dmgroup[coma] / 1000)).toBeCloseTo(95.1, 1);
  });

  it('shows the fingers of God in redshift distances, and collapses them by group', () => {
    const { first, count } = o('coma-cluster').cosmicWeb!.members!;
    const dist = makeDistanceFn(cosmology());
    const rs: number[] = [];
    for (let i = first; i < first + count; i++) rs.push(dist(cw, i, 'redshift'));
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    expect(Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length)).toBeGreaterThan(8);
    const g0 = dist(cw, first, 'group-redshift');
    for (let i = first; i < first + count; i++) expect(dist(cw, i, 'group-redshift')).toBe(g0);
  });

  it('blends measured into redshift distances from 30 to 60 Mpc, leaving no empty shell where the two scales meet', () => {
    const dist = makeDistanceFn(cosmology());
    const shell = (lo: number, hi: number, place: (i: number) => number) => {
      let n = 0;
      for (let i = 0; i < cw.count; i++) {
        const d = place(i);
        if (d >= lo && d < hi) n++;
      }
      return n / (hi ** 3 - lo ** 3);
    };
    const recommended = (i: number) => dist(cw, i, 'recommended');
    // A hard switch at 30 Mpc (redshift distances on the Planck scale, 10% longer) left the next 3 Mpc nearly empty.
    const hard = (i: number) => {
      const g = dist(cw, i, 'group');
      const r = dist(cw, i, 'group-redshift');
      return g < 30 || !Number.isFinite(r) ? g : r;
    };
    const inside = shell(27, 30, recommended);
    expect(shell(30, 33, hard) / inside).toBeLessThan(0.3);
    expect(shell(30, 33, recommended) / inside).toBeGreaterThan(0.5);
    // Inside 30 Mpc the measured group distances, beyond 60 the redshift ones, and nothing jumps between.
    for (let i = 0; i < cw.count; i += 97) {
      const g = dist(cw, i, 'group');
      const r = dist(cw, i, 'group-redshift');
      if (g < 30) expect(recommended(i)).toBe(g);
      else if (g >= 60 && Number.isFinite(r)) expect(recommended(i)).toBe(r);
      else if (Number.isFinite(r)) expect(recommended(i)).toBeGreaterThanOrEqual(Math.min(g, r) - 1e-9);
    }
  });

  it('places redshift distances in the Planck 2018 cosmology, and world positions along RA and Dec', () => {
    const c = cosmology();
    const dist = makeDistanceFn(c);
    for (const i of [100, 5000, 30000, 55000]) {
      if (cw.vcmb[i] === NO_VELOCITY || cw.vcmb[i] <= 0) continue;
      expect(dist(cw, i, 'redshift') / c.comovingDistanceMpc(zCmb(cw, i))).toBeCloseTo(1, 10);
    }
    const pos = worldPositions(cw, c, 'group');
    for (const i of [0, 1234, 40000]) {
      const d = dist(cw, i, 'group');
      const w = eclToWorld(raDecToEcl(cw.ra[i], cw.dec[i]));
      for (let k = 0; k < 3; k++) expect(pos[3 * i + k]).toBeCloseTo(w[k] * d, 3);
    }
  });

  it('finds groups as contiguous runs', () => {
    const runs = groupRuns(cw);
    expect(runs.reduce((a, r) => a + r.count, 0)).toBe(cw.count);
    expect(runs.length).toBeGreaterThan(30000);
  });

  it('reads a galaxy’s type from its distance method, and makes the GPU arrays without the galaxies drawn as bodies', () => {
    expect(webType(METHOD.fundamentalPlane)).toBe('early');
    expect(webType(METHOD.sbf | METHOD.trgb)).toBe('early');
    expect(webType(METHOD.tullyFisher)).toBe('late');
    expect(webType(METHOD.trgb)).toBe('other');
    const skip = new Set([0, 12, 854]);
    const b = webBuffers(cw, cosmology(), skip);
    expect(b.count).toBeGreaterThan(55_000);
    expect(b.count).toBeLessThanOrEqual(cw.count - 3);
    for (const r of skip) expect(b.row.includes(r)).toBe(false);
    let bright = 0;
    for (let i = 0; i < b.count; i++) {
      expect(Number.isFinite(b.position[3 * i] + b.position[3 * i + 1] + b.position[3 * i + 2])).toBe(true);
      if (b.attrs[2 * i + 1] > 0) bright++;
    }
    // L* galaxies and brighter: a minority of a distance survey, not none.
    expect(bright / b.count).toBeGreaterThan(0.05);
    expect(bright / b.count).toBeLessThan(0.6);
    // A cluster's members, a run of rows of the file, are a run of the drawn points too (M87, drawn
    // as a body, left out of Virgo's).
    const v = o('virgo-cluster').cosmicWeb!.members!;
    const [start, count] = memberRange(b, v.first, v.count);
    expect(count).toBe(v.count - (854 >= v.first && 854 < v.first + v.count ? 1 : 0));
    for (let k = start; k < start + count; k++) expect(b.row[k] >= v.first && b.row[k] < v.first + v.count).toBe(true);
  });
});

describe('the CMB maps', () => {
  it('put the Galactic centre in the middle, longitude increasing to the left', () => {
    expect(galacticToCmbUv(0, 0)).toEqual({ u: 0.5, v: 0.5 });
    expect(galacticToCmbUv(90, 0).u).toBeCloseTo(0.25, 12);
    expect(galacticToCmbUv(270, 0).u).toBeCloseTo(0.75, 12);
    expect(galacticToCmbUv(0, 90).v).toBe(0);
  });

  it('round-trip (l, b), (u, v) and ecliptic directions', () => {
    for (const [l, b] of [
      [10, 20],
      [200, -57],
      [359.9, 1],
      [264.021, 48.253],
    ]) {
      const { u, v } = galacticToCmbUv(l, b);
      const back = cmbUvToGalactic(u, v);
      expect(back.l).toBeCloseTo(l, 9);
      expect(back.b).toBeCloseTo(b, 9);
      const e = lbToEcl(l, b);
      expect(eclDirectionToCmbUv(e).u).toBeCloseTo(u, 9);
      const d = cmbUvToEclDirection(u, v);
      for (let k = 0; k < 3; k++) expect(d[k]).toBeCloseTo(e[k], 9);
    }
  });

  it('decode temperature codes, stretched about 10,000 times', () => {
    expect(cmbCodeToMicroK(0)).toBeCloseTo(-250, 9);
    expect(cmbCodeToMicroK(255)).toBeCloseTo(250, 9);
    expect(microKToCmbCode(0)).toBe(128);
    expect(CMB_STEP_UK).toBeCloseTo(1.96, 2);
    expect(CMB_CONTRAST_FACTOR).toBeGreaterThan(9000);
    expect(CMB_CONTRAST_FACTOR).toBeLessThan(12000);
  });

  const colour = decodePng8('public/textures/cmb.png');
  const data = decodePng8('public/textures/cmb-data.png');

  it('have the documented sizes, types and credit', () => {
    expect([colour.width, colour.height, colour.colorType]).toEqual([2048, 1024, 3]);
    expect([data.width, data.height, data.colorType]).toEqual([1024, 512, 0]);
    expect(colour.text.Author).toBe('NASA / WMAP Science Team');
    expect(colour.text.Title).toMatch(/contrast enhanced/);
  });

  it('have a mean near zero, an rms near 70 µK and the Cold Spot cold', () => {
    let s = 0;
    let s2 = 0;
    let w = 0;
    let cold = 0;
    let coldW = 0;
    const cs = sphToUnit(209, -57);
    for (let j = 0; j < data.height; j++) {
      const b = 90 - (180 * (j + 0.5)) / data.height;
      const wt = Math.cos((b * Math.PI) / 180);
      for (let i = 0; i < data.width; i++) {
        const t = cmbCodeToMicroK(data.pixels[j * data.width + i]);
        s += wt * t;
        s2 += wt * t * t;
        w += wt;
        // The Cold Spot's cap only (rows within 5° of b = −57°).
        if (Math.abs(b + 57) > 5) continue;
        const { l } = cmbUvToGalactic((i + 0.5) / data.width, (j + 0.5) / data.height);
        if (dot(sphToUnit(l, b), cs) > Math.cos((5 * Math.PI) / 180)) {
          cold += wt * t;
          coldW += wt;
        }
      }
    }
    const mean = s / w;
    expect(Math.abs(mean)).toBeLessThan(5);
    const rms = Math.sqrt(s2 / w - mean * mean);
    expect(rms).toBeGreaterThan(60);
    expect(rms).toBeLessThan(80);
    expect(cold / coldW).toBeLessThan(-40);
  });
});
