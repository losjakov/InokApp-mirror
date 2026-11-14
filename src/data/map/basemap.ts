import type { ExpressionSpecification, FilterSpecification, StyleSpecification, TransformStyleFunction } from 'maplibre-gl';
import type { Lang } from '@/i18n';

/**
 * A-24 (owner 01.11.2026, variant A): ONE transform of the base map style, applied wherever a map is drawn.
 * - every label reads the interface language, then the latin name, then the original (`name:uk|ru|en` → `name:latin` → `name`);
 * - the disputed-boundary dashes are hidden;
 * - the occupation-era entity's label is never printed: in the OpenMapTiles data it is a SECOND `place` feature of class
 *   `state` over Crimea («Республика Крым», `name:en` «Republic of Crimea»; measured in tiles z5–z7 of 25.10.2026) beside the
 *   lawful «Автономна Республіка Крим». It is matched by its names in every key the data carries them in.
 */
export const OCCUPATION_ENTITY_NAMES = ['Republic of Crimea', 'Республика Крым', 'Республіка Крим', 'Respublika Krym'] as const;
const NAME_KEYS = ['name', 'name:en', 'name_en', 'name:latin', 'name_int', 'name:uk', 'name:ru'] as const;

export function labelExpression(lang: Lang): ExpressionSpecification {
  return ['coalesce', ['get', `name:${lang}`], ['get', 'name:latin'], ['get', 'name']];
}

/** true for a feature that is NOT the occupation-era entity (used inside every `place` layer's filter). */
export const NOT_OCCUPATION_ENTITY: ExpressionSpecification = ['all', ...NAME_KEYS.map((k): ExpressionSpecification =>
  ['!', ['in', ['coalesce', ['get', k], ''], ['literal', [...OCCUPATION_ENTITY_NAMES]]]])];

/** a label layer = a symbol layer whose text reads a feature's name (road shields read `ref` and keep it) */
const readsName = (v: unknown): boolean => JSON.stringify(v ?? null).includes('"name');

export function transformBasemap(style: StyleSpecification, lang: Lang): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((l) => {
      if (l.id === 'boundary_disputed' || ('filter' in l && JSON.stringify(l.filter ?? null).includes('["==",["get","disputed"],1]')))
        return { ...l, layout: { ...l.layout, visibility: 'none' } } as typeof l;
      if (l.type !== 'symbol') return l;
      let out = l;
      if (readsName(l.layout?.['text-field'])) out = { ...out, layout: { ...out.layout, 'text-field': labelExpression(lang) } };
      if (l['source-layer'] === 'place') out = { ...out, filter: (l.filter ? ['all', l.filter, NOT_OCCUPATION_ENTITY] : NOT_OCCUPATION_ENTITY) as FilterSpecification };
      return out;
    }),
  };
}

/** for `map.setStyle(url, { transformStyle })` — the one entry point of every map */
export const basemapTransform = (lang: Lang): TransformStyleFunction => (_prev, next) => transformBasemap(next, lang);
