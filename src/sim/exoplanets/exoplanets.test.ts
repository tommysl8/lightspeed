/**
 * The planets of other stars in the body registry, from the shipped files: the eleven featured
 * systems about the star team's stars (and the three hosts they bring), exactly where the
 * evaluator puts them; transits seen from the Sun at their published times; HR 8799's planets on
 * their measured orbit plane; the labels, colours and notes of the cards; the archive catalogue
 * matched to the star catalogue, its planets given to the star bodies, and any planet found by
 * name ("K2-18 b") with its host registered from the archive and released again when left behind.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { AU_KM, C_KM_S, PARSEC_KM, SUN_RADIUS_KM } from '../../physics/constants';
import { loadExtra, loadNames, loadStars, loadSystems } from '../../test/stars';
import { loadExoplanetFile, loadFeaturedFile } from '../../test/exoplanets';
import { articleForBody } from '../../content/bodyArticles';
import { findDestination, nestedDestinations, searchDestinations } from '../../content/destinations';
import { exoplanetDestinations } from '../../content/exoplanetDestinations';
import { flightOf, resolveTarget, runScene, sceneStatus } from '../../content/scenes';
import { controller } from '../../controls/cameraController';
import { systemFramingDistance } from '../../controls/framing';
import { orbitMu, orbitSource, type OrbitSource } from '../../scene/orbitLines';
import { stateToOrbit } from '../../physics/kepler';
import { locationPath } from '../../ui/location';
import { planetHostsShown } from '../../ui/planetHosts';
import { useUI } from '../../state/ui';
import { exoplanetDiscoveryLine, exoplanetOrbitLine, exoplanetPhysicalLine } from '../../ui/exoplanetText';
import { updateEphemeris } from '../ephemeris';
import { updateApparentPositions } from '../lightDelay';
import { apparentMagnitude } from '../derived';
import { setSimTime, sim } from '../sim';
import { bodyAvailability, bodyPositionAt, childrenOf, getBody, isBody, type BodyRecord } from '../bodies';
import { entryOf } from '../bodies/registry';
import { registerStars, starData } from '../stars/load';
import { J2000_JD } from './constants';
import { PLANET_FLAGS, known, matchHosts, type StarCatalogueKeys } from './catalogue';
import { findSystem, type FeaturedSystem } from './featured';
import { offsetEclipticKm } from './orbit';
import { skyToEcliptic } from './sky';
import { planetLook } from './appearance';
import { FEATURED_HOSTS, KEPLER16_BARYCENTRE, NO_IMAGE_NOTE, featuredPlanetId, featuredShown, greekBayer } from './records';
import {
  FEATURED_ARCHIVE_HOSTS,
  RELEASE_HOST_PC,
  archiveHosts,
  ensureHost,
  exoplanetData,
  featuredBodyIds,
  hostBodyId,
  hostDistanceKm,
  planetBodyId,
  registerFeatured,
  setCatalogue,
  updateExoplanets,
} from './load';

const stars = loadStars();
const names = loadNames();
const featured = loadFeaturedFile();
const cat = loadExoplanetFile();
const sys = (id: string) => findSystem(featured, id) as FeaturedSystem;

const J2000_MS = Date.UTC(2000, 0, 1, 12);
/** Set the clock to a TT Julian date exactly (the UTC clock is offset by ΔT). */
function atJd(jdTT: number): void {
  const ms = J2000_MS + (jdTT - J2000_JD) * 86_400_000;
  setSimTime(ms);
  setSimTime(ms + (jdTT - J2000_JD - sim.astroTime.tt) * 86_400_000);
  updateEphemeris();
}
const EPOCH_JD = 2_461_041.5; // 2026-01-01 TDB, the featured file's epoch

/** World (x, z_ecl, −y_ecl) from J2000 ecliptic. */
const world = (v: { x: number; y: number; z: number }) => new Vector3(v.x, v.z, -v.y);

/** What the matcher needs from the star catalogue (as load.ts hands the worker). */
function starKeys(): StarCatalogueKeys {
  return {
    count: stars.count,
    positions: stars.positions,
    absMag: stars.absMag,
    hip: { star: names.hip.star, id: names.hip.id },
    hd: { star: names.hd.star, id: names.hd.id },
  };
}

beforeAll(() => {
  starData.stars = stars;
  starData.full = true;
  starData.names = names;
  starData.extra = loadExtra();
  registerStars(loadSystems(), stars);
  registerFeatured(featured);
  atJd(EPOCH_JD);
});

/** Every featured planet shown, with its registry id. */
const shownPlanets = () => featured.systems.flatMap((s) => s.planets.filter(featuredShown).map((p) => ({ s, p, id: featuredPlanetId(s, p) })));

describe('the featured systems', () => {
  it('are registered about their hosts: the star team’s stars, and Kepler-90, TOI-700 and the Kepler-16 pair', () => {
    const planets = shownPlanets();
    expect(planets).toHaveLength(36); // 38 less Proxima c (disputed, hidden) and Tau Ceti e (refuted)
    for (const { s, id } of planets) {
      const r = getBody(id)!;
      expect(r, id).toBeDefined();
      expect(r.kind).toBe('exoplanet');
      expect(r.parent).toBe(FEATURED_HOSTS[s.id]);
      expect(r.detector).toBe(false);
      expect(r.article).toBe('other-worlds');
      expect(articleForBody(id)).toBe('other-worlds');
    }
    expect(childrenOf('trappist-1').map((r) => r.id)).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h'].map((l) => `trappist-1-${l}`));
    expect(isBody('proxima-c')).toBe(false);
    expect(isBody('tau-ceti-e')).toBe(false);
    for (const id of ['kepler-90', 'toi-700', 'kepler-16', 'kepler-16-b']) expect(getBody(id)?.kind, id).toBe('star');
    expect(getBody('kepler-16-ab-b')?.centre).toBe('kepler-16-barycentre');
    expect(featuredBodyIds()).toHaveLength(36 + 5);
  });

  it('use the star team’s Alpha Centauri A and B, adding only the candidate S1 about A', () => {
    const s1 = getBody('alpha-centauri-a-s1')!;
    expect(s1.parent).toBe('alpha-centauri-a');
    expect(s1.kindText).toBe('Candidate planet of Alpha Centauri A');
    expect(s1.exoplanet?.status).toBe('candidate');
    expect(bodyAvailability('alpha-centauri-a-s1', sim.timeMs).regime).toBe('illustrative');
    expect(s1.positionNote).toMatch(/illustrative orbit/);
    // Nothing else of the featured file's α Cen system is registered.
    expect(featuredBodyIds().filter((id) => id.startsWith('alpha-centauri'))).toEqual(['alpha-centauri-a-s1']);
    expect(getBody('alpha-centauri-a')?.centre).toBe('alpha-centauri-ab-barycentre');
  });

  it('resolve every featured host as a scene target, the articles’ ones included', () => {
    for (const id of ['trappist-1', 'hr-8799', '51-pegasi', 'kepler-90', 'toi-700', 'kepler-16', 'barnards-star', 'proxima', 'epsilon-eridani', 'tau-ceti', 'alpha-centauri-a']) {
      expect(resolveTarget(id), id).not.toBeNull();
      expect(sceneStatus(`go:${id}`).ok, id).toBe(true);
    }
    for (const id of ['trappist-1-e', 'hr-8799-b', '51-pegasi-b', 'kepler-16-ab-b']) expect(resolveTarget(id), id).not.toBeNull();
    expect(locationPath('orbit', 'trappist-1-e').map((c) => c.label)).toEqual(['Solar neighbourhood', 'TRAPPIST-1', 'TRAPPIST-1 e']);
    for (const id of ['hr-8799', '51-pegasi', 'kepler-90', 'toi-700', 'kepler-16']) expect(articleForBody(id), id).toBe('other-worlds');
    // "See it" on a star with planets frames the whole system, orbits shown: HR 8799's outermost at 70 au.
    expect(runScene('go:hr-8799')).toBe(true);
    const move = (controller as unknown as { tr: { toBody: string; w1: number } | null }).tr!;
    expect(move.toBody).toBe('hr-8799');
    expect(move.w1).toBe(systemFramingDistance('hr-8799'));
    expect(move.w1 / AU_KM).toBeGreaterThan(150);
    expect(useUI.getState().showOrbits).toBe(true);
  });

  it('sit exactly where the evaluator puts them, on the observed clock t + D/c', () => {
    for (const jd of [EPOCH_JD, 2_460_501.4, 2_470_000.25]) {
      atJd(jd);
      for (const { s, p, id } of shownPlanets()) {
        const centre = s.id === 'kepler-16' ? 'kepler-16-barycentre' : FEATURED_HOSTS[s.id];
        const host = bodyPositionAt(centre, sim.astroTime);
        const want = world(offsetEclipticKm(p.orbit, s.position.raDeg, s.position.decDeg, host.length(), sim.astroTime.tt + J2000_JD));
        const got = sim.bodies[id].pos.clone().sub(host);
        // To 100 m (the evaluator's Julian dates resolve 40 µs; the provider counts days from J2000),
        // plus the float64 resolution of heliocentric kilometres tens of parsecs out (0.25 km at 41 pc).
        expect(got.distanceTo(want), `${id} at JD ${jd}`).toBeLessThan(0.1 + 4e-16 * host.length());
      }
    }
    atJd(EPOCH_JD);
  });

  it('show a transiting planet in front of its star from the Sun at the published transit (TRAPPIST-1 b and c by JWST; TOI-700 d and e)', () => {
    const cases: [string, string, number, number][] = [
      // id, host, BJD_TDB of mid-transit, stellar radius (R☉)
      ['trappist-1-b', 'trappist-1', 2_460_501.405_464, 0.1192], // Rathcke et al. 2025
      ['trappist-1-c', 'trappist-1', 2_460_501.385_348, 0.1192],
      ['toi-700-d', 'toi-700', 2_460_763.016_12, 0.421], // Pass et al. 2026
      ['toi-700-e', 'toi-700', 2_460_772.463_43, 0.421],
    ];
    for (const [id, host, jd, rStar] of cases) {
      atJd(jd);
      sim.camera.pos.set(0, 0, 0);
      updateApparentPositions(true);
      const star = sim.bodies[host].apparentPos;
      const los = star.clone().normalize();
      const d = sim.bodies[id].apparentPos.clone().sub(star);
      const along = d.dot(los);
      const across = d.clone().addScaledVector(los, -along).length();
      expect(along, `${id} nearer the Sun than its star`).toBeLessThan(0);
      expect(across / (rStar * SUN_RADIUS_KM), `${id} on the disc`).toBeLessThan(0.75);
      // Half an orbit later it is behind the star.
      const P = getBody(id)!.physical.orbitalPeriodD!;
      atJd(jd + P / 2);
      updateApparentPositions(true);
      expect(sim.bodies[id].apparentPos.clone().sub(sim.bodies[host].apparentPos).dot(los), `${id} behind`).toBeGreaterThan(0);
    }
    atJd(EPOCH_JD);
  });

  it('put HR 8799’s four planets on their measured orbit plane (Wang et al. 2018: i = 26.8°, Ω = 67.9°), turning counterclockwise on the sky', () => {
    const s = sys('hr-8799');
    const i = (26.8 * Math.PI) / 180;
    const O = (67.9 * Math.PI) / 180;
    // The orbit normal (along the angular momentum) in sky components: for i < 90° it points at the Sun.
    const N = world(skyToEcliptic(s.position.raDeg, s.position.decDeg, { north: -Math.sin(O) * Math.sin(i), east: Math.cos(O) * Math.sin(i), away: -Math.cos(i) }));
    const host = sim.bodies['hr-8799'];
    for (const l of ['b', 'c', 'd', 'e']) {
      const b = sim.bodies[`hr-8799-${l}`];
      const r = b.pos.clone().sub(host.pos);
      const v = b.vel.clone().sub(host.vel);
      const h = r.clone().cross(v).normalize();
      expect(h.angleTo(N), l).toBeLessThan(1e-9);
      expect(getBody(`hr-8799-${l}`)!.exoplanet!.inclDeg).toBeCloseTo(26.8, 6);
    }
    // All four share the plane, and the line of sight makes 26.8° with its normal.
    const toSun = world(skyToEcliptic(s.position.raDeg, s.position.decDeg, { north: 0, east: 0, away: -1 }));
    expect((N.angleTo(toSun) * 180) / Math.PI).toBeCloseTo(26.8, 9);
    // Their periods follow from Kepler's third law about 1.47 M☉: b, the outermost, takes ~ 400 years.
    const Pb = getBody('hr-8799-b')!.physical.orbitalPeriodD! / 365.25;
    expect(Pb).toBeGreaterThan(350);
    expect(Pb).toBeLessThan(500);
  });

  it('place the Kepler-16 pair so that B eclipses A seen from the Sun at a Kepler primary eclipse', () => {
    atJd(2_454_965.657_634 + 20 * 41.077_586_7);
    sim.camera.pos.set(0, 0, 0);
    updateApparentPositions(true);
    const A = sim.bodies['kepler-16'].apparentPos;
    const B = sim.bodies['kepler-16-b'].apparentPos;
    const los = A.clone().normalize();
    const d = B.clone().sub(A);
    const along = d.dot(los);
    expect(along).toBeLessThan(0);
    expect(d.addScaledVector(los, -along).length()).toBeLessThan((0.6489 + 0.2255) * SUN_RADIUS_KM);
    atJd(EPOCH_JD);
  });

  it('carry what is known and what is assumed on their cards', () => {
    for (const { id } of shownPlanets()) {
      const r = getBody(id)!;
      expect(r.modelNotes?.[0], id).toBe(NO_IMAGE_NOTE);
      expect(r.positionNote, id).toMatch(/^Position: /);
      expect(r.exoplanet!.colourRule.length, id).toBeGreaterThan(10);
    }
    expect(NO_IMAGE_NOTE).toBe('No image of this planet exists; colour is illustrative.');
    // Assumed angles are said to be assumed.
    expect(getBody('proxima-b')!.modelNotes).toEqual(expect.arrayContaining([expect.stringMatching(/Inclination assumed \(47°\)/)]));
    expect(getBody('barnards-star-b')!.modelNotes).toEqual(expect.arrayContaining([expect.stringMatching(/orientation of its orbit on the sky is not measured/)]));
    expect(getBody('hr-8799-b')!.modelNotes!.join(' ')).not.toMatch(/assumed/);
    // Candidates and disputed planets are labelled.
    expect(getBody('tau-ceti-g')!.kindText).toBe('Disputed planet of Tau Ceti');
    expect(getBody('tau-ceti-g')!.modelNotes).toEqual(expect.arrayContaining(['Position along its orbit unknown: the paper gives no date for its phase.']));
    expect(bodyAvailability('tau-ceti-g', sim.timeMs).regime).toBe('illustrative');
    expect(bodyAvailability('trappist-1-e', sim.timeMs).regime).toBe('approximate');
    // The card's lines.
    const e = getBody('trappist-1-e')!.exoplanet!;
    expect(exoplanetPhysicalLine(e)).toMatch(/^0\.9\d+ R⊕ · 0\.69\d M⊕ · \d+ K$/);
    expect(exoplanetOrbitLine(e)).toMatch(/^A year of 6\.1\d days, 0\.029\d au from its star$/);
    expect(exoplanetDiscoveryLine(e)).toMatch(/^Found in 2017 by the transit method/);
    expect(getBody('51-pegasi-b')!.aliases).toContain('Dimidium');
    // Each source is named once (Agol et al.'s paper and its forecast table are one reference).
    expect(getBody('trappist-1-e')!.positionNote!.startsWith('Position: a Kepler orbit (Agol et al. 2021), timed so that the Sun sees it as observed; ')).toBe(true);
    expect(getBody('trappist-1-e')!.factSourceLabels).toEqual(['Gillon et al. 2017', 'Agol et al. 2021']);
    expect(exoplanetPhysicalLine(getBody('51-pegasi-b')!.exoplanet!)).toMatch(/0\.61\d? Jupiter masses/);
  });

  it('are coloured by a stated rule from their size and equilibrium temperature', () => {
    expect(planetLook(110, 11, 318).rule).toMatch(/class I \(ammonia/);
    expect(planetLook(1250, 13, 190).rule).toMatch(/class IV/);
    expect(planetLook(900, 1.0, 1).rule).toMatch(/hot bare rock/);
    expect(planetLook(250, 1.0, 1).rule).toMatch(/temperate rock/);
    expect(planetLook(NaN, 1.0, 1).rule).toMatch(/unknown/);
    // A heavy planet whose radius is only estimated counts as a giant by its mass.
    expect(planetLook(200, 3, 300, false).rule).toMatch(/^Giant/);
    for (const { id } of shownPlanets()) {
      const r = getBody(id)!;
      const x = r.exoplanet!;
      const look = planetLook(x.teqK ?? NaN, x.radiusEarth, x.massEarth ?? null, x.radiusSource === 'measured');
      expect(r.physical.colour, id).toBe(look.colour);
      expect(r.physical.geometricAlbedo, id).toBe(look.albedo);
    }
    expect(getBody('51-pegasi-b')!.exoplanet!.colourRule).toMatch(/class IV/);
    expect(getBody('hr-8799-b')!.exoplanet!.colourRule).toMatch(/^Giant at 1200 K: .*, by the temperature of its own glow$/);
  });

  it('say when a temperature is a young giant’s own glow, not the warmth of its star', () => {
    for (const l of ['b', 'c', 'd', 'e']) expect(getBody(`hr-8799-${l}`)!.exoplanet!.teqSource, l).toBe('own-heat');
    expect(exoplanetPhysicalLine(getBody('hr-8799-b')!.exoplanet!)).toMatch(/ · 1200 K glow$/);
    expect(getBody('trappist-1-e')!.exoplanet!.teqSource).toBe('published');
    expect(getBody('epsilon-eridani-b')!.exoplanet!.teqSource).toBe('computed');
  });

  it('shine with their own star’s light: TRAPPIST-1 e is fainter than magnitude 25 from the Sun', () => {
    atJd(EPOCH_JD);
    sim.camera.pos.set(0, 0, 0);
    updateApparentPositions(true);
    const m = apparentMagnitude('trappist-1-e', sim.bodies['trappist-1-e'].apparentPos.length());
    expect(m).toBeGreaterThan(25);
    expect(m).toBeLessThan(40);
  });

  it('draw their orbit lines as their Kepler ellipses', () => {
    const so = sys('kepler-16').starOrbit!;
    const want: Record<string, number> = { 'kepler-16-b': so.orbit.aAu * (1 - so.massFractionSecondary) * AU_KM, 'kepler-16': so.orbit.aAu * so.massFractionSecondary * AU_KM };
    for (const id of ['trappist-1-h', 'hr-8799-e', 'kepler-16-ab-b', 'epsilon-eridani-b', 'kepler-16', 'kepler-16-b']) {
      const e = entryOf(id)!;
      const s = orbitSource(e, { rel: e, centre: null, view: null } satisfies OrbitSource);
      expect(s.rel.id, id).toBe(id);
      const o = stateToOrbit(s.rel.rel.pos.clone(), s.rel.rel.vel.clone(), orbitMu(e, s));
      expect(o.a / (want[id] ?? getBody(id)!.physical.semiMajorAxisKm!), id).toBeCloseTo(1, 9);
    }
  });

  it('put the circumbinary planet under its system, not one of its stars', () => {
    // Kepler-16 is 245 light-years out: in the Milky Way, beyond the neighbourhood.
    expect(locationPath('orbit', 'kepler-16-ab-b').map((c) => c.label)).toEqual(['Milky Way', 'Kepler-16', 'Kepler-16 (AB) b']);
    expect(findDestination('kepler-16-ab-b')!.parent).toBe(KEPLER16_BARYCENTRE);
    const stars = nestedDestinations().find((g) => g.id === 'stars')!.items;
    const k = stars.findIndex((x) => x.destination.id === KEPLER16_BARYCENTRE);
    expect(stars[k].destination.section).toBe('Stars with planets');
    expect(stars.slice(k + 1, k + 1 + stars[k].children).map((x) => x.destination.id).sort()).toEqual(['kepler-16', 'kepler-16-ab-b', 'kepler-16-b'].sort());
    // "kepler-16 b" is the planet; "Kepler-16 B" the second star.
    expect(searchDestinations('kepler-16 b')[0].destination.id).toBe('kepler-16-ab-b');
    expect(searchDestinations('Kepler-16 B')[0].destination.id).toBe('kepler-16-b');
  });

  it('list their planets under the host in Where to?, and take the journey there', () => {
    const d = findDestination('trappist-1-e')!;
    expect(d.group).toBe('exoplanets');
    const stars = nestedDestinations().find((g) => g.id === 'stars')!.items;
    const k = stars.findIndex((x) => x.destination.id === 'trappist-1');
    expect(stars[k].children).toBe(7);
    expect(stars.slice(k + 1, k + 8).map((x) => [x.destination.id, x.depth])).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h'].map((l) => [`trappist-1-${l}`, stars[k].depth + 1]));
    // Going there frames the star's system, with the planet selected.
    d.go();
    expect(useUI.getState().selected).toBe('trappist-1-e');
    expect(useUI.getState().focus).toBe('trappist-1');
    expect(flightOf('trappist-1-worlds')).toMatchObject({ dest: 'trappist-1', drive: 'rocket' });
    expect(sceneStatus('trappist-1-worlds')).toMatchObject({ ok: true, label: 'Seven worlds of TRAPPIST-1' });
  });
});

describe('the archive catalogue', () => {
  beforeAll(() => {
    atJd(EPOCH_JD);
    setCatalogue(cat, matchHosts(cat, starKeys()));
  });

  it('matches about a thousand hosts to the star catalogue, the featured ones to their bodies', () => {
    const m = exoplanetData.matches!;
    const matched = Array.from(m.star).filter((s) => s >= 0).length;
    expect(matched).toBeGreaterThan(850);
    expect(matched).toBeLessThan(1100);
    for (const [name, sysId] of Object.entries(FEATURED_ARCHIVE_HOSTS)) {
      const h = cat.hosts.name.indexOf(name);
      expect(h, name).toBeGreaterThanOrEqual(0);
      expect(hostBodyId(h), name).toBe(FEATURED_HOSTS[sysId]);
      // Each of its archive planets is a featured planet (hidden ones aside).
      for (let i = cat.hosts.firstPlanet[h]; i < cat.hosts.firstPlanet[h] + cat.hosts.planetCount[h]; i++) {
        expect(isBody(planetBodyId(i)), cat.planets.name[i]).toBe(true);
      }
    }
    // The matched hosts include the named stars that have planets.
    const gj581 = cat.hosts.name.indexOf('GJ 581');
    expect(hostBodyId(gj581)).toBe('gliese-581');
  });

  it('gives every star body the archive lists as a host its planets', async () => {
    await Promise.resolve(); // the registry listener runs on a microtask
    const kids = childrenOf('gliese-581');
    // Named after the star as the app names it, with the archive's name kept as an alias.
    expect(kids.map((r) => r.name)).toEqual(expect.arrayContaining(['Gliese 581 b', 'Gliese 581 c', 'Gliese 581 e']));
    const c = kids.find((r) => r.name === 'Gliese 581 c')!;
    expect(c.aliases).toContain('GJ 581 c');
    expect(c.exoplanet?.archiveName).toBe('GJ 581 c');
    for (const r of kids) {
      expect(r.kind).toBe('exoplanet');
      expect(r.modelNotes?.[0]).toBe(NO_IMAGE_NOTE);
      expect(r.modelNotes).toEqual(expect.arrayContaining(['The orientation of its orbit on the sky is not measured: assumed.']));
    }
    // Planets of the featured hosts are not registered twice.
    expect(childrenOf('epsilon-eridani').map((r) => r.id)).toEqual(['epsilon-eridani-b']);
  });

  it('finds any planet by name, and going there registers its faint host from the archive', () => {
    const hits = exoplanetDestinations('K2-18 b');
    expect(hits[0].name).toBe('K2-18 b');
    expect(hits[0].kind).toBe('Planet of K2-18');
    const h = cat.hosts.name.indexOf('K2-18');
    expect(exoplanetData.matches!.star[h]).toBe(-1); // too faint for the star catalogue
    expect(hits[0].unavailable()).toBeNull();
    const before = hits[0].distanceKm();
    expect(before / PARSEC_KM).toBeCloseTo(cat.hosts.dist[h], 1);
    hits[0].go();
    expect(isBody('k2-18')).toBe(true);
    expect(archiveHosts().has('k2-18')).toBe(true);
    expect(sim.bodies['k2-18'].pos.length() / PARSEC_KM).toBeCloseTo(cat.hosts.dist[h], 1);
    expect(hostDistanceKm(h) / before).toBeCloseTo(1, 4);
    const b = getBody('k2-18-b')!;
    expect(b.parent).toBe('k2-18');
    const x = b.exoplanet!;
    expect(x.periodD).toBeCloseTo(32.94, 1);
    expect(x.method).toBe('Transit');
    expect(x.year).toBe(2015);
    expect(x.facility).toBe('K2');
    expect(x.radiusSource).toBe('measured');
    expect(x.teqK).toBeGreaterThan(200);
    expect(exoplanetDiscoveryLine(x)).toBe('Found in 2015 by the transit method, K2.');
    expect(getBody('k2-18')!.modelNotes).toEqual(expect.arrayContaining(['Not in the star catalogue (too faint): placed from the NASA Exoplanet Archive.']));
    expect(articleForBody('k2-18')).toBe('other-worlds');
    // Found by its host's name too.
    expect(exoplanetDestinations('K2-18').map((d) => d.id)).toEqual(expect.arrayContaining(['k2-18', 'k2-18-b']));
  });

  it('names planets after the app’s named stars, and spells the archive’s Bayer abbreviations out', async () => {
    await Promise.resolve();
    // "alf Tau b" under Aldebaran, "GJ 887 b" under Lacaille 9352: the card, the list and the trail agree.
    for (const [host, want] of [
      ['aldebaran', 'Aldebaran b'],
      ['lacaille-9352', 'Lacaille 9352 b'],
      ['pollux', 'Pollux b'],
    ] as const) {
      const names = childrenOf(host).map((r) => r.name);
      expect(names, host).toContain(want);
    }
    expect(locationPath('orbit', childrenOf('aldebaran')[0].id).map((c) => c.label).slice(-2)).toEqual(['Aldebaran', 'Aldebaran b']);
    // Lalande 21185's planets are "GJ 411 b" and "HD 95735 c" in the archive: one star, one name here.
    expect(childrenOf('lalande-21185').map((r) => r.name).sort()).toEqual(['Lalande 21185 b', 'Lalande 21185 c']);
    // Found by the archive's names too.
    expect(findDestination(childrenOf('aldebaran')[0].id)!.aliases).toContain('alf Tau b');
    // A star registered on demand keeps the archive's names, with Greek letters.
    expect(greekBayer('iot Dra b')).toBe('ι Dra b');
    expect(greekBayer('psi1 Dra B b')).toBe('ψ¹ Dra B b');
    expect(greekBayer('HD 209458 b')).toBe('HD 209458 b');
    const hit = exoplanetDestinations('iot Dra b')[0];
    expect(hit.name).toBe('ι Dra b');
    expect(hit.aliases).toContain('iot Dra b');
  });

  it('releases hosts registered from the archive once left behind (not while kept)', () => {
    sim.camera.pos.copy(sim.bodies['k2-18'].pos);
    for (let k = 0; k < 60; k++) updateExoplanets(() => false, 'k2-18');
    expect(isBody('k2-18')).toBe(true);
    sim.camera.pos.set(0, 0, 0);
    for (let k = 0; k < 60; k++) updateExoplanets((id) => id === 'k2-18', 'sun');
    expect(isBody('k2-18')).toBe(true);
    for (let k = 0; k < 60; k++) updateExoplanets(() => false, 'sun');
    expect(isBody('k2-18')).toBe(false);
    expect(isBody('k2-18-b')).toBe(false);
    expect(RELEASE_HOST_PC).toBeLessThan(1);
    // And it can come back.
    expect(ensureHost(cat.hosts.name.indexOf('K2-18'))).toBe('k2-18');
    expect(isBody('k2-18-b')).toBe(true);
  });

  it('shows the Sun each archived transit (a sample across the catalogue) with the planet in front of its star', () => {
    let checked = 0;
    const P = cat.planets;
    for (let i = 0; i < P.count && checked < 60; i += 97) {
      const h = P.host[i];
      if (!(P.flags[i] & PLANET_FLAGS.TRANSITS) || !known(P.tconj[i]) || !known(cat.hosts.radius[h]) || !known(cat.hosts.dist[h])) continue;
      const host = ensureHost(h);
      const id = planetBodyId(i);
      if (!host || !isBody(id) || getBody(id)!.parent !== host) continue;
      // The light that reaches the Sun at the transit time left D/c before it: t + D(t)/c = t_conj.
      let t = P.tconj[i];
      for (let k = 0; k < 3; k++) {
        atJd(t);
        t = P.tconj[i] - bodyPositionAt(host, sim.astroTime).length() / C_KM_S / 86_400;
      }
      atJd(t);
      const hp = bodyPositionAt(host, sim.astroTime);
      const d = bodyPositionAt(id, sim.astroTime).sub(hp);
      const los = hp.clone().normalize();
      const along = d.dot(los);
      const rStar = cat.hosts.radius[h] * SUN_RADIUS_KM;
      const k = ((known(P.radius[i]) ? P.radius[i] : 0) * 6_378.1) / rStar;
      expect(along, cat.planets.name[i]).toBeLessThan(0);
      expect(d.addScaledVector(los, -along).length() / rStar, cat.planets.name[i]).toBeLessThan(1 + k + 1e-6);
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
    atJd(EPOCH_JD);
  });

  it('gives every archive planet a unique id, distinct from its host’s', () => {
    const ids = new Set<string>();
    for (let i = 0; i < cat.planets.count; i++) {
      const id = planetBodyId(i);
      expect(ids.has(id), id).toBe(false);
      ids.add(id);
    }
    const hostIds = new Set<string>();
    for (let h = 0; h < cat.hosts.count; h++) {
      const id = hostBodyId(h);
      expect(ids.has(id), cat.hosts.name[h]).toBe(false);
      expect(hostIds.has(id), cat.hosts.name[h]).toBe(false);
      hostIds.add(id);
      // A host registered from the archive never takes the id of a body that is something else.
      if (exoplanetData.matches!.star[h] < 0 && !FEATURED_ARCHIVE_HOSTS[cat.hosts.name[h]]) expect(!getBody(id) || archiveHosts().has(id), id).toBe(true);
    }
  });

  it('rings the hosts in the star catalogue once the camera is among the stars (View › Planet hosts)', () => {
    expect(planetHostsShown('auto', 0)).toBe(false);
    expect(planetHostsShown('auto', 0.5 * PARSEC_KM)).toBe(true);
    expect(planetHostsShown('on', 0)).toBe(true);
    expect(planetHostsShown('off', 10 * PARSEC_KM)).toBe(false);
    // The rings' stars: every matched host, each star once, TRAPPIST-1 and ε Eridani among them.
    const m = exoplanetData.matches!.star;
    const ringed = Array.from(m).filter((s) => s >= 0);
    expect(new Set(ringed).size).toBe(ringed.length);
    for (const id of ['trappist-1', 'epsilon-eridani', 'hr-8799', '51-pegasi', 'barnards-star']) {
      const s = getBody(id)!.star!.catalogueIndex!;
      expect(ringed, id).toContain(s);
    }
  });

  it('writes catalogue planets’ cards from the archive’s data', () => {
    const r = getBody('k2-18-c') as BodyRecord;
    const x = r.exoplanet!;
    expect(x.massKind).toBe('minimum');
    expect(exoplanetPhysicalLine(x)).toMatch(/≥ /);
    expect(r.kindText).toBe('Disputed planet of K2-18');
    expect(r.dataSource).toMatch(/NASA Exoplanet Archive, Planetary Systems Composite Parameters \(doi:10\.26133\/NEA13\)/);
    expect(x.provenance).toEqual(expect.arrayContaining(['Node: assumed']));
    // A directly imaged giant: the archive's temperature is its own glow.
    const h = cat.hosts.name.indexOf('51 Eri');
    const host = ensureHost(h)!;
    expect(host).toMatch(/^star-\d+$/); // a catalogue star, registered on demand
    expect(articleForBody(host)).toBe('other-worlds');
    const eri = getBody(planetBodyId(cat.hosts.firstPlanet[h]))!;
    expect(eri.parent).toBe(host);
    expect(eri.exoplanet!.teqSource).toBe('own-heat');
    expect(eri.exoplanet!.method).toBe('Imaging');
  });
});
