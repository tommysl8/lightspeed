import type { ExplainerId } from '../content/explainers';
import { useUI } from '../state/ui';

/** Open a reference section in the lab manual. */
export function openExplainer(id: ExplainerId): void {
  useUI.setState({ leftOpen: true, manualTab: 'reference', refTopic: id, noteTopic: null });
  markSeen(id);
}

// ── "Seen" bookkeeping so a section is only suggested once ────────────────────────────────

const SEEN_KEY = 'lightspeed.seenExplainers';
function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
const seen = readSeen();
function markSeen(id: ExplainerId): void {
  seen.add(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable: fine */
  }
}

/**
 * Suggest a reference section the first time something relevant happens (e.g. first time
 * past 0.1c). It appears as a margin note in the viewport rather than taking over the screen.
 */
export function surfaceOnce(id: ExplainerId): void {
  if (seen.has(id)) return;
  markSeen(id);
  useUI.setState({ noteTopic: id });
}
