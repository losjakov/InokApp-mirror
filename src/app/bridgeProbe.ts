/**
 * D22 (cloud_09): measures every Capacitor bridge crossing on the device — bytes JS → native (the call's options) and native → JS
 * (the result, delivered on the Android UI thread, the thread that draws the WebView) — per plugin.method. Only in the emulator's
 * build (`VITE_BRIDGE_PROBE=1`); logs one line per result over 32 KB at once and a table at 10 s / 30 s / 60 s («InokBridge:» lines).
 */
type Stat = { n: number; out: number; in: number; maxIn: number };
type Bridge = { onmessage: ((ev: MessageEvent) => void) | null };
type Cap = { toNative?: (p: string, m: string, o: unknown, cb: unknown) => unknown };

export function installBridgeProbe(): void {
  const w = window as unknown as { Capacitor?: Cap; androidBridge?: Bridge };
  const cap = w.Capacitor; const ab = w.androidBridge;
  if (!cap?.toNative || !ab) return;
  const t0 = performance.now();
  const stats = new Map<string, Stat>();
  const stat = (k: string) => { let s = stats.get(k); if (!s) stats.set(k, (s = { n: 0, out: 0, in: 0, maxIn: 0 })); return s; };
  const toNative = cap.toNative.bind(cap);
  cap.toNative = (p, m, o, cb) => {
    const s = stat(`${p}.${m}`); s.n++; s.out += JSON.stringify(o ?? {}).length;
    return toNative(p, m, o, cb);
  };
  // results arrive as a WebMessage on androidBridge; wrap the handler once Capacitor has set it
  const wrap = () => {
    const orig = ab.onmessage;
    if (!orig) return void setTimeout(wrap, 50);
    ab.onmessage = function (ev: MessageEvent) {
      const len = typeof ev.data === 'string' ? ev.data.length : 0;
      const head = typeof ev.data === 'string' ? ev.data.slice(0, 400) : '';
      const k = `${/"pluginId":"([^"]+)"/.exec(head)?.[1] ?? '?'}.${/"methodName":"([^"]+)"/.exec(head)?.[1] ?? '?'}`;
      const s = stat(k); s.in += len; s.maxIn = Math.max(s.maxIn, len);
      const t = performance.now();
      orig.call(this, ev);
      if (len > 32_768) console.info(`InokBridge: big ${k} ${len}b handled ${Math.round(performance.now() - t)}ms at +${Math.round(t - t0)}ms`);
    };
  };
  wrap();
  const dump = (label: string) => {
    const rows = [...stats.entries()].sort((a, b) => b[1].in + b[1].out - a[1].in - a[1].out).slice(0, 15);
    console.info(`InokBridge: table ${label} ${rows.map(([k, s]) => `${k} n=${s.n} out=${s.out} in=${s.in} max=${s.maxIn}`).join(' | ')}`);
  };
  for (const s of [10, 30, 60]) setTimeout(() => dump(`${s}s`), s * 1000);
}
