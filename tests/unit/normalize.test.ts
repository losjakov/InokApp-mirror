import { describe, expect, it } from 'vitest';
import { normalize, tokens, trigramScore } from '@/data/search/normalize';

describe('normalize (the one folding table)', () => {
  it('folds Ukrainian/Russian letters users confuse', () => {
    expect(normalize('Києво-Печерська')).toBe('киево печерська');
    expect(normalize('Киево-Печерская')).toBe('киево печерская');
    expect(normalize('Їжакевич')).toBe('ижакевич');
    expect(normalize('Ґудзик ёлка Єлена')).toBe('гудзик елка елена');
    expect(normalize('ы')).toBe('и');
  });
  it('removes apostrophes and quotes, dashes become spaces, case/space collapse', () => {
    expect(normalize("Подвір'я  «Святого»")).toBe('подвиря святого');
    expect(normalize('Свято‑Троїцький – монастир')).toBe('свято троицький монастир');
    expect(normalize('  KYIV  ')).toBe('kyiv');
  });
  it('tokens drop empties', () => {
    expect(tokens(' лавра,  київ ')).toEqual(['лавра', 'киив']);
    expect(tokens('')).toEqual([]);
  });
  it('trigram score: exact substring = 1, one typo well above 0.5, unrelated ~0', () => {
    expect(trigramScore('печерська', 'киево печерська лавра')).toBe(1);
    expect(trigramScore('печерска', 'киево печерська лавра')).toBeGreaterThan(0.5);
    expect(trigramScore('одеса', 'киево печерська лавра')).toBeLessThan(0.3);
  });
});
