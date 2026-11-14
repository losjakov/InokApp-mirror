import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { longDate } from '@/i18n/date';

// N3 (REVIEW cloud_21): «25 жовтня 2026 р.» - the year mark never wraps alone (tablet, 200 % font).
describe('longDate (the ONE long-date formatter)', () => {
  const at = new Date(2026, 9, 25, 12).toISOString();
  it('binds «р.» / «г.» to the year with a no-break space', () => {
    expect(longDate(at, 'uk')).toBe('25 жовтня 2026 р.');
    expect(longDate(at, 'ru')).toBe('25 октября 2026 г.');
    expect(longDate(at, 'en')).toBe('October 25, 2026');
  });
  it('returns an unparsable value as is', () => {
    expect(longDate('not a date', 'uk')).toBe('not a date');
  });
  it('is the only long-date Intl call in src (A-15)', () => {
    const files = ['src/components/ArticleRow.tsx', 'src/data/refresh.ts', 'src/components/ArticleView.tsx', 'src/components/CommentsBlock.tsx', 'src/pages/MonasteryCard.tsx'];
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toMatch(/month: 'long', year: 'numeric'/);
  });
});

// F1 (REVIEW cloud_24, A-79 3): the site's date is the site's day - Kyiv time whatever the device's zone. Red on 1.0.3 under TZ=UTC:
// 1832 `2026-05-23T21:00:00Z` printed «23 травня» on the emulator, in CI and for a reader abroad; the site prints 24.05.2026.
describe('site dates in Kyiv time (F1)', () => {
  const at1832 = '2026-05-23T21:00:00Z';
  it('1832 = 24 May in all three languages, in every device zone', () => {
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/Kiev']) {
      const saved = process.env.TZ;
      process.env.TZ = tz;
      try {
        expect(longDate(at1832, 'uk')).toBe('24 травня 2026\u00a0р.');
        expect(longDate(at1832, 'ru')).toBe('24 мая 2026\u00a0г.');
        expect(longDate(at1832, 'en')).toBe('May 24, 2026');
      } finally { process.env.TZ = saved; }
    }
  });
  it('the device zone only when asked (the refresh line, the device\'s own clock)', async () => {
    const { DEVICE_TZ } = await import('@/i18n/date');
    expect(DEVICE_TZ).toBeUndefined();
    expect(longDate(at1832, 'en', 'UTC')).toBe('May 23, 2026');
  });
  it('no site-date caller overrides the zone (only refresh.ts passes DEVICE_TZ)', () => {
    const callers = ['src/components/ArticleRow.tsx', 'src/components/ArticleView.tsx', 'src/components/CommentsBlock.tsx', 'src/pages/MonasteryCard.tsx'];
    for (const f of callers) expect(readFileSync(f, 'utf8')).toMatch(/longDate\([^,()]+(\([^)]*\))?[^,()]*, lang\)/);
    expect(readFileSync('src/data/refresh.ts', 'utf8')).toMatch(/longDate\(d, lang, DEVICE_TZ\)/);
  });
});
