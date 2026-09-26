/**
 * The flight planner's destination: a searchable list of every registered body. Type part of a
 * name (or a nickname, or with a slip of the keyboard, as in "Where to?"); the arrow keys
 * choose and Enter takes it. Without a query it lists every body, grouped by kind with moons
 * under their planet.
 */
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { destinationsVersion, nestedDestinations, searchDestinations, subscribeDestinations, type Destination } from '../../content/destinations';
import { bodyName, type BodyId } from '../../sim/bodies';

interface Row {
  d: Destination;
  depth: number;
  heading?: string;
}

export function DestinationPicker({ value, onChange, inputId }: { value: BodyId; onChange: (id: BodyId) => void; inputId: string }) {
  const [query, setQuery] = useState<string | null>(null); // null: not editing, the value's name shows
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const version = useSyncExternalStore(subscribeDestinations, destinationsVersion);

  const rows = useMemo<Row[]>(() => {
    const q = query?.trim() ?? '';
    if (q) return searchDestinations(q, undefined, 40).filter((m) => m.destination.body).map((m) => ({ d: m.destination, depth: 0 }));
    const out: Row[] = [];
    for (const g of nestedDestinations()) {
      let first = true;
      for (const it of g.items) {
        if (!it.destination.body) continue;
        out.push({ d: it.destination, depth: it.depth, heading: first ? g.title : undefined });
        first = false;
      }
    }
    return out;
    // `version`: bodies registered while the planner is open appear at once.
  }, [query, version]);

  const cur = rows.length ? Math.min(index, rows.length - 1) : -1;
  const optionId = (i: number) => `${listId}-o${i}`;

  useEffect(() => {
    if (!open) return;
    // Start on the current destination when browsing the whole list.
    if (query === null || !query.trim()) {
      const i = rows.findIndex((r) => r.d.body === value);
      if (i >= 0) setIndex(i);
    } else setIndex(0);
    // Only when the list opens or the query changes.
  }, [open, query]);

  useEffect(() => {
    if (open && cur >= 0) document.getElementById(optionId(cur))?.scrollIntoView({ block: 'nearest' });
  }, [cur, open]);

  // Escape closes the list, not the planner: the planner listens on its own element, which a
  // React handler would reach too late, so this listener sits on the field itself.
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || !openRef.current) return;
      e.preventDefault();
      setQuery(null);
      setOpen(false);
    };
    el.addEventListener('keydown', onEsc);
    return () => el.removeEventListener('keydown', onEsc);
  }, []);

  const choose = (d: Destination | undefined) => {
    if (d?.body) onChange(d.body);
    setQuery(null);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = rows.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (n) setIndex((cur + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      choose(rows[cur]?.d);
    }
  };

  return (
    <div className="relative">
      <input
        id={inputId}
        ref={input}
        data-autofocus
        className="fld w-[180px]"
        value={query ?? bodyName(value)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => e.target.select()}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setQuery(null);
          setOpen(false);
        }}
        onKeyDown={onKey}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && cur >= 0 ? optionId(cur) : undefined}
        aria-autocomplete="list"
        spellCheck={false}
        autoComplete="off"
        title="Type to search every body; ↑ ↓ to choose, Enter to take it"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Destinations"
          className="panel-float scroll absolute left-0 top-[calc(100%+4px)] z-50 max-h-[260px] w-[260px] max-w-[calc(100vw-32px)] py-1"
          // Keep focus in the field while an option is pressed (a click would blur it first).
          onMouseDown={(e) => e.preventDefault()}
        >
          {rows.length === 0 && <li className="px-2.5 py-1.5 text-[12px] text-fg-3">Nothing by that name</li>}
          {rows.map((r, i) => {
            const why = r.d.unavailable();
            return (
              <li key={r.d.id} role="presentation">
                {r.heading && <div className="cap px-2.5 pb-0.5 pt-1.5">{r.heading}</div>}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === cur}
                  aria-disabled={!!why || undefined}
                  className={`flex h-7 cursor-pointer items-center gap-2 pr-2.5 text-[12.5px] ${i === cur ? 'bg-hover' : ''} ${
                    r.d.body === value ? 'text-accent' : why ? 'text-fg-3' : 'text-fg'
                  }`}
                  style={{ paddingLeft: `${10 + 14 * r.depth}px` }}
                  title={why ?? undefined}
                  onMouseMove={() => i !== cur && setIndex(i)}
                  onClick={() => choose(r.d)}
                >
                  <span className="min-w-0 flex-1 truncate">{r.d.name}</span>
                  <span className="shrink-0 text-[10.5px] text-fg-3">{r.d.kind}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
