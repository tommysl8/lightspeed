import { NoColorSpace, SRGBColorSpace, type Texture, TextureLoader } from 'three';

const loader = new TextureLoader();
const cache = new Map<string, Promise<Texture | null>>();

/** Public asset URL that works both in dev and when deployed under a base path. */
export const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

/**
 * Load a texture once, lazily. Resolves to null on failure, and callers keep their
 * procedural fallback.
 */
export function loadTexture(file: string, opts: { color?: boolean } = {}): Promise<Texture | null> {
  const key = `${file}|${opts.color !== false}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      loader.load(
        assetUrl(`textures/${file}`),
        (t) => {
          t.colorSpace = opts.color === false ? NoColorSpace : SRGBColorSpace;
          t.anisotropy = 8;
          resolve(t);
        },
        undefined,
        () => {
          console.warn(`[lightspeed] texture failed to load, using procedural fallback: ${file}`);
          resolve(null);
        },
      );
    });
    cache.set(key, p);
  }
  return p;
}
