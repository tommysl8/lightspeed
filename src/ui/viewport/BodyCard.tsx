/**
 * The card for the selected body: what it is, a few facts with their sources, who found it (or
 * when it was launched and how it is doing), how far to trust its position and what else is a
 * model, its distance and light-time, and the things to do with it: go there, fly there, read
 * about it, or open its full data sheet in the instrument panel.
 *
 * A black hole's card gives, near it, its height above the horizon instead of a distance
 * (exact, from sim/lensBodies.ts holeView and the gravity state: the heliocentric difference is
 * kilometres coarse near a hole; far away its distance and light-time like any body's), a "From here" line (the shadow, the Einstein ring, your clock
 * against home's, the thrust it takes to stay), its mass with the published uncertainties, at most
 * three one-line notes of what is a model with a "What is modelled here" link to the rest (the data
 * sheet, ui/dataSheet.ts sheetNotes, and the Guide), and for Sgr A* and M87* the Event Horizon
 * Telescope's picture (EhtFigure) with, for Sgr A*, the accretion flow's switches (FlowControls).
 * Cost: holeView's closed forms three times a second while the card shows (nothing allocated).
 */
import { C_KM_S } from '../../physics/constants';
import { getBody, type BodyRecord } from '../../sim/bodies';
import { longDate } from '../../sim/solarSystem';
import { fixed, qty, sig } from '../../lib/sci';
import { sim } from '../../sim/sim';
import { useUI } from '../../state/ui';
import { targetReading } from '../../lab/measure';
import { goToBody } from '../navigation';
import { planOneG } from '../tripActions';
import { articleForBody } from '../../content/bodyArticles';
import { bodyKindText } from '../../content/destinations';
import { openDoc, openLearn } from '../../state/route';
import { useHasArticle } from '../learn/articleIndex';
import { CloseIcon } from '../kit';
import { Icon } from '../icons';
import { useTicker } from '../useTicker';
import { rich } from '../rich';
import { starDistanceLine, starPhysicalLine } from '../starText';
import { exoplanetDiscoveryLine, exoplanetOrbitLine, exoplanetPhysicalLine, exoplanetStatusText } from '../exoplanetText';
import { creditSentence, deepSkyDistanceLine } from '../deepSkyText';
import { farEpochNote } from '../epochNote';
import { cosmicSightLine, lightLeftAgo } from '../../sim/cosmos/sight';
import { assetUrl } from '../../render/textures';
import type { DeepSkyImage } from '../../sim/bodies';
import { gravity } from '../../sim/gravity';
import { fall } from '../../sim/fall';
import { holeView, type HoleView } from '../../sim/lensBodies';
import { FLOW_TEXTS } from '../../sim/blackholes/accretion';
import { holeFromHere, holeHeightLine, holeMassText, MODELLED_HERE, type HoleHere } from '../deepSkyText';
import { EhtFigure } from './EhtFigure';
import { FlowControls } from './FlowControls';
import type { ControlMode } from '../../state/ui';

/** The camera modes in which it is at a body it is centred on (a black hole's own modes included). */
const AT_TARGET: readonly ControlMode[] = ['orbit', 'fall', 'circular', 'hold'];

/** holeView's numbers for the card, reused. */
const holeScratch = {} as HoleView;

/**
 * The card's view of the camera's own state near black hole `id` (the gravity state's; far away: none of it).
 * Home's clock against yours as the HUD has it (ui/flight/HoleStrip.tsx holeNumbers, its twin): cosh φ_S/α with
 * n − 1 = (2 sinh²(φ_S/2) + (1 − α))/α, free of cancellation; in a fall dT/dτ on the free-fallers' clocks. On a
 * circular orbit (the camera's 'circular' mode) the motion is free fall: no thrust.
 */
function holeHere(id: string, mode: ControlMode): HoleHere {
  const near = gravity.hole === id;
  const trip = near && fall.trip && fall.trip.hole === id ? fall.trip : null;
  let clock: HoleHere['clock'] = null;
  if (trip) {
    const k = trip.state.dTdTau;
    if (k > 0) clock = { n: k, nMinus1: k - 1 };
  } else if (near && gravity.paced) {
    const phi = Number.isFinite(sim.ship.phi) ? sim.ship.phi : 0;
    const s = Math.sinh(phi / 2);
    clock = { n: Math.cosh(phi) / gravity.alpha, nMinus1: (2 * s * s + gravity.oneMinusAlpha) / gravity.alpha };
  }
  // At rest past the observers hovering here, to a thousandth of c: hovering.
  const moving = near && Math.tanh(gravity.relPhi) >= 1e-3;
  const orbiting = near && mode === 'circular';
  return { near, clock, motion: trip ? 'falling' : orbiting ? 'orbiting' : moving ? 'moving' : 'hover', inside: near && gravity.inside };
}

/**
 * A nebula's picture, with its credit line exactly as the archive gives it and what was changed,
 * linked to the picture's page and the licence (CC BY 4.0 asks for all of it wherever the picture
 * is shown).
 */
export function PictureCredit({ image, className = '' }: { image: DeepSkyImage; className?: string }) {
  return (
    <p className={`whitespace-pre-line text-[10.5px] leading-snug text-fg-3 ${className}`}>
      Picture: {creditSentence(image.credit)}{' '}
      <span>{image.modificationNote}</span>{' '}
      <a className="underline decoration-line-2 underline-offset-2 hover:text-fg" href={image.page} target="_blank" rel="noopener noreferrer">
        {image.source}
      </a>
      {' · '}
      <a className="underline decoration-line-2 underline-offset-2 hover:text-fg" href={image.licenceUrl} target="_blank" rel="noopener noreferrer">
        {image.licence}
      </a>
    </p>
  );
}

/** "science.nasa.gov" from a URL. */
function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** The links behind a record's facts, discovery and status, each once, labelled by name where the record gives one, else by site. */
export function sourceLinks(r: BodyRecord): { url: string; label: string }[] {
  const named = new Map<string, string>();
  (r.factSources ?? []).forEach((u, i) => {
    const l = r.factSourceLabels?.[i];
    if (l) named.set(u, l);
  });
  const urls = [...(r.factSources ?? []), r.discovery?.source, r.mission?.statusSource].filter((u): u is string => !!u && /^https?:\/\//.test(u));
  const seen = new Map<string, number>();
  return [...new Set(urls)].map((url) => {
    const own = named.get(url);
    if (own) return { url, label: own };
    const h = host(url);
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return { url, label: n > 1 ? `${h} ${n}` : h };
  });
}

/** "Discovered on 25 March 1655 by Christiaan Huygens (The Hague).", or a spacecraft's launch. */
export function originLine(r: BodyRecord): string | null {
  if (r.mission) {
    const how = [r.mission.vehicle, r.mission.site].filter(Boolean).join(', ');
    return `Launched on ${longDate(r.mission.launch.slice(0, 10))}${how ? ` (${how})` : ''}.`;
  }
  const d = r.discovery;
  if (!d) return null;
  const note = d.note ? ` ${d.note.replace(/([^.])$/, '$1.')}` : '';
  // "Known since antiquity; …" and "Disputed: …" are stories, not names.
  if (/^(Known|Disputed)\b/.test(d.by)) return `Discovery: ${d.by}${d.place ? ` (${d.place})` : ''}.${note}`;
  const when = /^\d{4}-\d{2}-\d{2}/.test(d.date) ? `on ${longDate(d.date)}` : `in ${longDate(d.date)}`;
  return `Discovered ${when} by ${d.by}${d.place ? ` (${d.place})` : ''}.${note}`;
}

/** "Operating in interstellar space … (as of 20 August 2026)." */
export function statusLine(r: BodyRecord): string | null {
  const m = r.mission;
  if (!m?.status) return null;
  return m.statusAsOf ? `${m.status.replace(/\.$/, '')} (as of ${longDate(m.statusAsOf)}).` : m.status;
}

export function BodyCard() {
  const id = useUI((s) => s.selected);
  const show = useUI((s) => s.bodyCard);
  const tripActive = useUI((s) => s.tripActive);
  const focus = useUI((s) => s.focus);
  const mode = useUI((s) => s.controlMode);
  const lensing = useUI((s) => s.lensing);
  const slug = id ? articleForBody(id) : undefined;
  const readable = useHasArticle(slug);
  useTicker(3, !!id && show);
  if (!id || !show) return null;
  const d = getBody(id);
  const b = sim.bodies[id];
  if (!d || !b) return null;
  const r = qty(b.distTrue, 'length', 4);
  const lt = qty(b.distTrue / C_KM_S, 'time', 3);
  // A galaxy in the expanding universe: when its light left, not distance / c.
  const left = lightLeftAgo(id);
  const geo = targetReading(id);
  const moving = !!geo && geo.beta >= 1e-3;
  const here = AT_TARGET.includes(mode) && focus === id;
  const origin = originLine(d) ?? (d.exoplanet ? exoplanetDiscoveryLine(d.exoplanet) : null);
  const status = statusLine(d);
  // A black hole: its height above the horizon and what it looks like from here (null: not in the scene).
  const hole = d.kind === 'black-hole' ? d.blackHole : undefined;
  const hv = hole ? holeView(id, holeScratch) : null;
  const hh = hv ? holeHere(id, mode) : null;
  const mass = hole ? holeMassText(hole) : null;
  // Its card keeps at most three one-line notes (the position and the rest are on the data sheet).
  const notes = hole ? (d.modelNotes ?? []).slice(0, 3) : [d.positionNote, ...(d.modelNotes ?? [])].filter((n): n is string => !!n);
  // A galaxy beyond the camera's bound structure: the light arriving now, when it left and how stretched. Not beside
  // a black hole whose gravity paces the clock: its light left it hours or days ago, not ages (M87* from 6,288 au).
  const sight = d.deepSky && !hh?.near ? cosmicSightLine(id, b.dopplerFactor) : null;
  // Far from the present: home and the stars are drawn as they are today.
  const epochNote = farEpochNote(id);
  const links = sourceLinks(d);
  return (
    <div className="panel-float appear w-[300px] max-w-full" role="region" aria-label={`${d.name}`}>
      <div className="flex items-start gap-2 px-3.5 pb-1 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[18px] font-medium leading-tight text-fg">{d.name}</div>
          <div className="mt-0.5 text-[11px] text-fg-3">{bodyKindText(id)}</div>
          {hole && mass && (
            <div className="mono mt-0.5 text-[10.5px] leading-[15px] text-fg-2">
              <div title={hole.massNote ? `${mass.title}. ${hole.massNote}` : mass.title}>
                <span className="text-fg-3">mass </span>
                {mass.v}
              </div>
            </div>
          )}
          {d.star && (
            <div className="mono mt-0.5 text-[10.5px] leading-[15px] text-fg-2">
              <div>{starPhysicalLine(d.star)}</div>
              <div className="text-fg-3">{starDistanceLine(d.star)}</div>
            </div>
          )}
          {d.exoplanet && (
            <div className="mono mt-0.5 text-[10.5px] leading-[15px] text-fg-2">
              <div>{exoplanetPhysicalLine(d.exoplanet)}</div>
              <div className="text-fg-3">{exoplanetOrbitLine(d.exoplanet)}</div>
            </div>
          )}
          {d.deepSky && deepSkyDistanceLine(d.deepSky) && <div className="mono mt-0.5 text-[10.5px] leading-[15px] text-fg-3">{deepSkyDistanceLine(d.deepSky)}</div>}
          {sight && <div className="mt-0.5 text-[11px] leading-snug text-fg-2">{sight}</div>}
          {d.exoplanet && exoplanetStatusText(d.exoplanet) && (
            <div className="mt-0.5 text-[11px] text-hazard" title={d.exoplanet.statusNote}>
              {exoplanetStatusText(d.exoplanet)}
            </div>
          )}
          {epochNote && <div className="mt-0.5 text-[11px] leading-snug text-hazard">{epochNote}</div>}
          {(b.regime === 'illustrative' || b.regime === 'extrapolated') && (
            <div className="mt-0.5 text-[11px] text-hazard" title={d.provider.label}>
              {b.regime === 'illustrative' ? 'Position illustrative at this date' : 'Position extrapolated beyond its data'}
            </div>
          )}
        </div>
        <button className="btn btn-q btn-sq -mr-1.5 -mt-1 !h-6 !w-6" onClick={() => useUI.setState({ bodyCard: false })} aria-label="Close card">
          <CloseIcon />
        </button>
      </div>
      <div className="mono px-3.5 pb-2 text-[11px] leading-[16px] text-fg-2">
        {hv && hole && hh?.near ? (
          // Near a black hole: how high above its horizon you are (exact); far away, its distance like any body's.
          <span>{holeHeightLine(hv, hole.rsKm)}</span>
        ) : (
          <>
            <span className="text-fg-3">from you </span>
            {rich(r.v)} {r.u}
          </>
        )}
        {/* Deep in a hole's gravity (where the warp paces your own clock) its light-time says little: left out. */}
        {hh?.near && (gravity.paced || hh.motion === 'falling') ? null : left === 'none' ? (
          <span className="text-fg-3"> · none of its light has reached you</span>
        ) : left ? (
          <>
            <span className="text-fg-3"> · its light left </span>
            {left}
            <span className="text-fg-3"> ago</span>
          </>
        ) : (
          <>
            <span className="text-fg-3"> · light takes </span>
            {lt.v} {lt.u}
          </>
        )}
        {moving && (
          <div>
            <span className="text-fg-3">seen </span>
            {fixed(geo.thetaShipDeg, 1)}°<span className="text-fg-3"> from apex · Doppler </span>
            <span className="text-data">{sig(geo.D, 4)}</span>
          </div>
        )}
        {hv && hh && (
          <div className="mt-0.5 font-sans text-[11px] leading-snug">
            <span className="text-fg-3">From here: </span>
            {holeFromHere(hv, hh).join(' · ')}
            {hh.near && !lensing && <span className="text-hazard"> (not drawn: View › Gravitational lensing is off)</span>}
          </div>
        )}
      </div>
      {/* On a phone the card shares the height with the panel along the bottom: its body scrolls in a quarter of it. */}
      <div className="scroll max-h-[min(46vh,420px)] overflow-y-auto border-t border-line px-3.5 pb-2.5 pt-2 max-sm:max-h-[24vh]">
        {d.deepSky?.image && (
          <figure className="mb-2">
            <img
              className="max-h-[150px] w-full rounded-sm bg-black object-contain"
              src={assetUrl(d.deepSky.image.file)}
              alt={`${d.name}, as seen from Earth (${d.deepSky.image.band === 'visible' ? 'visible light' : 'near-infrared light'})`}
              loading="lazy"
            />
            <figcaption>
              <PictureCredit image={d.deepSky.image} className="mt-1" />
            </figcaption>
          </figure>
        )}
        {/* Another published mass (the mass line's own figures are the adopted ones): here, so the header stays short. */}
        {hole?.massNote && <p className="mb-1.5 text-[11px] leading-snug text-fg-3">Mass: {`${hole.massNote[0].toLowerCase()}${hole.massNote.slice(1)}`.replace(/([^.])$/, '$1.')}</p>}
        {hole?.ehtImage && <EhtFigure image={hole.ehtImage} name={d.name} flowCaption={hole.flow ? FLOW_TEXTS.figureCaption : null} />}
        {hole?.flow && <FlowControls />}
        {(d.facts ?? []).map((f) => (
          <p key={f} className="mb-1.5 font-serif text-[12.5px] leading-snug text-fg-2 last:mb-0">
            {f}
          </p>
        ))}
        {d.exoplanet?.statusNote && <p className="mb-1.5 text-[11.5px] leading-snug text-fg-2">{d.exoplanet.statusNote}</p>}
        {origin && <p className="mt-2 text-[11.5px] leading-snug text-fg-2">{origin}</p>}
        {status && <p className="mt-1 text-[11.5px] leading-snug text-fg-2">{status}</p>}
        {(notes.length > 0 || links.length > 0 || hole) && (
          <div className="mt-2 border-t border-line pt-1.5 text-[10.5px] leading-snug text-fg-3">
            {notes.map((n) => (
              <p key={n} className="mb-1 last:mb-0">
                {n}
              </p>
            ))}
            {hole && (
              // The notes the card leaves out are on the data sheet; what each model is, in the Guide.
              <p className="mt-1.5">
                <span>{MODELLED_HERE}: </span>
                <button className="underline decoration-line-2 underline-offset-2 hover:text-fg" onClick={() => useUI.setState({ rightOpen: true })} title="Every note, on the data sheet in the instrument panel (I)">
                  the data sheet
                </button>
                {' · '}
                <button className="underline decoration-line-2 underline-offset-2 hover:text-fg" onClick={() => openDoc('guide', 'hole-models')} title="The Guide: what is a model near the black holes">
                  the Guide
                </button>
              </p>
            )}
            {links.length > 0 && (
              <p className="mt-1.5">
                <span>Sources: </span>
                {links.map((l, i) => (
                  <span key={l.url}>
                    {i > 0 && ' · '}
                    <a className="underline decoration-line-2 underline-offset-2 hover:text-fg" href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>
                      {l.label}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-line px-3.5 py-2">
        <button className="btn btn-sm" disabled={tripActive || here} onClick={() => goToBody(id)} title="Move the camera there (not a journey)">
          <Icon name="orbit" size={11} />
          {here ? 'You are here' : 'Go there'}
        </button>
        <button
          className="btn btn-sm"
          disabled={tripActive || here}
          onClick={() => planOneG(id)}
          title="Plan a 1 g rocket flight there from where you are; the planner shows both clocks before you go"
        >
          <Icon name="flight" size={11} />
          Fly here
        </button>
        {readable && (
          <button className="btn btn-sm" onClick={() => openLearn(slug)} title="Read its story in Learn">
            <Icon name="book" size={11} />
            Read
          </button>
        )}
        <button className="btn btn-q btn-sm ml-auto" onClick={() => useUI.setState({ rightOpen: true })} title="The full data sheet and live readouts, in the instrument panel (I)">
          Details
          <Icon name="arrow-right" size={11} />
        </button>
      </div>
    </div>
  );
}
