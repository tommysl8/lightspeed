/**
 * Body labels: a fixed pool of DOM elements, handed each frame to the most important bodies on
 * screen, however many bodies are registered. Importance: the selected body, a body whose
 * detector just fired, the body in focus and its system, then each body's rank (by kind and
 * size, or its record's labelRank; stars by how bright they look from the camera), with bodies
 * large on screen a little ahead. A star too faint to see gets no label unless it is selected,
 * in focus or in the system in focus, and the stars of a pair too close to tell apart share one
 * (labelPairs.ts). Labels fade when their body is big enough to recognise and give way to more
 * important labels they would overlap. Positions are written straight into the DOM, never
 * through React state (60 fps).
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { C_KM_S } from '../physics/constants';
import { qty } from '../lib/sci';
import { isWithin, registryVersion, systemOf, type BodyId, type BodyRecord } from '../sim/bodies';
import { bodyEntries, type Entry } from '../sim/bodies/registry';
import { useUI } from '../state/ui';
import { controller } from '../controls/cameraController';
import { onDetection } from '../sim/pulses';
import { labelRank, labelScore } from './labelRank';
import { unresolvedPairs, type PairLabels } from './labelPairs';
import { solarSystemHidden } from '../sim/derived';
import { starLabelRank, STAR_MAG_LIMIT } from '../sim/stars';

/** Label elements in the pool: the most that can show at once. */
export const LABEL_POOL = 40;

interface Slot {
  el: HTMLDivElement;
  name: HTMLSpanElement;
  sub: HTMLSpanElement;
  /** Body shown, or null when free. */
  id: BodyId | null;
  /** Frames since it was freed (a slot reused at once would carry the old label's fade). */
  freeFor: number;
  /** Restore the opacity transition next frame (it is cut when a slot changes body). */
  cut: boolean;
  /** The text shown. */
  text: string;
}

const slots: Slot[] = [];
let subFrame = 0;

/** Wall-clock time of each body's latest detector hit, so its marker can flash. */
const hits = new Map<BodyId, number>();
onDetection((_, d) => hits.set(d.body, performance.now()));
const FLASH_MS = 1600;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface Candidate {
  e: Entry;
  score: number;
}

/** A label's text: the name, or its short form when the name is long ("67P" for Comet 67P/Churyumov–Gerasimenko). */
export const labelText = (r: BodyRecord): string => (r.shortName && r.name.length > 18 ? r.shortName : r.name);

/** The Sun's label once the Solar System has shrunk to its point of light: a star among stars, and home. */
export const SUN_FROM_AFAR = 'Sun (home)';

/** Unresolved pairs this frame: the one label they share. */
const pairs: PairLabels = { hide: new Set(), text: new Map() };

/** What a body's label says now (the Sun is "Sun (home)" from afar; an unresolved pair its system's name). */
const labelNow = (e: Entry, far: boolean): string => (far && e.id === 'sun' ? SUN_FROM_AFAR : (pairs.text.get(e.id) ?? labelText(e.record)));

/** A star fainter than this (the eye's limit, and the half magnitude over which the star field fades it out) gets no label of its own. */
const LABEL_MAG_LIMIT = STAR_MAG_LIMIT + 0.5;

const ranks = { version: -1, map: new Map<BodyId, number>() };
function rankOf(e: Entry): number {
  if (ranks.version !== registryVersion()) {
    ranks.map.clear();
    ranks.version = registryVersion();
  }
  let r = ranks.map.get(e.id);
  if (r === undefined) {
    r = labelRank(e.record);
    ranks.map.set(e.id, r);
  }
  return r;
}

// Reused every frame.
const cand: Candidate[] = [];
const pool: Candidate[] = [];
const placed: { x: number; y: number; w: number }[] = [];
const chosen = new Map<BodyId, { e: Entry; opacity: number; flashing: boolean }>();
const byScore = (a: Candidate, b: Candidate) => a.score - b.score;

/**
 * Assigns the pooled label elements to bodies and positions them, straight in the DOM.
 */
export function LabelSync() {
  const focusSystem = useRef({ focus: '', system: '' as BodyId | '' });
  useFrame(() => {
    if (!slots.length) return;
    const { showLabels, selected, focus } = useUI.getState();
    const now = performance.now();
    if (focusSystem.current.focus !== focus) focusSystem.current = { focus, system: systemOf(focus)?.id ?? '' };
    const system = focusSystem.current.system;
    const far = solarSystemHidden();

    // 1. Candidates on screen, scored (lower first).
    cand.length = 0;
    const list = bodyEntries();
    unresolvedPairs(list, pairs);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const b = e.state;
      if (!b.screen.onScreen || !b.present) continue;
      const hit = hits.get(e.id);
      const flashing = hit !== undefined && now - hit < FLASH_MS;
      if (!showLabels && !flashing) continue;
      const tier = e.id === selected ? 0 : flashing ? 1 : e.id === focus ? 2 : system && system !== 'sun' && isWithin(e.id, system) ? 3 : 4;
      const star = e.record.kind === 'star' && e.id !== 'sun';
      // A star nobody could see from here, or one that shares its pair's label, is left unlabelled.
      if (star && tier >= 3 && (b.magnitude > LABEL_MAG_LIMIT || pairs.hide.has(e.id))) continue;
      // Stars rank by how bright they look from the camera, not from the Sun.
      const score = labelScore(tier, star ? starLabelRank(b.magnitude) : rankOf(e), b.radiusPx);
      let c = pool[cand.length];
      if (!c) pool.push((c = { e, score }));
      c.e = e;
      c.score = score;
      cand.push(c);
    }
    cand.sort(byScore);

    // 2. Place them, most important first: overlap and size decide what shows.
    placed.length = 0;
    chosen.clear();
    for (let i = 0; i < cand.length && chosen.size < LABEL_POOL; i++) {
      const e = cand[i].e;
      const b = e.state;
      const hit = hits.get(e.id);
      const flashing = hit !== undefined && now - hit < FLASH_MS;
      let opacity = 0;
      if (showLabels) {
        // Fade when close (the body itself is then obvious).
        opacity = 1 - smoothstep(26, 70, b.radiusPx);
        if (e.id === selected && b.radiusPx < 40) opacity = Math.max(opacity, 0.35);
        const w = 12 + labelNow(e, far).length * 7.2;
        const overlaps = placed.some((p) => Math.abs(p.y - b.screen.y) < 16 && b.screen.x < p.x + p.w && b.screen.x + w > p.x);
        if (overlaps && e.id !== selected) opacity = 0;
        if (opacity > 0.05) placed.push({ x: b.screen.x, y: b.screen.y, w });
      }
      // A detector hit shows even when the label itself is hidden.
      if (opacity > 0.05 || flashing) chosen.set(e.id, { e, opacity, flashing });
    }

    // 3. Keep each labelled body in the slot it had; free the others.
    for (const s of slots) {
      if (s.cut) {
        s.el.style.transition = '';
        s.cut = false;
      }
      if (s.id !== null && !chosen.has(s.id)) {
        s.id = null;
        s.freeFor = 0;
        s.el.style.opacity = '0';
        s.el.style.pointerEvents = 'none';
        s.el.dataset.selected = 'false';
        s.el.dataset.flash = 'false';
      } else if (s.id === null) s.freeFor++;
    }
    for (const [id, c] of chosen) {
      let s = slots.find((x) => x.id === id);
      if (!s) {
        // Prefer a slot whose last label has finished fading out.
        s = slots.find((x) => x.id === null && x.freeFor > 12) ?? slots.find((x) => x.id === null);
        if (!s) continue;
        if (s.freeFor <= 12) {
          s.el.style.transition = 'none';
          s.cut = true;
        }
        s.id = id;
        s.text = '';
        s.el.setAttribute('aria-label', `Select ${c.e.record.name}`);
        s.sub.textContent = '';
      }
      const text = labelNow(c.e, far);
      if (s.text !== text) {
        s.text = text;
        s.name.firstChild!.nodeValue = text;
      }
      const b = c.e.state;
      const marker = 1 - smoothstep(3, 9, b.radiusPx);
      const offset = Math.max(b.radiusPx, 5) + 6;
      const el = s.el;
      el.style.opacity = (c.flashing ? 1 : c.opacity).toFixed(3);
      el.style.transform = `translate3d(${b.screen.x.toFixed(1)}px, ${b.screen.y.toFixed(1)}px, 0)`;
      el.style.setProperty('--marker', marker.toFixed(3));
      el.style.setProperty('--offset', `${offset.toFixed(1)}px`);
      el.style.pointerEvents = c.opacity > 0.3 ? 'auto' : 'none';
      el.dataset.selected = id === selected ? 'true' : 'false';
      el.dataset.flash = c.flashing ? 'true' : 'false';
      // Range and light-time under the selected body's name, a few times a second.
      if (id === selected) {
        if (s.sub.style.display) s.sub.style.display = '';
        if (subFrame % 8 === 0 || !s.sub.textContent) {
          const r = qty(b.distTrue, 'length', 4);
          const lt = qty(b.distTrue / C_KM_S, 'time', 3);
          s.sub.textContent = `${r.v} ${r.u} · ${lt.v} ${lt.u}`;
        }
      } else if (s.sub.style.display !== 'none') {
        s.sub.textContent = '';
        s.sub.style.display = 'none';
      }
    }
    subFrame++;
  });
  return null;
}

/** The pool of label elements; LabelSync gives them their bodies. */
export function LabelsLayer() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = root.current!;
    const made: Slot[] = [];
    for (let i = 0; i < LABEL_POOL; i++) {
      const el = document.createElement('div');
      el.className = 'body-label group absolute left-0 top-0 opacity-0 will-change-transform';
      el.setAttribute('role', 'button');
      el.tabIndex = -1;
      el.style.pointerEvents = 'none';
      const marker = document.createElement('span');
      marker.className = 'body-marker';
      const name = document.createElement('span');
      name.className = 'body-name';
      name.appendChild(document.createTextNode(''));
      const sub = document.createElement('span');
      sub.className = 'body-sub';
      sub.style.display = 'none';
      name.appendChild(sub);
      el.append(marker, name);
      const slot: Slot = { el, name, sub, id: null, freeFor: 1e9, cut: false, text: '' };
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (slot.id) useUI.getState().select(slot.id);
      });
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (!slot.id) return;
        useUI.getState().select(slot.id);
        controller.goTo(slot.id);
      });
      host.appendChild(el);
      made.push(slot);
    }
    slots.push(...made);
    return () => {
      for (const s of made) {
        s.el.remove();
        const i = slots.indexOf(s);
        if (i >= 0) slots.splice(i, 1);
      }
    };
  }, []);
  return <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="false" />;
}
