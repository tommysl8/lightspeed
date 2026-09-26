/**
 * Textures, loaded lazily and kept in a least-recently-used cache with a memory budget.
 *
 * Bodies load their maps only once they are a few pixels wide and hold them (acquire) while
 * their mesh is mounted. When the textures held exceed the budget, the least recently used
 * ones that nobody holds, that are not pinned and that were not used in the last couple of
 * seconds are disposed. Holding is counted, not timed, so a texture in use is never disposed,
 * even while frames are stopped (a reading page open, a hidden tab). The Sun, Earth and the
 * system in focus stay pinned (Bodies.tsx says which). A disposed texture is simply loaded again
 * next time (the browser's cache makes that quick).
 *
 * In the browser, images are decoded off the main thread (createImageBitmap) and uploaded to
 * the GPU one per frame (pumpTextureUploads), so a zoom that brings five maps in does not stall
 * a frame for each. A greyscale map (mapChannels 1) is uploaded as a single channel.
 */
import {
  ImageBitmapLoader,
  NoColorSpace,
  RedFormat,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type WebGLRenderer,
} from 'three';

/** Public asset URL that works both in dev and when deployed under a base path. */
export const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

/** URL of a texture: a file in public/textures/, or a path from public/ when it contains a slash. */
export const textureUrl = (file: string): string => assetUrl(file.includes('/') ? file : `textures/${file}`);

/**
 * Loads one texture and calls back with it, or with null on failure. `grey`: a greyscale map,
 * to be kept as one channel.
 */
export type TextureFetch = (file: string, color: boolean, done: (t: Texture | null) => void, grey?: boolean) => void;

interface CacheEntry {
  key: string;
  file: string;
  promise: Promise<Texture | null>;
  texture: Texture | null;
  /** Estimated GPU memory, bytes. */
  bytes: number;
  /** Clock time when last used, ms. */
  used: number;
  /** Holders (meshes that show it): never disposed while any. */
  refs: number;
}

/** Estimated GPU memory of a texture: 4 bytes a texel (1 for a single channel), plus a third for the mipmaps. */
export function textureBytes(t: Texture): number {
  const img = t.image as { width?: number; height?: number } | undefined;
  const perTexel = t.format === RedFormat ? 1 : 4;
  return Math.round((img?.width ?? 0) * (img?.height ?? 0) * perTexel * (4 / 3));
}

/** Default budget of estimated texture memory; less on an integrated GPU (see quality.ts). */
export const TEXTURE_BUDGET_BYTES = 256 * 1024 * 1024;
export const TEXTURE_BUDGET_INTEGRATED_BYTES = 160 * 1024 * 1024;

export class TextureCache {
  private readonly entries = new Map<string, CacheEntry>();
  private pinned = new Set<string>();
  private total = 0;

  constructor(
    private readonly fetch: TextureFetch,
    /** Budget of estimated texture memory, bytes. */
    public budget = TEXTURE_BUDGET_BYTES,
    /** A texture used this recently counts as in use and is not evicted, ms. */
    private readonly inUseMs = 2500,
    private readonly clock: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  ) {}

  private key = (file: string, color: boolean, grey: boolean) => (grey ? `${file}|${color}|1` : `${file}|${color}`);

  private entry(file: string, color: boolean, grey: boolean): CacheEntry {
    const key = this.key(file, color, grey);
    let e = this.entries.get(key);
    if (!e) {
      const entry: CacheEntry = { key, file, promise: null as unknown as Promise<Texture | null>, texture: null, bytes: 0, used: this.clock(), refs: 0 };
      // In the map before fetching: a fetch may answer at once (from a cache).
      this.entries.set(key, entry);
      entry.promise = new Promise((resolve) => {
        this.fetch(
          file,
          color,
          (t) => {
            if (t && this.entries.get(key) === entry) {
              entry.texture = t;
              entry.bytes = textureBytes(t);
              this.total += entry.bytes;
              this.evict();
            }
            resolve(t);
          },
          grey,
        );
      });
      e = entry;
    }
    e.used = this.clock();
    return e;
  }

  /** Load once; later calls return the same promise. Loading counts as a use (it does not hold it). */
  load(file: string, color = true, grey = false): Promise<Texture | null> {
    return this.entry(file, color, grey).promise;
  }

  /** Load and hold: the texture is not disposed until every acquire has been released. */
  acquire(file: string, color = true, grey = false): Promise<Texture | null> {
    const e = this.entry(file, color, grey);
    e.refs++;
    return e.promise;
  }

  /** Stop holding a texture (it becomes the most recently used of those free to go). */
  release(file: string, color = true, grey = false): void {
    const e = this.entries.get(this.key(file, color, grey));
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    e.used = this.clock();
    if (e.refs === 0) this.evict();
  }

  /** Mark a texture as used now. */
  touch(file: string, color = true, grey = false): void {
    const e = this.entries.get(this.key(file, color, grey));
    if (e) e.used = this.clock();
  }

  /** Files kept whatever the budget. */
  setPinned(files: Iterable<string>): void {
    this.pinned = new Set(files);
  }

  isPinned(file: string): boolean {
    return this.pinned.has(file);
  }

  has(file: string, color = true, grey = false): boolean {
    return !!this.entries.get(this.key(file, color, grey))?.texture;
  }

  /** How many holders a texture has. */
  holders(file: string, color = true, grey = false): number {
    return this.entries.get(this.key(file, color, grey))?.refs ?? 0;
  }

  /** Estimated bytes held, textures loaded. */
  memory(): { bytes: number; count: number; budget: number } {
    let count = 0;
    for (const e of this.entries.values()) if (e.texture) count++;
    return { bytes: this.total, count, budget: this.budget };
  }

  /** Dispose least recently used textures that are held by nobody, not pinned and not in use, until under budget. */
  evict(): void {
    if (this.total <= this.budget) return;
    const at = this.clock();
    const victims = [...this.entries.values()]
      .filter((e) => e.texture && e.refs === 0 && !this.pinned.has(e.file) && at - e.used > this.inUseMs)
      .sort((a, b) => a.used - b.used);
    for (const e of victims) {
      if (this.total <= this.budget) break;
      const t = e.texture!;
      t.dispose();
      // An ImageBitmap holds its decoded pixels until closed.
      (t.image as { close?: () => void } | null)?.close?.();
      this.entries.delete(e.key);
      this.total -= e.bytes;
    }
  }
}

// ─── Loading in the browser ──────────────────────────────────────────────────────────────

/**
 * createImageBitmap decodes off the main thread. Safari's and older Firefox's ignore the
 * options this needs (the same test as three.js's GLTFLoader), so they keep TextureLoader.
 */
function bitmapsWork(): boolean {
  if (typeof createImageBitmap === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/^((?!chrome|android).)*safari/i.test(ua)) return false;
  const ff = ua.match(/Firefox\/(\d+)/);
  return !ff || Number(ff[1]) >= 98;
}

let bitmapLoader: ImageBitmapLoader | null | undefined;
let imageLoader: TextureLoader | null = null;

function makeBitmapLoader(): ImageBitmapLoader | null {
  if (bitmapLoader === undefined) {
    // Flipped as TextureLoader's images are (flipY does not apply to bitmaps), and straight
    // alpha (the ring strip's). three.js asks for no colour-space conversion itself.
    bitmapLoader = bitmapsWork() ? new ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' }) : null;
  }
  return bitmapLoader;
}

/** Textures decoded and waiting for their GPU upload (pumpTextureUploads), oldest first. */
const uploads: { texture: Texture; done: (t: Texture | null) => void }[] = [];

/**
 * Upload the next waiting texture (called once per frame by the scene). Uploading a 2k map
 * takes a few milliseconds even from a decoded bitmap; one per frame keeps frames smooth.
 */
export function pumpTextureUploads(renderer: WebGLRenderer): void {
  const job = uploads.shift();
  if (!job) return;
  renderer.initTexture(job.texture);
  job.done(job.texture);
}

function configure(t: Texture, color: boolean, grey: boolean): Texture {
  // A greyscale map keeps one channel; three.js has no sRGB single-channel format, so the
  // shader decodes it (uMapGrey).
  t.colorSpace = color && !grey ? SRGBColorSpace : NoColorSpace;
  if (grey) {
    t.format = RedFormat;
    t.internalFormat = 'R8';
  }
  t.anisotropy = 8;
  return t;
}

const fetchTexture: TextureFetch = (file, color, done, grey = false) => {
  const fail = () => {
    console.warn(`[lightspeed] texture failed to load, using procedural fallback: ${file}`);
    done(null);
  };
  const bl = makeBitmapLoader();
  if (bl) {
    bl.load(
      textureUrl(file),
      (bitmap) => {
        const t = configure(new Texture(bitmap), color, grey);
        t.flipY = false; // already flipped by createImageBitmap
        t.needsUpdate = true;
        uploads.push({ texture: t, done });
      },
      undefined,
      fail,
    );
    return;
  }
  imageLoader ??= new TextureLoader();
  imageLoader.load(textureUrl(file), (t) => uploads.push({ texture: configure(t, color, grey), done }), undefined, fail);
};

/** The app's texture cache. */
export const textures = new TextureCache(fetchTexture);

export interface TextureOptions {
  /** Colour data (sRGB); false for data maps (clouds). Default true. */
  color?: boolean;
  /** A single-channel greyscale map. */
  grey?: boolean;
}

/**
 * Load a texture once, lazily. Resolves to null on failure, and callers keep their procedural
 * fallback.
 */
export const loadTexture = (file: string, opts: TextureOptions = {}): Promise<Texture | null> =>
  textures.load(file, opts.color !== false, !!opts.grey);

/** Load a texture and hold it until releaseTexture (a mounted mesh showing it). */
export const acquireTexture = (file: string, opts: TextureOptions = {}): Promise<Texture | null> =>
  textures.acquire(file, opts.color !== false, !!opts.grey);

/** Stop holding a texture (the mesh that showed it has unmounted). */
export const releaseTexture = (file: string, opts: TextureOptions = {}): void => textures.release(file, opts.color !== false, !!opts.grey);

/** Mark a texture as used now. */
export const touchTexture = (file: string, opts: TextureOptions = {}): void => textures.touch(file, opts.color !== false, !!opts.grey);

/** The files that must stay loaded whatever the budget (the Sun, Earth, the system in focus). */
export const setPinnedTextures = (files: Iterable<string>): void => textures.setPinned(files);
