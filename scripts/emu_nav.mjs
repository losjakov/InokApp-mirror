// emu_nav.mjs — reads and drives the app's WebView on the Actions emulator through the DevTools protocol (a debug build's WebView
// is debuggable). Used by scripts/emulator_smoke.sh for the A-27 tab scenarios: the TAB BUTTONS are real `adb input tap`s; this
// script only clicks elements INSIDE a page (by CSS, on the screen on top) and reads / waits for the in-app URL.
//   node scripts/emu_nav.mjs url                 → prints pathname+search
//   node scripts/emu_nav.mjs click '<css>'       → clicks the first match on the page on top (scrolled into view)
//   node scripts/emu_nav.mjs expect '<regex>'    → waits ≤ 10 s for the URL to match; exit 1 (and prints the URL) if not
//   node scripts/emu_nav.mjs go '<path>'         → the in-app router goes to the path (pushState + popstate: the router's own listener)
//   node scripts/emu_nav.mjs scroll '<css>'      → scrolls the last match on the page on top to the viewport's top
//   node scripts/emu_nav.mjs wait '<css>'        → waits ≤ 15 s for a match on the page on top (no scrolling); exit 1 if none
//   node scripts/emu_nav.mjs eval '<js>'         → evaluates an expression in the page (promises awaited), prints its value; exit 1 on 'none'
//   node scripts/emu_nav.mjs check <name>        → prints the value of THE read-back <name> of scripts/store_checks.mjs (lang | theme | dialog | units)
//   node scripts/emu_nav.mjs do <name>           → runs THE store-frame action <name> of scripts/store_checks.mjs (fitLavras | showSelected); exit 1 unless 'ok'
//   node scripts/emu_nav.mjs drawn               → D61: waits ≤ 30 s until EVERY map on the page on top says `data-drawn="1"` (MapLibre `idle`)
//                                                  and still says so 1 s later (a re-fit after the first frame moves it again); no map = ok
// Node ≥ 22 (global fetch + WebSocket); the socket is forwarded once to tcp:9222.
import { execSync } from 'node:child_process';
import { ACTIONS, CHECKS } from './store_checks.mjs';

const [cmd, arg] = process.argv.slice(2);
const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();

async function target() {
  for (let i = 0; i < 10; i++) {
    // cloud_27 (run 43020831781, API 35 as root): /proc/net/unix lists EVERY process's DevTools socket - the first one was not ours, so
    // take the socket of the app's own process (pidof), else the first as before
    const pid = sh("adb shell pidof info.inok.app || true").split(/\s+/)[0];
    const all = sh("adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | sort -u || true").split(/\s+/).filter(Boolean);
    // cloud_29: a Play Store image has no root; if /proc/net/unix lists nothing, the app's socket is still named by its pid
    const sock = (pid && all.find((x) => x === `webview_devtools_remote_${pid}`)) || all[0] || (pid ? `webview_devtools_remote_${pid}` : '');
    if (sock) {
      sh(`adb forward tcp:9222 localabstract:${sock}`);
      // a socket that never answers must not hang the smoke (cloud_27: undici's 300 s headers timeout x every nav = the 80 min job limit)
      const pages = await fetch('http://127.0.0.1:9222/json', { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => []);
      const page = pages.find((p) => p.type === 'page' && p.url.startsWith('https://localhost'));
      if (page) return page.webSocketDebuggerUrl;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('no debuggable WebView page');
}

// cloud_37 (A-121): the iOS simulator has no DevTools socket a CI script can reach - INOK_NAV_RELAY names scripts/ios_relay.mjs, which hands
// the SAME expression to the app's simulator bundle (src/app/simDriver.ts) and returns its value; every command below works unchanged
const RELAY = process.env.INOK_NAV_RELAY;
async function evaluate(expression) {
  if (RELAY) {
    const r = await fetch(`${RELAY}/eval`, { method: 'POST', body: expression, signal: AbortSignal.timeout(95_000) });
    if (!r.ok) throw new Error(`relay ${r.status}: ${await r.text()}`);
    return (await r.json()).value;
  }
  const ws = new WebSocket(await target());
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  const res = await new Promise((ok) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) ok(d.result); };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });
  ws.close();
  return res?.result?.value;
}

const URL_JS = 'location.pathname.replace(/\\/$/, "") + location.search';
// the page on top = the last shown `.ion-page` that holds a match (Ionic keeps the screen below in the DOM); `act` runs on `els`
const ON_TOP_JS = (css, act) => `(() => {
  const els = Array.from(document.querySelectorAll(${JSON.stringify(css)})).filter((e) => {
    const pg = e.closest('.ion-page'); return e.getClientRects().length > 0 && pg && !pg.classList.contains('ion-page-hidden'); });
  if (!els.length) return 'none';
  ${act}; return 'ok';
})()`;
const CLICK_JS = (css) => ON_TOP_JS(css, "const top = els[els.length - 1].closest('.ion-page'); const el = els.find((e) => e.closest('.ion-page') === top); el.scrollIntoView({ block: 'center' }); el.click()");

if (cmd === 'url') console.log(await evaluate(URL_JS));
// a POP with a fresh history-v4 key: without a key Ionic's router reads every other POP as «back» (measured: 4 of 8 jumps stayed put)
else if (cmd === 'go') console.log(`go ${arg}: ${await evaluate(`(() => { const st = { key: Math.random().toString(36).slice(2, 8) };
  history.pushState(st, '', ${JSON.stringify(arg)}); dispatchEvent(new PopStateEvent('popstate', { state: st })); return 'ok'; })()`)}`);
else if (cmd === 'scroll') {
  const r = await evaluate(ON_TOP_JS(arg, "els[els.length - 1].scrollIntoView({ block: 'start' })"));
  console.log(`scroll ${arg}: ${r}`);
  if (r !== 'ok') process.exit(1);
}
else if (cmd === 'wait') {
  for (let i = 0; i < 30; i++) { if (await evaluate(ON_TOP_JS(arg, '')) === 'ok') { console.log(`wait ${arg}: ok`); process.exit(0); } await new Promise((r) => setTimeout(r, 500)); }
  console.log(`wait ${arg}: none`); process.exit(1);
}
else if (cmd === 'drawn') {
  const DRAWN_JS = `(() => { const maps = Array.from(document.querySelectorAll('.maplibregl-map')).filter((e) => {
    const pg = e.closest('.ion-page'); return e.getClientRects().length > 0 && pg && !pg.classList.contains('ion-page-hidden'); });
    return maps.length === 0 ? 'none' : maps.every((e) => e.dataset.drawn === '1') ? 'drawn' : 'drawing'; })()`;
  let r = '', ok = 0;
  for (let i = 0; i < 60 && ok < 3; i++) { r = await evaluate(DRAWN_JS); ok = r === 'drawing' ? 0 : ok + 1; if (ok < 3) await new Promise((res) => setTimeout(res, 500)); }
  console.log(`drawn: ${r}`);
  if (ok < 3) process.exit(1);
}
else if (cmd === 'check') {
  if (!CHECKS[arg]) { console.error(`unknown check ${arg}`); process.exit(2); }
  console.log(String(await evaluate(CHECKS[arg])));
}
else if (cmd === 'do') {
  const r = String(await evaluate(ACTIONS[arg]));
  console.log(`do ${arg}: ${r}`);
  if (r !== 'ok') process.exit(1);
}
else if (cmd === 'eval') {
  const r = await evaluate(arg);
  console.log(`eval: ${typeof r === 'string' ? r : JSON.stringify(r)}`);
  if (r === 'none') process.exit(1);
}
else if (cmd === 'click') {
  const r = await evaluate(CLICK_JS(arg));
  console.log(`click ${arg}: ${r}`);
  if (r !== 'ok') process.exit(1);
} else if (cmd === 'expect') {
  const re = new RegExp(arg); let u = '';
  for (let i = 0; i < 20; i++) { u = await evaluate(URL_JS); if (re.test(u)) { console.log(`url ${u} ~ ${arg}: ok`); process.exit(0); } await new Promise((r) => setTimeout(r, 500)); }
  console.log(`url ${u} !~ ${arg}: FAIL`); process.exit(1);
} else { console.error('usage: url | go <path> | click <css> | scroll <css> | wait <css> | eval <js> | check <name> | do <name> | drawn | expect <regex>'); process.exit(2); }
