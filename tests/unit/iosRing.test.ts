import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** cloud_45 (A-169): the iOS ring's «oldest» and the order of its spots - scripts/ios_sim_tour.sh (CI only; the app stays 91d3654) */
const tour = readFileSync('scripts/ios_sim_tour.sh', 'utf8');
const at = (s: string) => { const i = tour.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };

describe('iOS ring (A-169)', () => {
  it('«oldest» = the LOWEST runtime of the ladder whose simulator STARTS this Xcode\'s build (measured per run, never the lowest present)', () => {
    expect(tour).toMatch(/^OLDEST_LADDER="17\.5 18\.0 18\.6"/m); // 16.4 proven dead (cloud_44: SwiftUICore); 15.5 not downloadable on Xcode 26.6
    expect(tour).not.toMatch(/for v in 15\.5 16\.4 17\.5; do/); // the old «download the lowest» list is gone
    // the launch stops waiting at the loader's own words (E6 of cloud_44: read the console first) and says so (exit 2)
    expect(tour).toMatch(/grep -aqE 'Library not loaded\|Symbol not found'/);
    expect(tour).toMatch(/return 2/);
    // a rung that cannot start the app is written with the loader's line and the next rung is tried; none = FAIL «start»
    expect(tour).toMatch(/cannot start this Xcode's simulator build/);
    expect(tour).toMatch(/a3 "start" FAIL "no rung of \$\{OLDEST_LADDER\} started the app/);
  });
  it('E8 of cloud_44: the live tap is the LAST spot of the walk - after «Перевірка Apple», «rating cast» and the walk\'s own «Трансляції» (A8)', () => {
    const live = at('a3 "live tap');
    for (const before of ['a3 "«Перевірка Apple» line (A1)" PASS', 'a3 "rating cast (A1)" PASS', 'a3 "notifications offer (A2)" PASS', 'a3 "screen $name (A8)" PASS'])
      expect(at(before), before).toBeLessThan(live);
    // an A2 offer still open is answered by ONE helper (the A8 frames and the live tap) - one copy of the selector
    expect(tour.match(/ion-alert\.soft-ask:not\(\.overlay-hidden\)/g)).toHaveLength(1);
    expect(tour.slice(at('a3 "screen $name (A8)" PASS') - 4000, live)).toMatch(/answer_offers/);
    expect(tour.slice(live - 1500, live)).toMatch(/answer_offers/);
  });
  it('ring 45062829310 (FAIL x4): after the gallery links (a card PUSHED by the link router) the card\'s own arrow first - then `go` is a plain one', () => {
    // the remote hand's `go` = a popstate (POP); Ionic's router reads a POP over a pushed route as BACK (-> /home, the frame of «Перевірка Apple»)
    const links = at('a3 "gallery link $f (A-166)" PASS'), apple = at('nav go /more/about; sleep 3');
    expect(tour.slice(links, apple)).toMatch(/done\n(?:\s+#[^\n]*\n)*\s+nav click '\[data-testid="back"\]'; sleep 3\n/);
  });
});
