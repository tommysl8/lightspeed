/**
 * Data files for tests. The app's TypeScript configuration has no Node types (the code runs in
 * browsers), so tests reach Node's fs through process.getBuiltinModule, as perf.test.ts does.
 * Paths are relative to the repository root ("public/data/moons.json").
 */
interface NodeFs {
  readFileSync(path: URL): Uint8Array;
  existsSync(path: URL): boolean;
  statSync(path: URL): { size: number };
}

const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:fs') as NodeFs;

/** The repository root, as a file URL. */
export const REPO_ROOT = new URL('../../', import.meta.url);

const at = (path: string) => new URL(path, REPO_ROOT);

/** A file's bytes, in a buffer of their own (offset 0, so typed arrays can view it). */
export function readBytes(path: string): Uint8Array {
  const b = fs.readFileSync(at(path));
  return new Uint8Array(b);
}

export const readText = (path: string): string => new TextDecoder().decode(readBytes(path));

export const readJson = <T>(path: string): T => JSON.parse(readText(path)) as T;

export const fileExists = (path: string): boolean => fs.existsSync(at(path));

export const fileSize = (path: string): number => fs.statSync(at(path)).size;
