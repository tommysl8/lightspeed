/**
 * On the card of a black hole with a thin accretion disc (Cygnus X-1): what the disc is, in one plain line, and how
 * its brightness is drawn: all of its light (bolometric, mostly X-rays: the published pictures' and Luminet's), or its
 * visible light alone, each in the colour the eye would see (docs/data/blackholes.md §12).
 *
 * How: a field of the store (state/ui.ts diskLight), read each frame by scene/AccretionDisk.tsx; not saved between
 * visits. While View › Accretion discs is off the controls say so and offer to turn it on.
 *
 * Cost: none beyond the card's own re-render.
 *
 * Twins: ui/viewport/FlowControls.tsx (Sgr A*'s flow); render/disk/diskMap.ts.
 */
import { useUI } from '../../state/ui';
import type { BlackHoleDisk } from '../../sim/bodies/types';
import type { DiskLight } from '../../sim/blackholes/accretion';
import { Seg } from '../kit';

/** The disc's one-line label: a model, how fast it really turns and how it is drawn turning. */
export function diskModelLine(disk: BlackHoleDisk): string {
  const ms = disk.innerPeriodS * 1000;
  return `A model: a thin disc at ${Math.round(disk.eddingtonFraction * 100)} % of the Eddington limit, drawn without the hole’s spin and turning ${disk.slowdown.toLocaleString('en-GB')} times slower than real (its inner edge goes round in ${ms.toFixed(1)} ms); its swirls are illustrative.`;
}

export function DiskControls({ disk }: { disk: BlackHoleDisk }) {
  const light = useUI((s) => s.diskLight);
  const on = useUI((s) => s.accretionDisks);
  return (
    <div className="mb-2" role="group" aria-label="The accretion disc’s model">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] text-fg-3">Draw the disc in</span>
        <Seg<DiskLight>
          label="Light the accretion disc is drawn in"
          value={light}
          onChange={(v) => useUI.setState({ diskLight: v })}
          options={[
            { value: 'all', label: 'All its light', title: 'Brightness of all its light, mostly X-rays (as the published pictures show it), in the colour the eye would see; its contrast raised so the screen shows how fast it fades' },
            { value: 'visible', label: 'Visible light', title: 'Its visible light alone: nearly even, as the eye would see it' },
          ]}
        />
      </div>
      <p className="mt-1 text-[10.5px] leading-snug text-fg-3">{diskModelLine(disk)}</p>
      {!on && (
        <p className="text-[10.5px] leading-snug text-fg-3">
          View › Accretion discs is off, so no disc is drawn.{' '}
          <button className="underline decoration-line-2 underline-offset-2 hover:text-fg" onClick={() => useUI.setState({ accretionDisks: true })}>
            Turn it on
          </button>
        </p>
      )}
    </div>
  );
}
