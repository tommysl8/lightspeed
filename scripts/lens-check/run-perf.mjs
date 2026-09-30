/**
 * Whole-frame GPU timings of the standard views (src/dev/perf.ts, perf.view) in a Chrome of our own, outside the
 * desktop app's embedded pane, for figures from a normal Chrome and at the panel's full 2,560 × 1,600.
 *
 * What: opens the development server's page (default http://localhost:5190/) in Chrome with a fresh profile,
 * sized so the canvas is W × H CSS px at pixel ratio 2 (the app's header and footer take 108 CSS px), then for
 * each view runs window.__ls.perf: view(name) (placed, then 150 frames of warm-up), measure(20, 8) `--repeat`
 * times and passes(20), and prints one line a view (best and median of batch medians, the passes) and, with
 * --json, every result with its conditions.
 *
 * How: the DevTools protocol (scripts/lens-check/chrome.mjs); src/dev/perf.ts does the measuring, pinned to
 * pixel ratio 2, no multisampling, lens rung 0 unless --rung, with the page's own frames held while it measures.
 *
 * Usage: node scripts/lens-check/run-perf.mjs [--views framing,500au,...] [--canvas 1024x660] [--repeat 2]
 *        [--rung 0] [--visible] [--url http://localhost:5190/] [--json out.json]
 * --visible opens a normal window on the desktop instead of a headless one. Takes about 15 s a view.
 * Twins: none (src/dev/perf.ts is the in-page half).
 */
import { writeFileSync } from 'node:fs';
import { launchChrome, openPage } from './chrome.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const DEFAULT_VIEWS = ['earth', 'framing', '500au', '100M', 'gc-orbits', 'arriving', 'arriving-split', 'free-500au', 'flight-start-split', 'gaia-bh1-companion', 'm87-1000au'];
const views = option('--views', DEFAULT_VIEWS.join(',')).split(',').filter(Boolean);
const [cw, ch] = option('--canvas', '1024x660').split('x').map(Number);
const repeat = Number(option('--repeat', '2'));
const rung = Number(option('--rung', '0'));
const url = option('--url', 'http://localhost:5190/');
const CHROME_H = 108; // the app's header and footer above and below the canvas, CSS px

async function main() {
  const chrome = await launchChrome({ headless: !flag('--visible'), width: cw, height: ch + CHROME_H, scale: 2 });
  const out = { url, at: new Date().toISOString(), canvasCss: [cw, ch], views: {} };
  try {
    const tab = await openPage(chrome.browser, url, { viewport: { width: cw, height: ch + CHROME_H, scale: 2 } });
    const ready = await tab.waitFor('!!(window.__ls && window.__ls.perf && document.querySelector("canvas"))', 120_000);
    if (!ready) throw new Error(`no window.__ls.perf at ${url}: is the development server running?\n${tab.logs.slice(-10).join('\n')}`);
    // Close the welcome screen and wait for the first frames to place the camera at Earth.
    const loaded = await tab.evaluate(`(async () => {
      const ls = window.__ls;
      ls.ui.setState({ welcomeOpen: false });
      for (let k = 0; k < 600; k++) {
        ls.step(1);
        const p = ls.sim.camera.pos;
        if (p.x || p.y || p.z) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      ls.perf.pin(${rung});
      // The stars, the Galaxy and the galaxies load in the background: measure only once they are in.
      return ls.perf.ready(90000);
    })()`);
    out.info = await tab.evaluate('window.__ls.perf.info()');
    out.loaded = loaded;
    console.log(`${out.info.renderer} · canvas ${out.info.canvas} at pixel ratio ${out.info.dpr} · ${flag('--visible') ? 'visible window' : 'headless'} · data ${Object.entries(loaded).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    for (const v of views) {
      const t0 = Date.now();
      try {
        const r = await tab.evaluate(`(async () => {
          const p = window.__ls.perf;
          await p.view(${JSON.stringify(v)});
          const m = [];
          for (let i = 0; i < ${repeat}; i++) m.push(await p.measure(20, 8));
          const passes = await p.passes(20);
          return { m, passes, info: p.info() };
        })()`);
        out.views[v] = r;
        const best = r.m.map((x) => x.gpu.toFixed(2)).join(', ');
        const med = r.m.map((x) => x.gpuMed.toFixed(2)).join(', ');
        const ps = Object.entries(r.passes)
          .filter(([k]) => k !== 'total' && k !== 'frame')
          .map(([k, x]) => `${k} ${x.toFixed(2)}`)
          .join(', ');
        console.log(`  ${v.padEnd(20)} best ${best} · median ${med} · ${ps} · cpu ${r.m.map((x) => x.cpuMed.toFixed(1)).join(', ')} · ${r.m[0].w}×${r.m[0].h} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      } catch (e) {
        out.views[v] = { error: String(e.message ?? e) };
        console.log(`  ${v.padEnd(20)} ${String(e.message ?? e).split('\n')[0]}`);
      }
    }
  } finally {
    await chrome.close();
  }
  const json = option('--json', null);
  if (json) writeFileSync(json, JSON.stringify(out, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
