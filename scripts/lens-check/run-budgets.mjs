/**
 * Each part's GPU cost in the standard views, against its budget, in a Chrome of our own: scripts/lens-check/budgets.js
 * run in a fresh page, so that no earlier measurement's targets, programs or slowdown carry over.
 *
 * What: opens the development server's page (default http://localhost:5190/) headless (or in a normal window with
 * --visible) with a fresh profile, the canvas W × H CSS px at pixel ratio 2, waits for the data, imports budgets.js
 * and runs its plan (all the standard views, or --plan far for the checks far from holes and the regression checks,
 * or the views and pieces given), then prints one line an A/B (lensBudgets.report()) and, with --json, every result.
 * With --eval it runs a snippet in the page after the data are in (for a one-off experiment with
 * lensBudgets.shaderVariant) and prints what it returns.
 *
 * How: the DevTools protocol (chrome.mjs); the page's own src/dev/perf.ts does the timing (pinned to pixel ratio 2,
 * no multisampling, lens rung 0 unless --rung). The run is polled, so a long plan outlives any one call.
 *
 * Usage: node scripts/lens-check/run-budgets.mjs [--plan all|far] [--views a,b] [--pieces x,y] [--rounds 3]
 *        [--canvas 1024x660] [--rung 0] [--visible] [--url http://localhost:5190/] [--json out.json] [--eval file.js]
 * Twins: run-perf.mjs (the views' totals), budgets.js (the pieces), src/dev/perf.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { launchChrome, openPage } from './chrome.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const [cw, ch] = option('--canvas', '1024x660').split('x').map(Number);
const rung = Number(option('--rung', '0'));
const url = option('--url', 'http://localhost:5190/');
const plan = option('--plan', 'all');
const views = option('--views', null);
const pieces = option('--pieces', null);
const rounds = Number(option('--rounds', '3'));
const evalFile = option('--eval', null);
const CHROME_H = 108; // the app's header and footer above and below the canvas, CSS px
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = await launchChrome({ headless: !flag('--visible'), width: cw, height: ch + CHROME_H, scale: 2 });
  let out = null;
  try {
    const tab = await openPage(chrome.browser, url, { viewport: { width: cw, height: ch + CHROME_H, scale: 2 } });
    const ready = await tab.waitFor('!!(window.__ls && window.__ls.perf && document.querySelector("canvas"))', 120_000);
    if (!ready) throw new Error(`no window.__ls.perf at ${url}\n${tab.logs.slice(-10).join('\n')}`);
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
      const data = await ls.perf.ready(90000);
      await import('/scripts/lens-check/budgets.js');
      await import('/scripts/lens-check/lens-check.js');
      await window.lensBudgets.loadShaderChunk();
      return data;
    })()`);
    const info = await tab.evaluate('window.__ls.perf.info()');
    console.log(`${info.renderer} · canvas ${info.canvas} at pixel ratio ${info.dpr} · ${flag('--visible') ? 'visible window' : 'headless'} · data ${Object.entries(loaded).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    if (evalFile) {
      const src = readFileSync(evalFile, 'utf8');
      await tab.evaluate(`(() => { window.__qJob = { state: 'running' }; (async () => { ${src} })().then((r) => { window.__qJob = { state: 'done', r }; }, (e) => { window.__qJob = { state: 'error', r: String(e && e.stack || e) }; }); return 1; })()`);
    } else {
      const opts = { rounds };
      if (plan === 'far') opts.plan = '__FAR__';
      if (views) opts.views = views.split(',');
      if (pieces) opts.pieces = pieces.split(',');
      const optsJs = JSON.stringify(opts).replace('"__FAR__"', 'window.lensBudgets.PLAN_FAR');
      await tab.evaluate(`(() => { const o = ${optsJs}; window.__qJob = { state: 'running' }; window.lensBudgets.run(o).then((r) => { window.__qJob = { state: 'done', r }; }, (e) => { window.__qJob = { state: 'error', r: String(e && e.stack || e) }; }); return 1; })()`);
    }
    let shown = 0;
    for (;;) {
      await sleep(3000);
      const s = await tab.evaluate('({ state: window.__qJob.state, n: window.lensBudgets.results.length, report: window.lensBudgets.report() })');
      const lines = s.report ? s.report.split('\n') : [];
      for (; shown < s.n; shown++) console.log('  ' + lines[shown]);
      if (s.state !== 'running') break;
    }
    out = await tab.evaluate('({ job: window.__qJob, results: window.lensBudgets.results, info: window.__ls.perf.info() })');
    if (out.job.state === 'error') console.log(out.job.r);
    if (evalFile) console.log(JSON.stringify(out.job.r, null, 1));
  } finally {
    await chrome.close();
  }
  const json = option('--json', null);
  if (json && out) writeFileSync(json, JSON.stringify({ url, at: new Date().toISOString(), canvasCss: [cw, ch], ...out }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
