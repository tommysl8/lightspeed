/**
 * The Learn article to read about a body, where one tells its story. Only the pairs that make
 * sense: a body that is merely mentioned in passing gets no "Read" button. Each body's record
 * names its article (sim/bodies); kinds with an article of their own fall back to it.
 */
import { bodyRecords, childrenOf, getBody, type BodyId, type BodyKind } from '../sim/bodies';

/** Articles for whole kinds of body, for records that do not name one. */
const KIND_ARTICLES: Partial<Record<BodyKind, string>> = {
  moon: 'worlds-around-worlds',
  exoplanet: 'other-worlds',
};

/** The article named by each registered body's record. */
export const BODY_ARTICLES: Readonly<Record<BodyId, string>> = new Proxy({} as Record<BodyId, string>, {
  get: (_, id) => (typeof id === 'string' ? getBody(id)?.article : undefined),
  has: (_, id) => typeof id === 'string' && !!getBody(id)?.article,
  ownKeys: () => bodyRecords().filter((r) => r.article).map((r) => r.id),
  getOwnPropertyDescriptor: (_, id) => {
    const v = typeof id === 'string' ? getBody(id)?.article : undefined;
    return v ? { value: v, enumerable: true, configurable: true, writable: false } : undefined;
  },
});

/**
 * The article slug for a body (every moon: the article on moons; any star with known planets:
 * the article on planets of other stars), or undefined.
 */
export function articleForBody(id: BodyId): string | undefined {
  const r = getBody(id);
  if (!r) return undefined;
  if (r.article ?? KIND_ARTICLES[r.kind]) return r.article ?? KIND_ARTICLES[r.kind];
  if (r.kind === 'star' && childrenOf(id).some((c) => c.kind === 'exoplanet')) return KIND_ARTICLES.exoplanet;
  return undefined;
}
