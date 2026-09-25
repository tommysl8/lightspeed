/**
 * The Lightspeed mark: one circle on the sky drawn twice, at rest and as seen from a ship
 * moving at 0.6c towards the amber apex. In stereographic projection, aberration shrinks
 * everything towards the apex by the Doppler factor √((1 + β)/(1 − β)), exactly 2 at 0.6c,
 * so the circle halves and still passes through the apex. Same geometry as public/favicon.svg.
 */
export function LogoMark({ size = 16, className = '', title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={`shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="4 4 56 56"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g fill="none" stroke="currentColor" strokeWidth="8">
        <circle cx="32" cy="32" r="24" />
        <circle cx="44" cy="32" r="12" />
      </g>
      <circle cx="52" cy="32" r="8" fill="var(--color-accent)" />
    </svg>
  );
}

/** Mark and name, as set in the header and title bars. */
export function Wordmark({ size = 16, className = '', subtitle }: { size?: number; className?: string; subtitle?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap ${className}`}>
      <LogoMark size={size} className="text-fg" />
      <span className="mono text-[12px] font-semibold tracking-[0.2em] text-fg">LIGHTSPEED</span>
      {subtitle && <span className="hidden text-[11px] text-fg-3 min-[1760px]:inline">Virtual laboratory for special relativity</span>}
    </span>
  );
}
