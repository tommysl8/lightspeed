import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/** Render a TeX string with KaTeX (display mode by default). */
export function TeX({ children, inline = false }: { children: string; inline?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: !inline, throwOnError: false, output: 'html' }),
    [children, inline],
  );
  return <span className={inline ? 'tex-inline' : 'tex-block'} dangerouslySetInnerHTML={{ __html: html }} />;
}
