# Lightspeed

**A true-scale 3D Solar System you can fly through at (and, as clearly labelled fiction, past) the speed of light.**

Every planet sits where it really is today, every distance is to scale, and light really takes time to cross
them: 8 minutes 19 seconds from the Sun to Earth, 5.5 hours to Pluto, almost a full day to Voyager 1. Pick a
destination and a speed. The trip then plays out in real time (or time-warped), with Earth time and ship time
counting side by side. Push toward *c* and the sky transforms: stars crowd ahead, turn blue, and brighten; the
view behind reddens and fades. Explainers cover the physics, with the equations, as you go.

Built with Vite, React, TypeScript and three.js (React Three Fiber). It is a static site with no backend.

## Features

- **True scale, floating origin.** Positions are float64 kilometres. The camera never leaves the origin, and orbit
  lines are computed on the GPU relative to each body, so they stay exact from 1 m to 50 AU and beyond. A
  logarithmic depth buffer covers metres to light-years.
- **Real sky and real bodies.** Positions of the Sun, the 8 planets, Pluto and the Moon come from Astronomy
  Engine, which also supplies the IAU rotation models, so Earth's day side is correct for the current moment. The
  scene also has Saturn's rings (with shadows both ways), ~8,900 naked-eye stars from the HYG catalogue coloured
  by temperature, ~32,000 real asteroids, Jupiter Trojans and Kuiper-belt objects from JPL, Voyager 1 (from JPL
  Horizons, dish pointed at Earth) and Proxima Centauri.
- **Two size modes.** *True scale* shows specks, as reality does (planets still shine at their real apparent
  magnitude). *Visible* enlarges bodies to at least a few pixels while keeping every distance true.
- **Travel.** Pick a speed from 0.00001c to 0.99999c on a logit-scaled slider, or use a preset (Voyager 1, Parker
  Solar Probe's record, 0.1c … 0.9999c). The course intercepts where the destination *will* be. The HUD shows
  speed, γ, the distance left in the Sun's frame and as measured aboard (d/γ), Earth time and ship time.
- **1 g rocket.** A realistic flip-and-burn at constant proper acceleration. To Proxima Centauri: 3.54 years
  aboard, 5.87 years on Earth, peak 0.95c.
- **Time.** Real time by default. Time warp runs from 10× to 1,000,000× (with an unmistakable indicator), plus
  pause.
- **Light delay.** "You are seeing Earth as it was X ago" and "a message would take X", plus an optional mode
  that draws every body at its light-delayed (retarded) position.
- **Relativistic optics.** Aberration, Doppler shift and beaming, with a split screen that compares the classical
  and relativistic views.
- **"Beyond c" warp.** Faster-than-light travel, labelled as fiction, with relativistic effects switched off and
  an explainer on why FTL breaks causality.
- **Explainers.** Ten short topics with KaTeX equations. Each surfaces automatically the first time it becomes
  relevant.

## Run it

Requires Node 22.12+ (or 24+). Vercel's default Node version works.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # physics unit tests (vitest)
npm run build      # type-check + static build to dist/
npm run preview    # serve the production build
```

**Deploying to Vercel:** import the repository. Vercel detects Vite, runs `npm run build` and serves `dist/`.
No configuration is needed.

### Controls

| Key | Action |
| --- | --- |
| Drag / scroll | Orbit / zoom (log scale) |
| Double-click, `0`–`9`, `M`, `V` | Fly to a body (Sun, planets, Pluto, Moon, Voyager 1) |
| `G` | Plan a trip |
| `F` | Free flight (WASD, Space/C up/down, Q/E roll, scroll = throttle, Esc to exit) |
| `Space` / `P`, `[` `]`, `N` | Pause, time warp down/up, back to now |
| `Z`, `X` | Relativistic ↔ classical view, split-screen comparison |
| `T`, `O`, `L`, `B` | True scale ↔ visible, orbits, labels, belts |
| `E`, `?` | Physics explainers, all shortcuts |

## How it works

**Floating origin.** All simulation state lives in float64 (plain JS numbers) in a heliocentric frame aligned with
the J2000 ecliptic. Each frame, every object's render position is `world − camera`, subtracted in float64 before
anything reaches the GPU. Near objects therefore get sub-metre precision, and far objects only lose precision far
below a pixel. Orbit lines use an anomaly offset from the body (`r(E₀+ΔE) − r(E₀)`, written with half-angle
identities) so they pass exactly through each planet at any zoom. The belts solve Kepler's equation per point in
the vertex shader.

**Relativistic rendering** (`src/render/LightspeedScenePass.ts`) replaces the usual scene render before bloom and
tone mapping:

1. Everything except point sources is rendered into an HDR cube map from the ship's position. Alpha records
   surface coverage.
2. Stars, planet glints and belt objects are drawn directly in the ship frame. Each gets its exact aberrated
   direction and its Doppler-shifted blackbody temperature T′ = D·T, from a Planck/CIE lookup, with the matching
   change in visible brightness.
3. A full-screen pass takes each pixel's ship-frame direction θ′, finds the rest-frame direction with
   `tan(θ/2) = k tan(θ′/2)`, where `k = √((1+β)/(1−β))`, and samples the cube map. That is the same law as
   `cos θ = (cos θ′ − β)/(1 − β cos θ′)`, but stable in float32 up to 0.99999c. The sample uses a mip level set by
   the aberration Jacobian, and the result is recoloured for Doppler shift and beaming.
4. Bloom and AgX tone mapping are applied last, in the observer's frame, with automatic exposure.

## Physics notes

- Constants and body data live in `src/physics/constants.ts`, each with its source. All physics is pure,
  unit-tested TypeScript in `src/physics/`: Lorentz factor, time dilation, aberration, Doppler, beaming,
  light-time solvers, Kepler and universal-variable propagation, the relativistic rocket, blackbody colour and
  the Doppler colour matrices.
- **Beaming:** radiance (surface brightness) scales as D⁴. A point source's flux, seen by a *moving observer*,
  scales as D², because aberration also compresses its solid angle. The tests check this against the textbook
  energy-density boost γ²(1+β²/3) of an isotropic radiation field. The rendered brightness is visible-band: the
  shifted Planck curve seen through the CIE observer.
- **Approximations** (also noted in the app):
  - Planets and other rendered surfaces use an approximate spectral model for Doppler colour: sunlight times a
    smooth reflectance. Stars are exact blackbodies.
  - Constant-speed trips boost and stop instantly.
  - Stars are drawn from the Sun's viewpoint, without parallax, except Proxima Centauri.
  - Planets are lit without 1/r² dimming, as if your eyes adapt.
  - Trips ignore gravity.
- **Voyager 1** is propagated as a two-body hyperbola around the Solar System's total mass from a JPL Horizons
  barycentric state (2026-01-01). It matches Horizons to ~7 parts per million ten years either side. Around
  18 November 2026 it becomes one light-day from Earth.

## Data and credits

| What | Source | Licence |
| --- | --- | --- |
| Planet, Moon, Pluto positions and rotation | [Astronomy Engine](https://github.com/cosinekitty/astronomy) (Don Cross) | MIT |
| Physical data | [NASA Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) | US Government work |
| Voyager 1 state vectors | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | NASA/JPL-Caltech |
| Asteroids, Trojans, TNOs (`public/data/belts.bin`) | [JPL Small-Body Database](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html) | NASA/JPL-Caltech |
| Stars (`public/data/stars.bin`, `star-names.json`) | [HYG Database v4.4](https://codeberg.org/astronexus/hyg) (David Nash) | **CC BY-SA 4.0**; these derived files are CC BY-SA 4.0 too |
| Planet, Sun and ring textures | [Solar System Scope](https://www.solarsystemscope.com/textures/) (INOVE) | CC BY 4.0 |
| Pluto map | [NASA/JHUAPL/SwRI](https://www.nasa.gov/image-article/pluto-global-color-map/) (New Horizons) | NASA media, public domain |
| Proxima Centauri | Gaia DR3 (distance), Boyajian et al. 2012 (radius), Ségransan et al. 2003 (temperature) | — |
| Colour science | CIE 1931 fit by Wyman, Sloan & Shirley (2013); B−V→T by Ballesteros (2012) | — |
| Inter typeface | Rasmus Andersson | SIL OFL 1.1 |

Libraries: three.js, React Three Fiber and postprocessing (pmndrs), zustand, KaTeX, Tailwind CSS, Vite, Vitest.

### Regenerating the data files

```bash
# Star catalogue: download hyg_v44.csv.gz from https://codeberg.org/astronexus/hyg into data-raw/
npm run data:stars
# Minor bodies: queries the JPL SBDB API (cached in data-raw/)
npm run data:belts
```

## Project layout

```
src/physics/   pure, unit-tested physics (constants, relativity, light time, Kepler, rocket, colour)
src/sim/       simulation core: clock, ephemeris, Voyager, trips, light delay, per-frame derived values
src/render/    shaders, materials, the relativistic scene pass, post-processing, adaptive quality
src/scene/     React Three Fiber scene components (bodies, stars, belts, orbits, glints)
src/controls/  camera: orbit, free flight, smooth zoom-and-pan flights
src/ui/        overlay: HUDs, cards, planner, explainers, labels
src/content/   explainer text
scripts/       data builders
```

## License

Code: [MIT](LICENSE). The star data files are CC BY-SA 4.0 and the textures are CC BY 4.0, as listed above.
