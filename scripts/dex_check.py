#!/usr/bin/env python3
"""dex_check.py - A-83 (ref/FUTURE_play_quality.md §5): the DEX search of a built APK.

  python3 -I scripts/dex_check.py <dexdump> <app.apk> [mapping.txt]   -> prints every call site of the deprecated edge-to-edge APIs
                                                                        Play named (REC B) + the debug-only push entry; exit 1 if any
  python3 -I scripts/dex_check.py --self-test                           -> the parser against a fixed dexdump excerpt

Call sites are read from `dexdump -d` (the instruction lines `invoke-* {..}, Landroid/view/Window;.setStatusBarColor:(I)V`), the
containing class from the `Class descriptor` lines, de-obfuscated through R8's mapping.txt when given.
"""
import re
import subprocess
import sys
import tempfile
import zipfile

# REC B (Play, 10004) + what Google's edge-to-edge guide forbids: none of these may be CALLED by the app's DEX
FORBIDDEN = [
    'Landroid/view/Window;.setStatusBarColor:',
    'Landroid/view/Window;.getStatusBarColor:',
    'Landroid/view/Window;.setNavigationBarColor:',
    'Landroid/view/Window;.getNavigationBarColor:',
    'Landroid/view/Window;.setNavigationBarDividerColor:',
    'Landroid/view/Window;.setDecorFitsSystemWindows:',
]
DEBUG_ONLY = 'PushTestReceiver'  # android/app/src/debug - never in qa / release

CLASS = re.compile(r"^\s*Class descriptor\s*:\s*'(L[^']+;)'")
INVOKE = re.compile(r'invoke-[a-z/-]+ \{[^}]*\}, (L[^;]+;\.[A-Za-z0-9_$<>]+:)')


def call_sites(dump_text):
    """[(class descriptor, forbidden target)] for every instruction that invokes a FORBIDDEN method."""
    out, cls = [], None
    for line in dump_text.splitlines():
        m = CLASS.match(line)
        if m:
            cls = m.group(1)
            continue
        m = INVOKE.search(line)
        if m and m.group(1) in FORBIDDEN:
            out.append((cls, m.group(1)))
    return out


def deobfuscate(mapping_text):
    """R8 mapping 'orig.Name -> a.b:' -> {'La/b;': 'orig.Name'}."""
    back = {}
    for line in mapping_text.splitlines():
        if line and not line[0].isspace() and line.rstrip().endswith(':') and ' -> ' in line:
            orig, obf = line.rstrip()[:-1].split(' -> ')
            back['L' + obf.replace('.', '/') + ';'] = orig
    return back


def self_test():
    dump = """
  Class descriptor  : 'Lcom/capacitorjs/plugins/statusbar/StatusBar;'
      #0              : (in Lcom/capacitorjs/plugins/statusbar/StatusBar;)
0001a2: 6e20 1000 1000                         |0004: invoke-virtual {v1, v0}, Landroid/view/Window;.setStatusBarColor:(I)V // method@0010
0001b2: 6e10 1100 1000                         |0008: invoke-virtual {v1}, Landroid/view/Window;.getStatusBarColor:()I // method@0011
  Class descriptor  : 'La/b;'
0002a2: 6e20 1200 1000                         |0004: invoke-virtual {v1, v0}, Landroid/view/Window;.setDecorFitsSystemWindows:(Z)V // method@0012
0002b2: 6e20 1300 1000                         |0006: invoke-virtual {v1, v0}, Landroid/view/Window;.setBackgroundDrawable:(Landroid/graphics/drawable/Drawable;)V // method@0013
"""
    sites = call_sites(dump)
    assert sites == [
        ('Lcom/capacitorjs/plugins/statusbar/StatusBar;', 'Landroid/view/Window;.setStatusBarColor:'),
        ('Lcom/capacitorjs/plugins/statusbar/StatusBar;', 'Landroid/view/Window;.getStatusBarColor:'),
        ('La/b;', 'Landroid/view/Window;.setDecorFitsSystemWindows:'),
    ], sites
    back = deobfuscate('androidx.core.view.WindowCompat -> a.b:\n    void x() -> a\n')
    assert back == {'La/b;': 'androidx.core.view.WindowCompat'}, back
    assert call_sites('') == []
    print('dex_check self-test: PASS')


def main(argv):
    if argv[1:] == ['--self-test']:
        self_test()
        return 0
    dexdump, apk = argv[1], argv[2]
    back = deobfuscate(open(argv[3], encoding='utf-8').read()) if len(argv) > 3 else {}
    sites, debug_hits, dex_n = [], 0, 0
    with zipfile.ZipFile(apk) as z, tempfile.TemporaryDirectory() as tmp:
        for name in sorted(n for n in z.namelist() if re.fullmatch(r'classes\d*\.dex', n)):
            dex_n += 1
            path = z.extract(name, tmp)
            raw = open(path, 'rb').read()
            debug_hits += raw.count(DEBUG_ONLY.encode())
            # dexdump prints the DEX's own strings: not always UTF-8 (cloud_27 run 43015160353) -> bytes, decoded with replacement
            text = subprocess.run([dexdump, '-d', path], capture_output=True, check=True).stdout.decode('utf-8', errors='replace')
            sites += call_sites(text)
    for cls, target in sites:
        print(f'  call site: {back.get(cls, cls)} -> {target.split(";.")[1].rstrip(":")}')
    print(f'dex search {apk.split("/")[-1]}: {dex_n} dex files; deprecated edge-to-edge call sites = {len(sites)}; '
          f'«{DEBUG_ONLY}» in the DEX = {debug_hits}')
    return 1 if sites else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
