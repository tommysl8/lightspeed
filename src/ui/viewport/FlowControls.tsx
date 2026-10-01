/**
 * Beside the Event Horizon Telescope's picture on Sgr A*'s card: how the model of its accretion flow is drawn.
 * The band (visible light, or 1.3 mm as the EHT sees it, in false colour) and "Blur to the EHT's resolution"
 * (the EHT's 20 µas beam as seen from Earth), each labelled as the model it is (label 13 of docs/data/blackholes.md §3).
 *
 * How: two fields of the store (state/ui.ts accretionBand, ehtBlur), read each frame by scene/AccretionFlow.tsx.
 * The blur belongs to the 1.3 mm view: going back to visible light turns it off (a ticked box that could not be
 * unticked there would blur the visible picture too).
 * Neither is saved between visits; a scene may set them and the next puts them back (content/scenes.ts
 * SCENE_VIEWS). The words are the flow model's (sim/blackholes/accretion.ts FLOW_TEXTS). While View › Accretion flow is
 * off the controls say so and offer to turn it on; with lensing off they say the gas shows only as a point.
 *
 * Why here as well as in the View menu (Radio eyes, the same band): the comparison with the EHT's picture is made on
 * the card, beside it.
 *
 * Cost: none beyond the card's own re-render.
 *
 * Twins: ui/viewport/EhtFigure.tsx (the picture it sits beside); ui/layout/Header.tsx (View › Accretion flow).
 */
import { useUI } from '../../state/ui';
import { FLOW_TEXTS, type AccretionBand } from '../../sim/blackholes/accretion';
import { Check, Seg } from '../kit';

export function FlowControls() {
  const band = useUI((s) => s.accretionBand);
  const blur = useUI((s) => s.ehtBlur);
  const flow = useUI((s) => s.accretionFlow);
  const lensing = useUI((s) => s.lensing);
  return (
    <div className="mb-2" role="group" aria-label="The accretion flow’s model">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] text-fg-3">Draw the gas in</span>
        <Seg<AccretionBand>
          label="Band the accretion flow is drawn in"
          value={band}
          onChange={(b) => useUI.setState(b === 'mm' ? { accretionBand: b } : { accretionBand: b, ehtBlur: false })}
          options={[
            { value: 'visible', label: FLOW_TEXTS.bandVisible, title: `${FLOW_TEXTS.bandVisible}: the model’s light as the eye would see it` },
            { value: 'mm', label: '1.3 mm (EHT)', title: `${FLOW_TEXTS.bandMm}. ${FLOW_TEXTS.bandMmHint}` },
          ]}
        />
      </div>
      {band === 'mm' && (
        <p className="mt-1 text-[10.5px] leading-snug text-fg-3">
          {FLOW_TEXTS.bandMm}: {FLOW_TEXTS.bandMmHint}
        </p>
      )}
      <div className="-mx-2.5">
        <Check checked={blur && band === 'mm'} disabled={band !== 'mm'} onChange={(v) => useUI.setState({ ehtBlur: v })} hint={band === 'mm' ? FLOW_TEXTS.blurHint : 'For the 1.3 mm view.'}>
          {FLOW_TEXTS.blur}
        </Check>
      </div>
      {!flow ? (
        <p className="text-[10.5px] leading-snug text-fg-3">
          View › Accretion flow is off, so no gas is drawn.{' '}
          <button className="underline decoration-line-2 underline-offset-2 hover:text-fg" onClick={() => useUI.setState({ accretionFlow: true })}>
            Turn it on
          </button>
        </p>
      ) : (
        !lensing && <p className="text-[10.5px] leading-snug text-fg-3">With View › Gravitational lensing off the gas shows only as a point, from far away.</p>
      )}
    </div>
  );
}
