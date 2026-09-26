import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { loadExtra, loadNames, loadStars, loadSystems, readRepoFile } from './test-helpers';
import {
  colourSource,
  ColourSource,
  distancePrecision,
  distanceSource,
  DistanceSource,
  gunzipIfNeeded,
  inSystems,
  isAdded,
  velocityStatus,
  VelocityStatus,
} from './stars3d';
import { buildNameIndex, findStar } from './names';
import { eclipticToEquatorial, OBLIQUITY_J2000, raDecFromVector, type Vec3 } from './index';

const stars = loadStars();
const names = buildNameIndex(loadNames());
const one = (q: string): number => {
  const hits = findStar(names, q);
  expect(hits.length, `lookup ${q}`).toBeGreaterThan(0);
  return hits[0];
};
const pos = (i: number): Vec3 => [stars.positions[3 * i], stars.positions[3 * i + 1], stars.positions[3 * i + 2]];
const vel = (i: number): Vec3 => [stars.velocities[3 * i], stars.velocities[3 * i + 1], stars.velocities[3 * i + 2]];
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

describe('stars3d.bin.gz', () => {
  it('has the expected header and size', () => {
    expect(stars.count).toBeGreaterThan(320_000);
    expect(stars.count).toBeLessThan(340_000);
    expect(stars.epochJy).toBe(2000);
    expect(stars.velocityUnitKms).toBeCloseTo(0.1, 6);
    expect(loadExtra().count).toBe(stars.count);
    expect(loadNames().count).toBe(stars.count);
  });

  it('is sorted brightest first as seen from the Sun', () => {
    let prev = -Infinity;
    for (let i = 0; i < stars.count; i++) {
      const V = stars.absMag[i] + 5 * Math.log10(len(pos(i))) - 5;
      // absMag is rounded to 0.01 mag, so allow that much disorder
      expect(V).toBeGreaterThan(prev - 0.011);
      prev = Math.max(prev, V);
    }
  });

  it('places Sirius first, at 2.639 pc with M_V = 1.45', () => {
    const i = one('Sirius');
    expect(i).toBe(0);
    expect(len(pos(i))).toBeCloseTo(2.639, 3);
    expect(stars.absMag[i]).toBeCloseTo(-1.44 - 5 * Math.log10(2.63916 / 10), 1);
    expect(stars.teff[i]).toBe(9850); // Bond et al. 2017: 9845 K, stored to 10 K
    expect(colourSource(stars.flags[i])).toBe(ColourSource.Literature);
    expect(inSystems(stars.flags[i])).toBe(true);
    expect(distanceSource(stars.flags[i])).toBe(DistanceSource.Literature);
  });

  it('has Gaia DR3 distances with the zero-point for ordinary stars', () => {
    const i = one("Kapteyn's Star");
    expect(distanceSource(stars.flags[i])).toBe(DistanceSource.GaiaDR3);
    // Gaia DR3 parallax 254.1986 mas at J2016.0; at J2000 the star (RV +245 km/s) was 0.004 pc closer
    // (the zero-point, about -0.03 mas at G = 8, moves it by a further ~0.0005 pc)
    expect(Math.abs(len(pos(i)) - (1000 / 254.1986 - 16 * 245.05 * 1.0227e-6))).toBeLessThan(0.001);
    expect(distancePrecision(stars.flags[i])).toBe(0);
    expect(velocityStatus(stars.flags[i])).toBe(VelocityStatus.Full);
    // bright stars (G < 6) are outside the zero-point recipe's range and say so; some use Hipparcos instead
    let approx = 0;
    let hip = 0;
    for (let k = 0; k < stars.count; k++) {
      if (distanceSource(stars.flags[k]) === DistanceSource.GaiaDR3Approx) approx++;
      if (distanceSource(stars.flags[k]) === DistanceSource.Hipparcos) hip++;
    }
    expect(approx).toBeGreaterThan(1000);
    expect(hip).toBeGreaterThan(1000);
  });

  it('flags Betelgeuse as a Hipparcos distance with a large uncertainty', () => {
    const i = one('Betelgeuse');
    expect(distanceSource(stars.flags[i])).toBe(DistanceSource.Hipparcos);
    expect(distancePrecision(stars.flags[i])).toBe(2); // 6.55 +- 0.83 mas: 13%
    expect(len(pos(i))).toBeCloseTo(152.7, 0);
    expect(stars.teff[i]).toBe(3600);
  });

  it('gives Barnard\'s Star its known space velocity (~142.6 km/s)', () => {
    const i = one("Barnard's Star");
    expect(len(vel(i))).toBeGreaterThan(141);
    expect(len(vel(i))).toBeLessThan(144);
    // radial velocity -110.5 km/s (Gaia DR3): the star is approaching
    const p = pos(i);
    const vr = (vel(i)[0] * p[0] + vel(i)[1] * p[1] + vel(i)[2] * p[2]) / len(p);
    expect(vr).toBeCloseTo(-110.5, 0);
  });

  it('uses J2000 ecliptic axes: Polaris is 0.74 deg from the celestial pole, at ecliptic latitude ~66 deg', () => {
    const i = one('Polaris');
    const p = pos(i);
    const eq = eclipticToEquatorial(p);
    expect(raDecFromVector(eq).decDeg).toBeCloseTo(89.264, 2);
    const pole: Vec3 = [0, Math.sin(OBLIQUITY_J2000), Math.cos(OBLIQUITY_J2000)];
    const c = (p[0] * pole[0] + p[1] * pole[1] + p[2] * pole[2]) / len(p);
    expect((Math.acos(c) * 180) / Math.PI).toBeCloseTo(0.736, 2);
    expect((Math.asin(p[2] / len(p)) * 180) / Math.PI).toBeCloseTo(66.1, 1);
  });

  // Cross-check against the legacy public/data/stars.bin (HYG v4.4, world axes); skipped once that file is retired.
  it.skipIf(!existsSync(new URL('../../../public/data/stars.bin', import.meta.url)))('agrees with the directions in the existing stars.bin (HYG, world axes) for the 100 brightest stars', () => {
    const raw = readRepoFile('public/data/stars.bin');
    const old = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    let matched = 0;
    for (let k = 0; k < 100; k++) {
      const w: Vec3 = [old[5 * k], old[5 * k + 1], old[5 * k + 2]];
      const ecl: Vec3 = [w[0], -w[2], w[1]]; // world = (x, z, -y)
      const u = ecl.map((x) => x / len(ecl)) as Vec3;
      let best = 1;
      for (let i = 0; i < 300; i++) {
        const q = pos(i);
        const d = Math.acos(Math.min(1, (u[0] * q[0] + u[1] * q[1] + u[2] * q[2]) / len(q)));
        best = Math.min(best, d);
      }
      if ((best * 180) / Math.PI * 3600 < 30) matched++;
    }
    // components merged or split differently in the two catalogues account for the few misses
    expect(matched).toBeGreaterThanOrEqual(95);
  });

  it('adds TRAPPIST-1 from Gaia DR3', () => {
    const i = one('TRAPPIST-1');
    expect(isAdded(stars.flags[i])).toBe(true);
    expect(len(pos(i))).toBeCloseTo(1000 / 80.2123, 2);
    expect(stars.teff[i]).toBe(2570);
  });

  it('stores velocities for >85% of stars and has no absurd values', () => {
    let full = 0;
    let maxSpeed = 0;
    for (let i = 0; i < stars.count; i++) {
      if (velocityStatus(stars.flags[i]) === VelocityStatus.Full) full++;
      maxSpeed = Math.max(maxSpeed, len(vel(i)));
    }
    expect(full / stars.count).toBeGreaterThan(0.85);
    expect(maxSpeed).toBeLessThanOrEqual(1000);
  });

  it('puts bright stars at their J2000 positions, not the Hipparcos epoch 1991.25', () => {
    // SIMBAD ICRS positions at epoch J2000 (Hipparcos new reduction, van Leeuwen 2007, carried to J2000). AT-HYG gives
    // these stars their J1991.25 positions (Arcturus 19.9" off); the build replaces them.
    const ref: [string, number, number][] = [
      ['Arcturus', 213.915300294925, 19.1824091615312],
      ['Vega', 279.234734787025, 38.783688956244],
      ['Altair', 297.69582729638694, 8.868321196436963],
      ['Pollux', 116.32895777437875, 28.02619889009357],
      ['Denebola', 177.26490975591017, 14.572058064829658],
      ['Fomalhaut', 344.4126927211701, -29.622237033389442],
    ];
    for (const [name, ra, dec] of ref) {
      const q = raDecFromVector(eclipticToEquatorial(pos(one(name))));
      const sep = Math.hypot((q.raDeg - ra) * Math.cos((dec * Math.PI) / 180), q.decDeg - dec) * 3600;
      expect(sep, name).toBeLessThan(0.2);
    }
  });

  it('gives almost every star a velocity: only stars with no proper motion anywhere stay at rest', () => {
    let atRest = 0;
    for (let i = 0; i < stars.count; i++) if (velocityStatus(stars.flags[i]) === VelocityStatus.Unknown) atRest++;
    expect(atRest).toBe(21);
    // Castor had pm_src "N" in AT-HYG; its proper motion now comes from the Hipparcos new reduction.
    expect(len(vel(one('Castor')))).toBeGreaterThan(5);
  });

  it('keeps xi UMa A (Alula Australis) with its companion: same distance, 1.77" apart at J2000, findable as HIP 55203', () => {
    const a = one('HIP 55203');
    const b = one('Alula Australis B');
    expect(one('Alula Australis')).toBe(a);
    expect(len(pos(a))).toBeCloseTo(8.732, 3);
    expect(len(pos(b))).toBeCloseTo(8.732, 3);
    const ua = pos(a).map((x) => x / len(pos(a)));
    const ub = pos(b).map((x) => x / len(pos(b)));
    const sep = (Math.acos(ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2]) * 180 * 3600) / Math.PI;
    expect(sep).toBeGreaterThan(1.5);
    expect(sep).toBeLessThan(2.0);
    expect(velocityStatus(stars.flags[a])).toBe(VelocityStatus.Full);
    expect(vel(a)).toEqual(vel(b));
  });

  it('links systems.json catalogue indices to the right stars', () => {
    for (const s of loadSystems().stars) {
      if (s.catalogueIndex == null) continue;
      expect(inSystems(stars.flags[s.catalogueIndex]), s.id).toBe(true);
      if (s.catalogueDistancePc) expect(len(pos(s.catalogueIndex))).toBeCloseTo(s.catalogueDistancePc, 3);
    }
  });

  it('decodes through gunzipIfNeeded (DecompressionStream) like the browser path', async () => {
    const gz = readRepoFile('public/data/stars3d-extra.bin.gz');
    const ab = gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) as ArrayBuffer;
    const out = await gunzipIfNeeded(ab);
    expect(out.byteLength).toBe(gunzipSync(gz).byteLength);
    // an already-decompressed buffer passes through unchanged
    expect(await gunzipIfNeeded(out)).toBe(out);
  });
});
