import { beforeAll, describe, expect, it } from 'vitest';
import { msFromCivil } from '../lib/time';
import { setSimTime } from '../sim/sim';
import { updateEphemeris } from '../sim/ephemeris';
import { useUI } from '../state/ui';
import { controller } from '../controls/cameraController';
import {
  addTargetResolver,
  afterSlew,
  cancelSceneStep,
  defineScene,
  flightOf,
  KNOWN_TARGETS,
  LATER,
  NAMED_SCENES,
  parseScene,
  resolveTarget,
  sceneNote,
  sceneStatus,
  specOf,
} from './scenes';
import { JOURNEYS } from './journeys';

beforeAll(() => {
  // A fixed date, so the flights' reachability does not depend on when the tests run.
  setSimTime(msFromCivil(2026, 9, 25, 12));
  updateEphemeris();
});

describe('parseScene', () => {
  it('reads go, fly (1 g or constant speed), sky-from and date', () => {
    expect(parseScene('go:jupiter')).toEqual({ kind: 'go', target: 'jupiter' });
    expect(parseScene('fly:proxima')).toEqual({ kind: 'fly', target: 'proxima', beta: null });
    expect(parseScene('fly:saturn?beta=0.9')).toEqual({ kind: 'fly', target: 'saturn', beta: 0.9 });
    expect(parseScene('fly:barnards-star?beta=.12')).toEqual({ kind: 'fly', target: 'barnards-star', beta: 0.12 });
    expect(parseScene('sky-from:pluto')).toEqual({ kind: 'sky-from', target: 'pluto' });
    expect(parseScene(' date:2117-12-11 ')).toEqual({ kind: 'date', date: '2117-12-11', ms: msFromCivil(2117, 12, 11) });
  });

  it('reads every named scene', () => {
    for (const name of NAMED_SCENES) expect(parseScene(name)).toEqual({ kind: 'named', name });
  });

  it('accepts every target the articles use, even those not in the app yet', () => {
    for (const t of KNOWN_TARGETS) expect(parseScene(`go:${t}`)).not.toBeNull();
    expect(KNOWN_TARGETS).toContain('jades-gs-z14-0');
    expect(KNOWN_TARGETS).toHaveLength(106);
  });

  it('rejects anything else', () => {
    for (const spec of [
      '',
      'go:',
      'go:atlantis',
      'goto:mars',
      'fly:mars?beta=1',
      'fly:mars?beta=0',
      'fly:mars?beta=1.5',
      'fly:mars?beta=-0.5',
      'fly:mars?speed=0.5',
      'go:mars?beta=0.5',
      'date:2026-02-30',
      'date:26-01-01',
      'date:2026-13-01',
      'race-sunlight-2',
      'go:Mars',
    ])
      expect(parseScene(spec), spec).toBeNull();
  });

  it('writes a scene back as its canonical spec', () => {
    for (const spec of ['go:mars', 'fly:proxima', 'fly:saturn?beta=0.9', 'sky-from:sun', 'date:2027-02-19', 'moon-month'])
      expect(specOf(parseScene(spec)!)).toBe(spec);
  });
});

describe('sceneStatus', () => {
  it('is ok for what exists today, with a label', () => {
    expect(sceneStatus('go:jupiter')).toEqual({ ok: true, label: 'Go to Jupiter' });
    expect(sceneStatus('fly:proxima')).toEqual({ ok: true, label: 'Fly to Proxima Centauri at 1 g' });
    expect(sceneStatus('fly:saturn?beta=0.9')).toEqual({ ok: true, label: 'Fly to Saturn at 0.9c' });
    expect(sceneStatus('sky-from:pluto')).toEqual({ ok: true, label: 'The sky from Pluto' });
    expect(sceneStatus('date:2117-12-11')).toEqual({ ok: true, label: 'Go to 11 December 2117' });
    for (const name of ['race-sunlight', 'year-in-30s', 'moon-month', 'split-0.999c', 'light-time-correction', 'mars-opposition', 'jupiter-moons'])
      expect(sceneStatus(name).ok, name).toBe(true);
  });

  it('is "coming in a later update" for targets and scenes not built yet', () => {
    expect(sceneStatus('go:andromeda')).toEqual({ ok: false, reason: LATER, label: 'Go to Andromeda Galaxy' });
    expect(sceneStatus('fly:barnards-star?beta=0.12')).toEqual({ ok: false, reason: LATER, label: 'Fly to Barnard’s Star at 0.12c' });
    expect(sceneStatus('cosmic-web')).toEqual({ ok: false, reason: LATER, label: 'The cosmic web' });
    expect(sceneStatus('edge-of-reach').reason).toBe(LATER);
  });

  it('explains specs that are not scenes and flights that go nowhere', () => {
    expect(sceneStatus('go:atlantis')).toEqual({ ok: false, reason: 'Not a scene Lightspeed knows', label: 'go:atlantis' });
    expect(sceneStatus('fly:earth')).toMatchObject({ ok: false, reason: 'Flights leave from Earth' });
  });

  it('says why not while a flight is under way', () => {
    useUI.setState({ tripActive: true });
    try {
      expect(sceneStatus('go:mars')).toMatchObject({ ok: false, reason: expect.stringMatching(/flight is under way/) });
      expect(sceneStatus('race-sunlight').ok).toBe(false);
      // Not built yet is the answer whatever is happening.
      expect(sceneStatus('go:andromeda').reason).toBe(LATER);
    } finally {
      useUI.setState({ tripActive: false });
    }
  });

  it('can be extended by later updates: a resolver for new targets, a definition for new scenes', () => {
    expect(resolveTarget('andromeda')).toBeNull();
    const remove = addTargetResolver((id) => (id === 'andromeda' ? { kind: 'body', id: 'proxima', name: 'Andromeda Galaxy' } : null));
    expect(sceneStatus('go:andromeda')).toEqual({ ok: true, label: 'Go to Andromeda Galaxy' });
    remove();
    expect(sceneStatus('go:andromeda').ok).toBe(false);

    defineScene('cosmic-web', { label: 'The cosmic web', note: 'Filaments of galaxies.', run: () => true });
    expect(sceneStatus('cosmic-web')).toEqual({ ok: true, label: 'The cosmic web' });
    expect(sceneNote('cosmic-web')).toBe('Filaments of galaxies.');
  });
});

describe('notes and flights', () => {
  it('describe a constant-speed flight with its clock rate', () => {
    expect(sceneNote('fly:mars?beta=0.5')).toBe(
      'A steady 0.5c from Earth to Mars. Your clock, τ, runs at 87% of the rate of Earth’s, t. The stars gather ahead of you and turn blue; drag to look around.',
    );
    expect(sceneNote('fly:mars?beta=0.999')).toMatch(/at 4\.5% of the rate/);
    expect(sceneNote('fly:mars?beta=0.001')).toMatch(/at almost exactly the rate of Earth’s, t\.$/);
    expect(sceneNote('go:mars')).toBeNull();
    expect(sceneNote('date:2061-07-28')).toBe('The date is now 28 July 2061. Press N to come back to today.');
  });

  it('give the flight a spec makes', () => {
    expect(flightOf('fly:proxima')).toEqual({ dest: 'proxima', drive: 'rocket', beta: 0 });
    expect(flightOf('fly:saturn?beta=0.9')).toEqual({ dest: 'saturn', drive: 'cruise', beta: 0.9 });
    expect(flightOf('split-0.999c')).toEqual({ dest: 'neptune', drive: 'cruise', beta: 0.999, split: true });
    expect(flightOf('race-sunlight')).toBeNull();
    expect(flightOf('go:mars')).toBeNull();
  });
});

describe('journeys', () => {
  it('are scene specs that run today, with what to look for', () => {
    expect(JOURNEYS.map((j) => j.id)).toEqual(['sunlight', 'saturn', 'split', 'voyager', 'proxima', 'year', 'moon']);
    for (const j of JOURNEYS) {
      expect(parseScene(j.scene), j.id).not.toBeNull();
      expect(sceneStatus(j.scene).ok, j.id).toBe(true);
      expect(j.look.length, j.id).toBeGreaterThan(40);
    }
  });

  it('keep their flights and notes', () => {
    const byId = Object.fromEntries(JOURNEYS.map((j) => [j.id, j]));
    expect(byId.saturn.flight).toEqual({ dest: 'saturn', drive: 'cruise', beta: 0.9 });
    expect(byId.voyager.flight).toEqual({ dest: 'voyager1', drive: 'cruise', beta: 0.99 });
    expect(byId.proxima.flight).toEqual({ dest: 'proxima', drive: 'rocket', beta: 0 });
    expect(byId.split.flight).toEqual({ dest: 'neptune', drive: 'cruise', beta: 0.999, split: true });
    expect(byId.sunlight.flight).toBeUndefined();
    expect(byId.sunlight.clock).toBe('1 s here = 100 s');
    expect(byId.proxima.look).toMatch(/^A steady push of one Earth gravity takes you to the nearest star in 3\.5 years/);
    expect(byId.moon.look).toMatch(/^A month passes in 25 seconds\./);
  });
});

describe('a scene step waiting for its slew', () => {
  const slew = (focus: 'sun' | 'mars') => {
    controller.moves++;
    useUI.setState({ controlMode: 'transition', focus });
  };
  const arrive = () => useUI.setState({ controlMode: 'orbit' });

  it('runs when the scene’s own slew ends', () => {
    let n = 0;
    slew('sun');
    afterSlew('sun', () => n++);
    expect(n).toBe(0);
    arrive();
    expect(n).toBe(1);
    arrive();
    expect(n).toBe(1);
  });

  it('is dropped when the camera is sent elsewhere first, even back to the same body', () => {
    let n = 0;
    slew('sun');
    afterSlew('sun', () => n++);
    slew('mars');
    arrive();
    slew('sun');
    afterSlew('sun', () => n++);
    slew('sun'); // the visitor picks the Sun again mid-slew
    arrive();
    expect(n).toBe(0);
  });

  it('waits once only, so running a scene twice does not do its step twice', () => {
    let n = 0;
    slew('sun');
    afterSlew('sun', () => n++);
    afterSlew('sun', () => n++);
    arrive();
    expect(n).toBe(1);
    slew('sun');
    afterSlew('sun', () => n++);
    cancelSceneStep();
    arrive();
    expect(n).toBe(1);
  });
});
