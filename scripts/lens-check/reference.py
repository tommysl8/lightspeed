"""
The references the GPU checks of the black hole's lens compare against (scripts/lens-check/lens-check.js, its maps
and pictures checks), from the independent Python reference in scripts/schwarzschild, which shares no code with the
TypeScript or the GLSL.

What it writes, into scripts/lens-check/ref/ (committed):

  camera-maps.json      The 8 fixture cameras of make_fixtures.py (static and moving at 100, 10 and 2.5 M; the
                        raindrop at 1 M looking sideways and up), every pixel of their 48 x 32 maps by method A
                        (the closed forms in 30-digit arithmetic, observers.ship_view): whether the backward ray is
                        captured, its escape direction n_inf, ln(nu_obs/nu_inf), the look angle theta from the hole
                        in the lens frame and d(dphi)/d(theta) there (so an error in n_inf can be stated as the look
                        angle that would make it, the maps check's metric), and each camera's edge angle. With --check-b
                        every escaping pixel is also traced by method B (Taylor integration of the geodesic) and
                        the largest |dphi_B - dphi_A| is reported.
  views/<name>.png      The picture of each view at 360 x 240 by render_views.view (float64 closed forms): the sky
                        a 15-degree latitude-longitude checkerboard coloured by octant of n_inf, white lines every
                        30 degrees, black where the ray is captured.
  views/<name>-lnf.png  ln(nu_obs/nu_inf) in false colour, blue (-1.5) through white to red (+1.5), for the eye.
  views/<name>-lng16.png  ln(nu_obs/nu_inf) as 16-bit grey, value = round((ln g + 3.2768) * 1e4) (0 where captured):
                        what the check reads (8 bits are too coarse for its 0.005 tolerance).
  views/cameras.json    Every view's camera, the palette and what each colour means, and the picture's class counts.
  views/all.png         All the pictures on one sheet, for review.

The views are the 8 fixture cameras and 8 cameras of the app's scenes, all with the app's
50-degree vertical field unless said: the shadow from 20 M, the photon ring from 6 M looking along the shadow's
edge, the Einstein ring from 100 M, the fall at 10 M (the static observer's view with the raindrop's inward motion as
an aberration, as the app draws it above 3 M), at the horizon and at 0.5 r_s (the raindrop's own frame) looking
along the dark patch's edge and, with a 120-degree field, straight at the hole, and the fly-by at 0.9c from 10 M.

Conventions (as the fixtures): M = 1; positions relative to the hole in world axes; forward, up and vdir unit
vectors in world axes; phi the rapidity along vdir relative to the frame's observer ('static' or 'raindrop');
pixel (i, j) counted from the left and the top, centres at +0.5; directions are look directions (towards where
the light comes from).

Dependencies: numpy, mpmath. Run time: the pictures take a few seconds; the camera maps 3-6 minutes with 4
processes (--views-only skips them; --maps-only skips the pictures).
Usage: python scripts/lens-check/reference.py [--views-only | --maps-only] [--check-b] [--workers N] [--out DIR]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
import time
import zlib
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
REF_DIR = os.path.join(REPO, 'scripts', 'schwarzschild')
if REF_DIR not in sys.path:
    sys.path.insert(0, REF_DIR)

import render_views as RV  # noqa: E402  (float64 closed forms: the pictures)

W_VIEW, H_VIEW = 360, 240
APP_FOVY = 50.0
LNG16_OFFSET = 3.2768
LNG16_SCALE = 1e4

# The palette of render_views.view: octant k = (x > 0) + 2 (y > 0) + 4 (z > 0) of n_inf, dark cells x 0.55.
PALETTE = [[230, 90, 80], [240, 180, 60], [90, 180, 90], [70, 150, 220],
           [200, 110, 200], [120, 200, 200], [220, 220, 220], [150, 120, 90]]


def unit(v):
    v = np.asarray(v, float)
    return (v / np.linalg.norm(v)).tolist()


def rot_y(deg):
    """Looking from +z at the hole (forward -z), turned by deg towards +x."""
    a = math.radians(deg)
    return [math.sin(a), 0.0, -math.cos(a)]


FIXTURE_VIEWS = [dict(cam, fovy=cam['fovy']) for cam in RV.CAMS]

APP_VIEWS = [
    dict(name='app-shadow-20M', scene='sgr-a-star-shadow', frame='static', pos=[0, 0, 20], forward=[0, 0, -1], up=[0, 1, 0], fovy=APP_FOVY, phi=0, vdir=None),
    dict(name='app-photon-ring-6M', scene='photon-ring', frame='static', pos=[0, 0, 6], forward=rot_y(45.0), up=[0, 1, 0], fovy=APP_FOVY, phi=0, vdir=None),
    dict(name='app-einstein-ring-100M', scene='sgr-a-star-einstein-ring', frame='static', pos=[0, 0, 100], forward=[0, 0, -1], up=[0, 1, 0], fovy=APP_FOVY, phi=0, vdir=None),
    # Above 3 M the app draws the raindrop's view as the static observer's aberrated by the raindrop's inward speed.
    dict(name='app-fall-10M', scene='fall-into-sgr-a-star', frame='static', pos=[0, 0, 10], forward=[0, 0, -1], up=[0, 1, 0], fovy=APP_FOVY, phi=math.atanh(math.sqrt(0.2)), vdir=[0, 0, -1]),
    dict(name='app-fall-horizon-edge', scene='fall-into-sgr-a-star', frame='raindrop', pos=[0, 0, 2], forward=rot_y(42.10), up=[0, 1, 0], fovy=APP_FOVY, phi=0, vdir=None),
    dict(name='app-fall-horizon-ahead', scene='fall-into-sgr-a-star', frame='raindrop', pos=[0, 0, 2], forward=[0, 0, -1], up=[0, 1, 0], fovy=120.0, phi=0, vdir=None),
    dict(name='app-fall-half-rs-edge', scene='fall-into-sgr-a-star', frame='raindrop', pos=[0, 0, 1], forward=rot_y(53.3), up=[0, 1, 0], fovy=APP_FOVY, phi=0, vdir=None),
    dict(name='app-flyby-10M', scene='sgr-a-star-flyby', frame='static', pos=[0, 0, 10], forward=[1, 0, 0], up=[0, 1, 0], fovy=APP_FOVY, phi=math.atanh(0.9), vdir=[1, 0, 0]),
]


# ─── PNG writers (no imaging library) ─────────────────────────────────────────────────────────

def _png(path, w, h, colour_type, bit_depth, rows):
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = b''.join(b'\x00' + r for r in rows)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, bit_depth, colour_type, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def png_rgb(path, img):
    h, w, _ = img.shape
    _png(path, w, h, 2, 8, [img[y].astype(np.uint8).tobytes() for y in range(h)])


def png_grey16(path, a):
    h, w = a.shape
    _png(path, w, h, 0, 16, [a[y].astype('>u2').tobytes() for y in range(h)])


# ─── the views ────────────────────────────────────────────────────────────────────────────────

def rays(cam, W, H):
    """Per pixel, the look direction in the frame's observer's rest frame, ln D of the ship's motion, and theta
    (angle from the hole's direction), with render_views' own camera and aberration (so they match its picture)."""
    pos = np.array(cam['pos'], float)
    r = np.linalg.norm(pos)
    rhat = pos / r
    f = RV.unit(np.array(cam['forward'], float))
    up = np.array(cam['up'], float)
    rgt = RV.unit(np.cross(f, up))
    upv = np.cross(rgt, f)
    t = np.tan(np.radians(cam['fovy']) / 2)
    ii, jj = np.meshgrid(np.arange(W), np.arange(H))
    x = (2 * (ii + 0.5) / W - 1) * (W / H) * t
    y = (1 - 2 * (jj + 0.5) / H) * t
    d = RV.unit(f[None, None, :] + x[..., None] * rgt + y[..., None] * upv).reshape(-1, 3)
    lnD = np.zeros(len(d))
    if cam['phi']:
        d, lnD = RV.to_rest(d, RV.unit(np.array(cam['vdir'], float)), cam['phi'])
    inward = -rhat
    th = 2 * np.arctan2(np.linalg.norm(d - inward, axis=-1), np.linalg.norm(d + inward, axis=-1))
    return r, th, lnD


def ln_g(cam, W, H):
    """ln(nu_obs/nu_inf) per pixel from the closed forms (NaN where no light arrives from outside)."""
    r, th, lnD = rays(cam, W, H)
    if cam['frame'] == 'static':
        return (-0.5 * np.log1p(-2 / r) + lnD).reshape(H, W)
    v = math.sqrt(2 / r)
    den = 1 - v * np.cos(th)
    return np.where(den > 0, -np.log(np.where(den > 0, den, 1)) + lnD, np.nan).reshape(H, W)


def classes(img):
    """Class of each pixel of a render_views picture: 0 captured, 1 line, 2 + 2k + cell for octant k, cell 0 dark /
    1 light. Raises if any colour is not one of the palette's (the picture and the decoder disagree)."""
    img = img.astype(np.int32)
    out = np.full(img.shape[:2], -1, np.int32)
    out[(img == 0).all(-1)] = 0
    out[(img == 255).all(-1)] = 1
    for k, p in enumerate(PALETTE):
        for cell, s in ((0, 0.55), (1, 1.0)):
            col = (np.array(p, float) * s).astype(np.uint8).astype(np.int32)
            out[(img == col).all(-1)] = 2 + 2 * k + cell
    if (out < 0).any():
        raise ValueError(f'{int((out < 0).sum())} pixels of an unknown colour')
    return out


def write_views(out_dir):
    views_dir = os.path.join(out_dir, 'views')
    os.makedirs(views_dir, exist_ok=True)
    meta = dict(
        schema='lightspeed.lens-check.views/1',
        generator='scripts/lens-check/reference.py with scripts/schwarzschild/render_views.py (float64 closed forms)',
        size=[W_VIEW, H_VIEW],
        lng16=dict(offset=LNG16_OFFSET, scale=LNG16_SCALE, captured=0, note='value = round((ln g + offset) * scale)'),
        classes=dict(captured=0, line=1, octant='2 + 2k + cell: k = (x > 0) + 2 (y > 0) + 4 (z > 0) of n_inf, cell 1 light, 0 dark'),
        palette=PALETTE,
        palette_dark_scale=0.55,
        cells_deg=15,
        lines_every_deg=30,
        line_half_width_deg=0.6,
        views=[],
    )
    sheet = []
    for cam in FIXTURE_VIEWS + APP_VIEWS:
        img, gc = RV.view(cam, W_VIEW, H_VIEW)
        cls = classes(img)
        lg = ln_g(cam, W_VIEW, H_VIEW)
        captured = cls == 0
        # The ln g picture must be defined wherever light arrives, and render_views must agree on what is captured.
        undefined = ~np.isfinite(lg) & ~captured
        if undefined.any():
            raise ValueError(f"{cam['name']}: ln g undefined at {int(undefined.sum())} uncaptured pixels")
        q = np.where(captured, 0, np.clip(np.round((np.nan_to_num(lg) + LNG16_OFFSET) * LNG16_SCALE), 1, 65535)).astype(np.uint16)
        png_rgb(os.path.join(views_dir, f"{cam['name']}.png"), img)
        png_rgb(os.path.join(views_dir, f"{cam['name']}-lnf.png"), gc)
        png_grey16(os.path.join(views_dir, f"{cam['name']}-lng16.png"), q)
        counts = np.bincount(cls.ravel(), minlength=18)
        entry = {k: v for k, v in cam.items()}
        entry['vdir'] = cam['vdir']
        entry.update(W=W_VIEW, H=H_VIEW, captured_share=round(float(captured.mean()), 6),
                     class_counts=[int(c) for c in counts],
                     ln_g_range=[round(float(np.nanmin(np.where(captured, np.nan, lg))), 6),
                                 round(float(np.nanmax(np.where(captured, np.nan, lg))), 6)] if not captured.all() else None)
        meta['views'].append(entry)
        sheet.append(img)
        print(f"  {cam['name']:<26} captured {captured.mean() * 100:6.2f} %  ln g {entry['ln_g_range']}", flush=True)
    pad = lambda a: np.pad(a, ((4, 4), (4, 4), (0, 0)), constant_values=40)
    if len(sheet) % 2:
        sheet.append(np.zeros_like(sheet[0]))
    rows = [np.concatenate([pad(sheet[i]), pad(sheet[i + 1])], 1) for i in range(0, len(sheet), 2)]
    png_rgb(os.path.join(views_dir, 'all.png'), np.concatenate(rows, 0))
    with open(os.path.join(views_dir, 'cameras.json'), 'w', newline='\n') as f:
        json.dump(meta, f, indent=1)
        f.write('\n')
    return meta


# ─── the camera maps (30-digit arithmetic, in worker processes) ────────────────────────────────

def _pixel(args):
    ci, i, j, d, check_b = args
    import mpmath as mp
    import make_fixtures as MF
    import observers as O
    import schw_mp as A
    MF.setdps(30)
    cam = MF.CAMERAS[ci]
    pos = [mp.mpf(x) for x in cam['pos']]
    dd = [mp.mpf(x) for x in d]
    vdir = [mp.mpf(x) for x in cam['vdir']] if cam['vdir'] else None
    va = O.ship_view(pos, dd, vdir, mp.mpf(cam['phi']), cam['frame'], method='A')
    rec = dict(i=i, j=j, captured=bool(va['captured']), theta=float(va['theta']), ln_g=None if va['ln_g'] is None else float(va['ln_g']))
    if not va['captured']:
        rec['n_inf'] = [float(x) for x in va['n_inf']]
        rec['dphi'] = float(va['dphi'])
        # d(dphi)/d(theta) by a central difference, 30 digits: good to about 1e-18 relative away from the edge.
        r = O.norm(pos)
        th = va['theta']
        h = mp.mpf('1e-12') * max(mp.mpf(1), th)
        sweep = (lambda t: A.escape_sweep_static(r, t)[1]) if cam['frame'] == 'static' else (lambda t: A.escape_sweep_raindrop(r, t)[1])
        lo, hi = sweep(th - h), sweep(th + h)
        rec['ddphi_dtheta'] = float((hi - lo) / (2 * h)) if lo is not None and hi is not None else None
        if check_b:
            vb = O.ship_view(pos, dd, vdir, mp.mpf(cam['phi']), cam['frame'], method='B')
            rec['dB'] = 'capture mismatch' if vb['captured'] else float(vb['dphi'] - va['dphi'])
    return ci, rec


def g12(x):
    """A float to 12 significant digits (far below every tolerance of the checks, and a third of the size)."""
    return None if x is None else float(f'{x:.12g}')


def write_maps(out_dir, workers, check_b):
    import make_fixtures as MF
    import observers as O
    import schw_mp as A
    MF.setdps(30)
    jobs = [(ci, i, j, d, check_b) for (ci, i, j, d) in MF.camera_jobs(False)]
    t0 = time.time()
    with Pool(workers) as pool:
        res = pool.map(_pixel, jobs, chunksize=16)
    print(f'  {len(jobs)} pixels in {time.time() - t0:.0f} s', flush=True)
    cams = []
    worst_b = 0.0
    for ci, cam in enumerate(MF.CAMERAS):
        px = sorted((r for c, r in res if c == ci), key=lambda r: (r['j'], r['i']))
        r = math.sqrt(sum(float(x) ** 2 for x in cam['pos']))
        edge = float(A.shadow_angle(r)) if cam['frame'] == 'static' else float(O.raindrop_dark_radius(r))
        # The edge must separate the captured pixels from the rest (a check of the file, not of the physics).
        cap = [p['theta'] for p in px if p['captured']]
        esc = [p['theta'] for p in px if not p['captured']]
        if cap and esc and cam['frame'] == 'static':
            assert max(cap) <= edge < min(esc), f"{cam['name']}: the edge does not separate the classes"
        for p in px:
            if check_b and isinstance(p.get('dB'), float):
                worst_b = max(worst_b, abs(p['dB']))
        cams.append(dict(
            name=cam['name'], frame=cam['frame'], pos=cam['pos'], forward=cam['forward'], up=cam['up'], fovy=cam['fovy'],
            phi=cam['phi'], vdir=cam['vdir'], W=MF.W, H=MF.H, edgeRad=edge,
            captured=[1 if p['captured'] else 0 for p in px],
            nInf=[[g12(x) for x in p['n_inf']] if not p['captured'] else None for p in px],
            lnG=[g12(p['ln_g']) for p in px],
            theta=[g12(p['theta']) for p in px],
            dDphiDTheta=[g12(p.get('ddphi_dtheta')) for p in px],
        ))
    doc = dict(
        schema='lightspeed.lens-check.camera-maps/1',
        generator='scripts/lens-check/reference.py: scripts/schwarzschild observers.ship_view, method A, 30 digits',
        units='M = 1; angles in radians; directions are look directions in world axes about the hole',
        pixelOrder='row-major from the top-left pixel: index = j * W + i',
        methodB=dict(checked=check_b, maxAbsDphiDifference=worst_b if check_b else None),
        cameras=cams,
    )
    with open(os.path.join(out_dir, 'camera-maps.json'), 'w', newline='\n') as f:
        json.dump(doc, f, separators=(',', ':'))
        f.write('\n')
    if check_b:
        print(f'  method B agrees to {worst_b:.2e} rad in dphi', flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument('--out', default=os.path.join(HERE, 'ref'), help='folder to write into (default scripts/lens-check/ref)')
    ap.add_argument('--views-only', action='store_true')
    ap.add_argument('--maps-only', action='store_true')
    ap.add_argument('--check-b', action='store_true', help='also trace every escaping map pixel by method B')
    ap.add_argument('--workers', type=int, default=4)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    if not args.maps_only:
        print('views:', flush=True)
        write_views(args.out)
    if not args.views_only:
        print('camera maps:', flush=True)
        write_maps(args.out, args.workers, args.check_b)
    print('done', flush=True)


if __name__ == '__main__':
    main()
