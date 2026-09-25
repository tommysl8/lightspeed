import { lazy, Suspense } from 'react';
import { useNotebook } from '../../lab/notebook';
import { useUI, type ManualTab } from '../../state/ui';
import { CloseIcon } from '../kit';

// The manual pulls in KaTeX, so it loads on first use.
const LabManual = lazy(() => import('./LabManual'));

const TABS: { id: ManualTab; label: string }[] = [
  { id: 'experiments', label: 'Experiments' },
  { id: 'notebook', label: 'Notebook' },
  { id: 'reference', label: 'Reference' },
];

export function ManualDock() {
  const tab = useUI((s) => s.manualTab);
  const count = useNotebook((s) => s.rows.length);
  return (
    <aside className="dock dock-l" aria-label="Lab manual">
      <div className="titlebar !h-[30px]">
        <span className="cap !text-fg-2">Lab manual</span>
        <button className="btn btn-q btn-sq ml-auto !h-5 !w-5" onClick={() => useUI.setState({ leftOpen: false })} aria-label="Close lab manual">
          <CloseIcon />
        </button>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className="tab"
            onClick={() => useUI.setState(t.id === 'experiments' && tab === 'experiments' ? { experiment: null } : { manualTab: t.id })}
          >
            {t.label}
            {t.id === 'notebook' && count > 0 && <span className="mono ml-1.5 text-[10px] text-fg-3">{count}</span>}
          </button>
        ))}
      </div>
      <div className="scroll min-h-0 flex-1">
        <Suspense fallback={<div className="cap px-4 py-3">Loading manual…</div>}>
          <LabManual />
        </Suspense>
      </div>
    </aside>
  );
}
