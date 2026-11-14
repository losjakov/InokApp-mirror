# -*- coding: utf-8 -*-
"""refresh_fixtures.py - rebuild fixtures/ from a LIVE sample of the keyed export (contract §2) and live-status (§3).

  python -I scripts/refresh_fixtures.py <directory_v1.json> <live-status.json>

Keeps every dictionary / oblast / eparchy / channel of the export and the CODES below (the cards the tests and the
screens use: the five of cloud_01, the canonical-unit pairs 98/110 and 101/109 (A-10), the three lavras and one house of
every marker kind (A-12)). Phones (and contacts.phone) are masked (every digit -> 9), e-mails become placeholders - real contacts never reach git.
Then runs make_fixture_gz.py; validate with validate_fixtures.py.
"""
import json, os, re, subprocess, sys

CODES = [37, 159, 267, 275, 295, 98, 110, 101, 109, 111, 242, 46, 315, 56, 105, 102, 108, 27]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = os.path.join(ROOT, 'fixtures')


NUMBER = re.compile(r'\+?\d[\d\s()-]{7,}\d')  # the app's own number pattern (src/data/repo/phones.ts)


def mask_numbers(line):
    return NUMBER.sub(lambda x: re.sub(r'\d', '9', x.group(0)), line or '')


def mask(m):
    # R-20: only the NUMBERS are masked; the text lines (hours) stay as the card prints them
    m['phones'] = [mask_numbers(p) for p in m.get('phones') or []]
    if m.get('email'):
        m['email'] = 'house%d@example.invalid' % m['code']
    return m


def dump(name, obj):
    with open(os.path.join(FX, name), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write('\n')


def main(exp, live):
    d = json.load(open(exp, encoding='utf-8'))
    by = {m['code']: m for m in d['monasteries']}
    d['monasteries'] = [mask(by[c]) for c in CODES]
    if d.get('contacts'):  # R-21: the editorial phone is masked like every phone (reports/README.md)
        d['contacts']['phone'] = re.sub(r'\d', '9', d['contacts']['phone'] or '') or None
        d['contacts']['phone_dial'] = re.sub(r'\d', '9', d['contacts']['phone_dial'] or '') or None
    dump('directory_v1.json', d)
    man = json.load(open(os.path.join(FX, 'manifest.json'), encoding='utf-8'))
    man.update(export_version=d['export_version'], generated_at=d['generated_at'], contract_version=d['contract_version'],
               counts={k: len(d[k]) for k in ('monasteries', 'eparchies', 'channels', 'oblasts')})
    dump('manifest.json', man)
    dump('live-status.json', json.load(open(live, encoding='utf-8')))
    subprocess.check_call([sys.executable, '-I', os.path.join(ROOT, 'scripts', 'make_fixture_gz.py')])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
