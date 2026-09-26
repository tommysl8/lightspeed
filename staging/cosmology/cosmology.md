# Cosmology and the relativistic rocket in an expanding universe (staging/cosmology)

This area is the physics core for flying anywhere in the universe: a flat Lambda-CDM background (Planck 2018),
a relativistic rocket that obeys the equations of motion in that expanding spacetime, a policy for when to use
static space instead (the Local Group), the optics of looking out from the ship, and a "home clock" that says
what has happened at home by the time a traveller arrives. Pure TypeScript, float64, no dependencies.
Written 25 September 2026.

```
npx vitest run --root staging/cosmology                  # 87 tests, about 2 s
node staging/cosmology/tools/trip-table.ts                # prints every number quoted in this file
node scripts/build-cosmology-future.mjs                   # rebuilds staging/cosmology/future.json
python staging/cosmology/fixtures/make_fixtures.py        # rebuilds src/fixtures/reference.json (numpy, scipy, astropy)
```

## Files

| File | What |
| --- | --- |
| `src/constants.ts` | SI and astronomical constants (exact SI values, CODATA G, IAU au/pc/Julian year) |
| `src/quadrature.ts` | Gauss-Legendre (nodes computed, not transcribed), adaptive Gauss-Kronrod 7/15, compensated sums |
| `src/neutrinos.ts` | energy density of a massive neutrino (exact Fermi-Dirac integral, tabulated) |
| `src/cosmology.ts` | `Cosmology` class: H(a), t(a) and a(t), conformal time, distances, particle/event horizons, Hubble sphere |
| `src/ode.ts`, `src/rootfind.ts` | Dormand-Prince 5(4) integrator with exact output points; Brent's method |
| `src/ship.ts` | the rocket: flip-and-burn and cruise planners (expanding and static space), input validation, reachability, max reach, round trips, playback |
| `src/policy.ts` | Local Group policy (static vs expanding space) and `planTrip` |
| `src/appearance.ts` | emission time, redshift, distances, Tolman dimming, Doppler and aberration, GPU lookup table + GLSL |
| `src/future.ts` | home clock: the Sun, the Earth, the Local Group, the CMB at any cosmic time |
| `src/index.ts` | public surface |
| `future.json` | literature values for the home clock (14.6 kB, 4.6 kB gzipped), built by `scripts/build-cosmology-future.mjs` |
| `src/fixtures/reference.json` | reference values from an independent Python implementation and astropy |
| `fixtures/make_fixtures.py` | generator of the reference values |
| `tools/trip-table.ts` | prints the tables below |

No binary data files are shipped: every table is computed at start-up in about 45 ms (see Performance).

## 1. The background universe

### Model and parameters

Planck 2018 results VI (Planck Collaboration 2020, A&A 641, A6, arXiv:1807.06209), table 2, last column
(TT,TE,EE+lowE+lensing+BAO): H0 = 67.66 +- 0.42 km/s/Mpc, Omega_m = 0.3111 +- 0.0056, flat. Planck's base model
has three neutrino species, "approximated as two massless states and a single massive neutrino of mass 0.06 eV",
N_eff = 3.046, and its Omega_m includes that massive neutrino. We use exactly that model:

```
E^2(a) = (H/H0)^2 = Om_cb a^-3 + Og a^-4 [1 + f_nu (2 + r(y a))] + OL
  Og     photons at T_cmb = 2.72548 K (Fixsen 2009; Planck used 2.7255 K: 1e-8 in the age, 1.5e-5 in t(a = 1e-6))
  f_nu   = 7/8 (4/11)^(4/3) N_eff/3, one neutrino species relative to photons while relativistic
  r(y)   = F(y)/F(0), F(y) = int_0^inf q^2 sqrt(q^2 + y^2) / (e^q + 1) dq, y = m c^2 / (k T_nu0) = 357.9 today
  Om_cb  = Omega_m - (massive neutrino density today)
  OL     = 1 - Omega_m - Og (1 + 2 f_nu)                      (exactly flat)
```

The neutrino density turns from radiation (a^-4) into matter (a^-3) around y a ~ 3, i.e. z ~ 100. We integrate
the Fermi-Dirac distribution exactly (no fitting formula). Which convention for N_eff: the N_eff/3 factor multiplies
each species' density at the standard neutrino temperature (4/11)^(1/3) T_cmb, which is what astropy does; it
gives m_nu / (Omega_nu h^2) = 92.64 eV. CAMB and the Planck papers instead raise the neutrino temperature by
(N_eff/3)^(1/4), which gives 93.0 eV for this model (Planck quotes 93.14 eV). Switching to their convention
changes the age by 1.5e-8, chi(z = 1) by 3e-10 and chi(z = 1100) by 4e-7, far below the parameter errors, so
"exactly that model" above means the same physical content, with astropy's bookkeeping.

| Quantity | Value |
| --- | --- |
| Omega_gamma (T = 2.72548 K) | 5.401857e-5 |
| Omega_nu, two massless species | 2.491224e-5 |
| Omega_nu, 0.06 eV species (today; nearly all rest mass) | 1.414765e-3 |
| Omega_cb (baryons + CDM) | 0.30968523 |
| Omega_Lambda | 0.68882107 (Planck: 0.6889 +- 0.0056) |
| z of matter-radiation equality (CAMB convention) | 3387.7 (Planck: 3387 +- 21) |
| Age today | **13.78658 Gyr** (Planck: 13.787 +- 0.020) |
| Cosmic time at z = 1100 | 366.5 kyr |
| Cosmic time at a = 1e-6 | 2.3826e7 s (276 days) |
| Particle horizon today (radius of the observable universe, comoving) | 14,164.75 Mpc = **46.199 Gly** |
| Cosmic event horizon today (comoving) | 5,083.75 Mpc = **16.581 Gly** |
| Hubble sphere today (c/H0) | 4,430.87 Mpc = 14.451 Gly |
| Total conformal time eta(infinity) = particle horizon at the end of time | 19,248.50 Mpc = 62.780 Gly |
| Redshift, seen today, of a galaxy now on the event horizon | 1.8525 |

Horizons at other times (comoving, a = 1 today): at a = 0.5 (t = 5.851 Gyr) particle 35.124 Gly, event 27.656 Gly;
at a = 2 (t = 24.884 Gyr) 54.134 and 8.646 Gly; at a = 10 (t = 52.750 Gyr) 61.039 and 1.741 Gly. The event
horizon's proper size a chi_EH tends to c/H_Lambda = c / (H0 sqrt(Omega_Lambda)) = 5,338 Mpc. The comoving
Hubble sphere shrinks too and approaches the event horizon from inside.

How much the modelling choices matter (all within Planck's error bars):

| Variant | Age (Gyr) | chi(z=1) (Mpc) | chi(z=1100) (Mpc) |
| --- | --- | --- | --- |
| This model | 13.78658 | 3395.585 | 13885.91 |
| All three neutrinos massless (same Omega_m) | 13.78592 | 3395.541 | 13882.15 |
| Omega_m from Omega_m h^2 = 0.14240 (0.311061) | 13.78706 | 3395.661 | 13886.60 |
| T_cmb = 2.7255 K | 13.78658 | 3395.585 | 13885.91 |
| astropy Planck18 built-in (Om0 = 0.30966, fitting formula) | 13.78689 | 3395.634 | 13886.33 |

### Functions (all in `Cosmology`; `planck18()` returns a shared instance)

- `E(a)`, `H(a)` (km/s/Mpc), `Edlna(a)` (E and d ln E / d ln a), `densities(a)`.
- `timeGyr(a)`, `ageGyr()`, `scaleAtTimeGyr(t)`; dimensionless `timeLn(l)`, `lnAtTime(t)` (l = ln a, t in 1/H0).
- `comovingDistanceMpc(z)`, `comovingBetweenMpc(a1, a2)`, `comovingBetweenTimesMpc(t1, t2)`, `lookbackTimeGyr(z)`,
  `luminosityDistanceMpc(z)`, `angularDiameterDistanceMpc(z)`, `distanceModulus(z)`, `redshiftAtComovingMpc(chi)`.
- `particleHorizonMpc(a)`, `eventHorizonMpc(a)` (comoving; multiply by a for proper), `hubbleSphereMpc(a)`.
- `conformalLn`, `eventHorizonLn`, `lnAtConformal`, `lnAtEventHorizon`, `lnEmission(lObs, chi)`: the building
  blocks in c/H0 units. `timeAfterLn(l0, dl)`, `comovingAfterLn(l0, dl)`, `emissionSpanLn(lObs, chi)` (= ln(1+z),
  looking back) and `arrivalSpanLn(l1, chi)` (its forward twin: how much the universe grows while light emitted at
  l1 covers chi) take or return the span itself, so that tiny intervals keep full relative precision (a trip to
  Proxima changes ln a by 4e-10; home is then seen at z = 2.9e-10, correct to all digits).
- `eventHorizonPreciseLn(l)`: the event horizon to full float64 precision (nearest node plus a direct integral,
  about 1 microsecond), for measuring small distances from the horizon. At a = 1 it equals the 30-digit value
  5,083.753660044278 Mpc to the last digit; the interpolated table is 6e-10 Mpc (1.2e-13) off there.
- `cmbTemperatureK(a)` = T0/a.

### Numerical method and error bounds

A master table on a uniform grid in l = ln a from a = 1e-10 to just above 1e4, step 1/32 (1,032 cells), holds
t, eta (conformal time = comoving particle horizon) and chi_EH, together with their first and second derivatives in
l, which are known in closed form: dt/dl = 1/E, deta/dl = 1/(aE), d2t/dl2 = -(dlnE/dl)/E, and so on. Each cell is
integrated with 8-point Gauss-Legendre and the running sums are compensated (Neumaier); t and eta are summed
upwards from a closed-form start at a = 1e-10 (radiation + matter, where Lambda and the neutrino mass are below
1e-15), chi_EH downwards from a closed form at a = 1e4 (matter + Lambda, where radiation is below 1e-20). Between
nodes, quintic Hermite interpolation. Outside the grid the closed forms are used directly, so every function is
defined from a = 0 to a = e^700.

Measured errors (dense scan, 5 points per cell, against Gauss-Legendre from the nodes): **t 1.3e-12** (worst near
a = 4e-10), **eta 2.5e-13, chi_EH 6.3e-13**, relative (the requirement was 1e-8 on t(a) over a = 1e-6 to 1e3).
Differences over short spans (|Delta ln a| < 2: lookback times, comoving distances, the time between two nearby
epochs) are integrated directly with 16-point Gauss-Legendre on panels of 1/4 in l instead of subtracting two
large numbers, so they keep full relative precision down to z = 1e-6. Inverses (a(t), a(eta), a(chi_EH),
emission time) use a bracketing search over the nodes followed by Newton's method with the exact derivative;
round trips agree to 1e-13 in ln a from a = 1e-12 to 1e40, and the functions are strictly monotone.

Caveat: like astropy and CAMB, t(a) integrates this model down to a = 0. The real thermal history before e+e-
annihilation (a < ~1e-9) had more relativistic species, which changes t(a) by less than 1e-6 at a >= 1e-6. That
is a limitation of the model, not of the numerics.

### Validation (`cosmology.test.ts`, `neutrinos.test.ts`)

- An independent Python implementation (`fixtures/make_fixtures.py`: scipy `quad` at epsrel 1e-13, the Fermi-Dirac
  integral nested inside, no shared code) of the same model: E(a) to 4e-16, t(a) for a = 1e-6 to 1e3 to 1.1e-12,
  eta to 1.6e-13, chi(z) for z = 0.001 to 1100 to 1.5e-13, chi_EH(a) for a = 0.001 to 1000 to 2.1e-13, lookback
  to 5e-14.
- astropy 8.0.1 `FlatLambdaCDM` with massless neutrinos (the same physics as ours with `mNuEv: []`): comoving,
  luminosity and angular-diameter distances, lookback times and E(z) to 1e-13; ages to 6e-13 except at z = 1100,
  where astropy's own age integral is off by 5e-7 (ours matches the independent integration there).
- astropy with m_nu = [0, 0, 0.06] eV: agreement to 2e-6 in chi and 1.5e-5 in age at z = 1100, which is the
  accuracy of the neutrino fitting function astropy uses (Komatsu et al. 2011, ApJS 192, 18, eq. 26).
- Planck 2018: age 13.787 +- 0.020 Gyr (ours 13.7866), z_eq = 3387 +- 21 (ours 3387.7), Omega_Lambda.
- The massive-neutrino table matches direct quadrature to 7e-14 over y = 1e-5 to 1e3, with both hand-overs (small-y
  series, large-y asymptotic series with moments computed by quadrature) continuous.

## 2. The ship

### Derivation

Flat FLRW, ds^2 = -c^2 dt^2 + a(t)^2 (dchi^2 + chi^2 dOmega^2). A straight radial path is a straight line in
comoving Cartesian coordinates, so take ds^2 = -c^2 dt^2 + a^2 dx^2 along it. Write the ship's four-velocity as
U = (dt/dtau, dx/dtau) and define u = a (dx/dtau) / c: the peculiar four-velocity gamma*beta measured by the
comoving observer the ship is passing. Normalisation -c^2 (dt/dtau)^2 + a^2 (dx/dtau)^2 = -c^2 gives

```
dt/dtau = sqrt(1 + u^2) = gamma,      dx/dtau = c u / a,      v_pec = a dx/dt = c u / gamma.
```

**Free particles.** Spatial translations are isometries of flat FLRW, so xi = d/dx is a Killing vector and
U . xi = a^2 dx/dtau = a c u is conserved along geodesics: **a u = const**. Peculiar momentum decays as 1/a.

**With thrust.** For a Killing vector, d(U . xi)/dtau = alpha . xi, where alpha is the four-acceleration. alpha is
orthogonal to U, lies in the (t, x) plane and has magnitude A (the proper acceleration the crew feels). The unit
vector orthogonal to U is e = (u/c, gamma/a) in (t, x) components (with g = diag(-c^2, a^2):
U . e = -c gamma u + c u gamma = 0 and e . e = gamma^2 - u^2 = 1), so alpha = A e and
alpha . xi = a^2 alpha^x = A a gamma. Hence
d(a c u)/dtau = A a gamma, and with d a/dtau = a H gamma:

```
du/dtau = gamma (A/c - H u) = (A/c) sqrt(1 + u^2) - H u sqrt(1 + u^2)
```

the commonly quoted form, here derived rather than assumed. Dividing by gamma = dt/dtau gives the cleaner form
**d(a u)/dt = a A / c**, so for constant A: a u - a0 u0 = (A/c) int a dt. With the rapidity w = asinh(u):

```
dw/dtau    = A/c - H(a) sinh w         thrust minus "Hubble drag"
dt/dtau    = cosh w
dx/dtau    = c sinh w / a              comoving distance (a = 1 today)
d ln a/dtau = H(a) cosh w
```

**A speed limit you cannot feel.** du/dt = A/c - H u relaxes u towards A/(cH). Because H(t) >= H_Lambda =
H0 sqrt(Omega_Lambda) at all times, (1/a) int a dt < 1/H_Lambda and so u < A/(c H_Lambda) strictly. At 1 g the
peculiar Lorentz factor relative to the local galaxies can never exceed **1.797e10**, however long the engine runs.
The ship still approaches the speed of light; it just stops gaining on the local Hubble flow, which is itself
racing away from home. At 300 g the cap is 5.4e12.

**The light lag.** The planner also integrates L = eta - chi, the conformal time since departure minus the
comoving distance covered, i.e. how far the ship trails a light signal sent from home as it left:

```
dL/dtau = c (cosh w - sinh w) / a = c e^-w / a          (no cancellation at any speed)
```

Two exact identities make L useful. The light from home that reaches the ship left home at conformal time
eta_dep + L, so what the traveller sees of home follows from L alone (`home.emissionAfterDepartureYr`,
`ShipState.homeSeenAfterDepartureYr`). And since eta(a) - eta(a_dep) = chi_EH(a_dep) - chi_EH(a),

```
chi_EH(a_dep) - chi = chi_EH(a) + L
```

so the distance of the ship inside the event horizon at departure is the sum of two small, precisely known
numbers instead of the difference of two large ones. Targets beyond half the event horizon are solved in that
form (the flip time is found from chi_EH(a_arr) + L = distance of the target inside the horizon), which keeps
near-horizon trips exact.

**Independent checks.** `ship.test.ts` flies the planned burn schedules again in two other formulations.
(1) Comoving momentum p = (a/a_dep) u with cosmic time as the independent variable, dp/dt = +-(a/a_dep) A/c,
dchi/dt = c u / (gamma a), a(t) from the cosmology table: no rapidity and no Hubble-drag term. The arrival distance
agrees to 2e-12 and the ship arrives at rest to 1e-11 of its peak momentum, for Virgo, z = 0.5, z = 1 and 5,000 Mpc.
(2) The equations from the Christoffel symbols in conformal coordinates (ds^2 = a^2(eta)(-deta^2 + dx^2)):
dU^eta/dtau = -Hc ((U^eta)^2 + (U^x)^2) + A U^x, dU^x/dtau = -2 Hc U^eta U^x + A U^eta, Hc = a'/a. That formulation
cancels terms of order gamma ~ 1e10 near the end of the trip, so it only confirms the arrival distance and scale
factor to ~2e-7 and the peak u to 1e-9; it is kept as a check that the equations themselves agree. An independent
integrator written for the verification of this module (different variables, DOP853 at rtol 3e-14) reproduced the
ship times to 8e-14 and the cosmic times, arrival scale factors and peak gammas to 1e-12.

### Numerical method

- Dimensionless variables: time unit t_u = c/A (0.9689 yr at 1 g), length unit c t_u (0.9689 ly),
  eps(a) = t_u H(a) (6.7e-11 today at 1 g). State (w, ln(a/a_dep), T, chi, K, L) with K = int (a/a_dep) dt and L
  the light lag.
  Differences from departure are carried as such (never ln a itself), so a trip to Proxima, which changes ln a
  by 4e-10, keeps full precision.
- Dormand-Prince 5(4) (`ode.ts`), rtol 1e-12, local extrapolation, output points landed exactly.
- The acceleration phase runs in ship proper time. The deceleration phase uses the rapidity itself as independent
  variable (dw/dtau = -A/c - H sinh w < 0 is monotone), so "at rest on arrival" is hit exactly, with no event
  detection. The cruise's acceleration phase does the same up to the cruise rapidity.
- Flip-and-burn: the arrival distance increases monotonically with the flip time, which Brent's method finds
  (typically 5-25 evaluations). The acceleration leg caches its steps, so each trial integrates only from the
  nearest checkpoint plus the deceleration. Targets beyond half the event horizon use the horizon-relative form
  above; the cruise does the same near its speed limit (while holding u_c the ship covers exactly beta_c of the
  conformal time, so its distance short of the limit is beta_c chi_EH(a)).
- Accuracy: tightening rtol from 1e-12 to 1e-13 changes the z = 1 trip's ship time by 6e-14 and its cosmic time by
  4e-13. The identity a u - a0 u0 = (A/c) int a dt holds to 3e-12 on every trip (`diagnostics.conservation`), and
  the cosmic time integrated along the trip matches t(a_arr) - t(a_dep) from the table to 1e-13
  (`diagnostics.tableTime`).
- Input validation: distances must be positive and finite, the acceleration at least `MIN_ACCEL_M_S2` = 1e-6 g
  (9.8e-6 m/s^2, a weak ion drive; below ~5e-11 g the Hubble time is shorter than c/A and the engine cannot even
  reach u = 1 against the drag), the departure scale factor between `DEPARTURE_SCALE_MIN` = 1e-4 and
  `DEPARTURE_SCALE_MAX` = 1e6, the ship-time limit positive, the cruise speed below c. Anything else returns
  `invalid-input`. A trip is not followed beyond ln(a/a_dep) = 550. Every planner catches integrator or root-finder
  failures and returns `numerical-failure` instead of throwing (none occurs in the tests). `maxReach` throws a
  RangeError on invalid input.
- Robustness: a randomised sweep of 400 trips (0.01 to 1000 g, departures from a = 0.05 to 20, distances from
  1e-9 Mpc to beyond the horizon, one in five a cruise, one in five with a 30-year limit) planned or properly
  refused every one (rerun after the changes of this revision: 375 planned, 23 refused for the ship-time limit,
  2 beyond the event horizon), with arrival distance within 8.6e-13, the a*u identity within 1.9e-12, the
  table-time check within 4.2e-13, and at most 26 ms per plan. A 100-trip version runs in the test suite. A 1e-6 g engine to
  100 Mpc plans in 8 ms (11.3 million years aboard); cruises aimed within 1e-14 of the cruise-speed limit plan in
  under 20 ms (they take 490 Gyr of ship time).
- Stable at any speed: rapidity is carried instead of beta (beta rounds to 1 above gamma ~ 1e8). Tested at
  gamma = 1e12 in the flat limit and at gamma = 2.6e12 (300 g to z = 1, 0.19 years aboard) in FLRW.

### Planners (`ship.ts`)

- `planFlipAndBurn(cosmo, chiMpc, {accel, departureScale, maxShipTimeYr, rtol, samples})`: accelerate at A,
  flip, decelerate at A, arrive at rest relative to the comoving observers at comoving distance chiMpc
  (a = 1 today). Default 1 g = 9.80665 m/s^2, departure today.
- `planCruise(cosmo, chiMpc, {cruiseU | cruiseGamma | cruiseBeta, ...})`: accelerate to u_c, hold u_c against the
  Hubble drag (the engine then supplies A_hold = c H u_c, which falls with H; reported in g at the start and end
  of the cruise), decelerate. Falls back to flip-and-burn (with `cruise.reached = false`) when the target is too
  close to reach u_c.
- `planStatic(cosmo, distanceMpc, opts)`: special-relativistic flip-and-burn in static space, closed form:
  tau = (2c/A) arccosh(1 + A d / (2c^2)), t = (2c/A) sinh(A tau / 2c), peak gamma = 1 + A d / (2c^2). Validates
  its inputs like the FLRW planners and honours `maxShipTimeYr` (reach in ship time T: 2 (cosh(A T / 2c) - 1) c^2/A).
  Returns `TripPlan | Unreachable`.
- `planStaticCruise(cosmo, distanceMpc, {cruiseU | cruiseGamma | cruiseBeta, ...})`: accelerate, coast, decelerate
  in static space (closed form; no thrust is needed to hold a speed there), with the same fallback to flip-and-burn
  when the target is too close to reach the cruise speed.
- `planTrip(cosmo, destination, opts)`: picks static or FLRW by the Local Group policy (section 3) and passes
  `maxShipTimeYr` and cruise requests to whichever planner it uses.
- `planRoundTrip`, `maxReach(cosmo, shipTimeYr)`, `stateAtShipTime(trip, tauYr)`, `sampleAt(samples, tauYr)`,
  `tripSummary(trip)` (plain JSON).

A `TripPlan` gives: ship time, cosmic time elapsed, peak gamma, u and rapidity; departure and arrival scale factor
and cosmic time; the stretch a_arr/a_dep - 1; the proper distance at arrival; the CMB temperature at arrival;
**home as seen on arrival** (the redshift and emission time of the light from home reaching the traveller, and
`emissionAfterDepartureYr`, that emission time counted from departure, computed from the light lag without
cancellation); the destination as seen from home at departure; the event horizon at departure; the phases;
playback samples; and diagnostics.

Playback: `samples` holds 1,000 evenly spaced points in ship time (plus both sides of each phase boundary) with
tau, cosmic time since departure, chi, u, ln a and their tau-derivatives. `sampleAt` interpolates them with cubic
Hermite polynomials. Measured worst errors over a 4,000-point scan, relative to the trip distance (chi), the peak
u (u) and the cosmic time of the trip (t), and absolute in ln a (which sets the redshift of everything the
traveller sees):

| Trip | chi | u | t | ln a |
| --- | --- | --- | --- | --- |
| Virgo (16.5 Mpc) | 2.0e-9 | 3.9e-9 | 1.9e-9 | 7e-12 |
| z = 0.5 | 3.1e-8 | 8.6e-8 | 1.7e-8 | 1.1e-8 |
| z = 1 | 7.8e-8 | 3.3e-7 | 4.1e-8 | 5.2e-8 |

For far trips pass more samples (the error falls as the fourth power of the spacing) or use `stateAtShipTime`,
which gives the exact state by re-integrating from the nearest step of the trip's own integration (same accuracy
as the plan; a few microseconds to a millisecond), including `homeSeenAfterDepartureYr`.

### Reachability

Every refusal is a structured `Unreachable` with `reason`, a sentence, the target distance and the event horizon:

- `beyond-event-horizon`: chi >= chi_EH(t_departure). Not even light sent at departure ever arrives, so no ship
  can. Today this is chi >= 5,083.75 Mpc, i.e. anything we now see at z > 1.8525.
- `beyond-reach`: inside the event horizon but within its last L_inf, the light lag a ship starting from rest
  accumulates while accelerating for ever (it can never be recovered). L_inf = (c^2/A)(1 - 3.3e-11) / a_dep at 1 g:
  **2.970094e-7 Mpc = 0.968715 ly** inside the horizon, computed by integrating the lag (converged to 1e-15) and
  refused analytically. `maxChiMpc` gives the limit.
- `ship-time-limit` (with `maxShipTimeYr`): the target needs more ship time than allowed; `maxChiMpc` gives the
  furthest distance reachable in that time.
- `beyond-reach-at-cruise-speed`: a cruise at beta covers at most beta chi_EH after the acceleration phase.
- `cruise-speed-unattainable`: u_c above 0.99 A/(cH) at departure.
- `invalid-input`: see the validation rules above; `numerical-failure`: an integrator or root-finder error (a
  structured refusal instead of an exception).

Near the horizon, the ship time grows only logarithmically: each factor of 100 closer to the horizon costs about
4.5 more years aboard (54.061 yr to 1 Mpc inside it, 58.522 yr to 0.01 Mpc, 67.786 yr to 1e-6 Mpc, 73.08 yr to
3.0e-7 Mpc, just outside the limit). These are planned in the horizon-relative form and agree with the independent
verification integrator to its precision.

## 3. Bound structures do not expand: the Local Group policy (`policy.ts`)

Gravitationally bound systems are decoupled from the Hubble flow. The Local Group's zero-velocity surface has radius
R0 = 0.96 +- 0.03 Mpc around the Local Group barycentre, which lies 0.55 +- 0.05 of the way from the Milky Way to
M31 (Karachentsev, Kashibadze & Makarov 2009, MNRAS 393, 1265). Policy:

- destination inside R0 of the barycentre (or flagged `bound: true` by a catalogue): **static** space, special
  relativity (`planStatic`); home is not redshifted, only delayed by the light-travel time;
- otherwise: **FLRW** (`planFlipAndBurn` / `planCruise`).

With a position the test is geometric (the default M31 position is the one in `staging/cosmos/named.json`:
2MASS position, 0.761 Mpc from Li et al. 2021). With a distance only, the rule is conservative: static below
R0 - 0.55 D_M31 = 0.541 Mpc, the nearest the surface comes to us.

The two models agree where the policy switches. In our universe the FLRW ship time exceeds special relativity by a
fraction that grows with distance: below 1e-9 for Proxima, 1e-7 for the Galactic Centre, 6e-6 for M31, 1.0e-5 at the far
edge of the zero-velocity surface (1.38 Mpc). In a universe with H0 scaled down by 1e15 the FLRW planner reproduces
tau = (2c/A) arccosh(1 + A d / 2c^2) to 1e-10 from 200 au to gamma = 1e12, and the difference from special
relativity scales in proportion to H0 (tested).

Galaxies just outside R0 (1-3 Mpc) follow a Hubble flow slowed by the Local Group's gravity (Karachentsev et al.
measure H_loc = 78 km/s/Mpc with 25 km/s scatter); the FLRW planner treats them as comoving, a difference far below
the effects it models. Not modelled anywhere: the gravitational potentials of galaxies and clusters (clock-rate
effects of order Phi/c^2 ~ 1e-6), the peculiar velocities of home (370 km/s relative to the CMB) and of the
target (a few hundred km/s), which shift a trip by hours to days.

## 4. What the traveller sees (`appearance.ts`)

For an observer at scale factor a_o and a comoving galaxy at comoving separation chi (from the ship's current
comoving position; flat space, so separations are Euclidean in comoving coordinates):

```
eta(a_e) = eta(a_o) - chi                     emission time (light moves one comoving unit per unit conformal time)
1 + z = a_o / a_e                             cosmological redshift
D_A = a_e chi,  D_L = a_o^2 chi / a_e         angular-diameter and luminosity distances
I_bol ~ (1 + z)^-4                            Tolman surface-brightness dimming
```

Null geodesics of flat FLRW are straight lines in comoving Cartesian coordinates (the metric is conformally flat),
so a comoving observer sees each galaxy in its comoving direction. The ship's peculiar motion then Doppler shifts and
aberrates, exactly as in special relativity, and the factors multiply:

```
D  = gamma (1 + beta n.v) = [e^w (1 + n.v) + e^-w (1 - n.v)] / 2        (no cancellation at any speed)
n' = [n + ((cosh w - 1) n.v + sinh w) v] / D                            (apparent direction)
   = (n - (n.v) v) / D + cos' v,   cos' = (n.v + beta) / (1 + beta n.v)  (as evaluated: exact behind the ship too)
nu_obs / nu_emit = D / (1 + z);   black body at T seen at T D/(1+z);   I_bol x (D/(1+z))^4;   point flux D^2 L / (4 pi D_L^2)
```

`aberrateDirection` evaluates the second form: the textbook form cancels catastrophically directly behind the
ship, which is where home lies on a radial trip (at w = 20 it returned the zero vector). The second form returns
exactly -v there at any rapidity and agrees with the textbook form to 1e-14 elsewhere (tested).

`appearance(cosmo, aObs, chiMpc, w, cosRest)` returns all of these plus emission and lookback time, and flags
sources outside the particle horizon or emitted before last scattering (z_* = 1089.80, Planck table 2).

`lastVisibleEmissionTimeGyr`: a comoving source is only ever seen up to the cosmic time at which it crossed our
event horizon (Loeb 2002, Phys. Rev. D 65, 047301). For galaxies we now see at z = 1, 2, 3, 5, 10 the last light
we will ever receive left them at t = 20.6, 13.1, 9.8, 6.8 and 4.2 Gyr. The Virgo cluster (16.5 Mpc) crosses our
event horizon at t = 113.3 Gyr (a = 324), in line with the ~100 Gyr of Krauss & Scherrer (2007).

**GPU / bulk table.** `buildEmissionTable(cosmo)` returns 1,024 float32 values g(v) = ln a - v on a uniform grid of
v = ln(eta / chi_EH), covering a = 1e-5 to 1e5, and a GLSL ES 3.0 snippet. In a shader, with uniforms uEtaObs =
particle horizon of the observer, uChiEHObs = event horizon of the observer (Mpc) and uLnAObsTable = the table's
own ln a at chi = 0 (`emissionLnAFast(table, eta, chiEH, 0)`), all set from the CPU each frame:

```
v = log((uEtaObs - chi) / (uChiEHObs + chi));     ln a_e = v + g(v)
ln(1 + z) = uLnAObsTable - ln a_e                 (emissionLn1pZ in the snippet)
```

Writing v with the two horizons keeps numerator and denominator free of cancellation for observers at any epoch,
and ln a is asymptotically linear in v at both ends, so g is smooth and bounded. The snippet reads four texels
with `texelFetch` and interpolates with a Catmull-Rom cubic computed in the shader (quadratic extrapolation past
the ends of the table); hardware filtering is not used, because it interpolates with low-precision weights (often
8 bits) on many GPUs. Taking ln(1 + z) as a difference of two table lookups cancels most of the table error for
nearby sources. Requirements: `precision highp float` (declared in the snippet), and the R32F texture uploaded
with NEAREST min and mag filters and no mipmaps (R32F is not filterable in WebGL2 without an extension; with a
mipmap filter the texture is incomplete and reads return zero).

Measured errors (dense scan of the table; redshifts for observers at a = 0.24, 0.5, 1, 3 and 100 and sources from
0.01 Mpc to 0.9 of the particle horizon; float32 checked by rounding every GLSL operation to float32):

| | float64 (CPU twin) | float32 (shader) |
| --- | --- | --- |
| ln a_e, whole table | 4.9e-8 | 1.4e-7 |
| ln(1 + z), absolute | below 1e-7 | below 1.5e-6 |
| z, relative, for sources beyond 1 Mpc | below 1e-5 | below 5e-3 |

In float32 the absolute error of ~1e-6 in ln(1 + z) is set by the rounding of v, so for sources closer than about
1 Mpc (z < 2e-4) it is a large fraction of z itself; nothing visible depends on it (the Doppler colour shift is
~1e-6), but displayed numbers should come from the CPU functions. (The previous linear table had 2.1e-5 in ln a
and up to 32 % error in z for a source 0.1 Mpc from an observer today.)
`emissionLnAFast` and `emissionLn1pZFast` are the CPU twins, for tens of thousands of galaxies per frame; the exact
`emissionScale` costs about 6 microseconds per call.

## 5. The home clock (`future.json`, `future.ts`)

`future.json` holds literature values with their sources; `homeAt(cosmo, timeGyr)` and
`homeReport(cosmo, arrivalTimeGyr, seenTimeGyr)` turn them into statements with honest probabilities, for both the
present at home (at the traveller's cosmic time) and what the light arriving from home shows.

- **The Sun**: Schroeder & Smith (2008, MNRAS 386, 155) table 1, a 1 Msun model with detailed mass loss, ages from
  the zero-age main sequence (present = 4.58 Gyr; the Solar System is 4.5673 Gyr old, Connelly et al. 2012). ZAMS
  0.70 L_sun; hottest at +2.55 Gyr (5,820 K, 1.26 L_sun); main sequence ends at +5.42 Gyr (1.84 L_sun, 1.37 R_sun);
  red-giant tip at **+7.59 Gyr** (2,730 L_sun, 256 R_sun = 1.2 au, 0.668 M_sun); helium burning for 130 Myr; AGB tip
  at +7.72 Gyr; then a **0.54 M_sun white dwarf**. Main-sequence L, R and T are interpolated between the tabulated
  rows (log-linear); later phases are reported by name, because the paper does not tabulate the ascent.
- **The Earth**: leaves the habitable zone in about 1 Gyr ("a rather rough estimate", same paper); engulfed at
  +7.59 +- 0.05 Gyr.
- **Local Group**: LMC merges with the Milky Way in 2.4 (+1.2 -0.8) Gyr (Cautun et al. 2019) or 1.3 Gyr median
  (Sawala et al. 2025); M33 merges with M31 with probability 0.86 (median 3.3 Gyr). **Milky Way-Andromeda**: Sawala
  et al. (2025, Nature Astronomy 9, 1206) find a merger within 10 Gyr in only about half of the orbits allowed by
  current data. `future.json` holds their cumulative probability, digitised from the vector paths of their Fig. 3
  (the plotted vertices themselves, so reading error < 0.1 percentage point): 1.4% by 5 Gyr, 3.5% by 6 Gyr, 17% by
  7 Gyr, 33% by 8 Gyr, 45% by 9 Gyr, 52.4% by 10 Gyr, median 7.6 Gyr for the orbits that merge. Beyond 10 Gyr the
  study says nothing and neither does the code. The older, more confident estimate (van der Marel et al. 2012:
  first pericentre in 3.87 Gyr, merger in 5.86 Gyr) is kept for context.
- **Cosmos**: T_CMB = 2.72548 +- 0.00057 K today (Fixsen 2009), T0/a later. The CMB becomes unobservable from
  inside a galaxy once the universe has grown by ~1e8 more (Krauss & Scherrer 2007); star formation ends around
  1e12-1e14 yr (Adams & Laughlin 1997).
- **The extragalactic sky** (`extragalacticSky(cosmo, timeGyr)`, and a statement in `homeAt` from 10 Gyr on): for
  four landmarks in `future.json`, the M81 group (3.626 Mpc) and the Centaurus A group (3.637 Mpc) (Cosmicflows-4,
  Tully et al. 2023), the Virgo cluster (16.5 Mpc, Mei et al. 2007) and the Coma cluster (98.5 Mpc, Scolnic et al.
  2025), it computes from this module's cosmology when each crosses the cosmic event horizon and the redshift at
  which home sees it. Coma crosses at +68.4 Gyr, Virgo at +99.5 Gyr (t = 113.3 Gyr), the M81 and Centaurus A groups
  at +125.8-125.9 Gyr. A galaxy is never seen to cross: its old light keeps arriving, redshifted exponentially and
  fading. At +100 Gyr Virgo is seen at z = 1.03 and the M81 group at z = 0.23; at +200 Gyr Virgo at z = 321; at
  +1000 Gyr at z ~ 3e22. Krauss & Scherrer place true invisibility of everything outside the merged Local Group
  "within a time frame comparable to the longest lived main sequence stars" (10^12 years and more), and the
  statement says so only from +1000 Gyr on. Limitation: the landmarks are treated as comoving points; the M81 and
  Centaurus A groups recede somewhat slower than the Hubble flow (Karachentsev et al. 2009), so their crossing
  times are approximate.

Example (the z = 1 trip below, arriving 18.93 Gyr after departure): "The Sun is a white dwarf. The Earth is gone,
swallowed by the red-giant Sun 11 Gyr earlier. The Large Magellanic Cloud has merged with the Milky Way. Within
the first 10 Gyr the Milky Way and Andromeda merged in about 52% of the orbits allowed by today's measurements; the
study stops at 10 Gyr, so later outcomes are unknown. The cosmic microwave background is at 0.863 K." Yet the light
arriving from home left it only 1.276 years after departure (`home.emissionAfterDepartureYr` = 1.275583 yr): a
relativistic ship arrives right behind its own departure light, so through a telescope home still looks as it did.
For a fast flip-and-burn the gap tends to (c/A)(1 + a_dep/a_arr): 1.934 yr for Virgo, 1.545 yr for z = 0.5,
1.276 yr for z = 1 (in static space it is (2c/A)(1 - e^-w_peak), 1.626 yr for Proxima, 1.937 yr for M31). The
earlier text of this file said 1.27 years and "2c/A": the first came from subtracting two 32.7 Gyr cosmic times
(it lost 3e-3 yr), the second holds only in static space.

## 6. Example trips

All at 1 g, departing today, flip-and-burn, arriving at rest. Distances: Proxima 1.302 pc (Gaia DR3 parallax
768.0665 mas), Sgr A* 8.277 kpc (GRAVITY Collaboration 2022), M31 0.761 Mpc (Li et al. 2021), Virgo 16.5 Mpc (Mei
et al. 2007). Planning took 1-20 ms each.

| Destination | Distance | Model | Ship time | Time at home | Peak gamma | a at arrival | Home seen at z | Static-space SR ship time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Proxima Centauri | 1.302 pc | static | 3.54208 yr | 5.873 yr | 3.192 | 1 | 0 (bound) | 3.54208 yr |
| Galactic Centre (Sgr A*) | 8.277 kpc | static | 19.8302 yr | 27.00 kyr | 1.393e4 | 1 | 0 (bound) | 19.8302 yr |
| Andromeda (M31) | 0.761 Mpc | static | 28.5895 yr | 2.482 Myr | 1.281e6 | 1 | 0 (bound) | 28.5895 yr |
| Virgo cluster | 16.5 Mpc | FLRW | 34.5535 yr | 53.92 Myr | 2.783e7 | 1.003735 | 0.0037345 | 34.5499 yr |
| galaxy at z = 0.5 | 1,946.40 Mpc comoving | FLRW | 44.3190 yr | 8.191 Gyr | 4.125e9 | 1.682253 | 0.68225 | 43.7922 yr |
| galaxy at z = 1 | 3,395.58 Mpc comoving | FLRW | 46.0408 yr | 18.93 Gyr | 8.810e9 | 3.156779 | 2.1568 | 44.8704 yr |
| galaxy at z = 3 | 6,503.85 Mpc comoving | refused | beyond the event horizon (5,083.75 Mpc) | | | | | 46.130 yr |

For Andromeda the FLRW planner would give 28.5896 yr (the policy flies it in static space). For the far targets
the expanding universe costs 0.5-1.2 years more than special relativity: the destination recedes while the ship
travels, and the Hubble drag caps the peculiar Lorentz factor.

**Maximum reach at 1 g** (flip-and-burn, departing today; `maxReach`):

| Ship time | Comoving distance | Redshift at which home now sees a galaxy there | Flip at | Arrival: cosmic time | a at arrival | Peak gamma |
| --- | --- | --- | --- | --- | --- | --- |
| 30 yr | 1.5758 Mpc (5.14 Mly) | 3.557e-4 | 15.000 yr | 13.792 Gyr | 1.00036 | 2.65e6 |
| 50 yr | 5,019.3 Mpc (16.371 Gly) | **1.8120** | 27.139 yr | 89.57 Gyr | 82.85 | 1.750e10 |
| 100 yr | 5,083.753659747 Mpc (16.581 Gly) | **1.8525** | 77.13 yr | 987.8 Gyr | 2.1e24 | 1.797e10 |

The jump between 30 and 50 years is real: distance grows exponentially with ship time until the Hubble drag
saturates the Lorentz factor, after which the ship coasts towards the event horizon. With 100 years it is already
at the absolute limit, 2.970094e-7 Mpc (0.968715 ly) inside the horizon, the same distance as with 1,000 years
(`maxReach` reports `insideEventHorizonMpc` and `saturated: true`), arriving a trillion years after departure. (An
earlier version of this file said "within 0.007 Mpc"; that was wrong.)

**Round trips at 1 g**: Virgo and back, 34.5535 + 34.5608 = 69.1143 yr aboard and 108.03 Myr at home (the way back
is longer because the universe has grown by 0.37% meanwhile). A z = 0.5 galaxy and back, 44.3190 + 45.7606 =
90.0796 yr aboard and 24.99 Gyr at home. A z = 1 galaxy and back is impossible: on arrival (a = 3.157) the event
horizon has shrunk to 1,688.17 Mpc, and home is 3,395.58 Mpc away.

**Cruise**: Virgo at gamma = 1000 takes 53,929.013 yr aboard and 53.916 Myr at home; holding u = 1000 against the
Hubble drag needs 6.7032e-8 g at the start, 6.6916e-8 g at the end. In static space (Local Group targets) the same
request uses `planStaticCruise`: 0.3 Mpc at gamma = 100 takes 9,793.5 yr aboard and 978,520 yr at home.

## 7. Integration notes

- Units: Mpc and Gyr at the API, years for trip times, m/s^2 for accelerations; internally c/H0 and 1/H0. The app
  works in km: 1 Mpc = `MPC_KM` = 3.0856775814913673e19 km. Comoving coordinates are normalised to a = 1 today.
- Frames: these functions are scalar along the flight path. Place the ship at comoving position
  chi(tau) * n_hat, where n_hat is the unit vector from home to the target in the app's heliocentric J2000
  ecliptic frame (world = (x_ecl, z_ecl, -y_ecl)); galaxies sit at their comoving positions (a = 1 today, e.g. from
  `staging/cosmos`). Each frame, for each galaxy, the comoving separation from the ship gives its emission time,
  redshift, D_A (size) and D_L (brightness) via `appearance` or the GPU table; the direction is the comoving
  direction, then aberrated with the ship's rapidity.
- Distances in catalogues: a luminosity distance D_L converts to comoving as D_L / (1 + z); a distance-modulus
  or Cepheid distance to a nearby galaxy is the comoving distance to within z.
- Time: a trip's `departure.timeGyr` / `arrival.timeGyr` are cosmic times since the big bang; "now" is
  `ageGyr()` = 13.78658 Gyr. `samples.dtYr` is the home clock since departure.
- Performance (Node 24 on the development laptop): building `Cosmology` (master table plus the neutrino table)
  takes about 45 ms, once; build it lazily when the traveller first leaves the Solar neighbourhood, or in a worker.
  E(a) costs about 60 ns, a table lookup of t(a) 30 ns, an exact emission time 6 microseconds, a trip plan 1-20 ms.
  The planners are synchronous and allocation-light; run them off the render loop.
- Consistency with `staging/cosmos/src/cosmology.ts`: that module uses T = 2.7255 K and a fitted radiation density
  in which the massive neutrino is matter at all times. Measured against this one: chi(z) agrees to 3.9e-9 at
  z = 0.1, 8.7e-8 at z = 1, 4.1e-7 at z = 3, 2.0e-6 at z = 10 and 3.6e-4 at z = 1100; the age today to 7.0e-6 and
  the age at z = 10 to 1.8e-4. Using this module everywhere keeps the app self-consistent.
- No files are loaded at run time except `future.json` (import it as JSON; 4.6 kB gzipped). Nothing here needs
  DecompressionStream.

## 8. Sources

- Planck Collaboration 2020, "Planck 2018 results. VI. Cosmological parameters", A&A 641, A6,
  doi:10.1051/0004-6361/201833910, arXiv:1807.06209 (table 2; base model with one 0.06 eV neutrino, section 2).
- Fixsen, D. J. 2009, "The temperature of the cosmic microwave background", ApJ 707, 916,
  doi:10.1088/0004-637X/707/2/916, arXiv:0911.1955 (T0 = 2.72548 +- 0.00057 K).
- BIPM 2019, The International System of Units, 9th ed. (exact c, h, k_B, e); Tiesinga et al. 2021, Rev. Mod.
  Phys. 93, 025010 (CODATA 2018 G); IAU 2012 B2 and 2015 B2 (au, parsec).
- Lesgourgues, J. & Pastor, S. 2006, "Massive neutrinos and cosmology", Phys. Rep. 429, 307, arXiv:astro-ph/0603494
  (neutrino energy density); Komatsu et al. 2011, ApJS 192, 18, arXiv:1001.4538 (the fitting function astropy uses).
- Davis, T. M. & Lineweaver, C. H. 2004, "Expanding confusion: common misconceptions of cosmological horizons and
  the superluminal expansion of the Universe", PASA 21, 97, doi:10.1071/AS03040, arXiv:astro-ph/0310808 (horizons,
  Hubble sphere, definitions used here).
- Karachentsev, I. D., Kashibadze, O. G., Makarov, D. I. et al. 2009, "The Hubble flow around the Local Group",
  MNRAS 393, 1265, doi:10.1111/j.1365-2966.2008.14300.x, arXiv:0811.4610 (R0 = 0.96 Mpc, barycentre at 0.55 D_M31).
- Li, S., Riess, A. G., Busch, M. P. et al. 2021, ApJ 920, 84, doi:10.3847/1538-4357/ac1597, arXiv:2107.08029 (M31 at
  761 +- 11 kpc).
- Mei, S. et al. 2007, ApJ 655, 144, arXiv:astro-ph/0702510 (Virgo at 16.5 Mpc).
- GRAVITY Collaboration 2022, A&A 657, L12 (R0 = 8.277 kpc, as used by `staging/galaxy`); Gaia DR3 (Proxima).
- Loeb, A. 2002, Phys. Rev. D 65, 047301, doi:10.1103/PhysRevD.65.047301, arXiv:astro-ph/0107568 (last light).
- Tully, R. B. et al. 2023, "Cosmicflows-4", ApJ 944, 94, doi:10.3847/1538-4357/ac94d8 (M81 and Centaurus A group
  distances for the home clock's landmarks); Scolnic, D., Riess, A. G. et al. 2025, ApJL 979, L9,
  doi:10.3847/2041-8213/ada0bd (Coma cluster at 98.5 Mpc).
- Krauss, L. M. & Scherrer, R. J. 2007, Gen. Rel. Grav. 39, 1545, doi:10.1007/s10714-007-0472-9, arXiv:0704.0221.
- Schroeder, K.-P. & Connon Smith, R. 2008, "Distant future of the Sun and Earth revisited", MNRAS 386, 155,
  doi:10.1111/j.1365-2966.2008.13022.x, arXiv:0801.4031.
- Connelly, J. N. et al. 2012, Science 338, 651, doi:10.1126/science.1226919 (age of the Solar System).
- Sawala, T., Delhomelle, J., Deason, A. J. et al. 2025, "No certainty of a Milky Way-Andromeda collision", Nature
  Astronomy 9, 1206, doi:10.1038/s41550-025-02563-1, arXiv:2408.00064 (open access, CC BY 4.0).
- van der Marel, R. P. et al. 2012, ApJ 753, 9, doi:10.1088/0004-637X/753/1/9, arXiv:1205.6865.
- Cautun, M. et al. 2019, MNRAS 483, 2185, doi:10.1093/mnras/sty3084, arXiv:1809.09116.
- Adams, F. C. & Laughlin, G. 1997, Rev. Mod. Phys. 69, 337, doi:10.1103/RevModPhys.69.337, arXiv:astro-ph/9701131.
- Numerical methods: Dormand, J. R. & Prince, P. J. 1980, J. Comput. Appl. Math. 6, 19; Hairer, Norsett & Wanner,
  "Solving Ordinary Differential Equations I" (2nd ed., Springer 1993); Brent, R. P. 1973, "Algorithms for
  Minimization without Derivatives"; Piessens et al. 1983, "QUADPACK" (Gauss-Kronrod 7/15).
- Reference values: astropy 8.0.1 (Astropy Collaboration 2022, ApJ 935, 167), scipy 1.18.1, used only to generate
  `src/fixtures/reference.json`.

## 9. Licences and credits

- All code here is original and falls under the project's MIT licence.
- `future.json` contains numerical results quoted from the papers above with citations (facts, not reproduced
  text or figures). The one derived dataset, the Milky Way-Andromeda merger probability curve, is digitised from
  Fig. 3 of Sawala et al. (2025), published open access under CC BY 4.0; the credit line below satisfies the
  attribution. The arXiv source tarball it was read from stays in `data-raw/cosmology/` (gitignored, not shipped).
- `src/fixtures/reference.json` holds numbers we computed (with astropy and scipy as tools); no third-party data.
- No Gaia tables, images or other third-party files are shipped by this area.

Rows to add to `CREDITS.md` if `future.json` (or a copy under `public/data/`) ships with the app:

```
| `future.json` (home clock) | Milky Way-Andromeda merger probability digitised from Fig. 3 of Sawala et al. 2025, [Nature Astronomy 9, 1206](https://doi.org/10.1038/s41550-025-02563-1); solar evolution values from Schröder & Connon Smith 2008, [MNRAS 386, 155](https://doi.org/10.1111/j.1365-2966.2008.13022.x); other values from the papers cited in the file | Sawala et al. figure data: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Other entries are published numerical results, quoted with citation. |
```

and under "Other sources used by the code, but not redistributed as files":

```
- Cosmology: Planck 2018 cosmological parameters (Planck Collaboration 2020, A&A 641, A6) and the CMB temperature of
  Fixsen (2009); the Local Group zero-velocity radius of Karachentsev et al. (2009). Test reference values computed
  with astropy and scipy.
```

## 10. Honest labels (what is a model)

- The background is the Planck 2018 best fit of base Lambda-CDM; the real universe's parameters carry the Planck
  uncertainties (age +-20 Myr, event horizon about +-1%), and the Hubble-constant tension means local measurements
  prefer H0 ~ 73 km/s/Mpc. The code takes any parameter set.
- The universe is treated as exactly homogeneous beyond the Local Group: galaxies are comoving points, the ship
  flies straight through empty space, and nothing is gravitationally deflected.
- The ship is a point with a perfect engine: constant proper acceleration without fuel limits (a perfect photon
  rocket needs a mass ratio of e^(A tau / c) = e^47.5 ~ 4e20 for the z = 1 trip), no shielding against the blueshifted CMB (at
  gamma = 1e10 the forward CMB is ~5e10 K) or interstellar gas.
- The Local Group boundary is sharp in the code and fuzzy in nature; the switch changes ship times by 1e-5 at most.
- The home clock quotes models: the Sun's future from one well-tested stellar model (other models differ by
  ~0.1-0.5 Gyr in the red-giant timing), and the Milky Way-Andromeda merger as probabilities from one Monte Carlo
  study, with no statement beyond 10 Gyr. The extragalactic landmarks are comoving points in this cosmology.
- Near the event horizon the answers are exact for this model, but the model itself is uncertain there: the event
  horizon carries the Planck parameter errors (about +-1%, i.e. +-50 Mpc), so "0.97 light-years inside the horizon"
  is a statement about the model, not about any real galaxy.

## 11. Changes after the independent verification (25 September 2026)

An independent check (own derivation of the equations of motion, own integrator, astropy, 30-digit arithmetic for
the event horizon) confirmed the physics and every trip number, and found the following, all fixed here:

1. `aberrateDirection` cancelled catastrophically directly behind the ship (home, on a radial trip): it now keeps
   the parallel and perpendicular parts apart and returns exactly -v there at any speed.
2. `home.emissionTimeGyr` lost ~3e-3 yr by subtracting two 32.7 Gyr times. The planner now carries the light lag
   L and converts it without cancellation; new field `home.emissionAfterDepartureYr` (1.275583 yr for z = 1).
3. The 100-year maximum reach is at the absolute limit, not "within 0.007 Mpc" of the horizon (section 6).
4. The beyond-reach sliver is 2.970094e-7 Mpc = 0.968715 ly (was quoted as 2.98e-7, from a subtraction). It is now
   computed from the lag and refused analytically; near-horizon trips are planned relative to the horizon, using the
   new `eventHorizonPreciseLn` (exact to float64), so their ship times keep full precision (67.786 yr at 1e-6 Mpc).
5. The planners threw on extreme inputs (1e-11 g, cruise targets within 1e-13 of the limit). Inputs are validated
   (`MIN_ACCEL_M_S2` = 1e-6 g, departure scale 1e-4 to 1e6), cruises near their limit are solved exactly, the
   brackets are capped, and any integrator error becomes a `numerical-failure` refusal.
6. The static branch ignored `maxShipTimeYr` and cruise requests and accepted non-positive inputs: `planStatic` now
   validates and honours the limit, and the new `planStaticCruise` handles cruises in static space.
7. The home clock said the sky beyond the Local Group is dark after +100 Gyr. It now computes, for four landmarks,
   when each crosses the event horizon and the redshift at which it is still seen (section 5).
8. The GPU table now uses a cubic lookup (error 4.9e-8 instead of 2.1e-5 in ln a) and gives ln(1 + z) as a
   difference of two lookups; the snippet declares `precision highp float` and the texture requirements are stated.
9. Playback errors are now quoted from a 4,000-point scan, including the error in ln a.
10. The comparison with `staging/cosmos` is quoted as measured (8.7e-8 in chi at z = 1, not 1.4e-5).
11. The neutrino bookkeeping convention (astropy's, 92.64 eV) and its difference from CAMB/Planck's are stated.
