/**
 * The journeys: one-click trips and scenes, each with what to look for. Flights are
 * predicted live (they leave from Earth, and the planets move).
 */
import { useEffect, useState } from 'react';
import { JOURNEYS, predictFlight, type Journey } from '../../content/journeys';
import { qty } from '../../lib/sci';
import { useUI } from '../../state/ui';
import { CloseIcon } from '../kit';
import { Icon } from '../icons';
import { useModal } from '../useModal';
import { rich } from '../rich';

/** "1.40 h on Earth · 36.6 min on board", recomputed every few seconds. */
function usePredictions(open: boolean): Record<string, string> {
  const [text, setText] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const compute = () => {
      const out: Record<string, string> = {};
      for (const j of JOURNEYS) {
        if (!j.flight) continue;
        const p = predictFlight(j.flight);
        if (!p) {
          out[j.id] = 'not reachable today';
          continue;
        }
        const t = qty(p.earthTime, 'time', 3);
        const tau = qty(p.shipTime, 'time', 3);
        out[j.id] = `${t.v} ${t.u} on Earth · ${tau.v} ${tau.u} on board`;
      }
      setText(out);
    };
    compute();
    const id = window.setInterval(compute, 4000);
    return () => window.clearInterval(id);
  }, [open]);
  return text;
}

function Row({ j, n, pred, disabled }: { j: Journey; n: number; pred?: string; disabled: boolean }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        className="group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-hover disabled:opacity-50 disabled:hover:bg-transparent"
        onClick={() => j.run()}
        disabled={disabled}
        data-autofocus={n === 1 || undefined}
      >
        <span className="mono mt-[3px] w-5 shrink-0 text-[11px] text-accent">{String(n).padStart(2, '0')}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-[15.5px] leading-snug text-fg group-hover:text-white">{j.title}</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-fg-2">{j.sub}</span>
          <span className="mono mt-1 block text-[10.5px] text-fg-3">{j.flight ? rich(pred ?? '…') : j.clock}</span>
        </span>
        <span className="btn btn-sm mt-1 shrink-0 group-hover:border-accent group-hover:text-fg" aria-hidden>
          {j.flight ? 'Fly' : 'Show'}
          <Icon name="arrow-right" size={11} />
        </span>
      </button>
    </li>
  );
}

function Card() {
  const tripActive = useUI((s) => s.tripActive);
  const close = () => useUI.setState({ journeysOpen: false });
  const ref = useModal<HTMLDivElement>(close);
  const pred = usePredictions(true);
  return (
    <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto bg-black/50 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="journeys-title" className="panel-float appear w-[560px] max-w-full">
        <div className="flex items-center gap-3 border-b border-line-2 py-2.5 pl-5 pr-2.5">
          <Icon name="compass" size={14} className="text-accent" />
          <h1 id="journeys-title" className="text-[13.5px] font-semibold text-fg">
            Journeys
          </h1>
          <button className="btn btn-q btn-sq ml-auto" onClick={close} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <p className="border-b border-line px-5 py-2.5 text-[12px] leading-snug text-fg-2">
          Seven set pieces, one click each. Flights leave from Earth, and time runs fast enough for a trip to take about half a
          minute; the recorder along the bottom shows both clocks and can skip to arrival.
        </p>
        {tripActive && (
          <p className="border-b border-line bg-accent/[0.06] px-5 py-2 text-[12px] text-accent">A flight is under way: finish it, or abort it on the recorder, before starting another journey.</p>
        )}
        <ol className="scroll max-h-[min(60vh,560px)] list-none">
          {JOURNEYS.map((j, i) => (
            <Row key={j.id} j={j} n={i + 1} pred={pred[j.id]} disabled={tripActive} />
          ))}
        </ol>
      </div>
    </div>
  );
}

export function Journeys() {
  const open = useUI((s) => s.journeysOpen);
  return open ? <Card /> : null;
}
