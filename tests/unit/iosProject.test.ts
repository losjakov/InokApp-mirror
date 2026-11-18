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
    // cloud_38 (Apple's letter on 10011, ITMS-90683): the «always and when in use» purpose is REQUIRED beside the when-in-use one, although
    // the app asks «when in use» only (src/native/geolocation.ts) - x3 languages, uk = the original, and it says «only while in use»
    const always = plistValue(info, 'NSLocationAlwaysAndWhenInUseUsageDescription')?.[2];
    expect(always, 'ITMS-90683').toMatch(/лише під час користування/);
    for (const l of ['uk', 'ru', 'en']) {
      const v = /"NSLocationAlwaysAndWhenInUseUsageDescription" = "([^"]+)";/.exec(read(`ios/App/App/${l}.lproj/InfoPlist.strings`))?.[1];
      expect(v, `ITMS-90683 ${l}`).toBeTruthy();
      if (l === 'uk') expect(v).toBe(always);
    }
    expect(plistValue(info, 'NSLocationAlwaysUsageDescription'), 'no «always» ask of iOS 10').toBeFalsy();
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
    // testflight runs `always()` after the ring (A-124: it signs as proof, uploads only after a green ring) - still never in the home
    for (const n of names) expect(jobs.slice(jobs.indexOf(`  ${n}:\n`)).split('\n')[1], n).toMatch(/^ {4}if: \$\{\{ (always\(\) && )?!github\.event\.repository\.private \}\}$/);
    expect([...jobs.matchAll(/runs-on: (\S+)/g)].map((m) => m[1]).every((r) => r === 'macos-26')).toBe(true);
  });
  it('no secret is echoed; the key file is removed; the build number is THE rule', () => {
    expect(wf).not.toMatch(/echo[^\n]*\$\{?(ASC_API_KEY_P8|ASC_KEY_ID|ASC_ISSUER_ID|APPLE_TEAM_ID)/);
    expect(wf).toMatch(/rm -f "\$K"/);
    const setup = read('.github/actions/ios-setup/action.yml'); // THE preparation of every iOS job
    expect(setup).toMatch(/scripts\/app_version\.py package\.json/);
    expect(wf.match(/uses: \.\/\.github\/actions\/ios-setup/g)).toHaveLength(4); // simulator ring, App Store set, archive, testflight
    expect(wf).toMatch(/MARKETING_VERSION="\$V" CURRENT_PROJECT_VERSION="\$C"/);
  });
  it('cloud_37: the remote hand (VITE_SIM_DRIVER) and localhost networking live in the simulator job ONLY - never in the archive / TestFlight', () => {
    const jobs = wf.slice(wf.indexOf('\njobs:'));
    const job = (n: string) => { const i = jobs.indexOf(`  ${n}:\n`); const j = jobs.slice(i + 3).search(/\n {2}[a-z-]+:\n/); return jobs.slice(i, j < 0 ? undefined : i + 3 + j); };
    const simRun = read('.github/actions/ios-sim-run/action.yml'); // cloud_39: THE simulator work of the ring and of the App Store set
    for (const k of ['VITE_SIM_DRIVER=1', 'NSAllowsLocalNetworking']) {
      expect(simRun, k).toContain(k);
      for (const n of ['simulator', 'appstore']) expect(job(n), n).toContain('uses: ./.github/actions/ios-sim-run');
      for (const n of ['archive', 'testflight']) { expect(job(n), `${n}: ${k}`).not.toContain(k); expect(job(n)).not.toContain('ios-sim-run'); }
      expect(read('.github/actions/ios-setup/action.yml'), k).not.toContain(k);
    }
    expect(read('ios/App/App/Info.plist')).not.toContain('NSAllowsLocalNetworking');
    expect(read('src/main.tsx')).toMatch(/if \(import\.meta\.env\.VITE_SIM_DRIVER === '1'\) void import\('\.\/app\/simDriver'\)/);
  });
  it('cloud_38 (A-124, standing): the TestFlight upload waits for EVERY simulator job of the same run - green ring = upload, else none', () => {
    const jobs = wf.slice(wf.indexOf('\njobs:'));
    const job = (n: string) => { const i = jobs.indexOf(`  ${n}:\n`); const j = jobs.slice(i + 3).search(/\n {2}[a-z-]+:\n/); return jobs.slice(i, j < 0 ? undefined : i + 3 + j); };
    const tf = job('testflight');
    expect(tf).toMatch(/needs: \[simulator\]/);
    const upload = /UPLOAD: "(.*)"/.exec(tf)![1];
    expect(upload.startsWith("${{ needs.simulator.result == 'success' && (")).toBe(true); // the ring first, then «release snapshot / manual upload»
    expect(tf).toMatch(/\[ "\$UPLOAD" = true \]/); // the upload command itself is behind the variable
    expect(tf.match(/export_to upload/g)).toHaveLength(1);
    // the ring (A-127): one device per job, walks on the oldest and the newest iOS - and NOTHING else: the App Store set is its own job,
    // OUTSIDE the lock (its result goes to the REPORT), never in `needs`
    const sim = job('simulator');
    const rows = [...sim.matchAll(/- \{ runtime: (\w+), device: (\w+), task: (\w+) \}/g)].map((m) => m.slice(1).join(' '));
    expect(rows).toEqual(['oldest iphone walk', 'oldest ipad walk', 'newest iphone walk', 'newest ipad walk']);
    const store = job('appstore');
    expect([...store.matchAll(/- \{ runtime: (\w+), device: (\w+), task: (\w+) \}/g)].map((m) => m.slice(1).join(' '))).toEqual(['newest iphone appstore', 'newest iphone63 appstore', 'newest ipad appstore']) // cloud_41 (E): + the 6.3-inch iPhone;
    expect(tf).not.toMatch(/appstore/);
    for (const j of [sim, store]) { expect(j).toMatch(/timeout-minutes: 90/); expect(j).toMatch(/uses: \.\/\.github\/actions\/ios-sim-run/); expect(j).not.toMatch(/continue-on-error/); } // a red spot is never hidden
    // A-127: the WebGL map (and a frame's PICTURE after it) is outside the lock - written OUT, never FAIL; the DOM checks of those screens stay in
    const tourB1 = read('scripts/ios_sim_tour.sh');
    expect(tourB1).toMatch(/a3 "map online" PASS "[^"]*" \|\| a3 "map online" OUT /);
    expect(tourB1).not.toMatch(/a3 "map online" FAIL/);
    expect(tourB1).toMatch(/AFTER_GL=1/);
    // A-127: no App Attest on a simulator - the ring checks the HONEST line (cast.ios) there; the live cast = the owner's iPhone
    expect(tourB1).toMatch(/a3 "rating cast \(A1\)" PASS "[^"]*honest line/);
    expect(tourB1).toMatch(/a3 "App Attest cast \(A1\)" NOT-PROVABLE/);
    // ios run 1 of cloud_39: ONE status bar override with an ISO time (Xcode 26.6 refuses «10:00» - the real clock was in the frames);
    // the tour step under `set +e` (a missing blank.txt ended a green App Store set red); a sparse page (99 %) is not a blank one
    // cloud_40 (NOTE 4): the time forms tried in order, the one simctl TOOK written with its read-back (statusbar.txt); none = said so
    expect(tourB1).toMatch(/for t in 2026-11-16T10:00:00Z 2026-11-16T10:00:00\+00:00 "Mon Nov 16 10:00:00 UTC 2026" 10:00; do/);
    expect(tourB1).toMatch(/time form taken: \$\{t\}/);
    expect(tourB1).toMatch(/time form taken: NONE \(the real clock\)/);
    expect(read('.github/actions/ios-sim-run/action.yml')).toMatch(/run: \|\n\s+set \+e/);
    expect(tourB1).toMatch(/case "\$p" in "BLANK \(100%"\*\) ;; BLANK\*\) p="ok \(sparse/);
    // the WebGL map screen and the eparchy's way back over its map: OUT, never FAIL; the list's way back stays in the lock; toasts recorded in the page
    expect(tourB1).toMatch(/a3 "screen \$name \(A8\)" OUT "\$\{v:-no answer from the page\}/);
    // cloud_40: a mini-map screen is outside the lock only when it does not answer, or answers «no page» with a 100 % white picture
    expect(tourB1).toMatch(/case "\$name" in map\) gl8=yes;; eparchy\|contacts\) case "\$v\|\$p" in "\|"\*\|"no page\|BLANK \(100%"\*\) gl8=yes;; esac;; esac/);
    expect(tourB1).toMatch(/a3 "back over the map \(header arrow\)" OUT/);
    expect(tourB1).toMatch(/a3 "back \(header arrow\)" FAIL/);
    expect(tourB1).toMatch(/toast_watch\n\s+nav click '\[data-testid="article"\] \[data-testid="star-5"\]'/);
    // the tour: ANY FAIL spot = exit 1; the App Store task only whole and clean
    const tour = read('scripts/ios_sim_tour.sh');
    expect(tour).toMatch(/if grep -q '\| FAIL \|' "\$A3" 2>\/dev\/null; then [^\n]*RC=1; fi/);
    expect(tour).toMatch(/grep -q 'store screenshots: PASS' "\$OUT\/sizes.txt" \|\| RC=1/);
  });
  it('cloud_40 (A1): the ROOT view controller is the app\'s own bridge - else AppAttest + FcmTopics are never registered', () => {
    // Capacitor 8.5 (UIScene): «the delegate creates the window and root view controller in code; Main.storyboard no longer provides them» -
    // 1.0.12 / 1.0.13 made Capacitor's own CAPBridgeViewController there: isSupported() rejected «not implemented», App Attest stayed off
    const scene = read('ios/App/App/SceneDelegate.swift');
    expect(scene).toMatch(/window\?\.rootViewController = InokBridgeViewController\(\)/);
    for (const f of ['SceneDelegate.swift', 'AppDelegate.swift', 'InokBridgeViewController.swift']) expect(read(`ios/App/App/${f}`), f).not.toMatch(/CAPBridgeViewController\(\)/);
    const bridge = read('ios/App/App/InokBridgeViewController.swift');
    for (const p of ['FcmTopicsPlugin', 'AppAttestPlugin']) expect(bridge, p).toContain(`registerPluginInstance(${p}())`);
    // the ring proves it on the simulator: the spot «local plugins answer» (a rejection UNIMPLEMENTED = FAIL)
    expect(read('scripts/ios_sim_tour.sh')).toMatch(/a3 "local plugins answer \(A1\)" FAIL/);
  });
  it('cloud_38 (A2): FCM on iOS - Firebase Messaging, the FcmTopics twin registered by the app\'s bridge, the APNs token handed over', () => {
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    expect(pbx).toMatch(/repositoryURL = "https:\/\/github\.com\/firebase\/firebase-ios-sdk";/);
    expect(pbx).toMatch(/FirebaseMessaging in Frameworks/);
    for (const f of ['FcmTopicsPlugin.swift in Sources', 'InokBridgeViewController.swift in Sources', 'Localizable.strings in Resources']) expect(pbx, f).toContain(f);
    expect(pbx).toMatch(/GoogleService-Info\.plist: absent - Firebase off/); // the config is copied when the CI wrote it, never required
    const plugin = read('ios/App/App/FcmTopicsPlugin.swift');
    expect(plugin).toMatch(/jsName = "FcmTopics"/);
    for (const m of ['subscribe', 'unsubscribe', 'openSettings', 'consumedArticles', 'liveChannels']) expect(plugin).toContain(`CAPPluginMethod(name: "${m}"`);
    expect(read('ios/App/App/Base.lproj/Main.storyboard')).toMatch(/customClass="InokBridgeViewController" customModule="App"/);
    expect(read('ios/App/App/InokBridgeViewController.swift')).toMatch(/registerPluginInstance\(FcmTopicsPlugin\(\)\)/);
    const app = read('ios/App/App/AppDelegate.swift');
    expect(app).toMatch(/Messaging\.messaging\(\)\.apnsToken = deviceToken/);
    expect(app).toMatch(/post\(name: \.capacitorDidRegisterForRemoteNotifications, object: deviceToken\)/);
    expect(app).toMatch(/if Bundle\.main\.path\(forResource: "GoogleService-Info", ofType: "plist"\) != nil \{ FirebaseApp\.configure\(\) \}/);
    expect(plistValue(read('ios/App/App/Info.plist'), 'FirebaseAppDelegateProxyEnabled')?.[1]).toBe('false');
    for (const [i, l] of ['uk', 'ru', 'en'].entries()) expect(read(`ios/App/App/${l}.lproj/Localizable.strings`)).toContain(`"INOK_PUSH_TITLE" = "%${i + 1}$@";`);
    // the JS side: the topics on both platforms (one path), the soft offers on iOS too
    expect(read('src/native/push.ts')).toMatch(/if \(!isNative\(\) \|\| !registered\) return;/);
    expect(read('src/components/SoftAsk.tsx')).not.toMatch(/isIos/);
  });
  it('ios/ leaves for the mirror; a .p8 never does', () => {
    expect(read('scripts/mirror_paths.txt').split('\n')).toContain('ios/');
    expect(read('scripts/mirror_snapshot.py')).toMatch(/NEVER_SUFFIX = \([^)]*'\.p8'/);
    expect(read('.gitignore').split('\n')).toEqual(expect.arrayContaining(['*.p8', 'GoogleService-Info.plist']));
  });
});
