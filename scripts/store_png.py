#!/usr/bin/env python3
"""store_png.py <store dir> | --selftest - the Play screenshots of scripts/emu_store.sh made final and checked (A-68, Play Help 1078870).

For every <dir>/<lang>/<set>/<NN>-<screen>.png: a shot taken taller than its set (a landscape set with a system navigation area at the
bottom, emu_store.sh) is cut back to the set's exact size from the top; the alpha channel is dropped (24-bit RGB PNG: Play refuses
alpha). Then every rule is checked and printed per file: exact 9:16 (phone) or 16:9 (tablets), short side >= 1080, RGB without alpha,
<= 8 MB; cloud_38 (E11, D16): never a BLANK frame (one colour over the screen's body: a white WebView paint) and, for a map frame with
its box written beside it (`<file>.png.maprect` = "x y w h" in the PNG's pixels, scripts/store_lib.sh), never a map canvas painted in part
(white over more than MAP_WHITE_MAX of the box); and the counts 8 / 7 / 7 in each of uk / ru / en (--appstore <dir>: iphone 1320 x 2868 x 6, ipad 2064 x 2752 x 5 - A-127, no 04 / 05). The last line says PASS or FAIL. Needs Pillow (apt python3-pil).
"""
import os
import sys

# A-122 (1.0.11): phone 8, each tablet 7 (scripts/store_frames.txt); --appstore = the App Store set of the iOS simulator (ios_sim_tour.sh)
SETS = {'phone': (1080, 1920, 8), 'tablet7': (1920, 1080, 7), 'tablet10': (1920, 1080, 7)}
APPSTORE = {'iphone': (1320, 2868, 7), 'iphone63': (1206, 2622, 7), 'ipad': (2064, 2752, 6)}  # cloud_41 (E): + 09-visited / 08-visited; 04 / 05 not on a GPU-less runner (A-127, measured again)
LANGS = ('uk', 'ru', 'en')
MAX_BYTES = 8 * 1024 * 1024
BLANK_MIN = 0.985  # the share of the body (below the status bar, above the navigation) in ONE colour that makes a frame blank
MAP_WHITE_MAX = 0.08  # the share of the map box's rows or columns that may be ENTIRELY pure white (every channel >= 250)


def finish(path, w, h):
    """cut to w x h from the top when taller, drop alpha; returns the problems of the written file"""
    from PIL import Image
    im = Image.open(path)
    if im.size[0] != w or im.size[1] < h:
        return ['size %dx%d, not %dx%d' % (im.size[0], im.size[1], w, h)]
    if im.size[1] > h:
        im = im.crop((0, 0, w, h))
    if im.mode != 'RGB':
        im = im.convert('RGB')
    im.save(path, 'PNG', optimize=True)
    return check(path, w, h)


def check(path, w, h):
    from PIL import Image
    im = Image.open(path)
    bad = []
    if im.size != (w, h):
        bad.append('size %dx%d' % im.size)
    if (w, h) not in [(a, b) for a, b, _ in APPSTORE.values()]:  # Play's rules; Apple's = the exact size alone
        if im.size[0] * 16 != im.size[1] * 9 and im.size[0] * 9 != im.size[1] * 16:
            bad.append('not 9:16 / 16:9')
        if min(im.size) < 1080:
            bad.append('short side < 1080')
    if im.mode != 'RGB' or 'transparency' in im.info:
        bad.append('mode %s (alpha)' % im.mode)
    if os.path.getsize(path) > MAX_BYTES:
        bad.append('over 8 MB')
    return bad + paint(path)


def pixels(im):
    return [im.getpixel((x, y)) for y in range(im.size[1]) for x in range(im.size[0])]


def paint(path):
    """E11 / D16: what the pixels say - a blank frame; a map box (sidecar) painted only in part"""
    from PIL import Image
    im = Image.open(path).convert('RGB')
    w, h = im.size
    body = im.crop((0, int(h * 0.1), w, int(h * 0.88))).resize((90, 120))
    px = pixels(body)
    mode = max(set(px), key=px.count)
    same = sum(1 for q in px if max(abs(q[i] - mode[i]) for i in range(3)) <= 8) / len(px)
    bad = ['BLANK (%d%% of the body one colour %s)' % (same * 100, '#%02x%02x%02x' % mode)] if same >= BLANK_MIN else []
    side = path + '.maprect'
    if os.path.exists(side):
        with open(side) as fh:
            x, y, bw, bh = [int(float(v)) for v in fh.read().split()[:4]]
        box = im.crop((max(0, x), max(0, y), min(w, x + bw), min(h, y + bh)))
        # cloud_38 (the release emulator): a light base map (land >= 250 in every channel) is not «white» - D16's mark is a whole BAND of
        # the box with nothing drawn: full rows (the top) or full columns (the right) of pure white
        box = box.resize((120, max(1, int(120 * box.size[1] / max(1, box.size[0])))))
        bw, bh = box.size
        q = pixels(box)
        wh = [min(c) >= 250 for c in q]
        rows = sum(1 for y in range(bh) if sum(wh[y * bw:(y + 1) * bw]) >= 0.98 * bw) / bh
        cols = sum(1 for x in range(bw) if sum(wh[x::bw]) >= 0.98 * bh) / bw
        if max(rows, cols) > MAP_WHITE_MAX:
            bad.append('MAP NOT PAINTED (%d%% of the box rows / %d%% of its columns blank)' % (rows * 100, cols * 100))
    return bad


def main(root, sets=SETS):
    fails = 0
    for lang in LANGS:
        for name, (w, h, n) in sets.items():
            d = os.path.join(root, lang, name)
            files = sorted(f for f in os.listdir(d) if f.endswith('.png')) if os.path.isdir(d) else []
            for f in files:
                bad = finish(os.path.join(d, f), w, h)
                fails += bool(bad)
                print('%s/%s/%s %dx%d %d b %s' % (lang, name, f, w, h, os.path.getsize(os.path.join(d, f)), 'ok' if not bad else 'FAIL: ' + '; '.join(bad)))
            if len(files) != n:
                fails += 1
                print('%s/%s: %d files, not %d - FAIL' % (lang, name, len(files), n))
    rule = ('exact 9:16 / 16:9, short side >= 1080' if sets == SETS else 'exact iPhone 6.9" / iPad 13" size') + ', 24-bit PNG without alpha, <= 8 MB, ' \
        + ' / '.join(str(n) for _, _, n in sets.values()) + ' x uk ru en'
    print('store screenshots: %s (rules: %s)' % ('PASS' if not fails else 'FAIL (%d)' % fails, rule))
    return 0


def selftest():
    import tempfile
    from PIL import Image
    t = tempfile.mkdtemp()
    for lang in LANGS:
        for name, (w, h, n) in SETS.items():
            os.makedirs(os.path.join(t, lang, name))
            for i in range(n):
                im = Image.new('RGBA', (w, h + (60 if w > h else 0)), (10, 20, 30, 255))
                im.paste((240, 240, 240, 255), (0, 0, w // 2, h))  # content: a frame of one colour is BLANK (E11)
                im.save(os.path.join(t, lang, name, '0%d-x.png' % (i + 1)))
    main(t)
    im = Image.open(os.path.join(t, 'uk', 'tablet7', '01-x.png'))
    assert im.size == (1920, 1080) and im.mode == 'RGB', (im.size, im.mode)
    assert check(os.path.join(t, 'uk', 'phone', '01-x.png'), 1080, 1920) == []
    Image.new('RGB', (1080, 2160)).save(os.path.join(t, 'bad.png'))
    assert 'not 9:16 / 16:9' in check(os.path.join(t, 'bad.png'), 1080, 2160)
    Image.new('RGB', (1080, 1920), (255, 255, 255)).save(os.path.join(t, 'white.png'))
    assert any(b.startswith('BLANK') for b in check(os.path.join(t, 'white.png'), 1080, 1920))
    print('store_png self-test: ok')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['--paint']:  # one file: its paint problems (unit test, the browser ring)
        print('; '.join(paint(a[1])) or 'ok')
        sys.exit(0)
    if a[:1] == ['--appstore']:  # [iphone|ipad ...]: one device's set (a CI job per device, cloud_38)
        only = ' '.join(a[2:]).split() or list(APPSTORE)
        sys.exit(main(a[1], {k: v for k, v in APPSTORE.items() if k in only}))
    sys.exit(selftest() if a == ['--selftest'] else main(a[0]))
