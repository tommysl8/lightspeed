import { controller } from '../controls/cameraController';
import { formatBeta, formatSpeed } from '../lib/format';
import { C_KM_S } from '../physics/constants';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { useTicker } from './useTicker';

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** Bottom-left hint strip: how to steer in the current mode, plus free-flight speed. */
export function FlightHud() {
  const mode = useUI((s) => s.controlMode);
  useTicker(6);

  if (mode === 'free') {
    const beta = controller.throttleBeta;
    const speed = sim.ship.vel.length();
    return (
      <div className="glass fade-in pointer-events-none absolute bottom-20 left-4 z-10 px-4 py-3 text-[12px] text-white/70">
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-sky-300/80">Free flight</div>
        <div className="tabular-nums text-white/90">
          Throttle {formatBeta(beta)} <span className="text-white/45">· {formatSpeed(beta * C_KM_S)}</span>
        </div>
        <div className="tabular-nums text-white/50">
          Speed vs. Sun {formatSpeed(speed)}
          {sim.paused && <span className="ml-2 text-amber-300">time paused, so you can't move</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-white/55">
          <span>
            <Kbd>W</Kbd>
            <Kbd>A</Kbd>
            <Kbd>S</Kbd>
            <Kbd>D</Kbd> move
          </span>
          <span>
            <Kbd>Space</Kbd>/<Kbd>C</Kbd> up/down
          </span>
          <span>
            <Kbd>Q</Kbd>
            <Kbd>E</Kbd> roll
          </span>
          <span>scroll = throttle</span>
          <span>
            <Kbd>Esc</Kbd> exit
          </span>
        </div>
      </div>
    );
  }

  if (mode === 'travel') {
    return (
      <div className="pointer-events-none absolute bottom-[248px] left-4 z-10 hidden text-[12px] text-white/45 md:block">
        Drag or use the arrow keys to look around
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute bottom-20 left-4 z-10 hidden text-[12px] text-white/45 md:block">
      Drag to orbit · Scroll to zoom · Double-click a body to fly there · <Kbd>G</Kbd> plan a trip · <Kbd>F</Kbd> free
      flight · <Kbd>?</Kbd> shortcuts
    </div>
  );
}
