/**
 * The Milky Way layer in the app, from the shipped files: every Galaxy target of the articles
 * resolving, Sagittarius A* and its stars (S2's 16-year orbit, in the registry and as its orbit line
 * draws it), the 1 g flight to the centre, the trail with the spiral arms, the deep-sky groups in the
 * Bodies list and search, the cards' pictures with their credits, the named scenes, and the
 * calibration of the sky from the Sun.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { msFromCivil } from '../../lib/time';
import { gunzipFile } from '../../test/stars';
import { readJson, readText } from '../../test/files';
import { creditSentence } from '../../ui/deepSkyText';
import { resolveTarget, runScene, sceneNote, sceneStatus, cancelSceneStep, S2_ORBIT_WARP } from '../../content/scenes';
import { findDestination, nestedDestinations, searchDestinations } from '../../content/destinations';
import { articleForBody } from '../../content/bodyArticles';
import { locationPath } from '../../ui/location';
import { conicFromState, makeConic, orbitMu, orbitSource, type OrbitSource } from '../../scene/orbitLines';
import { updateEphemeris } from '../ephemeris';
import { planTrip } from '../travel';
import { apparentMagnitude } from '../derived';
import { setSimTime, sim } from '../sim';
import { bodyPositionAt, getBody, isBody } from '../bodies';
import { entryOf, type Entry } from '../bodies/registry';
import { AU_KM, JULIAN_YEAR_S, LIGHT_YEAR_KM, PARSEC_KM } from '../../physics/constants';
import { useUI } from '../../state/ui';
import { parseClusters, type ClustersFile } from './clusters';
import { galaxyState, registerClusters, registerGalaxyCore, registerNebulae, SSTARS } from './load';
import { sgrAFrom, schwarzschildRadiusKm, shadowRadiusKm, type NebulaeFile } from './records';
import { loadOrbits, orbitState } from './sstars';
import nebulaeJson from './nebulae.json';
import { MW_FLUX_PER_SR, modelShare, surfaceBrightness, decodeSvs, HANDOVER_END_PC, displayedLuminance } from './background';

const T0 = msFromCivil(2026, 9, 26, 0);
const nebulae = nebulaeJson as unknown as NebulaeFile;
const clustersFile = JSON.parse(new TextDecoder().decode(gunzipFile('public/data/clusters.json.gz'))) as ClustersFile;

const GALAXY_TARGETS = ['sgr-a-star', 's2', 'orion-nebula', 'crab-nebula', 'eagle-nebula', 'ring-nebula', 'helix-nebula', 'carina-nebula', 'pleiades', 'hyades', 'omega-centauri', '47-tucanae'];

beforeAll(() => {
  registerGalaxyCore();
  registerNebulae(nebulae);
  registerClusters({ clusters: parseClusters(clustersFile) });
  galaxyState.status = 'ready';
  galaxyState.nebulaStatus = 'ready';
  setSimTime(T0);
  updateEphemeris();
});

describe('registration', () => {
  it('resolves every Galaxy target of the articles', () => {
    for (const id of GALAXY_TARGETS) {
      expect(resolveTarget(id), id).not.toBeNull();
      expect(sceneStatus(`go:${id}`).ok, id).toBe(true);
    }
    expect(getBody('pleiades')?.kind).toBe('cluster');
    expect(getBody('omega-centauri')?.kindText).toBe('Globular cluster');
    expect(getBody('crab-nebula')?.kind).toBe('nebula');
    expect(getBody('sgr-a-star')?.kind).toBe('black-hole');
  });

  it('registers the 45 nebulae, the 60 famous open clusters and the named globulars, with no id taken twice', () => {
    for (const n of nebulae.objects) expect(isBody(n.id), n.id).toBe(true);
    const clusters = [...new Set(nestedDestinations().find((g) => g.id === 'clusters')!.items.map((i) => i.destination.id))];
    expect(clusters.length).toBeGreaterThan(90);
    // NGC 3603 and Westerlund 2 are both a nebula and a cluster: the clusters get ids of their own.
    expect(getBody('ngc-3603')?.kind).toBe('nebula');
    expect(getBody('ngc-3603-cluster')?.kind).toBe('cluster');
  });

  it('places a nebula inside another relative to it (the Pillars of Creation in the Eagle)', () => {
    const p = sim.bodies['pillars-of-creation'].pos.clone().divideScalar(PARSEC_KM);
    const want = nebulae.objects.find((o) => o.id === 'pillars-of-creation')!;
    expect(p.length()).toBeCloseTo(Math.hypot(...want.helioGalacticPc), 1);
    expect(getBody('pillars-of-creation')?.parent).toBe('eagle-nebula');
  });
});

describe('Sagittarius A* and the S-stars', () => {
  it('puts Sgr A* 8,277 pc away with the mass and shadow of GRAVITY (2022)', () => {
    const s = sgrAFrom(SSTARS as Parameters<typeof sgrAFrom>[0]);
    expect(sim.bodies['sgr-a-star'].pos.length() / PARSEC_KM).toBeCloseTo(8277, 3);
    expect(schwarzschildRadiusKm(s.massMsun) / AU_KM).toBeCloseTo(0.0848, 3);
    expect(shadowRadiusKm(s.massMsun) / AU_KM).toBeCloseTo(0.2203, 3);
    // Its disc is the shadow; nothing glows.
    expect(getBody('sgr-a-star')!.physical.radiusKm).toBeCloseTo(shadowRadiusKm(s.massMsun), 0);
    expect(sim.bodies['sgr-a-star'].magnitude).toBe(99);
  });

  it('moves S2 on its 16-year orbit about Sgr A*, placed a light-time on from the orbit as seen', () => {
    const s2 = loadOrbits(SSTARS).find((o) => o.id === 'S2')!;
    const lightYears = (8277 * PARSEC_KM) / LIGHT_YEAR_KM;
    const time = sim.astroTime;
    const rel = bodyPositionAt('s2', time).sub(bodyPositionAt('sgr-a-star', time));
    const tObs = 2000 + time.tt / 365.25 + lightYears;
    const want = orbitState(s2, tObs, { fSP: 1 });
    expect(rel.length() / AU_KM).toBeCloseTo(want.rAu, 3);
    // One period later it is back where it was (to within the precession of its pericentre).
    const later = time.AddDays(s2.P * 365.25);
    const rel2 = bodyPositionAt('s2', later).sub(bodyPositionAt('sgr-a-star', later));
    expect(rel2.distanceTo(rel) / rel.length()).toBeLessThan(0.02);
    expect(s2.P).toBeCloseTo(16.045, 2);
  });

  it('draws S2’s orbit line as its Kepler ellipse about Sgr A*', () => {
    const e = entryOf('s2')!;
    const src: OrbitSource = { rel: null as unknown as Entry, centre: null, view: null };
    orbitSource(e, src);
    const conic = conicFromState(src.rel.rel.pos, src.rel.rel.vel, orbitMu(e, src), makeConic());
    expect((2 * Math.PI) / conic.meanMotion / JULIAN_YEAR_S).toBeCloseTo(16.05, 1);
    expect(conic.e).toBeCloseTo(0.8844, 2);
    expect((conic.a * (1 - conic.e)) / AU_KM).toBeGreaterThan(115);
    expect((conic.a * (1 - conic.e)) / AU_KM).toBeLessThan(125);
  });

  it('says where S2 is now is an extrapolation (its light takes 27,000 years)', () => {
    expect(sim.bodies.s2.regime).toBe('illustrative');
    expect(getBody('s2')!.positionNote).toMatch(/27,000 years/);
    expect(getBody('s2')!.modelNotes!.some((n) => /not licensed for reuse/.test(n))).toBe(true);
  });

  it('flies there at 1 g in about 20 years of ship time and 27,000 years at home', () => {
    const plan = planTrip('sgr-a-star', 0, sim.bodies.earth.pos.clone(), sim.astroTime, 'rocket')!;
    expect(plan).not.toBeNull();
    expect(plan.shipTime / JULIAN_YEAR_S).toBeGreaterThan(19.5);
    expect(plan.shipTime / JULIAN_YEAR_S).toBeLessThan(20.5);
    expect(plan.earthTime / JULIAN_YEAR_S).toBeGreaterThan(26_900);
    expect(plan.earthTime / JULIAN_YEAR_S).toBeLessThan(27_100);
    expect(sceneStatus('fly:sgr-a-star').ok).toBe(true);
    expect(sceneNote('fly:sgr-a-star')).toMatch(/about 20 years of your time while about 27,000 years pass/);
  });
});

describe('where you are', () => {
  it('places things in the spiral arms where the arms are measured, and names other galaxies', () => {
    const labels = (id: string) => locationPath('orbit', id).map((c) => c.label);
    expect(labels('orion-nebula')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Orion Nebula']);
    expect(labels('carina-nebula')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Sagittarius–Carina Arm', 'Carina Nebula']);
    expect(labels('pillars-of-creation')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Sagittarius–Carina Arm', 'Eagle Nebula', 'Pillars of Creation']);
    expect(labels('s2')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Sagittarius A*', 'S2']);
    expect(labels('tarantula-nebula')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Large Magellanic Cloud', 'Tarantula Nebula']);
    expect(labels('milky-way')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way']);
    // The Milky Way is a link to the view from outside once its body is registered.
    expect(locationPath('orbit', 'earth')[3]).toEqual({ label: 'Milky Way', to: 'milky-way', galactic: true });
  });
});

describe('lists, search and cards', () => {
  it('groups the Milky Way, the star clusters and the nebulae, with sub-headings and the S-stars under Sgr A*', () => {
    const groups = nestedDestinations();
    const mw = groups.find((g) => g.id === 'milky-way')!.items;
    expect(mw.map((i) => i.destination.id).slice(0, 2)).toEqual(['milky-way', 'sgr-a-star']);
    expect(mw.find((i) => i.destination.id === 's2')?.depth).toBe(1);
    const neb = groups.find((g) => g.id === 'nebulae')!.items;
    expect(neb.filter((i) => i.heading).map((i) => i.heading)).toEqual(['Where stars are born', 'Shed by dying stars', 'In the Magellanic Clouds']);
    expect(neb.find((i) => i.destination.id === 'pillars-of-creation')?.depth).toBe(1);
    const cl = groups.find((g) => g.id === 'clusters')!.items;
    expect(cl.filter((i) => i.heading).map((i) => i.heading)).toEqual(['Open clusters', 'Globular clusters']);
  });

  it('finds deep-sky objects by their other names', () => {
    expect(searchDestinations('M45')[0].destination.id).toBe('pleiades');
    expect(searchDestinations('M42')[0].destination.id).toBe('orion-nebula');
    expect(searchDestinations('Sgr A*')[0].destination.id).toBe('sgr-a-star');
    expect(searchDestinations('omega cen')[0].destination.id).toBe('omega-centauri');
    expect(findDestination('47-tucanae')?.kind).toBe('Globular cluster');
  });

  it('shows each nebula’s picture with its credit line, unaltered, and what was changed', () => {
    for (const n of nebulae.objects) {
      const img = getBody(n.id)!.deepSky!.image!;
      expect(img.credit).toBe(n.credit);
      expect(img.modificationNote).toMatch(/^Image modified for Lightspeed: (cropped, )?resized, black level subtracted and edges faded\.$/);
      expect(img.licence).toBe('CC BY 4.0');
      expect(img.page).toBe(n.imageSource.page);
      // The card explains that the picture is the view from Earth, drawn as a flat card elsewhere.
      expect(getBody(n.id)!.modelNotes!.join(' ')).toMatch(/how the nebula looks from Earth.*flat card/);
    }
  });

  it('credits every picture in CREDITS.md exactly as its archive does, and ends each credit with one full stop', () => {
    const credits = readText('CREDITS.md');
    for (const n of nebulae.objects) {
      // A line break of the archive's credit is a <br> in the Markdown table.
      expect(credits, n.id).toContain(`| ${n.credit.replace(/\n/g, '<br>')} |`);
      const sentence = creditSentence(n.credit);
      expect(sentence.startsWith(n.credit.trimEnd()), n.id).toBe(true);
      expect(sentence.endsWith('.'), n.id).toBe(true);
      expect(sentence.endsWith('..'), n.id).toBe(false);
    }
    expect(creditSentence('ESO/VPHAS+ team. Acknowledgement: CASU')).toBe('ESO/VPHAS+ team. Acknowledgement: CASU.');
    expect(creditSentence('NASA, ESA, and C. Robert O’Dell (Vanderbilt University).')).toBe('NASA, ESA, and C. Robert O’Dell (Vanderbilt University).');
  });

  it('labels the Galaxy as a model built from published measurements', () => {
    expect(getBody('milky-way')!.modelNotes![0]).toMatch(/^Model built from published measurements \(Reid et al\. 2019 arms, Wegg et al\. bar, Drimmel and Spergel dust\)/);
  });

  it('points to the article on our galaxy, and dying stars to the one on what stars are made of', () => {
    for (const id of ['milky-way', 'sgr-a-star', 's2', 'orion-nebula', 'eagle-nebula', 'carina-nebula', 'pleiades', 'omega-centauri']) expect(articleForBody(id), id).toBe('our-galaxy');
    for (const id of ['crab-nebula', 'ring-nebula', 'helix-nebula', 'cats-eye-nebula']) expect(articleForBody(id), id).toBe('what-stars-are-made-of');
  });

  it('gives the globulars their measured brightness and the open clusters none of their own', () => {
    expect(getBody('omega-centauri')!.physical.luminous!.vmag).toBeCloseTo(-10.35, 2);
    // V = 3.7 from Earth, as catalogued (the model's dust is left out for bodies).
    const omega = apparentMagnitude('omega-centauri', sim.bodies['omega-centauri'].pos.length());
    expect(omega).toBeGreaterThan(3.3);
    expect(omega).toBeLessThan(4.2);
    expect(getBody('pleiades')!.physical.luminous).toBeUndefined();
    expect(apparentMagnitude('pleiades', sim.bodies.pleiades.pos.length())).toBe(99);
  });
});

describe('named scenes', () => {
  it('sets up the Galactic Centre with S2 going round in about half a minute', () => {
    expect(sceneStatus('galactic-centre-orbits').ok).toBe(true);
    expect((16.05 * JULIAN_YEAR_S) / S2_ORBIT_WARP).toBeCloseTo(30, 0);
    expect(runScene('galactic-centre-orbits')).toBe(true);
    expect(useUI.getState().focus).toBe('sgr-a-star');
    expect(useUI.getState().selected).toBe('s2');
    cancelSceneStep();
  });

  it('shows the Milky Way from 100,000 light-years, with the model’s label', () => {
    expect(sceneStatus('milky-way-outside').ok).toBe(true);
    expect(sceneNote('milky-way-outside')).toMatch(/Model built from published measurements/);
    expect(runScene('milky-way-outside')).toBe(true);
    expect(useUI.getState().focus).toBe('milky-way');
    expect(useUI.getState().selected).toBe('milky-way');
    cancelSceneStep();
    useUI.setState({ focus: 'earth', selected: null, journeyNote: null });
  });
});

describe('the sky from the Sun', () => {
  const json = readJson<{ calibration: { surfaceBrightnessZeroPoint: number; samples: Record<string, { p: number; muV: number }> }; encoding: { P0: number; lnOnePlusPmaxOverP0: number } }>('public/textures/milkyway-bg.json');

  it('decodes and calibrates the map as its JSON says', () => {
    expect(json.encoding.P0).toBe(2e-4);
    expect(decodeSvs(255)).toBeCloseTo(1, 9);
    expect(decodeSvs(0)).toBe(0);
    expect(MW_FLUX_PER_SR).toBeGreaterThan(1780);
    expect(MW_FLUX_PER_SR).toBeLessThan(1800);
    for (const [name, s] of Object.entries(json.calibration.samples)) expect(surfaceBrightness(s.p), name).toBeCloseTo(s.muV, 1);
  });

  it('draws the brightest star clouds dimmer than a faint star’s peak, the band brighter than the poles', () => {
    const px = (2 * Math.tan((25 * Math.PI) / 180)) / 692;
    const centre = displayedLuminance(20.24, px, 1.6);
    const pole = displayedLuminance(24.48, px, 1.6);
    // A V = 6 star peaks at 1.6 × 10^(−1.2) = 0.10.
    expect(centre).toBeGreaterThan(0.03);
    expect(centre).toBeLessThan(0.1);
    expect(centre / pole).toBeGreaterThan(6);
  });

  it('hands over to the model a few hundred parsecs out', () => {
    expect(modelShare(0)).toBe(0);
    expect(modelShare(50 * PARSEC_KM)).toBe(0);
    expect(modelShare(300 * PARSEC_KM)).toBeGreaterThan(0.3);
    expect(modelShare(300 * PARSEC_KM)).toBeLessThan(0.7);
    expect(modelShare(HANDOVER_END_PC * PARSEC_KM)).toBe(1);
    let last = 0;
    for (let pc = 0; pc < 800; pc += 10) {
      const s = modelShare(pc * PARSEC_KM);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it('keeps the Galaxy’s levels in kiloparsecs on the GPU: a camera 100,000 light-years out is 31 kpc', () => {
    expect((1e5 * LIGHT_YEAR_KM) / (1000 * PARSEC_KM)).toBeCloseTo(30.66, 2);
    expect(new Vector3(1e5 * LIGHT_YEAR_KM, 0, 0).length()).toBeGreaterThan(1.8e17);
  });
});
