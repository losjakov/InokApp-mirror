# -*- coding: utf-8 -*-
"""make_fixture_gz.py - rebuild fixtures/directory_v1.json.gz from fixtures/directory_v1.json and refresh the manifest's sha256/bytes.
Run after editing directory_v1.json; then python scripts/validate_fixtures.py."""
import gzip, hashlib, json, os, sys

FX = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'fixtures')
src = os.path.join(FX, 'directory_v1.json')
raw = open(src, 'rb').read()
gz = gzip.compress(raw, 9, mtime=0)
open(os.path.join(FX, 'directory_v1.json.gz'), 'wb').write(gz)
mp = os.path.join(FX, 'manifest.json')
man = json.load(open(mp, encoding='utf-8'))
man['files'] = [{'name': 'directory_v1.json.gz', 'sha256': hashlib.sha256(gz).hexdigest(), 'bytes': len(gz)}]
with open(mp, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(man, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('gz %d b, sha256 %s' % (len(gz), man['files'][0]['sha256'][:16]))
sys.exit(0)
