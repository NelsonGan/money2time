#!/usr/bin/env python3
"""Normalize downloaded subscription logos to match assets/account-logos.

Every account logo in this repo is a 256x256 PNG, palette-quantized so the
bundle stays small. Brandfetch serves square app icons as webp/jpeg/png at
varying sizes, so this pass:

  * converts whatever was downloaded to PNG,
  * pads non-square art onto a square canvas (white, or transparent when the
    source has an alpha channel) instead of distorting it,
  * resizes to exactly 256x256 with Lanczos,
  * quantizes to a 256-colour palette.

Usage:  python3 scripts/normalize-subscription-logos.py [dir]
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

SIZE = 256
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("assets/subscription-logos")


def normalize(path: Path) -> None:
    with Image.open(path) as src:
        im = src.convert("RGBA")

    has_alpha = im.getchannel("A").getextrema()[0] < 255
    if im.width != im.height:
        side = max(im.width, im.height)
        bg = (0, 0, 0, 0) if has_alpha else (255, 255, 255, 255)
        canvas = Image.new("RGBA", (side, side), bg)
        canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
        im = canvas

    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    if not has_alpha:
        flat = Image.new("RGB", im.size, (255, 255, 255))
        flat.paste(im, mask=im.getchannel("A"))
        out = flat.quantize(colors=256, method=Image.MEDIANCUT)
    else:
        # RGBA can only be quantized with the octree method in Pillow.
        out = im.quantize(colors=255, method=Image.FASTOCTREE)

    out.save(path.with_suffix(".png"), optimize=True)
    if path.suffix != ".png":
        path.unlink()


def main() -> None:
    files = sorted(p for p in ROOT.rglob("*") if p.suffix in {".png", ".webp", ".jpeg", ".jpg"})
    for path in files:
        normalize(path)
    print(f"normalized {len(files)} logos under {ROOT}")


if __name__ == "__main__":
    main()
