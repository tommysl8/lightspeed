# Moon orbit models (task D1)

Compact fitted orbit models for 25 moons, plus Pluto about the Pluto–Charon barycentre. They are evaluated in the
browser from `public/data/moons.json`. Every model reproduces JPL Horizons well inside the requirement
max(100 km, 5·10⁻⁴ a) over 1981-01-01 to 2199-12-31 TDB. Each model carries a stated error bound (`boundKm`) and an
out-of-sample RMS measured on about 19,000 epochs the fit never saw. Relative to their targets, the worst bounds
are Nereid's (69 %) and Hyperion's (62 %); every other body's bound is at most 13 % of its target (Europa). The measured errors
are in the table below.

### Changes after the independent verification (2026-09-25)

An independent check against 72 fresh Horizons epochs per body passed every model, and found three things to fix in
how the accuracy was stated. The models themselves are unchanged.

- **RMS was in-sample.** `rmsKm` was measured on the fitted grid, which flatters the fit: out of sample it was up to
  1.7× higher (Europa 9.2 km against 5.4). `rmsKm` is now the RMS on a new validation grid of about 19,000 epochs per
  body that the fit never saw; the in-sample figure is kept as `fitRmsKm`. Out of sample is 1.5–1.8× higher for Io,
  Europa, Titan and Nix, 3.7× for Proteus, and at most 1.2× for the others.
- **`maxKm` was not a bound.** Nix reached 5.37 km against a stated maximum of 5.01. `maxKm` is now the largest error
  seen on every set, the validation grid included (the validation grid raised it for 12 bodies, most by under 10 %;
  the largest changes are Titan from 27 to 40 km, Io from 12 to 16 km and Nix from 5.0 to 5.8 km), and it is
  described as what it is: an observed maximum. A new
  field, `boundKm` = 1.25 × `maxKm` rounded up to two figures, is the stated bound to quote. The independent check's
  worst errors are all inside it (Nix 5.37 km against 7.2).
- **Neptune's and Pluto's windows end a day or two early** (2199-12-30 and 2199-12-29), because Horizons' satellite
  ephemerides stop there. This is a Horizons limit and cannot be fixed here; it is stated under Regimes and in
  `window`.

| Item | Path |
| --- | --- |
| Data | `public/data/moons.json` (153 KB, plain JSON) |
| Evaluator | `staging/phase2/src/sim/moonModels.ts` (pure functions, no dependencies) |
| Tests | `staging/phase2/src/sim/moonModels.test.ts` (137 tests) and `staging/phase2/src/sim/__fixtures__/moon-checkpoints.json` (125 KB) |
| Build | `scripts/build-moons.mjs`, which reads its Horizons cache from `data-raw/moons/` |

Run the tests with `npx vitest run --root staging/phase2 moonModels`. The test file finds `public/data/moons.json`
and its fixture by walking up from its own directory, so it keeps working after the module moves to `src/sim/`.

## Bodies and centres

| Planet | Bodies (id) | Position is relative to |
| --- | --- | --- |
| Mars | `phobos`, `deimos` | Mars centre |
| Jupiter | `io`, `europa`, `ganymede`, `callisto` | Jupiter centre |
| Saturn | `mimas`, `enceladus`, `tethys`, `dione`, `rhea`, `titan`, `hyperion`, `iapetus` | Saturn centre |
| Uranus | `miranda`, `ariel`, `umbriel`, `titania`, `oberon` | Uranus centre |
| Neptune | `triton`, `nereid`, `proteus` | Neptune centre |
| Pluto | `charon`, `nix`, `hydra`, **`pluto`** | Pluto **system barycentre** |

**Pluto.** astronomy-engine's `Body.Pluto` is the Pluto system barycentre. To place Pluto itself, add the `pluto`
model to it: `plutoBody = HelioVector(Body.Pluto) + evalMoon(moons.pluto, t)`. Place Charon, Nix and Hydra the same
way: `barycentre + evalMoon(...)`. Pluto's offset is about 2 130 km, always opposite Charon; a test checks this.

**Galilean moons.** The task allowed astronomy-engine's `JupiterMoons()` to stay if it met the requirement. Over
1981–2199 it does not: Io is off by up to 952 km against a 211 km target (see below). The four Galileans therefore
have fitted models too, and the app should use them instead of `JupiterMoons()`.

## Conventions

- **Frame:** ecliptic and mean equinox of J2000, with ICRF axes and the IAU 1976 obliquity of 84 381.448″. This is
  Horizons' "Ecliptic of J2000.0", and it is the frame astronomy-engine's `Rotation_EQJ_ECL()` gives. The output is
  plain ecliptic x, y, z in km. The app's world axes are `world = (x, z, −y)`.
- **Time:** TDB days since J2000.0 (JD 2451545.0 TDB). You can pass astronomy-engine's `AstroTime.tt` directly:
  TT and TDB differ by under 2 ms, which is a few metres of motion even for Phobos.
- **Geometric positions:** no light-time or aberration correction, the same as astronomy-engine's `HelioVector`.
- **Heliocentric position of a moon:** `planetHelio(t) + evalMoon(model, t)`, with the planet from
  astronomy-engine. Every model is relative to its planet, so the moons sit correctly around the planet however
  large the error of the planetary theory (thousands of km for the giant planets).
- **Build astronomy-engine's time from TT:** `AstroTime.FromTerrestrialTime(tdbDays)`, or simply use the app's
  `AstroTime` and pass its `.tt` here. `MakeTime(tdbDays)` reads its argument as UT; the planet would then be placed
  ΔT (about a minute now, several minutes near 2200) away from the moon models' time, which for Jupiter is about
  800 km of orbital motion. The moons would still sit correctly around the planet, but the whole system would be
  shifted along its orbit.

## API (`moonModels.ts`)

```ts
indexMoonCatalog(catalog): Record<string, MoonModel>     // checks the format tag, indexes by id
evalMoon(model, tdbDays, out?): [x, y, z]                // km, ecliptic J2000, relative to the centre
moonRegime(model, tdbDays): 'precise' | 'illustrative'  // inside / outside the precise window
evalMoonVelocity(model, tdbDays, out?): [vx, vy, vz]     // km/day, central difference
moonElements(model, tdbDays, secularOnly?)               // equinoctial elements in the model's frame
moonEllipse(model, tdbDays, secularOnly?)                // orbit line to draw at t (ecliptic J2000)
```

`evalMoon` never throws and returns a finite position for any finite time. The models hold 2 926 periodic terms
in all, 113 per body on average. Evaluating all 26 bodies takes about 0.16 ms in Node 24, so every frame is fine.

**Orbit lines.** Use `moonEllipse(model, t)` and draw the points
`a(cos E − e)·periapsis + a√(1−e²) sin E·qAxis` for E in [0, 2π). By default it uses the full elements, so the moon
sits on its line to within its few-km position terms. With `secularOnly` you get the smooth mean orbit instead.
The inner orbits precess quickly (Phobos by about 0.4° a day, Mimas by about 1° a day), so recompute the ellipse
often; it costs one `moonElements` call.

**Static metadata** on each model:

- `orbit`
  - `a` (km), `e`, `i` (degrees, to the reference plane) and `period` (sidereal, days) of the mean orbit.
  - `retrograde`: true only for Triton.
  - `normal`: unit normal of the mean orbit at the model epoch (ecliptic J2000).
  - `refPole` and `refPlane`: the pole of the fit frame (the Laplace plane, the planet's equator, or Nereid's mean
    orbit plane; the pole is flipped for Triton so that its orbit is prograde in that frame).
  - `apsidalPeriodYears` and `nodalPeriodYears`: the free (or resonance-locked) precession kept outside the window.
    They are signed (negative means regression). They are 0 where no such period applies: e < 0.001, i < 0.02°,
    or the slowest term in the series is a forced one faster than half a year, as for Charon and Oberon.
- `synchronous`: whether the body keeps one face towards its primary. It is false for Hyperion (chaotic rotation)
  and for Nereid, Nix and Hydra, whose spin periods are unrelated to their orbits. It is true for Pluto, which is
  locked to Charon.
- `accuracy`
  - `boundKm`: **the stated error bound** inside the window, km: 1.25 × `maxKm` rounded up to two figures. It is a
    margin over the largest error seen, not a proof; no check so far has exceeded it.
  - `maxKm`: the largest error seen inside the window over every set compared (the fitted grid, the dense window,
    the 64 checkpoints and the validation grid): an observed maximum over 60,000–230,000 epochs.
  - `rmsKm`: RMS error on the validation grid, epochs the fit never saw (**out of sample**).
  - `fitRmsKm`: RMS error on the fitted grid (in sample; lower, see Accuracy).
  - `validation`: `{ points, stepMinutes, startTdb, maxKm, maxAtTdb, rmsKm }` of the validation grid.
  - `fitMaxKm`, `denseMaxKm`, `checkpointMaxKm` and `targetKm`.
  - `illustrativeOutsideKm`: errors at Horizons epochs outside 1981–2199, to show how the illustrative mode
    degrades.
- `horizons` (target, centre, ephemeris) and `source`: what the model was fitted to.

## Regimes

- **Precise:** `window[0] ≤ t ≤ window[1]`. The window runs from 1981-01-01 00:00 to 2200-01-01 00:00 TDB. For
  Neptune's moons it ends at 2199-12-30, and for the Pluto system at 2199-12-29, because Horizons' satellite
  ephemerides stop there. The fit itself uses data up to five years beyond the window on each side where Horizons
  has it (1976-01 onwards for all; to 2204-12 for Mars, Saturn and Uranus; to 2200-01-08 for Jupiter). This keeps
  the end effects of the fit out of the window.
- **Illustrative:** outside the window.
  - The periodic terms fade out smoothly over `taper` = 7 305 days (20 years) with a raised-cosine weight, and the
    polynomial parts freeze through a C¹ clamp of time.
  - What remains is the mean precessing ellipse: mean longitude at the mean rate, free apsidal and nodal
    precession, and mean a, e and i.
  - The position stays finite and on a plausible orbit at any date (the tests go to ±1 million years), and it
    changes smoothly (C¹) through the window edges and the end of the fade.
  - Its error grows away from the window because resonant librations, solar terms and the rest are no longer
    included. For example, Mimas loses its 43° libration and is 79 000 km off in 1930. See `illustrativeOutsideKm`.
  - For Phobos the τ² term of the mean longitude is the real tidal acceleration, so it is kept outside the window
    (`l.q = 1`); Phobos is still within 12 km of Horizons in 1900 and 27 km in 2290.

## File format

```jsonc
{
  "format": "lightspeed-moons/1",
  "frame": "...", "time": "...", "preciseWindow": "...", "source": "...",
  "astronomyEngineJupiterMoons": { "io": { "maxKm": 952, "rmsKm": 482, "samples": 38382 }, ... },
  "moons": [ MoonModel, ... ]      // grouped by planet
}
```

Besides the metadata above, a `MoonModel` holds:

| Field | Meaning |
| --- | --- |
| `epoch` | τ = 0 of the model, TDB days since J2000 (the middle of the fitted span) |
| `window`, `taper` | precise window (TDB days since J2000) and fade length (days) |
| `frame` | 3×3 row-major matrix F with r_ecl = F·r_fit; column 3 is the reference-plane pole |
| `mu` | effective GM of the element conversion (km³/day²); informational |
| `a.p`, `a.m` | semi-major axis: polynomial in τc, periodic terms |
| `l.p`, `l.t`, `l.m`, `l.q` | mean longitude: polynomial (l0, l1, l2), slow periodic terms, other periodic terms, flag |
| `z.p`, `z.f`, `z.m` | k + ih = e·e^{iϖ}: constant, free (secular) terms, periodic terms |
| `s.p`, `s.f`, `s.m` | q + ip = sin(i/2)·e^{iΩ}: constant, free (secular) terms, periodic terms |
| `xy`, `zz` | periodic position corrections in the fit frame (x + iy complex, z real), km |

Terms are arrays: `[ν, A, B]` in `l.t`, `z.f` and `s.f`, and `[ν, A, B, k]` everywhere else, with ν in rad/day.
The argument of a term is θ = ν·τ + k·Λ. A real term contributes A cos θ + B sin θ. A complex term contributes
(A + iB)·e^{iθ}. Angles are in radians and lengths in km.

Evaluating at time t works as follows; this is exactly what `moonElements` and `evalMoon` do:

```
τ  = t − epoch
d  = how far t lies outside the window (0 inside);  x = d / taper
w  = 1 inside;  ½(1 + cos πx) for 0 < x < 1;  0 beyond                     (weight of the periodic terms)
τc = τ inside;  (crossed edge − epoch) ± taper·(x − x²/2) for x < 1;  ± taper/2 beyond   (C¹ clamp)

Λ    = l1·τ + l2·τc² (l2·τ² if l.q) + w·Σ_{l.t} (A cos ντ + B sin ντ)
λ    = l0 + Λ + w·Σ_{l.m} (A cos θ + B sin θ)
a    = a0 + a1·τc + w·Σ_{a.m} (A cos θ + B sin θ)
k+ih = z.p[0] + Σ_{z.f} (A+iB)·e^{iντ} + w·Σ_{z.m} (A+iB)·e^{iθ}
q+ip = s.p[0] + Σ_{s.f} (A+iB)·e^{iντ} + w·Σ_{s.m} (A+iB)·e^{iθ}

Kepler (equinoctial): solve λ = F − k sin F + h cos F;  β = 1/(1 + √(1 − k² − h²))
  X = a[(1 − h²β) cos F + hkβ sin F − k],   Y = a[(1 − k²β) sin F + hkβ cos F − h],   c = √(1 − q² − p²)
  r_fit = (X(1 − 2p²) + 2Ypq,  2Xpq + Y(1 − 2q²),  2c(Yq − Xp))
        + w·(Re, Im of Σ_{xy} (A+iB)e^{iθ},  Σ_{zz} (A cos θ + B sin θ))
r_ecl = F · r_fit
```

(q, p) = sin(i/2)(cos Ω, sin Ω) is the vector part of the rotation quaternion that tilts the reference plane onto
the orbit plane. The conversion therefore has no singularity at i = 0 or e = 0, and the orbit normal in the fit
frame is (2cp, −2cq, 1 − 2(q² + p²)).

## Method

1. **Data.** The fit uses Horizons geometric state vectors of each body relative to its centre (ecliptic J2000,
   TDB) on a uniform grid over the fitted span. The grid step is chosen per body from the spectrum of its
   short-period perturbations:

   | Step | Bodies |
   | --- | --- |
   | 0.40 d | Mimas |
   | 0.50 d | Miranda |
   | 0.70 d | Deimos, Enceladus, Tethys, Ariel, the Galileans, Nix, Hydra |
   | 0.90 d | Dione, Rhea, Umbriel |
   | 1.0 d | Titan, Hyperion, Titania, Oberon |
   | 2.0 d | Phobos, Iapetus, Triton, Nereid, Proteus, Charon, Pluto |

   That gives 42 000 to 209 000 epochs per body. Three further sets are fetched separately and are never part of
   the least-squares fit; they measure the error between grid points:
   - a dense window from 2020-01-01, at least a year and 24 orbits long, sampled at 1/16 of the period. It is also
     used to calibrate the effective GM (step 3) and to choose between aliases (step 5).
   - 64 random epochs per body (seeded, reproducible), plus a few outside the window. These are not used by the
     fit at all.
   - the **validation grid**: positions every 6 007 minutes (4.17 days) across the whole window, starting 0.3137 days
     after its start, so that no epoch coincides with a fitted sample (those are whole minutes from the start). That
     is 19 173–19 174 epochs per body, at effectively random phases of every short-period term. It is not used by
     the fit at all, and it is where `rmsKm` comes from.
2. **Reference plane.** The pole of the fit frame is:
   - the Laplace-plane pole from JPL's mean-element table for the moons of Mars, Jupiter, Saturn and Neptune;
   - the IAU pole of the planet for Uranus and the Pluto system;
   - the mean orbit plane for Nereid.

   Its sign is chosen so that every orbit is prograde in its own frame (this flips it for Triton).
3. **Elements.** Each state becomes equinoctial elements (a, λ, k + ih, q + ip) using an effective GM. The GM is
   calibrated on the dense window so that the osculating eccentricity vector has no component rotating with the
   moon. With the point-mass GM, the planet's oblateness would show up as a spurious e ≈ 1.5 J₂(R/a)² at the
   orbital frequency. λ is unwrapped along the grid.
4. **Mean longitude, slow part.** λ is fitted with a quadratic plus periodic terms slower than 0.2 n, found by
   frequency analysis:
   - a Hann²-windowed FFT of the residual;
   - golden-section refinement of the peak frequency;
   - joint linear least squares of all the amplitudes;
   - coordinate Gauss–Newton polishing of every frequency.

   This stage captures the resonant librations (Mimas: 43.3° with a 71.0-year period, against Tethys' 2.1°;
   Hyperion: 9.1° over 1.75 years; Enceladus: 0.26° over 11.0 years), the solar inequalities and so on. It also
   defines Λ(τ), the mean longitude minus its constant.
5. **All elements, with modulated terms.** The remaining λ residual, a, k + ih and q + ip are searched the same way.
   For k + ih and q + ip, the free precession term is found first by a nonlinear fit. The difference from stage 4
   is that each candidate term may have the argument ντ + kΛ for a small integer k: the residual is demodulated by
   e^{−ikΛ} before the FFT, and the strongest peak over all k wins.
   - Short-period terms that ride on the moon's own longitude then stay single terms even when the libration
     shifts their phase by tens of degrees. Examples are J₂ terms, synodic terms, Hyperion's pericentre (locked to
     4λ_H − 3λ_T, which needs |k| up to 4), and the harmonics of the mean anomaly in Nereid's e = 0.75 orbit
     (|k| up to 8).
   - These terms can be fitted from a grid slower than the orbital period, because the fast part of their phase
     is known analytically.
   - For each peak, the search keeps the alias ν + j·2π/h whose total frequency |ν + k·n| is below the grid's
     Nyquist limit, unless the independent dense window clearly contains another alias. That is how Mimas' 2λ
     terms, which its 0.4-day grid cannot resolve, end up at the right frequency.
   - Two guards keep the joint fit well conditioned:
     - no term slower than one cycle per fitted span;
     - no two terms with the same k closer than half a Rayleigh resolution.
6. **Position corrections.** The position residual in the fit frame is searched once more for small periodic
   terms, in x + iy and in z.
7. **Stopping, rounding and measurement.**
   - Each series stops when its strongest remaining peak is below 0.4 % of the body's target (0.8 % for Hyperion),
     in km-equivalent: a·δλ, δa, 2a·δe, 2a·δ sin(i/2). It also stops at 100 terms (150 for Hyperion and Nereid).
   - Amplitudes are rounded to 1 m-equivalent. Each frequency keeps the digits needed for a phase error below 1 m
     over ±45 000 days (at most 15 significant digits).
   - All accuracy figures are computed with the rounded model exactly as shipped.

## Accuracy

The errors below are 3-D position errors against Horizons, in km, computed with the rounded model exactly as shipped.
- **Bound** (`boundKm`) is the figure to quote: 1.25 × Max, rounded up to two figures.
- **Max** is the largest error seen on any set inside the precise window: the fitted grid, the dense window, the
  checkpoints and the validation grid. It is an observed maximum, not a guarantee.
- **RMS** is over the validation grid, out of sample. **Fit RMS** is over the fitted grid, in sample. A fit's own
  samples tend to look better than the epochs between them, because the terms were chosen and fitted there. The gap
  is largest for Proteus (3.7×), whose 2-day grid is slower than its 1.1-day orbit, and 1.5–1.8× for Io, Europa,
  Titan and Nix; for the other 21 bodies out of sample is within 1.22× of in sample.
- **Validation**, **Dense** and **Checkpoints** are the three separately fetched sets on their own. None of them is
  part of the least-squares fit (the dense window steers GM calibration and alias choice only).
- **Independent check** is the worst of 72 fresh Horizons epochs per body from the separate verification
  (40 random epochs, a 16-point burst over one orbit, the window edges, the first year and the last two years).
- The requirement (target) is max(100 km, 5·10⁻⁴ a).

| Body | a (km) | Target | Bound | Max | RMS | Fit RMS | Validation max | Dense max | Checkpoints max | Independent check | JSON |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Phobos | 9,375 | 100 | **2.7** | 2.14 | 0.63 | 0.63 | 2.05 | 1.02 | 1.60 | 1.83 | 2.1 KB |
| Deimos | 23,458 | 100 | **2.3** | 1.82 | 0.67 | 0.67 | 1.75 | 1.59 | 1.07 | 1.35 | 2.5 KB |
| Io | 421,766 | 211 | **21** | 16.0 | 3.76 | 2.49 | 16.0 | 10.3 | 6.82 | 8.10 | 3.6 KB |
| Europa | 671,059 | 336 | **43** | 34.3 | 8.93 | 5.44 | 34.3 | 23.9 | 22.3 | 24.0 | 5.6 KB |
| Ganymede | 1,070,430 | 535 | **55** | 43.8 | 8.24 | 8.21 | 41.3 | 23.6 | 17.3 | 27.5 | 5.7 KB |
| Callisto | 1,882,745 | 941 | **54** | 42.6 | 13.1 | 13.1 | 42.3 | 29.1 | 20.2 | 34.9 | 4.8 KB |
| Mimas | 185,536 | 100 | **10** | 8.00 | 2.03 | 2.03 | 7.47 | 7.11 | 4.07 | 5.62 | 9.2 KB |
| Enceladus | 238,036 | 119 | **14** | 10.7 | 2.49 | 2.08 | 10.7 | 6.99 | 7.15 | 6.77 | 4.2 KB |
| Tethys | 294,673 | 147 | **11** | 8.45 | 2.73 | 2.24 | 8.01 | 6.49 | 5.21 | 3.98 | 5.0 KB |
| Dione | 377,415 | 189 | **9.3** | 7.37 | 2.20 | 2.23 | 6.71 | 5.16 | 5.09 | 5.45 | 4.6 KB |
| Rhea | 527,068 | 264 | **14** | 10.9 | 3.40 | 3.40 | 10.2 | 6.66 | 5.71 | 8.03 | 4.4 KB |
| Titan | 1,221,865 | 611 | **50** | 39.7 | 11.1 | 6.46 | 39.7 | 25.3 | 22.1 | 23.5 | 3.5 KB |
| Hyperion | 1,480,903 | 740 | **460** | 360 | 81.6 | 81.0 | 330 | 269 | 178 | 314 | 21.6 KB |
| Iapetus | 3,560,843 | 1780 | **120** | 95.2 | 31.2 | 31.2 | 95.2 | 88.6 | 65.0 | 71.7 | 7.0 KB |
| Miranda | 129,848 | 100 | **12** | 9.53 | 2.18 | 2.10 | 9.53 | 3.61 | 6.56 | 6.22 | 4.6 KB |
| Ariel | 190,929 | 100 | **7.4** | 5.86 | 1.51 | 1.45 | 4.56 | 4.19 | 5.09 | 5.04 | 5.1 KB |
| Umbriel | 265,981 | 133 | **12** | 9.05 | 2.51 | 2.12 | 9.05 | 7.31 | 6.92 | 6.92 | 6.0 KB |
| Titania | 436,281 | 218 | **18** | 14.2 | 3.10 | 3.10 | 14.2 | 7.95 | 6.49 | 10.6 | 6.2 KB |
| Oberon | 583,449 | 292 | **19** | 14.8 | 3.56 | 3.57 | 14.5 | 9.61 | 7.28 | 11.3 | 6.0 KB |
| Triton | 354,759 | 177 | **13** | 10.4 | 1.88 | 1.88 | 10.3 | 3.38 | 4.31 | 10.2 | 1.9 KB |
| Nereid | 5,493,976 | 2747 | **1900** | 1482 | 137 | 137 | 1183 | 622 | 270 | 818 | 24.8 KB |
| Proteus | 117,647 | 100 | **8.0** | 6.36 | 2.23 | 0.61 | 6.36 | 6.31 | 4.60 | 4.71 | 2.2 KB |
| Charon | 17,464 | 100 | **1.3** | 1.00 | 0.43 | 0.41 | 1.00 | 0.74 | 0.82 | 0.81 | 1.5 KB |
| Nix | 48,689 | 100 | **7.2** | 5.76 | 1.94 | 1.07 | 5.76 | 5.01 | 4.75 | 5.37 | 4.0 KB |
| Hydra | 64,719 | 100 | **4.9** | 3.85 | 1.08 | 1.09 | 3.62 | 3.75 | 2.36 | 2.65 | 3.9 KB |
| Pluto | 2,132 | 100 | **0.75** | 0.60 | 0.28 | 0.25 | 0.60 | 0.55 | 0.50 | 0.52 | 1.5 KB |

The number of periodic terms per body is unchanged (2 926 in all; Mimas 197, Hyperion 512, Nereid 603, the rest
2–137). The JSON column now includes the larger accuracy block.

In PLU060 the Charon–Pluto binary is almost exactly Keplerian: 3 and 2 periodic terms suffice. Nix and Hydra carry
the circumbinary short-period terms, up to 740 km-equivalent in Nix's mean longitude at 2(λ_Charon − λ_Nix).

**Hyperion and Nereid** are the two bodies over the "about 20 KB" guideline:
- Hyperion's orbit is regular, even though its rotation is chaotic. It needs the resonant libration, the
  pericentre locked to Titan and many Titan terms. Its model is 21.6 KB and its bound (460 km) is 62 % of the target.
- Nereid (e = 0.75, strongly perturbed by the Sun) needs many harmonics of its mean anomaly. Its model is 24.8 KB,
  and its bound (1 900 km) is 69 % of the target.
  The 1 482 km worst case is a pericentre passage in mid-2199, half a year before Horizons' NEP098 ends (so the
  fit cannot extend past it). Before 2191 no decade exceeds 940 km. Hyperion's worst case (360 km) is also in the
  last decade; earlier decades stay under 330 km. The validation grid shows the same pattern for Titan (39.7 km on
  2191-01-10) and Io (16.0 km on 2198-01-02): for these bodies the largest errors come in the window's last decade.

Both can be cut below 20 KB by raising their thresholds (`opt.thrFrac` in the build script) if the size matters
more than the margin.

**astronomy-engine `JupiterMoons()`** was compared with Horizons every 2.08 days over 1981–2199 (38 382 epochs),
with positions converted from EQJ using `Rotation_EQJ_ECL`:

| Moon | Max error | RMS error | Target | Fitted model max |
| --- | ---: | ---: | ---: | ---: |
| Io | 952 km | 482 km | 211 km | 16.0 km |
| Europa | 560 km | 213 km | 336 km | 34.3 km |
| Ganymede | 608 km | 282 km | 535 km | 43.8 km |
| Callisto | 896 km | 427 km | 941 km | 42.6 km |

Its error grows steadily after about 2000: Io's worst error in each 20-year block rises from 137 km in 1981–2000
to 952 km in 2181–2199. It therefore misses the requirement for Io, Europa and Ganymede, and the fitted models
replace it. A test cross-checks the fitted models against `JupiterMoons()` to within 2 500 km, which guards
against frame or unit mix-ups during integration.

**Illustrative regime.** `accuracy.illustrativeOutsideKm` lists the errors at the Horizons epochs outside
1981–2199: 1900, 1930, 1960, 1974 and 1980, plus 2210, 2240 and 2290 where Horizons has data. Examples for 1960:

| Body | Error in 1960 |
| --- | ---: |
| Phobos | 20 km |
| Io | 81 km |
| Titan | 378 km |
| Triton | 83 km |
| Ganymede | 2 507 km |
| Mimas | 123 000 km (libration dropped) |
| Hyperion | 154 000 km |

**What the numbers mean.** The models reproduce the Horizons ephemerides. The ephemerides carry their own
uncertainties, which are not included here: from a few km for Phobos, Deimos, the Galileans and the major Saturnian
moons, to hundreds or thousands of km for Nereid and the small moons of Pluto far from the observation epochs.

## Sources and licences

| Data | Source | Licence / credit |
| --- | --- | --- |
| State vectors of all bodies (fitted data, dense windows, checkpoints) | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) API (see the list below) | NASA/JPL-Caltech; US Government work, free to use with credit |
| Laplace-plane poles; mean elements used as starting values; ephemeris references | [JPL Planetary Satellite Mean Elements](https://ssd.jpl.nasa.gov/sats/elem/) (cached as `data-raw/moons/jpl_sats_elem.html`) | NASA/JPL-Caltech |
| Uranus and Pluto pole directions | IAU WGCCRE 2015 (Archinal et al. 2018, *Celest. Mech. Dyn. Astr.* 130:22) | published values |
| Comparison for the Galilean moons | [astronomy-engine](https://github.com/cosinekitty/astronomy) 2.1.19 (already a dependency) | MIT |

The satellite ephemerides behind the Horizons vectors, as Horizons reports them:

| Horizons ephemeris | Bodies | References |
| --- | --- | --- |
| `mar099` | Phobos, Deimos | Brozović, Jacobson & Park (2025), "Revised Ephemerides of the Martian Satellites, Phobos and Deimos", *AJ* |
| `jup365_merged` | Galileans | JUP365: Jacobson (2021), personal communication to Horizons/NAIF |
| `sat441l` | Saturnian moons | SAT441: Jacobson (2022), *AJ* 164:199 |
| `ura184_merged` | Uranian moons | Major moons from URA182: Jacobson & Park (2025), *AJ* 169:65 |
| `nep098_merged` | Neptunian moons | Includes NEP097 (Brozović 2020) and NEP105 (Jacobson 2024, Nereid) |
| `plu060_merged` | Pluto system | PLU060: Brozović & Jacobson (2024), *AJ* 167:256 |

A suggested row for `CREDITS.md`:

| `public/data/moons.json` | Orbit models fitted to [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) satellite ephemerides (MAR099, JUP365, SAT441, URA182/URA184, NEP097/NEP105, PLU060) and the [JPL satellite mean elements](https://ssd.jpl.nasa.gov/sats/elem/) | NASA/JPL-Caltech |

## Rebuilding

```
node scripts/build-moons.mjs                 # everything; writes moons.json and the test fixture
node scripts/build-moons.mjs --only titan    # refit some bodies, keep the others
node scripts/build-moons.mjs --jobs 2        # fewer worker threads (default: cores − 1)
node scripts/build-moons.mjs --validate-only # re-measure the shipped models on the validation grid (no refit)
```

1. **Cache check.** The script first makes sure every Horizons response it needs is in `data-raw/moons/`: one
   gzipped file per request, 202 MB in 279 files (26 of them, 20 MB, the validation grids). Any missing files are
   fetched one at a time, 1.5 s apart, with back-off on errors. Horizons sometimes drops the last grid point of a chunk (its STOP_TIME rounds down), so
   those single epochs are fetched separately by time list.
2. **Fitting.** Worker threads, which never touch the network, do the fitting. A full rebuild takes about 45
   minutes on 5 threads; Hyperion and Nereid take 20 minutes each. The output is deterministic for a given cache
   and Node version.
3. **Validation.** Each fitted model is measured on its validation grid, which fills in `rmsKm`, `maxKm`,
   `boundKm` and `validation`. `--validate-only` does just this for the models already in `moons.json`, without
   refitting (a refit of Phobos through the full path reproduces the validated file byte for byte).
4. **Summary.** The script prints an accuracy table and the astronomy-engine comparison.

The build reads 276 of the 279 cached files. The two unused Horizons files come from exploratory runs and can be
deleted:
- `v2_402_499_2444605.50000_2524593.44375_2887m.txt.gz`: an early Deimos grid at a 2-day step, replaced by the
  0.7-day grid;
- `v2_504_599_2458849.50000_2459213.52639_1502m.txt.gz`: a shorter first version of Callisto's dense window.

The third, `jpl_sats_elem.html`, is kept as the record of where the Laplace poles written into the script came
from.

## Known limitations

- Horizons' satellite ephemerides for Neptune and Pluto stop at 2199-12-30 and 2199-12-29. The precise window ends
  there, one or two days short of 2199-12-31. The illustrative mode takes over smoothly (checked C¹ across the edge),
  and for the last day or two it is still within a few km of where the precise model would be.
- The bounds are measured, not proven. They sit 25 % above the largest of 60 000–230 000 comparisons per body, and no
  independent check has come near them, but a rare configuration (a Nereid pericentre, a Hyperion–Titan
  conjunction) could in principle exceed a body's observed maximum.
- Only positions are modelled. `evalMoonVelocity` differentiates them numerically. Against Horizons velocities in
  the dense 2020 window its error is at most 1.1 m/s for all bodies except Hyperion (2.1 m/s) and Nereid
  (9.0 m/s).
- The illustrative regime is the mean orbit. It is right in shape and orientation, but the moon's phase along the
  orbit drifts away from reality as you move away from the window (by the size of the dropped librations for the
  resonant moons).
