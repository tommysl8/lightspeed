import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { AU_KM, R_EARTH_KM, R_SUN_KM } from './constants.ts';
import { type ExoplanetCatalogue, PLANET_FLAGS, archiveOrbit, assumedNodeDeg, buildHostMatcher, decodeCatalogue, hostSky, planetsOfHost } from './catalogue.ts';
import { apparentSkyOffsetFromSun, orbitSky } from './orbit.ts';

const gz = new Uint8Array(readFileSync(fileURLToPath(new URL('../../../public/data/exoplanets.json.gz', import.meta.url))));
let cat: ExoplanetCatalogue;
beforeAll(async () => {
  cat = await decodeCatalogue(gz);
});

describe('exoplanets.json.gz', () => {
  it('decodes, and every column has one entry per row', () => {
    expect(cat.format).toBe('lightspeed-exoplanets/1');
    expect(cat.doi).toBe('10.26133/NEA13');
    for (const v of Object.values(cat.planets)) expect(v).toHaveLength(cat.counts.planets);
    for (const v of Object.values(cat.hosts)) expect(v).toHaveLength(cat.counts.hosts);
    expect(cat.counts.planets).toBe(6372); // NASA Exoplanet Archive, 25 September 2026
    expect(cat.counts.hosts).toBe(4779);
  });

  it('also accepts bytes that a server already inflated', async () => {
    const plain = new Uint8Array(await new Response(new Blob([gz as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const again = await decodeCatalogue(plain);
    expect(again.counts).toEqual(cat.counts);
    const regz = await decodeCatalogue(new Uint8Array(gzipSync(plain)));
    expect(regz.planets.name[0]).toBe(cat.planets.name[0]);
  });

  it('gives host positions at epoch J2000.0 (not the archive coordinates at mixed epochs J2015.5 and J2000)', () => {
    // SIMBAD ICRS positions at epoch J2000 (Gaia DR3 carried back); before the fix Barnard's Star was 161" off.
    const ref: [string, number, number][] = [
      ["Barnard's star", 269.4520769586187, 4.693364966576667],
      ['Proxima Cen', 217.42894222160578, -62.67949018907555],
      ['eps Eri', 53.23268537982792, -9.458260970518056],
      ['tau Cet', 26.01701307163417, -15.93747989102139],
    ];
    for (const [name, ra, dec] of ref) {
      const h = cat.hosts.name.indexOf(name);
      expect(h, name).toBeGreaterThanOrEqual(0);
      const sep = Math.hypot((cat.hosts.ra[h] - ra) * Math.cos((dec * Math.PI) / 180), cat.hosts.dec[h] - dec) * 3600;
      expect(sep, name).toBeLessThan(0.2);
    }
    const src = cat.enums.posRef;
    const n = (k: string) => cat.hosts.posRef.filter((x) => src[x] === k).length;
    expect(n('gaia') + n('hipparcos')).toBeGreaterThan(0.9 * cat.hosts.name.length);
    expect(cat.positionSources?.gaia).toContain('J2000');
  });

  it('keeps Gaia DR3 ids as exact strings (they exceed 2^53)', () => {
    const h = cat.hosts.name.indexOf('TRAPPIST-1');
    expect(cat.hosts.gaia[h]).toBe('2635476908753563008');
    const hd = cat.hosts.name.indexOf('51 Peg');
    expect(cat.hosts.hip[hd]).toBe(113357);
    expect(cat.hosts.hd[hd]).toBe('217014');
  });

  it('groups planets by host, in period order', () => {
    const h = cat.hosts.name.indexOf('TRAPPIST-1');
    const ps = planetsOfHost(cat, h).map((i) => cat.planets.name[i]);
    expect(ps).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h'].map((l) => `TRAPPIST-1 ${l}`));
  });
});

describe('archive records -> Kepler orbits', () => {
  it('fills every orbit except the few with neither period nor semi-major axis', () => {
    let missing = 0;
    for (let i = 0; i < cat.counts.planets; i++) {
      const r = archiveOrbit(cat, i);
      if (!r) {
        missing++;
        expect(cat.planets.period[i]).toBeNull();
        expect(cat.planets.sma[i]).toBeNull();
        continue;
      }
      const o = r.orbit;
      for (const v of [o.periodDays, o.aAu, o.e, o.iDeg, o.nodeDeg, o.argPeriDeg, o.tPeriJd]) expect(Number.isFinite(v)).toBe(true);
      expect(o.e).toBeGreaterThanOrEqual(0);
      expect(o.e).toBeLessThan(1);
      expect(o.nodeDeg).toBe(assumedNodeDeg(cat.hosts.name[cat.planets.host[i]]));
    }
    expect(missing).toBeLessThan(20);
  });

  it('every transiting planet passes in front of its star, seen from the Sun, at its archived transit time', () => {
    let tested = 0;
    for (let i = 0; i < cat.counts.planets; i++) {
      if (!(cat.planets.flags[i] & PLANET_FLAGS.TRANSITS) || cat.planets.tconj[i] === null) continue;
      const h = cat.planets.host[i];
      const R = cat.hosts.radius[h];
      const sky = hostSky(cat, h);
      if (R === null || sky.distanceKm === null) continue;
      const r = archiveOrbit(cat, i);
      if (!r) continue;
      const t = cat.planets.tconj[i] as number;
      const k = ((cat.planets.radius[i] ?? 0) * R_EARTH_KM) / (R * R_SUN_KM);
      for (const n of [0, 3]) {
        const s = apparentSkyOffsetFromSun(r.orbit, sky.distanceKm, t + n * r.orbit.periodDays);
        expect(s.away, cat.planets.name[i]).toBeLessThan(0);
        expect(Math.hypot(s.north, s.east) / ((R * R_SUN_KM) / AU_KM), cat.planets.name[i]).toBeLessThan(1 + k + 1e-9);
      }
      tested++;
    }
    expect(tested).toBeGreaterThan(4000);
  });

  it('treats archive omega as the star\'s for RV/transit planets (51 Peg b, eps Eri b cases) and records it', () => {
    const i = cat.planets.name.indexOf('TOI-700 b');
    const r = archiveOrbit(cat, i);
    expect(r?.provenance.phase).toBe('conjunction');
    expect(r?.provenance.node).toBe('assumed');
    // For RV planets with a conjunction time, the planet is nearest the Sun at that time.
    const j = cat.planets.name.indexOf('51 Peg b');
    const q = archiveOrbit(cat, j);
    if (!q) throw new Error('no orbit');
    const s = orbitSky(q.orbit, cat.planets.tconj[j] as number);
    expect(s.pos.away).toBeLessThan(0);
  });
});

describe('host matching', () => {
  it('matches by Gaia, then HIP, then HD, then position', () => {
    const names = ['TRAPPIST-1', '51 Peg', 'tau Cet', 'HR 8799'];
    const hs = names.map((n) => cat.hosts.name.indexOf(n));
    const stars = [
      { gaiaDr3: cat.hosts.gaia[hs[0]], raDeg: 0, decDeg: 0 },
      { hip: cat.hosts.hip[hs[1]], raDeg: 0, decDeg: 0 },
      { hd: 10700, raDeg: 0, decDeg: 0 },
      { raDeg: (cat.hosts.ra[hs[3]] as number) + 0.3 / 3600, decDeg: cat.hosts.dec[hs[3]] as number, vmag: 6.0 },
      { raDeg: 10, decDeg: 10 },
    ];
    const match = buildHostMatcher(stars);
    expect(match(cat, hs[0])).toEqual({ star: 0, by: 'gaia' });
    expect(match(cat, hs[1])).toEqual({ star: 1, by: 'hip' });
    // tau Cet has a HIP and Gaia id that are not in this star list, so it falls through to HD.
    expect(match(cat, hs[2])).toEqual({ star: 2, by: 'hd' });
    expect(match(cat, hs[3])).toEqual({ star: 3, by: 'position' });
    expect(match(cat, cat.hosts.name.indexOf('Kepler-16'))).toBeNull();
  });
});
