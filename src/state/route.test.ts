import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashOf, parseHash, type DocRoute } from './route';

describe('reading-page routes', () => {
  it('read the guide and About, with and without a section', () => {
    expect(parseHash('#/guide')).toEqual({ page: 'guide', section: undefined });
    expect(parseHash('#/guide/flying')).toEqual({ page: 'guide', section: 'flying' });
    expect(parseHash('#/about/')).toEqual({ page: 'about', section: undefined });
  });

  it('keep the old #/manual links opening the guide', () => {
    expect(parseHash('#/manual')).toEqual({ page: 'guide', section: undefined });
    expect(parseHash('#/manual/lab')).toEqual({ page: 'guide', section: 'lab' });
  });

  it('read Learn: the hub, an article, and an article at a section', () => {
    expect(parseHash('#/learn')).toEqual({ page: 'learn', article: undefined, section: undefined });
    expect(parseHash('#/learn/')).toEqual({ page: 'learn', article: undefined, section: undefined });
    expect(parseHash('#/learn/light-takes-time')).toEqual({ page: 'learn', article: 'light-takes-time', section: undefined });
    expect(parseHash('#/learn/light-takes-time/living-with-the-delay')).toEqual({
      page: 'learn',
      article: 'light-takes-time',
      section: 'living-with-the-delay',
    });
  });

  it('are not anything else', () => {
    for (const h of ['', '#', '#/', '#/learning', '#/learn/a/b/c', '#/guide/a/b', '#/learn/bad slug', '#doc-fn-1', '#/settings']) {
      expect(parseHash(h)).toBeNull();
    }
  });

  it('write back to the hash they came from', () => {
    const routes: DocRoute[] = [
      { page: 'guide' },
      { page: 'guide', section: 'time' },
      { page: 'about' },
      { page: 'learn' },
      { page: 'learn', article: 'time-dilation' },
      { page: 'learn', article: 'time-dilation', section: 'one-number' },
    ];
    for (const r of routes) expect(parseHash(hashOf(r))).toEqual({ ...r, section: r.section, ...(r.page === 'learn' ? { article: r.article } : {}) });
    expect(hashOf({ page: 'learn', section: 'ignored-without-article' })).toBe('#/learn');
  });
});

describe('moving within a reading page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** A route module over a minimal browser: an address and a history. */
  async function withBrowser() {
    vi.resetModules();
    const location = { hash: '', pathname: '/', search: '' };
    const history = {
      state: null as unknown,
      pushState(state: unknown, _t: string, url: string) {
        this.state = state;
        location.hash = url;
      },
      replaceState(state: unknown, _t: string, url: string) {
        this.state = state;
        location.hash = url.startsWith('#') ? url : '';
      },
      go() {},
    };
    vi.stubGlobal('window', { location, history, addEventListener() {} });
    return { location, route: await import('./route') };
  }

  it('records the section read in the address and in the open route, without a new route', async () => {
    const { location, route } = await withBrowser();
    route.openLearn('light-takes-time', 'the-first-measurement');
    const opened = route.docRoute();
    route.replaceDocSection('living-with-the-delay');
    expect(route.docRoute()).toBe(opened);
    expect(opened?.section).toBe('living-with-the-delay');
    expect(location.hash).toBe('#/learn/light-takes-time/living-with-the-delay');
  });

  it('gives every link a new route, so a link back to the section named still moves the reader', async () => {
    const { route } = await withBrowser();
    route.openLearn('light-takes-time', 'the-first-measurement');
    const opened = route.docRoute();
    route.openLearn('light-takes-time', 'the-first-measurement');
    expect(route.docRoute()).not.toBe(opened);
    expect(route.docRoute()?.section).toBe('the-first-measurement');
  });
});
