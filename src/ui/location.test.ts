import { describe, expect, it } from 'vitest';
import { locationPath } from './location';

const labels = (c: { label: string }[]) => c.map((x) => x.label);

describe('locationPath', () => {
  it('names the target and what it orbits', () => {
    expect(locationPath('orbit', 'earth')).toEqual([
      { label: 'Solar System', to: 'solar-system' },
      { label: 'Earth', to: 'earth' },
    ]);
    expect(labels(locationPath('orbit', 'moon'))).toEqual(['Solar System', 'Earth', 'Moon']);
    expect(labels(locationPath('transition', 'saturn'))).toEqual(['Solar System', 'Saturn']);
  });

  it('puts the nearest star outside the Solar System', () => {
    const p = locationPath('orbit', 'proxima');
    expect(labels(p)).toEqual(['Solar neighbourhood', 'Proxima Centauri']);
    expect(p[0].to).toBeUndefined();
  });

  it('says where a flight is going, and when you are flying by hand', () => {
    expect(labels(locationPath('travel', 'earth', 'saturn'))).toEqual(['Solar System', 'Flying to Saturn']);
    expect(labels(locationPath('travel', 'earth', 'proxima'))).toEqual(['Solar neighbourhood', 'Flying to Proxima Centauri']);
    expect(labels(locationPath('free', 'mars'))).toEqual(['Solar System', 'Free flight']);
  });
});
