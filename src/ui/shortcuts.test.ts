/**
 * The keys for Roam and clean full screen (ui/useShortcuts.ts, ui/navigation.ts): what one press of Esc
 * does, in order; which keys bring the interface back from clean full screen; F into and out of Roam, and
 * refused (with a message) on a trip and in a fall; and the keys sheet (ui/keys.tsx) saying so, with no key
 * given two jobs.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { controller } from '../controls/cameraController';
import { notices } from './notices';
import { updateEphemeris } from '../sim/ephemeris';
import { setSimTime } from '../sim/sim';
import { useUI, type UIState } from '../state/ui';
import { KEY_GROUPS } from './keys';
import { roamRefusal, toggleRoam } from './navigation';
import { escapeStep, keyLeavesClean } from './useShortcuts';

type EscState = Parameters<typeof escapeStep>[0];
const calm: EscState = { clean: false, plannerOpen: false, noteTopic: null, selected: null, journeyNote: null, tripActive: false, controlMode: 'orbit' };

describe('Esc, one thing at a time', () => {
  it('leaves clean full screen first, then closes what is open, then leaves Roam; the ship goes back to Roam', () => {
    const all: EscState = { clean: true, plannerOpen: true, noteTopic: 'light-time', selected: 'mars', journeyNote: 'Look.', tripActive: false, controlMode: 'roam' };
    expect(escapeStep(all)).toBe('clean');
    expect(escapeStep({ ...all, clean: false })).toBe('planner');
    expect(escapeStep({ ...all, clean: false, plannerOpen: false })).toBe('note');
    expect(escapeStep({ ...all, clean: false, plannerOpen: false, noteTopic: null })).toBe('selection');
    expect(escapeStep({ ...all, clean: false, plannerOpen: false, noteTopic: null, selected: null })).toBe('journey');
    expect(escapeStep({ ...calm, controlMode: 'roam' })).toBe('roam');
    expect(escapeStep({ ...calm, controlMode: 'free' })).toBe('ship');
    expect(escapeStep(calm)).toBeNull();
    // A trip's note stays (the flight panel holds it), and Esc never ends a trip or a fall.
    expect(escapeStep({ ...calm, journeyNote: 'Look.', tripActive: true, controlMode: 'travel' })).toBeNull();
    expect(escapeStep({ ...calm, controlMode: 'fall' })).toBeNull();
  });

  it('brings the interface back from clean full screen for a key that opens something, but not for a letter that steers', () => {
    for (const k of ['?', '/', 'e', 'i', 'g']) expect(keyLeavesClean(k, false)).toBe(true);
    expect(keyLeavesClean('e', true)).toBe(false);
    expect(keyLeavesClean('o', false)).toBe(false);
    expect(keyLeavesClean('w', true)).toBe(false);
  });
});

describe('F: Roam', () => {
  beforeAll(() => {
    setSimTime(Date.UTC(2026, 8, 30, 12));
    updateEphemeris();
  });
  beforeEach(() => {
    useUI.setState({ tripActive: false, fallActive: false } satisfies Partial<UIState>);
    controller.placeAt('earth', 26_000);
    controller.update(1 / 60, 0);
  });

  it('goes into Roam from orbit and out again, orbiting what is nearest', () => {
    toggleRoam();
    expect(controller.mode).toBe('roam');
    controller.update(1 / 60, 0);
    toggleRoam();
    expect(controller.mode).toBe('transition');
    for (let i = 0; i < 60 * 7; i++) controller.update(1 / 60, 0);
    expect(controller.mode).toBe('orbit');
    expect(useUI.getState().focus).toBe('earth');
  });

  it('leaves the ship straight into orbit, as F always has', () => {
    toggleRoam();
    controller.update(1 / 60, 0);
    controller.roamToShip();
    expect(controller.mode).toBe('free');
    toggleRoam();
    expect(controller.mode).toBe('transition');
    for (let i = 0; i < 60 * 7; i++) controller.update(1 / 60, 0);
  });

  it('is refused on a trip and in a fall, and says why', () => {
    useUI.setState({ tripActive: true });
    expect(roamRefusal()).toMatch(/Not during a trip/);
    toggleRoam();
    expect(controller.mode).toBe('orbit');
    expect(notices().at(-1)?.text).toBe(roamRefusal());
    useUI.setState({ tripActive: true, fallActive: true });
    expect(roamRefusal()).toMatch(/Not during a fall/);
    toggleRoam();
    expect(notices().at(-1)?.text).toMatch(/Stop the fall/);
    useUI.setState({ tripActive: false, fallActive: false });
    expect(roamRefusal()).toBeNull();
  });
});

/** A row's key cell as plain text ("Shift+F", "W A S D or arrows"). */
function text(n: ReactNode): string {
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(text).join(' ');
  if (isValidElement<{ children?: ReactNode }>(n)) return text(n.props.children);
  return '';
}

describe('the keys sheet', () => {
  const rows = KEY_GROUPS.flatMap((g) => g.rows.map(([k, v]) => ({ group: g.title, key: text(k).replace(/\s+/g, ' ').trim(), what: String(v) })));

  it('lists Roam under F and clean full screen under Shift+F', () => {
    const roam = KEY_GROUPS.find((g) => g.title === 'Roam')!;
    expect(roam).toBeDefined();
    expect(rows.find((r) => r.key === 'F')?.what).toMatch(/^Roam on and off/);
    expect(rows.find((r) => r.key === 'Shift + F')?.what).toMatch(/^Clean full screen/);
    expect(rows.find((r) => r.key === 'Esc')?.what).toMatch(/Leave clean full screen.*leave Roam/);
    expect(KEY_GROUPS.some((g) => g.title === 'Free flight')).toBe(false);
  });

  it('gives no single key two jobs', () => {
    const singles = rows.map((r) => r.key).filter((k) => /^[A-Z0-9?]$/.test(k));
    expect(new Set(singles).size).toBe(singles.length);
  });
});
