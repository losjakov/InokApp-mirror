/**
 * cloud_37 (A-121): THE remote hand of the iOS simulator ring - built ONLY into the simulator's Debug bundle (`VITE_SIM_DRIVER=1`, the
 * `simulator` job of .github/workflows/ios.yml; the store / TestFlight bundle never carries it: main.tsx imports it behind that flag and
 * Vite drops the branch). The simulator shares the Mac's network, so the page asks scripts/ios_relay.mjs at http://localhost:8765 for the
 * next expression of scripts/emu_nav.mjs (the SAME commands the Android emulator runs through DevTools: go, click, wait, check, do),
 * evaluates it here (promises awaited) and posts the value back - Safari's inspector socket is not reachable from a CI script.
 */
export const RELAY = 'http://localhost:8765';

/** the value as DevTools' `returnByValue` gives it: JSON-able as it is, anything else as its text */
export function byValue(v: unknown): unknown {
  if (v === undefined) return null;
  try { JSON.stringify(v); return v; } catch { return String(v); }
}

export function startSimDriver(base = RELAY): void {
  const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  const loop = async () => {
    for (;;) {
      try {
        const r = await fetch(`${base}/next`, { cache: 'no-store' }); // the relay holds it up to 15 s, then 204
        if (r.status !== 200) continue;
        const { id, expr } = (await r.json()) as { id: number; expr: string };
        let value: unknown;
        try { value = byValue(await (0, eval)(expr)); } catch (e) { value = `ERROR ${String(e)}`; }
        // text/plain: a «simple» request, no CORS preflight
        await fetch(`${base}/result?id=${id}`, { method: 'POST', body: JSON.stringify({ value }) });
      } catch {
        await pause(1000); // no relay (yet): ask again
      }
    }
  };
  console.log(`InokSimDriver: polling ${base}`);
  void loop();
}
