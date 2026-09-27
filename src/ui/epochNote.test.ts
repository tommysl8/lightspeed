import { describe, expect, it } from 'vitest';
import { PRESENT_AGE_GYR } from '../sim/cosmicTime';
import { farEpochNote } from './epochNote';

describe('farEpochNote', () => {
  it('says nothing near the present', () => {
    expect(farEpochNote('earth', PRESENT_AGE_GYR)).toBeNull();
    expect(farEpochNote('earth', PRESENT_AGE_GYR + 0.005)).toBeNull();
  });

  it('says what has become of the Sun and the Earth, and that home is drawn as it is today', () => {
    expect(farEpochNote('mars', PRESENT_AGE_GYR + 0.1)).toBe(
      '100 million years from now the Sun is still a main-sequence star and the Earth is still habitable (Schröder & Connon Smith 2008); the Solar System is drawn as it is today.',
    );
    expect(farEpochNote('earth', PRESENT_AGE_GYR + 10)).toMatch(/^10\.0 billion years from now the Sun is a white dwarf and the Earth is gone, swallowed by the red-giant Sun .*drawn as it is today\.$/);
    expect(farEpochNote('sun', PRESENT_AGE_GYR + 6)).toMatch(/the Sun is swelling into a red giant and the Earth is a hot, dry world/);
    expect(farEpochNote('earth', PRESENT_AGE_GYR - 1)).toBe('1.00 billion years ago: the Solar System is drawn as it is today.');
  });

  it('says the stars are drawn as they are today', () => {
    expect(farEpochNote('proxima', PRESENT_AGE_GYR + 2)).toBe('Drawn as it is today: what becomes of it over 2.00 billion years is not modelled.');
  });
});
