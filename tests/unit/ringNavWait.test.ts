import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** REVIEW cloud_41 (the release ring's red «dark theme» spot: a click 1 s after `nav go` on the slowest simulator) - every `nav click`
 *  that follows a `nav go` on the same line waits for its target first (`nav wait '<css>'`, which asks up to its timeout). */
describe('the ring scripts: no blind click after a navigation', () => {
  for (const f of ['scripts/ios_sim_tour.sh', 'scripts/store_lib.sh']) it(f, () => {
    const bad = readFileSync(f, 'utf8').split('\n').map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /nav go [^;]+;\s*sleep \d+;\s*nav click/.test(l)).map(([n, l]) => `${n}: ${l.trim()}`);
    expect(bad).toEqual([]);
  });
});
