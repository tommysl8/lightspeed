"""Builds the Milky Way sky background from NASA SVS "Deep Star Maps 2020" (https://svs.gsfc.nasa.gov/4851).

Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC.
SVS states that its content is in the public domain unless otherwise noted; the page notes only the credit lines.

Input (cached, never re-downloaded):
  data-raw/galaxy/milkyway_2020_4k.exr   "Milky Way background" layer, celestial (ICRF/J2000) plate carree,
                                         4096 x 2048, half-float linear RGB. The Hipparcos and Tycho stars are
                                         omitted; what remains is the summed light of the fainter Gaia DR2 stars.
Optional, only for the photometric calibration written to the JSON:
  data-raw/galaxy/hiptyc_2020_4k.exr     bright-star layer (same scale as the full star map)
  data-raw/galaxy/starmap_2020_4k.exr    full star map (= 0.5 x milkyway + hiptyc, verified below)
  data-raw/hyg_v44.csv.gz                HYG v4.4 (V magnitudes of isolated stars)

Outputs:
  public/textures/milkyway-bg.jpg        4096 x 2048, log-encoded (see ENCODING), baseline JPEG, 4:2:0, no ICC profile
  public/textures/milkyway-bg-2k.jpg     2048 x 1024, same encoding (2 x 2 average taken in linear light)
  public/textures/milkyway-bg.json       projection, encoding and calibration metadata

Projection (identical to the source): pixel (i, j), column i from the left and row j from the top, covers the
direction RA = 360 * (0.5 - (i + 0.5) / W) mod 360 deg, Dec = 90 - 180 * (j + 0.5) / H deg (ICRS). RA = 0 is the
centre column and RA increases to the LEFT (the sky seen from inside). Verified here with 6,600 HYG stars.

Encoding: each channel stores e = ln(1 + p / P0) / ln(1 + PMAX / P0) as an 8-bit value e * 255, where p is the SVS
linear pixel value (0..1). Decode: p = P0 * (exp(e * ln(1 + PMAX / P0)) - 1).

Run: python scripts/build-milkyway-bg.py   (Python 3.10+ with numpy, scipy, Pillow and OpenEXR >= 3.3)
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data-raw" / "galaxy"
OUT = ROOT / "public" / "textures"

P0 = 2e-4
PMAX = 1.0
K = math.log1p(PMAX / P0)
QUALITY_4K = 92
QUALITY_2K = 95


def read_exr(path: Path) -> np.ndarray:
    import OpenEXR  # pip install OpenEXR (>= 3.3)

    with OpenEXR.File(str(path)) as f:
        ch = f.channels()
        if "RGB" in ch:
            rgb = ch["RGB"].pixels
        else:
            rgb = np.stack([ch[c].pixels for c in "RGB"], -1)
    return rgb.astype(np.float32)


def encode(p: np.ndarray) -> np.ndarray:
    e = np.log1p(np.clip(p, 0.0, PMAX) / P0) / K
    return np.clip(np.round(e * 255.0), 0, 255).astype(np.uint8)


def decode(b: np.ndarray) -> np.ndarray:
    return P0 * np.expm1(b.astype(np.float64) / 255.0 * K)


def save_jpeg(arr: np.ndarray, path: Path, quality: int) -> int:
    buf = io.BytesIO()
    # subsampling=2 -> 4:2:0; Pillow writes no ICC profile unless one is passed.
    Image.fromarray(arr, "RGB").save(buf, "JPEG", quality=quality, subsampling=2, optimize=True, progressive=False)
    path.write_bytes(buf.getvalue())
    return len(buf.getvalue())


def calibrate(mw: np.ndarray) -> dict | None:
    """V-band surface brightness zero point for the milky way layer, from HYG stars in the hiptyc layer."""
    ht_path, full_path, hyg_path = RAW / "hiptyc_2020_4k.exr", RAW / "starmap_2020_4k.exr", ROOT / "data-raw" / "hyg_v44.csv.gz"
    if not (ht_path.exists() and full_path.exists() and hyg_path.exists()):
        return None
    from scipy.spatial import cKDTree

    ht = read_exr(ht_path)
    full = read_exr(full_path)
    H, W = mw.shape[:2]

    # 1. Relation between the layers, on pixels without a bright star.
    m = (full.max(-1) < 0.99) & (ht.max(-1) < 1e-4) & (mw.max(-1) > 2e-3)
    ratio = float(np.median(full[m] / mw[m]))

    # 2. Aperture photometry of isolated, unsaturated HYG stars (5.5 < V < 7.8) in the bright-star layer.
    rows = []
    with gzip.open(hyg_path, "rt", encoding="utf8") as f:
        for d in csv.DictReader(f):
            try:
                mag, ra, dec = float(d["mag"]), float(d["ra"]) * 15.0, float(d["dec"])
            except ValueError:
                continue
            if 5.5 < mag < 7.8:
                rows.append((ra, dec, mag))
    rows = np.array(rows)
    rr, dd = np.radians(rows[:, 0]), np.radians(rows[:, 1])
    xyz = np.stack([np.cos(dd) * np.cos(rr), np.cos(dd) * np.sin(rr), np.sin(dd)], 1)
    iso = np.array([len(p) == 1 for p in cKDTree(xyz).query_ball_point(xyz, math.radians(0.8))])
    L = ht.mean(-1)
    zps, dxs, dys = [], [], []
    for ra, dec, mag in rows[iso]:
        x = ((0.5 - ra / 360.0) % 1.0) * W
        y = (90.0 - dec) / 180.0 * H
        xi, yi = int(math.floor(x)), int(math.floor(y))
        if yi < 6 or yi > H - 7 or abs(dec) > 60:
            continue
        ys = np.arange(yi - 5, yi + 6)
        xs = np.arange(xi - 5, xi + 6)
        win = L[np.ix_(ys, xs % W)]
        bg = np.median(np.concatenate([win[0], win[-1], win[:, 0], win[:, -1]]))
        win = np.clip(win - bg, 0, None)
        s = float(win.sum())
        if win.max() >= 0.99 or s <= 0:
            continue
        dxs.append((win.sum(0) * xs).sum() / s - x)
        dys.append((win.sum(1) * ys).sum() / s - y)
        zps.append(mag + 2.5 * math.log10(s * math.cos(math.radians(dec))))
    zp_star = float(np.median(zps))
    omega_eq_arcsec2 = (360.0 * 3600.0 / W) * (180.0 * 3600.0 / H)
    zp_sb = zp_star + 2.5 * math.log10(omega_eq_arcsec2) - 2.5 * math.log10(ratio)

    def cap(ra0: float, dec0: float, rad: float = 2.0) -> float:
        j = np.arange(H)
        i = np.arange(W)
        decs = np.radians(90 - (j + 0.5) / H * 180)
        ras = np.radians((360 * (0.5 - (i + 0.5) / W)) % 360)
        D, R = np.meshgrid(decs, ras, indexing="ij")
        c = np.sin(D) * math.sin(math.radians(dec0)) + np.cos(D) * math.cos(math.radians(dec0)) * np.cos(R - math.radians(ra0))
        sel = c > math.cos(math.radians(rad))
        w = np.cos(D)[sel]
        return float((mw.mean(-1)[sel] * w).sum() / w.sum())

    samples = {}
    for name, ra0, dec0 in [
        ("northGalacticPole", 192.85948, 27.12825),
        ("southGalacticPole", 12.85948, -27.12825),
        ("galacticCentre", 266.405, -28.936),
        ("scutumStarCloud", 280.0, -8.0),
        ("galacticAnticentre", 86.405, 28.936),
    ]:
        p = cap(ra0, dec0)
        samples[name] = {"p": round(p, 6), "muV": round(zp_sb - 2.5 * math.log10(p), 2)}
    return {
        "fullMapEqualsKTimesMilkyWayPlusBrightStars": round(ratio, 4),
        "pixelCentreCheck": {"note": "median star centroid minus the stated pixel-centre convention, in pixels (0 = convention holds)", "medianDx_px": round(float(np.median(dxs)) + 0.5, 3), "medianDy_px": round(float(np.median(dys)) + 0.5, 3), "stars": len(zps)},
        "zeroPointStarSum": round(zp_star, 3),
        "zeroPointStarSumScatterMAD": round(float(np.median(np.abs(np.array(zps) - zp_star))), 3),
        "surfaceBrightnessZeroPoint": round(zp_sb, 3),
        "samples": samples,
    }


def main() -> None:
    src = RAW / "milkyway_2020_4k.exr"
    mw = read_exr(src)
    H, W = mw.shape[:2]
    assert (W, H) == (4096, 2048), (W, H)
    OUT.mkdir(parents=True, exist_ok=True)

    e4 = encode(mw)
    n4 = save_jpeg(e4, OUT / "milkyway-bg.jpg", QUALITY_4K)
    mw2 = mw.reshape(H // 2, 2, W // 2, 2, 3).mean((1, 3))
    e2 = encode(mw2)
    n2 = save_jpeg(e2, OUT / "milkyway-bg-2k.jpg", QUALITY_2K)

    # Round-trip error of the shipped 4K file, measured at 1024 x 512 (what the eye integrates at wide fields).
    rec = decode(np.asarray(Image.open(OUT / "milkyway-bg.jpg").convert("RGB")))
    def down(a: np.ndarray, f: int) -> np.ndarray:
        h, w = a.shape[:2]
        return a.reshape(h // f, f, w // f, f, -1).mean((1, 3))
    ls, lr = down(mw, 4).mean(-1), down(rec, 4).mean(-1)
    rel = np.abs(lr - ls) / np.maximum(ls, P0)

    cal = calibrate(mw)
    meta = {
        "files": {"milkyway-bg.jpg": {"width": 4096, "height": 2048, "bytes": n4}, "milkyway-bg-2k.jpg": {"width": 2048, "height": 1024, "bytes": n2}},
        "source": {
            "product": "NASA SVS Deep Star Maps 2020, 'Milky Way background' layer, celestial coordinates, milkyway_2020_4k.exr",
            "url": "https://svs.gsfc.nasa.gov/4851",
            "credit": "NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC.",
            "content": "Summed light of Gaia DR2 stars fainter than the Hipparcos/Tycho catalogues (those bright stars are omitted), rendered by SVS. Contains stellar light and its real dust absorption; no nebular emission, zodiacal light or airglow.",
        },
        "projection": {
            "type": "plate carree (equirectangular)",
            "frame": "ICRS / J2000 equatorial (geocentric directions; parallax of the background is negligible)",
            "pixelCentre": "RA = 360 * (0.5 - (i + 0.5) / W) mod 360, Dec = 90 - 180 * (j + 0.5) / H; i = column from the left, j = row from the top",
            "orientation": "RA = 0 at the image centre, RA increasing to the left; north (Dec +90) at the top",
            "threeJsUV": "u = fract(0.5 - RA / 360), v = 0.5 + Dec / 180 with the default flipY = true",
        },
        "encoding": {
            "type": "per-channel logarithmic, 8 bit, sRGB primaries, linear light after decoding",
            "P0": P0,
            "PMAX": PMAX,
            "decode": "p = P0 * (exp(e * ln(1 + PMAX / P0)) - 1), e = byte / 255",
            "lnOnePlusPmaxOverP0": K,
            "loadAs": "THREE.NoColorSpace (the bytes are not sRGB; do not let the browser or three.js apply sRGB decoding)",
            "roundTripErrorAt1024": {"medianRelative": round(float(np.median(rel)), 4), "p95Relative": round(float(np.percentile(rel, 95)), 4)},
        },
        "calibration": cal,
        "calibrationNote": "The full SVS star map equals 0.5 x this layer + the bright-star layer (measured ratio above), so the physically consistent background is 0.5 p. Star sums in the bright-star layer (x cos Dec, because the maps are rendered per unit solid angle) give V = zeroPointStarSum - 2.5 log10(sum). Hence the V-band surface brightness of a texel is muV = surfaceBrightnessZeroPoint - 2.5 log10(p) mag/arcsec^2 (uncertainty about 0.3 mag: HYG V against the SVS colour rendering). It excludes stars brighter than the Tycho-2 limit (V ~ 11), which the app draws as points.",
    }
    (OUT / "milkyway-bg.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf8", newline="\n")
    print(json.dumps({k: meta[k] for k in ("files", "encoding", "calibration")}, indent=2))


if __name__ == "__main__":
    main()
