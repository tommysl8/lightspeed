import type { ExplainerId } from '../content/explainers';
import { useUI } from '../state/ui';

export function openExplainer(id: ExplainerId): void {
  useUI.setState({ explainerOpen: true, explainerTopic: id });
  markSeen(id);
}

// ── "Seen" bookkeeping so auto-surfacing only happens once per topic ─────────────────────

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

/** Open a topic the first time something relevant happens (e.g. first time past 0.1c). */
export function surfaceOnce(id: ExplainerId): void {
  if (seen.has(id)) return;
  openExplainer(id);
}
