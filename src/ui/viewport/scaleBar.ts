/**
 * The viewport scale bar: a round length in the most readable unit for the current zoom,
 * from metres to billions of light-years (the camera zooms out to 10²⁴ km).
 */
import { AU_KM, LIGHT_YEAR_KM } from '../../physics/constants';
import { fixed } from '../../lib/sci';
import { niceStep } from '../plot/ticks';

/** Light-year multiples written as words: "2 million ly" reads better than "2 000 000 ly". */
const LY_WORDS: [number, string][] = [
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
];

/** "0.1", "20", "5 000": `step` (a 1, 2 or 5 × 10ⁿ) with just the decimals it needs. */
const stepText = (step: number) => fixed(step, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));

/** Nice scale-bar length for a km-per-pixel scale, in the most readable unit. */
export function scaleBarLength(kmPerPx: number, targetPx = 110): { px: number; label: string } {
  const want = kmPerPx * targetPx;
  if (want >= 0.05 * LIGHT_YEAR_KM) {
    const step = niceStep(want / LIGHT_YEAR_KM, 1);
    const px = (step * LIGHT_YEAR_KM) / kmPerPx;
    for (const [k, word] of LY_WORDS) {
      if (step >= k) return { px, label: `${stepText(step / k)} ${word} ly` };
    }
    return { px, label: `${stepText(step)} ly` };
  }
  const unit = want >= 0.02 * AU_KM ? { f: AU_KM, s: 'au' } : want >= 1 ? { f: 1, s: 'km' } : { f: 0.001, s: 'm' };
  const step = niceStep(want / unit.f, 1);
  return { px: (step * unit.f) / kmPerPx, label: `${stepText(step)} ${unit.s}` };
}
