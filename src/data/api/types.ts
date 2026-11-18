import type { DoorNotice, DoorVersions } from '@/state/door';
// Shapes of ref/REF_app_api_contract.md §2–§3 (v1). The app targets fields by name; unknown fields are ignored.
import type { Lang } from '@/i18n';

export type L10n = Partial<Record<Lang, string | null>>;

export interface Manifest {
  contract_version: number;
  export_version: string;
  generated_at: string;
  files: { name: string; sha256: string; bytes: number }[];
  languages: string[];
  counts: { monasteries: number; eparchies: number; channels: number; oblasts: number };
}

export interface Oblast { id: number; name: L10n }
export interface Eparchy {
  id: number; name: L10n; site_url?: string | null;
  /** R-15: what /dioceses/<id>/ prints — «Монастирів», «Насельників» (null = no line), the Wikipedia link, the map picture, the intro */
  monasteries?: number | null; residents?: number | null; wiki_url?: string | null;
  /** R-23: the eparchy's own site as /dioceses/<id>/ prints it (alive, checked ≤ 21 days) */
  own_site?: { url: string } | null;
  image?: (Cover & { credit_url?: L10n | null }) | null; about?: L10n | null;
}
export interface Channel {
  id: number;
  monastery_code: number | null;
  title: L10n;
  youtube_channel_id: string;
  youtube_url: string;
  push_topic: string;
  /** R-13: the «єпархія, область» line /live/ prints (the house's when linked, else the channel's own) */
  eparchy_id?: number | null;
  oblast_id?: number | null;
  /** R-13: the channel's position on /live/ PER LANGUAGE (null = the page does not show it) */
  sort_lang?: Partial<Record<Lang, number | null>> | null;
  /** R-16: the channel's round picture as /live/ prints it; `sha256` = its version (re-download only when it moves) */
  avatar?: Cover | null;
}
export interface Cover { url: string; w?: number; h?: number; sha256?: string }
export interface HistorySource { n: number; title?: string; [k: string]: unknown }

export interface Monastery {
  code: number;
  site_url: string;
  name: L10n;
  short_name?: L10n | null;
  official_name?: L10n | null;
  type: 'm' | 'f' | string;
  object_type?: number | null;
  subordination?: number | null;
  status: string;
  eparchy_id?: number | null;
  oblast_id?: number | null;
  town?: L10n | null;
  address?: L10n | null;
  lat: number | null;
  lon: number | null;
  phones: string[];
  email?: string | null;
  website?: string | null;
  head?: L10n | null;
  /** R-22: the head's birth date as /monasteries/ prints it (followed there by dictionary label_head_born) */
  head_born?: L10n | null;
  /** R-10 (31.10): the head's post, the appointment document, «Заснований», the last opening, the extra links */
  head_role?: L10n | null;
  head_document?: L10n | null;
  founded?: L10n | null;
  revival?: L10n | null;
  links?: { title: L10n; url: string }[];
  /** R-11: the card this house is a canonical unit of, the word in brackets, and (on a parent) its units per language */
  parent_code?: number | null;
  /** R-31 (A-44): the card's SORT - lavras 10 / 20 / 30, the rest 500; every name-sorted list orders by it first */
  sort?: number | null;
  parent_division?: L10n | null;
  units?: Partial<Record<Lang, number[]>> | null;
  cover?: Cover | null;
  cover_large?: Cover | null;
  /** R-25 (A-29): the square list thumbnail (150x150 today) */
  thumb?: Cover | null;
  has_gallery?: boolean;
  photo_count?: number;
  gallery_url?: string | null;
  history: L10n | null;
  history_sources?: HistorySource[];
  updated_at: string;
}

export interface Directory {
  contract_version: number;
  export_version: string;
  generated_at: string;
  dictionary: Record<string, Record<string, string>>;
  oblasts: Oblast[];
  eparchies: Eparchy[];
  channels: Channel[];
  monasteries: Monastery[];
  /** R-21: «Ще → Контакти», built by the site from the constants /about/contacts/ prints */
  contacts?: Contacts | null;
}

export interface Contacts {
  address: L10n;
  phone: string | null;
  phone_dial: string | null;
  messengers?: string | null;
  email?: string | null;
  /** html-lite: a <p> and a <ul> */
  hours?: L10n | null;
  note?: L10n | null;
  lat?: number | null;
  lon?: number | null;
}

export interface AppConfig {
  contract_version: number;
  min_app_version: string;
  map_style_url: string;
  export_poll_hours: number;
  live_poll_seconds: number;
  /** R-41 (A-80; window C adds it): `store_links` = the Play listing is public (share + rate shown); absent = false */
  features: { comments_write: boolean; embedded_player: boolean; store_links?: boolean; /** R-44: the server takes `q` / `sort` (A-97 buttons) */ articles_query?: boolean;
    /** R-48 (A-101): the server takes `sort=views_week|rating` (the sheet's two new orders) */ articles_sort_v2?: boolean;
    /** R-49 (A-109): the server answers `monasteries/<code>/photos` - the card's gallery opens in the app's viewer; absent = 1.0.7's `gallery_url` */ monastery_photos?: boolean;
    /** R-53 (A-127): the server takes iOS casts with an App Attest assertion; absent = every iOS cast answers 403 `integrity_required` */ app_attest?: boolean;
    /** R-54 (A-130): `GET articles/<id>/related` is answered («Читайте також» / «Дивіться також»); absent = no block */ articles_related?: boolean;
    /** R-55 (A-130): `GET articles/<id>/comments` takes `sort=score&limit&since`; absent = the 1.0.13 list */ comments_ranked?: boolean;
    /** R-56 (A-130): the photo viewer's two links are live (`rights_url`, `photo_add_hash`); absent = no buttons */ photo_links?: boolean;
    /** R-57 (A-131): the iOS twin of `store_links` - «Оцінити застосунок» (App Store) in «Про застосунок»; absent = false */ app_store_links?: boolean };
  donate_url: string;
  privacy_url: string;
  /** R-41: the Play listing's address; absent = the one built from the package id (src/native/play.ts) */
  store_url?: string | null;
  /** R-56: the site's rights-holders page (uk form; ru / en by the app's language rule, as `donate_url`) - «Правовласникам» in every viewer */
  rights_url?: string | null;
  /** R-56: the anchor that opens a card page's add-photo window («Додати фото», a MONASTERY's viewer only) */
  photo_add_hash?: string | null;
  /** R-57: the App Store page (iOS reads only this pair with `features.app_store_links`) */
  app_store_url?: string | null;
  /** R-58 (A-132): ONE notice to the versions strictly below `below` (null = none) - read whole by src/state/door.ts */
  notice?: DoorNotice | null;
  /** R-59 (A-132): the two bars per platform (`min` hard, `recommended` soft) - read by src/state/door.ts */
  versions?: DoorVersions | null;
}

/** R-49: one picture file of a card's gallery - https, the file's own size */
export interface PhotoFile { url: string; w: number; h: number }
/** R-49 `GET monasteries/<code>/photos`: the card's gallery in the site viewer's order (`count` = `photos.length` = the export's `photo_count`) */
export interface MonasteryPhotos { code: number; count: number; photos: { thumb: PhotoFile | null; full: PhotoFile; alt: L10n | null }[] }

export interface LiveStatus {
  at: string;
  /** R-16 `thumbnail` = the video's picture (null = not yet); the app's rows show the channel's avatar (A-17), so it is typed, unused */
  live: { channel_id: number; video_id: string; title: L10n; started_at: string; thumbnail?: Cover | null }[];
  /** R-13: the page's «Заплановані» tab */
  scheduled?: { channel_id: number; video_id?: string; title?: L10n; scheduled_at: string }[];
  /** R-24: `body` = every paragraph of the /live/ block (html-lite + `u`), `summary_paragraphs` = what a phone shows folded */
  calendar: { date: string; title: L10n; site_url: string; body?: L10n | null; summary_paragraphs?: number | null } | null;
}

/** Contract §3 `GET articles` (stage 4). */
export interface Rating { value: number; count: number }
/** R-47 (A-101): the link to the item's video itself, any kind; `facebook` = the video's own page, `other` = the site's address */
export interface VideoLink { url: string; host: 'youtube' | 'facebook' | 'other' | string }
export interface Article {
  id: number;
  kind: 'publication' | 'video' | 'news' | string;
  title: string;
  subtitle?: string | null;
  lead?: string | null;
  body?: string | null;
  cover?: Cover | null;
  /** R-26 (A-30): the picture the publication page prints above the text; the header shows it, rows keep `cover` */
  cover_large?: Cover | null;
  published_at: string;
  site_url: string;
  youtube_video_id?: string | null;
  /** R-47: absent in a copy saved by 1.0.6 (the view falls back to `youtube_video_id`) */
  video?: VideoLink | null;
  rating?: Rating | null;
  comments_count?: number;
  /** R-44: only in an answer with `q` / `sort` - added to the site (UTC), and the page's eye (null = show nothing) */
  created_at?: string;
  views?: number | null;
  /** R-48: with `q` / any `sort` - the page's views of the last 7 site days (0 = none) */
  views_week?: number;
}
export interface ArticlesPage { items: Article[]; next: string | null }
/** R-27: the page's own like / dislike counts of a comment or reply; `mine` = this install's vote (1 like, -1 dislike, 0 none) */
export interface Votes { likes: number; dislikes: number; mine: -1 | 0 | 1 }
export interface Comment { id: number; author: string; text: string; at: string; votes?: Votes; replies?: Omit<Comment, 'replies'>[] }
/** R-29: the item's own `rating` and `comments_count` beside the comments - the same values the feed item carries, fresh */
/** R-32 (A-49): `rules` = the site's own comment rules (plain text, shown before the form and by «Report»); `rules_url` = its rules page per language (T-1335) */
/** R-55: with `sort=score` the answer pages (`next` = the cursor of the next 5 top-level comments; null = the end) */
export interface Comments { items: Comment[]; total: number; rating?: Rating | null; comments_count?: number; rules?: L10n | null; rules_url?: L10n | null; next?: string | null }
/** R-32 `POST articles/<id>/comments/<cid>/report` → 202 (the same for a new report, a repeat and a blocked key) */
export interface ReportAnswer { ok: boolean }
/** `POST articles/<id>/rating` → 200 or 409 `already` (both carry the rating and the install's own value). */
export interface RatingAnswer { rating: Rating | null; mine: number }
/** R-27 `POST articles/<id>/comments/<cid>/vote`: the DESIRED state; 200 = the server's counts and this install's vote */
export type VoteValue = 'like' | 'dislike' | 'none';
export type VoteAnswer = Votes;

export const CONTRACT_VERSION = 1;

/** R-38 (A-65): `GET articles/<id>/views` | `monasteries/<code>/views` - the site's eye (null below 40), the dwell token, the seconds
 *  a view needs with a touch (`gi`) or without one (`gn`). */
export interface ViewsAnswer { views: number | null; token: string; gi: number; gn: number }
