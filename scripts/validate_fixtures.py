# -*- coding: utf-8 -*-
"""validate_fixtures.py - the fixtures must be contract-shaped (ref/REF_app_api_contract.md §2-§3) and free of real contacts.

  python scripts/validate_fixtures.py        -> exit 0 = valid, otherwise the list of problems and exit 1

Checks: manifest counts == directory counts; every monastery carries the REQUIRED fields and a uk name; codes unique;
eparchy_id / oblast_id resolve; histories and article bodies use html-lite tags only; phones are masked (every digit is 9);
e-mails are placeholders; directory_v1.json.gz (if present) decompresses to the same JSON and matches the manifest sha256.
"""
import gzip, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FX = os.path.join(os.path.dirname(HERE), 'fixtures')
LITE = {'p', 'br', 'strong', 'em', 'sup', 'ul', 'ol', 'li', 'a'}
REQ = ('code', 'site_url', 'name', 'type', 'status', 'lat', 'lon', 'phones', 'history', 'updated_at')
problems = []


def load(name):
    with open(os.path.join(FX, name), encoding='utf-8') as f:
        return json.load(f)


def tags(html):
    return {t.lower() for t in re.findall(r'</?([a-zA-Z0-9]+)', html or '')}


def main():
    man = load('manifest.json')
    data = load('directory_v1.json')
    got = {k: len(data[k]) for k in ('monasteries', 'eparchies', 'channels', 'oblasts')}
    if got != man['counts']:
        problems.append('manifest counts %s != directory %s' % (man['counts'], got))
    if data.get('contract_version') != man.get('contract_version') or data.get('export_version') != man.get('export_version'):
        problems.append('contract_version / export_version differ between manifest and directory')
    codes = [m.get('code') for m in data['monasteries']]
    if len(codes) != len(set(codes)):
        problems.append('duplicate monastery codes')
    ep = {e['id'] for e in data['eparchies']}
    ob = {o['id'] for o in data['oblasts']}
    for m in data['monasteries']:
        miss = [k for k in REQ if k not in m]
        if miss or not m.get('name', {}).get('uk'):
            problems.append('card %s: missing %s' % (m.get('code'), miss or 'uk name'))
        if m.get('eparchy_id') is not None and m['eparchy_id'] not in ep:
            problems.append('card %s: eparchy_id %s unresolved' % (m['code'], m['eparchy_id']))
        if m.get('oblast_id') is not None and m['oblast_id'] not in ob:
            problems.append('card %s: oblast_id %s unresolved' % (m['code'], m['oblast_id']))
        for lang, h in (m.get('history') or {}).items():
            bad = tags(h) - LITE
            if bad:
                problems.append('card %s history %s: tags %s' % (m['code'], lang, sorted(bad)))
        for p in m.get('phones') or []:
            if any(re.search(r'[0-8]', n) for n in re.findall(r'\+?\d[\d\s()-]{7,}\d', p)):
                problems.append('card %s: phone not masked (%s)' % (m['code'], re.sub(r'\d', '*', p)))
        if m.get('email') and not m['email'].endswith('@example.invalid'):
            problems.append('card %s: e-mail is not a placeholder' % m['code'])
    c = data.get('contacts')  # R-21
    if c is not None:
        for k in ('phone', 'phone_dial'):
            if re.search(r'[0-8]', c.get(k) or ''):
                problems.append('contacts.%s not masked' % k)
        if not (c.get('address') or {}).get('uk'):
            problems.append('contacts: no uk address')
        bad = set().union(*[tags(v) for v in (c.get('hours') or {}).values()] or [set()]) - LITE
        if bad:
            problems.append('contacts hours: tags %s' % sorted(bad))
    for name in ('live-status.json', 'articles.json'):
        if os.path.exists(os.path.join(FX, name)):
            j = load(name)
            if name == 'articles.json':
                for it in j.get('items', []):
                    for v, extra in ((it.get('lead'), set()), (it.get('body'), {'img', 'h2', 'h3', 'h4', 'h5'})):  # R-18: body keeps <img>; R-33: h2-h5
                        bad = tags(v) - LITE - extra
                        if bad:
                            problems.append('article %s: tags %s' % (it.get('id'), sorted(bad)))
            else:
                if set(j) != {'at', 'live', 'scheduled', 'calendar'}:
                    problems.append('live-status keys %s' % sorted(j))
    gzp = os.path.join(FX, 'directory_v1.json.gz')
    if os.path.exists(gzp):
        raw = open(gzp, 'rb').read()
        if json.loads(gzip.decompress(raw)) != data:
            problems.append('directory_v1.json.gz does not decompress to directory_v1.json')
        f = man['files'][0]
        if hashlib.sha256(raw).hexdigest() != f['sha256'] or len(raw) != f['bytes']:
            problems.append('gz sha256/bytes != manifest (run scripts/make_fixture_gz.py)')
    for p in problems:
        print('PROBLEM ' + p)
    print('fixtures: %s (%d cards, %d eparchies, %d channels, %d oblasts)' % ('VALID' if not problems else 'INVALID', got['monasteries'], got['eparchies'], got['channels'], got['oblasts']))
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
