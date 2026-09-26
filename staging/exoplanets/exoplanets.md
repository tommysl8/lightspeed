# Exoplanets: data, featured systems and orbit evaluator

Status on 25 September 2026. This area of `staging/` covers every confirmed exoplanet from the NASA Exoplanet
Archive, eleven featured systems built from their papers, and a tested evaluator. The evaluator turns any orbit
into positions in the app's frame.

| File | What it is | Size |
| --- | --- | --- |
| `public/data/exoplanets.json.gz` | All 6,372 confirmed planets and their 4,779 host stars, column-oriented JSON, gzipped | 404,120 B (1,384,493 B raw) |
| `staging/exoplanets/featured.json` | Eleven featured systems, 38 planets and candidates. Every value is cited, and every assumption is written out | 137 KB pretty-printed; 102 KB minified, 19 KB gzipped |
| `staging/exoplanets/src/*.ts` | Evaluator: pure functions with no three.js. `index.ts` re-exports everything | |
| `staging/exoplanets/src/*.test.ts` | 50 tests (vitest) | |
| `staging/exoplanets/build-stats.json` | Counts written by the catalogue build (quoted below) | |
| `scripts/build-exoplanets.mjs` | Builds `exoplanets.json.gz` from the cached archive download | |
| `scripts/build-exoplanets-featured.mjs` | Builds `featured.json`. It holds the hand-entered values with their sources, and does the fits described below | |

To ship `featured.json`, the integrator can copy it minified and gzipped to `public/data/exoplanets-featured.json.gz`.
The app only needs `orbit`, `status`, `showByDefault`, `centre`, the stars, `starOrbit` and `position`. The
`inputs` blocks are the citations; keep them for the body cards and the Guide.

## Counts on 25 September 2026 (NASA Exoplanet Archive, PSCompPars)

- **6,372 confirmed planets** around **4,779 host stars**. 1,070 hosts have more than one known planet, and 432
  hosts are in systems with more than one star.
- By discovery method:

  | Method | Planets |
  | --- | --- |
  | Transit | 4,709 |
  | Radial velocity | 1,202 |
  | Microlensing | 292 |
  | Imaging | 97 |
  | Transit timing variations | 29 |
  | Eclipse timing variations | 17 |
  | Orbital brightness modulation | 9 |
  | Pulsar timing | 8 |
  | Astrometry | 6 |
  | Pulsation timing variations | 2 |
  | Disk kinematics | 1 |

- 283 of the planets were discovered in 2026 (to date). The archive flags 4,739 as transiting (`tran_flag`), 58 as
  controversial and 53 as circumbinary.
- The NASA Exoplanet Archive has no longitude-of-ascending-node column: no planet has one (checked in
  `TAP_SCHEMA.columns`). For the other orbital elements:

  | Element | Planets that have it |
  | --- | --- |
  | Period | 6,019 |
  | Semi-major axis | 5,944 |
  | Eccentricity | 5,305 |
  | Inclination | 4,842 |
  | Argument of periastron | 2,107 |
  | Time of periastron | 1,066 |
  | Transit or conjunction time | 5,074 |

- Radii: 6,322 planets have one, but only 4,786 are measured. The archive computed the other 1,536 from its
  mass-radius relation.
- Masses: 2,462 are true masses, 894 are m sin i, 15 are m sin i / sin i, 2,970 come from the mass-radius relation,
  and 31 planets have none.
- Nearest hosts, in parsecs:

  | Host | Distance (pc) |
  | --- | --- |
  | Proxima Cen | 1.30 |
  | Barnard's star | 1.83 |
  | eps Eri | 3.20 |
  | GJ 887 | 3.29 |
  | Ross 128 | 3.37 |
  | Gl 725 A | 3.52 |
  | GJ 15 A | 3.56 |
  | tau Cet | 3.60 |
  | eps Ind A | 3.64 |
  | GJ 1061 | 3.67 |
  | YZ Cet | 3.71 |
  | Teegarden's Star | 3.83 |

  62 hosts (122 planets) lie within 10 pc, 181 hosts (319 planets) within 20 pc and 1,055 hosts (1,569 planets)
  within 100 pc. The farthest host is at 8.5 kpc (microlensing).
- The archive's own "Targets Excluded" page (updated 8 July 2026) lists tau Cet e as a False Positive Planet
  (Figueira et al. 2025). It lists Proxima Cen c only as a "Candidate Planet" on the alf Cen overview page, so
  neither is among the 6,372.

## 1. `exoplanets.json.gz`

### Loading

Vercel does not compress `application/octet-stream`. A `.gz` file therefore arrives as raw gzip bytes and the
browser does not inflate it. `loadCatalogue(url)` (in `catalogue.ts`) fetches the bytes and inflates them with
`DecompressionStream('gzip')`. If a server did add `Content-Encoding: gzip`, fetch has already inflated the body.
The function recognises that from the first two bytes (it looks for the gzip magic `1f 8b`) and parses the body
as it is. Load the file lazily, for example the first time the user leaves the Solar System or opens an exoplanet
list. On this machine, Node inflates and parses the file in 25–175 ms, and `archiveOrbit` builds all 6,365 orbits
in 20–35 ms.

### Layout

The file is one JSON object. `hosts` and `planets` are tables stored column by column: every array in a table has
one entry per row, and `null` means the archive has no value. Planets are grouped by host, then sorted by period.

```
format: "lightspeed-exoplanets/1"
source, doi ("10.26133/NEA13"), citation, retrieved ("2026-09-25"), counts, units, enums
hosts:   name, hip, hd, gaia, ra, dec, dist, pmra, pmdec, rv, teff, radius, mass, logL, spType, vmag,
         nStars, nPlanets, posRef
planets: name, host, letter, period, sma, ecc, incl, impact, omega, node, tperi, tperiSys, tconj, tconjSys,
         radius, mass, massKind, teq, method, year, facility, flags
```

**Hosts**

| Field | Unit and meaning |
| --- | --- |
| name | Archive host name (`hostname`). Kepler-90 appears as "KOI-351" |
| hip | Hipparcos number (integer) |
| hd | HD designation without "HD ". A string, because it can carry a component letter ("41004 B") |
| gaia | Gaia DR3 `source_id` as a decimal string. These ids exceed 2^53, so never convert them to Number |
| ra, dec | Degrees, ICRS, **epoch J2000.0**. The archive's own coordinates are at mixed epochs (TIC v8 gives Gaia DR2 positions at J2015.5 for most stars and J2000 positions for Hipparcos/Tycho entries), so every host is rebuilt at J2000 from one source, named in `posRef`: `gaia` (4,288 hosts: Gaia DR3 five- or six-parameter solution carried from J2016.0), `hipparcos` (131: Hipparcos new reduction carried from J1991.25, for stars Gaia saturates on or lacks), or `archive: TICv8` / `archive: other` (360: no Gaia DR3 or Hipparcos astrometry, archive position kept at its original epoch). The file's `positionSources` spells these out. See "Epochs of the host positions" below |
| dist | Parsecs (`sy_dist`, 28 missing). Mostly TIC v8, i.e. Bailer-Jones et al. 2018 distances from Gaia DR2 |
| pmra, pmdec | mas/yr (pmra includes cos dec), from the same source as the position (the archive's value for `archive` hosts) |
| rv | km/s, systemic radial velocity |
| teff | K |
| radius | Solar radii (313 missing) |
| mass | Solar masses (8 missing) |
| logL | log10(L/Lsun) |
| spType | Spectral type string |
| vmag | Johnson V |
| nStars, nPlanets | Numbers of stars and planets in the system |

The composite table picks stellar values per planet row, so the rows of one host can disagree. The build takes, for
each field, the value most rows share. 616 host fields were resolved this way.

**Planets**

| Field | Unit and meaning |
| --- | --- |
| host | Index into `hosts` |
| period | Days, at full archive precision. Phases need it |
| sma | au |
| ecc | Eccentricity |
| incl | Degrees (90 = edge-on) |
| impact | Transit impact parameter, in stellar radii |
| omega | Degrees, **exactly as published** (see the conventions in section 3) |
| node | Always `null`. The archive has no such column; the field is kept for other sources |
| tperi | JD, time of periastron |
| tconj | JD, transit mid-time, or for non-transiting planets the time of inferior conjunction |
| tperiSys, tconjSys | Index into `enums.timeSystem`: `BJD-TDB`, `BJD`, `JD`, `HJD`, `BJD-UTC`, and so on. Every value is a full JD, including the one labelled `TJD-TDB`. The systems differ by less than about 8 minutes, which the evaluator ignores |
| radius | Earth radii (6,378.1 km) |
| mass | Earth masses. `massKind` indexes `enums.massKind`: `Mass`, `Msini`, `Msin(i)/sin(i)` or `M-R relationship` |
| teq | K |
| method | Index into `enums.method` |
| year | Discovery year |
| facility | Index into `enums.facility` (73 facilities) |
| flags | Bitfield, listed below and in `enums.flags` |

The flag bits:

| Value | Flag | Meaning |
| --- | --- | --- |
| 1 | CONTROVERSIAL | Existence disputed (archive flag) |
| 2 | CIRCUMBINARY | Orbits two stars |
| 4 | TRANSITS | Transits (so `tconj` is a transit time) |
| 8 | TTV | Shows transit-timing variations |
| 16 | RADIUS_CALCULATED | Radius from the archive's mass-radius relation, not measured |
| 32 | MASS_CALCULATED | Mass from the mass-radius relation, not measured |
| 64 | TEQ_CALCULATED | Equilibrium temperature computed by the archive |
| 128 | MASS_LIMIT | Mass is a limit |
| 256 | ECC_LIMIT | Eccentricity is a limit |
| 512 | IMAGED | Directly imaged |
| 1024 | RV | Detected by radial velocity |
| 2048 | ASTROMETRY | Detected by astrometry |
| 4096 | MICROLENSING | Detected by microlensing |
| 8192 | INCL_LIMIT | Inclination is a limit |
| 16384 | RADIUS_LIMIT | Radius is a limit |

### Epochs of the host positions

The first version of this file shipped the archive's coordinates and called them J2000. They are not: an independent
check against SIMBAD found the 22 hosts with the largest proper motions all at epoch 2015.50 exactly (Gaia DR2),
putting Barnard's Star 161″ and Proxima 60″ from their J2000 positions (78 au and 294 au from the star catalogue's
positions, against planetary orbits of 0.02–0.05 au). Checked here on the 498 archive hosts with proper motions
above 100 mas/yr that are also in the star catalogue: the implied epoch of the archive position is 2015.5 for almost
all, but 2000 for a few bright stars (TIC v8 took those from Hipparcos or Tycho-2), so no single shift is right.

Every host is therefore rebuilt at J2000.0 by `scripts/exoplanet-host-astrometry.mjs`, carrying one catalogue
position along the star's straight-line 3D motion (proper motion, distance, radial velocity):

1. Hipparcos new reduction (van Leeuwen 2007) for Hipparcos stars without a good Gaia DR3 solution or brighter than
   G = 6 (131 hosts);
2. Gaia DR3 for hosts with a five- or six-parameter solution (4,288);
3. otherwise the archive position, epoch unchanged (360; 294 of them are microlensing and other hosts
   positioned by their discovery papers).

After the rebuild the same 498 hosts all sit at an implied epoch of 2000.0 (median 2000.00 for both sources; the
spread of ±0.5 yr is the 3.6 mas rounding of the file and catalogue differences of tens of mas), and the featured
hosts agree with the star catalogue to 0.04–0.08″. The largest correction is Barnard's Star, 160.9″. Of the
360 hosts left at their archive epoch, 17 move faster than 20 mas/yr, so their position may be off
by up to 15.5 yr × proper motion (they are listed in `build-stats.json` → `positions.archiveEpochFastHosts`; the
worst is TOI-2267 B, 291 mas/yr, up to 4.5″, i.e. ~100 au at 22.6 pc); the rest are off by less than 0.3″.

### Matching hosts to the star catalogue

The star build (`scripts/build-stars3d.mjs`) ships `stars3d.bin.gz` and `star-names.json.gz`. The names file carries
HIP and HD numbers mapped to star indices; it carries no Gaia ids. Keys to use, in order:

1. **HIP**, then **HD** (the leading integer of `hosts.hd`), looked up in the `hip`/`hd` columns of
   `star-names.json.gz`.
2. **Gaia DR3 `source_id`**, if a later star file carries Gaia ids.
3. **Position**: the nearest star within 2″ + |proper motion| × 25 yr. Both files are now at epoch J2000, so the
   tolerance is generous; it still covers the few `archive` hosts whose epoch is uncertain. Reject candidates whose V
   differs by more than 1.5 mag, or whose distance ratio falls outside 0.7–1.4.

`buildHostMatcher(stars)` in `catalogue.ts` implements that order. It takes any array of
`{gaiaDr3?, hip?, hd?, raDeg, decDeg, pmMasYr?, vmag?, distancePc?}` and returns `{star, by}` or null.

Against the AT-HYG v4.0 "reduced m10" list the star build uses (332,178 stars; statistics only, nothing from
AT-HYG is shipped here):

- 1,000 hosts are in the list: 984 by Gaia id and 16 more by HIP.
- 867 of those can be found through HIP or HD, which is what `star-names.json.gz` offers. The remaining ~133 need
  the positional match.
- **3,779 hosts are not in the star catalogue at all.** These are the faint Kepler, K2, TESS and microlensing hosts.
  The app should draw them from `exoplanets.json` itself, which has ra, dec, dist, teff, radius and vmag.

The Alpha Centauri AB orbit also appears in `staging/stars/systems.json`, from the same Akeson et al. 2021
elements. I checked that the two orbits agree: the periastron and velocity directions match to 2e-4. Use the star
team's model for A and B, and `featured.json` for the planet candidate around A.

## 2. `featured.json`

Every featured system has a stated epoch, **2026-01-01 00:00 TDB (JD 2461041.5)**. Each planet's phase is set so
that the configuration **seen from the Sun** is right at the planet's reference time and, as far as the data
allow, at the epoch. `atEpoch` gives the mean anomaly at the epoch, the first conjunction after it, and the
propagated timing uncertainty where the sources quote errors.

Each system has:

- `position`: ra and dec at epoch J2000.0 (`epoch`; Gaia DR3 or Hipparcos carried to J2000 as for the
  catalogue, and for α Cen AB the Akeson et al. barycentre carried from J2019.5), distance, proper motion, RV and
  ids (HIP, HD, Gaia DR3, TIC). The first version gave the archive's J2015.5 coordinates (Proxima 60″, Barnard's
  Star 161″ off) and α Cen's J2019.5 barycentre (72″ off) without saying so.
- `stars`, with cited mass, radius, Teff and luminosity. `starOrbit` holds a binary orbit where there is one.
- `planets`, each with:
  - `orbit`: the numbers the evaluator uses.
  - `inputs`: every value as `{v, err, ref, where, note}`. `assumed` explains a value that was not measured,
    `derived` says how we computed one, and `estimate` marks model estimates.
  - `radiusEarth`, `massEarth` (with `kind`: true, minimum or model-dependent), `teqK` and `discovery`.
  - `status`: `confirmed`, `candidate`, `disputed` or `refuted`. `showByDefault: false` marks objects to hide unless
    the user asks.
- `refs`: every source, with a DOI, ADS bibcode or arXiv id.

### The systems

**TRAPPIST-1** (7 planets). Sources: Agol et al. 2021.

- Taken from Agol et al. 2021:
  - inclinations (Table 5);
  - a, radii, masses and insolation (Table 6);
  - star (Table 7: Mann et al. 2019 mass, Ducrot et al. 2020 luminosity);
  - e and ω (Table 2, osculating, e < 0.01).
- Periods and phases come from a least-squares line through the full forecast table of posterior-mean transit
  times, 2015–2023 (Table 15; 160 to 1,985 transits per planet). The electronic table comes from the authors'
  repository (MIT licence).
- A fixed Kepler orbit cannot follow the transit-timing variations. The scatter about the mean ephemeris is:

  | Planet | rms (min) | max (min) |
  | --- | --- | --- |
  | b | 1.4 | 4.3 |
  | c | 2.1 | 4.9 |
  | d | 31 | 61 |
  | e | 19 | 39 |
  | f | 33 | 83 |
  | g | 23 | 52 |
  | h | 49 | 135 |

- Check: the JWST transits of b and c on 2024-07-11 (Rathcke et al. 2025) fall 8.8 and −3.3 min from the model
  (tested). The node is assumed and shared by all seven planets.

**Proxima Centauri** (b, d; c disputed). Sources: Suárez Mascareño et al. 2025 (NIRPS + archival; Table 3).

- Circular orbits. Periods, a, m sin i, and T0 (the time of inferior conjunction; the archive mislabels it as a
  periastron time).
- Inclination assumed 47° (stellar spin axis, Klein et al. 2021, as adopted in the paper); node assumed.
- Phase σ at the epoch: 2.9 h (b) and 3.9 h (d).
- **Proxima c** is included as `disputed`, hidden by default:
  - Damasso et al. 2020: P ≈ 1900 d, m sin i = 5.8 M⊕, T_conj = 2455892.
  - Kervella et al. 2020: i = 152° from the Gaia proper-motion anomaly.
  - Gratton et al. 2020: a possible SPHERE counterpart.
  - Against it: Artigau et al. 2022 found the signal likely instrumental, ESPRESSO (Faria et al. 2022) did not
    confirm it, and NIRPS 2025 found only inconclusive hints. The archive lists it only as a candidate.

**Barnard's Star** (b, c, d, e). Sources: Basant et al. 2025, Table 3.

- Periods, a, m sin i, and t0.
- t0 is used as the time of inferior conjunction. The paper's text calls it a periastron time, but its juliet fit
  uses conjunction times, and ±0.1 d is impossible for a periastron time when ω is unconstrained.
- Eccentricities are consistent with zero, so the orbits are circular.
- Inclination assumed 60°, the median for random orientations; node assumed. Phase σ at the epoch: 3–12 h.

**51 Pegasi b.** Sources: Cont et al. 2026 (CRIRES+).

- T_C, P and e < 0.0063 (so a circular orbit), i = 49.8° from K_p, and a true mass of 0.61 M_J.
- The sense of motion (i or 180° − i) and the node are assumed.
- Earlier dayside detections gave i ≈ 70–82°; Cont et al. discuss the discrepancy. The radius is an estimate,
  because 51 Peg b does not transit.

**HR 8799** (b, c, d, e). Sources: Wang et al. 2018, Table 4 ("stable coplanar").

- a, e, ω, Ω = 67.9°, i = 26.8°, and the star's mass (1.47 M☉; the periods follow from Kepler's third law).
- The published median τ and ω are not a consistent pair for near-circular orbits, so we refitted τ alone to the GPI
  astrometry in Wang et al. Table 2. The fit reproduces all 9 positions to within 13 mas (rms 2–11 mas per planet;
  tested).
- The 180° ambiguity (which half of the orbit is nearer to us) is settled by the planets' radial velocities (Ruffio
  et al. 2019): RV_b − RV_c = +2.4 ± 0.7 km/s. The model gives +2.6 km/s; the mirror orbit gives −2.6 (tested).
- Masses are from the paper's dynamics and evolution models (5.8 and 7.2 M_J). Radii are from the archive (Marois et
  al. 2008; GRAVITY 2019 for e).

**Kepler-90** (8 planets; the archive host is KOI-351). Sources:

- b–f: Cabrera et al. 2014.
- i: Shallue & Vanderburg 2018.
- g and h: Shaw et al. 2025, for e, ω and masses (RV + transit timing). Their periods are the means of the 35
  predicted transit times in Shaw et al. Table 6. Each phase is anchored on the predicted transit nearest the epoch.
  The transit-timing variations are large, so between anchors the model drifts by up to 14 h for g.
- h's inclination comes from Cabrera's impact parameter and a/R*. The tabulated i = 89.6 ± 1.3° is too coarse: it
  would give b = 1.26, so the planet would not transit.
- Masses of b–f and i are not measured.

**TOI-700** (b, c, d, e). Sources: Pass et al. 2026 (JWST + TESS + Spitzer), Table 2.

- Periods, conjunction times, a, radii and i. The paper fits circular orbits.
- Phase σ at the epoch is under 5 minutes. Masses are not measured.

**Kepler-16** (circumbinary). Sources: Doyle et al. 2011, Table 1.

- The binary and planet elements are converted from the transit convention (ω + 180°). The epoch BJD 2455212.12316
  is a primary eclipse; tested against the Kepler EB catalogue ephemeris at four eclipses.
- The planet orbits the barycentre of A and B. The osculating period (228.776 d) is not the mean period: the binary's
  quadrupole speeds up the mean motion. The period was fitted to the three observed transits of star A
  (BJD 2454973.4, 2455203.7, 2455425.2; Doyle et al. text and Fig. 1), which gives 225.89 d. The residuals are
  −0.10, +0.05 and −0.11 d, and the transit of star B at 2454981.6 is reproduced to 0.07 d.
- A fixed orbit ignores the precession that stopped the transits of A in 2018. The sky orientation is assumed.

**Epsilon Eridani b.** Sources: Thompson et al. 2025 (RV + Hipparcos + HST FGS + Gaia DR2/DR3).

- P = 7.33 yr, a = 3.53 au, i = 40°, Ω = 186°, mass 1.00 M_J.
- Circular orbit: e = 0.06 +0.06/−0.04 is consistent with zero, and the medians of t_p and ω do not fix a phase.
- Phase from Harada et al. 2025's RV conjunction time (as tabulated in the archive).
- Check: the planet is south-southwest of the star in early 2025 and north in 2029, as Thompson et al. state
  (tested). Phase σ at the epoch: 59 d, or 2% of an orbit.

**Tau Ceti** (e, f, g, h). Sources: Feng et al. 2017, Table 5.

- All four are labelled: g, h and f are `disputed` (archive "controversial"; ESPRESSO, Figueira et al. 2025, could
  not confirm them), and e is `refuted` (archive False Positive Planet), hidden by default.
- i = 35° and node PA = 105° are assumed coplanar with the debris disc (Lawler et al. 2014).
- The mean anomaly M0 is published, but its reference epoch is not stated. The phase is therefore arbitrary, and
  labelled so.

**Alpha Centauri A candidate (S1).** Sources: Beichman et al. 2025 and Sanghi et al. 2025 (ApJL 989, L22/L23).

- Status: `candidate`. There is one JWST/MIRI detection (10 August 2024), possibly the same object as the VLT/NEAR
  source C1 of 2019. It was not recovered in February and April 2025.
- A JWST re-observation was planned for August 2026. No result had been published by 25 September 2026 (I searched
  arXiv).
- The orbit is **illustrative**. a = 1.66 au, e = 0.37 and i = 124° come from the paper's "prograde, a < 2 au" family.
  We fitted Ω, ω and the periastron time to S1, C1 and the two non-detections (χ² = 0.26).
- The mutual inclination with AB comes out at 65.5°; the paper gives 54 ± 11° for this family. The mirror solution
  fits the astrometry equally well.
- The A–B orbit is from Akeson et al. 2021. It is tested against the ALMA and archival separation and position angle
  (1 mas in 2019), and against the HARPS radial velocity of A (within 1.2 m/s).

## 3. Conventions and frames

**Frames**

- **EQJ/ICRS**: equatorial J2000.
- **ECL**: J2000 ecliptic. It is EQJ rotated about x by ε = 84381.448″, the same rotation as `src/sim/frames.ts` and
  JPL use.
- **App world**: (x_ecl, z_ecl, −y_ecl), from `eclipticToWorld`.
- The evaluator returns offsets in ECL km, or sky components in au.

**Sky basis at a star (RA α, Dec δ)**, as seen from the Sun:

```
r = (cos δ cos α, cos δ sin α, sin δ)            away from the Sun (line of sight)
e = (−sin α, cos α, 0)                           east (increasing RA)
n = (−sin δ cos α, −sin δ sin α, cos δ)          north (increasing Dec)
```

(n, e, r) is left-handed (n × e = −r), because on the sky east lies to the left of north. This is tested.

**Orbit angles** use the visual-binary convention, which is the one imaging and astrometry papers use:

- The elements describe the relative orbit of the body about its centre (a star, or the binary barycentre).
- **i** runs from 0 to 180°. i < 90° means counterclockwise on the sky: the position angle increases. i = 90° is
  edge-on.
- **Ω** is the position angle of the ascending node, measured from north through east. **The ascending node is where
  the body recedes from the Sun**, i.e. its radial velocity relative to the host is positive.
- **ω** is the argument of periastron of the body's own orbit.
- The sky components are:
  ```
  north = r [cos(ω+f) cos Ω − sin(ω+f) sin Ω cos i]
  east  = r [cos(ω+f) sin Ω + sin(ω+f) cos Ω cos i]
  away  = r  sin(ω+f) sin i
  ```

**The RV/transit convention**, used by RV papers, transit papers and the archive's `pl_orblper`, publishes ω of the
star: v_* = K [cos(ω_* + f) + e cos ω_*], with a transit at f = 90° − ω_*. With both nodes defined as above, the
node line is the same and **ω_planet = ω_* + 180°**. At a transit, ω_planet + f = 270°, so `away = −r sin i < 0`:
the planet is in front of the star.

The tests confirm all of this:

- A synthetic eccentric transiting planet sits in front of its star at the transit time, with Winn's (2010)
  impact-parameter formula reproduced to 1e-9.
- The star's model radial velocity matches K[cos(ω_* + f) + e cos ω_*] to 1e-9.
- Every one of the archive's transiting planets with a transit time is in front of its star, as seen from the Sun,
  at that time.
- The HR 8799 planet RVs and the α Cen HARPS RV fix the sign of the receding node. The GPI and ALMA astrometry
  fix Ω, ω, i and the sense of motion.

**Time.** Ephemerides are arrival times at the Solar System barycentre (BJD_TDB), so they describe what is seen from
the Sun. The state of a system at the app's coordinate time t (TDB, Sun rest frame) is therefore the orbit evaluated
at **t + D(t)/c**, where D(t) is the host's distance *as the app places it* at t (`observedTimeJd`). This has two
consequences:

- With light-time on (retarded positions), the Sun sees the transits at the published times. This holds whatever
  distance the app uses, and holds if it moves the star: a test runs it at 100 km/s radial velocity over 20 years.
- The "true now" phase is uncertain by (distance error)/c. For TRAPPIST-1, a 0.01 pc error is about 12 light-days,
  several orbits of planet b. Nothing can fix that, and the view from the Sun stays right regardless.
- The host's time dilation (~1e-8) and gravitational redshift are ignored.

## 4. Archive records to orbits (`archiveOrbit`)

Every gap is filled by a stated rule, and `provenance` records which rule applied. Counts over the 6,372 planets:

- **No orbit (7 planets).** There is neither a period nor a semi-major axis: 6 microlensing planets and SR 12 AB c.
- **Period or a missing.** The missing one comes from Kepler's third law with M = host + planet: 346 periods and
  421 semi-major axes are derived this way. The host mass falls back to 1 M☉ for 8 hosts.
- **e.** Missing values become 0 (1,060 planets), and so do limits (296).
- **ω.** For Imaging and Astrometry discoveries the published value is the companion's own ω (25 planets). For all
  other methods it is the star's ω, and 180° is added (2,082). A missing ω becomes 90° (4,258), which does not
  matter for circular orbits.
- **i.** In order of preference:

  | Source of i | Planets |
  | --- | --- |
  | Archive | 4,261 |
  | Median of the host's other planets | 172 |
  | 90° for transiting planets | 249 |
  | 60°, the median for random orientations | 1,099 |
  | Adjusted to make a transiting planet transit | 584 |

  The last row matters because the composite table can combine i, a and R* from different papers that together
  miss the star. For 570 of those planets the archive's impact parameter is used; for 14, b = 0.5 is assumed.
- **Node.** Always assumed, because no archive column exists. The value is `assumedNodeDeg(host name)`, a fixed
  pseudo-random angle (FNV-1a hash, 0.1° steps). Each system therefore gets its own reproducible orientation on the
  sky, and all planets of one host share it. The featured file uses the same function wherever a node is unknown.
- **Phase.** In order of preference:

  | Source of phase | Planets |
  | --- | --- |
  | Transit or conjunction time | 5,074 |
  | Time of periastron | 718 |
  | Pseudo-random mean anomaly at J2000 | 573 |

  The pseudo-random phases are labelled `assumed`.

The app should say "orientation assumed" in the body card whenever `provenance.node` or `provenance.incl` is
assumed or adjusted, and "position along the orbit unknown" whenever `provenance.phase` is `assumed`.

## 5. Evaluator API (`src/index.ts`)

**Kepler relations** (`kepler.ts`)

- `solveKepler(M, e)`: Kepler's equation, accurate to 1e-12 for e < 0.999.
- `trueFromEccentric`, `meanFromTrue`, `semiMajorAxisAu(P, M)`, `periodDays(a, M)`.

**Frames** (`sky.ts`)

- `raDecToUnit`, `skyBasis`, `skyToEquatorial`, `equatorialToSky`, `equatorialToEcliptic`, `eclipticToWorld`,
  `skyToEcliptic`, `positionAngle`, `starPositionEcliptic`.

**Orbits** (`orbit.ts`)

- `KeplerOrbit {periodDays, aAu, e, iDeg, nodeDeg, argPeriDeg, tPeriJd}`.
- `orbitSky(o, tObs)` returns position (au) and velocity (au/d) in sky components, plus the anomalies.
- `offsetEclipticKm(o, ra, dec, hostDistanceKm, tJd)` and `velocityEclipticKmS(...)`: true offset from the host at
  app time tJd, in ECL km or km/s.
- `observedTimeJd`, `lightTimeDays`, `apparentSkyOffsetFromSun`.
- `argPeriPlanetFromStar`, `tPeriFromConjunction`, `tPeriFromMeanAnomaly`, `conjunctionNear`, `rvSemiAmplitudeMs`.

**Catalogue** (`catalogue.ts`)

- `loadCatalogue(url)` and `decodeCatalogue(bytes)`.
- `archiveOrbit(cat, i)`, `planetsOfHost`, `hostSky`, `assumedNodeDeg`, `buildHostMatcher`, `PLANET_FLAGS`.

**Featured systems** (`featured.ts`)

- The `FeaturedFile` types.
- `featuredSystemState(system, tJd, {distanceKm?, includeHidden?})`: every star and planet relative to the system
  barycentre, in ECL km and in sky au. Binaries are evaluated first. The barycentre, planet masses included, is then
  subtracted, which gives each star its reflex wobble.
- `findSystem`.

All imports use explicit `.ts` extensions and `import type`. The files run under the app's tsconfig
(`allowImportingTsExtensions`, `verbatimModuleSyntax`) and under plain `node --experimental-strip-types`. They
type-check with the app's strict flags.

## 6. Tests

Run from the repository root:

```
npx vitest run --root staging/exoplanets
```

50 tests; all pass. They cover:

- The Kepler solver, the frames and handedness, and agreement with `src/sim/frames.ts`.
- The visual-binary and RV/transit conventions, and light time (including a moving host).
- Transits seen from the Sun for every transiting archive planet and every featured transiting planet.
- The TRAPPIST-1 JWST transit times, the Kepler-16 eclipses and transits, the HR 8799 GPI astrometry and planet RVs,
  the α Cen ALMA astrometry and HARPS RV, the α Cen A candidate astrometry, and the ε Eri b position angles.
- Every featured value is cited or labelled, and every ref exists.
- Host positions are at J2000: Barnard's Star, Proxima, ε Eri and τ Cet within 0.2″ of SIMBAD's J2000 positions.

## 7. Building

```
node scripts/build-exoplanets.mjs --fetch    # first time only: downloads data-raw/gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz
node scripts/build-exoplanets.mjs            # ~25 s; writes public/data/exoplanets.json.gz and build-stats.json
                                             # (needs data-raw/hip2_pos.csv.gz from node scripts/build-stars3d.mjs --fetch)
node scripts/build-exoplanets-featured.mjs   # ~5 s;  writes staging/exoplanets/featured.json
```

Suggested `package.json` scripts for the integrator: `"data:exoplanets": "node scripts/build-exoplanets.mjs"` and
`"data:exoplanets-featured": "node scripts/build-exoplanets-featured.mjs"`.

Cached inputs in `data-raw/`, downloaded once on 2026-09-25 and never re-downloaded:

- `nea_pscomppars_2026-09-25.csv.gz`: `select * from pscomppars` via TAP, 6,372 rows × 703 columns.
- `nea_ps_featured_2026-09-25.csv`: PS rows for the featured hosts. The query is in the script header.
- `agol2021_trappist1_times_forecast.csv`: Agol et al. 2021 Table 15, from github.com/ericagol/TRAPPIST1_Spitzer
  (`tex/tables/times_forecast.txt`, MIT licence).
- `shaw2025_kepler90gh_table6.txt`: transcribed from Shaw et al. 2025 Table 6 (arXiv v1).
- The optional `athyg_40_reduced_m10.csv.gz`, from the star build, is used only for the match statistics.

## 8. Accuracy, honestly

**Catalogue planets**

- Orbit sizes, periods and shapes are as published. Transits land at the archived times.
- Sky orientation is assumed for all 6,365 placeable planets. Inclination is assumed or adjusted for about 2,100
  of them.
- The position along the orbit is assumed for 573, and it is uncertain by the propagated ephemeris error for the
  rest. Old ephemeris errors can reach whole orbits by 2026, and the archive does not carry the covariances needed
  to say how far.

**Featured planets**

- The phase at 2026-01-01 is known to:
  - better than 5 minutes for TOI-700 and 51 Peg b;
  - about 10 minutes for TRAPPIST-1 b and c (the JWST check);
  - 0.3–2 h for the Kepler-90 inner planets (plus any unmodelled TTVs);
  - 3–12 h for Proxima and Barnard;
  - 2% of an orbit for ε Eri b;
  - a few mas of GPI astrometry for HR 8799.
- Unknown for the τ Ceti candidates, and illustrative for α Cen A S1.
- Transit-timing variations are the dominant error for TRAPPIST-1 d–h and Kepler-90 g and h, and three-body
  precession for Kepler-16.

## 9. Sources and licences

**NASA Exoplanet Archive** (catalogue; stellar values for several featured hosts)

- Operated by Caltech/IPAC for NASA. The data are freely available with no restrictions stated, and the archive
  asks users to acknowledge it and cite it.
- Required text: "This research has made use of the NASA Exoplanet Archive, which is operated by the California
  Institute of Technology, under contract with the National Aeronautics and Space Administration under the
  Exoplanet Exploration Program."
- Cite Christiansen et al. 2025, PSJ 6, 186 (doi:10.3847/PSJ/ade3c2), which replaces Akeson et al. 2013 as the
  archive's reference. Table DOIs: PSCompPars 10.26133/NEA13, PS 10.26133/NEA12.
- Most host distances in the archive come from the TESS Input Catalog v8 (Stassun et al. 2019), i.e. Bailer-Jones
  et al. 2018 values from Gaia DR2. Gaia DR3 ids are the archive's cross-identifications.

**Gaia DR3 and Hipparcos** (host positions at J2000)

- Gaia DR3 (ESA/Gaia/DPAC; Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1): positions, parallaxes, proper
  motions and radial velocities of 4,413 hosts, queried from the Gaia archive TAP once and cached as
  `data-raw/gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz` (not shipped). ESA states that "Gaia data are distributed
  under the CC BY-NC 3.0 IGO license" (https://www.cosmos.esa.int/web/gaia-users/license, checked 25 September
  2026): credit ESA/Gaia/DPAC, **non-commercial use**. The shipped file contains values derived from Gaia (the J2000
  positions and proper motions, and the archive's Gaia DR2-based distances), so those terms apply to it: it may be
  used non-commercially with the Gaia credit. Lightspeed is non-commercial. No Gaia table is shipped as such.
- Hipparcos new reduction (van Leeuwen 2007, A&A 474, 653; VizieR I/311), positions and proper motions of 131
  hosts: ESA mission data, free with acknowledgement (and CDS's acknowledgement for VizieR).

**Values from papers** (`featured.json`)

- Numbers and orbital elements are facts and are not copyrightable. Every one is cited in `featured.json` → `refs`.
- Papers used: Agol et al. 2021; Rathcke et al. 2025; Suárez Mascareño et al. 2025; Damasso et al. 2020;
  Kervella et al. 2020; Gratton et al. 2020; Artigau et al. 2022; Faria et al. 2022; Basant et al. 2025;
  González Hernández et al. 2024; Cont et al. 2026; Mayor & Queloz 1995; Wang et al. 2018; Ruffio et al. 2019;
  Marois et al. 2008; Cabrera et al. 2014; Shallue & Vanderburg 2018; Shaw et al. 2025; Pass et al. 2026;
  Gilbert et al. 2023; Doyle et al. 2011; Kirk et al. 2016 (Villanova Kepler EB catalogue); Thompson et al. 2025;
  Harada et al. 2025; Feng et al. 2017; Figueira et al. 2025; Lawler et al. 2014; Beichman et al. 2025;
  Sanghi et al. 2025; Wagner et al. 2021; Akeson et al. 2021; Chen & Kipping 2017.
- Llop-Sayson et al. 2026 (arXiv:2609.19131, submitted) is mentioned but not used.

**Agol et al. 2021 forecast table.** MIT licence (repository ericagol/TRAPPIST1_Spitzer). Used only to derive mean
ephemerides; not redistributed.

**AT-HYG v4.0.** CC BY-SA 4.0. Used only to count matches. Nothing is shipped, so share-alike does not apply to our
files.

**Rows to add to `CREDITS.md`**

| Files | Source | Licence |
| --- | --- | --- |
| `public/data/exoplanets.json.gz` | [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/), Planetary Systems Composite Parameters (doi:[10.26133/NEA13](https://doi.org/10.26133/NEA13); Christiansen et al. 2025, doi:[10.3847/PSJ/ade3c2](https://doi.org/10.3847/PSJ/ade3c2)), retrieved 25 September 2026. Host positions and distances largely from the TESS Input Catalog v8 and ESA Gaia (via the archive) | NASA/Caltech-IPAC data, freely available; acknowledgement: "This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program." Host positions at J2000 from [Gaia DR3](https://www.cosmos.esa.int/gaia) (ESA/Gaia/DPAC) and the Hipparcos new reduction (van Leeuwen 2007, via VizieR): the Gaia-derived values are [CC BY-NC 3.0 IGO](https://www.cosmos.esa.int/web/gaia-users/license), so the file is for **non-commercial use**, with the Gaia credit. |
| `public/data/exoplanets-featured.json.gz` (from `staging/exoplanets/featured.json`) | Orbital solutions from the papers listed in the file's `refs` (Agol et al. 2021; Suárez Mascareño et al. 2025; Basant et al. 2025; Cont et al. 2026; Wang et al. 2018; Cabrera et al. 2014; Shaw et al. 2025; Pass et al. 2026; Doyle et al. 2011; Thompson et al. 2025; Feng et al. 2017; Beichman et al. 2025; Akeson et al. 2021; and others), plus NASA Exoplanet Archive values | Facts from the literature, cited per value; our fits and file under the project's MIT licence, except the host positions, which come from Gaia DR3 (ESA/Gaia/DPAC, [CC BY-NC 3.0 IGO](https://www.cosmos.esa.int/web/gaia-users/license): non-commercial, with credit) or the Hipparcos new reduction |

Also add this line under "Other sources used by the code": "Exoplanet orbits: Keplerian model with conventions and
tests in `staging/exoplanets`; the mass-radius estimates use Chen & Kipping 2017 (ApJ 834, 17)." And add Gaia's
acknowledgement once anywhere Gaia-derived values are shown: "This work has made use of data from the European
Space Agency (ESA) mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC)."

## 10. Known limitations

- **Keplerian orbits only.** There are no N-body effects: TTVs, precession, or the Kepler-16 transits stopping.
  Each case above has its error quoted.
- **Sky orientation.** Unknown for most planets; assumed as described in section 4, and labelled.
- **HR 8799 positions** assume Wang et al.'s parallax (24.30 mas). At the Gaia distance the angular positions change
  by under 1%.
- **Time systems** (BJD, HJD, JD) are mixed in the archive and treated as equal, which is good to about 8 minutes.
- **Proper motion.** Host positions are at J2000.0 (except 360 hosts without Gaia DR3 or Hipparcos
  astrometry, see "Epochs of the host positions"). The star build propagates stars; the integrator should put
  planets on the propagated host, and use the host's distance at time t in `observedTimeJd`.

## 11. Changes after the independent verification (25 September 2026)

A check against the live archive, SIMBAD and the papers confirmed the counts, the orbital elements, the
transit geometry of every transiting planet and the featured systems, and found one real error, fixed here:

- **Host positions were not at J2000.** The archive's coordinates are mostly Gaia DR2 positions at epoch J2015.5
  (Barnard's Star 161″, Proxima 60″ from J2000), and `featured.json` gave α Cen's barycentre at J2019.5. Every host
  is now rebuilt at J2000.0 from Gaia DR3 or Hipparcos (section 1, "Epochs of the host positions"); the featured
  hosts agree with the star catalogue to 0.04–0.08″. New cached input:
  `data-raw/gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz`; new shared module `scripts/exoplanet-host-astrometry.mjs`.
- **Licence wording.** The shipped files contain Gaia-derived values, so the CREDITS rows now carry ESA's
  non-commercial condition (section 9).
