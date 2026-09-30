/**
 * The sky's averaging meter (render/lens/skyMeter.ts): the exposure a reading calls for (the √ law's E/2, never above 0),
 * that it settles on the key from a frame of any brightness with the read-back's delay (for the √ law exactly, for a
 * linear law too, and out of a saturated display), that far from every hole it does nothing and eases back to exactly
 * 0, and that near one it meters the frame in two small passes and reads one pixel back without waiting.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { WebGLRenderTarget, type WebGLRenderer } from 'three';
import { gravity } from '../../sim/gravity';
import { lensOverride } from './lensState';
import { adaptSkyExposure, meterSky, SKY_METER_DEADBAND, SKY_METER_KEY, skyExposureFor, skyLnExposure, skyMeter, skyMeterReading, skyMeterWanted } from './skyMeter';

function resetMeter(): void {
  skyMeter.lnExposure = 0;
  skyMeter.target = 0;
  skyMeter.lnKey = NaN;
  skyMeter.pending = false;
  skyMeter.pendingLnExposure = 0;
}

afterEach(() => {
  gravity.hole = null;
  lensOverride.on = false;
  lensOverride.debug = 0;
  resetMeter();
});

describe('the exposure a reading calls for', () => {
  it('brings the key to the target under the √ law, and never brightens beyond the app’s own exposure', () => {
    const lnKey0 = Math.log(1.46); // the frame's key at no stop-down (the sky 4,000 au from Sgr A*)
    const e = skyExposureFor(0, lnKey0);
    expect(e).toBeCloseTo(2 * Math.log(SKY_METER_KEY / 1.46), 12);
    // the frame drawn at that exposure reads the target, and calls for the same exposure again
    expect(skyExposureFor(e, lnKey0 + e / 2)).toBeCloseTo(e, 12);
    // a dark sky (Earth's key is far below the target) calls for none
    expect(skyExposureFor(0, Math.log(0.01))).toBe(0);
    expect(skyExposureFor(-3, Math.log(0.01))).toBe(0);
    expect(skyExposureFor(0, NaN)).toBe(0);
    // a frame mostly unlit (a dark sky whose stars alone are lit) is no glare, however bright its lit pixels
    expect(skyExposureFor(0, Math.log(5), 0.006)).toBe(0);
    expect(skyExposureFor(0, Math.log(5), 0.4)).toBeCloseTo(2 * Math.log(SKY_METER_KEY / 5), 12);
    // a shadow filling 60 % of the view does not keep the sky round it from being metered
    expect(skyExposureFor(0, Math.log(5), 0.4)).toBe(skyExposureFor(0, Math.log(5), 1));
  });

  it('settles on the key with the read-back’s delay, for the √ law, a linear one and a saturated display', () => {
    const laws: [string, (e: number) => number][] = [
      ['√ law', (e) => Math.log(1.46) + 0.5 * e],
      ['linear', (e) => Math.log(1.46) + e],
      // white until stopped down by 2, then √
      ['saturated', (e) => Math.min(Math.log(3), Math.log(1.46) + 0.5 * (e + 2))],
    ];
    for (const [name, lnKeyAt] of laws) {
      resetMeter();
      const drawnAt: number[] = [];
      for (let frame = 0; frame < 400; frame++) {
        drawnAt.push(skyLnExposure());
        // a reading every third frame, of the frame drawn three frames before
        if (frame % 3 === 0 && frame >= 3) skyMeterReading(lnKeyAt(drawnAt[frame - 3]), drawnAt[frame - 3]);
        adaptSkyExposure();
      }
      const e = skyLnExposure();
      // to within the dead band (for the linear law a key within the band itself, for the √ law half of it)
      expect(Math.abs(lnKeyAt(e) - Math.log(SKY_METER_KEY)), name).toBeLessThanOrEqual(SKY_METER_DEADBAND + 1e-9);
      expect(e, name).toBeLessThan(0);
    }
  });

  it('holds still while the readings stay within its dead band, and follows a real change', () => {
    resetMeter();
    skyMeterReading(Math.log(1.46), 0);
    const t = skyMeter.target;
    // the frame drawn at t reads back a key a few 16-bit steps off the target's: nothing moves
    for (const d of [0.0018, -0.0037, 0.02]) {
      skyMeterReading(Math.log(SKY_METER_KEY) + d, t);
      expect(skyMeter.target).toBe(t);
    }
    // the sky brightens by a fifth: the target follows
    skyMeterReading(Math.log(SKY_METER_KEY * 1.2), t);
    expect(skyMeter.target).toBeCloseTo(t - 2 * Math.log(1.2), 12);
  });
});

/** A renderer that counts what it is asked to draw and answers the read-back with the key `lnKey`. */
function fakeRenderer(lnKey: number) {
  const r = {
    renders: 0,
    reads: 0,
    autoClear: true,
    getRenderTarget: () => null,
    setRenderTarget: () => undefined,
    render: () => {
      r.renders++;
    },
    readRenderTargetPixelsAsync: (_t: unknown, _x: number, _y: number, _w: number, _h: number, out: Uint8Array) => {
      r.reads++;
      const v = Math.round(((lnKey + 60) / 120) * 65534) + 1;
      out[0] = Math.floor(v / 256);
      out[1] = v % 256;
      out[2] = 255;
      return Promise.resolve(out);
    },
  };
  return r;
}

describe('meterSky', () => {
  const frame = new WebGLRenderTarget(64, 32);

  it('does nothing far from every hole, and eases a stop-down back to exactly 0', () => {
    const r = fakeRenderer(0);
    skyMeter.lnExposure = -3;
    expect(skyMeterWanted()).toBe(false);
    for (let i = 0; i < 200; i++) meterSky(r as unknown as WebGLRenderer, frame, skyLnExposure());
    expect(r.renders).toBe(0);
    expect(r.reads).toBe(0);
    expect(skyLnExposure()).toBe(0);
  });

  it('meters the frame near a hole, one read-back at a time, and stops the view down to the key', async () => {
    gravity.hole = 'sgr-a-star';
    const r = fakeRenderer(Math.log(1.46));
    meterSky(r as unknown as WebGLRenderer, frame, 0);
    expect(r.renders).toBe(2);
    expect(r.reads).toBe(1);
    // the read-back is still under way: nothing more is drawn
    meterSky(r as unknown as WebGLRenderer, frame, 0);
    expect(r.renders).toBe(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(skyMeter.readings).toBeGreaterThan(0);
    // (to the read-back's 16-bit step: 120/65535 in ln, doubled)
    expect(Math.abs(skyMeter.target - 2 * Math.log(SKY_METER_KEY / 1.46))).toBeLessThan(4e-3);
    expect(r.autoClear).toBe(true);
    // not with a reference camera or a debug sky of the lens's checks
    lensOverride.on = true;
    expect(skyMeterWanted()).toBe(false);
  });
});
