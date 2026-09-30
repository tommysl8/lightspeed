import { describe, expect, it } from 'vitest';
import { retryAfterMs } from './extensionLoad';

describe('a star download that fails', () => {
  it('is tried again after 2 s, then twice as long each time, never more than a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(retryAfterMs)).toEqual([2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000]);
  });
});
