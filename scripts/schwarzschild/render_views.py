"""
Pictures of what the observer sees, from the float64 closed forms (schw64): the same cameras as the fixture
camera maps, at 360 x 240, with the distant sky painted as a latitude-longitude checkerboard (15-degree cells,
colour by octant, thin lines every 30 degrees) so the lensing is visible; black = captured. Also a false-colour
panel of ln(nu_obs/nu_inf). Writes <out>/*.png (plain zlib PNG writer, no imaging library).

The reference pictures scripts/lens-check compares whole frames against. Dependencies: numpy.
Run: python render_views.py [--out DIR] [--size WxH]   (default views/ and 360x240; about a second).
Shares no code with the TypeScript or the GLSL.
"""
import argparse
import os
import struct
import warnings
import zlib

import numpy as np

import schw64 as S

warnings.filterwarnings('ignore')
S.use(np.float64)


def png(path, img):
    h, w, _ = img.shape
    raw = b''.join(b'\x00' + img[y].astype(np.uint8).tobytes() for y in range(h))
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def unit(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def to_rest(d, v, phi):
    """ship-frame directions d (N,3) -> rest frame, velocity v (unit), rapidity phi: tan(th/2) = e^phi tan(th'/2)."""
    s = np.linalg.norm(d - v, axis=-1)
    c = np.linalg.norm(d + v, axis=-1)
    th = 2 * np.arctan2(np.exp(phi) * s, c)
    cp = (d @ v)[:, None]
    perp = d - cp * v
    pl = np.linalg.norm(perp, axis=-1, keepdims=True)
    perp = np.where(pl > 0, perp / np.maximum(pl, 1e-300), 0)
    return np.cos(th)[:, None] * v + np.sin(th)[:, None] * perp, -np.log(np.exp(-phi) * (c / 2) ** 2 + np.exp(phi) * (s / 2) ** 2)


def view(cam, W=360, H=240):
    pos = np.array(cam['pos'], float)
    r = np.linalg.norm(pos)
    rhat = pos / r
    f = unit(np.array(cam['forward'], float))
    up = np.array(cam['up'], float)
    rgt = unit(np.cross(f, up))
    upv = np.cross(rgt, f)
    t = np.tan(np.radians(cam['fovy']) / 2)
    ii, jj = np.meshgrid(np.arange(W), np.arange(H))
    x = (2 * (ii + 0.5) / W - 1) * (W / H) * t
    y = (1 - 2 * (jj + 0.5) / H) * t
    d = unit(f[None, None, :] + x[..., None] * rgt + y[..., None] * upv).reshape(-1, 3)
    lnD = np.zeros(len(d))
    if cam['phi']:
        d, lnD = to_rest(d, unit(np.array(cam['vdir'], float)), cam['phi'])
    inward = -rhat
    th = 2 * np.arctan2(np.linalg.norm(d - inward, axis=-1), np.linalg.norm(d + inward, axis=-1))
    if cam['frame'] == 'static':
        cap, dphi, _ = S.static_escape(r, th)
        lng = -0.5 * np.log(1 - 2 / r) + lnD
    else:
        v = np.sqrt(2 / r)
        den = 1 - v * np.cos(th)
        b = r * np.sin(th) / np.where(den > 0, den, np.nan)
        dd = b / S.BC - 1
        ok = (den > 0) & (dd < 0)
        dphi = np.full(len(th), np.nan)
        C = S.roots_complex(np.minimum(dd[ok], -1e-300))
        dphi[ok] = S.phi_between_complex(C, np.zeros(ok.sum()), np.full(ok.sum(), 1 / r))
        cap = ~ok
        lng = -np.log(np.where(den > 0, den, np.nan)) + lnD
    e = d - (d @ rhat)[:, None] * rhat
    e = e / np.maximum(np.linalg.norm(e, axis=-1, keepdims=True), 1e-300)
    n = np.cos(dphi)[:, None] * rhat + np.sin(dphi)[:, None] * e
    lat = np.degrees(np.arcsin(np.clip(n[:, 2], -1, 1)))
    lon = np.degrees(np.arctan2(n[:, 1], n[:, 0]))
    cell = (np.floor(lat / 15) + np.floor(lon / 15)).astype(int) & 1
    octant = (n[:, 0] > 0).astype(int) + 2 * (n[:, 1] > 0) + 4 * (n[:, 2] > 0)
    pal = np.array([[230, 90, 80], [240, 180, 60], [90, 180, 90], [70, 150, 220],
                    [200, 110, 200], [120, 200, 200], [220, 220, 220], [150, 120, 90]], float)
    col = pal[octant] * (0.55 + 0.45 * cell[:, None])
    line = (np.abs(((lat + 15) % 30) - 15) < 0.6) | (np.abs(((lon + 15) % 30) - 15) < 0.6)
    col[line] = 255
    col[cap | ~np.isfinite(dphi)] = 0
    img = col.reshape(H, W, 3)
    # false colour of ln g: blue (redshift) .. white (0) .. red (blueshift), +-1.5
    z = np.clip(np.nan_to_num(lng, nan=0) / 1.5, -1, 1)
    gc = np.stack([np.where(z > 0, 255, 255 * (1 + z)), 255 * (1 - np.abs(z)), np.where(z < 0, 255, 255 * (1 - z))], -1)
    gc[cap | ~np.isfinite(dphi)] = 0
    return img, gc.reshape(H, W, 3)


CAMS = [
    dict(name='static-100M', frame='static', pos=[0, 0, 100], forward=[0, 0, -1], up=[0, 1, 0], fovy=30, phi=0, vdir=None),
    dict(name='moving-100M', frame='static', pos=[0, 0, 100], forward=[0, 0, -1], up=[0, 1, 0], fovy=30, phi=1.0, vdir=[0.7071067811865476, 0, -0.7071067811865476]),
    dict(name='static-10M', frame='static', pos=[0, 0, 10], forward=[0, 0, -1], up=[0, 1, 0], fovy=90, phi=0, vdir=None),
    dict(name='moving-10M', frame='static', pos=[0, 0, 10], forward=[0, 0, -1], up=[0, 1, 0], fovy=90, phi=1.0, vdir=[0.7071067811865476, 0, -0.7071067811865476]),
    dict(name='static-2.5M', frame='static', pos=[0, 0, 2.5], forward=[1, 0, 0], up=[0, 1, 0], fovy=90, phi=0, vdir=None),
    dict(name='moving-2.5M', frame='static', pos=[0, 0, 2.5], forward=[1, 0, 0], up=[0, 1, 0], fovy=90, phi=1.0, vdir=[0.7071067811865476, 0, -0.7071067811865476]),
    dict(name='raindrop-1M-sideways', frame='raindrop', pos=[0, 0, 1], forward=[1, 0, 0], up=[0, 0, 1], fovy=120, phi=0, vdir=None),
    dict(name='raindrop-1M-up', frame='raindrop', pos=[0, 0, 1], forward=[0, 0, 1], up=[0, 1, 0], fovy=120, phi=0, vdir=None),
]

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument('--out', default='views', help='folder for the PNGs (created if missing)')
    ap.add_argument('--size', default='360x240', help='width x height of each view in pixels')
    args = ap.parse_args()
    W, H = (int(x) for x in args.size.lower().split('x'))
    out = args.out
    os.makedirs(out, exist_ok=True)
    tiles, gtiles = [], []
    for cam in CAMS:
        img, gc = view(cam, W, H)
        png(os.path.join(out, f"{cam['name']}.png"), img)
        png(os.path.join(out, f"{cam['name']}-lnf.png"), gc)
        tiles.append(img)
        gtiles.append(gc)
    pad = lambda a: np.pad(a, ((4, 4), (4, 4), (0, 0)), constant_values=40)
    rows = [np.concatenate([pad(tiles[i]), pad(tiles[i + 1])], 1) for i in range(0, 8, 2)]
    png(os.path.join(out, 'all.png'), np.concatenate(rows, 0))
    rows = [np.concatenate([pad(gtiles[i]), pad(gtiles[i + 1])], 1) for i in range(0, 8, 2)]
    png(os.path.join(out, 'all-lnf.png'), np.concatenate(rows, 0))
    print('written', len(CAMS) * 2 + 2, 'pngs')
