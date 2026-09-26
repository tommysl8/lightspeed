/**
 * "Where to?": a search palette over the view. Type a name (or part of one, or a nickname);
 * the arrow keys choose, Enter takes the camera there, Shift+Enter plans a 1 g flight.
 *
 * Results come from the destinations registry (content/destinations.ts), so what later
 * updates add (moons, stars, galaxies) turns up here by itself. Each shows how far away it is
 * and how old its light is; the highlighted one also shows what a 1 g flight there would cost
 * on both clocks. Planning a trip is not free (planTrip solves an intercept against the
 * ephemeris), so that is worked out for the highlighted row only, a moment after it settles.
 */
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { C_KM_S } from '../../physics/constants';
import {
  destinationsVersion,
  featuredDestinations,
  searchDestinations,
  subscribeDestinations,
  type Destination,
} from '../../content/destinations';
import { JOURNEYS } from '../../content/journeys';
import { qty } from '../../lib/sci';
import { formatDurationShort } from '../../lib/time';
import { sim } from '../../sim/sim';
import { planTrip } from '../../sim/travel';
import { useUI } from '../../state/ui';
import { openJourneys } from '../onboarding';
import { planOneG } from '../tripActions';
import { tripCostText } from '../flight/tripText';
import { CloseIcon, Kbd } from '../kit';
import { Icon } from '../icons';
import { rich } from '../rich';
import { useModal } from '../useModal';
import { useTicker } from '../useTicker';

const IN_FLIGHT = 'In flight: arrive or abort first';

/** A 1 g flight from where the camera is: its cost in words, or why there is none. */
interface Cost {
  ok: boolean;
  text: string;
}

function oneGCost(d: Destination): Cost {
  if (!d.body) return { ok: false, text: 'Flights there come in a later update' };
  const why = d.unavailable();
  if (why) return { ok: false, text: why };
  const plan = planTrip(d.body, 0, sim.camera.pos.clone(), sim.astroTime, 'rocket');
  if (!plan) return { ok: false, text: 'Out of reach at 1 g from here' };
  if (plan.distance <= 0) return { ok: false, text: 'You are here' };
  return { ok: true, text: tripCostText(plan) };
}

/**
 * Trip costs, worked out lazily and kept while the palette is open (the planets hardly move
 * in that time). `want` lists the rows whose cost is needed; one is computed per frame, so
 * opening the palette never stalls a frame with six intercept solutions at once.
 */
function useCosts(want: readonly Destination[], active: boolean): ReadonlyMap<string, Cost> {
  const cache = useRef(new Map<string, Cost>());
  const [, setVersion] = useState(0);
  const key = want.map((d) => d.id).join(' ');
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const todo = want.filter((d) => !cache.current.has(d.id));
    if (!todo.length) return;
    // A short pause first, so arrowing through the list does not plan every row passed.
    const timer = window.setTimeout(() => {
      const step = () => {
        const d = todo.shift();
        if (!d) return;
        if (!cache.current.has(d.id)) {
          cache.current.set(d.id, oneGCost(d));
          setVersion((v) => v + 1);
        }
        raf = requestAnimationFrame(step);
      };
      step();
    }, 90);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
    // `key` stands for `want`.
  }, [key, active]);
  return cache.current;
}

/** "5.20 au · light 43 min" */
function whereText(d: Destination): string {
  const km = d.distanceKm();
  if (!Number.isFinite(km)) return '';
  if (km < 1) return 'here';
  const q = qty(km, 'length', 3);
  return `${q.v} ${q.u} · light ${formatDurationShort(km / C_KM_S, 2)}`;
}

function Row({
  d,
  id,
  active,
  cost,
  showCost,
  flying,
  onHover,
  go,
  fly,
}: {
  d: Destination;
  id: string;
  active: boolean;
  cost: Cost | undefined;
  showCost: boolean;
  flying: boolean;
  onHover: () => void;
  go: () => void;
  fly: () => void;
}) {
  const why = d.unavailable();
  const goWhy = flying ? IN_FLIGHT : why;
  const flyWhy = flying ? IN_FLIGHT : !d.body ? 'Flights there come in a later update' : why;
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      className={`flex cursor-pointer items-center gap-3 border-l-2 px-4 py-2 ${active ? 'border-accent bg-hover' : 'border-transparent'} ${why ? 'opacity-60' : ''}`}
      onMouseMove={onHover}
      onClick={go}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-serif text-[15px] leading-snug text-fg" title={d.name}>
            {d.name}
          </span>
          <span className="shrink-0 text-[11.5px] text-fg-3">{d.kind}</span>
        </span>
        <span className="mono block truncate text-[11px] leading-[16px] text-fg-2">{rich(whereText(d))}</span>
        {showCost && (
          <span className={`mono block truncate text-[11px] leading-[16px] ${cost?.ok ? 'text-data' : 'text-fg-3'}`}>
            {cost ? (cost.ok ? `1 g: ${cost.text}` : cost.text) : '1 g: …'}
          </span>
        )}
      </span>
      {active && (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            tabIndex={-1}
            className="btn btn-sm"
            disabled={!!goWhy}
            title={goWhy ?? 'Take the camera there (Enter)'}
            onClick={(e) => {
              e.stopPropagation();
              go();
            }}
          >
            Go
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="btn btn-sm"
            disabled={!!flyWhy}
            title={flyWhy ?? 'Plan a 1 g rocket flight there from where you are (Shift+Enter)'}
            onClick={(e) => {
              e.stopPropagation();
              fly();
            }}
          >
            <Icon name="flight" size={11} />
            Fly
          </button>
        </span>
      )}
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="presentation">
      <div className="cap px-4 pb-1 pt-2.5">{title}</div>
      {children}
    </div>
  );
}

function Palette() {
  useTicker(2); // distances and light-times move
  const flying = useUI((s) => s.tripActive);
  const close = () => useUI.setState({ searchOpen: false });
  const ref = useModal<HTMLDivElement>(close);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listId = useId();
  const optionId = (i: number) => `${listId}-o${i}`;

  // Destinations can arrive while the palette is open (a later update's moons, loaded on demand).
  const registry = useSyncExternalStore(subscribeDestinations, destinationsVersion);
  const featured = useMemo(() => featuredDestinations(), [registry]);
  const results = useMemo(() => searchDestinations(query).map((m) => m.destination), [query, registry]);
  const browsing = query.trim() === '';
  const list = browsing ? featured : results;
  const cur = list.length ? Math.min(index, list.length - 1) : -1;
  const activeDest = cur >= 0 ? list[cur] : undefined;

  // Featured rows all show their cost; search results only the highlighted one.
  const want = flying ? [] : browsing ? featured : activeDest ? [activeDest] : [];
  const costs = useCosts(want, !flying);

  useEffect(() => setIndex(0), [query]);
  // Keep the highlighted row in view.
  useEffect(() => {
    if (cur >= 0) document.getElementById(optionId(cur))?.scrollIntoView({ block: 'nearest' });
  }, [cur]);

  const go = (d: Destination) => {
    if (flying || d.unavailable()) return;
    close();
    d.go();
  };
  const fly = (d: Destination) => {
    if (flying || !d.body || d.unavailable()) return;
    close();
    planOneG(d.body);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = list.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) setIndex((cur + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter' && activeDest) {
      e.preventDefault();
      if (e.shiftKey) fly(activeDest);
      else go(activeDest);
    }
    // Ctrl+K closes the palette from anywhere in it (useShortcuts.ts).
  };

  const rows = (items: Destination[], showCosts: boolean) => (
    <ul role="presentation" className="list-none">
      {items.map((d, i) => (
        <Row
          key={d.id}
          d={d}
          id={optionId(i)}
          active={i === cur}
          cost={costs.get(d.id)}
          showCost={!flying && (showCosts || i === cur)}
          flying={flying}
          onHover={() => i !== cur && setIndex(i)}
          go={() => go(d)}
          fly={() => fly(d)}
        />
      ))}
    </ul>
  );

  return (
    // A press on the dimmed backdrop closes the palette (one that starts inside it does not).
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[min(12vh,96px)]"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Where to?" className="panel-float appear flex max-h-[min(640px,calc(100dvh-48px))] w-[600px] max-w-full flex-col">
        <div className="flex items-center gap-2.5 border-b border-line-2 py-1.5 pl-4 pr-2">
          <Icon name="search" size={15} className="text-accent" />
          <input
            data-autofocus
            className="h-9 min-w-0 flex-1 bg-transparent font-serif text-[17px] text-fg outline-none placeholder:text-fg-3"
            placeholder="Where to? A planet, the Moon, Voyager 1…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={cur >= 0 ? optionId(cur) : undefined}
            aria-autocomplete="list"
            aria-label="Search for a destination"
            spellCheck={false}
            autoComplete="off"
          />
          <button className="btn btn-q btn-sq shrink-0" onClick={close} aria-label="Close" title="Close (Esc)">
            <CloseIcon />
          </button>
        </div>
        {flying && <p className="border-b border-line bg-accent/[0.06] px-4 py-2 text-[12px] text-accent">In flight: Go and Fly wait until you arrive, or abort the trip.</p>}
        <div id={listId} role="listbox" aria-label={browsing ? 'Featured destinations' : 'Results'} className="scroll min-h-0 flex-1 pb-1">
          {browsing ? (
            featured.length ? (
              <Section title="Featured">{rows(featured, true)}</Section>
            ) : (
              <p className="px-4 py-5 text-[12.5px] text-fg-2">Type the name of a planet, a moon or a spacecraft.</p>
            )
          ) : results.length ? (
            rows(results, false)
          ) : (
            <p className="px-4 py-5 text-[12.5px] text-fg-2 [overflow-wrap:anywhere]">
              Nothing called “{query.trim()}” yet. More moons, stars and galaxies arrive in later updates.
            </p>
          )}
        </div>
        {browsing && (
          <div className="border-t border-line px-4 py-2">
            <div className="flex flex-wrap items-center gap-1">
              <span className="cap mr-1">Journeys</span>
              {JOURNEYS.map((j) => (
                <button
                  key={j.id}
                  className="btn btn-sm"
                  disabled={flying}
                  title={j.sub}
                  onClick={() => {
                    close();
                    j.run();
                  }}
                >
                  {j.title}
                </button>
              ))}
              <button
                className="btn btn-q btn-sm"
                onClick={() => {
                  close();
                  openJourneys();
                }}
              >
                All journeys <Icon name="arrow-right" size={11} />
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-2 px-4 py-2 text-[11px] text-fg-3">
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> choose
          </span>
          <span>
            <Kbd>Enter</Kbd> go
          </span>
          <span>
            <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> fly
          </span>
          <span className="max-sm:hidden">
            <Kbd>Esc</Kbd> close
          </span>
          <span className="w-full leading-snug sm:ml-auto sm:w-auto">Fly plans a 1 g rocket from where you are.</span>
        </div>
      </div>
    </div>
  );
}

export function Search() {
  const open = useUI((s) => s.searchOpen);
  return open ? <Palette /> : null;
}
