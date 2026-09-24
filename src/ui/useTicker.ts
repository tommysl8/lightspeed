import { useEffect, useState } from 'react';

/**
 * Re-render a component `hz` times per second. The simulation lives outside React, so panels
 * that show live values (distances, clocks) poll it at a readable rate instead of every frame.
 */
export function useTicker(hz = 4): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000 / hz);
    return () => window.clearInterval(id);
  }, [hz]);
  return tick;
}
