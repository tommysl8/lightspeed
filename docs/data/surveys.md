# The galaxy surveys

13,453,215 galaxies and quasars from DESI Data Release 1 and the SDSS, as a map of where they are, to redshift 3.5
(6,951 Mpc comoving, 22.7 billion light-years). Built 30 September 2026. The data are the surveys' own catalogues,
merged without duplicates and placed by redshift in the app's Planck 2018 universe; the app streams them as an octree
of small files once the camera leaves the local universe, and draws a budget of them as points with the light of the
rest as glows. Code in `scripts/build-surveys.mjs` (the build), `src/sim/surveys/` (the format, the octree, the
matching, the loading and the choice of nodes), `src/scene/Surveys.tsx` and `src/render/surveyGlow.ts` (the drawing),
`src/render/shaders/galaxyMap.glsl`, `survey.vert.glsl` and `surveyGlow.vert.glsl`.

## 1. Outputs

| File | Size | What |
| --- | --- | --- |
| `public/data/survey/hierarchy.bin.gz` | 81.7 kB | the octree's 2,699 nodes: children, galaxy counts, file sizes, bounding boxes, and each node's own galaxies' summed light, centroid and spread |
| `public/data/survey/r<octants>.bin.gz` | 2,699 files, 63.7 MB in all; median 11 kB, largest 102 kB | one node each: its galaxies (position, kind, luminosity) and its eight octants' glows |
| `docs/data/surveys-build-log.txt` | | the build's counts, cuts and sizes |

4.73 bytes a galaxy. Every file is under 1 MB (the build refuses otherwise). The files' base URL is one constant,
`SURVEY_BASE_URL` in `src/sim/surveys/load.ts` (default the site's own `/data/survey/`): to serve the tiles from
another host, set it to that host's URL (ending in `/`; the host must allow this site to fetch from it) and copy the
directory there.

Galaxies per catalogue as shipped (after the merge and the removal of the Cosmicflows-4 galaxies):

| Catalogue | Rows read | Kept | Left out |
| --- | --- | --- | --- |
| DESI DR1 Bright Galaxy Survey (BGS_ANY) | 5,522,353 | 5,509,541 | 12,812 in Cosmicflows-4 |
| DESI DR1 luminous red galaxies (LRG) | 2,138,627 | 2,079,804 | 58,823 also BGS (same TARGETID) |
| DESI DR1 emission-line galaxies (ELG_LOPnotqso) | 2,432,072 | 2,431,320 | 752 also BGS or LRG |
| DESI DR1 quasars (QSO) | 1,223,391 | 1,223,110 | 281 also another tracer |
| SDSS-I/II galaxies (DR17 SkyServer) | 861,062 | 556,494 | 747 at z ≤ 0.002; 277,928 in DESI; 25,893 in Cosmicflows-4 |
| SDSS-III BOSS DR12 LOWZ + CMASS | 1,325,856 | 867,953 | 174,534 with IMATCH = 2; 282,583 in DESI or SDSS-I/II; 665 in Cosmicflows-4 |
| SDSS-IV eBOSS DR16 LRG | 174,816 | 142,974 | 31,842 already in |
| SDSS-IV eBOSS DR16 ELG | 173,736 | 172,537 | 1,199 already in |
| SDSS-IV eBOSS DR16 QSO | 343,708 | 210,892 | 132,816 already in |
| SDSS DR16Q | 750,414 | 258,590 | 665 not IS_QSO_FINAL = 1; 10,348 beyond z = 3.5; 480,803 already in; 1 in Cosmicflows-4 |
| **All** | | **13,453,215** | |

By class: red 5,991,286, blue 5,764,538, grey (no colour) 4,799, quasars 1,692,592. By comoving distance: 4,581 within
50 Mpc, 28,546 within 100, 386,082 within 300, 2,234,065 within 750, 5,561,514 within 1,500, 8,823,419 within 3,000,
the rest to 6,951 Mpc.

The research estimated 13.76 million: that included 254,866 galaxies of 6dFGS and 2dFGRS, which are not shipped (their
pages give no licence), and the 48,235 Cosmicflows-4 matches it counted included 6dFGS's; without those two surveys the
same merge gives 13.50 million, and the z ≤ 3.5 cut and the Cosmicflows-4 removal (39,371) bring it to 13.45.

## 2. The build

```
npm run data:surveys      # node --max-old-space-size=8000 scripts/build-surveys.mjs; about 3 minutes, 1.5 GB of memory
```

Node 24, no dependencies: a small FITS reader (`scripts/surveys/fits.mjs`, streaming, so the 478 MB BGS file is never
held whole), and the app's own modules imported directly (Node strips their types): the cosmology
(`src/physics/cosmology`), and `src/sim/surveys/format.ts`, `match.ts` and `tile.ts`, which the tests exercise too.
Seeded, so a rerun from the same inputs writes the same files.

Inputs, in `data-raw/surveys/` (git-ignored; fetched only when missing, about 1.9 GB):

| File | Origin |
| --- | --- |
| `desi/{BGS_ANY,LRG,ELG_LOPnotqso,QSO}_{NGC,SGC}_clustering.dat.fits` | https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/ |
| `sdss/galaxy_DR12v5_CMASSLOWZTOT_{North,South}.fits.gz` | https://data.sdss.org/sas/dr12/boss/lss/ |
| `sdss/eBOSS_{LRG,ELG,QSO}_clustering_data-{NGC,SGC}-vDR16.fits` | https://data.sdss.org/sas/dr17/eboss/lss/catalogs/DR16/ |
| `sdss/dr16q_vizier.csv` | VizieR TAP, VII/289 (RAJ2000, DEJ2000, z, r_z, QSO, zPipe, q_zPipe) |
| `sdss/legacy_dr17_ra{0-150,150-200,200-360}.csv` | SkyServer DR17 SQL: `SpecObj` with `survey = 'sdss'`, `class = 'GALAXY'`, `zWarning = 0`, `sciencePrimary = 1`, joined to `PhotoObj` for modelMag g, r, petroMag r and extinction g, r (the query is in the script) |
| `licences/*.html` | the DESI data licence and acknowledgement page, SDSS's image-use policy and the SDSS-I/II, III and IV acknowledgement pages |

The build checks the licences before it writes anything: DESI's page must still say CC BY 4.0 and its acknowledgement
paragraph must be the one `CREDITS.md` quotes word for word; SDSS's must still say its data are in the public domain.

## 3. Sources and licences

| Data | Source | Licence / terms |
| --- | --- | --- |
| DESI DR1 large-scale-structure catalogues v1.5 | DESI Collaboration et al. 2026, "Data Release 1 of the Dark Energy Spectroscopic Instrument", AJ 171, 285 (arXiv:2503.14745); Ross et al. 2025, JCAP 01, 125 | CC BY 4.0: cite the DR1 paper, indicate changes (below and in `CREDITS.md`), include DESI's acknowledgement text (`CREDITS.md` and the About page's sources, verbatim) |
| SDSS DR17 | Abdurro'uf et al. 2022, ApJS 259, 35; the SDSS-I/II main sample (Strauss et al. 2002, AJ 124, 1810), BOSS DR12 (Reid et al. 2016, MNRAS 455, 1553), eBOSS DR16 (Ross et al. 2020, MNRAS 498, 2354; Raichoor et al. 2021, MNRAS 500, 3254), DR16Q (Lyke et al. 2020, ApJS 250, 8) | "considered in the public domain" (sdss.org image-use policy); the SDSS-I/II, SDSS-III and SDSS-IV acknowledgements requested (`CREDITS.md`, the About page) |

The changes made (as CC BY asks): rows selected (below); duplicates removed; galaxies in Cosmicflows-4 removed;
redshifts taken to the CMB frame and turned into comoving positions in the Planck 2018 cosmology; a class and an r-band
luminosity added; positions rounded to 5″ and 0.125 Mpc; tiled into an octree with summed glows.

Not used: 6dFGS, 2dFGRS and GAMA (no licence found on their pages), Quaia (its distances are uncertain by hundreds of
Mpc), targets not yet observed, and any model of the unobserved universe.

## 4. What is done to the catalogues

**Kept.** The DESI and eBOSS clustering catalogues as delivered (their own quality cuts: good redshifts, vetoed areas
removed). SDSS-I/II galaxies with `zWarning = 0`, `sciencePrimary = 1`, class GALAXY and z > 0.002. BOSS rows with
`IMATCH = 1` (IMATCH = 2 are SDSS-I/II spectra re-used). DR16Q rows with `IS_QSO_FINAL = 1` and z > 0. Everything to
z = 3.5: DESI's quasar sample stops there, and above it DESI's Lyman-alpha quasar redshifts are biased (DR1 known
issues); it leaves out 10,348 DR16Q quasars (to z = 7.0), one constant in the script (`Z_MAX`) to change.

**Merged.** DESI's tracers by TARGETID, in the order BGS, LRG, ELG, QSO (the first keeps the galaxy). Then each SDSS
catalogue in turn, SDSS-I/II, BOSS, eBOSS LRG, ELG, QSO, DR16Q, against everything before it on the sky: an entry within
1.5″ of an earlier one is the same galaxy, whatever the redshifts say, and the earlier survey keeps it (DESI's
redshifts are newer and more precise: 12 km/s median difference from SDSS-I/II spectra, 27 from BOSS, 169 from DR16Q,
as the research measured). The matching (`src/sim/surveys/match.ts`) sorts the points into cells of declination bands
and right-ascension runs as wide as the radius, so a query looks in a few cells and checks the true angle, across 0h/24h
and at the poles too. Then the galaxies that are in Cosmicflows-4 (`public/data/cosmic-web.bin.gz`): within 6″ (its PGC
positions are coarser) and within 800 km/s in CMB-frame velocity, so a background galaxy behind a nearby one stays.
39,371 are left out, so no galaxy is drawn twice; the cosmic web keeps its measured distances and groups.

**Placed.** Each heliocentric redshift is taken to the CMB frame, 1 + z_cmb = (1 + z_hel) γ (1 + β cos θ) (the Sun's
369.82 km/s toward galactic (264.021°, 48.253°), Planck 2018 I), and turned into a comoving distance by the app's own
cosmology module (Planck 2018; tabulated every 0.0001 in z, within 0.001 Mpc of the module), along the galaxy's ICRS
direction in the app's world axes (world = (x_ecl, z_ecl, −y_ecl), obliquity 84,381.448″). The tests check these
constants against the app's.

These are **redshift-space** positions: a galaxy is placed as if all of its redshift came from the expansion. Its own
motion (a few hundred km/s, over 1,000 in a rich cluster) moves it along our line of sight by about 1.6 Mpc per
100 km/s at any redshift the surveys reach, so clusters are drawn as spikes pointing at the Solar System (the "fingers
of God", Jackson 1972) and walls look thinner than they are (Kaiser 1987). From anywhere else the spikes still point
at us: it is a map made from Earth. The layer's card says so in one line.

**Classed.** Four classes, coloured as the cosmic web's (orange, blue, grey) plus a pale violet for quasars:
red for LRG, BOSS and eBOSS LRG; blue for ELG and eBOSS ELG; quasar for the QSO samples and DR16Q; and for the BGS and
SDSS-I/II galaxies, red or blue by their observed g − r (dereddened), at the trough of the colour distribution
measured in each redshift bin of 0.02: 0.65 at z = 0.03 rising to 1.59 at z = 0.47 (the K-correction reddens the red
sequence with redshift), with a straight line fitted to the measured troughs beyond z = 0.5. The SDSS-I/II galaxies'
own troughs, measurable only below z = 0.1, agree with BGS's within 0.04 mag, so BGS's cut parts both. 4,799 SDSS
galaxies without photometry are grey.

**Luminosity.** In the r band where the catalogue has photometry (BGS: its dereddened flux; SDSS-I/II: petroMag r less
extinction; BOSS: MODELFLUX r less extinction): M_r = m_r − DM(z) + 2.5 log10(1 + z), with only the bandwidth term of
the K-correction, relative to M*_r = −21.2 (Blanton et al. 2003, h = 0.7, the convention of the web's Ks L*), kept in
0.05 dex. 6,929,146 have one. The rest (DESI LRG, ELG, eBOSS, the quasars) take the median of the measured ones of their
class beyond z = 0.4 (log L/L* = 0.23 red, 0.24 blue), quasars that of an L* galaxy: a class median, so their points
are all one size. Joining DESI's photometry by TARGETID (NOIRLab's Astro Data Lab) would give them their own; not done.

## 5. The octree

(`src/sim/surveys/format.ts`, `tile.ts`.) A cube of 32,768 Mpc (it holds the whole observable universe, 14,165 Mpc in
radius), the Sun at one third of each axis, so that no level puts a boundary near the Sun (1/3 is 0.0101… in binary);
the research measured that this draws 82 % of the galaxies within 100 Mpc of a camera at the Sun where a centred cube
drew 16 %. Each node keeps up to 16,384 galaxies: the galaxies are taken in one seeded random order and each goes down
from the root to the first node on its way with room. So each node is a random sample of its cube's galaxies that no
ancestor kept, a fair sample of where galaxies are at every level, and every galaxy is stored once. 2,699 nodes, 9 levels
below the root.

**A node's file.** A 16-byte header; the eight octants' glows (per octant the summed display light of each class, the
light-weighted centroid from the node's centre and the rms radius, float32); then the galaxies grouped by precision
tier, each group quantised to the node's corner at a step of 0.125 Mpc / 2^k, sorted along a Morton curve on the first
17 bits of each axis and stored as LEB128 varint differences, with any bits below packed after; then a kind byte (class,
catalogue) and a luminosity byte per galaxy. A galaxy's tier is the coarsest whose worst error (half a cell's diagonal)
keeps its direction from the Sun within 5″ and its distance within 0.125 Mpc; the tests decode nodes and check every
galaxy against both. The app decodes a node in its worker into float32 positions from the node's centre and draws them
with the node's centre as seen from the camera computed in float64, so neither a camera 14 Gpc out nor a galaxy 7 Gpc
away loses precision.

**The hierarchy.** Per node: its children, its galaxy count and its subtree's, its file's size, its subtree's galaxies'
bounding box (65,535ths of its side, rounded outwards), and its own galaxies' summed light per class, centroid and rms
radius (16 bits each; light in 1,024 steps an octave). Decoding combines these into each subtree's summary. 44 bytes a
node.

## 6. Light: the display law and the glows

A galaxy's light on the screen is the product mapLight(L) × mapDepth(d) × (what the expansion and the ship do to its
light), `render/shaders/galaxyMap.glsl`, shared with the cosmic web. mapLight is the web's gentle luminosity law (0.6
(L/L*)^0.3 within 0.08 to 1, times (L/L*)^0.36 within 0.5 to 4); mapDepth the depth cue (1.4 × min(1 + 90 / d, 9) / (1 +
(d/D)²), falling as 1/d nearer than D and as 1/d² beyond); the rest, as the web's points, is the light of a black body
of the class's colour temperature seen at T D / (1 + z) (redshift from the cosmology's emission table at the camera's
epoch, the ship's Doppler factor), with Tolman's dimming and aberration, the expansion's dimming held to at most a
factor of 100 in flux beyond what the ship's own shift does (MAP_DIM_FLOOR, applied from z = 0.65 on, to the web's
points too): with all of it the galaxies seen from gigaparsecs away, whose light left them billions of years ago, came
out thousands of times fainter than those near the camera and the survey's far shells were black. The point's size only
shapes it: its alpha is its light over its area.

Because the law is a product, a cell of the octree can carry the sum of mapLight of all its galaxies, and a glow for the
cell with the other factors applied once holds the light of all of them. **The glows are a faint fill, not the light's
full account.** Each wholly drawn node's octants whose child is not drawn at all are glows holding that child's
subtree's light (the tests check it to 1 % on synthetic catalogues, and that splitting never changes it), drawn at the
share of the catalogue the points draw, at most GLOW_FILL (0.2): where points are drawn at 1.5 % of the galaxies the
glows show the rest at 1.5 % too, as a faint tint where the points thin out, not a haze over them. A first version drew
the glows with all of the undrawn galaxies' light, as the points' sum would suggest; from gigaparsecs out those hold 98
% of it and the survey was a fog with a sprinkle of points.

The glows are drawn as soft splats (a Gaussian 1.6 times as wide as the octant's spread seen from here: an octant's
light fills its cube, flat-topped, and narrower splats summed to a visible lattice) into a target of one sixteenth of
the view's resolution in each direction, added to the view in linear light. A glow that looks wide is split, largest
first, into its node's own galaxies and its children's subtrees, from the hierarchy's summaries (no download), until the
splats are narrower than 24 device pixels or 1,000 of them are drawn; the light is only divided, never changed. A glow
wider than 12 device pixels (1σ) fades out by 48 (render/galaxyMap.ts glowFade): a region that large on the screen is
drawn in points. The depth cue is averaged over each glow's spread (three points along the line of sight), since near
the camera an octant's galaxies are both near and far and the cue falls as 1/d²: at its centroid alone the octant round
the camera came out several times too bright.

**The depth scale** D (`render/galaxyMap.ts` mapDepthMpc) is 180 Mpc near home, as the web always had, and the camera's
distance from the Sun beyond that: the knee moves out with the camera, so from outside the survey the cue dims the
galaxies round home by a factor of 2, not by their distance squared, and nearer than 90 Mpc a galaxy is brightened as it
is from home (mapNear, 1 + 90 / d, at most 9). With the web's fixed 180 Mpc everything beyond about 1 Gpc was invisible
from out there.

**Looking back from far away.** The map shows where the surveys' galaxies are, from anywhere: a galaxy is left out only
beyond the particle horizon, where none of its light has arrived. (A first version also left out galaxies whose light,
reaching the camera, left before the earliest galaxy seen, MoM-z14 at z = 14.44; from 10 Gpc and more that emptied the
survey entirely, and the fans of its footprint are what the view from out there is for.) Nodes whose every galaxy would
be fainter than 1 % alpha even at its best (nearest, most luminous, hottest colour) are not drawn or fetched. Glows
whose brightest pixel could not reach 10⁻⁵ are left out, and with none left the glow target and its full-screen pass
are not drawn.

## 7. In the app

**When.** `ui/cosmicLayers.ts`: in the default 'auto' setting nothing is fetched until the camera is 30 Mpc from the
Sun; the layer then fades in, fully shown by 60 Mpc. Why 30 Mpc: within it the cosmic web draws the galaxies at their
measured distances, while a survey can only place a galaxy by its redshift, and there a galaxy's own motion (300 km/s
and more, over 1,000 in the Virgo cluster) is a large share of the expansion's (2,000 km/s at 30 Mpc), so redshift places
would be off by 15 % or more; from 30 to 60 Mpc the web itself goes over to redshift distances. And everything the tour
and the journeys visit nearby, the Local Group, the nearby galaxies and the Virgo cluster (16.5 Mpc), lies inside it:
most visits download none of it. The cosmic web's scene (200 Mpc out), Coma and the flights to the far universe do. The
View menu's "Galaxy surveys" turns it on (loading wherever the camera is) or off for good; its card says what the
points are, in two lines, and that they are placed by redshift. The layer fades out while a black hole's lens is drawn,
and is not drawn before the earliest galaxies or once a − 1 passes 10³⁰, as the web.

**Loading** (`src/sim/surveys/load.ts`). The hierarchy once, then the nodes the frame's selection asks for, most wanted
first, six at a time, each fetched, inflated and decoded in a worker. A failed download is tried again after 2 s,
doubling each time to at most a minute (`lib/retry.ts`, shared with the star files), for as long as it is wanted: it
never gives up for the session. Up to 2.5 million galaxies stay decoded; beyond, the nodes least recently drawn go.

**Which nodes, and how much of each** (`src/sim/surveys/lod.ts`). The budget is spread over the whole visible volume,
not spent on the few nodes that look largest (a first version drew 6 nodes from 2 Gpc; now 16–25 from any view).
Each part of the sky draws a share k (pixels / galaxies)^0.3 of its galaxies, by its subtree's bounding box seen from
the ship (in flight its direction aberrated and its size divided by the Doppler factor there): the dense nearby survey
seen from afar gets more points, so its walls and filaments show, the thin far shells not so few that they vanish.
Going down from the root, a node draws what its ancestors' points leave missing of that share: all its galaxies (and
then its children are considered) or a part, at least a tenth, and nothing below it. k is the largest that fits the
budget (a bisection, 0.1–0.3 ms). A part is a fair sample: the worker puts each node's galaxies in a bit-reversed
order of the file's space-filling curve, so every prefix is spread evenly over the node, and the draw takes the first
so many (a draw range: nothing is copied). The choice is made over the whole hierarchy, loaded or not, so it does not
change as files arrive and no file is fetched that the view would not draw.

**The point budget** (`render/gpuBudget.ts` surveyBudget): 200,000 galaxies to start with, between 80,000 and 300,000.
The frame's GPU time is measured by the timer the black hole's lens uses (one query a frame, only while the layer is
drawn): after each 30 measured frames a median over 8.5 ms takes a fifth off the budget, one under 6.5 ms adds a tenth.
Only frames drawn as the laptop draws them count: while the page is hidden or frames are stepped by hand
(`window.__ls.step`, the perf tools) the GPU idles between frames and times them several times too slow, so the samples
are ignored and the budget is 200,000. Without the timer extension it stays there too. For a measurement,
`__ls.surveys.budget.pin(300000)` (or `pin = 300000`) holds it, and `pin(null)` lets it move again.

## 8. Performance and downloads

Measured on the target laptop (Intel Core 5 320, Intel Graphics, Chrome with ANGLE on Direct3D 11) in the development
build, 30 September 2026, with `window.__ls.perf`: pixel ratio 2, a 2,880 × 1,584 canvas (larger than the laptop's own
1,936 × 1,384, so the costs are on the high side), no multisampling, the point budget held at 200,000. The cost is
`perf.ab` with the layer on against off, interleaved, five rounds of four batches of 20 frames, the median of the
rounds' differences (they agreed within 0.15 ms); the frame is the whole frame's GPU time with the layer on. Downloads
are the bytes as stored (gzip; what Vercel sends) from a cold start of the layer at each view: the hierarchy (81.7 kB)
and the nodes the view draws. "Looking home" is from the direction of right ascension 318°, declination +48°, which
shows the northern and southern footprints as two fans.

| View | Downloaded | Files | Drawn: nodes, galaxies, glows | Survey's GPU cost | Whole frame |
| --- | --- | --- | --- | --- | --- |
| At Earth, and anywhere within 30 Mpc (default setting) | 0 | 0 | nothing | 0 | unchanged |
| 50 Mpc out (towards the north galactic pole, looking home) | 2.09 MB | 23 | 21, 200,000, 0 | | |
| 500 Mpc out (the same way) | 1.90 MB | 21 | 20, 200,000, 6 | 1.33 ms | 8.7 ms |
| The `cosmic-web` scene (200 Mpc out) | 2.07 MB | 23 | 16, 198,934, 0 | | |
| 2 Gpc out (`controller.placeAt('local-group', 6.2e22)`) | 1.84 MB | 21 | 20, 200,000, 51 | 1.62 ms | 9.3 ms |
| 5 Gpc out, looking home | 1.89 MB | 23 | 22, 200,000, 115 | 1.55 ms | 9.4 ms |
| 10 Gpc out, looking home | 2.12 MB | 26 | 25, 200,000, 327 | | |
| The edge of the observable universe (14 Gpc), looking home | 1.97 MB | 24 | 23, 200,000, 170 | | |

The whole frame read 7.4–7.8 ms without the layer in these runs (4.6–5.9 ms in earlier ones on a 2,560 × 1,224 canvas):
the machine was busier. The points cost about as much as their pixels: 200,000 sprites of 4 to 5 device pixels across at
these distances. The glows add their full-screen pass (0.5–0.9 ms, whatever their number), and none at all where no glow
is bright enough to show. On the processor, choosing the nodes takes 0.1–0.3 ms a frame; the glows are chosen again (0.5
ms for 1,000) only when the drawn nodes change or the camera moves or turns.

The point budget's controller could not be checked in this harness, whose frames are stepped by hand in a hidden pane
(such frames are now ignored, above). In a visible tab at 60 frames a second it should read the real frame time; that
is to be checked on the laptop.

## 9. Caveats and later

- Two thirds of the sky is not in these surveys (everything south of declination −20° and the Milky Way's plane), and
  the map thins with distance: flux-limited surveys see only the brighter galaxies far away, and each chose different
  kinds, so the density and colour change with distance (BGS to z ≈ 0.4, then LRGs, then ELGs and quasars) because of
  selection, not structure. DR1 is one year of five: its footprint is mottled on the scale of DESI's tiles.
- Redshift space (above), and redshift errors: about 0.2–0.7 Mpc for galaxies, a few Mpc for quasars, and a few
  hundred catastrophic quasar redshifts thousands of Mpc off.
- The distances depend on the cosmology: at z = 1 a 1 % change in H0 moves a galaxy about 34 Mpc. Changing the app's
  cosmology needs the tiles built again (the build uses its module).
- Survey galaxies belong to no group the tiles know of: in the expanding universe each moves with the expansion on its
  own, so clusters stretch as the clock runs ahead (the web's groups keep their size).
- Luminosities: the class median for 6.5 million galaxies (above); a K-correction of the bandwidth term only.
- The glows are a tint at the points' own sampling rate, not the undrawn galaxies' light: the layer is a map of where
  the surveyed galaxies are, not a photometric image (and holds nothing of the fainter galaxies no survey saw).
- Not yet: points cannot be picked (a card per galaxy); the survey has no lensed variant near a black hole; DESI DR2
  (expected early 2027) would replace DR1 with the same pipeline.
- Hosting: 63.7 MB in 2,700 files in the repository, served by Vercel. A first view costs about 1.8–2.1 MB in 21–26
  files. If traffic grows, move `public/data/survey/` to another host and change `SURVEY_BASE_URL`.
