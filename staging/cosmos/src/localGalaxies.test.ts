import { describe, expect, it } from 'vitest';
import { ageGyr, comovingDistanceMpc } from './cosmology.ts';
import { ECL_TO_GAL, ICRS_TO_ECL, apply, dot, lbToUnit, raDecToUnit, skyBasis, unitToSph, add, scale } from './frames.ts';
import { discAxes, discPoint, type LocalGalaxiesDoc, type NamedDoc } from './localGalaxies.ts';
import { repoFile, repoGunzip } from './testFiles.ts';

const local = JSON.parse(repoGunzip('public/data/local-galaxies.json.gz').toString('utf8')) as LocalGalaxiesDoc;
const named = JSON.parse(repoFile('staging/cosmos/named.json').toString('utf8')) as NamedDoc;
const g = (id: string) => local.galaxies.find((x) => x.id === id)!;
const o = (id: string) => named.objects.find((x) => x.id === id)!;

describe('local-galaxies.json.gz', () => {
  it('lists the Local Volume Database dwarfs within 3 Mpc plus M31 and M33, nearest first, all cited, CC0', () => {
    expect(local.format).toBe('lightspeed-local-galaxies');
    expect(local.licence).toContain('CC0');
    expect(local.galaxies.length).toBe(169);
    for (let i = 1; i < local.galaxies.length; i++)
      expect(local.galaxies[i].distanceKpc).toBeGreaterThanOrEqual(local.galaxies[i - 1].distanceKpc);
    expect(local.galaxies[local.galaxies.length - 1].distanceKpc).toBeLessThanOrEqual(3000);
    for (const x of local.galaxies) {
      expect(x.distanceRef, x.name).toBeTruthy();
      for (const r of x.refs ?? []) expect(local.references[r], r).toMatch(/^\d{4}\S{15}$/);
    }
  });

  it('keeps the M31 satellites on one distance scale with M31 (M32 next to M31, not 44 kpc behind it)', () => {
    const m31 = g('andromeda');
    const m32 = local.galaxies.find((x) => x.name === 'M 32')!;
    const sep = Math.hypot(...m32.positionEclKpc.map((c, k) => c - m31.positionEclKpc[k]));
    expect(sep).toBeLessThan(20);
    expect(m32.distanceRef).toContain('scaled by 761/776.2');
  });

  it('uses modern distances for the four big galaxies', () => {
    expect(g('lmc').distanceKpc).toBeCloseTo(49.59, 2); // Pietrzynski et al. 2019
    expect(g('smc').distanceKpc).toBeCloseTo(62.44, 2); // Graczyk et al. 2020
    expect(g('andromeda').distanceKpc).toBeCloseTo(761, 0); // Li et al. 2021
    expect(g('triangulum').distanceKpc).toBeCloseTo(840.2, 0); // Breuval et al. 2023
  });

  it('positions are distance times the ecliptic direction', () => {
    for (const x of local.galaxies) {
      const u = apply(ICRS_TO_ECL, raDecToUnit(x.ra, x.dec));
      for (let k = 0; k < 3; k++) expect(x.positionEclKpc[k]).toBeCloseTo(u[k] * x.distanceKpc, 2);
    }
  });

  it('derives luminosity and physical size from the database', () => {
    const fornax = local.galaxies.find((x) => x.name === 'Fornax')!;
    expect(fornax.class).toBe('dwarf-spheroidal');
    expect(fornax.subgroup).toBe('MW');
    expect(fornax.absMagV!).toBeLessThan(-13);
    expect(fornax.rhPc!).toBeGreaterThan(500);
    const m32 = local.galaxies.find((x) => x.name === 'M 32')!;
    expect(m32.class).toBe('compact-elliptical');
    expect(m32.subgroup).toBe('M31');
  });

  it('LMC heliocentric space velocity from its proper motion is ~520 km/s', () => {
    // v_r = 262.2 km/s; v_t = 4.74 * 49.59 kpc * 1.924 mas/yr = 452 km/s (the Galactocentric speed,
    // after removing the Sun's own motion, is ~320 km/s)
    const v = g('lmc').velocityHelioEclKmS!;
    const speed = Math.hypot(v[0], v[1], v[2]);
    expect(speed).toBeGreaterThan(500);
    expect(speed).toBeLessThan(540);
  });
});

describe('disc orientation', () => {
  it('M31 spin agrees with Banik & Zhao (2017) to a few degrees', () => {
    // Banik & Zhao 2017 (MNRAS 467, 2180), table 1: M31 disc spin at (l, b) = (238.65, -26.89),
    // from i (Ma 2001) and PA (Chemin et al. 2009); ours uses Corbelli et al. 2010 (i = 77.7).
    const spin = o('andromeda').disc!.axesEcl.spin!;
    const gal = apply(ECL_TO_GAL, spin);
    const sep = (Math.acos(dot(gal, lbToUnit(238.65, -26.89))) * 180) / Math.PI;
    expect(sep).toBeLessThan(5);
  });

  it('puts the near side of M31 to the west and the NE half receding', () => {
    const d = o('andromeda').disc!;
    const ra = o('andromeda').ra;
    const dec = o('andromeda').dec;
    const ax = discAxes(ra, dec, { inclination: d.inclination, recedingPA: d.recedingPA, nearSidePA: d.nearSidePA });
    const { r, e, n } = skyBasis(ra, dec);
    // a disc point projecting to PA 307.7 (NW) is nearer than the centre
    const nw = discPoint(ax, 1, -Math.PI / 2);
    const sky = add(scale(n, dot(nw, n)), scale(e, dot(nw, e)));
    const pa = ((Math.atan2(dot(sky, e), dot(sky, n)) * 180) / Math.PI + 360) % 360;
    expect(pa).toBeCloseTo(307.7, 1);
    expect(dot(nw, r)).toBeLessThan(0);
    // rotation velocity at the NE end of the major axis points away from us
    const v = [
      ax.spin![1] * ax.major[2] - ax.spin![2] * ax.major[1],
      ax.spin![2] * ax.major[0] - ax.spin![0] * ax.major[2],
      ax.spin![0] * ax.major[1] - ax.spin![1] * ax.major[0],
    ] as [number, number, number];
    expect(dot(v, r)).toBeGreaterThan(0);
  });

  it('normals satisfy normal . lineOfSight = -cos(i)', () => {
    for (const x of named.objects) {
      if (!x.disc) continue;
      const los = apply(ICRS_TO_ECL, raDecToUnit(x.ra, x.dec));
      expect(dot(x.disc.axesEcl.normal, los)).toBeCloseTo(-Math.cos((x.disc.inclination * Math.PI) / 180), 5);
    }
  });

  it('LMC rotates clockwise on the sky with its NE side near', () => {
    const d = o('lmc').disc!;
    expect(d.rotationOnSky).toBe('clockwise');
    const los = apply(ICRS_TO_ECL, raDecToUnit(o('lmc').ra, o('lmc').dec));
    expect(dot(d.axesEcl.spin!, los)).toBeGreaterThan(0); // clockwise as seen = spin points away
    expect(d.nearSideAssumed).toBe(false);
  });
});

describe('named.json', () => {
  it('names MoM-z14 as the redshift record holder on 2026-09-25', () => {
    expect(named.redshiftRecord.id).toBe('mom-z14');
    expect(o('mom-z14').recordHolder).toBe(true);
    expect(o('mom-z14').zHelio!.value).toBe(14.44);
    expect(o('jades-gs-z14-0').zHelio!.value).toBeCloseTo(14.1796, 4);
    expect(o('gn-z11').zHelio!.value).toBeCloseTo(10.603, 3);
  });

  it('carries every object the Learn articles use', () => {
    for (const id of [
      'andromeda',
      'triangulum',
      'lmc',
      'smc',
      'm81',
      'm87',
      'centaurus-a',
      'sombrero',
      'whirlpool',
      'virgo-cluster',
      'coma-cluster',
      'bullet-cluster',
      'gn-z11',
      'jades-gs-z14-0',
      'mom-z14',
    ])
      expect(o(id), id).toBeTruthy();
  });

  it('derived cosmology matches cosmology.ts', () => {
    for (const x of named.objects) {
      if (!x.cosmology || x.zCmb == null) continue;
      expect(x.cosmology.comovingDistanceMpc / comovingDistanceMpc(x.zCmb)).toBeCloseTo(1, 5);
      expect(x.cosmology.ageAtEmissionGyr).toBeCloseTo(ageGyr(x.zCmb), 3);
      expect(x.cosmology.luminosityDistanceMpc).toBeCloseTo((1 + x.zCmb) * x.cosmology.comovingDistanceMpc, 1);
    }
  });

  it('every entry has a position reference and galactic coordinates consistent with RA/Dec', () => {
    for (const x of named.objects) {
      expect(x.positionRef.length).toBeGreaterThan(5);
      const { lon, lat } = unitToSph(apply(ECL_TO_GAL, apply(ICRS_TO_ECL, raDecToUnit(x.ra, x.dec))));
      expect(lon).toBeCloseTo(x.galactic.l, 3);
      expect(lat).toBeCloseTo(x.galactic.b, 3);
    }
  });
});
