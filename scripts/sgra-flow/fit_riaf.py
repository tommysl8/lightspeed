"""
Fit the RIAF model (riaf_model.py) to the quiescent spectrum of Sgr A*, then image it at 230 GHz and in visible
light and turn the result into surface brightnesses a human eye would see, compared with the Sun and the full Moon.

Data fitted jointly (flux densities as seen from Earth, the NIR dereddened):
  230 GHz 2.4 +- 0.2 Jy     ALMA/SMA mean during the EHT 2017 campaign (EHT Sgr A* Paper II Table 2)
  678 GHz 1.81 +- 0.3 Jy    Bower et al. 2019 ratio S678/S233 = 2.183/2.886, scaled to 2.4 Jy at 230 GHz
  868 GHz 1.55 +- 0.3 Jy    Bower et al. 2019 ratio S868/S233 = 1.864/2.886, scaled likewise (another day)
  2.2 um  1.1 mJy, +-0.12 dex  GRAVITY Collaboration 2020 (A&A 638, A2), median dereddened (A_Ks = 2.43)
86 GHz (2.0 +- 0.2 Jy, GMVA 2017) is compared afterwards on a wider field (its emission extends to ~40 r_g).
Parameters: n0 (thermal density scale), T0 (electron temperature scale), n0nt (non-thermal density scale); the
non-thermal power-law index p is fixed per run: p = 2 (alpha = -0.5, the measured NIR slope, Paugnat et al. 2024) or
p = 3.5 (alpha = -1.25, Yuan et al. 2003 / Broderick & Loeb 2006). Inclination 30 deg (EHT best bet, equivalent to the
GRAVITY flares' 155 deg seen from the other side) and 60 deg (Broderick et al. 2016).

Skyfold draws model A (the first run below). The searches that found these points are summarised in
docs/data/blackholes.md section 7; this script re-images the three models from those points, writes
riaf_results.json (the band fluxes and surface brightnesses flow_tables.py copies into the app's sgraFlow.json) and the
pictures, and runs from this folder: python fit_riaf.py [out.json] (about 10 minutes; numpy, scipy). Unchanged
since the fit. Shares no code with the TypeScript or the GLSL.
"""
import json, sys, zlib, struct, time
import numpy as np
from scipy.optimize import least_squares
from riaf_model import trace, theta_g, rg, D

OUT = sys.argv[1] if len(sys.argv) > 1 else 'riaf_results.json'
F_FIT = [230e9, 678e9, 868e9, 1.363e14]
S_FIT = np.array([2.4, 1.81, 1.55, 1.1e-3])
BANDS = {'U': 8.33e14, 'B': 6.81e14, 'V': 5.45e14, 'R': 4.61e14, 'I': 3.80e14, 'J': 2.40e14, 'H': 1.82e14, 'K': 1.363e14}
ZP = {'U': 1790., 'B': 4063., 'V': 3636., 'R': 3064., 'I': 2416., 'J': 1589., 'H': 1021., 'K': 640.}  # Bessell et al. 1998, Jy
ARCSEC2 = 2.35044305e-11

def resid_fn(incl, p, slope):
    """Residuals: 230/678/868 GHz fluxes, the 2.2 um median (log), and (if slope) the H-K spectral index -0.50 +- 0.19."""
    freqs = F_FIT + ([1.82e14] if slope else [])
    def f(q):
        n0, T0, n0nt = 10**q
        fl = trace((n0, T0, n0nt, p), freqs, incl, npix=52, half=24.0)['flux']
        r = [(fl[0] - 2.4) / 0.2, (fl[1] - 1.81) / 0.3, (fl[2] - 1.55) / 0.3,
             (np.log10(max(fl[3], 1e-30)) - np.log10(1.1e-3)) / 0.12]
        extra = ''
        if slope:
            a = np.log(max(fl[4], 1e-30) / max(fl[3], 1e-30)) / np.log(1.82e14 / 1.363e14)
            r.append((a + 0.50) / 0.19); extra = f', alpha_HK {a:+.2f}'
        print(f'    n0={n0:.3e} T0={T0:.3e} n0nt={n0nt:.3e} -> {fl[0]:.3f} {fl[1]:.3f} {fl[2]:.3f} Jy, K {fl[3]*1e3:.3g} mJy{extra}', flush=True)
        return np.array(r)
    return f

def png(path, img, gamma=0.5):
    a = np.nan_to_num(img); a = a / a.max() if a.max() > 0 else a
    a = np.clip(a, 0, 1)**gamma
    r = np.clip(2 * a, 0, 1); g = np.clip(2 * a - 0.5, 0, 1); b = np.clip(2 * a - 1, 0, 1)
    rgb = (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)[::-1]  # north (+y) up
    hgt, wid = rgb.shape[:2]
    raw = b''.join(b'\x00' + rgb[i].tobytes() for i in range(hgt))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as fh:
        fh.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', wid, hgt, 8, 2, 0, 0, 0))
                 + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def ring_diameter(img, axis):
    X, Y = np.meshgrid(axis, axis); R = np.hypot(X, Y)
    bins = np.linspace(0, axis.max(), 240); idx = np.digitize(R.ravel(), bins)
    prof = np.array([img.ravel()[idx == k].mean() if np.any(idx == k) else 0 for k in range(1, len(bins))])
    k = np.argmax(prof); return 2 * 0.5 * (bins[k] + bins[k + 1])

def blur(img, axis, fwhm_rg):
    s = fwhm_rg / 2.3548; d = axis[1] - axis[0]
    k = np.arange(-int(4 * s / d) - 1, int(4 * s / d) + 2) * d; g = np.exp(-k**2 / (2 * s * s)); g /= g.sum()
    out = np.apply_along_axis(lambda m: np.convolve(m, g, mode='same'), 0, img)
    return np.apply_along_axis(lambda m: np.convolve(m, g, mode='same'), 1, out)

def sb_stats(img_jy_sr, dA_rg2):
    """Surface brightness (mag/arcsec^2, V) of the brightest parts holding 50% and 90% of the light, and their areas."""
    flat = img_jy_sr.ravel(); order = np.argsort(flat)[::-1]; cum = np.cumsum(flat[order]) / flat.sum()
    out = {}
    for frac in (0.5, 0.9):
        n = np.searchsorted(cum, frac) + 1
        out[f'mean_sb_{int(frac*100)}'] = float(-2.5 * np.log10(flat[order][:n].mean() * ARCSEC2 / ZP['V']))
        out[f'area_{int(frac*100)}_rg2'] = float(n * dA_rg2)
    out['peak_sb'] = float(-2.5 * np.log10(flat.max() * ARCSEC2 / ZP['V']))
    return out

results = {'M_Msun': 4.297e6, 'D_pc': 8277, 'theta_g_uas': theta_g, 'r_g_cm': rg, 'models': []}
t0 = time.time()
# The full least-squares searches are slow (each model evaluation is a ray trace); the search logs are kept in
# fit_riaf_A_search.log (slope-constrained, i = 30) and the earlier slope-free search. Their best points are used
# directly here; the i = 60 case gets a short refinement from the i = 30 point.
import math
runs = [
    (30.0, 2.0, True, [math.log10(2.613e6), math.log10(1.876e12), math.log10(4.081e5)], 0),   # A: NIR slope fitted
    (60.0, 2.0, True, [math.log10(2.613e6), math.log10(1.876e12), math.log10(4.081e5)], 4),   # B: i = 60, refined
    (30.0, 2.0, False, [math.log10(1.941e6), math.log10(3.358e12), math.log10(6.249e4)], 0),  # C: slope free (hot thermal NIR)
]
class _Fixed:
    def __init__(self, x, fn): self.x = np.array(x); r = fn(self.x); self.cost = 0.5 * float(r @ r); self.nfev = 1
for incl, p, slope, start, nfev in runs:
    print(f'== model i={incl} p={p} slope-constrained={slope} refine={nfev}', flush=True)
    fn = resid_fn(incl, p, slope)
    if nfev:
        fr = least_squares(fn, start, bounds=([4, 10, -8], [9, 13, 8]), diff_step=0.006, x_scale=[0.3, 0.2, 0.5], max_nfev=nfev)
    else:
        fr = _Fixed(start, fn)
    n0, T0, n0nt = 10**fr.x
    freqs = [86e9, 230e9, 345e9, 678e9, 868e9] + list(BANDS.values())
    res = trace((n0, T0, n0nt, p), freqs, incl, npix=200, half=30.0, want_images=True)
    ax = res['axis_rg']; I = res['images']; flux = res['flux']
    # thermal-only V and K, to tell which population makes the visible light
    th = trace((n0, T0, 0.0, p), [5.45e14, 1.363e14], incl, npix=100, half=20.0)['flux']
    dA = (ax[1] - ax[0])**2
    img230 = I[:, :, 1]; Tb = img230 * (2.99792458e10)**2 / (2 * 1.380649e-16 * (230e9)**2)
    d230 = ring_diameter(img230, ax); d230b = ring_diameter(blur(img230, ax, 20.0 / theta_g), ax)
    kV = 5 + list(BANDS).index('V'); imgV = I[:, :, kV] / 1e-23
    mags = {b: float(-2.5 * np.log10(max(flux[5 + i], 1e-30) / ZP[b])) for i, b in enumerate(BANDS)}
    m = {'inclination_deg': incl, 'p': p, 'nir_slope_constrained': slope, 'n0_cm3': n0, 'T0_K': T0, 'n0nt_cm3': n0nt, 'fit_cost': float(fr.cost), 'fit_nfev': int(fr.nfev),
         'flux_Jy': {f'{f:.4g}': float(F) for f, F in zip(freqs, flux)},
         'thermal_only_V_Jy': float(th[0]), 'thermal_only_K_Jy': float(th[1]),
         'mags_at_Earth_no_dust': mags, 'B_minus_V': mags['B'] - mags['V'],
         'ring230_diameter_uas': float(d230 * theta_g), 'ring230_blur20uas_diameter_uas': float(d230b * theta_g),
         'Tb230_peak_K': float(Tb.max()),
         'V_surface_brightness': sb_stats(imgV, dA), 'V_ring_radius_rg': float(ring_diameter(imgV, ax) / 2)}
    results['models'].append(m)
    tag = f'i{int(incl)}_p{p:g}' + ('_slope' if slope else '_free')
    sub = slice(33, 167)  # central +-20 r_g for the pictures
    png(f'img230_{tag}.png', img230[sub, sub]); png(f'imgV_{tag}.png', imgV[sub, sub])
    png(f'img230_blur20_{tag}.png', blur(img230, ax, 20.0 / theta_g)[sub, sub])
    np.save(f'imgV_{tag}.npy', imgV.astype(np.float32)); np.save(f'img230_{tag}.npy', img230.astype(np.float32))
    print(json.dumps(m, indent=1), f'  [{time.time() - t0:.0f} s]', flush=True)
    results['image_axis_rg'] = [float(ax[0]), float(ax[-1]), len(ax)]
    json.dump(results, open(OUT, 'w'), indent=1)
