/**
 * First-visit welcome: what Lightspeed is, and ways to start: the tour first, then "Where to?",
 * the journeys and Roam. Shown once; the guide can bring it back.
 */
import type { ReactNode } from 'react';
import { AUTHOR } from '../../content/author';
import { JOURNEYS } from '../../content/journeys';
import { countWordStart } from '../../lib/words';
import { openDoc, openLearn } from '../../state/route';
import { useUI } from '../../state/ui';
import { markWelcomed, openJourneys, openSearch, startTour } from '../onboarding';
import { startRoam } from '../navigation';
import { CloseIcon, Kbd } from '../kit';
import { Wordmark } from '../Logo';
import { useModal } from '../useModal';

function Way({ title, keyName, children, onClick }: { title: string; keyName?: string; children: ReactNode; onClick: () => void }) {
  return (
    <button className="-mx-2 flex w-[calc(100%+16px)] items-baseline gap-3 rounded-[2px] px-2 py-2 text-left hover:bg-hover" onClick={onClick}>
      <span className="w-[96px] shrink-0 text-[13.5px] font-medium text-fg">{title}</span>
      <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">{children}</span>
      {keyName && (
        <span className="max-sm:hidden">
          <Kbd>{keyName}</Kbd>
        </span>
      )}
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
        className="panel-float appear w-[600px] max-w-full"
      >
        <div className="flex items-center py-2.5 pl-5 pr-2.5 sm:pl-7">
          <Wordmark size={18} />
          <button className="btn btn-q btn-sq ml-auto" onClick={() => close()} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="px-5 pb-6 pt-3 sm:px-7">
          <h1 id="welcome-title" className="text-balance font-serif text-[26px] font-medium leading-[1.15] text-fg">
            The real universe, at nearly the speed of light
          </h1>
          <p id="welcome-desc" className="mt-3 max-w-[52ch] font-serif text-[15px] leading-relaxed text-fg-2">
            Every planet, star and galaxy here is where it really is, at true scale. Fly among them close to the speed of light
            and watch the sky, and your clock, change.
          </p>
          <button className="btn btn-pri mt-6 h-9 px-4 text-[13px]" onClick={() => close(startTour)} data-autofocus>
            Take the one-minute tour
          </button>
          <div className="mt-4">
            <Way title="Where to?" keyName="/" onClick={() => close(openSearch)}>
              Find any planet, star or galaxy by name and go there.
            </Way>
            <Way title="Journeys" onClick={() => close(openJourneys)}>
              {countWordStart(JOURNEYS.length)} one-click trips, from a pulse of sunlight to a fall into a black hole.
            </Way>
            <Way title="Roam" keyName="F" onClick={() => close(startRoam)}>
              Fly anywhere you like, no destination needed.
            </Way>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-2 px-5 py-2.5 text-[12px] text-fg-3 sm:px-7">
          <button className="text-fg-2 hover:text-fg" onClick={() => close(() => openLearn())}>
            Learn
          </button>
          <button className="text-fg-2 hover:text-fg" onClick={() => close(() => openDoc('guide'))}>
            Guide
          </button>
          <button className="text-fg-2 hover:text-fg" onClick={() => close(() => openDoc('about'))}>
            About
          </button>
          <span className="ml-auto">by {AUTHOR.name}</span>
        </div>
      </div>
    </div>
  );
}

export function Welcome() {
  const open = useUI((s) => s.welcomeOpen);
  return open ? <WelcomeCard /> : null;
}
