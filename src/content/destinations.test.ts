import { describe, expect, it } from 'vitest';
import { BODY_ORDER } from '../physics/constants';
import {
  allDestinations,
  bodyKindText,
  destinationsChanged,
  destinationsVersion,
  editDistance,
  featuredDestinations,
  FEATURED_IDS,
  findDestination,
  groupedDestinations,
  matchScore,
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

  it('features six destinations, in order', () => {
    expect(featuredDestinations().map((d) => d.id)).toEqual([...FEATURED_IDS]);
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
  });

  it('puts a name before an alias that matches as well', () => {
    // "Mercury" starts with "me"; no alias should outrank it.
    expect(top('merc')).toBe('mercury');
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
