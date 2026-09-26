import { describe, expect, it } from 'vitest';
import { fixedOffsetProvider, type BodyRecord } from '../../sim/bodies';
import { originLine, sourceLinks, statusLine } from './BodyCard';

const base: BodyRecord = { id: 'x', name: 'X', kind: 'moon', parent: 'saturn', physical: { radiusKm: 1, colour: '#888888' }, provider: fixedOffsetProvider(0, 0, 0) };

describe('the body card’s lines', () => {
  it('says who found a body, when and where', () => {
    const titan = { ...base, discovery: { by: 'Christiaan Huygens', date: '1655-03-25', place: 'The Hague' } };
    expect(originLine(titan)).toBe('Discovered on 25 March 1655 by Christiaan Huygens (The Hague).');
    const nix = { ...base, discovery: { by: 'the Hubble team', date: '2005-06', note: 'Announced 31 October 2005' } };
    expect(originLine(nix)).toBe('Discovered in June 2005 by the Hubble team. Announced 31 October 2005.');
    const halley = { ...base, discovery: { by: 'Known since antiquity; Edmond Halley showed in 1705 that three comets were one', date: '1705', place: 'Oxford' } };
    expect(originLine(halley)).toBe('Discovery: Known since antiquity; Edmond Halley showed in 1705 that three comets were one (Oxford).');
    expect(originLine(base)).toBeNull();
  });

  it('gives a spacecraft’s launch and dated status', () => {
    const v2 = { ...base, mission: { launch: '1977-08-20T14:29:44Z', vehicle: 'Titan IIIE-Centaur', site: 'Cape Canaveral', status: 'Operating.', statusAsOf: '2026-08-20' } };
    expect(originLine(v2)).toBe('Launched on 20 August 1977 (Titan IIIE-Centaur, Cape Canaveral).');
    expect(statusLine(v2)).toBe('Operating (as of 20 August 2026).');
  });

  it('lists each source once, by site', () => {
    const r = {
      ...base,
      factSources: ['https://science.nasa.gov/a', 'https://doi.org/10.1/x', 'https://science.nasa.gov/a'],
      discovery: { by: 'A', date: '2000-01-01', source: 'https://www.science.nasa.gov/b' },
    };
    expect(sourceLinks(r)).toEqual([
      { url: 'https://science.nasa.gov/a', label: 'science.nasa.gov' },
      { url: 'https://doi.org/10.1/x', label: 'doi.org' },
      { url: 'https://www.science.nasa.gov/b', label: 'science.nasa.gov 2' },
    ]);
  });
});
