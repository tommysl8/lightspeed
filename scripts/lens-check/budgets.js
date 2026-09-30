/**
 * Each part's GPU cost in the standard views, against its budget, by whole frames with and
 * without the piece, interleaved (window.__ls.perf.ab): the only trustworthy way to cost a piece drawn inside one
 * render on the target laptop.
 *
 * What: for each standard view (window.__ls.perf.view), the pieces this work added, each switched off in
 * the B half of an A/B: the whole lens (View › Gravitational lensing), the lens box's composite, the photon
 * ring's band, the luminous spheres, the nuclear cluster's points and its glow march, the accretion flow, the
 * Galaxy particles' frustum test (a saving: B draws the particles without it), the star field, the glints and the
 * ring sprites. A piece is switched off by taking its object off every layer (no camera draws it), or for the glow march
 * by zeroing the field's share just before the glow is drawn, or for the frustum test by compiling the particle
 * shader without its early-out; nothing in the app's source changes. Each result: A and B medians, the
 * median of the rounds' differences and their spread (a spread near the difference itself means noise).
 *
 * How to run, in a tab on http://localhost:5190 (development build):
 *   await import('/scripts/lens-check/budgets.js');
 *   lensBudgets.start();  lensBudgets.status();        (background: a full run takes about ten minutes)
 *   lensBudgets.report();                              (one line an A/B, for docs/data/blackholes.md §11)
 * or lensBudgets.run({ views: ['100M'], pieces: ['band'] }); far from holes and the regression checks:
 *   lensBudgets.start({ plan: lensBudgets.PLAN_FAR }).
 *
 * Why: every piece has a budget in milliseconds (docs/data/blackholes.md §11 has them and what each costs), and a
 * piece drawn inside one render can only be costed by whole frames with and without it.
 *
 * Cost: none in the app (a development tool).
 * Twins: src/dev/perf.ts (the timing), scripts/lens-check/lens-check.js (the pictures), run-perf.mjs (the views
 * in a Chrome of their own).
 */
(() => {
  'use strict';

  const W = window;

  function env() {
    const ls = W.__ls;
    if (!ls) throw new Error('no window.__ls: open the development build on port 5190');
    return { ls, perf: ls.perf };
  }

  /** Every object in the scene whose material's shader matches `re` (fragment or vertex), and a test on the object. */
  function objects(re, test = () => true) {
    const { perf } = env();
    const out = [];
    perf.scene().scene.traverse((o) => {
      const m = o.material;
      if (!m || Array.isArray(m)) return;
      const src = (m.fragmentShader ?? '') + (m.vertexShader ?? '');
      if (re.test(src) && test(o)) out.push(o);
    });
    return out;
  }

  /** A/B halves that take objects off every layer, so no camera draws them (B), and back (A). */
  function hideByLayer(find) {
    let saved = null;
    return {
      a() {
        if (saved) for (const [o, mask] of saved) o.layers.mask = mask;
        saved = null;
      },
      b() {
        const objs = find();
        if (!objs.length) throw new Error('nothing to hide');
        saved = objs.map((o) => [o, o.layers.mask]);
        // No layer at all: the scene pass enables every layer for the view (LightspeedScenePass viewLayers).
        for (const o of objs) o.layers.mask = 0;
      },
    };
  }

  const uiToggle = (key) => ({
    a: () => env().ls.ui.setState({ [key]: true }),
    b: () => env().ls.ui.setState({ [key]: false }),
  });

  /** The Galaxy particles drawn without their frustum test (B): the early-out compiled away. */
  function frustum() {
    let saved = null;
    const EARLY = 'if (clip.w <= 0.0 || abs(clip.x) > clip.w * (1.0 + reachNdc.x) || abs(clip.y) > clip.w * (1.0 + reachNdc.y)) {';
    const mats = () => {
      const set = new Set();
      env().perf.scene().scene.traverse((o) => {
        const m = o.material;
        if (m && !Array.isArray(m) && (m.vertexShader ?? '').includes(EARLY)) set.add(m);
      });
      return [...set];
    };
    return {
      a() {
        if (saved) for (const [m, src] of saved) {
          m.vertexShader = src;
          m.needsUpdate = true;
        }
        saved = null;
      },
      b() {
        const ms = mats();
        if (!ms.length) throw new Error('no particle material with the frustum test');
        saved = ms.map((m) => [m, m.vertexShader]);
        for (const m of ms) {
          m.vertexShader = m.vertexShader.replace(EARLY, 'if (false) {');
          m.needsUpdate = true;
        }
      },
    };
  }

  /** The nuclear cluster's glow march off (B): the field's share u zeroed just before the glow is drawn. */
  function nscGlow() {
    let saved = null;
    return {
      a() {
        if (saved) for (const [o, f] of saved) o.onBeforeRender = f;
        saved = null;
      },
      b() {
        const glow = objects(/uNscGlowOn/);
        if (!glow.length) throw new Error('no glow material with the nuclear march');
        saved = glow.map((o) => [o, o.onBeforeRender]);
        for (const o of glow) {
          const before = o.onBeforeRender;
          o.onBeforeRender = function (...args) {
            before.apply(this, args);
            const u = this.material.uniforms.uNscGlowOn;
            if (u) u.value.w = 0;
          };
        }
      },
    };
  }

  /**
   * The lens code far from holes compiled away (B): in the fragment passes that carry it behind a uniform (the sky
   * map, the CMB map, the relativistic remap: `uLensOn > 0.5`; the Galaxy glow's nuclear march and M87's starlight:
   * `uNscGlowOn.w > 0.0`, `uNscGlowOn.y > 0.0`) the gate becomes `false`, so the compiler drops the branch. A − B
   * is what the dead code costs where no hole is near (its budget: 0).
   */
  function deadLensCode() {
    const GATES = [
      ['uLensOn > 0.5', 'false'],
      ['uNscGlowOn.w > 0.0', 'false'],
      ['uNscGlowOn.y > 0.0', 'false'],
    ];
    let saved = null;
    const mats = () => {
      const set = new Set();
      const visit = (o) => {
        const m = o.material;
        if (m && !Array.isArray(m) && GATES.some(([g]) => (m.fragmentShader ?? '').includes(g)) && !/lightspeed_lenspixel/.test(m.fragmentShader)) set.add(m);
      };
      env().perf.scene().scene.traverse(visit);
      const pass = env().perf.composer()?.passes?.[0];
      pass?.remapScene?.traverse?.(visit);
      return [...set];
    };
    return {
      a() {
        if (saved) for (const [m, src] of saved) {
          m.fragmentShader = src;
          m.needsUpdate = true;
        }
        saved = null;
      },
      b() {
        const ms = mats();
        if (!ms.length) throw new Error('no fragment pass with lens code behind a uniform');
        saved = ms.map((m) => [m, m.fragmentShader]);
        for (const m of ms) {
          let src = m.fragmentShader;
          for (const [g, r] of GATES) src = src.split(g).join(r);
          m.fragmentShader = src;
          m.needsUpdate = true;
        }
      },
    };
  }

  /**
   * A/B halves for a shader experiment: B compiles every material whose fragment or vertex shader matches `match`
   * with `edits` ([from, to] text replacements, applied to the shader and to the chunks it includes, expanded in
   * place) and A restores it. For finding where a pass's time goes; never shipped.
   */
  /** The app's own three.js ShaderChunk (the chunks the shaders include), from Vite's pre-bundled copy the page loaded. */
  async function loadShaderChunk() {
    if (W.__lsShaderChunk) return W.__lsShaderChunk;
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three(\.module-[^/]*)?\.js/.test(n));
    if (!url) throw new Error("three.js's pre-bundled module not found among the page's resources");
    const m = await import(/* @vite-ignore */ url);
    const sc = m.ShaderChunk ?? Object.values(m).find((v) => v && typeof v === 'object' && 'lightspeed_lens' in v);
    if (!sc) throw new Error('ShaderChunk not found');
    W.__lsShaderChunk = sc;
    return sc;
  }

  function shaderVariant(match, edits, which = 'fragmentShader') {
    let saved = null;
    const expand = (src) =>
      src.replace(/#include <(\w+)>/g, (m, name) => {
        const chunk = W.__lsShaderChunk?.[name];
        return chunk && edits.some(([from]) => chunk.includes(from)) ? expand(chunk) : m;
      });
    return {
      a() {
        if (saved) for (const [m, src] of saved) {
          m[which] = src;
          m.needsUpdate = true;
        }
        saved = null;
      },
      b() {
        const ms = objects(match).map((o) => o.material);
        const uniq = [...new Set(ms)];
        if (!uniq.length) throw new Error('no material matches');
        saved = uniq.map((m) => [m, m[which]]);
        for (const m of uniq) {
          let src = expand(m[which]);
          for (const [from, to] of edits) {
            if (!src.includes(from)) throw new Error(`not found: ${from}`);
            src = src.split(from).join(to);
          }
          m[which] = src;
          m.needsUpdate = true;
        }
      },
    };
  }

  /** The lens box's composite compiled without the band's early-out (B; it must cost nothing where no band is drawn). */
  const bandCode = () => ({
    a: () => env().ls.lensTest.bandCode(true),
    b: () => env().ls.lensTest.bandCode(false),
  });

  const STAR = /The 3D star catalogue/;
  const count = (o) => o.geometry?.attributes?.position?.count ?? 0;

  /** The pieces, each with the part of the app it belongs to and its budget, ms. */
  const PIECES = {
    lens: { part: 'all that lensing switches: the lens, the lensed stars, glints and flow', make: () => uiToggle('lensing') },
    lensBox: { part: 'the lens', budget: 'box ≤ 0.1 at 4,000 au; whole screen ≤ 0.8 at rest, ≤ 1.05 in flight', make: () => hideByLayer(() => objects(/The lens box's composite/)) },
    band: { part: 'the lens', budget: '≤ 0.15', make: () => hideByLayer(() => objects(/The photon ring's band/)) },
    spheres: { part: 'the lens', budget: '≤ 0.05', make: () => hideByLayer(() => objects(/Luminous spheres seen through a black hole's lens/)) },
    nscPoints: { part: 'the nuclear cluster', budget: '≤ 0.2 (×2 split)', make: () => hideByLayer(() => objects(STAR, (o) => o.isPoints && count(o) > 0 && count(o) <= 70_000)) },
    nscGlow: { part: 'the nuclear cluster', budget: '≤ 0.25 (×2 split)', make: nscGlow },
    flow: { part: 'the accretion flow', budget: 'map ≤ 0.3, reads ≤ 0.05', make: () => uiToggle('accretionFlow') },
    frustum: { part: 'the Galaxy particles', budget: 'must save ≥ 0.5', make: frustum },
    stars: { part: 'the star field (the whole star draw)', budget: 'lensed ≤ +0.05 over today', make: () => hideByLayer(() => objects(STAR, (o) => o.isPoints && count(o) > 70_000)) },
    glints: { part: 'the bodies', budget: 'glints and rings ≤ 0.02', make: () => hideByLayer(() => objects(/Unresolved bodies drawn as point sources/, (o) => o.isPoints)) },
    rings: { part: 'the bodies', budget: 'glints and rings ≤ 0.02', make: () => hideByLayer(() => objects(/The ring of light of a body lined up/, (o) => o.isMesh)) },
    deadLensCode: { part: 'the lens and the nuclear cluster (lens code in plain fragment passes)', budget: '0 far from holes', make: deadLensCode },
    bandCode: { part: 'the lens (the early-out for the band in the composite)', budget: 'within 0.1', make: bandCode },
    skyMap: { part: 'the sky map from the Sun', make: () => hideByLayer(() => objects(/The Milky Way behind everything in the classical view/)) },
  };

  /** Which pieces to cost in which standard view. */
  const PLAN = {
    framing: ['lens', 'lensBox', 'nscPoints', 'nscGlow', 'frustum', 'stars'],
    '500au': ['lens', 'lensBox', 'nscPoints', 'nscGlow', 'frustum'],
    '100M': ['lens', 'lensBox', 'band', 'nscPoints', 'nscGlow', 'frustum', 'stars', 'glints'],
    '100M-flow': ['flow'],
    'flow-20M': ['flow', 'band'],
    arriving: ['lens', 'frustum', 'nscPoints', 'nscGlow'],
    'arriving-split': ['lens', 'nscPoints', 'nscGlow'],
    'free-500au': ['lens'],
    'fall-6M': ['lens', 'nscPoints', 'nscGlow'],
    'fall-horizon': ['lens'],
    'gaia-bh1-companion': ['lens', 'spheres'],
    'm87-1000au': ['lens'],
  };

  /** Far from holes, and the regression checks (docs/data/blackholes.md §11). */
  const PLAN_FAR = {
    earth: ['deadLensCode', 'stars'],
    'flight-3s': ['deadLensCode'],
    'handover-480pc': ['deadLensCode', 'skyMap', 'stars'],
    '500au': ['bandCode'],
  };

  const results = [];
  const jobs = {};

  async function run({ plan = PLAN, views = Object.keys(plan), pieces = null, rounds = 3 } = {}) {
    const { perf } = env();
    perf.pin(0);
    await perf.ready(90000);
    const out = [];
    for (const view of views) {
      await perf.view(view);
      const base = await perf.measure(20, 4);
      for (const name of plan[view] ?? []) {
        if (pieces && !pieces.includes(name)) continue;
        const p = PIECES[name];
        const t = p.make();
        let r;
        try {
          r = await perf.ab(t.a, t.b, rounds);
          r = { view, piece: name, part: p.part, budget: p.budget ?? null, costMs: +r.diffMed.toFixed(2) * -1, ...r, lensOn: base.lens };
        } catch (e) {
          r = { view, piece: name, part: p.part, error: String(e?.message ?? e) };
        } finally {
          try {
            t.a();
          } catch {
            // nothing hidden
          }
        }
        results.push(r);
        out.push(r);
      }
      // back as shipped before the next view
      await perf.settle(30);
    }
    return out;
  }

  function start(opts) {
    const job = (jobs.last = { state: 'running', started: new Date().toISOString(), out: null });
    run(opts).then(
      (r) => Object.assign(job, { state: 'done', out: r }),
      (e) => Object.assign(job, { state: 'error', out: String(e?.stack ?? e) }),
    );
    return job;
  }

  const status = () => ({ state: jobs.last?.state, done: results.length, last: results[results.length - 1] ?? null });

  /** One line an A/B: the piece's cost (A − B, ms, median of the rounds), its spread, A's median, the conditions. */
  function report() {
    return results
      .map((r) => (r.error ? `${r.view} · ${r.piece}: ${r.error}` : `${r.view} · ${r.piece} (${r.part}${r.budget ? `, ${r.budget}` : ''}): ${r.costMs.toFixed(2)} ms (rounds ${r.diffs.map((d) => (-d).toFixed(2)).join(', ')}; frame ${r.aMed.toFixed(2)} with, ${r.bMed.toFixed(2)} without; ${r.w}×${r.h} at ${r.at})`))
      .join('\n');
  }

  W.lensBudgets = { run, start, status, report, results, PIECES, PLAN, PLAN_FAR, shaderVariant, loadShaderChunk, hideByLayer, objects };
})();
