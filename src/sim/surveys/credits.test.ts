/** The surveys' acknowledgements: the About page's (credits.ts) are the ones CREDITS.md quotes, word for word. */
import { describe, expect, it } from 'vitest';
import { DESI_ACKNOWLEDGEMENT, SDSS_ACKNOWLEDGEMENTS } from './credits';
import { readText } from '../../test/files';

describe('the galaxy surveys’ acknowledgements', () => {
  const credits = readText('CREDITS.md').replace(/\s+/g, ' ');
  it('are quoted in CREDITS.md as the app shows them', () => {
    expect(credits).toContain(DESI_ACKNOWLEDGEMENT);
    for (const a of SDSS_ACKNOWLEDGEMENTS) expect(credits).toContain(a.text);
  });
  it('include DESI’s whole paragraph, from its first sentence to its last', () => {
    expect(DESI_ACKNOWLEDGEMENT.startsWith('This research used data obtained with the Dark Energy Spectroscopic Instrument (DESI).')).toBe(true);
    expect(DESI_ACKNOWLEDGEMENT.endsWith('or any of the listed funding agencies.')).toBe(true);
    expect(DESI_ACKNOWLEDGEMENT).toContain('DE–AC02–05CH11231');
  });
});
