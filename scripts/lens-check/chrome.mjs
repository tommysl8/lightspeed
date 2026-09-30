/**
 * A Chrome of our own for the GPU checks: launched with a fresh profile (so its compiled-program cache is
 * empty), driven over the DevTools protocol with Node's own WebSocket (no dependencies), and closed after.
 *
 * What: `launchChrome()` starts Chrome (headless by default; `headless: false` opens a normal window), reads the
 * port it chose from the profile's DevToolsActivePort file and connects; `openPage()` opens a tab and returns
 * `evaluate()` (an expression, awaited, its value returned as JSON) and `close()`.
 *
 * Why: the shader compile check (scripts/check-shaders.mjs) needs a real browser on the real GPU (ANGLE D3D11
 * on the target laptop) with nothing cached, and the performance baselines want a browser outside the
 * desktop app's embedded pane. It never touches the user's own Chrome profile.
 *
 * Cost: about a second to start. Twins: none (scripts/check-shaders.mjs and scripts/lens-check/run-perf.mjs use it).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Chrome's executable: $CHROME, or the usual places on Windows, macOS and Linux. */
export function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found: set CHROME to its executable');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A DevTools-protocol connection: send(method, params, sessionId) and event listeners. */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error(`cannot connect to ${url}`));
  });
  let next = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}${msg.error.data ? ': ' + msg.error.data : ''}`));
      else resolve(msg.result);
    } else for (const l of listeners) l(msg);
  };
  return {
    send(method, params = {}, sessionId) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      });
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      ws.close();
    },
  };
}

/**
 * Start Chrome with a fresh profile. Options: headless (true), width and height of the window in CSS px,
 * scale (the device pixel ratio it reports), flags (more command-line flags), angle ('d3d11' on Windows).
 */
export async function launchChrome({ headless = true, width = 1024, height = 768, scale = 2, flags = [], angle } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'lightspeed-chrome-'));
  const args = [
    headless ? '--headless=new' : null,
    process.platform === 'win32' ? `--use-angle=${angle ?? 'd3d11'}` : null,
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${scale}`,
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    ...flags,
    'about:blank',
  ].filter(Boolean);
  const proc = spawn(findChrome(), args, { stdio: 'ignore', windowsHide: headless });
  let port = null;
  let path = null;
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !port; i++) {
    await sleep(100);
    if (existsSync(portFile)) {
      let text = '';
      try {
        text = readFileSync(portFile, 'utf8');
      } catch {
        // Chrome is still writing it (EBUSY on Windows): try again
        continue;
      }
      const [p, wsPath] = text.split(/\r?\n/);
      if (p && wsPath) {
        port = Number(p);
        path = wsPath;
      }
    }
  }
  if (!port) {
    proc.kill();
    throw new Error('Chrome did not open its DevTools port');
  }
  const browser = await connect(`ws://127.0.0.1:${port}${path}`);
  const close = async () => {
    try {
      await browser.send('Browser.close');
    } catch {
      /* already gone */
    }
    browser.close();
    for (let i = 0; i < 50 && proc.exitCode === null; i++) await sleep(100);
    if (proc.exitCode === null) proc.kill();
    for (let i = 0; i < 20; i++) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await sleep(200); // Windows holds the profile's files for a moment after exit
      }
    }
  };
  return { browser, close, profile };
}

/**
 * Open a tab at `url`; evaluate(expression) awaits the expression's promise and returns its value. With
 * `viewport` ({ width, height, scale } in CSS px) the page's viewport is set exactly, whatever the window's
 * own frame takes.
 */
export async function openPage(browser, url, { viewport } = {}) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  if (viewport) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.scale ?? 2, mobile: false }, sessionId);
  }
  const logs = [];
  browser.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    if (msg.method === 'Runtime.exceptionThrown') logs.push(`exception: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
  });
  await browser.send('Runtime.enable', {}, sessionId);
  await browser.send('Page.enable', {}, sessionId);
  await browser.send('Page.navigate', { url }, sessionId);
  const evaluate = async (expression, { timeoutMs = 600_000 } = {}) => {
    const r = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: timeoutMs }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  /** Poll `expression` until it is truthy (or the time runs out); returns its last value. */
  const waitFor = async (expression, timeoutMs = 60_000) => {
    const t0 = Date.now();
    let v;
    while (Date.now() - t0 < timeoutMs) {
      try {
        v = await evaluate(expression, { timeoutMs: 10_000 });
        if (v) return v;
      } catch {
        /* the page is still loading */
      }
      await sleep(250);
    }
    return v;
  };
  const close = () => browser.send('Target.closeTarget', { targetId });
  return { evaluate, waitFor, close, logs, sessionId };
}
