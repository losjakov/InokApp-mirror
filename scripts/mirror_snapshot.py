#!/usr/bin/env python3
"""mirror_snapshot.py - the public code mirror (A-104 / A-105 / A-106): build a snapshot of the code at HEAD and publish it.
Standard library only. The list of what leaves = scripts/mirror_paths.txt (ONE source); the guard below is a second, hard-coded layer.

  python3 -I scripts/mirror_snapshot.py build <dir>
      every TRACKED file at HEAD (`git ls-tree`, blobs - never the working tree) that the list names, + README.md = the public readme
      (scripts/mirror_README.md at HEAD); then the NEVER guard and the secret scan over the BUILT directory. Prints
      `files N, bytes M, source <sha>` and one `top:` line; any refusal = exit 1 with the file named.
  python3 -I scripts/mirror_snapshot.py publish <dir> <remote> [--emulator-matrix <standard|JSON>] [--orphan]
      the guard again, then the mirror's OWN linear history: fetch its `main`, replace the tree, ONE commit
      `snapshot <short sha>: <subject of HEAD>` only when the tree changed, push `main`. With a matrix: a commit on top of that tip
      that adds `.ci/emulator_matrix.json`, force-pushed to the branch `emulator` (always a new commit: the run id is in its message,
      so every request starts the mirror's emulator.yml). `--orphan` = one fresh root commit force-pushed to `main` (wipes the
      mirror's history; CD's act, never a session's). <remote> = any git URL (CI: git@github.com:<MIRROR_REPO>.git over the deploy
      key in GIT_SSH_COMMAND; self-test: a local bare repository).
  python3 -I scripts/mirror_snapshot.py check-matrix <value>     -> prints what .ci/emulator_matrix.json would hold; bad = exit 1
  python3 -I scripts/mirror_snapshot.py --self-test               -> planted private files / secrets each RED; publish on a local bare repo
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIST = 'scripts/mirror_paths.txt'
README_SRC = 'scripts/mirror_README.md'
MATRIX_FILE = '.ci/emulator_matrix.json'
BOT = ['-c', 'user.name=inok-mirror', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com']

# NEVER (REF_public_mirror §1): refused whatever the list says
NEVER_TOP = {'reports', 'ref', '.claude', '.git'}
NEVER_NAMES = {'NEXT.md', 'CLAUDE.md', 'google-services.json', 'GoogleService-Info.plist'}
NEVER_SUFFIX = ('.keystore', '.jks', '.p12', '.mobileprovision', '.p8')  # .p8 = an App Store Connect API key (cloud_36, A-118)
# secrets by content (bytes; the patterns cannot match their own source text)
SECRETS = [
    ('a private key block', re.compile(rb'-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----')),
    ('a Google API key (AIza...)', re.compile(rb'AIza[0-9A-Za-z_\-]{35}')),
    ('a GitHub token (gh?_...)', re.compile(rb'gh[opsu]_[A-Za-z0-9]{36}')),
    ('a GitHub token (github_pat_...)', re.compile(rb'github_pat_[A-Za-z0-9_]{22,}')),
]


def git(*args, cwd=ROOT, check=True, data=None):
    r = subprocess.run(['git', *args], cwd=cwd, input=data, capture_output=True)
    if check and r.returncode:
        raise SystemExit(f'git {" ".join(args)}: {r.stderr.decode(errors="replace").strip()}')
    return r


def read_list(text):
    out = []
    for ln in text.splitlines():
        ln = ln.strip()
        if ln and not ln.startswith('#'):
            if ln.startswith('/') or '..' in ln.split('/'):
                raise SystemExit(f'{LIST}: not a repository path: {ln}')
            out.append(ln)
    return out


def selected(path, allow):
    return any(path.startswith(a) if a.endswith('/') else path == a for a in allow)


def blob(rev, path):
    return git('show', f'{rev}:{path}').stdout


def build(dst, rev='HEAD'):
    """The snapshot of `rev` into an empty `dst`; returns (files, bytes, sha, top counts). Refuses on any guard hit."""
    if os.path.exists(dst) and os.listdir(dst):
        raise SystemExit(f'{dst}: not empty')
    os.makedirs(dst, exist_ok=True)
    sha = git('rev-parse', rev).stdout.decode().strip()
    allow = read_list(blob(sha, LIST).decode('utf-8'))
    readme = blob(sha, README_SRC)
    entries = []
    for rec in git('ls-tree', '-r', '-z', '--full-tree', sha).stdout.split(b'\0'):
        if not rec:
            continue
        meta, path = rec.split(b'\t', 1)
        mode, kind, obj = meta.decode().split()
        path = path.decode('utf-8')
        if selected(path, allow):
            if kind != 'blob' or mode not in ('100644', '100755'):
                raise SystemExit(f'REFUSED {path}: {kind} {mode} (only plain files leave)')
            entries.append((mode, obj, path))
    if any(p == 'README.md' for _, _, p in entries):
        raise SystemExit('REFUSED README.md: the list may not name the private readme')
    # one `git cat-file --batch` for every blob (fast, and the bytes are git's - the working tree is never read)
    data = git('cat-file', '--batch', data=''.join(f'{o}\n' for _, o, _ in entries).encode()).stdout
    pos = 0
    for mode, obj, path in entries:
        nl = data.index(b'\n', pos)
        size = int(data[pos:nl].split()[2])
        body = data[nl + 1:nl + 1 + size]
        pos = nl + 1 + size + 1
        f = os.path.join(dst, *path.split('/'))
        os.makedirs(os.path.dirname(f), exist_ok=True)
        with open(f, 'wb') as h:
            h.write(body)
        os.chmod(f, 0o755 if mode == '100755' else 0o644)
    with open(os.path.join(dst, 'README.md'), 'wb') as h:
        h.write(readme)
    refuse(guard(dst, readme))
    return stats(dst) + (sha,)


def stats(d):
    n = size = 0
    top = {}
    for rel in walk(d):
        n += 1
        size += os.path.getsize(os.path.join(d, rel))
        k = rel.split('/')[0] + ('/' if '/' in rel else '')
        top[k] = top.get(k, 0) + 1
    return n, size, top


def walk(d):
    for base, dirs, files in os.walk(d):
        dirs.sort()
        for name in sorted(files) + [x for x in dirs if os.path.islink(os.path.join(base, x))]:
            yield os.path.relpath(os.path.join(base, name), d).replace(os.sep, '/')
        for x in dirs:
            if x == '.git':  # a `.git` anywhere = history or a nested repository: named, never entered
                yield os.path.relpath(os.path.join(base, x), d).replace(os.sep, '/') + '/'
        dirs[:] = [x for x in dirs if x != '.git']


def guard(d, readme):
    """[(path, reason)] for every file the mirror must never hold. Reads the BUILT directory, not the list."""
    hits = []
    for rel in walk(d):
        parts = rel.rstrip('/').split('/')
        name = parts[-1]
        p = os.path.join(d, *parts)
        why = None
        if parts[0] in NEVER_TOP or '.git' in parts:
            why = 'a private directory (or git history)'
        elif parts[0] == 'store' and not rel.startswith('store/release_notes/'):
            why = 'store/ outside release_notes/'
        elif name.startswith('DECISIONS') or name in NEVER_NAMES:
            why = 'a private / secret file name'
        elif name.endswith(NEVER_SUFFIX) or name.startswith('.env'):
            why = 'a key / environment file name'
        elif os.path.islink(p):
            why = 'a symbolic link'
        elif rel == 'README.md' and open(p, 'rb').read() != readme:
            why = 'README.md is not the public readme (scripts/mirror_README.md)'
        else:
            body = open(p, 'rb').read()
            for label, rx in SECRETS:
                if rx.search(body):
                    why = f'content: {label}'
                    break
        if why:
            hits.append((rel, why))
    return hits


def refuse(hits):
    if hits:
        for rel, why in hits:
            print(f'REFUSED {rel}: {why}', file=sys.stderr)
        raise SystemExit(1)


def check_matrix(value):
    """'' -> None (no emulator); 'standard' -> 'standard' (emulator.yml's own list); else a JSON list of {api-level, target, ...}."""
    v = (value or '').strip()
    if not v:
        return None
    if v == 'standard':
        return 'standard'
    try:
        m = json.loads(v)
    except ValueError as e:
        raise SystemExit(f'emulator_matrix: not JSON ({e}); use «standard» or a list like [{{"api-level":26,"target":"google_apis"}}]')
    if not isinstance(m, list) or not m or not all(isinstance(x, dict) and isinstance(x.get('api-level'), int) and isinstance(x.get('target'), str) for x in m):
        raise SystemExit('emulator_matrix: a non-empty JSON list of {"api-level": <int>, "target": <str>, "required"?, "tag"?}')
    return json.dumps(m, separators=(',', ':'))


def source_commit(rev='HEAD', cwd=ROOT):
    """REVIEW cloud_32 NOTE 1: the commit a snapshot of `rev` is named after = the NEWEST commit up to `rev` that changed a listed path
    (its listed files = the snapshot's). A push of a code commit = that commit; a dispatch on a docs commit (CD's, his words in the
    subject) = the code commit below it, so a private docs subject never reaches the mirror and §3.1's «the snapshot names the release
    commit» holds. Needs the history (mirror.yml checks out 50 commits); none found = `rev` itself."""
    allow = read_list(git('show', f'{rev}:{LIST}', cwd=cwd).stdout.decode('utf-8'))
    out = git('log', '-1', '--format=%H%x1f%s', rev, '--', *allow, cwd=cwd).stdout.decode().strip()
    if not out:
        out = git('log', '-1', '--format=%H%x1f%s', rev, cwd=cwd).stdout.decode().strip()
    sha, subject = out.split('\x1f', 1)
    return sha, subject


def publish(snap, remote, matrix=None, orphan=False, src=None, subject=None, run_id=None):
    """Returns (main tip, committed?, emulator tip or None)."""
    if src is None:
        src, named = source_commit()
        subject = named if subject is None else subject
    sha = src
    subject = subject if subject is not None else git('log', '-1', '--format=%s', sha).stdout.decode().strip()
    run_id = run_id or os.environ.get('GITHUB_RUN_ID', 'local')
    m = check_matrix(matrix)
    readme = open(os.path.join(snap, 'README.md'), 'rb').read()
    refuse(guard(snap, readme))
    w = tempfile.mkdtemp(prefix='mirror-work-')
    try:
        git('init', '-q', '-b', 'main', w, cwd=snap)
        os.makedirs(os.path.join(w, '.git', 'info'), exist_ok=True)
        with open(os.path.join(w, '.git', 'info', 'attributes'), 'w', newline='\n') as h:
            h.write('* -text -filter\n')  # the snapshot's bytes = git's blobs; no eol / filter rewrite on the way back in
        heads = git('ls-remote', '--heads', remote, 'main', cwd=w)
        has_main = bool(heads.stdout.strip())
        if has_main and not orphan:
            git('fetch', '-q', '--depth', '1', remote, 'main', cwd=w)
            git('checkout', '-q', '-B', 'main', 'FETCH_HEAD', cwd=w)
        for x in os.listdir(w):
            if x != '.git':
                (shutil.rmtree if os.path.isdir(os.path.join(w, x)) and not os.path.islink(os.path.join(w, x)) else os.remove)(os.path.join(w, x))
        shutil.copytree(snap, w, dirs_exist_ok=True, symlinks=True)
        git('add', '-A', '-f', '.', cwd=w)
        changed = not has_main or orphan or git('diff', '--cached', '--quiet', cwd=w, check=False).returncode != 0
        if changed:
            git(*BOT, 'commit', '-q', '-m', f'snapshot {sha[:7]}: {subject}', cwd=w)
            git('push', '-q', *(['--force'] if orphan else []), remote, 'HEAD:refs/heads/main', cwd=w)
        tip = git('rev-parse', 'HEAD', cwd=w).stdout.decode().strip()
        emu = None
        if m:
            os.makedirs(os.path.join(w, '.ci'), exist_ok=True)
            with open(os.path.join(w, *MATRIX_FILE.split('/')), 'w', newline='\n') as h:  # NOTE 2 cloud_32: no CRLF on Windows
                h.write(m + '\n')
            git('add', '-f', MATRIX_FILE, cwd=w)
            git(*BOT, 'commit', '-q', '-m', f'emulator {sha[:7]} (run {run_id}): {m}', cwd=w)
            git('push', '-q', '--force', remote, 'HEAD:refs/heads/emulator', cwd=w)
            emu = git('rev-parse', 'HEAD', cwd=w).stdout.decode().strip()
        return tip, changed, emu
    finally:
        shutil.rmtree(w, ignore_errors=True)


def self_test():
    t = tempfile.mkdtemp(prefix='mirror-self-')
    try:
        # 1. the real snapshot of HEAD passes, holds the public readme and none of the private roots
        real = os.path.join(t, 'real')
        n, size, top, sha = build(real)
        assert n > 100 and size > 0 and 'src/' in top and 'ref/' not in top and 'reports/' not in top, (n, top)
        assert open(os.path.join(real, 'README.md'), 'rb').read() == blob(sha, README_SRC)
        assert not any(k.startswith(('store/', 'NEXT', 'CLAUDE', 'DECISIONS', '.claude')) for k in top if k != 'store/'), top
        # 2. the list: a directory entry takes only its own subtree; a file entry only itself
        assert selected('src/a.ts', ['src/']) and not selected('srcx/a.ts', ['src/']) and not selected('package.json.bak', ['package.json'])
        # 3. every planted private path / secret turns the guard RED and names the file
        readme = b'public readme\n'
        key = ('-----BEGIN ' + 'OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END ' + 'OPENSSH PRIVATE KEY-----\n').encode()
        plants = {
            'ref/x.md': b'x', 'reports/cloud_99/REPORT.md': b'x', 'store/listing_uk.md': b'x', 'DECISIONS_9.md': b'x', 'NEXT.md': b'x',
            'CLAUDE.md': b'x', '.claude/settings.json': b'{}', 'README.md': b'# the private readme\n',
            'android/app/upload.keystore': b'\x00', 'android/release.jks': b'\x00', 'android/app/google-services.json': b'{}',
            'ios/App/AuthKey_ABC123.p8': b'x', 'ios/App/App/GoogleService-Info.plist': b'<plist/>', 'ios/App/dist.mobileprovision': b'\x00',
            '.env.local': b'A=1', 'src/data/leak.ts': b'const k = `' + key + b'`;', 'src/a.ts': b"k='AIza" + b'B' * 35 + b"'",
            'scripts/t.sh': b'T=gh' + b'p_' + b'a' * 36, 'tests/x.ts': b'github_pat_' + b'A' * 30, '.git/config': b'[core]',
        }
        for rel, body in plants.items():
            d = os.path.join(t, 'p' + str(abs(hash(rel))))
            os.makedirs(os.path.join(d, 'src'))
            with open(os.path.join(d, 'README.md'), 'wb') as h:
                h.write(readme)
            with open(os.path.join(d, 'src', 'ok.ts'), 'wb') as h:
                h.write(b'export const ok = 1;\n')
            f = os.path.join(d, *rel.split('/'))
            os.makedirs(os.path.dirname(f), exist_ok=True)
            with open(f, 'wb') as h:
                h.write(body)
            hits = guard(d, readme)
            assert [h[0].rstrip('/') for h in hits] == ['.git' if rel.startswith('.git/') else rel], (rel, hits)
        # the allowed store path and a clean tree stay green
        d = os.path.join(t, 'clean')
        os.makedirs(os.path.join(d, 'store', 'release_notes'))
        open(os.path.join(d, 'store', 'release_notes', '1.0.7.md'), 'wb').write(b'notes')
        open(os.path.join(d, 'README.md'), 'wb').write(readme)
        assert guard(d, readme) == [], guard(d, readme)
        # 4. publish on a local bare repository = the mirror: linear history, no commit without a change, the emulator branch, orphan
        bare = os.path.join(t, 'mirror.git')
        git('init', '-q', '--bare', bare, cwd=t)
        def count(ref):
            return int(git('rev-list', '--count', ref, cwd=bare).stdout)
        tip1, c1, e1 = publish(d, bare, src='a' * 40, subject='first', run_id='1')
        assert c1 and e1 is None and count('main') == 1
        tip2, c2, _ = publish(d, bare, src='b' * 40, subject='docs only', run_id='2')
        assert not c2 and tip2 == tip1 and count('main') == 1, 'an unchanged snapshot made a commit'
        open(os.path.join(d, 'src.ts'), 'wb').write(b'x')
        tip3, c3, e3 = publish(d, bare, '[{"api-level":26,"target":"google_apis","required":false}]', src='c' * 40, subject='code', run_id='3')
        assert c3 and count('main') == 2 and git('rev-parse', 'main~1', cwd=bare).stdout.decode().strip() == tip1
        assert git('log', '-1', '--format=%s', 'main', cwd=bare).stdout.decode().strip() == 'snapshot ccccccc: code'
        assert git('rev-parse', 'emulator~1', cwd=bare).stdout.decode().strip() == tip3
        assert json.loads(git('show', f'emulator:{MATRIX_FILE}', cwd=bare).stdout)[0]['api-level'] == 26
        assert git('cat-file', '-e', f'main:{MATRIX_FILE}', cwd=bare, check=False).returncode != 0, 'the matrix leaked into main'
        _, _, e4 = publish(d, bare, 'standard', src='c' * 40, subject='code', run_id='4')
        assert e4 != e3 and git('show', f'emulator:{MATRIX_FILE}', cwd=bare).stdout == b'standard\n', 'the same request must start a new run'
        publish(d, bare, orphan=True, src='d' * 40, subject='wipe', run_id='5')
        assert count('main') == 1 and git('log', '-1', '--format=%s', 'main', cwd=bare).stdout.decode().strip() == 'snapshot ddddddd: wipe'
        # 4b. NOTE 1 cloud_32: the name of a snapshot = the newest commit that changed a listed path, never a docs commit on top
        r = os.path.join(t, 'named')
        git('init', '-q', '-b', 'main', r, cwd=t)
        def commit(path, body, msg):
            f = os.path.join(r, *path.split('/'))
            os.makedirs(os.path.dirname(f), exist_ok=True)
            open(f, 'wb').write(body)
            git('add', '-A', cwd=r)
            git(*BOT, 'commit', '-q', '-m', msg, cwd=r)
            return git('rev-parse', 'HEAD', cwd=r).stdout.decode().strip()
        commit(LIST, b'src/\n' + LIST.encode() + b'\n', 'list')
        code = commit('src/a.ts', b'1', 'code: the release')
        commit('ref/x.md', b'his words', 'docs: his words')
        assert source_commit('HEAD', r) == (code, 'code: the release'), source_commit('HEAD', r)
        assert source_commit(code, r) == (code, 'code: the release')
        # NOTE 2: the matrix file is LF on every OS (the request above compared b'standard\n')
        assert b'\r' not in git('show', f'emulator:{MATRIX_FILE}', cwd=bare).stdout
        # 5. the matrix input
        assert check_matrix('') is None and check_matrix(' standard ') == 'standard'
        assert check_matrix('[{"api-level": 35, "target": "google_apis", "tag": "r1"}]') == '[{"api-level":35,"target":"google_apis","tag":"r1"}]'
        for bad in ('x', '[]', '{"api-level":26}', '[{"api-level":"26","target":"x"}]'):
            try:
                check_matrix(bad)
                raise AssertionError(f'matrix accepted: {bad}')
            except SystemExit:
                pass
        print(f'mirror_snapshot self-test: PASS ({len(plants)} planted files RED, HEAD snapshot {n} files green, publish x5 on a bare repo, the snapshot named after the newest listed-path commit)')
    finally:
        shutil.rmtree(t, ignore_errors=True)


def main(a):
    if a == ['--self-test']:
        self_test()
    elif len(a) == 2 and a[0] == 'build':
        n, size, top, sha = build(a[1])
        print(f'files {n}, bytes {size}, source {sha}')
        print('top: ' + ', '.join(f'{k} {v}' for k, v in sorted(top.items())))
    elif len(a) >= 3 and a[0] == 'publish':
        rest = a[3:]
        matrix = rest[rest.index('--emulator-matrix') + 1] if '--emulator-matrix' in rest else None
        tip, changed, emu = publish(a[1], a[2], matrix, orphan='--orphan' in rest)
        print(f'mirror main {tip[:7]} ({"new snapshot commit" if changed else "no change - no commit"})' + (f'; emulator {emu[:7]} pushed' if emu else ''))
    elif len(a) == 2 and a[0] == 'check-matrix':
        print(check_matrix(a[1]) or '(none - no emulator run)')
    else:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)


if __name__ == '__main__':
    main(sys.argv[1:])
