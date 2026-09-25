import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/** Render a TeX string with KaTeX (display mode by default). */
export function TeX({ children, inline = false }: { children: string; inline?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: !inline, throwOnError: false, output: 'html', strict: 'ignore' }),
    [children, inline],
  );
  return <span className={inline ? 'tex-inline' : 'tex-block'} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Numbered display equation. */
export function Eq({ n, tex }: { n: string; tex: string }) {
  return (
    <div className="eqn">
      <div className="eqn-body">
        <TeX>{tex}</TeX>
      </div>
      <span className="eqn-no">({n})</span>
    </div>
  );
}

/** Inline math. */
export const M = ({ t }: { t: string }) => <TeX inline>{t}</TeX>;
