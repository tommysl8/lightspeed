/**
 * First-visit welcome: what Lightspeed is, and three ways to start: the tour, "Where to?" and
 * the journeys. Shown once; the guide can bring it back. The lab is a quiet link at the foot,
 * for students who want it.
 */
import type { ReactNode } from 'react';
import { APP, AUTHOR } from '../../content/author';
import { openDoc, openLearn } from '../../state/route';
import { useUI } from '../../state/ui';
import { markWelcomed, openJourneys, openLab, openSearch, startTour } from '../onboarding';
import { CloseIcon, Kbd } from '../kit';
import { Icon } from '../icons';
import { Wordmark } from '../Logo';
import { useModal } from '../useModal';

function Choice({
  n,
  icon,
  title,
  children,
  onClick,
  primary,
}: {
  n: string;
  icon: 'tour' | 'compass' | 'search';
  title: string;
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      className={`group flex flex-col items-start gap-1.5 border px-3.5 pb-3 pt-2.5 text-left transition-colors ${
        primary ? 'border-accent/60 bg-accent/[0.06] hover:border-accent' : 'border-line-2 bg-raise hover:border-line-3 hover:bg-hover'
      }`}
      onClick={onClick}
      data-autofocus={primary || undefined}
    >
      <span className="flex w-full items-center gap-2">
        <span className="mono text-[10px] text-accent">{n}</span>
        <Icon name={icon} size={13} className={primary ? 'text-accent' : 'text-fg-2'} />
      </span>
      <span className="text-[13.5px] font-semibold text-fg">{title}</span>
      <span className="text-[12px] leading-snug text-fg-2">{children}</span>
    </button>
  );
}

function WelcomeCard() {
  const close = (then?: () => void) => {
    markWelcomed();
    useUI.setState({ welcomeOpen: false });
    then?.();
  };
  const ref = useModal<HTMLDivElement>(() => close());
  return (
    <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto bg-black/50 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-desc"
        className="panel-float appear w-[680px] max-w-full"
      >
        <div className="flex items-center gap-2 border-b border-line-2 py-2.5 pl-5 pr-2.5">
          <Wordmark size={18} />
          <span className="mono ml-2 text-[10px] text-fg-3">v{APP.version}</span>
          <button className="btn btn-q btn-sq ml-auto" onClick={() => close()} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="px-5 pb-5 pt-5 sm:px-7">
          <div className="cap">Welcome</div>
          <h1 id="welcome-title" className="mt-1.5 font-serif text-[27px] font-medium leading-[1.15] text-fg">
            The real Solar System, close to the speed of light
          </h1>
          <p id="welcome-desc" className="mt-3 max-w-[58ch] font-serif text-[15px] leading-relaxed text-fg-2">
            Every planet is where it really is at this moment, at true scale, with light travelling at its real speed. Fly between
            the planets at nearly the speed of light, watch the sky warp around you, and see what happens to your clock.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <Choice n="01" icon="tour" title="Take the tour" primary onClick={() => close(startTour)}>
              One minute: what everything on the screen is, and where to click.
            </Choice>
            <Choice n="02" icon="search" title="Where to?" onClick={() => close(openSearch)}>
              Name a planet, the Moon, Voyager 1 or the nearest star, and go there.
            </Choice>
            <Choice n="03" icon="compass" title="Take a journey" onClick={() => close(openJourneys)}>
              Seven one-click trips, from a pulse of sunlight to Proxima Centauri at 1 g.
            </Choice>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-2 px-5 py-2.5 text-[11.5px] text-fg-3 sm:px-7">
          <button className="inline-flex items-center gap-1.5 text-fg-2 hover:text-fg" onClick={() => close(() => openLearn())}>
            <Icon name="book" /> Learn
          </button>
          <button className="inline-flex items-center gap-1.5 text-fg-2 hover:text-fg" onClick={() => close(() => openDoc('guide'))}>
            <Icon name="info" /> Guide
          </button>
          <button className="inline-flex items-center gap-1.5 text-fg-2 hover:text-fg" onClick={() => close(() => openDoc('about'))}>
            About
          </button>
          <button className="inline-flex items-center gap-1.5 text-fg-2 hover:text-fg" onClick={() => close(() => openLab())} title="Five guided experiments in special relativity, with a notebook and printable reports">
            <Icon name="flask" /> For students: the lab
          </button>
          <span className="max-sm:hidden">
            Keys: <Kbd>?</Kbd>
          </span>
          <span className="ml-auto">
            by <span className="text-fg-2">{AUTHOR.name}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function Welcome() {
  const open = useUI((s) => s.welcomeOpen);
  return open ? <WelcomeCard /> : null;
}
