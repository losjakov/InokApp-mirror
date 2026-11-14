import type { ReactNode } from 'react';

/**
 * A-88: THE one-phrase reading of a compact mark (the eye «👁 1146», the rating «★ 4,3 (3)», the comments «💬 4»): TalkBack hears
 * `say` once («Переглядів: 1146»), never the symbols piece by piece. The drawn content is hidden from it; the box stays inline.
 */
export function Spoken({ say, className, testId, children, data }: { say: string; className?: string; testId?: string; children: ReactNode; data?: Record<string, string> }) {
  return <span className={className} role="img" aria-label={say} data-testid={testId} {...data}><span aria-hidden="true">{children}</span></span>;
}
