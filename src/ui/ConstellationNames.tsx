/**
 * The constellations' names, each at the middle of its figure as seen from where the camera is:
 * the mean direction of the figure's stars (near the Sun, d3-celestial's own label place, which is
 * tuned for a star chart). 88 DOM elements, made once and positioned straight in the DOM while
 * the figures show (like the body labels, never through React state). A name shows only while its figure is big enough
 * on screen to read it against (NAME_PX), and fades out from NAME_FAR_PC from the Sun: from far off, with the figures
 * turned on, the 88 would pile up in one spot.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { type PerspectiveCamera, Vector3 } from 'three';
import { PARSEC_KM } from '../physics/constants';
import { figureStars, motionYears, starData, starsVersion, subscribeStars, C_PC_PER_YR, KMS_TO_PC_PER_YR } from '../sim/stars';
import { raDecToWorld } from '../sim/frames';
import { screenOf } from '../sim/derived';
import type { ScreenPoint } from '../sim/sim';
import { sim } from '../sim/sim';
import { constellationsNow, figureFade } from './constellations';

interface NameSlot {
  el: HTMLSpanElement;
  stars: number[];
  /** d3-celestial's label direction (world axes), for views from near the Sun. */
  chart: Vector3;
}

const slots: NameSlot[] = [];
let host: HTMLDivElement | null = null;
let builtFor: unknown = null;

/** A name fades in as its figure's stars spread over this many CSS px (their mean distance from its middle), from the first. */
export const NAME_PX: readonly [number, number] = [15, 40];

/** Names fade out between these distances from the Sun, pc (the figures themselves stay while they are on). */
export const NAME_FAR_PC: readonly [number, number] = [400, 1200];

/** A name's strength (0–1) for a figure whose stars spread over spreadPx on screen. */
export const nameBySize = (spreadPx: number): number => {
  const t = Math.min(1, Math.max(0, (spreadPx - NAME_PX[0]) / (NAME_PX[1] - NAME_PX[0])));
  return t * t * (3 - 2 * t);
};

const dir = new Vector3();
const acc = new Vector3();
const screen: ScreenPoint = { x: 0, y: 0, onScreen: false, inFront: false };

/** Make the name elements for the loaded figures (once per file). */
function build(): void {
  const file = starData.constellations;
  if (!host || !file || builtFor === file) return;
  builtFor = file;
  for (const s of slots) s.el.remove();
  slots.length = 0;
  for (const c of file.constellations) {
    const el = document.createElement('span');
    el.className = 'constellation-name';
    el.textContent = c.name;
    el.title = `${c.name} (${c.english})`;
    el.style.opacity = '0';
    host.appendChild(el);
    slots.push({ el, stars: figureStars(c), chart: raDecToWorld(c.label[0], c.label[1]) });
  }
}

/** Positions the constellation names each frame while the figures show. */
export function ConstellationNameSync() {
  const shown = useRef(false);
  useFrame(({ camera }) => {
    const on = constellationsNow() && !!starData.stars && slots.length > 0;
    if (!on) {
      if (shown.current) for (const s of slots) s.el.style.opacity = '0';
      shown.current = false;
      return;
    }
    shown.current = true;
    const stars = starData.stars!;
    const P = stars.positions;
    const V = stars.velocitiesInt16;
    const kv = stars.velocityUnitKms * KMS_TO_PC_PER_YR;
    const years = motionYears(2000 + sim.astroTime.tt / 365.25);
    const cam = sim.camera.pos;
    // Camera in parsecs, J2000 ecliptic.
    const cx = cam.x / PARSEC_KM;
    const cy = -cam.z / PARSEC_KM;
    const cz = cam.y / PARSEC_KM;
    // Near the Sun the chart's label places; from 0.5 pc on, the figures' own middles.
    const w = Math.min(1, Math.max(0, (Math.hypot(cx, cy, cz) - 0.05) / 0.45));
    const far = 1 - Math.min(1, Math.max(0, (Math.hypot(cx, cy, cz) - NAME_FAR_PC[0]) / (NAME_FAR_PC[1] - NAME_FAR_PC[0])));
    if (far <= 0) {
      for (const s of slots) if (s.el.style.opacity !== '0') s.el.style.opacity = '0';
      return;
    }
    const pxPerRad = sim.viewport.height / 2 / Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360);
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k];
      acc.set(0, 0, 0);
      for (const i of s.stars) {
        const px = P[3 * i];
        const py = P[3 * i + 1];
        const pz = P[3 * i + 2];
        const t = years + Math.hypot(px, py, pz) / C_PC_PER_YR;
        const ex = px + V[3 * i] * kv * t - cx;
        const ey = py + V[3 * i + 1] * kv * t - cy;
        const ez = pz + V[3 * i + 2] * kv * t - cz;
        const d = Math.hypot(ex, ey, ez) || 1;
        acc.x += ex / d;
        acc.y += ez / d; // world (x, y, z) = ecliptic (x, z, −y)
        acc.z += -ey / d;
      }
      // How closely the figure's stars gather on the sky (1: a point, 0: all over it). A figure
      // that has come apart (far from the Sun) keeps no name, nor does one whose lines have faded.
      const gathered = acc.length() / s.stars.length;
      // …nor one too small on screen to read it against: its stars' angular spread, acos of how gathered they are.
      const spreadPx = Math.acos(Math.min(1, gathered)) * pxPerRad;
      const opacity = Math.min(1, Math.max(0, (gathered - 0.55) / 0.25)) * (figureFade[k] ?? 1) * nameBySize(spreadPx) * far;
      dir.copy(acc).normalize().multiplyScalar(w).addScaledVector(s.chart, 1 - w).normalize();
      screenOf(dir, camera as PerspectiveCamera, screen);
      const el = s.el;
      if (!screen.onScreen || opacity <= 0) {
        if (el.style.opacity !== '0') el.style.opacity = '0';
        continue;
      }
      el.style.opacity = opacity.toFixed(2);
      el.style.transform = `translate3d(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  });
  return null;
}

/** The layer the names live in (over the view, under the body labels). */
export function ConstellationNamesLayer() {
  const root = useRef<HTMLDivElement>(null);
  const version = useSyncExternalStore(subscribeStars, starsVersion);
  useEffect(() => {
    host = root.current;
    build();
    return () => {
      for (const s of slots) s.el.remove();
      slots.length = 0;
      host = null;
      builtFor = null;
    };
  }, []);
  useEffect(build, [version]);
  return <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" />;
}
