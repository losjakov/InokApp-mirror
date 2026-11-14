#!/usr/bin/env python3
"""store_png.py <store dir> | --selftest - the Play screenshots of scripts/emu_store.sh made final and checked (A-68, Play Help 1078870).

For every <dir>/<lang>/<set>/<NN>-<screen>.png: a shot taken taller than its set (a landscape set with a system navigation area at the
bottom, emu_store.sh) is cut back to the set's exact size from the top; the alpha channel is dropped (24-bit RGB PNG: Play refuses
alpha). Then every rule is checked and printed per file: exact 9:16 (phone) or 16:9 (tablets), short side >= 1080, RGB without alpha,
<= 8 MB; and the counts 8 / 6 / 6 in each of uk / ru / en. The last line says PASS or FAIL. Needs Pillow (apt python3-pil).
"""
import os
import sys

SETS = {'phone': (1080, 1920, 8), 'tablet7': (1920, 1080, 6), 'tablet10': (1920, 1080, 6)}
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
    if im.size[0] * 16 != im.size[1] * 9 and im.size[0] * 9 != im.size[1] * 16:
        bad.append('not 9:16 / 16:9')
    if min(im.size) < 1080:
        bad.append('short side < 1080')
    if im.mode != 'RGB' or 'transparency' in im.info:
        bad.append('mode %s (alpha)' % im.mode)
    if os.path.getsize(path) > MAX_BYTES:
        bad.append('over 8 MB')
    return bad


def main(root):
    fails = 0
    for lang in LANGS:
        for name, (w, h, n) in SETS.items():
            d = os.path.join(root, lang, name)
            files = sorted(f for f in os.listdir(d) if f.endswith('.png')) if os.path.isdir(d) else []
            for f in files:
                bad = finish(os.path.join(d, f), w, h)
                fails += bool(bad)
                print('%s/%s/%s %dx%d %d b %s' % (lang, name, f, w, h, os.path.getsize(os.path.join(d, f)), 'ok' if not bad else 'FAIL: ' + '; '.join(bad)))
            if len(files) != n:
                fails += 1
                print('%s/%s: %d files, not %d - FAIL' % (lang, name, len(files), n))
    print('store screenshots: %s (rules: exact 9:16 / 16:9, short side >= 1080, 24-bit PNG without alpha, <= 8 MB, 8 / 6 / 6 x uk ru en)'
          % ('PASS' if not fails else 'FAIL (%d)' % fails))
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
    sys.exit(selftest() if sys.argv[1:] == ['--selftest'] else main(sys.argv[1]))
