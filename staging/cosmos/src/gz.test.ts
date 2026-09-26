import { createServer, type Server } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCosmicWeb } from './cosmicWeb.ts';
import { fetchGzipped } from './gz.ts';
import { loadLocalGalaxies } from './localGalaxies.ts';
import { repoFile } from './testFiles.ts';

// Serve public/ the way Vercel does: .gz files as application/gzip, no Content-Encoding. A second
// route sends Content-Encoding: gzip, as some servers do, so fetch() decompresses on its own.
let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '/';
    const encoded = url.startsWith('/encoded/');
    const rel = `public/${url.replace(/^\/(encoded\/)?/, '')}`;
    try {
      const body = repoFile(rel);
      res.writeHead(200, {
        'content-type': 'application/gzip',
        ...(encoded ? { 'content-encoding': 'gzip' } : {}),
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(() => server.close());

describe('loading the shipped .gz files over HTTP', () => {
  it('gunzips with DecompressionStream when the server sends raw gzip', async () => {
    const cw = await loadCosmicWeb(`${base}/data/cosmic-web.bin.gz`);
    expect(cw.count).toBe(55877);
    const lg = await loadLocalGalaxies(`${base}/data/local-galaxies.json.gz`);
    expect(lg.galaxies.length).toBe(169);
  });

  it('also works when the server already applied Content-Encoding: gzip', async () => {
    const bytes = await fetchGzipped(`${base}/encoded/data/cosmic-web.bin.gz`);
    const ref = gunzipSync(repoFile('public/data/cosmic-web.bin.gz'));
    expect(bytes.byteLength).toBe(ref.length);
  });
});
