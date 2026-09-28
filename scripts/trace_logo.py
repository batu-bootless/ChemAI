#!/usr/bin/env python3
"""Turn ChemAI's wordmark (store/source/chemai-wordmark-source.png: "ChemAI." in black, the "AI."
on yellow sun rays) into a vector logo, so it stays sharp at every size.

The source is scaled up four times and split into its two inks - the black letters and the yellow
rays - each traced into smooth curves (potrace). The rays are grown a little under the letters, so
no white seam shows between them; they take the source's left-to-right yellow gradient.

  public/brand/chemai-logo.svg   the wordmark
  public/brand/chemai-mark.svg   its "AI." on the rays alone, for small round places (Iris's avatar)

Usage:  python scripts/trace_logo.py     (needs Pillow, numpy and potracer: pip install potracer)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import potrace
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "store" / "source" / "chemai-wordmark-source.png"
OUT = ROOT / "public" / "brand"

SCALE = 4
# The logo's area on the source, with a margin; and where the "AI." square begins.
CROP = (110, 405, 980, 632)
MARK_LEFT = 696
INK = "#181818"
YELLOW_LEFT = "#EFD65B"
YELLOW_RIGHT = "#D0B83F"


def trace(mask: np.ndarray) -> list[str]:
    # potracer traces the pixels that are off (dark), so the mask goes in inverted.
    bitmap = potrace.Bitmap(~mask)
    curves = bitmap.trace(turdsize=8, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.2)
    paths = []
    for curve in curves:
        start = curve.start_point
        d = [f"M{start.x / SCALE:.2f} {start.y / SCALE:.2f}"]
        for segment in curve.segments:
            end = segment.end_point
            if segment.is_corner:
                d.append(f"L{segment.c.x / SCALE:.2f} {segment.c.y / SCALE:.2f}L{end.x / SCALE:.2f} {end.y / SCALE:.2f}")
            else:
                a, b = segment.c1, segment.c2
                d.append(f"C{a.x / SCALE:.2f} {a.y / SCALE:.2f} {b.x / SCALE:.2f} {b.y / SCALE:.2f} {end.x / SCALE:.2f} {end.y / SCALE:.2f}")
        d.append("Z")
        paths.append("".join(d))
    return paths


def main() -> None:
    source = Image.open(SOURCE).convert("RGB").crop(CROP)
    big = source.resize((source.width * SCALE, source.height * SCALE), Image.LANCZOS)
    pixels = np.array(big).astype(int)
    r, g, b = pixels[..., 0], pixels[..., 1], pixels[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    black = lum < 110
    yellow = (r > 150) & (g > 120) & (b < 150) & (r - b > 70)
    # The rays go on under the letters (they are drawn first), so their edges meet without a seam.
    grown = np.array(Image.fromarray(yellow.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0
    under = yellow | (grown & black)

    width, height = source.size
    ink = trace(black)
    rays = trace(under)
    print(f"traced: {len(ink)} letter curves, {len(rays)} ray curves; {width}x{height}")

    left = MARK_LEFT - CROP[0]
    gradient = (
        f'<linearGradient id="rays" gradientUnits="userSpaceOnUse" x1="{left}" y1="0" x2="{width - 16}" y2="0">'
        f'<stop offset="0" stop-color="{YELLOW_LEFT}"/><stop offset="1" stop-color="{YELLOW_RIGHT}"/></linearGradient>'
    )

    def svg(view: tuple[float, float, float, float], rays_d: list[str], ink_d: list[str]) -> str:
        x, y, w, h = view
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:.1f} {y:.1f} {w:.1f} {h:.1f}" width="{w:.0f}" height="{h:.0f}">'
            f"<title>ChemAI</title><defs>{gradient}</defs>"
            f'<path fill="url(#rays)" fill-rule="evenodd" d="{"".join(rays_d)}"/>'
            f'<path fill="{INK}" fill-rule="evenodd" d="{"".join(ink_d)}"/>'
            "</svg>\n"
        )

    # Tight around what is drawn.
    ys, xs = np.where(black | under)
    x0, x1 = xs.min() / SCALE, (xs.max() + 1) / SCALE
    y0, y1 = ys.min() / SCALE, (ys.max() + 1) / SCALE
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "chemai-logo.svg").write_text(svg((x0, y0, x1 - x0, y1 - y0), rays, ink), encoding="utf-8")
    print(f"  public/brand/chemai-logo.svg  {x1 - x0:.0f}x{y1 - y0:.0f}")

    # The mark: the "AI." square with its rays, letters cut to that square.
    # A few pixels inside the square: the edge of the "m" it touches leaves no specks behind.
    mark_ink = trace(black & (np.arange(black.shape[1])[None, :] >= (left + 3) * SCALE))
    mys, mxs = np.where(under)
    mx0, mx1 = mxs.min() / SCALE, (mxs.max() + 1) / SCALE
    my0, my1 = min(mys.min(), ys.min()) / SCALE, (max(mys.max(), ys.max()) + 1) / SCALE
    (OUT / "chemai-mark.svg").write_text(svg((mx0, my0, mx1 - mx0, my1 - my0), rays, mark_ink), encoding="utf-8")
    print(f"  public/brand/chemai-mark.svg  {mx1 - mx0:.0f}x{my1 - my0:.0f}")


if __name__ == "__main__":
    main()
