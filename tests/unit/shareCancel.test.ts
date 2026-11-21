import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// T2 (cloud_43, remark 2): cancelling «Поділитися» = nothing; a real failure = the link copied + ONE snackbar; the crash guard ignores a cancel
const sh = vi.hoisted(() => ({ reject: null as unknown }));
vi.mock('@capacitor/share', () => ({ Share: { share: async () => { if (sh.reject) throw sh.reject; } } }));
vi.mock('@/native/platform', () => ({ isNative: () => true, isIos: () => false, isAndroid: () => true }));

import { isUserCancel, onShareFallback, shareUrl, type ShareWord } from '@/native/intents';

const said: ShareWord[] = [];
const clip = vi.fn(async () => undefined);
beforeEach(() => { said.length = 0; clip.mockReset(); onShareFallback((w) => said.push(w)); vi.stubGlobal('navigator', { clipboard: { writeText: clip } }); });
afterEach(() => { sh.reject = null; onShareFallback(null); vi.unstubAllGlobals(); });

describe('isUserCancel', () => {
  it.each([
    [new Error('Share canceled'), true], // @capacitor/share 8.0.3: iOS completed == false AND Android SharePlugin.java:78 (Back)
    [new Error("Can't share while sharing is in progress"), true], // a double tap (iOS)
    [Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }), true], // the web's navigator.share
    ['User cancelled', true],
    [new Error('Error sharing item'), false],
    [undefined, false],
  ])('%s -> %s', (e, want) => expect(isUserCancel(e)).toBe(want));
});

describe('shareUrl never throws', () => {
  it('a cancel: nothing at all (no copy, no message)', async () => {
    sh.reject = new Error('Share canceled');
    await expect(shareUrl('t', 'https://inok.info/x/')).resolves.toBeUndefined();
    expect(clip).not.toHaveBeenCalled();
    expect(said).toEqual([]);
  });
  it('a real failure: the link copied + «Посилання скопійовано»', async () => {
    sh.reject = new Error('Error sharing item');
    await shareUrl('t', 'https://inok.info/x/');
    expect(clip).toHaveBeenCalledWith('https://inok.info/x/');
    expect(said).toEqual(['copied']);
  });
  it('the copy refused too: «Не вдалося поділитися», still no throw', async () => {
    sh.reject = new Error('Error sharing item');
    clip.mockRejectedValue(new Error('denied'));
    await expect(shareUrl('t', 'https://inok.info/x/')).resolves.toBeUndefined();
    expect(said).toEqual(['failed']);
  });
});

describe('the crash guard ignores a cancel (crash.tsx unhandledrejection)', () => {
  it('a rejected «Share canceled» is no crash (nothing logged as one, nothing kept); another rejection is', async () => {
    vi.unstubAllGlobals();
    const handlers: Record<string, (e: unknown) => void> = {};
    const kept = new Map<string, string>();
    vi.stubGlobal('window', { addEventListener: (type: string, h: (e: unknown) => void) => { handlers[type] = h; } });
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { installCrashGuard } = await import('@/app/crash');
    installCrashGuard();
    handlers.unhandledrejection({ reason: new Error('Share canceled') });
    expect(err).not.toHaveBeenCalled();
    expect(kept.size).toBe(0);
    try { handlers.unhandledrejection({ reason: new Error('boom') }); } catch { /* the stop screen needs a document - node has none */ }
    expect(err.mock.calls.flat().join(' ')).toMatch(/InokBoot: rejection/);
    err.mockRestore(); warn.mockRestore();
  });
});
