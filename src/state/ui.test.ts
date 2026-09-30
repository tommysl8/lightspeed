import { describe, expect, it } from 'vitest';
import { migrateUI, savedPrefs, useUI } from './ui';

describe('the preferences store', () => {
  it('starts with both panels closed and hints off', () => {
    const s = useUI.getState();
    expect(s.leftOpen).toBe(false);
    expect(s.rightOpen).toBe(false);
    expect(s.hints).toBe(false);
    expect(s.searchOpen).toBe(false);
  });

  it('starts with the black-hole panel closed until asked for, the interface shown, and the camera in orbit', () => {
    const s = useUI.getInitialState();
    expect(s.holePanelAuto).toBe(false);
    expect(s.holePanel).toBeNull();
    expect(s.clean).toBe(false);
    expect(s.controlMode).toBe('orbit');
  });

  it('remembers whether the black-hole panel opens by itself, but not clean full screen nor a choice made near one hole', () => {
    useUI.setState({ holePanelAuto: true, clean: true, holePanel: { hole: 'sgr-a-star', open: true }, controlMode: 'roam' });
    try {
      const saved = savedPrefs(useUI.getState()) as Record<string, unknown>;
      expect(saved.holePanelAuto).toBe(true);
      expect(saved).not.toHaveProperty('clean');
      expect(saved).not.toHaveProperty('holePanel');
      expect(saved).not.toHaveProperty('controlMode');
    } finally {
      useUI.setState({ holePanelAuto: false, clean: false, holePanel: null, controlMode: 'orbit' });
    }
  });

  it('gives preferences saved before the option its default, off, with no migration (the store merges the saved state over its defaults)', () => {
    const before = { showOrbits: false, hints: true, rightOpen: true };
    const migrated = migrateUI(before, 6);
    expect(migrated).toEqual(before);
    expect({ ...useUI.getInitialState(), ...migrated }.holePanelAuto).toBe(false);
    expect({ ...useUI.getInitialState(), ...migrateUI({ ...before, holePanelAuto: true }, 6) }.holePanelAuto).toBe(true);
  });

  it('does not remember the physics reference as open, so it never appears by itself on a reload', () => {
    useUI.setState({ leftOpen: true, rightOpen: true, refTopic: 'doppler' });
    try {
      const saved = savedPrefs(useUI.getState()) as Record<string, unknown>;
      expect(saved).not.toHaveProperty('leftOpen');
      expect(saved.rightOpen).toBe(true);
      expect(saved.refTopic).toBe('doppler');
    } finally {
      useUI.setState({ leftOpen: false, rightOpen: false, refTopic: 'light-time' });
    }
  });
});

describe('migrateUI', () => {
  // A version 5 save, with keys for a panel this version no longer has.
  const v5 = { showOrbits: false, rightOpen: true, hints: true, leftWidth: 420, refTopic: 'lorentz', labUsed: true, manualTab: 'notebook', experiment: 'E3' };

  it('drops what this version no longer saves, and keeps the rest', () => {
    expect(migrateUI(v5, 5)).toEqual({ showOrbits: false, rightOpen: true, hints: true, leftWidth: 420, refTopic: 'lorentz' });
  });

  it('gives a store with no trace of the dropped keys once merged over the defaults, as persist does', () => {
    const s = { ...useUI.getInitialState(), ...migrateUI(v5, 5) } as unknown as Record<string, unknown>;
    expect(s.showOrbits).toBe(false);
    expect(s.refTopic).toBe('lorentz');
    expect(s.leftOpen).toBe(false);
    for (const k of ['labUsed', 'manualTab', 'experiment']) expect(s, k).not.toHaveProperty(k);
  });

  it('closes the instrument panel and turns hints off for anyone from before those changes', () => {
    expect(migrateUI({ rightOpen: true, hints: true }, 3)).toEqual({ rightOpen: false, hints: false });
    expect(migrateUI({ rightOpen: true, hints: true }, 4)).toEqual({ rightOpen: false, hints: true });
  });

  it('leaves current preferences alone', () => {
    const now = { rightOpen: true, refTopic: 'doppler' as const, hints: true };
    expect(migrateUI(now, 6)).toEqual(now);
  });
});
