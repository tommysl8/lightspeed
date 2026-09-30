/**
 * Roam's words (ui/flight/roamText.ts): distances and speeds in plain units, where the nearest thing is,
 * and the multiplier.
 */
import { describe, expect, it } from 'vitest';
import { AU_KM, C_KM_S, LIGHT_YEAR_KM } from '../../physics/constants';
import { FASTER_THAN_LIGHT, distanceWords, plainNumber, rateWords, roamMulText, roamPlaceWords, roamSpeedWords } from './roamText';

describe('Roam’s words', () => {
  it('writes numbers as words do, to two figures', () => {
    expect(plainNumber(1234)).toBe('1,200');
    expect(plainNumber(1234, 3)).toBe('1,230');
    expect(plainNumber(3.21)).toBe('3.2');
    expect(plainNumber(0.0456)).toBe('0.046');
    expect(plainNumber(40, 3)).toBe('40');
  });

  it('picks the unit that reads best, from millimetres to billions of light-years', () => {
    expect(distanceWords(2.7e-5)).toBe('27 mm');
    expect(distanceWords(0.85)).toBe('850 m');
    expect(distanceWords(12_345)).toBe('12,000 km');
    expect(distanceWords(3.2e6)).toBe('3.2 million km');
    expect(distanceWords(5.2 * AU_KM)).toBe('780 million km');
    expect(distanceWords(52 * AU_KM)).toBe('52 au');
    expect(distanceWords(LIGHT_YEAR_KM)).toBe('1 light-year');
    expect(distanceWords(1.2 * LIGHT_YEAR_KM)).toBe('1.2 light-years');
    expect(distanceWords(2.5e6 * LIGHT_YEAR_KM)).toBe('2.5 million light-years');
    expect(distanceWords(1e6 * LIGHT_YEAR_KM)).toBe('1 million light-years');
    expect(distanceWords(13.8e9 * LIGHT_YEAR_KM)).toBe('14 billion light-years');
  });

  it('says the pace per second, and when it passes light’s that this is a camera, not a ship', () => {
    expect(roamSpeedWords(1.2 * LIGHT_YEAR_KM)).toEqual({ text: '1.2 light-years a second', fasterThanLight: true });
    expect(roamSpeedWords(30)).toEqual({ text: '30 km a second', fasterThanLight: false });
    expect(roamSpeedWords(C_KM_S).fasterThanLight).toBe(false);
    expect(FASTER_THAN_LIGHT).toBe('faster than light: this is a camera, not a ship');
  });

  it('says where the nearest thing is: above a horizon or a surface, inside, or how far away', () => {
    expect(roamPlaceWords('hole', 12.69, 1.269e7)).toBe('13 km above the horizon');
    expect(roamPlaceWords('solid', 6378 + 400, 6378)).toBe('400 km above the surface');
    expect(roamPlaceWords('solid', 384_400, 6378)).toBe('380,000 km away');
    expect(roamPlaceWords('point', 4.2 * LIGHT_YEAR_KM, 0)).toBe('4.2 light-years away');
    expect(roamPlaceWords('extended', 26_000 * LIGHT_YEAR_KM, 49_000 * LIGHT_YEAR_KM)).toBe('inside it, 26,000 light-years from its centre');
    expect(roamPlaceWords('extended', 2.5e6 * LIGHT_YEAR_KM, 7e4 * LIGHT_YEAR_KM)).toBe('2.5 million light-years away');
    expect(roamPlaceWords('edge', 2e9 * LIGHT_YEAR_KM, 0)).toBe('2 billion light-years on');
    expect(roamPlaceWords('edge', 0, 0)).toBe('here: light from farther has not reached us yet');
  });

  it('says the rate in words for the guide', () => {
    expect(rateWords(1)).toBe('once');
    expect(rateWords(1.5)).toBe('one and a half times');
    expect(rateWords(2)).toBe('twice');
    expect(rateWords(3)).toBe('3 times');
  });

  it('writes the multiplier', () => {
    expect(roamMulText(1)).toBe('×1');
    expect(roamMulText(0.25)).toBe('×0.25');
    expect(roamMulText(40)).toBe('×40');
    expect(roamMulText(128)).toBe('×128');
  });
});
