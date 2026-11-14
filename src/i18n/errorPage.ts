import uk from './uk.json';
import ru from './ru.json';
import en from './en.json';
import { ENGINE_FLOOR, ENGINE_UPDATE_URLS } from '../app/engineFloor'; // relative: vite.config.ts loads this file

/**
 * The static page Capacitor shows instead of the app when the engine (Android System WebView, or Chrome on Android 7-9)
 * is older than `android.minWebViewVersion` = ENGINE_FLOOR (capacitor.config.ts → `server.errorPath`). It MUST run on a
 * 2017 WebView: plain HTML, ES5 only (no arrow functions, const/let, template strings), no Ionic, no Capacitor plugins.
 * A-46 / A-15: the SAME texts as the first-run screen's `engine` cause (`data.fail_engine_*`, `data.update_*`); the
 * language follows navigator.language → uk; the engine version is read from the user agent.
 */
type Key = 'data.fail_engine_title' | 'data.fail_engine_text' | 'data.update_webview' | 'data.update_chrome';

export function renderErrorPage(): string {
  const texts = { uk, ru, en } as const;
  const pick = (k: Key) => JSON.stringify({ uk: texts.uk[k], ru: texts.ru[k], en: texts.en[k] });
  const fill = (s: string, have: string) => s.split('{have}').join(have).split('{need}').join(String(ENGINE_FLOOR));
  return `<!doctype html>
<html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${texts.uk['data.fail_engine_title']}</title>
<style>
body{margin:0;padding:32px 24px;font-family:Roboto,sans-serif;font-size:17px;line-height:1.45;color:#1c1c1e;background:#fff}
h1{font-size:22px;margin:0 0 16px}
p{margin:0 0 24px}
a{display:block;margin:0 0 12px;padding:14px 20px;border-radius:12px;background:#5b3a1c;color:#fff;text-align:center;text-decoration:none;font-weight:600}
a.o{background:transparent;color:#5b3a1c;border:2px solid #5b3a1c}
@media (prefers-color-scheme:dark){body{color:#f2f2f2;background:#121212}a{background:#c69a63;color:#1c1c1e}a.o{background:transparent;color:#c69a63;border-color:#c69a63}}
</style></head>
<body>
<h1 id="t">${texts.uk['data.fail_engine_title']}</h1>
<p id="b">${fill(texts.uk['data.fail_engine_text'], '?')}</p>
<a id="w" href="${ENGINE_UPDATE_URLS.webview}">${texts.uk['data.update_webview']}</a>
<a id="c" class="o" href="${ENGINE_UPDATE_URLS.chrome}">${texts.uk['data.update_chrome']}</a>
<script>
(function(){
  var T=${pick('data.fail_engine_title')},B=${pick('data.fail_engine_text')},W=${pick('data.update_webview')},C=${pick('data.update_chrome')};
  var m=/Chrome\\/(\\d+)\\./.exec(navigator.userAgent||''),have=m?m[1]:'?',need='${ENGINE_FLOOR}';
  var tag=(navigator.language||'').toLowerCase().split(/[-_]/)[0];
  var lang=(tag==='ru'||tag==='en')?tag:'uk';
  document.documentElement.lang=lang;
  document.getElementById('t').textContent=T[lang];
  document.getElementById('b').textContent=B[lang].split('{have}').join(have).split('{need}').join(need);
  document.getElementById('w').textContent=W[lang];
  document.getElementById('c').textContent=C[lang];
})();
</script>
</body></html>
`;
}
