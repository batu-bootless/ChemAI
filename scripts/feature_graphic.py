#!/usr/bin/env python3
"""Build the Play Store feature graphic (1024x500).

Layout: a single-hue gradient, the mark and wordmark, one line of what the app is, and a row of
white circles holding the module glyphs. Positions are fractions of the canvas, measured from the
reference banner this design follows, so the proportions hold at any size. Everything is drawn at
2x and scaled down so the edges stay clean.

    python scripts/feature_graphic.py

The glyphs in store/source/glyphs are rendered from Lucide (ISC), the icon set the app itself uses.

Needs Pillow and numpy.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "store" / "source" / "fonts"
GLYPHS = ROOT / "store" / "source" / "glyphs"
MARK = ROOT / "store" / "source" / "icon-mark.png"
OUT = ROOT / "store" / "feature-graphic-1024x500.png"

W, H = 1024, 500
SS = 2                                   # supersampling factor

TOP = (44, 121, 249)                     # gradient, lighter at the top
BOTTOM = (34, 77, 254)                   # deeper at the bottom
WHITE = (255, 255, 255)
ACCENT = (169, 198, 255)                 # the full stop after the tagline
GLYPH_INK = (37, 93, 248)                # icon colour inside the white circles

WORDMARK = "Chem+"
TAGLINE = ("Kimyanın tamamı tek uygulamada", ".")
GLYPH_ORDER = ("flask-conical", "calculator", "hexagon", "grid-3x3", "atom", "notebook-text")

WORD_CENTER_Y = 0.295                    # fractions of the height, from the reference layout
TAG_CENTER_Y = 0.452
CIRCLE_CENTER_Y = 0.659
CIRCLE_D = 0.206                         # circle diameter as a fraction of the height
ROW_W = 0.723                            # the six circles span this much of the width


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def background(size: tuple[int, int]) -> Image.Image:
    w, h = size
    column = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        column.putpixel((0, y), tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)))
    return column.resize((w, h), Image.BILINEAR)


def recolour(image: Image.Image, ink) -> Image.Image:
    """Flatten a drawing to one colour, keeping its coverage as alpha.

    The glyphs leave the SVG renderer as dark strokes on white, so their distance from white is the
    coverage; the mark arrives with its own alpha and only needs repainting.
    """
    pixels = np.array(image.convert("RGBA")).astype(float)
    rgb, alpha = pixels[..., :3], pixels[..., 3]
    coverage = alpha if (alpha < 250).mean() > 0.02 else 255 - rgb.min(axis=-1)
    out = np.zeros_like(pixels)
    out[..., :3] = ink
    out[..., 3] = coverage
    return Image.fromarray(out.astype("uint8"), "RGBA")


def fit(image: Image.Image, height: int) -> Image.Image:
    """Scale to a height in premultiplied alpha, so edges cannot bleed white."""
    width = round(image.width * height / image.height)
    pixels = np.array(image.convert("RGBA")).astype(float)
    pixels[..., :3] *= pixels[..., 3:4] / 255.0
    small = np.array(
        Image.fromarray(pixels.astype("uint8"), "RGBA").resize((width, height), Image.LANCZOS)
    ).astype(float)
    alpha = np.clip(small[..., 3:4], 1e-6, 255)
    small[..., :3] = np.clip(small[..., :3] * 255.0 / alpha, 0, 255)
    return Image.fromarray(small.astype("uint8"), "RGBA")


def build() -> Image.Image:
    w, h = W * SS, H * SS
    card = background((w, h)).convert("RGBA")
    draw = ImageDraw.Draw(card)

    # Mark and wordmark, centred together as one lockup.
    word_font = font("Inter-ExtraBold.ttf", int(96 * SS))
    word_w = draw.textlength(WORDMARK, font=word_font)
    mark = fit(recolour(Image.open(MARK), WHITE), int(112 * SS))
    gap = int(26 * SS)
    x = (w - (mark.width + gap + word_w)) / 2
    y = h * WORD_CENTER_Y
    card.alpha_composite(mark, (int(x), int(y - mark.height / 2)))
    draw.text((x + mark.width + gap, y), WORDMARK, font=word_font, fill=WHITE, anchor="lm")

    # One line of what the app is, with the accent full stop the reference layout uses.
    tag_font = font("Inter-SemiBold.ttf", int(35 * SS))
    text, stop = TAGLINE
    text_w = draw.textlength(text, font=tag_font)
    stop_w = draw.textlength(stop, font=tag_font)
    x = (w - (text_w + stop_w)) / 2
    y = h * TAG_CENTER_Y
    draw.text((x, y), text, font=tag_font, fill=WHITE, anchor="lm")
    draw.text((x + text_w, y), stop, font=tag_font, fill=ACCENT, anchor="lm")

    # The module glyphs in white circles.
    diameter = h * CIRCLE_D
    row_w = w * ROW_W
    spacing = (row_w - len(GLYPH_ORDER) * diameter) / (len(GLYPH_ORDER) - 1)
    left = (w - row_w) / 2
    cy = h * CIRCLE_CENTER_Y
    for index, name in enumerate(GLYPH_ORDER):
        cx = left + index * (diameter + spacing) + diameter / 2
        draw.ellipse(
            (cx - diameter / 2, cy - diameter / 2, cx + diameter / 2, cy + diameter / 2), fill=WHITE
        )
        glyph = fit(recolour(Image.open(GLYPHS / f"{name}.png"), GLYPH_INK), int(diameter * 0.50))
        card.alpha_composite(glyph, (int(cx - glyph.width / 2), int(cy - glyph.height / 2)))

    return card.convert("RGB").resize((W, H), Image.LANCZOS)


def main() -> None:
    image = build()
    image.save(OUT, "PNG", optimize=True)
    print(f"  {OUT.relative_to(ROOT)}  {image.width}x{image.height}")


main()
