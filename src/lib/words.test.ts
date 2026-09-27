import { describe, expect, it } from 'vitest';
import { countWord, countWordStart } from './words';

describe('countWord', () => {
  it('writes small counts in words and larger ones in figures', () => {
    expect(countWord(0)).toBe('no');
    expect(countWord(1)).toBe('one');
    expect(countWord(10)).toBe('ten');
    expect(countWord(20)).toBe('twenty');
    expect(countWord(21)).toBe('21');
    expect(countWord(55877)).toBe('55,877');
    expect(countWord(2.5)).toBe('2.5');
  });

  it('starts a sentence with a capital', () => {
    expect(countWordStart(10)).toBe('Ten');
    expect(countWordStart(12)).toBe('Twelve');
    expect(countWordStart(169)).toBe('169');
  });
});
