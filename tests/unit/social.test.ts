import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOCIAL_LINKS } from '@/data/links/social';
import uk from '@/i18n/uk.json';
import ru from '@/i18n/ru.json';
import en from '@/i18n/en.json';

const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : []; });

/** A-120 (1): «У соціальних мережах» - the owner's three addresses in his order, written ONCE (A-15), the block on both «Ще» screens */
describe('social block (A-120 1)', () => {
  it('the three addresses, the networks\' own names, in the owner\'s order', () => {
    expect(SOCIAL_LINKS.map((s) => [s.id, s.name, s.url])).toEqual([
      ['telegram', 'Telegram', 'https://t.me/inokinfo'],
      ['facebook', 'Facebook', 'https://www.facebook.com/inok.info'],
      ['instagram', 'Instagram', 'https://www.instagram.com/inok.info/'],
    ]);
    for (const s of SOCIAL_LINKS) expect(s.icon, s.id).toMatch(/^data:image\/svg\+xml/);
  });
  it('each address is written in ONE file of src/ (A-15)', () => {
    const src = files('src').map((f) => [f, readFileSync(f, 'utf8')] as const);
    for (const host of ['t.me/inokinfo', 'facebook.com/inok.info', 'instagram.com/inok.info']) {
      expect(src.filter(([, s]) => s.includes(host)).map(([f]) => f), host).toEqual([join('src', 'data', 'links', 'social.ts')]);
    }
  });
  it('one component on «Про комісію», «Про застосунок», «Контакти» (A-126) and «Головна» (A-128), after the content (Commission, Contacts: right above the share strip; Home: under the two blocks, the «checked» line last)', () => {
    const com = readFileSync('src/pages/Commission.tsx', 'utf8'); const about = readFileSync('src/pages/About.tsx', 'utf8');
    expect(com).toMatch(/<SocialLinks \/>\s*<ShareFooter/);
    expect(about).toMatch(/<\/IonList>\s*<SocialLinks \/>\s*<\/IonContent>/);
    expect(readFileSync('src/pages/Contacts.tsx', 'utf8')).toMatch(/\{c && <SocialLinks \/>\}\s*\{c && <ShareFooter/);
    expect(readFileSync('src/pages/Home.tsx', 'utf8')).toMatch(/testId="home-popular" \/>\}\s*<\/IonList>\s*<SocialLinks \/>\s*<IonList className="home__list home__list--end">\s*<IonItem[^\n]*data-testid="home-fresh"/);
    expect(files('src').filter((f) => readFileSync(f, 'utf8').includes('<SocialLinks')).sort()).toEqual([join('src', 'pages', 'About.tsx'), join('src', 'pages', 'Commission.tsx'), join('src', 'pages', 'Contacts.tsx'), join('src', 'pages', 'Home.tsx')]);
  });
  it('the heading in three languages', () => {
    expect([uk, ru, en].map((d) => (d as Record<string, string>)['social.title'])).toEqual(['У соціальних мережах', 'В социальных сетях', 'On social media']);
  });
});
