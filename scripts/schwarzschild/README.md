# The Schwarzschild reference

An independent reference for the black-hole physics of `src/physics/` (`schwarzschild.ts`, `schwarzschildTables.ts`,
`lensPoint.ts`, `geodesics.ts`), in 30–50 digit arithmetic. It shares no code with the TypeScript: it is what the
TypeScript is checked against.

| File | What it does | Needs |
| --- | --- | --- |
| `schw_mp.py` | Method A: the closed forms (Carlson's R_F through mpmath's `elliprf`), roots, sweeps, deflection, shadow, the static and raindrop escape maps | mpmath |
| `geodesic_mp.py` | Method B: the orbit equation and the full geodesic equations integrated by Taylor series of order ~40, with the Jacobi field and the time, never using the closed forms | mpmath |
| `lens.py` | The exact lens equation for a static observer and a static source: every image, its magnification and parity, travel times | mpmath |
| `observers.py` | Static, raindrop, circular-orbit and moving observers; the camera maps | mpmath |
| `series.py` | The weak- and strong-deflection series (coefficients fitted at 120–160 digits and identified) | mpmath |
| `schw64.py` | The closed forms in plain float64 (or float32), vectorised | numpy |
| `make_fixtures.py` | Writes the fixtures (below) | mpmath |
| `render_views.py` | Pictures of the eight fixture cameras: a checkerboard sky and ln g in false colour | numpy |

Run from anywhere (each script finds its neighbours):

```
python scripts/schwarzschild/make_fixtures.py --subset      # src/physics/__fixtures__/schwarzschild.json, about 4 min
python scripts/schwarzschild/make_fixtures.py --out FILE    # the full set, about 3.4 MB, 20–40 min (resumable)
python scripts/schwarzschild/render_views.py --out DIR      # 18 PNGs, about a second
```

`npm run data:blackhole-fixtures` runs the first. It is deterministic: a second run writes the same bytes. Each value is
computed by method A and, where method B applies, checked by it; the difference is stored beside it (`dB`) and the
largest per section is printed at the end and kept in the file (`agreement_B_minus_A`, with any `check_failures`). The
file's sections and what each unit test takes from it are listed in `docs/data/blackholes.md`, section 4.
