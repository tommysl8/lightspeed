/**
 * The cards of the data layers, in the top left of the view while they show (in the column there,
 * below the view readout or Roam's panel and the messages: ViewportChrome.tsx): the map of the
 * cosmic microwave background (its label, "contrast enhanced", and its credit), the cosmic web
 * (what the points are, and the survey's gaps), the galaxy surveys (placed by redshift), and near Sagittarius A* the two models there: the
 * stars round it (a statistical model of the nuclear star cluster and disc, its text in
 * sim/galaxy/nuclearCluster.ts) and the glowing gas falling into it (the accretion flow's model,
 * sim/blackholes/accretion.ts). Each says what the layer is and whether it is a model; each opens to say
 * more, keeps its credits and references under Sources (closed: Sources.tsx), and shows whenever its layer does.
 *
 * Cost: a few comparisons twice a second, and the flow's point once (a microsecond, nothing
 * allocated).
 */
import { useState } from 'react';
import { openLearn } from '../../state/route';
import { useUI } from '../../state/ui';
import { sim } from '../../sim/sim';
import { relView } from '../../render/relativisticView';
import { useTicker } from '../useTicker';
import { CMB_CARD, COSMIC_WEB_CARD, cosmicWebShare, quaiaShare, SURVEY_CARD, surveyShare, webMembersShown } from '../cosmicLayers';
import { quaia, survey } from '../../sim/surveys/load';
import { cmbEpochNote } from '../../sim/cosmos/cmb';
import { NSC_LAYER_CARD, nuclear } from '../../sim/galaxy/nuclearCluster';
import { FLOW_HOLE, flowPoint, type FlowPoint } from '../../sim/blackholes/accretion';
import { kindArticle } from '../../content/bodyArticles';
import { Sources } from './Sources';

/** The web's card shows once this much of the layer shows. */
const WEB_CARD_SHARE = 0.3;

/** The Learn article both the web and the CMB map belong to. */
const COSMOS_ARTICLE = 'the-expanding-universe';

/**
 * The gas's card shows while its point is brighter than this (V; about 0.2 pc from Sgr A*, where it is already
 * brighter than any star in Earth's sky), and while it is resolved (drawn by the lens, with lensing on).
 */
const FLOW_CARD_MAG = -6;

/** The accretion flow's card (labels 12 and 13 of docs/data/blackholes.md §3). */
export const FLOW_LAYER_CARD = {
  title: 'The gas round Sgr A*',
  line: 'A model of the hot gas falling into the black hole, bent round its shadow by the lens and brightest where the gas comes towards you.',
  caveat: 'Never seen in visible light: its brightness is uncertain about three times either way, and it is smooth where the real flow flickers.',
  more: [
    'The model: a hot, thin flow fitted to Sgr A*’s spectrum from radio waves to the near infrared, and turned like the flares seen near the black hole (a model choice). It is drawn outside the horizon only.',
    'Its visible light is carried over from the infrared, since some 30 magnitudes of dust hide Sgr A* from us in visible light: about three times brighter or fainter either way, and eight times fainter in a pessimistic model. The real flow flickers tenfold within hours; this one is steady.',
    'On Sgr A*’s card: the same model at 1.3 mm, as the Event Horizon Telescope sees it, next to the EHT’s own picture or a link to it. The scenes made to show the lens switch the gas off, and say so.',
  ],
  sources: ['A hot, thin flow of the kind Broderick and Loeb described (2006), turned like the flares GRAVITY saw near the black hole.'],
} as const;

function LayerCard({
  title,
  line,
  caveat,
  note,
  more,
  sources,
  article,
  onClose,
  closeTitle = 'Turn this layer off (View menu)',
}: {
  title: string;
  line: string;
  caveat?: string;
  /** A line more under the caveat, for a part of the layer that shows only at times. */
  note?: string;
  more: readonly string[];
  /** Its credits and references, under Sources. */
  sources: readonly string[];
  /** The Learn article it belongs to, when there is one. */
  article?: string;
  onClose: () => void;
  closeTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="pointer-events-auto w-full rounded bg-bg/85 px-2.5 py-1.5 text-[11px] leading-[15px] text-fg-2 backdrop-blur-sm" aria-label={title}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11.5px] font-medium text-fg">{title}</h2>
        <button className="btn btn-q btn-sm ml-auto !px-1 !py-0 text-[10.5px]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Less' : 'More'}
        </button>
        {article && (
          <button className="btn btn-q btn-sm !px-1 !py-0 text-[10.5px]" onClick={() => openLearn(article)} title="Read about it in Learn">
            Read
          </button>
        )}
        <button className="btn btn-q btn-sm !px-1 !py-0 text-[10.5px]" onClick={onClose} title={closeTitle}>
          Hide
        </button>
      </div>
      <p>{line}</p>
      {caveat && <p className="mt-0.5 text-fg-3">{caveat}</p>}
      {note && <p className="mt-0.5 text-fg-3">{note}</p>}
      {open && more.map((m) => <p key={m} className="mt-1 text-fg-3">{m}</p>)}
      {sources.length > 0 && (
        <Sources className="mt-1">
          {sources.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </Sources>
      )}
    </section>
  );
}

/** The flow's point this tick (reused). */
const flowNow: FlowPoint = { magnitude: 99, spectralIndex: -0.5, rgb: [1, 1, 1], pointShare: 1 };

export function LayerCards() {
  useTicker(2);
  const showCmb = useUI((s) => s.showCmb);
  const webMode = useUI((s) => s.cosmicWeb);
  const surveysMode = useUI((s) => s.surveys);
  const flowOn = useUI((s) => s.accretionFlow);
  // The stars round Sgr A* have no switch of their own: their card can be put away for the visit.
  const [nscAway, setNscAway] = useState(false);
  // Shown whatever the readouts setting: the label and caveats belong with the layers.
  const web = cosmicWebShare(webMode, sim.camera.pos.length()) >= WEB_CARD_SHARE || webMembersShown.now;
  // The surveys' card once they show (and their index has loaded).
  const surveys = !!survey.hierarchy && surveyShare(surveysMode, sim.camera.pos.length()) >= WEB_CARD_SHARE;
  // Its line on Quaia once Quaia's quasars show too.
  const quaiaShown = !!quaia.hierarchy && quaiaShare(surveysMode, sim.camera.pos.length()) >= WEB_CARD_SHARE;
  // The map is drawn in the plain view (and the plain half of the split view).
  const cmb = showCmb && (!relView.active || relView.split);
  // The nuclear cluster's field while its points are drawn (within 60 pc of Sgr A*, once loaded).
  const nsc = !nscAway && nuclear.w > 0 && nuclear.points > 0;
  // The gas while it is drawn and conspicuous: its point bright, or resolved by the lens (flowPoint: 99 when not drawn).
  const flow = flowOn && flowPoint(FLOW_HOLE, flowNow).magnitude < FLOW_CARD_MAG;
  if (!web && !surveys && !cmb && !nsc && !flow) return null;
  const holeArticle = kindArticle('black-hole');
  return (
    <div className="flex w-full max-w-[380px] flex-col gap-1.5">
      {cmb && (
        <LayerCard
          title={CMB_CARD.title}
          line={CMB_CARD.line}
          caveat={cmbEpochNote()}
          more={[CMB_CARD.key, CMB_CARD.caveat]}
          sources={[`${CMB_CARD.credit}.`]}
          article={COSMOS_ARTICLE}
          onClose={() => useUI.setState({ showCmb: false })}
        />
      )}
      {web && (
        <LayerCard
          title={COSMIC_WEB_CARD.title}
          line={COSMIC_WEB_CARD.line}
          caveat="A survey, not a census: gaps in the southern galactic sky and behind the Milky Way are partly the survey’s."
          more={[COSMIC_WEB_CARD.key, COSMIC_WEB_CARD.caveat]}
          sources={[`${COSMIC_WEB_CARD.credit}.`]}
          article={COSMOS_ARTICLE}
          onClose={() => useUI.setState({ cosmicWeb: 'off' })}
        />
      )}
      {surveys && (
        <LayerCard
          title={SURVEY_CARD.title}
          line={SURVEY_CARD.line}
          caveat={SURVEY_CARD.caveat}
          note={quaiaShown ? SURVEY_CARD.quaia : undefined}
          more={SURVEY_CARD.more}
          sources={[`${SURVEY_CARD.credit}.`]}
          article={COSMOS_ARTICLE}
          onClose={() => useUI.setState({ surveys: 'off' })}
        />
      )}
      {flow && (
        <LayerCard
          title={FLOW_LAYER_CARD.title}
          line={FLOW_LAYER_CARD.line}
          caveat={FLOW_LAYER_CARD.caveat}
          more={FLOW_LAYER_CARD.more}
          sources={FLOW_LAYER_CARD.sources}
          article={holeArticle}
          onClose={() => useUI.setState({ accretionFlow: false })}
          closeTitle="Turn the accretion flow off (View › Accretion flow)"
        />
      )}
      {nsc && (
        <LayerCard
          title={NSC_LAYER_CARD.title}
          line={NSC_LAYER_CARD.line}
          caveat={NSC_LAYER_CARD.caveat}
          more={NSC_LAYER_CARD.more}
          sources={NSC_LAYER_CARD.sources}
          article={holeArticle}
          onClose={() => setNscAway(true)}
          closeTitle="Put this card away for this visit (the stars stay: they are the sky here)"
        />
      )}
    </div>
  );
}
