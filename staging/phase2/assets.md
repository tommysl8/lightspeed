# Physical data, rotation, facts, surface maps, shapes and rings (task D3)

Everything the app needs to draw and describe the 47 phase-2 bodies other than their positions: sizes, masses,
albedos, IAU rotation models, colours, discovery notes and sourced facts; surface maps for 22 bodies; triangle
meshes for 11 irregular bodies; ring systems for Jupiter, Uranus, Neptune, Haumea, Quaoar (and Chariklo).

| Item | Path |
| --- | --- |
| Body data | `staging/phase2/bodies.json` (47 bodies, ≈ 170 KB; move to `public/data/` or import at build time) |
| Rings | `staging/phase2/rings.json` |
| Surface maps | `public/textures/<id>.jpg` (22 files, 4.51 MB in total) |
| Shape meshes | `public/models/<id>.bin` (11 files, 47–48 KB each, 515 KB in total) |
| Rotation evaluator | `staging/phase2/src/physical/rotation.ts` (pure functions, no dependencies) |
| Mesh reader | `staging/phase2/src/physical/mesh.ts` |
| Tests | `staging/phase2/src/physical/rotation.test.ts`, `assets.test.ts`; SPICE fixture in `src/physical/__fixtures__/` |
| Build | `scripts/build-textures.mjs`, `scripts/build-shapes.mjs`, `scripts/build-bodies.mjs` (run in that order) |

Run the tests with `npx vitest run --root staging/phase2 src/physical` (115 tests).

Rebuild: `node scripts/build-shapes.mjs`, `LIGHTSPEED_TOOLS=<folder with node_modules/sharp> node scripts/build-textures.mjs`,
then `node scripts/build-bodies.mjs`. Raw downloads are cached in `data-raw/d3/` (gitignored); a second run downloads
nothing. `sharp` is only needed for the textures and is not a project dependency (`npm install --prefix <folder> sharp`).

---

## 1. bodies.json

```jsonc
{
  "format": "lightspeed-bodies", "version": 1, "generated": "2026-09-25",
  "conventions": { … },               // units, time argument, rotation formula, colour rule
  "phaseAngles": { "4": {…}, "5": {…}, "6": {…}, "7": {…}, "8": {…} },   // IAU nutation/precession angles per planet system
  "bodies": [ { … }, … ]
}
```

Per body (fields absent when unknown; every number has a `…Source` string beside it):

| Field | Meaning |
| --- | --- |
| `id`, `name`, `kind` | `kind` ∈ `moon`, `dwarf-planet`, `comet`, `interstellar`, `spacecraft`. `kindNote` explains edge cases (Vesta is an asteroid; Arrokoth is a small KBO; Gonggong, Quaoar, Sedna, Orcus are not IAU-recognised dwarf planets). |
| `parent` | For moons: `mars`, `jupiter`, `saturn`, `uranus`, `neptune`, `pluto`. (Pluto's moons are positioned about the Pluto system barycentre by the D1 models.) |
| `naifId` | NAIF integer ID where one exists. |
| `radiusKm` (+`radiusSigmaKm`) | Mean radius: the sphere of equal volume. For interstellar objects it is an order-of-magnitude placeholder, and the source says so. |
| `triaxialRadiiKm` | [a, b, c] along body-fixed x, y, z (IAU 2015 or the cited paper). `dimensionsKm` = full extents where only those are published. |
| `gmKm3S2`, `massKg`, `densityGCm3` | GM from JPL satellite ephemerides (moons) or papers; mass = GM/G (CODATA 2018); density from mass and `radiusKm`. Orcus's GM is the Orcus–Vanth system. |
| `geometricAlbedo` | V-band geometric albedo, with its original paper named in `albedoSource`. |
| `orbit` | Moons only: JPL SSD mean elements (a, e, i, P), for context. Positions come from the D1 models. |
| `rotation` | See below. |
| `colour`, `colourHue`, `colourSource` | Display tint and full-brightness hue (below). |
| `discovery` | `{ by, date (ISO), place, note?, source }`. |
| `facts`, `factSources` | Three facts in the app's voice; `factSources[i]` is the URL supporting `facts[i]`. |
| `spacecraft` | Launch time (UTC), vehicle, site, mission summary, `status`, `statusAsOf`, `statusSource`, `statusCaveat`. |
| `interstellar` | Eccentricity, perihelion, v∞ (from SBDB elements), and what is `known` / `unknown`. |
| `assets` | `texture` (path under `public/`) + `textureInfo`; `model` + `modelInfo`; `rings` (`rings.json#<parent>`). `textureNote` when there is no map. |

### Rotation

`rotation.model` is one of:

| model | Bodies | What to do |
| --- | --- | --- |
| `iau-2015` | Phobos, Deimos, the Galileans, Mimas–Titan, Iapetus, the five Uranian moons, Triton, Proteus, Charon, Ceres, Vesta, 67P | Evaluate with `orientationAt` / `bodyToEclipticAt`. |
| `fitted` | Haumea (Ortiz et al. 2017 pole + phase from the 2017 occultation), Arrokoth (Porter et al. 2024) | Same functions; `validity` says where the phase is good. |
| `snapshot` | Nix, Hydra | Pole valid only near July 2015; they tumble chaotically. Regime `pole-only`: spin about the pole at `periodH` with arbitrary phase and say so. |
| `period-only` | Nereid, Eris (locked to Dysnomia), Makemake, Gonggong, Quaoar, Sedna, Orcus, Encke, Hale–Bopp | Pole unknown: spin about an arbitrary axis at `periodH`, labelled as illustrative. |
| `chaotic`, `complex` | Hyperion; Halley, ʻOumuamua | No predictive model: slow arbitrary tumble, labelled. |
| `unknown` | 2I/Borisov, 3I/ATLAS | No rotation. |
| `attitude-controlled` | Spacecraft | Point the antenna (Webb's sunshield, Parker's heat shield) sensibly. |

IAU formula (degrees; d = TDB days since J2000.0, T = d/36525; θᵢ from `phaseAngles[phaseSystem]`):

```
α₀ = a₀ + a₁T + a₂T² + Σ raTermsᵢ · sin θᵢ        body-fixed → ICRF = Rz(α₀ + 90°) · Rx(90° − δ₀) · Rz(W)
δ₀ = d₀ + d₁T + d₂T² + Σ decTermsᵢ · cos θᵢ       ICRF → ecliptic J2000 = Rx(−84381.448″)
W  = w₀ + w₁d + w₂d² + Σ pmTermsᵢ · sin θᵢ
```

`orientationAt` returns `{ raDeg, decDeg, wDeg, regime }` with `regime` ∈ `model` (inside `validity`),
`extrapolated` (IAU models outside 1981-01-01…2199-12-31 TDB: still finite and smooth), `pole-only`, `none`.
`bodyToEclipticAt` returns the 3×3 matrix whose columns are the body's x, y, z axes in ecliptic-J2000
coordinates (the app then applies its world mapping `(x, z, −y)`). Mars-system angles carry a T² term; the
evaluator handles it, as SPICE N0067 does.

**Measured accuracy of the implementation.** Compared with the SPICE Toolkit (CSPICE N0067 via spiceypy,
`tipbod` + `pxform('J2000', 'ECLIPJ2000')`) using the same `pck00011.tpc`, for all 24 IAU-modelled bodies at 8
epochs from 1900 to 2300: worst difference **3.4 × 10⁻¹⁰ rad** (Phobos, 2300). The fixture generator is
`src/physical/__fixtures__/make-rotation-spice.py`. The IAU models themselves are claimed good to about 0.1°
near the present (Archinal et al. 2018); IAU prime meridians of synchronous moons carry libration errors of that
order.

Haumea: pole = ring pole solution 1 (RA 285.1° ± 0.5°, Dec −10.6° ± 1.2°), period 3.915341 ± 0.000005 h. At the
occultation of 2017-01-21 03:09:20 UTC Haumea was at minimum brightness, so its long axis lay in the plane of the
pole and the line of sight; W₀ = 163.2293° puts +x (the long axis) on that line (JPL Horizons geocentric vector,
cached). The period uncertainty gives about ±5° of phase in 2026; the sign of +x is arbitrary (the ellipsoid is
symmetric). Arrokoth: pole RA 317.4880752°, Dec −24.8876496°, W₀ = 184.4589465° at J2000, period 0.6632553 d
(Porter et al. 2024 product label); good near 1 January 2019, drifting by tens of degrees per decade away from it.

### Colours

`colour` is a display tint; `colourHue` is the same hue at full brightness, for multiplying greyscale maps.
Hue comes, in order of preference, from: the colour surface map's area-weighted linear mean (Io, Ganymede; Triton's
map is enhanced orange–violet–UV and is not used); measured colour indices (PDS SBN colour compilations, or the
paper cited), converted to reflectance at B (440 nm), V (550 nm), R (640 nm) against the solar colours of Holmberg
et al. (2006) and used as linear R, G, B; otherwise neutral grey, flagged as a placeholder in `colourSource`
(Phobos, Deimos, Mimas, Iapetus, Miranda, Ariel, Umbriel, Proteus, Nix, Hydra, Gonggong, Orcus, Arrokoth, comets,
interstellar objects). Lightness: linear luminance 0.1 + 0.6 × albedo, capped at 0.7. Spacecraft tints are chosen
to match NASA photographs.

### Facts

141 facts, three per body. Every fact has a URL; every distinct URL in `bodies.json`, `rings.json` and this file
was fetched on 2026-09-25 (DOIs through the doi.org handle API) and resolves, except the USGS Astrogeology home
page, which refuses scripted requests but works in a browser. (USGS Astropedia product pages are a
JavaScript application that answers 200 even for missing pages, so only product pages confirmed by a search engine
are cited; otherwise the S3 download URL is given.) Numbers in the facts were checked against
the cached text of the cited NASA pages (`data-raw/d3/pages/`) or the cited paper. Spacecraft status is as of the
cited page: Voyager 2 (NASA status table updated 2026-08-20: cosmic ray subsystem, magnetometer and plasma wave
subsystem on; plasma science off since 2024-09-26, LECP off since 2025-03-24), Pioneer 10 (silent since
2003-01-23), Webb (operating). New Horizons and Parker: NASA's pages say "operating" but carry no dated 2026
statement; see `statusCaveat`.

---

## 2. Surface maps

**Convention (every map).** Equirectangular. Row 0 is +90° latitude, the last row −90° (planetocentric). Column
`i` covers **east** longitude [−180° + 360°·i/W, −180° + 360°·(i+1)/W): the **prime meridian is at the image
centre** and east increases to the right. In the IAU body-fixed frame a texel at (lat, lon) is at
(cos lat cos lon, cos lat sin lon, sin lat); `textureUvToLatLon(u, v)` in `rotation.ts` does the mapping. With three.js `SphereGeometry` at its defaults, u = 0.5 falls on local +x, u = 0.75 on local −z and
v = 0 on local +y. So the maps line up with no extra rotation when the sphere's local axes are the body frame mapped
the same way the app maps the ecliptic: three.js (x, y, z) = body (x, z, −y).

Greyscale maps are single-channel JPEGs (smaller); multiply by `colourHue` if a tint is wanted. Unimaged areas
(value 0 in the USGS sources, ≤ 15 in the Uranian sources to remove terminator speckle) are blended towards a flat
fill equal to the area-weighted mean of the imaged surface: an albedo-matched neutral tone. `textureInfo.imagedFraction`
gives the imaged share of the sphere and `fillSrgb` the fill value.

**Registration was checked**: every map was overlaid with the IAU nomenclature centre points from the USGS
Gazetteer (KMZ files cached in `data-raw/d3/nomenclature/`; script
`src/physical/__fixtures__/check-texture-registration.py`, output in `data-raw/d3/check/`). Named features land on their features in every
map, e.g. Pele (Io), Valhalla and Asgard (Callisto), Galileo Regio (Ganymede), Menrva (Titan), Herschel (Mimas),
Odysseus (Tethys), Powehiwehi and Galunlati Chasmata (Rhea), Occator (Ceres), Rheasilvia (Vesta), Stickney and Hall
(Phobos), Arden and Elsinore Coronae (Miranda), Wunda (Umbriel), Hamlet and Othello (Oberon). Resampling:
full-resolution box averaging along rows and 3 source rows per output row (all rows for the small sources); the
longitude origin is taken from each PDS3 label and is exact to within one source pixel (≤ 0.03° for the USGS
mosaics, ≤ 0.25° for the 1440-pixel Uranian maps).

| id | size | kind | imaged | KB | product (source page) | credit | licence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| io | 2048×1024 | RGB | 100% | 223 | [Io Galileo SSI / Voyager Color Merged Global Mosaic 1 km](https://astrogeology.usgs.gov/search/map/io_voyager_galileo_ssi_global_mosaic_1km) | NASA/JPL-Caltech/USGS | public domain |
| europa | 2048×1024 | grey | 99.5% | 336 | [Europa Voyager–Galileo SSI Global Mosaic 500 m](https://astrogeology.usgs.gov/search/map/Europa/Voyager-Galileo/Europa_Voyager_GalileoSSI_global_mosaic_500m) | NASA/JPL-Caltech/USGS | public domain |
| ganymede | 2048×1024 | RGB | 99.6% | 278 | Ganymede Voyager–Galileo SSI Global Color Mosaic 1.4 km ([tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif)) | NASA/JPL-Caltech/USGS | public domain |
| callisto | 2048×1024 | grey | 99.1% | 261 | [Callisto Voyager–Galileo SSI Global Mosaic 1 km](https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km) | NASA/JPL-Caltech/USGS | public domain |
| mimas | 1024×512 | grey | 100% | 123 | Mimas Cassini ISS global mosaic, DLR, 2017-06-30 (`Mimas/Cassini_DLR_Mimas.zip`, entry `MI_170630_DLR_basemap.tif`) | NASA/JPL-Caltech/SSI/DLR (T. Roatsch) | NASA/USGS, no use constraints |
| enceladus | 1024×512 | grey | 100% | 134 | Enceladus Cassini Global Mosaic 110 m ([tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Enceladus_Cassini_mosaic_global_110m.tif)) | NASA/JPL-Caltech/SSI/DLR | NASA/USGS, no use constraints |
| tethys | 2048×1024 | grey | 100% | 499 | Tethys Cassini Global Mosaic 293 m ([tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Tethys_Cassini_mosaic_global_293m.tif)) | NASA/JPL-Caltech/SSI/DLR | NASA/USGS, no use constraints |
| dione | 2048×1024 | grey | 99.8% | 566 | Dione Cassini–Voyager Global Mosaic 154 m ([tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Dione_Cassini_Voyager_mosaic_global_154m.tif)) | NASA/JPL-Caltech/SSI/DLR | NASA/USGS, no use constraints |
| rhea | 2048×1024 | grey | 100% | 361 | Rhea Cassini–Voyager Global Mosaic 417 m ([tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Rhea_Cassini_Voyager_mosaic_global_417m.tif)) | NASA/JPL-Caltech/SSI/DLR | NASA/USGS, no use constraints |
| titan | 2048×1024 | grey | 100% | 215 | Titan Cassini ISS Global Mosaic 4 km ([tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Titan_ISS_P19658_Mosaic_Global_4km.tif)) | NASA/JPL-Caltech/SSI | NASA/USGS, no use constraints |
| iapetus | 2048×1024 | grey | 100% | 424 | [Iapetus Cassini–Voyager Global Mosaic 783 m](https://astrogeology.usgs.gov/search/map/iapetus_cassini_voyager_global_mosaic_803m) | NASA/JPL-Caltech/SSI/DLR | NASA/USGS, no use constraints |
| miranda | 1024×512 | grey | 39% | 39 | [NASA 3D Resources, "Uranus – Miranda"](https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures/Uranus%20-%20Miranda) | NASA/JPL (Voyager 2) | NASA, "free and without copyright" |
| ariel | 1024×512 | grey | 34% | 26 | NASA 3D Resources, "Uranus – Ariel" | NASA/JPL (Voyager 2) | as above |
| umbriel | 1024×512 | grey | 37% | 19 | NASA 3D Resources, "Uranus – Umbriel" | NASA/JPL (Voyager 2) | as above |
| titania | 1024×512 | grey | 32% | 32 | NASA 3D Resources, "Uranus – Titania" | NASA/JPL (Voyager 2) | as above |
| oberon | 1024×512 | grey | 34% | 29 | NASA 3D Resources, "Uranus – Oberon" | NASA/JPL (Voyager 2) | as above |
| triton | 2048×1024 | RGB | 67% | 157 | [Triton Voyager 2 Global Color Mosaic 600 m](https://astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m) (PIA18668) | NASA/JPL-Caltech/LPI (P. Schenk)/USGS | public domain ("please cite authors") |
| charon | 2048×1024 | grey | 74% | 192 | Charon New Horizons Global Mosaic 300 m, July 2017 ([tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif)) | NASA/JHUAPL/SwRI/LPI | NASA/USGS, no use constraints |
| ceres | 2048×1024 | grey | 99.6% | 486 | Ceres Dawn FC Global Mosaic 400 m, DLR, October 2015 ([tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif)) | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA | NASA/USGS, no use constraints |
| vesta | 1024×512 | grey | 100% | 82 | [Vesta Dawn FC HAMO Global Mosaic 60 m](https://astrogeology.usgs.gov/search/map/vesta_dawn_fc_hamo_global_mosaic_60m), DLR, 2013 ([tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif)) | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA | NASA/USGS, no use constraints |
| phobos | 1024×512 | grey | 100% | 94 | Phobos Viking Mosaic 40 ppd, DLR controlled ([tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif)) | NASA/JPL (Viking); mosaic P. Stooke (UWO) | USGS metadata: no use constraints |
| deimos | 1024×512 | grey | 100% | 42 | [Deimos Global Mosaic (Viking), USGS WMS](https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/deimos_simp_cyl.map&request=GetCapabilities&service=WMS) | NASA/JPL (Viking); map P. Stooke with C. Jongkind, M. Arntz; control P. Thomas (Cornell) | PDS/USGS, credit P. Stooke |

Downloads came from the USGS S3 bucket `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/<product>.tif`
(the `planetarymaps.usgs.gov/mosaic/` address redirects there), the USGS planetary WMS, and
`raw.githubusercontent.com/nasa/NASA-3D-Resources`.

Map notes:

- **Titan** is greyscale surface albedo at 938 nm, seen through the haze. In visible light Titan is a featureless
  orange ball: draw the haze (`colour`) and use the map only for a "surface" or "infrared" view.
- **Io, Ganymede, Triton** are colour composites: Io's is close to natural colour; Ganymede's and Triton's are
  enhanced (Triton: orange, violet and ultraviolet filters as R, G, B).
- **Triton**: Voyager 2 saw the southern hemisphere and a band north of the equator; the north (33% of the sphere)
  is the neutral fill. The USGS product itself filled small gaps near the imaged edge with neighbouring pixels.
- **Charon**: the far south was in polar night during the 2015 flyby (26% fill).
- **Uranian moons**: Voyager 2 (January 1986) saw only the southern hemispheres (61–68% fill). The source maps are
  1440 × 720, so these stay at 1024 × 512.
- **Vesta**: longitudes in the IAU 2015 "Claudia double-prime" system, the same as `rotation` (Dawn SPG PCK has the
  identical W₀ = 285.39°). High northern latitudes were in seasonal shadow during Dawn's mapping and look dark.
- **Iapetus**: the USGS mosaic is brightness-normalised, so the dark Cassini Regio is not as black as in reality
  (albedo 0.03–0.05 against 0.5–0.6).
- **Phobos**: the Viking mosaic was chosen over the sharper Mars Express SRC mosaic because HRSC imagery is ESA
  material (normally CC BY-SA 3.0 IGO); the Viking map is NASA data with no use constraints.
- **No real map exists** (or none that may be redistributed) for Hyperion, Proteus, Nereid, Nix, Hydra, Eris,
  Haumea, Makemake, Gonggong, Quaoar, Sedna, Orcus, Arrokoth, the comets and the interstellar objects:
  `assets.texture` is `null` and `textureNote` says so. Proteus and Hyperion have only pictorial Voyager maps; the
  New Horizons Arrokoth product includes an albedo map that could be added later (PDS, public).

---

## 3. Shape meshes (`public/models/<id>.bin`, format "LSM1")

Little-endian binary, read with `parseLsm1` in `src/physical/mesh.ts`:

| Offset | Type | Content |
| --- | --- | --- |
| 0 | char[4] | `LSM1` |
| 4 | u32 | version = 1 |
| 8 | u32 | vertex count V |
| 12 | u32 | triangle count T (≤ 4000) |
| 16 | u32 | bytes per index: 2 (Uint16) or 4 (Uint32) |
| 20 | f32 | largest vertex distance from the origin, km |
| 24 | f32 | radius of the sphere of equal volume, km |
| 28 | u32 | reserved (0) |
| 32 | f32[3V] | positions x, y, z in km, body-fixed frame |
| 32 + 12V | u16/u32[3T] | triangle indices, counter-clockwise seen from outside |

All meshes are closed and consistently wound (tested: every directed edge has its reverse; volume positive). No
normals are stored: use `computeVertexNormals()`. Units are km, the same as the scene. Axes: +z along the spin
(north/positive) pole, +x at the prime meridian, so `bodyToEclipticAt` orients them directly.

Simplification: quadric-error edge collapse (Garland & Heckbert 1997) with link-condition and normal-flip checks,
implemented in `build-shapes.mjs`. **Deviation** is the distance from source-model vertices (≈ 3000 samples) to the
simplified surface; for the ellipsoids it is the gap between the flat facets and the true ellipsoid.

| id | source model | source triangles | T | equal-volume radius (km) | deviation RMS / max (km) | body frame |
| --- | --- | --- | --- | --- | --- | --- |
| phobos | R. Gaskell, Phobos Q=64 vertex–facet model (Viking, Phobos 2), [PDS SBN](https://sbnarchive.psi.edu/pds4/non_mission/gaskell.phobos.shape-model/) | 49,152 | 4000 | 11.117 | 0.011 / 0.072 | IAU_PHOBOS (x toward Mars) |
| deimos | P. Thomas, 5° radius grid (Viking), [PDS SBN](https://sbnarchive.psi.edu/pds4/non_mission/ast-sat.thomas.shape-models_V1_0/) | 5,040 | 4000 | 6.232 | 0.001 / 0.010 | IAU_DEIMOS |
| hyperion | P. Thomas, 5° radius grid (Voyager 2), PDS SBN (as above) | 5,040 | 4000 | 132.48 | 0.042 / 0.285 | Thomas's Voyager-epoch frame (long axis ≈ z); Hyperion is chaotic |
| proteus | P. Stooke, 5° radius grid (Voyager 2), [PDS SBN](https://sbnarchive.psi.edu/pds4/non_mission/small_bodies.stooke.shape-models/) | 5,040 | 4000 | 201.00 | 0.050 / 0.318 | IAU_PROTEUS (Stooke's west longitudes converted to east) |
| halley | P. Stooke, 5° radius grid (Giotto, Vega), PDS SBN (as above) | 5,040 | 4000 | 4.579 | 0.002 / 0.011 | Stooke's frame (long axis ≈ z); no rotation model |
| vesta | DLR Dawn HAMO global DTM 48 ppd (radius), USGS copy, 1° cell means | 129,600 | 4000 | 261.54 | 0.50 / 2.04 | IAU 2015 (Claudia double-prime) |
| arrokoth | Porter et al. 2024, New Horizons LORRI model v01, [PDS SBN](https://pds-smallbodies.astro.umd.edu/holdings/pds4-nh_derived:arrokoth_shapemodel_porter2024-v1.0/) | 40,960 | 4000 | 9.944 | 0.008 / 0.031 | principal axes, origin at the centre of mass, c = spin pole; W from the product label |
| churyumov-gerasimenko | Gaskell, Jorda et al., SPC SHAP5 24k-plate model, RO-C-MULTI-5-67P-SHAPE-V2.0 ([ESA PSA](https://archives.esac.esa.int/psa/ftp/INTERNATIONAL-ROSETTA-MISSION/SHAPE/RO-C-MULTI-5-67P-SHAPE-V2.0/)) | 24,134 | 4000 | 1.647 | 0.004 / 0.015 | Cheops frame (+z spin axis, Cheops boulder at 142.35° E) = IAU 2015 |
| nix | ellipsoid 50 × 35 × 33 km (Weaver et al. 2016) | — | 3968 | 19.29 | 0.033 / 0.129 | a along x; chaotic rotator |
| hydra | ellipsoid 65 × 45 × 25 km (Weaver et al. 2016) | — | 3968 | 20.85 | 0.062 / 0.331 | a along x; chaotic rotator |
| haumea | ellipsoid a = 1161, b = 852, c = 513 km (Ortiz et al. 2017) | — | 3968 | 795.6 | 2.0 / 9.5 | a along x, c = spin pole (see rotation) |

Volume changes from simplification are all under 0.13%. Every file is under 50 KB (limit 300 KB). Thomas and
Stooke grids store west longitudes for satellites; this was confirmed for Thomas by comparing his Phobos grid with
Gaskell's Cartesian model (RMS 0.18 km west-positive against 0.63 km east-positive) and follows the Stooke labels.
The Nix and Hydra catalogue radii (SSD: 18.0 and 18.5 km) are smaller than the Weaver ellipsoids' equal-volume
radii (19.3 and 20.8 km); both are within the published uncertainties.

---

## 4. rings.json

```jsonc
{ "format": "lightspeed-rings", "version": 1, "conventions": { … },
  "systems": [ { "parent": "uranus", "plane": "parent-equator" | { "poleRaDeg", "poleDecDeg", "source" },
                 "summary": "…", "sources": ["…"],
                 "rings": [ { "name", "radiusKm" | "innerKm"+"outerKm", "widthKm", "thicknessKm"?, "opticalDepth"?,
                              "eccentricity"?, "inclinationDeg"?, "albedo"?, "colour", "colourNote", "note"?, "arcs"? } ] } ] }
```

- **Jupiter**: halo, main ring, Amalthea and Thebe gossamer rings, Thebe extension (PDS Rings Node; NSSDCA).
- **Uranus**: all 13 rings: ζ, 6, 5, 4, α, β, η, γ, δ, λ, ε (51,149 km, 20–96 km wide, τ 0.5–2.3), ν (red) and μ
  (blue) (PDS Rings Node from Nicholson et al. 2018; Showalter & Lissauer 2006; de Pater et al. 2006).
- **Neptune**: Galle, Le Verrier, Lassell, Arago, the unnamed Galatea ring, Adams with the Fraternité, Égalité
  (1, 2), Liberté and Courage arcs as relative longitude spans (1989 geometry; mean motion 820.1194°/day, Dumas et
  al. 1999). The arcs' absolute phase is not modelled, and Liberté and Courage have since faded.
- **Haumea**: 2,287 km, 70 km wide, apparent opacity 0.5, in the plane of pole (285.1°, −10.6°) (Ortiz et al. 2017).
- **Quaoar**: Q1R 4,057 ± 6 km (dense core FWHM ~5 km, τ ~0.4; elsewhere up to ~300 km wide and tenuous) and Q2R
  2,520 ± 20 km (10 km, τ ~0.004) (Morgado et al. 2023; Pereira et al. 2023). No pole adopted.
- **Chariklo** (not an app body): 391 km and 405 km rings (Braga-Ribas et al. 2014), pole from Duffard et al. 2014.

Ring colours are rendering hints; `colourNote` says how well each is known (most are "dark, colour poorly known").

---

## 5. Sources and licences

Data sources (not redistributed as files unless listed in section 6):

- IAU WGCCRE 2015: Archinal et al. 2018, CMDA 130:22, https://doi.org/10.1007/s10569-017-9805-5, as encoded in NAIF
  `pck00011.tpc` (https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc). NASA/JPL, public.
- JPL Solar System Dynamics: satellite physical parameters (current and the 2015 edition archived by the Internet
  Archive, for albedos), satellite mean elements, Small-Body Database API, Horizons (one query, Haumea 2017-01-21).
  NASA/JPL-Caltech.
- PDS Small Bodies Node: satellite and TNO colour compilations (Neese 2014, 2020), shape models (Gaskell, Thomas,
  Stooke, Porter et al.). NASA PDS, public.
- USGS Astrogeology: mosaics, DTM, WMS, Gazetteer of Planetary Nomenclature. US Government, public domain unless
  noted.
- ESA Planetary Science Archive: Rosetta 67P SHAP5 model (also in NASA PDS). ESA/Rosetta/MPS for OSIRIS Team.
- NASA 3D Resources (github.com/nasa/NASA-3D-Resources): Uranian moon maps. NASA, "free and without copyright".
- NASA Science, NASA NSSDCA fact sheets, the Webb site, PDS Rings Node, ESA mission pages: facts and ring data.
- Papers, all cited by DOI in the JSON: Ortiz et al. 2017 (Haumea), Weaver et al. 2016 (Nix, Hydra), Porter et
  al. 2024 (Arrokoth), Sicardy et al. 2011 and Holler et al. 2021 (Eris), Ortiz et al. 2012 (Makemake), Kiss et al.
  2019 (Gonggong), Pereira et al. 2023 and Morgado et al. 2023 (Quaoar), Pál et al. 2012 (Sedna), Brown & Butler
  2017 and Brown et al. 2010 (Orcus), Park et al. 2016 (Ceres), Park et al. 2025 (Vesta), Pätzold et al. 2016,
  Jorda et al. 2016, Sierks et al. 2015, Fornasier et al. 2015 (67P), Verbiscer et al. 2007 (Saturnian albedos),
  Holmberg et al. 2006 (solar colours), Braga-Ribas et al. 2014 and Duffard et al. 2014 (Chariklo), and those behind
  individual facts.

---

## 6. Rows to add to CREDITS.md

```markdown
| `public/textures/{io,europa,ganymede,callisto,enceladus,tethys,dione,rhea,iapetus,titan,triton,charon,ceres,vesta,phobos}.jpg` | Global mosaics from [USGS Astrogeology](https://astrogeology.usgs.gov/) (Voyager, Galileo, Cassini, New Horizons, Dawn and Viking data: NASA/JPL-Caltech, SSI, DLR, JHUAPL/SwRI, UCLA/MPS/IDA, LPI; Triton by P. Schenk; Phobos by P. Stooke), downsampled | Public domain / no use constraints (US Government and NASA mission data) |
| `public/textures/mimas.jpg` | Cassini ISS global mosaic of Mimas by T. Roatsch (DLR), 2017, distributed by USGS Astrogeology | NASA/JPL-Caltech/SSI/DLR; no use constraints |
| `public/textures/deimos.jpg` | Deimos Viking global map by Philip Stooke (University of Western Ontario), with C. Jongkind and M. Arntz, control by P. Thomas (Cornell), via the USGS planetary WMS | NASA Viking data; credit P. Stooke |
| `public/textures/{miranda,ariel,umbriel,titania,oberon}.jpg` | Voyager 2 maps from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), downsampled; unimaged northern hemispheres filled with a neutral tone | NASA, free and without copyright |
| `public/models/phobos.bin` | Decimated from R. Gaskell's Phobos shape model (PDS Small Bodies Node) | NASA PDS, public |
| `public/models/{deimos,hyperion}.bin` | Decimated from P. Thomas's shape models (PDS Small Bodies Node) | NASA PDS, public |
| `public/models/{proteus,halley}.bin` | Decimated from P. Stooke's shape models (PDS Small Bodies Node) | NASA PDS, public |
| `public/models/vesta.bin` | Built from the DLR Dawn HAMO global DTM (NASA/JPL-Caltech/UCLA/MPS/DLR/IDA, via USGS Astrogeology) | Public domain / no use constraints |
| `public/models/arrokoth.bin` | Decimated from the New Horizons Arrokoth shape model v01, S. Porter et al. 2024 (NASA/JHUAPL/SwRI, PDS Small Bodies Node) | NASA PDS, public |
| `public/models/churyumov-gerasimenko.bin` | Decimated from the SHAP5 shape model of comet 67P by R. Gaskell, L. Jorda et al. (ESA/Rosetta/MPS for OSIRIS Team MPS/UPD/LAM/IAA/SSO/INTA/UPM/DASP/IDA; ESA PSA and NASA PDS, RO-C-MULTI-5-67P-SHAPE-V2.0) | [CC BY-SA 3.0 IGO](https://creativecommons.org/licenses/by-sa/3.0/igo/). This derived file is released under the same licence. |
| `public/models/{nix,hydra,haumea}.bin` | Triaxial ellipsoids from Weaver et al. 2016 (Science 351, aae0030) and Ortiz et al. 2017 (Nature 550, 219) | Generated; MIT with the source code |
```

Add to "Other sources used by the code": IAU WGCCRE 2015 rotation models (Archinal et al. 2018) via NAIF
`pck00011.tpc`; JPL SSD satellite physical parameters and mean elements; JPL Small-Body Database; PDS SBN colour
compilations; PDS Rings Node ring tables; the papers listed in `bodies.json` and `rings.json`.

---

## 7. Known limitations

- Facts and spacecraft status reflect sources fetched on 2026-09-25. New Horizons' and Parker's status lines are
  "operating" per NASA's mission pages, which carry no dated 2026 notice.
- Interstellar object sizes are placeholders with ranges in `radiusSource`; ʻOumuamua's shape is only inferred.
- Colours for a third of the bodies are flagged neutral placeholders (no disk-integrated colour in the sources used).
- The 2015 SSD albedos for Titan, Hyperion and Iapetus are rounded 1980s values; Iapetus's is the bright hemisphere.
- Haumea's rotational phase is derived from one occultation plus the published period (about ±5° in 2026); a newer
  occultation analysis (arXiv:2605.28636, May 2026) may refine its shape.
