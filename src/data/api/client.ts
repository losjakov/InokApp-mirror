import { CapacitorHttp } from '@capacitor/core';
import { APP_VERSION } from '@/app/version';
import { isNative, platform } from '@/native/platform';
import { timeoutSignal } from './timeout';

/** Contract §1: base URL, public app key (not a secret), User-Agent, backoff on 429 / 5xx (max 3 retries). */
export const SITE_URL = 'https://inok.info/';
/** The site's hosts (www answers 301 to the bare host) - THE test «is this address inok.info» (router, `siteUrl`). */
export const SITE_HOSTS: ReadonlySet<string> = new Set([new URL(SITE_URL).host, `www.${new URL(SITE_URL).host}`]);
export const API_BASE = `${SITE_URL}api/app/v1/`;
export const APP_KEY = 'eb741a6e64315c8aff6281ad13c21378';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    /** the parsed JSON error body (e.g. 409 `already` carries the rating) */
    public body?: Record<string, unknown>,
  ) {
    super(message ?? `${status} ${code}`);
  }
}

export interface FetchOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

const TIMEOUT_MS = 30000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const userAgent = () => `InokApp/${APP_VERSION} (${platform()})`;

function baseHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'X-Inok-App': APP_KEY, Accept: 'application/json, application/gzip' };
  if (isNative()) h['User-Agent'] = userAgent(); // contract §1; the browser forbids this header, CapacitorHttp passes it
  return h;
}

/** D72: the hoster's protection page («Захищена сторінка», HTML) or any non-JSON answer where JSON was due = the server is busy: the
 *  caller keeps its cache; never a crash, never parsed as data. ONE code for every route of this client. */
export const SERVER_BUSY = 'server_busy';
export const isServerBusy = (e: unknown): boolean => e instanceof ApiError && e.code === SERVER_BUSY;
const looksHtml = (s: string) => /^\s*</.test(s);
const busy = (status: number) => new ApiError(status, SERVER_BUSY);

const retryable = (status: number) => status === 429 || status >= 500;
/** A 503 that is the server's switch, not a busy server (contract §3: `rating_closed`, `vote_closed`) — asking again changes nothing. */
const FINAL = new Set(['rating_closed', 'vote_closed']);
const final = async (res: Response): Promise<boolean> => {
  try { return FINAL.has(((await res.clone().json()) as { error?: string }).error ?? ''); } catch { return false; }
};

export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : API_BASE + path;
  const headers = baseHeaders();
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal ?? timeoutSignal(TIMEOUT_MS),
      credentials: 'omit',
    });
    if (res.ok) {
      if (/html/i.test(res.headers.get('content-type') ?? '')) throw busy(res.status); // D72: a page, not the API's answer
      return res;
    }
    if (retryable(res.status) && attempt < 3 && !(await final(res))) {
      attempt++;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    let code = 'http_' + res.status;
    let message: string | undefined;
    let body: Record<string, unknown> | undefined;
    const text = await res.text().catch(() => '');
    try {
      body = JSON.parse(text);
      code = (body?.error as string) ?? code;
      message = body?.message as string | undefined;
    } catch {
      if (looksHtml(text)) code = SERVER_BUSY; // D72: the hoster's page with an error status
    }
    throw new ApiError(res.status, code, message, body);
  }
}

/** D72: the ONE reading of a JSON answer (live client and fixtures alike): a page or any non-JSON body = «server busy». */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try { return JSON.parse(text) as T; } catch { throw busy(res.status); } // the native bridge may drop the content type
}

export async function apiJson<T>(path: string, opts?: FetchOptions): Promise<T> {
  return readJson<T>(await apiFetch(path, opts));
}

/**
 * Binary GET (the export .gz). On the device the patched fetch of CapacitorHttp returns non-JSON bodies as TEXT
 * (native-bridge sends no responseType), which corrupts gzip bytes — so the native path asks CapacitorHttp directly
 * for an arraybuffer (base64) and decodes it. The browser/Node path is a plain fetch.
 */
export async function apiBytes(path: string): Promise<Uint8Array> {
  const url = path.startsWith('http') ? path : API_BASE + path;
  if (!isNative()) {
    const res = await apiFetch(url);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0x3c) throw busy(res.status); // D72: «<» = a page, not gzip (1f 8b)
    return bytes;
  }
  let attempt = 0;
  for (;;) {
    const r = await CapacitorHttp.request({
      url,
      method: 'GET',
      headers: baseHeaders(),
      responseType: 'arraybuffer',
      connectTimeout: TIMEOUT_MS,
      readTimeout: TIMEOUT_MS,
    });
    if (r.status >= 200 && r.status < 300) {
      const bytes = base64ToBytes(String(r.data));
      if (bytes[0] === 0x3c || /html/i.test(headerOf(r.headers, 'content-type'))) throw busy(r.status); // D72: «<» = a page, not gzip (1f 8b)
      return bytes;
    }
    if (retryable(r.status) && attempt < 3) {
      attempt++;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    throw new ApiError(r.status, typeof r.data === 'object' && r.data?.error ? r.data.error : typeof r.data === 'string' && looksHtml(r.data) ? SERVER_BUSY : 'http_' + r.status);
  }
}

const headerOf = (h: Record<string, string> | undefined, name: string): string =>
  Object.entries(h ?? {}).find(([k]) => k.toLowerCase() === name)?.[1] ?? '';

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]*,/, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
