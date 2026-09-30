/**
 * Roam's readout, in the top left of the view while the camera is flown by hand: the nearest thing that
 * matters here and where it is, the pace in plain units ("1.2 light-years a second"; past light's, that
 * this is a camera, not a ship), the multiplier with − and +, how to move and how to leave, and the switch
 * to the ship (light-speed limit, relativity on). Flying the ship, the same place says so, with the
 * throttle and the way back. On a touch screen two buttons halfway down the right edge hold the camera
 * moving forward or back (RoamTouchPad), since there may be no keys; a finger drags the view round. What needs a mouse (the
 * ship, mouse look) and the keys' list show only where there is one.
 *
 * How: the numbers come from the camera controller (its pace, multiplier and lock) and controls/roam.ts
 * (the surroundings it measured this frame), polled six times a second while roaming; nothing renders
 * otherwise.
 *
 * Why here: the top left holds what the camera is doing (the view readout, the layers' cards below); the
 * bottom is the black-hole panel's and the flights'.
 */
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { controller } from '../../controls/cameraController';
import { surroundings } from '../../controls/roam';
import { bodyName } from '../../sim/bodies';
import { loadStarNames, starData } from '../../sim/stars/load';
import { starDisplayName } from '../../sim/stars/names';
import { sci } from '../../lib/sci';
import { useUI } from '../../state/ui';
import { Kbd } from '../kit';
import { Icon } from '../icons';
import { rich } from '../rich';
import { useTicker } from '../useTicker';
import { FASTER_THAN_LIGHT, roamMulText, roamPlaceWords, roamSpeedWords } from './roamText';

/** A button that does its job and gives the focus back, so Space (up, while roaming) never presses it again. */
function Btn({ onClick, title, children, className = '' }: { onClick: () => void; title: string; children: ReactNode; className?: string }) {
  return (
    <button
      className={`btn btn-sm ${className}`}
      title={title}
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

/** A touch screen: the arrows to hold show (phones, tablets, and laptops with one). */
const touchScreen = (): boolean => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
/** A mouse or a trackpad: what needs one (the ship's mouse look, Roam's) shows, and the keys are listed. */
const hasMouse = (): boolean => typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(any-pointer: fine)').matches;

/** The nearest thing's name: a body's, a catalogue star's (its names load the first time one is nearest), "A star", or the edge of the map. */
function nearName(): string | null {
  const s = surroundings;
  if (s.id) return bodyName(s.id);
  if (s.starIndex >= 0) {
    if (starData.names) return starDisplayName(starData.names, s.starIndex);
    void loadStarNames();
    return 'A star';
  }
  if (s.cls === 'edge') return 'The edge of the map';
  return null;
}

function Roaming() {
  const mul = controller.roamMul;
  const s = surroundings;
  const name = nearName();
  const speed = roamSpeedWords(controller.roamSpeed);
  const locked = controller.pointerLocked;
  const mouse = hasMouse();
  const touch = touchScreen();
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-medium text-fg">Roam</span>
        <Btn className="btn-q ml-auto !h-6" onClick={() => controller.exitRoam()} title="Orbit the nearest body from here (F or Esc)">
          Leave
        </Btn>
      </div>
      <dl className="mt-1 grid grid-cols-[42px_minmax(0,1fr)] gap-x-2 gap-y-0.5 leading-snug">
        <dt className="text-fg-3">Near</dt>
        <dd className="min-w-0">
          {name ? (
            <>
              <span className="text-fg">{name}</span>, {roamPlaceWords(s.cls, s.distKm, s.radiusKm)}
            </>
          ) : (
            '—'
          )}
        </dd>
        <dt className="text-fg-3">Speed</dt>
        <dd className="min-w-0">
          <span className="text-fg" aria-live="off">
            {speed.text}
          </span>
          {speed.fasterThanLight && <span className="block text-fg-3">{FASTER_THAN_LIGHT}</span>}
        </dd>
      </dl>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="flex items-center" role="group" aria-label="Pace">
          <Btn className="btn-q btn-sq !w-6" onClick={() => controller.setRoamMul(mul / 2)} title="Half the pace (− or the wheel)">
            <Icon name="chevron-left" />
          </Btn>
          <span className="mono min-w-[3.4em] px-0.5 text-center text-fg" title="The pace, as a multiple of the one the surroundings set">
            {roamMulText(mul)}
          </span>
          <Btn className="btn-q btn-sq !w-6" onClick={() => controller.setRoamMul(mul * 2)} title="Twice the pace (+ or the wheel)">
            <Icon name="chevron-right" />
          </Btn>
        </span>
        {mouse && (
          <Btn className="ml-auto" onClick={() => controller.roamToShip()} title="Fly the ship from here instead: the light-speed limit, a throttle, and relativity on (Esc comes back to Roam)">
            Fly the ship
          </Btn>
        )}
        {mouse && !locked && (
          <Btn onClick={() => controller.roamLockPointer()} title="Let the mouse turn the view without a drag (Esc gives the pointer back)">
            Mouse look
          </Btn>
        )}
      </div>
      {mouse && (
        <p className="mt-1.5 text-[10.5px] leading-snug text-fg-3">
          <Kbd>W</Kbd>
          <Kbd>A</Kbd>
          <Kbd>S</Kbd>
          <Kbd>D</Kbd> move, drag to look, <Kbd>Shift</Kbd> faster, <Kbd>?</Kbd> all keys
        </p>
      )}
      {touch && <p className="mt-1.5 text-[10.5px] leading-snug text-fg-3">A finger drags the view round; hold the arrows at the right edge to move.</p>}
    </>
  );
}

function Ship() {
  const throttle = useUI((s) => s.throttleBeta);
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-medium text-fg">The ship</span>
        <span className="min-w-0 truncate text-fg-3">light-speed limit, relativity on</span>
        <Btn className="btn-q ml-auto !h-6" onClick={() => controller.shipToRoam()} title="Back to roaming from here (Esc)">
          Roam
        </Btn>
      </div>
      <p className="mt-1 leading-snug">
        Throttle <span className="mono text-fg">{rich(sci(throttle || controller.throttleBeta, 2))} c</span>; the wheel sets it.
      </p>
      <p className="mt-1 text-[10.5px] leading-snug text-fg-3">
        <Kbd>W</Kbd>
        <Kbd>A</Kbd>
        <Kbd>S</Kbd>
        <Kbd>D</Kbd> fly, the mouse steers, <Kbd>Esc</Kbd> back to Roam
      </p>
    </>
  );
}

export function RoamPanel() {
  const mode = useUI((s) => s.controlMode);
  const on = mode === 'roam' || mode === 'free';
  useTicker(6, on);
  if (!on) return null;
  return (
    <section className="panel-float appear pointer-events-auto w-[312px] max-w-full px-2.5 pb-2 pt-1.5 text-[11.5px] text-fg-2" aria-label={mode === 'roam' ? 'Roam' : 'The ship'}>
      {mode === 'roam' ? <Roaming /> : <Ship />}
    </section>
  );
}

/** Hold to move: +1 forward, −1 back, while the finger stays down. */
function Hold({ dir, label, icon }: { dir: 1 | -1; label: string; icon: 'chevron-up' | 'chevron-down' }) {
  const stop = () => {
    controller.roamTouch = 0;
  };
  return (
    <button
      className="flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border border-line-2 bg-bg/55 text-fg-2 backdrop-blur-sm active:text-accent"
      aria-label={label}
      title={`${label} (hold)`}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        controller.roamTouch = dir;
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

/** On a touch screen, while roaming: forward and back, held (in clean full screen too: they are its only way to move there). */
export function RoamTouchPad() {
  const mode = useUI((s) => s.controlMode);
  // Beside an open body card where there is room (it is 300 px wide at the right, 16 px in); over it on a phone.
  const cardOpen = useUI((s) => s.bodyCard && !!s.selected);
  if (mode !== 'roam' || !touchScreen()) return null;
  return (
    // Halfway down the right edge, under the thumb and clear of the panels along the bottom (the black-hole panel,
    // the flights') and the picture credits. Kept in clean full screen (ui/cleanMode.ts): without it a touch screen
    // could not move there.
    <div data-clean-keep className={`absolute top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 ${cardOpen ? 'right-3 sm:right-[328px]' : 'right-3'}`} role="group" aria-label="Move">
      <Hold dir={1} label="Forward" icon="chevron-up" />
      <Hold dir={-1} label="Back" icon="chevron-down" />
    </div>
  );
}
