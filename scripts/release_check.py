# -*- coding: utf-8 -*-
"""release_check.py - the release-readiness facts of a signed AAB, for the run summary (cloud_21, build.yml on a tag `v*`).

  python3 -I scripts/release_check.py --self-test
  python3 -I scripts/release_check.py <app-release.aab> <manifest.xml (bundletool dump manifest)> <package.json> [<aapt2 badging.txt>] [--mapping <mapping.txt>]
  python3 -I scripts/release_check.py --labels <aapt2 badging.txt>        (debug builds: the A-69 labels only)
  python3 -I scripts/release_check.py --integrity <aab|apk> [<mapping.txt>] (every push: the qa AAB + its R8 mapping - scripts/apk_check.sh)

Prints Markdown lines (the step appends them to $GITHUB_STEP_SUMMARY) and exits 1 on any FAIL:
- versionName = package.json version (A-62: ONE source); versionCode, minSdk / targetSdk as the manifest says;
- debuggable is not true; the permission list; no AD_ID permission (R-9);
- 16 KB pages (Google Play since 01.11.2025 for targetSdk 35+): every ELF LOAD segment of every .so under base/lib/arm64-v8a and
  base/lib/x86_64 has p_align >= 16384 (the zip side is checked on the APKs bundletool makes from the AAB, zipalign -c -P 16);
- the AAB size; no biometric permission (N5, REVIEW cloud_21); the Play Integrity library's code + our plugin + (R8) the call path (A-66);
- A-69: the application label and the launcher label (aapt2 dump badging of the universal APK) are both «inok.info», in every language.
"""
import json, re, struct, sys, zipfile

PAGE = 16384
APP_NAME = 'inok.info'  # A-69 - = android/app/src/main/res/values/strings.xml app_name (tests/unit/manifest.test.ts)
FORBIDDEN_PERMS = ('AD_ID', 'USE_BIOMETRIC', 'USE_FINGERPRINT')  # R-9, N5
# A-66 Play Integrity, judged by what R8 can NOT rename (cloud_29: the first R8 release, tag run 43148661649, failed the old marks - the
# library never shipped a META-INF/*.version file and R8 renamed StandardIntegrityManager; the code was there, renamed: JOURNAL cloud_29):
INTEGRITY_IPC = b'com.google.android.play.core.integrity.protocol.IExpressIntegrityService'  # the binder descriptor of Play's Standard
#   Integrity service: the Play Store answers only this exact string, so R8 keeps it as written - present = the library's IPC code is in the DEX
INTEGRITY_PLUGIN = b'Linfo/inok/app/IntegrityPlugin;'  # our Capacitor plugin = the JS entry (Capacitor's consumer rules keep its name)
INTEGRITY_PROPS = 'integrity.properties'  # the library's own version file (base/root/ in an AAB, the root of an APK) - shown, not required
INTEGRITY_PKG = 'com.google.android.play.core.integrity.'
ABIS = ('arm64-v8a', 'x86_64')


def load_aligns(data):
    """p_align of every PT_LOAD segment of an ELF image (32- or 64-bit, little-endian)."""
    if data[:4] != b'\x7fELF':
        raise ValueError('not an ELF file')
    is64 = data[4] == 2
    if is64:
        phoff, = struct.unpack_from('<Q', data, 0x20)
        phentsize, phnum = struct.unpack_from('<HH', data, 0x36)
    else:
        phoff, = struct.unpack_from('<I', data, 0x1C)
        phentsize, phnum = struct.unpack_from('<HH', data, 0x2A)
    out = []
    for i in range(phnum):
        o = phoff + i * phentsize
        p_type, = struct.unpack_from('<I', data, o)
        if p_type != 1:  # PT_LOAD
            continue
        p_align, = struct.unpack_from('<Q', data, o + 0x30) if is64 else struct.unpack_from('<I', data, o + 0x1C)
        out.append(p_align)
    return out


def elf_report(aab):
    """[(path, min LOAD align, ok)] for the 64-bit ABIs Play checks."""
    rows = []
    with zipfile.ZipFile(aab) as z:
        for n in sorted(z.namelist()):
            m = re.match(r'base/lib/([^/]+)/[^/]+\.so$', n)
            if m and m.group(1) in ABIS:
                al = load_aligns(z.read(n))
                low = min(al) if al else 0
                rows.append((n, low, low >= PAGE))
    return rows


def labels(badging):
    """(rows, fails) for A-69 from `aapt2 dump badging`: application-label[-xx] and the launchable activity's label."""
    rows, fails = [], []
    for key, val in re.findall(r"^(application-label(?:-[\w-]+)?):'([^']*)'", badging, re.M):
        rows.append((key, val))
    if not any(k == 'application-label' for k, _ in rows):
        rows.insert(0, ('application-label', None))
    m = re.search(r"^launchable-activity:.*?label='([^']*)'", badging, re.M)
    # an activity without a label of its own shows the application's (A-69: one source) - aapt2 may print it empty
    launcher = (m.group(1) or dict(rows)['application-label']) if m else None
    rows.append(('launcher label', launcher))
    fails = ['%s = %r, not %r (A-69)' % (k, v, APP_NAME) for k, v in rows if v != APP_NAME]
    return rows, fails


def mapped(mapping_text, name):
    """R8's new name of class `name` in mapping.txt ('R8$$REMOVED$$CLASS$$n' when R8 dropped it), or None when the mapping does not list it."""
    m = re.search(r'^%s -> ([^:\s]+):' % re.escape(name), mapping_text, re.M)
    return m.group(1) if m else None


def integrity_path(mapping_text):
    """(facts, fails) of the R8 call path IntegrityPlugin -> the Standard API, from the build's mapping.txt (A-66)."""
    plugin = mapped(mapping_text, 'info.inok.app.IntegrityPlugin')
    if not plugin or plugin.startswith('R8$$'):
        return [], ['R8 removed info.inok.app.IntegrityPlugin (A-66)']
    block, inside = [], False  # the plugin's member lines (indented / '#') up to the next class line
    for line in mapping_text.splitlines():
        if line and not line[0].isspace() and not line.startswith('#'):
            inside = line.startswith('info.inok.app.IntegrityPlugin -> ')
        elif inside:
            block.append(line)
    block = '\n'.join(block)
    facts, fails = [], []
    factory = mapped(mapping_text, INTEGRITY_PKG + 'IntegrityManagerFactory')
    if factory and not factory.startswith('R8$$'):
        facts.append('IntegrityManagerFactory -> %s' % factory)
    elif 'IntegrityManagerFactory.createStandard(' in block:
        facts.append('createStandard inlined into IntegrityPlugin')
    else:
        fails.append('no R8 path from IntegrityPlugin to IntegrityManagerFactory.createStandard (A-66)')
    provider = mapped(mapping_text, INTEGRITY_PKG + 'StandardIntegrityManager$StandardIntegrityTokenProvider')
    if provider and not provider.startswith('R8$$'):
        facts.append('token provider -> %s' % provider)
    else:
        fails.append('R8 removed StandardIntegrityManager$StandardIntegrityTokenProvider (A-66)')
    return facts, fails


def integrity(pkg, mapping_text=None):
    """(facts line, fails) for the Play Integrity library in an AAB / APK (a path or a file object) and, given, its R8 mapping (A-66)."""
    with zipfile.ZipFile(pkg) as z:
        names = z.namelist()
        dex = [z.read(n) for n in names if n.endswith('.dex')]
        props = next((z.read(n).decode('ascii', 'replace') for n in names if n.split('/')[-1] == INTEGRITY_PROPS), '')
    ver = re.search(r'^integrity_client=(\S+)', props, re.M)
    facts = ['%s %s' % (INTEGRITY_PROPS, ver.group(1) if ver else 'absent')]
    fails = []
    for mark, what in ((INTEGRITY_IPC, 'the Standard Integrity service code (IExpressIntegrityService)'), (INTEGRITY_PLUGIN, 'IntegrityPlugin')):
        n = sum(d.count(mark) for d in dex)
        facts.append('%s in the DEX: %d' % (mark.decode().rsplit('.', 1)[-1].strip('L;').rsplit('/', 1)[-1], n))
        if not n:
            fails.append('%s is not in the DEX (A-66)' % what)
    if mapping_text is not None:
        f2, x2 = integrity_path(mapping_text)
        facts += f2 or ['R8 path: broken']
        fails += x2
    else:
        facts.append('R8 path: not checked (no mapping)')
    return '; '.join(facts), fails


def integrity_only(pkg, mapping_path=None):
    line, fails = integrity(pkg, open(mapping_path, encoding='utf-8').read() if mapping_path else None)
    print('Play Integrity (A-66) %s: %s' % (pkg.split('/')[-1], line))
    print('Play Integrity (A-66): %s' % ('PASS' if not fails else 'FAIL - ' + '; '.join(fails)))
    return 1 if fails else 0


def labels_only(badging_path):
    rows, fails = labels(open(badging_path, encoding='utf-8').read())
    print('\n'.join('A-69 %s: %s' % (k, v) for k, v in rows))
    print('A-69 labels: %s' % ('PASS' if not fails else 'FAIL - ' + '; '.join(fails)))
    return 1 if fails else 0


def attr(xml, name):
    m = re.search(r'android:%s="([^"]*)"' % name, xml)
    return m.group(1) if m else None


def main(aab, manifest_path, package_json, badging_path=None, mapping_path=None):
    import os
    xml = open(manifest_path, encoding='utf-8').read()
    version = json.load(open(package_json, encoding='utf-8'))['version']
    fails, lines = [], []
    vname, vcode = attr(xml, 'versionName'), attr(xml, 'versionCode')
    lines.append('| versionName | %s |' % vname)
    lines.append('| versionCode | %s |' % vcode)
    if vname != version:
        fails.append('versionName %s != package.json %s (A-62)' % (vname, version))
    lines.append('| minSdk / targetSdk | %s / %s |' % (attr(xml, 'minSdkVersion'), attr(xml, 'targetSdkVersion')))
    dbg = attr(xml, 'debuggable')
    lines.append('| debuggable | %s |' % ('false' if dbg in (None, 'false') else dbg))
    if dbg not in (None, 'false'):
        fails.append('debuggable=%s' % dbg)
    perms = sorted(set(re.findall(r'<uses-permission[^>]*android:name="([^"]+)"', xml)))
    lines.append('| permissions (%d) | %s |' % (len(perms), ', '.join(p.replace('android.permission.', '') for p in perms)))
    for bad in FORBIDDEN_PERMS:
        if any(p.endswith(bad) for p in perms):
            fails.append('%s permission in the release manifest (R-9 / N5)' % bad)
    if badging_path:
        rows, lf = labels(open(badging_path, encoding='utf-8').read())
        lines += ['| %s | %s |' % (k, v) for k, v in rows]
        fails += lf
    else:
        lines.append('| labels (A-69) | NOT CHECKED (no aapt2 badging) |')
    lib, lf = integrity(aab, open(mapping_path, encoding='utf-8').read() if mapping_path else None)
    lines.append('| Play Integrity (A-66) | %s |' % lib)
    fails += lf
    lines.append('| AAB size | %d bytes (%.1f MB) |' % (os.path.getsize(aab), os.path.getsize(aab) / 1048576))
    rows = elf_report(aab)
    bad = [r for r in rows if not r[2]]
    lines.append('| 16 KB ELF (%s) | %d .so, %s |' % (' + '.join(ABIS), len(rows), 'all LOAD p_align >= 16384' if not bad else 'NOT ALIGNED: ' + ', '.join('%s (%d)' % (n, a) for n, a, _ in bad)))
    fails += ['%s LOAD p_align %d < 16384' % (n, a) for n, a, _ in bad]
    print('| release check | |\n|---|---|')
    print('\n'.join(lines))
    for n, a, _ in rows:
        print('| %s | p_align %d |' % (n, a))
    print('\n**release check: %s**' % ('PASS' if not fails else 'FAIL - ' + '; '.join(fails)))
    return 1 if fails else 0


def integrity_self_test():
    """A-66 (cloud_29): the R8 build that failed the old marks PASSES; a bundle without the library / the plugin / the R8 path FAILS."""
    import io

    def pkg(dex, props=True, root='base/'):
        b = io.BytesIO()
        with zipfile.ZipFile(b, 'w') as z:
            z.writestr(root + 'dex/classes.dex', b'dex\n035\x00' + dex)
            if props:
                z.writestr(root + 'root/' + INTEGRITY_PROPS, 'version=1.6.0\nclient=integrity\nintegrity_client=1.6.0\n')
        b.seek(0)
        return b
    # mapping lines as R8 8.13.6 wrote them for 2514f74's qa build (JOURNAL cloud_29, item 1)
    r8map = ('# compiler: R8\n'
             'com.google.android.play.core.integrity.IntegrityManagerFactory -> R8$$REMOVED$$CLASS$$374:\n'
             'com.google.android.play.core.integrity.StandardIntegrityManager$StandardIntegrityTokenProvider -> w3.c:\n'
             'info.inok.app.IntegrityPlugin -> info.inok.app.IntegrityPlugin:\n'
             '# {"id":"sourceFile","fileName":"IntegrityPlugin.java"}\n'
             '    com.google.android.play.core.integrity.StandardIntegrityManager$StandardIntegrityTokenProvider provider -> provider\n'
             '    4:6:com.google.android.play.core.integrity.StandardIntegrityManager com.google.android.play.core.integrity.'
             'IntegrityManagerFactory.createStandard(android.content.Context):1 -> prepare\n'
             'info.inok.app.MainActivity -> info.inok.app.MainActivity:\n')
    r8dex = b'Lw3/c;' + INTEGRITY_IPC + b'\x00' + INTEGRITY_PLUGIN  # renamed: no StandardIntegrityManager descriptor
    assert b'StandardIntegrityManager;' not in r8dex
    line, fails = integrity(pkg(r8dex), r8map)
    assert fails == [], fails
    assert 'createStandard inlined' in line and 'w3.c' in line, line
    assert integrity(pkg(r8dex, root=''), r8map)[1] == []  # an APK: dex / properties at the root
    plain = b'Lcom/google/android/play/core/integrity/StandardIntegrityManager;' + INTEGRITY_IPC + INTEGRITY_PLUGIN  # no R8 (1.0.4, debug)
    assert integrity(pkg(plain))[1] == []
    # planted: no library at all / the library's resource kept but its code gone / the code without our plugin
    assert integrity(pkg(INTEGRITY_PLUGIN, props=False), r8map)[1] == ['the Standard Integrity service code (IExpressIntegrityService) is not in the DEX (A-66)']
    assert len(integrity(pkg(INTEGRITY_PLUGIN))[1]) == 1
    assert integrity(pkg(INTEGRITY_IPC), r8map)[1] == ['IntegrityPlugin is not in the DEX (A-66)']
    assert len(integrity(pkg(b''), r8map)[1]) == 2
    # the R8 path broken: the plugin removed / no createStandard from it / the provider removed
    gone = r8map.replace('info.inok.app.IntegrityPlugin -> info.inok.app.IntegrityPlugin:', 'info.inok.app.IntegrityPlugin -> R8$$REMOVED$$CLASS$$1:')
    assert integrity(pkg(r8dex), gone)[1] == ['R8 removed info.inok.app.IntegrityPlugin (A-66)']
    nopath = r8map.replace('IntegrityManagerFactory.createStandard(', 'IntegrityManagerFactory.other(')
    assert integrity(pkg(r8dex), nopath)[1] == ['no R8 path from IntegrityPlugin to IntegrityManagerFactory.createStandard (A-66)']
    elsewhere = nopath + '    1:1:void x():0 -> y\n    5:5:java.lang.Object com.google.android.play.core.integrity.IntegrityManagerFactory.createStandard(x):1 -> z\n'
    assert integrity(pkg(r8dex), elsewhere)[1] != []  # inlined into ANOTHER class (the MainActivity block) is not our path
    kept = nopath.replace('IntegrityManagerFactory -> R8$$REMOVED$$CLASS$$374:', 'IntegrityManagerFactory -> w3.z:')
    assert integrity(pkg(r8dex), kept)[1] == []  # not inlined but kept = the path exists
    noprov = r8map.replace('StandardIntegrityTokenProvider -> w3.c:', 'StandardIntegrityTokenProvider -> R8$$REMOVED$$CLASS$$9:')
    assert integrity(pkg(r8dex), noprov)[1] == ['R8 removed StandardIntegrityManager$StandardIntegrityTokenProvider (A-66)']


def self_test():
    """Two synthetic 64-bit ELF headers: 4 KB pages are flagged, 16 KB pass; a 32-bit one reads too."""
    def elf64(align):
        hdr = bytearray(64)
        hdr[:5] = b'\x7fELF\x02'
        struct.pack_into('<Q', hdr, 0x20, 64)
        struct.pack_into('<HH', hdr, 0x36, 56, 2)
        ph = bytearray(112)
        struct.pack_into('<I', ph, 0, 6)  # PT_PHDR: ignored
        struct.pack_into('<Q', ph, 0x30, 8)
        struct.pack_into('<I', ph, 56, 1)  # PT_LOAD
        struct.pack_into('<Q', ph, 56 + 0x30, align)
        return bytes(hdr + ph)
    assert load_aligns(elf64(0x1000)) == [0x1000]
    assert load_aligns(elf64(0x4000)) == [0x4000]
    h32 = bytearray(52 + 32)
    h32[:5] = b'\x7fELF\x01'
    struct.pack_into('<I', h32, 0x1C, 52)
    struct.pack_into('<HH', h32, 0x2A, 32, 1)
    struct.pack_into('<I', h32, 52, 1)
    struct.pack_into('<I', h32, 52 + 0x1C, 0x4000)
    assert load_aligns(bytes(h32)) == [0x4000]
    assert attr('<manifest android:versionCode="10000" android:versionName="1.0.0">', 'versionCode') == '10000'
    good = "package: name='info.inok.app'\napplication-label:'inok.info'\napplication-label-uk:'inok.info'\n" \
           "launchable-activity: name='info.inok.app.MainActivity'  label='inok.info' icon=''\n"
    assert labels(good)[1] == [], labels(good)
    old = good.replace("label='inok.info'", "label='\u041c\u043e\u043d\u0430\u0441\u0442\u0438\u0440\u0456'")
    assert len(labels(old)[1]) == 1
    assert len(labels("package: name='x'\n")[1]) == 2  # no label at all = two fails
    assert labels(good.replace("label='inok.info' icon", "label='' icon"))[1] == []  # inherited
    integrity_self_test()
    print('release_check self-test: ok')
    return 0


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        sys.exit(self_test())
    if sys.argv[1:2] == ['--labels']:
        sys.exit(labels_only(sys.argv[2]))
    if sys.argv[1:2] == ['--integrity']:
        sys.exit(integrity_only(*sys.argv[2:4]))
    args = sys.argv[1:]
    mp = None
    if '--mapping' in args:
        i = args.index('--mapping')
        mp = args[i + 1]
        del args[i:i + 2]
    sys.exit(main(*args[:4], mapping_path=mp))
