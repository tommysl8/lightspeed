import { useState } from 'react';
import { useUI } from '../../state/ui';
import { Dialog, Kbd } from '../kit';

const KEY = 'lightspeed.oriented';

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** First-visit orientation: what the panels are and where to begin. */
export function Orientation() {
  const [open, setOpen] = useState(() => !seen());
  const busy = useUI((s) => s.tripActive || s.plannerOpen || s.helpOpen || s.aboutOpen);
  if (!open || busy) return null;
  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* storage unavailable */
    }
  };
  const begin = () => {
    // Open the manual, and the instruments too when there is room for both.
    useUI.setState((s) => ({
      leftOpen: true,
      rightOpen: s.rightOpen || window.innerWidth >= 1180,
      manualTab: 'experiments',
      experiment: 'E1',
    }));
    dismiss();
  };
  return (
    <div className="absolute bottom-10 left-1/2 z-30 w-[520px] max-w-[calc(100%-24px)] -translate-x-1/2">
      <Dialog title="Laboratory orientation" onClose={dismiss}>
        <div className="p-3.5">
          <p className="font-serif text-[14px] leading-relaxed text-fg">
            The Solar System is simulated at true scale for the present date, with light travelling at <i>c</i>. Planets are
            specks at true scale; the distances are the point.
          </p>
          <table className="mt-3 w-full text-[12px]">
            <tbody className="[&_td]:py-1 [&_td]:align-top [&_tr]:border-b [&_tr]:border-line">
              <tr>
                <td className="w-[112px] whitespace-nowrap pr-2 text-fg">
                  Lab manual <Kbd>K</Kbd>
                </td>
                <td className="text-fg-2">Five experiments with procedures, data tables, fits and questions. Left.</td>
              </tr>
              <tr>
                <td className="pr-2 text-fg">
                  Instruments <Kbd>I</Kbd>
                </td>
                <td className="text-fg-2">Observer kinematics, chronometers, target data, optics, light-time. Right.</td>
              </tr>
              <tr>
                <td className="pr-2 text-fg">Time &amp; targets</td>
                <td className="text-fg-2">
                  Simulation rate 10<sup className="sup">0</sup>–10<sup className="sup">6</sup> (<Kbd>[</Kbd> <Kbd>]</Kbd>) and body selection (<Kbd>0</Kbd>–<Kbd>9</Kbd>). Bottom.
                </td>
              </tr>
              <tr className="!border-b-0">
                <td className="pr-2 text-fg">
                  Controls <Kbd>?</Kbd>
                </td>
                <td className="text-fg-2">Full operating reference.</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-2">
            <span className="flex-1 text-[11.5px] text-fg-3">Experiment 1 measures the speed of light with a timed light pulse.</span>
            <button className="btn" onClick={dismiss}>
              Dismiss
            </button>
            <button className="btn btn-pri" onClick={begin}>
              Begin Experiment 1
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
