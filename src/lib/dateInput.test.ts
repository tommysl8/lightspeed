import { describe, expect, it } from 'vitest';
import { parseDateInput } from './dateInput';
import { msFromCivil } from './time';

describe('parseDateInput', () => {
  it('reads full dates as parseSimDate does', () => {
    expect(parseDateInput('2026-09-25 14:03:27')).toBe(msFromCivil(2026, 9, 25, 14, 3, 27));
    expect(parseDateInput('-1999-03-12')).toBe(msFromCivil(-1999, 3, 12));
    expect(parseDateInput('2000-03-12 BCE')).toBe(msFromCivil(-1999, 3, 12));
  });

  it('reads a year on its own as 1 January of that year', () => {
    expect(parseDateInput('1969')).toBe(msFromCivil(1969, 1, 1));
    expect(parseDateInput(' 9999 ')).toBe(msFromCivil(9999, 1, 1));
    expect(parseDateInput('-500')).toBe(msFromCivil(-500, 1, 1));
    expect(parseDateInput('500 BCE')).toBe(msFromCivil(-499, 1, 1));
    expect(parseDateInput('44 bc')).toBe(msFromCivil(-43, 1, 1));
    expect(parseDateInput('1066 CE')).toBe(msFromCivil(1066, 1, 1));
    expect(parseDateInput('1 BCE')).toBe(msFromCivil(0, 1, 1));
  });

  it('rejects what is not a date', () => {
    expect(parseDateInput('')).toBeNaN();
    expect(parseDateInput('soon')).toBeNaN();
    expect(parseDateInput('-500 BCE')).toBeNaN();
    expect(parseDateInput('0 BCE')).toBeNaN();
    expect(parseDateInput('2026-02-31')).toBeNaN();
  });

  it('reads years of any length, so a far date prefilled in the field reads back (and is then out of range)', () => {
    expect(parseDateInput('2540000')).toBe(msFromCivil(2_540_000, 1, 1));
    expect(parseDateInput('2540000-01-01 00:00:00')).toBe(msFromCivil(2_540_000, 1, 1));
    expect(parseDateInput('-13799999999-01-01 00:00:00')).toBe(msFromCivil(-13_799_999_999, 1, 1));
  });
});
