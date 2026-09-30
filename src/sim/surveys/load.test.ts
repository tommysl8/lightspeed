/**
 * Loading the surveys: nothing is fetched until the camera is beyond the local universe (or the layer is turned on);
 * a failed download is tried again after 2 s, 4 s, 8 s… up to a minute, and never given up; the nodes least recently
 * used go first when the cache is full.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { MPC_KM } from '../../physics/constants';
import { SURVEY_AUTO_FULL_KM, SURVEY_LOAD_KM, surveyLoadWanted, surveyShare } from '../../ui/cosmicLayers';
import { retryAfterMs } from '../../lib/retry';
import { encodeHierarchy, decodeHierarchy, nodeBox, type SurveyHierarchy } from './format';
import {
  evictSurveyNodes,
  FETCHES,
  loadSurveyHierarchy,
  requestSurveyNodes,
  resetSurvey,
  survey,
  SURVEY_BASE_URL,
  surveyHierarchyDue,
  surveyIO,
  surveyNodeWaiting,
  touchSurveyNodes,
} from './load';

/** A hierarchy of a root and its eight children, 100 galaxies each. */
function smallHierarchy(): SurveyHierarchy {
  const nodes = ['', '0', '1', '2', '3', '4', '5', '6', '7'].map((path) => {
    const { side, lo } = nodeBox(path);
    return { childMask: path === '' ? 255 : 0, points: 100, subtree: path === '' ? 900 : 100, fileBytes: 10, side, lo, box: Float64Array.of(lo[0], lo[1], lo[2], lo[0] + side, lo[1] + side, lo[2] + side) };
  });
  return decodeHierarchy(encodeHierarchy(nodes, 900, [900]));
}

const io = { ...surveyIO };
let clock = 0;
afterEach(() => {
  Object.assign(surveyIO, io);
  resetSurvey();
});
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('when the surveys load', () => {
  it('not from home, nor anywhere in the local universe, in the default setting', () => {
    for (const mpc of [0, 1e-9, 0.8, 3, 16.5, 29.9]) expect(surveyLoadWanted('auto', mpc * MPC_KM)).toBe(false);
    for (const mpc of [30, 50, 200, 3000, 14_165]) expect(surveyLoadWanted('auto', mpc * MPC_KM)).toBe(true);
    expect(SURVEY_LOAD_KM / MPC_KM).toBe(30);
  });

  it('from anywhere once turned on, and never once turned off', () => {
    expect(surveyLoadWanted('on', 0)).toBe(true);
    expect(surveyLoadWanted('off', 5000 * MPC_KM)).toBe(false);
  });

  it('show from 30 Mpc, fully by 60, in the default setting', () => {
    expect(surveyShare('auto', 29 * MPC_KM)).toBe(0);
    expect(surveyShare('auto', 45 * MPC_KM)).toBeCloseTo(0.5, 6);
    expect(surveyShare('auto', SURVEY_AUTO_FULL_KM)).toBe(1);
    expect(surveyShare('off', 3000 * MPC_KM)).toBe(0);
    expect(surveyShare('on', 0)).toBe(1);
  });

  it('come from one place, the site’s own public/data/survey/ unless it is changed', () => {
    expect(SURVEY_BASE_URL.endsWith('data/survey/')).toBe(true);
  });
});

describe('a failed download', () => {
  it('waits 2 s, then twice as long each time, at most a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 30].map(retryAfterMs)).toEqual([2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000]);
  });

  it('of the index is tried again when its wait is over, and never given up', async () => {
    clock = 0;
    surveyIO.now = () => clock;
    let calls = 0;
    const h = smallHierarchy();
    surveyIO.hierarchy = async () => {
      calls++;
      if (calls <= 8) throw new Error('offline');
      return { hierarchy: h, bytes: 1000 };
    };
    const waits: number[] = [];
    for (let attempt = 1; attempt <= 9; attempt++) {
      expect(surveyHierarchyDue()).toBe(true);
      await loadSurveyHierarchy();
      if (attempt <= 8) {
        expect(survey.status).toBe('failed');
        const wait = survey.hierarchyRetryAt - clock;
        waits.push(wait);
        // Not due a moment before its wait is over; due once it is.
        clock += wait - 1;
        expect(surveyHierarchyDue()).toBe(false);
        clock += 1;
      }
    }
    expect(waits).toEqual([2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000]);
    expect(survey.status).toBe('ready');
    expect(survey.hierarchy).toBe(h);
    expect(survey.bytes).toBe(1000);
    expect(surveyHierarchyDue()).toBe(false);
  });

  it('of a node is asked for again only after its wait, and then loads', async () => {
    clock = 0;
    surveyIO.now = () => clock;
    const h = smallHierarchy();
    surveyIO.hierarchy = async () => ({ hierarchy: h, bytes: 10 });
    await loadSurveyHierarchy();
    const failures = new Map<string, number>();
    surveyIO.node = async (path) => {
      const n = (failures.get(path) ?? 0) + 1;
      failures.set(path, n);
      if (path === '3' && n <= 3) throw new Error('HTTP 503');
      return { count: 100, position: new Float32Array(300), attrs: new Uint8Array(200), glows: new Float32Array(64), bytes: 5000 };
    };
    requestSurveyNodes([4]);
    await settle();
    expect(surveyNodeWaiting(4)).toBe(true);
    // Still wanted every frame, but not asked for again until 2 s have passed.
    for (let t = 0; t < 1999; t += 100) {
      clock = t;
      requestSurveyNodes([4]);
      await settle();
    }
    expect(failures.get('3')).toBe(1);
    for (const wait of [2000, 4000]) {
      clock += wait;
      requestSurveyNodes([4]);
      await settle();
    }
    expect(failures.get('3')).toBe(3);
    clock += 8000;
    requestSurveyNodes([4]);
    await settle();
    expect(survey.nodes.has(4)).toBe(true);
    expect(surveyNodeWaiting(4)).toBe(false);
  });

  it('never holds more than FETCHES downloads at once', async () => {
    surveyIO.hierarchy = async () => ({ hierarchy: smallHierarchy(), bytes: 10 });
    await loadSurveyHierarchy();
    let open = 0;
    let most = 0;
    surveyIO.node = async () => {
      open++;
      most = Math.max(most, open);
      await settle();
      open--;
      return { count: 100, position: new Float32Array(300), attrs: new Uint8Array(200), glows: new Float32Array(64), bytes: 5000 };
    };
    for (let f = 0; f < 5; f++) {
      requestSurveyNodes([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      await settle();
      await settle();
    }
    expect(most).toBeLessThanOrEqual(FETCHES);
    expect(survey.nodes.size).toBe(9);
    expect(survey.files).toBe(10);
  });
});

describe('the cache', () => {
  it('drops the nodes least recently used, never those of this frame', async () => {
    surveyIO.hierarchy = async () => ({ hierarchy: smallHierarchy(), bytes: 10 });
    await loadSurveyHierarchy();
    surveyIO.node = async () => ({ count: 100, position: new Float32Array(300), attrs: new Uint8Array(200), glows: new Float32Array(64), bytes: 5000 });
    for (let i = 0; i < 9; i++) {
      survey.frame = i;
      requestSurveyNodes([i]);
      await settle();
    }
    survey.frame = 20;
    touchSurveyNodes([0, 1]);
    const out = evictSurveyNodes(500);
    expect(out).toEqual([2, 3, 4, 5]);
    expect(survey.loadedPoints).toBe(500);
    expect(survey.nodes.has(0) && survey.nodes.has(1) && survey.nodes.has(8)).toBe(true);
  });
});
