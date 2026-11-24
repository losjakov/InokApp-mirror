import { apiFetch, ApiError } from '@/data/api/client';
import { isNative, platform } from '@/native/platform';
import { APP_VERSION, versionCode } from './version';
import { deviceFacts } from './device';

/**
 * A-181 (cloud_46, contract R-65): THE automatic anonymous error report. Every crash the error screen shows (crash.tsx) - and a map GL
 * failure that no longer shows it (A-182) - sends ONE fire-and-forget `POST error-report` with exactly these keys: no install id, no user
 * text, no coordinates. At most once per code per app version per day; while offline up to 5 wait and go at the next start; ANY answer
 * that is not 2xx (the site half may be live after this build: 404) is dropped silently - never a retry storm, never a delay of the screen.
 * Incognito does NOT stop it (his choice, A-181). The browser build (screens, dev) sends nothing unless `inok.errreport` = 'on' (a test seam).
 */
export interface ErrorFacts { code: string; line: string; where: string; at: string }
/** A-183 (6): only on a map GL failure - the device's WebGL VERSION + RENDERER (≤ 120) or «none» */
export interface ReportExtra { gl?: string }
export interface AutoReport {
  kind: 'auto'; code: string; line: string; where: string; app_version: string; build: number;
  platform: 'ios' | 'android'; os_version: string; model: string; lang: string; at: string; gl?: string;
}
const SENT = 'inok.errsent';
const QUEUE = 'inok.errqueue';
export const QUEUE_MAX = 5;

const read = <T>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off: nothing kept */ } };
const enabled = () => { if (isNative()) return true; try { return localStorage.getItem('inok.errreport') === 'on'; } catch { return false; } };
const lang = (): string => (document.documentElement.lang || 'uk').slice(0, 2);
const plat = (): 'ios' | 'android' => (platform() === 'ios' ? 'ios' : 'android');

/** the report of one error - the contract's keys and caps, nothing else */
export async function reportOf(e: ErrorFacts, x: ReportExtra = {}): Promise<AutoReport> {
  const d = await deviceFacts();
  return { kind: 'auto', code: e.code, line: e.line.slice(0, 160), where: e.where.slice(0, 80), app_version: APP_VERSION, build: versionCode(),
    platform: plat(), os_version: d.os_version, model: d.model.slice(0, 40), lang: lang(), at: e.at, ...(x.gl !== undefined ? { gl: x.gl.slice(0, 120) } : {}) };
}

/** once per code per app version per (UTC) day: true = this one goes (and is marked) */
function firstToday(code: string, at: string): boolean {
  const k = `${code}|${APP_VERSION}`; const day = at.slice(0, 10);
  const seen = read<Record<string, string>>(SENT, {});
  if (seen[k] === day) return false;
  for (const [key, d] of Object.entries(seen)) if (d !== day) delete seen[key]; // yesterday's marks never pile up
  seen[k] = day; write(SENT, seen);
  return true;
}

/** one POST: 'sent' (2xx), 'dropped' (any answer that is not 2xx), 'offline' (no answer at all - the network) */
async function post(r: AutoReport): Promise<'sent' | 'dropped' | 'offline'> {
  try { await apiFetch('error-report', { method: 'POST', body: r, once: true }); return 'sent'; }
  catch (e) { return e instanceof ApiError ? 'dropped' : 'offline'; }
}
const enqueue = (r: AutoReport) => write(QUEUE, [...read<AutoReport[]>(QUEUE, []), r].slice(-QUEUE_MAX));

/** THE call of every error path (crash.tsx): fire and forget */
export function sendAuto(e: ErrorFacts, x: ReportExtra = {}): void {
  if (!enabled() || !firstToday(e.code, e.at)) return;
  void reportOf(e, x).then(async (r) => { if ((await post(r)) === 'offline') enqueue(r); }).catch(() => undefined);
}

/** at start (main.tsx): the reports kept while offline, oldest first; one that still finds no network stays for the next start */
export async function flushReports(): Promise<void> {
  if (!enabled()) return;
  const q = read<AutoReport[]>(QUEUE, []);
  if (!q.length) return;
  write(QUEUE, []);
  const left: AutoReport[] = [];
  for (const r of q) if ((await post(r)) === 'offline') left.push(r);
  if (left.length) write(QUEUE, [...left, ...read<AutoReport[]>(QUEUE, [])].slice(-QUEUE_MAX));
}

/** A-181 (2): the text of «Надіслати розробнику» - plain lines, ≤ 1000 characters (the site's form gets it prefilled) */
export async function reportText(e: ErrorFacts, codeLine: string): Promise<string> {
  const d = await deviceFacts();
  return [
    codeLine, // the screen's own «Код: …» line (i18n data.fail_code)
    [e.line, e.where].filter(Boolean).join(' · '),
    `inok.info ${APP_VERSION} (${versionCode()})`,
    `${plat() === 'ios' ? 'iOS' : 'Android'} ${d.os_version}`.trim(),
    d.model,
  ].filter(Boolean).join('\n').slice(0, 1000);
}
/** the site's feedback form, prefilled (InokSite ruling 425 (3)); the text in the FRAGMENT (never sent to the server, never cached by it) */
export const reportUrl = (text: string, l: string): string => `https://inok.info/app/?lang=${l}#report=${encodeURIComponent(text)}`;
