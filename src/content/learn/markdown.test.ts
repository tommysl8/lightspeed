import { describe, expect, it } from 'vitest';
import sampleSource from './__fixtures__/sample.md?raw';
import { compactUrl, renderArticle, renderMarkdown } from './markdown';
import { sectionsOf, splitFrontMatter } from './catalogue';

const SAMPLE = sampleSource;
const { data, html } = renderArticle(SAMPLE, { knownSlugs: new Set(['time-dilation']) });

/** Drop each KaTeX formula (a <span class="katex"> with nested spans) for "[math]". */
function withoutMath(h: string): string {
  let out = '';
  let i = 0;
  for (let at = h.indexOf('<span class="katex">'); at >= 0; at = h.indexOf('<span class="katex">', i)) {
    out += h.slice(i, at) + '[math]';
    let depth = 0;
    const tag = /<(\/?)span(?=[\s>])[^>]*>/g;
    tag.lastIndex = at;
    i = h.length;
    for (let m = tag.exec(h); m; m = tag.exec(h)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) {
        i = tag.lastIndex;
        break;
      }
    }
  }
  return out + h.slice(i);
}

/** The text of rendered HTML, with each formula as [math]. */
const text = (h: string) =>
  withoutMath(h)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const inline = (md: string) => renderMarkdown(md).trim();

describe('articles', () => {
  it('strip the front matter before rendering', () => {
    expect(data.slug).toBe('sample-article');
    expect(html).not.toContain('slug:');
    expect(html.startsWith('<p>Light from the Sun')).toBe(true);
  });

  it('give ## headings the ids of the index, and ### headings ids under them', () => {
    const body = splitFrontMatter(SAMPLE);
    const ids = body.ok ? sectionsOf(body.body).map((s) => s.id) : [];
    for (const id of ids) expect(html).toContain(`<h2 id="doc-${id}"`);
    expect(html).toContain('<h3 id="doc-first-principles--a-subsection">');
  });

  it('read # as ##', () => {
    expect(inline('# Title')).toBe('<h2 id="doc-title">Title</h2>');
  });

  it('leave raw HTML as text', () => {
    expect(html).toContain('&lt;b&gt;Raw HTML&lt;/b&gt;');
    expect(html).not.toContain('<b>Raw HTML</b>');
  });

  it('wrap tables so they can scroll', () => {
    expect(html).toContain('<div class="learn-tbl"><table class="doc-tbl">');
  });
});

describe('maths', () => {
  it('typesets inline $…$ with KaTeX', () => {
    const h = inline('Light takes $t = d/c$ to arrive.');
    expect(h).toContain('<span class="katex">');
    expect(h).not.toContain('katex-display');
    expect(h).toContain('<annotation encoding="application/x-tex">t = d/c</annotation>');
  });

  it('typesets $$ blocks over several lines, on one line, and inside a paragraph as display maths', () => {
    expect(html).toMatch(/<div class="learn-math"><span class="katex-display">[\s\S]*\\gamma = \\frac\{1\}\{\\sqrt\{1 - v\^2\/c\^2\}\}/);
    expect(inline('$$E = mc^2$$')).toMatch(/^<div class="learn-math"><span class="katex-display">/);
    expect(inline('so $$E = mc^2$$ holds')).toMatch(/^<p>so <span class="katex-display">/);
  });

  it('does not treat prices or escaped dollars as maths', () => {
    expect(text(inline('A coffee costs $5 and a sandwich $10.'))).toBe('A coffee costs $5 and a sandwich $10.');
    expect(text(inline('From $5–$10 a go.'))).toBe('From $5–$10 a go.');
    expect(text(inline('Written \\$20, and \\$x\\$ too.'))).toBe('Written $20, and $x$ too.');
    expect(text(inline('US$5 billion, then $x$.'))).toBe('US$5 billion, then [math].');
    expect(text(html)).toContain('A coffee costs $5 and a sandwich $10, and a price written $20 stays a price.');
  });

  it('leaves an unclosed $$ alone rather than swallowing the text after it', () => {
    const h = inline('$$\nx = 1\n\nA paragraph.');
    expect(h).not.toContain('katex');
    expect(h).toContain('A paragraph.');
  });

  it('shows the source of a formula KaTeX cannot parse', () => {
    const h = inline('Bad: $\\frac{1}{$ here.');
    expect(h).toContain('katex-error');
    expect(h).toContain('\\frac{1}{');
  });
});

describe('footnotes', () => {
  it('number references as superscripts that link to the notes', () => {
    expect(html).toContain('<sup class="learn-fnref"><a href="#doc-fn-1" id="doc-fnref-1" aria-label="Note 1">1</a></sup>');
    expect(html).toContain('<a href="#doc-fn-1" id="doc-fnref-1-1" aria-label="Note 1">1</a>');
    expect(html).toContain('<a href="#doc-fn-2" id="doc-fnref-2" aria-label="Note 2">2</a>');
  });

  it('separate citations side by side with a comma, and only those', () => {
    const h = inline('One.[^a][^b] Two.[^c]\n\n[^a]: A.\n[^b]: B.\n[^c]: C.');
    expect(h).toContain('>1</a></sup><sup class="learn-fnsep">,</sup><sup class="learn-fnref">');
    expect(h.match(/learn-fnsep/g)).toHaveLength(1);
  });

  it('list the notes at the end under "Notes", each linking back to every citation', () => {
    const notes = html.slice(html.indexOf('<section class="learn-notes"'));
    expect(notes).toMatch(/^<section class="learn-notes" id="doc-notes"[^>]*><h2 id="doc-notes-h">Notes<\/h2>/);
    expect(notes).toContain('<li id="doc-fn-1">');
    expect(notes).toContain('<a href="#doc-fnref-1" class="learn-fnback" aria-label="Back to the text">↑<sup>a</sup></a>');
    expect(notes).toContain('<a href="#doc-fnref-1-1" class="learn-fnback" aria-label="Back to the text">↑<sup>b</sup></a>');
    expect(notes).toContain('<a href="#doc-fnref-2" class="learn-fnback" aria-label="Back to the text">↑</a>');
    // The notes come after the reading list, at the very end.
    expect(html.indexOf('learn-notes')).toBeGreaterThan(html.indexOf('Further reading'));
  });
});

describe('containers', () => {
  it('see-it: a placeholder for the button, with the spec and the caption', () => {
    expect(html).toContain(
      '<aside class="learn-seeit" data-scene="race-sunlight"><div class="learn-seeit-act"></div><div class="learn-seeit-cap">\n<p>A pulse of light leaves the Sun.</p>\n</div></aside>',
    );
    expect(html).toContain('data-scene="go:andromeda"');
  });

  it('see-it: escapes the spec', () => {
    expect(inline('::: see-it go:x"><script>\nHi\n:::')).toContain('data-scene="go:x&quot;&gt;&lt;script&gt;"');
  });

  it('note: a titled note', () => {
    expect(html).toContain('<div class="note doc-note learn-note"><span class="note-t">Why the number is exact</span>');
    expect(html).toContain('the metre is <em>defined</em> from');
  });

  it('myth: "Myth:" and the myth, then the correction', () => {
    expect(html).toContain(
      '<div class="learn-myth"><p class="learn-myth-claim"><span class="learn-myth-k">Myth:</span> Rømer measured the speed of light.</p><div class="learn-myth-fact">\n<p>He measured how long light takes to cross Earth’s orbit.</p>',
    );
  });

  it('numbers: a boxed aside with its title and table', () => {
    expect(html).toMatch(/<aside class="learn-numbers"><div class="learn-box-t">Light-times<\/div>\n<div class="learn-tbl"><table class="doc-tbl">[\s\S]*?<td>Moon<\/td>[\s\S]*?<\/aside>/);
  });

  it('timeline: dated items get their date in its own column', () => {
    expect(html).toContain('<section class="learn-timeline"><div class="learn-box-t">Timing light</div>');
    expect(html).toContain('<ul class="learn-tl">');
    expect(html).toContain('<li class="learn-tl-item"><span class="learn-tl-date">1676</span><div class="learn-tl-body">Rømer times the moons of Jupiter.</div></li>');
    expect(html).toContain('<li class="learn-tl-item"><span class="learn-tl-date">1849</span><div class="learn-tl-body">Fizeau’s toothed wheel.</div></li>');
    expect(html).toContain('<li>An undated item.</li>');
  });

  it('figure: a placeholder for a known drawing, the caption only otherwise', () => {
    expect(html).toContain('<figure class="doc-fig learn-fig" data-figure="aberration"><div class="doc-fig-body learn-fig-body"></div><figcaption>');
    expect(html).toContain('<figure class="learn-fig learn-fig-caption"><figcaption>\n<p>Caption only.</p>');
    expect(html).not.toContain('data-figure="no-such-figure"');
  });

  it('are not opened by other words after the colons', () => {
    expect(inline('::: warning Hmm\nText\n:::')).toContain('<p>::: warning Hmm');
  });
});

describe('links', () => {
  it('keep in-app routes, marking articles not written yet', () => {
    expect(html).toContain('<a href="#/learn/time-dilation" class="learn-xref">the next article</a>');
    expect(html).toContain('<span class="learn-xref-soon" title="Coming soon">one not written</span>');
    expect(html).toContain('<a href="#/guide/flying" class="learn-xref">the guide</a>');
  });

  it('open external http(s) links in a new tab, without an opener', () => {
    expect(html).toContain('<a href="https://example.org/page" target="_blank" rel="noopener noreferrer">a site</a>');
  });

  it('drop every other scheme, keeping the text', () => {
    expect(html).toContain(', a script, mail and a relative file.');
    expect(html).not.toMatch(/javascript:|mailto:|notes\.html/);
    expect(inline('[x](data:text/html,hi) and [y](#/nowhere)')).toBe('<p>x and y</p>');
  });

  it('keep external links, but not images from other sites', () => {
    expect(inline('![A chart](https://tracker.example/pixel.png)')).toBe('<p>A chart</p>');
    expect(inline('![A chart](/images/chart.png)')).toContain('<img src="/images/chart.png" alt="A chart" loading="lazy">');
  });

  it('do not link bare domains or e-mail addresses', () => {
    expect(inline('See otherhand.org or write to someone@example.org.')).toBe('<p>See otherhand.org or write to someone@example.org.</p>');
  });

  it('show bare DOIs, arXiv papers and long URLs compactly, with the full URL as the tooltip', () => {
    expect(html).toContain(
      '<a href="https://doi.org/10.1002/andp.19053221004" target="_blank" rel="noopener noreferrer" title="https://doi.org/10.1002/andp.19053221004" class="learn-url">doi:10.1002/andp.19053221004</a>',
    );
    expect(html).toContain('>arXiv:2401.01234</a>');
    expect(html).toContain('>arXiv:1234.5678v2</a>'); // an <autolink> in a footnote
    expect(compactUrl('https://www.bipm.org/en/si-base-units/metre')).toBe('bipm.org/en/si-base-units/metre');
    expect(compactUrl('https://science.nasa.gov/mission/voyager/voyager-1/voyager-1-what-is-a-light-day/')).toBe(
      'science.nasa.gov/mission/voyager/voyager-1/voy…',
    );
    expect(compactUrl('https://www.optica-opn.org/x/ole_r%C3%B8mer')).toBe('optica-opn.org/x/ole_rømer');
    expect(compactUrl('https://arxiv.org/pdf/2401.01234v2.pdf')).toBe('arXiv:2401.01234v2');
  });
});

describe('the reading list', () => {
  it('gets an icon for each kind of source and a class on its lists', () => {
    const refs = html.slice(html.indexOf('Further reading'), html.indexOf('learn-notes'));
    expect(html).toContain('<h2 id="doc-further-reading-and-watching" class="learn-refs-h2">');
    for (const [h, kind] of [
      ['Papers', 'paper'],
      ['Books', 'book'],
      ['Videos', 'video'],
      ['Online', 'web'],
    ]) {
      expect(refs).toMatch(new RegExp(`<h3 id="[^"]+" class="learn-refs-h"><svg class="learn-refs-icon"[^>]*>.*?</svg>${h}</h3>\\n<ul class="learn-refs learn-refs-${kind}">`));
    }
  });

  it('marks YouTube links for a play icon', () => {
    expect(html).toContain('<a href="https://www.youtube.com/watch?v=pTn6Ewhb27k" target="_blank" rel="noopener noreferrer" class="learn-yt">');
  });
});
