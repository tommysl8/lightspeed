import { useUI } from '../state/ui';

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Navigate',
    keys: [
      ['0', 'Sun'],
      ['1 – 8', 'Mercury … Neptune'],
      ['9', 'Pluto'],
      ['M', 'Moon'],
      ['V', 'Voyager 1'],
      ['H', 'Home (Earth)'],
      ['Double-click', 'Fly to a body'],
    ],
  },
  {
    title: 'Camera',
    keys: [
      ['Drag', 'Orbit'],
      ['Scroll', 'Zoom (orbit) / throttle (flight)'],
      ['← → ↑ ↓', 'Orbit with keys'],
      ['+ / −', 'Zoom with keys'],
      ['F', 'Toggle free flight'],
      ['W A S D', 'Fly'],
      ['Space / C', 'Up / down'],
      ['Q / E', 'Roll'],
    ],
  },
  {
    title: 'View',
    keys: [
      ['T', 'True scale ↔ Visible'],
      ['O', 'Orbits'],
      ['L', 'Labels'],
      ['B', 'Belts'],
      ['Esc', 'Close panels / exit flight'],
      ['?', 'This sheet'],
    ],
  },
];

export function HelpOverlay() {
  const open = useUI((s) => s.helpOpen);
  if (!open) return null;
  return (
    <div
      className="fade-in absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={() => useUI.setState({ helpOpen: false })}
    >
      <div className="glass w-[680px] max-w-full p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">Keyboard shortcuts</h2>
          <button className="chip" onClick={() => useUI.setState({ helpOpen: false })}>
            Close
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">{g.title}</h3>
              <dl className="space-y-1.5">
                {g.keys.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <dt>
                      <kbd className="kbd">{k}</kbd>
                    </dt>
                    <dd className="text-right text-white/70">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
