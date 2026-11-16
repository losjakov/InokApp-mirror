// ios_relay.mjs - cloud_37 (A-121): the iOS simulator ring's go-between. The app's simulator bundle (src/app/simDriver.ts) polls GET /next and
// posts POST /result?id=; scripts/emu_nav.mjs (INOK_NAV_RELAY=http://localhost:8765) posts an expression to POST /eval and gets its value -
// so the Android commands (go, click, wait, check, do, drawn) drive the iOS app unchanged (A-15). GET /health = when the app last polled.
//   node scripts/ios_relay.mjs [port]      (runs until killed; 127.0.0.1 only)
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 8765);
const queue = []; // { id, expr }
const waiting = new Map(); // id -> resolve(value)
let next = 1; let polled = 0; let poller = null;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => ok(b)); });
const send = (res, code, json) => { res.writeHead(code, { ...CORS, 'Content-Type': 'application/json' }); res.end(json === undefined ? '' : JSON.stringify(json)); };
function hand(res) { const job = queue.shift(); send(res, 200, job); }

createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'GET' && u.pathname === '/next') {
    polled = Date.now();
    if (queue.length) return hand(res);
    if (poller) send(poller.res, 204); // one poller at a time (a reloaded page): the newest one waits
    const timer = setTimeout(() => { if (poller?.res === res) poller = null; send(res, 204); }, 15_000);
    poller = { res, timer };
    req.on('close', () => { if (poller?.res === res) { clearTimeout(timer); poller = null; } });
    return;
  }
  if (req.method === 'POST' && u.pathname === '/result') {
    const id = Number(u.searchParams.get('id')); const raw = await body(req);
    let value = null; try { value = JSON.parse(raw).value; } catch { value = `ERROR bad result ${raw.slice(0, 80)}`; }
    waiting.get(id)?.(value); waiting.delete(id);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && u.pathname === '/eval') {
    const expr = await body(req); const id = next++;
    const got = new Promise((ok) => waiting.set(id, ok));
    queue.push({ id, expr });
    if (poller) { clearTimeout(poller.timer); const p = poller; poller = null; p.res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' }); p.res.end(JSON.stringify(queue.shift())); }
    const t = setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); send(res, 504, { error: 'the app did not answer in 90 s' }); } }, 90_000);
    const value = await got; clearTimeout(t);
    return send(res, 200, { value });
  }
  if (u.pathname === '/health') return send(res, 200, { polled, ago: polled ? Date.now() - polled : null });
  send(res, 404, { error: 'no such path' });
}).listen(PORT, '127.0.0.1', () => console.log(`ios relay on 127.0.0.1:${PORT}`));
