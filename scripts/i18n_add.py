#!/usr/bin/env python3
"""Adds/updates UI strings in all three tables at once (uk first, ru, en) — one call per key keeps the tables in step (A-15).
  python3 scripts/i18n_add.py key 'uk text' 'ru text' 'en text' [key uk ru en ...]"""
import json, os, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'i18n')
a = sys.argv[1:]
assert a and len(a) % 4 == 0, __doc__
for i, lang in enumerate(('uk', 'ru', 'en')):
    p = os.path.join(ROOT, f'{lang}.json'); d = json.load(open(p, encoding='utf-8'))
    for j in range(0, len(a), 4): d[a[j]] = a[j + 1 + i]
    with open(p, 'w', encoding='utf-8', newline='\n') as f: json.dump(d, f, ensure_ascii=False, indent=2); f.write('\n')
