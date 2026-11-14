import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { linkTarget } from '@/data/links/router';
import { getMonastery } from '@/data/repo/monasteries';
import { openLink } from '@/native/intents';
import { launchUrl, onUrlOpen } from '@/native/appLinks';
import { useApp } from '@/state/AppContext';
import type { Db } from '@/data/db/types';

/** THE in-app screen of a site link (A-21(а), R-39, A-76): a card in the DB -> the card; an article -> `/articles?id=` (the app's language;
 *  the screen asks the server for an id its cache lacks, R-35); anything else -> null = the browser. */
async function linkRoute(db: Db, href: string): Promise<string | null> {
  const to = linkTarget(href);
  if (to?.kind === 'card' && (await getMonastery(db, to.code))) return `/monasteries/${to.code}`;
  if (to?.kind === 'article') return `/articles?id=${to.id}`;
  return null;
}

/** THE follow of a site link (one rule for html-lite taps and App Links): its in-app screen, else the browser. Never a dead screen. */
export function useFollowLink(): (href: string) => Promise<void> {
  const { db, lang } = useApp();
  const navigate = useNavigate();
  return useCallback(async (href: string) => {
    const to = await linkRoute(db, href);
    if (to) navigate(to);
    else await openLink(href, lang);
  }, [db, lang, navigate]);
}

/**
 * A-78 1: THE start destination (the router's `/`): the screen of the link that STARTED the app (process killed), else «Головна» - ONE
 * navigation, after the launch URL is known, taken ONCE. 1.0.2 redirected `/` -> `/home` by a `<Navigate>` and followed the launch URL
 * beside it: Ionic keeps the `/` element mounted in its stack, so the link's navigation (the bridge answers in a few ms) changed `navigate`,
 * the `<Navigate>` effect ran AGAIN and replaced the link's screen by «Головна» (measured: 0 / 5 ms -> «Головна»; `history` trace).
 * The link's screen carries `START`: its Back is the screen's parent, as for any screen opened first (A-25, `backAction`).
 */
export const START = { start: true } as const;
let started = false; // ONCE per page load: the effect re-runs whenever `navigate` changes (any location change), it must decide nothing then
export function StartRoute(): null {
  const { db, lang } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    if (started) return;
    started = true;
    void launchUrl().then(async (u) => {
      const to = u ? await linkRoute(db, u) : null;
      navigate(to ?? '/home', { replace: true, state: to ? START : undefined });
      if (u && !to) await openLink(u, lang);
    });
  }, [db, lang, navigate]);
  return null;
}

/**
 * A-76 App Links while the app runs: an inok.info link the system handed to it (the manifest's ONE autoVerify filter, `appUrlOpen`).
 * The cold start's URL is `StartRoute`'s; when the system also tells it by `appUrlOpen` right after the start, that twin is dropped.
 */
export function useAppLinks(): void {
  const follow = useFollowLink();
  const latest = useRef(follow);
  useEffect(() => { latest.current = follow; }, [follow]);
  useEffect(() => {
    const go = (u: string) => void latest.current(u);
    let launch: string | undefined | null = null; // null = not known yet; the cold start's URL (followed by StartRoute)
    const t0 = Date.now(); // a twin of the cold start's URL is dropped only right after the start
    const early: string[] = []; // URLs that came by `appUrlOpen` before the launch URL was known
    void launchUrl().then((u) => {
      launch = u;
      early.filter((e) => e !== u).forEach(go);
    });
    return onUrlOpen((u) => {
      if (launch === null) early.push(u);
      else if (launch === u && Date.now() - t0 < 5000) launch = undefined; // the same cold start, told twice
      else go(u);
    });
  }, []);
}
