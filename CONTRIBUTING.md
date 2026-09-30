# Contributing to Skyfold

Thanks for wanting to help. Bug reports, corrections to the physics or the data, new journeys and new data layers
are all welcome.

## Before you start

- **Found a bug or a wrong number?** Open an [issue](https://github.com/tommysl8/skyfold/issues) with what you saw,
  how you got there (a screenshot helps), and your browser and GPU.
- **Planning something bigger** (a new data set, a new layer, a change to the physics)? Open an issue first so we
  can agree on the approach before you spend time on it.
- **Small fixes** (typos, docs, a clearer label) can go straight to a pull request.

## Running it

Needs Node 22.12+ or 24.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # type-check and static build to dist/
```

[docs/technical.md](docs/technical.md) explains how the app works and how the code is laid out.
[docs/data/](docs/data/) says how each data set was built, and [docs/bodies.md](docs/bodies.md) how bodies are added.

## What a good pull request looks like

- `npx tsc -b`, `npx vitest run` and `npx vite build` pass. CI runs all three on every pull request.
- New physics or data comes with tests: a known value from a paper, a limiting case, or a round trip.
- It looks the same or better on a laptop with integrated graphics. If you touch rendering, say what it costs per
  frame.
- One topic per pull request, with a short description of what changed and why.

## House rules

- **Accuracy first.** Positions, distances and sizes come from measurements, with their source. Where something has
  to be a model (the Milky Way seen from outside, the gas round a black hole, the colour of an exoplanet), the app
  says so in plain words.
- **Keep the view calm.** Cards stay short: a sentence or two and the key numbers. Full references belong on the
  Learn pages, in [CREDITS.md](CREDITS.md) and in `docs/data/`, not on the view.
- **Comments explain why**, in plain sentences, and say where a formula or number comes from.
- **Line endings:** some files use CRLF and some LF. Keep each file's endings as they are, so diffs show only real
  changes.

## Data and licences

Every data file must be one we are allowed to redistribute. Before adding data:

1. Check its licence allows redistribution (CC0, CC BY, public domain and similar are fine).
2. Add a row to [CREDITS.md](CREDITS.md) with the source, the licence and what was changed.
3. Put the script that builds it in `scripts/`, so anyone can rebuild it from the original source.

Note that files built from Gaia DR3 values (the stars, the exoplanet hosts, the black holes) are for
**non-commercial use only** (CC BY-NC 3.0 IGO), and so is anything new built from Gaia. The code itself is MIT.

## Code of conduct

Be kind and assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
