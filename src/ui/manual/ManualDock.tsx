import { lazy, Suspense, useRef, type KeyboardEvent } from 'react';
import { useNotebook } from '../../lab/notebook';
import { useUI, type ManualTab } from '../../state/ui';
import { CloseIcon, DockResizer } from '../kit';

// The lab pulls in KaTeX, so it loads on first use.
const LabManual = lazy(() => import('./LabManual'));

const TABS: { id: ManualTab; label: string }[] = [
  { id: 'experiments', label: 'Experiments' },
  { id: 'notebook', label: 'Notebook' },
  { id: 'reference', label: 'Reference' },
];

/** The lab (left dock): experiments, the notebook and the reference. */
export function ManualDock() {
  const tab = useUI((s) => s.manualTab);
  const count = useNotebook((s) => s.rows.length);
  const width = useUI((s) => s.leftWidth);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (id: ManualTab) =>
    useUI.setState(id === 'experiments' && tab === 'experiments' ? { experiment: null } : { manualTab: id });
  // Tab-list keys: arrows move between tabs.
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = TABS.length;
    const j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    e.stopPropagation();
    useUI.setState({ manualTab: TABS[j].id });
    refs.current[j]?.focus();
  };
  return (
    <aside className="dock dock-l relative" aria-label="Lab" style={{ width }}>
      <DockResizer side="left" width={width} initial={384} onChange={(w) => useUI.setState({ leftWidth: w })} />
      <div className="titlebar !h-[30px]">
        <span className="cap !text-fg-2">Lab</span>
        <button className="btn btn-q btn-sq ml-auto !h-5 !w-5" onClick={() => useUI.setState({ leftOpen: false })} aria-label="Close the lab">
          <CloseIcon />
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="Lab sections">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`lab-tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="lab-panel"
            tabIndex={tab === t.id ? 0 : -1}
            className="tab"
            onClick={() => select(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
            {t.id === 'notebook' && count > 0 && <span className="mono ml-1.5 text-[10px] text-fg-3">{count}</span>}
          </button>
        ))}
      </div>
      <div id="lab-panel" role="tabpanel" aria-labelledby={`lab-tab-${tab}`} className="scroll min-h-0 flex-1">
        <Suspense fallback={<div className="cap px-4 py-3">Loading…</div>}>
          <LabManual />
        </Suspense>
      </div>
    </aside>
  );
}
