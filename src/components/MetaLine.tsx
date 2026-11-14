import { Fragment, type ReactNode } from 'react';

/**
 * ONE meta line of a list row (D38, A-15): «kind · date · ★ 5 (4) · 💬 1», «Монастирів: 8 · Насельників: 1429». A group never
 * breaks inside («★ 5 / (4)» was D38); the line wraps only between groups, at the « · ».
 * `stickyLast` (N7, REVIEW cloud_22): the last group takes its dot with it (one no-wrap box: Chrome breaks
 * after a no-break space before an inline-block) - «· 👁 1146» never splits, the break comes BEFORE the dot.
 */
export function MetaLine({ groups, className = 'mrow__sub', testId, stickyLast = false }: { groups: (ReactNode | null | undefined | false)[]; className?: string; testId?: string; stickyLast?: boolean }) {
  const shown = groups.filter((g) => !!g);
  const last = shown.length - 1;
  return (
    <p className={className} data-testid={testId}>
      {shown.map((g, i) => (stickyLast && i > 0 && i === last
        ? <Fragment key={i}>{' '}<span className="meta__stick">{'·\u00a0'}<span className="meta__g">{g}</span></span></Fragment>
        : <Fragment key={i}>{i > 0 && ' · '}<span className="meta__g">{g}</span></Fragment>))}
    </p>
  );
}
