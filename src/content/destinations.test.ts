import { describe, expect, it } from 'vitest';
import { BODY_ORDER } from '../physics/constants';
import { fixedOffsetProvider, fixedStarProvider, getBody, registerBodies, unregisterBodies, type BodyRecord } from '../sim/bodies';
import {
  allDestinations,
  bodyGroup,
  bodyKindText,
  destinationsChanged,
  destinationsVersion,
  editDistance,
  featuredDestinations,
  FEATURED_IDS,
  findDestination,
  groupedDestinations,
  matchScore,
  nestedDestinations,
  normalise,
  registerDestinations,
  searchDestinations,
  subscribeDestinations,
  type Destination,
} from './destinations';

const top = (q: string) => searchDestinations(q)[0]?.destination.id;

function fake(id: string, name: string, group: Destination['group'], aliases: string[] = []): Destination {
  return { id, name, aliases, kind: 'Test', group, distanceKm: () => NaN, unavailable: () => null, go: () => {} };
}

describe('normalise', () => {
  it('drops case, accents, apostrophes and punctuation', () => {
    expect(normalise('  Halley’s Comet ')).toBe('halleys comet');
    expect(normalise('ʻOumuamua')).toBe('oumuamua');
    expect(normalise('Comet 67P/Churyumov–Gerasimenko')).toBe('comet 67p churyumov gerasimenko');
    expect(normalise('Barnard’s Star')).toBe('barnards star');
    // A leading "the" is dropped, so "the red planet" is the nickname and "the Moon" the Moon.
    expect(normalise('the red planet')).toBe('red planet');
    expect(normalise('The Moon')).toBe('moon');
    expect(normalise('the')).toBe('the');
    expect(normalise('Theia')).toBe('theia');
  });
});

describe('editDistance', () => {
  it('counts insertions, deletions, substitutions and swaps of neighbours', () => {
    expect(editDistance('saturn', 'saturn')).toBe(0);
    expect(editDistance('satrun', 'saturn')).toBe(1);
    expect(editDistance('jupter', 'jupiter')).toBe(1);
    expect(editDistance('mars', 'mares')).toBe(1);
    expect(editDistance('abc', '')).toBe(3);
  });
});

describe('matchScore', () => {
  it('ranks the whole name, then its start, then a later word, then anywhere, then letters in order, then a slip', () => {
    const t = normalise('Proxima Centauri');
    const whole = matchScore('proxima centauri', t);
    const start = matchScore('prox', t);
    const word = matchScore('cent', t);
    const inside = matchScore('xima', t);
    const letters = matchScore('pxc', t);
    const slip = matchScore('porxima', t);
    expect(whole).toBeGreaterThan(start);
    expect(start).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(letters);
    expect(letters).toBeGreaterThan(slip);
    expect(slip).toBeGreaterThan(0);
  });

  it('does not match what is not there', () => {
    expect(matchScore('zzz', 'saturn')).toBe(0);
    expect(matchScore('', 'saturn')).toBe(0);
    // Two letters are too few for letters-in-order matching.
    expect(matchScore('sn', 'saturn')).toBe(0);
    // Letters in order must start at the start of a word.
    expect(matchScore('orion', normalise('New Horizons'))).toBe(0);
    expect(matchScore('betel', normalise('James Webb Space Telescope'))).toBe(0);
    expect(matchScore('jptr', 'jupiter')).toBeGreaterThan(0);
  });
});

describe('the body destinations', () => {
  it('lists every body once, grouped Sun and planets first', () => {
    const ids = allDestinations().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of BODY_ORDER) expect(ids).toContain(id);
    const groups = groupedDestinations();
    expect(groups[0].title).toBe('Sun and planets');
    expect(groups[0].items.map((d) => d.id)).toEqual(['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
    expect(groups.find((g) => g.id === 'moons')?.items.map((d) => d.id)).toEqual(['moon']);
    expect(groups.find((g) => g.id === 'spacecraft')?.items.map((d) => d.id)).toEqual(['voyager1']);
    expect(groups.find((g) => g.id === 'stars')?.items.map((d) => d.id)).toEqual(['proxima']);
    // Empty groups are left out.
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it('says what each body is', () => {
    expect(bodyKindText('sun')).toBe('Our star');
    expect(bodyKindText('moon')).toBe('Moon of Earth');
    expect(bodyKindText('saturn')).toBe('Planet');
    expect(bodyKindText('pluto')).toBe('Dwarf planet');
    expect(bodyKindText('voyager1')).toBe('Spacecraft');
    expect(bodyKindText('proxima')).toBe('Star');
  });

  it('features its destinations in order, the galaxy ones only once their data are in', () => {
    // Here only the built-in bodies are registered (overlays/featured.test.ts registers the galaxies).
    expect(featuredDestinations().map((d) => d.id)).toEqual(FEATURED_IDS.filter((id) => id !== 'sgr-a-star' && id !== 'andromeda'));
  });
});

describe('searchDestinations', () => {
  it('finds bodies by name, start, alias and a slip of the keyboard', () => {
    expect(top('saturn')).toBe('saturn');
    expect(top('sat')).toBe('saturn');
    expect(top('Satrun')).toBe('saturn');
    expect(top('luna')).toBe('moon');
    expect(top('red planet')).toBe('mars');
    expect(top('alpha centauri')).toBe('proxima');
    expect(top('proxima')).toBe('proxima');
    expect(top('voyager')).toBe('voyager1');
    expect(top('jptr')).toBe('jupiter');
    expect(top('home')).toBe('earth');
    expect(top('the red planet')).toBe('mars');
    expect(top('the moon')).toBe('moon');
  });

  it('tells a planet from a star of the same name by the case of its letter', () => {
    const list = [fake('kepler-16-b', 'Kepler-16 B', 'stars'), fake('kepler-16-ab-b', 'Kepler-16 (AB) b', 'exoplanets', ['Kepler-16 b'])];
    const first = (q: string) => searchDestinations(q, list)[0]?.destination.id;
    expect(first('kepler-16 b')).toBe('kepler-16-ab-b');
    expect(first('Kepler-16 b')).toBe('kepler-16-ab-b');
    expect(first('Kepler-16 B')).toBe('kepler-16-b');
    expect(first('KEPLER-16 B')).toBe('kepler-16-b');
  });

  it('puts a name before an alias that matches as well', () => {
    // "Mercury" starts with "me"; no alias should outrank it.
    expect(top('merc')).toBe('mercury');
  });

  it('scores a name ending in * as an alias unless the query ends in * too ("M87" is the galaxy, "M87*" its black hole)', () => {
    // The hole first in the list: the rule, not the order, decides.
    const list = [fake('m87-star', 'M87*', 'galaxies'), fake('m87', 'Messier 87 (Virgo A)', 'galaxies', ['M87', 'NGC 4486'])];
    const first = (q: string) => searchDestinations(q, list)[0]?.destination.id;
    expect(first('M87')).toBe('m87');
    expect(first('m87')).toBe('m87');
    expect(first('M87*')).toBe('m87-star');
    expect(first('m87 *')).toBe('m87-star');
    expect(searchDestinations('M87', list).map((m) => m.destination.id)).toEqual(['m87', 'm87-star']);
  });

  it('returns nothing for an empty query or nonsense', () => {
    expect(searchDestinations('')).toEqual([]);
    expect(searchDestinations('   ')).toEqual([]);
    expect(searchDestinations('qqqqqq')).toEqual([]);
  });
});

describe('registerDestinations', () => {
  it('adds destinations from later updates, in their group, and removes them again', () => {
    const remove = registerDestinations(() => [fake('titan', 'Titan', 'moons', ['Saturn VI']), fake('sirius', 'Sirius', 'stars', ['Dog Star'])]);
    try {
      expect(findDestination('titan')?.name).toBe('Titan');
      expect(top('dog star')).toBe('sirius');
      const moons = groupedDestinations().find((g) => g.id === 'moons')!;
      expect(moons.items.map((d) => d.id)).toEqual(['moon', 'titan']);
      // Stars come after spacecraft, whatever the order of registration.
      const ids = allDestinations().map((d) => d.id);
      expect(ids.indexOf('sirius')).toBeGreaterThan(ids.indexOf('voyager1'));
    } finally {
      remove();
    }
    expect(findDestination('titan')).toBeUndefined();
  });

  it('lets a later provider replace a body’s entry without moving it', () => {
    const remove = registerDestinations(() => [{ ...fake('mars', 'Mars', 'sun-planets', ['Barsoom']), kind: 'Planet (detailed)' }]);
    try {
      expect(findDestination('mars')?.kind).toBe('Planet (detailed)');
      expect(top('barsoom')).toBe('mars');
      const planets = groupedDestinations()[0].items.map((d) => d.id);
      expect(planets.indexOf('mars')).toBe(4);
      expect(allDestinations().filter((d) => d.id === 'mars')).toHaveLength(1);
    } finally {
      remove();
    }
    expect(findDestination('mars')?.kind).toBe('Planet');
  });

  it('tells open lists when destinations come and go', () => {
    let heard = 0;
    const stop = subscribeDestinations(() => heard++);
    const v0 = destinationsVersion();
    const remove = registerDestinations(() => [fake('titan', 'Titan', 'moons')]);
    remove();
    destinationsChanged(); // a provider whose data arrived later
    stop();
    destinationsChanged();
    expect(heard).toBe(3);
    expect(destinationsVersion()).toBe(v0 + 4);
  });
});

describe('black holes in the Bodies list', () => {
  const at = fixedOffsetProvider(0, 0, 0);
  const hole = (id: string, parent: string | null, extra: Partial<BodyRecord> = {}): BodyRecord => ({
    id,
    name: id,
    kind: 'black-hole',
    kindText: 'Stellar-mass black hole',
    parent,
    centre: parent ?? undefined,
    physical: { radiusKm: 30, colour: '#000000' },
    provider: parent ? at : fixedStarProvider(270, -30, 3e16),
    ...extra,
  });
  const records: BodyRecord[] = [
    { id: 'test-galaxy', name: 'Test Galaxy', kind: 'galaxy', parent: null, physical: { radiusKm: 1e17, colour: '#ffffff' }, provider: fixedStarProvider(180, 10, 1e20) },
    hole('test-galaxy-hole', 'test-galaxy', { kindText: 'Supermassive black hole', physical: { radiusKm: 2e10, colour: '#000000' } }),
    { id: 'test-pair-barycentre', name: 'Test pair', kind: 'barycentre', parent: null, destination: false, physical: { radiusKm: 0, colour: '#ffffff' }, provider: fixedStarProvider(20, 20, 1e16) },
    hole('test-pair-hole', 'test-pair-barycentre'),
    { id: 'test-pair-star', name: 'Test pair’s star', kind: 'star', parent: 'test-pair-barycentre', centre: 'test-pair-barycentre', physical: { radiusKm: 7e5, colour: '#ffffff' }, provider: at },
    hole('test-lone-hole', null),
  ];
  const ids = records.map((r) => r.id);

  it('lists each by its placement: alone under The Milky Way, in a binary under its system’s row there, at a galaxy’s centre with the galaxy', () => {
    registerBodies(records);
    try {
      expect(bodyGroup(getBody('test-lone-hole')!)).toBe('milky-way');
      expect(bodyGroup(getBody('test-pair-hole')!)).toBe('milky-way');
      expect(bodyGroup(getBody('test-galaxy-hole')!)).toBe('galaxies');
      expect(findDestination('test-galaxy-hole')?.parent).toBe('test-galaxy');
      const row = findDestination('test-pair-barycentre')!;
      expect(row).toMatchObject({ kind: 'Black hole and star', group: 'milky-way', body: 'test-pair-star' });
      const mw = nestedDestinations().find((g) => g.id === 'milky-way')!.items;
      const i = mw.findIndex((x) => x.destination.id === 'test-pair-barycentre');
      expect(mw.slice(i, i + 3).map((x) => [x.destination.id, x.depth])).toEqual([
        ['test-pair-barycentre', 0],
        ['test-pair-hole', 1],
        ['test-pair-star', 1],
      ]);
      expect(mw.find((x) => x.destination.id === 'test-lone-hole')?.depth).toBe(0);
      const gal = nestedDestinations().find((g) => g.id === 'galaxies')!.items;
      expect(gal.find((x) => x.destination.id === 'test-galaxy-hole')?.depth).toBe(1);
    } finally {
      unregisterBodies(ids);
    }
    expect(findDestination('test-pair-barycentre')).toBeUndefined();
  });
});
