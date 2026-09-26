import { describe, expect, it } from 'vitest';
import sampleSource from './__fixtures__/sample.md?raw';
import {
  buildIndex,
  countWords,
  formatIsoDate,
  headingSlug,
  isIsoDate,
  parseArticle,
  readingMinutes,
  sectionsOf,
  smartQuotes,
  splitFrontMatter,
} from './catalogue';

const SAMPLE = sampleSource;

const article = (front: string, body = '\nSome text.\n\n## One\n\nMore.\n') => `---\n${front}\n---\n${body}`;
const FRONT = 'slug: a-b\ntitle: A B\nshelf: stars\norder: 2\npitch: One line.\nupdated: 2026-01-31';

describe('front matter', () => {
  it('reads key: value lines, unquotes values and keeps colons inside them', () => {
    const fm = splitFrontMatter('---\ntitle: "Time: a history"\norder: 3\n# a comment\n\nshelf: light\n---\nBody\n');
    expect(fm).toEqual({ ok: true, data: { title: 'Time: a history', order: '3', shelf: 'light' }, body: 'Body\n' });
  });

  it('accepts Windows line endings and a byte-order mark', () => {
    const fm = splitFrontMatter('﻿---\r\ntitle: X\r\n---\r\nBody\r\n');
    expect(fm.ok && fm.data.title).toBe('X');
    expect(fm.ok && fm.body).toBe('Body\n');
  });

  it('rejects a file without front matter, or with it unclosed or malformed', () => {
    expect(splitFrontMatter('# Title\n').ok).toBe(false);
    expect(splitFrontMatter('---\ntitle: X\n').ok).toBe(false);
    expect(splitFrontMatter('---\njust some words\n---\n').ok).toBe(false);
  });

  it('parses the fixture', () => {
    const p = parseArticle(SAMPLE, 'sample.md');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.meta).toMatchObject({
      slug: 'sample-article',
      title: 'A sample article',
      shelf: 'light',
      order: 9,
      pitch: 'Every feature of the article format, once: for the unit tests, not for readers.',
      updated: '2026-09-25',
      notes: true,
      file: 'sample.md',
    });
  });
});

describe('sections', () => {
  it('lists the ## headings with unique slugs, and leaves out ### and fenced code', () => {
    const body = '## Paris and Cayenne, 1672\n\n### Not me\n\n```\n## nor me\n```\n\n## Doppler’s coloured stars\n\n## Paris and Cayenne, 1672 ##\n';
    expect(sectionsOf(body)).toEqual([
      { id: 'paris-and-cayenne-1672', title: 'Paris and Cayenne, 1672' },
      { id: 'dopplers-coloured-stars', title: 'Doppler’s coloured stars' },
      { id: 'paris-and-cayenne-1672-2', title: 'Paris and Cayenne, 1672' },
    ]);
  });

  it('makes ASCII slugs without markup', () => {
    expect(headingSlug('Rømer’s *late* moon')).toBe('romers-late-moon');
    expect(headingSlug('One number: $\\gamma$')).toBe('one-number-gamma');
    expect(headingSlug('One number: γ')).toBe('one-number');
    expect(headingSlug('[Links](http://x.org) stay text')).toBe('links-stay-text');
  });

  it('sets titles with curly quotes, as the text is set', () => {
    expect(sectionsOf("## Michelson's \"long\" obsession\n")[0].title).toBe('Michelson’s “long” obsession');
    expect(smartQuotes("'Tis the 1880s' 'aether'")).toBe('‘Tis the 1880s’ ‘aether’');
  });

  it('keeps "notes" for the footnote list', () => {
    expect(sectionsOf('## Notes\n')).toEqual([{ id: 'notes-2', title: 'Notes' }]);
  });

  it('finds the fixture’s sections', () => {
    const p = parseArticle(SAMPLE, 'sample.md');
    expect(p.ok && p.meta.sections.map((s) => s.id)).toEqual(['first-principles', 'first-principles-2', 'further-reading-and-watching']);
  });
});

describe('words and reading time', () => {
  it('counts prose, not references, URLs, footnote definitions or scene specs', () => {
    const body = [
      'One two three four.[^a] See [the page](https://example.org/a/very/long/path).',
      '',
      '::: see-it fly:proxima?beta=0.2',
      'Five six.',
      ':::',
      '',
      '$$',
      'x = y + z',
      '$$',
      '',
      '## Further reading and watching',
      '',
      '- Lots of references here that are not read as prose.',
      '',
      '[^a]: A footnote with many words in it that nobody reads aloud.',
    ].join('\n');
    // One two three four See the page Five six
    expect(countWords(body)).toBe(9);
  });

  it('counts numbers such as 299,792 and words such as Rømer’s once', () => {
    expect(countWords('Light covers 299,792 km in a second, Rømer’s estimate was 22 minutes.')).toBe(12);
  });

  it('rounds reading time at 230 words a minute, at least a minute', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(345)).toBe(2);
    expect(readingMinutes(6093)).toBe(26);
  });
});

describe('dates', () => {
  it('checks real calendar dates', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-9-25')).toBe(false);
    expect(formatIsoDate('2026-09-25')).toBe('25 September 2026');
  });
});

describe('the index', () => {
  it('skips half-written and malformed files with a warning, and sorts by shelf then order', () => {
    const { articles, warnings } = buildIndex([
      { file: 'z-first.md', source: article('slug: z-first\ntitle: Z\nshelf: light\norder: 5\npitch: P.\nupdated: 2026-01-01') },
      { file: 'a-b.md', source: article(FRONT) },
      { file: 'early.md', source: article('slug: early\ntitle: E\nshelf: light\norder: 1\npitch: P.\nupdated: 2026-01-01') },
      { file: 'draft.md', source: '---\nslug: draft\ntitle: Half\n' },
      { file: 'no-shelf.md', source: article('slug: no-shelf\ntitle: N\nshelf: comets\norder: 1\npitch: P.\nupdated: 2026-01-01') },
      { file: 'bad-date.md', source: article('slug: bad-date\ntitle: N\nshelf: stars\norder: 1\npitch: P.\nupdated: soon') },
      { file: 'missing.md', source: article('slug: missing\ntitle: N') },
      { file: 'empty.md', source: article(FRONT.replace('a-b', 'empty'), '\n') },
      { file: 'dupe.md', source: article(FRONT) },
    ]);
    expect(articles.map((a) => a.slug)).toEqual(['early', 'z-first', 'a-b']);
    expect(warnings).toHaveLength(6);
    expect(warnings.find((w) => w.startsWith('draft.md'))).toMatch(/not closed/);
    expect(warnings.find((w) => w.startsWith('no-shelf.md'))).toMatch(/shelf "comets"/);
    expect(warnings.find((w) => w.startsWith('bad-date.md'))).toMatch(/YYYY-MM-DD/);
    expect(warnings.find((w) => w.startsWith('missing.md'))).toMatch(/missing shelf, order, pitch, updated/);
    expect(warnings.find((w) => w.startsWith('empty.md'))).toMatch(/no text/);
    // Files are read in name order: a-b.md claims the slug first.
    expect(warnings.find((w) => w.includes('already used'))).toBe('dupe.md skipped: slug "a-b" is already used by a-b.md');
  });

  it('lists an article whose slug differs from its file name, with a warning', () => {
    const { articles, warnings } = buildIndex([{ file: 'other.md', source: article(FRONT) }]);
    expect(articles.map((a) => a.slug)).toEqual(['a-b']);
    expect(warnings).toEqual(['other.md: slug "a-b" differs from the file name']);
  });

  it('never throws on garbage', () => {
    expect(() => buildIndex([{ file: 'x.md', source: '\u0000---\n:::\n$$' }])).not.toThrow();
  });
});
