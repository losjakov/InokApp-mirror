import { describe, expect, it } from 'vitest';
import { createExpression, featureFilter } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import { labelExpression, transformBasemap } from '@/data/map/basemap';
import liberty from './fixtures/liberty_subset.json';

// the two Crimea `place` features of class `state` as the OpenFreeMap tiles carry them (z5–z7, planet 20261025)
const LAWFUL = { class: 'state', rank: 6, name: 'Автономна Республіка Крим', 'name:latin': 'Autonomous Republic of Crimea', name_en: 'Autonomous Republic of Crimea',
  'name:uk': 'Автономна Республіка Крим', 'name:ru': 'Автономная Республика Крым', 'name:en': 'Autonomous Republic of Crimea' };
const OCCUPATION = { class: 'state', rank: 6, name: 'Республика Крым', 'name:latin': 'Republic of Crimea', name_en: 'Republic of Crimea',
  'name:uk': 'Республіка Крим', 'name:ru': 'Республика Крым', 'name:en': 'Republic of Crimea' };
const KYIV = { class: 'city', name: 'Київ', 'name:latin': 'Kyiv', 'name:uk': 'Київ', 'name:ru': 'Киев', 'name:en': 'Kyiv' };
const NO_LANG = { class: 'city', name: 'Gdańsk', 'name:latin': 'Gdańsk' };

const evalText = (expr: unknown, props: Record<string, unknown>) => {
  const e = createExpression(expr, 'layers[0].layout.text-field', { type: 'string' } as never);
  if (e.result !== 'success') throw new Error(JSON.stringify(e.value));
  return e.value.evaluate({ zoom: 6 }, { properties: props, type: 'Point' } as never);
};
const styled = (lang: 'uk' | 'ru' | 'en') => transformBasemap(liberty as unknown as StyleSpecification, lang);
const layer = (s: StyleSpecification, id: string) => s.layers.find((l) => l.id === id)!;
const passes = (s: StyleSpecification, id: string, props: Record<string, unknown>) =>
  featureFilter((layer(s, id) as { filter?: unknown }).filter as never, 'layers[0].filter').filter({ zoom: 6 }, { properties: props, type: 1 } as never);

describe('A-24 base map: one style transform', () => {
  it('labels read the interface language, then latin, then the original', () => {
    expect(evalText(labelExpression('uk'), KYIV)).toBe('Київ');
    expect(evalText(labelExpression('ru'), KYIV)).toBe('Киев');
    expect(evalText(labelExpression('en'), KYIV)).toBe('Kyiv');
    expect(evalText(labelExpression('uk'), NO_LANG)).toBe('Gdańsk');
    expect(evalText(labelExpression('uk'), { name: 'Тест' })).toBe('Тест');
  });
  it('every name label of the style is replaced; a road shield keeps its ref', () => {
    const s = styled('uk');
    for (const id of ['label_state', 'label_city', 'water_name_point_label'])
      expect((layer(s, id) as { layout: Record<string, unknown> }).layout['text-field']).toEqual(labelExpression('uk'));
    expect(JSON.stringify((layer(s, 'highway-shield-non-us') as { layout: Record<string, unknown> }).layout['text-field'])).toContain('"ref"');
  });
  it('the occupation-era entity label is never printed, in any language; the lawful one is', () => {
    for (const lang of ['uk', 'ru', 'en'] as const) {
      const s = styled(lang);
      expect(passes(s, 'label_state', OCCUPATION), lang).toBe(false);
      expect(passes(s, 'label_state', LAWFUL), lang).toBe(true);
      expect(passes(s, 'label_city', KYIV), lang).toBe(true);
    }
    // before the transform the style shows both
    expect(featureFilter((layer(liberty as unknown as StyleSpecification, 'label_state') as { filter?: unknown }).filter as never, 'layers[0].filter')
      .filter({ zoom: 6 }, { properties: OCCUPATION, type: 1 } as never)).toBe(true);
  });
  it('the disputed dashes are hidden; the state border stays', () => {
    const s = styled('uk');
    expect((layer(s, 'boundary_disputed') as { layout?: { visibility?: string } }).layout?.visibility).toBe('none');
    expect((layer(s, 'boundary_2') as { layout?: { visibility?: string } }).layout?.visibility).not.toBe('none');
  });
});

/** cloud_37 (the iOS 16.4 simulator crash): the 8-s tile question never throws - no style or MapLibre's TypeError = «loaded» (no note, no crash) */
describe('tilesLoaded (iOS 16.4: Object.values inside areTilesLoaded)', () => {
  it('answers MapLibre when it can, «loaded» when it cannot', async () => {
    const { tilesLoaded } = await import('@/data/map/inokMap');
    expect(tilesLoaded({ style: {}, areTilesLoaded: () => false })).toBe(false);
    expect(tilesLoaded({ style: {}, areTilesLoaded: () => true })).toBe(true);
    expect(tilesLoaded({ style: undefined, areTilesLoaded: () => { throw new Error('never asked'); } })).toBe(true);
    expect(tilesLoaded({ style: {}, areTilesLoaded: () => { throw new TypeError('Object.values requires that input parameter not be null or undefined'); } })).toBe(true);
  });
});
