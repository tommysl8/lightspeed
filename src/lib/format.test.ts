import { describe, expect, it } from 'vitest';
import { formatBeta, formatClock, formatDistance, formatDuration, formatHours } from './format';
import { AU_KM, PROXIMA_DISTANCE_KM } from '../physics/constants';

describe('format', () => {
  it('durations', () => {
    expect(formatDuration(499.005)).toBe('8 min 19 s');
    expect(formatDuration(19_702)).toBe('5 h 28 min');
    expect(formatDuration(0.0331)).toBe('33 ms');
    expect(formatDuration(4.2465 * 365.25 * 86400)).toBe('4.25 years');
  });

  it('clock', () => {
    expect(formatClock(499)).toBe('00:08:19');
    expect(formatClock(90_061)).toBe('1 d 01:01:01');
  });

  it('distances', () => {
    expect(formatDistance(384_400)).toBe('384,400 km');
    expect(formatDistance(AU_KM)).toBe('149.6 million km');
    expect(formatDistance(30.07 * AU_KM)).toBe('30.07 AU');
    expect(formatDistance(PROXIMA_DISTANCE_KM)).toBe('4.25 ly');
  });

  it('speeds as fractions of c', () => {
    expect(formatBeta(0.5)).toBe('0.5c');
    expect(formatBeta(0.99)).toBe('0.99c');
    expect(formatBeta(0.99999)).toBe('0.99999c');
    expect(formatBeta(5.64e-5)).toBe('5.6 × 10⁻⁵ c');
  });

  it('day lengths', () => {
    expect(formatHours(23.9345)).toBe('23 h 56 min');
    expect(formatHours(-5832.6)).toBe('243.0 days (retrograde)');
  });
});
