import { field } from '@/data/repo/types';
import { useT } from '@/state/AppContext';
import { Hl } from './Hl';

/** A-140: the parent house's name in the app language (the LEFT JOIN's `parent_<lang>`), '' = not a canonical unit */
export const parentName = (row: { parent_code?: number | null }, lang: Parameters<typeof field>[2]): string =>
  row.parent_code != null ? field(row, 'parent', lang) : '';

/**
 * A-140: «↳ <parent>» - ONE look in the list row (plain: the row opens the card), the card head and the map card (`onOpen`: a link-styled
 * button «↳ <parent> ›» -> the parent's card). The arrows are drawn, not read: TalkBack / VoiceOver say only the parent's name.
 */
export function ParentLine({ row, q, onOpen, className = '' }: { row: { parent_code?: number | null }; q?: string; onOpen?: () => void; className?: string }) {
  const { lang } = useT();
  const name = parentName(row, lang);
  if (!name) return null;
  if (!onOpen)
    return <p className={`mrow__sub parent-line ${className}`} data-testid="row-parent"><span aria-hidden="true">↳ </span><Hl text={name} q={q} /></p>;
  return (
    <button type="button" className={`parent-line parent-line--link ${className}`} onClick={onOpen} data-testid="parent-link">
      <span><span aria-hidden="true">↳ </span>{name}<span aria-hidden="true"> ›</span></span>
    </button>
  );
}
