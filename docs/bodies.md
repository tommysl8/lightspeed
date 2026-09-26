# Bodies: the registry, and how to add to it

Everything Lightspeed draws, labels, lists, flies to or measures is a **body in the registry**
(`src/sim/bodies/`). The Sun, the planets, the Moon, Pluto, Voyager 1 and Proxima Centauri are
registered at start-up (`core.ts`); later phases add moons, dwarf planets, comets, spacecraft,
stars, exoplanets and galaxies the same way, and the rest of the app picks them up by itself:

| Where | What a new body gets without further work |
| --- | --- |
| Scene | a mesh while it (or its rings) is about a pixel wide or more (low-poly under 50 px), a point of light always, an orbit line once its orbit is a few pixels across (asteroids, comets and interstellar objects only while selected, in focus or flown to; at most 48 lines at once) |
| Labels | a label from the pool of 40 when it is among the most important on screen |
| Picking | click or double-click it |
| Where to? and the Bodies list | a destination, found by name and aliases, listed by kind, moons under their planet |
| Location trail | "Solar System › Saturn › Titan" |
| Scenes | `go:`, `fly:` and `sky-from:` resolve its id (`KNOWN_TARGETS` stays the contract list) |
| Flights | the planner's searchable destination list; the standoff is its framing distance |
| Body card and instruments | name, kind, facts, the data sheet from whatever physical fields it has, the ephemeris table while its system is in focus |
| Lab | a light-pulse detector (E1) if it is a planet, a dwarf planet, a spacecraft or a moon of 1,000 km or more (`detector: true` for others); the goniometer (E4) when selected |

Import from `src/sim/bodies` (the index), never from `registry.ts` directly: the index registers
the built-in bodies before anyone can ask for them.

## Frames, units and time

- **Provider positions** are J2000 ecliptic (the frame of JPL Horizons' "Ecliptic of J2000.0" and
  of every staging dataset), in km, **relative to the body's centre** (its parent, or a
  barycentre). Velocities are km/s.
- **World positions** (`sim.bodies[id].pos`) are heliocentric, float64 km, in world axes
  `(x, z, −y)` of the ecliptic: three.js has Y up. The registry does the conversion (a
  permutation and a sign: exact).
- **Time** is an astronomy-engine `AstroTime`. `time.tt` is TT days since J2000, which is what the
  staging evaluators call "TDB days" (TT and TDB differ by under 2 ms). `time.ut` gives the civil
  date the astronomy-engine providers and the date policy need. Availability takes UTC ms.

## Ids, kinds, parents and centres

- **Id**: lower-case words joined by hyphens (`churyumov-gerasimenko`, `atlas-3i`). Use the
  staging ids, which are also the scene target ids in `src/content/scenes.ts`.
- **Kind**: `star`, `planet`, `dwarf-planet`, `moon`, `asteroid`, `comet`, `interstellar`,
  `spacecraft`, `exoplanet`, `galaxy`, `cluster`, `nebula`, or `barycentre` (a point, not a body:
  never drawn, labelled, listed or visited).
- **Parent** is what the body orbits *as people put it*: the Moon → Earth, Charon → Pluto,
  Pluto → the Sun, Proxima b → Proxima. Roots (the Sun, a star, a star system's barycentre) have
  `parent: null`. The parent decides the trail, the Bodies list, the label and ephemeris
  groupings, and the orbit line.
- **Centre** (optional) is what the provider's positions are measured from when that is not the
  parent: a barycentre. Pluto and Charon both have `centre: 'pluto-barycentre'`.
- **Dependencies** (`dependsOn`, optional) are other bodies the provider reads at the same time
  (a track's centres): they are evaluated first each frame.

The registry refuses a record (and registers nothing of its call) with a malformed or taken id,
an unknown parent, centre or dependency, a cycle, a `key` another body already has (keys are
matched case-insensitively), or a destination without a positive `radiusKm` (a barycentre, or a
record with `destination: false`, may have 0).

Registration keeps three orders: registration order; **display order** (a depth-first walk of the
parents, so Jupiter's moons follow Jupiter: `bodyIds()`, `sim.bodyList`); and **evaluation order**
(every body after its centre and dependencies). Within one `registerBodies` call records may come
in any order; everything they reference must be registered already or be in the same call.

## Adding a body

```ts
import { registerBodies, keplerProvider } from '../sim/bodies';

registerBodies([
  {
    id: 'titan',
    name: 'Titan',
    aliases: ['Saturn VI'],
    kind: 'moon',
    parent: 'saturn',
    physical: {
      radiusKm: 2574.76,
      triaxialRadiiKm: [2575.15, 2574.78, 2574.47],
      gmKm3S2: 8978.1371,
      geometricAlbedo: 0.2,
      semiMajorAxisKm: 1_221_900, // helps orbit lines and system framing
      colour: '#927f60',
    },
    rotation: { model: 'synchronous' },
    visual: { map: 'textures/titan.jpg', mapTint: '#ffdeab', atmo: '#e0a050', atmoStrength: 0.5 },
    facts: ['…', '…', '…'],
    factSources: ['https://…', '…', '…'],
    dataSource: 'JPL SSD satellite physical parameters; SAT441 via the fitted orbit model',
    provider: myProvider, // see below
  },
]);
```

Record fields (`src/sim/bodies/types.ts` has them all, documented):

| Field | Notes |
| --- | --- |
| `physical.radiusKm` | mean (equal-volume) radius; required |
| `physical.equatorialRadiusKm`, `polarRadiusKm` | an oblate spheroid (the planets) |
| `physical.triaxialRadiiKm` | `[a, b, c]` along body-fixed x (prime meridian), y (90° E), z (north pole) |
| `physical.maxRadiusKm` | largest distance of the surface from the centre (irregular bodies: a shape's header, or half the longest of `dimensionsKm`); the camera stays outside it |
| `physical.gmKm3S2`, `massKg` | GM feeds orbit lines (the parent's GM plus the body's; about a barycentre, the system's: see "A whole system") |
| `physical.semiMajorAxisKm`, `orbitalPeriodD` | orbit lines about a star with no GM use 4π²a³/P²; system framing uses the moons' `a` |
| `physical.geometricAlbedo` | reflected-light magnitude of the point of light (default 0.3) |
| `physical.luminous` | a star: `{ vmag, atKm, teffK }` (V magnitude seen from `atKm`, effective temperature) |
| `physical.colour` | display tint (markers, orbit line, procedural surface, point colour) |
| `rotation` | see "Rotation" |
| `visual` | see "Textures, shapes and rings" |
| `key` | a navigation key, unique; the built-in bodies own 0–9, M and V |
| `labelRank` | label priority (lower wins; the Sun is 0, Proxima 12). Default: by kind, bigger bodies first |
| `framing` | `{ radii }` (default 4, stars 5, spacecraft 16), `{ distanceKm }`, `{ minKm }` for the closest approach (default 1.015 × the largest radius; spacecraft 2.2 radii, clear of the probe model) |
| `orbitLine` | `false`, or `{ muKm3S2, trailFromMs }` (a hyperbola drawn back to a date) |
| `detector` | light-pulse detector; default on for planets, dwarf planets, spacecraft and moons of 1,000 km radius or more (each detection is a notebook row: small moons and small bodies say `true` to have one) |
| `destination` | `false` keeps it out of Where to? and the Bodies list |
| `article` | Learn article slug (moons default to `worlds-around-worlds`, exoplanets to `other-worlds`) |

Replace a body's record with `replaceBodies([record])` (same id; it keeps its place in every
order, its state and everything placed on it; its mesh and orbit line are remade). Remove bodies
with `unregisterBodies(ids)`; everything placed on them goes too.

## Position providers

```ts
interface PositionProvider {
  label?: string;          // for the data sheet
  static?: boolean;        // never moves (saves light-time work)
  exactLightTime?: boolean; // light-time: always evaluate at the retarded time (the built-in bodies)
  availability(timeMs: number): { available: boolean; reason: string | null; regime: Regime };
  positionAt(time: AstroTime, pos: Vec3Like, vel?: Vec3Like | null): void;
}
```

Rules:

1. `positionAt` returns the position **relative to the centre**, ecliptic km, and the velocity in
   km/s when `vel` is given. It must be finite at every finite time, even where the body is absent.
2. **Do not allocate** in `positionAt` or `availability`: the registry calls them for every body
   every frame. Reuse scratch objects; return shared availability objects (`ALWAYS[regime]`).
   Do not return numbers from helper functions in the hot path that are not inlined (V8 boxes
   them); write into objects instead.
3. `regime` says how far to trust the position: `precise`, `approximate`, `illustrative`,
   `extrapolated` or `unknown`. The body card and data sheet show it; an absent body
   (`available: false`, with a `reason` in a sentence) is hidden, unpickable and unreachable.

Ready-made providers (`src/sim/bodies/providers/`):

| Provider | Use |
| --- | --- |
| `planetProvider(id)`, `moonProvider`, `sunProvider` | the built-in bodies: astronomy-engine in 1700–2200, Standish elements to ±3000 years, frozen beyond (ephemerisPolicy.ts) |
| `voyager1Provider` | Voyager 1's two-body hyperbola, from its 1980 Saturn flyby |
| `fixedStarProvider(ra, dec, km)` | a star at its catalogue place (no proper motion) |
| `atCentreProvider()`, `fixedOffsetProvider(x, y, z)` | on the centre (Pluto today), or a fixed offset |
| `keplerProvider(elements)` | a fixed Keplerian ellipse (mean elements; allocation-free) |
| `twoBodyProvider(r, v, epochTt, mu)` | a conic from a state vector |
| `jupiterMoonProvider('io' …)` | astronomy-engine's Galilean moons relative to Jupiter (ready, unused: the fitted models are 10–30 times closer to JPL) |
| `relativeOrbitProvider(model, opts)` | any evaluator of a position relative to the centre (the fitted moon models) |
| `trackProvider(source, opts)` | any trajectory whose samples are relative to a centre that changes piece by piece, with blends (the Chebyshev tracks) |

A provider can read other bodies at the same time with `heliocentricEclAt(id, time, out)` (and
`heliocentricEclStateAt` for the velocity too): during the frame's pass this reuses what is
already placed. List those bodies in `dependsOn`.

### The phase-2 moons (`public/data/moons.json`, staging/phase2/moons.md)

Move `staging/phase2/src/sim/moonModels.ts` into `src/sim/` as is, load the catalogue, and wrap
each model:

```ts
const models = indexMoonCatalog(await (await fetch(assetUrl('data/moons.json'))).json());
const provider = (m: MoonModel) =>
  relativeOrbitProvider(
    {
      position: (t, out) => evalMoon(m, t, out),
      // Position and velocity in one pass (sim/bodies/providers/moonState.ts): the same
      // positions to the bit, and the exact derivative. evalMoonVelocity is a central difference,
      // two more evaluations of every series every frame; keep it out of the hot path.
      state: (t, pos, vel) => moonState(m, t, pos, vel),
      regime: (t) => moonRegime(m, t), // 'precise' | 'illustrative'
    },
    { velocityUnit: 'km/day', label: 'Orbit model fitted to JPL Horizons' },
  );
```

`moonState` reads the lightspeed-moons/1 format; its test compares it with the staging evaluator
at every model, so a change to the format shows there first.

- Moons of Mars … Neptune: `parent` the planet, no `centre` (the models are planet-centred).
- The Pluto system: Charon, Nix and Hydra get `parent: 'pluto', centre: 'pluto-barycentre'`.
  **Pluto itself** gets its model (`moons.pluto`, about 2,130 km from the barycentre, opposite
  Charon) with `replaceBodies`, which keeps its place, its key and everything on it:

  ```ts
  const core = coreBodyRecords().find((r) => r.id === 'pluto')!;
  replaceBodies([{ ...core, provider: provider(models.pluto), rotation: { model: 'iau', … } }]);
  ```
- Use the fitted Galilean models, not `jupiterMoonProvider` (moons.md explains why).
- `bodies.json` has each moon's `orbit.aKm`: put it in `physical.semiMajorAxisKm`.

### The phase-2 tracks (`public/data/tracks.{json,bin}`, staging/phase2/tracks.md)

Move `staging/phase2/src/sim/tracks.ts` into `src/sim/`, load it, and wrap each body. Its
`evalTrack` / `evalState` results are already `TrackSample`s:

```ts
const tracks = await loadTracks(assetUrl('data/'));
const source = (id: string): TrackSource => {
  const info = tracks.info(id);
  return {
    evaluate: (t, withVelocity) => (withVelocity ? tracks.evalState(id, t) : tracks.evalTrack(id, t)),
    // Availability is asked every frame: answer it from the index, without evaluating the fit.
    regime: (t) => (t < info.precise[0] ? info.before.regime : t > info.precise[1] ? info.after.regime : 'precise'),
  };
};
trackProvider(source(id), {
  name: 'New Horizons',
  centres: { earth: 'earth', venus: 'venus', jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus',
             neptune: 'neptune', pluto: 'pluto-barycentre', arrokoth: 'arrokoth' },
  ssb: (time, out) => { /* barycentreFromSun(time) from sim/voyager.ts, converted to ecliptic */ },
  label: 'Chebyshev fit to JPL Horizons',
});
```

- **The tracks' `pluto` centre is the Pluto–Charon barycentre** (`@9`): map it to
  `pluto-barycentre`, not to Pluto's body.
- Register tracked bodies with `parent: 'sun'` (they are placed heliocentrically) and
  `dependsOn` listing the registry bodies their centres map to (New Horizons: `arrokoth`,
  `pluto-barycentre`, `jupiter`, `earth`).
- `before-launch` and `unknown` samples hide the body with a reason ("… had not been launched
  yet"); `extrapolated` shows it, labelled.
- Voyager 1 is a track too (`voyager1`): `replaceBodies([{ ...core voyager1 record, provider:
  trackProvider(…), orbitLine: { muKm3S2: GM_SOLAR_SYSTEM_KM3_S2 } }])` swaps the built-in
  hyperbola for it (the track covers 1977 on, so the old `trailFromMs` goes, and the provider's
  availability window replaces the 1980 one).
- Planet-centred pieces are relative to astronomy-engine's planet (a system barycentre for the
  giants), which is where the app draws the planet: flybys are exact as stored.

### Stars, star systems and exoplanets (later phases)

- A star is a root (`parent: null`) with `physical.luminous`. Most of the catalogue should stay
  a point cloud (`Starfield`); register as bodies only the stars people visit.
- A multiple system gets a `barycentre` root (moving linearly from J2000, as systems.json says),
  with its stars as children placed by their orbit about it (`centre` the barycentre).
- An exoplanet has `kind: 'exoplanet'` and `parent` its star. Its provider evaluates the orbit at
  `t + D/c` as exoplanets.md explains; it reads the host's distance through `heliocentricEclAt`.
  Exoplanets have no detector by default, and are listed under their star.
- Reflected-light magnitudes assume sunlight: give non-Solar-System planets a `luminous`
  magnitude (or extend `setMagnitude` in `src/sim/derived.ts` with an illuminating star).

## Rotation

`rotation` is data; the registry compiles it:

| `model` | Use |
| --- | --- |
| `iau` | pole (α₀, δ₀) and prime meridian W as polynomials, with periodic terms in the phase angles of the planet system: exactly the `iau-2015` and `fitted` records of bodies.json (`poleRaDeg`, `poleDecDeg`, `pmDeg`, `raTerms`, `decTerms`, `pmTerms`, and `phaseAngles: bodiesJson.phaseAngles[phaseSystem]`) |
| `spin` | a period about a pole (`period-only`, `snapshot`, `chaotic` records: say it is illustrative) |
| `synchronous` | tidally locked: the prime meridian faces the parent, the pole along the orbit normal (moons without an IAU model) |
| `provider` | your own `RotationProvider` (the built-in bodies use astronomy-engine's) |
| `none` or absent | identity (spacecraft point their antenna at Earth in the renderer) |

Mesh axes: +X the prime meridian, +Y the north pole, −Z longitude 90° E. With the staging maps
(prime meridian at the image centre) no extra rotation is needed.

## Textures, shapes and rings

- **Texture**: `visual.map` is a file in `public/textures/` (`'2k_mars.jpg'`) or a path from
  `public/` (`'textures/io.jpg'`, as bodies.json gives it). Equirectangular, prime meridian at the
  centre, east to the right (`lonOffset: 0.5` for a map starting at longitude 0). Greyscale maps:
  set `mapTint` to the body's `colourHue` and `mapChannels: 1` (bodies.json `textureInfo.channels`):
  they are then uploaded as one channel, a quarter of the memory, and decoded from sRGB in the
  shader. `fillBlack` fills unimaged black regions procedurally.
  Maps load once the body is a few pixels wide, decoded off the main thread and uploaded one per
  frame, and live in an LRU cache with a 256 MiB budget (160 MiB on an integrated GPU;
  `src/render/textures.ts`). A mounted mesh holds its maps (`acquireTexture` / `releaseTexture`),
  so they are never disposed under it, even while frames are stopped; the Sun's, Earth's and the
  focused system's stay pinned.
- **Shape**: `visual.shape` is an LSM1 mesh from `public/` (`'models/phobos.bin'`,
  `src/render/shapes.ts`). It is drawn in place of the ellipsoid once loaded, oriented by the
  rotation model, with the same maps. Set `physical.triaxialRadiiKm` for the fallback and the
  framing.
- **Rings**: `visual.rings` is either `{ kind: 'texture', texture, innerKm, outerKm, shadow }`
  (Saturn's photographic strip) or `{ kind: 'bands', bands: [{ innerKm, outerKm, opacity, colour }],
  pole?, shadow? }` built from rings.json: a ring given as `radiusKm` and `widthKm` spans
  radius ± width/2; `opacity = 1 − e^(−τ)`. `plane: 'parent-equator'` means no `pole` (the body's
  own equator); a pole gives `pole: { raDeg, decDeg }`. Narrow rings stay visible as partial texels.
- **Renderer**: `visual.renderer` is `planet` (default for solid bodies), `sun`, `star` (a
  blackbody disc at `luminous.teffK`), `spacecraft` (a probe model at true size, antenna to
  Earth: Voyager's model, scaled from Voyager's 1.85 m radius to the craft's) or `point`
  (galaxies, clusters and nebulae until they have renderers of their own).

## A whole system

1. Register the barycentre if there is one (`kind: 'barycentre'`, `destination: false`,
   `orbitLine: false`, `detector: false`), then the bodies on it (`centre`), then their moons.
   Register a system in one `registerBodies` call.
2. Light-time is worked out per system: the body just below the root (a planet, a barycentre,
   a spacecraft) is carried back to its retarded time along its velocity where that is good to
   1 km (half its acceleration times the delay squared), and otherwise placed there with two
   ephemeris steps (the built-in bodies always are: `exactLightTime`); its members are placed
   at that time and carried to their own light-time along their velocities. Hundreds of moons cost
   one evaluation each, and a system that is only its head (an asteroid, a comet) usually none.
3. The system's framing (`systemFramingDistance`) comes from its moons' `semiMajorAxisKm` (or
   their present distance): the trail's "Saturn" link uses it.
4. Orbit lines of moons are drawn about their planet (a body on a barycentre that orbits the
   body's parent is drawn on the barycentre's orbit: Pluto's line is its system's path) and
   mount only once they are a few pixels across. A body placed on a barycentre (Charon) is drawn
   on its orbit about it, under the pull of the rest of the system, whose mass centre is on the
   far side: μ = (GM − GMᵢ)³ / GM², GM the system's (the barycentre record's `gmKm3S2`, else the
   sum over every body placed on it). Give every member its `gmKm3S2`: without them Charon's
   line is not a circle.

## Costs and limits

- Per frame, every registered body is placed (provider + one float64 add), gets its apparent
  position, distance, size, magnitude and screen position, and a slot in the point-of-light
  buffer. `src/sim/bodies/perf.test.ts` registers 500 moons: under 0.3 ms per frame in Node and
  no allocation per body (the built-in bodies' astronomy-engine calls allocate about 170 kB a
  frame; light-time allocates per system).
- Meshes exist only for bodies about a pixel wide or more; orbit lines only for orbits a few
  pixels across, at most 48 (and none in the relativistic view, which leaves guides out); labels
  are a pool of 40. Keep it that way: never give a body a component, a DOM node or a draw call
  just for being registered.
- The relativistic cube map is redrawn only while a mesh is in it (in interstellar flight it is
  cleared once and left), and its memory is released half a minute after the view is turned off.
- Register a system in one `registerBodies` call: every call rebuilds the orders and re-renders
  the scene's lists (500 single calls take 60 ms; one call of 500 takes 2 ms).
- Everything stays float64 until the camera's position is subtracted (the floating origin).

## Tests to keep

- `equivalence.test.ts`: the built-in bodies reproduce the pre-registry positions, velocities,
  orientations, light-time, sizes, magnitudes, screen positions, framing and flights (fixture in
  `__fixtures__/pre-registry.json`).
- `registry.test.ts`: orders, the parent walk, availability, every provider and adapter, rotation
  models, light-time per system, the barycentric Pluto system.
- `perf.test.ts`: the 500-moon benchmark.
- `src/content/registryIntegration.test.ts`: a body registered later reaches search, the Bodies
  list, the trail, scenes, flights, framing and the lab.
- `checks.test.ts`: what the registry refuses (a taken key, a destination without a radius) and
  the camera limits of spacecraft and irregular bodies.
- `adapters.test.ts` and `providers/moonState.test.ts`: the one-pass paths of the adapters, and
  the fitted moons' state against the staging evaluator.
- `src/sim/lightDelay.test.ts`: light-time carried along a straight line where it is good to a
  kilometre, and exact where it is not.
- `src/scene/orbitLines.test.ts`: the conic, GM and size of every orbit line (Charon about the
  Pluto–Charon barycentre, planets of other stars).
