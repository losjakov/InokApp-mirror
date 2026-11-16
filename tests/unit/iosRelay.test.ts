import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** cloud_37 (A-121): the iOS ring's relay (scripts/ios_relay.mjs) - a page polls, emu_nav posts; it must survive a page that polls twice
 *  (a reload) past the 15-s hold: ios run 3 died there (ERR_HTTP_HEADERS_SENT) and the app lost its remote hand mid-walk. */
const PORT = 18765;
const base = `http://127.0.0.1:${PORT}`;
let relay: ChildProcess;
beforeAll(async () => {
  relay = spawn(process.execPath, ['scripts/ios_relay.mjs', String(PORT)], { stdio: 'pipe' });
  await new Promise<void>((ok) => relay.stdout!.on('data', () => ok()));
});
afterAll(() => { relay.kill(); });

describe('ios_relay', () => {
  it('a replaced poller is answered once; the relay lives past its hold; an eval reaches the newest poller and comes back', async () => {
    const first = fetch(`${base}/next`).then((r) => r.status);
    await new Promise((ok) => setTimeout(ok, 100));
    const second = fetch(`${base}/next`).then((r) => r.status);
    expect(await first).toBe(204); // replaced
    expect(await second).toBe(204); // its own 15-s hold
    await new Promise((ok) => setTimeout(ok, 15_500)); // the first one's timer would have fired here (the old relay died)
    expect(relay.exitCode).toBeNull();
    const poll = fetch(`${base}/next`).then((r) => r.json() as Promise<{ id: number; expr: string }>);
    const value = fetch(`${base}/eval`, { method: 'POST', body: '1 + 1' }).then((r) => r.json());
    const job = await poll;
    expect(job.expr).toBe('1 + 1');
    await fetch(`${base}/result?id=${job.id}`, { method: 'POST', body: JSON.stringify({ value: 2 }) });
    expect(await value).toEqual({ value: 2 });
  }, 40_000);
});
