import { ApiError, apiBytes, apiJson, readJson } from './api/client';
import { decodeExport, manifestFile } from './api/exportLoader';
import type { AppConfig, Article, ArticlesPage, Comments, Directory, LiveStatus, Manifest, RatingAnswer, ReportAnswer, ViewsAnswer, VoteAnswer, VoteValue } from './api/types';
import type { Lang } from '@/i18n';
import { isNative } from '@/native/platform';
import { sortArticles, type ArticleSort } from '@/data/repo/articleOrder';

/**
 * Where the data comes from. Native builds talk to the live API (contract §2–§3). The browser build (Playwright
 * screens, `npm run dev`) reads fixtures/ served by vite (no CORS, no network, reproducible). Override with
 * VITE_DATA=live|fixtures.
 */
export type DataSource = {
  manifest(): Promise<Manifest>;
  directory(m: Manifest): Promise<Directory>;
  config(): Promise<AppConfig>;
  liveStatus(): Promise<LiveStatus>;
  /** the feed (no filter), a card's block (R-17: monastery + kind, 5 per page); R-44: `q` / `sort`; `signal` cancels it (A-97) */
  articles(lang: Lang, since?: string | null, f?: ArticleFilter, signal?: AbortSignal): Promise<ArticlesPage>;
  /** R-35 (A-51): ONE item by id in that language - the feed's own bytes; 404 = not shown */
  article(id: number, lang: Lang): Promise<Article>;
  /** R-27: with the install id the answer carries this install's vote on every comment and reply */
  comments(id: number, installId: string): Promise<Comments>;
  rate(id: number, body: { value: number; install_id: string; integrity_token?: string }): Promise<RatingAnswer>;
  /** R-27: a comment's like / dislike — the DESIRED state (`none` withdraws) */
  vote(id: number, cid: number, body: { value: VoteValue; install_id: string; integrity_token?: string }): Promise<VoteAnswer>;
  /** R-32 (A-49): ONE comment to the site's moderation */
  report(id: number, cid: number, body: { install_id: string; integrity_token?: string }): Promise<ReportAnswer>;
  /** R-38 (A-65): the page's eye - `articles/<id>/views` | `monasteries/<code>/views` (no-store) */
  views(path: string): Promise<ViewsAnswer>;
  /** R-38: ONE view of that page (202, the same whether counted or not) */
  view(path: string, body: { token: string; install_id: string; integrity_token?: string }): Promise<ReportAnswer>;
};

export type ArticleKind = 'publication' | 'video' | 'news';
export const ARTICLE_KINDS: ArticleKind[] = ['publication', 'video', 'news'];
/** R-17: a card's block (monastery + kind, 5 per page); R-19: a section list (kind alone = /articles/<section>/, 30 per page); the feed = no kind.
 *  R-44: `q` (2..64 characters after trim) and `sort` on any of them. */
export interface ArticleFilter { monastery?: number; kind?: ArticleKind; limit?: number; q?: string; sort?: ArticleSort }
/** Contract §3: the ONE query string of `GET articles` (feed page 30; a card block 5 — R-17). Without q / sort = byte for byte 1.0.5's. */
export const articlesQuery = (lang: Lang, since?: string | null, f?: ArticleFilter): string =>
  `articles?lang=${lang}${f?.monastery != null ? `&monastery=${f.monastery}` : ''}${f?.kind ? `&kind=${f.kind}` : ''}&limit=${f?.limit ?? (f?.monastery != null ? RELATED_PAGE : ARTICLES_PAGE)}${since ? `&since=${encodeURIComponent(since)}` : ''}`
  + `${f?.q ? `&q=${encodeURIComponent(f.q)}` : ''}${f?.sort && f.sort !== 'published' ? `&sort=${f.sort}` : ''}`;

/** R-44 / R-48 in fixtures mode, as the server answers it: `q` in title / subtitle (case-insensitive), the order of `sort` (THE comparator of the
 *  app, `articleOrder`), every item with `created_at` (the fixture's published_at), `views` (fixtures/views.json) and `views_week`
 *  (views.json `__week`, absent = 0); pages of 4 by an index cursor,
 *  so «Показати більше» of a found list is exercised; a cursor of another list -> 400 as the server does. */
async function fixtureQuery(f: ArticleFilter, since: string | null | undefined, lang: Lang): Promise<ArticlesPage> {
  const key = `${f.kind ?? ''}|${f.q ?? ''}|${f.sort ?? ''}|${lang}`;
  const [all, video, views] = await Promise.all([fx<ArticlesPage>(`articles.json?q=${encodeURIComponent(f.q ?? '')}&sort=${f.sort ?? ''}`), fx<ArticlesPage>('articles_video.json'),
    fx<Record<string, number | null> & { __week?: Record<string, number> }>('views.json')]);
  const q = (f.q ?? '').toLowerCase().replace(/\s+/g, ' ');
  const items = sortArticles([...all.items, ...video.items].filter((a) => (!f.kind || a.kind === f.kind) && (!q || [a.title, a.subtitle ?? ''].some((s) => s.toLowerCase().replace(/\s+/g, ' ').includes(q))))
    .map((a) => ({ ...a, created_at: a.published_at, views: views?.[`articles/${a.id}/views`] ?? null, views_week: views?.__week?.[String(a.id)] ?? 0 })), f.sort ?? 'published');
  const [ck, at] = since ? since.split('#') : [key, '0'];
  if (ck !== key) throw new ApiError(400, 'bad_request');
  const from = Number(at); const page = items.slice(from, from + 4);
  return { items: page, next: from + 4 < items.length ? `${key}#${from + 4}` : null };
}

const mode = (): 'live' | 'fixtures' => {
  const env = import.meta.env.VITE_DATA as string | undefined;
  if (env === 'live' || env === 'fixtures') return env;
  return isNative() ? 'live' : 'fixtures';
};

const live: DataSource = {
  manifest: () => apiJson<Manifest>('export/manifest.json'),
  async directory(m) {
    const f = manifestFile(m);
    return decodeExport(await apiBytes(`export/${f.name}`), f.sha256);
  },
  config: () => apiJson<AppConfig>('config'),
  liveStatus: () => apiJson<LiveStatus>('live-status'),
  articles: (lang, since, f, signal) => apiJson<ArticlesPage>(articlesQuery(lang, since, f), signal ? { signal } : undefined),
  article: (id, lang) => apiJson<Article>(`articles/${id}?lang=${lang}`),
  comments: (id, install) => apiJson<Comments>(`articles/${id}/comments?install_id=${encodeURIComponent(install)}`),
  vote: (id, cid, body) => apiJson<VoteAnswer>(`articles/${id}/comments/${cid}/vote`, { method: 'POST', body }),
  report: (id, cid, body) => apiJson<ReportAnswer>(`articles/${id}/comments/${cid}/report`, { method: 'POST', body }),
  views: (path) => apiJson<ViewsAnswer>(path),
  view: (path, body) => apiJson<ReportAnswer>(path, { method: 'POST', body }),
  async rate(id, body) {
    try {
      return await apiJson<RatingAnswer>(`articles/${id}/rating`, { method: 'POST', body });
    } catch (e) {
      // 409 «already»: one rating per install, never changed (contract §3) — the answer still carries the rating and `mine`
      if (e instanceof ApiError && e.status === 409 && e.body) return e.body as unknown as RatingAnswer;
      throw e;
    }
  },
};
/** Contract §3: `limit` 1..50; the first page = the offline cache (A-19: 30), «Показати більше» pages further online. */
export const ARTICLES_PAGE = 30;
/** R-17: a card's block shows 5 rows and pages by 5 («Показати більше»), as the card page. */
export const RELATED_PAGE = 5;

const fx = async <T>(name: string): Promise<T> => {
  const r = await fetch(`/fixtures/${name}`);
  if (!r.ok) throw new ApiError(r.status, `http_${r.status}`); // the same error as the live client's (A-46: the first-run cause)
  return readJson<T>(r); // D72: the same reading as the live client's
};

const fixtures: DataSource = {
  manifest: () => fx<Manifest>('manifest.json'),
  async directory(m) {
    const r = await fetch('/fixtures/directory_v1.json.gz');
    return decodeExport(new Uint8Array(await r.arrayBuffer()), manifestFile(m).sha256);
  },
  config: async () => ({
    contract_version: 1,
    min_app_version: '0.0.0',
    map_style_url: 'https://tiles.openfreemap.org/styles/liberty',
    export_poll_hours: 24,
    live_poll_seconds: 120,
    features: { comments_write: false, embedded_player: false, articles_query: true, articles_sort_v2: true }, // R-44: live 13.11.2026; R-48: 14.11
    donate_url: 'https://inok.info/donate/',
    privacy_url: 'https://inok.info/app/privacy/',
    ...(globalThis as { __inokConfig?: object }).__inokConfig, // a screen's stand-in for the site's answer (R-41's switch)
  }),
  liveStatus: () => fx<LiveStatus>('live-status.json'),
  async articles(lang, since, f) {
    if (f?.q || (f?.sort && f.sort !== 'published')) return fixtureQuery(f, since, lang); // R-44 (`articles.json?q=` lets a screen count / refuse them)
    if (!f || (!f.kind && f.monastery == null)) return since ? { items: [] as Article[], next: null } : fx<ArticlesPage>('articles.json');
    if (f.monastery == null) { // R-19: the section list = the feed of that kind (the fixture holds one page)
      if (since) return { items: [] as Article[], next: null };
      // the live feed's 30 newest hold no video (measured 01.11): a live sample of the video section rides along
      const [all, video] = await Promise.all([fx<ArticlesPage>('articles.json'), fx<ArticlesPage>('articles_video.json')]);
      const items = [...all.items, ...video.items].filter((a) => a.kind === f.kind);
      return { items: f.limit ? items.slice(0, f.limit) : items, next: null };
    }
    // fixtures/related.json: a live sample of the card 242's blocks, keyed `lang|kind|since`; any other card has none
    const all = await fx<Record<string, Record<string, ArticlesPage>>>('related.json');
    return all[String(f.monastery)]?.[`${lang}|${f.kind}|${since ?? ''}`] ?? { items: [], next: null };
  },
  // R-35: the feed's own item (the feed + the video sample); `?item=` lets a screen answer it apart from the feed (A-51 test)
  // fixtures/articles_links.json: the live R-39 pair 1832 <-> 1833 per language (each body links the other)
  // fixtures/article_gallery.json: the live 1714 per language (13.11.2026), its body with ONE R-45 `div.gallery` of 5 pictures
  // fixtures/articles_video_r47.json: the live 1682 (Facebook video, body + gallery) and 1892 (YouTube, body null) per language (R-47, 14.11.2026);
  // they come FIRST: articles_video.json keeps the 1.0.6 shape of 1892 (no `video`) = the saved copy the server's answer replaces (P1)
  async article(id, lang) {
    const byLang = ['articles_video_r47.json', 'articles_links.json', 'article_gallery.json'].map((f) => fx<Record<string, ArticlesPage>>(f).then((x) => x?.[lang] ?? { items: [], next: null }));
    const pages = await Promise.all([fx<ArticlesPage>(`articles.json?item=${id}`), ...byLang, fx<ArticlesPage>('articles_video.json')]);
    const a = pages.flatMap((p) => p.items).find((x) => x.id === id);
    if (!a) throw new ApiError(404, 'not_found');
    return a;
  },
  // fixtures/comments.json: live answers (with `?install_id=`) keyed by the item's id; news has none (the API answers 404)
  async comments(id) {
    const c = (await fx<Record<string, Comments>>('comments.json'))[String(id)];
    if (!c) throw new ApiError(404, 'not_found');
    return c;
  },
  // the cast goes over the network as the live one does (`?rate=` lets a screen refuse it - D73's message on an article); the answer is local
  rate: async (id, body) => { await fx<unknown>(`articles.json?rate=${id}`); return { rating: { value: body.value, count: 1 }, mine: body.value }; },
  // the live state until the Play release (contract §3): every vote is refused with 503 `vote_closed`
  vote: async () => { throw new ApiError(503, 'vote_closed'); },
  // R-32: the live server takes a report (202) while its switch is on; the fixtures answer the same
  report: async () => ({ ok: true }),
  // fixtures/views.json: live answers of R-38 keyed by the path (2869: 42 on 08.11.2026); a page without one is below 40 (null)
  async views(path) {
    const all = await fx<Record<string, number | null> & { __dwell?: [number, number] }>('views.json');
    const [gi, gn] = all.__dwell ?? [10, 30]; // a screen may shorten the dwell (screens.spec.ts `dwell`)
    return { views: all[path] ?? null, token: 'fixture.dwell', gi, gn };
  },
  view: async (path) => { await fx<unknown>(`views.json?view=${encodeURIComponent(path)}`); return { ok: true }; },
};

export const dataSource = (): DataSource => (mode() === 'live' ? live : fixtures);
export const dataMode = mode;
