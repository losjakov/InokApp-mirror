#!/usr/bin/env python3
"""D20: the pictures the fixtures point at (covers, article previews, channel avatars, eparchy images), stored once under
fixtures/img/<URL path> so `npm run screens` shows them with no network (screens.spec.ts routes https://inok.info/images/**
here). The URL list is DERIVED from the fixtures (no second list, A-15). Re-run after refreshing the fixtures."""
import io, json, os, re, sys, time, urllib.request
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fixtures')
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
INHTML = re.compile(r'(?:src|href)="(https://inok\.info/images/[^"]+)"')
PIC = re.compile(r'^https://inok\.info(/images/[^?#]+\.(?:jpe?g|png|webp|svg))(?:[?#].*)?$', re.I)

def urls():
    out = set()
    def walk(o):
        if isinstance(o, dict): [walk(v) for v in o.values()]
        elif isinstance(o, list): [walk(v) for v in o]
        elif isinstance(o, str):
            m = PIC.match(o)
            if m: out.add((o, m.group(1)))
            # R-18: an article body (html-lite) carries its pictures as <img src> and gallery links <a href> to the full picture
            for u in INHTML.findall(o):
                m = PIC.match(u)
                if m: out.add((u, m.group(1)))
    for f in ('directory_v1.json', 'articles.json', 'live-status.json', 'related.json', 'article_gallery.json', 'articles_video_r47.json'):
        walk(json.load(open(os.path.join(ROOT, f), encoding='utf-8')))
    return sorted(out)

def small(data, dst):
    """A review picture, not the original: ≤ 480 px, re-encoded (keeps the repository small; the format stays the URL's)."""
    if dst.lower().endswith('.svg'): return data
    im = Image.open(io.BytesIO(data)); im.thumbnail((480, 480))  # raises on an HTML error page: the caller drops it
    fmt = {'jpg': 'JPEG', 'jpeg': 'JPEG', 'png': 'PNG', 'webp': 'WEBP'}[dst.rsplit('.', 1)[1].lower()]
    if fmt == 'JPEG' and im.mode != 'RGB': im = im.convert('RGB')
    b = io.BytesIO(); im.save(b, fmt, quality=70, optimize=True); return b.getvalue()

if __name__ == '__main__':
    ok = bad = 0
    for url, path in urls():
        dst = os.path.join(ROOT, 'img', path.lstrip('/'))
        if os.path.exists(dst) and '--force' not in sys.argv:
            if '--shrink' in sys.argv:
                try:
                    b = small(open(dst, 'rb').read(), dst)  # read BEFORE opening for write (that truncates)
                    open(dst, 'wb').write(b)
                except Exception: os.remove(dst); print('DROP (not a picture)', dst); bad += 1; continue
            ok += 1; continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30).read()
            b = small(data, dst)
            open(dst, 'wb').write(b); ok += 1
            time.sleep(1.5)  # polite to the site (it answers 429 to a burst)
        except Exception as e:
            bad += 1; print('FAIL', url, e)
    print(f'fixture images: {ok} present, {bad} failed')
