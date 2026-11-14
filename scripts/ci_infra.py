#!/usr/bin/env python3
"""ci_infra.py - A-87 (1c): THE rule that tells «a host was unreachable» from «our code / a test failed» (one source; scripts/ci_step.sh
and the emulator smoke call it). A CI failure that is INFRA is re-run; a CODE failure is fixed - CD must never re-run a code failure
or debug a mirror.

  python3 -I scripts/ci_infra.py classify <kind> <log> <exit code>  -> prints 'INFRA <host>' | 'CODE'
       kind net  = a fetch or a build that downloads (npm, Gradle, sdkmanager, Playwright's browser): a network signature in the log
                   (DNS, refused / reset / timed-out connection to a REMOTE host, HTTP 5xx) or the attempt's own timeout (124) = INFRA
       kind test = our tests / the smoke: never INFRA by a log line (a test may print anything); the smoke marks INFRA itself, only
                   after it probed the host
       kind emu  = the emulator smoke's probe of the device (`adb get-state`, cloud_32 / REVIEW cloud_31 answer 3): adb saying the
                   device is gone (`error: device offline`, no devices) = INFRA - the emulator died, not the app; anything else = CODE
  python3 -I scripts/ci_infra.py mark <INFRA|IMAGE|CODE> <host or what> <step label>   -> the job's verdict mark (the first mark wins)
  python3 -I scripts/ci_infra.py verdict <job status>                -> the job summary: the FIRST line is the verdict, then the lines
                                                                        the steps collected in $INOK_CI_DIR/summary.md
  python3 -I scripts/ci_infra.py facts                              -> A-104 (cloud_32): which repository / event runs this job - the event, the
                                                                        ref, `github.event.repository.private` as the expression saw it
                                                                        (env EXPR_PRIVATE) and as the payload holds it, MIRROR_LIVE (env)
  python3 -I scripts/ci_infra.py --self-test
"""
import json
import os
import re
import sys

CI_DIR = os.environ.get('INOK_CI_DIR', '/tmp/inok-ci')
# a network signature = the remote side never answered properly; each pattern is a real tool's wording (apt, curl, npm, Node, Gradle/Java, Playwright)
NET = re.compile('|'.join([
    r'Temporary failure (?:resolving|in name resolution)', r'Could not resolve host', r'getaddrinfo', r'EAI_AGAIN', r'ENOTFOUND',
    r'UnknownHostException', r'Name or service not known', r'No address associated with hostname',
    r'ETIMEDOUT', r'ECONNRESET', r'ECONNREFUSED', r'socket hang up', r'Connection timed out', r'Read timed out', r'connect timed out',
    r'SocketTimeoutException', r'Connection reset', r'Network is unreachable', r'TLS handshake timeout',
    r'Received status code 5\d\d', r'npm (?:ERR!|error) (?:code )?E?5\d\d', r'HTTP Error 5\d\d', r'\b50[234] (?:Bad Gateway|Service Unavailable|Gateway Time)',
    r'Could not (?:GET|HEAD) \'https?://', r'curl: \((?:6|7|28|35|52|56|18|92)\)', r'Download failure', r'Failed to download',
    # a download cut short arrives as a broken archive (cloud_28, emulator 43077824891: sdkmanager «Error reading Zip content»)
    r'Error reading Zip content', r'error occurred while preparing SDK package', r'Unexpected end of ZLIB input', r'zip END header not found',
]), re.I)
LOCAL = re.compile(r'localhost|127\.0\.0\.1|::1|0\.0\.0\.0')
# cloud_30 (build 43431013501 attempt 1, REVIEW 30 N3): with no Gradle cache EVERY classpath artifact came back «Could not find» from dl.google.com
# AND Maven Central - the repositories answered empty, not our build. ONE missing artifact (a typo'd version) stays CODE: INFRA needs >= 5
# distinct artifacts and both repositories named in the searched locations.
NOT_FOUND = re.compile(r'Could not find ([\w.\-]+:[\w.\-]+:[\w.\-]+)')
WHOLE_CLASSPATH = 5
# cloud_32 (REVIEW cloud_31 answer 3, emulator 43560886828 API 35): gfxstream errors, then `error: device offline` - the emulator died after
# every check had run; adb's own words for a lost device
EMU_LOST = re.compile(r'error: device offline|error: no devices/emulators found|error: device \S* ?not found|error: closed', re.I)
HOST = re.compile(r'(?:https?://)?((?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|info|cloud|googleapis\.com|ubuntu\.com))\b', re.I)


def classify(kind, text, code):
    """'INFRA <host>' or 'CODE'. A test step is never INFRA from its log (pre-mortem: «INFRA» must not hide a real failure)."""
    if code == 0:
        return 'OK'
    if kind == 'emu':
        m = EMU_LOST.search(text)
        return f'INFRA the emulator (adb: {m.group(0)})' if m else 'CODE'
    if kind != 'net':
        return 'CODE'
    lines = text.splitlines()
    for i, ln in enumerate(lines):
        if NET.search(ln) and not LOCAL.search(ln):
            # the host is on the signature's line, or a tool names it on the next / previous lines (npm: «code EAI_AGAIN», then the URL)
            h = HOST.search(ln) or HOST.search('\n'.join(lines[i:i + 4])) or HOST.search('\n'.join(lines[max(0, i - 3):i]))
            return f'INFRA {h.group(1) if h else "a remote host"}'
    missing = set(NOT_FOUND.findall(text))
    if len(missing) >= WHOLE_CLASSPATH and 'dl.google.com' in text and 'repo.maven.apache.org' in text:
        return f'INFRA dl.google.com + repo.maven.apache.org ({len(missing)} artifacts not found)'
    if code == 124:
        return 'INFRA timeout'
    return 'CODE'


def mark(what, host, label):
    os.makedirs(CI_DIR, exist_ok=True)
    p = os.path.join(CI_DIR, 'verdict.txt')
    if os.path.exists(p):
        return open(p, encoding='utf-8').read().strip()  # the FIRST failure is the cause; later ones follow from it
    line = {'INFRA': f'INFRA: {host} unreachable (step «{label}») - re-run, not code',
            'IMAGE': f'INFRA: the runner image changed - {host} (step «{label}»); a workflow fix, not app code',
            }.get(what, f'CODE: step «{label}» failed - a test or our code, not a mirror; read its log, fix, do not re-run')
    open(p, 'w', encoding='utf-8').write(line + '\n')
    return line


def verdict(status):
    p = os.path.join(CI_DIR, 'verdict.txt')
    if status == 'success':
        first = 'OK: every step green'
    elif os.path.exists(p):
        first = open(p, encoding='utf-8').read().strip()
    elif status == 'cancelled':
        first = 'CANCELLED: superseded or stopped - nothing to read'
    else:
        first = 'UNCLASSIFIED: a setup action failed (checkout / setup-* / the emulator action) - open its log; INFRA if it shows a network error'
    s = os.path.join(CI_DIR, 'summary.md')
    rest = open(s, encoding='utf-8').read() if os.path.exists(s) else ''
    return f'**{first}**\n\n{rest}'


def facts():
    ev = {}
    p = os.environ.get('GITHUB_EVENT_PATH', '')
    if p and os.path.exists(p):
        ev = json.load(open(p, encoding='utf-8'))
    repo = ev.get('repository') or {}
    line = (f"facts: event={os.environ.get('GITHUB_EVENT_NAME', '?')} ref={os.environ.get('GITHUB_REF', '?')} "
            f"expression github.event.repository.private=[{os.environ.get('EXPR_PRIVATE', '')}] "
            f"payload private={json.dumps(repo.get('private'))} visibility={json.dumps(repo.get('visibility'))} "
            f"MIRROR_LIVE=[{os.environ.get('MIRROR_LIVE', '')}]")
    os.makedirs(CI_DIR, exist_ok=True)
    with open(os.path.join(CI_DIR, 'summary.md'), 'a', encoding='utf-8') as h:
        h.write(f'- {line}\n')
    return line


def self_test():
    apt = "Err:1 http://azure.archive.ubuntu.com/ubuntu noble InRelease\n  Temporary failure resolving 'azure.archive.ubuntu.com'"
    assert classify('net', apt, 100) == 'INFRA azure.archive.ubuntu.com', classify('net', apt, 100)
    npm = 'npm error code EAI_AGAIN\nnpm error request to https://registry.npmjs.org/vite failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org'
    assert classify('net', npm, 1) == 'INFRA registry.npmjs.org', classify('net', npm, 1)
    gradle = "> Could not GET 'https://dl.google.com/dl/android/maven2/x.pom'. Received status code 503 from server: Service Unavailable"
    assert classify('net', gradle, 1) == 'INFRA dl.google.com', classify('net', gradle, 1)
    pw = 'Error: getaddrinfo ENOTFOUND cdn.playwright.dev\nDownload failure, code=1'
    assert classify('net', pw, 1) == 'INFRA cdn.playwright.dev'
    sdk = '[====    ] 21% Downloading emulator-linux_x64-167\nWarning: An error occurred while preparing SDK package Android Emulator: Error reading Zip content from a SeekableByteChannel.'
    assert classify('net', sdk, 1).startswith('INFRA'), classify('net', sdk, 1)
    # the whole classpath «Could not find» on both repositories (cloud_30) = INFRA; one artifact = CODE (a wrong version is ours)
    loc = '\n    Searched in the following locations:\n      - https://dl.google.com/dl/android/maven2/{p}.pom\n      - https://repo.maven.apache.org/maven2/{p}.pom'
    arts = ['com.android.tools.build:gradle:8.13.0', 'com.google.gms:google-services:4.4.4', 'com.android.tools:common:31.13.0',
            'com.android.tools.build:builder:8.13.0', 'com.android.tools.build:manifest-merger:31.13.0', 'org.jetbrains.kotlin:kotlin-stdlib:2.2.20']
    whole = "> Could not resolve all artifacts for configuration 'classpath'.\n" + '\n'.join(f'   > Could not find {a}.' + loc.format(p=a.replace(':', '/')) for a in arts)
    assert classify('net', whole, 1).startswith('INFRA dl.google.com + repo.maven.apache.org (6 artifacts'), classify('net', whole, 1)
    one = '   > Could not find com.android.tools.build:gradle:8.99.0.' + loc.format(p='x')
    assert classify('net', one, 1) == 'CODE', classify('net', one, 1)
    assert classify('test', whole, 1) == 'CODE'
    # CODE: a compile error, a failed unit test, a lock-file mismatch - never retried, never INFRA
    assert classify('net', 'error: cannot find symbol\n  symbol: class Notifer', 1) == 'CODE'
    assert classify('net', 'npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync', 1) == 'CODE'
    # a local dev server refusing is OUR failure (vite did not start), not the network
    assert classify('net', 'Error: connect ECONNREFUSED 127.0.0.1:5173', 1) == 'CODE'
    # a test step is CODE whatever it printed (a screen may log an offline fixture's ETIMEDOUT)
    assert classify('test', apt, 1) == 'CODE'
    # the emulator's own death (cloud_32): adb's words = INFRA; a FAIL line or any other text from the smoke = CODE
    assert classify('emu', 'error: device offline', 1) == 'INFRA the emulator (adb: error: device offline)', classify('emu', 'error: device offline', 1)
    assert classify('emu', 'error: no devices/emulators found', 1).startswith('INFRA the emulator')
    assert classify('emu', "error: device 'emulator-5554' not found", 1).startswith('INFRA the emulator')
    assert classify('emu', 'device', 1) == 'CODE' and classify('emu', 'FAIL no-db', 1) == 'CODE' and classify('emu', 'error: device offline', 0) == 'OK'
    assert classify('test', 'error: device offline', 1) == 'CODE'  # a test step never turns INFRA by its log
    assert classify('net', '', 124) == 'INFRA timeout' and classify('test', '', 124) == 'CODE' and classify('net', 'x', 0) == 'OK'
    import tempfile
    global CI_DIR
    CI_DIR = tempfile.mkdtemp()
    assert verdict('failure').startswith('**UNCLASSIFIED')
    first = mark('INFRA', 'azure.archive.ubuntu.com', 'emulator: sdk')
    assert first == 'INFRA: azure.archive.ubuntu.com unreachable (step «emulator: sdk») - re-run, not code', first
    assert mark('CODE', '-', 'later') == first  # the first mark wins
    open(os.path.join(CI_DIR, 'summary.md'), 'w').write('- line\n')
    v = verdict('failure')
    assert v.splitlines()[0] == f'**{first}**' and v.endswith('- line\n'), v
    assert verdict('success').startswith('**OK')
    os.remove(os.path.join(CI_DIR, 'verdict.txt'))
    assert mark('IMAGE', 'Chromium libraries missing', 'browser check').startswith('INFRA: the runner image changed')
    ev = os.path.join(CI_DIR, 'event.json')
    json.dump({'repository': {'private': True, 'visibility': 'private'}}, open(ev, 'w'))
    os.environ.update(GITHUB_EVENT_PATH=ev, GITHUB_EVENT_NAME='workflow_dispatch', GITHUB_REF='refs/heads/main', EXPR_PRIVATE='true', MIRROR_LIVE='')
    f = facts()
    assert f == ('facts: event=workflow_dispatch ref=refs/heads/main expression github.event.repository.private=[true] payload private=true '
                 'visibility="private" MIRROR_LIVE=[]'), f
    assert open(os.path.join(CI_DIR, 'summary.md'), encoding='utf-8').read().endswith(f'- {f}\n')
    print('ci_infra self-test: PASS')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a == ['--self-test']:
        self_test()
    elif len(a) == 4 and a[0] == 'classify':
        print(classify(a[1], open(a[2], encoding='utf-8', errors='replace').read(), int(a[3])))
    elif len(a) == 4 and a[0] == 'mark':
        print(mark(a[1], a[2], a[3]))
    elif a == ['facts']:
        print(facts())
    elif len(a) == 2 and a[0] == 'verdict':
        print(verdict(a[1]), end='')
    else:
        print(__doc__, file=sys.stderr); sys.exit(2)
