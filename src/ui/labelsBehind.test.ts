import { describe, expect, it } from 'vitest';
import { hiddenBehindFocus } from './Labels';

describe('hiddenBehindFocus', () => {
  const focus = { distCamera: 100, radiusPx: 200, screen: { x: 500, y: 400, onScreen: true } };
  it('hides a label behind the body in focus, within its disc on screen', () => {
    expect(hiddenBehindFocus({ distCamera: 1e6, screen: { x: 560, y: 420 } }, focus)).toBe(true);
  });
  it('keeps labels in front of it, beside it, or when it is off screen', () => {
    expect(hiddenBehindFocus({ distCamera: 50, screen: { x: 560, y: 420 } }, focus)).toBe(false);
    expect(hiddenBehindFocus({ distCamera: 1e6, screen: { x: 800, y: 400 } }, focus)).toBe(false);
    expect(hiddenBehindFocus({ distCamera: 1e6, screen: { x: 560, y: 420 } }, { ...focus, screen: { ...focus.screen, onScreen: false } })).toBe(false);
    expect(hiddenBehindFocus({ distCamera: 1e6, screen: { x: 560, y: 420 } }, undefined)).toBe(false);
  });
});
