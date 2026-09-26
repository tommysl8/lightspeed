/**
 * Viewport instruments drawn over the 3D view: reticle with spectrometer readout, apex and
 * antapex markers, scale bar and an ecliptic axis triad. They move every frame, so a
 * component inside the Canvas (OverlaySync) writes their DOM directly, as the labels do.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Quaternion, Vector3, Vector4, type PerspectiveCamera } from 'three';
import { bodyName, type BodyId } from '../../sim/bodies';
import { fixed, sig } from '../../lib/sci';
import { scaleBarLength } from './scaleBar';
import { relView } from '../../render/relativisticView';
import { sim } from '../../sim/sim';
import { useUI } from '../../state/ui';
import { apexDirection, observerBeta, reticleReading } from '../../lab/measure';

type Key = 'apex' | 'antapex' | 'reticleText' | 'scaleBar' | 'scaleText' | 'triad' | 'triadX' | 'triadY' | 'triadZ' | 'triadXl' | 'triadYl' | 'triadZl' | 'reticle';
const els: Partial<Record<Key, HTMLElement | SVGElement>> = {};

function reg(key: Key) {
  return (el: HTMLElement | SVGElement | null) => {
    if (el) els[key] = el;
    else delete els[key];
  };
}

const inv = new Quaternion();
const v = new Vector3();
const clip = new Vector4();
const apex = new Vector3();
const antapex = new Vector3();
const TRIAD_KEYS: [Key, Key][] = [
  ['triadX', 'triadXl'],
  ['triadY', 'triadYl'],
  ['triadZ', 'triadZl'],
];
/** Last text/width written, so the DOM is only touched when something changes. */
const lastScale = { text: '', width: '' };

function setScale(bar: HTMLElement, label: Element, width: string, text: string) {
  if (width !== lastScale.width) bar.style.width = lastScale.width = width;
  if (text !== lastScale.text) label.textContent = lastScale.text = text;
}

/** Project a world direction (unit vector) to viewport px; null if behind the camera. */
function projectDir(dir: Vector3, camera: PerspectiveCamera): { x: number; y: number } | null {
  v.copy(dir).applyQuaternion(inv);
  if (v.z >= -1e-6) return null;
  clip.set(v.x, v.y, v.z, 1).applyMatrix4(camera.projectionMatrix);
  const { width, height } = sim.viewport;
  return { x: ((clip.x / clip.w + 1) / 2) * width, y: ((1 - clip.y / clip.w) / 2) * height };
}

function place(el: HTMLElement | SVGElement | undefined, p: { x: number; y: number } | null) {
  if (!el) return;
  const { width, height } = sim.viewport;
  const visible = !!p && p.x > -20 && p.x < width + 20 && p.y > -20 && p.y < height + 20;
  (el as HTMLElement).style.opacity = visible ? '1' : '0';
  if (p && visible) (el as HTMLElement).style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
}

/** Body the scale bar refers to: the orbit target, else the selection, else the nearest. */
function scaleBody(): BodyId {
  const ui = useUI.getState();
  if (ui.controlMode === 'orbit' || ui.controlMode === 'transition') return ui.focus;
  if (ui.selected) return ui.selected;
  let best: BodyId = 'sun';
  let bestD = Infinity;
  for (const b of sim.bodyList) {
    if (b.present && b.distCamera < bestD) {
      bestD = b.distCamera;
      best = b.id;
    }
  }
  return best;
}

const AXES = [new Vector3(1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, 1, 0)]; // ecliptic X, Y, Z in world axes

/** Ecliptic longitudes labelled on the grid. */
const GRID_LONS = Array.from({ length: 12 }, (_, i) => i * 30);
const gridEls: (HTMLElement | null)[] = [];
const gridDir = new Vector3();

export function OverlaySync() {
  const frameRef = useRef(0);
  useFrame(({ camera }) => {
    const frame = ++frameRef.current;
    const cam = camera as PerspectiveCamera;
    inv.copy(sim.camera.quat).invert();
    const beta = observerBeta();
    const moving = beta >= 1e-3 && !relView.suspended;

    // Apex / antapex
    const a = moving ? apexDirection(apex) : null;
    place(els.apex, a ? projectDir(a, cam) : null);
    place(els.antapex, a ? projectDir(antapex.copy(a).negate(), cam) : null);

    // The reticle is shown in motion only, where its spectrometer means something.
    if (els.reticle) {
      const o = moving ? '1' : '0';
      if ((els.reticle as HTMLElement).style.opacity !== o) (els.reticle as HTMLElement).style.opacity = o;
    }
    // Reticle readout (a few times a second is plenty for text)
    if (frame % 6 === 0 && els.reticleText) {
      const g = moving ? reticleReading() : null;
      els.reticleText.textContent = g ? `θ′ ${fixed(g.thetaShipDeg, 2)}°  θ ${fixed(g.thetaDeg, 2)}°  D ${sig(g.D, 5)}` : '';
    }

    // Scale bar at the reference body's distance (meaningless in the aberrated view)
    if (els.scaleBar && els.scaleText) {
      const id = scaleBody();
      const d = sim.bodies[id]?.distCamera ?? NaN;
      const kmPerPx = (2 * d * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, sim.viewport.height);
      if (relView.active || !Number.isFinite(kmPerPx) || kmPerPx <= 0) {
        setScale(els.scaleBar as HTMLElement, els.scaleText, '0px', relView.active ? 'no single scale at this speed' : '');
      } else {
        const s = scaleBarLength(kmPerPx);
        setScale(els.scaleBar as HTMLElement, els.scaleText, `${s.px.toFixed(1)}px`, `${s.label}  at ${bodyName(id)}`);
      }
    }

    // Longitude labels on the ecliptic (grid on, classical view only)
    const grid = useUI.getState().showGrid && !relView.active;
    GRID_LONS.forEach((l, i) => {
      const el = gridEls[i];
      if (!el) return;
      if (!grid) {
        el.style.opacity = '0';
        return;
      }
      const r = (l * Math.PI) / 180;
      place(el, projectDir(gridDir.set(Math.cos(r), 0, -Math.sin(r)), cam));
    });

    // Axis triad (orthographic, 26 px arms)
    AXES.forEach((ax, i) => {
      v.copy(ax).applyQuaternion(inv);
      const [lk, tk] = TRIAD_KEYS[i];
      const line = els[lk] as SVGLineElement | undefined;
      const lbl = els[tk] as SVGTextElement | undefined;
      if (!line || !lbl) return;
      const x = 32 + v.x * 24;
      const y = 32 - v.y * 24;
      line.setAttribute('x2', x.toFixed(2));
      line.setAttribute('y2', y.toFixed(2));
      line.setAttribute('opacity', v.z > 0 ? '0.45' : '1');
      lbl.setAttribute('x', (32 + v.x * 31).toFixed(2));
      lbl.setAttribute('y', (32 - v.y * 31 + 3).toFixed(2));
      lbl.setAttribute('opacity', v.z > 0 ? '0.45' : '1');
    });
  });
  return null;
}

// ─── DOM parts ───────────────────────────────────────────────────────────────────────────

function Marker({ kind }: { kind: 'apex' | 'antapex' }) {
  return (
    <div ref={reg(kind)} className="pointer-events-none absolute left-0 top-0 opacity-0" aria-hidden>
      <svg className="absolute -left-[9px] -top-[9px]" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#f0a73a" strokeWidth="1.1">
        <circle cx="9" cy="9" r="6.5" />
        {kind === 'apex' ? <circle cx="9" cy="9" r="1.4" fill="#f0a73a" /> : <path d="M4.6 4.6l8.8 8.8M13.4 4.6l-8.8 8.8" />}
      </svg>
      <span className="mono absolute left-3 top-2 whitespace-nowrap text-[9.5px] tracking-[0.12em] text-accent [text-shadow:0_0_3px_#000]">
        {kind === 'apex' ? 'APEX' : 'ANTAPEX'}
      </span>
    </div>
  );
}

export function ViewportInstruments() {
  const show = useUI((s) => s.showOverlays);
  const grid = useUI((s) => s.showGrid);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ display: show ? undefined : 'none' }}>
      {/* Reticle */}
      <div ref={reg('reticle')} className="absolute left-1/2 top-1/2 opacity-0" aria-hidden>
        <svg className="absolute -left-[16px] -top-[16px]" width="32" height="32" viewBox="0 0 32 32" stroke="rgba(216,221,227,0.55)" strokeWidth="1">
          <path d="M16 3v8M16 21v8M3 16h8M21 16h8" />
        </svg>
        <span ref={reg('reticleText')} className="mono absolute left-5 top-3 whitespace-nowrap text-[10px] text-data [text-shadow:0_0_3px_#000]" />
      </div>

      <Marker kind="apex" />
      <Marker kind="antapex" />

      {GRID_LONS.map((l, i) => (
        <div
          key={l}
          ref={(el) => {
            gridEls[i] = el;
          }}
          className="mono pointer-events-none absolute left-0 top-0 opacity-0"
          aria-hidden
        >
          <span className="absolute left-1 top-1 whitespace-nowrap text-[9.5px] text-accent/70 [text-shadow:0_0_3px_#000]">
            {l === 0 ? 'λ 0° equinox' : `${l}°`}
          </span>
        </div>
      ))}

      {/* Scale bar */}
      <div className="absolute bottom-3 left-3">
        <div ref={reg('scaleBar')} className="h-[5px] border-x border-b border-fg-2" style={{ width: 0 }} />
        <div ref={reg('scaleText')} className="mono mt-1 whitespace-nowrap text-[10px] text-fg-2 [text-shadow:0_0_3px_#000]" />
      </div>

      {/* Ecliptic axis triad (with the coordinate grid) */}
      <div
        className="absolute bottom-2 right-2 text-center"
        style={{ display: grid ? undefined : 'none' }}
        title="Ecliptic J2000 axes: X towards the March equinox, Z towards the ecliptic north pole"
      >
        <svg width="64" height="64" viewBox="0 0 64 64" fontFamily="var(--font-mono)" fontSize="9">
          <circle cx="32" cy="32" r="1.5" fill="#717a84" />
          <line ref={reg('triadX')} x1="32" y1="32" x2="56" y2="32" stroke="#ff806e" strokeWidth="1.2" />
          <line ref={reg('triadY')} x1="32" y1="32" x2="32" y2="8" stroke="#6ccf8b" strokeWidth="1.2" />
          <line ref={reg('triadZ')} x1="32" y1="32" x2="44" y2="44" stroke="#86b6ff" strokeWidth="1.2" />
          <text ref={reg('triadXl')} fill="#ff806e" textAnchor="middle">
            X
          </text>
          <text ref={reg('triadYl')} fill="#6ccf8b" textAnchor="middle">
            Y
          </text>
          <text ref={reg('triadZl')} fill="#86b6ff" textAnchor="middle">
            Z
          </text>
        </svg>
        <div className="mono -mt-1 text-[8.5px] tracking-[0.1em] text-fg-3">ECL J2000</div>
      </div>
    </div>
  );
}
