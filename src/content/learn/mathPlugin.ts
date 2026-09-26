/**
 * TeX maths for markdown-it, typeset with KaTeX: inline $...$ and display $$...$$ (on lines
 * of their own, or inline in a paragraph). Written here rather than taken from npm because the
 * maintained plugins either pull in their own KaTeX or treat prices as maths.
 *
 * The rules follow Pandoc, which people already write for: an opening $ must be followed by a
 * non-space and not preceded by a letter or digit ("US$5"); a closing $ must follow a non-space
 * and not be followed by a digit. The first unescaped $ after the opening one must be a valid
 * closing one, or the text is not maths at all, so "$5 and $10" stays money. \$ is always a
 * dollar sign (markdown-it's escape rule consumes it before this rule sees it).
 */
import katex from 'katex';
import type { default as MarkdownIt, StateBlock, StateInline } from 'markdown-it';

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;

const isSpace = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;
const isAlnum = (c: number) => isDigit(c) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * TeX to HTML. KaTeX shows a formula it cannot parse as its source (in the error colour, with
 * the message as a tooltip); anything else it throws on falls back to the source as code.
 */
export function renderTex(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      errorColor: '#ff806e',
      strict: 'ignore',
      // HTML for the eye and MathML for screen readers (KaTeX's CSS hides the MathML).
      output: 'htmlAndMathml',
    });
  } catch {
    return `<code class="learn-math-error" title="This formula could not be typeset">${escapeHtml(tex)}</code>`;
  }
}

/** $...$ (inline) and $$...$$ inside a paragraph (displayed). */
function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== DOLLAR) return false;
  const display = src.charCodeAt(start + 1) === DOLLAR;
  const open = display ? 2 : 1;
  if (!display) {
    const first = src.charCodeAt(start + 1);
    if (Number.isNaN(first) || isSpace(first)) return false;
    if (start > 0 && isAlnum(src.charCodeAt(start - 1))) return false;
  }
  let pos = start + open;
  let end = -1;
  while (pos < state.posMax) {
    const c = src.charCodeAt(pos);
    if (c === BACKSLASH) {
      pos += 2;
      continue;
    }
    if (c === DOLLAR) {
      if (display) {
        if (src.charCodeAt(pos + 1) !== DOLLAR) return false;
      } else if (isSpace(src.charCodeAt(pos - 1)) || isDigit(src.charCodeAt(pos + 1))) {
        return false;
      }
      end = pos;
      break;
    }
    pos++;
  }
  if (end < 0 || end + open > state.posMax) return false;
  const content = src.slice(start + open, end);
  if (!content.trim()) return false;
  if (!silent) {
    const token = state.push(display ? 'math_inline_display' : 'math_inline', 'math', 0);
    token.content = content;
    token.markup = display ? '$$' : '$';
  }
  state.pos = end + open;
  return true;
}

/**
 * A display formula starting with $$ at the start of a line: all on one line ($$ x $$), or
 * over several, ending at a line that ends with $$. A blank line before the closing $$ means
 * the formula was never closed, and the text is left alone rather than swallowing what follows.
 */
function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false; // an indented code block
  const begin = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (begin + 2 > max || state.src.charCodeAt(begin) !== DOLLAR || state.src.charCodeAt(begin + 1) !== DOLLAR) return false;

  const first = state.src.slice(begin + 2, max).trim();
  let last = startLine;
  let content: string;
  if (first.endsWith('$$')) {
    content = first.slice(0, -2);
  } else if (first.includes('$$')) {
    return false; // "$$a$$ and more": maths inside a paragraph, for the inline rule
  } else {
    let closing: string | null = null;
    for (let line = startLine + 1; line < endLine; line++) {
      const s = state.bMarks[line] + state.tShift[line];
      const e = state.eMarks[line];
      if (s >= e) return false; // blank line: never closed
      if (state.sCount[line] < state.blkIndent) return false; // left the enclosing block
      const text = state.src.slice(s, e).trim();
      if (text.endsWith('$$')) {
        closing = text.slice(0, -2);
        last = line;
        break;
      }
    }
    if (closing === null) return false;
    const middle = last > startLine + 1 ? state.getLines(startLine + 1, last, state.blkIndent, false) : '';
    content = [first, middle.replace(/\n$/, ''), closing].filter((s) => s.trim()).join('\n');
  }
  if (!content.trim()) return false;
  if (silent) return true;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = content;
  token.markup = '$$';
  token.map = [startLine, last + 1];
  state.line = last + 1;
  return true;
}

export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.math_inline = (tokens, idx) => renderTex(tokens[idx].content, false);
  md.renderer.rules.math_inline_display = (tokens, idx) => renderTex(tokens[idx].content, true);
  md.renderer.rules.math_block = (tokens, idx) => `<div class="learn-math">${renderTex(tokens[idx].content, true)}</div>\n`;
}
