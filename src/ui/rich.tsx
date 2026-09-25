/**
 * Typeset exponents. The formatters emit Unicode superscripts ("2.998 × 10⁵"), which are
 * right for plain text (CSV, tooltips) but are missing from the web-font subsets. For display
 * they become real superscripts: <sup> in HTML, raised <tspan>s in SVG.
 */
import { Fragment, type ReactNode } from 'react';

const SUP_MAP: Record<string, string> = {
  '⁻': '−',
  '⁺': '+',
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};
const RUN = /([⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/;
const HAS = /[⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹]/;

const plain = (run: string) => [...run].map((c) => SUP_MAP[c] ?? c).join('');

/** A string with Unicode superscripts as HTML: "10⁻⁵" → 10<sup>−5</sup>. Non-strings pass through. */
export function rich(s: ReactNode): ReactNode {
  if (typeof s !== 'string' || !HAS.test(s)) return s;
  return s.split(RUN).map((part, i) =>
    i % 2 === 1 ? (
      <sup key={i} className="sup">
        {plain(part)}
      </sup>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** The same for SVG text: superscript runs become raised, smaller tspans. */
export function svgRich(s: string): ReactNode {
  if (!HAS.test(s)) return s;
  const parts = s.split(RUN);
  const out: ReactNode[] = [];
  let raised = false;
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      out.push(
        <tspan key={i} dy="-0.5em" fontSize="0.74em">
          {plain(part)}
        </tspan>,
      );
      raised = true;
    } else if (part) {
      out.push(
        <tspan key={i} dy={raised ? '0.37em' : undefined}>
          {part}
        </tspan>,
      );
      raised = false;
    }
  });
  return out;
}
