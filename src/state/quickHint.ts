import { getMeta, setMeta } from '@/data/db/schema';
import { openDb } from '@/data/db';
import { hintDue, type HintState } from './quickSheet';
import { isNative } from '@/native/platform';

/** A-142 (4): the hint's counters per kind, in `meta` (kept through reset_data, never sent). */
export type HintKind = 'monastery' | 'article';
const key = (k: HintKind) => `hint_${k}`;
const read = async (k: HintKind): Promise<HintState> => {
  try { const v = JSON.parse((await getMeta(await openDb(), key(k))) ?? 'null') as HintState | null; return v ?? { shown: 0, last: 0, used: false }; }
  catch { return { shown: 0, last: 0, used: false }; }
};
const write = async (k: HintKind, s: HintState) => { try { await setMeta(await openDb(), key(k), JSON.stringify(s)); } catch { /* the next start asks again */ } };
/** the sheet opened = the person knows it: the hint never comes again for that kind */
export async function noteHintUsed(k: HintKind): Promise<void> { const s = await read(k); if (!s.used) await write(k, { ...s, used: true }); }
/** true = show the hint now (and it is counted); one call per list shown */
let askedThisRun = new Set<HintKind>(); // one hint per kind per run at most
export async function takeHint(k: HintKind, retired: boolean, now: number = Date.now()): Promise<boolean> {
  // the browser screens never show it unless a screen asks for it (`inok.hint`); a retired kind (settings `asked`) never
  let web = false; try { web = !isNative() && localStorage.getItem('inok.hint') !== '1'; } catch { web = !isNative(); }
  if (retired || web || askedThisRun.has(k)) return false;
  askedThisRun.add(k);
  const s = await read(k);
  if (!hintDue(s, now)) return false;
  await write(k, { shown: s.shown + 1, last: now, used: false });
  return true;
}
export const _resetHintRun = (): void => { askedThisRun = new Set(); };
