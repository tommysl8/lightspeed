/**
 * localStorage for zustand's persist middleware, with writes coalesced: a burst of state
 * changes (dragging a panel edge, typing an answer) costs one write 400 ms later instead of
 * one synchronous write per change. Pending writes are flushed when the page is hidden or
 * closed.
 */
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

const pending = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | 0 = 0;

function flush() {
  if (timer) clearTimeout(timer);
  timer = 0;
  for (const [k, v] of pending) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage full or unavailable */
    }
  }
  pending.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
}

const deferred: StateStorage = {
  getItem: (k) => pending.get(k) ?? localStorage.getItem(k),
  setItem: (k, v) => {
    pending.set(k, v);
    if (!timer) timer = setTimeout(flush, 400);
  },
  removeItem: (k) => {
    pending.delete(k);
    localStorage.removeItem(k);
  },
};

export const deferredStorage = createJSONStorage(() => {
  // Throws where storage is unavailable (tests, blocked site data); persist then runs without it.
  void window.localStorage;
  return deferred;
});
export const flushStorage = flush;
