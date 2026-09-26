import { describe, expect, it } from 'vitest';
import { readBytes, readJson } from '../../test/files';
import { gunzipFile, loadBrightStars, loadExtra, loadNames, loadNamesJson, loadStars, loadSystems } from '../../test/stars';
import {
  colourSource,
  ColourSource,
  decodeStars3D,
  distancePrecision,
  distanceSource,
  DistanceSource,
  gunzipIfNeeded,
  inSystems,
  isAdded,
  velocityStatus,
  VelocityStatus,
} from './catalogue';
import { catalogueRow } from './motion';
import { findStar } from './names';
import { eclipticToEquatorial, raDecFromVector, type Vec3 } from './frames';
import { OBLIQUITY_J2000 } from './constants';

const stars = loadStars();
const names = loadNames();
const one = (q: string): number => {
  const hits = findStar(names, q);
  expect(hits.length, `lookup ${q}`).toBeGreaterThan(0);
  return hits[0];
};
const pos = (i: number): Vec3 => catalogueRow(stars, i).pos;
const vel = (i: number): Vec3 => catalogueRow(stars, i).velKms;
const len = (v: Readonly<Vec3>) => Math.hypot(v[0], v[1], v[2]);
const vFromSun = (i: number) => stars.absMag[i] + 5 * Math.log10(len(pos(i))) - 5;

describe('stars3d.bin.gz', () => {
  it('has the expected header and size', () => {
    expect(stars.count).toBe(329_770);
    expect(stars.epochJy).toBe(2000);
    expect(stars.velocityUnitKms).toBeCloseTo(0.1, 6);
    expect(stars.absMagUnit).toBeCloseTo(0.01, 6);
    expect(loadExtra().count).toBe(stars.count);
    expect(loadNamesJson().count).toBe(stars.count);
  });

  it('is sorted brightest first as seen from the Sun', () => {
    // A plain loop and one assertion at the end: an expect per star (330,000 of them) can take
    // longer than a test is given on a busy machine.
    const P = stars.positions;
    let prev = -Infinity;
    let worst = 0;
    let worstAt = -1;
    for (let i = 0; i < stars.count; i++) {
      const V = stars.absMag[i] + 5 * Math.log10(Math.hypot(P[3 * i], P[3 * i + 1], P[3 * i + 2])) - 5;
      if (prev - V > worst) {
        worst = prev - V;
        worstAt = i;
      }
      prev = Math.max(prev, V);
    }
    // absMag is rounded to 0.01 mag, so allow that much disorder
    expect(worst, `star ${worstAt} is brighter than one before it`).toBeLessThan(0.011);
  });

  it('places Sirius first, at 2.639 pc with its literature temperature', () => {
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
    const i = one('Kapteyns Star');
    expect(distanceSource(stars.flags[i])).toBe(DistanceSource.GaiaDR3);
    // Gaia DR3 parallax 254.1986 mas at J2016.0; at J2000 the star (RV +245 km/s) was 0.004 pc closer
    expect(Math.abs(len(pos(i)) - (1000 / 254.1986 - 16 * 245.05 * 1.0227e-6))).toBeLessThan(0.001);
    expect(distancePrecision(stars.flags[i])).toBe(0);
    expect(velocityStatus(stars.flags[i])).toBe(VelocityStatus.Full);
  });

  it('flags Betelgeuse as a Hipparcos distance with a large uncertainty', () => {
    const i = one('Betelgeuse');
    expect(distanceSource(stars.flags[i])).toBe(DistanceSource.Hipparcos);
    expect(distancePrecision(stars.flags[i])).toBe(2); // 6.55 ± 0.83 mas: 13%
    expect(len(pos(i))).toBeCloseTo(152.7, 0);
    expect(stars.teff[i]).toBe(3600);
  });

  it("gives Barnard's Star its space velocity (~142.6 km/s), approaching at 110.5 km/s", () => {
    const i = one("Barnard's Star");
    expect(len(vel(i))).toBeGreaterThan(141);
    expect(len(vel(i))).toBeLessThan(144);
    const p = pos(i);
    const v = vel(i);
    expect((v[0] * p[0] + v[1] * p[1] + v[2] * p[2]) / len(p)).toBeCloseTo(-110.5, 0);
  });

  it('uses J2000 ecliptic axes: Polaris is 0.74° from the celestial pole', () => {
    const p = pos(one('Polaris'));
    expect(raDecFromVector(eclipticToEquatorial(p)).decDeg).toBeCloseTo(89.264, 2);
    const pole: Vec3 = [0, Math.sin(OBLIQUITY_J2000), Math.cos(OBLIQUITY_J2000)];
    const c = (p[0] * pole[0] + p[1] * pole[1] + p[2] * pole[2]) / len(p);
    expect((Math.acos(c) * 180) / Math.PI).toBeCloseTo(0.736, 2);
  });

  it('adds TRAPPIST-1 from Gaia DR3', () => {
    const i = one('TRAPPIST-1');
    expect(isAdded(stars.flags[i])).toBe(true);
    expect(len(pos(i))).toBeCloseTo(1000 / 80.2123, 2);
    expect(stars.teff[i]).toBe(2570);
  });

  it('stores velocities for >85% of stars and none absurd', () => {
    let full = 0;
    let maxSpeed = 0;
    for (let i = 0; i < stars.count; i++) {
      if (velocityStatus(stars.flags[i]) === VelocityStatus.Full) full++;
      maxSpeed = Math.max(maxSpeed, len(vel(i)));
    }
    expect(full / stars.count).toBeGreaterThan(0.85);
    expect(maxSpeed).toBeLessThanOrEqual(1000);
  });

  it('puts bright stars at their J2000 positions (SIMBAD, to 0.2″)', () => {
    const ref: [string, number, number][] = [
      ['Arcturus', 213.915300294925, 19.1824091615312],
      ['Vega', 279.234734787025, 38.783688956244],
      ['Altair', 297.69582729638694, 8.868321196436963],
      ['Pollux', 116.32895777437875, 28.02619889009357],
      ['Fomalhaut', 344.4126927211701, -29.622237033389442],
    ];
    for (const [name, ra, dec] of ref) {
      const q = raDecFromVector(eclipticToEquatorial(pos(one(name))));
      const sep = Math.hypot((q.raDeg - ra) * Math.cos((dec * Math.PI) / 180), q.decDeg - dec) * 3600;
      expect(sep, name).toBeLessThan(0.2);
    }
  });

  it('links systems.json catalogue indices to the right stars', () => {
    for (const s of loadSystems().stars) {
      if (s.catalogueIndex == null) continue;
      expect(inSystems(stars.flags[s.catalogueIndex]), s.id).toBe(true);
      if (s.catalogueDistancePc) expect(len(pos(s.catalogueIndex))).toBeCloseTo(s.catalogueDistancePc, 3);
    }
  });

  it('decodes through gunzipIfNeeded (DecompressionStream), like the browser', async () => {
    const gz = readBytes('public/data/stars3d-extra.bin.gz');
    const ab = gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) as ArrayBuffer;
    const out = await gunzipIfNeeded(ab);
    expect(out.byteLength).toBe(gunzipFile('public/data/stars3d-extra.bin.gz').byteLength);
    // an already-decompressed buffer passes through unchanged
    expect(await gunzipIfNeeded(out)).toBe(out);
  });

  it('refuses a file that is not a catalogue', () => {
    expect(() => decodeStars3D(new ArrayBuffer(64))).toThrow(/magic/);
    expect(() => decodeStars3D(new ArrayBuffer(8))).toThrow(/short/);
  });
});

describe('stars3d-bright.bin.gz (the first frames)', () => {
  const bright = loadBrightStars();

  it('is the naked-eye head of the full catalogue, star for star', () => {
    expect(bright.count).toBe(9_959);
    // Compared in a plain loop, with one assertion: the first star that differs, if any.
    let differs = -1;
    for (let i = 0; i < bright.count && differs < 0; i++) {
      for (let k = 0; k < 3; k++) {
        if (bright.positions[3 * i + k] !== stars.positions[3 * i + k] || bright.velocitiesInt16[3 * i + k] !== stars.velocitiesInt16[3 * i + k]) differs = i;
      }
      if (bright.absMagInt16[i] !== stars.absMagInt16[i] || bright.teff[i] !== stars.teff[i] || bright.flags[i] !== stars.flags[i]) differs = i;
    }
    expect(differs, 'first star that differs').toBe(-1);
    // Every star to V = 6.6 is in it, and the next one is fainter.
    expect(vFromSun(bright.count - 1)).toBeLessThanOrEqual(6.6 + 0.005);
    expect(vFromSun(bright.count)).toBeGreaterThan(6.6);
  });
});

describe('the sky from Earth matches the one it replaced (HYG v4.4, V ≤ 6.5)', () => {
  const old = readJson<{ magBins: number[]; magCounts: number[]; teffBins: number[]; teffCounts: number[]; brightest: [number, number, number, number][] }>(
    'src/sim/stars/__fixtures__/hyg-naked-eye.json',
  );
  const bin = (bins: number[], v: number) => bins.findIndex((b, k) => k < bins.length - 1 && v >= b && v < bins[k + 1]);

  it('has as many stars at each magnitude', () => {
    const counts = old.magCounts.map(() => 0);
    for (let i = 0; i < stars.count; i++) {
      const k = bin(old.magBins, vFromSun(i));
      if (k >= 0) counts[k]++;
    }
    counts.forEach((c, k) => expect(Math.abs(c - old.magCounts[k]), `V ${old.magBins[k]}–${old.magBins[k + 1]}`).toBeLessThanOrEqual(Math.max(3, 0.05 * old.magCounts[k])));
  });

  it('has the same spread of colours', () => {
    const counts = old.teffCounts.map(() => 0);
    for (let i = 0; i < stars.count; i++) {
      if (vFromSun(i) > 6.5) continue;
      const k = bin(old.teffBins, stars.teff[i] || 5772);
      if (k >= 0) counts[k]++;
    }
    counts.forEach((c, k) => expect(Math.abs(c - old.teffCounts[k]), `T ${old.teffBins[k]}–${old.teffBins[k + 1]} K`).toBeLessThanOrEqual(Math.max(12, 0.06 * old.teffCounts[k])));
  });

  it('puts the 100 brightest stars where they were (within 30″)', () => {
    let matched = 0;
    for (const [x, y, z] of old.brightest) {
      const n = Math.hypot(x, y, z); // the fixture rounds to 7 digits: renormalise, or acos near 1 loses arcminutes
      const ecl: Vec3 = [x / n, -z / n, y / n]; // world (x, z, −y) → ecliptic
      let best = 1;
      for (let i = 0; i < 300; i++) {
        const q = pos(i);
        // The angle from the chord: accurate at arcseconds, where acos is not.
        const l = len(q);
        const chord = Math.hypot(ecl[0] - q[0] / l, ecl[1] - q[1] / l, ecl[2] - q[2] / l);
        best = Math.min(best, 2 * Math.asin(chord / 2));
      }
      if (((best * 180) / Math.PI) * 3600 < 30) matched++;
    }
    // components merged or split differently in the two catalogues account for the few misses
    expect(matched).toBeGreaterThanOrEqual(95);
  });
});
