"""bash32_check.py - cloud_39 (B3; E3 of cloud_37 and cloud_38 paid twice): the shell that runs on macOS runners is bash 3.2.

THE list of what macOS runs: every `run:` block of .github/workflows/ios.yml and of the composite actions it uses (.github/actions/*),
and every scripts/*.sh they name (plus what those source with `. "$ROOT/scripts/x.sh"`). In them it refuses:
  - `$name` written right before a non-ASCII character («$x» - bash 3.2 reads the first byte of «»» into the name: `x\\xc2: unbound
    variable`); write `${x}`;
  - what bash 3.2 has not: mapfile / readarray, `declare -A` / `local -A`, `${x,,}` / `${x^^}`, `|&`, `&>>`, coproc, `timeout` (no
    such command on macOS - `perl -e 'alarm shift; exec @ARGV' N cmd`).
  python3 -I scripts/bash32_check.py            -> «bash 3.2: PASS (n files, m blocks)» or each finding + exit 1
  python3 -I scripts/bash32_check.py --self-test
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BEFORE_NON_ASCII = re.compile(r'\$[A-Za-z_][A-Za-z0-9_]*(?=[^\x00-\x7f])')
BASH4 = [(re.compile(r'\b(mapfile|readarray|coproc)\b'), 'no {0} in bash 3.2'),
         (re.compile(r'\b(declare|local|typeset) -A\b'), 'no associative arrays in bash 3.2'),
         (re.compile(r'\$\{[A-Za-z_][A-Za-z0-9_]*(,,|\^\^)\}'), 'no ${{x,,}} / ${{x^^}} in bash 3.2'),
         (re.compile(r'\|&|&>>'), 'no «|&» / «&>>» in bash 3.2'),
         (re.compile(r'(^|[;&|(]\s*|\bthen\s+|\bdo\s+)timeout\s+\d'), 'no `timeout` command on macOS')]


def findings(text, name):
    out = []
    for i, line in enumerate(text.splitlines(), 1):
        code = line.split(' #', 1)[0] if not line.lstrip().startswith('#') else ''
        if not code.strip():
            continue
        for m in BEFORE_NON_ASCII.finditer(code):
            out.append(f'{name}:{i}: «{m.group(0)}» before a non-ASCII character - write ${{{m.group(0)[1:]}}}')
        for rx, why in BASH4:
            m = rx.search(code)
            if m:
                out.append(f'{name}:{i}: {why.format(m.group(1) if m.groups() else m.group(0))}')
    return out


def run_blocks(yml):
    """The shell text of every `run:` of a workflow / composite action (a block scalar or one line)."""
    lines = yml.splitlines(); blocks = []
    i = 0
    while i < len(lines):
        m = re.match(r'^(\s*)(?:- )?run: ?(.*)$', lines[i])
        if m:
            ind = len(m.group(1)); first = m.group(2)
            if first.strip() in ('|', '>', '|-', '>-'):
                body = []; i += 1
                while i < len(lines) and (not lines[i].strip() or len(lines[i]) - len(lines[i].lstrip()) > ind):
                    body.append(lines[i]); i += 1
                blocks.append('\n'.join(body)); continue
            blocks.append(first)
        i += 1
    return blocks


def mac_files():
    read = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
    ymls = ['.github/workflows/ios.yml'] + sorted(f'.github/actions/{a}/action.yml' for a in os.listdir(os.path.join(ROOT, '.github/actions'))
                                                  if f'./.github/actions/{a}' in read('.github/workflows/ios.yml'))
    blocks = [(y, b) for y in ymls for b in run_blocks(read(y))]
    scripts, todo = set(), [s for _, b in blocks for s in re.findall(r'scripts/([\w.-]+\.sh)', b)]
    while todo:
        s = todo.pop()
        if s in scripts or not os.path.exists(os.path.join(ROOT, 'scripts', s)):
            continue
        scripts.add(s)
        todo += re.findall(r'^\s*(?:\.|source) "?\$ROOT/scripts/([\w.-]+\.sh)', read(f'scripts/{s}'), re.M)
    return blocks, sorted(scripts)


def main():
    blocks, scripts = mac_files()
    bad = [f for y, b in blocks for f in findings(b, y)]
    bad += [f for s in scripts for f in findings(open(os.path.join(ROOT, 'scripts', s), encoding='utf-8').read(), f'scripts/{s}')]
    for f in bad:
        print(f)
    print(f'bash 3.2: {"FAIL" if bad else "PASS"} ({len(scripts)} scripts: {" ".join(scripts)}; {len(blocks)} run blocks)')
    return 1 if bad else 0


def self_test():
    assert findings('echo "«$x»"', 't') and 'write ${x}' in findings('echo "«$x»"', 't')[0]  # cloud_37 E2, cloud_38 E3
    assert findings('echo "«${x}»"', 't') == [] and findings('echo "$x и"', 't') == []  # braces, or a space before the letter
    assert findings('mapfile -t a < f', 't') and findings('declare -A m', 't') and findings('echo ${v,,}', 't')
    assert findings('cmd |& tee x', 't') and findings('timeout 60 adb wait-for-device', 't')
    assert findings('timeout-minutes: 90', 't') == [] and findings("perl -e 'alarm shift; exec @ARGV' 60 cmd", 't') == []
    assert findings('# mapfile is not in 3.2', 't') == [] and findings('echo ok # «$x»', 't') == []
    assert run_blocks('steps:\n  - run: |\n      a\n      b\n  - name: x\n    run: echo c\n') == ['      a\n      b', 'echo c']
    blocks, scripts = mac_files()
    assert 'ios_sim_tour.sh' in scripts and 'store_lib.sh' in scripts, scripts
    print('bash32_check self-test: PASS')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        sys.exit(main())
