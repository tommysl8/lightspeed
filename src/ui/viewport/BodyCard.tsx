/**
 * The card for the selected body: what it is, a few facts with their sources, who found it (or
 * when it was launched and how it is doing), how far to trust its position and what else is a
 * model, its distance and light-time, and the things to do with it: go there, fly there, read
 * about it, or open its full data sheet in the instrument panel.
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
import { openLearn } from '../../state/route';
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
  const here = mode === 'orbit' && focus === id;
  const origin = originLine(d) ?? (d.exoplanet ? exoplanetDiscoveryLine(d.exoplanet) : null);
  const status = statusLine(d);
  const notes = [d.positionNote, ...(d.modelNotes ?? [])].filter((n): n is string => !!n);
  // A galaxy beyond the camera's bound structure: the light arriving now, when it left and how stretched.
  const sight = d.deepSky ? cosmicSightLine(id, b.dopplerFactor) : null;
  // Far from the present: home and the stars are drawn as they are today.
  const epochNote = farEpochNote(id);
  const links = sourceLinks(d);
  return (
    <div className="panel-float appear w-[300px] max-w-full" role="region" aria-label={`${d.name}`}>
      <div className="flex items-start gap-2 px-3.5 pb-1 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[18px] font-medium leading-tight text-fg">{d.name}</div>
          <div className="mt-0.5 text-[11px] text-fg-3">{bodyKindText(id)}</div>
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
        <span className="text-fg-3">from you </span>
        {rich(r.v)} {r.u}
        {left === 'none' ? (
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
      </div>
      <div className="scroll max-h-[min(46vh,420px)] overflow-y-auto border-t border-line px-3.5 pb-2.5 pt-2">
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
        {(d.facts ?? []).map((f) => (
          <p key={f} className="mb-1.5 font-serif text-[12.5px] leading-snug text-fg-2 last:mb-0">
            {f}
          </p>
        ))}
        {d.exoplanet?.statusNote && <p className="mb-1.5 text-[11.5px] leading-snug text-fg-2">{d.exoplanet.statusNote}</p>}
        {origin && <p className="mt-2 text-[11.5px] leading-snug text-fg-2">{origin}</p>}
        {status && <p className="mt-1 text-[11.5px] leading-snug text-fg-2">{status}</p>}
        {(notes.length > 0 || links.length > 0) && (
          <div className="mt-2 border-t border-line pt-1.5 text-[10.5px] leading-snug text-fg-3">
            {notes.map((n) => (
              <p key={n} className="mb-1 last:mb-0">
                {n}
              </p>
            ))}
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
