/**
 * UI primitives for the instrument-panel look: collapsible sections, readout rows, segmented
 * controls, checkboxes, menus and floating dialogs. Styling lives in index.css.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { rich } from './rich';

// ─── Persistence ─────────────────────────────────────────────────────────────────────────

function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

/** useState mirrored to localStorage (best effort: storage may be unavailable). */
export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => readLocal(key, initial));
  const set = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };
  return [v, set];
}

// ─── Typography ──────────────────────────────────────────────────────────────────────────

/** Italic math symbol (β, γ, τ, θ′). */
export const Sym = ({ children }: { children: ReactNode }) => <span className="sym">{children}</span>;

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

export function Chevron({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M1 2.5l3 3 3-3" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
    </svg>
  );
}

// ─── Sections and readouts ───────────────────────────────────────────────────────────────

export function Sec({
  id,
  idx,
  title,
  right,
  defaultOpen = true,
  children,
}: {
  id: string;
  idx?: string;
  title: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useLocalState(`lightspeed.sec.${id}`, defaultOpen);
  return (
    <section className="sec" data-open={open}>
      <div className="relative">
        <button className="sec-h" onClick={() => setOpen(!open)} aria-expanded={open}>
          {idx && <span className="idx">{idx}</span>}
          <span className="truncate">{title}</span>
          <Chevron className="chev" />
        </button>
        {right && open && <div className="absolute right-7 top-0 flex h-[26px] items-center gap-1">{right}</div>}
      </div>
      {open && <div className="py-1">{children}</div>}
    </section>
  );
}

export type Tone = 'data' | 'accent' | 'dim' | 'hazard';

/** One readout line: label, value (monospace), unit. */
export function Ro({ l, v, u, tone, title }: { l: ReactNode; v: ReactNode; u?: ReactNode; tone?: Tone; title?: string }) {
  return (
    <div className="ro" data-tone={tone} title={title}>
      <span className="ro-l">{l}</span>
      <span className="ro-v">{rich(v)}</span>
      <span className="ro-u">{rich(u)}</span>
    </div>
  );
}

// ─── Controls ────────────────────────────────────────────────────────────────────────────

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  hazard?: boolean;
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`segs ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          data-hazard={o.hazard ? 'true' : undefined}
          className="seg-b"
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Check({
  checked,
  onChange,
  children,
  hint,
  disabled,
  kbd,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  kbd?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="chk-row">
      <input id={id} type="checkbox" className="chk" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span>{children}</span>
          {kbd && <Kbd>{kbd}</Kbd>}
        </span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-fg-3">{hint}</span>}
      </span>
    </label>
  );
}

/** A button that opens a popover menu below it; closes on outside click or Escape. */
export function Menu({
  label,
  children,
  align = 'right',
  title,
  width = 260,
}: {
  label: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  title?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button className="btn btn-q" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} title={title}>
        {label}
        <Chevron />
      </button>
      {open && (
        <div
          className={`panel-float appear absolute top-[calc(100%+4px)] z-50 py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{ width: `min(${width}px, calc(100vw - 16px))` }}
          role="menu"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className="cap px-2.5 pb-1 pt-2">{children}</div>;
}

/** Floating window with a title bar. */
export function Dialog({
  title,
  onClose,
  children,
  className = '',
  right,
  tone,
}: {
  title: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
  tone?: 'hazard';
}) {
  return (
    <div className={`panel-float appear flex flex-col ${tone === 'hazard' ? '!border-hazard/50' : ''} ${className}`} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
      <div className={`titlebar ${tone === 'hazard' ? 'hatch' : ''}`}>
        <span className="cap !text-fg-2">{title}</span>
        <span className="ml-auto flex items-center gap-1">
          {right}
          {onClose && (
            <button className="btn btn-q btn-sq" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          )}
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * Drag handle on a dock's inner edge. Double-click restores the default width.
 */
export function DockResizer({
  side,
  width,
  onChange,
  min = 280,
  max = 640,
  initial,
}: {
  side: 'left' | 'right';
  width: number;
  onChange: (w: number) => void;
  min?: number;
  max?: number;
  initial: number;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      title="Drag to resize; double-click to reset"
      className={`group absolute inset-y-0 z-40 w-[7px] cursor-col-resize max-[899px]:hidden ${side === 'left' ? '-right-[4px]' : '-left-[4px]'}`}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s0 = start.current;
        if (!s0) return;
        const dx = e.clientX - s0.x;
        const w = s0.w + (side === 'left' ? dx : -dx);
        onChange(Math.round(Math.min(Math.min(max, window.innerWidth * 0.45), Math.max(min, w))));
      }}
      onPointerUp={() => (start.current = null)}
      onDoubleClick={() => onChange(initial)}
    >
      <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-accent/60" />
    </div>
  );
}

/** Label above a control, the way instrument front panels are lettered. */
export function Field({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="cap mb-1">{label}</div>
      {children}
    </div>
  );
}

/**
 * A numeric text field that commits on Enter or blur and reverts invalid input. Shows the
 * external value while not being edited.
 */
export function NumberInput({
  value,
  onCommit,
  format,
  parse = (s) => Number(s.replace(/−/g, '-').replace(/\s/g, '')),
  validate = (v) => Number.isFinite(v),
  className = '',
  ariaLabel,
}: {
  value: number;
  onCommit: (v: number) => void;
  format: (v: number) => string;
  parse?: (s: string) => number;
  validate?: (v: number) => boolean;
  className?: string;
  ariaLabel: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const invalid = text !== null && !validate(parse(text));
  const commit = () => {
    if (text === null) return;
    const v = parse(text);
    if (validate(v)) onCommit(v);
    setText(null);
  };
  return (
    <input
      className={`fld ${className}`}
      value={text ?? format(value)}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      spellCheck={false}
      onFocus={(e) => {
        setText(format(value).replace(/\s/g, ''));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
