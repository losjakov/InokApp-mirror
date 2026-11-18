import type { AppConfig } from '@/data/api/types';
import type { Lang } from '@/i18n';

/**
 * A-132 «THE RESERVE DOOR» (contract §3 R-58 `notice`, R-59 `versions`) - ONE pure rule, read at EVERY start from the KEPT config (so also
 * offline) and again from every fresh config (which replaces the kept one):
 * - `notice` (the special cases: update / reinstall / reset_data / info, own words) for this platform and an installed version STRICTLY below
 *   `below` - it wins over `versions`;
 * - `versions.<platform>`: installed < `min` = the HARD screen (no way past it); `min` <= installed < `recommended` = the SOFT one («Пізніше»,
 *   again at the next start); else nothing.
 * NEVER FOR EVER: anything empty, broken or unknown = NO door; the bar gone from the config or the version >= the bar = no door.
 * X.Y.Z compared NUMERICALLY (1.0.9 < 1.0.10).
 */
export type DoorPlatform = 'android' | 'ios';
export type DoorAction = 'update' | 'reinstall' | 'reset_data' | 'info';
export type DoorLevel = 'hard' | 'soft';
export interface Door {
  source: 'notice' | 'versions';
  /** the notice's id (a new notice = a new id); `versions:<level>:<bar>` for the version bars */
  id: string;
  action: DoorAction;
  level: DoorLevel;
  title?: Record<Lang, string>;
  text?: Record<Lang, string>;
  url?: string;
}
export interface DoorNotice { id?: unknown; below?: unknown; platforms?: unknown; action?: unknown; level?: unknown; title?: unknown; text?: unknown; url?: unknown }
export interface DoorVersions { android?: { min?: unknown; recommended?: unknown }; ios?: { min?: unknown; recommended?: unknown } }
export type DoorConfig = Pick<AppConfig, never> & { notice?: DoorNotice | null; versions?: DoorVersions | null };

/** STRICT X.Y.Z of plain numbers (no sign, no letters, no fourth part); anything else = null (= no door). */
export function parseVersion(v: unknown): [number, number, number] | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
/** -1 / 0 / 1 by numbers, part by part; null when either side is not a version. */
export function versionCmp(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
const below = (installed: string, bar: unknown): boolean => versionCmp(installed, bar) === -1;

const ACTIONS: readonly DoorAction[] = ['update', 'reinstall', 'reset_data', 'info'];
const LANGS: readonly Lang[] = ['uk', 'ru', 'en'];
/** a text of the site = all three languages, each a non-empty string; otherwise the app's own words */
const words = (v: unknown): Record<Lang, string> | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return LANGS.every((l) => typeof o[l] === 'string' && (o[l] as string).trim() !== '') ? (o as Record<Lang, string>) : undefined;
};
const httpsUrl = (v: unknown): string | undefined => (typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v) ? v : undefined);

/** The notice of R-58, whole, for this platform and version - or null (any broken field = null, as the server serves it). */
export function noticeDoor(n: DoorNotice | null | undefined, platform: DoorPlatform, installed: string): Door | null {
  if (!n || typeof n !== 'object') return null;
  if (typeof n.id !== 'string' || !n.id.trim()) return null;
  if (!Array.isArray(n.platforms) || !n.platforms.includes(platform)) return null;
  if (!parseVersion(n.below) || !below(installed, n.below)) return null;
  if (typeof n.action !== 'string' || !ACTIONS.includes(n.action as DoorAction)) return null;
  const level: DoorLevel | null = n.level == null ? 'soft' : n.level === 'hard' || n.level === 'soft' ? n.level : null;
  if (!level) return null;
  const title = words(n.title), text = words(n.text), url = httpsUrl(n.url);
  if (n.action === 'info' && !text) return null; // «info» has no words of its own: nothing to say = nothing shown
  // an «info» has no action that ends it: never hard without a page to open (never locked for ever)
  return { source: 'notice', id: n.id, action: n.action as DoorAction, level: n.action === 'info' && !url ? 'soft' : level, title, text, url };
}

/** R-59: this platform's two bars. */
export function versionsDoor(v: DoorVersions | null | undefined, platform: DoorPlatform, installed: string): Door | null {
  const p = v && typeof v === 'object' ? v[platform] : null;
  if (!p || typeof p !== 'object') return null;
  if (below(installed, p.min)) return { source: 'versions', id: `versions:hard:${String(p.min)}`, action: 'update', level: 'hard' };
  if (below(installed, p.recommended)) return { source: 'versions', id: `versions:soft:${String(p.recommended)}`, action: 'update', level: 'soft' };
  return null;
}

/** THE rule: the notice wins when both apply; a notice already carried out (reset_data done) is never shown again. */
export function doorFor(c: DoorConfig | null | undefined, platform: DoorPlatform, installed: string, done: ReadonlySet<string> = new Set()): Door | null {
  if (!c || !parseVersion(installed)) return null;
  const n = noticeDoor(c.notice, platform, installed);
  if (n && !done.has(n.id)) return n;
  return versionsDoor(c.versions, platform, installed);
}
