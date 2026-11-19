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
    const filters = MAN.match(/<intent-filter[^>]*>[\s\S]*?<\/intent-filter>/g) ?? [];
    const links = filters.filter((f) => /android\.intent\.action\.VIEW/.test(f));
    expect(links).toHaveLength(1);
    const f = links[0];
    expect(f).toMatch(/<intent-filter android:autoVerify="true">/);
    for (const c of ['DEFAULT', 'BROWSABLE']) expect(f).toContain(`android.intent.category.${c}`);
    expect([...f.matchAll(/android:scheme="([^"]+)"/g)].map((m) => m[1])).toEqual(['https']);
    expect([...f.matchAll(/android:host="([^"]+)"/g)].map((m) => m[1])).toEqual(['inok.info']);
    const prefixes = [...f.matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => m[1]);
    expect(prefixes).toEqual([...Object.values(ARTICLE_SECTIONS).map((x) => `/${x}`), '/monasteries/', '/dioceses/', '/live/']); // one source: the router's sections
    expect(f).not.toMatch(/android:path(Pattern)?=/);
    // each prefix: its item form AND (A-138) its bare list open in the app - nothing the filter lets in by its bare prefix lands in the browser
    for (const p of prefixes) {
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
  it('the App Links filter (R-7 / A-76) is unchanged: one autoVerify filter, host inok.info', () => {
    expect(MAN.match(/android:autoVerify="true"/g)).toHaveLength(1);
    expect(MAN).toMatch(/android:host="inok\.info"/);
  });
});

