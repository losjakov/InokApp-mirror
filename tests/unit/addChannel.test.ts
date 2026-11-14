import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { siteUrl } from '@/native/intents';
import { sitePageUrl } from '@/data/links/sitePages';
import { CHANNEL_FORM } from '@/pages/Streams';

// A-85 (1): «Додайте свій канал» at the end of «Трансляції» - the site's words, the site's form in the in-app tab, the comment button's helper
const json = (l: string) => JSON.parse(readFileSync(new URL(`../../src/i18n/${l}.json`, import.meta.url), 'utf8')) as Record<string, string>;
const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('A-85 (1) add your channel', () => {
  it('the site\'s own words (measured on /live/ x3 by CD S292)', () => {
    expect([json('uk'), json('ru'), json('en')].map((d) => d['streams.add_channel'])).toEqual(['Додайте свій канал', 'Добавьте свой канал', 'Add your channel']);
    for (const l of ['uk', 'ru', 'en']) expect(json(l)['streams.add_channel_offline']).toBeTruthy();
  });
  it('the address: /live/ in the app language + the anchor that opens the site\'s window (R-43)', () => {
    const to = (l: 'uk' | 'ru' | 'en') => siteUrl(sitePageUrl('/streams', l), l, CHANNEL_FORM);
    expect(to('uk')).toBe('https://inok.info/live/#skm-cta-channel');
    expect(to('ru')).toBe('https://inok.info/live/?lang=ru#skm-cta-channel');
    expect(to('en')).toBe('https://inok.info/live/?lang=en#skm-cta-channel');
  });
  it('ONE helper and ONE button with «Додати коментар» (A-15): openOnSite + SiteFormButton, once each', () => {
    const streams = src('src/pages/Streams.tsx');
    expect(streams.match(/openOnSite\(/g)).toHaveLength(1);
    expect(streams).toMatch(/openOnSite\(sitePageUrl\('\/streams', lang\), lang, CHANNEL_FORM\)/);
    expect(streams.match(/<SiteFormButton /g)).toHaveLength(1);
    expect(src('src/components/CommentsBlock.tsx')).toMatch(/<SiteFormButton icon=\{chatbubbleOutline\}/);
    expect(streams).toMatch(/icon=\{addCircleOutline\}/); // the site's «plus in a circle»
    // the button sits after the lists, before the page's share footer (the end of the content, not a floating button)
    expect(streams.indexOf('<SiteFormButton')).toBeGreaterThan(streams.indexOf('</IonList>'));
    expect(streams.indexOf('<SiteFormButton')).toBeLessThan(streams.indexOf('<ShareFooter'));
  });
});
