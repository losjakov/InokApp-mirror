import { Fragment } from 'react';
import { highlightRanges } from '@/data/search/highlight';

/** A text with the search's matches marked (A-23 #4): the site's yellow + bold (bold carries it without colour vision). */
export function Hl({ text, q }: { text: string; q?: string }) {
  const r = q ? highlightRanges(text, q) : [];
  if (r.length === 0) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let p = 0;
  r.forEach(([a, b], i) => {
    if (a > p) out.push(<Fragment key={`t${i}`}>{text.slice(p, a)}</Fragment>);
    out.push(<mark key={`m${i}`} className="hl">{text.slice(a, b)}</mark>);
    p = b;
  });
  if (p < text.length) out.push(<Fragment key="end">{text.slice(p)}</Fragment>);
  return <>{out}</>;
}
