import { BODIES, type BodyId } from '../physics/constants';

/** Distance from a body's centre at which it is nicely framed (also the travel standoff). */
export function framingDistance(id: BodyId): number {
  const b = BODIES[id];
  const r = b.equatorialRadiusKm ?? b.radiusKm;
  if (id === 'voyager1') return 0.03;
  if (id === 'saturn') return r * 9;
  if (id === 'sun' || id === 'proxima') return r * 5;
  return r * 4;
}

/** Closest the orbit camera may get to a body's centre. */
export function minDistance(id: BodyId): number {
  if (id === 'voyager1') return 0.004;
  const b = BODIES[id];
  return (b.equatorialRadiusKm ?? b.radiusKm) * 1.015;
}
