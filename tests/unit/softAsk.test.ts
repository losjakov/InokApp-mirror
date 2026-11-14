import { describe, expect, it } from 'vitest';
import { DEFAULTS, LEGACY_TOPICS } from '@/state/settings';
import * as rule from '@/state/softAsk';
import { afterAnswer, shouldAsk, shownOn } from '@/state/softAsk';

const s = (topics: string[], asked: ('articles' | 'streams')[] = []) => ({ topics, asked });

describe('A-64 / A-67 soft notification questions', () => {
  it('A-64: a NEW install listens to nothing; 1.0.0\'s default is kept apart for an existing install', () => {
    expect(DEFAULTS.topics).toEqual([]);
    expect(DEFAULTS.asked).toEqual([]);
    expect(LEGACY_TOPICS).toEqual(['articles']);
  });
  it('asks once, where the phone can notify, when the offer is not already on', () => {
    expect(shouldAsk('articles', s([]), 'prompt')).toBe(true);
    expect(shouldAsk('articles', s([]), 'granted')).toBe(true);
    expect(shouldAsk('articles', s([]), 'denied')).toBe(true); // the refused variant: says so, opens the phone's settings
    expect(shouldAsk('articles', s([]), 'unsupported')).toBe(false); // the web: no notifications at all
    expect(shouldAsk('articles', s([], ['articles']), 'prompt')).toBe(false); // answered once = never again
    expect(shouldAsk('articles', s(['articles_news']), 'granted')).toBe(false); // already on
    expect(shouldAsk('articles', s(['articles']), 'prompt')).toBe(true); // a topic WITHOUT the permission is not «on» (Android 13+)
    expect(shouldAsk('streams', s(['articles']), 'granted')).toBe(true);
    expect(shouldAsk('streams', s(['ch_3']), 'granted')).toBe(false);
  });
  it('A-73: the two questions are INDEPENDENT - «Ні» to one leaves the other at its own first moment, the same launch and the next', () => {
    for (const [first, other] of [['streams', 'articles'], ['articles', 'streams']] as const) {
      expect(shouldAsk(first, s([]), 'prompt')).toBe(true);
      const after = { ...s([]), ...afterAnswer(first, s([]), false) }; // «Ні, дякую»
      expect(after.asked).toEqual([first]);
      expect(shouldAsk(first, after, 'prompt')).toBe(false); // closes only itself
      expect(shouldAsk(other, after, 'prompt')).toBe(true); // the same launch
      const stored = JSON.parse(JSON.stringify(after)) as typeof after; // the next launch reads the saved settings
      expect(shouldAsk(other, stored, 'prompt')).toBe(true);
    }
    expect(Object.keys(rule).filter((k) => /launch|shown$/i.test(k) && k !== 'shownOn')).toEqual([]); // no per-launch cap left in the rule
  });
  it('«Так» = all three kinds, only once granted; every other answer switches nothing on', () => {
    expect(afterAnswer('articles', s(['ch_3']), true)).toEqual({ asked: ['articles'], topics: ['articles', 'ch_3'] });
    expect(afterAnswer('articles', s(['ch_3']), false)).toEqual({ asked: ['articles'], topics: ['ch_3'] });
    expect(afterAnswer('streams', s([], ['articles']), false)).toEqual({ asked: ['articles', 'streams'], topics: [] });
  });
  it('a switch shows ON only with the system permission', () => {
    expect(shownOn(true, 'granted')).toBe(true);
    expect(shownOn(true, 'prompt')).toBe(false);
    expect(shownOn(true, 'denied')).toBe(false);
    expect(shownOn(true, 'unsupported')).toBe(true); // the browser screens show the stored choice
    expect(shownOn(false, 'granted')).toBe(false);
  });
});
