import type { ReactNode } from 'react';
import { useUI } from '../../state/ui';
import { Dialog, Kbd } from '../kit';
import { rich } from '../rich';

const GROUPS: { title: string; keys: [ReactNode, string][] }[] = [
  {
    title: 'Targets and camera',
    keys: [
      [<><Kbd>0</Kbd>–<Kbd>9</Kbd></>, 'Sun, Mercury … Neptune, Pluto: select and slew'],
      [<><Kbd>M</Kbd> <Kbd>V</Kbd></>, 'Moon, Voyager 1'],
      [<Kbd key="h">H</Kbd>, 'Return to Earth'],
      ['Double-click', 'Slew to a body'],
      ['Drag · arrows', 'Orbit the target (look around in transit)'],
      [<>Wheel · <Kbd>+</Kbd> <Kbd>−</Kbd></>, 'Range (logarithmic)'],
      [<Kbd key="f">F</Kbd>, 'Free flight on / off'],
      [<><Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd></>, 'Translate (free flight); wheel sets the throttle'],
      [<><Kbd>Space</Kbd>/<Kbd>R</Kbd> · <Kbd>C</Kbd>/<Kbd>Ctrl</Kbd></>, 'Up · down (free flight)'],
      [<><Kbd>Q</Kbd> <Kbd>E</Kbd></>, 'Roll (free flight)'],
    ],
  },
  {
    title: 'Time and trips',
    keys: [
      [<><Kbd>Space</Kbd> <Kbd>P</Kbd></>, 'Pause / resume'],
      [<><Kbd>[</Kbd> <Kbd>]</Kbd> or <Kbd>,</Kbd> <Kbd>.</Kbd></>, 'Simulation rate down / up (10⁰ … 10⁶)'],
      [<Kbd key="n">N</Kbd>, 'Return to the present at real time; zeroes the chronometers'],
      [<Kbd key="g">G</Kbd>, 'Trajectory planner'],
      [<Kbd key="z">Z</Kbd>, 'Optics: classical ↔ relativistic'],
      [<Kbd key="x">X</Kbd>, 'Optics: split screen'],
    ],
  },
  {
    title: 'Laboratory',
    keys: [
      [<Kbd key="r">R</Kbd>, 'Record a reading (Experiments 3 and 4; not in free flight)'],
      [<Kbd key="k">K</Kbd>, 'Lab manual'],
      [<Kbd key="i">I</Kbd>, 'Instrument panel'],
      [<Kbd key="e">E</Kbd>, 'Reference sections'],
    ],
  },
  {
    title: 'Display',
    keys: [
      [<Kbd key="t">T</Kbd>, 'True scale ↔ enlarged bodies'],
      [<><Kbd>O</Kbd> <Kbd>L</Kbd> <Kbd>B</Kbd></>, 'Orbits, labels, small bodies'],
      [<Kbd key="u">U</Kbd>, 'Viewport overlays (reticle, apex, scale, axes)'],
      [<Kbd key="j">J</Kbd>, 'Ecliptic coordinate grid'],
      [<Kbd key="esc">Esc</Kbd>, 'Close dialogs, leave free flight'],
      [<Kbd key="q">?</Kbd>, 'This sheet'],
    ],
  },
];

export function HelpOverlay() {
  const open = useUI((s) => s.helpOpen);
  if (!open) return null;
  const close = () => useUI.setState({ helpOpen: false });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="w-[860px] max-w-full">
        <Dialog title="Operating reference" onClose={close} className="max-h-[calc(100vh-2rem)]">
          <div className="scroll grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h3 className="man-h !mt-0">{g.title}</h3>
                <table className="w-full text-[12px]">
                  <tbody>
                    {g.keys.map(([k, v], i) => (
                      <tr key={i} className="border-b border-line last:border-b-0">
                        <td className="whitespace-nowrap py-1 pr-3 align-top text-fg-2">{k}</td>
                        <td className="py-1 text-fg-2">{rich(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
            <section className="sm:col-span-2">
              <h3 className="man-h !mt-0">Viewport</h3>
              <p className="text-[12px] leading-relaxed text-fg-2">
                The reticle marks the centre of view; in motion its spectrometer reads the angle from the apex θ′ and the Doppler
                factor D. APEX and ANTAPEX mark the directions of motion. The scale bar holds at the distance of the body named
                beside it. The triad shows the ecliptic J2000 axes: X toward the March equinox, Z toward the ecliptic north pole.
                Lamps along the top show states that change what you see: pause, simulation rate, relativistic optics, light-time
                correction, pulses in flight.
              </p>
            </section>
          </div>
        </Dialog>
      </div>
    </div>
  );
}
