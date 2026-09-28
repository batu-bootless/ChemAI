#!/usr/bin/env python3
"""Build the Play Store screenshots: a tag, a two-line headline and the app shot in a phone frame.

Sources live in store/source/shots (raw captures from the app) and the finished 1080x1920 assets
go to store/screenshots. Re-run after replacing a capture:

    python scripts/store_screenshots.py

Needs Pillow.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "store" / "source" / "shots"
FONTS = ROOT / "store" / "source" / "fonts"
OUT = ROOT / "store" / "screenshots"

W, H = 1080, 1920
SIDE = 84                      # text gutter
INK = (15, 23, 42)
GROUND = (255, 255, 255)

FRAME_TOP = 690                # the phone runs off the bottom edge, as in the reference layout
FRAME_X = 100
FRAME_W = W - 2 * FRAME_X
FRAME_RADIUS = 64
BEZEL = 12

# (source file, tag, headline lines, accent)
SCREENS = [
    ("31.jpg", "Hepsi bir arada", ["Bütün kimya araçları", "tek uygulamada"], (124, 92, 246)),
    ("39.jpg", "Araçlar", ["Tüm araçlar", "tek ekranda"], (236, 72, 153)),
    ("37.jpg", "Çözelti hazırlama", ["Çözelti reçeteni", "saniyede kur"], (14, 165, 165)),
    ("33.jpg", "ChemDrawer", ["Molekülleri", "kendin çiz"], (239, 68, 68)),
    ("34.jpg", "Periyodik tablo", ["118 element", "cebinde"], (37, 99, 235)),
    ("35.jpg", "Miew 3D", ["Proteinleri", "3 boyutta incele"], (139, 92, 246)),
    ("32.jpg", "Lab defteri", ["Notların ve defterlerin", "bir arada"], (245, 158, 11)),
    ("36.jpg", "Deney raporu", ["Raporunu PDF", "olarak dışa aktar"], (16, 185, 129)),
]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def tint(colour, amount: float):
    """Mix a colour towards white; the tag fill is the accent at low strength."""
    return tuple(round(c + (255 - c) * amount) for c in colour)


def sharpen_upscale(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Captures come in smaller than the frame, so upscale then restore the edges."""
    scaled = image.resize(size, Image.LANCZOS)
    if size[0] > image.width:
        scaled = scaled.filter(ImageFilter.UnsharpMask(radius=1.6, percent=85, threshold=2))
    return scaled


def phone(shot: Image.Image) -> Image.Image:
    """The capture inside a rounded phone body, cropped at the canvas edge."""
    height = H - FRAME_TOP + 120                    # taller than the canvas: it bleeds off
    body = Image.new("RGBA", (FRAME_W, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(body)
    draw.rounded_rectangle((0, 0, FRAME_W - 1, height - 1), radius=FRAME_RADIUS, fill=(255, 255, 255, 255), outline=(*INK, 255), width=4)

    screen_w = FRAME_W - 2 * BEZEL
    screen_h = height - BEZEL - 4
    ratio = max(screen_w / shot.width, screen_h / shot.height)
    filled = sharpen_upscale(shot, (round(shot.width * ratio), round(shot.height * ratio)))
    left = (filled.width - screen_w) // 2
    filled = filled.crop((left, 0, left + screen_w, screen_h))

    mask = Image.new("L", (screen_w, screen_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, screen_w - 1, screen_h - 1), radius=FRAME_RADIUS - BEZEL, fill=255)
    body.paste(filled, (BEZEL, BEZEL), mask)
    return body


def decoration(accent) -> Image.Image:
    """The mark, tinted to the screen's accent, bleeding off the top right corner."""
    mark = Image.open(ROOT / "store" / "source" / "icon-mark.png").convert("RGBA")
    pixels = mark.split()
    flat = Image.new("RGBA", mark.size, (*accent, 0))
    flat.putalpha(pixels[3])
    size = 260
    return flat.resize((round(mark.width * size / mark.height), size), Image.LANCZOS).rotate(-14, expand=True, resample=Image.BICUBIC)


def build(source: str, tag: str, lines: list[str], accent) -> Image.Image:
    card = Image.new("RGBA", (W, H), (*GROUND, 255))

    # The mark bleeds off the top right corner, clear of the headline.
    art = decoration(accent)
    card.alpha_composite(art, (W - art.width + 96, 104))

    draw = ImageDraw.Draw(card)
    tag_font = font("Inter-SemiBold.ttf", 30)
    tw = draw.textlength(tag, font=tag_font)
    draw.rounded_rectangle((SIDE, 232, SIDE + tw + 56, 232 + 62), radius=31, fill=tint(accent, 0.86))
    draw.text((SIDE + 28, 263), tag, font=tag_font, fill=accent, anchor="lm")

    head = font("Inter-ExtraBold.ttf", 88)
    y = 344
    for line in lines:
        draw.text((SIDE, y), line, font=head, fill=INK)
        y += 108

    device = phone(Image.open(SHOTS / source).convert("RGBA"))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow.paste(Image.new("RGBA", device.size, (15, 23, 42, 55)), (FRAME_X, FRAME_TOP + 16), device)
    card.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(26)))
    card.alpha_composite(device, (FRAME_X, FRAME_TOP))
    return card.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for index, (source, tag, lines, accent) in enumerate(SCREENS, start=1):
        image = build(source, tag, lines, accent)
        path = OUT / f"{index:02d}-{source.split('.')[0]}.png"
        image.save(path, "PNG", optimize=True)
        print(f"  {path.relative_to(ROOT)}  {image.width}x{image.height}")


main()
