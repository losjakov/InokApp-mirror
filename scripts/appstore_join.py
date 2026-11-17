#!/usr/bin/env python3
"""appstore_join.py - cloud_40 (A-129, C1): the App Store frames 04-eparchy / 05-map = the browser engine's frame of the SAME code laid out with
the device's own numbers (screens/appstore_frames.ts) + the iPhone's / iPad's marks CUT from a REAL simulator frame of the same run, size,
theme and language (the status bar band = the top safe-area inset, the home-indicator band = the bottom one) and JOINED. Nothing is drawn.

A frame is written ONLY when the join is clean, measured:
  1. both files are the device's exact size (iPhone 1320 x 2868, iPad 2064 x 2752);
  2. the browser frame's two bands are the app's own background ONLY (the header colour on top, the tab bar's at the bottom - >= 99 % of
     their pixels within 6 of the simulator band's own background), so the marks cover nothing of the app;
  3. the seam rows (4 rows on each side of each cut) of the browser and of the simulator frame agree: mean |diff| <= 3 and >= 99 % of the
     pixels within 12 - the header / tab bar continue across the seam in one colour.
Usage: appstore_join.py <insets.json> <browser.png> <simulator.png> <out.png>   -> prints «JOINED …» (exit 0) or «REFUSED …» (exit 1)
       appstore_join.py --self-test
"""
import json
import sys

from PIL import Image

SIZES = {(1320, 2868), (2064, 2752)}
SEAM = 4


def rows(im, y0, y1):
    """The pixels of rows y0..y1-1 as a flat list of RGB tuples."""
    raw = im.crop((0, y0, im.size[0], y1)).tobytes()
    return [tuple(raw[i:i + 3]) for i in range(0, len(raw), 3)]


def background(px):
    """The band's own background = its most frequent colour."""
    counts = {}
    for p in px:
        counts[p] = counts.get(p, 0) + 1
    return max(counts, key=counts.get)


def near(a, b, tol):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def share_near(px, colour, tol):
    return sum(1 for p in px if near(p, colour, tol)) / max(1, len(px))


def seam(a, b):
    """mean |diff| and the share of pixels within 12, over two equal row strips."""
    diffs = [max(abs(x - y) for x, y in zip(p, q)) for p, q in zip(a, b)]
    return sum(diffs) / max(1, len(diffs)), sum(1 for d in diffs if d <= 12) / max(1, len(diffs))


def join(insets, browser, sim):
    """-> (image or None, the measured line)"""
    b = browser.convert('RGB')
    s = sim.convert('RGB')
    if b.size != s.size or b.size not in SIZES:
        return None, f'sizes {b.size} / {s.size} (want one of {sorted(SIZES)})'
    w, h = b.size
    top = round(insets['top'] * insets['dpr'])
    bottom = round(insets['bottom'] * insets['dpr'])
    if top < 1 or bottom < 1:
        return None, f'no band (top {top}, bottom {bottom} px)'
    out = []
    for name, y0, y1, s0, s1 in (('top', 0, top, top, top + SEAM), ('bottom', h - bottom, h, h - bottom - SEAM, h - bottom)):
        band_bg = background(rows(s, y0, y1))
        covered = share_near(rows(b, y0, y1), band_bg, 6)
        if covered < 0.99:
            return None, f'{name} band of the browser frame is not the app background only ({covered:.1%} of {band_bg})'
        mean, ok = seam(rows(b, s0, s1), rows(s, s0, s1))
        if mean > 3 or ok < 0.99:
            return None, f'{name} seam differs (mean {mean:.2f}, within 12: {ok:.1%})'
        out.append(f'{name} {y1 - y0} px, background {band_bg}, seam mean {mean:.2f} / {ok:.1%}')
    res = b.copy()
    res.paste(s.crop((0, 0, w, top)), (0, 0))
    res.paste(s.crop((0, h - bottom, w, h)), (0, h - bottom))
    return res, '; '.join(out)


def self_test():
    head, bar = (12, 100, 134), (255, 255, 255)
    def frame(icons):
        im = Image.new('RGB', (1320, 2868), (240, 240, 240))
        im.paste(head, (0, 0, 1320, 186 + 168))
        im.paste(bar, (0, 2868 - 102 - 150, 1320, 2868))
        if icons:  # the marks: a clock, a home indicator
            im.paste((255, 255, 255), (60, 60, 200, 110))
            im.paste((0, 0, 0), (460, 2868 - 40, 860, 2868 - 30))
        return im
    ins = {'top': 62, 'bottom': 34, 'dpr': 3}
    good, line = join(ins, frame(False), frame(True))
    assert good is not None and good.getpixel((100, 80)) == (255, 255, 255) and good.getpixel((500, 2868 - 35)) == (0, 0, 0), line
    bad = frame(False); bad.paste((200, 0, 0), (0, 186, 1320, 190))  # another colour right under the seam
    assert join(ins, bad, frame(True))[0] is None
    cover = frame(False); cover.paste((0, 0, 0), (100, 20, 400, 60))  # app content under the status bar = never covered
    assert join(ins, cover, frame(True))[0] is None
    assert join(ins, frame(False).resize((1290, 2796)), frame(True))[0] is None
    print('appstore_join self-test: PASS (a clean join + 3 refusals: seam, covered content, size)')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test(); sys.exit(0)
    ins_f, b_f, s_f, out_f = sys.argv[1:5]
    with open(ins_f, encoding='utf-8') as f:
        ins = json.load(f)
    im, line = join(ins, Image.open(b_f), Image.open(s_f))
    if im is None:
        print(f'REFUSED {out_f}: {line}'); sys.exit(1)
    im.save(out_f, 'PNG', optimize=True)
    print(f'JOINED {out_f}: {line}')
