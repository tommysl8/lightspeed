import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildIndex } from './src/content/learn/catalogue.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Short commit hash of the build, shown on the About page (Vercel sets the env variable). */
function buildSha(): string {
  const env = process.env.VERCEL_GIT_COMMIT_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

/**
 * Link previews need an absolute image URL. On Vercel the production host is known at build
 * time, so the relative og:image in index.html is made absolute there.
 */
function absoluteOgImage(): Plugin {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return {
    name: 'absolute-og-image',
    transformIndexHtml: (html) => (host ? html.replaceAll('content="/og-image.png"', 'content="https://' + host + '/og-image.png"') : html),
  };
}

/**
 * The Learn index as a virtual module ('virtual:learn-index'): the front matter, section
 * titles and word count of every article in src/content/learn/articles/, so the hub lists
 * them without loading any. Files that do not parse yet (half-written, malformed) are left
 * out with a warning instead of failing the build. In development the index is rebuilt and
 * hot-updated whenever an article is added, changed or removed.
 */
function learnIndex(): Plugin {
  const VIRTUAL = 'virtual:learn-index';
  const RESOLVED = '\0' + VIRTUAL;
  const dir = fileURLToPath(new URL('./src/content/learn/articles/', import.meta.url));
  const norm = (p: string) => p.replaceAll('\\', '/');
  const isArticle = (file: string) => norm(file).startsWith(norm(dir)) && file.endsWith('.md');
  let dev = false;
  return {
    name: 'learn-index',
    configResolved(config) {
      dev = config.command === 'serve';
    },
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return;
      let names: string[] = [];
      try {
        names = readdirSync(dir).filter((f) => f.endsWith('.md'));
      } catch {
        /* no articles yet */
      }
      const files: { file: string; source: string }[] = [];
      for (const file of names) {
        const path = join(dir, file);
        this.addWatchFile(path);
        try {
          files.push({ file, source: readFileSync(path, 'utf8') });
        } catch {
          /* removed while reading */
        }
      }
      const { articles, warnings } = buildIndex(files);
      for (const w of warnings) this.warn(`learn: ${w}`);
      return `export const ARTICLES = ${JSON.stringify(articles)};\nexport const WARNINGS = ${JSON.stringify(dev ? warnings : [])};\n`;
    },
    configureServer(server) {
      const env = server.environments.client;
      const update = (file: string) => {
        if (!isArticle(file)) return;
        const mod = env.moduleGraph.getModuleById(RESOLVED);
        if (mod) void env.reloadModule(mod);
        server.config.logger.info(`learn: ${basename(file)} changed, index updated`, { timestamp: true });
      };
      server.watcher.on('add', update).on('change', update).on('unlink', update);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), absoluteOgImage(), learnIndex()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(buildSha()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
  },
});
