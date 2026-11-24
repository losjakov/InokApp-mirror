import { Component, type ReactNode } from 'react';
import { warningOutline } from 'ionicons/icons';
import { defineCustomElement as defineIonIcon } from 'ionicons/components/ion-icon.js';
import { langFromTag, LANGS, makeT, type Lang } from '@/i18n';
import { isUserCancel } from './userCancel';
import { isMapGlFailure, routeMapGlFailure } from './mapGlFailure';
import { flushReports, reportText, reportUrl, sendAuto } from './errorReport';
import { copyText, openLink } from '@/native/intents';
import { online } from '@/native/network';
import { glInfo } from '@/data/map/webgl';

/**
 * A-48 (a): the app NEVER dies white. ONE place for every fatal path of the page:
 *  - a render error (React unmounts the whole tree without a boundary)  -> `CrashBoundary`  -> code R-…
 *  - an uncaught exception (window `error` with an Error object)         -> `installCrashGuard` -> code E-…
 *  - an unhandled promise rejection                                       -> `installCrashGuard` -> code P-…
 *  - the WebView renderer process gone (Android, MainActivity.RenderGuard recreates the activity and calls
 *    `window.inokNativeCrash`)                                             -> code RPG-CRASH / RPG-KILLED
 * Each shows THE error screen (plain DOM - it must work when React itself is down; the first-run screen's classes): the cause title,
 * a short code AND the error's first line + where it was thrown (for a photo), «Спробувати ще раз». The first crash is kept in
 * localStorage and shown again at the next launch (the tester may close the app before photographing it); «Спробувати ще раз» clears it.
 * Window `error` events WITHOUT an Error object (ResizeObserver loop notices, cross-origin «Script error.») are not crashes.
 */
export interface Crash { code: string; line: string; where: string; at: string }
const KEY = 'inok.crash';
const SRC = { render: 'R', error: 'E', promise: 'P' } as const;
export type CrashSource = keyof typeof SRC;

/** 4 hex of a string (FNV-1a) - tells two different errors of the same name apart on a photo. */
const hash4 = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h & 0xffff).toString(16).padStart(4, '0');
};

/** The first stack frame as `file:line:col` (basename) - which bundle chunk threw, for us; '' when there is no stack. */
export function whereOf(stack: string | undefined): string {
  const m = /(?:\(|@|at )\s*(?:[^\s()]*\/)?([^/\s()]+:\d+:\d+)\)?/.exec((stack ?? '').split('\n').slice(1).join('\n'));
  return m ? m[1] : '';
}

export function crashOf(err: unknown, src: CrashSource): Crash {
  const e = err instanceof Error ? err : null;
  const name = (e?.name || (err === undefined || err === null ? 'Empty' : typeof err === 'object' ? 'Object' : 'Value')).replace(/[^A-Za-z]/g, '').slice(0, 24) || 'Error';
  const msg = e ? e.message : (() => { try { return typeof err === 'string' ? err : JSON.stringify(err) ?? String(err); } catch { return String(err); } })();
  const line = (msg || '').split('\n')[0].slice(0, 160);
  const where = whereOf(e?.stack);
  return { code: `${SRC[src]}-${name}-${hash4(`${line}|${where}`)}`, line, where, at: new Date().toISOString() };
}

export function savedCrash(): Crash | null {
  try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as Crash) : null; } catch { return null; }
}
const save = (c: Crash) => { try { if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage off: the screen still shows */ } };
const clear = () => { try { localStorage.removeItem(KEY); } catch { /* nothing kept */ } };

function lang(): Lang {
  const l = document.documentElement.lang as Lang;
  return LANGS.includes(l) ? l : langFromTag(navigator.language);
}

let shown = false;
/** THE error screen. `dead` = the page cannot go on (the tree is gone): «Спробувати ще раз» reloads; else it dismisses. */
export function showCrash(c: Crash, dead: boolean): void {
  if (shown || typeof document === 'undefined') return;
  shown = true;
  const t = makeT(lang());
  const el = document.createElement('div');
  el.id = 'inok-crash';
  el.className = 'crash';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('data-testid', 'crash');
  el.setAttribute('data-code', c.code);
  const add = (tag: string, cls: string, text: string, testId?: string) => {
    const n = document.createElement(tag); n.className = cls; n.textContent = text; if (testId) n.setAttribute('data-testid', testId); return el.appendChild(n);
  };
  // D63: THE icon mechanism of the first-run screen (`<ion-icon>` - its shadow styles draw the outline glyph's strokes; a CSS mask
  // of the same SVG lost them: a solid triangle without the «!»). Plain DOM: the custom element is defined here too (idempotent).
  if (!customElements.get('ion-icon')) defineIonIcon();
  const icon = document.createElement('ion-icon') as HTMLElement & { icon?: string };
  icon.className = 'first-run__icon';
  icon.icon = warningOutline;
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('data-testid', 'crash-icon');
  el.appendChild(icon);
  add('h1', 'crash__title', t('crash.title'));
  add('p', 'crash__text', t('crash.text'));
  add('p', 'crash__text', t('data.fail_photo'), 'crash-photo');
  const btn = add('button', 'crash__btn', t('data.retry'), 'crash-retry') as HTMLButtonElement;
  btn.type = 'button';
  add('p', 'first-run__code crash__code', t('data.fail_code', { code: c.code }), 'crash-code');
  add('p', 'crash__line', [c.line, c.where].filter(Boolean).join(' · '), 'crash-line');
  // A-181 (2): «Надіслати розробнику» under «Спробувати ще раз» - the site's feedback form with the report prefilled; offline: the text copied
  const send = add('button', 'crash__btn crash__btn--send', t('crash.send'), 'crash-send') as HTMLButtonElement;
  send.type = 'button';
  el.insertBefore(send, btn.nextSibling);
  send.onclick = async () => {
    const text = await reportText(c, t('data.fail_code', { code: c.code }));
    if (await online()) { void openLink(reportUrl(text, lang()), lang()); return; }
    await copyText(text);
    if (!el.querySelector('[data-testid="crash-send-offline"]')) el.insertBefore(Object.assign(document.createElement('p'), {
      className: 'crash__text', textContent: t('crash.send_offline') }), send.nextSibling).setAttribute('data-testid', 'crash-send-offline');
    el.querySelector('[data-testid="crash-send-offline"]')?.setAttribute('role', 'status');
  };
  btn.onclick = () => {
    clear();
    if (dead) { location.reload(); return; }
    el.remove(); shown = false;
  };
  document.body.appendChild(el);
}

/** A crash while the app runs: log it (logcat via the WebView console, the emulator smoke greps these lines), keep it, show the screen. */
export function reportCrash(err: unknown, src: CrashSource, dead = true): void {
  const c = crashOf(err, src);
  console.error(`InokBoot: ${src === 'promise' ? 'rejection' : 'error'} ${c.code} ${c.line} ${c.where}`);
  save(c);
  sendAuto(c); // A-181 (1): the automatic anonymous report, always
  showCrash(c, dead);
}

/** A-182: an error that is NOT the stop screen (a map's GL failure contained by the map; Apple's map failing - A-183) - logged and
 *  auto-reported only; `gl` (A-183 (6)): a GL failure carries the device's WebGL version + renderer */
export function reportQuietly(err: unknown, src: CrashSource, gl = false): void {
  const c = crashOf(err, src);
  console.error(`InokBoot: contained ${c.code} ${c.line} ${c.where}`);
  sendAuto(c, gl ? { gl: glInfo() } : {});
}

/** Once, first thing in main.tsx: the global handlers, the native renderer hook, and the crash kept from the last launch. */
export function installCrashGuard(): void {
  window.addEventListener('error', (e) => {
    // A-182: a map's GL failure while a map is mounted = that map falls back to its list; never the stop screen
    if (routeMapGlFailure(e.error ?? e.message)) { reportQuietly(e.error ?? new Error(e.message), 'error', true); return; }
    if (e.error) reportCrash(e.error, 'error');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const why = (e as PromiseRejectionEvent).reason;
    if (isUserCancel(why)) { console.warn('InokBoot: a user cancel, not a crash'); return; } // T2: a closed share sheet is no crash
    if (routeMapGlFailure(why)) { reportQuietly(why, 'promise', true); return; }
    reportCrash(why, 'promise');
  });
  (window as { inokNativeCrash?: (code: string) => void }).inokNativeCrash = (code) => {
    const c: Crash = { code, line: '', where: '', at: new Date().toISOString() };
    console.error(`InokBoot: error ${code}`);
    save(c);
    sendAuto(c);
    showCrash(c, false);
  };
  const last = savedCrash();
  // A-182: a map GL failure kept by 1.0.18 (it showed the stop screen) is not shown again - the map now falls back by itself
  if (last && isMapGlFailure(last.line)) clear();
  else if (last) showCrash(last, false);
  setTimeout(() => void flushReports(), 3000); // A-181: the reports kept while offline go at this start, after the first screen
}

/** THE React boundary around the whole app: a render error shows the error screen instead of an empty page. */
export class CrashBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { reportCrash(error, 'render'); }
  render() { return this.state.failed ? null : this.props.children; }
}
