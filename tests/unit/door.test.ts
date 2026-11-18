import { describe, expect, it } from 'vitest';
import { doorFor, noticeDoor, parseVersion, versionCmp, versionsDoor } from '@/state/door';
import { versionCode } from '@/app/version';

// cloud_41 (A-132, contract R-58 / R-59): THE door - the numeric compare, both bars, the notice, «never for ever»
const V = (min: string, recommended: string) => ({ android: { min, recommended }, ios: { min: '1.0.0', recommended: '1.0.0' } });

describe('versionCmp (X.Y.Z numerically - pre-mortem P3)', () => {
  it.each([
    ['1.0.15', '1.0.15', 0], ['1.0.15', '1.0.16', -1], ['1.0.16', '1.0.15', 1],
    ['1.0.9', '1.0.10', -1], ['1.0.10', '1.0.9', 1], ['1.9.9', '1.10.0', -1], ['2.0.0', '1.99.99', 1],
  ] as const)('%s vs %s = %s', (a, b, r) => expect(versionCmp(a, b)).toBe(r));
  it.each(['', ' ', 'abc', '1.0', '1.0.x', '1.0.0.1', '-1.0.0', 'v1.0.0', null, undefined, 1015, {}])('broken %j = null', (b) => {
    expect(parseVersion(b)).toBeNull();
    expect(versionCmp('1.0.15', b)).toBeNull();
  });
});

describe('versions (R-59): two bars', () => {
  it('equal to both bars = nothing', () => expect(versionsDoor(V('1.0.15', '1.0.15'), 'android', '1.0.15')).toBeNull());
  it('below min = HARD', () => expect(versionsDoor(V('1.0.16', '1.0.16'), 'android', '1.0.15')).toMatchObject({ level: 'hard', action: 'update', source: 'versions' }));
  it('min <= installed < recommended = SOFT', () => expect(versionsDoor(V('1.0.15', '1.0.16'), 'android', '1.0.15')).toMatchObject({ level: 'soft' }));
  it('1.0.9 installed, min 1.0.10 = hard (not a string compare)', () => expect(versionsDoor(V('1.0.10', '1.0.10'), 'android', '1.0.9')?.level).toBe('hard'));
  it('1.0.10 installed, min 1.0.9 = nothing (a string compare would lock it)', () => expect(versionsDoor(V('1.0.9', '1.0.9'), 'android', '1.0.10')).toBeNull());
  it('each platform reads ONLY its own pair', () => {
    expect(versionsDoor(V('9.0.0', '9.0.0'), 'ios', '1.0.15')).toBeNull();
    expect(versionsDoor({ ios: { min: '9.0.0', recommended: '9.0.0' } }, 'android', '1.0.15')).toBeNull();
  });
  it.each(['', 'abc', '1.0', null])('a broken / empty bar %j = NOTHING', (b) => {
    expect(versionsDoor(V(b as string, b as string), 'android', '1.0.15')).toBeNull();
  });
  it('absent / null / not an object = nothing', () => {
    expect(versionsDoor(undefined, 'android', '1.0.15')).toBeNull();
    expect(versionsDoor(null, 'android', '1.0.15')).toBeNull();
    expect(versionsDoor({ android: 'x' } as never, 'android', '1.0.15')).toBeNull();
  });
});

const N = { id: 'n-1', below: '1.0.16', platforms: ['android', 'ios'], action: 'update', level: 'soft' };
describe('notice (R-58)', () => {
  it('applies strictly below `below`, its platform only', () => {
    expect(noticeDoor(N, 'android', '1.0.15')).toMatchObject({ source: 'notice', id: 'n-1', level: 'soft', action: 'update' });
    expect(noticeDoor(N, 'android', '1.0.16')).toBeNull();
    expect(noticeDoor({ ...N, platforms: ['ios'] }, 'android', '1.0.15')).toBeNull();
  });
  it('level absent = soft; hard kept', () => {
    expect(noticeDoor({ ...N, level: undefined }, 'ios', '1.0.15')?.level).toBe('soft');
    expect(noticeDoor({ ...N, level: 'hard' }, 'ios', '1.0.15')?.level).toBe('hard');
  });
  it.each([
    ['no id', { ...N, id: '' }], ['broken below', { ...N, below: '1.0' }], ['unknown action', { ...N, action: 'wipe' }],
    ['unknown level', { ...N, level: 'loud' }], ['platforms not a list', { ...N, platforms: 'android' }], ['info without text', { ...N, action: 'info' }],
  ])('%s = null (nothing shown)', (_, n) => expect(noticeDoor(n, 'android', '1.0.15')).toBeNull());
  it('the site\'s words only when all three languages are there; an https url only', () => {
    const d = noticeDoor({ ...N, title: { uk: 'А', ru: 'Б', en: 'C' }, text: { uk: 'а', ru: '' , en: 'c' }, url: 'http://x' }, 'android', '1.0.15');
    expect(d?.title).toEqual({ uk: 'А', ru: 'Б', en: 'C' });
    expect(d?.text).toBeUndefined();
    expect(d?.url).toBeUndefined();
  });
  it('an «info» without a page is never hard (never locked for ever)', () => {
    expect(noticeDoor({ ...N, action: 'info', level: 'hard', text: { uk: 'а', ru: 'б', en: 'c' } }, 'android', '1.0.15')?.level).toBe('soft');
  });
});

describe('doorFor: the notice wins; never for ever', () => {
  const c = { notice: { ...N, action: 'reinstall' }, versions: V('1.0.16', '1.0.16') };
  it('both apply -> the notice', () => expect(doorFor(c, 'android', '1.0.15')).toMatchObject({ source: 'notice', action: 'reinstall' }));
  it('a notice carried out (reset_data done) -> the bars decide', () => expect(doorFor(c, 'android', '1.0.15', new Set(['n-1']))).toMatchObject({ source: 'versions', level: 'hard' }));
  it('the bar gone from the config -> no door', () => expect(doorFor({ notice: null, versions: null }, 'android', '1.0.15')).toBeNull());
  it('the version reached the bar -> no door', () => expect(doorFor(c, 'android', '1.0.16')).toBeNull());
  it('no config / a broken installed version -> no door', () => {
    expect(doorFor(null, 'android', '1.0.15')).toBeNull();
    expect(doorFor(c, 'android', 'dev')).toBeNull();
  });
  it('the site today (notice null, every bar 1.0.0) -> nothing on either platform', () => {
    const today = { notice: null, versions: { android: { min: '1.0.0', recommended: '1.0.0' }, ios: { min: '1.0.0', recommended: '1.0.0' } } };
    expect(doorFor(today, 'android', '1.0.15')).toBeNull();
    expect(doorFor(today, 'ios', '1.0.15')).toBeNull();
  });
});

describe('versionCode (A-62; the push topic appv_<code>)', () => {
  it.each([['1.0.15', 10015], ['1.0.9', 10009], ['2.3.4', 20304]])('%s = %d', (v, n) => expect(versionCode(v)).toBe(n));
});

describe('the KEPT config decides at a start without a network (DoorGate reads `cache.config`, written by every fresh config)', () => {
  it('a hard bar kept from the last answer -> the hard door offline; a fresh answer without it -> none', async () => {
    const { freshDb } = await import('./helpers');
    const { cacheGet, cacheSet } = await import('@/data/repo/cache');
    const { db } = await freshDb();
    await cacheSet(db, 'config', { versions: { android: { min: '9.0.0', recommended: '9.0.0' }, ios: { min: '1.0.0', recommended: '1.0.0' } } });
    const kept = (await cacheGet<Record<string, unknown>>(db, 'config'))?.value;
    expect(doorFor(kept, 'android', '1.0.15')?.level).toBe('hard');
    await cacheSet(db, 'config', { versions: { android: { min: '1.0.0', recommended: '1.0.0' } } }); // the site lifted the bar
    expect(doorFor((await cacheGet<Record<string, unknown>>(db, 'config'))?.value, 'android', '1.0.15')).toBeNull();
  });
});
