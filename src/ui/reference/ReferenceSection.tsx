/**
 * One section of the physics reference: its key equation, a short derivation or discussion, what the simulator
 * simplifies, and further reading. Loaded lazily with KaTeX.
 */
import { memo, useEffect, useRef } from 'react';
import { EXPLAINERS, explainerById, type ExplainerId } from '../../content/explainers';
import { REFERENCE } from '../../content/reference';
import { useUI } from '../../state/ui';
import { openExplainer } from '../explainerActions';
import { Eq } from '../TeX';

// Memoised: resizing the dock re-renders the dock, not the section inside it.
export default memo(function ReferenceSection() {
  const topic = useUI((s) => s.refTopic);
  const e = explainerById(topic);
  const r = REFERENCE[topic];
  const i = EXPLAINERS.findIndex((x) => x.id === topic);
  const go = (d: number) => openExplainer(EXPLAINERS[(i + d + EXPLAINERS.length) % EXPLAINERS.length].id);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.parentElement?.scrollTo({ top: 0 });
  }, [topic]);
  return (
    <div ref={top} className="px-4 pb-8 pt-3">
      <div className="flex items-center gap-1">
        <select className="fld min-w-0 flex-1" value={topic} onChange={(ev) => openExplainer(ev.target.value as ExplainerId)} aria-label="Reference section">
          {EXPLAINERS.map((x, k) => (
            <option key={x.id} value={x.id}>
              §{k + 1} {x.title}
            </option>
          ))}
        </select>
        <button className="btn btn-q btn-sm" onClick={() => go(-1)} aria-label="Previous section">
          ‹
        </button>
        <button className="btn btn-q btn-sm" onClick={() => go(1)} aria-label="Next section">
          ›
        </button>
      </div>
      <h2 className="mt-4 font-serif text-[20px] font-medium leading-tight text-fg">
        <span className="text-fg-3">§{i + 1} </span>
        {e.title}
      </h2>
      <div className="prose-panel mt-3">
        <Eq n={`R${i + 1}`} tex={r.equation} />
        {r.body}
      </div>
      {r.note && (
        <div className="note note-caution">
          <span className="note-t">In the simulator</span>
          {r.note}
        </div>
      )}
      {r.reading && (
        <>
          <h3 className="mb-2 mt-5 text-[12px] font-medium text-fg-2">Further reading</h3>
          <ul className="m-0 list-none space-y-1 p-0">
            {r.reading.map((x) => (
              <li key={x} className="font-serif text-[12.5px] leading-snug text-fg-2">
                {x}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
});
