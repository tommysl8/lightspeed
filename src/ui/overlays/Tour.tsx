/**
 * Guided tour: a short sequence of notes, each pinned to one part of the screen, which is
 * picked out by a spotlight. Anchors are elements marked data-tour="…" (the header's search,
 * journeys, date chip, Learn and View menu, the footer's time controls, and the view); a step
 * whose anchor is not on screen (a narrow layout) is shown centred instead.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useUI } from '../../state/ui';
import { Kbd } from '../kit';
import { openSearch } from '../onboarding';
import { useModal } from '../useModal';

interface Step {
  anchor: string;
  title: string;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    anchor: 'view',
    title: 'The Solar System, right now',
    body: (
      <>
        Every planet is where it really is at this moment, and every distance is true to scale. Drag to look around, scroll to
        zoom, and click a planet for its card. At this scale the planets are specks, so labels mark where they are.
      </>
    ),
  },
  {
    anchor: 'search',
    title: 'Where to?',
    body: (
      <>
        Type a name, or part of one: Saturn, the Moon, Voyager 1, the nearest star. <b>Go</b> takes the camera there; <b>Fly</b>{' '}
        plans a real flight at 1 g and shows how long it takes for you and at home. Press <Kbd>/</Kbd> or <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>{' '}
        from anywhere.
      </>
    ),
  },
  {
    anchor: 'journeys',
    title: 'Journeys',
    body: (
      <>
        Seven set pieces, one click each: race a pulse of sunlight to Earth, ride to Saturn at 0.9<i>c</i>, or push to Proxima
        Centauri at 1 g. Each says what to look for.
      </>
    ),
  },
  {
    anchor: 'epoch',
    title: 'Pick a date',
    body: (
      <>
        The date being shown, in UTC. Click it to go to any year from 10,000 BCE to 9999. It turns amber, with a dot, whenever
        it is not the present.
      </>
    ),
  },
  {
    anchor: 'time',
    title: 'Run the clock',
    body: (
      <>
        Pause with <Kbd>Space</Kbd>; the arrows (or <Kbd>[</Kbd> <Kbd>]</Kbd>) run time slower or faster, from real time up to
        millions of years a second. <b>Now</b> brings you back to the present. In flight they set the pace of the trip instead.
      </>
    ),
  },
  {
    anchor: 'learn',
    title: 'Learn',
    body: (
      <>
        Long reads on the science behind the view: how it was found out, what the physics says and what comes next, with the
        sources to go further. Press <Kbd>E</Kbd> to open it.
      </>
    ),
  },
  {
    anchor: 'view-menu',
    title: 'Everything else',
    body: (
      <>
        The View menu holds the display layers, the optics, the guide and the keys, and the instrument panel with every number
        live. Beside it, <b>Lab</b> (on a phone, at the end of Learn) has five guided experiments for students. Both are
        there for those who want them.
      </>
    ),
  },
];

type Box = { x: number; y: number; w: number; h: number };

/** Where the anchor is on screen, followed every frame (panels open and close under it). */
function useAnchor(anchor: string): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      const r = document.querySelector(`[data-tour="${anchor}"]`)?.getBoundingClientRect();
      const next = r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
      setBox((b) => (b && next && b.x === next.x && b.y === next.y && b.w === next.w && b.h === next.h ? b : next));
      raf = requestAnimationFrame(read);
    };
    read();
    return () => cancelAnimationFrame(raf);
  }, [anchor]);
  return box;
}

function TourStep({ i }: { i: number }) {
  const step = STEPS[i];
  const box = useAnchor(step.anchor);
  const last = i === STEPS.length - 1;
  const end = () => useUI.setState({ tourStep: null });
  const go = (d: number) => useUI.setState({ tourStep: Math.min(STEPS.length - 1, Math.max(0, i + d)) });
  const ref = useModal<HTMLDivElement>(end);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const W = Math.min(340, vw - 24);
  const pad = 5;
  // The card goes beside the anchor: below it in the top half, above it in the bottom half,
  // and in the middle of large areas such as the view.
  let style: CSSProperties = { left: (vw - W) / 2, top: '50%', transform: 'translateY(-50%)' };
  if (box && box.w * box.h < vw * vh * 0.3) {
    const left = Math.min(vw - W - 12, Math.max(12, box.x + box.w / 2 - W / 2));
    style = box.y + box.h / 2 < vh / 2 ? { left, top: box.y + box.h + pad + 10 } : { left, bottom: vh - box.y + pad + 10 };
  }

  return (
    <div className="fixed inset-0 z-[55]" onKeyDown={(e) => {
      if (e.key === 'ArrowRight' && !last) go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }}>
      {box ? (
        <div
          className="pointer-events-none absolute border border-accent transition-[left,top,width,height] duration-200 ease-out motion-reduce:transition-none"
          style={{
            left: box.x - pad,
            top: box.y - pad,
            width: box.w + 2 * pad,
            height: box.h + 2 * pad,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.58)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="panel-float appear absolute"
        style={{ ...style, width: W }}
      >
        <div className="flex items-center gap-2 border-b border-line-2 px-3.5 py-2">
          <span className="cap !text-accent">Tour</span>
          <span className="mono text-[10px] text-fg-3">
            {i + 1} / {STEPS.length}
          </span>
          <span className="ml-auto flex gap-[3px]" aria-hidden>
            {STEPS.map((_, k) => (
              <span key={k} className={`h-[3px] w-3 ${k <= i ? 'bg-accent' : 'bg-line-3'}`} />
            ))}
          </span>
        </div>
        <div className="px-3.5 pb-3 pt-2.5">
          <h2 id="tour-title" className="font-serif text-[17px] font-medium leading-snug text-fg">
            {step.title}
          </h2>
          <p id="tour-body" className="mt-1.5 text-[12.5px] leading-relaxed text-fg-2">
            {step.body}
          </p>
        </div>
        <div className="flex items-center gap-1.5 border-t border-line px-3.5 py-2">
          <button className="btn btn-q btn-sm -ml-1.5" onClick={end}>
            {last ? 'Close' : 'Skip tour'}
          </button>
          <span className="ml-auto" />
          {i > 0 && (
            <button className="btn btn-sm" onClick={() => go(-1)}>
              Back
            </button>
          )}
          {last ? (
            <button
              className="btn btn-pri btn-sm"
              data-autofocus
              onClick={() => {
                end();
                openSearch();
              }}
            >
              Where to?
            </button>
          ) : (
            <button className="btn btn-pri btn-sm" data-autofocus onClick={() => go(1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Tour() {
  const step = useUI((s) => s.tourStep);
  // Remount per step so focus lands on the new card's primary button.
  return step === null ? null : <TourStep key={step} i={step} />;
}
