import { describe, expect, it } from 'vitest';
import { renderErrorPage } from '@/i18n/errorPage';
import { ENGINE_FLOOR, ENGINE_UPDATE_URLS } from '@/app/engineFloor';
import uk from '@/i18n/uk.json';
import ru from '@/i18n/ru.json';
import en from '@/i18n/en.json';

describe('error.html for an engine below the floor (A-46)', () => {
  const html = renderErrorPage();
  it('carries the first-run engine texts of all three languages (one source) and both Play links', () => {
    for (const d of [uk, ru, en]) {
      expect(html).toContain(JSON.stringify(d['data.fail_engine_title']).slice(1, -1));
      expect(html).toContain(d['data.update_webview']);
      expect(html).toContain(d['data.update_chrome']);
    }
    expect(html).toContain(ENGINE_UPDATE_URLS.webview);
    expect(html).toContain(ENGINE_UPDATE_URLS.chrome);
    expect(html).toContain(`need='${ENGINE_FLOOR}'`);
  });
  it('is ES5-only (must run on a 2017 WebView, Chrome < 60)', () => {
    const script = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
    expect(script).not.toMatch(/=>|\bconst\b|\blet\b|`|\?\.|\?\?/);
  });
});
