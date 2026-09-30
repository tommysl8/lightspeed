/**
 * The cards' Sources (ui/viewport/Sources.tsx): closed whenever a card opens, one quiet line that opens to the
 * references; and a picture's credit in the form CC BY 4.0 asks for (credit, what was changed, the picture's
 * page and the licence, linked).
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DeepSkyImage } from '../../sim/bodies';
import { PictureCreditLine, SourceLinks, Sources } from './Sources';

const image: DeepSkyImage = {
  file: 'images/nebulae/x.jpg',
  band: 'visible',
  credit: 'ESO/G. Beccari',
  modificationNote: 'Image modified for Skyfold: resized.',
  page: 'https://www.eso.org/public/images/eso0000a/',
  source: 'ESO eso0000a',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
};

describe('a card’s Sources', () => {
  it('start closed, as one line that opens to the references, and remember nothing', () => {
    const html = renderToStaticMarkup(createElement(Sources, null, createElement('p', null, 'Distance: Gaia DR3 parallax.')));
    expect(html).toMatch(/^<details class="[^"]*"><summary[^>]*>Sources/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain('<p>Distance: Gaia DR3 parallax.</p>');
  });

  it('link each source once, and credit a picture with its change, its page and its licence', () => {
    const links = renderToStaticMarkup(
      createElement(SourceLinks, {
        links: [
          { url: 'https://doi.org/10.1/x', label: 'GRAVITY 2022' },
          { url: 'https://science.nasa.gov/a', label: 'science.nasa.gov' },
        ],
      }),
    );
    expect(links.match(/<a /g)).toHaveLength(2);
    expect(links).toMatch(/GRAVITY 2022<\/a><\/span><span> · <a/);
    expect(renderToStaticMarkup(createElement(SourceLinks, { links: [] }))).toBe('');
    const credit = renderToStaticMarkup(createElement(PictureCreditLine, { image })).replace(/<[^>]+>/g, '');
    expect(credit).toBe('ESO/G. Beccari. Image modified for Skyfold: resized. ESO eso0000a · CC BY 4.0');
    const html = renderToStaticMarkup(createElement(PictureCreditLine, { image }));
    expect(html).toContain(`href="${image.page}"`);
    expect(html).toContain(`href="${image.licenceUrl}"`);
  });
});
