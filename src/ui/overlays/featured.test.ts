/**
 * "Where to?" before anything is typed: the featured destinations run from the Moon to the
 * nearest star, then the Galactic Centre and Andromeda once the galaxy data are in, each with
 * what a 1 g flight there would take from Earth.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { msFromCivil } from '../../lib/time';
import { loadLocalGalaxies, loadNamed } from '../../test/cosmos';
import { featuredDestinations, FEATURED_IDS } from '../../content/destinations';
import { updateEphemeris } from '../../sim/ephemeris';
import { setSimTime, sim } from '../../sim/sim';
import { registerGalaxyCore } from '../../sim/galaxy/load';
import { registerCosmos } from '../../sim/cosmos/load';
import { oneGCost } from './searchCost';

const T0 = msFromCivil(2026, 9, 26, 0);

beforeAll(() => {
  registerGalaxyCore();
  registerCosmos(loadLocalGalaxies(), loadNamed());
  setSimTime(T0);
  updateEphemeris();
  sim.camera.pos.copy(sim.bodies.earth.pos);
});

describe('the featured destinations', () => {
  it('run from the Moon out to the Galactic Centre and Andromeda, in order', () => {
    const featured = featuredDestinations();
    expect(featured.map((d) => d.id)).toEqual([...FEATURED_IDS]);
    expect(featured.slice(-2).map((d) => d.name)).toEqual(['Sagittarius A*', 'Andromeda Galaxy']);
  });

  it('each show what a 1 g flight from Earth would take', () => {
    const cost = (id: string) => oneGCost(featuredDestinations().find((d) => d.id === id)!);
    for (const id of FEATURED_IDS) expect(cost(id).ok, id).toBe(true);
    // The Galactic Centre: about 20 years aboard while 27,000 pass at home.
    expect(cost('sgr-a-star').text).toMatch(/^20 years for you · 27,\d00 years at home$/);
    // Andromeda, 2.5 million light-years off (the flight stops far enough out to see it whole):
    // under 30 years aboard, over 2 million at home.
    expect(cost('andromeda').text).toMatch(/^2[7-9] years for you · 2\.\d million years at home$/);
  });
});
