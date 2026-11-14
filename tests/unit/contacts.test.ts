import { describe, expect, it } from 'vitest';
import { getContacts } from '@/data/repo/contacts';
import { getMonastery } from '@/data/repo/monasteries';
import { fixtureDirectory, importedDb } from './helpers';

describe('R-21 contacts + R-22 head_born (schema 8)', () => {
  it('imports the contacts block of the export and reads it back offline', async () => {
    const { db } = await importedDb();
    const c = await getContacts(db);
    expect(c).toEqual(fixtureDirectory().contacts);
    expect(c?.address.uk).toContain('Лаврська');
  });
  it('keeps the head birth date per language', async () => {
    const { db } = await importedDb();
    const m = await getMonastery(db, 242);
    expect(m?.head_born_uk).toBe('19.04.1961');
    expect(m?.head_born_en).toBe('19 Apr 1961');
  });
});

describe('hoursLines', () => {
  it('the <p> is the label, each <li> a line', async () => {
    const { hoursLines } = await import('@/data/repo/contacts');
    const h = hoursLines(fixtureDirectory().contacts!.hours!.uk);
    expect(h.lead).toMatch(/^Відповіді на телефонні дзвінки/);
    expect(h.lines).toHaveLength(3);
    expect(h.lines[1]).toBe('субота - з 9:00 до 11:40');
    expect(hoursLines('<p>одна</p>')).toEqual({ lead: '', lines: ['одна'] });
  });
});
