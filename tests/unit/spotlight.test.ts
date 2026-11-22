import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importedDb } from './helpers';
import { allHouseRows, getDictionary } from '@/data/repo/monasteries';
import { listChannels } from '@/data/repo/channels';
import { channelItems, houseItems, savedItems } from '@/native/spotlight';
import { linkTarget } from '@/data/links/router';
import { quickRoute } from '@/app/quickActions';
import { LANGS, type Lang } from '@/i18n';

// T10 / T11 (A-153 (3), (4), iOS): Spotlight items = site addresses the ONE router opens; keywords x3; Siri's routes
describe('Spotlight items', () => {
  it('every house: id = its card address (the router opens the card), the name, town · eparchy, names / towns / eparchies x3 as keywords', async () => {
    const { db } = await importedDb();
    const rows = await allHouseRows(db);
    const dicts = Object.fromEntries(await Promise.all(LANGS.map(async (l) => [l, await getDictionary(db, l)]))) as Record<Lang, Record<string, string>>;
    const items = houseItems(rows, 'uk', dicts);
    expect(items).toHaveLength(rows.length);
    const lavra = items.find((x) => x.id === 'https://inok.info/monasteries/242/')!;
    expect(linkTarget(lavra.id)).toEqual({ kind: 'card', code: 242, gallery: false });
    expect(lavra.title).toMatch(/Лавр/);
    for (const w of ['Києво-Печерська', 'Киево-Печерская', 'Kyiv']) expect(lavra.keywords.join(' '), w).toContain(w);
    expect(new Set(items.map((x) => x.id)).size).toBe(items.length);
  });
  it('channels -> «Трансляції»; saved -> the article; Siri: «Обителі поруч» = Home, «Нове на сайті» = «Усі»', async () => {
    const { db } = await importedDb();
    const ch = channelItems(await listChannels(db, 'uk'), 'uk');
    expect(linkTarget(ch[0].id)).toEqual({ kind: 'list', list: 'streams' });
    expect(savedItems([{ id: 1832, kind: 'publication', title: 'T', subtitle: null, cover: null, published_at: '', site_url: 'https://inok.info/articles/publications/1832/' }])[0].id)
      .toBe('https://inok.info/articles/publications/1832/');
    expect(quickRoute('inokapp://tab/home')).toBe('/home');
    expect(linkTarget('https://inok.info/articles/')).toEqual({ kind: 'list', list: 'all' });
    const swift = readFileSync('ios/App/App/InokIntents.swift', 'utf8');
    expect(swift).toContain('IntentOpen.go("inokapp://tab/home")');
    expect(swift).toContain('IntentOpen.go("https://inok.info/articles/")');
    expect((swift.match(/AppShortcut\(intent:/g) ?? []).length).toBe(4);
    for (const p of swift.match(/"[^"]*\\\(\.applicationName\)[^"]*"/g) ?? []) expect(readFileSync('ios/App/App/ru.lproj/AppShortcuts.strings', 'utf8')).toContain(`"${p.slice(1, -1).replace('\\(.applicationName)', '${applicationName}')}"`);
  });
});
