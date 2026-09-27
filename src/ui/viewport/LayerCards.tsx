/**
 * The cards of the data layers beyond the Galaxy, in the top left of the view while they show:
 * the map of the cosmic microwave background (its label, "contrast enhanced", and its credit) and
 * the cosmic web (what the points are, and the survey's gaps). Each opens to say more; each shows
 * whenever its layer does.
 */
import { useState } from 'react';
import { openLearn } from '../../state/route';
import { useUI } from '../../state/ui';
import { sim } from '../../sim/sim';
import { relView } from '../../render/relativisticView';
import { useTicker } from '../useTicker';
import { CMB_CARD, COSMIC_WEB_CARD, cosmicWebShare, webMembersShown } from '../cosmicLayers';
import { cmbEpochNote } from '../../sim/cosmos/cmb';

/** The web's card shows once this much of the layer shows. */
const WEB_CARD_SHARE = 0.3;

/** The Learn article both layers belong to. */
const ARTICLE = 'the-expanding-universe';

function LayerCard({ title, line, caveat, more, onClose }: { title: string; line: string; caveat?: string; more: readonly string[]; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="pointer-events-auto rounded border border-line bg-bg/85 px-2.5 py-1.5 text-[11px] leading-[15px] text-fg-2 backdrop-blur-sm" aria-label={title}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11.5px] font-medium text-fg">{title}</h2>
        <button className="btn btn-q btn-sm ml-auto !px-1 !py-0 text-[10.5px]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Less' : 'More'}
        </button>
        <button className="btn btn-q btn-sm !px-1 !py-0 text-[10.5px]" onClick={() => openLearn(ARTICLE)} title="Read about it in Learn: The expanding universe">
          Read
        </button>
        <button className="btn btn-q btn-sm !px-1 !py-0 text-[10.5px]" onClick={onClose} title="Turn this layer off (View menu)">
          Hide
        </button>
      </div>
      <p>{line}</p>
      {caveat && <p className="mt-0.5 text-fg-3">{caveat}</p>}
      {open && more.map((m) => <p key={m} className="mt-1 text-fg-3">{m}</p>)}
    </section>
  );
}

export function LayerCards() {
  useTicker(2);
  const showCmb = useUI((s) => s.showCmb);
  const webMode = useUI((s) => s.cosmicWeb);
  // Shown whatever the readouts setting: the label and caveats belong with the layers.
  const web = cosmicWebShare(webMode, sim.camera.pos.length()) >= WEB_CARD_SHARE || webMembersShown.now;
  // The map is drawn in the plain view (and the plain half of the split view).
  const cmb = showCmb && (!relView.active || relView.split);
  if (!web && !cmb) return null;
  return (
    <div className="pointer-events-none absolute left-3 top-14 z-10 flex max-w-[min(380px,calc(100%-24px))] flex-col gap-1.5">
      {cmb && (
        <LayerCard
          title={CMB_CARD.title}
          line={CMB_CARD.line}
          caveat={cmbEpochNote()}
          more={[CMB_CARD.key, CMB_CARD.caveat, `Credit: ${CMB_CARD.credit}.`]}
          onClose={() => useUI.setState({ showCmb: false })}
        />
      )}
      {web && (
        <LayerCard
          title={COSMIC_WEB_CARD.title}
          line={COSMIC_WEB_CARD.line}
          caveat="A survey, not a census: gaps in the southern galactic sky and behind the Milky Way are partly the survey’s."
          more={[COSMIC_WEB_CARD.key, COSMIC_WEB_CARD.caveat, `Credit: ${COSMIC_WEB_CARD.credit}.`]}
          onClose={() => useUI.setState({ cosmicWeb: 'off' })}
        />
      )}
    </div>
  );
}
