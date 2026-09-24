import { useEffect, useRef } from 'react';
import { EXPLAINERS, explainerById, type ExplainerId } from '../content/explainers';
import { openExplainer } from './explainerActions';
import { useUI } from '../state/ui';
import { TeX } from './TeX';

export function ExplainerPanel() {
  const open = useUI((s) => s.explainerOpen);
  const topic = useUI((s) => s.explainerTopic);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [topic]);
  if (!open) return null;
  const e = explainerById(topic);
  const i = EXPLAINERS.findIndex((x) => x.id === topic);
  const go = (d: number) => openExplainer(EXPLAINERS[(i + d + EXPLAINERS.length) % EXPLAINERS.length].id);

  return (
    <aside
      className="glass fade-in pointer-events-auto absolute bottom-20 left-4 top-[84px] z-30 flex w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden"
      aria-label="Physics explainer"
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
        <select
          className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[12.5px] text-white/85 outline-none"
          value={topic}
          onChange={(ev) => openExplainer(ev.target.value as ExplainerId)}
          aria-label="Topic"
        >
          {EXPLAINERS.map((x, k) => (
            <option key={x.id} value={x.id} className="bg-neutral-900">
              {k + 1}. {x.title}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 gap-1">
          <button className="chip w-7 justify-center" onClick={() => go(-1)} aria-label="Previous topic">
            ‹
          </button>
          <button className="chip w-7 justify-center" onClick={() => go(1)} aria-label="Next topic">
            ›
          </button>
          <button className="chip" onClick={() => useUI.setState({ explainerOpen: false })} aria-label="Close explainer">
            Close
          </button>
        </div>
      </header>
      <div ref={scroller} className="overflow-y-auto px-5 py-4">
        <div className="stat-label">Physics · {i + 1} of {EXPLAINERS.length}</div>
        <h2 className="mb-3 mt-1 text-[19px] font-semibold tracking-tight text-white">{e.title}</h2>
        <div className="mb-4 overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-white">
          <TeX>{e.equation}</TeX>
        </div>
        <div className="text-[13.5px] leading-relaxed text-white/80">{e.body}</div>
        {e.note && (
          <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-amber-50/80">
            <span className="font-semibold text-amber-100">Simplified here: </span>
            {e.note}
          </div>
        )}
      </div>
    </aside>
  );
}
