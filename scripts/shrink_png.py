#!/usr/bin/env python3
"""Downscale PNG screenshots for the review set (CLAUDE.md step 4: ≤ 200 KB each).
Usage: shrink_png.py <src> <dst> [max_kb]   |   shrink_png.py --selftest

D18 (cloud_05): a plain median-cut palette drops rare colours — the 10-px live dot of the tab bar became brown in the
review shots while the app drew it red. The palette now RESERVES the theme's own colours (read from the ONE source,
src/theme/variables.css), so a small accent keeps its exact value after quantisation."""
import os
import re
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
VARS = os.path.join(HERE, '..', 'src', 'theme', 'variables.css')


def theme_colours():
    """Every `--ion-color-<name>: #rrggbb` of the theme (light + dark blocks), deduplicated, in file order."""
    seen = []
    for hexv in re.findall(r'--ion-color-[a-z-]+:\s*#([0-9a-fA-F]{6})\b', open(VARS, encoding='utf-8').read()):
        rgb = tuple(int(hexv[i:i + 2], 16) for i in (0, 2, 4))
        if rgb not in seen:
            seen.append(rgb)
    return seen[:96]


def quantise(im):
    keys = theme_colours()
    base = im.quantize(colors=256 - len(keys), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = base.getpalette()[: (256 - len(keys)) * 3]
    for c in keys:
        pal += list(c)
    pal += [0, 0, 0] * (256 - len(pal) // 3)
    ref = Image.new('P', (1, 1))
    ref.putpalette(pal)
    return im.quantize(palette=ref, dither=Image.Dither.NONE)


def shrink(src, dst, max_kb=200):
    im = Image.open(src).convert('RGB')
    scale = 1.0
    while True:
        out = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        out = quantise(out) if scale < 0.75 else out
        out.save(dst, optimize=True)
        if os.path.getsize(dst) <= max_kb * 1024 or scale < 0.3:
            return scale
        scale -= 0.1


def selftest():
    """A busy picture with a 30-px live-red dot must keep the dot's exact colour after quantisation."""
    import random
    random.seed(1)
    im = Image.new('RGB', (600, 600))
    px = im.load()
    for y in range(600):
        for x in range(600):
            px[x, y] = (random.randrange(60, 256), random.randrange(80, 256), random.randrange(90, 256))
    for y in range(300, 330):
        for x in range(300, 330):
            px[x, y] = (198, 40, 40)
    got = quantise(im).convert('RGB').getpixel((315, 315))
    assert got == (198, 40, 40), f'live red lost: {got}'
    assert (198, 40, 40) in theme_colours(), 'variables.css has no live red'
    print('shrink_png selftest: PASS (live red kept)')


if __name__ == '__main__':
    if sys.argv[1:] == ['--selftest']:
        selftest()
    else:
        s = shrink(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 200)
        print(f'{sys.argv[2]}: {os.path.getsize(sys.argv[2]) // 1024} KB at scale {s:.1f}')
