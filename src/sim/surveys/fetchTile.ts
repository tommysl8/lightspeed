/**
 * Fetching one of the surveys' files (the worker, or the main thread where there are no workers): the file inflated
 * when it is gzip (the tiles are served as they are: Vercel does not compress them), with the bytes the download took.
 */
export async function fetchTile(url: string): Promise<{ buffer: ArrayBuffer; bytes: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const raw = await res.arrayBuffer();
  const b = new Uint8Array(raw, 0, Math.min(2, raw.byteLength));
  if (b.length < 2 || b[0] !== 0x1f || b[1] !== 0x8b) return { buffer: raw, bytes: raw.byteLength };
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
  return { buffer: await new Response(stream).arrayBuffer(), bytes: raw.byteLength };
}
