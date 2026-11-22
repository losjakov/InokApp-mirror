import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { linkTarget } from '@/data/links/router';
import { ARTICLE_SECTIONS } from '@/data/links/sitePages';

const MAN = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const RES = 'android/app/src/main/res';
const appName = (dir: string) => {
  const f = `${RES}/${dir}/strings.xml`;
  return existsSync(f) ? readFileSync(f, 'utf8').match(/<string name="app_name">([^<]*)<\/string>/)?.[1] : undefined;
};

describe('Android manifest - the phone name (A-69) and the permissions (N5)', () => {
  it('A-69: application and launcher label come from ONE string «inok.info», no language copy', () => {
    expect(appName('values')).toBe('inok.info');
    for (const d of ['values-uk', 'values-ru', 'values-en']) expect(appName(d)).toBeUndefined();
    expect(MAN).toMatch(/<application[^>]*android:label="@string\/app_name"/);
    const activity = MAN.match(/<activity[\s\S]*?>/)?.[0] ?? '';
    expect(activity).not.toMatch(/android:label=/); // inherits the application's label
    expect(MAN).not.toMatch(/title_activity_main/);
  });
  it('A-69: capacitor.config.ts appName is the same name', () => {
    expect(readFileSync('capacitor.config.ts', 'utf8')).toMatch(/appName: 'inok\.info'/);
  });
  it('N5: the biometric permissions of a plugin are removed from the merged manifest', () => {
    for (const p of ['USE_BIOMETRIC', 'USE_FINGERPRINT'])
      expect(MAN).toMatch(new RegExp(`<uses-permission android:name="android\\.permission\\.${p}" tools:node="remove" />`));
    expect(readFileSync('capacitor.config.ts', 'utf8')).not.toMatch(/biometric/i);
  });
  it('A-76: ONE autoVerify App Links filter - https://inok.info, the three article sections and /monasteries/; the router opens what it names', () => {
    const activity = MAN.match(/<activity[\s\S]*?<\/activity>/)?.[0] ?? '';
    const filters = activity.match(/<intent-filter[^>]*>[\s\S]*?<\/intent-filter>/g) ?? [];
    const links = filters.filter((f) => /android\.intent\.action\.VIEW/.test(f));
    expect(links).toHaveLength(1);
    const f = links[0];
    expect(f).toMatch(/<intent-filter android:autoVerify="true">/);
    for (const c of ['DEFAULT', 'BROWSABLE']) expect(f).toContain(`android.intent.category.${c}`);
    expect([...f.matchAll(/android:scheme="([^"]+)"/g)].map((m) => m[1])).toEqual(['https']);
    expect([...f.matchAll(/android:host="([^"]+)"/g)].map((m) => m[1])).toEqual(['inok.info']);
    const prefixes = [...f.matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => m[1]);
    expect(prefixes).toEqual([...Object.values(ARTICLE_SECTIONS).map((x) => `/${x}`), '/monasteries/', '/dioceses/', '/live/', '/objects/monasteries/']); // one source: the router's sections
    expect(f).not.toMatch(/android:pathPattern=/); // A-166: the legacy pathPattern lives in the alias (API 26-30 only)
    // T4 (cloud_43): the umbrella /articles/ is ONE exact path (not a prefix) and opens «Публікації» «Усі»
    expect([...f.matchAll(/android:path="([^"]+)"/g)].map((m) => m[1])).toEqual(['/articles/']);
    expect(linkTarget('https://inok.info/articles/')).toEqual({ kind: 'list', list: 'all' });
    // each prefix: its item form AND (A-138) its bare list open in the app - nothing the filter lets in by its bare prefix lands in the browser
    for (const p of prefixes) {
      if (p === '/objects/monasteries/') { expect(linkTarget(`https://inok.info${p}1832/`)?.kind, p).toBe('card'); continue; } // A-166: the legacy card form only
      if (p !== '/live/') expect(linkTarget(`https://inok.info${p}1832/`), p).not.toBeNull(); // /live/ has no item form in the app (A-143 (5))
      expect(linkTarget(`https://inok.info${p}`)?.kind, p).toBe('list');
    }
  });
});

describe('A-92: the app declares its site (asset_statements) - the site\'s getInstalledRelatedApps() sees the installed app', () => {
  it('the manifest points at ONE string; the string is the handle_all_urls statement for https://inok.info, valid JSON', () => {
    expect(MAN).toMatch(/<meta-data android:name="asset_statements" android:resource="@string\/asset_statements" \/>/);
    const raw = readFileSync(`${RES}/values/asset_statements.xml`, 'utf8').match(/<string name="asset_statements" translatable="false">([^<]*)<\/string>/)![1];
    const st = JSON.parse(raw.replace(/\\"/g, '"'));
    expect(st).toEqual([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'web', site: 'https://inok.info' } }]);
  });
  it('the App Links filters (R-7 / A-76 + A-166): the activity\'s one + the short-link alias, both autoVerify, host inok.info only', () => {
    expect(MAN.match(/android:autoVerify="true"/g)).toHaveLength(2);
    expect([...MAN.matchAll(/android:host="([^"]+)"/g)].map((m) => m[1])).toEqual(['inok.info', 'inok.info']);
  });
});

/** A-166 (cloud_44): the site's SHORT card / gallery links reach the app - Android 12+ by pathAdvancedPattern (digits only), Android 8-11 by
 *  a pathPattern alias enabled ONLY below API 31; whatever a filter lets in that is not a card, the ONE router hands to the browser. */
describe('A-166 short links in the Android filters', () => {
  const activity = MAN.match(/<activity[\s\S]*?<\/activity>/)?.[0] ?? '';
  const alias = MAN.match(/<activity-alias[\s\S]*?<\/activity-alias>/)?.[0] ?? '';
  const attr = (x: string, a: string) => [...x.matchAll(new RegExp(`android:${a}="([^"]+)"`, 'g'))].map((m) => m[1]);
  // the platform's two pattern languages (android.os.PatternMatcher): ADVANCED_GLOB = literals, [..] sets with ranges, «+» / «*» repeats;
  // SIMPLE_GLOB (pathPattern) = «.» any char, «*» = zero or more of the char before it - both matched against the WHOLE path
  const advanced = (pat: string) => new RegExp(`^${pat.replace(/\//g, '\\/')}$`);
  const simple = (pat: string) => new RegExp(`^${pat.replace(/[/]/g, '\\/')}$`);
  const adv = attr(activity, 'pathAdvancedPattern').map(advanced);
  const old = attr(alias, 'pathPattern').map(simple);
  const CARDS = ['/140', '/140/', '/140/g', '/140/G/', '/ru/140', '/uk/140/', '/en/140/g', '/ru/140/g/', '/7'];
  const NOT = ['/ru/map/', '/app/', '/app/versions/', '/140a', '/140/gallery', '/de/140', '/ru/', '/', '/robots.txt', '/140/g/x', '/x140'];
  it('Android 12+: every short form matches, nothing else does (digits only)', () => {
    expect(adv).toHaveLength(16);
    for (const p of CARDS) expect(adv.some((r) => r.test(p)), p).toBe(true);
    for (const p of NOT) expect(adv.some((r) => r.test(p)), p).toBe(false);
    for (const p of CARDS) expect(linkTarget(`https://inok.info${p}`)?.kind, p).toBe('card');
  });
  it('Android 8-11: the alias lets every short form in (pathPattern «/<digit>.*»), never a path without a leading digit; the router sorts the rest', () => {
    for (const p of CARDS) expect(old.some((r) => r.test(p)), p).toBe(true);
    for (const p of ['/ru/map/', '/app/', '/app/versions/', '/de/140', '/ru/', '/', '/x140']) expect(old.some((r) => r.test(p)), p).toBe(false);
    for (const p of ['/140a', '/140/gallery', '/140/g/x']) expect(linkTarget(`https://inok.info${p}`), `${p}: in the filter, the router -> the browser`).toBeNull();
  });
  it('the alias is MainActivity\'s, exported, enabled by a bool that is true by default and false from API 31', () => {
    expect(alias).toMatch(/android:targetActivity="\.MainActivity"/);
    expect(alias).toMatch(/android:exported="true"/);
    expect(alias).toMatch(/android:enabled="@bool\/inok_short_links_legacy"/);
    expect(attr(alias, 'pathPrefix')).toEqual([]);
    const bool = (d: string) => readFileSync(`${RES}/${d}/bools.xml`, 'utf8').match(/<bool name="inok_short_links_legacy">(\w+)<\/bool>/)?.[1];
    expect([bool('values'), bool('values-v31')]).toEqual(['true', 'false']);
  });
});

