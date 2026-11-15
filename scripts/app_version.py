#!/usr/bin/env python3
"""THE version of the app for every store (REF_app_release §1-2; A-62): package.json `version` X.Y.Z -> the build number X*10000+Y*100+Z.
Android's build.gradle computes the same versionCode (tests/unit/version.test.ts); iOS gets the SAME pair as MARKETING_VERSION /
CURRENT_PROJECT_VERSION (cloud_36), so 1.0.11 = 10011 in Google Play and in App Store Connect alike.
  app_version.py <package.json>   ->  «1.0.11 10011»
"""
import json, re, sys
from pathlib import Path


def version_of(package_json: str) -> tuple[str, int]:
    v = json.loads(Path(package_json).read_text(encoding='utf-8'))['version']
    m = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)', v)
    if not m or int(m[2]) > 99 or int(m[3]) > 99: raise SystemExit(f'version {v!r} is not plain X.Y.Z (REF_app_release §2)')
    return v, int(m[1]) * 10000 + int(m[2]) * 100 + int(m[3])


if __name__ == '__main__':
    if len(sys.argv) != 2: raise SystemExit(__doc__)
    print(*version_of(sys.argv[1]))
