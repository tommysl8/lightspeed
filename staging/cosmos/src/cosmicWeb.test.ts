import { describe, expect, it } from 'vitest';
import {
  METHOD,
  NO_VELOCITY,
  decodeCosmicWeb,
  distanceModulus,
  groupRuns,
  ksMagnitude,
  makeDistanceFn,
  worldPositions,
  zCmb,
} from './cosmicWeb.ts';
import { comovingDistanceMpc, dmToMpc } from './cosmology.ts';
import { raDecToEcl, eclToWorld } from './frames.ts';
import { repoFile, repoGunzip, toArrayBuffer } from './testFiles.ts';

const cw = decodeCosmicWeb(toArrayBuffer(repoGunzip('public/data/cosmic-web.bin.gz')));
const named = JSON.parse(repoFile('staging/cosmos/named.json').toString('utf8'));
const byId = (id: string) => named.objects.find((o: { id: string }) => o.id === id);

describe('cosmic-web.bin.gz', () => {
  it('holds all 55,877 Cosmicflows-4 galaxies and stays under ~1 MB gzipped', () => {
    expect(cw.count).toBe(55877);
    expect(repoFile('public/data/cosmic-web.bin.gz').length).toBeLessThan(1_000_000);
  });

  it('starts with the LMC (nearest) and is sorted by group distance', () => {
    expect(cw.ra[0]).toBeCloseTo(80.894, 2);
    expect(cw.dec[0]).toBeCloseTo(-69.756, 2);
    expect(distanceModulus(cw, 0)).toBeCloseTo(18.469, 3); // CF4 table 2
    let prev = 0;
    for (let i = 0; i < cw.count; i++) {
      const key = cw.dmgroup[i] || cw.dm[i];
      expect(key).toBeGreaterThanOrEqual(prev);
      prev = key;
    }
  });

  it('M87 sits where named.json says, with its CF4 values', () => {
    const i = byId('m87').cosmicWeb.index;
    expect(cw.ra[i]).toBeCloseTo(187.7058, 3);
    expect(cw.dec[i]).toBeCloseTo(12.3912, 3);
    expect(cw.vcmb[i]).toBe(1608);
    expect(distanceModulus(cw, i)).toBeCloseTo(31.134, 3);
    expect(cw.methods[i] & METHOD.sbf).toBeTruthy();
    expect(ksMagnitude(cw, i)).toBeCloseTo(5.812, 3); // 2MASS XSC k_m_ext
  });

  it('keeps Virgo and Coma members contiguous with one group velocity', () => {
    for (const id of ['virgo-cluster', 'coma-cluster']) {
      const { first, count } = byId(id).cosmicWeb.members;
      expect(count).toBeGreaterThan(100);
      for (let i = first; i < first + count; i++) {
        expect(cw.vgroup[i]).toBe(cw.vgroup[first]);
        expect(cw.dmgroup[i]).toBe(cw.dmgroup[first]);
      }
    }
    const coma = byId('coma-cluster').cosmicWeb.members.first;
    expect(cw.vgroup[coma]).toBe(7193); // CF4 table 4, group 44715
    expect(dmToMpc(cw.dmgroup[coma] / 1000)).toBeCloseTo(95.1, 1);
  });

  it('shows fingers of God: Coma members spread in redshift distance much more than in group distance', () => {
    const { first, count } = byId('coma-cluster').cosmicWeb.members;
    const dist = makeDistanceFn();
    const rs: number[] = [];
    for (let i = first; i < first + count; i++) rs.push(dist(cw, i, 'redshift'));
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length);
    // ~1000 km/s velocity dispersion / H0 ~ 15 Mpc of apparent depth for a cluster ~ 3 Mpc across
    expect(sd).toBeGreaterThan(8);
    const g = dist(cw, first, 'group-redshift');
    for (let i = first; i < first + count; i++) expect(dist(cw, i, 'group-redshift')).toBe(g);
  });

  it('redshift distances follow the Planck 2018 cosmology', () => {
    const dist = makeDistanceFn();
    for (const i of [100, 5000, 30000, 55000]) {
      if (cw.vcmb[i] === NO_VELOCITY || cw.vcmb[i] <= 0) continue;
      expect(dist(cw, i, 'redshift') / comovingDistanceMpc(zCmb(cw, i))).toBeCloseTo(1, 4);
    }
  });

  it('world positions agree with RA, Dec and distance', () => {
    const pos = worldPositions(cw, 'group');
    const dist = makeDistanceFn();
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
});
