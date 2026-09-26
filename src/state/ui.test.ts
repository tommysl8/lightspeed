import { describe, expect, it } from 'vitest';
import { migrateUI, notebookShowsLabUse, savedPrefs, useUI } from './ui';

describe('the preferences store', () => {
  it('starts with both panels closed, hints off and the lab unused', () => {
    const s = useUI.getState();
    expect(s.leftOpen).toBe(false);
    expect(s.rightOpen).toBe(false);
    expect(s.hints).toBe(false);
    expect(s.labUsed).toBe(false);
    expect(s.searchOpen).toBe(false);
  });

  it('does not remember the lab as open, so it never appears by itself on a reload', () => {
    useUI.setState({ leftOpen: true, rightOpen: true, labUsed: true });
    try {
      const saved = savedPrefs(useUI.getState()) as Record<string, unknown>;
      expect(saved).not.toHaveProperty('leftOpen');
      expect(saved.rightOpen).toBe(true);
      expect(saved.labUsed).toBe(true);
    } finally {
      useUI.setState({ leftOpen: false, rightOpen: false, labUsed: false });
    }
  });
});

describe('migrateUI', () => {
  it('closes both docks and opens the lab on its experiments when coming from version 4', () => {
    const old = { leftOpen: true, rightOpen: true, manualTab: 'reference', hints: true, showOrbits: false };
    expect(migrateUI(old, 4, () => false)).toEqual({
      leftOpen: false,
      rightOpen: false,
      manualTab: 'experiments',
      hints: true,
      showOrbits: false,
      labUsed: false,
    });
  });

  it('counts someone whose notebook shows lab work as a lab user', () => {
    expect(migrateUI({}, 4, () => true).labUsed).toBe(true);
  });

  it('counts an experiment opened, or the notebook tab chosen, as lab use', () => {
    expect(migrateUI({ experiment: 'E3', manualTab: 'reference' }, 3, () => false).labUsed).toBe(true);
    expect(migrateUI({ manualTab: 'notebook' }, 2, () => false).labUsed).toBe(true);
    expect(migrateUI({ manualTab: 'experiments' }, 3, () => false).labUsed).toBe(true);
    // Before version 3 the panel opened on its experiments by default: not a sign of use.
    expect(migrateUI({ manualTab: 'experiments', experiment: null }, 2, () => false).labUsed).toBe(false);
  });

  it('turns hints off for anyone from before they existed', () => {
    expect(migrateUI({ hints: true }, 3, () => false).hints).toBe(false);
  });

  it('leaves current preferences alone', () => {
    const now = { leftOpen: false, rightOpen: true, labUsed: true, manualTab: 'notebook' as const };
    expect(migrateUI(now, 5)).toEqual(now);
  });
});

describe('notebookShowsLabUse', () => {
  const saved = (state: object) => JSON.stringify({ state, version: 1 });
  const autoRow = { id: 'E2-1-x', exp: 'E2', n: 1, simMs: 0, v: {}, src: 'auto' };

  it('ignores the rows every flight and pulse writes by itself', () => {
    expect(notebookShowsLabUse(saved({ rows: [autoRow, { ...autoRow, exp: 'E5' }], answers: {}, student: '', noise: false }))).toBe(false);
  });

  it('sees readings by hand, answers, a name or simulated uncertainty', () => {
    expect(notebookShowsLabUse(saved({ rows: [autoRow, { ...autoRow, exp: 'E3', src: 'manual' }] }))).toBe(true);
    expect(notebookShowsLabUse(saved({ rows: [], answers: { 'E2.q1': 'Slower.' } }))).toBe(true);
    expect(notebookShowsLabUse(saved({ rows: [], answers: { 'E2.q1': '  ' } }))).toBe(false);
    expect(notebookShowsLabUse(saved({ rows: [], student: 'A. Student' }))).toBe(true);
    expect(notebookShowsLabUse(saved({ rows: [], noise: true }))).toBe(true);
  });

  it('copes with nothing saved or something unreadable', () => {
    expect(notebookShowsLabUse(null)).toBe(false);
    expect(notebookShowsLabUse('{not json')).toBe(false);
    expect(notebookShowsLabUse('null')).toBe(false);
  });
});
