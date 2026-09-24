import { formatDuration } from '../lib/format';
import { earthLight } from '../sim/lightDelay';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { useTicker } from './useTicker';

/**
 * Light delay to and from Earth, shown once you are more than about a light-second away,
 * plus the switch for drawing bodies where they appear (light-delayed) instead of where
 * they are.
 */
export function LightDelayPanel() {
  useTicker(4);
  const retarded = useUI((s) => s.retarded);
  const far = sim.bodies.earth.distTrue > 3e5;
  if (!far && !retarded) return null;
  return (
    <div className="glass fade-in pointer-events-auto absolute left-4 top-[84px] z-10 w-[300px] px-4 py-3">
      {far && (
        <>
          <p className="text-[13px] leading-snug text-white/85">
            You are seeing Earth as it was <b className="font-semibold tabular-nums text-white">{formatDuration(earthLight.seenAgo)}</b>{' '}
            ago.
          </p>
          <p className="mt-1 text-[13px] leading-snug text-white/85">
            A message to Earth would take <b className="font-semibold tabular-nums text-white">{formatDuration(earthLight.messageTime)}</b>.
          </p>
          <p className="mt-1 text-[11px] text-white/40">Measured in the Sun’s rest frame.</p>
        </>
      )}
      <div className={`${far ? 'mt-3 border-t border-white/[0.07] pt-3' : ''} flex items-center justify-between gap-3`}>
        <label htmlFor="retarded-switch" className="text-[12px] leading-tight text-white/70">
          Light-delayed positions
          <span className="block text-[11px] text-white/40">Draw each body where its light left it</span>
        </label>
        <button
          id="retarded-switch"
          role="switch"
          aria-checked={retarded}
          className="switch"
          onClick={() => useUI.getState().toggle('retarded')}
        />
      </div>
    </div>
  );
}
