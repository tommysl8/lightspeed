/**
 * What the pointer is on, named beside it: a body whose label is not showing, or a ring round a
 * star with known planets (most of those stars are not bodies, so they have no label). Over
 * anything a click would select, the pointer becomes a hand. Mouse only: a touch has no hover.
 * Written straight into the DOM each frame, like the labels.
 *
 * Near a black hole a body can show two or three images of itself (sim/lensBodies.ts): the label sits
 * on the first, and any other image always gets its own tag, where it is, saying what it is ("S2 ·
 * second image, bent round Sagittarius A*"), since nothing else names it.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { pickAt, type Picked } from '../scene/picking';
import { bodyName, getBody, isBody } from '../sim/bodies';
import { exoplanetData, greekBayer, hostBodyId } from '../sim/exoplanets';
import { starData, starDisplayName } from '../sim/stars';
import { lensingHole } from '../sim/lensBodies';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { labelShown, labelText } from './Labels';
import { deepSkyGate } from '../sim/deepsky';

/** The pointer over the view, CSS px from its corner. */
const pointer = { x: 0, y: 0, over: false, moved: false };

interface Tag {
  el: HTMLDivElement;
  name: HTMLSpanElement;
  sub: HTMLSpanElement;
  /** What it names now ('' for nothing). */
  key: string;
}
let tag: Tag | null = null;

/** Frames between picks while the pointer is still (the view can move under it). */
const STILL_EVERY = 6;

/** The name a ring's star has (or will have once picked) and how many planets it is known to have. */
function hostText(h: number): { name: string; sub: string } {
  const cat = exoplanetData.catalogue!;
  const id = hostBodyId(h);
  const s = exoplanetData.matches?.star[h] ?? -1;
  const name = isBody(id) ? bodyName(id) : starData.names && s >= 0 ? starDisplayName(starData.names, s) : greekBayer(cat.hosts.name[h]);
  const n = cat.hosts.planetCount[h];
  return { name, sub: `${n} known planet${n === 1 ? '' : 's'}` };
}

/** The words for an image bent round a black hole. */
const IMAGE_WORDS = ['', 'second image', 'third image'] as const;

function show(t: Tag, p: Picked | null): void {
  const selected = useUI.getState().selected;
  // A body whose label shows, or the selected one, is named already (not its other images).
  const named = !p || (p.kind === 'body' && !p.image && (p.id === selected || labelShown(p.id)));
  if (named) {
    if (t.key) {
      t.key = '';
      t.el.style.opacity = '0';
    }
    return;
  }
  let x: number;
  let y: number;
  if (p.kind === 'body' && p.image) {
    // An image bent round a black hole: tagged where it is.
    x = p.x ?? 0;
    y = p.y ?? 0;
    const key = `b:${p.id}:${p.image}`;
    if (t.key !== key) {
      t.key = key;
      const r = getBody(p.id);
      const hole = lensingHole();
      t.name.textContent = r ? labelText(r) : p.id;
      t.sub.textContent = hole ? `${IMAGE_WORDS[p.image]}, bent round ${bodyName(hole)}` : IMAGE_WORDS[p.image];
      t.sub.style.display = '';
    }
  } else if (p.kind === 'body') {
    const b = sim.bodies[p.id];
    x = b.screen.x;
    y = b.screen.y;
    const key = `b:${p.id}`;
    if (t.key !== key) {
      t.key = key;
      const r = getBody(p.id);
      t.name.textContent = r ? labelText(r) : p.id;
      t.sub.textContent = '';
      t.sub.style.display = 'none';
    }
  } else if (p.kind === 'deepsky') {
    // A deep-sky catalogue's marker: its name and what it is (it becomes a body only when chosen).
    x = p.x;
    y = p.y;
    const key = `d:${p.set}:${p.index}`;
    if (t.key !== key) {
      t.key = key;
      const d = deepSkyGate.runtime?.describe(p.set, p.index) ?? { name: '', sub: '' };
      t.name.textContent = d.name;
      t.sub.textContent = d.sub;
      t.sub.style.display = d.sub ? '' : 'none';
    }
  } else {
    x = p.x;
    y = p.y;
    const key = `h:${p.host}`;
    if (t.key !== key) {
      t.key = key;
      const { name, sub } = hostText(p.host);
      t.name.textContent = name;
      t.sub.textContent = sub;
      t.sub.style.display = '';
    }
  }
  t.el.style.opacity = '1';
  t.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
}

/** Follows the pointer over the view and names what is under it. */
export function HoverSync() {
  const { gl, camera } = useThree();
  const frame = useRef(0);
  useEffect(() => {
    const dom = gl.domElement;
    const move = (e: PointerEvent) => {
      // Not while dragging the view round, and not for a touch.
      pointer.over = e.pointerType === 'mouse' && e.buttons === 0;
      const r = dom.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.moved = true;
    };
    const leave = () => {
      pointer.over = false;
      pointer.moved = true;
    };
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerleave', leave);
    dom.addEventListener('pointerdown', leave);
    return () => {
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerleave', leave);
      dom.removeEventListener('pointerdown', leave);
      dom.style.cursor = '';
    };
  }, [gl]);

  useFrame(() => {
    if (!tag) return;
    frame.current++;
    if (!pointer.moved && frame.current % STILL_EVERY !== 0) return;
    pointer.moved = false;
    const dom = gl.domElement;
    const on = pointer.over && document.pointerLockElement !== dom;
    const p = on ? pickAt(pointer.x, pointer.y, camera as PerspectiveCamera) : null;
    const cursor = p ? 'pointer' : '';
    if (dom.style.cursor !== cursor) dom.style.cursor = cursor;
    show(tag, p);
  });
  return null;
}

/** The tag itself, over the view with the labels. */
export function HoverTagLayer() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'hover-tag';
    el.style.opacity = '0';
    const name = document.createElement('span');
    name.className = 'hover-tag-name';
    const sub = document.createElement('span');
    sub.className = 'hover-tag-sub';
    sub.style.display = 'none';
    el.append(name, sub);
    root.current!.appendChild(el);
    tag = { el, name, sub, key: '' };
    return () => {
      el.remove();
      tag = null;
    };
  }, []);
  return <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" />;
}
