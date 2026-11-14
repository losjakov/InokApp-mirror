import type { Db } from '@/data/db/types';
import type { Contacts } from '@/data/api/types';

/** R-21: the «Контакти» block of the last import (offline; null = the export had none yet). */
export async function getContacts(db: Db): Promise<Contacts | null> {
  try {
    const r = await db.query<{ json: string }>('SELECT json FROM contacts WHERE id = 1');
    return r[0] ? (JSON.parse(r[0].json) as Contacts) : null;
  } catch {
    return null; // a database from before schema 8 that has not re-imported yet
  }
}

const text = (h: string) => h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** The hours' html-lite (a <p> and a <ul>, contract §2) as the fact row prints it: the paragraph = the row's label, each <li> = one line. */
export function hoursLines(html: string | null | undefined): { lead: string; lines: string[] } {
  const h = html ?? '';
  const lines = [...h.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => text(m[1])).filter(Boolean);
  const lead = text(h.replace(/<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>/gi, ' '));
  return lines.length ? { lead, lines } : { lead: '', lines: lead ? [lead] : [] };
}
