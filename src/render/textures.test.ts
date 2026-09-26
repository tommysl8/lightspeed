import { describe, expect, it } from 'vitest';
import { RedFormat, Texture } from 'three';
import { TextureCache, textureBytes, textureUrl, type TextureFetch } from './textures';

/** A fake texture of w × h pixels that records whether it was disposed. */
function fakeTexture(w: number, h: number): Texture & { disposed: boolean } {
  const t = new Texture() as Texture & { disposed: boolean };
  t.image = { width: w, height: h };
  t.disposed = false;
  t.dispose = () => {
    t.disposed = true;
  };
  return t;
}

/** A cache with a hand-driven clock and instant loads; sizes by file name ("a:1024x512"). */
function setup(budget: number) {
  let now = 0;
  const made = new Map<string, Texture & { disposed: boolean }>();
  const fetch: TextureFetch = (file, _color, done) => {
    const [w, h] = file.split(':')[1].split('x').map(Number);
    const t = fakeTexture(w, h);
    made.set(file, t);
    done(t);
  };
  const cache = new TextureCache(fetch, budget, 2500, () => now);
  return { cache, made, tick: (ms: number) => (now += ms) };
}

const MB = 1024 * 1024;

describe('the texture cache', () => {
  it('counts RGBA with mipmaps', () => {
    expect(textureBytes(fakeTexture(2048, 1024))).toBe(Math.round(2048 * 1024 * 4 * (4 / 3)));
  });

  it('loads each file once', async () => {
    const { cache, made } = setup(100 * MB);
    const a = await cache.load('a:16x8');
    const b = await cache.load('a:16x8');
    expect(a).toBe(b);
    expect(made.size).toBe(1);
  });

  it('disposes the least recently used textures over budget, never pinned or in-use ones', async () => {
    // Each 1024 × 512 map is 2.67 MiB; the budget holds three.
    const { cache, made, tick } = setup(8.5 * MB);
    cache.setPinned(['sun:1024x512']);
    await cache.load('sun:1024x512');
    tick(10_000);
    await cache.load('old:1024x512');
    tick(10_000);
    await cache.load('mid:1024x512');
    tick(10_000);
    // A fourth: over budget. 'old' is the least recently used that is neither pinned nor in use.
    await cache.load('new:1024x512');
    expect(made.get('old:1024x512')!.disposed).toBe(true);
    expect(made.get('sun:1024x512')!.disposed).toBe(false);
    expect(cache.has('old:1024x512')).toBe(false);
    expect(cache.has('mid:1024x512')).toBe(true);
    expect(cache.memory().count).toBe(3);
    expect(cache.memory().bytes).toBeLessThanOrEqual(8.5 * MB);
  });

  it('keeps textures touched in the last moments even over budget', async () => {
    const { cache, made, tick } = setup(3 * MB);
    await cache.load('a:1024x512');
    tick(10_000);
    cache.touch('a:1024x512');
    await cache.load('b:1024x512'); // over budget, but 'a' is in use
    expect(made.get('a:1024x512')!.disposed).toBe(false);
    tick(3000); // no longer in use
    await cache.load('c:1024x512');
    expect(made.get('a:1024x512')!.disposed).toBe(true);
  });

  it('reloads a disposed texture when asked again', async () => {
    const { cache, made, tick } = setup(3 * MB);
    const first = await cache.load('a:1024x512');
    tick(10_000);
    await cache.load('b:1024x512');
    expect(made.get('a:1024x512')!.disposed).toBe(true);
    const again = await cache.load('a:1024x512');
    expect(again).not.toBe(first);
  });

  it('never disposes a held texture, however long since it was last used (frames stopped)', async () => {
    const { cache, made, tick } = setup(3 * MB);
    await cache.acquire('a:1024x512');
    tick(60_000); // a reading page open for a minute: no frames, no touches
    await cache.load('b:1024x512'); // over budget
    expect(made.get('a:1024x512')!.disposed).toBe(false);
    expect(cache.holders('a:1024x512')).toBe(1);
    // Released (its mesh unmounted): it may go once it is no longer in use.
    cache.release('a:1024x512');
    tick(10_000);
    await cache.load('c:1024x512');
    expect(made.get('a:1024x512')!.disposed).toBe(true);
  });

  it('counts holders: a texture shown by two meshes stays until both let go', async () => {
    const { cache, made, tick } = setup(3 * MB);
    await cache.acquire('ring:1024x512');
    await cache.acquire('ring:1024x512');
    cache.release('ring:1024x512');
    tick(10_000);
    await cache.load('x:1024x512');
    expect(made.get('ring:1024x512')!.disposed).toBe(false);
    cache.release('ring:1024x512');
    cache.release('ring:1024x512'); // one too many: harmless
    expect(cache.holders('ring:1024x512')).toBe(0);
    tick(10_000);
    await cache.load('y:1024x512');
    expect(made.get('ring:1024x512')!.disposed).toBe(true);
  });

  it('keeps greyscale maps apart and counts them at one byte a texel', async () => {
    const seen: [string, boolean][] = [];
    const cache = new TextureCache((file, _color, done, grey) => {
      seen.push([file, !!grey]);
      const t = fakeTexture(2048, 1024);
      if (grey) t.format = RedFormat;
      done(t);
    });
    await cache.load('titan.jpg', true, true);
    await cache.load('titan.jpg', true, false);
    expect(seen).toEqual([
      ['titan.jpg', true],
      ['titan.jpg', false],
    ]);
    expect(cache.memory().bytes).toBe(Math.round(2048 * 1024 * (4 / 3)) + Math.round(2048 * 1024 * 4 * (4 / 3)));
  });

  it('resolves texture paths: a bare name in textures/, a path from public/', () => {
    expect(textureUrl('2k_mars.jpg')).toBe(`${import.meta.env.BASE_URL}textures/2k_mars.jpg`);
    expect(textureUrl('textures/io.jpg')).toBe(`${import.meta.env.BASE_URL}textures/io.jpg`);
  });
});
