"""Builds the Milky Way sky's fine detail from NASA SVS "Deep Star Maps 2020" (https://svs.gsfc.nasa.gov/4851).

Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC.
SVS states that its content is in the public domain unless otherwise noted; the page notes only the credit lines.

Input (not kept in the repository: 137 MB, fetched once from the SVS page and passed as the argument):
  milkyway_2020_8k.exr    the same "Milky Way background" layer as build-milkyway-bg.py's 4K input, celestial
                          (ICRF/J2000) plate carree, 8192 x 4096, half-float linear RGB.

Processing: the log of the luminance smoothed by a Gaussian of SMOOTH_PX pixels (the single-pixel speckle reads as
grain), then encoded.

Output:
  public/textures/milkyway-detail-8k.jpg   8192 x 4096, one channel: the luminance Y = 0.2126 R + 0.7152 G + 0.0722 B
                                           of the linear values, log-encoded as the colour map's channels are
                                           (milkyway-bg.json "encoding"), baseline greyscale JPEG.
  public/textures/milkyway-bg.json         its entry under "files" and "detail" added (the rest is left as it is).

The app keeps the colour of the 2K map and takes the fine structure from this file: where a pixel is finer than the
2K map's 10.5' texels, the 2K colour is scaled by this map's luminance over the pixel against its luminance over the
2K footprint (shaders/milkyway.glsl), so the picture is unchanged wherever the 2K map was already sharp enough.

Checks printed: the 8K map averaged 2 x 2 in linear light against the 4K input (same product, same scale: the maps
are rendered per unit solid angle), and the round trip of the shipped file.

Run: python scripts/build-milkyway-detail.py path/to/milkyway_2020_8k.exr   (numpy, Pillow, OpenEXR >= 3.3)
"""

from __future__ import annotations

import io
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data-raw" / "galaxy"
OUT = ROOT / "public" / "textures"
NAME = "milkyway-detail-8k.jpg"

P0 = 2e-4
PMAX = 1.0
K = math.log1p(PMAX / P0)
QUALITY = 88
# Smoothing of the log luminance, 8K pixels (1 sigma): the map's single-pixel speckle (faint stars one texel each)
# read as grain where the colour map is smooth; this keeps structure from about 4' up.
SMOOTH_PX = 0.8
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def read_exr(path: Path) -> np.ndarray:
    import OpenEXR  # pip install OpenEXR (>= 3.3)

    with OpenEXR.File(str(path)) as f:
        ch = f.channels()
        rgb = ch["RGB"].pixels if "RGB" in ch else np.stack([ch[c].pixels for c in "RGB"], -1)
    return rgb.astype(np.float32)


def encode(p: np.ndarray) -> np.ndarray:
    e = np.log1p(np.clip(p, 0.0, PMAX) / P0) / K
    return np.clip(np.round(e * 255.0), 0, 255).astype(np.uint8)


def decode(b: np.ndarray) -> np.ndarray:
    return P0 * np.expm1(b.astype(np.float64) / 255.0 * K)


def down(a: np.ndarray, f: int) -> np.ndarray:
    h, w = a.shape[:2]
    return a.reshape(h // f, f, w // f, f, *a.shape[2:]).mean((1, 3))


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else RAW / "milkyway_2020_8k.exr"
    rgb = read_exr(src)
    H, W = rgb.shape[:2]
    assert (W, H) == (8192, 4096), (W, H)

    # The same product as the 4K input: compare at 4K, in linear light.
    check = {}
    four = RAW / "milkyway_2020_4k.exr"
    if four.exists():
        a = down(rgb, 2) @ LUMA
        b = read_exr(four) @ LUMA
        m = b > 10 * P0
        r = a[m] / b[m]
        check["vs4k"] = {"medianRatio": round(float(np.median(r)), 4), "p05": round(float(np.percentile(r, 5)), 4), "p95": round(float(np.percentile(r, 95)), 4)}

    y = rgb @ LUMA
    del rgb
    from scipy.ndimage import gaussian_filter

    ly = gaussian_filter(np.log(y + P0), SMOOTH_PX, mode=("nearest", "wrap"))
    y = np.exp(ly) - P0
    del ly
    buf = io.BytesIO()
    Image.fromarray(encode(y), "L").save(buf, "JPEG", quality=QUALITY, optimize=True, progressive=False)
    (OUT / NAME).write_bytes(buf.getvalue())
    n = len(buf.getvalue())

    # Round trip, at 2K (where the app hands over to the colour map) and at full resolution.
    rec = decode(np.asarray(Image.open(OUT / NAME).convert("L")))
    floor = 10 * P0
    def rel(a: np.ndarray, b: np.ndarray) -> dict:
        m = b > floor
        e = np.abs(a[m] - b[m]) / b[m]
        return {"medianRelative": round(float(np.median(e)), 4), "p95Relative": round(float(np.percentile(e, 95)), 4)}
    check["roundTrip8k"] = rel(rec, y)
    check["roundTrip2k"] = rel(down(rec, 4), down(y, 4))

    meta_path = OUT / "milkyway-bg.json"
    meta = json.loads(meta_path.read_text(encoding="utf8"))
    meta["files"][NAME] = {"width": W, "height": H, "bytes": n}
    meta["detail"] = {
        "file": NAME,
        "product": "NASA SVS Deep Star Maps 2020, 'Milky Way background' layer, celestial coordinates, milkyway_2020_8k.exr",
        "content": "Luminance Y = 0.2126 R + 0.7152 G + 0.0722 B of the linear values, one channel, log-encoded as the colour map's channels",
        "use": "fine structure only: the 2K map's colour is scaled by this map's luminance over a pixel against its luminance over the 2K footprint",
        "checks": check,
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf8", newline="\n")
    print(json.dumps({"bytes": n, **check}, indent=2))


if __name__ == "__main__":
    main()
