import { IonIcon, IonItem, IonLabel } from '@ionic/react';
import { churchOutline } from './icons';
import { CoverImage } from './CoverImage';
import { Hl } from './Hl';
import { field, headLine, rowParts } from '@/data/repo/types';
import type { LeanRow as Row } from '@/data/repo/monasteries';
import { formatKm } from '@/data/search/geo';
import { hiddenMatch } from '@/data/search/highlight';
import { LANGS } from '@/i18n';
import { useT } from '@/state/AppContext';

/**
 * THE list row (list, favourites, «near me», home) — as the site's /monasteries/ row (A-23 #4): cover · name · type marker +
 * eparchy · the FULL address of the card · «<post> - <head>, <see>» (the person in bold, as the site); distance on its own line.
 * Nothing is cut, no ellipsis (owner, 31.10). `q` marks the search's matches in every visible field.
 */
export function MonasteryRow({ row, onSelect, selected, q }: { row: Row; onSelect: (code: number) => void; selected?: boolean; q?: string }) {
  const { lang, t, dict } = useT();
  const name = field(row, 'name', lang);
  const parts = rowParts(row, lang, dict);
  const address = field(row, 'address', lang) || [parts.town, parts.oblast].filter(Boolean).join(', ');
  const head = headLine(row, lang, dict);
  const typeKey = row.type === 'm' || row.type === 'f' ? row.type : null;
  // D27: when a word of the query marks nothing on the row, say which field the search found it in
  const why = q && q.trim() ? hiddenMatch(
    [name, parts.eparchy, address, head ? [head.role, head.person, head.rest].join(' ') : ''],
    [
      { label: t('card.official'), text: field(row, 'official', lang) },
      { label: t('search.f_name'), text: field(row, 'short', lang) },
      ...LANGS.filter((l) => l !== lang).flatMap((l) => {
        const r = row as unknown as Record<string, string | null>; const L = l.toUpperCase();
        return [
          { label: `${t('search.f_name')} · ${L}`, text: r[`name_${l}`] },
          { label: `${t('card.official')} · ${L}`, text: r[`official_${l}`] },
          { label: `${dict.label_address ?? ''} · ${L}`, text: r[`address_${l}`] },
          { label: `${dict.label_head ?? ''} · ${L}`, text: r[`head_${l}`] },
        ];
      }),
    ], q) : null;
  return (
    <IonItem button detail={false} onClick={() => onSelect(row.code)} color={selected ? 'light' : undefined} className="mrow" data-testid={`mrow-${row.code}`}>
      {/* A-29: the site's SQUARE list picture (R-25), cached by its sha256; a house the site has no photo of shows the app's own sign */}
      <CoverImage small keep code={row.code} url={row.thumb_url} version={row.thumb_sha256} alt="" className="mrow__cover mrow__cover--square"
        fallback={<div className="mrow__nophoto" data-testid="row-nophoto"><IonIcon icon={churchOutline} aria-hidden="true" /></div>} />
      <IonLabel>
        <h2 className="mrow__title"><Hl text={name} q={q} /></h2>
        {(parts.eparchy || typeKey) && (
          <p className="mrow__sub">
            {typeKey && <span className="mrow__type" aria-label={dict[`type_${typeKey}`] ?? ''}>{t(`type.${typeKey}`)}</span>}
            {parts.eparchy && <span className="mrow__eparchy"><Hl text={parts.eparchy} q={q} /></span>}
          </p>
        )}
        {address && <p className="mrow__sub" data-testid="row-address"><Hl text={address} q={q} /></p>}
        {head && (
          <p className="mrow__sub mrow__head" data-testid="row-head">
            {head.role && <>{head.role} - </>}<strong><Hl text={head.person} q={q} /></strong>{head.rest && <>, <Hl text={head.rest} q={q} /></>}{head.born && <>, <span data-testid="row-born">{head.born}</span></>}
          </p>
        )}
        {why && <p className="mrow__sub mrow__why" data-testid="row-why">{t('search.match')} · {why.label}: <Hl text={why.text} q={q} /></p>}
        {row.distance_km != null && <p className="mrow__dist">{t('card.distance', { km: formatKm(row.distance_km) })}</p>}
      </IonLabel>
    </IonItem>
  );
}
