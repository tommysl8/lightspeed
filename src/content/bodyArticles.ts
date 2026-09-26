/**
 * The Learn article to read about a body, where one tells its story. Only the pairs that make
 * sense: a body that is merely mentioned in passing gets no "Read" button.
 */
import { BODIES, type BodyId } from '../physics/constants';

export const BODY_ARTICLES: Partial<Record<BodyId, string>> = {
  sun: 'what-stars-are-made-of',
  // Le Verrier found Neptune from its pull on Uranus; Mercury's perihelion was the first crack in Newton.
  mercury: 'clockwork-and-chaos',
  neptune: 'clockwork-and-chaos',
  jupiter: 'worlds-around-worlds',
  saturn: 'worlds-around-worlds',
  pluto: 'edges-of-the-solar-system',
  voyager1: 'edges-of-the-solar-system',
  proxima: 'how-far-are-the-stars',
};

/** The article slug for a body (every moon: the article on moons), or undefined. */
export function articleForBody(id: BodyId): string | undefined {
  return BODY_ARTICLES[id] ?? (BODIES[id].kind === 'moon' ? 'worlds-around-worlds' : undefined);
}
