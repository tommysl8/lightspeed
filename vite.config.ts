import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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

export default defineConfig({
  plugins: [react(), tailwindcss(), absoluteOgImage()],
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
