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
 * Targets are the ids in KNOWN_TARGETS; resolveTarget turns one into something the camera and
 * the planner can use. Today that is the bodies in physics/constants.ts; later updates add
 * resolvers (moons, stars, galaxies) and define the named scenes not built yet. Until then a
 * spec that needs them reports "Coming in a later update" and its button is disabled.
 */
import { SearchRelativeLongitude, Body } from 'astronomy-engine';
import { Vector3 } from 'three';
import { AU_KM, BODIES, C_KM_S, type BodyId } from '../physics/constants';
import { controller } from '../controls/cameraController';
import { framingDistance } from '../controls/framing';
import { setEpoch, setPaused, setWarp } from '../sim/clock';
import { updateEphemeris } from '../sim/ephemeris';
import { PRECISE_END_MS, PRECISE_START_MS } from '../sim/ephemerisPolicy';
import { sim } from '../sim/sim';
import { planTrip, type Drive, type TripPlan } from '../sim/travel';
import { astroTimeAt, daysInMonth, formatSimDate, msFromAstroTime, msFromCivil } from '../lib/time';
import { useUI } from '../state/ui';
import { emitLightPulse } from '../lab/logger';
import { goToBody } from '../ui/navigation';
import { startTrip } from '../ui/tripActions';
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
} as const;

export type TargetId = keyof typeof TARGET_NAMES;

/** Every target the articles use, in the order above (Solar System outwards). */
export const KNOWN_TARGETS = Object.keys(TARGET_NAMES) as TargetId[];

export const isKnownTarget = (id: string): id is TargetId => Object.hasOwn(TARGET_NAMES, id);

/** What a target resolves to: something the camera can orbit and the planner can fly to. */
export type TargetRef = { kind: 'body'; id: BodyId; name: string };

/** Turns a target id into a TargetRef, or null when it does not handle that id. */
export type TargetResolver = (id: string) => TargetRef | null;

/** Today's targets: the bodies in physics/constants.ts (their ids are the target ids). */
const bodyResolver: TargetResolver = (id) =>
  Object.hasOwn(BODIES, id) ? { kind: 'body', id: id as BodyId, name: BODIES[id as BodyId].name } : null;

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

/** Labels of the named scenes still to be built, so their buttons can say what they are. */
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
};

/** Define (or replace) a named scene. Later updates use this for the scenes not built yet. */
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

export const LATER = 'Coming in a later update';
const BUSY = 'A flight is under way: finish it or abort it first';

function labelOf(s: Scene): string {
  switch (s.kind) {
    case 'named':
      return NAMED.get(s.name)?.label ?? PENDING_LABELS[s.name];
    case 'date':
      return `Go to ${formatIsoDate(s.date)}`;
    case 'go':
      return `Go to ${targetName(s.target)}`;
    case 'sky-from':
      return `The sky from ${targetName(s.target)}`;
    case 'fly':
      return `Fly to ${targetName(s.target)} ${s.beta === null ? 'at 1 g' : `at ${s.beta}c`}`;
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
  return predictFlight(f) ? null : `${name} is out of reach from Earth today`;
}

function blocker(s: Scene): string | null {
  // What is not in the app yet comes first: that answer does not depend on the moment.
  const def = s.kind === 'named' ? NAMED.get(s.name) : undefined;
  const ref = s.kind === 'go' || s.kind === 'fly' || s.kind === 'sky-from' ? resolveTarget(s.target) : null;
  if (s.kind === 'named' ? !def : s.kind !== 'date' && !ref) return LATER;
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
  'fly:proxima':
    'A steady push of one Earth gravity takes you to the nearest star in 3.5 years of your time while 5.9 years pass on Earth. Each second here is three weeks on board; Skip to arrival when you have seen enough.',
};

function flightNote(f: Flight, name: string): string {
  if (f.drive === 'rocket')
    return `A rocket pushing at one Earth gravity, turning round halfway to arrive at ${name} at rest. Watch your clock fall behind the one at home; Skip to arrival when you have seen enough.`;
  const rate = Math.sqrt(1 - f.beta * f.beta);
  const pct = rate < 0.1 ? (rate * 100).toPrecision(2) : String(Math.round(rate * 100));
  const clock = pct === '100' ? 'at almost exactly the rate of Earth’s' : `at ${pct}% of the rate of Earth’s`;
  const sky = f.beta >= 0.5 ? ' The stars gather ahead of you and turn blue; drag to look around.' : '';
  return `A steady ${f.beta}c from Earth to ${name}. Your clock, τ, runs ${clock}, t.${sky}`;
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
      return `Beyond ${targetName(s.target)}, looking back towards ${ref?.id === 'sun' ? 'Earth' : 'the Sun'}. Drag to look around.`;
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
  goToBody(ref.id);
  return true;
}

function skyFrom(ref: TargetRef, note: string): boolean {
  return scene(note, () => {
    const at = sim.bodies[ref.id].pos;
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
  // A new scene replaces anything the last one still had to do.
  cancelSceneStep();
  // A scene takes over the view: nothing modal stays over it.
  useUI.setState({ welcomeOpen: false, tourStep: null, keysOpen: false, searchOpen: false });
  const note = opts.note ?? sceneNote(spec) ?? '';
  switch (s.kind) {
    case 'named':
      return NAMED.get(s.name)!.run(note);
    case 'date':
      return jumpTo(s.ms, note);
    case 'go':
      return go(resolveTarget(s.target)!);
    case 'sky-from':
      return skyFrom(resolveTarget(s.target)!, note);
    case 'fly': {
      const ref = resolveTarget(s.target)!;
      return fly(flightTo(ref, s.beta), note);
    }
  }
}

// ─── The scenes built today ─────────────────────────────────────────────────────────────

defineScene('race-sunlight', {
  label: 'Race sunlight to Earth',
  note: 'The growing ring is a pulse of light leaving the Sun. It reaches Earth after 8 minutes 19 seconds, Mars a few minutes later and Jupiter after 43 minutes.',
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
  note: 'Mercury laps the Sun every 88 days and Earth once in the 31 seconds a year takes here. Bodies are drawn enlarged (T for true size). Space pauses; N comes back to today.',
  run: (note) =>
    scene(note, () => {
      useUI.setState({ sizeMode: 'visible', showOrbits: true, showLabels: true });
      setWarp(1);
      setPaused(false);
      controller.goTo('sun', { distance: 30 * AU_KM, direction: new Vector3(0.05, 1, 0.12) });
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
  note: 'Jupiter from above, with time running 10,000 times faster than real: a day passes in under 9 seconds. Space pauses; N comes back to today.',
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
