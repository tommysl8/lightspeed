import { useSyncExternalStore } from 'react';

/**
 * One shared clock for every panel that polls the simulation. The simulation lives outside
 * React, so panels showing live values (distances, clocks) re-render at a readable rate
 * rather than every frame. A single timer drives them all, so their updates land in one
 * React commit; it stops while the tab is hidden or nothing is listening.
 */
const BASE_MS = 50;
let tick = 0;
let timer = 0;
const subscribers = new Set<() => void>();

function subscribe(f: () => void) {
  subscribers.add(f);
  if (!timer) {
    timer = window.setInterval(() => {
      if (document.hidden) return;
      tick++;
      subscribers.forEach((s) => s());
    }, BASE_MS);
  }
  return () => {
    subscribers.delete(f);
    if (!subscribers.size) {
      window.clearInterval(timer);
      timer = 0;
    }
  };
}
const idle = () => () => {};

/** Re-render about `hz` times per second while `active`. Returns a counter. */
export function useTicker(hz = 4, active = true): number {
  const div = Math.max(1, Math.round(1000 / hz / BASE_MS));
  return useSyncExternalStore(active ? subscribe : idle, () => (active ? Math.floor(tick / div) : -1));
}
