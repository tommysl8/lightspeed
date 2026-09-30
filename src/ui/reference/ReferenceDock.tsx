import { lazy, Suspense } from 'react';
import { useUI } from '../../state/ui';
import { CloseIcon, DockResizer } from '../kit';

// The sections carry KaTeX, so they load on first use.
const ReferenceSection = lazy(() => import('./ReferenceSection'));

/** The physics reference (left dock): one section at a time, with its equation. Opens only when asked for. */
export function ReferenceDock() {
  const width = useUI((s) => s.leftWidth);
  return (
    <aside className="dock dock-l relative" aria-label="Physics reference" style={{ width }}>
      <DockResizer side="left" width={width} initial={384} onChange={(w) => useUI.setState({ leftWidth: w })} />
      <div className="titlebar !h-[30px]">
        <span className="cap !text-fg-2">Physics reference</span>
        <button className="btn btn-q btn-sq ml-auto !h-5 !w-5" onClick={() => useUI.setState({ leftOpen: false })} aria-label="Close the physics reference">
          <CloseIcon />
        </button>
      </div>
      <div className="scroll min-h-0 flex-1">
        <Suspense fallback={<div className="px-4 py-3 text-[12px] text-fg-3">Loading…</div>}>
          <ReferenceSection />
        </Suspense>
      </div>
    </aside>
  );
}
