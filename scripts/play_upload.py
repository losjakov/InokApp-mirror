#!/usr/bin/env python3
"""A-117 A5 (his word 15.11 18:28 «конечно да»): the TAG run uploads the signed AAB to Google Play's INTERNAL testing as a DRAFT - a person
publishes it (Play Console), never this script. Google Play Developer API v3 (androidpublisher), stdlib + the `openssl` CLI only (the
service account's JWT is signed by openssl; no package is installed on the runner). The «Що нового» = store/release_notes/<version>.md,
the SAME three sections the unit test checks (uk / ru / en, <= 500 characters each).

  play_upload.py body <package.json> <notes dir>              -> the track body (JSON) that would be sent; no network (the unit test)
  play_upload.py texts <package.json> <notes dir>             -> {play, appstore} x uk / ru / en (JSON; the App Store text is pasted by a person)
  play_upload.py upload <service account json> <aab> <package.json> <notes dir> [--package info.inok.app]
Prints one line per step; never prints a key, a token or the account's e-mail.
"""
import base64, importlib.util, json, re, subprocess, sys, tempfile, time, urllib.request, urllib.parse
from pathlib import Path

# THE version rule (scripts/app_version.py), loaded by path: `python3 -I` keeps the script's folder off sys.path
_spec = importlib.util.spec_from_file_location('app_version', Path(__file__).with_name('app_version.py'))
_av = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_av)
version_of = _av.version_of

PACKAGE = 'info.inok.app'
TRACK = 'internal'
# the notes' sections -> Play's language codes (the console of 10010 showed uk / en-US / ru-RU)
LANGS = {'uk': 'uk', 'ru': 'ru-RU', 'en': 'en-US'}
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications'
SCOPE = 'https://www.googleapis.com/auth/androidpublisher'


# A-156 (CD S330): a section may end with ONE App Store line - Google Play shows the shared lines, the App Store the shared lines with that
# line put after the second one (Play <= 500 characters, Apple <= 4000)
APPSTORE_ONLY = 'App Store only, after the second line:'
LIMIT = {'play': 500, 'appstore': 4000}


def texts(notes_dir: str, version: str) -> dict:
    """THE parse of store/release_notes/<version>.md: {'play': {sec: text}, 'appstore': {sec: text}}; a missing / too long text exits."""
    s = Path(notes_dir, f'{version}.md').read_text(encoding='utf-8')
    out = {'play': {}, 'appstore': {}}
    for sec in LANGS:
        m = re.search(rf'## {sec}\n([\s\S]*?)(?=\n## |\n# |$)', s)
        lines = (m[1] if m else '').strip().split('\n')
        extra = [l[len(APPSTORE_ONLY):].strip() for l in lines if l.startswith(APPSTORE_ONLY)]
        shared = [l for l in lines if not l.startswith(APPSTORE_ONLY)]
        out['play'][sec] = '\n'.join(shared).strip()
        out['appstore'][sec] = '\n'.join(shared[:2] + extra + shared[2:]).strip()
        for store, t in out.items():
            n = len(t[sec])
            if not n or n > LIMIT[store]: raise SystemExit(f'release notes {version} {sec} ({store}): {n} characters (1..{LIMIT[store]})')
    return out


def notes(notes_dir: str, version: str) -> list[dict]:
    play = texts(notes_dir, version)['play']
    return [{'language': code, 'text': play[sec]} for sec, code in LANGS.items()]


def body(package_json: str, notes_dir: str) -> dict:
    v, code = version_of(package_json)
    return {'track': TRACK, 'releases': [{'name': f'{code} ({v})', 'versionCodes': [str(code)], 'status': 'draft', 'releaseNotes': notes(notes_dir, v)}]}


def b64(b: bytes) -> str: return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def token(sa: dict) -> str:
    now = int(time.time())
    head = b64(json.dumps({'alg': 'RS256', 'typ': 'JWT'}).encode())
    claim = b64(json.dumps({'iss': sa['client_email'], 'scope': SCOPE, 'aud': sa['token_uri'], 'iat': now, 'exp': now + 1800}).encode())
    with tempfile.NamedTemporaryFile('w', suffix='.pem') as k:
        k.write(sa['private_key']); k.flush()
        sig = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', k.name], input=f'{head}.{claim}'.encode(), capture_output=True, check=True).stdout
    data = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': f'{head}.{claim}.{b64(sig)}'}).encode()
    return json.loads(urllib.request.urlopen(urllib.request.Request(sa['token_uri'], data=data), timeout=60).read())['access_token']


def call(method: str, url: str, tok: str, data: bytes | None = None, ctype: str = 'application/json') -> dict:
    req = urllib.request.Request(url, data=data, method=method, headers={'Authorization': f'Bearer {tok}', 'Content-Type': ctype})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=900).read() or b'{}')
    except urllib.error.HTTPError as e:  # Google's own message (no secret in it) - the summary names the cause
        raise SystemExit(f'Google Play API {method} {url.split("/applications/")[-1].split("?")[0]}: HTTP {e.code} {e.read()[:600].decode("utf-8", "replace")}')


def upload(sa_path: str, aab: str, package_json: str, notes_dir: str, pkg: str) -> None:
    track = body(package_json, notes_dir)
    sa = json.loads(Path(sa_path).read_text(encoding='utf-8'))
    tok = token(sa)
    edit = call('POST', f'{API}/{pkg}/edits', tok, b'{}')['id']
    print(f'Google Play: edit opened for {pkg}')
    got = call('POST', f'{UPLOAD}/{pkg}/edits/{edit}/bundles?uploadType=media', tok, Path(aab).read_bytes(), 'application/octet-stream')
    if str(got.get('versionCode')) != track['releases'][0]['versionCodes'][0]:
        raise SystemExit(f'Google Play: the uploaded AAB is versionCode {got.get("versionCode")}, package.json says {track["releases"][0]["versionCodes"][0]}')
    print(f'Google Play: AAB uploaded, versionCode {got["versionCode"]}')
    call('PUT', f'{API}/{pkg}/edits/{edit}/tracks/{TRACK}', tok, json.dumps(track).encode())
    call('POST', f'{API}/{pkg}/edits/{edit}:commit', tok, b'{}')
    print(f'Google Play: {track["releases"][0]["name"]} = a DRAFT on internal testing, notes {" / ".join(LANGS.values())} - publish it in Play Console')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['body'] and len(a) == 3: print(json.dumps(body(a[1], a[2]), ensure_ascii=False, indent=1))
    elif a[:1] == ['texts'] and len(a) == 3: print(json.dumps(texts(a[2], version_of(a[1])[0]), ensure_ascii=False, indent=1))
    elif a[:1] == ['upload'] and len(a) >= 5: upload(a[1], a[2], a[3], a[4], a[a.index('--package') + 1] if '--package' in a else PACKAGE)
    else: raise SystemExit(__doc__)
