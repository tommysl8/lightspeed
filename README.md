# Lightspeed

**A virtual laboratory for special relativity, set in a true-scale 3D Solar System.**

Every planet sits where it really is today, every distance is to scale, and light takes real time to cross
them: 8 minutes 19 seconds from the Sun to Earth, 5.5 hours to Pluto, almost a full day to Voyager 1. The
simulator is the apparatus for five experiments, each with a procedure, a data table filled by the
instruments, and a least-squares analysis:

| # | Experiment | What you measure |
| --- | --- | --- |
| 1 | Time of flight of a light pulse | Detector times across the Solar System; *c* from a straight-line fit |
| 2 | Time dilation on inertial trips | Ship and Earth clocks on arrival; the exponent p in Δτ = Δt (1 − β²)^p |
| 3 | The relativistic Doppler factor | D against angle from the apex; β from the linearised fit |
| 4 | Aberration of light | Observed against catalogue angles; β from cos θ′ − cos θ = β(1 − cos θ cos θ′), down to Bradley's 20″ from Earth's own motion |
| 5 | Constant proper acceleration | A logged 1 g flight; the proper acceleration from the rapidity, a = c dφ/dτ |

Built with Vite, React, TypeScript and three.js (React Three Fiber). It is a static site with no backend.

By [Tommy Liu](https://github.com/tommysl8).

## First visit

The screen opens on the view alone, with both side panels closed. A welcome screen offers three ways in: a
one-minute **guided tour** that points at each part of the screen, **Experiment 1** (the speed of light, about
15 minutes), or free exploration. Everything else is one click away:

- **Manual** (header, or `?`): a full user manual in twelve chapters, from a quick start to troubleshooting
  and a glossary, with an annotated diagram of the screen and "Try it" buttons that set up what the text
  describes. It lives at `#/manual`, so chapters can be linked (`#/manual/flying`) and printed.
- **About** (`#/about`): what the project is, the author, how to cite it, and its sources, methods and
  limitations.

## The laboratory

- **Lab** (left, `K`). A handbook with notation; the five experiments (aim, background with numbered
  equations, apparatus, a procedure that ticks off as you go, observations, analysis, questions); the notebook;
  and ten reference sections with further reading.
- **Instrument panel** (right). Observer kinematics (v, β, γ, rapidity, dτ/dt); a pair of chronometers (coordinate
  time t and proper time τ, with their difference kept to sub-nanosecond precision); a data sheet for the selected
  body; relativistic-optics readouts; light-time; a live spacetime diagram of the current trip; an ephemeris
  table; and a strip-chart recorder.
- **Viewport instruments.** A reticle whose spectrometer reads θ′ and D, APEX and ANTAPEX markers, a scale bar, an
  ecliptic J2000 axis triad, annunciator lamps (pause, rate, optics, light-time correction, pulses in flight) and
  an event log.
- **Data.** Readings persist in the browser and export as CSV (base units, with 1σ columns). Optional simulated
  instrument uncertainty lets you practise error analysis. Fits are weighted least squares (effective variance
  where both axes carry error) with standard errors and χ²/ν.
- **Lab reports.** Each question has an answer box, and each experiment a conclusion. "Prepare lab report"
  lays out aim, theory, method, data table, both figures, fitted results and answers on a printable A4 page
  (print or save as PDF).
- **Epoch.** Click the epoch to set any UTC instant from 1981 to 2199, with presets for the next oppositions of
  Mars, Jupiter and Saturn (computed with Astronomy Engine). An optional ecliptic coordinate grid (`J`) marks
  longitude on the sky.

## Simulation

- **True scale, floating origin.** Positions are float64 kilometres. The camera never leaves the origin, and orbit
  lines are computed on the GPU relative to each body, so they stay exact from 1 m to 50 AU and beyond. A
  logarithmic depth buffer covers metres to light-years.
- **Real sky and real bodies.** Positions of the Sun, the 8 planets, Pluto and the Moon come from Astronomy
  Engine, which also supplies the IAU rotation models, so Earth's day side is correct for the current moment. The
  scene also has Saturn's rings (with shadows both ways), ~8,900 naked-eye stars from the HYG catalogue coloured
  by temperature, ~32,000 real asteroids, Jupiter Trojans and Kuiper-belt objects from JPL, Voyager 1 (from JPL
  Horizons, dish pointed at Earth) and Proxima Centauri.
- **Two size modes.** *True scale* shows specks, as reality does (planets still shine at their real apparent
  magnitude). *Enlarged* draws bodies at least a few pixels across while keeping every distance true.
- **Travel.** Enter β exactly, or use a logit-scaled fader (0.00001c to 0.99999c) and presets (Voyager 1, Parker
  Solar Probe's record, 0.1c … 0.9999c). The course intercepts where the destination *will* be. The planner
  predicts Δt, Δτ and the contracted length and previews the worldline. The flight recorder shows both clocks and
  the distance left in both frames.
- **1 g rocket.** A realistic flip-and-burn at constant proper acceleration. To Proxima Centauri: 3.54 years
  aboard, 5.87 years on Earth, peak 0.95c.
- **Time.** Real time by default. The simulation rate runs from 10⁰ to 10⁶, plus pause. Above 1 an annunciator
  lights and the viewport is framed.
- **Light pulses.** Emit a pulse from any body. Its wavefront is drawn in the ecliptic and on the sky, and every
  body's detector records the exact crossing time, solved from the ephemeris.
- **Light delay.** The age of Earth's image and the signal time to Earth, plus an optional mode that draws every
  body at its light-delayed (retarded) position.
- **Relativistic optics.** Aberration, Doppler shift and beaming, with a split screen that compares the classical
  and relativistic views.
- **Superluminal drive (fiction).** Faster-than-light travel, marked non-physical throughout. The relativistic
  optics are switched off, τ is flagged undefined, and a reference section explains why it would break causality.
- **Reference notes.** The relevant reference section is suggested in the margin the first time it applies (for
  example, the first time past 0.1c or on the first 1 g flight).

## Run it

Requires Node 22.12+ (or 24+). Vercel's default Node version works.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests: physics, statistics, formatting (vitest)
npm run build      # type-check + static build to dist/
npm run preview    # serve the production build
```

**Deploying to Vercel:** import the repository. Vercel detects Vite, runs `npm run build` and serves `dist/`.
No configuration is needed.

### Controls

| Key | Action |
| --- | --- |
| Drag / scroll, arrow keys, `+` `−` | Orbit / range (log scale); look around in transit |
| Double-click, `0`–`9`, `M`, `V` | Select and slew to a body (Sun, planets, Pluto, Moon, Voyager 1); in transit, select only |
| `H` | Return to Earth |
| `G` | Trajectory planner |
| `F` | Free flight (WASD, Space/R up, C down, Q/E roll, scroll = throttle, Esc to exit) |
| `Space` / `P`, `[` `]` (or `,` `.`), `N` | Pause, simulation rate down/up, back to now (zeroes the chronometers) |
| `Z`, `X` | Relativistic ↔ classical optics, split screen |
| `R` | Record a reading (Experiments 3 and 4; not in free flight) |
| `K`, `I`, `E` | Lab, instrument panel, reference sections |
| `T`, `O`, `L`, `B`, `U`, `J` | True scale ↔ enlarged, orbits, labels, small bodies, viewport overlays, ecliptic grid |
| `?` | Manual: keyboard and mouse |

Shortcuts can be switched off under View › Keyboard shortcuts. Panels, menus, dialogs and the manual work from
the keyboard alone (Tab, arrow keys, Esc).

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
| Typefaces | IBM Plex Sans (IBM), JetBrains Mono (JetBrains), Source Serif 4 (Adobe) | SIL OFL 1.1 |

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
src/sim/       simulation core: clock, chronometers, ephemeris, Voyager, trips, light pulses, light delay
src/lab/       experiments: protocols and analysis, manual text, data loggers, notebook, instrument readings
src/lib/       number formatting (significant figures, SI grouping, units) and least-squares statistics
src/render/    shaders, materials, the relativistic scene pass, post-processing, adaptive quality
src/scene/     React Three Fiber scene components (bodies, stars, belts, orbits, glints)
src/controls/  camera: orbit, free flight, smooth zoom-and-pan flights
src/ui/        interface: docks, instruments, plots, planner, flight recorder, viewport overlays
src/ui/docs/   the manual and About pages, and their figures
src/content/   reference sections, author and version details
scripts/       data builders
```

## Author

**Tommy Liu** ([@tommysl8](https://github.com/tommysl8), tommysliu8@gmail.com) is studying Electrical and Computer
Engineering at the University of Illinois Urbana-Champaign. Corrections, bug reports and ideas for new
experiments are welcome.

## Citing

If you use Lightspeed in teaching or written work:

> Liu, T. (2026). *Lightspeed: A virtual laboratory for special relativity* (Version 0.2.0) [Computer software].

```bibtex
@software{liu_lightspeed_2026,
  author  = {Liu, Tommy},
  title   = {Lightspeed: A Virtual Laboratory for Special Relativity},
  year    = {2026},
  version = {0.2.0}
}
```

The About page in the app gives the same citation with the address of the site it is served from.

## License

Code: [MIT](LICENSE), © 2026 Tommy Liu. The star data files are CC BY-SA 4.0 and the textures are CC BY 4.0, as
listed above.
