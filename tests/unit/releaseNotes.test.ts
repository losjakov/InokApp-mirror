import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '@/app/version';

// REF_app_release §3.3: every version has its Play «Що нового» - uk (the original), ru, en, each <= 500 characters (Play's limit)
describe('release notes', () => {
  it(`store/release_notes/${APP_VERSION}.md: uk / ru / en, each 1..500 characters`, () => {
    const p = new URL(`../../store/release_notes/${APP_VERSION}.md`, import.meta.url);
    expect(existsSync(p), `notes for ${APP_VERSION}`).toBe(true);
    const s = readFileSync(p, 'utf8');
    for (const l of ['uk', 'ru', 'en']) {
      const m = new RegExp(`## ${l}\\n([\\s\\S]*?)(?=\\n## |\\n# |$)`).exec(s);
      const body = (m?.[1] ?? '').trim();
      expect(body.length, `${l}: ${body.length} chars`).toBeGreaterThan(0);
      expect([...body].length, `${l}: ${[...body].length} chars`).toBeLessThanOrEqual(500);
    }
  });
});
