# Galaxies, the cosmic web and the CMB (staging/cosmos)

Data and evaluator code for the extragalactic layer: the Local Group and its neighbours, named galaxies and
clusters (the ones the Learn articles use), 55,877 galaxies with measured distances for the cosmic web, and
an all-sky CMB texture. Everything here is heliocentric. Built 25 September 2026.

## Outputs

| File | Size (bytes) | What |
| --- | --- | --- |
| `public/data/local-galaxies.json.gz` | 30,810 gz / 142,211 raw | 169 galaxies within 3 Mpc: every confirmed dwarf in the Local Volume Database v1.1.1 (CC0) + M31 and M33 |
| `staging/cosmos/named.json` | 31,417 (7,711 gz) | 15 named galaxies, clusters and redshift-record galaxies, with sources |
| `public/data/cosmic-web.bin.gz` | 867,446 gz / 1,285,235 raw | 55,877 Cosmicflows-4 galaxies: position, velocity, measured distance, Ks |
| `public/textures/cmb.png` | 874,361 | CMB anisotropy, colour, 2048 x 1024 palette PNG, galactic equirectangular |
| `public/textures/cmb-data.png` | 289,676 | same map as a linear temperature code, 1024 x 512 greyscale PNG |

Build scripts (Node 24, no dependencies; they read `data-raw/cosmos/` and fetch a raw file only if it is
missing):

```
node scripts/build-cosmic-web.mjs      # writes cosmic-web.bin.gz and data-raw/cosmos/cosmic-web-index.json
node scripts/build-local-galaxies.mjs  # needs the index above; writes local-galaxies.json.gz and named.json
node scripts/build-cmb.mjs             # writes cmb.png and cmb-data.png
```

All three are deterministic: a rerun from the cache reproduces the files byte for byte. Suggested
`package.json` scripts for the integration team: `data:cosmic-web`, `data:local-galaxies`, `data:cmb`.

Raw inputs in `data-raw/cosmos/` (gitignored):

| File | Origin |
| --- | --- |
| `lvdb/lvdb_v1.1.1_comb_all.ecsv`, `lvdb/LICENSE`, `lvdb/README.md`, `lvdb/*.rst` | Local Volume Database release v1.1.1 (https://github.com/apace7/local_volume_database/releases/tag/v1.1.1), its CC0 1.0 licence, README and column descriptions |
| `NearbyGalaxies_Jan2021_PUBLIC.fits`, `table1_OCT2019.pdf`, `References.dat`, `Comments.dat`, `Update.log`, `table1_OCT2019.txt` | the McConnachie (2012) updated catalogue from the CADC, used by the first version only (no longer read; see "Not shipped") |
| `J_ApJ_944_94/table2.dat.gz`, `table4.dat.gz`, `ReadMe` | https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ |
| `J_AJ_144_4/*` | McConnachie (2012) original tables from CDS (reference only; not read) |
| `cf4_2masx_xmatch.csv.gz` | CDS XMatch (http://cdsxmatch.u-strasbg.fr/xmatch/api/v1/sync) of the CF4 positions against `vizier:VII/233/xsc`, 6" radius |
| `rc3_named.json` | VizieR VII/155 rows nearest each named galaxy (cone search, 2') |
| `wmap_ilc_9yr_v5.fits` | https://lambda.gsfc.nasa.gov/data/map/dr5/dfp/ilc/wmap_ilc_9yr_v5.fits |
| `cosmic-web-index.json` | written by `build-cosmic-web.mjs` (PGC -> row, group) for `build-local-galaxies.mjs` |

Evaluator code in `staging/cosmos/src/` (pure TypeScript, erasable syntax only, `.ts` imports):

| Module | Contents |
| --- | --- |
| `frames.ts` | ICRS, ecliptic J2000, galactic, supergalactic and app-world rotations; sky basis |
| `cosmology.ts` | flat Lambda-CDM (Planck 2018): comoving and luminosity distance, age, lookback time, a fast z <-> D_C table, distance moduli, heliocentric <-> CMB-frame redshift, CMB temperature seen by a moving observer |
| `cosmicWeb.ts` | decoder for `cosmic-web.bin.gz`, distance modes, world positions for a point cloud, group runs |
| `localGalaxies.ts` | types for both JSON files, loader, disc geometry (`discAxes`, `discPoint`) |
| `cmb.ts` | CMB texture u,v <-> (l, b) <-> ecliptic direction, code <-> microkelvin, a GLSL snippet |
| `gz.ts` | `fetchGzipped`: fetch + `DecompressionStream('gzip')`, skipped if the server already decoded |

Tests: `npx vitest run --root staging/cosmos` (49 tests, including end-to-end loads of the shipped files
over a local HTTP server that behaves like Vercel). They read the shipped files, so rebuild first if the
data change.

## Frames and units

- RA/Dec: ICRS (J2000), degrees. The 23 mas frame bias between J2000 and ICRS is ignored.
- Ecliptic: J2000 mean ecliptic and equinox, obliquity eps = 84381.448" (IAU 1976; the value JPL,
  astronomy-engine, `scripts/build-stars.mjs` and the other staging areas use). `v_ecl = R_x(+eps) v_icrs`.
- Galactic: IAU 1958 system realised in the ICRS (Hipparcos, ESA 1997, SP-1200 vol. 1, sect. 1.5.3):
  north galactic pole at (RA, Dec) = (192.85948, +27.12825), l of the north celestial pole = 122.93192.
  Same matrix as `staging/galaxy`. Agrees with astropy's frame to 0.02".
- Supergalactic: pole at (l, b) = (47.37, +6.32), SGL = 0 at (137.37, 0) (de Vaucouleurs et al. 1991;
  Lahav et al. 2000, MNRAS 312, 166).
- App world: `world = (x_ecl, z_ecl, -y_ecl)`.
- Positions are heliocentric. Lengths: kpc in `local-galaxies.json.gz`, Mpc in `named.json` and the cosmic
  web. Velocities km/s. Proper motions mas/yr with `pmra` = mu_alpha cos(dec).

Rotation matrices (`v_target = M v_source`, rows are the target axes written in source components):

```
ICRS_TO_ECL = [[ 1,                  0,                  0                 ],
               [ 0,                  0.9174820620691818, 0.3977771559319137],
               [ 0,                 -0.3977771559319137, 0.9174820620691818]]

ICRS_TO_GAL = [[-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
               [ 0.4941094278755837, -0.4448296299600112,  0.7469822444972189],
               [-0.8676661490190047, -0.1980763734312015,  0.4559837761750669]]

GAL_TO_ECL  = [[-0.0548755604162154,  0.4941094278755837, -0.8676661490190047],
               [-0.9938213790616487, -0.1109907334174410, -0.0003515899048316],
               [-0.0964766261278292,  0.8622858750901130,  0.4971471917159637]]
             (= ICRS_TO_ECL * transpose(ICRS_TO_GAL); ECL_TO_GAL is its transpose)

GAL_TO_WORLD = [[-0.0548755604162154,  0.4941094278755837, -0.8676661490190047],
                [-0.0964766261278292,  0.8622858750901130,  0.4971471917159637],
                [ 0.9938213790616487,  0.1109907334174410,  0.0003515899048316]]

GAL_TO_SGAL = [[-0.7357425748043749,  0.6772612964138942,  0                 ],
               [-0.0745537783652337, -0.0809914713069767,  0.9939225903997749],
               [ 0.6731453021092076,  0.7312711658169645,  0.1100812622247821]]
```

Checks in `frames.test.ts`: the galactic centre lands on (266.40499, -28.93617), the ecliptic pole on
(270, 90 - eps), and M87 on SGB = -2.35 (as Cosmicflows-4 lists it).

## Cosmology

Flat Lambda-CDM with the Planck 2018 TT,TE,EE+lowE+lensing+BAO parameters (Planck Collaboration 2020,
A&A 641, A6, table 2, last column): H0 = 67.66 km/s/Mpc, Omega_m = 0.3111, T_CMB = 2.7255 K (Fixsen 2009,
ApJ 707, 916), N_eff = 3.046. Radiation is photons plus two massless neutrino species (Omega_r =
7.893e-5); the 0.06 eV neutrino counts as matter, which is exact enough below z ~ 100. Omega_Lambda =
1 - Omega_m - Omega_r. Integrals are done in the scale factor with Gauss-Legendre quadrature. Against
astropy 8.0.1 `Planck18`: comoving distance within 0.003 % for z < 15, age today 13.7867 Gyr (astropy
13.7869, Planck 13.787 +/- 0.020), age at z = 14.44 is 283 Myr. If the app's cosmology module
(`staging/cosmology`) is used instead, it should reproduce the reference values in `cosmology.test.ts`.

CMB frame. The Sun moves at 369.82 +/- 0.11 km/s toward (l, b) = (264.021, 48.253) relative to the CMB
(Planck Collaboration 2020, A&A 641, A1; dipole 3362.08 +/- 0.99 uK). Heliocentric to CMB-frame redshift:
`1 + z_cmb = (1 + z_hel) * gamma * (1 + beta cos theta)`, theta the angle to the apex. The CMB seen by an
observer moving at velocity beta: `T = T0 / (gamma (1 - beta . n))`, with `n` the direction looked at, in
the observer's frame (`cmbTemperatureSeenK`; at beta = 0.99 the sky ahead is 38.5 K, behind 0.19 K).

## local-galaxies.json.gz

Source: the **Local Volume Database** (LVDB; Pace, A. B. 2025, "The Local Volume Database: a library of the
observed properties of nearby dwarf galaxies and star clusters", The Open Journal of Astrophysics 8, 142,
doi:10.33232/001c.144859, arXiv:2411.07424), release **v1.1.1** (12 August 2026), file `comb_all.ecsv`,
released under **CC0 1.0** (the repository's LICENSE, checked 25 September 2026; the build refuses to run if the
cached licence is not CC0). The LVDB compiles every value from the literature and cites it per value (author +
ADS bibcode), and those citations are carried into this file.

The first version of this file was built from the updated catalogue of McConnachie (2012) hosted by the CADC.
That page asks users to cite the paper but states no licence or redistribution terms, and none could be confirmed,
so the file was rebuilt from the LVDB. The LVDB is also more recent: it adds the dwarfs discovered since the
catalogue's last update and uses homogeneous RR Lyrae distances for the M31 system (Savino et al. 2022).

Selection: every row of the LVDB dwarf tables (`dwarf_mw`, `dwarf_m31`, `dwarf_local_field`,
`dwarf_local_field_distant`) within 3 Mpc of the Sun and marked `confirmed_real` (167 rows; unconfirmed candidates
are left out), plus M31 and M33, which the dwarf tables do not list: **169 galaxies**. 11 are not confirmed as
galaxies (they may be star clusters) and carry `ambiguous: true`.

JSON, gzipped (decode with `loadLocalGalaxies()`), top-level fields `format` (`"lightspeed-local-galaxies"`),
`version` (1), `generated`, `description`, `credit`, `licence`, `frames`, `units`, `references` (LVDB reference key
-> ADS bibcode, for every key used by the rows) and `galaxies`, sorted by distance (Draco II, 21.6 kpc, first;
NGC 1560, 2.99 Mpc, last). Per galaxy (fields omitted when unknown):

| Field | Meaning |
| --- | --- |
| `id`, `name`, `catalogueName`, `aliases` | `id` is `lg-<LVDB key>` except the four big ones (`andromeda`, `triangulum`, `lmc`, `smc`, matching `named.json`); `catalogueName` is `LVDB <key>` |
| `subgroup` | `MW` (LVDB host `mw`, `lmc` or `smc`), `M31` (host `m_031` or `m_033`), `LG` (inside the Local Group's zero-velocity surface, radius 0.96 Mpc about the barycentre at 0.55 of the way to M31, Karachentsev et al. 2009, the same rule as the cosmology policy), `nearby` (outside it). Counts: 65, 43, 12, 49 |
| `morphology`, `class` | The LVDB lists no morphological types, so the render class follows the neutral-gas content: HI mass of 10^6 M_sun or more -> `dwarf-irregular` (24), HI detected but less -> `transition` (10), no HI detected -> `dwarf-spheroidal` (116), not confirmed as a galaxy -> `unknown` (11); M32 is `compact-elliptical` and NGC 147, 185 and 205 `dwarf-elliptical` by name; the big four have their RC3 types. `morphology` states the basis ("gas-rich dwarf (HI 2.0e+8 Msun)") |
| `ambiguous` | true when the LVDB does not confirm the object as a galaxy (may be a star cluster) |
| `ra`, `dec`, `l`, `b` | LVDB centre (ICRS), deg |
| `distanceKpc`, `dmod`, `dmodErr`, `distanceRef` | heliocentric distance; `dmodErr` is [+, -] mag; `distanceRef` is the LVDB reference key of the distance (or the named entry's reference) |
| `positionEclKpc` | heliocentric ecliptic J2000 position, kpc |
| `vHelio`, `vHelioErr` | heliocentric systemic radial velocity, km/s |
| `vmag`, `absMagV`, `lumV` | V magnitude corrected for extinction (LVDB), M_V = V - dmod, L_V in L_sun with M_V,sun = 4.83 |
| `pa`, `ellipticity`, `rhArcmin`, `rhPc` | major-axis position angle (deg E of N), 1 - b/a, half-light (or Plummer) radius along the major axis |
| `muVHalf`, `sigmaStar`, `mHI`, `feh`, `fehType` | mean V surface brightness inside the half-light radius (mag/arcsec^2), line-of-sight velocity dispersion (km/s), HI mass (10^6 M_sun), [Fe/H] and whether it is spectroscopic or photometric |
| `pmra`, `pmdec`, `pmraErr`, `pmdecErr`, `pmRef`, `velocityHelioEclKmS` | systemic proper motion and the implied heliocentric 3D velocity (`v_r r + 4.74047 D (pmra e + pmdec n)`), ecliptic axes; it includes the reflex of the Sun's motion. 78 galaxies |
| `disc`, `size`, `cosmicWeb` | for the big four, as in `named.json` |
| `refs` | LVDB reference keys of every value in the row (texts via ADS: `references[key]` is the bibcode) |

The four big galaxies use the distances of their named entries: M31 761 +/- 11 kpc (Li et al. 2021), M33 840 kpc
(mu = 24.622 +/- 0.030, Breuval et al. 2023), LMC 49.59 kpc (Pietrzynski et al. 2019), SMC 62.44 kpc (Graczyk et
al. 2020). The Milky Way is not in this file (it comes from `staging/galaxy`).

**One distance scale around M31.** Savino et al. (2022, ApJ 938, 101, "The Hubble Space Telescope Survey of M31
Satellite Galaxies I") measured M31 and its satellites homogeneously with RR Lyrae stars and anchored their relative
geometry on their own M31 distance, mu = 24.45 +/- 0.06 (776.2 kpc). This file places M31 at the Cepheid distance of
Li et al. (2021, mu = 24.407 +/- 0.032, 761 kpc; the two agree within their errors), so the 33 satellites whose
LVDB distance is Savino et al.'s are scaled by 761/776.2 (-0.043 mag) and keep Savino et al.'s positions relative
to M31. M32 is then 6.4 kpc from M31 in 3D (3.4 kpc nearer to us), as in Savino et al.; mixing the two scales
unscaled would put it 11.7 kpc behind M31 (and the first version, which mixed McConnachie's scale with 761 kpc, put
it 44 kpc behind). M33 on the scaled RR Lyrae distance, 842 kpc, agrees with its Cepheid distance, 840 kpc.
Andromeda XXXVI has no distance of its own and sits at M31's, as in the LVDB. Satellites whose distances come from
other studies (TRGB and others) are left as published; each carries its own zero-point (typically 2-5%).

## named.json

Top level: `format` (`"lightspeed-named-extragalactic"`), `version`, `generated`, `frames`, `cosmology`
(the parameters above and the age), `cmbDipole`, `redshiftRecord` and `objects`. Each object:

| Field | Meaning |
| --- | --- |
| `id` | `andromeda`, `triangulum`, `lmc`, `smc`, `m81`, `m87`, `centaurus-a`, `sombrero`, `whirlpool`, `virgo-cluster`, `coma-cluster`, `bullet-cluster`, `gn-z11`, `jades-gs-z14-0`, `mom-z14` |
| `kind` | `galaxy`, `cluster`, `high-z-galaxy`; `recordHolder: true` on MoM-z14 |
| `ra`, `dec`, `positionRef` | SIMBAD position (via CDS Sesame) and the bibcode SIMBAD gives for it; MoM-z14 from its discovery paper |
| `galactic`, `ecliptic` | derived angles |
| `morphology` | `{type, class, ref}`; types from RC3 for the galaxies |
| `vHelio` or `zHelio` | measured heliocentric velocity or redshift with its source |
| `zCmb` | derived CMB-frame redshift (not for Local Group members, which do not take part in the Hubble flow) |
| `distance` | measured distance: `mpc`, errors, `dmod`, `method`, `ref` (and `note`) |
| `cosmology` | for z > 0.01: comoving, luminosity and angular-diameter distances (Mpc), lookback time and age at emission (Gyr), light-travel distance (Gly), from z_cmb |
| `positionEclMpc`, `positionBasis` | heliocentric ecliptic position: for Local Group members the measured distance as it is; beyond the Local Group the measured distance / (1 + z_cmb) when both exist, else the comoving distance from z_cmb. (The first version divided the LMC and SMC distances by 1 + z_helio, placing the LMC at 49.547 instead of 49.59 kpc.) |
| `disc` | see below |
| `size` | RC3: `d25Arcmin` (B = 25 mag/arcsec^2 isophotal diameter), `axisRatio`, `pa`, `bT`, `aG`; derived `r25Kpc` and `absMagB = B_T - A_g - dmod` |
| `cosmicWeb` | `index` of the galaxy in `cosmic-web.bin.gz`, its Cosmicflows-4 group (`groupPgc`), and for clusters `members: {first, count}`, a contiguous row range |

Values used (every one is in the file with its source):

| Object | Distance or redshift | Source |
| --- | --- | --- |
| Andromeda (M31) | 761 +/- 11 kpc | Li et al. 2021, ApJ 920, 84 (HST Cepheids) |
| Triangulum (M33) | mu = 24.622 +/- 0.030 (840 kpc) | Breuval et al. 2023, ApJ 951, 118 |
| LMC | 49.59 +/- 0.09 +/- 0.54 kpc | Pietrzynski et al. 2019, Nature 567, 200 |
| SMC | 62.44 +/- 0.47 +/- 0.81 kpc | Graczyk et al. 2020, ApJ 904, 13 |
| M81 | mu = 27.797 +/- 0.116 (3.63 Mpc) | Cosmicflows-4 group distance, Tully et al. 2023 |
| M87 | 16.8 +0.8/-0.7 Mpc; z = 0.004283 +/- 0.000017 (1284 km/s) | EHT Collaboration 2019, ApJL 875, L6; NED's preferred redshift, from Cappellari et al. 2011, MNRAS 413, 813 (ATLAS3D) |
| Centaurus A | mu = 27.804 +/- 0.038 (3.64 Mpc); z = 0.0018246 +/- 0.0000167 (547 km/s) | Cosmicflows-4, Tully et al. 2023; NED's preferred redshift (Baer-Way et al. 2024, ApJ 964, 172) |
| Sombrero (M104) | 9.55 +/- 0.13 +/- 0.31 Mpc | McQuinn et al. 2016, AJ 152, 144 (TRGB) |
| Whirlpool (M51) | 8.58 +/- 0.10 Mpc | McQuinn et al. 2016, ApJ 826, 21 (TRGB) |
| Virgo Cluster | 16.5 +/- 0.1 +/- 1.1 Mpc | Mei et al. 2007, ApJ 655, 144 (SBF) |
| Coma Cluster | 98.5 +/- 2.2 Mpc; z = 0.0234 | Scolnic et al. 2025, ApJL 979, L9 (SNe Ia); SIMBAD (Rines et al. 2016) |
| Bullet Cluster | z = 0.296 | Clowe et al. 2006, ApJ 648, L109 |
| GN-z11 | z = 10.603 | Bunker et al. 2023, A&A 677, A88 |
| JADES-GS-z14-0 | z = 14.1796 +/- 0.0007 | Carniani et al. 2025, A&A 696, A87 (ALMA [OIII]); discovery Carniani et al. 2024, Nature 633, 318 |
| MoM-z14 | z = 14.44 +/- 0.02 | Naidu et al. 2026, Open Journal of Astrophysics 9, doi:10.33232/001c.156033 |

Redshift record, checked on 25 September 2026 against the literature and news: MoM-z14 (z = 14.44,
JWST/NIRSpec, arXiv May 2025, published January 2026) is the most distant spectroscopically confirmed
galaxy, 283 Myr after the Big Bang in this cosmology. JADES-GS-z14-0 held the record from May 2024. No
later confirmation beyond z = 14.44 was found. Candidates at higher photometric redshift are not
confirmations.

Coma note for the Learn articles: the same supernova data calibrated to the Planck value H0 = 67.4 put
Coma at 111.8 +/- 1.8 Mpc instead of 98.5 (Scolnic et al. 2025): the Hubble tension on a single cluster.

### Disc orientation

For each disc galaxy the file gives the inclination i (0 = face-on), the position angle of the major axis
(`recedingPA` when the receding half is known, else `majorAxisPA`), `nearSidePA` when known, and
`rotationOnSky` when a source states it. From these, `axesEcl` holds unit vectors in the ecliptic frame:

- `major`: in the disc plane along the major axis (toward the receding end when known);
- `minor`: in the disc plane, perpendicular, projecting onto the sky toward PA + 90 deg;
- `normal`: the disc normal on the observer's side (`normal . lineOfSight = -cos i`);
- `spin`: the angular-momentum direction, or null if the sense of rotation is unknown.

Construction (ICRS; `n`, `e`, `r` = north, east, line of sight at the galaxy; `a` = the PA direction,
`b` = PA + 90 deg on the sky): `m = cos(i) b - s sin(i) r` with `s = +1` if the side at PA + 90 deg is
near, else -1; `normal = a x m`; `spin = -s normal` when the receding end and the near side are known,
`+normal` for counterclockwise and `-normal` for clockwise rotation on the sky (north up, east left).
A point of the disc at radius R and in-plane azimuth phi from the major axis is
`centre + R (cos(phi) major + sin(phi) minor)` (`discPoint`). Without a known near side the plane is
ambiguous (its mirror image in the sky plane fits the same ellipse); the side at PA + 90 deg is then
assumed near and `nearSideAssumed` is true. The app should draw these discs the same way from Earth
either way, but the tilt seen from elsewhere in 3D is a model choice for those galaxies.

| Galaxy | i, PA | Near side / rotation | Source |
| --- | --- | --- | --- |
| M31 | 77.7, receding 37.7 (NE) | west half near; spin (l, b) = (240.9, -30.2) | Corbelli et al. 2010, A&A 511, A89; agrees within 4 deg with Banik & Zhao 2017 (238.65, -26.89) |
| M33 | 52, receding 202 | not established (assumed) | Kam et al. 2017, AJ 154, 41 (optical i from Warner, Wright & Baldwin 1973) |
| LMC | 34.0, line of nodes 139.1 | NE near (PA 49.1), clockwise | van der Marel & Kallivayalil 2014, ApJ 781, 121 |
| SMC | 51, receding 66 (HI) | not established (assumed) | Di Teodoro et al. 2019, MNRAS 483, 392 |
| M81 | 59.0, receding 330.2 | not established (assumed) | de Blok et al. 2008, AJ 136, 2648 (THINGS) |
| M104 | ~84 (approximate), PA 90 | not established (assumed) | PA from RC3; "very close to 90 deg" per Jardel et al. 2011, ApJ 739, 21; 84 deg is a modelling choice |
| M51 | 22, PA 173 | not established (assumed) | Colombo et al. 2014, ApJ 784, 4 (PAWS) |

M87 and Centaurus A are given as ellipticals (RC3 axis ratio and size); Centaurus A's warped dust disc
is not modelled here.

## cosmic-web.bin.gz

Gzipped little-endian binary, structure of arrays (decode with `loadCosmicWeb()` / `decodeCosmicWeb()`).

Header, 64 bytes:

| Offset | Type | Value |
| --- | --- | --- |
| 0 | char[4] | `LSCW` |
| 4 | uint16 | format version, 1 |
| 6 | uint16 | header size, 64 |
| 8 | uint32 | N = 55,877 |
| 12 | uint32 | number of columns, 12 |
| 16 | uint32[12] | byte offset of each column from the start of the (decompressed) file |

Columns, each N long, in this order:

| Column | Type | Unit / scale | Missing |
| --- | --- | --- | --- |
| `ra` | float32 | deg, ICRS | |
| `dec` | float32 | deg, ICRS | |
| `vcmb` | int16 | km/s: cz of the galaxy in the CMB frame (CF4 `Vcmb`) | -32768 (46 dwarfs without a velocity) |
| `vgroup` | int16 | km/s: CMB-frame velocity of its group (CF4 table 4 `V3k`) | -32768 |
| `dm` | uint16 | distance modulus x 1000, all methods (CF4 `DM`) | 0 |
| `dmgroup` | uint16 | group distance modulus x 1000 on the calibrated scale (CF4 `DMzp`) | 0 |
| `ks` | uint16 | 2MASS Ks total magnitude x 1000 (`k_m_ext`), no extinction correction | 0 (5,316 galaxies) |
| `edm` | uint8 | uncertainty of `dm` x 100 (mag) | 0 |
| `edmgroup` | uint8 | uncertainty of `dmgroup` x 100 (mag) | 0 |
| `methods` | uint8 | bits: 1 SN Ia, 2 Tully-Fisher, 4 Fundamental Plane, 8 SBF, 16 SN II, 32 TRGB, 64 Cepheids, 128 maser | |
| `axisratio` | uint8 | 2MASS b/a x 100 (`sup_ba`) | 255 |
| `pa` | uint8 | 2MASS major-axis PA, deg E of N, [0, 180) (`sup_phi`) | 255 |

Rows are sorted by group distance (then group, then own distance), so the nearest galaxies come first
(row 0 is the LMC) and each group is a contiguous run (`groupRuns()`; Virgo and Coma ranges are in
`named.json`). Content: 438 galaxies within 10 Mpc, 2,219 within 30, 12,459 within 100, 55,373 within
500 (by group distance). The largest CMB-frame redshift is z = 0.109 (32,575 km/s); the farthest
measured group distance is ~700 Mpc comoving. Distances come from eight methods:
Fundamental Plane 42,223 galaxies, Tully-Fisher 12,222, SN Ia 1,004, SBF 469, TRGB 446, SN II 94,
Cepheids 69, masers 6.

Which distance to plot (`makeDistanceFn`, `worldPositions`):

| Mode | Distance | Use |
| --- | --- | --- |
| `measured` | `dmToMpc(dm) / (1 + z_cmb)` | true positions, but 15-25 % scatter per galaxy for TF and FP |
| `group` | same with `dmgroup` | errors averaged within groups; members share one distance |
| `redshift` | comoving D_C(z_cmb), Planck 2018 | the classic redshift-survey view, with fingers of God |
| `group-redshift` | D_C(z of the group) | fingers of God collapsed |
| `recommended` | `group` inside 30 Mpc, `group-redshift` beyond | default for the fly-through |

"Distance estimate" stored per galaxy: the measured distance moduli (`dm`, `dmgroup`); the redshift
distance is computed from `vcmb` with the cosmology above (not stored, to keep the file under 1 MB). The
luminosity distance from a distance modulus is `10^((dm - 25)/5)` Mpc and the comoving distance
`D_L / (1 + z)`; using the observed z_cmb instead of the cosmological redshift errs by ~v_pec/c (~0.1 %).

## CMB textures

Source: WMAP nine-year Internal Linear Combination map (`wmap_ilc_9yr_v5.fits`, LAMBDA; Bennett et al.
2013, ApJS 208, 20). HEALPix NESTED, Nside = 512, galactic, 1 degree resolution, thermodynamic mK,
monopole and dipole removed. Resampled with 4 x 4 samples per output pixel using a HEALPix `ang2pix`
(checked against astropy-healpix on 20,000 random directions).

Layout of both images: equirectangular in galactic coordinates, as CMB maps are published (seen from
inside the sky): Galactic centre in the middle, l increasing to the left. For texture coordinates u (0 =
left edge) and v (0 = top row): `l = (180 - 360 u) mod 360`, `b = 90 - 180 v`. For a three.js texture
loaded with the default `flipY = true`, sample at `(u, 1 - v)`; `CMB_UV_GLSL` and
`worldToGalacticColumnMajor()` in `cmb.ts` do this from a world-space view direction.

Temperature -> pixel: `k = clamp(round(127.5 + dT / 1.9608 uK), 0, 255)`; decode `dT = (k - 127.5) x
500/255 uK` (`cmbCodeToMicroK`), so 0 = -250 uK and 255 = +250 uK. The quantisation step is 1.96 uK
(error <= 0.98 uK); 0.06 % of the sky lies beyond +/-250 uK and is clipped. The map rms is 71 uK.

- `cmb.png`: 8-bit palette PNG, 2048 x 1024; palette entry k is Moreland's cool-warm diverging colour
  map at k/255 (Moreland 2009, "Diverging Color Maps for Scientific Visualization", ISVC 2009, LNCS 5876),
  blue (59, 76, 192) through light grey to red (180, 4, 38), interpolated in Msh space. Load as sRGB.
- `cmb-data.png`: 8-bit greyscale, 1024 x 512, the code k itself, for shaders that apply their own colour
  map or contrast. Load as linear data (`NoColorSpace`), not sRGB. 1024 columns still give ~3 pixels per
  1-degree beam.

Both PNGs carry `tEXt` chunks with the title, credit and decoding rule.

The app must label the map "contrast enhanced": the colours span +/-250 uK around a mean of 2.7255 K, so
the real sky varies by about 1 part in 10^4 to 10^5. Seen without enhancement the CMB is uniform to the
eye. The kinematic dipole (+/-3.36 mK, the Sun's motion) was removed by WMAP; `cmbTemperatureSeenK` can
put it back, or add the much larger effect of the ship's own velocity.

## Sources, licences and credits

| Data | Source | Licence / terms | How used |
| --- | --- | --- | --- |
| Local Group and Local Volume dwarfs | Local Volume Database v1.1.1 (Pace 2025, The Open Journal of Astrophysics 8, 142, doi:10.33232/001c.144859; https://github.com/apace7/local_volume_database) | **CC0 1.0** (repository LICENSE, checked 25 September 2026). The author asks users to cite the overview paper, link the repository, and cite the input references, which the file does per value | 167 rows (positions, distances, velocities, proper motions, structure, luminosities, HI masses, metallicities) with their references |
| Cosmicflows-4 | Tully, R. B. et al. 2023, ApJ 944, 94, via CDS/VizieR J/ApJ/944/94 | CC BY 4.0 (article licence, confirmed on the IOP page) | all 55,877 galaxies of table 2 and group values of table 4; distances of M81 and Centaurus A |
| 2MASS Extended Source Catalog | Skrutskie et al. 2006, AJ 131, 1163; Jarrett et al. 2000; VizieR VII/233, matched with CDS XMatch | NASA/IPAC data, public with the required 2MASS acknowledgement | Ks, b/a, PA per cosmic-web galaxy (nearest XSC source within 6", 50,568 matches, 50,561 with a Ks magnitude; median offset 0.4") |
| WMAP 9-year ILC map | Bennett et al. 2013, ApJS 208, 20; NASA LAMBDA | NASA data, not subject to US copyright; credit "NASA / WMAP Science Team" | the CMB textures |
| RC3 | de Vaucouleurs et al. 1991, Third Reference Catalogue of Bright Galaxies, via VizieR VII/155 | individual catalogue values quoted with citation | D25, R25, PA, B_T, A_g and types of the 9 named galaxies |
| SIMBAD positions | Wenger et al. 2000, A&AS 143, 9, via CDS Sesame | free use with acknowledgement | positions of the named objects |
| Literature values | the papers listed in the tables above | facts quoted with citation | distances, redshifts, disc angles |
| NED | NASA/IPAC Extragalactic Database, preferred redshifts of M87 and Centaurus A | NASA/IPAC data, free with the NED acknowledgement | two redshifts |
| Colour map | Moreland 2009 | algorithm from the paper, implemented here | CMB palette |

Required acknowledgements (for the About page or the credits screen):

- "This research has made use of the SIMBAD database and the VizieR catalogue access tool, CDS,
  Strasbourg, France (DOI 10.26093/cds/vizier)."
- "This publication makes use of data products from the Two Micron All Sky Survey, which is a joint
  project of the University of Massachusetts and the Infrared Processing and Analysis Center/California
  Institute of Technology, funded by the National Aeronautics and Space Administration and the National
  Science Foundation."
- "CMB map: NASA / WMAP Science Team."
- "This work has made use of the Local Volume Database (https://github.com/apace7/local_volume_database;
  Pace 2025, The Open Journal of Astrophysics 8, 142)."
- "This research has made use of the NASA/IPAC Extragalactic Database (NED), which is funded by the National
  Aeronautics and Space Administration and operated by the California Institute of Technology."
- "Galaxy distances: Cosmicflows-4, Tully, R. B. et al. 2023, ApJ, 944, 94 (CC BY 4.0)."

Rows to add to `CREDITS.md`:

```
| `public/data/cosmic-web.bin.gz` | Derived from [Cosmicflows-4](https://doi.org/10.3847/1538-4357/ac94d8) (Tully et al. 2023, ApJ 944, 94) via CDS/VizieR, with Ks magnitudes, axis ratios and position angles from the [2MASS Extended Source Catalog](https://irsa.ipac.caltech.edu/Missions/2mass.html) (UMass/IPAC-Caltech, NASA, NSF) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (Cosmicflows-4); 2MASS data products with the 2MASS acknowledgement. This derived file is released under CC BY 4.0. |
| `public/data/local-galaxies.json.gz` | Derived from the [Local Volume Database](https://github.com/apace7/local_volume_database) v1.1.1 ([Pace 2025, The Open Journal of Astrophysics 8, 142](https://doi.org/10.33232/001c.144859)), every value with its original reference, plus published distances and disc angles of M31, M33 and the Magellanic Clouds cited in each row and RC3 sizes | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (Local Volume Database); the added values are facts quoted with citation |
| `public/textures/cmb.png`, `public/textures/cmb-data.png` | [WMAP 9-year ILC map](https://lambda.gsfc.nasa.gov/product/wmap/dr5/ilc_map_get.html), NASA / WMAP Science Team, colour map after Moreland (2009) | NASA data, public domain |
```

And under "Other sources used by the code":

```
- Named galaxies and clusters (staging/cosmos/named.json): positions from SIMBAD (CDS); distances, redshifts
  and disc angles from the papers cited in the file; cosmology Planck 2018 (A&A 641, A6); CMB dipole
  Planck 2018 (A&A 641, A1).
```

### Not shipped, and why

- The updated nearby-galaxy catalogue of McConnachie (2012, AJ 144, 4), hosted by the CADC: the first version of
  `local-galaxies.json.gz` was derived from it, but its page only asks for the paper to be cited and states no
  licence or redistribution terms, and none could be confirmed. That file was removed and rebuilt from the Local
  Volume Database (CC0). The paper's tables on VizieR (J/AJ/144/4) are an AAS article from 2012 and have the same
  problem.
- 2MASS Redshift Survey (Huchra et al. 2012, ApJS 199, 26). Its README says "Please do not redistribute any
  of these files", and the ApJS article (2012) is AAS copyright, so reproducing its table needs permission.
  A point file derived from it would redistribute the survey. Cosmicflows-4 is used instead.
- Updated Nearby Galaxy Catalog (Karachentsev et al. 2013, AJ 145, 101): published before October 2021, so
  the AAS holds the copyright and table reproduction requires permission; no separate licence for the
  data could be confirmed. Cosmicflows-4 already covers the Local Volume with TRGB distances (446 galaxies).
- Planck SMICA map: the Planck Legacy Archive states no licence for the data products that could be
  confirmed. (A Zenodo record of the SMICA map labelled CC BY 4.0 appears to be a third-party upload,
  and an uploader cannot relicense ESA data.) WMAP's public-domain ILC map is used.
- No Gaia tables are used.

## Caveats (for the app's labels and the Learn articles)

- Redshift-space distortions. In `redshift` mode, galaxies in a cluster spread along the line of sight by
  their orbital speeds (~1000 km/s in Coma, 15 Mpc of false depth for a cluster ~3 Mpc across): the
  "fingers of God", all pointing at the observer. On large scales infall squashes structures along the line
  of sight (Kaiser 1987). The `group-redshift` mode removes the fingers; the test suite checks it on Coma.
- Local peculiar velocities. Within ~30 Mpc peculiar velocities (several hundred km/s) are comparable to
  the Hubble flow, and CMB-frame velocities include the Local Group's own ~630 km/s motion; redshift
  distances there are wrong. The `recommended` mode uses measured group distances inside 30 Mpc.
- Two distance scales. Measured distances (Cosmicflows-4, zero point set by Cepheids, TRGB and the NGC
  4258 maser) imply H0 = 74.6 +/- 0.8 (stat) +/- ~3 (sys) km/s/Mpc; redshift distances here use Planck's
  67.66. At large distance the two placements differ by ~10 %. This is the Hubble tension, not a bug.
- Measured-distance errors. Single Tully-Fisher or Fundamental Plane distances have 15-25 % errors; at
  200 Mpc that is 30-50 Mpc along the line of sight. Group averages are better.
- Selection. Cosmicflows-4 is a distance catalogue, not a complete census. 80 % of its galaxies are in the
  northern galactic hemisphere because the SDSS Fundamental Plane sample (34,000 galaxies to 30,000 km/s)
  covers the quadrant that is celestial north and galactic north; the south relies on 6dFGS to
  ~16,000 km/s. The density of points reflects surveys as well as structure.
- Zone of Avoidance. Dust and stars of the Milky Way hide galaxies within ~10 deg of the Galactic plane:
  only 312 of the 55,877 galaxies (0.6 %) are at |b| < 10 deg. Structures behind the plane (for example
  the Great Attractor region around the Norma cluster, l ~ 325, b ~ -7) are under-represented.
- 2MASS Ks magnitudes are not corrected for Galactic extinction (A_Ks ~ 0.3 E(B-V), below 0.05 mag for
  most of the sky) or K-corrected (< 0.1 mag at z < 0.1). 5,316 galaxies have no 2MASS Ks (faint or
  low surface brightness).
- The Cosmicflows-4 tables 3 and 4 list the Virgo group (1PGC 41220) at RA 220.8, Dec -23.9, which is not
  where Virgo is (its galaxies are at RA ~187, Dec ~12). Group positions are therefore not used; each
  galaxy keeps its own position.
- CMB. The ILC map is reliable on scales above ~10 deg; on smaller scales the bias correction is
  uncertain (LAMBDA), and residual foregrounds remain along the Galactic plane (visible as small spots at
  b ~ 0). The colours are contrast enhanced and 8-bit quantised (1.96 uK steps).
- Local Group. E(B-V) toward the LMC, SMC and M31 comes from far-infrared maps that include those
  galaxies' own dust. Many faint Milky Way satellites are flagged `ambiguous` (possibly star clusters).
  `velocityHelioEclKmS` is heliocentric: subtract the Sun's motion for Galactocentric speeds (the LMC is
  at ~520 km/s heliocentric, ~320 km/s Galactocentric).
- Discs are thin-disc models with one inclination; real discs warp (M31, M33) and the SMC is not a disc.
  M104's inclination is approximate. Where the near side is unknown the 3D tilt is one of two mirror
  solutions.
- The high-redshift galaxies are placed at their comoving distance "now". The light we see left them when
  they were 0.28-0.43 Gyr old and 11.6-15.5 times closer in proper distance (1 + z) (`angularDiameterDistanceMpc` is
  the proper distance at emission).

## Changes after the independent verification (25 September 2026)

The cosmic-web file, CMB maps, positions of the named objects, high-redshift distances and Cosmicflows-4 values were
confirmed against NED, VizieR and the papers. Fixed here:

- **Local Group catalogue licence.** `local-galaxies.json.gz` was derived from McConnachie's updated catalogue, whose
  licence could not be confirmed. It was removed and rebuilt from the Local Volume Database v1.1.1 (CC0 1.0): 169
  galaxies instead of 145, every value cited.
- **Mixed distance scales around M31.** The M31 satellites are now on one scale with M31 (M32 6.4 kpc from M31, not
  44 kpc behind it).
- **LMC and SMC positions** are no longer divided by 1 + z (Local Group members do not expand with the universe).
- **Redshifts of M87 and Centaurus A** are NED's preferred values (0.004283 and 0.0018246) instead of coarser ones.
- **Count.** 5,316 cosmic-web galaxies have no 2MASS Ks (the text said 5,309).
