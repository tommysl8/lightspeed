/**
 * npm run check:shaders: compiles every shader program the app can draw, in a real Chrome on this machine's GPU
 * (ANGLE D3D11 on Windows), and times each cold compile; then times the app's own start-up on an empty program
 * cache.
 *
 * What it compiles: every material factory of src/render/materials.ts (with the arguments the app passes), the
 * cosmic web with its emission table, the relativistic remap and the Galaxy layer's composite, the ecliptic
 * grid (its shaders are read from EclipticGrid.tsx), every entry of precompile.ts's LATER_MATERIALS (the lens's
 * passes, the lensed variants of the point layers, the ring sprites and the accretion flow's map among them),
 * each point material's lensed variant (render/lensVariants.ts lensedVariant) and the lensed orbit lines of
 * both tiers; and a control shader that must fail, so a check that catches nothing is caught.
 *
 * How: the app's own modules are loaded in this process through Vite's module pipeline (no port opened), their
 * shaders and the app's registered chunks written into a page that compiles each with the app's three.js as the
 * app's renderer would (WebGL2, logarithmic depth, half-float target), each shader prefixed with a unique marker
 * comment so no program cache can answer; Chrome runs with a fresh profile, so its disk cache of compiled
 * programs is empty too. Compile and link are timed together (three.js waits for the link on first use). With
 * --app [url] (default http://localhost:5190/, only if it answers) the running development server's page is
 * opened in another fresh profile and the first 30 frames' total is read from window.__lsStartup (main.tsx),
 * the start-up cost that shader compiles make.
 *
 * It also checks, without a GPU, that the plain programs are today's (no dead lens code far from a hole: see
 * docs/data/blackholes.md §11): every shader file of src/render/shaders that existed at the commit this work
 * started from (d17e6d1, read with `git show`, which changes nothing) and now holds LENS or LENS_EXACT blocks must,
 * with those blocks resolved as the preprocessor would without the defines, equal its old source line for line
 * (blank lines and trailing spaces aside). A file changed in any other way is listed for review, not failed: the
 * frustum test in galaxy.vert.glsl, say, changes the plain program on purpose.
 *
 * Why: the targets are zero compile errors on the target GPU; every lensed program compiled in the background,
 * never in start-up; the start-up total unchanged by the black-hole work (today's figure is below).
 *
 * Output: a table on stdout, and with --json <file> every result. Exit 1 on any compile error, if the control
 * compiles, or if a shader with LENS blocks changed its plain program. Takes 10–60 s.
 *
 * Usage: node scripts/check-shaders.mjs [--app [url]] [--no-app] [--json out.json] [--visible] [--base d17e6d1]
 * Twins: src/dev/perf.ts compiles() (the same cold compiles inside a running page).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome, openPage } from './lens-check/chrome.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The start-up total at the start of this work (the shaders of d17e6d1, with only its empty stubs added), on the target
 * laptop: the first 30 frames at Earth on an empty program cache, headless Chrome 153, a 1,024 × 768 window at
 * pixel ratio 2 (canvas 1,996 × 1,152), 28 September 2026 22:34–22:36 with other work running (processor 50–75 %).
 * docs/data/blackholes.md §11 has the runs.
 */
const STARTUP_BASELINE = { ms: 1394, when: 'the start of this work (median of 4 runs, 1,266–1,552 ms, other work running)' };

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

// ─── 1. The materials, from the app's own modules ─────────────────────────────────────────────────

async function collect() {
  const { createServer } = await import('vite');
  const cacheDir = mkdtempSync(join(tmpdir(), 'lightspeed-vite-'));
  const server = await createServer({
    root: REPO,
    configFile: false,
    cacheDir,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const out = { materials: [], chunks: {}, notes: [] };
  try {
    const load = (p) => server.ssrLoadModule(p);
    // The same module instance the app's modules get (Vite leaves 'three' to Node), so its ShaderChunk holds their chunks.
    const THREE = await import(pathToFileURL(join(REPO, 'node_modules/three/build/three.module.js')).href);
    const M = await load('/src/render/materials.ts');
    const add = (name, kind, m) => {
      if (!m || typeof m.vertexShader !== 'string') {
        out.notes.push(`${name}: not a shader material`);
        return;
      }
      out.materials.push({
        name,
        kind,
        vertexShader: m.vertexShader,
        fragmentShader: m.fragmentShader,
        defines: m.defines ? { ...m.defines } : {},
        glslVersion: m.glslVersion ?? null,
      });
    };

    // Every factory of materials.ts: those that need arguments get the app's; any other is called bare.
    const withArgs = {
      createOrbitMaterial: () => M.createOrbitMaterial(new THREE.Color(1, 1, 1)),
      createPlanetMaterial: () => M.createPlanetMaterial({ baseColor: new THREE.Color(1, 1, 1) }),
      createGalaxyMaterial: () => M.createGalaxyMaterial(1, 0),
    };
    const kindOf = (name) =>
      /Star|Glint|Belt|HostRing|ClusterRing|Galaxies|CosmicWeb|CmbPoint|GalaxyMaterial/.test(name) && !/Glow/.test(name)
        ? 'points'
        : /Constellation/.test(name)
          ? 'lines'
          : 'mesh';
    const plain = [];
    for (const [name, f] of Object.entries(M)) {
      if (!/^create\w*Material$/.test(name) || typeof f !== 'function') continue;
      try {
        const m = withArgs[name] ? withArgs[name]() : f();
        add(`materials.${name}`, kindOf(name), m);
        plain.push([name, kindOf(name), m]);
      } catch (e) {
        out.notes.push(`materials.${name}: could not be built (${String(e.message ?? e).slice(0, 120)})`);
      }
    }

    // The cosmic web as it is drawn once the cosmology's emission table has arrived.
    try {
      const cosmosData = await load('/src/sim/cosmos/cosmosData.ts');
      const expansion = await load('/src/sim/cosmos/expansion.ts');
      const pre = await load('/src/render/precompile.ts');
      expansion.cosmicSky.table = cosmosData.buildSkyTable();
      M.updateSkyUniforms();
      add('cosmic web with its emission table', 'points', pre.cosmicWebMaterialWithTable());
    } catch (e) {
      out.notes.push(`cosmic web with table: ${String(e.message ?? e).slice(0, 160)}`);
    }

    // The relativistic remap and the Galaxy layer's composite.
    const LSP = await load('/src/render/LightspeedScenePass.ts');
    const pass = new LSP.LightspeedScenePass(new THREE.Scene(), new THREE.PerspectiveCamera(50, 1.4, 0.001, 1e25), 64);
    add('relativistic remap', 'mesh', pass.remap);
    const GL = await load('/src/render/galaxyLayer.ts');
    add('Galaxy layer composite', 'mesh', GL.galaxyLayer.composite);

    // The programs compiled in the background (the lens's among them), each with how it is drawn.
    const pre = await load('/src/render/precompile.ts');
    const lists = [
      ['lens', '/src/render/lens/lensMaterials.ts', 'LENS_LATER'],
      ['vertex lens', '/src/render/lensVariants.ts', 'VERTEX_LENS_LATER'],
      ['ring', '/src/render/lensRingMaterial.ts', 'RING_LATER'],
      ['flow', '/src/render/flow/flowMap.ts', 'FLOW_LATER'],
    ];
    const owned = new Set();
    for (const [list, path, name] of lists) {
      const mod = await load(path);
      (mod[name] ?? []).forEach(([make, drawn], i) => {
        owned.add(make);
        const m = make();
        add(`${list} #${i}${m.name ? ' ' + m.name : ''}${m.defines && 'LENS' in m.defines ? ' (LENS)' : ''}${m.defines && 'LENS_EXACT' in m.defines ? ' (LENS_EXACT)' : ''}`, drawn === 'quad' ? 'mesh' : drawn, m);
      });
    }
    pre.LATER_MATERIALS.forEach(([make, drawn], i) => {
      if (owned.has(make)) return;
      add(`later #${i} ${make.name || ''}`.trim(), drawn === 'quad' ? 'mesh' : drawn, make());
    });

    // Each point material's lensed variant, and the lensed orbit lines (tier 1 and the exact tier 2).
    const LV = await load('/src/render/lensVariants.ts');
    for (const [name, kind, m] of plain) {
      const v = LV.lensedVariant(m);
      if (v !== m) add(`materials.${name} lensed`, kind, v);
    }
    for (const exact of [false, true]) {
      const m = LV.createLensedOrbitMaterial({ r: 1, g: 1, b: 1 }, exact);
      if (m.defines && ('LENS' in m.defines || 'LENS_EXACT' in m.defines)) add(`lensed orbit line (${exact ? 'tier 2' : 'tier 1'})`, 'mesh', m);
    }
    const lensedCount = out.materials.filter((m) => 'LENS' in m.defines || 'LENS_EXACT' in m.defines).length;
    if (lensedCount === 0) out.notes.push('no LENS or LENS_EXACT variant exists yet (render/lensVariants.ts is still a stub)');

    // The ecliptic grid's shaders are consts in a .tsx: read them from its source.
    const grid = readFileSync(join(REPO, 'src/scene/EclipticGrid.tsx'), 'utf8');
    const lit = (name) => grid.match(new RegExp(`const ${name} = /\\* glsl \\*/ \`([\\s\\S]*?)\`;`))?.[1];
    if (lit('VERT') && lit('FRAG')) out.materials.push({ name: 'ecliptic grid', kind: 'lines', vertexShader: lit('VERT'), fragmentShader: lit('FRAG'), defines: {}, glslVersion: null });
    else out.notes.push('ecliptic grid shaders not found in EclipticGrid.tsx');

    // A control that must fail.
    out.materials.push({ name: 'control (broken on purpose: must fail)', kind: 'mesh', control: true, vertexShader: 'void main() { gl_Position = vec4(position, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(notDeclared, 1.0); }', defines: {}, glslVersion: null });

    for (const [k, v] of Object.entries(THREE.ShaderChunk)) if (k.startsWith('lightspeed_')) out.chunks[k] = v;
    out.threeRevision = THREE.REVISION;
  } finally {
    await server.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
  return out;
}

// ─── 2. The compile page ──────────────────────────────────────────────────────────────────────────

function page(data) {
  const threeUrl = pathToFileURL(join(REPO, 'node_modules/three/build/three.module.js')).href;
  return `<!doctype html>
<meta charset="utf-8" />
<title>Lightspeed shader compile check</title>
<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script type="importmap">${JSON.stringify({ imports: { three: threeUrl } })}</script>
<script type="module">
import * as THREE from 'three';
window.__result = (async () => {
  const R = { errors: [], results: [] };
  try {
    const data = JSON.parse(document.getElementById('data').textContent);
    Object.assign(THREE.ShaderChunk, data.chunks);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    // As App.tsx makes it.
    const renderer = new THREE.WebGLRenderer({ canvas, logarithmicDepthBuffer: true, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    R.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    R.three = THREE.REVISION;
    R.parallelCompile = !!gl.getExtension('KHR_parallel_shader_compile');
    // Everything the app draws goes into half-float targets (the composer's buffers and the Galaxy layer's).
    const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true });
    renderer.setRenderTarget(rt);
    let failure = null;
    renderer.debug.onShaderError = (g, program, vs, fs) => {
      failure = { program: g.getProgramInfoLog(program), vertex: g.getShaderInfoLog(vs), fragment: g.getShaderInfoLog(fs) };
    };
    const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1e25);
    const geometry = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
      return g;
    };
    const stamp = Date.now();
    for (const [i, m] of data.materials.entries()) {
      failure = null;
      const marker = '\\n// cold compile ' + stamp + '.' + i + '\\n';
      const mat = new THREE.ShaderMaterial({ vertexShader: marker + m.vertexShader, fragmentShader: marker + m.fragmentShader, defines: m.defines });
      if (m.glslVersion) mat.glslVersion = m.glslVersion;
      const obj = m.kind === 'points' ? new THREE.Points(geometry(), mat) : m.kind === 'lines' ? new THREE.LineSegments(geometry(), mat) : new THREE.Mesh(geometry(), mat);
      obj.frustumCulled = false;
      const scene = new THREE.Scene();
      scene.add(obj);
      const t0 = performance.now();
      renderer.compile(scene, camera);
      // compile() issues the compile and link; three.js checks them on the program's first use (getUniforms),
      // which waits for the driver and calls debug.onShaderError on a failure.
      renderer.properties.get(mat).currentProgram?.getUniforms();
      const ms = performance.now() - t0;
      R.results.push({ name: m.name, control: !!m.control, ok: !failure, ms: +ms.toFixed(1), chars: m.vertexShader.length + m.fragmentShader.length, lensed: 'LENS' in m.defines || 'LENS_EXACT' in m.defines, failure });
      mat.dispose();
      await new Promise((r) => setTimeout(r, 0));
    }
    R.programs = (renderer.info.programs ?? []).length;
  } catch (e) {
    R.errors.push(String(e && e.stack ? e.stack : e));
  }
  return R;
})();
</script>
`;
}

// ─── 3. The plain programs, against the commit this work started from ───────────────────────────────

const LENS_COND = /^\s*#\s*(ifdef|ifndef|if)\s+(?:defined\s*\(\s*)?(LENS|LENS_EXACT)\s*\)?\s*(?:\/\/.*)?$/;

/**
 * A shader's lines with its LENS and LENS_EXACT conditionals resolved as the preprocessor would with neither
 * defined: `#ifdef LENS…` and `#if defined(LENS…)` blocks dropped (their `#else` part kept), `#ifndef LENS…` blocks
 * kept (their `#else` part dropped). Every other conditional is left as it is.
 */
function withoutLens(src) {
  const out = [];
  // Each open conditional: whether it is one of ours, and whether its lines are kept now.
  const stack = [];
  const keptNow = () => stack.every((f) => f.keep);
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(LENS_COND);
    if (m) {
      stack.push({ ours: true, keep: m[1] === 'ifndef' });
      continue;
    }
    if (/^\s*#\s*if/.test(line)) {
      if (keptNow()) out.push(line);
      stack.push({ ours: false, keep: true });
      continue;
    }
    if (/^\s*#\s*(else|elif)\b/.test(line)) {
      const top = stack[stack.length - 1];
      if (top?.ours) top.keep = !top.keep;
      else if (keptNow()) out.push(line);
      continue;
    }
    if (/^\s*#\s*endif\b/.test(line)) {
      const top = stack.pop();
      if (!top?.ours && keptNow()) out.push(line);
      continue;
    }
    if (keptNow()) out.push(line);
  }
  return out;
}

const tidy = (lines) => lines.map((l) => l.replace(/\s+$/, '')).filter((l) => l.length > 0);

/** Each shader file that existed at `base` and differs now: whether it holds LENS blocks and whether its plain program is the old one. */
function plainPrograms(base) {
  const dir = join(REPO, 'src/render/shaders');
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.glsl'))) {
    let old;
    try {
      old = execFileSync('git', ['show', `${base}:src/render/shaders/${f}`], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      continue; // new since the base: there is no plain program to keep
    }
    const now = readFileSync(join(dir, f), 'utf8');
    const lensBlocks = now.split(/\r?\n/).some((l) => LENS_COND.test(l));
    const a = tidy(old.split(/\r?\n/));
    const b = tidy(lensBlocks ? withoutLens(now) : now.split(/\r?\n/));
    const same = a.length === b.length && a.every((l, i) => l === b[i]);
    if (same && !lensBlocks) continue;
    let at = -1;
    for (let i = 0; i < Math.max(a.length, b.length) && at < 0; i++) if (a[i] !== b[i]) at = i;
    out.push({ file: f, lensBlocks, plainUnchanged: same, firstDifference: same ? null : { line: at + 1, was: a[at] ?? '(end)', now: b[at] ?? '(end)' } });
  }
  return out;
}

// ─── 4. Run ──────────────────────────────────────────────────────────────────────────────────────

async function appReachable(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function startup(url, headless) {
  const chrome = await launchChrome({ headless, width: 1024, height: 768, scale: 2 });
  try {
    // The window as the baseline was measured (no viewport override: the canvas comes out 1,996 × 1,152).
    const tab = await openPage(chrome.browser, url);
    const s = await tab.waitFor('window.__lsStartup && window.__lsStartup.endsMs.length >= 30 && window.__lsStartup', 120_000);
    if (!s || !s.endsMs || s.endsMs.length < 30) return { error: 'the page did not draw 30 frames in 2 minutes', logs: tab.logs.slice(-10) };
    const canvas = await tab.evaluate("(() => { const c = document.querySelector('canvas'); return c ? c.width + '×' + c.height : null; })()");
    const frames = s.endsMs.map((t, i) => Math.round(t - (i ? s.endsMs[i - 1] : s.firstStartMs)));
    return { totalMs: Math.round(s.endsMs[29] - s.firstStartMs), longest: Math.max(...frames), frames, canvas };
  } finally {
    await chrome.close();
  }
}

async function main() {
  const t0 = Date.now();
  const data = await collect();
  const dir = mkdtempSync(join(tmpdir(), 'lightspeed-shaders-'));
  const file = join(dir, 'shaders.html');
  writeFileSync(file, page(data));
  let result;
  const chrome = await launchChrome({ headless: !flag('--visible'), flags: ['--allow-file-access-from-files'] });
  try {
    const tab = await openPage(chrome.browser, pathToFileURL(file).href);
    await tab.waitFor('!!window.__result', 30_000);
    result = await tab.evaluate('window.__result');
    if (!result) throw new Error(`the compile page did not run:\n${tab.logs.join('\n')}`);
  } finally {
    await chrome.close();
    rmSync(dir, { recursive: true, force: true });
  }

  const plain = existsSync(join(REPO, '.git')) ? plainPrograms(option('--base', 'd17e6d1')) : null;

  const appUrl = flag('--no-app') ? null : option('--app', 'http://localhost:5190/');
  let app = null;
  if (appUrl) app = (await appReachable(appUrl)) ? await startup(appUrl, !flag('--visible')) : { skipped: `${appUrl} does not answer` };

  // Report.
  const rows = result.results;
  const failed = rows.filter((r) => !r.ok && !r.control);
  const control = rows.find((r) => r.control);
  const later = rows.filter((r) => /^(lens|vertex lens|ring|flow|later) #/.test(r.name));
  const sum = (xs) => Math.round(xs.reduce((a, r) => a + r.ms, 0));
  console.log(`${result.renderer} · three r${result.three} · ${rows.length - 1} programs · parallel compile ${result.parallelCompile ? 'yes' : 'no'}`);
  const w = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) console.log(`  ${r.ok ? (r.control ? 'FAIL?' : 'ok   ') : r.control ? 'ok   ' : 'ERROR'} ${r.name.padEnd(w)} ${String(r.ms).padStart(7)} ms${r.lensed ? '  lensed' : ''}`);
  console.log(`background list (compiled after start-up): ${later.length} programs, ${sum(later)} ms cold; lensed programs: ${rows.filter((r) => r.lensed).length}`);
  for (const n of data.notes) console.log(`note: ${n}`);
  for (const e of result.errors) console.log(`page error: ${e}`);
  if (app?.totalMs !== undefined) {
    const base = STARTUP_BASELINE.ms;
    console.log(`start-up (${appUrl}, fresh profile, canvas ${app.canvas}): first 30 frames ${app.totalMs} ms, longest frame ${app.longest} ms${base ? `; at ${STARTUP_BASELINE.when}: ${base} ms (${app.totalMs - base >= 0 ? '+' : ''}${app.totalMs - base} ms)` : ''}`);
  } else if (app) console.log(`start-up: ${app.skipped ?? app.error}`);
  const plainChanged = (plain ?? []).filter((p) => p.lensBlocks && !p.plainUnchanged);
  if (plain) {
    const lensed = plain.filter((p) => p.lensBlocks);
    console.log(`plain programs: ${lensed.length} shader files hold LENS blocks, ${lensed.length - plainChanged.length} of them otherwise as at the base`);
    for (const p of plain) {
      if (p.plainUnchanged) continue;
      const d = p.firstDifference;
      console.log(`  ${p.lensBlocks ? 'CHANGED' : 'review '} ${p.file}${p.lensBlocks ? ' (outside its LENS blocks)' : ' (no LENS blocks)'}: line ${d.line} was ${JSON.stringify(d.was)}, now ${JSON.stringify(d.now)}`);
    }
  } else console.log('plain programs: not checked (no git repository here)');
  for (const f of failed) console.log(`\n${f.name}:\n${JSON.stringify(f.failure, null, 1)}`);
  const json = option('--json', null);
  if (json) writeFileSync(json, JSON.stringify({ at: new Date().toISOString(), result, notes: data.notes, app, plain }, null, 1));
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const bad = failed.length > 0 || result.errors.length > 0 || !control || control.ok || plainChanged.length > 0;
  if (control?.ok) console.log('the control compiled: the check itself is broken');
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
