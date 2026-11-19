import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Article } from '@/data/api/types';
import { getArticle, keepSavedPictures } from '@/data/repo/articles';
import { continueList, dismissPlace, listPlaces, listSaved, saveArticle, setFinished, unsaveArticle, type Place, type Snap } from '@/data/repo/reading';
import { useApp } from './AppContext';

/** A-141: what every article list and both continue cards read - the saved ids, the places by id, the continue list - ONE source. */
export interface Reading {
  saved: Set<number>;
  places: Map<number, Place>;
  unfinished: Place[];
  /** the article star (toolbar, sheet): saved <-> not; returns the state after the tap (null = the item is not known here) */
  toggleSaved(id: number, known?: Article): Promise<boolean | null>;
  savedList(): Promise<Article[]>;
  setRead(a: Article | Snap, read: boolean): Promise<void>;
  dismiss(id: number): Promise<void>;
  reload(): void;
}
const Ctx = createContext<Reading | null>(null);

export function ReadingProvider({ children }: { children: ReactNode }) {
  const { db, lang, settings } = useApp();
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [places, setPlaces] = useState<Place[]>([]);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    if (!db) return;
    let on = true;
    void Promise.all([listSaved(db), listPlaces(db)]).then(([s, p]) => { if (on) { setSaved(new Set(s.map((a) => a.id))); setPlaces(p); } });
    return () => { on = false; };
  }, [db, tick]);
  // a place written by the article view shows in the rows when the person comes back (the list re-reads on focus of the app / a route)
  useEffect(() => { const h = () => reload(); window.addEventListener('inok-reading', h); return () => window.removeEventListener('inok-reading', h); }, [reload]);
  const toggleSaved = useCallback(async (id: number, known?: Article) => {
    if (!db) return null;
    if (saved.has(id)) { await unsaveArticle(db, id); reload(); return false; }
    const a = (await getArticle(db, id, lang)) ?? known ?? null; // a row of a server page (not cached) brings its own item
    if (!a) return null;
    await saveArticle(db, a, lang);
    void keepSavedPictures(a, settings.photos);
    reload();
    return true;
  }, [db, lang, saved, settings.photos, reload]);
  const savedList = useCallback(async () => (db ? listSaved(db) : []), [db]);
  const setRead = useCallback(async (a: Article | Snap, read: boolean) => { if (db) { await setFinished(db, a, read); reload(); } }, [db, reload]);
  const dismiss = useCallback(async (id: number) => { if (db) { await dismissPlace(db, id); reload(); } }, [db, reload]);
  const value = useMemo<Reading>(() => ({
    saved, places: new Map(places.map((p) => [p.id, p])), unfinished: continueList(places), toggleSaved, savedList, setRead, dismiss, reload,
  }), [saved, places, toggleSaved, savedList, setRead, dismiss, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReading(): Reading {
  const r = useContext(Ctx);
  if (!r) throw new Error('useReading outside ReadingProvider');
  return r;
}
/** the article view tells the lists that a place / mark changed */
export const readingChanged = (): void => { window.dispatchEvent(new Event('inok-reading')); };
