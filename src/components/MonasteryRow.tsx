import { IonIcon, IonItem, IonLabel } from '@ionic/react';
import { churchOutline } from './icons';
import { CoverImage } from './CoverImage';
import { Hl } from './Hl';
import { ParentLine, parentName } from './ParentLine';
import { field, headLine, rowParts, withoutPostcode } from '@/data/repo/types';
import type { LeanRow as Row } from '@/data/repo/monasteries';
import { formatKm } from '@/data/search/geo';
import { hiddenMatch } from '@/data/search/highlight';
import { LANGS } from '@/i18n';
import { useApp, useT } from '@/state/AppContext';
import { checkmarkCircle } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { useLongPress } from '@/state/quickSheet';
import { useMonasterySheet } from './QuickSheet';

/**
 * THE list row of a house (every list: «Монастирі», search, Home «near me», «Обрані», «Я тут був», the eparchy page, the map's near list,
 * a parent card's «Канонічні підрозділи») - A-140 (1): RIGHT of the thumbnail the name, «↳ <parent>» (a canonical unit; not in its own
 * parent's units list - `noParent`) and the eparchy; UNDER the thumbnail, full width: the address without the postal code, the head line
 * (the person in bold, as the site), the search's «Збіг» line, the distance. No type chip in any list. The thumbnail's top stands on the
 * CAP LINE of the name's first line - the formula, not a number (`.hrow__thumb`: (line height - cap height) / 2 of the title font, in em, so
 * Roboto / SF and 100-200 % follow). Nothing is cut, no ellipsis (owner, 31.10). `q` marks the search's matches in every visible field.
 */
export function MonasteryRow({ row, onSelect, selected, q, noParent, onPage }: { row: Row; onSelect: (code: number) => void; selected?: boolean; q?: string; noParent?: boolean;
  /** A-142: «Сторінка обителі» of the long-press sheet (default: the card's page; the list's tablet form passes its own) */
  onPage?: (code: number) => void }) {
  const { lang, t, dict } = useT();
  const { visited } = useApp();
  const navigate = useNavigate();
  const sheet = useMonasterySheet(onPage ?? ((c) => navigate(`/monasteries/${c}`)));
  const press = useLongPress(() => void sheet(row.code)); // A-142: the same sheet in EVERY list of houses
  const name = field(row, 'name', lang);
  const parts = rowParts(row, lang, dict);
  const address = withoutPostcode(field(row, 'address', lang)) || [parts.town, parts.oblast].filter(Boolean).join(', ');
  const head = headLine(row, lang, dict);
  const parent = noParent ? '' : parentName(row, lang);
  // D27: when a word of the query marks nothing on the row, say which field the search found it in
  const why = q && q.trim() ? hiddenMatch(
    [name, parent, parts.eparchy, address, head ? [head.role, head.person, head.rest].join(' ') : ''],
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
    <IonItem button detail={false} onClick={() => onSelect(row.code)} color={selected ? 'light' : undefined} className="mrow hrow" data-testid={`mrow-${row.code}`} {...press}>
      <IonLabel className="hrow__label">
        <div className="hrow__top">
          {/* A-29: the site's SQUARE list picture (R-25), cached by its sha256; a house the site has no photo of shows the app's own sign */}
          <CoverImage small keep code={row.code} url={row.thumb_url} version={row.thumb_sha256} alt="" className="mrow__cover mrow__cover--square hrow__thumb"
            fallback={<div className="mrow__nophoto" data-testid="row-nophoto"><IonIcon icon={churchOutline} aria-hidden="true" /></div>} />
          <div className="hrow__main">
            <h2 className="mrow__title hrow__title"><Hl text={name} q={q} /></h2>
            {parent && <ParentLine row={row} q={q} />}
            {parts.eparchy && <p className="mrow__sub"><span className="mrow__eparchy"><Hl text={parts.eparchy} q={q} /></span></p>}
          </div>
        </div>
        {address && <p className="mrow__sub hrow__wide" data-testid="row-address"><Hl text={address} q={q} /></p>}
        {head && (
          <p className="mrow__sub mrow__head hrow__wide" data-testid="row-head">
            {head.role && <>{head.role} - </>}<strong><Hl text={head.person} q={q} /></strong>{head.rest && <>, <Hl text={head.rest} q={q} /></>}{head.born && <>, <span data-testid="row-born">{head.born}</span></>}
          </p>
        )}
        {why && <p className="mrow__sub mrow__why hrow__wide" data-testid="row-why">{t('search.match')} · {why.label}: <Hl text={why.text} q={q} /></p>}
        {row.distance_km != null && <p className="mrow__dist hrow__wide">{t('card.distance', { km: formatKm(row.distance_km) })}</p>}
      </IonLabel>
      {/* A-133 (07:08): a marked house - a green check at the row's right edge (a shape, not only a colour); named for the screen reader */}
      {visited.has(row.code) && <IonIcon slot="end" icon={checkmarkCircle} className="mrow__visited" role="img" aria-label={t('visited.row')} data-testid="row-visited" />}
    </IonItem>
  );
}
