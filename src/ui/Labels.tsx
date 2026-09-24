import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BODIES, BODY_ORDER, type BodyId } from '../physics/constants';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { controller } from '../controls/cameraController';

/** DOM label elements, registered by <LabelsLayer/> and positioned by <LabelSync/> each frame. */
const labelEls = new Map<BodyId, HTMLDivElement>();

const PRIORITY: Record<BodyId, number> = {
  sun: 0,
  jupiter: 1,
  saturn: 2,
  earth: 3,
  venus: 4,
  mars: 5,
  uranus: 6,
  neptune: 7,
  mercury: 8,
  pluto: 9,
  moon: 10,
  voyager1: 11,
  proxima: 12,
};
const ORDER = [...BODY_ORDER].sort((a, b) => PRIORITY[a] - PRIORITY[b]);

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Updates label positions directly in the DOM, never through React state (60 fps). Labels fade
 * out when their body is big enough to recognise, and give way to higher-priority labels
 * they would overlap.
 */
export function LabelSync() {
  useFrame(() => {
    const { showLabels, selected } = useUI.getState();
    const placed: { x: number; y: number; w: number }[] = [];
    for (const id of selected ? [selected, ...ORDER.filter((i) => i !== selected)] : ORDER) {
      const el = labelEls.get(id);
      if (!el) continue;
      const b = sim.bodies[id];
      let opacity = 0;
      if (showLabels && b.screen.onScreen) {
        // Fade when close (the body itself is then obvious).
        opacity = 1 - smoothstep(26, 70, b.radiusPx);
        if (id === selected && b.radiusPx < 40) opacity = Math.max(opacity, 0.35);
        const w = 12 + BODIES[id].name.length * 7.2;
        const overlaps = placed.some((p) => Math.abs(p.y - b.screen.y) < 16 && b.screen.x < p.x + p.w && b.screen.x + w > p.x);
        if (overlaps && id !== selected) opacity = 0;
        if (opacity > 0.05) placed.push({ x: b.screen.x, y: b.screen.y, w });
      }
      const marker = 1 - smoothstep(3, 9, b.radiusPx);
      const offset = Math.max(b.radiusPx, 5) + 6;
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = `translate3d(${b.screen.x.toFixed(1)}px, ${b.screen.y.toFixed(1)}px, 0)`;
      el.style.setProperty('--marker', marker.toFixed(3));
      el.style.setProperty('--offset', `${offset.toFixed(1)}px`);
      el.style.pointerEvents = opacity > 0.3 ? 'auto' : 'none';
      el.dataset.selected = id === selected ? 'true' : 'false';
    }
  });
  return null;
}

export function LabelsLayer() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="false">
      {BODY_ORDER.map((id) => (
        <Label key={id} id={id} />
      ))}
    </div>
  );
}

function Label({ id }: { id: BodyId }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    labelEls.set(id, el);
    return () => {
      labelEls.delete(id);
    };
  }, [id]);
  return (
    <div
      ref={ref}
      className="body-label group absolute left-0 top-0 opacity-0 will-change-transform"
      role="button"
      tabIndex={-1}
      aria-label={`Select ${BODIES[id].name}`}
      onClick={(e) => {
        e.stopPropagation();
        useUI.getState().select(id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        useUI.getState().select(id);
        controller.goTo(id);
      }}
    >
      <span className="body-marker" />
      <span className="body-name">{BODIES[id].name}</span>
    </div>
  );
}
