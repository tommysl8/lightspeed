// Fetch a .gz data file and return its decompressed bytes.
//
// The files are shipped pre-gzipped because Vercel does not compress application/octet-stream.
// Browsers only decompress transparently when the server sends Content-Encoding: gzip, which Vercel
// does not do for .gz files; some dev servers or CDNs might. So look at the magic bytes and only
// run DecompressionStream('gzip') when the body is still gzip.

export async function fetchGzipped(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (head[0] !== 0x1f || head[1] !== 0x8b) return bytes; // already decompressed on the way
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function fetchGzippedJson<T>(url: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await fetchGzipped(url))) as T;
}
