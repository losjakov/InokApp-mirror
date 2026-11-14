import { IonButton, IonIcon } from '@ionic/react';
import { Busy } from '@/components/Busy';
import { useToast } from '@/components/toast';
import { globeOutline, star, starOutline } from 'ionicons/icons';
import { ExternalLinkRow } from './InfoRow';
import { MetaLine } from './MetaLine';
import { useEffect, useRef, useState } from 'react';
import { useViewsEye } from './ViewsEye';
import { CoverImage, LoadAllPhotos, PhotoScope } from './CoverImage';
import { HtmlLite } from './HtmlLite';
import { articleScaleStyle } from './TextSize';
import { longDate } from '@/i18n/date';
import type { Article, Comments } from '@/data/api/types';
import { articleHeader, articleLead, fetchArticle, getArticle, myRating, rateArticle, readOnSite, videoLink } from '@/data/repo/articles';
import { loadComments, withCounts, type CommentsRead } from '@/data/repo/comments';
import { castFailure, castMessage } from '@/data/repo/cast';
import { CommentsBlock } from './CommentsBlock';
import { openOnSite, siteUrl } from '@/native/intents';
import { VideoButton } from './VideoButton';
import { ShareFooter } from './ShareFooter';
import { SoftAsk } from './SoftAsk';
import { ScrollArrows } from './ScrollArrows';
import { Spoken } from './Spoken';
import { useApp } from '@/state/AppContext';
import { consumedArticles } from '@/native/push';

/** R-29 (D52): a read's fresh numbers onto the shown article (stars, votes, «Коментарі · N»). */
const fresh = (r: CommentsRead) => (cur: Article | null | undefined) => (cur ? withCounts(cur, r) : cur);

/** One item of ANY kind, readable offline from the cache (stage 4), ONE order for the three (A-101): cover, heading, subtitle, «kind · date · eye»,
 *  the video button (R-47, any host), the lead (A-40), the full body (pictures, R-45 gallery); the rating (cast once) and comments read-only
 *  (A-4) - not for news. «Read in full on inok.info» only for an item with neither body nor video (`readOnSite`). */
export function ArticleView({ id }: { id: number }) {
  const { db, t, lang, articlesVersion, settings } = useApp();
  const [a, setA] = useState<Article | null | undefined>(undefined);
  const [mine, setMine] = useState<number | null>(null);
  const [comments, setComments] = useState<Comments | null>(null);
  const toast = useToast();
  const root = useRef<HTMLElement>(null);
  const eye = useViewsEye({ kind: 'article', id }, root); // A-65: beside the date, as on the site; one view by the site's rules
  useEffect(() => { void consumedArticles([String(id)]); }, [id]); // A-84 (b): the article opened -> its notification goes
  useEffect(() => {
    let on = true;
    let read: CommentsRead | null = null; // R-29: the comments answer's numbers are fresher than any copy of the item (2 min vs 5)
    const show = (x: Article) => setA((cur) => { const n = read ? withCounts(x, read) : x; return cur && JSON.stringify(cur) === JSON.stringify(n) ? cur : n; });
    // D52: always asked (a feed's «0» may be stale); a live answer also brings the item's rating and comments_count (R-29)
    const comments = (x: Article) => { if (x.kind !== 'news') loadComments(db, id).then((r) => { if (on) { read = r; setComments(r.comments); setA(fresh(r)); } }); };
    (async () => {
      const x = await getArticle(db, id, lang);
      const m = await myRating(db, id);
      if (!on) return;
      setMine(m);
      if (x) { show(x); comments(x); }
      // A-51 (R-35): online, the server's own copy replaces the cached one (an admin's edit shows without a restart); D69: an id the
      // cache lacks (a push tap on a warm app) is asked, then shown. Offline / busy: the cache, as before; 404 with no copy = not found.
      const srv = await fetchArticle(db, id, lang).catch(() => undefined);
      if (!on) return;
      if (srv) { show(srv); if (!x) comments(srv); }
      else if (!x) setA(srv === undefined && articlesVersion === 0 ? undefined : null); // cold start offline: wait for the first refresh
    })();
    return () => { on = false; };
  }, [db, id, lang, articlesVersion]);
  if (a === undefined) return <div className="empty"><Busy /></div>;
  if (!a) return <div className="empty" data-testid="article-missing">{t('articles.not_found')}</div>;
  const rate = async (v: number) => {
    try { const ans = await rateArticle(db, a, v, lang); setMine(ans.mine); setA({ ...a, rating: ans.rating ?? a.rating }); }
    catch (e) { toast(t(castMessage(castFailure(e), 'rating')), { cssClass: 'rating-toast' }); }
  };
  const site = () => void openOnSite(a.site_url, lang);
  const lead = articleLead(a);
  const video = videoLink(a); // R-47: ONE button, any kind (P5)
  const header = articleHeader(a); // A-30: the page's large picture (R-26), cached by the A-19 / A-20 rule
  return (
    <PhotoScope>
    <article ref={root} className="aview arrows-host" data-testid="article" style={articleScaleStyle(settings.articleScale)} data-scale={settings.articleScale}>
      {header && <CoverImage code={`a${a.id}`} url={header.url} alt={a.title} className="aview__cover" full openable />}
      <h1 className="card__title">{a.title}</h1>
      {a.subtitle && <p className="aview__subtitle">{a.subtitle}</p>}
      <MetaLine className="card__sub" groups={[t(`kind1.${a.kind}`), longDate(a.published_at, lang), eye]} stickyLast />
      <LoadAllPhotos />
      {video && <VideoButton video={video} />}
      {/* A-40: the lead (анонс) after the date and before the text, one block as on the site; the body alone below it */}
      {lead && <HtmlLite html={lead} className="aview__lead" photoKey={`a${a.id}`} />}
      {a.body && <HtmlLite html={a.body} className="history aview__body" photoKey={`a${a.id}`} />}
      {readOnSite(a) && <IonButton fill="outline" expand="block" onClick={site} data-testid="read-site">{t('articles.read_site')}</IonButton>}
      {a.kind !== 'news' && (
        <section className="aview__rate" data-testid="rating">
          <span>{mine ? t('articles.your_rating', { n: mine }) : t('articles.rate')}</span>
          <span className="aview__stars" role="group" aria-label={t('articles.rate')}>
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" disabled={mine != null} onClick={() => void rate(v)} aria-label={t('a11y.star', { v })} data-testid={`star-${v}`} data-lit={(mine ?? 0) >= v ? '1' : '0'}>
                {/* A-66: the buttons light ONLY the reader's own rating (outlines until he rates); the average is the number beside them */}
                <IonIcon icon={(mine ?? 0) >= v ? star : starOutline} aria-hidden="true" />
              </button>
            ))}
          </span>
          {a.rating && a.rating.count > 0 && (() => { const v = a.rating.value.toLocaleString(lang, { maximumFractionDigits: 1 });
            return <Spoken className="aview__avg" say={t('a11y.rating', { v, n: a.rating.count })}>{v} ({a.rating.count})</Spoken>; })()}
        </section>
      )}
      {a.kind !== 'news' && <CommentsBlock key={comments ? 'read' : 'none'} a={a} initial={comments} onRead={(r) => setA(fresh(r))} />}
      <div className="card__site"><ExternalLinkRow lead={globeOutline} url={siteUrl(a.site_url, lang)} title={t('card.open_site')} testId="open-site" /></div>
    </article>
    <ShareFooter title={a.title} url={siteUrl(a.site_url, lang)} />
    <SoftAsk kind="articles" />
    <ScrollArrows root={root} />
    </PhotoScope>
  );
}
