import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { deviceTopics, END_TOPIC_PREFIX } from '@/native/push';
import { routeForPush } from '@/data/live/pushRoute';
import { HOME_SEEN_MS, whileSeen } from '@/state/seen';

// A-84 - the JS side of the notifications (the native rules: android/app/src/test/java/info/inok/app/NotifierTest.java)
const FCM_TOPIC = /^[a-zA-Z0-9\-_.~%]{1,900}$/;
const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : [p]; });

describe('A-84 (d) / R-42: the end of a broadcast on its own topic', () => {
  it('each channel topic brings chend_<id> along on the device; nothing else changes', () => {
    expect(deviceTopics(['articles', 'ch_3', 'ch_1686'])).toEqual(['articles', 'ch_3', 'ch_1686', 'chend_3', 'chend_1686']);
    expect(deviceTopics(['articles_news'])).toEqual(['articles_news']);
    expect(deviceTopics(['ch_3', 'chend_3'])).toEqual(['ch_3', 'chend_3']);
    for (const t of deviceTopics(['ch_12345'])) expect(t).toMatch(FCM_TOPIC);
    expect(END_TOPIC_PREFIX).toBe('chend_');
  });
  it('never ch_<id> for the end (1.0.4 would draw it): the end topic differs from every channel topic', () => {
    const end = deviceTopics(['ch_7']).filter((t) => t.startsWith(END_TOPIC_PREFIX));
    expect(end).toEqual(['chend_7']);
    expect(end.some((t) => /^ch_\d+$/.test(t))).toBe(false);
  });
  it('the FCM subscription uses the device set; the settings and any server body keep the contract topics only', () => {
    expect(src('src/native/push.ts')).toMatch(/const want = new Set\(deviceTopics\(wanted\)\)/);
    // contract §3 POST push/subscriptions validates ch_<id> | articles* only - until R-42 is DONE no code may send chend_ there
    const all = files(new URL('../../src', import.meta.url).pathname).filter((f) => /\.tsx?$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(all).not.toMatch(/push\/subscriptions/);
  });
});

describe('A-84 (h): taps', () => {
  it('the summary opens Home («Нове на сайті»); one article -> that article; a stream -> as before', () => {
    expect(routeForPush({ type: 'articles_summary', data: { type: 'articles_summary' } })).toEqual({ kind: 'navigate', to: '/home' });
    expect(routeForPush({ type: 'article', data: { type: 'article', id: '5' } })).toEqual({ kind: 'navigate', to: '/articles?id=5' });
    expect(routeForPush({ type: 'stream_live', data: { video_id: 'abc' } })).toEqual({ kind: 'streams-play', video: 'abc' });
    expect(routeForPush({ type: 'stream_ended', data: { channel_id: '3' } })).toBeNull();
  });
});

describe('A-84 (b): Home seen = the article notifications consumed', () => {
  const fakeDoc = (state: 'visible' | 'hidden') => {
    const ls = new Set<() => void>();
    return {
      visibilityState: state as DocumentVisibilityState,
      addEventListener: (_: string, f: () => void) => ls.add(f),
      removeEventListener: (_: string, f: () => void) => ls.delete(f),
      fire(s: 'visible' | 'hidden') { this.visibilityState = s; ls.forEach((f) => f()); },
      ls,
    };
  };
  const timers = { set: (f: () => void, ms: number) => setTimeout(f, ms), clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  it('fires after HOME_SEEN_MS on screen, once per return to the front', () => {
    vi.useFakeTimers();
    const d = fakeDoc('visible'); const seen = vi.fn();
    const stop = whileSeen(seen, HOME_SEEN_MS, d as never, timers);
    vi.advanceTimersByTime(HOME_SEEN_MS - 1); expect(seen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(seen).toHaveBeenCalledTimes(1);
    d.fire('hidden'); d.fire('visible'); vi.advanceTimersByTime(HOME_SEEN_MS); expect(seen).toHaveBeenCalledTimes(2);
    stop(); expect(d.ls.size).toBe(0); vi.useRealTimers();
  });
  it('the app gone to the back at once (a stream tap -> YouTube) or Home left = nothing cleared', () => {
    vi.useFakeTimers();
    const d = fakeDoc('visible'); const seen = vi.fn();
    const stop = whileSeen(seen, HOME_SEEN_MS, d as never, timers);
    vi.advanceTimersByTime(500); d.fire('hidden'); vi.advanceTimersByTime(5000); expect(seen).not.toHaveBeenCalled();
    d.fire('visible'); vi.advanceTimersByTime(500); stop(); vi.advanceTimersByTime(5000); expect(seen).not.toHaveBeenCalled();
    const h = fakeDoc('hidden'); whileSeen(seen, HOME_SEEN_MS, h as never, timers); vi.advanceTimersByTime(5000); expect(seen).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('Home asks for ALL articles, an article view for its own id only, live-status only when fresh', () => {
    expect(src('src/pages/Home.tsx')).toMatch(/whileSeen\(\(\) => void consumedArticles\(\)\)/);
    expect(src('src/components/ArticleView.tsx')).toMatch(/consumedArticles\(\[String\(id\)\]\)/);
    expect(src('src/state/AppContext.tsx')).toMatch(/if \(live && !live\.stale\) void liveChannelsNow\(/);
  });
});
