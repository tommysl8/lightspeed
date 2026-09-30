import { describe, expect, it } from 'vitest';
import { MPC_KM } from '../physics/constants';
import { msFromAstroTime, JULIAN_YEAR_MS } from '../lib/time';
import { getBody, registerBodies, unregisterBodies } from '../sim/bodies';
import type { PositionProvider } from '../sim/bodies/types';
import { cosmicAtMemo, cosmicNow } from '../sim/cosmicTime';
import { updateEphemeris } from '../sim/ephemeris';
import { setSimTime, sim } from '../sim/sim';
import { cosmicLevel, locationPath } from './location';

const labels = (c: { label: string }[]) => c.map((x) => x.label);

describe('locationPath', () => {
  it('names the target and what it orbits, inside the Solar System inside the Solar neighbourhood, inside the Orion Arm of the Milky Way', () => {
    expect(locationPath('orbit', 'earth')).toEqual([
      // The levels of the universe: not links until the galaxies are registered (sim/cosmos).
      { label: 'Observable universe', galactic: true, outer: true },
      { label: 'Local Universe', to: undefined, galactic: true, outer: true },
      { label: 'Local Group', to: undefined, galactic: true },
      // Not a link until the Milky Way's body is registered (sim/galaxy).
      { label: 'Milky Way', to: undefined, galactic: true },
      { label: 'Orion Arm', galactic: true },
      { label: 'Solar neighbourhood', to: 'solar-neighbourhood' },
      { label: 'Solar System', to: 'solar-system' },
      { label: 'Earth', to: 'earth', galactic: undefined },
    ]);
    expect(labels(locationPath('orbit', 'moon'))).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Solar System', 'Earth', 'Moon']);
    expect(labels(locationPath('transition', 'saturn'))).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Solar System', 'Saturn']);
  });

  it('puts the nearest star outside the Solar System', () => {
    updateEphemeris();
    const p = locationPath('orbit', 'proxima');
    expect(labels(p)).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Proxima Centauri']);
    expect(p[5].to).toBe('solar-neighbourhood');
  });

  it('says where a flight is going, and when you are flying by hand', () => {
    expect(labels(locationPath('travel', 'earth', 'saturn'))).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Solar System', 'Flying to Saturn']);
    expect(labels(locationPath('travel', 'earth', 'proxima'))).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Flying to Proxima Centauri']);
    expect(labels(locationPath('free', 'mars'))).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Solar System', 'Free flight']);
    // Roaming, the trail follows the nearest thing that matters (null: a star of the catalogue that is not a body).
    expect(labels(locationPath('roam', 'mars'))).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Solar System', 'Roaming near Mars']);
    expect(labels(locationPath('roam', null))).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Roaming among the stars']);
  });

  it('marks the Galaxy’s levels, which the footer leaves out where room is short', () => {
    const p = locationPath('orbit', 'earth');
    expect(p.filter((c) => c.galactic).map((c) => c.label)).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm']);
    // Only the innermost level of the universe shows on narrower wide screens.
    expect(p.filter((c) => c.outer).map((c) => c.label)).toEqual(['Observable universe', 'Local Universe']);
  });
});

describe('cosmicLevel', () => {
  it('keeps a galaxy in the local universe as the universe grows: the edge is comoving', () => {
    const x = 400 * MPC_KM;
    const provider: PositionProvider = {
      label: 'test',
      availability: () => ({ available: true, reason: null, regime: 'illustrative' }),
      positionAt(t, pos, vel) {
        pos.x = cosmicAtMemo(msFromAstroTime(t)).a * x;
        pos.y = pos.z = 0;
        if (vel) vel.x = vel.y = vel.z = 0;
      },
    };
    registerBodies([{ id: 'test-far', name: 'Test galaxy', kind: 'galaxy', parent: null, physical: { radiusKm: 3e17, colour: '#ffffff' }, visual: { renderer: 'layer' }, provider }]);
    const was = sim.timeMs;
    try {
      // Ten billion years on, 750 million parsecs away (proper), still 400 comoving: inside the 432.6 of the local universe.
      setSimTime(was + 1e10 * JULIAN_YEAR_MS);
      updateEphemeris();
      expect(cosmicNow().a).toBeGreaterThan(1.8);
      expect(sim.bodies['test-far'].pos.length() / MPC_KM).toBeGreaterThan(700);
      expect(cosmicLevel(getBody('test-far'))).toBe('local-universe');
    } finally {
      unregisterBodies(['test-far']);
      setSimTime(was);
      updateEphemeris();
    }
  });
});
