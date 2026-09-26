import { describe, expect, it } from 'vitest';
import { isIntegratedGpu } from './quality';

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
