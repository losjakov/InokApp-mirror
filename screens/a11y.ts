import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/**
 * A-88 (TalkBack): THE accessibility gate of the screen ring (A-15: one config). axe-core over every screen of the ring on the
 * phone-light, phone-dark and tablet profiles, rules WCAG 2.0 / 2.1 level A + AA. A screen fails on any violation that is not in
 * KNOWN below. Each run writes `screens/out/a11y/<screen>__<profile>.json`, summed by `scripts/a11y_report.py`.
 * `A11Y=report` = measure only, never fail (the BEFORE count of cloud_28).
 */
export const A11Y_PROFILES = ['phone-light', 'phone-dark', 'tablet'];
/** + `wcag22aa` = axe's `target-size` (WCAG 2.2 2.5.8: a target >= 24 x 24 CSS px or spaced; A-88 (b) «targets >= 24 px») */
export const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * What we cannot fix in OUR code: rule id + the selector it hits + why. Nothing else is excused; the list only shrinks.
 * (filled from the measured BEFORE report, reports/cloud_28/a11y/)
 */
export const KNOWN: { rule: string; target: RegExp; path?: RegExp; why: string }[] = [
  { rule: 'aria-required-children', target: /^ion-list(\[data-testid="lang-list"\])?$/, path: /\/more\/language$/,
    why: 'Ionic 9 by design: `ion-item` drops its `listitem` role inside an `ion-radio-group` (the radio is the item), while `ion-list` keeps '
      + 'its Host role="list" - a role we cannot remove; TalkBack reads «radio button, 1 of 3, checked» there' },
];

const excused = (rule: string, target: string, path: string) => KNOWN.some((k) => k.rule === rule && k.target.test(target) && (!k.path || k.path.test(path)));

export type A11yHit = { rule: string; impact: string | null; help: string; targets: string[] };

export async function axeScreen(page: Page, name: string, profile: string): Promise<A11yHit[]> {
  const r = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
  // `target-size` measures a target at the CURRENT scroll position: a row cut by the fixed toolbar / tab bar at the viewport's edge is
  // «partially obscured» there and full-size (48 dp) once scrolled to - not a size of ours; such nodes are listed apart, never failed
  const obscured = (n: { any: { data?: unknown }[] }) => n.any.some((c) => /obscured/i.test(JSON.stringify(c.data ?? '')));
  const all: A11yHit[] = r.violations.map((v) => ({ rule: v.id, impact: v.impact ?? null, help: v.help,
    targets: v.nodes.filter((n) => !(v.id === 'target-size' && obscured(n))).map((n) => n.target.map(String).join(' > ')) })).filter((v) => v.targets.length > 0);
  const edge = r.violations.filter((v) => v.id === 'target-size').flatMap((v) => v.nodes.filter(obscured).map((n) => n.target.map(String).join(' > ')));
  const path = new URL(page.url()).pathname;
  const failing = all.map((v) => ({ ...v, targets: v.targets.filter((t) => !excused(v.rule, t, path)) })).filter((v) => v.targets.length > 0);
  const known = all.flatMap((v) => v.targets.filter((t) => excused(v.rule, t, path)).map((t) => `${v.rule}: ${t}`));
  mkdirSync('screens/out/a11y', { recursive: true });
  writeFileSync(`screens/out/a11y/${name}__${profile}.json`, JSON.stringify({ screen: name, profile, url: page.url(), violations: failing, known, edgeObscured: edge }, null, 1));
  return failing;
}
