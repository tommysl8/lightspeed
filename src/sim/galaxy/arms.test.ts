import { describe, expect, test } from 'vitest';
import { armAt } from './arms';
import nebulae from './nebulae.json';
import type { NebulaeFile } from './records';

const file = nebulae as unknown as NebulaeFile;
const kpc = (id: string) => {
  const n = file.objects.find((o) => o.id === id)!;
  return n.helioGalacticPc.map((v) => v / 1000) as [number, number, number];
};

describe('spiral arm of a place (Reid et al. 2019, within the parallax data)', () => {
  test('the Sun is in the Orion (Local) Arm, 1.2 of its widths inside the ridge', () => {
    const a = armAt([0, 0, 0])!;
    expect(a.name).toBe('Orion Arm');
    expect(a.widths).toBeGreaterThan(1);
    expect(a.widths).toBeLessThan(1.5);
  });

  test('famous nebulae land in the arms astronomers place them in', () => {
    expect(armAt(kpc('orion-nebula'))?.name).toBe('Orion Arm');
    expect(armAt(kpc('north-america-nebula'))?.name).toBe('Orion Arm');
    expect(armAt(kpc('carina-nebula'))?.name).toBe('Sagittarius–Carina Arm');
    expect(armAt(kpc('eagle-nebula'))?.name).toBe('Sagittarius–Carina Arm');
    expect(armAt(kpc('crab-nebula'))?.name).toBe('Perseus Arm');
  });

  test('nothing is said far from the plane, between arms or beyond the data', () => {
    // 1 kpc above the Sun.
    expect(armAt([0, 0, 1])).toBeNull();
    // The Galactic Centre.
    expect(armAt([8.277, 0, 0])).toBeNull();
    // The far side of the Galaxy, where the arms are extrapolated.
    expect(armAt([16, -3, 0])).toBeNull();
    // The Large Magellanic Cloud.
    expect(armAt(kpc('tarantula-nebula'))).toBeNull();
  });
});
