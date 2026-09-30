/**
 * The galaxies beyond the Milky Way in the app, from the shipped files: every galaxy target of the
 * articles resolving (the young galaxies too), where they are and how they are tilted (Andromeda
 * a 3° oval at its real position angle from Earth, its arms trailing its measured spin), the
 * Local Group, M87* at M87's centre (its trail, light-time and redshift its galaxy's), the trail up to
 * the observable universe, the Bodies list and search, the articles,
 * the cards of the young galaxies, the clusters' sizes from their Cosmicflows-4 members, and the
 * named scenes.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { msFromCivil } from '../../lib/time';
import { loadLocalGalaxies, loadNamed, loadWeb } from '../../test/cosmos';
import { resolveTarget, runScene, sceneNote, sceneStatus, cancelSceneStep, KNOWN_TARGETS, parseScene, flightOf } from '../../content/scenes';
import { findDestination, nestedDestinations, searchDestinations } from '../../content/destinations';
import { articleForBody, kindArticle } from '../../content/bodyArticles';
import { locationPath } from '../../ui/location';
import { deepSkyDistanceLine } from '../../ui/deepSkyText';
import { updateEphemeris } from '../ephemeris';
import { cosmicAt } from '../cosmicTime';
import { setSimTime, sim } from '../sim';
import { apparentMagnitude } from '../derived';
import { getBody, isBody } from '../bodies';
import { AU_KM, KPC_KM, MPC_KM, PARSEC_KM } from '../../physics/constants';
import { useUI } from '../../state/ui';
import { controller } from '../../controls/cameraController';
import { registerGalaxyCore } from '../galaxy/load';
import { cosmosState, registerCosmos, webRowsOfBodies } from './load';
import { cosmicSky, updateCosmicSky } from './expansion';
import { cosmicSightLine, lightLeftAgo } from './sight';
import { CLUSTER_RADIUS_MPC, LOCAL_GROUP_RADIUS_MPC, bodyIdOf } from './records';
import { dot, eclToWorld, ICRS_TO_ECL, apply, skyBasis, type Vec3 } from './frames';
import { CMB_CARD, COSMIC_WEB_CARD, cosmicWebShare } from '../../ui/cosmicLayers';

const T0 = msFromCivil(2026, 9, 26, 0);
const local = loadLocalGalaxies();
const named = loadNamed();

const GALAXY_TARGETS = ['andromeda', 'triangulum', 'lmc', 'smc', 'm81', 'm87', 'centaurus-a', 'sombrero', 'whirlpool', 'virgo-cluster', 'coma-cluster', 'bullet-cluster', 'gn-z11', 'jades-gs-z14-0', 'mom-z14'];
const HIGH_Z = ['gn-z11', 'jades-gs-z14-0', 'mom-z14'];

beforeAll(() => {
  registerGalaxyCore();
  registerCosmos(local, named);
  setSimTime(T0);
  updateEphemeris();
});

const shape = (id: string) => cosmosState.shapes.find((s) => s.id === id)!;
const worldOfIcrs = (v: Vec3): Vec3 => eclToWorld(apply(ICRS_TO_ECL, v));

describe('registration', () => {
  it('registers the 169 galaxies of the Local Group’s file, the named objects and the Local Group, and every target resolves', () => {
    for (const g of local.galaxies) expect(isBody(bodyIdOf(g.id)), g.id).toBe(true);
    for (const o of named.objects) expect(isBody(o.id), o.id).toBe(true);
    expect(getBody('local-group')?.kindText).toBe('Group of galaxies');
    for (const id of GALAXY_TARGETS) {
      expect(resolveTarget(id), id).not.toBeNull();
      expect(sceneStatus(`go:${id}`).ok, id).toBe(true);
    }
    for (const id of KNOWN_TARGETS.filter((t) => GALAXY_TARGETS.includes(t))) expect(resolveTarget(id)).not.toBeNull();
    // Every galaxy has a shape to draw; of the clusters only the Bullet Cluster (Virgo and Coma are the web's points).
    expect(cosmosState.shapes.length).toBe(local.galaxies.length + named.objects.length - 4 - 2);
    expect(cosmosState.shapes.some((s) => s.id === 'virgo-cluster' || s.id === 'coma-cluster')).toBe(false);
    expect(shape('bullet-cluster').template).toBe('cluster');
  });

  it('puts every galaxy where its file says, the satellites relative to the galaxy they orbit', () => {
    // 26.7 years after the present of the files the universe has grown by 1.8 × 10⁻⁹ (expansion.test.ts).
    const grown = cosmicAt(T0).a;
    for (const g of local.galaxies) {
      const p = sim.bodies[bodyIdOf(g.id)].pos;
      const want = eclToWorld(g.positionEclKpc);
      for (let k = 0; k < 3; k++) expect(p.getComponent(k) / KPC_KM, g.id).toBeCloseTo(want[k], 3);
    }
    for (const o of named.objects) {
      const p = sim.bodies[o.id].pos;
      const want = eclToWorld(o.positionEclMpc);
      // The four big ones come from the Local Group's file (the Local Volume Database's centres).
      if (['andromeda', 'triangulum', 'lmc', 'smc'].includes(o.id)) continue;
      const s = o.id === 'm87' ? 1 : grown; // M87 keeps its place in the Virgo cluster, which recedes
      const virgo = eclToWorld(named.objects.find((x) => x.id === 'virgo-cluster')!.positionEclMpc);
      for (let k = 0; k < 3; k++) expect(p.getComponent(k) / MPC_KM, o.id).toBeCloseTo(want[k] * s + (o.id === 'm87' ? (grown - 1) * virgo[k] : 0), 5);
    }
    expect(getBody('lg-m-032')?.parent).toBe('andromeda');
    expect(getBody('lmc')?.parent).toBe('milky-way');
    expect(getBody('triangulum')?.parent).toBe('andromeda');
    expect(getBody('lg-ngc-6822')?.parent).toBeNull();
    expect(getBody('m87')?.parent).toBe('virgo-cluster');
    // M32 is 6 kpc from M31, not 44 kpc behind it.
    expect(sim.bodies['lg-m-032'].pos.distanceTo(sim.bodies.andromeda.pos) / KPC_KM).toBeLessThan(20);
  });

  it('puts the Local Group’s centre 0.55 of the way from the Milky Way to Andromeda', () => {
    const lg = sim.bodies['local-group'].pos;
    const mw = sim.bodies['milky-way'].pos;
    const m31 = sim.bodies.andromeda.pos;
    const t = lg.clone().sub(mw).dot(m31.clone().sub(mw)) / m31.distanceToSquared(mw);
    expect(t).toBeCloseTo(0.55, 6);
    expect(getBody('local-group')!.physical.radiusKm / MPC_KM).toBeCloseTo(LOCAL_GROUP_RADIUS_MPC, 9);
  });

  it('leaves the galaxies drawn as bodies out of the cosmic web’s points', () => {
    const rows = webRowsOfBodies(named, local);
    expect(rows).toEqual(expect.arrayContaining([0, 1, 12, 27, 854]));
  });
});

describe('Andromeda', () => {
  const a = named.objects.find((o) => o.id === 'andromeda')!;
  const { r, e, n } = skyBasis(a.ra, a.dec);
  const R = worldOfIcrs(r);
  const E = worldOfIcrs(e);
  const N = worldOfIcrs(n);
  const unit = (v: readonly number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l] as Vec3;
  };

  it('is a spiral disc 42 kpc across (RC3’s D25) with its disc at 77.7° to our line of sight', () => {
    const s = shape('andromeda');
    expect(s.template).toBe('spiral');
    expect(s.scaleKpc).toBeCloseTo(21.096, 3);
    expect(Math.abs(dot(s.normal, R))).toBeCloseTo(Math.cos((77.7 * Math.PI) / 180), 4);
  });

  it('looks from Earth like a 3°-long oval at its real position angle (37.7°)', () => {
    const s = shape('andromeda');
    const x = unit(s.axes[0]);
    const pa = ((Math.atan2(dot(x, E), dot(x, N)) * 180) / Math.PI + 360) % 180;
    expect(pa).toBeCloseTo(37.7, 1);
    const d = sim.bodies.andromeda.pos.distanceTo(sim.bodies.earth.pos) / KPC_KM;
    const lengthDeg = ((2 * s.scaleKpc) / d) * (180 / Math.PI);
    expect(lengthDeg).toBeGreaterThan(3);
    expect(lengthDeg).toBeLessThan(3.4);
    // Seen from Earth its minor axis is foreshortened by cos i: a narrow oval.
    const y = unit(s.axes[1]);
    expect(Math.hypot(dot(y, E), dot(y, N))).toBeCloseTo(Math.cos((77.7 * Math.PI) / 180), 3);
  });

  it('turns its template so that its arms trail its measured spin', () => {
    const s = shape('andromeda');
    const spin = eclToWorld(a.disc!.axesEcl.spin!);
    // Template arms trail a rotation clockwise about their +z: +z is against the spin.
    expect(dot(unit(s.axes[2]), spin)).toBeCloseTo(-1, 6);
  });

  it('shines at about V = 3.4 from Earth, like the real one', () => {
    const m = apparentMagnitude('andromeda', sim.bodies.andromeda.pos.distanceTo(sim.bodies.earth.pos));
    expect(m).toBeGreaterThan(3.1);
    expect(m).toBeLessThan(3.8);
  });
});

describe('where you are', () => {
  const labels = (id: string) => locationPath('orbit', id).map((c) => c.label);

  it('names the levels of the universe above every place', () => {
    expect(labels('andromeda')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Andromeda Galaxy']);
    expect(labels('lg-m-032')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Andromeda Galaxy', 'M32']);
    expect(labels('lmc')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Large Magellanic Cloud']);
    expect(labels('m81')).toEqual(['Observable universe', 'Local Universe', 'Bode’s Galaxy']);
    expect(labels('m87')).toEqual(['Observable universe', 'Local Universe', 'Virgo Cluster', 'Messier 87 (Virgo A)']);
    expect(labels('coma-cluster')).toEqual(['Observable universe', 'Local Universe', 'Coma Cluster']);
    expect(labels('bullet-cluster')).toEqual(['Observable universe', 'Bullet Cluster']);
    for (const id of HIGH_Z) expect(labels(id)).toEqual(['Observable universe', getBody(id)!.name]);
    expect(labels('local-group')).toEqual(['Observable universe', 'Local Universe', 'Local Group']);
    expect(labels('earth').slice(0, 4)).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way']);
  });

  it('puts M87* at the centre of M87, its trail through the Virgo Cluster and its galaxy', () => {
    expect(labels('m87-star')).toEqual(['Observable universe', 'Local Universe', 'Virgo Cluster', 'Messier 87 (Virgo A)', 'M87*']);
    expect(getBody('m87-star')?.parent).toBe('m87');
    expect(sim.bodies['m87-star'].pos.distanceTo(sim.bodies.m87.pos)).toBe(0);
  });

  it('sees M87* as it sees M87: the same anchor in the expanding universe, the same light-time and redshift', () => {
    const hole = cosmicSky.byId.get('m87-star')!;
    const galaxy = cosmicSky.byId.get('m87')!;
    expect(hole.anchorKm.equals(galaxy.anchorKm)).toBe(true);
    expect(hole.home).toBe(false);
    updateCosmicSky(false);
    expect(hole.chiMpc).toBeGreaterThan(10);
    expect(hole.chiMpc).toBe(galaxy.chiMpc);
    expect(lightLeftAgo('m87-star')).toBe(lightLeftAgo('m87'));
    expect(lightLeftAgo('m87')).toMatch(/million years/);
  });

  it('sees M87 and M87* with no expansion in between from inside the Virgo Cluster’s core, as the Local Group from home', () => {
    const save = sim.camera.pos.clone();
    try {
      // Beside M87*, 6,288 au out (its framing): 0.3 Mpc from the cluster's anchor, inside its core.
      sim.camera.pos.copy(sim.bodies['m87-star'].pos).add(new Vector3(0, 0, 6288 * AU_KM));
      updateCosmicSky(false);
      expect(cosmicSky.inLocalGroup).toBe(false);
      expect(cosmicSky.boundTo).toBe('virgo-cluster');
      for (const id of ['m87', 'm87-star', 'virgo-cluster']) {
        expect(cosmicSky.byId.get(id)!.chiMpc, id).toBe(0);
        expect(cosmicSky.byId.get(id)!.ln1pz, id).toBe(0);
        expect(lightLeftAgo(id), id).toBeNull();
        expect(cosmicSightLine(id), id).toBeNull();
      }
      // Everything beyond the cluster is seen from the cluster's own place: home as from Virgo, 16 Mpc of expanding space away.
      expect(cosmicSky.byId.get('andromeda')!.chiMpc).toBeGreaterThan(15);
      expect(lightLeftAgo('andromeda')).toMatch(/million years/);
      // Just outside the core the expansion between comes back.
      const virgo = cosmicSky.byId.get('virgo-cluster')!.anchorKm;
      sim.camera.pos.copy(virgo).multiplyScalar(cosmicSky.a).add(new Vector3(1.01 * CLUSTER_RADIUS_MPC['virgo-cluster'] * MPC_KM, 0, 0));
      updateCosmicSky(false);
      expect(cosmicSky.boundTo).toBeNull();
      expect(cosmicSky.byId.get('m87')!.chiMpc).toBeGreaterThan(0.9);
      expect(lightLeftAgo('m87')).toMatch(/million years/);
    } finally {
      sim.camera.pos.copy(save);
      updateCosmicSky(false);
    }
  });

  it('keeps a dwarf just outside the zero-velocity surface out of the Local Group', () => {
    // NGC 3109, 1.3 Mpc away, recedes with the expansion (subgroup "nearby" in the file).
    expect(labels('lg-ngc-3109')).toEqual(['Observable universe', 'Local Universe', 'NGC 3109']);
    expect(labels('lg-ngc-6822')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'NGC 6822']);
  });

  it('puts the Magellanic Clouds’ nebulae under their galaxy, with links to the views of the universe', () => {
    const p = locationPath('orbit', 'earth');
    expect(p[1].to).toBe('local-universe');
    expect(p[2].to).toBe('local-group');
  });
});

describe('lists, search and articles', () => {
  it('groups the galaxies, the satellites under their galaxy', () => {
    const groups = nestedDestinations();
    const gal = groups.find((g) => g.id === 'galaxies')!.items;
    expect(gal.filter((i) => i.heading).map((i) => i.heading)).toEqual(['The Local Group', 'Beyond the Local Group', 'The most distant known']);
    const m31 = gal.find((i) => i.destination.id === 'andromeda')!;
    expect(m31.children).toBeGreaterThan(30);
    expect(gal.find((i) => i.destination.id === 'lg-m-032')?.depth).toBe(1);
    const mw = groups.find((g) => g.id === 'milky-way')!.items;
    expect(mw.find((i) => i.destination.id === 'lmc')?.depth).toBe(1);
    const uni = groups.find((g) => g.id === 'universe')!.items.map((i) => i.destination.id);
    expect(uni).toEqual(expect.arrayContaining(['local-group', 'virgo-cluster', 'coma-cluster', 'bullet-cluster', 'cosmic-web', 'cmb']));
    // M87* under M87, under the Virgo Cluster.
    const virgo = groups.find((g) => g.id === 'universe')!.items;
    const at = virgo.findIndex((i) => i.destination.id === 'm87');
    expect(virgo[at].depth).toBe(1);
    expect(virgo[at + 1]).toMatchObject({ depth: 2, destination: { id: 'm87-star', kind: 'Supermassive black hole', group: 'galaxies' } });
  });

  it('finds every galaxy, cluster and layer by its names', () => {
    const top = (q: string) => searchDestinations(q)[0]?.destination.id;
    expect(top('M31')).toBe('andromeda');
    expect(top('Andromeda Galaxy')).toBe('andromeda');
    expect(top('M33')).toBe('triangulum');
    expect(top('LMC')).toBe('lmc');
    expect(top('NGC 205')).toBe('lg-ngc-0205');
    expect(top('Draco II')).toBe('lg-draco-2');
    // A dwarf named after its constellation alone is "… Dwarf", its database name an alias.
    expect(getBody('lg-fornax-1')!.name).toBe('Fornax Dwarf');
    expect(getBody('lg-sagittarius-1')!.name).toBe('Sagittarius Dwarf');
    expect(top('Fornax Dwarf')).toBe('lg-fornax-1');
    expect(searchDestinations('Fornax').some((m) => m.destination.id === 'lg-fornax-1')).toBe(true);
    expect(top('Virgo Cluster')).toBe('virgo-cluster');
    // "M87" is the galaxy; its black hole is "M87*".
    expect(top('M87')).toBe('m87');
    expect(top('M87*')).toBe('m87-star');
    expect(top('M87 black hole')).toBe('m87-star');
    expect(top('Coma')).toBe('coma-cluster');
    expect(top('Cen A')).toBe('centaurus-a');
    expect(top('M104')).toBe('sombrero');
    expect(top('GN-z11')).toBe('gn-z11');
    expect(top('MoM-z14')).toBe('mom-z14');
    expect(top('most distant galaxy')).toBe('mom-z14');
    expect(top('Local Group')).toBe('local-group');
    expect(top('cosmic web')).toBe('cosmic-web');
    expect(top('CMB')).toBe('cmb');
    for (const g of local.galaxies) expect(searchDestinations(getBody(bodyIdOf(g.id))!.name).some((m) => m.destination.id === bodyIdOf(g.id)), g.name).toBe(true);
    expect(findDestination('bullet-cluster')?.kind).toBe('Cluster of galaxies');
  });

  it('points galaxies to the article on island universes, the clusters of the cosmic web to the expanding universe, the young galaxies to the edge of reach', () => {
    for (const id of ['andromeda', 'lmc', 'lg-draco-2', 'm87', 'bullet-cluster', 'local-group']) expect(articleForBody(id), id).toBe('island-universes');
    for (const id of ['virgo-cluster', 'coma-cluster']) expect(articleForBody(id), id).toBe('the-expanding-universe');
    for (const id of HIGH_Z) expect(articleForBody(id), id).toBe('the-edge-of-reach');
    // M87*, like every black hole, follows its kind.
    expect(articleForBody('m87-star')).toBe(kindArticle('black-hole'));
  });
});

describe('cards', () => {
  it('say what is a model: the templates, the assumed near sides, the missing depth', () => {
    expect(getBody('andromeda')!.modelNotes!.join(' ')).toMatch(/Drawn as a model.*tilted as measured/);
    expect(getBody('triangulum')!.modelNotes!.join(' ')).toMatch(/mirror image/);
    expect(getBody('lg-fornax-1')!.modelNotes!.join(' ')).toMatch(/depth along our line of sight is not/);
    expect(getBody('lg-fornax-1')!.modelNotes!.join(' ')).toMatch(/sky map/);
    expect(getBody('lg-tucana-3')!.modelNotes!.join(' ')).toMatch(/may be a star cluster/);
  });

  it('explain that a young galaxy is seen by its light of 13.5 billion years ago, placed where it is now', () => {
    for (const id of HIGH_Z) {
      const b = getBody(id)!;
      expect(b.modelNotes![0], id).toMatch(/Placed where it is now.*light from 13\.[345] billion years ago/);
      expect(b.deepSky!.distanceNow).toBe(true);
      expect(deepSkyDistanceLine(b.deepSky!), id).toMatch(/^3[1-4]\.\d billion light-years from the Sun now\./);
    }
    expect(getBody('mom-z14')!.facts![0]).toMatch(/most distant galaxy confirmed/);
  });

  it('give distances in millions of light-years beyond the Local Group’s neighbourhood', () => {
    expect(deepSkyDistanceLine(getBody('andromeda')!.deepSky!)).toMatch(/^2\.48 million light-years \(2\.45 million to 2\.52 million\) from the Sun\./);
    expect(deepSkyDistanceLine(getBody('lmc')!.deepSky!)).toMatch(/^162,000 light-years/);
  });

  it('size the clusters by where half their Cosmicflows-4 members lie on the sky', () => {
    const cw = loadWeb();
    for (const id of ['virgo-cluster', 'coma-cluster']) {
      const o = named.objects.find((x) => x.id === id)!;
      const { first, count } = o.cosmicWeb!.members!;
      const D = Math.PI / 180;
      const seps: number[] = [];
      for (let i = first; i < first + count; i++) {
        const c = Math.sin(o.dec * D) * Math.sin(cw.dec[i] * D) + Math.cos(o.dec * D) * Math.cos(cw.dec[i] * D) * Math.cos((cw.ra[i] - o.ra) * D);
        seps.push(Math.acos(Math.min(1, c)));
      }
      seps.sort((p, q) => p - q);
      const median = seps[Math.floor(0.5 * (seps.length - 1))] * o.distance!.mpc;
      expect(median, id).toBeCloseTo(CLUSTER_RADIUS_MPC[id], 2);
    }
  });

  it('carry the credits of their data', () => {
    expect(getBody('lg-draco-2')!.dataSource).toMatch(/Local Volume Database v1\.1\.1/);
    expect(getBody('lg-draco-2')!.factSourceLabels![0]).toBe('Longeard et al. 2018');
    expect(getBody('andromeda')!.deepSky!.refs!.join(' ')).toMatch(/Li, Riess et al\. 2021/);
  });
});

describe('flights and scenes', () => {
  it('resolves the young galaxies as flight targets', () => {
    for (const id of HIGH_Z) {
      expect(parseScene(`fly:${id}`)).toEqual({ kind: 'fly', target: id, beta: null });
      expect(flightOf(`fly:${id}`)?.dest).toBe(id);
    }
  });

  it('sets up the Local Group from 3 Mpc, the cosmic web from 200 Mpc turning, and the CMB map', () => {
    for (const name of ['local-group', 'cosmic-web', 'cmb-map']) expect(sceneStatus(name).ok, name).toBe(true);
    expect(sceneNote('cosmic-web')).toMatch(/Cosmicflows-4/);
    expect(sceneNote('cmb-map')).toMatch(/contrast is enhanced about 10,000 times/);
    expect(runScene('local-group')).toBe(true);
    expect(useUI.getState().focus).toBe('local-group');
    expect(runScene('cosmic-web')).toBe(true);
    expect(controller.spinning).toBe(true);
    expect(runScene('cmb-map')).toBe(true);
    expect(useUI.getState().showCmb).toBe(true);
    cancelSceneStep();
    useUI.setState({ focus: 'earth', selected: null, journeyNote: null, showCmb: false });
  });

  it('shows the cosmic web from beyond the Local Group, and labels the layers as the task requires', () => {
    expect(cosmicWebShare('auto', 0)).toBe(0);
    expect(cosmicWebShare('auto', 2 * MPC_KM)).toBe(0);
    expect(cosmicWebShare('auto', 5 * MPC_KM)).toBeGreaterThan(0);
    expect(cosmicWebShare('auto', 200 * MPC_KM)).toBe(1);
    expect(cosmicWebShare('on', 0)).toBe(1);
    expect(cosmicWebShare('off', 200 * MPC_KM)).toBe(0);
    expect(CMB_CARD.line).toBe('Cosmic microwave background, contrast enhanced about 10,000 times; WMAP 9-year ILC, NASA/WMAP Science Team');
    expect(COSMIC_WEB_CARD.caveat).toMatch(/survey, not a census.*zone of avoidance/);
    expect(COSMIC_WEB_CARD.line).toMatch(/Cosmicflows-4.*a map, not what the eye would see/);
  });

  it('keeps the far galaxies within the camera’s reach', () => {
    for (const id of HIGH_Z) expect(sim.bodies[id].pos.length()).toBeLessThan(1e24);
    expect(sim.bodies['mom-z14'].pos.length() / MPC_KM).toBeCloseTo(10383.8, 0);
    expect(PARSEC_KM).toBeGreaterThan(0);
  });
});
