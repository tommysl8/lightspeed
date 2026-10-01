/**
 * The bodies near the camera that the draw's budget left out (lod.ts planDraw). With the camera inside a section's
 * shell (in the main belt, at Ceres) the section's bound says nothing, and a faint body passing close can be bright;
 * so the sections drawn only in part are searched body by body, in float64 and off the main thread (nearWorker.ts),
 * for any that could be brighter than the layer's limit while the camera and the body each move by up to
 * `marginAu`; the layer draws those as well (scene/Asteroids.tsx), and asks again before either has moved that far.
 * Cost: about 0.1 µs a body, in the worker, about once a second while it matters.
 */
import { BARY_MU, conicPosition, ellipticPosition } from './conic.ts';
import { FRAME_BARY, GROUPS, SHAPE_ELLIPSE, unquantH, unquantM1, unquantU16, type Section } from './format.ts';

export interface NearQuery {
  /** Days after the reference epoch. */
  days: number;
  /** The camera, au from the Sun, J2000 ecliptic. */
  cam: { x: number; y: number; z: number };
  /** The barycentre from the Sun at `days`, au (for the sections about it). */
  ssb: { x: number; y: number; z: number };
  /** Bodies that could be brighter than this are wanted. */
  limit: number;
  /** How far the camera, and each body, may move before the answer is asked again, au. */
  marginAu: number;
  /** Each section's first body not drawn: bodies from it on are searched. Sections not listed are not. */
  from: Map<number, number>;
  /** At most this many bodies, the brightest-bounded first. */
  cap: number;
}

/**
 * The left-out bodies of each section that could be brighter than `limit`: index lists, ascending. A body r from the
 * Sun and Δ from the camera is never brighter than H + 5 log10(q (Δ − 2 margin)) once both have moved by the margin
 * (its perihelion q ≤ r, and the phase only dims), so those whose bound is within the limit are kept. Comets are
 * always drawn whole and not searched. Past `cap` the brightest-bounded are kept, and `limit` is lowered to the bound of the
 * first left out: every searched body that could be brighter than it is among the picks.
 */
export function nearSelect(sections: Iterable<Section>, q: NearQuery): { picks: Map<number, Uint32Array>; limit: number } {
  const found: { s: number; k: number; b: number }[] = [];
  const p = { x: 0, y: 0, z: 0 };
  const d = Math.hypot(q.cam.x, q.cam.y, q.cam.z);
  for (const s of sections) {
    const from = q.from.get(s.id);
    if (from === undefined || from >= s.count || GROUPS[s.group] === 'comet') continue;
    const mu = s.frame === FRAME_BARY ? BARY_MU : 1;
    const ox = s.frame === FRAME_BARY ? q.ssb.x : 0;
    const oy = s.frame === FRAME_BARY ? q.ssb.y : 0;
    const oz = s.frame === FRAME_BARY ? q.ssb.z : 0;
    for (let k = from; k < s.count; k++) {
      let per: number;
      let far: number;
      let H: number;
      if (s.shape === SHAPE_ELLIPSE) {
        const e = unquantU16(s.cols.e[k]);
        per = s.cols.a[k] * (1 - e);
        far = s.cols.a[k] * (1 + e);
        H = unquantH(s.cols.H[k], s.hMin, s.hMax);
      } else {
        // An asteroid on an open orbit: its H is kept as M1 (with K1 = 5).
        per = s.cols.q[k];
        far = Infinity;
        H = unquantM1(s.cols.M1[k]);
        if (Number.isNaN(H)) H = 15;
      }
      // A cheap test first: the camera's distance from the Sun against the orbit's span, at the farthest it could
      // reach the limit from.
      const reach = Math.pow(10, (q.limit - H) / 5) / Math.max(per, 1e-3) + 2 * q.marginAu + 0.02;
      if (d + reach < per || d - reach > far) continue;
      const angles = { i: unquantU16(s.cols.i[k]) * Math.PI, node: unquantU16(s.cols.node[k]) * 2 * Math.PI, peri: unquantU16(s.cols.peri[k]) * 2 * Math.PI };
      if (s.shape === SHAPE_ELLIPSE) ellipticPosition({ a: s.cols.a[k], e: unquantU16(s.cols.e[k]), M0: unquantU16(s.cols.M[k]) * 2 * Math.PI, mu, ...angles }, q.days, p);
      else conicPosition({ q: s.cols.q[k], e: s.cols.e[k], tp: s.cols.tp[k], mu, ...angles }, q.days, p);
      const delta = Math.hypot(p.x + ox - q.cam.x, p.y + oy - q.cam.y, p.z + oz - q.cam.z);
      const b = H + 5 * Math.log10(per * Math.max(delta - 2 * q.marginAu, 1e-9));
      if (b <= q.limit) found.push({ s: s.id, k, b });
    }
  }
  found.sort((x, y) => x.b - y.b);
  const by = new Map<number, number[]>();
  for (const f of found.slice(0, q.cap)) {
    let l = by.get(f.s);
    if (!l) by.set(f.s, (l = []));
    l.push(f.k);
  }
  const picks = new Map<number, Uint32Array>();
  for (const [s, l] of by) picks.set(s, Uint32Array.from(l.sort((x, y) => x - y)));
  return { picks, limit: found.length > q.cap ? found[q.cap].b : q.limit };
}
