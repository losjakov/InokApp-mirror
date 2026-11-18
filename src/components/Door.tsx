import { IonButton, IonContent, IonIcon, IonPage } from '@ionic/react';
import { App as CapApp } from '@capacitor/app';
import { arrowUpCircleOutline, informationCircleOutline, refreshCircleOutline } from 'ionicons/icons';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Preferences } from '@capacitor/preferences';
import { APP_VERSION } from '@/app/version';
import { cacheGet } from '@/data/repo/cache';
import { loadConfig } from '@/data/sync';
import { resetData } from '@/data/repo/resetData';
import type { AppConfig } from '@/data/api/types';
import { doorFor, type Door, type DoorPlatform } from '@/state/door';
import { isIos, isNative } from '@/native/platform';
import { online, onNetChange } from '@/native/network';
import { checkUpdate, completeUpdate, flexibleUpdate, immediateUpdate, openAppStoreUrl, openListing } from '@/native/play';
import { clearSavedPhotos } from '@/native/covers';
import { openLink } from '@/native/intents';
import { useApp } from '@/state/AppContext';

/** reset_data notices already carried out (their ids): a reset is done once, never asked again (never locked in a loop) */
const DONE_KEY = 'door_done';
const loadDone = async (): Promise<Set<string>> => {
  try { const v = JSON.parse((await Preferences.get({ key: DONE_KEY })).value ?? '[]'); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []); }
  catch { return new Set(); }
};
const saveDone = (s: Set<string>) => Preferences.set({ key: DONE_KEY, value: JSON.stringify(Array.from(s)) });
export const doorPlatform = (): DoorPlatform => (isIos() ? 'ios' : 'android');

/**
 * A-132 THE RESERVE DOOR (rule: src/state/door.ts). Rendered INSTEAD of the app (never a dialog over it): a hard door has no Back, no
 * «Пізніше», nothing behind it to reach (a quick action, a link or a push tap waits in the router that is not mounted); a soft door offers
 * «Пізніше» (and Back = «Пізніше») and comes again at the next start. Read at every start from the KEPT config (offline too), replaced by
 * every fresh one (a start with a network, the network coming back while the door shows) - the bar gone = the door gone at once.
 */
export function DoorGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { db, config } = useApp();
  const [kept, setKept] = useState<AppConfig | null | undefined>(undefined);
  const [fresh, setFresh] = useState<AppConfig | null>(null);
  const [done, setDone] = useState<Set<string> | null>(null);
  const [later, setLater] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void cacheGet<AppConfig>(db, 'config').then((c) => live && setKept(c?.value ?? null)).catch(() => live && setKept(null));
    void loadDone().then((d) => live && setDone(d));
    return () => { live = false; };
  }, [db]);
  const cfg = fresh ?? config ?? kept ?? null;
  const door = done ? doorFor(cfg, doorPlatform(), APP_VERSION, done) : null;
  const shown = door && door.id !== later ? door : null;
  // a door on screen: the network coming back asks the site again (a bar lifted reaches the person without a restart)
  useEffect(() => {
    if (!shown) return;
    return onNetChange(() => void online().then(async (on) => { if (!on) return; const c = await loadConfig(db); if (c) setFresh(c); }));
  }, [db, shown]);
  const markDone = useCallback(async (id: string) => {
    const next = new Set(done ?? []); next.add(id);
    await saveDone(next); setDone(next);
  }, [done]);
  if (kept === undefined || !done) return <>{fallback}</>;
  if (!shown) return <>{children}</>;
  return <DoorScreen door={shown} config={cfg} onLater={() => setLater(shown.id)} onDone={markDone} />;
}

function DoorScreen({ door, config, onLater, onDone }: { door: Door; config: AppConfig | null; onLater: () => void; onDone: (id: string) => Promise<void> }) {
  const { t, lang, db } = useApp();
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const hard = door.level === 'hard';
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [door.id]); // the screen reader starts on the words
  // Back: a soft door = «Пізніше»; a hard door swallows it (Android's back never passes the door)
  useEffect(() => {
    const onBack = (ev: Event) => (ev as CustomEvent<{ register(p: number, h: () => void): void }>).detail.register(1000, () => { if (!hard) onLater(); });
    document.addEventListener('ionBackButton', onBack);
    const sub = isNative() ? CapApp.addListener('backButton', () => undefined) : null;
    return () => { document.removeEventListener('ionBackButton', onBack); void sub?.then((s) => s.remove()); };
  }, [hard, onLater]);
  const update = useCallback(async () => {
    if (isIos()) { await openAppStoreUrl(config); return; }
    // A-80: a Play install hands the update to Google's own screen (hard) or the flexible download (soft); else the listing
    const c = await checkUpdate();
    if (c.state === 'available' && hard && c.info.immediateUpdateAllowed !== false) { await immediateUpdate(c.info, config); return; }
    if (c.state === 'available' && !hard && c.info.flexibleUpdateAllowed !== false) { onLater(); await flexibleUpdate(() => void completeUpdate()); return; }
    await openListing(config);
  }, [config, hard, onLater]);
  // a hard version door on a Play install: Google's immediate screen at once, as `min_app_version` did (A-80); ours stays behind it
  const asked = useRef(false);
  useEffect(() => {
    if (!hard || door.action !== 'update' || isIos() || asked.current) return;
    asked.current = true;
    void checkUpdate().then((c) => { if (c.state === 'available' && c.info.immediateUpdateAllowed !== false) void immediateUpdate(c.info, config); });
  }, [hard, door.action, config]);
  const act = async () => {
    setOffline(false);
    if (door.action === 'update') return update();
    if (door.action === 'reinstall') return door.url ? openLink(door.url, lang) : isIos() ? openAppStoreUrl(config) : openListing(config);
    if (door.action === 'info') return door.url ? openLink(door.url, lang) : undefined;
    // reset_data: only with a network (the directory is downloaded anew at once); offline = the reason, nothing cleared
    if (!(await online())) { setOffline(true); return; }
    setBusy(true);
    await resetData(db);
    await clearSavedPhotos().catch(() => undefined);
    await onDone(door.id);
    location.reload(); // the start of an empty directory = the first download (the first-run screen if it fails)
  };
  const ownText = { update: hard ? 'door.hard_text' : 'door.soft_text', reinstall: 'door.reinstall_text', reset_data: 'door.reset_text', info: '' }[door.action];
  const button = { update: 'door.update', reinstall: 'door.reinstall', reset_data: busy ? 'door.reset_busy' : 'door.reset', info: 'door.info' }[door.action];
  const title = door.title?.[lang];
  const text = door.text?.[lang] ?? t(ownText);
  const icon = door.action === 'reset_data' ? refreshCircleOutline : door.action === 'info' ? informationCircleOutline : arrowUpCircleOutline;
  const showButton = door.action !== 'info' || !!door.url;
  return (
    <IonPage>
      <IonContent className="ion-padding" fullscreen>
        <main className="first-run door" data-testid="door" data-level={door.level} data-action={door.action} data-source={door.source}>
          <IonIcon icon={icon} className="first-run__icon" aria-hidden="true" />
          <h1 ref={heading} tabIndex={-1} data-testid="door-title">{title ?? text}</h1>
          {title && <p data-testid="door-text">{text}</p>}
          {showButton && <IonButton expand="block" onClick={() => void act()} disabled={busy} data-testid="door-do">{t(button)}</IonButton>}
          {!hard && <IonButton expand="block" fill="clear" onClick={onLater} data-testid="door-later">{t('door.later')}</IonButton>}
          <p role="status" className="door__net" data-testid="door-net">{offline ? t('net.offline') : ''}</p>
        </main>
      </IonContent>
    </IonPage>
  );
}
