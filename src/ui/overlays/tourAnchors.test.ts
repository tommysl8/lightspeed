/**
 * Every step of the tour points at something on screen: each anchor it names must be set as
 * data-tour="…" (or a Menu's tour="…") somewhere in the interface.
 */
import { describe, expect, it } from 'vitest';
import tour from './Tour.tsx?raw';

const SOURCES = import.meta.glob<string>(['../../**/*.tsx'], { query: '?raw', import: 'default', eager: true });

describe('the tour', () => {
  const anchors = [...tour.matchAll(/anchor: '([\w-]+)'/g)].map((m) => m[1]);
  const code = Object.values(SOURCES).join('\n');
  const set = new Set([...code.matchAll(/(?:data-tour|\btour)="([\w-]+)"/g)].map((m) => m[1]));

  it('has about seven steps', () => {
    expect(anchors.length).toBeGreaterThanOrEqual(6);
    expect(anchors.length).toBeLessThanOrEqual(8);
  });

  it('anchors every step to something on screen', () => {
    for (const a of anchors) expect(set, `data-tour="${a}"`).toContain(a);
  });
});
