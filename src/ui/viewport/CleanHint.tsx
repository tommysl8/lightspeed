/**
 * On entering clean full screen (ui/cleanMode.ts): how to leave, in the middle of the view, for two
 * seconds, fading as it goes (at once where reduced motion is asked for). The only text clean mode shows
 * besides a picture's credit.
 */
import { useEffect, useState } from 'react';
import { useUI } from '../../state/ui';
import { CLEAN_HINT, CLEAN_HINT_MS } from '../cleanMode';

/** The fade after the hint's two seconds, ms (index.css `.clean-hint`). */
const FADE_MS = 500;

export function CleanHint() {
  const clean = useUI((s) => s.clean);
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(clean);
    if (!clean) return;
    const t = window.setTimeout(() => setOn(false), CLEAN_HINT_MS + FADE_MS);
    return () => window.clearTimeout(t);
  }, [clean]);
  if (!clean || !on) return null;
  return (
    <div data-clean-keep className="pointer-events-none absolute inset-x-0 top-[42%] z-40 flex justify-center px-4" role="status">
      <span className="clean-hint rounded-full bg-black/60 px-3.5 py-1.5 text-[12.5px] text-fg-2">{CLEAN_HINT}</span>
    </div>
  );
}
