import { describe, expect, it } from 'vitest';
import { isIntegratedGpu, quality, stepDown, stepUp, type Quality } from './quality';

describe('integrated GPUs', () => {
  it('are told apart by name (as Chrome reports it through ANGLE)', () => {
    expect(isIntegratedGpu('ANGLE (Intel, Intel(R) Graphics (0x00007D67) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(isIntegratedGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(isIntegratedGpu('Mali-G78')).toBe(true);
    expect(isIntegratedGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(isIntegratedGpu('ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
  });

  it('or by little memory when the name is hidden', () => {
    expect(isIntegratedGpu('', 4)).toBe(true);
    expect(isIntegratedGpu('', 8)).toBe(false);
    expect(isIntegratedGpu('')).toBe(false);
  });
});

describe('the quality ladder', () => {
  const fresh = (over: Partial<Quality> = {}): Quality => ({ ...quality, fps: 0, dpr: 2, maxDpr: 2, cubeFace: 768, msaa: 4, integrated: true, ...over });

  it('drops multisampling first on a high-density screen, then the pixel ratio, then the cube map', () => {
    const q = fresh();
    expect(stepDown(q, true)).toBe('msaa');
    expect(q.msaa).toBe(0);
    const dprs: number[] = [];
    while (q.dpr > 1) {
      expect(stepDown(q, true)).toBe('dpr');
      dprs.push(q.dpr);
    }
    expect(dprs).toEqual([1.75, 1.5, 1.25, 1]);
    expect(stepDown(q, false)).toBeNull(); // the cube map only matters in the relativistic view
    expect(stepDown(q, true)).toBe('cube');
    expect(q.cubeFace).toBe(512);
    expect(stepDown(q, true)).toBeNull();
  });

  it('keeps multisampling at a pixel ratio under 1.5 until the pixel ratio is down to 1', () => {
    const q = fresh({ dpr: 1.25, maxDpr: 1.25 });
    expect(stepDown(q, false)).toBe('dpr');
    expect(q.msaa).toBe(4);
    expect(stepDown(q, false)).toBe('msaa');
    expect(q.msaa).toBe(0);
  });

  it('steps back up the cube map and the pixel ratio, but never multisampling', () => {
    const q = fresh({ dpr: 1, msaa: 0, cubeFace: 512 });
    expect(stepUp(q, true)).toBe('cube');
    expect(stepUp(q, true)).toBe('cube');
    expect(q.cubeFace).toBe(1024);
    expect(stepUp(q, true)).toBe('dpr');
    for (let i = 0; i < 3; i++) stepUp(q, false);
    expect(q.dpr).toBe(2);
    expect(stepUp(q, true)).toBeNull();
    expect(q.msaa).toBe(0);
  });
});
