/**
 * Near a black hole, a readout along the bottom of the view (where the flight strip sits on a trip):
 * while hovering, how much slower your clock runs than home's, both clocks, the height above the
 * horizon, the thrust it takes to hover and the tides, with a gauge of the height and "Let go"; in free
 * flight, or at rest beside another body near the hole (orbiting S2), the same with the thrust the present
 * motion takes and no "Let go"; in a circular orbit and a snapshot at speed, their own numbers; in a fall,
 * your clock, home's, the radius and the time left, the pace, and "Stop the fall"; after a fall, a card
 * saying how it ended (a reset, not a journey), until the camera leaves that hole or a scene brings a note.
 *
 * How: every number comes from sim/gravity.ts (exact, float64) and physics/geodesics.ts, or from the
 * fall's closed forms (sim/fall.ts fallReadings); the shadow's size in a snapshot from sim/lensBodies.ts
 * holeView. Which face shows is holeStripFace's (a pure function of the state, tested): only while the time
 * warp is paced by the hole's gravity (within 5,000 r_s) or in one of its modes, never during a trip, and not
 * over an arrival card; it holds the journey's note (the journey banner hides meanwhile), which can be
 * dismissed, and keeps the picture credits clear. With a body card open on a screen too narrow for both
 * side by side, it moves to the left so the card stays readable.
 *
 * Why: near a hole the clocks, the thrust and the tides are the story, and they are exact; the labels
 * say what is a model (the engine holds the ship; home's clock in a fall is a convention).
 *
 * Cost: a re-render four to ten times a second while shown; while hidden, one call of holeStripFace on the
 * shared clock and no render.
 *
 * Twins: ui/flight/FlightStrip.tsx (Big, Cell, the same place on screen), ui/instruments/InstrumentsDock.tsx
 * (the Observer section reads holeNumbers), ui/deepSkyText.ts (the card's forms of the same numbers: height,
 * thrust, clock).
 */
import { useState, type ReactNode } from 'react';
import { G0_KM_S2 } from '../../physics/constants';
import { properAccelKmS2, tidalEndRadiusKm, tidalStretchMS2 } from '../../physics/geodesics';
import { bodyName, getBody, type BodyId } from '../../sim/bodies';
import { fixed, sci, sig } from '../../lib/sci';
import { formatClock } from '../../lib/format';
import { formatDurationShort } from '../../lib/time';
import { chrono } from '../../sim/chronometer';
import { gravity } from '../../sim/gravity';
import { canStepFallPace, dripPreview, endFall, fall, fallReadings, fallRealSecondsLeft, letGo, stepFallPace, type FallReadings } from '../../sim/fall';
import { holeView, type HoleView } from '../../sim/lensBodies';
import { lensProgramsReady } from '../../render/lens/lensState';
import { setPaused } from '../../sim/clock';
import { sim } from '../../sim/sim';
import { controller } from '../../controls/cameraController';
import { useUI, type ControlMode } from '../../state/ui';
import { CloseIcon } from '../kit';
import { Icon } from '../icons';
import { useSimValue, useTicker } from '../useTicker';
import { rich } from '../rich';
import { heightParts, heightText, thrustText } from '../deepSkyText';
import { keepCreditsClear } from '../viewport/PictureCredits';
import { arrivalCardShown, Big, stripPlace } from './FlightStrip';

/** How long the card after a fall stays, ms. */
export const END_CARD_MS = 60_000;
/** The tidal stretch across 2 m at which a fall ends and a ship is torn apart, m/s². */
const TIDES_TEAR_MS2 = 1000;
/** The height gauge runs from 10⁻⁶ r_s above the horizon (the floor) to 10⁴ r_s, logarithmically. */
const GAUGE_LO = -6;
const GAUGE_HI = 4;

// ─── The numbers ────────────────────────────────────────────────────────────────────────

/** What the HUD and the instruments show near the black hole the gravity state has selected. */
export interface HoleNumbers {
  hole: BodyId;
  /** r/r_s and the height above the horizon, km (exact). */
  rOverRs: number;
  heightKm: number;
  rsKm: number;
  /** How many times faster home's clock runs than yours, cosh φ_S/α (in a fall: dT/dτ), and that minus 1 without cancellation. */
  homePerYours: number;
  homePerYoursMinus1: number;
  /** dτ/dt, your clock against home's: α/cosh φ_S (in a fall: 1/(dT/dτ)). */
  clockRate: number;
  /** Speed past the observers hovering here (or the raindrop inside the horizon), c. */
  betaPast: number;
  /** The proper acceleration the present motion takes, in g (hovering: GM/(r²α)); null falling freely (a fall, or a circular orbit). */
  thrustG: number | null;
  /** Tidal stretch across 2 m, m/s², and whether it tears a ship apart (≥ 1,000 m/s²). */
  tidalMS2: number;
  tidesTearShip: boolean;
}

const numbers: HoleNumbers = {
  hole: '',
  rOverRs: 0,
  heightKm: 0,
  rsKm: 0,
  homePerYours: 1,
  homePerYoursMinus1: 0,
  clockRate: 1,
  betaPast: 0,
  thrustG: null,
  tidalMS2: 0,
  tidesTearShip: false,
};

/** The HUD's numbers from the gravity state (a reused object), or null with no hole selected. */
export function holeNumbers(): HoleNumbers | null {
  const g = gravity;
  if (!g.hole) return null;
  const n = numbers;
  n.hole = g.hole;
  n.rsKm = g.rsKm;
  n.rOverRs = g.rKm / g.rsKm;
  n.heightKm = g.heightKm;
  n.tidalMS2 = tidalStretchMS2(g.gmKm3S2, g.rKm, 2);
  n.tidesTearShip = n.tidalMS2 >= TIDES_TEAR_MS2;
  n.betaPast = Math.tanh(g.relPhi);
  const f = fall.trip;
  if (f && f.hole === g.hole) {
    const k = f.state.dTdTau;
    n.homePerYours = k;
    n.homePerYoursMinus1 = k - 1;
    n.clockRate = 1 / k;
    n.thrustG = null;
    return n;
  }
  // Home is at rest in S: your clock runs at α/cosh φ_S, φ_S your rapidity in S.
  const phi = Number.isFinite(sim.ship.phi) ? sim.ship.phi : 0;
  const a = g.alpha;
  const s = Math.sinh(phi / 2);
  n.homePerYours = Math.cosh(phi) / a;
  n.homePerYoursMinus1 = (2 * s * s + g.oneMinusAlpha) / a;
  n.clockRate = a / Math.cosh(phi);
  // A circular orbit is a geodesic: no thrust at all (the formula below would leave a rounding residue, 10⁻¹¹ g).
  if (useUI.getState().controlMode === 'circular') {
    n.thrustG = null;
    return n;
  }
  // The thrust: the proper acceleration of steady motion past the hovering observers (radial part outward).
  const r = g.camRelHoleKm;
  const rl = r.length();
  const d = g.relVelDir;
  const cr = rl > 0 ? (d.x * r.x + d.y * r.y + d.z * r.z) / rl : 0;
  const wr = n.betaPast * cr;
  const wt = n.betaPast * Math.sqrt(Math.max(0, 1 - cr * cr));
  n.thrustG = g.inside ? null : properAccelKmS2(g.gmKm3S2, g.rKm, wr, wt) / G0_KM_S2;
  return n;
}

/**
 * How many times faster home's clock runs than yours: "1.054×", "10.05×", "1.00 × 10⁴×"; within 1 % of 1 as the
 * card says it, the share by which yours is slower: "0.013 %" ((n − 1)/n, from n − 1 without cancellation).
 */
export function timesText(n: number, nMinus1: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (nMinus1 <= 0) return '1×';
  if (nMinus1 < 0.01) return `${sig((100 * nMinus1) / n, 2)} %`;
  if (n < 1e4) return `${sig(n, 4)}×`;
  return `${sci(n, 3)}×`;
}

/** Tides across 2 m: "1.1 × 10⁻⁶ m/s²". */
export function tidesText(ms2: number): string {
  return `${sig(ms2, 2, { sciBelow: -2, sciAbove: 4 })} m/s²`;
}

/** r/r_s to the digits that show how close to the horizon: "10.0", "1.01", "1 + 10⁻⁶". */
function rsText(rOverRs: number, heightKm: number, rsKm: number): string {
  const h = heightKm / rsKm;
  if (h < 1e-3) return `1 + ${sci(h, 2)}`;
  return sig(rOverRs, 4);
}

/** Whether a circular orbit's radius is the innermost stable one, 6 M (a scene's 5.999 999 999 999 999 included). */
export const isInnermostStable = (rM: number): boolean => Math.abs(rM - 6) < 1e-9;

// ─── Which face shows ───────────────────────────────────────────────────────────────────

/** The HUD's faces: a fall, the card after one, a circular orbit, a snapshot, hovering, and moving near the hole. */
export type HoleStripFace = 'falling' | 'end' | 'circular' | 'snapshot' | 'hovering' | 'free' | 'beside';

/** What decides the face (holeStripInputs reads it from the live state). */
export interface HoleStripInputs {
  /** A fall under way. */
  falling: boolean;
  /** A trip under way, or its arrival card showing. */
  flight: boolean;
  /** The black hole whose gravity is modelled now (gravity.hole), or null. */
  hole: BodyId | null;
  /** Whether the time warp is paced by it (within 5,000 r_s). */
  paced: boolean;
  mode: ControlMode;
  /** The body the camera is centred on. */
  focus: BodyId;
  /** The last fall: its hole and how many ms ago it ended; null if none. */
  lastEnd: { hole: BodyId; agoMs: number } | null;
  /** A journey's or scene's note is showing (a scene started after the fall brings one). */
  note: boolean;
}

/**
 * The face the HUD shows, or null. The card after a fall stays for a minute, but only near the hole it was in
 * and until a scene brings its own note (the fall clears the note as it ends: any note is newer). Hovering (with
 * "Let go") only while the camera is centred on the hole itself; centred on another body near it (S2) it is
 * moving with that body past the hovering observers.
 */
export function holeStripFace(s: HoleStripInputs): HoleStripFace | null {
  if (s.falling) return 'falling';
  if (s.flight || !s.hole) return null;
  if (s.mode === 'circular') return 'circular';
  if (s.mode === 'hold') return 'snapshot';
  if (s.lastEnd && s.lastEnd.hole === s.hole && s.lastEnd.agoMs < END_CARD_MS && !s.note) return 'end';
  // Hovering or under power (not while the camera slews through).
  if (!s.paced) return null;
  if (s.mode === 'free') return 'free';
  if (s.mode === 'orbit') return s.focus === s.hole ? 'hovering' : 'beside';
  return null;
}

/** The inputs from the live state. */
function holeStripInputs(): HoleStripInputs {
  const ui = useUI.getState();
  const e = fall.lastEnd;
  return {
    falling: !!fall.trip && ui.fallActive,
    flight: ui.tripActive || arrivalCardShown(),
    hole: gravity.hole || null,
    paced: gravity.paced,
    mode: ui.controlMode,
    focus: ui.focus,
    lastEnd: e ? { hole: e.hole, agoMs: performance.now() - e.at } : null,
    note: !!ui.journeyNote,
  };
}

/** The face showing now, or null. */
export const holeStripFaceNow = (): HoleStripFace | null => holeStripFace(holeStripInputs());

/** Whether the HUD is showing (the journey banner hides meanwhile). */
export const holeStripShown = (): boolean => holeStripFaceNow() !== null;

// ─── Pieces ─────────────────────────────────────────────────────────────────────────────

/** The model the engine is, for the strip's tooltip. */
const ENGINE_NOTE =
  'The engine holds the ship: near a black hole its motion is measured against observers hovering there; falling, against observers falling from rest far away. Only the black hole’s gravity is included.';

function Shell({ tone, title, right, children }: { tone: 'data' | 'hazard' | 'accent'; title: ReactNode; right?: ReactNode; children: ReactNode }) {
  const note = useUI((s) => s.journeyNote);
  const cardOpen = useUI((s) => s.bodyCard && !!s.selected);
  const c = tone === 'hazard' ? '!text-hazard' : tone === 'accent' ? '!text-accent' : '!text-data';
  return (
    <div
      ref={keepCreditsClear}
      className={`@container panel-float appear absolute bottom-3 z-20 w-[780px] max-w-[calc(100%-24px)] ${stripPlace(cardOpen, 780)} ${tone === 'hazard' ? '!border-hazard/50' : ''}`}
      title={ENGINE_NOTE}
    >
      {/* On a phone the controls wrap under the title, so Stop the fall stays on screen. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-1 pt-2">
        <span className={`cap ${c}`}>{title}</span>
        <span className="min-w-0 flex-1" />
        {right}
      </div>
      {note && (
        <div className="mt-0.5 flex items-start gap-2.5 border-y border-line bg-accent/[0.04] py-1.5 pl-3 pr-1.5">
          <span className="cap mt-[3px] shrink-0 !text-accent">Look for</span>
          {/* In a narrow strip (a phone, or beside a body card) the note scrolls in a fifth of the height. */}
          <span className="scroll min-w-0 flex-1 font-serif text-[12.5px] leading-snug text-fg-2 @max-[480px]:max-h-[22vh] @max-[480px]:overflow-y-auto">{note}</span>
          <button className="btn btn-q btn-sq btn-sm -mt-0.5 shrink-0" onClick={() => useUI.setState({ journeyNote: null })} aria-label="Dismiss the note" title="Dismiss the note">
            <CloseIcon />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

/** The four big numbers: in a row, or two by two in a narrow strip (by the strip's own width, the Shell's container). */
function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 @min-[480px]:grid-cols-4 [&>*+*]:border-l [&>*+*]:border-line @max-[480px]:[&>*:nth-child(3)]:border-l-0 @max-[480px]:[&>*:nth-child(n+3)]:border-t">
      {children}
    </div>
  );
}

function Lines({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-1.5 text-[11.5px] text-fg-2">{children}</div>;
}

/** The height above the horizon on a logarithmic gauge from the floor to 10⁴ r_s, with the photon sphere, the innermost stable orbit and (for small holes) where tides tear a ship apart. */
function HeightGauge({ heightRs, tearRs }: { heightRs: number; tearRs: number | null }) {
  const at = (h: number) => `${(100 * (Math.log10(Math.max(10 ** GAUGE_LO, Math.min(10 ** GAUGE_HI, h))) - GAUGE_LO)) / (GAUGE_HI - GAUGE_LO)}%`;
  // The two marks are close on ten decades: the first label ends at its tick, the second starts at its own.
  const ticks: { h: number; label: string; title: string; side: string }[] = [
    { h: 0.5, label: 'photon sphere', title: 'r = 1.5 r_s: light can circle the hole here', side: '-translate-x-full pr-1' },
    { h: 2, label: 'last stable orbit', title: 'r = 3 r_s: the innermost stable circular orbit', side: 'pl-1' },
  ];
  return (
    <div className="@container relative mx-3 mb-1 mt-1.5 h-7" aria-label="Height above the horizon, from the horizon to 10⁴ horizon radii" role="img">
      <div className="absolute inset-x-0 top-[6px] h-px bg-line-3" />
      {tearRs !== null && tearRs > 10 ** GAUGE_LO && <div className="absolute top-[4px] h-[5px] bg-hazard/60" style={{ left: 0, width: at(tearRs) }} title="Tides here would tear a ship apart" />}
      {ticks.map((t) => (
        <div key={t.label} className="absolute top-[2px]" style={{ left: at(t.h) }} title={t.title}>
          <div className="h-[9px] w-px bg-line-3" />
          <div className={`mono absolute top-[10px] whitespace-nowrap text-[9.5px] text-fg-3 ${t.side}`}>{t.label}</div>
        </div>
      ))}
      <div className="mono absolute left-0 top-[10px] text-[9.5px] text-fg-3">horizon</div>
      {/* Below 400 px of gauge (a phone, or beside a body card) the end's label would run into the last stable
          orbit's, 63 % along and about 100 px long: the gauge's own label says it. */}
      <div className="mono absolute right-0 top-[10px] text-[9.5px] text-fg-3 @max-[400px]:hidden">10⁴ r_s</div>
      <div className="absolute top-0" style={{ left: at(heightRs) }}>
        <div className="-ml-[4px] h-0 w-0 border-x-[4px] border-t-[6px] border-x-transparent border-t-accent" />
      </div>
    </div>
  );
}

/** "Let go", with one confirmation: a drip from rest here, through the horizon. */
function LetGo({ hole }: { hole: BodyId }) {
  const [asking, setAsking] = useState(false);
  const name = bodyName(hole);
  const rM = gravity.rM;
  const preview = dripPreview(hole, rM);
  if (!preview) return null;
  // As the fall's scene does (content/scenes.ts whenLensReady): no fall until the lens can draw the hole; the strip
  // redraws a few times a second, so the button comes on by itself once the programs have compiled.
  const ready = lensProgramsReady();
  if (!asking)
    return (
      <button
        className="btn btn-sm btn-hazard"
        onClick={() => setAsking(true)}
        disabled={!ready}
        title={ready ? 'Fall freely from rest here, through the horizon' : 'In a moment: the graphics card is still preparing the black hole'}
      >
        Let go
      </button>
    );
  const go = () => {
    setAsking(false);
    const dir = gravity.camRelHoleKm.clone();
    const r = letGo(hole, gravity.rM, gravity.heightKm, gravity.mKm, dir);
    if (r.ok && sim.paused) setPaused(false);
  };
  return (
    <span className="flex flex-wrap items-center gap-2" role="alertdialog" aria-label={`Fall into ${name}?`}>
      <span className="text-[12px] text-fg">
        Fall into {name}? {formatDurationShort(preview.tauHorizonS, 3)} by your clock to the horizon; the whole fall plays in about {Math.round(preview.realS)} s here. In reality there is no way back;
        here, Stop the fall puts you back where you are now.
      </span>
      <button className="btn btn-sm btn-hazard" onClick={go}>
        Let go
      </button>
      <button className="btn btn-sm" onClick={() => setAsking(false)}>
        Stay
      </button>
    </span>
  );
}

// ─── The states ─────────────────────────────────────────────────────────────────────────

/**
 * Hovering above the hole; flying under power near it; or centred on another body near it (orbiting S2), moving
 * with that body past the hovering observers. Only hovering offers "Let go" (a fall from rest here).
 */
function Hovering({ n, how }: { n: HoleNumbers; how: 'hovering' | 'free' | 'beside' }) {
  const name = bodyName(n.hole);
  const focus = useUI((s) => s.focus);
  const h = heightParts(n.heightKm);
  const heightRs = n.heightKm / n.rsKm;
  const rec = getBody(n.hole);
  const tearKm = tearRadiusKm();
  const tearRs = tearKm !== null ? tearKm / n.rsKm - 1 : null;
  const hovering = how === 'hovering';
  const canFall = hovering && rec?.blackHole?.fallAllowed !== false && !(tearRs !== null && tearRs > 0);
  const thrust = n.thrustG === null ? '—' : thrustText(n.thrustG);
  const title = how === 'free' ? `Free flight near ${name}` : how === 'beside' ? `At ${bodyName(focus)}, near ${name}` : `Hovering above ${name}`;
  return (
    <Shell tone="data" title={title} right={canFall ? <LetGo hole={n.hole} /> : undefined}>
      <Grid>
        <Big label="Your clock runs slower" value={timesText(n.homePerYours, n.homePerYoursMinus1)} sub={hovering ? 'than home’s: gravity' : 'than home’s: gravity, speed'} tone="data" />
        <Big label="Your clock" value={formatClock(chrono.tau)} sub="since zeroed" tone="data" />
        <Big label="At home" value={formatClock(chrono.t)} sub="far from every mass" tone="data" />
        <Big label="Height above the horizon" value={h.v} unit={h.u} sub={`r = ${rsText(n.rOverRs, n.heightKm, n.rsKm)} r_s`} />
      </Grid>
      <Lines>
        <span>
          {hovering ? 'Hovering here takes a thrust of ' : 'Your present motion takes a thrust of '}
          <b className="mono font-normal text-fg">{rich(thrust)}</b>
        </span>
        {!hovering && n.betaPast > 0 && (
          <span>
            Speed past hovering observers: <b className="mono font-normal text-fg">{rich(fixed(n.betaPast, n.betaPast < 0.01 ? 5 : 3))}c</b>
          </span>
        )}
        {n.tidesTearShip ? (
          <span className="text-hazard">Tides here would tear a ship apart ({rich(tidesText(n.tidalMS2))} across 2 m)</span>
        ) : (
          <span>
            Tides across 2 m: <b className="mono font-normal text-fg">{rich(tidesText(n.tidalMS2))}</b>
          </span>
        )}
      </Lines>
      <HeightGauge heightRs={heightRs} tearRs={tearRs} />
    </Shell>
  );
}

/** The radius (km) where the tidal stretch across 2 m reaches 1,000 m/s² for the selected hole (where a fall ends). */
function tearRadiusKm(): number | null {
  if (!gravity.hole) return null;
  const r = tidalEndRadiusKm(gravity.gmKm3S2);
  return Number.isFinite(r) ? r : null;
}

/** A circular geodesic orbit. */
function Circular({ n }: { n: HoleNumbers }) {
  const name = bodyName(n.hole);
  const c = controller.circularOrbitNow();
  if (!c) return null;
  const periodHome = (2 * Math.PI) / c.omega;
  // Your clock runs at √(1 − 3M/r) against home's.
  const periodYours = periodHome * Math.sqrt(1 - 3 / c.rM);
  return (
    <Shell tone="data" title={`In orbit round ${name}`}>
      <Grid>
        <Big label="Your clock runs slower" value={timesText(n.homePerYours, n.homePerYoursMinus1)} sub="than home’s: gravity, speed" tone="data" />
        <Big label="Speed past hovering observers" value={sig(c.v, 3)} unit="c" sub={isInnermostStable(c.rM) ? 'the innermost stable orbit' : 'on a circular orbit'} />
        <Big label="Period by your clock" value={formatDurationShort(periodYours, 3)} sub="one turn, on board" tone="data" />
        <Big label="Period at home" value={formatDurationShort(periodHome, 3)} sub="one turn, far away" tone="data" />
      </Grid>
      <Lines>
        <span>Falling freely round the hole: no thrust needed.</span>
        <span>
          Tides across 2 m: <b className="mono font-normal text-fg">{rich(tidesText(n.tidalMS2))}</b>
        </span>
      </Lines>
    </Shell>
  );
}

const hv = { v: null as HoleView | null };
const betaScratch = { x: 0, y: 0, z: 0 };

/** An angle in degrees to 3 figures; below a microradian (float64 residue of an exact 0) "0°". */
export const snapshotDeg = (rad: number): string => (Math.abs(rad) < 1e-6 ? '0°' : `${sig((rad * 180) / Math.PI, 3)}°`);

/** A snapshot at speed: the camera held, the clock paused, the view of a ship passing. */
function Snapshot({ n }: { n: HoleNumbers }) {
  const name = bodyName(n.hole);
  const beta = controller.holdBeta(betaScratch);
  const b = beta ? Math.hypot(beta.x, beta.y, beta.z) : 0;
  const r = gravity.camRelHoleKm;
  const rl = r.length();
  const radial = beta && rl > 0 && b > 0 ? (beta.x * r.x + beta.y * r.y + beta.z * r.z) / (rl * b) : 0;
  const how = b === 0 ? 'hovering' : radial < -0.99 ? 'inward' : radial > 0.99 ? 'outward' : Math.abs(radial) < 0.01 ? 'sideways' : 'at an angle';
  hv.v = holeView(n.hole, hv.v ?? undefined);
  const view = hv.v;
  return (
    <Shell tone="accent" title={`Snapshot above ${name}`}>
      <Grid>
        <Big label="Speed past hovering observers" value={b === 0 ? '0' : sig(b, 3)} unit="c" sub={how} />
        <Big label="Shadow across" value={view ? snapshotDeg(2 * view.shadowRadius) : '—'} sub="the dark patch, as this ship sees it" />
        <Big label="Its centre, off the hole’s direction" value={view ? snapshotDeg(view.shadowOffset) : '—'} sub="aberration moves it" />
        <Big label="Your clock runs slower" value={timesText(n.homePerYours, n.homePerYoursMinus1)} sub="than home’s: gravity, speed" tone="data" />
      </Grid>
      <Lines>
        <span>Clock paused: the same place seen at different speeds.</span>
        <span>A drag, the wheel or a key ends the snapshot.</span>
      </Lines>
    </Shell>
  );
}

const readings: FallReadings = { tau: 0, rOverRs: 0, heightKm: 0, homeT: 0, homeSeenRate: 0, speedPastHover: 0, tidalMS2: 0, tauLeft: 0 };

/** Home's clock in a fall, as its cell's tooltip labels it (label 10 of docs/data/blackholes.md §3). */
export const FALL_HOME_NOTE =
  'Home’s time on the clocks of observers falling in from far away beside you (Painlevé–Gullstrand): a convention. Hovering observers would say you never cross.';

/** The fall. */
function Falling() {
  const t = fall.trip;
  const f = t ? fallReadings(readings) : null;
  if (!t || !f) return null;
  const name = bodyName(t.hole);
  const inside = f.rOverRs < 1;
  const pace = formatDurationShort(t.rate, 2);
  const left = fallRealSecondsLeft(t);
  return (
    <Shell
      tone="hazard"
      title={`Falling into ${name}`}
      right={
        <span className="flex items-center gap-2">
          <span className="flex items-center" role="group" aria-label="Pace of the fall">
            <button className="btn btn-q btn-sq btn-sm !w-6" onClick={() => stepFallPace(-1)} disabled={!canStepFallPace(-1)} aria-label="Slower" title="Slower ([)">
              <Icon name="chevron-left" size={12} />
            </button>
            <span className="mono whitespace-nowrap px-1 text-[11.5px] text-fg-2" title={`The first stretch, to 2 r_s, plays in 20 s; the last, to the end, in 80 s whatever the mass. About ${Math.round(left)} s left at this pace.`}>
              1 s = {pace} aboard
            </span>
            <button className="btn btn-q btn-sq btn-sm !w-6" onClick={() => stepFallPace(1)} disabled={!canStepFallPace(1)} aria-label="Faster" title="Faster (])">
              <Icon name="chevron-right" size={12} />
            </button>
          </span>
          <button className="btn btn-sm btn-hazard" onClick={() => endFall('stopped')} title="Back where you let go: nothing leaves a black hole, so this is a reset, not a journey">
            Stop the fall
          </button>
        </span>
      }
    >
      <Grid>
        <Big label="Your clock" value={formatClock(f.tau)} sub="since you let go" tone="data" />
        <Big label={<span title={FALL_HOME_NOTE}>Home</span>} value={formatClock(f.homeT)} sub="free-fallers’ clocks" tone="data" />
        <Big label="Radius" value={sig(f.rOverRs, f.rOverRs < 0.1 ? 3 : 4)} unit="r_s" sub={inside ? 'inside the horizon' : `height ${heightText(f.heightKm)}`} tone={inside ? 'hazard' : undefined} />
        <Big label="Time left to the end" value={formatClock(f.tauLeft)} sub="by your clock" tone={inside ? 'hazard' : undefined} />
      </Grid>
      <Lines>
        <span title="Home straight overhead, as its light reaches you">
          Home as you see it overhead: <b className="mono font-normal text-fg">×{sig(f.homeSeenRate, 3)}</b>
        </span>
        {inside ? (
          <span className="text-hazard">Inside the horizon nothing can hover</span>
        ) : (
          <span>
            Speed past hovering observers: <b className="mono font-normal text-fg">{fixed(f.speedPastHover, f.speedPastHover > 0.999 ? 5 : 3)}c</b>
          </span>
        )}
        <span className={f.tidalMS2 >= TIDES_TEAR_MS2 * 0.1 ? 'text-hazard' : ''}>
          Tides across 2 m: <b className="mono font-normal">{rich(tidesText(f.tidalMS2))}</b>
        </span>
      </Lines>
    </Shell>
  );
}

/** After a fall: how it ended, and that the camera is back where it let go. */
function FallEndCard() {
  const e = fall.lastEnd;
  const cardOpen = useUI((s) => s.bodyCard && !!s.selected);
  if (!e) return null;
  const name = bodyName(e.hole);
  const head =
    e.why === 'ended'
      ? `The fall ended where tides pull a ship apart (1,000 m/s² across 2 m), 0.03 s before the centre, where general relativity predicts a singularity and stops working.`
      : `You stopped the fall into ${name}.`;
  const inside = e.tauInside > 0 ? ` (${formatDurationShort(e.tauInside, 3)} of it inside the horizon)` : '';
  return (
    <div ref={keepCreditsClear} className={`absolute bottom-3 z-20 w-[560px] max-w-[calc(100%-24px)] ${stripPlace(cardOpen, 560)}`}>
      <div className="panel-float appear">
        <div className="flex items-start gap-3 py-2.5 pl-4 pr-2.5">
          <div className="min-w-0 flex-1" role="status">
            <div className="cap !text-hazard">{e.why === 'ended' ? 'The end of the fall' : 'Fall stopped'}</div>
            <p className="mt-1 font-serif text-[15px] leading-snug text-fg">{head}</p>
            <p className="mt-1 font-serif text-[13.5px] leading-snug text-fg-2">
              You fell for {formatDurationShort(e.tau, 3)} by your clock{inside}; home’s clock moved on {formatDurationShort(e.homeT, 3)} (counted on the free-fallers’ clocks, a
              convention) and keeps that time. Back where you let go: nothing leaves a black hole, so this is a reset, not a journey.
            </p>
          </div>
          <button className="btn btn-q btn-sq shrink-0" onClick={() => (fall.lastEnd = null)} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── The strip ──────────────────────────────────────────────────────────────────────────

export function HoleStrip() {
  // Which face, read on the shared clock: while none shows, no render at all.
  const face = useSimValue(holeStripFaceNow);
  useTicker(face === 'falling' ? 10 : 4, face !== null);
  if (face === null) return null;
  if (face === 'falling') return <Falling />;
  if (face === 'end') return <FallEndCard />;
  const n = holeNumbers();
  if (!n) return null;
  if (face === 'circular') return <Circular n={n} />;
  if (face === 'snapshot') return <Snapshot n={n} />;
  return <Hovering n={n} how={face} />;
}
