import { ApiError, apiBytes, apiJson, MIRROR_BASE, readJson, type FetchOptions } from './api/client';
import { decodeExport, manifestFile } from './api/exportLoader';
import type { AppConfig, Article, ArticlesPage, Comment, Comments, Directory, LiveStatus, Manifest, MonasteryPhotos, RatingAnswer, ReportAnswer, ViewsAnswer, VoteAnswer, VoteValue } from './api/types';
import type { Lang } from '@/i18n';
import { isNative } from '@/native/platform';
import { sortArticles, type ArticleSort } from '@/data/repo/articleOrder';

/** Contract §3: what every cast carries beside its own fields - Android's Play Integrity token, or iOS's App Attest fields (R-53). */
export type CastBody = { install_id: string; integrity_token?: string; platform?: 'ios'; key_id?: string; assertion?: string };

/**
 * Where the data comes from. Native builds talk to the live API (contract §2–§3). The browser build (Playwright
 * screens, `npm run dev`) reads fixtures/ served by vite (no CORS, no network, reproducible). Override with
 * VITE_DATA=live|fixtures.
 */
export type DataSource = {
  manifest(): Promise<Manifest>;
  directory(m: Manifest): Promise<Directory>;
  /** A-144: the same pair from the GitHub mirror (the site failed); the gz checked against the MIRROR's manifest */
  mirrorManifest(): Promise<Manifest>;
  mirrorDirectory(m: Manifest): Promise<Directory>;
  /** A-144: the pair the release build put INTO the app (`public/bundled/`, scripts/bundle_export.mjs); null = this build carries none */
  bundled(): Promise<{ man: Manifest; dir: Directory } | null>;
  config(): Promise<AppConfig>;
  /** A-162 (2): the small settings file (contract § «ui-config», PLANNED - 404 until the site's ruling); the raw JSON, checked by uiConfig.ts */
  uiConfig(): Promise<unknown>;
  liveStatus(): Promise<LiveStatus>;
  /** the feed (no filter), a card's block (R-17: monastery + kind, 5 per page); R-44: `q` / `sort`; `signal` cancels it (A-97) */
  articles(lang: Lang, since?: string | null, f?: ArticleFilter, signal?: AbortSignal): Promise<ArticlesPage>;
  /** R-35 (A-51): ONE item by id in that language - the feed's own bytes; 404 = not shown */
  article(id: number, lang: Lang): Promise<Article>;
  /** R-27: with the install id the answer carries this install's vote on every comment and reply; R-55 `ranked`: by likes minus
   *  dislikes (a tie: the newer first), 5 top-level comments a page from `since` (null = the first page) */
  comments(id: number, installId: string, ranked?: { since: string | null }): Promise<Comments>;
  rate(id: number, body: { value: number } & CastBody): Promise<RatingAnswer>;
  /** R-27: a comment's like / dislike — the DESIRED state (`none` withdraws) */
  vote(id: number, cid: number, body: { value: VoteValue } & CastBody): Promise<VoteAnswer>;
  /** R-32 (A-49): ONE comment to the site's moderation */
  report(id: number, cid: number, body: CastBody): Promise<ReportAnswer>;
  /** R-38 (A-65): the page's eye - `articles/<id>/views` | `monasteries/<code>/views` (no-store) */
  views(path: string): Promise<ViewsAnswer>;
  /** R-38: ONE view of that page (202, the same whether counted or not) */
  view(path: string, body: { token: string } & CastBody): Promise<ReportAnswer>;
  /** R-53 step 1: a one-use challenge for THIS install's App Attest registration (300 s) */
  attestChallenge(body: { platform: 'ios'; install_id: string }): Promise<{ challenge: string; expires_in: number }>;
  /** R-53 step 3: the attested key becomes the install's key (200 `{ ok: true }`) */
  attestKey(body: { platform: 'ios'; install_id: string; key_id: string; attestation: string; challenge: string }): Promise<ReportAnswer>;
  /** R-49 (A-109): a card's gallery, asked on a tap only (online); 404 = unknown / inactive card */
  monasteryPhotos(code: number): Promise<MonasteryPhotos>;
  /** R-54 (A-130): «Читайте також» / «Дивіться також» - items of the opened item's kind (3; news 4 of the last 30 days), the feed's bytes */
  related(id: number, lang: Lang): Promise<{ items: Article[] }>;
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
  const key = `${f.kind ?? ''}|${f.q ?? ''}|${f.sort ?? ''}|${lang}|${f.limit ?? ''}`;
  const [all, video, views] = await Promise.all([fx<ArticlesPage>(`articles.json?q=${encodeURIComponent(f.q ?? '')}&sort=${f.sort ?? ''}`), fx<ArticlesPage>('articles_video.json'),
    fx<Record<string, number | null> & { __week?: Record<string, number> }>('views.json')]);
  const q = (f.q ?? '').toLowerCase().replace(/\s+/g, ' ');
  // R-64 (A-179): C = the mean of ALL ratings of the rated items (the site: of the rated sections), 4 decimals; m = 5 - sent with every answer
  const rated = [...all.items, ...video.items].filter((a) => (a.rating?.count ?? 0) > 0);
  const n = rated.reduce((t, a) => t + a.rating!.count, 0);
  const prior = n ? { mean: Math.round((rated.reduce((t, a) => t + a.rating!.value * a.rating!.count, 0) / n) * 10000) / 10000, weight: 5 } : undefined;
  const items = sortArticles([...all.items, ...video.items].filter((a) => (!f.kind || a.kind === f.kind) && (!q || [a.title, a.subtitle ?? ''].some((s) => s.toLowerCase().replace(/\s+/g, ' ').includes(q))))
    .map((a) => ({ ...a, created_at: a.published_at, views: views?.[`articles/${a.id}/views`] ?? null, views_week: views?.__week?.[String(a.id)] ?? 0 })), f.sort ?? 'published', prior);
  const [ck, at] = since ? since.split('#') : [key, '0'];
  if (ck !== key) throw new ApiError(400, 'bad_request');
  const size = Math.min(f.limit ?? 4, 4); // a home block's `limit` 1 / 2 (A-128); else pages of 4
  const from = Number(at); const page = items.slice(from, from + size);
  return { items: page, next: from + size < items.length ? `${key}#${from + size}` : null, ...(prior ? { rating_prior: prior } : {}) };
}

const mode = (): 'live' | 'fixtures' => {
  const env = import.meta.env.VITE_DATA as string | undefined;
  if (env === 'live' || env === 'fixtures') return env;
  return isNative() ? 'live' : 'fixtures';
};

/** A POST of the API. An App Attest assertion is single-use (its counter): such a cast is sent ONCE - the cast code retries with a new one. */
const post = (body: object): FetchOptions => ({ method: 'POST', body, ...('assertion' in body ? { once: true } : {}) });

/** A-144: the bundled pair is a file of the app itself (a RELATIVE address: the WebView serves it from the APK / the app bundle; Capacitor's
 *  http patch leaves relative addresses alone). Absent (a build without the step, the browser ring) = null; a bad sha = an error. */
/** Android's asset packer unpacks `*.gz` assets and drops the suffix - the bundled gzip carries `.bin` (scripts/bundle_export.mjs) */
export const BUNDLED_SUFFIX = '.bin';
async function bundledPair(prefix: string): Promise<{ man: Manifest; dir: Directory } | null> {
  const r = await fetch(`${prefix}bundled/manifest.json`).catch(() => null);
  if (!r || !r.ok) return null;
  let man: Manifest;
  try { man = (await r.json()) as Manifest; } catch { return null; } // a dev server's index.html for a missing file
  const f = manifestFile(man);
  const g = await fetch(`${prefix}bundled/${f.name}${BUNDLED_SUFFIX}`);
  if (!g.ok) return null;
  return { man, dir: await decodeExport(new Uint8Array(await g.arrayBuffer()), f.sha256) };
}

const live: DataSource = {
  manifest: () => apiJson<Manifest>('export/manifest.json'),
  async directory(m) {
    const f = manifestFile(m);
    return decodeExport(await apiBytes(`export/${f.name}`), f.sha256);
  },
  mirrorManifest: () => apiJson<Manifest>(`${MIRROR_BASE}manifest.json`),
  async mirrorDirectory(m) {
    const f = manifestFile(m);
    return decodeExport(await apiBytes(`${MIRROR_BASE}${f.name}`), f.sha256);
  },
  bundled: () => bundledPair(''),
  config: () => apiJson<AppConfig>('config'),
  uiConfig: () => apiJson<unknown>('ui-config'),
  liveStatus: () => apiJson<LiveStatus>('live-status'),
  articles: (lang, since, f, signal) => apiJson<ArticlesPage>(articlesQuery(lang, since, f), signal ? { signal } : undefined),
  article: (id, lang) => apiJson<Article>(`articles/${id}?lang=${lang}`),
  comments: (id, install, ranked) => apiJson<Comments>(`articles/${id}/comments?install_id=${encodeURIComponent(install)}${ranked ? rankedQuery(ranked.since) : ''}`),
  vote: (id, cid, body) => apiJson<VoteAnswer>(`articles/${id}/comments/${cid}/vote`, post(body)),
  report: (id, cid, body) => apiJson<ReportAnswer>(`articles/${id}/comments/${cid}/report`, post(body)),
  views: (path) => apiJson<ViewsAnswer>(path),
  view: (path, body) => apiJson<ReportAnswer>(path, post(body)),
  attestChallenge: (body) => apiJson<{ challenge: string; expires_in: number }>('app-attest/challenge', post(body)),
  attestKey: (body) => apiJson<ReportAnswer>('app-attest/key', post(body)),
  monasteryPhotos: (code) => apiJson<MonasteryPhotos>(`monasteries/${code}/photos`),
  related: (id, lang) => apiJson<{ items: Article[] }>(`articles/${id}/related?lang=${lang}`),
  async rate(id, body) {
    try {
      return await apiJson<RatingAnswer>(`articles/${id}/rating`, post(body));
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
/** R-55 (A-130 3): the first FIVE comments by score, then pages of five («Показати більше»). */
export const COMMENTS_PAGE = 5;
const rankedQuery = (since: string | null): string => `&sort=score&limit=${COMMENTS_PAGE}${since ? `&since=${encodeURIComponent(since)}` : ''}`;
/** R-55: THE order (the server's; the fixtures play it): likes minus dislikes, highest first; equal -> the newer first, then the higher id. */
export const scoreOrder = (a: Comment, b: Comment): number =>
  ((b.votes?.likes ?? 0) - (b.votes?.dislikes ?? 0)) - ((a.votes?.likes ?? 0) - (a.votes?.dislikes ?? 0)) || b.at.localeCompare(a.at) || b.id - a.id;

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
  mirrorManifest: () => fx<Manifest>('manifest.json'),
  async mirrorDirectory(m) {
    const r = await fetch('/fixtures/directory_v1.json.gz');
    return decodeExport(new Uint8Array(await r.arrayBuffer()), manifestFile(m).sha256);
  },
  bundled: () => bundledPair('/'),
  config: async () => ({
    contract_version: 1,
    min_app_version: '0.0.0',
    map_style_url: 'https://tiles.openfreemap.org/styles/liberty',
    export_poll_hours: 24,
    live_poll_seconds: 120,
    features: { comments_write: false, embedded_player: false, articles_query: true, articles_sort_v2: true, monastery_photos: true, articles_related: true, comments_ranked: true, photo_links: true }, // R-44: live 13.11.2026; R-48 + R-49: 14.11; R-54 ... R-56: 17.11
    donate_url: 'https://inok.info/donate/',
    privacy_url: 'https://inok.info/app/privacy/',
    rights_url: 'https://inok.info/about/rightsholders/', photo_add_hash: 'skm-cta-photo', // R-56 (contract §3, 17.11.2026)
    ...(globalThis as { __inokConfig?: object }).__inokConfig, // a screen's stand-in for the site's answer (R-41's switch)
  }),
  uiConfig: () => fx<unknown>('ui-config.json'), // absent in fixtures/ = 404, as the site today (a screen test routes its own)
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
  // fixtures/comments.json: live answers (with `?install_id=`) keyed by the item's id; news has none (the API answers 404).
  // fixtures/comments_ranked.json (cloud_40, R-55): 7 MADE-UP comments of 2868 with equal sums (no live publication has more than five) -
  // ranked, the cursor = the offset (the server's is opaque); `comments.json?sort=score&since=` lets a screen refuse / hold a page
  async comments(id, _install, ranked) {
    const all = { ...(await fx<Record<string, Comments>>('comments.json')), ...(await fx<Record<string, Comments>>('comments_ranked.json')) };
    const c = all[String(id)];
    if (ranked) await fx<unknown>(`comments.json?sort=score&since=${ranked.since ?? ''}`);
    if (!c) throw new ApiError(404, 'not_found');
    if (!ranked) return c;
    const from = Number(ranked.since ?? 0);
    const items = [...c.items].sort(scoreOrder);
    return { ...c, items: items.slice(from, from + COMMENTS_PAGE), next: from + COMMENTS_PAGE < items.length ? String(from + COMMENTS_PAGE) : null };
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
  // R-53: no browser attests (no App Attest outside an iPhone); the answers keep the contract's shape for a stand-in device
  attestChallenge: async () => ({ challenge: 'fixture-challenge-0123456789abcdefghijklmnopqrstu', expires_in: 300 }),
  attestKey: async () => ({ ok: true }),
  // fixtures/monastery_photos.json: the live R-49 answers of 242 (40), 16 / 275 (one), 47 (none), 14.11.2026, keyed by code; any other
  // code = 404 as the server answers an unknown card (`?code=` lets a screen count / refuse the request)
  async monasteryPhotos(code) {
    const a = (await fx<Record<string, MonasteryPhotos>>(`monastery_photos.json?code=${code}`))[String(code)];
    if (!a) throw new ApiError(404, 'not_found');
    return a;
  },
  // R-54: drawn from the fixtures' own items (the feed, the video sample, the R-39 pair, 1714, the R-47 pair) - the opened item's kind, never
  // itself, 3 (news 4), in the lists' order (the live set is a seeded shuffle per hour); `articles.json?related=<id>` lets a screen refuse /
  // hold / empty the request
  async related(id, lang) {
    await fx<unknown>(`articles.json?related=${id}`);
    const byLang = ['articles_links.json', 'article_gallery.json', 'articles_video_r47.json'].map((f) => fx<Record<string, ArticlesPage>>(f).then((x) => x?.[lang] ?? { items: [], next: null }));
    const pool = (await Promise.all([fx<ArticlesPage>('articles.json'), fx<ArticlesPage>('articles_video.json'), ...byLang])).flatMap((p) => p.items);
    const self = pool.find((a) => a.id === id);
    if (!self) throw new ApiError(404, 'not_found');
    const seen = new Set<number>([id]);
    const items = pool.filter((a) => a.kind === self.kind && !seen.has(a.id) && seen.add(a.id));
    return { items: items.slice(0, self.kind === 'news' ? 4 : 3) };
  },
};

export const dataSource = (): DataSource => (mode() === 'live' ? live : fixtures);
export const dataMode = mode;
