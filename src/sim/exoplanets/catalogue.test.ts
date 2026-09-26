import { describe, expect, it } from 'vitest';
import { readBytes } from '../../test/files';
import { loadCatalogueJson, loadExoplanetFile } from '../../test/exoplanets';
import { AU_KM, R_EARTH_KM, R_SUN_KM } from './constants';
import { MATCH_KINDS, PLANET_FLAGS, archiveOrbit, assumedNodeDeg, decodeCatalogue, hostSky, known, matchHosts, planetsOfHost, type StarCatalogueKeys } from './catalogue';
import { apparentSkyOffsetFromSun, orbitSky } from './orbit';
import { equatorialToEcliptic, raDecToUnit } from './sky';

interface NodeZlib {
  gzipSync(data: Uint8Array): Uint8Array;
  gunzipSync(data: Uint8Array): Uint8Array;
}
const zlib = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:zlib') as NodeZlib;

const cat = loadExoplanetFile();

describe('exoplanets.json.gz', () => {
  it('decodes, and every column has one entry per row', () => {
    expect(cat.format).toBe('lightspeed-exoplanets/1');
    expect(cat.doi).toBe('10.26133/NEA13');
    for (const [k, v] of Object.entries(cat.planets)) if (k !== 'count') expect((v as ArrayLike<unknown>).length, k).toBe(cat.counts.planets);
    for (const [k, v] of Object.entries(cat.hosts)) if (k !== 'count') expect((v as ArrayLike<unknown>).length, k).toBe(cat.counts.hosts);
    expect(cat.counts.planets).toBe(6372); // NASA Exoplanet Archive, 25 September 2026
    expect(cat.counts.hosts).toBe(4779);
  });

  it('packs every number exactly, with NaN for the archive’s nulls', () => {
    const j = loadCatalogueJson();
    for (const col of ['period', 'sma', 'tconj', 'radius', 'mass', 'teq'] as const) {
      const a = j.planets[col];
      const b = cat.planets[col];
      for (let i = 0; i < a.length; i++) {
        if (a[i] === null) expect(known(b[i])).toBe(false);
        else expect(b[i]).toBe(a[i]);
      }
    }
    // Planets are grouped by host: each host's first planet and count.
    const h = cat.hosts.name.indexOf('TRAPPIST-1');
    expect(cat.hosts.planetCount[h]).toBe(7);
    expect(cat.planets.host[cat.hosts.firstPlanet[h]]).toBe(h);
  });

  it('also accepts bytes that a server already inflated, and gzip bytes', async () => {
    const gz = readBytes('public/data/exoplanets.json.gz');
    const plain = new Uint8Array(zlib.gunzipSync(gz));
    const again = await decodeCatalogue(plain);
    expect(again.counts).toEqual(cat.counts);
    const regz = await decodeCatalogue(new Uint8Array(zlib.gzipSync(plain)));
    expect(regz.planets.name[0]).toBe(cat.planets.name[0]);
    expect(Array.from(regz.planets.period.slice(0, 50))).toEqual(Array.from(cat.planets.period.slice(0, 50)));
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
    const n = (k: string) => Array.from(cat.hosts.posRef).filter((x) => src[x] === k).length;
    expect(n('gaia') + n('hipparcos')).toBeGreaterThan(0.9 * cat.hosts.count);
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
    for (let i = 0; i < cat.planets.count; i++) {
      const r = archiveOrbit(cat, i);
      if (!r) {
        missing++;
        expect(known(cat.planets.period[i])).toBe(false);
        expect(known(cat.planets.sma[i])).toBe(false);
        continue;
      }
      const o = r.orbit;
      for (const v of [o.periodDays, o.aAu, o.e, o.iDeg, o.nodeDeg, o.argPeriDeg, o.tPeriJd]) expect(Number.isFinite(v)).toBe(true);
      expect(o.e).toBeGreaterThanOrEqual(0);
      expect(o.e).toBeLessThan(1);
      expect(o.nodeDeg).toBe(assumedNodeDeg(cat.hosts.name[cat.planets.host[i]]));
    }
    expect(missing).toBe(7); // 6 microlensing planets and SR 12 AB c (exoplanets.md §4)
  });

  it('every transiting planet passes in front of its star, seen from the Sun, at its archived transit time', () => {
    let tested = 0;
    for (let i = 0; i < cat.planets.count; i++) {
      if (!(cat.planets.flags[i] & PLANET_FLAGS.TRANSITS) || !known(cat.planets.tconj[i])) continue;
      const h = cat.planets.host[i];
      const R = cat.hosts.radius[h];
      const sky = hostSky(cat, h);
      if (!known(R) || sky.distanceKm === null) continue;
      const r = archiveOrbit(cat, i);
      if (!r) continue;
      const t = cat.planets.tconj[i];
      const k = ((known(cat.planets.radius[i]) ? cat.planets.radius[i] : 0) * R_EARTH_KM) / (R * R_SUN_KM);
      for (const n of [0, 3]) {
        const s = apparentSkyOffsetFromSun(r.orbit, sky.distanceKm, t + n * r.orbit.periodDays);
        expect(s.away, cat.planets.name[i]).toBeLessThan(0);
        expect(Math.hypot(s.north, s.east) / ((R * R_SUN_KM) / AU_KM), cat.planets.name[i]).toBeLessThan(1 + k + 1e-9);
      }
      tested++;
    }
    expect(tested).toBeGreaterThan(4000);
  });

  it("treats archive omega as the star's for RV/transit planets and records it", () => {
    const i = cat.planets.name.indexOf('TOI-700 b');
    const r = archiveOrbit(cat, i);
    expect(r?.provenance.phase).toBe('conjunction');
    expect(r?.provenance.node).toBe('assumed');
    // For RV planets with a conjunction time, the planet is nearest the Sun at that time.
    const j = cat.planets.name.indexOf('51 Peg b');
    const q = archiveOrbit(cat, j);
    if (!q) throw new Error('no orbit');
    const s = orbitSky(q.orbit, cat.planets.tconj[j]);
    expect(s.pos.away).toBeLessThan(0);
  });
});

/** A small star list in the star files' layout: ecliptic parsecs and absolute magnitudes. */
function starList(stars: { raDeg: number; decDeg: number; distPc: number; vmag: number }[], numbers: { hip?: [number, number][]; hd?: [number, number][] } = {}): StarCatalogueKeys {
  const positions = new Float32Array(stars.length * 3);
  const absMag = new Float32Array(stars.length);
  stars.forEach((s, k) => {
    const u = equatorialToEcliptic(raDecToUnit(s.raDeg, s.decDeg));
    positions.set([u.x * s.distPc, u.y * s.distPc, u.z * s.distPc], 3 * k);
    absMag[k] = s.vmag - 5 * Math.log10(s.distPc) + 5;
  });
  const col = (pairs?: [number, number][]) => (pairs ? { star: Int32Array.from(pairs.map((p) => p[0])), id: Int32Array.from(pairs.map((p) => p[1])) } : undefined);
  return { count: stars.length, positions, absMag, hip: col(numbers.hip), hd: col(numbers.hd) };
}

describe('host matching', () => {
  const H = cat.hosts;
  const at = (name: string) => H.name.indexOf(name);
  const place = (name: string, dRa = 0) => ({ raDeg: H.ra[at(name)] + dRa / 3600, decDeg: H.dec[at(name)], distPc: H.dist[at(name)], vmag: H.vmag[at(name)] });

  it('matches by HIP, then HD, then position, rejecting stars of the wrong brightness or distance', () => {
    // TRAPPIST-1's V is 17.0 in the archive and 18.8 in the star catalogue: at the same place and distance a V
    // estimate may be off by up to 2.5 mag; K2-18's double is 3 mag off, HR 8799's twice as far.
    const stars = starList(
      [
        { raDeg: 0, decDeg: 0, distPc: 10, vmag: 5 }, // 0: 51 Peg by HIP (its place does not matter)
        { raDeg: 10, decDeg: 10, distPc: 10, vmag: 5 }, // 1: tau Cet by HD
        { ...place('TRAPPIST-1', 0.3), vmag: place('TRAPPIST-1').vmag + 1.78 }, // 2: by position, 0.3″ off, V as the star catalogue has it
        { ...place('K2-18', 0.5), vmag: place('K2-18').vmag + 3 }, // 3: in the right place but 3 mag too bright
        { ...place('HR 8799', 0.2), distPc: 2 * place('HR 8799').distPc }, // 4: right place, twice as far
      ],
      { hip: [[0, 113357]], hd: [[1, 10700]] },
    );
    const m = matchHosts(cat, stars);
    const kind = (name: string) => (m.star[at(name)] >= 0 ? MATCH_KINDS[m.by[at(name)]] : null);
    expect(m.star[at('51 Peg')]).toBe(0);
    expect(kind('51 Peg')).toBe('hip');
    expect(m.star[at('tau Cet')]).toBe(1);
    expect(kind('tau Cet')).toBe('hd');
    expect(m.star[at('TRAPPIST-1')]).toBe(2);
    expect(kind('TRAPPIST-1')).toBe('position');
    expect(m.star[at('K2-18')]).toBe(-1);
    expect(m.star[at('HR 8799')]).toBe(-1);
    expect(m.star[at('Kepler-16')]).toBe(-1);
  });

  it('widens the positional search by 25 years of proper motion (Barnard’s Star, 10.4″/yr)', () => {
    const b = place("Barnard's star");
    const m = matchHosts(cat, starList([{ ...b, decDeg: b.decDeg + 200 / 3600 }]));
    expect(m.star[at("Barnard's star")]).toBe(0);
    const far = matchHosts(cat, starList([{ ...b, decDeg: b.decDeg + 300 / 3600 }]));
    expect(far.star[at("Barnard's star")]).toBe(-1);
  });
});
