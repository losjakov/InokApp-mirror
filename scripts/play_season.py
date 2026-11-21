#!/usr/bin/env python3
"""Google Play seasonal listing (owner 21.11.2026 08:58-09:39, CD S327): during a feast window of store/events/feasts.json
(play_from .. play_to, Kyiv dates) the MAIN store listing carries the feast feature graphic + a feast short description;
outside every window it carries the normal ones (store/events/play_normal.json, captured from the live listing).
Service account `play-listing` (store-listing rights only). stdlib + openssl CLI (or the `cryptography` package if present).

  play_season.py check  <sa.json>                      -> prints the live listing state (titles, short descriptions, feature graphic sha256); no change
  play_season.py probe  <sa.json>                      -> proves the write right inside an edit that is discarded (nothing committed)
  play_season.py capture <sa.json>                     -> writes store/events/play_normal.json from the LIVE listing (+ downloads nothing)
  play_season.py apply  <sa.json> [--date YYYY-MM-DD] [--dry]  -> makes the live listing match the plan for that Kyiv date (idempotent)
Prints one line per step; never prints a key or a token.
"""
import base64, datetime, hashlib, json, os, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
EV = ROOT / 'store' / 'events'
PKG = 'info.inok.app'
LANGS = {'uk': 'uk', 'ru': 'ru-RU', 'en': 'en-US'}
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PKG
UPL = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PKG
SHORT = {'uk': '{}: трансляції богослужінь з монастирів України', 'ru': '{}: трансляции богослужений из монастырей Украины', 'en': "{}: live church services from Ukraine's monasteries"}

def b64(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
def token(sa):
    now = int(time.time())
    msg = (b64(json.dumps({'alg': 'RS256', 'typ': 'JWT'}).encode()) + '.' + b64(json.dumps({'iss': sa['client_email'], 'scope': 'https://www.googleapis.com/auth/androidpublisher', 'aud': sa['token_uri'], 'iat': now, 'exp': now + 1800}).encode()))
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        sig = serialization.load_pem_private_key(sa['private_key'].encode(), None).sign(msg.encode(), padding.PKCS1v15(), hashes.SHA256())
    except ImportError:
        fd, kp = tempfile.mkstemp(suffix='.pem'); os.close(fd)
        try:
            Path(kp).write_text(sa['private_key']); sig = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', kp], input=msg.encode(), capture_output=True, check=True).stdout
        finally:
            os.remove(kp)
    data = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': msg + '.' + b64(sig)}).encode()
    return json.loads(urllib.request.urlopen(urllib.request.Request(sa['token_uri'], data=data), timeout=60).read())['access_token']
def call(m, url, tok, data=None, ctype='application/json'):
    req = urllib.request.Request(url, data=data, method=m, headers={'Authorization': 'Bearer ' + tok, 'Content-Type': ctype})
    try:
        r = urllib.request.urlopen(req, timeout=300).read()
        return json.loads(r) if r else {}
    except urllib.error.HTTPError as e:
        raise SystemExit('Google Play API ' + m + ' ' + url.split(PKG)[-1].split('?')[0] + ': HTTP ' + str(e.code) + ' ' + e.read()[:600].decode('utf-8', 'replace'))
def kyiv_today():
    u = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None); y = u.year
    def last_sun(mo): d = datetime.datetime(y, mo, 31 if mo in (3, 10) else 30); return d - datetime.timedelta(days=(d.weekday() + 1) % 7)
    off = 3 if last_sun(3).replace(hour=1) <= u < last_sun(10).replace(hour=1) else 2
    return (u + datetime.timedelta(hours=off)).date()
def plan(day):
    F = json.loads((EV / 'feasts.json').read_text(encoding='utf-8'))['events']
    for e in F:
        if e['play_from'] <= day.isoformat() <= e['play_to']:
            return e
    return None
def live(tok, edit):
    out = {}
    for k, code in LANGS.items():
        l = call('GET', API + '/edits/' + edit + '/listings/' + code, tok)
        im = call('GET', API + '/edits/' + edit + '/listings/' + code + '/featureGraphic', tok).get('images', [])
        out[k] = {'title': l.get('title'), 'short': l.get('shortDescription'), 'feature_sha256': [i.get('sha256') for i in im]}
    return out
def main():
    mode, sa_path = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    sa = json.loads(Path(sa_path).read_text(encoding='utf-8'))
    tok = token(sa)
    edit = call('POST', API + '/edits', tok, b'{}')['id']
    try:
        cur = live(tok, edit)
        if mode == 'check':
            for k, v in cur.items(): print('LIVE', k, '| title:', v['title'], '| short:', v['short'], '| feature:', v['feature_sha256'])
            return
        if mode == 'probe':  # write right inside an edit that is then DELETED (never committed): the same short description written back
            call('PATCH', API + '/edits/' + edit + '/listings/uk', tok, json.dumps({'shortDescription': cur['uk']['short']}).encode())
            print('PROBE OK: the account may write the listing (edit discarded, nothing committed)')
            return
        if mode == 'capture':
            normal = {k: {'title': v['title'], 'short': v['short'], 'feature': 'store/graphics/feature-' + k + '.png'} for k, v in cur.items()}
            for k, v in normal.items():
                sha = hashlib.sha256((ROOT / v['feature']).read_bytes()).hexdigest()
                print('NORMAL', k, '| short:', v['short'], '| repo feature sha256 == live:', sha in cur[k]['feature_sha256'])
            (EV / 'play_normal.json').write_text(json.dumps(normal, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
            return
        day = datetime.date.fromisoformat(args[args.index('--date') + 1]) if '--date' in args else kyiv_today()
        e = plan(day)
        normal = json.loads((EV / 'play_normal.json').read_text(encoding='utf-8'))
        want = {}
        for i, k in enumerate(LANGS):
            if e:
                want[k] = {'short': SHORT[k].format(e['name'][i]), 'feature': EV / 'play' / ('feature_' + e['art'] + '_' + k + '.png')}
            else:
                want[k] = {'short': normal[k]['short'], 'feature': ROOT / normal[k]['feature']}
        print('PLAN', day.isoformat(), '->', (e['key'] if e else 'normal'))
        todo = []
        for k, code in LANGS.items():
            sha = hashlib.sha256(want[k]['feature'].read_bytes()).hexdigest()
            if cur[k]['short'] != want[k]['short'] or sha not in cur[k]['feature_sha256'] or len(cur[k]['feature_sha256']) != 1:
                todo.append(k)
        if not todo:
            print('NOTHING TO DO: the live listing already matches'); return
        print('CHANGE', ', '.join(todo), '(dry)' if '--dry' in args else '')
        if '--dry' in args:
            return
        for k in todo:
            code = LANGS[k]
            if cur[k]['short'] != want[k]['short']:
                call('PATCH', API + '/edits/' + edit + '/listings/' + code, tok, json.dumps({'shortDescription': want[k]['short']}).encode())
            call('DELETE', API + '/edits/' + edit + '/listings/' + code + '/featureGraphic', tok)
            call('POST', UPL + '/edits/' + edit + '/listings/' + code + '/featureGraphic?uploadType=media', tok, want[k]['feature'].read_bytes(), 'image/png')
            print('SET', k, '| short:', want[k]['short'], '| feature:', want[k]['feature'].name)
        call('POST', API + '/edits/' + edit + ':commit', tok, b'{}')
        edit = None
        print('COMMITTED - Google reviews the listing change')
    finally:
        if edit:
            try:
                call('DELETE', API + '/edits/' + edit, tok)
            except SystemExit:
                pass
if __name__ == '__main__':
    main()
