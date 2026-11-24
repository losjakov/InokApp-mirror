import { useIonActionSheet } from '@ionic/react';
import { bookOutline, callOutline, checkmarkCircleOutline, documentTextOutline, mapOutline, navigateOutline, refreshOutline, shareSocialOutline, star, starOutline,
  videocamOutline, checkmarkDoneOutline, ellipseOutline } from 'ionicons/icons';
import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { useReading } from '@/state/reading';
import { getMonastery } from '@/data/repo/monasteries';
import { getChannelOfMonastery } from '@/data/repo/channels';
import { phoneGroups } from '@/data/repo/phones';
import { field, rowParts } from '@/data/repo/types';
import { articleItems, monasteryItems, type ArticleItem, type MonasteryItem } from '@/state/quickSheet';
import { noteHintUsed, takeHint } from '@/state/quickHint';
import { useToast } from './toast';
import { callPhone, shareUrl, siteUrl } from '@/native/intents';
import { overlayOpen } from './overlays';
import { useOpenChannel } from './StreamRow';
import { directionButtons } from './DirectionsSheet';
import { useFavToast, useVisitedToast } from './FavMark';
import { longDate } from '@/i18n/date';
import type { Article } from '@/data/api/types';
import type { Snap } from '@/data/repo/reading';

type Btn = { text: string; icon?: string; handler?: () => void; role?: 'cancel'; htmlAttributes?: Record<string, string> };
const item = (k: string, text: string, icon: string, handler: () => void): Btn => ({ text, icon, handler, htmlAttributes: { 'data-testid': `qs-${k}` } });
/** NOTE 2 (A-154 (4), cloud_43): an item that answers with a toast waits for the sheet's didDismiss - the sheet closes first, then the toast
 *  at its usual place (never a toast over an open sheet). One gate per presented sheet. */
export function sheetGate(): { closed: Promise<void>; onDidDismiss: () => void } {
  let done!: () => void;
  const closed = new Promise<void>((r) => { done = r; });
  return { closed, onDidDismiss: () => done() };
}

/** P5: never over the reserve door (it renders INSTEAD of the app - no row exists then) nor over another open sheet / dialog / popover */
const blocked = (): boolean => overlayOpen();

/** A-142 (2): the monastery row's sheet - header = the name, sub-line = the place; read from the DB at the press (the row is lean). */
export function useMonasterySheet(open: (code: number) => void): (code: number) => Promise<void> {
  const { db, t, lang, dict, favourites, toggleFavourite, visited, toggleVisited } = useApp();
  const [present] = useIonActionSheet();
  const navigate = useNavigate();
  const openChannel = useOpenChannel();
  const fav = useFavToast();
  const vis = useVisitedToast();
  return useCallback(async (code: number) => {
    if (blocked()) return;
    const row = await getMonastery(db, code);
    if (!row || blocked()) return;
    void noteHintUsed('monastery');
    const channel = await getChannelOfMonastery(db, code);
    const name = field(row, 'name', lang);
    const p = rowParts(row, lang, dict);
    const dial = phoneGroups(JSON.parse(row.phones_json || '[]') as string[]).find((g) => g.dial)?.dial ?? null;
    const hasGeo = row.lat != null && row.lon != null;
    const on = favourites.has(code); const was = visited.has(code);
    const gate = sheetGate();
    const make: Record<MonasteryItem, () => Btn> = {
      page: () => item('page', t('sheet.m_page'), documentTextOutline, () => open(code)),
      fav: () => item('fav', t(on ? 'sheet.fav_remove' : 'sheet.fav_add'), on ? star : starOutline, () => void toggleFavourite(code).then(() => gate.closed).then(() => fav(!on))),
      visited: () => item('visited', t(was ? 'sheet.visited_remove' : 'sheet.visited_add'), checkmarkCircleOutline, () => void toggleVisited(code).then(async (r) => { await gate.closed; vis(r); })),
      route: () => item('route', t('sheet.route'), navigateOutline, () => { window.setTimeout(() => void present({ header: t('card.directions'), cssClass: 'quick-sheet',
        buttons: [...directionButtons(t, row.lat!, row.lon!, name), { text: t('common.cancel'), role: 'cancel' }] }), 350); }),
      map: () => item('map', t('sheet.map'), mapOutline, () => navigate(`/map?code=${code}`)),
      call: () => item('call', t('sheet.call'), callOutline, () => callPhone(dial!)),
      stream: () => item('stream', t('sheet.stream'), videocamOutline, () => openChannel(channel!)),
      share: () => item('share', t('common.share'), shareSocialOutline, () => void gate.closed.then(() => shareUrl(name, siteUrl(row.site_url, lang)))),
    };
    await present({
      header: name, subHeader: [p.town, p.oblast].filter(Boolean).join(', '), cssClass: 'quick-sheet', htmlAttributes: { 'data-testid': 'quick-sheet-m' }, onDidDismiss: gate.onDidDismiss,
      buttons: [...monasteryItems({ hasGeo, dial, hasChannel: !!channel }).map((k) => make[k]()), { text: t('common.cancel'), role: 'cancel', htmlAttributes: { 'data-testid': 'qs-cancel' } }],
    });
  }, [db, t, lang, dict, favourites, toggleFavourite, visited, toggleVisited, present, navigate, openChannel, fav, vis, open]);
}

/** A-142 (3): the article row's sheet - header = the title, sub-line = «kind · date · прочитано N%». */
export function useArticleSheet(open: (id: number) => void): (a: Article | Snap) => Promise<void> {
  const { t, lang } = useApp();
  const { saved, places, toggleSaved, setRead } = useReading();
  const [present] = useIonActionSheet();
  const fav = useFavToast();
  return useCallback(async (a: Article | Snap) => {
    if (blocked()) return;
    void noteHintUsed('article');
    const place = places.get(a.id);
    const items = articleItems(a.kind, place);
    const on = saved.has(a.id);
    const read = !!place?.finished;
    const gate = sheetGate();
    const make: Record<ArticleItem, () => Btn> = {
      continue: () => item('continue', t('sheet.continue', { n: place?.pct ?? 0 }), bookOutline, () => open(a.id)),
      restart: () => item('restart', t('sheet.restart'), refreshOutline, () => void setRead(a, false).then(() => open(a.id))),
      open: () => item('open', t('sheet.open'), bookOutline, () => open(a.id)),
      fav: () => item('fav', t(on ? 'sheet.fav_remove' : 'sheet.fav_add'), on ? star : starOutline, () => void toggleSaved(a.id, 'body' in a ? (a as Article) : undefined).then(async (r) => { await gate.closed; if (r !== null) fav(r); })),
      read: () => item('read', t(read ? 'sheet.mark_unread' : 'sheet.mark_read'), read ? ellipseOutline : checkmarkDoneOutline, () => void setRead(a, !read)),
      share: () => item('share', t('common.share'), shareSocialOutline, () => void gate.closed.then(() => shareUrl(a.title, siteUrl(a.site_url, lang)))),
    };
    const sub = [t(`kind1.${a.kind}`), longDate(a.published_at, lang), place?.started && !place.finished ? t('reading.pct', { n: place.pct }) : read ? t('reading.done') : ''].filter(Boolean).join(' · ');
    await present({
      header: a.title, subHeader: sub, cssClass: 'quick-sheet', htmlAttributes: { 'data-testid': 'quick-sheet-a' }, onDidDismiss: gate.onDidDismiss,
      buttons: [...items.map((k) => make[k]()), { text: t('common.cancel'), role: 'cancel', htmlAttributes: { 'data-testid': 'qs-cancel' } }],
    });
  }, [t, lang, saved, places, toggleSaved, setRead, present, fav, open]);
}

/** A-142 (4): the hint over a list of that kind - shown by the rule (`hintDue`), once per run at most; a toast, polite, ~4 s. */
export function useQuickHint(kind: 'monastery' | 'article', shown: boolean): void {
  const { t, settings } = useApp();
  const toast = useToast();
  const retired = settings.asked.includes(kind === 'monastery' ? 'hint_monastery' : 'hint_article');
  useEffect(() => {
    if (!shown) return;
    let on = true;
    const h = window.setTimeout(() => void takeHint(kind, retired).then((go) => { if (on && go && !overlayOpen()) toast(t('sheet.hint'), { duration: HINT_SHOW_MS, testId: `quick-hint-${kind}` }); }), 800);
    return () => { on = false; window.clearTimeout(h); };
  }, [shown, kind, retired, t, toast]);
}
export const HINT_SHOW_MS = 4000;
