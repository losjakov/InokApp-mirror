#!/usr/bin/env python3
"""store_png.py <store dir> | --selftest - the Play screenshots of scripts/emu_store.sh made final and checked (A-68, Play Help 1078870).

For every <dir>/<lang>/<set>/<NN>-<screen>.png: a shot taken taller than its set (a landscape set with a system navigation area at the
bottom, emu_store.sh) is cut back to the set's exact size from the top; the alpha channel is dropped (24-bit RGB PNG: Play refuses
alpha). Then every rule is checked and printed per file: exact 9:16 (phone) or 16:9 (tablets), short side >= 1080, RGB without alpha,
<= 8 MB; and the counts 8 / 7 / 7 in each of uk / ru / en (--appstore <dir>: iphone 1320 x 2868 x 8, ipad 2064 x 2752 x 7). The last line says PASS or FAIL. Needs Pillow (apt python3-pil).
"""
import os
import sys

# A-122 (1.0.11): phone 8, each tablet 7 (scripts/store_frames.txt); --appstore = the App Store set of the iOS simulator (ios_sim_tour.sh)
SETS = {'phone': (1080, 1920, 8), 'tablet7': (1920, 1080, 7), 'tablet10': (1920, 1080, 7)}
APPSTORE = {'iphone': (1320, 2868, 8), 'ipad': (2064, 2752, 7)}
LANGS = ('uk', 'ru', 'en')
MAX_BYTES = 8 * 1024 * 1024


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
    rule = ('exact 9:16 / 16:9, short side >= 1080' if sets is SETS else 'exact iPhone 6.9" / iPad 13" size') + ', 24-bit PNG without alpha, <= 8 MB, ' \
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
                Image.new('RGBA', (w, h + (60 if w > h else 0)), (10, 20, 30, 255)).save(os.path.join(t, lang, name, '0%d-x.png' % (i + 1)))
    main(t)
    im = Image.open(os.path.join(t, 'uk', 'tablet7', '01-x.png'))
    assert im.size == (1920, 1080) and im.mode == 'RGB', (im.size, im.mode)
    assert check(os.path.join(t, 'uk', 'phone', '01-x.png'), 1080, 1920) == []
    Image.new('RGB', (1080, 2160)).save(os.path.join(t, 'bad.png'))
    assert 'not 9:16 / 16:9' in check(os.path.join(t, 'bad.png'), 1080, 2160)
    print('store_png self-test: ok')


if __name__ == '__main__':
    a = sys.argv[1:]
    sys.exit(selftest() if a == ['--selftest'] else main(a[1], APPSTORE) if a[:1] == ['--appstore'] else main(a[0]))
