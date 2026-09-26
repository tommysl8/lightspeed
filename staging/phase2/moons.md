# Moon orbit models (task D1)

Compact fitted orbit models for 25 moons, plus Pluto about the Pluto–Charon barycentre. They are evaluated in the
browser from `public/data/moons.json`. Every model reproduces JPL Horizons well inside the requirement
max(100 km, 5·10⁻⁴ a) over 1981-01-01 to 2199-12-31 TDB. Relative to their targets, Nereid (54 %) and Hyperion
(49 %) are the worst; every other body is under 10 % of its target. The measured errors are in the table below.

| Item | Path |
| --- | --- |
| Data | `public/data/moons.json` (149 KB, plain JSON) |
| Evaluator | `staging/phase2/src/sim/moonModels.ts` (pure functions, no dependencies) |
| Tests | `staging/phase2/src/sim/moonModels.test.ts` (136 tests) and `staging/phase2/src/sim/__fixtures__/moon-checkpoints.json` (126 KB) |
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
  - `maxKm`: the worst error over the fitted samples inside the window, the independent dense window and the
    independent checkpoints.
  - `rmsKm`, `fitMaxKm`, `denseMaxKm`, `checkpointMaxKm` and `targetKm`.
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

   That gives 42 000 to 209 000 epochs per body. Two further sets are fetched separately and are never part of
   the least-squares fit; they measure the error between grid points:
   - a dense window from 2020-01-01, at least a year and 24 orbits long, sampled at 1/16 of the period. It is also
     used to calibrate the effective GM (step 3) and to choose between aliases (step 5).
   - 64 random epochs per body (seeded, reproducible), plus a few outside the window. These are not used by the
     fit at all.
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

The errors below are 3-D position errors against Horizons, in km.
- **Max** is the worst over the fitted samples inside the precise window, the independent dense window and the
  independent checkpoints.
- **Dense** and **checkpoints** are the two separately fetched sets on their own. Neither is part of the
  least-squares fit; the checkpoints are not used by the fit in any way.
- The requirement (target) is max(100 km, 5·10⁻⁴ a).

| Body | a (km) | Target | Max | RMS | Dense window max | Checkpoints max | Terms | JSON |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Phobos | 9,375 | 100 | **2.1** | 0.6 | 1.0 | 1.6 | 17 | 2.0 KB |
| Deimos | 23,458 | 100 | **1.8** | 0.7 | 1.6 | 1.1 | 26 | 2.3 KB |
| Io | 421,766 | 211 | **12** | 2.5 | 10 | 6.8 | 57 | 3.5 KB |
| Europa | 671,059 | 336 | **31** | 5.4 | 24 | 22 | 106 | 5.4 KB |
| Ganymede | 1,070,430 | 535 | **44** | 8.2 | 24 | 17 | 106 | 5.6 KB |
| Callisto | 1,882,745 | 941 | **43** | 13 | 29 | 20 | 84 | 4.7 KB |
| Mimas | 185,536 | 100 | **8.0** | 2.0 | 7.1 | 4.1 | 197 | 9.0 KB |
| Enceladus | 238,036 | 119 | **8.8** | 2.1 | 7.0 | 7.2 | 72 | 4.0 KB |
| Tethys | 294,673 | 147 | **8.4** | 2.2 | 6.5 | 5.2 | 94 | 4.9 KB |
| Dione | 377,415 | 189 | **7.4** | 2.2 | 5.2 | 5.1 | 84 | 4.5 KB |
| Rhea | 527,068 | 264 | **11** | 3.4 | 6.7 | 5.7 | 76 | 4.3 KB |
| Titan | 1,221,865 | 611 | **27** | 6.5 | 25 | 22 | 48 | 3.3 KB |
| Hyperion | 1,480,903 | 740 | **360** | 81 | 269 | 178 | 512 | 21.5 KB |
| Iapetus | 3,560,843 | 1780 | **93** | 31 | 89 | 65 | 137 | 6.9 KB |
| Miranda | 129,848 | 100 | **9.4** | 2.1 | 3.6 | 6.6 | 81 | 4.5 KB |
| Ariel | 190,929 | 100 | **5.9** | 1.4 | 4.2 | 5.1 | 95 | 5.0 KB |
| Umbriel | 265,981 | 133 | **8.6** | 2.1 | 7.3 | 6.9 | 118 | 5.8 KB |
| Titania | 436,281 | 218 | **14** | 3.1 | 8.0 | 6.5 | 125 | 6.1 KB |
| Oberon | 583,449 | 292 | **15** | 3.6 | 9.6 | 7.3 | 113 | 5.8 KB |
| Triton | 354,759 | 177 | **10** | 1.9 | 3.4 | 4.3 | 13 | 1.8 KB |
| Nereid | 5,493,976 | 2747 | **1482** | 137 | 622 | 270 | 603 | 24.6 KB |
| Proteus | 117,647 | 100 | **6.3** | 0.6 | 6.3 | 4.6 | 20 | 2.0 KB |
| Charon | 17,464 | 100 | **0.8** | 0.4 | 0.7 | 0.8 | 3 | 1.4 KB |
| Nix | 48,689 | 100 | **5.0** | 1.1 | 5.0 | 4.8 | 71 | 3.9 KB |
| Hydra | 64,719 | 100 | **3.9** | 1.1 | 3.8 | 2.4 | 66 | 3.7 KB |
| Pluto | 2,132 | 100 | **0.6** | 0.3 | 0.6 | 0.5 | 2 | 1.3 KB |

In PLU060 the Charon–Pluto binary is almost exactly Keplerian: 3 and 2 periodic terms suffice. Nix and Hydra carry
the circumbinary short-period terms, up to 740 km-equivalent in Nix's mean longitude at 2(λ_Charon − λ_Nix).

**Hyperion and Nereid** are the two bodies over the "about 20 KB" guideline:
- Hyperion's orbit is regular, even though its rotation is chaotic. It needs the resonant libration, the
  pericentre locked to Titan and many Titan terms. Its model is 21.5 KB and meets the target with a factor of two
  in hand.
- Nereid (e = 0.75, strongly perturbed by the Sun) needs many harmonics of its mean anomaly. Its model is 24.6 KB.
  The 1 482 km worst case is a pericentre passage in mid-2199, half a year before Horizons' NEP098 ends (so the
  fit cannot extend past it). Before 2191 no decade exceeds 940 km. Hyperion's worst case (360 km) is also in the
  last decade; earlier decades stay under 330 km.

Both can be cut below 20 KB by raising their thresholds (`opt.thrFrac` in the build script) if the size matters
more than the margin.

**astronomy-engine `JupiterMoons()`** was compared with Horizons every 2.08 days over 1981–2199 (38 382 epochs),
with positions converted from EQJ using `Rotation_EQJ_ECL`:

| Moon | Max error | RMS error | Target | Fitted model max |
| --- | ---: | ---: | ---: | ---: |
| Io | 952 km | 482 km | 211 km | 11.8 km |
| Europa | 560 km | 213 km | 336 km | 30.5 km |
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
```

1. **Cache check.** The script first makes sure every Horizons response it needs is in `data-raw/moons/`: one
   gzipped file per request, 182 MB in 253 files. Any missing files are fetched one at a time, 1.5 s apart, with
   back-off on errors. Horizons sometimes drops the last grid point of a chunk (its STOP_TIME rounds down), so
   those single epochs are fetched separately by time list.
2. **Fitting.** Worker threads, which never touch the network, do the fitting. A full rebuild takes about 45
   minutes on 5 threads; Hyperion and Nereid take 20 minutes each. The output is deterministic for a given cache
   and Node version.
3. **Summary.** The script prints an accuracy table and the astronomy-engine comparison.

The build reads 250 of the 253 cached files. The two unused Horizons files come from exploratory runs and can be
deleted:
- `v2_402_499_2444605.50000_2524593.44375_2887m.txt.gz`: an early Deimos grid at a 2-day step, replaced by the
  0.7-day grid;
- `v2_504_599_2458849.50000_2459213.52639_1502m.txt.gz`: a shorter first version of Callisto's dense window.

The third, `jpl_sats_elem.html`, is kept as the record of where the Laplace poles written into the script came
from.

## Known limitations

- Horizons' satellite ephemerides for Neptune and Pluto stop at 2199-12-30 and 2199-12-29. The precise window ends
  there, one or two days short of 2199-12-31. The illustrative mode takes over smoothly.
- Only positions are modelled. `evalMoonVelocity` differentiates them numerically. Against Horizons velocities in
  the dense 2020 window its error is at most 1.1 m/s for all bodies except Hyperion (2.1 m/s) and Nereid
  (9.0 m/s).
- The illustrative regime is the mean orbit. It is right in shape and orientation, but the moon's phase along the
  orbit drifts away from reality as you move away from the window (by the size of the dropped librations for the
  resonant moons).
