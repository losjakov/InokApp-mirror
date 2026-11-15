import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IOS_FLOOR, iosFloor } from '@/app/engineFloor';

/** cloud_36 (A-115 ... A-118, B1 / B4): the iOS project and its workflow - what an App Store build and the mirror's money depend on */
const read = (p: string) => readFileSync(p, 'utf8');
const plistValue = (s: string, key: string) => new RegExp(`<key>${key}</key>\\s*<([a-z]+)\\s*/?>([^<]*)`).exec(s);
const plistArray = (s: string, key: string) => {
  const m = new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`).exec(s);
  return m ? Array.from(m[1].matchAll(/<string>([^<]*)<\/string>/g), (x) => x[1]) : null;
};

describe('iOS project', () => {
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  const info = read('ios/App/App/Info.plist');
  it('the deployment target = THE iOS engine floor (package.json `ios_saf >= N`), in the project and in the plugins package', () => {
    expect(iosFloor(['chrome >= 89', 'ios_saf >= 15'])).toBe(15);
    expect([...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map((m) => m[1])).toEqual(Array(4).fill(`${IOS_FLOOR}.0`));
    expect(read('ios/App/CapApp-SPM/Package.swift')).toContain(`.iOS(.v${IOS_FLOOR})`);
  });
  it('iPhone AND iPad (A-115); the bundle id = the Android appId; the version comes from the build (package.json), never typed here', () => {
    expect(pbx.match(/TARGETED_DEVICE_FAMILY = "1,2";/g)).toHaveLength(2);
    expect(pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = info\.inok\.app;/g)).toHaveLength(2);
    expect(plistValue(info, 'CFBundleShortVersionString')?.[2]).toBe('$(MARKETING_VERSION)');
    expect(plistValue(info, 'CFBundleVersion')?.[2]).toBe('$(CURRENT_PROJECT_VERSION)');
    expect(plistArray(info, 'UISupportedInterfaceOrientations~ipad')).toHaveLength(4); // iPad multitasking needs all four
    expect(plistArray(info, 'UIRequiredDeviceCapabilities')).toEqual(['arm64']);
  });
  it('Info.plist: export compliance, the location purpose in three languages (uk = the original, the same words), the languages', () => {
    expect(plistValue(info, 'ITSAppUsesNonExemptEncryption')?.[1]).toBe('false');
    expect(plistArray(info, 'CFBundleLocalizations')).toEqual(['uk', 'ru', 'en']);
    const base = plistValue(info, 'NSLocationWhenInUseUsageDescription')?.[2];
    expect(base?.length).toBeGreaterThan(20);
    for (const l of ['uk', 'ru', 'en']) {
      const s = read(`ios/App/App/${l}.lproj/InfoPlist.strings`);
      const v = /"NSLocationWhenInUseUsageDescription" = "([^"]+)";/.exec(s)?.[1];
      expect(v, l).toBeTruthy();
      if (l === 'uk') expect(v).toBe(base);
      expect(pbx).toContain(`path = ${l}.lproj/InfoPlist.strings;`);
    }
    expect(pbx).toMatch(/PrivacyInfo\.xcprivacy in Resources/);
    expect(pbx).toMatch(/InfoPlist\.strings in Resources/);
  });
  it('entitlements: APNs + Universal Links of inok.info; the privacy manifest: no tracking', () => {
    const ent = read('ios/App/App/App.entitlements');
    expect(plistArray(ent, 'com.apple.developer.associated-domains')).toEqual(['applinks:inok.info']);
    expect(plistValue(ent, 'aps-environment')?.[2]).toBe('production');
    expect(pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g)).toHaveLength(2);
    const pi = read('ios/App/App/PrivacyInfo.xcprivacy');
    expect(plistValue(pi, 'NSPrivacyTracking')?.[1]).toBe('false');
    expect(pi).not.toMatch(/NSPrivacyCollectedDataTypePreciseLocation|NSPrivacyCollectedDataTypeCoarseLocation/); // read on the phone only
  });
});

describe('ios.yml (A-118): the mirror only, never a pull request, no secret printed', () => {
  const wf = read('.github/workflows/ios.yml').replace(/^\s*#.*$/gm, '').replace(/ # .*$/gm, ''); // the words, not the comments
  const on = /^on:\n([\s\S]*?)^\S/m.exec(wf)![1];
  it('starts on push / workflow_dispatch only', () => {
    expect(on).not.toMatch(/pull_request/);
    expect(wf).not.toMatch(/pull_request_target/);
    expect(on.match(/^ {2}([a-z_]+):/gm)?.map((x) => x.trim())).toEqual(['push:', 'workflow_dispatch:']);
  });
  it('every job is skipped in the private home (macOS there = x10)', () => {
    const jobs = wf.slice(wf.indexOf('\njobs:'));
    const names = [...jobs.matchAll(/^ {2}([a-z-]+):\n/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(jobs.slice(jobs.indexOf(`  ${n}:\n`)).split('\n')[1], n).toBe("    if: ${{ !github.event.repository.private }}");
    expect([...jobs.matchAll(/runs-on: (\S+)/g)].map((m) => m[1]).every((r) => r === 'macos-26')).toBe(true);
  });
  it('no secret is echoed; the key file is removed; the build number is THE rule', () => {
    expect(wf).not.toMatch(/echo[^\n]*\$\{?(ASC_API_KEY_P8|ASC_KEY_ID|ASC_ISSUER_ID|APPLE_TEAM_ID)/);
    expect(wf).toMatch(/rm -f "\$K"/);
    expect(wf).toMatch(/scripts\/app_version\.py package\.json/);
    expect(wf).toMatch(/MARKETING_VERSION="\$V" CURRENT_PROJECT_VERSION="\$C"/);
  });
  it('ios/ leaves for the mirror; a .p8 never does', () => {
    expect(read('scripts/mirror_paths.txt').split('\n')).toContain('ios/');
    expect(read('scripts/mirror_snapshot.py')).toMatch(/NEVER_SUFFIX = \([^)]*'\.p8'/);
    expect(read('.gitignore').split('\n')).toEqual(expect.arrayContaining(['*.p8', 'GoogleService-Info.plist']));
  });
});
