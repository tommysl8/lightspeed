# Tracks: Chebyshev trajectories for small bodies and spacecraft

Task D2. Positions of 10 dwarf planets and TNOs, 4 comets, 3 interstellar objects and 7 spacecraft,
fitted to JPL Horizons with adaptive Chebyshev segments, plus the evaluator that reads them.

| File | What |
| --- | --- |
| `scripts/build-tracks.mjs` | Fetches Horizons (cached in `data-raw/tracks/`), fits, validates, writes everything below. |
| `public/data/tracks.bin` | Segment table and float64 Chebyshev coefficients. 1,086,680 bytes (1.04 MiB); 1,020,170 bytes with `gzip -9`. |
| `public/data/tracks.json` | Index: bodies, pieces, centres, fallbacks, provenance, measured accuracy. 83,761 bytes (15.7 kB gzipped). |
| `staging/phase2/src/sim/tracks.ts` | Parser and evaluator. Pure TypeScript, no dependencies. |
| `staging/phase2/src/sim/tracks.test.ts` | 87 tests (vitest). |
| `staging/phase2/src/sim/__fixtures__/track-checkpoints.json` | 674 independent Horizons checkpoints used by the tests. |
| `staging/phase2/vitest.config.ts` | Test config for `npx vitest run --root staging/phase2`. |

## Conventions

- **Frame:** ecliptic and mean equinox of J2000. This is Horizons' `REF_PLANE=ECLIPTIC`,
  `REF_SYSTEM=ICRF`, with obliquity 84381.448″. It's the same rotation `src/sim/frames.ts` uses. Outputs are
  plain ecliptic x, y, z. To get the app's world axes, use world = (x, z, −y).
- **Time:** TDB days since J2000.0 (JD 2451545.0 TDB). astronomy-engine's `AstroTime.tt` can be
  passed straight in, since TT and TDB differ by under 2 ms.
- **Units:** km. Velocities from `evalState` are in km/s. Fallback `v` is in km/s and `mu` is in km³/s².
- **Centres** (see `tracks.json → centres`). A position is always relative to a named centre:

| Centre | Horizons | Resolve in the app with |
| --- | --- | --- |
| `sun` | `@10` Sun body centre | the origin |
| `ssb` | `@0` Solar System barycentre | `HelioVector(Body.SSB)`. Only extrapolated states use it (see below). |
| `earth` | `@399` geocentre | `HelioVector(Body.Earth)` |
| `venus` | `@299` | `HelioVector(Body.Venus)` |
| `jupiter`, `saturn`, `uranus`, `neptune` | `@599`, `@699`, `@799`, `@899`, the planet's **body** centre | `HelioVector(Body.Jupiter)` etc. |
| `pluto` | `@9`, the Pluto–Charon **barycentre** | `HelioVector(Body.Pluto)`, which is also the barycentre |
| `arrokoth` | `@2486958`, the New Horizons flight-project ephemeris | this file's own `arrokoth` track (the evaluator resolves it) |

All astronomy-engine vectors are heliocentric EQJ in au. Rotate them to ecliptic
(y′ = cos ε·y + sin ε·z, z′ = −sin ε·y + cos ε·z) and scale by 149,597,870.7.

## Using it

```ts
import { loadTracks, parseTracks } from './tracks';

const tracks = await loadTracks(`${import.meta.env.BASE_URL}data/`); // or parseTracks(indexJson, arrayBuffer)
const r = tracks.evalTrack('voyager2', time.tt);          // { pos, centre, regime, blend?, adjustedKm? }
const h = tracks.evalHelio('voyager2', time.tt, centreHelio); // heliocentric, blends applied
const s = tracks.evalState('parker-solar-probe', time.tt); // adds vel (km/s)
tracks.evalTrack('voyager1', t, { raw: true });           // raw Horizons fit (no jump ramps)
```

`centreHelio(centre, tdbDays)` returns the heliocentric ecliptic km position of `ssb`, `earth`,
`venus`, `jupiter`, `saturn`, `uranus`, `neptune` or `pluto`, computed with astronomy-engine as the app
already does. `sun` and track centres such as `arrokoth` are handled inside the evaluator. Evaluation takes about
0.3 µs per call (Node 24).

### Regimes

| `regime` | When | Position |
| --- | --- | --- |
| `precise` | Inside the Horizons span (`precise` in the index) | Chebyshev fit, error bounds below |
| `extrapolated` | Outside it, for bodies that keep existing | Two-body conic from the edge state, `centre` `sun` or `ssb` |
| `before-launch` | Before a spacecraft's first Horizons state | Fixed at that first state, relative to Earth. **Hide the craft.** |
| `unknown` | JWST after 2031-09-21 | Fixed at the last state, relative to Earth. **Hide it.** |

Every finite time returns a finite position. Times are clamped to ±10⁷ days for the conics. NaN
throws a `RangeError`. An unknown body id throws.

Extrapolation:

- `sun`, a heliocentric orbit about GM☉: Ceres, Vesta, Encke, 67P and Parker Solar Probe (after
  2030).
- `ssb`, an orbit about the barycentre with the whole Solar System's GM, which is the method
  `src/sim/voyager.ts` already uses: TNOs, Halley, Hale–Bopp, the interstellar objects, and
  Voyager 1/2, New Horizons and Pioneer 10 after their data end.

The barycentric edge position is stored relative to **astronomy-engine's** barycentre. That
barycentre includes only the Sun and the four giant planets, and it sits 90–1,400 km from the DE440 one
(the offset is recorded per fallback as `ssbOffsetKm`). Adding `HelioVector(Body.SSB)` back therefore
reproduces the edge position exactly, so the handover is seamless in the app. The edge velocity is
Horizons' barycentric velocity. The conics use robust solvers: a safeguarded Newton method for the
elliptic equation, and for the hyperbolic equation a bracketed Newton–bisection on
0 ≤ H ≤ asinh(M/(e−1)). The hyperbolic solver is tested to |M| = 10¹² and e from 1.0001 to 50 (3I/ATLAS has e ≈ 6.1).
Near-parabolic orbits (|e − 1| < 10⁻⁶) use universal variables.

### Blends (planet-centred flybys)

Near a planet, a spacecraft is stored relative to that planet, so the flyby geometry is exact
against the app's planet. That planet comes from astronomy-engine and is **tens of thousands of km** off JPL's for the giant
planets (measured at the switch times: Jupiter 22,600–31,500 km, Saturn 55,000–60,000, Uranus
105,000–106,000, Neptune 99,000–104,000, Pluto 73,000–74,000, Venus 960–2,700, Earth 250–1,600). The
planet-centred track inherits that offset, so the handover has to be gradual. The planet-centred piece and the
heliocentric piece therefore overlap by `blendIn` days at the start and `blendOut` days at the end. In the overlap, `evalTrack`
returns the heliocentric representation as `pos`/`centre` and the planet-centred one as
`blend: { pos, centre, weight }`. Display
(1 − weight)·(centre + pos) + weight·(blend.centre + blend.pos). The weight is a smoothstep from 0 at the
switch to 1 after `blendIn` days, and back again at the end. `evalHelio` does this for you. Both
representations are within the error bounds of Horizons. The blend only moves the app's planet offset
from one to the other.

How the switch is placed:

- **Where:** at the larger of the Laplace sphere of influence and offset/0.002, so the offset is at most 0.2% of the
  distance to the planet.
- **How long:** the blend lasts offset/(0.01·v_rel), so fading the offset in adds at most 1% to the speed
  relative to the planet. It's between 0.02 days and a quarter of the window.

Launch is handled the same way. Each craft starts relative to Earth and hands over to heliocentric at
the Earth's sphere of influence (929,200 km).

### Jumps in JPL's source data

Horizons stitches some trajectories together from separately fitted files, and it keeps the
discontinuities between them. The fit keeps them too, and the raw data are faithful. Each jump
is listed in its piece as `jumps: [{ t, jump, jumpKm, rampDays }]`. By default the evaluator hides
each jump behind a smoothstep ramp over `[t − rampDays, t)`. The ramp is long enough to add at most
1% to the speed, and inside it `adjustedKm` reports how far the position has been moved off Horizons.
`{ raw: true }` turns the ramps off.

| Body | Centre | Jump at (TDB) | Size (km) | Ramp (d) | Cause (Horizons notes) |
| --- | --- | --- | ---: | ---: | --- |
| Voyager 1 | sun | 1981-01-01 00:00:00 | 65,180 | 5.27 | Mission-design conics join the 2022 refit |
| Voyager 2 | neptune | 1989-08-29 08:00:00 | 610 | 0.063 | Mission-design conics join the 2022 refit |
| New Horizons | sun | 2007-01-01 00:00:00 | 1,205 | 0.104 | Trajectory file boundary |
| New Horizons | sun | 2012-05-01 13:47:11 | 194 | 0.022 | File boundary (od070 → od117) |
| New Horizons | sun | 2014-11-29 19:48:13 | 193 | 0.023 | File boundary |
| New Horizons | sun | 2016-02-17 19:44:17 | 332 | 0.040 | File boundary |
| New Horizons | sun | 2021-10-01 00:00:00 | 4,719 | 0.592 | File boundary (alleph od151 → od165) |
| Pioneer 10 | sun | 1972-03-24 11:30:42 | 6,478 | 0.297 | PN10 file boundary |
| Pioneer 10 | sun | 1972-09-19 22:00:49 | 743 | 0.062 | PN10 file boundary |
| Pioneer 10 | sun | 1973-04-24 15:00:00 | 754 | 0.098 | PN10 file boundary |
| Pioneer 10 | jupiter | 1973-11-24 02:00:00 | 2,531 | 0.445 | PN10 file boundary |
| Pioneer 10 | jupiter | 1973-12-24 00:00:00 | 19,360 | 3.62 | PN10 file boundary |
| Pioneer 10 | sun | 1983-06-12 00:00:53 | 126,500 | 16.1 | PN10 file boundary |
| Pioneer 10 | sun | 1990-01-02 00:00:57 | 31,020 | 4.19 | PN10 file boundary |
| Parker Solar Probe | sun | 2025-06-25 06:01:09 | 79,880 | 2.19 | Reconstruction (v041) joins the od242 prediction |
| Parker Solar Probe | sun | 2026-06-17 00:01:09 | 492 | 0.017 | Prediction joins the reference planning trajectory |

Five more flagged joins sit under a second before some of these jumps: New Horizons 2012-05-01, Pioneer 10
1973-11-24 and 1983-06-12, Parker 2025-06-25 and 2026-06-17. At each, Horizons' velocity disagrees
with its positions at the file boundary. The segments meet there without the velocity constraint
(flag bit 0 in the table below), and the positions agree, so no ramp is needed.

## `tracks.bin` (little-endian)

| Offset | Type | Field |
| --- | --- | --- |
| 0 | 4 × u8 | magic `LTRK` |
| 4 | u32 | version = 1 |
| 8 | u32 | segment count S (2,266) |
| 12 | u32 | coefficient count C (129,033 float64) |
| 16 | u32 | segment table offset (32) |
| 20 | u32 | coefficient offset (32 + 24·S, a multiple of 8) |
| 24 | u32 | total byte length |
| 28 | u32 | reserved (0) |

Segment table, 24 bytes per segment:

| Offset | Type | Field |
| --- | --- | --- |
| 0 | f64 | t0 (TDB days since J2000) |
| 8 | f64 | t1 |
| 16 | u32 | index of the first coefficient (in float64s) |
| 20 | u16 | degree n (3–31) |
| 22 | u16 | flags. Bit 0: the next segment starts after a jump in the source (no continuity). |

Each segment stores 3(n+1) float64 coefficients: x₀…xₙ, y₀…yₙ, z₀…zₙ, in km. With
x = (2t − t0 − t1)/(t1 − t0), position = Σ cₖ Tₖ(x). The velocity is the derivative times 2/(t1 − t0), per day.
A piece's segments are contiguous in the table and sorted by time. Consecutive segments share their
end time. The only exception is a jump, which leaves a gap of under 2 s that the evaluator bridges
with the earlier segment.

## `tracks.json`

```jsonc
{
  "format": "lightspeed-tracks", "version": 1, "binary": "tracks.bin",
  "frame": "...", "time": "...", "units": {...}, "centres": { "jupiter": { "horizons": "@599", "label": "..." }, ... },
  "bodies": {
    "voyager2": {
      "name": "Voyager 2", "kind": "spacecraft",       // dwarf-planet | asteroid | tno | comet | interstellar | spacecraft
      "horizons": { "command": "-32", "target": "...", "ephemeris": "Voyager_2_ST+refit2022_m", "coverage": [...] },
      "precise": [t0, t1], "preciseIso": [...],
      "pieces": [ {
        "centre": "neptune", "role": "inner",           // outer = heliocentric; inner = planet-centred
        "t0": ..., "t1": ..., "seg0": 1873, "segCount": 17,
        "blendIn": 6.99, "blendOut": 6.99,              // days
        "tolKm": 100, "fineRadiusKm": 43854, "fineTolKm": 1,
        "switchRadiusKm": 86600000, "appPlanetOffsetKm": 101000,
        "closestApproach": { "t": ..., "iso": "1989-08-25 03:56:36", "distanceKm": 29235.9 },
        "jumps": [ { "t": ..., "jump": [dx, dy, dz], "jumpKm": 610, "rampDays": 0.063 } ],
        "accuracy": { "fitSamples": ..., "fitMaxKm": ..., "independent": { "points", "maxKm", "rmsKm" }, "flyby": {...} }
      }, ... ],
      "before": { "regime": "before-launch", "centre": "earth", "epoch": ..., "pos": [...] },
      "after":  { "regime": "extrapolated", "model": "two-body", "centre": "ssb", "epoch": ..., "r": [...], "v": [...], "mu": ..., "ssbOffsetKm": ... },
      "accuracy": { "requirementKm": 100, "maxKm": 25, "rmsKm": 10.5, "flyby": { "requirementKm": 1, "maxKm": 0.267 }, ... },
      "appSwitchOffsetsKm": [ { "centre": "neptune", "iso": "...", "offsetKm": 104000 }, ... ],
      "solutions": [...],                                // comets and Arrokoth: which Horizons solution covers which dates
      "notes": ["..."]
    }
  }
}
```

The pieces of a body tile its `precise` span. Outer pieces only overlap inner ones, and only inside
the blend intervals.

## Method

1. **Horizons queries.** `EPHEM_TYPE=VECTORS`, `VEC_TABLE=2` (state), `VEC_CORR=NONE` (geometric),
   `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`, `OUT_UNITS=KM-S`, `CSV_FORMAT=YES`, with TDB times.
   - Grids use `STEP_SIZE` as a number of equal intervals. Each sample is tagged with the epoch
     Horizons prints: Horizons accumulates its step, so the printed epoch drifts from the ideal grid by up to a few ms
     over 40,000 steps.
   - Discrete epochs use `TLIST` in batches of 50, because longer query strings are rejected
     with HTTP 502.
   - Requests go one at a time with a 1.5 s pause and back off on 429 and 5xx. Grids are chunked at 40,000 steps.
   - Every response is cached under `data-raw/tracks/`. A full build from an empty cache takes
     about 1,200 requests and 30–40 minutes; with the cache, a rebuild takes about 45 s.
2. **Sampling.**
   - Each piece starts on a coarse grid: 16 days for TNOs and interstellar objects, 4–8 for
     Ceres, Vesta and comets, 1 for spacecraft in cruise (0.5 for Parker), 0.25 or less in planet
     windows.
   - The grid is then densified until every interval is at most 1/16 of the local time scale r/|v|
     about the piece's centre. That time scale is set by perihelia and closest approaches.
   - Contiguous intervals needing refinement are fetched as one grid.
3. **Fit.** Segments are built greedily.
   - From each start, every degree in {3, 5, 7, 9, 11, 13, 16, 19, 23, 27, 31} is stretched as far
     as the tolerance allows. The degree covering the most days per stored byte wins.
   - The fit is least squares on positions and velocities. The end positions **and** velocities are
     matched exactly, so the path is C¹ across segment joins.
   - A candidate passes only if its error is within the target at every sample. It must also pass at every
     interval midpoint, measured against the cubic Hermite interpolant of the two neighbouring samples.
     That check catches a polynomial that wiggles between samples.
   - If even a two-interval segment fails, the build fetches 8× denser samples there. Below 2 s it
     declares a jump in the source (see above).
   - **Targets are a quarter of the bound:** 250 km for small bodies (bound 1,000), 25 km for spacecraft (bound
     100), and 0.25 km inside the flyby radius (bound 1). The flyby radius is max(10 planet radii, 1.5 × closest
     approach).
4. **Independent validation.** Each piece is checked against 100 random Horizons epochs that the
   fit never saw. Flyby pieces get 60 more inside the flyby radius, plus the closest approach itself. The table below
   reports these, together with the error at all fit samples.
5. **Comets.** Horizons keeps one solution per apparition for periodic comets.
   - Each perihelion passage in the window uses the solution whose element epoch is closest to
     it.
   - Solutions hand over at the aphelion between two passages, cross-faded over ±60 days. The
     solutions differ there by 900–15,000 km. Each body's `solutions` lists records, arcs, dates and
     handover offsets.
   - Encke uses records 90000082–86 (SAO, 1980–1994), 90000088 (JPL J974/1), 90000089 (K105/6),
     90000090 (K204/20) and 90000091 (K273/17, 2020 onwards).
   - 67P uses 90000697–700 (SAO) for 1982–2002, 90000701 (K097/1) for 2009, and 90000703 (K284/1)
     from 2015 on.
   - Halley uses the single record 90000030 (JPL#75, arc 1835–1994, with non-gravitational terms). Its next perihelion in the
     fit is **2061-07-28 17:17 TDB**, matching JPL's prediction; a test checks it.
   - Hale–Bopp uses the single record 90002256 (JPL#226).
6. **Arrokoth** follows the New Horizons flight-project ephemeris (Horizons target `2486958`,
   NavSBE_2014MU69_od159) from 1995 to 2033. Horizons calls it more accurate than the
   ground-based orbit (`486958;`), which is used outside that span. The two differ by ~22,000 km at the flyby
   and are cross-faded over ±180 days. As a result, New Horizons' Arrokoth-relative track and the Arrokoth track agree to
   within 131 km, so the 3,537 km flyby is exact in the app.
7. **Interstellar objects** cover Horizons' whole small-body span, 1600–2500. Horizons integrates a grid
   from the solution epoch back to its start, and then forward across the whole span. For these
   hyperbolic orbits with non-gravitational forces, that forward pass drifts from a direct integration after
   perihelion: about 51,000 km by 2476 for 1I, 7,000 km for 2I and 14,000 km for 3I. Its own TLIST answers
   disagree with it by those amounts. Each span is therefore fetched as two legs that meet at the solution
   epoch, after which grid and TLIST values agree to within 20 km.

## Accuracy

All errors below are measured against Horizons. "Max" is the larger of the worst error at the 402,000 fit samples and the worst of the
independent epochs; "RMS" is over the independent epochs only. Planet-centred pieces are measured
relative to their planet. Figures are for the raw fit; inside a jump ramp the default output
departs from Horizons by up to `adjustedKm`.

| Body | Precise span (TDB) | Centres | Segments | Bytes | Max (km) | RMS (km) | Bound (km) | Flyby max (km) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ceres (`ceres`) | 1981-01-01 – 2200-01-01 | sun | 49 | 26,976 | 250 | 138 | 1000 | – |
| Vesta (`vesta`) | 1981-01-01 – 2200-01-01 | sun | 59 | 28,296 | 250 | 132 | 1000 | – |
| Eris (`eris`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 143 | 1000 | – |
| Haumea (`haumea`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 134 | 1000 | – |
| Makemake (`makemake`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 142 | 1000 | – |
| Gonggong (`gonggong`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 134 | 1000 | – |
| Quaoar (`quaoar`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 147 | 1000 | – |
| Sedna (`sedna`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 144 | 1000 | – |
| Orcus (`orcus`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 138 | 1000 | – |
| Arrokoth (`arrokoth`) | 1981-01-01 – 2200-01-01 | sun | 55 | 27,864 | 250 | 129 | 1000 | – |
| Halley (`halley`) | 1981-01-01 – 2200-01-01 | sun | 49 | 30,312 | 249 | 127 | 1000 | – |
| Encke (`encke`) | 1981-01-01 – 2200-01-01 | sun | 272 | 115,152 | 250 | 103 | 1000 | – |
| 67P (`churyumov-gerasimenko`) | 1981-01-01 – 2200-01-01 | sun | 100 | 51,168 | 249 | 125 | 1000 | – |
| Hale–Bopp (`hale-bopp`) | 1981-01-01 – 2200-01-01 | sun | 48 | 28,152 | 250 | 143 | 1000 | – |
| 1I/ʻOumuamua (`oumuamua`) | 1600-01-01 – 2500-01-01 | sun | 215 | 115,032 | 250 | 141 | 1000 | – |
| 2I/Borisov (`borisov`) | 1600-01-01 – 2500-01-01 | sun | 213 | 113,616 | 250 | 142 | 1000 | – |
| 3I/ATLAS (`atlas-3i`) | 1600-01-01 – 2500-01-01 | sun | 216 | 114,408 | 250 | 144 | 1000 | – |
| Voyager 1 (`voyager1`) | 1977-09-05 – 2099-12-31 | earth, sun, jupiter, saturn | 75 | 31,776 | 25.2 | 11.0 | 100 | 0.223 |
| Voyager 2 (`voyager2`) | 1977-08-20 – 2099-12-31 | earth, sun, jupiter, saturn, uranus, neptune | 101 | 40,992 | 25.0 | 10.5 | 100 | 0.267 |
| New Horizons (`new-horizons`) | 2006-01-19 – 2049-12-31 | earth, sun, jupiter, pluto, arrokoth | 92 | 24,552 | 24.9 | 8.35 | 100 | 0.192 |
| Pioneer 10 (`pioneer10`) | 1972-03-03 – 2050-01-01 | earth, sun, jupiter | 79 | 24,624 | 25.0 | 9.58 | 100 | 0.237 |
| Parker Solar Probe (`parker-solar-probe`) | 2018-08-12 – 2030-01-01 | earth, sun, venus | 255 | 96,432 | 25.5 | 8.73 | 100 | 0.243 |
| JWST (`jwst`) | 2021-12-25 – 2031-09-21 | earth | 38 | 24,600 | 24.9 | 9.05 | 100 | 0.077 |

Spacecraft spans start 60 s after Horizons' first state and end 60 s before its last. The small bodies
end at 2200-01-01 00:00 TDB, to within the 2 ms by which Horizons' printed epochs drift. The bytes column includes each segment's 24-byte table entry. The heliocentric
dwarf planets and TNOs need about 20 coefficients per 4 years. They aren't simply smooth: the Sun's reflex
motion around the barycentre includes the Earth's (≈450 km, yearly) and Venus's (≈265 km)
contributions, which exceed the 250 km target.

### Flybys

| Craft | Centre | Planet-centred window (TDB) | Switch radius (km) | Blend (d) | Closest approach (TDB) | Distance (km) | Max error in flyby radius (km) |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: |
| Voyager 1 | jupiter | 1979-01-16 12:32 → 1979-04-22 10:56 | 48,220,000 | 2.72 | 1979-03-05 12:05:25 | 348,435 | 0.223 |
| Voyager 1 | saturn | 1980-10-02 18:24 → 1980-12-24 08:57 | 54,810,000 | 4.21 | 1980-11-12 23:46:28 | 184,030 | 0.202 |
| Voyager 2 | jupiter | 1979-05-06 11:24 → 1979-09-12 20:50 | 48,220,000 | 4.33 | 1979-07-09 22:29:51 | 721,375 | 0.267 |
| Voyager 2 | saturn | 1981-06-29 07:38 → 1981-10-22 23:05 | 54,810,000 | 6.24 | 1981-08-26 03:24:56 | 160,691 | 0.227 |
| Voyager 2 | uranus | 1985-12-14 09:06 → 1986-03-07 02:15 | 52,810,000 | 8.29 | 1986-01-24 17:59:46 | 107,154 | 0.216 |
| Voyager 2 | neptune | 1989-06-26 10:05 → 1989-10-23 21:53 | 86,600,000 | 6.99 | 1989-08-25 03:56:36 | 29,236 | 0.232 |
| New Horizons | jupiter | 2007-01-29 15:44 → 2007-03-29 19:47 | 48,220,000 | 1.54 | 2007-02-28 05:44:45 | 2,304,505 | 0.075 |
| New Horizons | pluto (barycentre) | 2015-06-13 16:29 → 2015-08-14 07:12 | 36,690,000 | 6.16 | 2015-07-14 11:51:08 | 15,382 | 0.192 |
| New Horizons | arrokoth | 2018-12-30 05:34 → 2019-01-03 05:34 | – | 0.25 | 2019-01-01 05:34:31 | 3,537 | 0.088 |
| Pioneer 10 | jupiter | 1973-10-06 16:01 → 1974-01-31 15:40 | 48,220,000 | 3.07 | 1973-12-04 02:26:08 | 203,122 | 0.237 |
| Parker Solar Probe | venus | 2018-10-02 23:24 → 2018-10-03 18:07 | 775,200 | 0.08 | 2018-10-03 08:45:36 | 8,480 | 0.239 |
| Parker Solar Probe | venus | 2019-12-26 10:49 → 2019-12-27 01:41 | 616,300 | 0.05 | 2019-12-26 18:15:54 | 9,056 | 0.216 |
| Parker Solar Probe | venus | 2020-07-10 14:45 → 2020-07-11 16:04 | 1,049,000 | 0.11 | 2020-07-11 03:24:49 | 6,885 | 0.229 |
| Parker Solar Probe | venus | 2021-02-20 12:41 → 2021-02-21 03:32 | 616,300 | 0.05 | 2021-02-20 20:06:54 | 8,437 | 0.243 |
| Parker Solar Probe | venus | 2021-10-15 17:22 → 2021-10-17 01:40 | 1,337,000 | 0.13 | 2021-10-16 09:31:58 | 9,860 | 0.231 |
| Parker Solar Probe | venus | 2023-08-21 04:38 → 2023-08-21 19:29 | 616,300 | 0.05 | 2023-08-21 12:04:03 | 10,057 | 0.228 |
| Parker Solar Probe | venus | 2024-11-06 07:12 → 2024-11-07 06:16 | 956,500 | 0.10 | 2024-11-06 18:44:49 | 6,428 | 0.243 |

Launch pieces (Earth-centred until 929,200 km) are accurate to 0.14 km within 10 Earth radii.
Closest approaches are to the centre listed. New Horizons' 15,382 km is to the Pluto–Charon barycentre; the
distance to Pluto's centre was about 13,700 km.

**Planet body vs barycentre.** The giant-planet tracks are relative to the planet's body centre,
the frame in which moons are usually given. astronomy-engine's Jupiter–Neptune positions are
system barycentres. At these flybys the two differ by 190–213 km (Jupiter), 276–295 km (Saturn),
28 km (Uranus) and 74 km (Neptune). If the app draws the planet at astronomy-engine's point and its
moons relative to that point, the geometry is exact as stored. If the app ever offsets the planet body
from the barycentre, apply the same offset to these tracks' centre. Pluto is the opposite case: the brief asked for `@9`, which
matches `HelioVector(Body.Pluto)`, and Pluto's body is 2,132 km from it.

### Outside the precise span

Two-body errors against Horizons, taken from the fixture's `extrapolated` checkpoints:

| Body | −10 yr | −1 yr | +1 yr | +10 yr |
| --- | ---: | ---: | ---: | ---: |
| Ceres | 3.9 million km | 57,000 | 568,000 | 5.1 million |
| Vesta | 2.3 million | 96,000 | 150,000 | 2.3 million |
| TNOs (8 bodies) | 800–27,000 | 310–530 | 270–590 | 1,200–50,000 |
| Halley | 160,000 | 2,000 | 750 | 2.4 million |
| Encke | 10.2 million | 38,000 | 1.9 million | 7.4 million |
| 67P | 10.7 million | 71,000 | 89,000 | 26.5 million |
| Hale–Bopp | 18,000 | 430 | 305 | 1,350 |

These positions are plausible, not precise. Inner-system bodies drift fastest, because planetary
perturbations and the comets' outgassing are not modelled. There is no truth to compare against
after a spacecraft's data end.

## Known limits

- **Voyager 1 before 1981 and Voyager 2 before 1989-08-29** come from patched-conic
  *mission-design* trajectories. JPL calls their accuracy "rough". So the Voyager flybys of Jupiter,
  Saturn, Uranus and Neptune are design conics matched to encounter events, not reconstructions. They
  are fitted to 0.3 km, but their fidelity to where the spacecraft actually flew is JPL's, not ours.
  Horizons joins them to the 2022 refits with jumps of 65,180 km (Voyager 1) and 610 km (Voyager 2).
- **After 1992 the Voyagers are predictions.** They are refits of the 1981–1992 tracking data. JPL
  quotes ±1.7″ and ±4.7″ (RA) of pointing uncertainty on 2030-01-01.
- **Pioneer 10** is JPL's "historical" trajectory (pfile10.nio, merged PN10A–G on DE118). JPL
  says it is suitable for general historical purposes, not high precision. It contains seven position jumps of up
  to 126,500 km. Its Jupiter flyby geometry against modern satellite ephemerides may differ from the original
  solution.
- **Predictions**, none of them tracking reconstructions:
  - New Horizons after its tracking cut-off on 2026-07-20.
  - Parker Solar Probe after 2026-01-27. From 2026-06-17 it follows the reference planning trajectory.
  - JWST after 2026-09-20, following Goddard's station-keeping schedule to 2031-09-21.
- **Comets.** Inside the ±60-day handovers between apparition solutions, the position is a blend of two
  JPL solutions. The Encke, 67P and Halley solutions include non-gravitational parameters; the SAO records do not.
- **Interstellar objects** far from their observed arcs rest on assumed non-gravitational
  accelerations. JPL itself warns about this for 1I. 3I/ATLAS is an early solution (arc to
  2026-02-19) and will be revised.
- **Accuracy is relative to Horizons.** It doesn't include the real uncertainty of JPL's orbits, which is far larger for
  Sedna or 3I than the 250 km fit.
- **Pluto (`@9`)** is the barycentre. See the barycentre note above.

## Sources and credits

| Data | Source | Licence / credit |
| --- | --- | --- |
| All positions and velocities | JPL Horizons On-Line Ephemeris System, https://ssd.jpl.nasa.gov/horizons/ (Giorgini et al. 1996, BAAS 28, 1158), queried 2026-09-25 | NASA/JPL-Caltech. US Government-funded data, freely usable with credit. |
| Small-body solutions | JPL Small-Body Database solutions as served by Horizons. Ceres JPL#48, Vesta JPL#36, Eris JPL#103, Haumea JPL#132, Makemake JPL#130, Gonggong JPL#25, Quaoar JPL#51, Sedna JPL#51, Orcus JPL#61, Arrokoth JPL#3, Halley JPL#75, Hale–Bopp JPL#226, 1I JPL#16, 2I JPL#54, 3I JPL#54, plus the comet apparition records listed under Method | NASA/JPL-Caltech |
| 1I/ʻOumuamua non-gravitational model | Micheli et al. 2018, Nature 559, 223, doi:10.1038/s41586-018-0254-4 | cited by JPL in the solution |
| Arrokoth flight-project ephemeris | New Horizons mission (SwRI/JHUAPL), NavSBE_2014MU69_od159, via Horizons | NASA/JHUAPL/SwRI |
| Voyager 1 and 2 | Voyager_1_ST+refit2022_m, Voyager_2_ST+refit2022_m (R. Jacobson, 2022 refit, DE440) via Horizons | NASA/JPL-Caltech |
| New Horizons | NH_merged (KinetX navigation; Pluto system per Brozović & Jacobson 2024, AJ) via Horizons | NASA/JHUAPL/SwRI |
| Pioneer 10 | pioneer_10_merged (PN10A–G, JPL Navigation) via Horizons | NASA/JPL-Caltech; NASA Ames |
| Parker Solar Probe | psp_merged (JHUAPL) via Horizons | NASA/JHUAPL |
| JWST | JWST_merged (Goddard Flight Dynamics Facility) via Horizons | NASA/GSFC |
| GM values (Sun, planetary systems) | DE440: Park et al. 2021, AJ 161, 105 | published constants |
| Barycentre and planet positions in the build (switch sizing, `ssb` edge states) | Astronomy Engine 2.1.19 by Don Cross, already a dependency | MIT |

Suggested row for `CREDITS.md`: `public/data/tracks.bin`, `public/data/tracks.json` — trajectories
fitted to [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) (spacecraft ephemerides from
NASA/JPL, NASA/JHUAPL/SwRI and NASA/GSFC) — NASA/JPL-Caltech.

## Rebuilding and testing

```sh
node scripts/build-tracks.mjs                   # cached responses in data-raw/tracks/ are reused
node scripts/build-tracks.mjs --only=halley     # partial build, written to data-raw/tracks/partial/
npx vitest run --root staging/phase2 src/sim/tracks.test.ts
```

The tests read `public/data/tracks.{json,bin}` and the fixture. Their coverage:

- Every Horizons checkpoint is within its bound, relative to the right centre. The checkpoints
  include random epochs, flyby-zone epochs, every closest approach, launch and end-of-data edges, both
  sides of every blend, and window edges.
- Regimes are labelled correctly outside the data.
- Extrapolation stays plausible where Horizons still has data.
- Halley's 2061-07-28 perihelion.
- C⁰/C¹ continuity at every segment join. Continuity across fit-to-extrapolation edges in the app
  frame.
- The jump ramps.
- Blend weights.
- Finite output from −10⁹ to 10⁹ days.
- The Kepler solvers, and budget and accuracy-table consistency.
