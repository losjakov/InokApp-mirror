import { describe, expect, it, vi } from 'vitest';
import { HOME_BLOCKS, loadUiConfig, parseUiConfig, UI_DEFAULTS, UI_KEY, UI_MAX_AGE_MS } from '@/data/uiConfig';
import { dataSource } from '@/data/source';
import { cacheSet } from '@/data/repo/cache';
import { widgetJson } from '@/native/widgets';
import { makeT } from '@/i18n';
import { importedDb } from './helpers';

/** A-162 (2) (cloud_44): the site's small settings - VALUES only, each checked; 404 / offline / bad = the built-in defaults (today's look). */
describe('ui-config', () => {
  it('404 / offline / not JSON / not an object -> ALL the defaults', async () => {
    for (const raw of [null, undefined, 'x', 42, [], [1, 2]]) expect(parseUiConfig(raw)).toEqual(UI_DEFAULTS);
    const { db } = await importedDb();
    for (const fail of [new Error('http_404'), new TypeError('Failed to fetch'), new SyntaxError('Unexpected token <')]) {
      vi.spyOn(dataSource(), 'uiConfig').mockImplementation(() => Promise.reject(fail));
      expect(await loadUiConfig(db, () => 0)).toEqual(UI_DEFAULTS);
    }
    vi.restoreAllMocks();
  });
  it('a good file changes a dot colour, the rows cap, a label and the Home order', () => {
    const u = parseUiConfig({ dots: { light: { news: '#112233' } }, max_rows: 3, labels: { uk: { live: 'Наживо' } }, home: ['new', 'live', 'near', 'popular'] });
    expect(u.dots.light.news).toBe('#112233');
    expect(u.dots.light.pub).toBe(UI_DEFAULTS.dots.light.pub);
    expect(u.dots.dark).toEqual(UI_DEFAULTS.dots.dark);
    expect(u.max_rows).toBe(3);
    expect(u.labels).toEqual({ uk: { live: 'Наживо' } });
    expect(u.home).toEqual(['new', 'live', 'near', 'popular']);
  });
  it('each bad value -> ITS default; unknown keys ignored; never code or markup', () => {
    const u = parseUiConfig({ dots: { light: { news: 'red', pub: '#12345', video: 'url(x)' }, dark: { news: '#ABCDEF' } }, max_rows: 999, labels: { uk: { live: '<b>x</b>', new: '' }, de: { live: 'x' } },
      home: ['new', 'live', 'near', 'unknown'], script: 'alert(1)', layout: { anything: true } });
    expect(u.dots.light).toEqual(UI_DEFAULTS.dots.light);
    expect(u.dots.dark.news).toBe('#ABCDEF');
    expect(u.max_rows).toBe(0);
    expect(u.labels).toEqual({});
    expect(u.home).toEqual([...HOME_BLOCKS]);
    expect(Object.keys(u).sort()).toEqual(['dots', 'home', 'labels', 'max_rows']);
    expect(parseUiConfig({ home: ['live', 'live', 'new', 'near'] }).home, 'not a permutation').toEqual([...HOME_BLOCKS]);
    expect(parseUiConfig({ max_rows: 2.5 }).max_rows).toBe(0);
  });
  it('asked at most once per 12 h: a good file younger than that is used without a request; older -> asked again', async () => {
    const { db } = await importedDb();
    let asked = 0;
    vi.spyOn(dataSource(), 'uiConfig').mockImplementation(() => { asked++; return Promise.resolve({ max_rows: 4 }); });
    await cacheSet(db, UI_KEY, { max_rows: 2 });
    const t0 = Date.now();
    expect((await loadUiConfig(db, () => t0 + 1000)).max_rows).toBe(2);
    expect(asked).toBe(0);
    expect((await loadUiConfig(db, () => t0 + UI_MAX_AGE_MS + 1000)).max_rows).toBe(4);
    expect(asked).toBe(1);
    vi.restoreAllMocks();
  });
  it('the fixtures (the site today) have no file: 404 -> the defaults', async () => {
    const { db } = await importedDb();
    await expect(dataSource().uiConfig()).rejects.toBeTruthy(); // fixtures/ui-config.json does not exist (the browser ring: 404)
    expect(await loadUiConfig(db, () => 0)).toEqual(UI_DEFAULTS);
  });
  it('the widgets get the values: dots, the cap, the headers (the count keeps its place)', () => {
    const ui = parseUiConfig({ dots: { dark: { video: '#AA00AA' } }, max_rows: 2, labels: { uk: { live: 'Наживо', new: 'Свіже' } } });
    const j = widgetJson({ t: makeT('uk'), lang: 'uk', channels: [], dict: {}, status: null, items: [], reminders: [], now: 0, ui });
    expect(j.ui).toEqual({ dots: ui.dots, max_rows: 2 });
    expect(j.words.live_title).toBe('Наживо · {n}');
    expect(j.words.new_title).toBe('Свіже');
    expect(j.words.upcoming_title).toBe(makeT('uk')('widget.upcoming_title'));
    expect(widgetJson({ t: makeT('uk'), lang: 'uk', channels: [], dict: {}, status: null, items: [], reminders: [], now: 0 }).ui).toEqual({ dots: UI_DEFAULTS.dots, max_rows: 0 });
  });
});
