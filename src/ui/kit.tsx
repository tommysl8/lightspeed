/**
 * UI primitives for the instrument-panel look: collapsible sections, readout rows, segmented
 * controls, checkboxes, menus and floating dialogs. Styling lives in index.css.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from 'react';
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
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const cur = Math.max(0, options.findIndex((o) => o.value === value));
  // Radio-group keys: one tab stop, arrows move the selection.
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const n = options.length;
    const k = e.key;
    const j =
      k === 'ArrowRight' || k === 'ArrowDown' ? (i + 1) % n : k === 'ArrowLeft' || k === 'ArrowUp' ? (i - 1 + n) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    e.stopPropagation(); // not the camera's arrow keys
    onChange(options[j].value);
    refs.current[j]?.focus();
  };
  return (
    <div className={`segs ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="radio"
          aria-checked={value === o.value}
          tabIndex={i === cur ? 0 : -1}
          data-hazard={o.hazard ? 'true' : undefined}
          className="seg-b"
          title={o.title}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
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

/**
 * A button that opens a popover menu below it (or above it, in the footer); closes on an
 * outside click or Escape. `children` may be a function of `close`, for items that act and
 * should then get out of the way.
 */
export function Menu({
  label,
  children,
  align = 'right',
  placement = 'below',
  title,
  ariaLabel,
  width = 260,
  buttonClassName = 'btn btn-q',
  tour,
  className = '',
}: {
  label: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  placement?: 'below' | 'above';
  title?: string;
  /** Accessible name when the label is an icon or changes (the date chip). */
  ariaLabel?: string;
  width?: number;
  buttonClassName?: string;
  /** Anchor for the guided tour (data-tour). */
  tour?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const byKeyboard = useRef(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); // handled: the global shortcuts ignore it
      setOpen(false);
      if (ref.current?.contains(document.activeElement)) btn.current?.focus();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    // Opened from the keyboard: move focus to the first control inside.
    if (byKeyboard.current) pop.current?.querySelector<HTMLElement>('input, button, select')?.focus();
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  // Keep the popover inside the window: on a phone a menu anchored left of a button near the
  // middle (the Bodies list) would otherwise run off the right edge, where nothing scrolls.
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) return;
    const fit = () => {
      el.style.translate = '';
      const r = el.getBoundingClientRect();
      const margin = 8;
      let dx = 0;
      if (r.right > window.innerWidth - margin) dx = window.innerWidth - margin - r.right;
      if (r.left + dx < margin) dx = margin - r.left;
      el.style.translate = dx ? `${Math.round(dx)}px 0` : '';
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [open]);
  return (
    <div ref={ref} className={`relative ${className}`} data-tour={tour}>
      <button
        ref={btn}
        className={buttonClassName}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          byKeyboard.current = e.detail === 0;
          setOpen(!open);
        }}
        title={title}
      >
        {label}
        <Chevron />
      </button>
      {open && (
        <div
          ref={pop}
          id={id}
          className={`panel-float appear scroll absolute z-50 py-1 ${
            placement === 'above' ? 'bottom-[calc(100%+4px)] max-h-[calc(100dvh_-_var(--ftr)_-_16px)]' : 'top-[calc(100%+4px)] max-h-[calc(100dvh_-_var(--hdr)_-_16px)]'
          } ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{ width: `min(${width}px, calc(100vw - 16px))` }}
          role="dialog"
          aria-label={ariaLabel ?? title ?? (typeof label === 'string' ? label : undefined)}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
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
  innerRef,
  modal,
}: {
  title: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
  tone?: 'hazard';
  innerRef?: Ref<HTMLDivElement>;
  modal?: boolean;
}) {
  const titleId = useId();
  return (
    <div
      ref={innerRef}
      className={`panel-float appear flex flex-col ${tone === 'hazard' ? '!border-hazard/50' : ''} ${className}`}
      role="dialog"
      aria-modal={modal || undefined}
      aria-labelledby={titleId}
    >
      <div className={`titlebar ${tone === 'hazard' ? 'hatch' : ''}`}>
        <span id={titleId} className="cap !text-fg-2">
          {title}
        </span>
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
  const clamp = (w: number) => Math.round(Math.min(Math.min(max, window.innerWidth * 0.45), Math.max(min, w)));
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize; double-click to reset. With the keyboard: arrow keys, Home to reset."
      className={`group absolute inset-y-0 z-40 w-[7px] cursor-col-resize outline-none max-[899px]:hidden ${side === 'left' ? '-right-[4px]' : '-left-[4px]'}`}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        const d = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        if (e.key === 'Home') onChange(initial);
        else if (d) onChange(clamp(width + (side === 'left' ? d : -d)));
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s0 = start.current;
        if (!s0) return;
        const dx = e.clientX - s0.x;
        const w = s0.w + (side === 'left' ? dx : -dx);
        onChange(clamp(w));
      }}
      onPointerUp={() => (start.current = null)}
      onDoubleClick={() => onChange(initial)}
    >
      <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-accent/60 group-focus-visible:bg-accent" />
    </div>
  );
}

/** Label above a control, the way instrument front panels are lettered. */
export function Field({ label, children, className = '', htmlFor }: { label: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="cap mb-1 block">
          {label}
        </label>
      ) : (
        <div className="cap mb-1">{label}</div>
      )}
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
  // Escape blurs the field too; the blur must then not commit what was typed.
  const cancelled = useRef(false);
  const invalid = text !== null && !validate(parse(text));
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setText(null);
      return;
    }
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
          cancelled.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
