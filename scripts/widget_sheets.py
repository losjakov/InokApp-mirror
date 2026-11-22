#!/usr/bin/env python3
"""widget_sheets.py - 1.0.18 (the CD kit README «Acceptance» 3): ONE contact sheet per platform x language - the kit's approved reference sheets
on top, the cloud's own widget frames of the same samples under them (Android: emu_widgets.sh `sample-*` / `layout-*` cut to the widget; iPhone:
the ring's `sample-<lang>-*` renders), labelled - for CD to compare side by side. Nothing is drawn into a frame: each tile is a frame, scaled down.
  python3 scripts/widget_sheets.py android <emulator widgets dir> <kit reference dir> <out dir>
  python3 scripts/widget_sheets.py ios <ring widgets dir> <kit reference dir> <out dir>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

BG = (60, 58, 56)


def crop_widget(p: Path) -> Image.Image:
    """an emulator frame of WidgetPreviewActivity: the widget on a flat backdrop (rgb 120,140,150) - cut to the widget's box"""
    im = Image.open(p).convert('RGB')
    w, h = im.size
    px = im.load()
    back = (120, 140, 150)
    xs, ys = [], []
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            r, g, b = px[x, y]
            if abs(r - back[0]) + abs(g - back[1]) + abs(b - back[2]) > 40 and y > h * 0.06:
                xs.append(x); ys.append(y)
    if not xs: return im
    return im.crop((max(0, min(xs) - 4), max(0, min(ys) - 4), min(w, max(xs) + 5), min(h, max(ys) + 5)))


def tile(im: Image.Image, width: int) -> Image.Image:
    r = width / im.width
    return im.resize((width, max(1, int(im.height * r))), Image.LANCZOS)


def sheet(title: str, refs: list, tiles: list, out: Path) -> None:
    W = 1800
    parts = [(f'REFERENCE (the CD kit): {r.name}', tile(Image.open(r).convert('RGB'), W)) for r in refs if r.is_file()]
    rows, row, x, rh = [], [], 0, 0
    for name, im in tiles:
        t = tile(im, 420 if im.width > im.height * 1.5 else 280)
        if x + t.width > W: rows.append((row, rh)); row, x, rh = [], 0, 0
        row.append((name, t, x)); x += t.width + 16; rh = max(rh, t.height + 26)
    if row: rows.append((row, rh))
    H = 40 + sum(p[1].height + 30 for p in parts) + sum(r[1] for r in rows) + 60
    S = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(S)
    d.text((10, 10), title, fill=(255, 255, 255)); y = 40
    for name, im in parts: d.text((10, y), name, fill=(230, 210, 140)); S.paste(im, (0, y + 16)); y += im.height + 30
    d.text((10, y), 'THE CLOUD\'S FRAMES (same samples; emulator / simulator renders of the real widget code)', fill=(140, 220, 160)); y += 20
    for r, rh in rows:
        for name, t, x in r: S.paste(t, (x, y)); d.text((x, y + t.height + 4), name, fill=(220, 220, 220))
        y += rh
    out.parent.mkdir(parents=True, exist_ok=True)
    S.save(out, optimize=True)
    print(out, S.size)


def main() -> None:
    plat, shots, ref, out = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])
    p = 'a' if plat == 'android' else 'i'
    for lang in ('uk', 'ru', 'en'):
        refs = [ref / f'wprev2_{p}_ms_{lang}.png', ref / f'wprev2_{p}_l_{lang}.png', ref / f'wrow_{lang}.png']
        if plat == 'android':
            files = sorted(shots.glob(f'sample-*-{lang}.png')) + sorted(shots.glob(f'layout-*-{lang}.png'))
            tiles = [(f.stem, crop_widget(f)) for f in files]
        else:
            files = sorted(shots.glob(f'sample-{lang}-*.png'))
            tiles = [(f.stem, Image.open(f).convert('RGB')) for f in files]
        sheet(f'widget previews - {plat} - {lang}', refs, tiles, out / f'widget_previews_{plat}_{lang}.png')


if __name__ == '__main__':
    main()
