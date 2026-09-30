"""
Writes what the app knows about Sgr A*'s accretion flow: src/sim/blackholes/sgraFlow.json, and the reference pictures
the app's own ray march is checked against (scripts/sgra-flow/ref/*.npy with ref/index.json).

sgraFlow.json (format lightspeed.sgra-flow, version 1; read by src/sim/blackholes/accretion.ts):
  model      model A of fit_riaf.py (riaf_results.json, models[0]): n0, T0, n0nt, p, beta, pitch angle, the
             fluid's velocity law; the constants the GPU's march needs are derived from these in accretion.ts.
  axis       the flow's axis: the orbital axis of the near-infrared flares seen by GRAVITY (GRAVITY Collaboration
             2023, A&A 677, L10, Table 2: i = 154.9 deg, Omega = 177.3 deg, in the S-stars' orbit convention), as a
             unit vector in (east, north, away from us), in J2000 ecliptic axes and in the app's world axes
             (x, z, -y of the ecliptic). The only home of this vector (accretion.ts flowAxisWorld reads it).
  fit        the fitted band fluxes seen from 8,277 pc (no dust), B - V, the visible surface brightness, the V ring's
             radius, the 1.3 mm ring and peak brightness temperature; model C's visible flux for the uncertainty line.
  byAngle    the flow's flux density in V and at 230 GHz seen from 8,277 pc at every 5 deg of viewing angle from the
             axis (0 ... 180 deg, 37 rows), from riaf_model.trace with 400 x 400 rays over +-30 M (the fit's own field).
             The model is symmetric about its mid-plane, so 180 - i gives the same flux as i (its picture mirrored):
             0 ... 90 deg are traced and the rest mirrored, one pair (30 and 150 deg) traced both ways as the check.
  scenes     numbers the scene sgr-a-star-flow may quote (a static camera at r = 20 M on the line from Sgr A* to the
             Sun, i = 180 - 25.1 deg), from flow_camera.trace_camera: the flow's total V magnitude there (its own
             blueshift included), the radius of its brightest ring (the peak of the intensity averaged round the
             hole), and the shadow's radius for comparison.
  limits     the model's known shortcomings, as text.
  refs       the papers.

The references: the distant camera at i = 30 deg (ref/far_i30_V.npy, far_i30_230.npy: the fit's own riaf_model
pictures, 200 x 200 over +-30 M, from +Z with the axis's projection towards +y; V in Jy/sr, 230 GHz
in erg/s/cm^2/Hz/sr) and cameras at 20, 6 and 2.02 M (static) and 1 M (raindrop, inside the horizon), each I_inf in
Jy/sr on a grid of look angle alpha (from the hole) and azimuth omega (from the axis's projection): V from the
power-law electrons alone (what the app draws), 150, 230 and 345 GHz, and V from all the electrons: ref/<name>.npy
of shape (n_alpha, n_omega, 5), float32. index.json lists them with their cameras,
grids and summary numbers.

Run from anywhere: python scripts/sgra-flow/flow_tables.py [--quick] (about 25 minutes on 3 processes; --quick uses
100 x 100 rays and coarse grids, for trying it out). Needs numpy, scipy. Deterministic: a second run writes the same
numbers. Shares no code with the TypeScript or the GLSL.
"""
import argparse
import json
import os
import sys
import time
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from riaf_model import trace, rg, powerlaw_ja, e_, me, c as C_CGS, kB, mp, h as H_CGS, SIN_B, BETA  # noqa: E402
from flow_camera import trace_camera  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_JSON = os.path.join(ROOT, 'src', 'sim', 'blackholes', 'sgraFlow.json')
REF = os.path.join(HERE, 'ref')

V_HZ = 5.45e14
MM_HZ = [150e9, 230e9, 345e9]
V_ZERO_JY = 3636.0  # Bessell, Castelli & Plez 1998
D_PC = 8277.0
ARCSEC2_PER_SR = (180 / np.pi * 3600) ** 2

# Sgr A* (sstars.json's position) and the flares' orbit (GRAVITY 2023 Table 2).
RA_DEG, DEC_DEG = 266.4168370833, -29.0078105556
FLARE_I_DEG, FLARE_OMEGA_DEG = 154.9, 177.3
EPS = np.radians(84381.448 / 3600)


def flow_axis():
    """The flares' orbital angular momentum (i, Omega as orbital elements, the S-stars' convention): h = N x V at the
    ascending node = (cos W sin i, -sin W sin i, -cos i) in (east, north, away)."""
    i, W = np.radians(FLARE_I_DEG), np.radians(FLARE_OMEGA_DEG)
    h = np.array([np.cos(W) * np.sin(i), -np.sin(W) * np.sin(i), -np.cos(i)])
    a, d = np.radians(RA_DEG), np.radians(DEC_DEG)
    away = np.array([np.cos(d) * np.cos(a), np.cos(d) * np.sin(a), np.sin(d)])
    east = np.array([-np.sin(a), np.cos(a), 0.0])
    north = np.array([-np.sin(d) * np.cos(a), -np.sin(d) * np.sin(a), np.cos(d)])
    eq = h[0] * east + h[1] * north + h[2] * away
    ecl = np.array([eq[0], np.cos(EPS) * eq[1] + np.sin(EPS) * eq[2], -np.sin(EPS) * eq[1] + np.cos(EPS) * eq[2]])
    world = np.array([ecl[0], ecl[2], -ecl[1]])
    # the angle between the axis and the direction from Sgr A* to the Sun (-away)
    sun_i = np.degrees(np.arccos(-h[2]))
    return h, ecl, world, sun_i


def emission_constants(m):
    """The emissivities' constants in cgs, from riaf_model's own functions and constants, so the app's twin
    (src/render/flow/flowRay.ts) and the GPU's march (flowMap.frag.glsl) use exactly the reference's numbers:
      B^2 = bSquared * rho^-1.1 exp(-z^2/2rho^2) / r                      (Gauss^2; n_th m_p c^2 8 pi/(6 beta r))
      power law  j = powerLawJ * n_nt B^((p+1)/2) nu^(-(p-1)/2),  a = powerLawA * n_nt B^((p+2)/2) nu^(-(p+4)/2)
      thermal    j = thermalJ * n_th nu_s (sqrt X + 2^(11/12) X^(1/6))^2 exp(-X^(1/3)) / K2(1/Theta),
                 nu_s = nuS * B Theta^2, X = nu/nu_s, Theta = thetaPerK T_e;  a = j / B_nu(T_e)
    """
    p = m['p']
    jn, an = powerlaw_ja(1.0, 1.0, 1.0, p)
    return {
        'units': 'cgs; nu in Hz, B in Gauss, n in cm^-3, j in erg/s/cm^3/Hz/sr, a in 1/cm',
        'sinPitch': float(SIN_B),
        'beta': float(BETA),
        'bSquared': float(8 * np.pi * m['n0_cm3'] * mp * C_CGS**2 / (6 * BETA)),
        'powerLawJ': float(jn),
        'powerLawA': float(an),
        'thermalJ': float(np.sqrt(2) * np.pi * e_**2 / (3 * C_CGS)),
        'nuS': float((2.0 / 9.0) * e_ / (2 * np.pi * me * C_CGS) * SIN_B),
        'thetaPerK': float(kB / (me * C_CGS**2)),
        'hOverK': float(H_CGS / kB),
        'twoHOverC2': float(2 * H_CGS / C_CGS**2),
        'c2Over2k': float(C_CGS**2 / (2 * kB)),
        'rgCm': float(rg),
        'vHz': V_HZ,
        'mmHz': MM_HZ,
        'vZeroJy': V_ZERO_JY,
        'arcsec2PerSr': float(ARCSEC2_PER_SR),
        'gClip': [1e-4, 1e4],
    }


def by_angle_row(args):
    params, incl, npix = args
    t0 = time.time()
    r = trace(params, [V_HZ, 230e9], incl, npix=npix, half=30.0)
    return incl, float(r['flux'][0]), float(r['flux'][1]), time.time() - t0


def grid(n_alpha, n_omega, a_lo=0.0, a_hi=np.pi):
    """Cell centres: alpha uniform in (a_lo, a_hi), omega_k = 2 pi (k + 1/2)/n_omega (the app's map columns)."""
    al = a_lo + (a_hi - a_lo) * (np.arange(n_alpha) + 0.5) / n_alpha
    om = 2 * np.pi * (np.arange(n_omega) + 0.5) / n_omega
    A, O = np.meshgrid(al, om, indexing='ij')
    return al, om, A, O


def summarise(I, al, om, lnk):
    """Total flux seen by the camera (Jy, V: k^3.5 I_inf; the solid angle sin a da dw), its V magnitude, the ring's
    radius (peak of the intensity averaged over omega, refined by a parabola), the peak and the brightest azimuth."""
    da = al[1] - al[0]
    dw = om[1] - om[0]
    k = np.exp(lnk)
    Iv = I[:, :, 0]
    w = np.sin(al)[:, None] * da * dw
    thermal_share = float(((I[:, :, 4] - Iv) * k ** 3.5 * w).sum() / max((I[:, :, 4] * k ** 3.5 * w).sum(), 1e-300))
    flux_inf = float((Iv * w).sum())
    flux_cam = float((Iv * k ** 3.5 * w).sum())
    prof = Iv.mean(axis=1)
    j = int(np.argmax(prof))
    if 0 < j < len(prof) - 1:
        y0, y1, y2 = prof[j - 1], prof[j], prof[j + 1]
        den = y0 - 2 * y1 + y2
        off = 0.5 * (y0 - y2) / den if den != 0 else 0.0
    else:
        off = 0.0
    ring = float(al[j] + off * da)
    jj, kk = np.unravel_index(np.argmax(Iv), Iv.shape)
    return {
        'fluxInfJy': flux_inf,
        'fluxCamJy': flux_cam,
        'vMagCam': float(-2.5 * np.log10(flux_cam / V_ZERO_JY)) if flux_cam > 0 else 99.0,
        'ringRadiusDeg': float(np.degrees(ring)),
        'peakJySr': float(Iv.max()),
        'peakAlphaDeg': float(np.degrees(al[jj])),
        'peakOmegaDeg': float(np.degrees(om[kk])),
        'thermalShareOfV': thermal_share,
    }


def near_ref(args):
    name, params, ro, frame, incl, n_alpha, n_omega, a_lo, a_hi = args
    t0 = time.time()
    al, om, A, O = grid(n_alpha, n_omega, np.radians(a_lo), np.radians(a_hi))
    I, lnk, steps = trace_camera(params, [V_HZ] + MM_HZ + [V_HZ], ro, frame, incl, A.ravel(), O.ravel(),
                                 thermal=[False, True, True, True, True])
    I = I.reshape(n_alpha, n_omega, 5)
    lnk = lnk.reshape(n_alpha, n_omega)
    return name, ro, frame, incl, al, om, I, lnk, steps, time.time() - t0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--quick', action='store_true')
    ap.add_argument('--procs', type=int, default=3)
    ap.add_argument('--angles-from-json', action='store_true', help='reuse byAngle from the existing sgraFlow.json')
    a = ap.parse_args()
    res = json.load(open(os.path.join(HERE, 'riaf_results.json')))
    A_ = res['models'][0]
    C_ = res['models'][2]
    params = (A_['n0_cm3'], A_['T0_K'], A_['n0nt_cm3'], A_['p'])
    npix = 100 if a.quick else 400
    na, nw = (90, 16) if a.quick else (360, 32)
    h, ecl, world, sun_i = flow_axis()

    jobs = [(params, float(i), npix) for i in range(0, 95, 5)] + [(params, 150.0, npix)]
    # (name, model, r (M), frame, i (deg), rows, columns, alpha from, to (deg)). From 2.02 M the whole sky outside the
    # shadow is a disc 14.8 deg across overhead: its rows cover 140-180 deg (the flow in front of the shadow, below
    # 140 deg, is under 1e-3 of the light there).
    near = [
        ('near_r20_static_i30', params, 20.0, 'static', 30.0, na, nw, 0.0, 180.0),
        ('near_r6_static_i60', params, 6.0, 'static', 60.0, na, nw, 0.0, 180.0),
        ('near_r2.02_static_i30', params, 2.02, 'static', 30.0, (8 * na) // 9, nw, 140.0, 180.0),
        ('near_r1_rain_i30', params, 1.0, 'rain', 30.0, na, nw, 0.0, 180.0),
        ('scene_sgr_a_star_flow', params, 20.0, 'static', float(sun_i), 2 * na, 2 * nw, 0.0, 180.0),
    ]
    t0 = time.time()
    with Pool(a.procs) as pool:
        if a.angles_from_json:
            old = json.load(open(OUT_JSON, encoding='utf-8'))['byAngle']
            rows = [(float(d), fv, f230, 0.0) for d, fv, f230 in zip(old['deg'], old['vJy'], old['mm230Jy']) if d <= 90 or d == 150]
            npix = int(old['rays'].split(' ')[0])
        else:
            rows = pool.map(by_angle_row, jobs)
        nears = pool.map(near_ref, near)
    by = {incl: (fv, f230) for incl, fv, f230, _ in rows}
    for incl, fv, f230, dt in rows:
        print(f'  i = {incl:5.1f}: V {fv * 1e3:.4f} mJy ({-2.5 * np.log10(fv / V_ZERO_JY):.3f}), 230 GHz {f230:.4f} Jy  [{dt:.0f} s]', flush=True)
    mirror = {'tracedDeg': 150, 'vRatio': by[150.0][0] / by[30.0][0], 'mm230Ratio': by[150.0][1] / by[30.0][1]}
    print('  mirror check 150/30:', mirror)
    angles = list(range(0, 185, 5))
    vj = [by[float(i if i <= 90 else 180 - i)][0] for i in angles]
    mj = [by[float(i if i <= 90 else 180 - i)][1] for i in angles]

    os.makedirs(REF, exist_ok=True)
    index = {'format': 'lightspeed.sgra-flow-refs', 'version': 1, 'model': 'A', 'frequenciesHz': [V_HZ] + MM_HZ + [V_HZ],
             'channels': ['V, power-law electrons only (as drawn)', '150 GHz', '230 GHz', '345 GHz', 'V, all electrons'],
             'far': [{'name': 'far_i30', 'files': {'V': 'far_i30_V.npy', '230': 'far_i30_230.npy'},
                      'units': {'V': 'Jy/sr', '230': 'erg/s/cm2/Hz/sr'}, 'camera': 'infinity (rays from z = 1500 M, parallel)',
                      'inclinationDeg': 30, 'imagePlaneM': [-30, 30, 200],
                      'layout': 'image[row = y index, col = x index], the axis projected towards +y; I_inf'}],
             'near': []}
    scene = None
    for name, ro, frame, incl, al, om, I, lnk, steps, dt in nears:
        # the scene's camera gives numbers only (its picture is not a test reference)
        if not name.startswith('scene'):
            np.save(os.path.join(REF, name + '.npy'), I.astype(np.float32))
        s = summarise(I, al, om, lnk)
        da = al[1] - al[0]
        entry = {'name': name, 'file': name + '.npy', 'rM': ro, 'frame': frame, 'inclinationDeg': incl,
                 'alpha': {'from': float(al[0] - da / 2), 'to': float(al[-1] + da / 2), 'n': len(al), 'at': 'cell centres, radians'},
                 'omega': {'n': len(om), 'at': '2 pi (k + 1/2) / n from the axis projection towards axis x ref'},
                 'shape': list(I.shape), 'units': 'Jy/sr, I_inf, frequencies as frequenciesHz', 'steps': int(steps),
                 'summary': s}
        print(f'  {name}: {json.dumps(s)}  [{dt:.0f} s, {steps} steps]', flush=True)
        if name.startswith('scene'):
            scene = (ro, incl, s)
        else:
            index['near'].append(entry)
    json.dump(index, open(os.path.join(REF, 'index.json'), 'w'), indent=1)

    ro, incl, s = scene
    shadow = float(np.degrees(np.arctan2(3 * np.sqrt(3) * np.sqrt(ro - 2), (ro - 3) * np.sqrt(ro + 6))))
    out = {
        'format': 'lightspeed.sgra-flow',
        'version': 1,
        'written': 'scripts/sgra-flow/flow_tables.py' + (' --quick' if a.quick else ''),
        'model': {
            'name': 'A',
            'n0Cm3': A_['n0_cm3'], 't0K': A_['T0_K'], 'n0NonThermalCm3': A_['n0nt_cm3'], 'p': A_['p'],
            'gammaMin': 100.0, 'gammaMax': 1e8, 'beta': 10.0, 'pitchDeg': 60.0,
            'densityLaw': 'n_th = n0 rho^-1.1 exp(-z^2/2rho^2); n_nt = n0nt rho^-2.9 exp(-z^2/2rho^2); T_e = T0 r^-0.84; B^2/8pi = n_th m_p c^2/(6 beta r)',
            'velocityLaw': 'Keplerian Omega = r^-1.5 about the axis for r >= 6 M; inside, the ISCO plunge (E = sqrt(8/9), u^phi = sqrt(12)/r^2), made time-like everywhere',
            'massMsun': res['M_Msun'], 'distancePc': res['D_pc'], 'rgCm': res['r_g_cm'],
        },
        'emission': emission_constants(A_),
        'axis': {
            'source': 'GRAVITY Collaboration 2023 (A&A 677, L10), Table 2: the near-infrared flares orbit at i = 154.9 +- 4.6 deg, Omega = 177.3 deg',
            'eastNorthAway': [round(float(x), 6) for x in h],
            'eclipticJ2000': [round(float(x), 6) for x in ecl],
            'world': [round(float(x), 6) for x in world],
            'sunAngleDeg': round(float(sun_i), 4),
        },
        'fit': {
            'inclinationDeg': A_['inclination_deg'],
            'fluxJy': A_['flux_Jy'],
            'vMag8277': A_['mags_at_Earth_no_dust']['V'],
            'bMinusV': A_['B_minus_V'],
            'spectralIndex': -0.5,
            'vRingRadiusM': A_['V_ring_radius_rg'],
            'vSurfaceBrightness': A_['V_surface_brightness'],
            'ring230DiameterUas': A_['ring230_diameter_uas'],
            'ring230Blur20DiameterUas': A_['ring230_blur20uas_diameter_uas'],
            'tb230PeakK': A_['Tb230_peak_K'],
            'thermalShareOfV': A_['thermal_only_V_Jy'] / A_['flux_Jy']['5.45e+14'],
            'modelCVJy': C_['flux_Jy']['5.45e+14'],
            'modelCVMag8277': C_['mags_at_Earth_no_dust']['V'],
        },
        'byAngle': {
            'deg': angles,
            'vJy': [float(x) for x in vj],
            'mm230Jy': [float(x) for x in mj],
            'rays': f'{npix} x {npix} over +-30 M',
            'mirror': mirror,
        },
        'scenes': {
            'sgr-a-star-flow': {
                'camera': 'static, r = 20 M on the line from Sgr A* to the Sun',
                'rM': ro, 'inclinationDeg': round(incl, 4),
                'vMag': round(s['vMagCam'], 3),
                'ringRadiusDeg': round(s['ringRadiusDeg'], 3),
                'shadowRadiusDeg': round(shadow, 3),
                'peakAlphaDeg': round(s['peakAlphaDeg'], 3),
            },
        },
        'limits': [
            'The simple power-law profiles make the outer flow (20-40 M) too bright: 86 GHz comes out about twice the measured 2.0 Jy.',
            'The submillimetre spectrum comes out 1-2 sigma steeper than measured (678 and 868 GHz).',
            'Its visible light is carried over from the near infrared (1.1 mJy at 2.2 um, slope -0.5): uncertain about three times either way; model C, which makes the near infrared from the hottest thermal electrons instead, is eight times fainter in V.',
            'Smooth and steady: the real flow flickers tenfold within hours, with flares several times a day.',
            'Drawn outside the horizon only; its orientation is the flares\' orbit, a model choice; spin 0.',
        ],
        'refs': {
            'BroderickLoeb2006': 'Broderick, A. E. & Loeb, A. 2006, MNRAS 367, 905',
            'Broderick2009': 'Broderick, A. E. et al. 2009, ApJ 697, 45',
            'Yuan2003': 'Yuan, F., Quataert, E. & Narayan, R. 2003, ApJ 598, 301',
            'Leung2011': 'Leung, P. K., Gammie, C. F. & Noble, S. C. 2011, ApJ 737, 21',
            'Pandya2016': 'Pandya, A. et al. 2016, ApJ 822, 34',
            'Gravity2020': 'GRAVITY Collaboration 2020, A&A 638, A2 (the near-infrared flux distribution)',
            'Gravity2023': 'GRAVITY Collaboration 2023, A&A 677, L10 (the flares\' orbit)',
            'Paugnat2024': 'Paugnat, H. et al. 2024, ApJ 977, 228 (the near-infrared spectral index)',
            'Bower2019': 'Bower, G. C. et al. 2019, ApJL 881, L2 (the submillimetre spectrum)',
            'EHT2022II': 'Event Horizon Telescope Collaboration 2022, ApJL 930, L13 (the 230 GHz flux in 2017)',
            'Bessell1998': 'Bessell, M. S., Castelli, F. & Plez, B. 1998, A&A 333, 231 (the V zero point, 3,636 Jy)',
        },
    }
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'wrote {OUT_JSON} and {REF} [{time.time() - t0:.0f} s]')


if __name__ == '__main__':
    main()
