#!/usr/bin/env python3
"""r8_stats.py - one line of Google's R8 numbers from `android analyze --format=json` (A-83; the numbers Play's «DEX code optimization» shows).
  python3 -I scripts/r8_stats.py <artifact name> <analyze output>    |    python3 -I scripts/r8_stats.py --self-test
The tool may print other lines before its JSON (first run: its runtime download) -> the JSON is read from the first '{'; the fields are
found wherever they sit (an AAB has `bundleAnalysisResult`, an APK another key)."""
import json
import sys

KEYS = ('shrinkingRatio', 'optimizationRatio', 'obfuscationRatio', 'mappingObfuscationRatio', 'dexHeuristicObfuscationRatio',
        'uncompressedDexSizeBytes', 'agpVersion', 'r8Enabled', 'fullModeEnabled', 'resourceOptimizationStatus')


def parse(text):
    i = text.find('{')
    if i < 0:
        return {}
    obj, _ = json.JSONDecoder().raw_decode(text[i:])
    found = {}

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in KEYS and k not in found and not isinstance(v, (dict, list)):
                    found[k] = v
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(obj)
    return found


def line(name, f):
    pct = lambda k: 'n/a' if k not in f else f'{float(f[k]) * 100:.1f} %'
    return (f"android analyze {name}: shrinking {pct('shrinkingRatio')}, optimization {pct('optimizationRatio')}, obfuscation "
            f"{pct('obfuscationRatio')}; mapping obfuscation {pct('mappingObfuscationRatio')}, DEX heuristic obfuscation "
            f"{pct('dexHeuristicObfuscationRatio')}; uncompressed DEX {f.get('uncompressedDexSizeBytes', 'n/a')} b; AGP {f.get('agpVersion', 'n/a')}; "
            f"r8 {f.get('r8Enabled', 'n/a')} full mode {f.get('fullModeEnabled', 'n/a')}; resources {f.get('resourceOptimizationStatus', 'n/a')}")


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        t = 'Downloading runtime...\n{"results":[{"optimization":{"bundleAnalysisResult":{"agpVersion":"8.13.0","r8Json":{"stats":' \
            '{"shrinkingRatio":0.96,"optimizationRatio":0.955,"obfuscationRatio":0.9622}},"r8DexMarkerMetadata":{"r8Enabled":true},' \
            '"uncompressedDexSizeBytes":"6198152"}}}]}'
        f = parse(t)
        assert f['obfuscationRatio'] == 0.9622 and f['r8Enabled'] is True and f['uncompressedDexSizeBytes'] == '6198152', f
        assert 'obfuscation 96.2 %' in line('x.aab', f), line('x.aab', f)
        assert parse('no json') == {}
        print('r8_stats self-test: PASS')
    else:
        print(line(sys.argv[1].split('/')[-1], parse(open(sys.argv[2], encoding='utf-8', errors='replace').read())))
