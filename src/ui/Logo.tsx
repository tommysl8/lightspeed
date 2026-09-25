/**
 * The Lightspeed mark: one circle on the sky drawn twice, at rest and as seen from a ship
 * moving at 0.6c towards the amber apex. In stereographic projection, aberration shrinks
 * everything towards the apex by the Doppler factor √((1 + β)/(1 − β)), exactly 2 at 0.6c,
 * so the circle halves and still passes through the apex. Same geometry as public/favicon.svg.
 */
import { APP } from '../content/author';

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
export function Wordmark({
  size = 16,
  className = '',
  subtitle,
  large,
  nameBelowSm = true,
}: {
  size?: number;
  className?: string;
  subtitle?: boolean;
  /** The header's size: on desktop screens, a larger name beside a larger mark. */
  large?: boolean;
  /** Show the name on phone-width screens too (the header keeps only the mark there). */
  nameBelowSm?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap ${large ? 'lg:gap-2.5' : ''} ${className}`}>
      <LogoMark size={size} className={`text-fg ${large ? 'lg:h-[22px] lg:w-[22px]' : ''}`} />
      <span className={`mono font-semibold tracking-[0.2em] text-fg ${large ? 'text-[12px] lg:text-[14.5px]' : 'text-[12px]'} ${nameBelowSm ? '' : 'max-sm:hidden'}`}>LIGHTSPEED</span>
      {subtitle && <span className="hidden text-[12px] text-fg-3 min-[1760px]:inline">{APP.taglineShort}</span>}
    </span>
  );
}
