/**
 * The card for the selected body: what it is, a few facts, its distance and light-time, and
 * the things to do with it. The instruments hold the full data sheet.
 */
import { BODIES, C_KM_S } from '../../physics/constants';
import { fixed, qty, sig } from '../../lib/sci';
import { sim } from '../../sim/sim';
import { useUI } from '../../state/ui';
import { targetReading } from '../../lab/measure';
import { goToBody } from '../navigation';
import { openPlanner } from '../tripActions';
import { CloseIcon } from '../kit';
import { Icon } from '../icons';
import { useTicker } from '../useTicker';
import { rich } from '../rich';

const KIND: Record<string, string> = {
  star: 'Star',
  planet: 'Planet',
  'dwarf-planet': 'Dwarf planet',
  moon: 'Earth’s moon',
  spacecraft: 'Spacecraft',
};

export function BodyCard() {
  const id = useUI((s) => s.selected);
  const show = useUI((s) => s.bodyCard);
  const tripActive = useUI((s) => s.tripActive);
  const focus = useUI((s) => s.focus);
  const mode = useUI((s) => s.controlMode);
  useTicker(3, !!id && show);
  if (!id || !show) return null;
  const d = BODIES[id];
  const b = sim.bodies[id];
  const r = qty(b.distTrue, 'length', 4);
  const lt = qty(b.distTrue / C_KM_S, 'time', 3);
  const geo = targetReading(id);
  const moving = !!geo && geo.beta >= 1e-3;
  const here = mode === 'orbit' && focus === id;
  return (
    <div className="panel-float appear w-[300px] max-w-full" role="region" aria-label={`${d.name}`}>
      <div className="flex items-start gap-2 px-3.5 pb-1 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[18px] font-medium leading-tight text-fg">{d.name}</div>
          <div className="mt-0.5 text-[11px] text-fg-3">{KIND[d.kind]}</div>
        </div>
        <button className="btn btn-q btn-sq -mr-1.5 -mt-1 !h-6 !w-6" onClick={() => useUI.setState({ bodyCard: false })} aria-label="Close card">
          <CloseIcon />
        </button>
      </div>
      <div className="mono px-3.5 pb-2 text-[11px] leading-[16px] text-fg-2">
        <span className="text-fg-3">from you </span>
        {rich(r.v)} {r.u}
        <span className="text-fg-3"> · light takes </span>
        {lt.v} {lt.u}
        {moving && (
          <div>
            <span className="text-fg-3">seen </span>
            {fixed(geo.thetaShipDeg, 1)}°<span className="text-fg-3"> from apex · Doppler </span>
            <span className="text-data">{sig(geo.D, 4)}</span>
          </div>
        )}
      </div>
      <div className="border-t border-line px-3.5 pb-2.5 pt-2">
        {d.facts.map((f) => (
          <p key={f} className="mb-1.5 font-serif text-[12.5px] leading-snug text-fg-2 last:mb-0">
            {f}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-line px-3.5 py-2">
        <button className="btn btn-sm" disabled={tripActive || here} onClick={() => goToBody(id)} title="Move the camera there (not a journey)">
          <Icon name="orbit" size={11} />
          {here ? 'You are here' : 'Go there'}
        </button>
        <button className="btn btn-sm" disabled={tripActive} onClick={() => openPlanner(id)} title="Plan a flight there at a chosen speed (G)">
          <Icon name="flight" size={11} />
          Fly here
        </button>
        <button className="btn btn-q btn-sm ml-auto" onClick={() => useUI.setState({ rightOpen: true })} title="The full data sheet, in the instruments (I)">
          Numbers
          <Icon name="arrow-right" size={11} />
        </button>
      </div>
    </div>
  );
}
