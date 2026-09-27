/**
 * Scenes: the one place that sets the view up from a short text spec. The Learn articles'
 * "See it in Lightspeed" buttons, the journeys and (later) search all go through here.
 *
 *   go:<target>                 fly the camera to a target and show its card
 *   fly:<target>                a 1 g flip-and-burn flight from Earth, paced by ship time
 *   fly:<target>?beta=<0..1>    a constant-speed flight from Earth
 *   sky-from:<target>           stand beyond a target and look back towards the Sun
 *   date:<YYYY-MM-DD>           set the simulation date
 *   <name>                      a named scene: race-sunlight, year-in-30s, mars-opposition …
 *
 * Targets are the ids in KNOWN_TARGETS (the contract with the articles); resolveTarget turns
 * one into something the camera and the planner can use: any body in the registry
 * (sim/bodies), so a target resolves as soon as data registers its body. Every target and every
 * named scene is in the app once its data have loaded (articleScenes.test.ts checks each see-it
 * block of the articles). Until then a spec says what it is waiting for ("Loading the
 * galaxies…"), or that its data did not load, and its button is disabled.
 */
import { SearchRelativeLongitude, Body } from 'astronomy-engine';
import { Vector3 } from 'three';
import { AU_KM, C_KM_S, LIGHT_YEAR_KM, PARSEC_KM } from '../physics/constants';
import { bodyName, bodyPositionAt, childrenOf, displayRadiusKm, getBody, isBody, type BodyId } from '../sim/bodies';
import { controller } from '../controls/cameraController';
import { framingDistance, systemFramingDistance } from '../controls/framing';
import { resetToNow, setEpoch, setPaused, setWarp } from '../sim/clock';
import { updateEphemeris } from '../sim/ephemeris';
import { PRECISE_END_MS, PRECISE_START_MS } from '../sim/ephemerisPolicy';
import { sim } from '../sim/sim';
import { solarSystemStatus } from '../sim/solarSystem';
import { starStatus } from '../sim/stars/load';
import { featuredStatus } from '../sim/exoplanets/load';
import { galaxyStatus, nebulaStatus } from '../sim/galaxy/load';
import { cosmosStatus } from '../sim/cosmos/load';
import { MILKY_WAY_MODEL_LABEL } from '../sim/galaxy/records';
import { planFlight, planTrip, type Drive, type TripPlan } from '../sim/travel';
import { refusalText } from '../ui/flight/tripText';
import { astroTimeAt, daysInMonth, formatDurationShort, formatSimDate, msFromAstroTime, msFromCivil } from '../lib/time';
import { useUI, type UIState } from '../state/ui';
import { emitLightPulse } from '../lab/logger';
import { frameCosmicWeb, frameLocalGroup, frameMilkyWay, goToBody, goToStarSystem, goToSystem, showCmbMap } from '../ui/navigation';
import { afterArrival, planOneG, startTrip } from '../ui/tripActions';
import { formatIsoDate } from './learn/catalogue';

// ─── Targets ────────────────────────────────────────────────────────────────────────────

/** Every target the articles name, with its display name. */
const TARGET_NAMES = {
  sun: 'Sun',
  mercury: 'Mercury',
  venus: 'Venus',
  earth: 'Earth',
  moon: 'Moon',
  mars: 'Mars',
  phobos: 'Phobos',
  deimos: 'Deimos',
  jupiter: 'Jupiter',
  io: 'Io',
  europa: 'Europa',
  ganymede: 'Ganymede',
  callisto: 'Callisto',
  saturn: 'Saturn',
  mimas: 'Mimas',
  enceladus: 'Enceladus',
  tethys: 'Tethys',
  dione: 'Dione',
  rhea: 'Rhea',
  titan: 'Titan',
  hyperion: 'Hyperion',
  iapetus: 'Iapetus',
  uranus: 'Uranus',
  miranda: 'Miranda',
  ariel: 'Ariel',
  umbriel: 'Umbriel',
  titania: 'Titania',
  oberon: 'Oberon',
  neptune: 'Neptune',
  triton: 'Triton',
  proteus: 'Proteus',
  nereid: 'Nereid',
  pluto: 'Pluto',
  charon: 'Charon',
  nix: 'Nix',
  hydra: 'Hydra',
  ceres: 'Ceres',
  vesta: 'Vesta',
  eris: 'Eris',
  haumea: 'Haumea',
  makemake: 'Makemake',
  gonggong: 'Gonggong',
  quaoar: 'Quaoar',
  sedna: 'Sedna',
  orcus: 'Orcus',
  arrokoth: 'Arrokoth',
  halley: 'Halley’s Comet',
  encke: 'Comet Encke',
  'churyumov-gerasimenko': 'Comet 67P/Churyumov–Gerasimenko',
  'hale-bopp': 'Comet Hale–Bopp',
  oumuamua: 'ʻOumuamua',
  borisov: '2I/Borisov',
  'atlas-3i': '3I/ATLAS',
  voyager1: 'Voyager 1',
  voyager2: 'Voyager 2',
  pioneer10: 'Pioneer 10',
  'new-horizons': 'New Horizons',
  'parker-solar-probe': 'Parker Solar Probe',
  jwst: 'James Webb Space Telescope',
  proxima: 'Proxima Centauri',
  'alpha-centauri-a': 'Alpha Centauri A',
  'alpha-centauri-b': 'Alpha Centauri B',
  'barnards-star': 'Barnard’s Star',
  sirius: 'Sirius',
  vega: 'Vega',
  betelgeuse: 'Betelgeuse',
  rigel: 'Rigel',
  polaris: 'Polaris',
  '61-cygni': '61 Cygni',
  'trappist-1': 'TRAPPIST-1',
  'tau-ceti': 'Tau Ceti',
  'epsilon-eridani': 'Epsilon Eridani',
  'wolf-359': 'Wolf 359',
  altair: 'Altair',
  aldebaran: 'Aldebaran',
  antares: 'Antares',
  deneb: 'Deneb',
  arcturus: 'Arcturus',
  'hr-8799': 'HR 8799',
  '51-pegasi': '51 Pegasi',
  'kepler-90': 'Kepler-90',
  'toi-700': 'TOI-700',
  'kepler-16': 'Kepler-16',
  'sgr-a-star': 'Sagittarius A*',
  s2: 'S2',
  'orion-nebula': 'Orion Nebula',
  'crab-nebula': 'Crab Nebula',
  'eagle-nebula': 'Eagle Nebula',
  'ring-nebula': 'Ring Nebula',
  'helix-nebula': 'Helix Nebula',
  'carina-nebula': 'Carina Nebula',
  pleiades: 'Pleiades',
  hyades: 'Hyades',
  'omega-centauri': 'Omega Centauri',
  '47-tucanae': '47 Tucanae',
  andromeda: 'Andromeda Galaxy',
  triangulum: 'Triangulum Galaxy',
  lmc: 'Large Magellanic Cloud',
  smc: 'Small Magellanic Cloud',
  m81: 'Bode’s Galaxy (M81)',
  m87: 'M87',
  'centaurus-a': 'Centaurus A',
  sombrero: 'Sombrero Galaxy',
  whirlpool: 'Whirlpool Galaxy',
  'virgo-cluster': 'Virgo Cluster',
  'coma-cluster': 'Coma Cluster',
  'bullet-cluster': 'Bullet Cluster',
  'gn-z11': 'GN-z11',
  'jades-gs-z14-0': 'JADES-GS-z14-0',
  'mom-z14': 'MoM-z14',
} as const;

export type TargetId = keyof typeof TARGET_NAMES;

/** Every target the articles use, in the order above (Solar System outwards). */
export const KNOWN_TARGETS = Object.keys(TARGET_NAMES) as TargetId[];

export const isKnownTarget = (id: string): id is TargetId => Object.hasOwn(TARGET_NAMES, id);

/** What a target resolves to: something the camera can orbit and the planner can fly to. */
export type TargetRef = { kind: 'body'; id: BodyId; name: string };

/** Turns a target id into a TargetRef, or null when it does not handle that id. */
export type TargetResolver = (id: string) => TargetRef | null;

/** Every registered body (body ids are target ids). */
const bodyResolver: TargetResolver = (id) => (isBody(id) ? { kind: 'body', id, name: bodyName(id) } : null);

const resolvers: TargetResolver[] = [bodyResolver];

/**
 * Add a resolver (a later update's moons, stars or galaxies). Resolvers added later are asked
 * first. Returns a function that removes it again.
 */
export function addTargetResolver(fn: TargetResolver): () => void {
  resolvers.unshift(fn);
  return () => {
    const i = resolvers.indexOf(fn);
    if (i >= 0) resolvers.splice(i, 1);
  };
}

/** The camera and planner's handle on a target, or null if it is not in the app yet. */
export function resolveTarget(id: string): TargetRef | null {
  for (const r of resolvers) {
    const ref = r(id);
    if (ref) return ref;
  }
  return null;
}

/** A target's display name, whether or not it resolves yet. */
export const targetName = (id: string): string => resolveTarget(id)?.name ?? (isKnownTarget(id) ? TARGET_NAMES[id] : id);

// ─── Specs ──────────────────────────────────────────────────────────────────────────────

export const NAMED_SCENES = [
  'race-sunlight',
  'year-in-30s',
  'moon-month',
  'split-0.999c',
  'light-time-correction',
  'mars-opposition',
  'jupiter-moons',
  'galactic-centre-orbits',
  'milky-way-outside',
  'local-group',
  'cosmic-web',
  'cmb-map',
  'cmb-glow',
  'edge-of-reach',
  'voyager2-neptune',
  'halley-2061',
  'trappist-1-worlds',
] as const;
export type NamedSceneId = (typeof NAMED_SCENES)[number];

const isNamed = (s: string): s is NamedSceneId => (NAMED_SCENES as readonly string[]).includes(s);

export type Scene =
  | { kind: 'go'; target: string }
  /** beta null: the 1 g rocket; otherwise a constant speed, as a fraction of c. */
  | { kind: 'fly'; target: string; beta: number | null }
  | { kind: 'sky-from'; target: string }
  | { kind: 'date'; date: string; ms: number }
  | { kind: 'named'; name: NamedSceneId };

const TARGET_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A target in KNOWN_TARGETS, or any id a resolver added later knows. */
const isTarget = (id: string) => isKnownTarget(id) || (TARGET_RE.test(id) && resolveTarget(id) !== null);

/** A spec read into its parts, or null when it is not one (unknown kind or target, bad speed or date). */
export function parseScene(spec: string): Scene | null {
  const s = spec.trim();
  if (isNamed(s)) return { kind: 'named', name: s };
  const m = s.match(/^(go|fly|sky-from|date):([^?\s]+)(?:\?(\S*))?$/);
  if (!m) return null;
  const [, kind, arg, query] = m;
  if (kind === 'date') {
    const d = query === undefined ? arg.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
    if (!d) return null;
    const [y, mo, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
    if (mo < 1 || mo > 12 || day < 1 || day > daysInMonth(y, mo)) return null;
    return { kind: 'date', date: arg, ms: msFromCivil(y, mo, day) };
  }
  if (!isTarget(arg)) return null;
  if (kind === 'fly') {
    if (query === undefined) return { kind: 'fly', target: arg, beta: null };
    const b = query.match(/^beta=(\d*\.?\d+)$/);
    const beta = b ? Number(b[1]) : NaN;
    return beta > 0 && beta < 1 ? { kind: 'fly', target: arg, beta } : null;
  }
  if (query !== undefined) return null;
  return kind === 'go' ? { kind: 'go', target: arg } : { kind: 'sky-from', target: arg };
}

/** The canonical spec of a scene ("fly:saturn?beta=0.9"). */
export function specOf(s: Scene): string {
  switch (s.kind) {
    case 'named':
      return s.name;
    case 'date':
      return `date:${s.date}`;
    case 'fly':
      return s.beta === null ? `fly:${s.target}` : `fly:${s.target}?beta=${s.beta}`;
    default:
      return `${s.kind}:${s.target}`;
  }
}

// ─── Named scenes ───────────────────────────────────────────────────────────────────────

/** A flight: where to, how, and at what cruise speed. */
export interface Flight {
  dest: BodyId;
  drive: Drive;
  /** Cruise speed as a fraction of c (ignored by the rocket drive). */
  beta: number;
  /** Show the classical sky beside the relativistic one. */
  split?: boolean;
}

export interface SceneDef {
  label: string;
  /** What to look for, shown while the scene runs (the caller may pass its own). */
  note?: string;
  /** A scene that is a flight from Earth, for predictions. */
  flight?: Flight;
  /** Why the scene cannot run right now, or null. */
  unavailable?: () => string | null;
  /** Set the scene up; false when it could not start. */
  run: (note: string) => boolean;
}

const NAMED = new Map<NamedSceneId, SceneDef>();

/** What each named scene is, for its button before its definition is in (every one is below). */
const PENDING_LABELS: Record<NamedSceneId, string> = {
  'race-sunlight': 'Race sunlight to Earth',
  'year-in-30s': 'A year in half a minute',
  'moon-month': 'Watch the Moon go round',
  'split-0.999c': 'The sky at 0.999c, split screen',
  'light-time-correction': 'Light-time correction',
  'mars-opposition': 'The next opposition of Mars',
  'jupiter-moons': 'Jupiter’s moons',
  'galactic-centre-orbits': 'Stars orbiting the centre of the Galaxy',
  'milky-way-outside': 'The Milky Way from outside',
  'local-group': 'The Local Group',
  'cosmic-web': 'The cosmic web',
  'cmb-map': 'The cosmic microwave background',
  'cmb-glow': 'The Big Bang’s glow, seen at speed',
  'edge-of-reach': 'The edge of reach',
  'voyager2-neptune': 'Ride Voyager 2 past Neptune',
  'halley-2061': 'Halley comes back',
  'trappist-1-worlds': 'Seven worlds of TRAPPIST-1',
};

/** Define (or replace) a named scene. */
export function defineScene(name: NamedSceneId, def: SceneDef): void {
  NAMED.set(name, def);
}

// ─── Status ─────────────────────────────────────────────────────────────────────────────

export interface SceneStatus {
  ok: boolean;
  /** Why not, when not ok. */
  reason?: string;
  /** What the scene is, in a few words ("Fly to Saturn at 0.9c"). */
  label: string;
}

/**
 * What a spec says when what it needs is not in the app and its data are not on the way: never
 * for the articles' targets and scenes in the app, whose loaders all start with the page
 * (main.tsx), so they are loading, loaded or failed.
 */
export const LATER = 'Not in Lightspeed yet';
const LOADING = 'Loading the Solar System data…';
const LOADING_STARS = 'Loading the star catalogue…';
/** What a spec says when its data did not load. */
const failedText = (what: string) => `${what} did not load: reload the page to try again`;

/** The targets that are stars (and star systems): they resolve once the star catalogue is in (sim/stars). */
const STAR_TARGETS: ReadonlySet<string> = new Set([
  'alpha-centauri-a',
  'alpha-centauri-b',
  'barnards-star',
  'sirius',
  'vega',
  'betelgeuse',
  'rigel',
  'polaris',
  '61-cygni',
  'trappist-1',
  'tau-ceti',
  'epsilon-eridani',
  'wolf-359',
  'altair',
  'aldebaran',
  'antares',
  'deneb',
  'arcturus',
  'hr-8799',
  '51-pegasi',
]);
/**
 * Hosts of the featured exoplanet systems that the star catalogue lacks, and a planet the scenes
 * use: they arrive with the planets (sim/exoplanets).
 */
const EXOPLANET_TARGETS: ReadonlySet<string> = new Set(['kepler-90', 'toi-700', 'kepler-16', 'trappist-1-h']);
const LOADING_EXOPLANETS = 'Loading the planetary systems…';
/**
 * The Milky Way's bodies: the star clusters resolve once its data are in; the Galaxy itself, Sgr A*
 * and the S-stars are registered as that load starts (sim/galaxy).
 */
const CLUSTER_TARGETS: ReadonlySet<string> = new Set(['pleiades', 'hyades', 'omega-centauri', '47-tucanae', 'milky-way', 'sgr-a-star', 's2']);
/** The nebulae: their file is a chunk of its own, in soon after start-up (sim/galaxy). */
const NEBULA_TARGETS: ReadonlySet<string> = new Set(['orion-nebula', 'crab-nebula', 'eagle-nebula', 'ring-nebula', 'helix-nebula', 'carina-nebula']);
const LOADING_GALAXY = 'Loading the Milky Way…';
/** The galaxies beyond the Milky Way and the Local Group: they resolve once the Local Group's file is in (sim/cosmos). */
const GALAXY_TARGETS: ReadonlySet<string> = new Set([
  'local-group',
  'andromeda',
  'triangulum',
  'lmc',
  'smc',
  'm81',
  'm87',
  'centaurus-a',
  'sombrero',
  'whirlpool',
  'virgo-cluster',
  'coma-cluster',
  'bullet-cluster',
  'gn-z11',
  'jades-gs-z14-0',
  'mom-z14',
]);
const LOADING_GALAXIES = 'Loading the galaxies…';
const BUSY = 'A flight is under way: finish it or abort it first';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Where a target's data come from: how far their loading has got, and what to say meanwhile. */
interface DataSource {
  has: (id: string) => boolean;
  status: () => LoadStatus;
  loading: string;
  failed: string;
}

/** The files the targets come from, the Solar System's last (it takes every other target). */
const SOURCES: DataSource[] = [
  { has: (id) => STAR_TARGETS.has(id), status: starStatus, loading: LOADING_STARS, failed: failedText('The star catalogue') },
  { has: (id) => EXOPLANET_TARGETS.has(id), status: featuredStatus, loading: LOADING_EXOPLANETS, failed: failedText('The planetary systems') },
  { has: (id) => CLUSTER_TARGETS.has(id), status: galaxyStatus, loading: LOADING_GALAXY, failed: failedText('The Milky Way’s data') },
  { has: (id) => NEBULA_TARGETS.has(id), status: nebulaStatus, loading: LOADING_GALAXY, failed: failedText('The nebulae') },
  { has: (id) => GALAXY_TARGETS.has(id), status: cosmosStatus, loading: LOADING_GALAXIES, failed: failedText('The galaxies') },
  { has: () => true, status: solarSystemStatus, loading: LOADING, failed: failedText('The Solar System data') },
];

/**
 * Why a body the app should have is not registered: its data are loading or did not load. LATER
 * when neither (its loader was never asked, as in tests).
 */
function missingReason(id: string): string {
  const src = SOURCES.find((s) => s.has(id))!;
  const status = src.status();
  return status === 'loading' ? src.loading : status === 'failed' ? src.failed : LATER;
}

/** Why a scene that needs these bodies cannot run yet, or null when they are all in. */
const needs =
  (...ids: string[]) =>
  (): string | null => {
    const missing = ids.find((id) => !isBody(id));
    return missing === undefined ? null : missingReason(missing);
  };

function labelOf(s: Scene): string {
  switch (s.kind) {
    case 'named':
      return NAMED.get(s.name)?.label ?? PENDING_LABELS[s.name];
    case 'date':
      return `Go to ${formatIsoDate(s.date)}`;
    case 'go':
      return `Go to ${theName(targetName(s.target))}`;
    case 'sky-from':
      return `The sky from ${theName(targetName(s.target))}`;
    case 'fly':
      return `Fly to ${theName(targetName(s.target))} ${s.beta === null ? 'at 1 g' : `at ${s.beta}c`}`;
  }
}

/** A body that does not exist at the date shown (Voyager 1 before 1977) cannot be visited. */
const absent = (ref: TargetRef) => !sim.bodies[ref.id]?.present;

/** A flight as it would leave Earth now (null: out of reach). */
export function predictFlight(f: Flight): TripPlan | null {
  return planTrip(f.dest, f.beta, sim.bodies.earth.pos.clone(), sim.astroTime, f.drive);
}

function flightTo(ref: TargetRef, beta: number | null): Flight {
  return beta === null ? { dest: ref.id, drive: 'rocket', beta: 0 } : { dest: ref.id, drive: 'cruise', beta };
}

function flightBlocker(f: Flight, name: string): string | null {
  if (f.dest === 'earth') return 'Flights leave from Earth';
  if (!sim.bodies[f.dest]?.present) return `${name} is not there at the date shown`;
  const r = planFlight(f.dest, f.beta, sim.bodies.earth.pos.clone(), sim.astroTime, f.drive);
  if (r.ok) return null;
  // The planner's reason in a few words ("beyond the cosmic event horizon").
  const why = r.refusal ? refusalText(r.refusal, name).title : '';
  return why ? `${name} cannot be reached from Earth: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : `${name} is out of reach from Earth today`;
}

function blocker(s: Scene): string | null {
  // What is not in the app yet comes first: that answer does not depend on the moment.
  const def = s.kind === 'named' ? NAMED.get(s.name) : undefined;
  const ref = s.kind === 'go' || s.kind === 'fly' || s.kind === 'sky-from' ? resolveTarget(s.target) : null;
  if (s.kind === 'named' && !def) return LATER;
  // A target whose data are still on their way, or did not load.
  if (s.kind !== 'named' && s.kind !== 'date' && !ref) return isKnownTarget(s.target) ? missingReason(s.target) : LATER;
  if (useUI.getState().tripActive) return BUSY;
  switch (s.kind) {
    case 'named':
      return def?.unavailable?.() ?? null;
    case 'date':
      return null;
    case 'fly':
      return flightBlocker(flightTo(ref!, s.beta), ref!.name);
    default:
      return absent(ref!) ? `${ref!.name} is not there at the date shown` : null;
  }
}

/** Whether a spec can run now, why not, and what it is. */
export function sceneStatus(spec: string): SceneStatus {
  const s = parseScene(spec);
  if (!s) return { ok: false, reason: 'Not a scene Lightspeed knows', label: spec };
  const label = labelOf(s);
  const reason = blocker(s);
  return reason ? { ok: false, reason, label } : { ok: true, label };
}

// ─── Notes ──────────────────────────────────────────────────────────────────────────────

/** Notes written for particular flights (the journeys'); other flights get a generic one. */
const FLIGHT_NOTES: Record<string, string> = {
  'fly:saturn?beta=0.9':
    'The stars gather ahead of you and turn blue. Your clock runs at less than half the rate of the clock at home. Drag to look around; Astern shows the Sun reddened.',
  'fly:voyager1?beta=0.99':
    'Voyager 1 is almost a light-day from Earth. At 0.99c the trip takes about a day by Earth’s clocks and under four hours by yours. Look astern: the Sun has become a faint red star.',
  'fly:trappist-1':
    'TRAPPIST-1 is 40 light-years away. A steady push of one Earth gravity gets you there in about 7.3 years of your time while 42 years pass on Earth. Skip to arrival when you have seen enough.',
  'fly:proxima':
    'A steady push of one Earth gravity takes you to the nearest star in 3.5 years of your time while 5.9 years pass on Earth. Each second here is three weeks on board; Skip to arrival when you have seen enough.',
  'fly:sgr-a-star':
    'The black hole at the centre of the Galaxy is 8,277 parsecs (27,000 light-years) away. A steady push of one Earth gravity, turning round halfway to brake, gets you there in about 20 years of your time while about 27,000 years pass at home. Inside the Galaxy space is taken as static: no expansion to allow for.',
};

/** A name as a sentence uses it: "the Andromeda Galaxy", "the Sun", but "Proxima Centauri", "Bode’s Galaxy (M81)". */
export function theName(name: string): string {
  return /^(?:Sun|Moon|Milky Way|Pleiades|Hyades)$|^[^’']*\b(?:Galaxy|Cluster|Nebula|Cloud|Group|Telescope)$/.test(name) ? `the ${name}` : name;
}

/** The flight as planned from Earth now, or null (out of reach, or not plannable yet). */
function plannedFlight(f: Flight): TripPlan | null {
  try {
    return predictFlight(f);
  } catch {
    return null;
  }
}

/** What a flight through the expanding universe assumes (sim/travel.ts). */
const EXPANDING = ' The universe expands on the way: the flight is a model, with a perfect engine and galaxies carried along by the expansion.';

function flightNote(f: Flight, name: string): string {
  const plan = plannedFlight(f);
  const expanding = plan?.model === 'flrw' ? EXPANDING : '';
  if (f.drive === 'rocket') {
    const times = plan && plan.shipTime > 0 && plan.earthTime > 0 ? `: about ${formatDurationShort(plan.shipTime)} on board and ${formatDurationShort(plan.earthTime)} at home` : '';
    const turn = plan?.model === 'flrw' ? 'turning round a little after halfway' : 'turning round halfway';
    return `A rocket pushing at one Earth gravity, ${turn} to arrive at ${theName(name)} at rest${times}.${expanding} Watch your clock fall behind the one at home; Skip to arrival when you have seen enough.`;
  }
  const rate = Math.sqrt(1 - f.beta * f.beta);
  const pct = rate < 0.1 ? (rate * 100).toPrecision(2) : String(Math.round(rate * 100));
  const clock = pct === '100' ? 'at almost exactly the rate of Earth’s' : `at ${pct}% of the rate of Earth’s`;
  const sky = f.beta >= 0.5 ? ' The stars gather ahead of you and turn blue; drag to look around.' : '';
  return `A steady ${f.beta}c from Earth to ${theName(name)}. Your clock, τ, runs ${clock}, t.${expanding}${sky}`;
}

/** What to look for while a scene runs (null: none, as for go:). */
export function sceneNote(spec: string): string | null {
  const s = parseScene(spec);
  if (!s) return null;
  switch (s.kind) {
    case 'named':
      return NAMED.get(s.name)?.note ?? null;
    case 'go':
      return null;
    case 'date':
      return `The date is now ${formatIsoDate(s.date)}. Press N to come back to today.`;
    case 'sky-from': {
      const ref = resolveTarget(s.target);
      if (ref && isStar(ref.id)) return starSkyNote(ref);
      return `Beyond ${theName(targetName(s.target))}, looking back towards ${ref?.id === 'sun' ? 'Earth' : 'the Sun'}. Drag to look around.`;
    }
    case 'fly': {
      const ref = resolveTarget(s.target);
      return FLIGHT_NOTES[specOf(s)] ?? (ref ? flightNote(flightTo(ref, s.beta), ref.name) : null);
    }
  }
}

/** The flight a spec makes from Earth, if it is one (for predictions). */
export function flightOf(spec: string): Flight | null {
  const s = parseScene(spec);
  if (s?.kind === 'named') return NAMED.get(s.name)?.flight ?? null;
  if (s?.kind !== 'fly') return null;
  const ref = resolveTarget(s.target);
  return ref ? flightTo(ref, s.beta) : null;
}

// ─── Running ────────────────────────────────────────────────────────────────────────────

/** Leave orbit and free flight behind; false when a trip is under way. */
function ready(): boolean {
  const ui = useUI.getState();
  if (ui.tripActive) return false;
  if (ui.controlMode === 'free') controller.exitFreeFlight();
  return true;
}

/** The one scene step waiting for a slew to end (cancelled by the next scene). */
let pendingStep: (() => void) | null = null;

/** Drop a scene step still waiting for its slew. */
export function cancelSceneStep(): void {
  pendingStep?.();
  pendingStep = null;
}

/**
 * Run a scene's next step once the camera has finished the slew to `target` that the scene has
 * just started (at once if it is already there). If the visitor moves the camera first, the
 * step is dropped: time must not jump to a million times faster over Mars because a Sun scene
 * was left mid-slew. Only one step waits at a time, so starting a scene again does not run it
 * twice.
 */
export function afterSlew(target: BodyId, fn: () => void): void {
  cancelSceneStep();
  const move = controller.moves;
  const settled = (s: { controlMode: string; focus: BodyId }) =>
    s.controlMode === 'orbit' && s.focus === target && controller.moves === move;
  const now = useUI.getState();
  if (now.controlMode !== 'transition') {
    if (settled(now)) fn();
    return;
  }
  const unsub = useUI.subscribe((s) => {
    if (s.controlMode === 'transition') return;
    cancelSceneStep();
    if (settled(s)) fn();
  });
  pendingStep = unsub;
}

const ABOVE = new Vector3(0.18, 1, 0.32);
const UP = new Vector3(0, 1, 0);

function fly(f: Flight, note: string): boolean {
  if (!ready()) return false;
  // Flights leave from Earth: put the camera there now (a flight departs from the camera).
  controller.placeAt('earth', 26_000);
  controller.update(0, 0);
  // The trip paces itself by ship time (about a minute); only the pause needs lifting.
  if (!startTrip(f.dest, f.beta, f.drive)) return false;
  setPaused(false);
  useUI.setState((s) => ({ journeyNote: note, journeysOpen: false, relMode: f.split ? 'split' : s.relMode === 'off' ? 'on' : s.relMode }));
  return true;
}

function scene(note: string, setUp: () => void): boolean {
  if (!ready()) return false;
  useUI.setState({ journeyNote: note, journeysOpen: false, selected: null });
  setUp();
  return true;
}

function go(ref: TargetRef): boolean {
  if (!ready()) return false;
  useUI.setState({ journeyNote: null, journeysOpen: false });
  // A star with known planets: the whole planetary system, orbits and names shown.
  if (hasPlanets(ref.id)) {
    useUI.setState({ showOrbits: true, showLabels: true });
    goToSystem(ref.id);
  } else if (hasCompanion(ref.id)) {
    // A star in a pair (Sirius A with Sirius B): far enough out to see both.
    useUI.setState({ showLabels: true });
    goToStarSystem(ref.id);
  } else goToBody(ref.id);
  return true;
}

/** A star with another star in its system (its parent a barycentre with more than one star). */
const hasCompanion = (id: BodyId): boolean => {
  const parent = getBody(id)?.kind === 'star' ? getBody(id)?.parent : undefined;
  return !!parent && getBody(parent)?.kind === 'barycentre' && childrenOf(parent).filter((c) => c.kind === 'star').length > 1;
};

/** A star (other than the Sun) with planets registered about it. */
const hasPlanets = (id: BodyId): boolean => id !== 'sun' && getBody(id)?.kind === 'star' && childrenOf(id).some((c) => c.kind === 'exoplanet');

/** A star other than the Sun: its sky is seen from beside it, looking back at the Sun. */
const isStar = (id: BodyId): boolean => id !== 'sun' && getBody(id)?.kind === 'star';

/** What the Sun looks like from a star: its distance and magnitude. */
function starSkyNote(ref: TargetRef): string {
  const d = sim.bodies[ref.id]?.pos.length() ?? 0;
  if (!(d > 0)) return `At ${ref.name}, looking back at the Sun. Drag to look around.`;
  const ly = d / LIGHT_YEAR_KM;
  const vSun = 4.81 + 5 * Math.log10(d / PARSEC_KM / 10);
  const lyText = ly < 100 ? ly.toFixed(ly < 10 ? 2 : 1) : Math.round(ly).toLocaleString('en-GB');
  const seen = vSun < 6 ? `the star in the middle, at magnitude ${vSun.toFixed(1)}` : `too faint to see without a telescope (magnitude ${vSun.toFixed(1)}), in the middle of the view`;
  return `At ${ref.name}, ${lyText} light-years out, looking back: the Sun is ${seen}. The constellations are those seen from here. Drag to look around.`;
}

/**
 * The sky from a star: the camera beside it, on the side facing the Sun (the star just behind
 * you, out of the view), looking back at the Sun. The constellation figures show there by
 * themselves ('auto' draws them beyond 0.2 pc, and every star is farther than that); the scene
 * leaves the saved setting alone, so someone who turned them off keeps them off.
 */
function skyFromStar(ref: TargetRef, note: string): boolean {
  return scene(note, () => {
    const at = sim.bodies[ref.id]!.pos;
    const rec = getBody(ref.id)!;
    const beside = Math.max(100 * displayRadiusKm(rec), AU_KM);
    useUI.setState({ showLabels: true, selected: ref.id });
    controller.goTo('sun', { distance: Math.max(at.length() - beside, 0.5 * at.length()), direction: at.clone().normalize() });
  });
}

function skyFrom(ref: TargetRef, note: string): boolean {
  if (isStar(ref.id)) return skyFromStar(ref, note);
  return scene(note, () => {
    const at = sim.bodies[ref.id]!.pos;
    const home = ref.id === 'sun' ? sim.bodies.earth.pos : sim.bodies.sun.pos;
    // Beyond the body on the far side from home, raised a little, so home shows beside it.
    const dir = at.clone().sub(home);
    if (!(dir.lengthSq() > 0)) dir.copy(ABOVE);
    dir.normalize().addScaledVector(UP, 0.18).normalize();
    useUI.setState({ showLabels: true, selected: ref.id });
    controller.goTo(ref.id, { distance: framingDistance(ref.id) * 2.5, direction: dir });
  });
}

function jumpTo(ms: number, note: string): boolean {
  if (!ready() || !setEpoch(ms)) return false;
  updateEphemeris(); // so anything framed next sees the new date
  setWarp(1);
  setPaused(false);
  useUI.setState({ journeyNote: note, journeysOpen: false });
  return true;
}

/**
 * Set a scene up. `note` replaces the scene's own line on what to look for. False when it
 * cannot run (see sceneStatus for why).
 */
export function runScene(spec: string, opts: { note?: string } = {}): boolean {
  const s = parseScene(spec);
  if (!s || !sceneStatus(spec).ok) return false;
  // A new scene replaces anything the last one still had to do, and the views it turned on.
  cancelSceneStep();
  restoreSceneViews();
  // Scenes are written for the present at real time: each starts there (a date scene sets its own date,
  // and a scene that runs time faster sets its own pace), not at the date or the pace the last one left.
  if (s.kind !== 'date') backToPresent();
  // A scene takes over the view: nothing modal stays over it.
  useUI.setState({ welcomeOpen: false, tourStep: null, keysOpen: false, searchOpen: false });
  const note = opts.note ?? sceneNote(spec) ?? '';
  const before = currentViews();
  try {
    return start(s, note);
  } finally {
    recordSceneViews(before);
  }
}

/** The present at real time, unless the clock is already there (or a flight is under way, when time cannot jump). */
function backToPresent(): void {
  if (useUI.getState().tripActive) return;
  if (!sim.live || sim.paused || sim.warp !== 1) {
    resetToNow();
    updateEphemeris(); // so the scene frames what is there now, and its note is worded for now
  }
}

function start(s: Scene, note: string): boolean {
  switch (s.kind) {
    case 'named':
      return NAMED.get(s.name)!.run(note);
    case 'date':
      return jumpTo(s.ms, note);
    case 'go':
      return go(resolveTarget(s.target)!);
    case 'sky-from':
      return skyFrom(resolveTarget(s.target)!, note);
    case 'fly':
      return fly(flightTo(resolveTarget(s.target)!, s.beta), note);
  }
}

/**
 * Views a scene may turn on for itself: the CMB map over the sky, light-time correction, the
 * relativistic view (split, or with its Doppler colours), the cosmic web. What one scene turned
 * on, the next scene turns back (unless the visitor has changed it since), so the CMB map does
 * not stay over Jupiter after the CMB scene.
 */
const SCENE_VIEWS = ['showCmb', 'retarded', 'relMode', 'relDoppler', 'cosmicWeb'] as const;
type SceneView = (typeof SCENE_VIEWS)[number];
type SceneViews = Partial<Pick<UIState, SceneView>>;

/** What the last scene changed: each view as it was before, and as the scene left it. */
let sceneViews: { was: SceneViews; set: SceneViews } = { was: {}, set: {} };

function currentViews(): Pick<UIState, SceneView> {
  const s = useUI.getState();
  return { showCmb: s.showCmb, retarded: s.retarded, relMode: s.relMode, relDoppler: s.relDoppler, cosmicWeb: s.cosmicWeb };
}

/** Turn back what the last scene turned on, where the visitor has not changed it since. */
function restoreSceneViews(): void {
  const now = currentViews();
  const back: SceneViews = {};
  for (const k of SCENE_VIEWS) if (k in sceneViews.set && now[k] === sceneViews.set[k]) Object.assign(back, { [k]: sceneViews.was[k] });
  sceneViews = { was: {}, set: {} };
  if (Object.keys(back).length) useUI.setState(back);
}

/** Note the views a scene has just changed, to turn them back when the next scene starts. */
function recordSceneViews(before: Pick<UIState, SceneView>): void {
  const after = currentViews();
  for (const k of SCENE_VIEWS)
    if (after[k] !== before[k]) {
      Object.assign(sceneViews.was, { [k]: before[k] });
      Object.assign(sceneViews.set, { [k]: after[k] });
    }
}

// ─── The scenes built today ─────────────────────────────────────────────────────────────

defineScene('race-sunlight', {
  label: 'Race sunlight to Earth',
  // Worded for the date: Earth's distance from the Sun changes the time by 17 seconds over the year.
  get note() {
    const s = (id: BodyId) => (sim.bodies[id]?.present ? sim.bodies[id].pos.distanceTo(sim.bodies.sun.pos) / C_KM_S : NaN);
    const earth = Math.round(s('earth'));
    const jupiter = Math.round(s('jupiter') / 60);
    const toEarth = Number.isFinite(earth) ? `${Math.floor(earth / 60)} minutes ${earth % 60} seconds today (8 minutes 19 seconds on average over the year)` : 'about 8 minutes 19 seconds';
    return `The growing ring is a pulse of light leaving the Sun. It reaches Earth after ${toEarth}, Mars a few minutes later and Jupiter after ${Number.isFinite(jupiter) ? jupiter : 'about 43'} minutes.`;
  },
  run: (note) =>
    scene(note, () => {
      setWarp(1);
      setPaused(false);
      controller.goTo('sun', { distance: 13 * AU_KM, direction: ABOVE });
      afterSlew('sun', () => {
        emitLightPulse('sun');
        setWarp(100);
      });
    }),
});

defineScene('year-in-30s', {
  label: 'A year in half a minute',
  note: 'The inner planets from above. Mercury laps the Sun every 88 days, speeding up near the Sun, and Earth once in the 31 seconds a year takes here; Mars gets about half way round. Bodies are drawn enlarged (T for true size). Press Space to pause; N comes back to today.',
  run: (note) =>
    scene(note, () => {
      useUI.setState({ sizeMode: 'visible', showOrbits: true, showLabels: true });
      setWarp(1);
      setPaused(false);
      // Close enough that Mercury's orbit is plain to see, wide enough for Mars's (1.67 au at most).
      controller.goTo('sun', { distance: 6 * AU_KM, direction: new Vector3(0.05, 1, 0.12) });
      afterSlew('sun', () => setWarp(1_000_000));
    }),
});

defineScene('moon-month', {
  label: 'Watch the Moon go round',
  note: 'A month passes in 25 seconds. The Moon keeps the same face towards Earth as it goes. Bodies are drawn enlarged (T for true size); the Moon is 1.3 light-seconds away.',
  run: (note) =>
    scene(note, () => {
      useUI.setState({ sizeMode: 'visible', showOrbits: true, showLabels: true });
      setWarp(1);
      setPaused(false);
      controller.goTo('earth', { distance: 1.3e6, direction: ABOVE });
      afterSlew('earth', () => setWarp(100_000));
    }),
});

const SPLIT_FLIGHT: Flight = { dest: 'neptune', drive: 'cruise', beta: 0.999, split: true };
defineScene('split-0.999c', {
  label: 'The sky at 0.999c, split screen',
  note: 'Left of the divider is the sky as it really lies; right of it is what you see at 0.999c: the whole sky squeezed into a cone ahead of you. Drag the divider.',
  flight: SPLIT_FLIGHT,
  unavailable: () => flightBlocker(SPLIT_FLIGHT, 'Neptune'),
  run: (note) => fly(SPLIT_FLIGHT, note),
});

defineScene('light-time-correction', {
  label: 'Light-time correction',
  note: 'Light-time correction is on: every body is drawn where it was when the light now reaching you left it. Jupiter is seen as it was 33 to 54 minutes ago, the Moon as it was 1.3 seconds ago.',
  run: (note) =>
    scene(note, () => {
      useUI.setState({ retarded: true, sizeMode: 'visible', showLabels: true, showOrbits: true, selected: 'jupiter' });
      // Just off Earth, with Jupiter showing past it: the light from there is the oldest in view.
      const e = sim.bodies.earth.pos;
      const dir = e.clone().sub(sim.bodies.jupiter.pos).normalize().addScaledVector(UP, 0.22).normalize();
      controller.goTo('earth', { distance: 60_000, direction: dir });
    }),
});

defineScene('mars-opposition', {
  label: 'The next opposition of Mars',
  // The scene words its own note with the date and distance it finds; this is for the button.
  note: 'The next opposition of Mars: Earth passes between Mars and the Sun, as it does every 26 months, and Mars is near its closest and brightest. How close depends on the opposition, from about 0.37 to 0.68 au, because Mars’s orbit is eccentric.',
  run: (fallbackNote) => {
    if (!ready()) return false;
    // The next opposition after the date shown (after today when that is outside the span
    // where astronomy-engine's planets are checked, 1700–2200).
    const YEARS_3 = 3 * 365.25 * 86_400_000;
    const from = sim.timeMs >= PRECISE_START_MS && sim.timeMs < PRECISE_END_MS - YEARS_3 ? sim.timeMs : Date.now();
    const ms = msFromAstroTime(SearchRelativeLongitude(Body.Mars, 0, astroTimeAt(from)));
    if (!setEpoch(ms)) return false;
    updateEphemeris();
    setWarp(1);
    setPaused(false);
    const e = sim.bodies.earth.pos;
    const toMars = sim.bodies.mars.pos.clone().sub(e);
    const d = toMars.length();
    const note =
      d > 0
        ? `Opposition of Mars, ${formatIsoDate(formatSimDate(ms, 'date'))}: Earth passes between Mars and the Sun. Mars is ${(d / AU_KM).toFixed(2)} au away, ${(d / C_KM_S / 60).toFixed(1)} light-minutes.`
        : fallbackNote;
    useUI.setState({ journeyNote: note, journeysOpen: false, sizeMode: 'visible', showLabels: true, showOrbits: true, selected: 'mars' });
    // Above Earth and a little behind it, so Mars shows beyond Earth in the same view.
    const dir = UP.clone().multiplyScalar(0.9).addScaledVector(toMars.normalize(), -0.45).normalize();
    controller.goTo('earth', { distance: Math.max(2.4 * d, 1e6), direction: dir });
    return true;
  },
});

defineScene('jupiter-moons', {
  label: 'Jupiter’s moons',
  note: 'Io, Europa, Ganymede and Callisto circle Jupiter, seen from above with time running 10,000 times faster than real: Io laps it every 15 seconds. Their orbits are fitted to JPL Horizons; the moons are drawn enlarged (T for true size). Press Space to pause; N comes back to today.',
  run: (note) =>
    scene(note, () => {
      useUI.setState({ sizeMode: 'visible', showOrbits: true, showLabels: true, selected: 'jupiter' });
      setWarp(1);
      setPaused(false);
      // Wide enough for Callisto's orbit, 1.9 million km out.
      controller.goTo('jupiter', { distance: 5e6, direction: ABOVE });
      afterSlew('jupiter', () => setWarp(10_000));
    }),
});

// ─── Scenes with the Solar System data (sim/solarSystem) ────────────────────────────────

/** Voyager 2's closest approach to Neptune: 1989-08-25 03:56:36 TDB (JPL Horizons), 03:55:40 UTC. */
const V2_NEPTUNE_MS = msFromCivil(1989, 8, 25, 3, 55, 40);
/** Its closest approach to Triton, about 39,800 km, five hours later (09:11 UTC). */
const V2_TRITON_MS = msFromCivil(1989, 8, 25, 9, 11);

defineScene('voyager2-neptune', {
  label: 'Ride Voyager 2 past Neptune',
  note: 'Voyager 2 skims 4,950 km above Neptune’s clouds, the closest pass of its whole journey, then crosses Triton’s orbit about five hours later. Here a second is five minutes, so the flyby plays in about a minute. Its path is JPL’s mission-design trajectory for the flyby.',
  unavailable: needs('voyager2', 'triton'),
  run: (note) => {
    if (!ready() || !setEpoch(V2_NEPTUNE_MS - 20 * 60_000)) return false;
    updateEphemeris();
    if (!sim.bodies.voyager2?.present) return false;
    setWarp(1);
    setPaused(true);
    useUI.setState({ journeyNote: note, journeysOpen: false, sizeMode: 'true', showLabels: true, showOrbits: true, selected: 'voyager2' });
    // Just behind the craft, looking half-way between where Neptune is at closest approach and
    // where Triton is at its own, five hours later (44° apart): both pass through the view.
    const ca = astroTimeAt(V2_NEPTUNE_MS);
    const tca = astroTimeAt(V2_TRITON_MS);
    const toNeptune = bodyPositionAt('neptune', ca).sub(bodyPositionAt('voyager2', ca)).normalize();
    const toTriton = bodyPositionAt('triton', tca).sub(bodyPositionAt('voyager2', tca)).normalize();
    const dir = toNeptune.add(toTriton).negate().normalize();
    controller.goTo('voyager2', { distance: 0.06, direction: dir });
    afterSlew('voyager2', () => {
      setWarp(300);
      setPaused(false);
    });
    return true;
  },
});

/** Halley's perihelion: 2061-07-28 17:17 TDB (JPL Horizons, solution JPL#75). */
const HALLEY_2061_MS = msFromCivil(2061, 7, 28, 17, 16);

defineScene('halley-2061', {
  label: 'Halley comes back',
  note: 'Halley’s Comet rounds the Sun on 28 July 2061, 0.59 au out. Its dust tail curves back along its orbit; the fainter blue ion tail points straight down the solar wind. The tails come from a simple physical model; a day passes in under 9 seconds.',
  unavailable: needs('halley'),
  run: (note) => {
    if (!ready() || !setEpoch(HALLEY_2061_MS - 6 * 86_400_000)) return false;
    updateEphemeris();
    const h = sim.bodies.halley;
    if (!h?.present) return false;
    setWarp(1);
    setPaused(true);
    useUI.setState({ journeyNote: note, journeysOpen: false, sizeMode: 'visible', showLabels: true, showOrbits: true, selected: 'halley' });
    // From above the orbit and a little sunward, so both tails are seen side on.
    const r = h.pos.clone().normalize();
    const n = r.clone().cross(h.vel).normalize();
    const dir = n.addScaledVector(r, -0.35).normalize();
    controller.goTo('halley', { distance: 8e7, direction: dir });
    afterSlew('halley', () => {
      setWarp(10_000);
      setPaused(false);
    });
    return true;
  },
});

// ─── The Milky Way (sim/galaxy) ─────────────────────────────────────────────────────────

/** A year of S2's orbit, in seconds of the view: its 16-year orbit in about half a minute. */
export const S2_ORBIT_WARP = Math.round((16.05 * 365.25 * 86_400) / 30);

defineScene('galactic-centre-orbits', {
  label: 'Stars orbiting the centre of the Galaxy',
  note: 'S2 whips round its 16-year orbit in about half a minute here, while S29, S38 and S55 cross at other angles. Every orbit shares one focus, the black hole Sgr A*, drawn as a black disc the size of its shadow (far too small to see from here). The orbits are GRAVITY’s (2022), turning slowly as general relativity says; other published orbits exist but are not licensed for reuse.',
  unavailable: needs('sgr-a-star', 's2'),
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showOrbits: true, showLabels: true, selected: 's2' });
      setWarp(1);
      setPaused(false);
      // Face-on to S2's orbit, tipped a little, far enough to see the whole ellipse.
      const s2 = sim.bodies.s2;
      const bh = sim.bodies['sgr-a-star'];
      const normal = s2.pos.clone().sub(bh.pos).cross(s2.vel.clone().sub(bh.vel));
      if (!(normal.lengthSq() > 0)) normal.copy(ABOVE);
      normal.normalize().addScaledVector(UP, 0.25).normalize();
      controller.goTo('sgr-a-star', { distance: 6000 * AU_KM, direction: normal });
      afterSlew('sgr-a-star', () => setWarp(S2_ORBIT_WARP));
    }),
});

defineScene('milky-way-outside', {
  label: 'The Milky Way from outside',
  note: `The Milky Way from 100,000 light-years out, above its disc, with the Sun marked about halfway from the centre to the edge. Seen from here it turns clockwise, far too slowly to notice: the Sun takes over 200 million years to go round. ${MILKY_WAY_MODEL_LABEL}`,
  // The Galaxy is a body as soon as its data start loading; the scene needs its particle model too.
  unavailable: () => needs('milky-way')() ?? (galaxyStatus() === 'loading' || galaxyStatus() === 'failed' ? missingReason('milky-way') : null),
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true });
      frameMilkyWay();
    }),
});

// ─── Planets of other stars (sim/exoplanets) ────────────────────────────────────────────

const TRAPPIST_FLIGHT: Flight = { dest: 'trappist-1', drive: 'rocket', beta: 0 };

/** What to look for once the ship has arrived at TRAPPIST-1. */
export const SEVEN_WORLDS_NOTE =
  'The seven planets of TRAPPIST-1, seen from above their orbits with time running 20,000 times faster than real: b laps the star every 6.5 seconds, h every 81. All seven would fit inside Mercury’s orbit. They are drawn at true size, so they are points; the colours are illustrative.';

/**
 * The view over a planetary system: from above the orbits (the normal of `planet`'s orbit),
 * tilted a little towards the Sun, at the distance that frames the outermost orbit.
 */
function frameSystem(host: BodyId, planet: BodyId): { distance: number; direction: Vector3 } {
  const h = sim.bodies[host].pos;
  const p = sim.bodies[planet];
  const normal = p.pos.clone().sub(h).cross(p.vel.clone().sub(sim.bodies[host].vel));
  if (!(normal.lengthSq() > 0)) normal.copy(ABOVE);
  normal.normalize();
  const toSun = h.clone().negate().normalize();
  return { distance: systemFramingDistance(host), direction: normal.multiplyScalar(0.85).addScaledVector(toSun, 0.5).normalize() };
}

defineScene('trappist-1-worlds', {
  label: 'Seven worlds of TRAPPIST-1',
  note: FLIGHT_NOTES['fly:trappist-1'],
  flight: TRAPPIST_FLIGHT,
  unavailable: () => needs('trappist-1', 'trappist-1-h')() ?? flightBlocker(TRAPPIST_FLIGHT, 'TRAPPIST-1'),
  run: (note) => {
    if (!fly(TRAPPIST_FLIGHT, note)) return false;
    afterArrival(() => {
      if (!isBody('trappist-1-h')) return;
      useUI.setState({ journeyNote: SEVEN_WORLDS_NOTE, showOrbits: true, showLabels: true, selected: 'trappist-1-e' });
      setWarp(1);
      setPaused(false);
      controller.goTo('trappist-1', frameSystem('trappist-1', 'trappist-1-h'));
      afterSlew('trappist-1', () => setWarp(20_000));
    });
    return true;
  },
});

// ─── Beyond the Milky Way (sim/cosmos) ──────────────────────────────────────────────────

/** Why a scene beyond the Milky Way cannot run yet. */
const galaxiesUnavailable = needs('local-group');

defineScene('local-group', {
  label: 'The Local Group',
  note: 'The Local Group from 3 million parsecs (10 million light-years) out: the Milky Way, Andromeda and Triangulum with more than a hundred smaller galaxies, held together by gravity. From this far the big galaxies are faint smudges and most dwarfs are too faint to see at all; the Bodies list names them all. Their shapes are models built from their measured sizes, tilts and brightness.',
  unavailable: galaxiesUnavailable,
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true });
      frameLocalGroup();
    }),
});

defineScene('cosmic-web', {
  label: 'The cosmic web',
  note: 'The galaxies around us to about 500 million parsecs (1.6 billion light-years), as points: the 55,877 with measured distances in Cosmicflows-4 (the nearest are drawn as galaxies of their own), turning slowly, 200 million parsecs out from the Local Group. They gather in walls and filaments round empty voids. Orange points are elliptical galaxies, blue ones spirals. The survey covers the northern galactic sky best and misses what lies behind the Milky Way’s disc, so emptiness there is not all real.',
  unavailable: galaxiesUnavailable,
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true });
      frameCosmicWeb();
    }),
});

defineScene('cmb-map', {
  label: 'The cosmic microwave background',
  note: 'The oldest light in the universe, released about 370,000 years after the Big Bang, mapped by WMAP over the whole sky. Blue is colder and red warmer than the average of 2.7255 K, by up to 250 millionths of a kelvin, about 1 part in 11,000: the contrast is enhanced about 10,000 times, and the sky turns slowly so all of it goes by. The View menu turns the map off.',
  unavailable: galaxiesUnavailable,
  run: (note) =>
    scene(note, () => {
      showCmbMap();
    }),
});

// ─── Flights through the expanding universe (sim/travelCosmic.ts) ───────────────────────

/** The flight of 'cmb-glow': 1 g to the Virgo cluster, looking ahead. */
const GLOW_FLIGHT: Flight = { dest: 'virgo-cluster', drive: 'rocket', beta: 0 };

defineScene('cmb-glow', {
  label: 'The Big Bang’s glow, seen at speed',
  get note() {
    const plan = plannedFlight(GLOW_FLIGHT);
    const times = plan ? ` About ${formatDurationShort(plan.shipTime)} on board and ${formatDurationShort(plan.earthTime)} at home.` : '';
    return `Look ahead, just above this panel. The cosmic microwave background, 2.7 K and invisible at rest, is Doppler shifted by your motion to T′ = T × D ahead, with D = γ(1 + β) ≈ 2γ: past γ ≈ 500, some seven years in, it glows red, then white, then blue-white, and by the flip it is over a hundred million kelvin (the view stops down so you can still look).${times}${EXPANDING}`;
  },
  flight: GLOW_FLIGHT,
  unavailable: () => needs('virgo-cluster')() ?? flightBlocker(GLOW_FLIGHT, 'Virgo Cluster'),
  run: (note) => {
    if (!fly(GLOW_FLIGHT, note)) return false;
    // The glow is Doppler shift: keep it on. Face the way the ship is going, tipped down a little so the
    // glow straight ahead shows above the flight panel.
    useUI.setState((s) => ({ relDoppler: true, relMode: s.relMode === 'off' ? 'on' : s.relMode }));
    controller.setTravelLook(0, -0.22);
    return true;
  },
});

defineScene('edge-of-reach', {
  label: 'The edge of reach',
  note: 'JADES-GS-z14-0 is one of the most distant galaxies known, seen as it was about 290 million years after the Big Bang. The flight planner has tried a 1 g flight there from Earth and refused it: the galaxy lies beyond the cosmic event horizon, about 16.6 billion light-years away. The expansion of the universe is speeding up, so light sent from here today will never reach it, and nothing can outrun light. Anything closer than the horizon can still be reached at 1 g in under 75 years aboard, though billions of years pass at home.',
  unavailable: needs('jades-gs-z14-0'),
  run: (note) =>
    scene(note, () => {
      // From home: flights leave from the camera.
      controller.placeAt('earth', 26_000);
      controller.update(0, 0);
      planOneG('jades-gs-z14-0');
    }),
});
