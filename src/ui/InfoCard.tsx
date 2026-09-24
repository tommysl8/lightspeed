import type { ReactNode } from 'react';
import { BODIES, C_KM_S, EARTH_RADIUS_KM, type BodyData, type BodyId } from '../physics/constants';
import { lightTime } from '../physics/lightTime';
import {
  formatDistanceLong,
  formatDuration,
  formatHours,
  formatNumber,
  formatPeriodDays,
  formatSpeed,
} from '../lib/format';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { controller } from '../controls/cameraController';
import { useTicker } from './useTicker';

const KIND_LABEL: Record<BodyData['kind'], string> = {
  star: 'Star',
  planet: 'Planet',
  'dwarf-planet': 'Dwarf planet',
  moon: 'Moon',
  spacecraft: 'Spacecraft',
};

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-white/[0.06] py-2 first:border-t-0">
      <dt className="shrink-0 text-[12px] text-white/50" title={hint}>
        {label}
      </dt>
      <dd className="text-right text-[13px] tabular-nums text-white/90">{children}</dd>
    </div>
  );
}

export function InfoCard() {
  const selected = useUI((s) => s.selected);
  const focus = useUI((s) => s.focus);
  const mode = useUI((s) => s.controlMode);
  useTicker(4);
  if (!selected) return null;
  const id: BodyId = selected;
  const data = BODIES[id];
  const b = sim.bodies[id];
  const isOrbiting = mode === 'orbit' && focus === id;

  const radius =
    id === 'voyager1' ? (
      '3.7 m antenna'
    ) : (
      <>
        {formatNumber(data.radiusKm)} km
        {id !== 'sun' && <span className="text-white/45"> · {(data.radiusKm / EARTH_RADIUS_KM).toFixed(2)} R⊕</span>}
        {id === 'sun' && <span className="text-white/45"> · 109 R⊕</span>}
      </>
    );

  return (
    <aside className="glass fade-in pointer-events-auto absolute right-4 top-20 z-20 w-[344px] max-w-[calc(100vw-2rem)] overflow-hidden">
      <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-5">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
              {id === 'moon' ? 'Moon of Earth' : KIND_LABEL[data.kind]}
            </div>
            <h2 className="mt-0.5 text-[22px] font-semibold tracking-tight text-white">{data.name}</h2>
          </div>
          <button
            className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
            onClick={() => useUI.getState().select(null)}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <dl>
          <Row label="Radius">{radius}</Row>
          {id !== 'sun' && (
            <>
              <Row label="Distance from the Sun">{formatDistanceLong(b.distSun)}</Row>
              <Row label="Sunlight takes" hint="Light-travel time from the Sun to this body, right now">
                {formatDuration(lightTime(b.distSun))}
              </Row>
            </>
          )}
          {id === 'moon' && <Row label="Distance from Earth">{formatDistanceLong(b.pos.distanceTo(sim.bodies.earth.pos))}</Row>}
          <Row label="Distance from you">{formatDistanceLong(b.distCamera)}</Row>
          <Row label="Light from here takes" hint="Light-travel time between this body and your current position">
            {formatDuration(lightTime(b.distCamera))}
          </Row>
          {data.siderealRotationH !== undefined && (
            <Row label="Rotation (sidereal)">{formatHours(data.siderealRotationH)}</Row>
          )}
          {data.solarDayH !== undefined && <Row label="Solar day">{formatHours(data.solarDayH)}</Row>}
          {data.orbitalPeriodD !== undefined && (
            <Row label={id === 'moon' ? 'Orbit around Earth' : 'Year (orbit around the Sun)'}>
              {formatPeriodDays(data.orbitalPeriodD)}
            </Row>
          )}
          {id === 'voyager1' && (
            <>
              <Row label="Speed (relative to the Sun)">
                {formatSpeed(b.vel.length())} · {((b.vel.length() / C_KM_S) * 1e5).toFixed(1)} × 10⁻⁵ c
              </Row>
              <Row label="Launched">5 September 1977</Row>
            </>
          )}
        </dl>

        <ul className="mt-4 space-y-2.5">
          {data.facts.map((f) => (
            <li key={f} className="relative pl-4 text-[13px] leading-relaxed text-white/75">
              <span className="absolute left-0 top-[0.62em] h-1 w-1 rounded-full bg-sky-300/70" />
              {f}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex gap-2">
          <button
            className="btn-primary flex-1"
            disabled={isOrbiting}
            onClick={() => controller.goTo(id)}
          >
            {isOrbiting ? 'You are here' : `Go to ${data.name}`}
          </button>
        </div>
      </div>
    </aside>
  );
}
