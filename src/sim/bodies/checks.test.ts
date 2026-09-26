/**
 * What the registry refuses (a navigation key already taken, a destination without a radius),
 * and the camera limits it leads to for bodies without them.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { framingDistance, minDistance, MIN_APPROACH_KM, MIN_FRAMING_KM, SPACECRAFT_FRAMING_RADII, SPACECRAFT_MIN_RADII } from '../../controls/framing';
import { zoomPanPath } from '../../controls/zoomPan';
import { bodyForKey } from '../../ui/navigation';
import { coreBodyRecords, fixedOffsetProvider, getBody, registerBodies, replaceBodies, unregisterBodies, type BodyRecord } from '.';
import { evalEntries } from './registry';

const CORE = new Set(evalEntries().map((e) => e.id));
afterEach(() => unregisterBodies(evalEntries().map((e) => e.id).filter((id) => !CORE.has(id))));

const rec = (id: string, extra: Partial<BodyRecord> = {}, physical: Partial<BodyRecord['physical']> = {}): BodyRecord => ({
  id,
  name: id,
  kind: 'moon',
  parent: 'jupiter',
  physical: { radiusKm: 1821, colour: '#ffee88', ...physical },
  provider: fixedOffsetProvider(421_700, 0, 0),
  ...extra,
});

describe('navigation keys', () => {
  it('cannot be taken by a second body (Io with Jupiter’s 5), in any case', () => {
    expect(() => registerBodies([rec('io', { key: '5' })])).toThrow(/key '5' already goes to 'jupiter'/);
    expect(() => registerBodies([rec('io', { key: 'm' })])).toThrow(/already goes to 'moon'/);
    expect(bodyForKey('5')).toBe('jupiter');
    expect(getBody('io')).toBeUndefined();
  });

  it('cannot be given twice in one call, but a free key is fine', () => {
    expect(() => registerBodies([rec('io', { key: 'I' }), rec('europa', { key: 'i' })])).toThrow(/key 'i' already goes to 'io'/);
    registerBodies([rec('io', { key: 'I' })]);
    expect(bodyForKey('i')).toBe('io');
  });

  it('stay with a body whose record is replaced, and cannot be moved onto another', () => {
    const pluto = coreBodyRecords().find((r) => r.id === 'pluto')!;
    replaceBodies([{ ...pluto, name: 'Pluto' }]);
    expect(bodyForKey('9')).toBe('pluto');
    const jupiter = coreBodyRecords().find((r) => r.id === 'jupiter')!;
    expect(() => replaceBodies([{ ...jupiter, key: '9' }])).toThrow(/already goes to 'pluto'/);
    expect(bodyForKey('5')).toBe('jupiter');
  });
});

describe('radii', () => {
  it('a destination must have one', () => {
    expect(() => registerBodies([rec('speck', {}, { radiusKm: 0 })])).toThrow(/radiusKm must be a finite number > 0/);
    expect(() => registerBodies([rec('speck', {}, { radiusKm: NaN })])).toThrow(/radiusKm/);
    expect(() => registerBodies([rec('speck', {}, { radiusKm: Infinity })])).toThrow(/radiusKm/);
  });

  it('a point that is never visited need not (a barycentre, or destination: false)', () => {
    registerBodies([
      rec('hidden-point', { destination: false }, { radiusKm: 0 }),
      rec('some-barycentre', { kind: 'barycentre', parent: 'sun', destination: false }, { radiusKm: 0 }),
    ]);
    // Even so, the camera keeps a finite, positive distance from it.
    expect(framingDistance('hidden-point')).toBe(MIN_FRAMING_KM);
    expect(minDistance('hidden-point')).toBe(MIN_APPROACH_KM);
    const path = zoomPanPath(1e6, 1e4, framingDistance('hidden-point'));
    for (const t of [0, 0.3, 1]) {
      const { u, w } = path.at(t);
      expect(Number.isFinite(u) && Number.isFinite(w) && w > 0).toBe(true);
    }
  });

  it('a zoom path to or from a zero scale stays finite', () => {
    for (const [w0, w1] of [
      [0, 100],
      [100, 0],
      [0, 0],
    ]) {
      const p = zoomPanPath(1e5, w0, w1);
      expect(Number.isFinite(p.S)).toBe(true);
      for (const t of [0, 0.5, 1]) expect(Number.isFinite(p.at(t).w)).toBe(true);
    }
  });
});

describe('camera limits for spacecraft and irregular bodies', () => {
  it('keeps Voyager 1 where it was', () => {
    expect(framingDistance('voyager1')).toBe(0.03);
    expect(minDistance('voyager1')).toBe(0.004);
  });

  it('frames other spacecraft like Voyager, clear of the probe model', () => {
    registerBodies([rec('new-horizons', { kind: 'spacecraft', parent: 'sun' }, { radiusKm: 0.00135 })]);
    expect(framingDistance('new-horizons')).toBeCloseTo(SPACECRAFT_FRAMING_RADII * 0.00135, 12);
    expect(minDistance('new-horizons')).toBeCloseTo(SPACECRAFT_MIN_RADII * 0.00135, 12);
    // The Voyager ratios.
    expect(SPACECRAFT_FRAMING_RADII).toBeCloseTo(0.03 / 0.00185, 0);
    expect(SPACECRAFT_MIN_RADII).toBeCloseTo(0.004 / 0.00185, 0);
  });

  it('keeps the camera out of the lobes of an irregular body', () => {
    // Arrokoth: mean radius 9 km, 18 km from its centre to the tip of a lobe.
    registerBodies([rec('arrokoth', { kind: 'asteroid', parent: 'sun' }, { radiusKm: 9.1, maxRadiusKm: 18 })]);
    expect(minDistance('arrokoth')).toBeCloseTo(18 * 1.015, 9);
    expect(framingDistance('arrokoth')).toBeGreaterThanOrEqual(36);
  });
});
