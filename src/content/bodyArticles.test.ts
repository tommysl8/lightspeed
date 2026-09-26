import { describe, expect, it } from 'vitest';
import { BODIES } from '../physics/constants';
import { articleForBody, BODY_ARTICLES } from './bodyArticles';

describe('articleForBody', () => {
  it('maps only real bodies to article slugs', () => {
    for (const [id, slug] of Object.entries(BODY_ARTICLES)) {
      expect(Object.hasOwn(BODIES, id)).toBe(true);
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('sends moons to the article on moons, and has nothing for Earth', () => {
    expect(articleForBody('moon')).toBe('worlds-around-worlds');
    expect(articleForBody('saturn')).toBe('worlds-around-worlds');
    expect(articleForBody('pluto')).toBe('edges-of-the-solar-system');
    expect(articleForBody('earth')).toBeUndefined();
  });
});
