#!/usr/bin/env python3
"""a11y_report.py - A-88: the axe results of the screen ring (screens/out/a11y/*.json, written by screens/a11y.ts) summed into one
markdown report: per rule (nodes, screens, an example target), then per screen.

  python3 -I scripts/a11y_report.py <dir of json> <out.md> "<title>"
  python3 -I scripts/a11y_report.py --self-test
"""
import glob
import json
import os
import sys


def summarize(files):
    rules, screens, n_files, known, edge = {}, {}, 0, {}, 0
    for f in sorted(files):
        d = json.load(open(f, encoding='utf-8'))
        n_files += 1
        key = f"{d['screen']}__{d['profile']}"
        for k in d.get('known', []):
            known[k] = known.get(k, 0) + 1
        edge += len(d.get('edgeObscured', []))
        for v in d['violations']:
            r = rules.setdefault(v['rule'], {'impact': v['impact'], 'help': v['help'], 'nodes': 0, 'screens': set(), 'example': v['targets'][0] if v['targets'] else ''})
            r['nodes'] += len(v['targets'])
            r['screens'].add(key)
            screens[key] = screens.get(key, 0) + len(v['targets'])
    return n_files, rules, screens, known, edge


def markdown(title, n_files, rules, screens, known=None, edge=0):
    total = sum(r['nodes'] for r in rules.values())
    out = [f'# {title}', '', f'Screens × profiles checked: **{n_files}**; screens with a violation: **{len(screens)}**; '
           f'violations (axe nodes): **{total}** in **{len(rules)}** rules (WCAG 2.0 / 2.1 A + AA).', '']
    if known:
        out += ['Excused by `screens/a11y.ts` KNOWN (each with its reason there): ' + '; '.join(f'`{k}` x{n}' for k, n in sorted(known.items())), '']
    if edge:
        out += [f'`target-size` nodes cut by the viewport edge (measured at the shot\'s scroll position, full-size when scrolled to; listed in the JSON, not failed): {edge}', '']
    if rules:
        out += ['| rule | impact | nodes | screens | example target | what axe says |', '|---|---|---|---|---|---|']
        for k, r in sorted(rules.items(), key=lambda kv: -kv[1]['nodes']):
            out.append(f"| `{k}` | {r['impact']} | {r['nodes']} | {len(r['screens'])} | `{r['example'][:80]}` | {r['help']} |")
        out += ['', '## Per screen (nodes)', '']
        out += [f'- `{k}`: {v}' for k, v in sorted(screens.items(), key=lambda kv: (-kv[1], kv[0]))]
    return '\n'.join(out) + '\n'


def self_test():
    import tempfile
    d = tempfile.mkdtemp()
    json.dump({'screen': 'home', 'profile': 'tablet', 'violations': [{'rule': 'button-name', 'impact': 'critical', 'help': 'Buttons must have discernible text', 'targets': ['#a', '#b']}]}, open(os.path.join(d, 'a.json'), 'w'))
    json.dump({'screen': 'map', 'profile': 'tablet', 'violations': []}, open(os.path.join(d, 'b.json'), 'w'))
    n, rules, screens, known, edge = summarize(glob.glob(os.path.join(d, '*.json')))
    md = markdown('T', n, rules, screens, known, edge)
    assert n == 2 and rules['button-name']['nodes'] == 2 and screens == {'home__tablet': 2}, (n, rules, screens)
    assert 'violations (axe nodes): **2** in **1** rules' in md, md
    print('a11y_report self-test: PASS')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif len(sys.argv) == 4:
        n, rules, screens, known, edge = summarize(glob.glob(os.path.join(sys.argv[1], '*.json')))
        os.makedirs(os.path.dirname(sys.argv[2]) or '.', exist_ok=True)
        open(sys.argv[2], 'w', encoding='utf-8').write(markdown(sys.argv[3], n, rules, screens, known, edge))
        print(f'{sys.argv[2]}: {n} screens, {sum(r["nodes"] for r in rules.values())} nodes, {len(rules)} rules')
    else:
        print(__doc__, file=sys.stderr); sys.exit(2)
