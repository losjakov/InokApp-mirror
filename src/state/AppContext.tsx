import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Db } from '@/data/db/types';
import { openDb } from '@/data/db';
import { ensureSchema, getMeta, type FtsMode } from '@/data/db/schema';
import { countMonasteries, getDictionary, listFavourites, toggleFavourite } from '@/data/repo/monasteries';
import { listVisited, toggleVisited, visitedCount } from '@/data/repo/visited';
import { cachedLiveStatus, fetchLiveStatus, importBundled, loadConfig, loadLiveStatus, syncDirectory } from '@/data/sync';
import { fetchArticles, listArticles } from '@/data/repo/articles';
import { dueOnReturn, lastCheck as readLastCheck, runRefresh, type RefreshResult } from '@/data/refresh';
import { App as CapApp } from '@capacitor/app';
import { isNative } from '@/native/platform';
import type { AppConfig, LiveStatus } from '@/data/api/types';
import { DEFAULTS, LEGACY_TOPICS, effectiveLang, loadSettings, saveSettings, settingsStored, type Settings } from './settings';
import { applyTheme } from './theme';
import { makeT, type Lang, type Translate } from '@/i18n';
import { onNetChange } from '@/native/network';
import { liveChannelsNow, pushPermission, registerPush, requestPushPermission, syncTopics, type PushMessage, type PushPermission } from '@/native/push';

export type Boot = 'loading' | 'ready' | 'first_run' | 'update_app';

export interface AppState {
  db: Db;
  fts: FtsMode;
  boot: Boot;
  lang: Lang;
  t: Translate;
  settings: Settings;
  setSettings(patch: Partial<Settings>): Promise<void>;
  dict: Record<string, string>;
  favourites: Set<number>;
  toggleFavourite(code: number): Promise<void>;
  /** A-133 «Я тут був»: the marked houses (local only) and the counter «Відвідано {n} з {m}» (n = marked houses in the directory) */
  visited: Set<number>;
  visitedStat: { n: number; m: number };
  /** the state after the tap and the counter after it (the toast says both) */
  toggleVisited(code: number): Promise<{ on: boolean; n: number; m: number }>;
  config: AppConfig | null;
  live: { status: LiveStatus; stale: boolean } | null;
  liveChannelIds: Set<number>;
  refreshLive(): Promise<void>;
  /** stage 4: bumps after each feed fetch (0 = not tried yet this run); `refreshArticles` loads the newest page (false = offline, the cache stays) */
  articlesVersion: number;
  refreshArticles(): Promise<boolean>;
  exportVersion: string | null;
  /** A-51 / A-52: the ONE full refresh (live + newest articles + directory check); `refreshing` while it runs; `lastCheck` = its last success (ms) */
  refreshAll(): Promise<RefreshResult>;
  refreshing: boolean;
  lastCheck: number | null;
  /** push (stage 3): the system permission, whether the token is registered, and the last tapped notification (routed by the app) */
  push: PushPermission;
  pushRegistered: boolean;
  /** asks the system (Android 13+ dialog) and registers when granted; the permission it ends with */
  enablePush(): Promise<PushPermission>;
  pushTap: PushMessage | null;
  clearPushTap(): void;
}

const Ctx = createContext<AppState | null>(null);

/** the app's state when inside AppProvider, else null (the splash, A-88 `Busy`) */
export const useMaybeApp = (): AppState | null => useContext(Ctx);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider missing');
  return v;
}

/** Shorthand: `const { t, lang } = useT()` */
export const useT = () => {
  const { t, lang, dict } = useApp();
  return { t, lang, dict };
};

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [fts, setFts] = useState<FtsMode>('none');
  const [boot, setBoot] = useState<Boot>('loading');
  const [settings, setSettingsState] = useState<Settings>(DEFAULTS);
  const [dict, setDict] = useState<Record<string, string>>({});
  const [dictVersion, setDictVersion] = useState(0); // a re-import: the dictionary is read again (the loader below)
  const bumpDict = useCallback(() => setDictVersion((v) => v + 1), []);
  const [favourites, setFavourites] = useState<Set<number>>(new Set());
  const [visited, setVisited] = useState<Set<number>>(new Set());
  const [visitedStat, setVisitedStat] = useState<{ n: number; m: number }>({ n: 0, m: 0 });
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [live, setLive] = useState<{ status: LiveStatus; stale: boolean } | null>(null);
  const [exportVersion, setExportVersion] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [push, setPush] = useState<PushPermission>('unsupported');
  const [pushRegistered, setPushRegistered] = useState(false);
  const [pushTap, setPushTap] = useState<PushMessage | null>(null);

  const lang = effectiveLang(settings);
  const t = useMemo(() => makeT(lang), [lang]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => applyTheme(settings.theme), [settings.theme]); // A-16: applied at once on every change // screen readers + the screens' locale checks

  const [articlesVersion, setArticlesVersion] = useState(0);
  const refreshArticles = useCallback(async (): Promise<boolean> => {
    if (!db) return false;
    try { await fetchArticles(db, lang, null, settings.photos); setArticlesVersion((v) => v + 1); return true; } catch { return false; }
  }, [db, lang, settings.photos]);
  // the cache is per language: a change of language asks its newest page (the start's page comes with the full refresh below)
  const langSeen = useRef(lang);
  useEffect(() => {
    if (!db || boot !== 'ready' || langSeen.current === lang) return;
    langSeen.current = lang;
    void refreshArticles();
  }, [db, boot, lang, refreshArticles]);

  const refreshLive = useCallback(async () => {
    if (!db) return;
    setLive(await loadLiveStatus(db));
  }, [db]);

  // A-51 / A-52: the ONE full refresh - every entry (start, return, the Home button / pull / bottom line, «Ще») calls this
  const refreshAll = useCallback(async (): Promise<RefreshResult> => {
    if (!db) return 'error';
    setRefreshing(true);
    try {
      const r = await runRefresh(db, {
        live: async () => { try { setLive({ status: await fetchLiveStatus(db), stale: false }); } catch (e) { setLive(await cachedLiveStatus(db)); throw e; } },
        articles: async () => {
          const before = JSON.stringify(await listArticles(db, lang));
          await fetchArticles(db, lang, null, settings.photos);
          return JSON.stringify(await listArticles(db, lang)) !== before;
        },
        directory: async () => {
          const d = await syncDirectory(db, fts);
          if (d === 'updated') { setExportVersion(await getMeta(db, 'export_version')); bumpDict(); }
          return d;
        },
      });
      setLastCheck(await readLastCheck(db));
      return r;
    } finally {
      setRefreshing(false);
      setArticlesVersion((v) => v + 1); // moves after every attempt, offline too: an article opened cold (push tap) waits for it
    }
  }, [db, fts, lang, settings.photos, bumpDict]);
  // D22: the start's refresh after the first screen is drawn (the cached live status at once, the network never competes with the first paint)
  const refreshRef = useRef(refreshAll);
  useEffect(() => { refreshRef.current = refreshAll; }, [refreshAll]);
  const started = useRef(false);
  useEffect(() => {
    if (!db || boot !== 'ready' || started.current) return;
    started.current = true;
    void readLastCheck(db).then(setLastCheck);
    void cachedLiveStatus(db).then((l) => l && setLive((cur) => cur ?? l));
    afterFirstScreen(() => { void refreshRef.current(); });
  }, [db, boot]);
  // A-51: back in the foreground after >= 15 min since the last successful check - the same refresh, silently (no spinner over content)
  useEffect(() => {
    if (!db || boot !== 'ready') return;
    const fire = () => void readLastCheck(db).then((last) => { if (dueOnReturn(last, Date.now())) void refreshRef.current(); });
    if (isNative()) {
      const sub = CapApp.addListener('appStateChange', (st) => { if (st.isActive) fire(); });
      return () => { void sub.then((x) => x.remove()); };
    }
    const vis = () => { if (document.visibilityState === 'visible') fire(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [db, boot]);

  // boot: settings → db → schema → (import if empty) → config/live in the background
  useEffect(() => {
    let cancelled = false;
    (async () => {
      bootLog('start');
      let s = await loadSettings();
      const stored = await settingsStored();
      const d = await openDb();
      const mode = await ensureSchema(d);
      bootLog(`schema fts=${mode}`);
      if (cancelled) return;
      setSettingsState(s);
      setDb(d);
      setFts(mode);
      setFavourites(new Set(await listFavourites(d)));
      setVisited(new Set(await listVisited(d)));
      const n = await countMonasteries(d);
      bootLog(`db monasteries=${n}`);
      // A-64: 1.0.0 saved no settings until one was changed - an install that has the directory but no settings ran 1.0.0 with its
      // default (`articles` on): it keeps it, saved now; only a NEW install starts with nothing and the soft question
      // ... and a NEW install saves its settings at once, so its next start is never mistaken for 1.0.0's
      if (!stored) { if (n > 0) s = { ...s, topics: LEGACY_TOPICS }; setSettingsState(s); await saveSettings(s); }
      const afterImport = async () => {
        const ev = await getMeta(d, 'export_version');
        const dict = await getDictionary(d, effectiveLang(s));
        if (cancelled) return;
        setExportVersion(ev);
        setDict(dict);
      };
      if (n > 0) {
        await afterImport();
        if (cancelled) return;
        setBoot('ready'); // the directory check runs with the start's full refresh (refreshAll)
      } else if (await importBundled(d, mode)) { // A-144 (2): the first launch, the pair built into the app - no network wait
        bootLog('ready (bundled export)');
        await afterImport();
        if (cancelled) return;
        setBoot('ready'); // the site / mirror check runs with the start's full refresh (refreshAll)
      } else {
        const r = await syncDirectory(d, mode);
        bootLog(`first sync ${r} cancelled=${cancelled}`);
        if (cancelled) return;
        if (r === 'updated') {
          await afterImport();
          bootLog('ready (after import)');
          setBoot('ready');
        } else setBoot(r === 'update_app' ? 'update_app' : 'first_run');
      }
      afterFirstScreen(() => { loadConfig(d).then((c) => !cancelled && setConfig(c)); });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // THE dictionary loader (A-15, A-75 (1)): the export's words always in the CURRENT interface language - after a language switch and
  // after a re-import (`bumpDict`). 1.0.1 set them in the language of the moment a refresh BEGAN: started in en, switched to uk while
  // the start's check ran, a new export -> «Київська region · Київська diocese» in uk (the store set). An answer for an old language is dropped.
  useEffect(() => {
    if (!db || boot !== 'ready') return;
    let live = true;
    void getDictionary(db, lang).then((d) => { if (live) setDict(d); });
    return () => { live = false; };
  }, [db, lang, boot, dictVersion]);

  const setSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettingsState(next);
      await saveSettings(next);
    },
    [settings],
  );

  const toggleFav = useCallback(
    async (code: number) => {
      if (!db) return;
      const on = await toggleFavourite(db, code);
      setFavourites((prev) => {
        const s = new Set(prev);
        if (on) s.add(code);
        else s.delete(code);
        return s;
      });
    },
    [db],
  );

  const toggleVis = useCallback(async (code: number) => {
    if (!db) return { on: false, n: 0, m: 0 };
    const on = await toggleVisited(db, code);
    const stat = await visitedCount(db);
    setVisited((prev) => { const s = new Set(prev); s.delete(code); return on ? new Set([code, ...s]) : s; }); // the newest mark first
    setVisitedStat(stat);
    return { on, ...stat };
  }, [db]);
  // the counter follows the directory (m = its houses; a house gone keeps its mark, uncounted)
  useEffect(() => { if (db && boot === 'ready') void visitedCount(db).then(setVisitedStat); }, [db, boot, exportVersion]);

  const retryFirstRun = useCallback(async () => {
    if (!db) return;
    setBoot('loading');
    const r = await syncDirectory(db, fts);
    if (r === 'updated') {
      setExportVersion(await getMeta(db, 'export_version'));
      bumpDict();
      setBoot('ready');
    } else setBoot(r === 'update_app' ? 'update_app' : 'first_run');
  }, [db, fts, bumpDict]);

  // A-84 (c): a FRESH live-status (never the cached one shown offline) tells the tray which «ефір» notifications still stand
  useEffect(() => { if (live && !live.stale) void liveChannelsNow(live.status.live.map((l) => l.channel_id)); }, [live]);
  const liveChannelIds = useMemo(() => new Set(live?.status.live.map((l) => l.channel_id) ?? []), [live]);

  // push: register only when the system permission is already granted (no prompt at boot); the Notifications screen asks
  const register = useCallback(async () => {
    const ok = await registerPush({ onTap: setPushTap, onMessage: () => void refreshLive() });
    setPushRegistered(ok);
    return ok;
  }, [refreshLive]);
  useEffect(() => {
    if (boot !== 'ready') return;
    const check = () => pushPermission().then(async (p) => { setPush(p); if (p === 'granted') await register(); });
    // A-67: back from the phone's notification settings (the soft question's «Відкрити налаштування») the permission is read again
    const back = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', back);
    const stop = afterFirstScreen(() => void check());
    return () => { document.removeEventListener('visibilitychange', back); stop?.(); };
  }, [boot, register]);
  // the wanted topics follow the settings once registered (idempotent)
  useEffect(() => {
    if (!pushRegistered) return;
    void syncTopics(settings.topics);
    // A-125 (cloud_38): a subscription that failed without a network is asked again when the network comes back
    return onNetChange(() => void syncTopics(settings.topics));
  }, [pushRegistered, settings.topics]);
  const enablePush = useCallback(async () => {
    const p = await requestPushPermission();
    setPush(p);
    if (p === 'granted') await register();
    return p;
  }, [register]);
  const clearPushTap = useCallback(() => setPushTap(null), []);

  const value = useMemo<AppState | null>(
    () =>
      db && {
        db, fts, boot, lang, t, settings, setSettings, dict, favourites, toggleFavourite: toggleFav, visited, visitedStat, toggleVisited: toggleVis,
        config, live, liveChannelIds, refreshLive, articlesVersion, refreshArticles, exportVersion, refreshAll, refreshing, lastCheck,
        push, pushRegistered, enablePush, pushTap, clearPushTap,
      },
    [db, fts, boot, lang, t, settings, setSettings, dict, favourites, toggleFav, visited, visitedStat, toggleVis, config, live, liveChannelIds, refreshLive, articlesVersion, refreshArticles, exportVersion, refreshAll, refreshing, lastCheck,
      push, pushRegistered, enablePush, pushTap, clearPushTap],
  );

  if (!value || boot === 'loading') return <>{fallback}</>;
  if (boot !== 'ready') return <Ctx.Provider value={value}><FirstRunGate retry={retryFirstRun} /></Ctx.Provider>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

import { FirstRunGate } from '@/pages/FirstRun';
import { afterFirstScreen, bootLog } from '@/app/bootLog';
