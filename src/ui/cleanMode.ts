/**
 * Clean full screen: the view alone, to look and move around the universe with nothing else on screen.
 *
 * What: entering (View › Clean full screen, or Shift+F) asks the browser for full screen and hides every
 * piece of text and chrome: the header and footer, the panels, the labels and names, the cards, the notes,
 * the readouts, Roam's panel. The canvas stays, and every control keeps working (a drag, the wheel, Roam,
 * the keys). A hint says how to leave for two seconds. Leaving (Esc, Shift+F, or the browser's own exit
 * from full screen) shows everything again exactly as it was: nothing is closed or changed, only hidden
 * (state/ui.ts `clean`; the style sheet's `.app-clean`). Where full screen is refused or does not exist (an
 * iPhone, a frame without permission), the interface is hidden all the same.
 *
 * The exceptions: the credits of the nebulae's pictures while one is on screen (CC BY 4.0 asks for them
 * wherever the picture shows, so a faint "©" stays in a corner and opens them: viewport/PictureCredits.tsx),
 * and on a touch screen Roam's two arrows, its only way to move there (flight/RoamPanel.tsx).
 *
 * How: the browser's Fullscreen API behind a small interface (so the tests can stand in for it); full screen
 * is left on leaving only if this mode asked for it.
 */
import { useUI } from '../state/ui';

/** What clean mode needs of the browser's full screen. */
export interface FullscreenApi {
  /** The element shown full screen, or null. */
  element(): Element | null;
  /** Ask for full screen (null where it does not exist). */
  request(): Promise<void> | null;
  exit(): Promise<void> | null;
  /** Hear of full screen starting or ending; returns the unsubscribe function. */
  onChange(listener: () => void): () => void;
}

interface WebkitDocument {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface WebkitElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** The page's own full screen (with Safari's prefixed names where it has only those), or null outside a browser. */
function browserFullscreen(): FullscreenApi | null {
  if (typeof document === 'undefined') return null;
  const doc = document as Document & WebkitDocument;
  const root = document.documentElement as HTMLElement & WebkitElement;
  const asPromise = (r: Promise<void> | void): Promise<void> => (r instanceof Promise ? r : Promise.resolve());
  return {
    element: () => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null,
    request: () => {
      if (root.requestFullscreen) return root.requestFullscreen({ navigationUI: 'hide' });
      if (root.webkitRequestFullscreen) return asPromise(root.webkitRequestFullscreen());
      return null;
    },
    exit: () => {
      if (doc.exitFullscreen) return doc.exitFullscreen();
      if (doc.webkitExitFullscreen) return asPromise(doc.webkitExitFullscreen());
      return null;
    },
    onChange: (f) => {
      doc.addEventListener('fullscreenchange', f);
      doc.addEventListener('webkitfullscreenchange', f);
      return () => {
        doc.removeEventListener('fullscreenchange', f);
        doc.removeEventListener('webkitfullscreenchange', f);
      };
    },
  };
}

/** How long the hint stays, ms (it fades over its last half second). */
export const CLEAN_HINT_MS = 2000;
/** The hint. */
export const CLEAN_HINT = 'Esc or Shift+F to leave';

const state = {
  api: undefined as FullscreenApi | null | undefined,
  off: null as (() => void) | null,
  /** Full screen was asked for by clean mode (and so is left with it). */
  own: false,
  /** Asked for, not yet granted. */
  asking: false,
  /** When clean mode last ended because full screen did, ms: the Esc that ended it must do nothing more. */
  leftAt: -Infinity,
};

/** Use this full screen from now on (the browser's by default; the tests pass their own, or null for none). */
export function setFullscreenApi(api: FullscreenApi | null): void {
  state.off?.();
  state.off = null;
  state.api = api;
  state.own = false;
  state.asking = false;
  if (api) state.off = api.onChange(onFullscreenChange);
}

function api(): FullscreenApi | null {
  if (state.api === undefined) setFullscreenApi(browserFullscreen());
  return state.api ?? null;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Full screen started or ended: the browser's own exit (Esc, its button) leaves clean mode too. */
function onFullscreenChange(): void {
  const fs = state.api;
  if (!fs) return;
  if (fs.element()) {
    if (state.asking) state.own = true;
    return;
  }
  const was = state.own;
  state.own = false;
  state.asking = false;
  if (was && useUI.getState().clean) {
    useUI.setState({ clean: false });
    state.leftAt = now();
  }
}

/** Hide the interface and ask for full screen (the interface hides even where full screen is refused). */
export function enterClean(): void {
  if (useUI.getState().clean) return;
  useUI.setState({ clean: true });
  const fs = api();
  if (!fs || fs.element()) return;
  const asked = fs.request();
  if (!asked) return;
  state.asking = true;
  asked
    .then(() => {
      if (fs.element()) state.own = true;
    })
    .catch(() => {
      // Refused (a frame without permission, no user gesture): the view stays clean in the window.
    })
    .finally(() => {
      state.asking = false;
      // Left again before the browser answered: give the full screen back.
      if (state.own && !useUI.getState().clean) leaveFullscreen();
    });
}

function leaveFullscreen(): void {
  const fs = state.api;
  const own = state.own;
  state.own = false;
  if (own && fs?.element()) fs.exit()?.catch(() => {});
}

/** Show the interface again, as it was; leave full screen if clean mode asked for it. */
export function leaveClean(): void {
  if (!useUI.getState().clean) return;
  useUI.setState({ clean: false });
  leaveFullscreen();
}

export function toggleClean(): void {
  if (useUI.getState().clean) leaveClean();
  else enterClean();
}

/** Whether clean mode ended a moment ago with the browser's full screen (the key that ended it must not act again). */
export const cleanJustEnded = (): boolean => now() - state.leftAt < 250;

/** The class of the app's root: clean mode hides everything but the view (index.css, `.app-clean`). */
export const appClass = (clean: boolean): string => (clean ? 'app app-clean' : 'app');
