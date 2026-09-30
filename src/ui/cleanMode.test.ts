/**
 * Clean full screen (ui/cleanMode.ts): it hides the interface and asks for full screen; leaving (its key,
 * Esc, or the browser's own exit from full screen) shows everything again exactly as it was; where full
 * screen is refused the interface hides all the same; and the style sheet hides every piece of the page but
 * the view's canvas and the few marked to stay. The browser's full screen is stood in for.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUI } from '../state/ui';
import { readText } from '../test/files';
import { appClass, cleanJustEnded, enterClean, leaveClean, setFullscreenApi, toggleClean, type FullscreenApi } from './cleanMode';

/** A stand-in for the browser's full screen: grants or refuses, and lets the "user" leave it. */
function fakeFullscreen(grant: boolean, already = false) {
  let element: Element | null = already ? ({} as Element) : null;
  const listeners = new Set<() => void>();
  const fire = () => listeners.forEach((f) => f());
  const fs = {
    requests: 0,
    exits: 0,
    element: () => element,
    request: () => {
      fs.requests++;
      if (!grant) return Promise.reject(new Error('refused'));
      element = {} as Element;
      fire();
      return Promise.resolve();
    },
    exit: () => {
      fs.exits++;
      element = null;
      fire();
      return Promise.resolve();
    },
    onChange: (f: () => void) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    /** The browser's own exit (Esc, its button). */
    userExit: () => {
      element = null;
      fire();
    },
  };
  return fs satisfies FullscreenApi;
}

/** The interface's state clean mode must leave exactly as it was. */
const shown = () => {
  const s = useUI.getState();
  return {
    leftOpen: s.leftOpen,
    rightOpen: s.rightOpen,
    selected: s.selected,
    bodyCard: s.bodyCard,
    showLabels: s.showLabels,
    showOverlays: s.showOverlays,
    journeyNote: s.journeyNote,
    controlMode: s.controlMode,
    holePanel: s.holePanel,
  };
};

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  useUI.setState({ clean: false, rightOpen: true, selected: 'mars', bodyCard: true, journeyNote: 'Look for the ice caps.', holePanel: null });
});
afterEach(() => {
  leaveClean();
  setFullscreenApi(null);
  useUI.setState({ clean: false, rightOpen: false, selected: null, journeyNote: null });
});

describe('clean full screen', () => {
  it('hides the interface and goes full screen, and shows everything again exactly as it was', async () => {
    const fs = fakeFullscreen(true);
    setFullscreenApi(fs);
    const before = shown();
    enterClean();
    await settle();
    expect(useUI.getState().clean).toBe(true);
    expect(appClass(useUI.getState().clean)).toBe('app app-clean');
    expect(fs.requests).toBe(1);
    expect(fs.element()).not.toBeNull();
    // Nothing was closed: only hidden.
    expect(shown()).toEqual(before);
    leaveClean();
    await settle();
    expect(useUI.getState().clean).toBe(false);
    expect(appClass(false)).toBe('app');
    expect(fs.exits).toBe(1);
    expect(fs.element()).toBeNull();
    expect(shown()).toEqual(before);
  });

  it('ends with the browser’s own exit from full screen (Esc), and says so to the key that ended it', async () => {
    const fs = fakeFullscreen(true);
    setFullscreenApi(fs);
    enterClean();
    await settle();
    fs.userExit();
    expect(useUI.getState().clean).toBe(false);
    expect(cleanJustEnded()).toBe(true);
    // Nothing to exit: the browser has left full screen already.
    expect(fs.exits).toBe(0);
  });

  it('hides the interface all the same where full screen is refused (an iPhone, a frame without permission)', async () => {
    const fs = fakeFullscreen(false);
    setFullscreenApi(fs);
    enterClean();
    await settle();
    expect(useUI.getState().clean).toBe(true);
    toggleClean();
    expect(useUI.getState().clean).toBe(false);
    expect(fs.exits).toBe(0);
  });

  it('works with no full screen at all, and leaves a full screen it did not ask for as it was', async () => {
    setFullscreenApi(null);
    toggleClean();
    expect(useUI.getState().clean).toBe(true);
    toggleClean();
    expect(useUI.getState().clean).toBe(false);
    const fs = fakeFullscreen(true, true);
    setFullscreenApi(fs);
    enterClean();
    await settle();
    expect(fs.requests).toBe(0);
    leaveClean();
    expect(fs.exits).toBe(0);
    expect(fs.element()).not.toBeNull();
  });

  it('is hidden by the style sheet: every part of the page but the view, and in the view all but the canvas and what is marked to stay', () => {
    const css = readText('src/index.css').replace(/\s+/g, ' ');
    expect(css).toMatch(/\.app-clean > :not\(\.app-view\):not\(\[data-clean-keep\]\), \.app-clean \.app-view > :not\(\.app-canvas\):not\(\[data-clean-keep\]\) \{ display: none !important; \}/);
    const app = readText('src/App.tsx');
    expect(app).toMatch(/className=\{appClass\(clean\)\}/);
    expect(app).toMatch(/className="app-canvas /);
    // What stays: the hint on entering, the pictures' credits (a faint © that opens them) while one shows, and
    // Roam's arrows on a touch screen.
    expect(readText('src/ui/viewport/CleanHint.tsx')).toMatch(/data-clean-keep/);
    const credits = readText('src/ui/viewport/PictureCredits.tsx');
    expect(credits).toMatch(/data-clean-keep/);
    expect(credits).toMatch(/clean \? '©'/);
    expect(readText('src/ui/flight/RoamPanel.tsx')).toMatch(/data-clean-keep/);
  });
});
