# 3D stars, star systems and constellations

Specification for the integration team. It covers what the files contain, their byte layouts, frames and units, how
every number was made, how accurate it is, and where it came from.

| File | Size | What it is |
| --- | --- | --- |
| `public/data/stars3d.bin.gz` | 5,262,589 B (7,914,544 B raw) | 329,770 stars: 3D position, space velocity, absolute magnitude, temperature, quality flags |
| `public/data/stars3d-extra.bin.gz` | 641,325 B (989,374 B raw) | Per-star spectral type and constellation, for body cards (load lazily) |
| `public/data/star-names.json.gz` | 1,154,208 B (3,179,647 B raw) | Proper names (IAU flagged), Bayer, Flamsteed, variable-star, Gliese, HR, HIP and HD designations; spectral-type and constellation dictionaries (load when search opens) |
| `public/data/constellations.json` | 50,461 B (14.7 kB gzipped by the host) | 88 IAU constellations; stick figures as polylines of `stars3d` indices |
| `staging/stars/systems.json` | 56,284 B | Alpha Centauri (A, B, Proxima), Sirius, Procyon, 61 Cygni and Capella as orbiting systems; radius, temperature, luminosity and mass of 38 named stars, each value with its reference |
| `staging/stars/src/*.ts` | | Decoders and evaluators (positions at any epoch, retarded positions for any observer, Kepler orbits, magnitudes, name search) with 50 tests |
| `scripts/build-stars3d.mjs`, `scripts/star-literature.mjs`, `scripts/build-constellations.mjs` | | Build scripts (Node 24) |
| `staging/stars/build-log.txt`, `staging/stars/tycho-calibration.json` | | Build diagnostics and the photometric calibration actually used |

Vercel serves `.gz` files as `application/gzip` without `Content-Encoding`, so the browser receives gzip bytes.
`fetchGzip(url)` in `src/stars3d.ts` checks for the gzip magic (1f 8b) and decompresses with
`DecompressionStream('gzip')`; if a host ever decodes it on the way (Content-Encoding: gzip), the bytes pass
through unchanged. `constellations.json` is plain JSON, which Vercel compresses itself.

---

## 1. Which stars, and why

**Catalogue: AT-HYG v4.0, "reduced m10" subset** (David Nash / astronexus; `athyg_40_reduced_m10.csv.gz`, 332,178 rows,
sha256 `a9ec5d515d1222d5bf86e8e84e762cbd325938cc6bd4b0d8760327386fa7c151`). AT-HYG is Tycho-2 (complete to V ≈ 11; Høg et al. 2000) merged with Gaia DR3
astrometry and the HYG catalogue's names and identifiers. The m10 subset is every AT-HYG star brighter than V = 10
(V for Hipparcos and Gliese stars, VT for Tycho-2 stars) plus every AT-HYG star within 100 light-years regardless of
brightness.

Why this subset: it is a clean, physical selection (magnitude-limited plus a local volume) rather than the mixed
selection of HYG (Hipparcos + Yale + Gliese); it keeps every naked-eye star and every star with a classical name
(of 317,175 AT-HYG stars with a proper, Bayer, Flamsteed, HIP, HD, HR or Gliese designation, only three proper names
fall outside it: Intan, Campbell's Hydrogen Star and the quasar 3C 273); and it fits the budget. The next subset
(to V = 11, 875,292 stars) would be about 14 MB.

What was removed or changed (all logged in `build-log.txt`):

- The Sun (it is at the origin; the app already draws it).
- 2,406 stars with no usable distance: AT-HYG's "no distance" rows (Gaia parallax smaller than its error) and the
  89 HYG rows carrying HYG's 100,000 pc placeholder, unless the Hipparcos new reduction gives a parallax with at
  least 5σ significance (none did).
- One prominent star with no usable parallax, μ Sagittarii (Polis, V = 3.8, in the Sagittarius figure), is kept at
  an upper-limit distance and flagged (distance source 7, §4.2).
- One spurious row: Tycho-2 1472-1436-2, labelled "Arcturus B" in AT-HYG. A companion was suggested by Hipparcos and
  by Verhoelst et al. (2005, arXiv:astro-ph/0501669) but has not been confirmed, and Tycho photometry next to a V = −0.05 star is
  unreliable.
- One star whose poor parallax implied M_V < −10 (brighter than any known star) and which is not a prominent star.
- Added from the literature: TRAPPIST-1 (V = 18.8, too faint for Tycho-2), from its Gaia DR3 astrometry.

**Completeness.** The file is complete to V ≈ 10 as seen from the Sun. Beyond 100 light-years it is therefore a
magnitude-limited sample: a Sun-like star (M_V = 4.8) is included out to ~110 pc, a K giant (M_V ≈ 0.5) to ~800 pc,
an M dwarf (M_V ≈ 10–15) only within 1–10 pc. Inside 100 light-years it has what AT-HYG has, which is not
everything: 305 stars lie within 10 pc, where the census of Reylé et al. (2021, A&A 650, A201) lists 540 stars,
brown dwarfs and exoplanets in 339 systems. Missing are most brown dwarfs, many white dwarfs and a share of the
faintest M dwarfs. Counts by distance: 58 within 5 pc, 305 within 10, 1,779 within 20, 4,219 within 100 ly
(30.66 pc), 30,512 within 100 pc, 226,898 within 500 pc, 308,554 within 1 kpc; the farthest points are tens of kpc
away and have poor parallaxes (flagged). When flying far from the Sun, the thinning of stars with distance is a
selection effect of this catalogue, not a feature of the Galaxy; the Milky Way particle model elsewhere in the app
is what should carry the Galaxy's appearance at those distances.

---

## 2. Frames, epoch and units

- **Axes: J2000 ecliptic.** x toward the J2000 equinox, z toward the north ecliptic pole, right-handed. Obtained from
  ICRS by a rotation about x by the obliquity ε = 84381.448″ (IAU 1976; the value JPL uses for "ecliptic of J2000" and
  the app uses for its Solar System). The ~23 mas frame bias between ICRS and the dynamical J2000 equator is below the
  file's precision and is ignored.
- **App world axes** are world = (x_ecl, z_ecl, −y_ecl): `eclipticToWorld()` in `src/frames.ts`.
- **Origin: the Sun** (strictly the Solar System barycentre; the difference, < 0.01 au, is below float32 precision at
  parsec scale).
- **Epoch: J2000.0 (JD 2451545.0 TT)** for positions, for every star (AT-HYG rows that carried positions at other
  epochs are corrected, §4.1). Positions are **astrometric**: the direction light arrives from at J2000, placed at
  the parallax distance (moved to J2000 along the line of sight, §4.2). Where a star *is* at
  J2000 differs by v·d/c; see §6.
- **Units:** positions in parsecs (1 pc = 648000/π au, au = 149,597,870.7 km exactly); velocities in km/s,
  heliocentric; magnitudes in Johnson V; temperatures in kelvin; masses, radii and luminosities in the IAU 2015 B3
  nominal solar units (R☉ = 695,700 km, L☉ = 3.828 × 10²⁶ W, T☉ = 5,772 K). Times are Julian years (TT).

---

## 3. File formats

### 3.1 `stars3d.bin` (inside `stars3d.bin.gz`)

Little-endian. A 64-byte header, then five column sections. Each section starts at the byte offset given in the
header (4-byte aligned) and is **byte-shuffled**: for a column of n elements that are w bytes wide, byte k of element
i is stored at `offset + k·n + i`. (Shuffling puts the similar high-order bytes together and saves ~10% after gzip.)
Undo it with `out[i·w + k] = in[k·n + i]`, then view the result as the typed array.

| Offset | Type | Value |
| --- | --- | --- |
| 0 | char[4] | `LSS3` |
| 4 | uint16 | version = 1 |
| 6 | uint16 | header size = 64 |
| 8 | uint32 | N, number of stars (329,770) |
| 12 | float32 | epoch, Julian year = 2000.0 |
| 16 | float32 | velocity unit, km/s per int16 step = 0.1 |
| 20 | float32 | absolute-magnitude unit, mag per int16 step = 0.01 |
| 24 | uint32 | number of sections = 5 |
| 28 | uint32 × 5 | byte offset of each section |
| 48 | | zero padding to 64 |

| # | Column | Type × count | Content |
| --- | --- | --- | --- |
| 0 | position | float32 × 3N | x, y, z per star, pc, J2000 ecliptic, at J2000. Stored with 19 of 23 mantissa bits (rounded): ≤ 0.20″ direction error, ≤ 1 ppm distance error |
| 1 | velocity | int16 × 3N | vx, vy, vz per star × 0.1 km/s, same axes, heliocentric. 0 when unknown (flags) |
| 2 | absMag | int16 × N | M_V × 0.01 mag (Johnson V at the Sun, parallax distance, no extinction correction) |
| 3 | teff | uint16 × N | temperature in K, rounded to 10 K; 0 = unknown (671 stars) |
| 4 | flags | uint16 × N | see 3.2 |

Stars are sorted by apparent V as seen from the Sun at J2000, brightest first (index 0 is Sirius A). A renderer can
draw the first k stars for a cheaper sky. Decoded with `decodeStars3D()`; per-section gzip sizes: position 2.94 MB,
velocity 1.30 MB, absMag 0.37 MB, teff 0.49 MB, flags 0.17 MB.

### 3.2 Flags (uint16)

| Bits | Meaning |
| --- | --- |
| 0–2 | Distance source: 0 Gaia DR3 with per-star zero-point (318,230 stars); 1 Gaia DR3, zero-point extrapolated (G ≤ 6 or colour outside the recipe's range) or global (8,028); 2 Gaia DR2 + global zero-point (1,320, including ξ UMa A and B, §4.1); 3 Hipparcos new reduction (2,003); 4 Gliese–Jahreiß (170); 5 literature / system model, see `systems.json` (12); 6 other AT-HYG source (6); 7 no usable parallax, placed at the M_V = −10 upper limit (1: μ Sgr) |
| 3–4 | Distance precision σ_d/d: 0 < 1% (200,067); 1 1–5% (116,647); 2 5–20% (9,380); 3 ≥ 20% or unknown (3,676). Class 3 positions are indicative only (1/parallax is biased at low signal-to-noise); consider fading or hiding them |
| 5–6 | Velocity: 0 full 3D (290,974); 1 proper motion only, radial velocity unknown and set to 0 (38,771); 2 unknown, set to 0 (21); 3 rejected as implausible (> 1000 km/s heliocentric, the signature of a bad parallax), set to 0 (4) |
| 7 | Radial velocity from Gaia DR3 (282,366), with the recommended magnitude corrections |
| 8–9 | Temperature source: 0 Johnson B−V from ground-based photometry (36,581); 1 Tycho-2 BT−VT converted to B−V (292,309); 2 B−V of the spectral type's main-sequence value (177); 3 literature Teff from `systems.json`, or unknown when teff = 0 |
| 10 | Star has an entry in `systems.json` (orbit and/or literature parameters) |
| 11 | Gaia RUWE > 1.4: astrometry probably perturbed by an unresolved companion (65,114; common among bright stars) |
| 12 | V corrected for a companion inside Hipparcos' combined photometry (2,491, §4.3) |
| 13 | Variable star (Hipparcos variability flag or HYG variable designation; 10,921) |
| 14 | Added from the literature, not in AT-HYG (TRAPPIST-1) |
| 15 | V from Tycho-2 converted to Johnson; otherwise Johnson V from Hipparcos, Gliese or the literature |

Accessors are in `src/stars3d.ts` (`distanceSource`, `distancePrecision`, `velocityStatus`, …).

### 3.3 `stars3d-extra.bin` (inside `stars3d-extra.bin.gz`)

Same header layout with magic `LSX1` (floats unused) and two sections: uint16 × N byte-shuffled index into
`star-names.json` `spectralTypes` (0 = none; types are as printed in AT-HYG, mostly from the Tycho-2 Spectral Type
Catalog of Wright et al. 2003 and the HD), and uint8 × N (not shuffled) 1-based index into `constellations`
(the IAU constellation containing the star, from AT-HYG; 0 = unknown). Decoded with `decodeStars3DExtra()`.

### 3.4 `star-names.json` (inside `star-names.json.gz`)

```jsonc
{
  "format": "lightspeed.star-names", "version": 1, "count": 329770,
  "constellations": [["And", "Andromeda", "Andromedae"], …],   // 88, IAU abbreviation, name, genitive
  "spectralTypes": ["", "A1V", …],
  "proper":    [[starIndex, "Sirius", 1], …],     // 1 = on the IAU WGSN list, 0 = other (e.g. "Wolf 359")
  "bayer":     [[starIndex, "α", 0, "CMa"], …],   // Greek letter, superscript (0 = none), constellation
  "flamsteed": [[starIndex, 9, "CMa"], …],
  "variable":  [[starIndex, "V645 Cen"], …],
  "gliese":    [[starIndex, "244A"], …],          // as written in the Gliese–Jahreiß catalogue
  "hr":  { "indexDelta": [...], "id": [...] },    // star index = running sum of indexDelta
  "hip": { "indexDelta": [...], "id": [...] },
  "hd":  { "indexDelta": [...], "id": [...] }
}
```

Counts: 689 proper names (67 of them IAU names approved after AT-HYG v4.0 or on components, attached by HIP, HR, HD
or GJ number), 1,539 Bayer, 2,737 Flamsteed, 4,899 variable, 3,547 Gliese, 9,033 HR, 107,249 HIP and 225,225 HD
designations. The 65 IAU names without a catalogue star are exoplanet hosts fainter than V = 10, protostars, nebulae
and pulsars (listed in `build-log.txt`). Gaia DR3 and Tycho-2 identifiers are not included (they would add ~3 MB).
System members also carry their system name ("Alpha Centauri A", "61 Cygni B", "Capella Aa", "TRAPPIST-1").

`buildNameIndex()` in `src/names.ts` builds a search map: "sirius", "alpha canis majoris", "α CMa", "alp cma",
"9 CMa", "9 canis majoris", "HIP 32349", "HD 48915", "HR 2491", "GJ 244A", "V645 Cen"… and a display name per star
(IAU name first, then other proper names, Bayer, Flamsteed, variable, GJ, HR, HIP, HD).

### 3.5 `constellations.json`

```jsonc
{
  "format": "lightspeed.constellations", "version": 1, "catalogue": "stars3d.bin.gz",
  "match": { "vertices": 893, "failures": 0, "medianArcsec": 0.15, "maxArcsec": 30.56, "segments": 743 },
  "constellations": [
    { "abbr": "Ori", "name": "Orion", "genitive": "Orionis", "english": "Hunter", "rank": 1,
      "label": [ra, dec],                   // J2000 degrees, d3-celestial's label position
      "lines": [[i, i, i, …], …],           // polylines of stars3d indices
      "stars": [{ "i": 12, "hip": 27989, "name": "Betelgeuse", "v": 0.45 }, …] }
  ]
}
```

Every figure vertex of d3-celestial was resolved to a catalogue star by position (J2000, within 90″; among stars
within 15″ of the vertex the brightest is taken, so close pairs such as α Cen A/B or Dubhe A/B use the bright
component). All 893 vertices matched, median offset 0.15″ (the source gives 0.0001° coordinates); the largest
offsets (up to 31″) are high-proper-motion stars. Draw each polyline between the stars' 3D positions; from far away
the figures come apart, as they should. Serpens keeps its two parts as separate polylines.

One vertex is resolved by HIP number instead of position (`match.overrides` in the file): d3-celestial places the end
of the Canes Venatici line exactly on α¹ CVn (HIP 63121, V 5.6), 19.4″ from the star the figure means, Cor Caroli
(α² CVn, HIP 63125, V 2.9); in 3D the two are about 2 pc apart.

### 3.6 `systems.json`

```jsonc
{
  "format": "lightspeed.star-systems", "version": 1,
  "frame": "...", "epoch": "...", "orbitModel": "...", "refs": { "akeson2021": "Akeson R. et al. 2021, AJ 162, 14 …", … },
  "systems": [{
    "id": "alpha-centauri", "name": "Alpha Centauri", "note": "...",
    "members": ["alpha-cen-a", "alpha-cen-b", "proxima"],
    "barycentre": { "posPc": [x, y, z], "velKms": [vx, vy, vz], "distancePc": 1.3305522, "massMsun": 2.1101,
                    "astrometry": { …inputs as published… }, "refs": [...] },
    "orbits": [{
      "id": "alpha-cen-ab", "primary": ["alpha-cen-a"], "secondary": ["alpha-cen-b"],
      "massPrimaryMsun": 1.0788, "massSecondaryMsun": 0.9092,
      "aAu": 23.299, "e": 0.51947, "periodDays": 29133.07, "tPeriJD": 2435278.8,
      "pHat": [..], "qHat": [..],             // unit vectors, J2000 ecliptic: periastron direction and 90° ahead
      "eclipticAngles": { "iDeg", "OmegaDeg", "omegaDeg" },   // same orbit as classical angles w.r.t. the ecliptic
      "source": "published visual orbit",
      "published": { …the elements exactly as published, uncertainties, grade, refs… } }],
    "checks": ["…comparisons with independent measurements, see §4.7…"] }],
  "stars": [{ "id": "vega", "name": "Vega", "catalogueIndex": 4, "hip": 91262, "spectralType": "A0 V",
              "catalogueDistancePc": 7.6786, "radiusRsun": 2.726, "radiusPolarRsun": 2.418, "teffK": 9360,
              "teffPolarK": 10070, "teffEquatorK": 8910, "luminosityLsun": 47.2, "massMsun": 2.15,
              "refs": { "all": "monnier2012" }, "notes": "..." }, …]
}
```

Barycentres move in straight lines from J2000. **Orbit model:** each orbit links two groups of members. The relative
position of group 2 about group 1 is r = a[(cos E − e) p̂ + √(1−e²) sin E q̂], with E − e sin E = 2π(JD − tPeriJD)/P.
Members of group 1 move by −m₂/(m₁+m₂) r and members of group 2 by +m₁/(m₁+m₂) r; a member's position is the
barycentre plus the sum over its orbits. For Alpha Centauri this nests A–B inside (A+B)–Proxima. `systemMembersAt()`
in `src/orbits.ts` implements it; `orbitEllipse()` samples an orbit for drawing. The catalogue entries of members
(flag bit 10) hold the J2000 model position and the barycentre velocity, so a renderer that only moves catalogue
stars linearly still has them in the right place near J2000; replace them with the orbit model when available.

---

## 4. Methods

### 4.1 Positions

Right ascension and declination are AT-HYG's J2000 positions (Tycho-2 mean positions at epoch J2000, errors ~7 mas
for bright to ~60 mas for faint stars; Hipparcos positions where Tycho-2 had none), except for 1,623 stars whose
AT-HYG position is not a J2000 mean position: Tycho-2 "non-mean" positions (observed epoch ~1991; median error 0.26″)
and Gliese positions inherited from HYG (median error 5.2″, 432 stars off by more than 10″, and some grossly wrong —
GJ 94 by 31.6°, GJ 3885 by 15°, confirmed against SIMBAD). For these the Gaia DR3 position of the linked source is
moved to J2000 with its proper motion and radial velocity and used instead. 225 such stars have no Gaia link and keep
their AT-HYG position (most have Gliese distances, distance source 4).

**Hipparcos stars whose AT-HYG position is not a J2000 position.** Stars missing from Tycho-2 proper come into
AT-HYG from the Tycho-2 supplement, which carries the Hipparcos position at epoch **J1991.25**, and some positions
inherited from HYG (pos_src `HIP_X`) are off by up to several arcseconds. The first version of this catalogue kept
them, so Arcturus was 19.9″ from its J2000 position, Altair 5.8″, Pollux 5.5″, Vega 3.1″, and 20 of the 40 brightest
such stars were off by more than 1″. Now, for every star with a Hipparcos number, the Hipparcos new-reduction
position (epoch J1991.25) is carried to J2000 along the star's own 3D motion (its proper motion, distance and radial
velocity); wherever AT-HYG's position differs from that by more than 0.1″ the corrected position is used. That
applies to **4,493 stars**, 539 of which were at the Hipparcos epoch (the build log lists all brighter than V = 3.5).
Before choosing this rule it was checked against Gaia DR3 positions carried to J2000 for 2,480 of the affected stars
(G > 6, RUWE < 1.4): the Hipparcos-based positions agree with Gaia to 0.02″ (median; 90% within 0.09″ for the
J1991.25 group and within 0.37–0.44″ for the others), the AT-HYG positions to 0.05–0.8″
(median by group) with 90th percentiles of 0.7–4″.

**ξ Ursae Majoris (Alula Australis, a vertex of the Ursa Major figure).** AT-HYG gave A and B the same position
(Tycho-2's photocentre of the pair) and A the Gliese distance 10.42 pc while B had 8.73 pc; A also had no velocity and
no HIP number (HIP 55203 is the pair). Neither Hipparcos nor Gaia DR3 has a parallax for A, and Gaia DR3 gives both
stars two-parameter solutions only. Now both sit at B's Gaia DR2 parallax, 114.4867 ± 0.4316 mas (via SIMBAD) with
the DR2 zero-point, i.e. 8.732 pc (the pair's dynamical mass with the orbit below is then 2.9 M☉, as expected for two
G0 V spectroscopic binaries). Their J2000 positions split the Tycho-2 photocentre (169.54548201°, +31.52919433°;
Høg et al. 2000, flag "P") along the grade-1 orbit of the Sixth Orbit Catalog (Izmailov 2019, Astron. Lett. 45, 30: P = 59.8903 yr,
a = 2.50442″, i = 122.187°, Ω = 100.939°, T = 1935.17, e = 0.40432, ω = 126.964°) with B's V-band light fraction
0.393: they are 1.770″ apart at J2000. Both move with the pair's centre, so that straight-line motion keeps them
together: proper motion (−414.1, −556.9) mas/yr from the Tycho-2 photocentre at J2000 and the light-weighted centre
of the Gaia DR3 positions at J2016.0 (Tycho-2's own photocentre proper motion, biased by the 60-year orbit, differs
by ~50 mas/yr), radial velocity −18.2 km/s (Nordström et al. 2004, via SIMBAD). Carried to J2016.0 the model
reproduces Gaia DR3's positions of A and B to 0.01″ and their separation to 0.005″. A is findable as HIP 55203.
Uncertainty: ~0.3″ in position (photocentre versus centre of mass), ~20 mas/yr (0.8 km/s) in the motion.

Position = unit vector × distance, rotated to the ecliptic.

### 4.2 Distances

- **Gaia DR3** parallaxes (queried from the Gaia archive for the source ids AT-HYG links; AT-HYG's own distances are
  1/parallax with no zero-point correction) are corrected for the parallax zero-point of **Lindegren et al. (2021,
  A&A 649, A4)**: the Z₅/Z₆ functions of magnitude, colour (ν_eff or pseudocolour) and ecliptic latitude, coefficient
  tables of 2020-07-20 as in the reference implementation. Typical corrections for these stars are +0.02 to
  +0.04 mas. The recipe is defined for 6 < G < 21; for brighter stars its table edge is used and the star is flagged
  (distance source 1). Where the archive returned no row, or for solutions the recipe does not cover, the global
  offset −0.017 mas (the quasar median of Lindegren et al. 2021) is used (at most 107 stars).
- **Hipparcos instead of Gaia** when the Hipparcos new-reduction parallax (van Leeuwen 2007) has the smaller
  relative error (490 bright stars, where Gaia saturates).
- **Gaia DR2** distances (1,318, from AT-HYG) get the DR2 global zero-point −0.029 mas (Lindegren et al. 2018).
- **Hipparcos** distances listed by AT-HYG use the new reduction; where that failed (some binaries, e.g. β Phe) HYG's
  Hipparcos distance is kept; HYG's 100,000 pc placeholder is treated as "no parallax".
- Distance = 1/parallax. It is unbiased only for precise parallaxes; the precision class (bits 3–4) says when not.
- **Epoch:** parallaxes refer to J2016.0 (DR3), J2015.5 (DR2) or J1991.25 (Hipparcos). Where the radial velocity is
  known the distance is moved to J2000 along the line of sight (Barnard's Star +0.0018 pc; negligible elsewhere).
- **Implausible distances:** a star whose parallax is consistent with zero can come out more luminous than any
  star (M_V < −10). Prominent ones (V ≤ 4.5; only μ Sgr) are placed at the distance where M_V = −10, an upper limit,
  and flagged 7; others are dropped (1).

### 4.3 Photometry: V and B−V

**V:** the Hipparcos Catalogue V (ESA 1997, field H5; ground-based Johnson or derived from Hp) for Hipparcos stars,
unless that value was itself derived from Tycho photometry and Tycho-2 has usable photometry; otherwise Tycho-2 VT
converted to Johnson V; otherwise the Gliese V. **B−V:** Hipparcos B−V when it is ground-based Johnson photometry
(field H37 with source flag G); otherwise Tycho-2 BT−VT converted to Johnson B−V; otherwise the Hipparcos B−V (which
was derived from Tycho-1 photometry); otherwise Gliese; finally, for 177 stars with no colour at all, the B−V of the
spectral type's main-sequence value from Pecaut & Mamajek (2013, table v2022.04.16).

**Tycho-2 → Johnson.** Tycho BT and VT are not Johnson B and V. The conversion is empirical, calibrated in this build
on 28,059 single Hipparcos stars that have both Tycho-2 photometry and ground-based Johnson photometry (median B−V
and V−VT in 0.1-mag bins of BT−VT, linear interpolation; `tycho-calibration.json`; scatter per bin 0.015–0.03 mag).
It replaces the linear ESA (1997) relation B−V = 0.850 (BT−VT), which against these data is biased by up to
−0.057 mag for F stars and +0.06 mag for M stars; V − VT agrees with the ESA relation −0.090 (BT−VT) to ~0.005 mag.
Tycho-2 photometry is not used for VT < 1.9, where it saturates.

**Combined light of close pairs.** Hipparcos often measured close doubles as one object, while AT-HYG (from Tycho-2 or
Gliese) also lists the companion. Where a Hipparcos star has companions without their own HIP number within 10″, their
flux is subtracted from the Hipparcos V (2,491 stars, flag bit 12). Examples: Castor A 1.58 → 1.93,
γ Vir (Porrima) 2.74 → 3.49, ζ¹ Aqr 3.65 → 4.35. For stars saturated in Tycho-2 the companion's Tycho photometry
is less reliable: Acrux A comes out 1.50, about 0.2 mag fainter than usually quoted.

**Absolute magnitude** M_V = V − 5 log₁₀(d / 10 pc), with no correction for interstellar extinction (see §7).

### 4.4 Temperature

Colour temperature from Johnson B−V with Ballesteros (2012, EPL 97, 34008),
T = 4600 [1/(0.92(B−V) + 1.7) + 1/(0.92(B−V) + 0.62)] with B−V clamped to [−0.4, 2.0] — the same function as
`bvToTemperature()` in `src/physics/blackbody.ts`, so the app's Doppler recolouring stays consistent. It is the
temperature of the blackbody with the star's colour, which is what a renderer needs. For the 38 stars in
`systems.json` with a measured effective temperature, that value replaces it (bits 8–9 = 3). Hot stars saturate in
B−V: an O star's colour temperature is ~20,000 K while its effective temperature is 30,000–45,000 K.

### 4.5 Velocities

Space velocity = radial velocity along the line of sight + 4.740470 (km/s)/(au/yr) × proper motion × distance, from
AT-HYG's proper motions (Gaia DR3 for 99%) and the corrected distance. AT-HYG rows whose proper motion has no
recorded source (pm_src "N"; mostly original Hipparcos values inherited from HYG, or a primary's values copied to its
companion) were first treated as having no velocity, which left 454 stars at rest, among them Castor A and B, Mintaka
A and B, γ Lup and β Phe. Now their proper motion comes from the Hipparcos new reduction where it has the star (309;
Castor −191.45, −145.19 mas/yr), else Gaia DR3 (3), else AT-HYG's unsourced value is kept (120; for Castor it would
have been the 1997 value −206.3, −148.2); 22 rows have no proper motion anywhere.

- **Radial velocities:** Gaia DR3 (282,342 stars) wherever the archive has one, including stars where AT-HYG had
  discarded it because its error exceeded its size. Corrections recommended by the Gaia team are applied: for
  rv_template_teff < 8500 K and grvs_mag ≥ 11, subtract 0.02755 g² − 0.55863 g + 2.81129 km/s (Katz et al. 2023,
  A&A 674, A5, eq. 5; 150 stars); for 8500 ≤ rv_template_teff ≤ 14500 K and 6 ≤ grvs_mag ≤ 12, use
  rv − 7.98 + 1.135 g (Blomme et al. 2023, A&A 674, A7; 25,429 stars). Otherwise AT-HYG's radial velocity from
  older compilations (via HYG); HYG's 0.0 placeholders are treated as unknown.
- Radial velocities are spectroscopic: they include each star's gravitational redshift and convective blueshift
  (+0.3 to +0.6 km/s for Sun-like stars, more for white dwarfs). The systems use corrected values where the papers
  give them.
- 38,771 stars have no radial velocity (flag), 21 no proper motion (at rest, flagged); 4 speeds above 1000 km/s
  were rejected.

### 4.6 Names

AT-HYG proper names (HYG, which follows the IAU list plus a few traditional names), Bayer (converted to Greek
letters with superscripts), Flamsteed, HR, HD, HIP and Gliese numbers; variable-star designations from HYG v4.4.
The IAU Working Group on Star Names list was read from exopla.net ("Modern IAU star names", maintained by the WGSN;
snapshot 2026-09-25, 640 names, latest approvals 2026-09-22) to flag IAU names and to attach the 67 newer ones.

### 4.7 Systems

| System | Orbit | Barycentre | Checks (in `systems.json` → `checks`) |
| --- | --- | --- | --- |
| Alpha Centauri A–B | Akeson et al. 2021, Table 8: P = 79.762 yr, a = 17.4930″ (23.30 au), e = 0.51947, i = 79.243°, Ω = 205.073°, ω = 231.519°, T = 1955.564, ϖ = 750.81 mas, M = 1.0788 + 0.9092 M☉ (ORB6 grade 2) | Akeson et al. 2021 Table 9 (J2019.5); RV −22.3796 km/s (their V₀) + 0.0614 km/s gravitational-redshift correction of Kervella et al. 2017 | ORB6 ephemeris 2025–2029 reproduced to ≤ 0.02° and ≤ 0.0013″; Hipparcos 1991.25 positions of A and B to 0.04″ and 0.11″ |
| Proxima – (A+B) | Osculating Kepler orbit from present-day data: Proxima's Gaia DR3 astrometry, the AB barycentre above, absolute RVs of Kervella et al. 2017 (−22.204 km/s for Proxima), M_P = 0.1221 M☉. Result: a = 8,042 au, e = 0.506, P = 496 kyr, now 12,061 au from AB near apastron, last periastron 230 kyr ago, next in 266 kyr; relative speed 279 m/s against 557 m/s escape speed | system barycentre includes Proxima | Kervella et al. 2017 (Table 3) published a = 8.7 (+0.7/−0.4) kau, e = 0.50, P = 547 (+66/−40) kyr with older parallaxes (747.17 mas for AB, 768.77 for Proxima); recomputing from their Table B.1 state vector reproduces their numbers exactly (a = 8,652 au, e = 0.496, P = 547 kyr), so the difference comes from Akeson et al.'s 0.49%-larger AB parallax. Both are listed; the model places Proxima exactly at its Gaia DR3 position in 2016 |
| Sirius A–B | Bond et al. 2017, Table 4: P = 50.1284 yr, a = 7.4957″, e = 0.59142, i = 136.336°, Ω = 45.400°, ω = 149.161°, T = 1994.5715; ϖ = 378.9 mas; M = 2.063 + 1.018 M☉ | Hipparcos (van Leeuwen 2007) orbital-binary solution of HIP 32349 at 1991.25 (the centre of mass, as used by Bond et al.); RV −8.47 km/s (gravitational-redshift corrected) | ORB6 ephemeris to ≤ 0.04°, ≤ 0.0007″. Gaia DR3 puts Sirius B 0.52″ from the model in 2016 and measures its proper motion 21 mas/yr different in declination; Gaia flags that source (RUWE 2.4, parallax 3σ from Bond's), so the Hipparcos centre of mass is kept |
| Procyon A–B | Bond et al. 2015, Table 8: P = 40.840 yr, a = 4.3075″, e = 0.39785, i = 31.408°, Ω = 100.683°, ω = 89.23°, T = 1968.076; ϖ = 285.0 mas; M = 1.478 + 0.592 M☉ | Hipparcos HIP 37279 orbital solution; RV −4.115 km/s (Irwin et al. 1992, as adopted by Bond et al.) | ORB6 to ≤ 0.05°; the HST measurements of 2013.0947 and 2014.7038 to 0.03° and 0.0014″ |
| 61 Cygni A–B | Shakht, Gorshanov & Vasilkova 2017 as listed in ORB6 (grade 4, **preliminary**): P = 664.37 ± 26.84 yr, a = 24.36″, e = 0.457, i = 53.29°, Ω = 174.88°, ω = 149.32°, T = 1700.37; masses 0.69 + 0.61 M☉ (models, Kervella et al. 2008) | mass-weighted Gaia DR3 astrometry of both stars (J2016.0) | Separation and position angle in 2016 against Gaia DR3: 31.576″/152.59° vs 31.593″/152.58°; relative velocity radial 1.48 vs 1.38 km/s, tangential 1.81 vs 1.82 km/s — the preliminary orbit and its node agree with Gaia. Kepler's law with this orbit gives 1.40 M☉ against 1.30 from models (within the orbit's ~10%) |
| Capella Aa–Ab | Torres et al. 2015, Table 1: P = 104.02128 d, a = 56.442 mas (0.74272 au), e = 0.00089, i = 137.156°, Ω = 40.522°, ω_A = 342.6° (relative orbit ω = 162.6°), T = HJD 2448147.6; M = 2.5687 + 2.4828 M☉ | Hipparcos position at 1991.25, Torres et al.'s proper motion, orbital parallax 75.994 mas and γ = +29.9387 km/s | ORB6 lists this orbit with ω = 342.6° as if it were the relative orbit's, so its ephemeris is exactly 180° from this model; the model uses ω_A + 180°, which reproduces Torres et al.'s radial-velocity curves. The wide pair Capella H–L is not modelled |

All visual-orbit comparisons with ORB6 use ORB6's conventions (Besselian epochs; position angles for the equinox of
date, 20.04″/yr · sin α · sec δ). Visual-orbit elements are converted to 3D with the Thiele–Innes constants in the
standard convention (x north, y east, z away from the observer; Ω is the node where the secondary recedes), then to
ecliptic unit vectors p̂, q̂. Decimal-year epochs are read as Julian years; the Besselian difference (< 1 day) is below
every quoted uncertainty.

### 4.8 Named stars (`systems.json` → `stars`)

Values are copied from the cited papers. Where a paper gives a limb-darkened angular diameter θ and bolometric flux F
instead (Heiter et al. 2015; Boyajian et al. 2013), the build derives R = θ/2 · d, L = 4πd²F and
Teff = (4F/σθ²)^¼ at the catalogue distance and records how (`derived`). Uncertainties are the papers'.

| Star | d (pc, catalogue) | Radius (R☉) | Teff (K) | L (L☉) | Mass (M☉) | Sources |
| --- | --- | --- | --- | --- | --- | --- |
| Sun | — | 1 | 5772 | 1 | 1 | IAU 2015 B3 |
| Alpha Centauri A | 1.3323 | 1.2175 ± 0.0055 | 5792 ± 16 | 1.5059 | 1.0788 | Akeson 2021; Heiter 2015 |
| Alpha Centauri B | 1.3324 | 0.8591 ± 0.0036 | 5231 ± 20 | 0.4981 | 0.9092 | Akeson 2021; Heiter 2015 |
| Proxima Centauri | 1.3023 | 0.1542 ± 0.0045 | 3042 ± 117 | — | 0.1221 | Kervella 2017 (Mann 2015 relations); Ségransan 2003 |
| Sirius A | 2.6392 | 1.7144 ± 0.009 | 9845 ± 64 | 24.74 | 2.063 | Bond 2017 |
| Sirius B | 2.6391 | 0.008098 | 25369 ± 46 | 0.02448 | 1.018 | Bond 2017 |
| Procyon A | 3.5087 | 2.033 | 6554 ± 84 | 6.87 | 1.478 | Bond 2015; Heiter 2015 (θ = 5.390 mas) |
| Procyon B | 3.5087 | 0.01232 | 7740 ± 50 | — | 0.592 | Bond 2015 |
| 61 Cygni A | 3.4977 | 0.6675 | 4374 ± 22 | 0.147 | 0.69 | Kervella 2008 (θ); Heiter 2015 |
| 61 Cygni B | 3.4974 | 0.5945 | 4044 ± 32 | 0.0852 | 0.61 | Kervella 2008 (θ); Heiter 2015 |
| Capella Aa | 13.159 | 11.98 ± 0.57 | 4970 ± 50 | 78.7 | 2.5687 | Torres 2015 |
| Capella Ab | 13.159 | 8.83 ± 0.33 | 5730 ± 60 | 72.7 | 2.4828 | Torres 2015 |
| Canopus | 94.79 | 73.3 ± 5.2 | 7657 ± 161 | 16,600 | 9.8 ± 1.8 | Domiciano de Souza 2021 |
| Arcturus | 11.257 | 25.48 | 4286 ± 30 | 170 ± 8 | 1.08 ± 0.06 | Heiter 2015 (θ); Ramírez & Allende Prieto 2011 |
| Vega | 7.679 | 2.726 eq., 2.418 pole | 9360 mean (10,070 pole, 8,910 eq.) | 47.2 ± 2.0 | 2.15 | Monnier 2012 |
| Rigel | 264.6 | — | — | 123,000 (adopted) | — | de Almeida 2022 |
| Betelgeuse | 152.7 | 764 (+116/−62) at 168 pc | 3600 ± 25 | — | 16.5–19 | Joyce 2020; Levesque & Massey 2020 |
| Altair | 5.129 | 2.029 eq., 1.634 pole | 8450 pole, 6860 eq. | — | 1.791 (model input) | Monnier 2007 |
| Aldebaran | 20.43 | 45.2 | 3927 ± 40 | 438 | 0.96 ± 0.41 | Heiter 2015 |
| Antares | 169.8 | 682 (±17% from distance) | 3660 ± 120 | 76,000 | 15 ± 5 | Ohnaka 2013 |
| Spica A (+ B) | 76.57 | 7.47 (3.74) | 25,300 (20,900) | — | 11.43 (7.21) | Tkachenko 2016 |
| Pollux | 10.358 | 8.89 | 4858 ± 60 | 39.6 | 2.3 ± 0.4 | Heiter 2015 |
| Fomalhaut | 7.704 | 1.842 ± 0.019 | 8590 ± 73 | 16.63 | 1.92 | Mamajek 2012 |
| Deneb | 432.9 | 203 ± 17 at 802 pc | 8525 ± 75 | 196,000 at 802 pc | 19 ± 3 | Schiller & Przybilla 2008 |
| Regulus | 24.31 | 4.21 eq., 3.22 pole | 14,520 pole, 11,010 eq. | 341 | 4.15 | Che 2011 |
| Polaris | 132.6 | 46.27 at 136.9 pc | — | — | 5.13 ± 0.28 | Evans 2024 |
| Tau Ceti | 3.650 | 0.791 | 5414 ± 21 | 0.484 | 0.783 ± 0.012 | Heiter 2015; Teixeira 2009 |
| Epsilon Eridani | 3.219 | 0.736 | 5076 ± 30 | 0.324 | 0.80 | Heiter 2015 |
| 51 Pegasi | 15.52 | 1.143 | 5749 (derived) | 1.29 | — | Boyajian 2013 (θ, F) |
| HR 8799 | 40.81 | 1.44 ± 0.06 | 7193 ± 87 | 5.05 | 1.516 | Baines 2012 |
| Barnard's Star | 1.8299 | 0.178 ± 0.011 | 3278 ± 51 | 0.00329 | 0.163 | Ribas 2018 |
| Wolf 359 | 2.408 | 0.1348 | 2818 ± 60 | — | 0.0997 | Mann 2015 |
| Lalande 21185 | 2.547 | 0.389 | 3563 ± 60 | — | 0.386 | Mann 2015 |
| Ross 128 | 3.375 | 0.1967 | 3192 ± 60 | — | 0.168 | Mann 2015 |
| Luyten's Star | 3.785 | 0.315 | 3317 ± 60 | — | 0.283 | Mann 2015 |
| Gliese 581 | 6.299 | 0.311 | 3395 ± 60 | — | 0.292 | Mann 2015 |
| Lacaille 9352 | 3.288 | 0.468 | 3688 ± 86 | — | 0.495 | Mann 2015 |
| TRAPPIST-1 | 12.468 | 0.1192 ± 0.0013 | 2566 ± 26 | 0.000553 | 0.0898 | Agol 2021 |

Rigel's and Polaris's temperatures, and Altair's and Regulus's mean temperatures, are not given because no source was
verified for this file; the catalogue colour temperature applies to them.

---

## 5. Evaluator code (`staging/stars/src`)

| Module | Main exports |
| --- | --- |
| `stars3d.ts` | `decodeStars3D`, `decodeStars3DExtra`, `fetchGzip`, `gunzipIfNeeded`, flag enums and accessors |
| `motion.ts` | `positionSeenFromSun(stars, i, jy)`, `positionAt(stars, i, jy)` (coordinate position), `positionSeenFrom(stars, i, observer, jy)` (retarded position, exact for linear motion), `positionsSeenFromSun` (bulk), `closestApproachToSun`, `motionQuality` |
| `photometry.ts` | `distanceModulus`, `apparentMagnitude`, `apparentMagnitudeFrom(stars, i, observer, jy)`, `sunApparentMagnitudeFrom(observer)` (M_V☉ = 4.81, Willmer 2018) |
| `orbits.ts` | `solveKepler`, `orbitRelativeState`, `barycentreAt`, `systemMembersAt`, `systemMembersAtCoordinateTime`, `systemMembersSeenFrom`, `orbitEllipse`, types for `systems.json` |
| `names.ts` | `buildNameIndex`, `findStar`, `searchStars`, `normalizeName` |
| `frames.ts`, `constants.ts` | frame rotations (`eclipticToWorld` etc.), sky bases, units and epochs |

Run the tests with `npx vitest run --root staging/stars` (50 tests; they read the shipped files). They check, among
other things: Sirius first at 2.639 pc; ecliptic axes (Polaris 0.736° from the celestial pole); agreement with the
existing `stars.bin` directions for the 100 brightest stars; Hipparcos V of eight bright stars reproduced from the
Sun; the Sun at V ≈ 0.4 from α Cen; α Cen A at V ≈ −6.8 from Proxima; Barnard's Star's closest approach (1.157 pc in
9,711 yr); Gliese 710 passing 0.071 pc (14,700 au) from the Sun in 1.29 Myr (flagged beyond the ±1 Myr validity;
Berski & Dybczyński 2016 found 13,366 au in 1.35 Myr from Gaia DR1); the ORB6 ephemerides and HST measurements
above; Proxima at its Gaia position; the Kepler solver to 10⁻¹² for e ≤ 0.99; name lookups; every constellation
vertex a naked-eye catalogue star. The code type-checks under the app's compiler settings (strict,
`verbatimModuleSyntax`, `noUnusedLocals`).

**GPU use.** Upload `positions` (float32 × 3) and `velocitiesInt16` (int16 × 3, un-normalised) and move stars in the
vertex shader: `p = position + velocity * 0.1 * (t − 2000) * 1.0227121650537077e-6` (pc). In float32 this is exact
enough for |t − 2000| ≤ 1 Myr (displacements ≤ ~1 kpc). For a floating origin subtract the camera position (in
float64 on the CPU) from the star's position before converting to float32.

---

## 6. Time: epochs and light travel

- **Linear motion** from J2000: r(t) = r₀ + v (t − 2000). Validity about ±1 Myr: after 1 Myr the Galactic tide has
  moved a star 100 pc away by only ~0.04 pc relative to the straight line (tidal acceleration ≈ Ω² r with
  Ω ≈ 26 km/s/kpc), less than the effect of a 1 km/s velocity error (≈ 1 pc per Myr). Beyond that the errors grow quadratically (Bailer-Jones 2015, A&A 575, A35, shows linear motion
  biases encounter predictions over Myr timescales). `motionQuality()` returns `beyond-validity` past ±1 Myr and
  warns for stars without radial velocity (their line-of-sight motion is missing: typically 20–30 pc of error per Myr).
- **What you see vs. where it is.** The catalogue gives where each star *appears* at J2000. Its light left d/c
  earlier, so its actual position at J2000 is r₀ + v·d/c: 0.0046 pc for Arcturus, ~0.2 pc for a fast star 1 kpc
  away. `positionAt()` gives the actual (coordinate) position; `positionSeenFrom(observer, t)` solves
  |r(t_e) − observer| = c (t − t_e) exactly for linear motion, which is what an observer at rest at that point sees
  (the ship's own aberration and Doppler shift are applied by the app on top). From the Sun at J2000 it returns the
  catalogue position. The systems have the same three views (`systemMembersAt`, `…AtCoordinateTime`, `…SeenFrom`).

---

## 7. Accuracy and known limits

- **Directions:** ≤ 0.2″ storage error on top of the catalogue's 0.007–0.06″. Exception: 225 stars with Gliese
  positions and no Gaia link keep HYG's positions, which can be several arcseconds off (§4.1). Checked after the
  rebuild against SIMBAD's J2000 positions for all 505 stars brighter than V = 4 with a HIP number: median 0.054″,
  90th percentile 0.15″, 99th 0.46″. The three largest differences, α Cen B 2.0″, Sirius 1.5″ and Procyon 1.2″, are
  orbiting-system members whose positions here come from their orbits; SIMBAD carries their 1991 Hipparcos positions
  forward in a straight line, which the orbital motion invalidates.
- **Distances:** 61% of stars better than 1%, 96% better than 5% (Gaia DR3 formal errors). Systematic: the
  zero-point recipe is thought to over-correct stars brighter than G ≈ 11 by roughly 0.01–0.015 mas (checks with
  Cepheids and asteroseismic giants: Riess et al. 2021, arXiv:2012.08534; Zinn 2021, AJ 161, arXiv:2101.07252,
  who finds 15 ± 3 µas for G ≲ 10.8): distances of such stars may be ~1.5% too short per kpc. 3,678 stars (1.1%) have ≥ 20% or unknown errors; they include the
  farthest points (tens of kpc), which are not real distances.
- **Uncertain distances of famous stars** (the catalogue keeps the measured parallax; alternatives in `systems.json`):
  Betelgeuse — Hipparcos 6.55 ± 0.83 mas (153 pc), Harper et al. (2017) 222 (+48/−34) pc, Joyce et al. (2020)
  168 (+27/−15) pc from seismology; its radius scales with whichever is adopted. Deneb — Hipparcos 433 pc versus
  802 ± 66 pc from its association (Schiller & Przybilla 2008). Rigel — 265 pc (Hipparcos), luminosity uncertain.
  Polaris — 133 pc (Hipparcos) versus 136.90 ± 0.34 pc (Gaia DR3 parallax of its bound companion Polaris B with the
  Lindegren offset, used by Evans et al. 2024). μ Sgr —
  no usable parallax (upper-limit placement). Antares — Hipparcos 5.89 ± 1.00 mas (170, +35/−25 pc).
- **Magnitudes:** V to 0.01–0.02 mag for Hipparcos stars, 0.02–0.1 mag for Tycho-2 stars (VT errors grow toward
  V = 10); split pairs ±0.2 mag. Variable stars have catalogue mean values (Betelgeuse 0.0–1.6, Mira 2–10).
- **Temperatures:** colour temperatures; ±100–200 K for FGK stars from the B−V errors, plus the difference between
  colour and effective temperature (large for O/B stars and cool giants).
- **No interstellar extinction** anywhere. Seen from the Sun the catalogue is exact by construction; approached
  closely, a star that is dimmed by dust (typically 0.5–1 mag per kpc in the disc) will look too faint and too red.
- **Binaries:** most unresolved pairs are one point (RUWE flag marks 65,114 stars whose astrometry suggests a
  companion). Only the five systems above are modelled with orbits.
- **Brown dwarfs, white dwarfs, faint M dwarfs:** largely missing even nearby (see §1).
- **Radial-velocity zero point:** spectroscopic velocities include gravitational redshift and convective shifts
  (≲ 0.6 km/s for main-sequence stars).
- **ξ UMa A and B:** see §4.1 (position ~0.3″, motion ~0.8 km/s).
- **61 Cygni** orbit is preliminary; positions more than a few decades from now are uncertain by several percent of
  the orbit. **Sirius:** Gaia DR3 disagrees with the model's centre of mass by 0.5″ (discussed in §4.7).
- **Proxima's orbit** depends strongly on the α Cen AB parallax (5σ disagreements between published values); the
  period is 496 kyr with present data and 547 kyr in Kervella et al. (2017).

---

## 8. Sources and licences

| Input | Use | Licence / terms |
| --- | --- | --- |
| AT-HYG v4.0, subset `athyg_40_reduced_m10` (David Nash, astronexus; https://codeberg.org/astronexus/athyg) | Star list, positions, identifiers, names, proper motions, Tycho photometry, spectral types, constellations | **CC BY-SA 4.0** (verified in the repository's LICENSE and README). Share-alike applies to the derived files; see "Licence of the derived files" below |
| Gaia DR3 (ESA/Gaia/DPAC; Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1), `gaiadr3.gaia_source` columns queried from https://gea.esac.esa.int/tap-server/tap for the AT-HYG source ids | Parallaxes and errors, zero-point inputs, radial velocities, RUWE, positions of 1,623 stars | **CC BY-NC 3.0 IGO** (https://www.cosmos.esa.int/web/gaia-users/license): free to use with credit to ESA/Gaia/DPAC, non-commercial. The raw query result is not shipped; the shipped files contain values derived from it (as AT-HYG itself does) |
| Hipparcos Catalogue (ESA 1997, SP-1200; VizieR I/239) and Hipparcos new reduction (van Leeuwen 2007, A&A 474, 653; VizieR I/311), via CDS | V, B−V and their source flags; parallaxes and errors; positions (J1991.25) and proper motions for the 4,493 corrected positions and 309 filled proper motions | ESA mission data, free with acknowledgement; retrieved through VizieR (CDS, Strasbourg), which asks for acknowledgement |
| Tycho-2 (Høg et al. 2000, A&A 355, L27; VizieR I/259) and SIMBAD (Wenger et al. 2000) | ξ UMa: Tycho-2 photocentre position; B's Gaia DR2 parallax and the systemic radial velocity of Nordström et al. (2004, A&A 418, 989) as listed by SIMBAD | Catalogue values quoted with citation; CDS asks for acknowledgement |
| HYG v4.4 (astronexus, https://codeberg.org/astronexus/hyg) | Variable-star designations | CC BY-SA 4.0 |
| IAU WGSN star names, "Modern IAU star names" at https://exopla.net/star-names/modern-iau-star-names/ (maintained for the WGSN; snapshot 2026-09-25) | Which names are IAU-approved; names approved after AT-HYG v4.0 | Names are facts; the IAU asks users to cite https://www.iau.org/public/themes/naming_stars/ . No etymology text is copied |
| Pecaut & Mamajek (2013, ApJS 208, 9), table "A Modern Mean Dwarf Stellar Color and Effective Temperature Sequence" v2022.04.16 (E. Mamajek) | B−V from spectral type for 177 stars | Numbers from a published table, cited as the author requests |
| Lindegren et al. (2021, A&A 649, A4) Tables 9–10 (via the reference code `gaiadr3_zeropoint`, LGPL-3.0; only the published coefficients were reimplemented, the code is not shipped) | Parallax zero-point | Published coefficients |
| Katz et al. (2023, A&A 674, A5); Blomme et al. (2023, A&A 674, A7) | RV corrections | Published formulas |
| d3-celestial (Olaf Frohn), `data/constellations.lines.json`, `data/constellations.json`, https://github.com/ofrohn/d3-celestial | Constellation figures, names, genitives, English meanings, label positions | **BSD 3-Clause** (verified: repository LICENSE, GitHub licence metadata). Figures after the IAU/Sky & Telescope charts with modifications by Frohn. The copyright notice must be reproduced (below) |
| Sixth Catalog of Orbits of Visual Binary Stars (Hartkopf, Mason, Matson et al.; https://www.astro.gsu.edu/wds/orb6.html), orbits and ephemerides retrieved 2026-09-25 | 61 Cygni orbit listing; ξ UMa AB orbit (Izmailov 2019, Astron. Lett. 45, 30, as listed in ORB6); test ephemerides | Catalogue of published orbits; each orbit is credited to its paper |
| Papers in `systems.json` → `refs` (Akeson 2021; Kervella 2016, 2017, 2008; Bond 2015, 2017; Irwin 1992; Shakht 2017; Torres 2015; Heiter 2015; Mann 2015 via VizieR J/ApJ/804/64; Ségransan 2003; Monnier 2007, 2012; Che 2011; Joyce 2020; Levesque & Massey 2020; Harper 2017; Ohnaka 2013; Schiller & Przybilla 2008; Mamajek 2012; Ramírez & Allende Prieto 2011; Tkachenko 2016; Domiciano de Souza 2021; Evans 2024; de Almeida 2022; Teixeira 2009; Ribas 2018; Agol 2021; Costa 2006; Boyajian 2013 via VizieR J/ApJ/771/40; Baines 2012; Soubiran 2018; IAU 2015 B3) | Orbits, barycentres, stellar parameters | Facts from the literature, cited per value |
| Ballesteros (2012, EPL 97, 34008) | B−V → temperature | Published formula |
| Willmer (2018, ApJS 236, 47) | M_V of the Sun = 4.81 | Published value |

d3-celestial notice (required by its licence for redistribution):

> Copyright (c) 2015, Olaf Frohn. All rights reserved. Redistribution and use in source and binary forms, with or
> without modification, are permitted provided that the following conditions are met: 1. Redistributions of source
> code must retain the above copyright notice, this list of conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the
> following disclaimer in the documentation and/or other materials provided with the distribution. 3. Neither the
> name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived
> from this software without specific prior written permission. THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS
> AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
> WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
> HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
> (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
> BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
> TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
> POSSIBILITY OF SUCH DAMAGE.

Gaia acknowledgement (as ESA requests): "This work has made use of data from the European Space Agency (ESA) mission
Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC,
https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC has been provided by national
institutions, in particular the institutions participating in the Gaia Multilateral Agreement."

### Licence of the derived files

`stars3d.bin.gz`, `stars3d-extra.bin.gz` and `star-names.json.gz` combine two licences that must both be honoured:

- AT-HYG v4.0 is **CC BY-SA 4.0**: credit David Nash (astronexus), indicate changes, and share adaptations under
  the same licence.
- The files also contain values derived from Gaia DR3 (distances, radial velocities, positions), and ESA states on
  https://www.cosmos.esa.int/web/gaia-users/license (checked 25 September 2026) that "Gaia data are distributed under
  the CC BY-NC 3.0 IGO license": credit ESA/Gaia/DPAC, **non-commercial use only**.

CC BY-SA forbids adding restrictions and CC BY-NC forbids commercial use, so the two cannot be merged into a single
licence, and the files cannot be offered under CC BY-SA 4.0 alone (the first version of this document said they
could; that was wrong). What is permitted, and what the CREDITS row below says: the files may be used and shared
**non-commercially**, with credit to AT-HYG/David Nash and to ESA/Gaia/DPAC, and adaptations must keep the same
terms. Lightspeed is non-commercial, so it can ship them. Any commercial reuse would need ESA's permission for the
Gaia-derived values (AT-HYG itself redistributes Gaia DR3 values and carries the same tension). Hipparcos, Tycho-2 and
SIMBAD values are ESA/CDS data free with acknowledgement and add no further restriction.

### Rows to add to `CREDITS.md`

| Files | Source | Licence |
| --- | --- | --- |
| `public/data/stars3d.bin.gz`, `public/data/stars3d-extra.bin.gz`, `public/data/star-names.json.gz` | Derived from [AT-HYG v4.0](https://codeberg.org/astronexus/athyg) by David Nash (astronexus), with distances and radial velocities from [Gaia DR3](https://www.cosmos.esa.int/gaia) (ESA/Gaia/DPAC), photometry and parallaxes from the Hipparcos Catalogue (ESA 1997) and its new reduction (van Leeuwen 2007) via [VizieR](https://vizier.cds.unistra.fr/), variable-star names from [HYG v4.4](https://codeberg.org/astronexus/hyg), and the [IAU list of star names](https://www.iau.org/public/themes/naming_stars/) | Non-commercial use only. The AT-HYG content is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (credit David Nash / astronexus; share alike); the Gaia DR3-derived values are [CC BY-NC 3.0 IGO](https://www.cosmos.esa.int/web/gaia-users/license) (credit ESA/Gaia/DPAC; non-commercial). Both sets of terms apply to these files, so they may be shared and adapted only non-commercially, with both credits, under the same terms. |
| `public/data/constellations.json` | Constellation figures and names from [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (after the IAU / Sky & Telescope charts), linked to the stars above | [BSD 3-Clause](https://github.com/ofrohn/d3-celestial/blob/master/LICENSE), Copyright (c) 2015, Olaf Frohn |
| `systems.json` (star systems and named-star parameters) | Compiled for Lightspeed from the papers cited in the file (orbits: Akeson et al. 2021, Bond et al. 2015 and 2017, Shakht et al. 2017, Torres et al. 2015; Proxima: Kervella et al. 2017 and Gaia DR3) | Values from the literature, each with its reference; the Proxima state uses Gaia DR3 (ESA/Gaia/DPAC, CC BY-NC 3.0 IGO) |

Add to the "Other sources used by the code" list: the Gaia DR3 parallax zero-point of Lindegren et al. (2021) and
radial-velocity corrections of Katz et al. (2023) and Blomme et al. (2023); the Sixth Catalog of Orbits of Visual
Binary Stars (USNO/GSU) for checks; Pecaut & Mamajek (2013) for colours of spectral types.

---

## 9. Rebuilding

```
node scripts/build-stars3d.mjs --fetch   # downloads missing inputs into data-raw/ (never re-downloads)
node scripts/build-stars3d.mjs           # writes stars3d*.bin.gz, star-names.json.gz, staging/stars/systems.json
node scripts/build-constellations.mjs    # after the above: writes public/data/constellations.json
npx vitest run --root staging/stars
```

Inputs in `data-raw/` (sha256):

| File | sha256 | Origin |
| --- | --- | --- |
| `athyg_40_reduced_m10.csv.gz` | a9ec5d515d1222d5bf86e8e84e762cbd325938cc6bd4b0d8760327386fa7c151 | Codeberg LFS, astronexus/athyg `data/subsets/` |
| `gaia_dr3_athyg40_m10.csv.gz` | 70ae87957619dbb88c0aefa3bdbeaf35b4c88731f04846942691b2ee2f6b92dd | Gaia archive TAP, 329,938 rows, 5,000 ids per request, columns in the script |
| `gaia_dr3_positions_athyg40_m10.csv.gz` | 9c01327d86d64c3a584941f32ceca2624736d12bdb88442b036cbf668ac6b0e0 | Gaia archive TAP: positions for the 1,678 Gaia-linked stars with non-mean AT-HYG positions |
| `hip1_phot.csv.gz` | 5b4abab2ab97145a5b02d063c3844c5a721be5f635bbedd0472ab237e61daa42 | VizieR I/239: HIP, Vmag, r_Vmag, B−V, e_B−V, r_B−V, VarFlag, MultFlag |
| `hip2_plx.csv.gz` | d7dd83dce22bfba5a7c7baad1002fb4d258b4b1b0d2497f13687082484251470 | VizieR I/311: HIP, Plx, e_Plx, pmRA, pmDE, Hpmag |
| `hip2_pos.csv.gz` | 59b25398cffd1b7fa5ddeb4058e1d2619bc9cae4d09a463515d8f8cea76f397c | VizieR I/311: HIP, RArad, DErad (epoch J1991.25), pmRA, pmDE; 117,955 rows (added 25 September 2026) |
| `hyg_v44.csv.gz` | 00b349893b9a53106dd488d8371e8d2fa586043e500bb3cdb8bff3931682197d | HYG v4.4 (already cached for `build-stars.mjs`) |
| `exopla_modern_iau_star_names_2026-09-25.html` | 7484ecee58c1af9e4b3c2a576fee4fad46a3a1f62d9722a6bb043bcaf54c65d8 | exopla.net snapshot |
| `EEM_dwarf_UBVIJHK_colors_Teff.txt` | 1de2edeec17bb3346e0e4e70b999de5ee29947df38474e64cddb7cfacc164b7f | E. Mamajek, v2022.04.16 |
| `d3celestial_constellations.lines.json` | 294f66bef5d5cf50b1e17f16d2efa1d97a15131612c68dd935adef6e7373e13c | d3-celestial master |
| `d3celestial_constellations.json` | ab4ae692027cbc042c0d6791a84456a65eb7c55656107fd00c58ff6e55d4d8b2 | d3-celestial master |
| `d3celestial_LICENSE`, `orb6orbits_2026-09-25.txt`, `orb6ephem_2026-09-25.txt` | | licence text; ORB6 (reference and test values, and the ξ UMa orbit) |

The build takes about 80 s and is deterministic. `build-stars3d.mjs` reads `d3celestial_constellations.json` for constellation
names; `build-constellations.mjs` must run after it because star indices depend on the sort order.

---

## 10. Changes after the independent verification (25 September 2026)

A check against SIMBAD, VizieR and the cited papers confirmed the file layouts, the ecliptic rotation, the distances
and velocities, the visual orbits against the Sixth Orbit Catalog and every other constellation vertex, and found
the following, all fixed here (details in the sections named):

1. **Epoch of positions (§4.1).** Stars from the Tycho-2 supplement carried their Hipparcos J1991.25 positions
   (Arcturus 19.9″ off, Altair 5.8″, Pollux 5.5″, Vega 3.1″), and some HYG-derived positions were off by several
   arcseconds. 4,493 positions are now the Hipparcos new reduction carried to J2000; bright stars agree with
   SIMBAD's J2000 positions to 0.054″ (median). New cached input: `data-raw/hip2_pos.csv.gz`.
2. **Zero velocities (§4.5).** 454 stars had no velocity because AT-HYG gives their proper motion no source; 21
   remain (309 filled from Hipparcos, 3 from Gaia DR3, 120 keep AT-HYG's value). Castor now moves.
3. **ξ UMa A (§4.1).** Was 1.7 pc behind its companion, at the same sky position, without a velocity or HIP number.
4. **Canes Venatici (§3.5).** The figure now ends on Cor Caroli (α² CVn), not its faint companion α¹ CVn.
5. **Licence (§8).** The files cannot be released under CC BY-SA 4.0 alone because they contain Gaia-derived
   values (CC BY-NC 3.0 IGO); the CREDITS row now says non-commercial use, with both credits.
