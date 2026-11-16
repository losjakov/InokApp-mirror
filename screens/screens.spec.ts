import { test, expect, type Page, type Route } from '@playwright/test';
import { onShown, settled, SHOWN, watchTransitions } from './settle';
import { A11Y_PROFILES, axeScreen } from './a11y';
import { ANDROID_UA, KYIV, jumpDrawn, localPictures, mapReady, picturesSettled, toastAboveTabs, benignPageError } from './shared';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { logoFacebook } from 'ionicons/icons';
const profilesJson = JSON.parse(readFileSync(new URL('./profiles.json', import.meta.url), 'utf8'));

type Profile = { viewport: { width: number; height: number }; deviceScaleFactor: number; colorScheme: 'light' | 'dark'; locale: string };
const profiles = profilesJson as Record<string, Profile>;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/** Each screen: route + what must be visible before the shot (so a screenshot is evidence, not decoration). */
/** D34 + D48: the card's action row, one rule for 5 and 6: every label WHOLE on ONE line, ≥ 8 px between two LABELS (the buttons' own
 *  padding), the first / last label ≥ 16 px from the row's ends (scrolled to the end when it scrolls), every button ≥ 48 px wide;
 *  `fits` = the row must NOT scroll (five on a 360-412 dp phone) and nothing is faded; else it scrolls and fades its end. */
const actionsRule = async (p: Page, n: number, fits?: boolean) => {
  const m = await p.locator('.actions').evaluate((row) => {
    const bs = Array.from(row.querySelectorAll('.actions__btn')); const rr = row.getBoundingClientRect();
    const texts = bs.map((b) => { const r = document.createRange(); r.selectNodeContents(b.querySelector('span')!); return r; });
    const lines = texts.map((r) => new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top))).size);
    const boxes = texts.map((r) => r.getBoundingClientRect());
    const gaps = boxes.slice(1).map((b, i) => Math.round(b.left - boxes[i].right));
    const mask = getComputedStyle(row).webkitMaskImage || getComputedStyle(row).maskImage;
    return { n: bs.length, lines, gaps, widths: bs.map((b) => Math.round(b.getBoundingClientRect().width)),
      start: Math.round(boxes[0].left - rr.left + row.scrollLeft), end: Math.round(row.scrollWidth - (boxes[boxes.length - 1].right - rr.left + row.scrollLeft)),
      scrolls: row.scrollWidth > row.clientWidth + 1, overflow: row.getAttribute('data-overflow'), faded: !!mask && mask !== 'none' };
  });
  expect(m.n).toBe(n);
  expect(m.lines.every((l) => l === 1), `labels on one line ${m.lines}`).toBe(true);
  expect(Math.min(...m.gaps), `gaps between labels ${m.gaps}`).toBeGreaterThanOrEqual(12); // D56: a visible gap at every scale
  expect(Math.min(...m.widths), `button widths ${m.widths}`).toBeGreaterThanOrEqual(48);
  expect(m.start, 'start inset').toBeGreaterThanOrEqual(16);
  expect(m.end, 'end inset').toBeGreaterThanOrEqual(16);
  expect({ overflow: m.overflow, faded: m.faded }, 'the fade only while the row overflows').toEqual({ overflow: m.scrolls ? '1' : '0', faded: m.scrolls });
  if (fits !== undefined) expect(m.scrolls, `${n} actions ${fits ? 'fit' : 'scroll'} (gaps ${m.gaps})`).toBe(!fits);
};
/** PLAN 5: a mini-map drawn (its MapLibre part loaded lazily, the style and our layers in), scrolled into view, `n` houses set */
/** A-117 (1): the CLUSTERED houses drawn (a cluster or a pin of the clustered source), not only the three lavras (own source) */
const housesDrawn = (p: Page) => expect.poll(() => p.evaluate(() => (window as any).__inokMap.queryRenderedFeatures({ layers: ['points', 'clusters'] }).length),
  { timeout: 15_000, message: 'clustered houses drawn' }).toBeGreaterThan(0).then(() => iconsReady(p));
/** NOTE 2 (REVIEW cloud_36): every pin drawn carries its registered site icon (the plain green drop = `col` - the site's community, the
 *  cyan arc = `_stavro`: the site's own marks, never a pin waiting for its picture) */
const iconsReady = async (p: Page) => {
  const missing = await p.evaluate(() => { const m = (window as any).__inokMap;
    return m.queryRenderedFeatures({ layers: ['points', 'lavras'] }).map((f: any) => f.properties.icon).filter((i: string) => !i || !m.hasImage(i)); });
  expect(missing, 'pins drawn without their icon').toEqual([]);
};
/** A-117 (2): the kind tab that is active (the segment's value + TalkBack's «selected») */
const entryKind = async (p: Page, kind: string) => {
  await expect(onShown(p, `kind-tab-${kind}`)).toHaveClass(/segment-button-checked/);
};
const toAll = async (p: Page) => { await onShown(p, 'kind-tab-all').click(); await entryKind(p, 'all'); };
const miniReady = async (p: Page, testId: string, n: string) => {
  const box = onShown(p, testId);
  await box.scrollIntoViewIfNeeded();
  await expect(box.locator('[data-testid="minimap-canvas"]')).toHaveAttribute('data-ready', '1', { timeout: 20_000 });
  if (n !== '0') await expect(box.locator('[data-testid="minimap-canvas"]')).toHaveAttribute('data-markers', n);
  await expect(box.locator('[data-testid="minimap-canvas"]')).toHaveAttribute('data-drawn', '1', { timeout: 20_000 }); // D61: MapLibre `idle`, not a timer
};
/** THE way a screen serves a changed export: the fixture as it is, `edit` applied, the manifest's hash / size / count to match */
const withExport = (edit: (d: any) => void) => async (p: Page) => {
  const d = JSON.parse(readFileSync(new URL('../fixtures/directory_v1.json', import.meta.url), 'utf8'));
  edit(d);
  const gz = gzipSync(Buffer.from(JSON.stringify(d)));
  const man = JSON.parse(readFileSync(new URL('../fixtures/manifest.json', import.meta.url), 'utf8'));
  man.files[0].sha256 = createHash('sha256').update(gz).digest('hex'); man.files[0].bytes = gz.length;
  man.counts.monasteries = d.monasteries.length;
  await p.route('**/fixtures/manifest.json', (r) => r.fulfill({ json: man }));
  await p.route('**/fixtures/directory_v1.json.gz', (r) => r.fulfill({ body: gz, contentType: 'application/gzip' }));
};
/** PLAN 6: the export as it is + `n` copies of its houses under new codes (the list then spans several pages of 30) */
const withMany = (n: number) => withExport((d) => {
  const base = d.monasteries.slice(); // copies of the ORIGINAL houses only (the array grows below)
  for (let i = 0; i < n; i++) {
    const m = JSON.parse(JSON.stringify(base[i % base.length]));
    m.code = 20000 + i; m.parent_code = null; m.units = { uk: [], ru: [], en: [] }; m.sort = 500; // a copy is never a lavra (A-44)
    for (const l of ['uk', 'ru', 'en']) if (m.name?.[l]) m.name[l] = `${m.name[l]} ${i + 1}`;
    d.monasteries.push(m);
  }
});
/** «нет фото» (A-29): the export as it is, but the named houses without a list picture (the site's `small/default.webp` rule → null) */
const withoutThumb = (codes: number[]) => withExport((d) => { for (const m of d.monasteries) if (codes.includes(m.code)) m.thumb = null; });
/** D46 (REVIEW cloud_09): the filter button's badge sits INSIDE the button's box, ≥ 4 px from the screen's edge, and covers ≤ 20 % of the
 *  icon's DRAWN glyph (the union of its SVG shapes inside the shadow root — not the ion-icon's box, which is larger than the glyph). */
const badgeRule = async (p: Page) => {
  const m = await p.locator('ion-header').locator('visible=true').getByTestId('filters-open').evaluate((b) => {
    const bb = b.getBoundingClientRect(); const d = b.querySelector('.toolbar__badge')!.getBoundingClientRect();
    const shapes = Array.from(b.querySelector('ion-icon')!.shadowRoot!.querySelectorAll('path, circle, line, rect, polyline, ellipse')).map((e) => e.getBoundingClientRect());
    const g = { l: Math.min(...shapes.map((r) => r.left)), r: Math.max(...shapes.map((r) => r.right)), t: Math.min(...shapes.map((r) => r.top)), b: Math.max(...shapes.map((r) => r.bottom)) };
    const cover = Math.max(0, Math.min(g.r, d.right) - Math.max(g.l, d.left)) * Math.max(0, Math.min(g.b, d.bottom) - Math.max(g.t, d.top)) / ((g.r - g.l) * (g.b - g.t));
    const ring = parseFloat(getComputedStyle(b.querySelector('.toolbar__badge')!).boxShadow.match(/(\d+(\.\d+)?)px\s*$/)?.[1] ?? '0'); // the spread of its ring
    return { cover, inL: d.left - bb.left, inR: bb.right - d.right, inT: d.top - bb.top, inB: bb.bottom - d.bottom, edge: innerWidth - d.right - ring };
  });
  expect(Math.min(m.inL, m.inR, m.inT, m.inB), `badge inside the button ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(0);
  expect(m.edge, 'badge to the screen edge').toBeGreaterThanOrEqual(4);
  expect(m.cover, 'share of the drawn icon under the badge').toBeLessThanOrEqual(0.2);
};
/** D36: the rows whose lead icon is NOT centred on the first line of the value (±2 px) — [] = one alignment for every row. */
const leadOffsets = (p: Page, scope: string) => p.locator(`${scope} .info`).evaluateAll((rows) => rows.flatMap((row) => {
  const icon = row.querySelector('.info__icon'); const value = row.querySelector('.info__value');
  if (!icon || !value) return [];
  const r = document.createRange(); r.selectNodeContents(value); const first = r.getClientRects()[0]; const ib = icon.getBoundingClientRect();
  const d = Math.round((ib.top + ib.height / 2) - (first.top + first.height / 2));
  return Math.abs(d) > 2 ? [`${row.getAttribute('data-testid') ?? row.textContent?.slice(0, 20)}: ${d}px`] : [];
}));
/** D35 (REVIEW cloud_08, reopened): every house's PIN (36 px, anchored at its bottom centre) / cluster inside the view with at least a
 *  pin's width to every edge, below the scope chip, left of the zoom buttons; and the houses' extent spans ≥ half the view's width
 *  (or its height when the eparchy is taller than wide) — or the max zoom is reached (one house / a tight group). */
/**
 * D53: the DRAWN box of every house mark on a map (`__inokMap` / `__inokMiniMap`) - a pin = its own image's size standing on its point,
 * a cluster = its circle (16 / 20 / 26 by count) + its 2 px ring - and how many of the basemap's labels sit under any of them.
 */
const drawnMarks = (p: Page, global: '__inokMap' | '__inokMiniMap') => p.evaluate((g) => {
  const map = (window as any)[g]; const c = map.getContainer().getBoundingClientRect();
  const ours = ['points', 'lavras', 'clusters', 'cluster-count', 'place', 'points-selected', 'lavras-selected'];
  const feats = map.queryRenderedFeatures({ layers: ['points', 'lavras', 'clusters'] });
  const boxes = feats.map((f: any) => {
    const q = map.project(f.geometry.coordinates);
    if (f.layer.id === 'clusters') { const n = f.properties.point_count; const r = (n >= 50 ? 26 : n >= 10 ? 20 : 16) + 2; return { l: q.x - r, r: q.x + r, t: q.y - r, b: q.y + r }; }
    const im = map.getImage(f.properties.icon); const w = im.data.width / im.pixelRatio; const h = im.data.height / im.pixelRatio;
    return { l: q.x - w / 2, r: q.x + w / 2, t: q.y - h, b: q.y };
  });
  const under = boxes.flatMap((b: any) => map.queryRenderedFeatures([[b.l, b.t], [b.r, b.b]])
    .filter((f: any) => f.layer.type === 'symbol' && !ours.includes(f.layer.id) && f.layer.layout?.['text-field'])
    .map((f: any) => `${f.layer.id}: ${f.properties.name ?? ''}`));
  const edge = (k: 'l' | 'r' | 't' | 'b', pick: (...v: number[]) => number) => pick(...boxes.map((b: any) => b[k]));
  return { n: feats.length, z: map.getZoom(), w: c.width, h: c.height, l: edge('l', Math.min), r: edge('r', Math.max), t: edge('t', Math.min), b: edge('b', Math.max), under: [...new Set(under)] };
}, global);
/** A-40 (owner 03.11): the article's lead (анонс) after the date and before the text - one block, italic, a thin brand line at the left, the body's size */
const leadShown = async (p: Page) => {
  const lead = onShown(p, 'article').locator('.aview__lead');
  await expect(lead).toContainText('Незвичайне місце');
  const v = await onShown(p, 'article').evaluate((a) => {
    const kids = [...a.children]; const at = (sel: string) => kids.findIndex((k) => k.matches(sel));
    const l = a.querySelector('.aview__lead')!; const cs = getComputedStyle(l); const body = getComputedStyle(a.querySelector('.aview__body')!);
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim();
    const probe = document.createElement('i'); probe.style.color = brand; document.body.append(probe); const brandRgb = getComputedStyle(probe).color; probe.remove();
    return { order: [at('.card__sub'), at('.aview__lead'), at('.aview__body')], italic: cs.fontStyle, line: cs.borderLeftWidth, color: cs.borderLeftColor, brandRgb,
      size: cs.fontSize === body.fontSize, inBody: (a.querySelector('.aview__body')!.textContent ?? '').includes('Незвичайне місце з ще більш') };
  });
  expect(v.order[0] < v.order[1] && v.order[1] < v.order[2], `date < lead < text ${JSON.stringify(v.order)}`).toBe(true);
  expect(v).toMatchObject({ italic: 'italic', line: '3px', size: true, inBody: false });
  expect(v.color, 'the brand colour').toBe(v.brandRgb);
};
const scopeFit = async (p: Page) => {
  // cloud_16 (CI 41821788267: the pins stable two frames, then 0 at the next read - a re-placement on a slow runner): settle + measure as ONE step, repeated
  // cloud_29 (CI screens 43158730532, phone-light, 2.4 s instead of 4-6): the map stood idle at its first view (zoom 3.78) with the pins drawn
  // BEFORE the eparchy's rows arrived and `fitHouses` ran - the wait above passed early. An unfitted extent is read again 1.5 s later (3 reads);
  // a map that never fits still fails with its extent.
  for (let i = 0; ; i++) {
    try { return await scopeFitOnce(p); } catch (e) {
      if (i >= 2 || !/no marks drawn|extent \d+×\d+ of/.test(String(e))) throw e;
      await p.waitForTimeout(1500);
    }
  }
};
const scopeFitOnce = async (p: Page) => {
  // D45 / the old flake of map-eparchy tablet (run 41337156431, «n: 0»): a fixed 600 ms did not cover the re-tiling of the clustered source
  // after the re-fit on a slow runner. Wait on the map's own state: not moving, both house sources loaded, the same pins drawn two frames running.
  await p.waitForFunction(() => new Promise<boolean>((res) => {
    const map = (window as any).__inokMap;
    const n = () => map.queryRenderedFeatures({ layers: ['points', 'lavras', 'clusters'] }).length;
    const ok = () => !map.isMoving() && map.isSourceLoaded('monasteries') && map.isSourceLoaded('lavras');
    if (!ok()) { res(false); return; }
    const a = n(); requestAnimationFrame(() => requestAnimationFrame(() => res(ok() && a > 0 && n() === a)));
  }), null, { timeout: 20_000 });
  const v = await p.evaluate(() => {
    const map = (window as any).__inokMap; const c = map.getContainer().getBoundingClientRect();
    const chip = document.querySelector('[data-testid="map-scope"]')?.getBoundingClientRect() ?? { bottom: c.top }; // D58(в): the whole map has no chip
    const zoom = document.querySelector('.maplibregl-ctrl-top-right')!.getBoundingClientRect();
    const feats = map.queryRenderedFeatures({ layers: ['points', 'lavras', 'clusters'] });
    const xs = feats.map((f: any) => map.project(f.geometry.coordinates).x); const ys = feats.map((f: any) => map.project(f.geometry.coordinates).y);
    const order = map.getStyle().layers.map((l: any) => l.id);
    return { n: feats.length, spanX: Math.max(...xs) - Math.min(...xs), spanY: Math.max(...ys) - Math.min(...ys), w: c.width, h: c.height,
      chipBottom: chip.bottom - c.top, zoomLeft: zoom.left - c.left, zoomBottom: zoom.bottom - c.top, z: map.getZoom(), countAbove: order.indexOf('cluster-count') > order.indexOf('lavras') };
  });
  const d = await drawnMarks(p, '__inokMap'); // D53: the DRAWN marks, the same measure as the mini-maps
  const m = { ...v, l: d.l, r: d.r, t: d.t, b: d.b };
  if (m.n === 0 || d.n === 0) throw new Error('no marks drawn at the read (re-placement)');
  expect(m.n).toBeGreaterThan(0);
  expect(d.under, 'no basemap label under a pin or a cluster').toEqual([]);
  expect(m.l, 'left margin ≥ a pin').toBeGreaterThanOrEqual(36);
  expect(m.w - m.r, 'right margin ≥ a pin').toBeGreaterThanOrEqual(36);
  expect(m.h - m.b, 'bottom margin ≥ a pin').toBeGreaterThanOrEqual(36);
  expect(m.t - m.chipBottom, 'clear of the scope chip by a pin').toBeGreaterThanOrEqual(36);
  if (m.t < m.zoomBottom) expect(m.r, 'clear of the zoom buttons').toBeLessThanOrEqual(m.zoomLeft);
  const filled = m.spanX >= m.w / 2 || m.spanY >= (m.h - m.chipBottom) / 2;
  expect(filled || m.z >= 10.99, `extent ${Math.round(m.spanX)}×${Math.round(m.spanY)} of ${m.w}×${m.h}, zoom ${m.z.toFixed(2)}`).toBe(true);
  expect(m.countAbove, 'cluster count above the lavras').toBe(true);
};
/** A-25 #2 / D42: two more channels live than the fixture (5 > 3) */
const livePlus2 = async (p: Page) => {
  // A-25 #2: more than 3 live → the shared MoreButton with the hidden count unfolds the whole list
      await p.route('**/fixtures/live-status.json', async (r) => {
        const j = JSON.parse(readFileSync('fixtures/live-status.json', 'utf8'));
        const extra = JSON.parse(readFileSync('fixtures/directory_v1.json', 'utf8')).channels.map((c: { id: number }) => c.id)
          .filter((id: number) => !j.live.some((l: { channel_id: number }) => l.channel_id === id)).slice(0, 2);
        j.live.push(...extra.map((id: number) => ({ ...j.live[0], channel_id: id, video_id: `x${id}` })));
        await r.fulfill({ body: JSON.stringify(j), contentType: 'application/json' });
      });
};
/** D43: row 1 = «N обителей» … «Єпархії», one line, never wrapped; row 2 (only with active filters) = the chips, ONE line (sideways scroll). */
const filterRows = async (p: Page, chips: number) => {
  const m = await p.evaluate(() => {
    const vis = (e: Element | null) => !!e && e.getClientRects().length > 0;
    const row = Array.from(document.querySelectorAll('[data-testid="filters-row"]')).find(vis)!;
    const lines = (e: Element) => { const r = document.createRange(); r.selectNodeContents(e); return new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top))).size; };
    const ep = row.querySelector('[data-testid="eparchies-open"] ion-label')!; const cnt = row.querySelector('[data-testid="count"]')!;
    const chipsBox = Array.from(document.querySelectorAll('[data-testid="active-chips"]')).find(vis) ?? null;
    const chipTops = chipsBox ? Array.from(chipsBox.querySelectorAll('ion-chip')).map((c) => Math.round(c.getBoundingClientRect().top)) : [];
    const rb = row.getBoundingClientRect(); const eb = row.querySelector('[data-testid="eparchies-open"]')!.getBoundingClientRect();
    return { epLines: lines(ep), cntLines: lines(cnt), rowH: Math.round(rb.height), epInside: eb.right <= rb.right + 1, chipTops, chipsBelow: chipsBox ? chipsBox.getBoundingClientRect().top >= rb.bottom - 1 : true };
  });
  expect(m.epLines, '«Єпархії» on one line').toBe(1);
  expect(m.cntLines, '«N обителей» on one line').toBe(1);
  expect(m.epInside, '«Єпархії» inside the row').toBe(true);
  expect(m.rowH, 'row 1 = one chip high').toBeLessThanOrEqual(52);
  expect(m.chipTops.length).toBe(chips);
  expect(new Set(m.chipTops).size, 'the chips on ONE line').toBeLessThanOrEqual(1);
  expect(m.chipsBelow, 'the chips row under row 1').toBe(true);
};
/** D13: the card's fact rows in the site's order (official name … head's document); returns the labels' first-index chain. */
const cardOrder = async (p: Page) => {
  if ((await p.evaluate(() => document.documentElement.lang)) !== 'uk') return; // the labels below are the uk ones
  const labels = await p.getByTestId('infos').locator('.info__label').allTextContents();
  const at = (s: string) => labels.findIndex((l) => l.startsWith(s));
  const chain = ['Офіційна назва', 'За статтю насельників', 'Телефони', 'Сайт', 'Адреса', 'GPS', 'Заснований', 'Керівник'].map(at);
  expect(chain.every((x, i) => x >= 0 && (i === 0 || chain[i - 1] < x)), labels.join(' | ')).toBe(true);
};
/** `tall`: the viewport height for a whole-card shot (Ionic scrolls inside ion-content, so fullPage shows one viewport only). */
/** R-16 / D20: real pictures (channel avatars, covers) loaded before the shot — at least `n` under `sel`. */
const picturesLoaded = async (p: Page, sel: string, n = 1) => {
  await expect.poll(() => p.evaluate((q) => Array.from(document.querySelectorAll<HTMLImageElement>(q)).filter((i) => i.complete && i.naturalWidth > 0).length, sel), { timeout: 25_000 }).toBeGreaterThanOrEqual(n);
};
const avatarsLoaded = (p: Page, n = 1) => picturesLoaded(p, '.chav__img img', n);
/** The RENDERED pixels of a page region: a clip of the real screenshot, decoded in the page (RGB triples, row by row). */
const clipPixels = async (p: Page, clip: { x: number; y: number; width: number; height: number }): Promise<number[][]> => {
  const png = (await p.screenshot({ clip })).toString('base64');
  return p.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data; const out: number[][] = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
    return out;
  }, png);
};
/** D18: the rendered colour at the centre of the tab bar's live dot (a 2×2 clip of the real screenshot). */
const dotPixel = async (p: Page) => {
  const r = await p.getByTestId('tab-live').evaluate((e) => { const b = e.getBoundingClientRect(); const x = b.x + b.width / 2 - 1, y = b.y + b.height / 2 - 1;
    return { x, y, covered: !document.elementFromPoint(x + 1, y + 1)?.closest('ion-tab-bar') }; });
  if (r.covered) return null; // a sheet / modal lies over the tab bar: the dot is not drawn on this shot
  const px = await clipPixels(p, { x: r.x, y: r.y, width: 2, height: 2 }); const side = Math.sqrt(px.length); // 2×2 css px × the device scale
  return px[Math.floor(side / 2) * side + Math.floor(side / 2)];
};
/** WCAG 2.x contrast of two sRGB colours */
const wcag = (a: number[], b: number[]) => {
  const lum = (c: number[]) => c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05);
};
/** F3 (REVIEW cloud_25): the contrast of what is DRAWN in a box - the background = its most frequent pixel, the ink = the pixel farthest from it */
const drawnContrast = async (p: Page, box: { x: number; y: number; width: number; height: number }) => {
  const px = await clipPixels(p, box);
  const n = new Map<string, number>(); for (const c of px) n.set(c.join(), (n.get(c.join()) ?? 0) + 1);
  const bg = [...n.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  const ink = px.reduce((best, c) => (wcag(c, bg) > wcag(best, bg) ? c : best), bg);
  const hex = (c: number[]) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return { ratio: Math.round(wcag(ink, bg) * 100) / 100, ink: hex(ink), bg: hex(bg) };
};
/** A-87 (2): where the kind tabs sit in the list's scroller (phone: `ion-content`, tablet: the list pane) - `offset` = their top below the
 *  scroller's top edge (0 = pinned there) */
const kindsAt = (p: Page) => p.locator(SHOWN).getByTestId('kinds').evaluate((k) => {
  const pane = k.closest('.split__pane') as HTMLElement | null; const host = pane ?? (k.closest('ion-content') as HTMLElement);
  const sc = (pane ?? host.shadowRoot!.querySelector('.inner-scroll')) as HTMLElement;
  return { scroll: Math.round(sc.scrollTop), max: sc.scrollHeight - sc.clientHeight, offset: Math.round(k.getBoundingClientRect().top - host.getBoundingClientRect().top) };
});
/** real wheel events over the list, then the scroller at rest */
const wheelList = async (p: Page, dy: number, n = 1) => {
  const b = (await p.locator(SHOWN).getByTestId('articles').boundingBox())!;
  await p.mouse.move(b.x + Math.min(b.width / 2, 150), Math.min(b.y + 200, (p.viewportSize()!.height * 2) / 3));
  for (let i = 0; i < n; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(40); }
  let last = -1;
  await expect.poll(async () => { const t = (await kindsAt(p)).scroll; const same = t === last; last = t; return same; }, { intervals: [150] }).toBe(true);
};
/** A-96 W-8 (replaces A-87 (3)): the DRAWN label of each kind tab - every inactive tab grey (no gold any more), the active one the normal blue */
const kindInks = async (p: Page) => {
  const out: Record<string, { ratio: number; ink: string; bg: string; tone: string }> = {};
  for (const k of ['all', 'publication', 'video', 'news']) {
    const b = (await p.locator(SHOWN).getByTestId(`kind-tab-${k}`).locator('ion-label').boundingBox())!;
    const c = await drawnContrast(p, { x: b.x, y: b.y, width: b.width, height: b.height });
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(c.ink.slice(i, i + 2), 16));
    out[k] = { ...c, tone: r - bl > 40 && g - bl > 20 ? 'gold' : bl - r > 40 ? 'blue' : Math.abs(r - bl) < 25 ? 'grey' : `other ${c.ink}` };
  }
  return out;
};
/** A-64 / A-67: the browser plays the phone's notification permission (src/native/push.ts `inok.push`), set before the app starts */
const pushPerm = (v: 'prompt' | 'denied' | 'granted') => async (p: Page) => { await p.addInitScript((x) => { if (!sessionStorage.getItem('inok.push.set')) { localStorage.setItem('inok.push', x); sessionStorage.setItem('inok.push.set', '1'); } }, v); };
/** a fixture answer read on the way to rewrite it; null = the page dropped the request meanwhile («Response has been disposed», CI screens
 *  42474628384 + locally, 1 in ~500): it goes on untouched and the handler stops (a route flake, never the app's fault) */
const fixtureJson = async (r: Route) => {
  try { return await (await r.fetch()).json(); } catch { await r.continue().catch(() => {}); return null; }
};
/** an in-app jump (the router's own popstate listener, a fresh history key - REF_gotchas_2 «history»): the SAME launch, never a reload */
const inAppGo = (p: Page, path: string) => p.evaluate((x) => { const st = { key: Math.random().toString(36).slice(2, 8) }; history.pushState(st, '', x); dispatchEvent(new PopStateEvent('popstate', { state: st })); }, path);
/** N7 (REVIEW cloud_22): «· 👁 N» never splits - at EVERY width of the meta line (200..420 px, 4 px steps) the dot before the eye sits on
 *  the eye's line; the line's own width is restored after */
const eyeKeepsDot = async (p: Page, page: string) => {
  const bad = await onShown(p, page).getByTestId('views').evaluate((eye) => {
    const line = eye.closest('p') as HTMLElement; const was = line.style.width; const out: number[] = [];
    for (let w = 200; w <= 420; w += 4) {
      line.style.width = `${w}px`;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT); let dot: Range | null = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (eye.contains(n) || (eye.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
        const i = (n.textContent ?? '').lastIndexOf('·'); if (i >= 0) { dot = document.createRange(); dot.setStart(n, i); dot.setEnd(n, i + 1); }
      }
      if (dot && Math.abs(dot.getBoundingClientRect().top - eye.getBoundingClientRect().top) > 6) out.push(w);
    }
    line.style.width = was; return out;
  });
  expect(bad, 'widths where the dot stayed behind the eye').toEqual([]);
};
/** owner 12.11.2026 (cloud_29, his P30 Pro screenshot: «· 👁 2007» wrapped alone under «Київська єпархія»): on the MONASTERY card the eye
 *  stands at the right edge of the card's line at EVERY width (200..420 px, 4 px steps), its bottom on the place line's last line, never over
 *  the text, and no « · » before it; the row's own width is restored after */
const eyeRight = async (p: Page, page: string) => {
  const bad = await onShown(p, page).getByTestId('views').evaluate((eye) => {
    if (eye.closest('p')) return ['the eye inside the meta line, after a « · »']; // 1.0.4: «· 👁 N», wrapped alone on a narrow phone
    const row = eye.parentElement as HTMLElement; const line = row.querySelector('p') as HTMLElement; const was = row.style.width; const out: string[] = [];
    if (/·\s*$/.test(line.textContent ?? '')) out.push('a « · » before the eye');
    for (let w = 200; w <= 420; w += 4) {
      row.style.width = `${w}px`;
      const r = row.getBoundingClientRect(); const e = eye.getBoundingClientRect(); const l = line.getBoundingClientRect();
      if (Math.abs(r.right - e.right) > 1) out.push(`${w}: ${Math.round(r.right - e.right)} px from the right`);
      if (Math.abs(l.bottom - e.bottom) > 2) out.push(`${w}: bottom ${Math.round(l.bottom - e.bottom)} px off the last line`);
      if (e.left < l.right) out.push(`${w}: over the text`);
    }
    row.style.width = was; return out;
  });
  expect(bad, 'widths where the eye left the right edge / the last line').toEqual([]);
};
/** A-96 W-2: «town · oblast» = line 1 without a trailing « · »; the eparchy link starts ITS OWN line (top at / under line 1's bottom) at every
 *  width 200..800 px (the tablet pane included), and the eye stays on the link's last line (eyeRight checks the edge) */
const placeTwoLines = async (p: Page, page: string) => {
  const bad = await onShown(p, page).getByTestId('card-place1').evaluate((l1) => {
    const out: string[] = []; const a = l1.parentElement!.querySelector('.card__eparchy') as HTMLElement; const row = l1.closest('.card__subrow') as HTMLElement;
    if (/·\s*$/.test(l1.textContent ?? '')) out.push('a « · » after the oblast');
    if (!a) return ['no eparchy link'];
    const was = row.style.width;
    for (let w = 200; w <= 800; w += 8) {
      row.style.width = `${w}px`;
      const txt = document.createRange(); txt.selectNodeContents(a); // the link's TEXT (its box carries a 24 px target's padding)
      if (txt.getClientRects()[0].top < l1.getBoundingClientRect().bottom - 1) out.push(`${w}: the eparchy on line 1`);
    }
    row.style.width = was; return out;
  });
  expect(bad, 'A-96 W-2 place lines').toEqual([]);
};
/** A-78 2 (owner 09.11: «глазок с цифрой както приподняты над строкой»): the eye ON the meta line - the number's baseline = the line's text
 *  baseline (± 1 px; zero-size probes on the baseline before the dot «·» and after the number), the icon's middle on the digits' band (between
 *  0.2 em and 0.5 em above the baseline; 1.0.2's inline-flex put its BOTTOM on the baseline = 0.55 em); icon AND number in THE token
 *  `--inok-eye`, the A-78 values (light #8a6a12, dark #c4a24e). */
const EYE = { light: 'rgb(138, 106, 18)', dark: 'rgb(196, 162, 78)' };
/** A-78 3: THE star token - light #b37d00 (1.0.2's #f2a900 = 2.01:1 on white failed WCAG 1.4.11), dark #f2a900: the computed colour of
 *  every element `sel` and of the drawn icon's stroke / fill (an unrated outline is a STROKE in the icon's shadow svg) */
const STAR = { light: 'rgb(179, 125, 0)', dark: 'rgb(242, 169, 0)' };
const starColours = async (p: Page, sel: string, n: number) => {
  const r = await p.locator(sel).locator('visible=true').evaluateAll((es) => ({ dark: document.documentElement.classList.contains('ion-palette-dark'),
    token: getComputedStyle(document.documentElement).getPropertyValue('--inok-star').trim(), cs: es.map((e) => getComputedStyle(e).color) }));
  expect(r.token).toBe(r.dark ? '#f2a900' : '#b37d00');
  expect(r.cs).toEqual(Array(n).fill(STAR[r.dark ? 'dark' : 'light']));
};
const eyeOnLine = async (p: Page, page: string) => {
  const r = await onShown(p, page).getByTestId('views').evaluate((eye) => {
    // the article: the eye INSIDE its meta line; the monastery card (owner 12.11.2026): beside it, on its LAST line
    const inside = eye.closest('p'); const line = (inside ?? eye.parentElement!.querySelector('p')) as HTMLElement;
    const probe = (host: Element, first = false) => { const i = document.createElement('i'); i.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'; if (first) host.prepend(i); else host.append(i); const y = i.getBoundingClientRect().top; i.remove(); return y; };
    const em = parseFloat(getComputedStyle(eye).fontSize);
    const base = inside ? probe(eye.closest('.meta__stick') ?? line, true) : probe(line); const num = probe(eye.querySelector('span')!); // the line's baseline = the dot's (N7: always on the eye's line)
    const ic = eye.querySelector('ion-icon')!.getBoundingClientRect();
    return { dy: num - base, mid: (base - (ic.top + ic.height / 2)) / em, dark: document.documentElement.classList.contains('ion-palette-dark'),
      token: getComputedStyle(document.documentElement).getPropertyValue('--inok-eye').trim(),
      num: getComputedStyle(eye.querySelector('span')!).color, icon: getComputedStyle(eye.querySelector('ion-icon')!).color };
  });
  expect(Math.abs(r.dy), `number baseline vs the line's (${r.dy} px)`).toBeLessThanOrEqual(1);
  expect(r.mid, 'icon middle above the baseline, in em').toBeGreaterThanOrEqual(0.2);
  expect(r.mid, 'icon middle above the baseline, in em').toBeLessThanOrEqual(0.5);
  expect(r.token).toBe(r.dark ? '#c4a24e' : '#8a6a12');
  expect({ num: r.num, icon: r.icon }).toEqual({ num: EYE[r.dark ? 'dark' : 'light'], icon: EYE[r.dark ? 'dark' : 'light'] });
};
/** the soft question of that kind, on screen after its delay */
const softAsk = async (p: Page, kind: 'articles' | 'streams') => {
  const d = p.locator(`ion-alert.soft-ask--${kind}`);
  await expect(d).toBeVisible({ timeout: 10_000 });
  await expect(d.locator('.alert-button').first()).toBeVisible();
  return d;
};
/** N6 (REVIEW cloud_22): no empty band - the first answer starts right under the title (or under the message, when there is one) */
const noBand = async (d: ReturnType<Page['locator']>) => {
  const gap = await d.evaluate((el) => {
    const msg = el.querySelector('.alert-message') as HTMLElement | null;
    const above = msg && msg.getClientRects().length ? msg : el.querySelector('.alert-title')!;
    return el.querySelector('.alert-button')!.getBoundingClientRect().top - above.getBoundingClientRect().bottom;
  });
  expect(gap, 'title / message -> first answer, px').toBeLessThanOrEqual(12);
};
/** the app's words for keys, in the language the page shows (its own i18n table, never a copy here) */
const I18N = Object.fromEntries(['uk', 'ru', 'en'].map((l) => [l, JSON.parse(readFileSync(new URL(`../src/i18n/${l}.json`, import.meta.url), 'utf8')) as Record<string, string>]));
/** the name TalkBack hears for an Ionic button: Ionic moves `aria-label` from the host to its inner native button (inheritAriaAttributes) */
const spokenName = (l: ReturnType<Page['locator']>) => l.evaluate((h) => h.getAttribute('aria-label') || h.shadowRoot?.querySelector('.button-native')?.getAttribute('aria-label') || '');
const words = async (p: Page, keys: string[]) => { const l = (await p.evaluate(() => document.documentElement.lang)) || 'uk'; return keys.map((k) => I18N[l][k]); };
/** A-64: the answers stacked, one per line, each whole on its line */
const stackedAnswers = async (d: ReturnType<Page['locator']>, n: number) => {
  const boxes = await d.locator('.alert-button').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), h: Math.round(r.height) })));
  expect(boxes.length).toBe(n);
  for (let i = 1; i < n; i++) expect(boxes[i].top, `answer ${i + 1} under answer ${i}`).toBeGreaterThanOrEqual(boxes[i - 1].top + boxes[i - 1].h - 1);
};
/** A-65: the views answer of some pages (the browser's fixtures server), the rest as the fixture */
const viewsFor = (map: Record<string, number | null>) => async (p: Page) => {
  await p.route('**/fixtures/views.json', async (r) => { const base = JSON.parse(readFileSync(new URL('../fixtures/views.json', import.meta.url), 'utf8'));
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...base, ...map }) }); });
};
/** A-65: a short dwell (gi / gn seconds) and a counter of the views sent (`window.__views`) */
const dwell = (gi: number, gn: number) => async (p: Page) => {
  await p.addInitScript(() => { (window as any).__views = 0; });
  await p.route('**/fixtures/views.json*', async (r) => {
    if (r.request().url().includes('?view=')) { await r.request().frame().evaluate(() => { (window as any).__views += 1; }).catch(() => {}); return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
    const base = JSON.parse(readFileSync(new URL('../fixtures/views.json', import.meta.url), 'utf8'));
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...base, __dwell: [gi, gn] }) });
  });
};
/** A-20: the network the photo rule sees in the browser (src/native/network.ts reads `localStorage['inok.net']` on the web only). */
const net = (n: { connected: boolean; metered: boolean; dataSaver: boolean }) => async (p: Page) => { await p.addInitScript((v) => localStorage.setItem('inok.net', v), JSON.stringify(n)); };
/** A-37 screens: what the app hands to the YouTube app (the web build calls window.open) — recorded, nothing leaves */
const recordOpens = async (p: Page) => { await p.addInitScript(() => { (window as any).__opened = []; window.open = ((u: string) => { (window as any).__opened.push(String(u)); return null; }) as typeof window.open; }); };
/** A-120 (1): «У соціальних мережах» = the LAST of the content (on «Про комісію» right above the share strip): its level-2 heading, three LINKS
 *  named by the network (TalkBack / VoiceOver «Telegram, посилання»), the logo hidden from the reader, each >= 48 x 48 and inside the
 *  screen, the caption whole (never cut) - also at 320 dp x font 200 %; a tap opens THE address by openLink (`open`) */
const SOCIAL = [['telegram', 'Telegram', 'https://t.me/inokinfo'], ['facebook', 'Facebook', 'https://www.facebook.com/inok.info'],
  ['instagram', 'Instagram', 'https://www.instagram.com/inok.info/']] as const;
const socialBlock = async (p: Page, commission: boolean, open: boolean) => {
  const block = onShown(p, 'social');
  await block.scrollIntoViewIfNeeded();
  await expect(block.getByRole('heading', { level: 2 })).toHaveText(/^(У соціальних мережах|В социальных сетях|On social media)$/);
  expect(await block.evaluate((b) => b.nextElementSibling?.getAttribute('data-testid') ?? 'none'), 'the block is the last of the content').toBe(commission ? 'share-footer' : 'none');
  await expect(block.getByRole('link')).toHaveCount(3);
  const vw = p.viewportSize()!.width;
  for (const [id, name, url] of SOCIAL) {
    const a = block.getByRole('link', { name, exact: true });
    await expect(a).toHaveAttribute('data-testid', `social-${id}`);
    await expect(a).toHaveAttribute('href', url);
    await expect(a.locator('ion-icon')).toHaveAttribute('aria-hidden', 'true');
    const m = await a.evaluate((e) => { const r = e.getBoundingClientRect(); const sp = e.querySelector('span')!; const rg = document.createRange(); rg.selectNodeContents(sp);
      const t = rg.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, r: r.right, tl: t.left, tr: t.right, lines: new Set(Array.from(rg.getClientRects()).map((x) => Math.round(x.top))).size }; });
    expect(Math.min(m.w, m.h), `${name}: the touch target ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(48);
    expect(m.l >= 0 && m.r <= vw + 0.5, `${name}: inside the screen ${JSON.stringify(m)}`).toBe(true);
    expect(m.tl >= m.l - 0.5 && m.tr <= m.r + 0.5 && m.lines === 1, `${name}: the caption whole inside its button ${JSON.stringify(m)}`).toBe(true);
  }
  const row = await onShown(p, 'social-row').evaluate((r) => ({ sw: r.scrollWidth, cw: r.clientWidth, wrap: (r as HTMLElement).dataset.wrap }));
  expect(row.sw, `no sideways overflow ${JSON.stringify(row)}`).toBeLessThanOrEqual(row.cw + 1);
  if (open) {
    for (const [, name, url] of SOCIAL) {
      await block.getByRole('link', { name, exact: true }).click();
      await expect.poll(() => p.evaluate(() => (window as any).__opened.at(-1))).toBe(url);
    }
  }
};
const opened = async (p: Page, testId: string): Promise<string> => {
  await expect(p.getByTestId('tab-live').first()).toBeAttached(); // the first live-status has arrived (A-37 decides from it)
  await p.getByTestId(testId).locator('visible=true').first().click();
  await expect.poll(() => p.evaluate(() => (window as any).__opened.length)).toBeGreaterThan(0);
  return p.evaluate(() => (window as any).__opened.pop());
};
/** font200: no word of the toolbar title broken across lines; no tab label cut (its text wider than its box) */
const chromeText = async (p: Page) => {
  const r = await p.evaluate(() => {
    const shown = (e: Element) => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === 'fixed';
    const broken: string[] = [];
    for (const h of Array.from(document.querySelectorAll('.toolbar__title')).filter(shown)) {
      const text = h.firstChild as Text | null;
      if (!text || text.nodeType !== 3) continue;
      const s = text.data; let i = 0;
      for (const w of s.split(/\s+/)) { const at = s.indexOf(w, i); i = at + w.length; if (!w) continue;
        const rg = document.createRange(); rg.setStart(text, at); rg.setEnd(text, at + w.length);
        if (new Set(Array.from(rg.getClientRects()).map((b) => Math.round(b.top))).size > 1) broken.push(w); }
    }
    const cut = Array.from(document.querySelectorAll('ion-tab-button ion-label')).filter(shown)
      .filter((l) => (l as HTMLElement).scrollWidth > (l as HTMLElement).clientWidth + 1 || (l as HTMLElement).getBoundingClientRect().right > (l.closest('ion-tab-button') as HTMLElement).getBoundingClientRect().right + 1)
      .map((l) => l.textContent);
    // the home tiles are navigation too: whole labels, all four inside the screen
    for (const t of Array.from(document.querySelectorAll('.tile')).filter(shown)) { const x = t.getBoundingClientRect(); if (x.right > innerWidth + 1 || (t as HTMLElement).scrollWidth > (t as HTMLElement).clientWidth + 1) cut.push(`tile: ${t.textContent}`);
      // D56: the label keeps the tile's inner padding (never at its edges)
      const rg = document.createRange(); rg.selectNodeContents(t); const lb = Array.from(rg.getClientRects()).filter((b) => b.width > 0);
      if (lb.some((b) => b.left - x.left < 5.5 || x.right - b.right < 5.5)) cut.push(`tile edge: ${t.textContent}`); }
    // and every tab inside the screen (the bar never scrolls a tab away)
    for (const b of Array.from(document.querySelectorAll('ion-tab-button')).filter(shown)) { const x = b.getBoundingClientRect(); if (x.left < -1 || x.right > innerWidth + 1) cut.push(`off-screen: ${b.textContent}`); }
    return { broken, cut };
  });
  expect(r, 'font200: title words whole, tab labels whole').toEqual({ broken: [], cut: [] });
};
/** the feed AND R-35's one item (the fixtures source asks `articles.json?item=<id>`): a screen that changes the feed changes both */
const FEED_AND_ITEM = /\/fixtures\/articles\.json(\?.*)?$/;
/** A-78 1: the app started BY a link (the browser ring's stand-in for the launch intent, `src/native/appLinks.ts`) */
const launchBy = (url: string, ms: number) => async (p: Page) => { await p.addInitScript(([u, m]) => { const o = sessionStorage.getItem('inok.launch'); (window as any).__inokLaunch = o ? JSON.parse(o) : { url: u, ms: m }; }, [url, ms] as const); };
const ruLang = async (p: Page) => { await p.addInitScript(() => localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ lang: 'ru' }))); };
/** the review profiles of a screen whose checks read Ukrainian words */
/** F2 (A-79 2, REVIEW cloud_24): the tablet's list-detail = TWO scrollers (Material list-detail). (1) the wheel over one pane moves that pane only -
 *  the other pane's anchor stays at its y; (2) tapping another row shows the new detail's TOP (its title in view) and the list did not move.
 *  Red on 1.0.3: one scroller for both panes - the wheel moved the list with the detail, the next item opened at the old depth (mid-text). */
const twoPanes = async (p: Page, o: { wheel: 'list' | 'detail'; rows: string }) => {
  const page = p.locator(SHOWN);
  const rows = `.split__list [data-testid^="${o.rows}"]`;
  const title = '.split__detail .card__title';
  const y = async (sel: string) => Math.round(await page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top));
  await expect(page.locator(title).first()).toBeVisible();
  await expect(page.locator(rows).first()).toBeVisible();
  const box = (await page.locator(o.wheel === 'list' ? '.split__list' : '.split__detail').first().boundingBox())!;
  const other = o.wheel === 'list' ? title : rows;
  const before = { other: await y(other), self: await y(o.wheel === 'list' ? rows : title) };
  await p.mouse.move(box.x + box.width / 2, Math.min(box.y + box.height / 2, 900));
  await p.mouse.wheel(0, 900);
  await p.waitForTimeout(400);
  expect(await y(o.wheel === 'list' ? rows : title), `the wheel did not move the ${o.wheel}`).toBeLessThan(before.self - 100);
  expect(await y(other), `the ${o.wheel === 'list' ? 'detail' : 'list'} moved with the ${o.wheel}`).toBe(before.other);
  // the next item: an unselected row in the middle of the shown list
  const id = await page.locator(rows).evaluateAll((es) => {
    const mid = window.innerHeight / 2;
    const pick = es.filter((e) => !e.getAttribute('color')).map((e) => ({ id: e.getAttribute('data-testid')!, r: e.getBoundingClientRect() }))
      .filter((x) => x.r.top > 150 && x.r.bottom < window.innerHeight - 150).sort((a, b) => Math.abs(a.r.top - mid) - Math.abs(b.r.top - mid))[0];
    return pick?.id ?? null;
  });
  expect(id, 'a row to tap in the list').not.toBeNull();
  const rowY = await y(`[data-testid="${id}"]`);
  await page.locator(`[data-testid="${id}"]`).first().click();
  await settled(p);
  await p.waitForTimeout(300);
  const hdr = await page.locator('ion-header').first().evaluate((e) => Math.round(e.getBoundingClientRect().bottom));
  const t = await page.locator(title).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
  expect(t.top, `${id}: the new item opened mid-text (title at ${t.top}, toolbar ends at ${hdr})`).toBeGreaterThanOrEqual(hdr);
  expect(t.bottom).toBeLessThanOrEqual(p.viewportSize()!.height);
  expect(await y(`[data-testid="${id}"]`), 'the list moved on the tap').toBe(rowY);
};
/** A-80: Play in the browser ring - the plugin's calls mocked (`window.__inokPlay`, src/native/play.ts); `asked` = what the app called.
 *  `info` = Play's answer, or `'not_play'` (Play Core's -10: not installed from Play); `config` = the site's R-41 switch. */
const withPlay = (info: object | 'not_play' | null, config?: object) => async (p: Page) => {
  await p.addInitScript(([i, c]) => {
    const w = window as unknown as Record<string, unknown> & { __asked: string[] };
    w.__asked = [];
    if (c) w.__inokConfig = c;
    if (i === null) return;
    let cb: ((s: { installStatus: number }) => void) | null = null;
    w.__inokPlay = {
      getAppUpdateInfo: async () => { w.__asked.push('info'); if (i === 'not_play') throw new Error('-10: Install Error(-10): The app is not owned by any user on this device.'); return i; },
      openAppStore: async (o: object) => { w.__asked.push(`store ${JSON.stringify(o)}`); },
      performImmediateUpdate: async () => { w.__asked.push('immediate'); return { code: 0 }; },
      startFlexibleUpdate: async () => { w.__asked.push('flexible'); setTimeout(() => cb?.({ installStatus: 11 }), 300); return { code: 0 }; },
      completeFlexibleUpdate: async () => { w.__asked.push('complete'); },
      addListener: async (_e: string, f: (s: { installStatus: number }) => void) => { cb = f; return { remove: async () => { cb = null; } }; },
    };
  }, [info, config ?? null] as const);
};
/** F4: the day's update check already ran and the banner was shown a moment ago (the Preferences marks of src/state/updateOffer.ts) */
const sameDayMarks = (p: Page) => p.addInitScript(() => localStorage.setItem('CapacitorStorage.update_offer', JSON.stringify({ checkedAt: Date.now(), bannerAt: Date.now() })));
const asked = (p: Page) => p.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
const STORE_ON = { features: { comments_write: false, embedded_player: false, store_links: true } };
/** the banner = a toast anchored above the tab bar (D73): whole, above the bar, the tabs uncovered */
const bannerAboveTabs = async (p: Page, id: string) => {
  const b = p.locator(`ion-toast[data-testid="${id}"]`);
  await expect(b).toBeVisible({ timeout: 10_000 });
  const m = await b.evaluate((t) => {
    const w = t.shadowRoot!.querySelector('.toast-wrapper')!.getBoundingClientRect(); const bar = document.querySelector('ion-tab-bar')!.getBoundingClientRect();
    return { bottom: Math.round(w.bottom), bar: Math.round(bar.top) };
  });
  expect(m.bottom, 'the banner sits above the tab bar').toBeLessThanOrEqual(m.bar);
  return b;
};
/** F3 (REVIEW cloud_25, A-78 «every colour»): the banner's action, its label and «×» as DRAWN, >= 4.5:1 against the banner (light + dark) */
const bannerContrast = async (p: Page, id: string) => {
  const t = p.locator(`ion-toast[data-testid="${id}"]`);
  await p.waitForTimeout(600); // the toast's enter animation (opacity) is over before the pixels are read
  for (const [what, sel] of [['action', `[data-testid="${id}-do"]`], ['label', '.toast-message'], ['close', `[data-testid="${id}-close"]`]] as const) {
    const box = (await t.locator(sel).boundingBox())!;
    const c = await drawnContrast(p, box);
    expect(c.ratio, `${id} ${what}: ${c.ink} on ${c.bg}`).toBeGreaterThanOrEqual(4.5);
  }
};
const UK = ['phone-light', 'phone-dark', 'tablet'];
/** A-109 (R-49): every request of a card's gallery - the list (`monastery_photos.json?code=`) and the gallery files (`/images/monasteries/<code>/<file>`;
 *  the covers live under `og_img/` / `medium/` and are not counted) - recorded from the page's first request */
const galleryReqs = new WeakMap<Page, { list: string[]; photos: string[] }>();
const countGallery = async (p: Page) => {
  const r = { list: [] as string[], photos: [] as string[] }; galleryReqs.set(p, r);
  p.on('request', (q) => { const u = q.url(); if (u.includes('monastery_photos.json')) r.list.push(u); else { const m = /\/images\/monasteries\/(\d+\/[^/]+)$/.exec(u); if (m) r.photos.push(m[1]); } });
};
const gallery = (p: Page) => galleryReqs.get(p)!;
/** A-112: Wi-Fi off = mobile data (metered); the setting stays the default «Тільки Wi-Fi» */
const MOBILE = { connected: true, metered: true, dataSaver: false };
/** the card's cover loads first (the way into the gallery), THEN Wi-Fi goes off, THEN «Фотогалерея» */
const openCardGallery = async (p: Page) => {
  const card = onShown(p, 'card');
  await expect(card.getByTestId('gallery')).toHaveAttribute('data-in-app', '1', { timeout: 15_000 });
  await p.evaluate((v) => localStorage.setItem('inok.net', v), JSON.stringify(MOBILE));
  await card.getByTestId('gallery').click();
  await expect(p.getByTestId('viewer-count')).toContainText('1 / 40');
};
/** publication 1714's gallery (thumbnails load on any network), the viewer on its 3rd photo; returns the full files asked from now on */
const openArticleGallery = async (p: Page) => {
  const grid = onShown(p, 'article').getByTestId('gallery-grid');
  await expect(grid.locator('[data-testid="photo-open"]')).toHaveCount(5, { timeout: 15_000 });
  await grid.scrollIntoViewIfNeeded();
  const fulls: string[] = [];
  p.on('request', (r) => { if (/\/images\/articles\/1714\/\d\d\.jpg$/.test(r.url())) fulls.push(r.url().split('/').pop()!); });
  await grid.locator('[data-testid="photo-open"]').nth(2).click();
  await expect(p.getByTestId('viewer-count')).toContainText('3 / 5');
  return fulls;
};
/** A-112: THE standard block inside the open viewer */
const viewerBlock = (p: Page) => p.locator('ion-modal.viewer [data-testid="photo-wait"]');
/** the block never lies under the counter or «×» (or another control named) */
const clearOf = async (p: Page, block: ReturnType<Page['locator']>, ids = ['viewer-count', 'viewer-close']) => {
  await expect(block).toBeVisible();
  for (const id of ids) await expect.poll(async () => {
    const [b, o] = [await block.boundingBox(), await p.getByTestId(id).boundingBox()];
    return !!b && !!o && (b.x >= o.x + o.width || o.x >= b.x + b.width || b.y >= o.y + o.height || o.y >= b.y + b.height);
  }, `${id} clear of the block`).toBe(true);
};
/** a mouse swipe across the middle of an element (dx < 0 = to the next photo) */
const swipe = async (p: Page, el: ReturnType<Page['locator']>, dx: number) => {
  const r = (await el.boundingBox())!; const y = r.y + Math.min(r.height / 2, 30); const x = r.x + r.width / 2;
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y, { steps: 6 }); await p.mouse.up();
};
/** A-111: the browser ring's stand-in of the device's photo files (src/native/covers.ts `__inokPhotoStore`): `seed` = files already there. */
const photoStore = (seed: Record<string, number>) => async (p: Page) => { await p.addInitScript((s) => { (window as any).__inokPhotoStore = { bytes: 240_000, seed: s }; }, seed); };
/** weeks of use: two list thumbnails kept, three large photos (a card's cover, a publication's picture, a gallery photo) = 12,4 MB */
const SEED = { 'kept/242-t1.webp': 14_000, 'kept/a1714-t2.webp': 12_000, 'photos/242-c1.jpg': 3_100_000, 'photos/a1714-b1.jpg': 4_600_000, 'photos/242-g1.jpg': 4_700_000 };
const stored = (p: Page) => p.evaluate(() => { const k = [...((window as any).__inokPhotoStoreLive.files as Map<string, unknown>).keys()];
  return { kept: k.filter((x) => x.startsWith('kept/')).length, photos: k.filter((x) => x.startsWith('photos/')).length }; });
/** Ionic's button: the state TalkBack reads is the inner (shadow) button's (gotcha: roles and states live on Ionic's inner element) */
const innerDisabled = (b: ReturnType<Page['locator']>) => b.evaluate((h) => h.shadowRoot!.querySelector('button')!.disabled);
/** «Ще»'s photo block in view; waits until «зайнято» reads `used` (the store measured) and returns the button */
const photosBlock = async (p: Page, used: string | RegExp) => {
  const row = onShown(p, 'more-photos-clear');
  await row.scrollIntoViewIfNeeded();
  await expect(onShown(p, 'photos-used')).toHaveText(typeof used === 'string' ? new RegExp(`^${used} `) : used, { timeout: 10_000 });
  return onShown(p, 'photos-clear');
};
const viewerGone = (p: Page) => expect(p.locator('ion-modal.viewer')).toHaveCount(0, { timeout: 5000 }).catch(async () => expect(p.locator('ion-modal.viewer:not(.overlay-hidden)')).toHaveCount(0));

/** A-55 (A-54 withdrawn): NO row in `scope` carries a lead line - each label holds only the title, the subtitle, «kind · date» and the badges line
 *  (cloud_19's row); every line stays inside the row (cloud_20 200 %: a long word wraps, never runs off the edge). Returns the NEWS rows checked. */
const noLeads = async (p: Page, scope: string) => {
  const rows = await p.locator(`${scope} [data-testid^="arow-"]`).locator('visible=true').evaluateAll((es) => es.map((r) => {
    const label = r.querySelector('ion-label')!;
    const kids = [...label.children] as HTMLElement[];
    const allowed = kids.every((e) => e.matches('.mrow__title, .arow__subtitle, .mrow__sub'))
      && kids.filter((e) => e.matches('.mrow__sub')).length <= 2 && !label.querySelector('.arow__lead, [data-testid^="alead-"]');
    const out = kids.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => `${e.className} ${e.scrollWidth}>${e.clientWidth}`);
    const fits = label.getBoundingClientRect().right <= r.getBoundingClientRect().right + 1 && !out.length;
    return { kind: r.getAttribute('data-kind'), allowed, fits: fits || `${r.getAttribute('data-testid')} label ${Math.round(label.getBoundingClientRect().right)} row ${Math.round(r.getBoundingClientRect().right)} ${out}` };
  }));
  for (const r of rows) expect(r.allowed, `a ${r.kind} row: title · subtitle · kind/date · badges only - no lead line (A-55)`).toBe(true);
  for (const r of rows) expect(r.fits, `a ${r.kind} row: every line inside the row (a long word wraps, never runs off the edge)`).toBe(true);
  return rows.filter((r) => r.kind === 'news').length;
};
/** A-56: at a LARGE system text scale (`<html data-text-large="1">`, state/textScale.ts) the hyphen-capable text (row labels in `scope`, the article's
 *  subtitle / lead / body) asks for `hyphens: auto`, the page carrying the interface language (`<html lang>`, the dictionary the engine picks);
 *  at the normal scale it does NOT (A-55: lines wrap between words as before). Where the engine has no dictionary the break stays (cloud_20). */
const hyphenated = async (p: Page, scope: string, on: boolean) => {
  // the interface language with no stored choice = the device's when it is uk / ru / en, else uk (CLAUDE.md) - the profile's locale
  const lang = await p.evaluate(() => { const d = navigator.language.slice(0, 2); return ['uk', 'ru', 'en'].includes(d) ? d : 'uk'; });
  expect(await p.evaluate(() => document.documentElement.lang), 'A-56: <html lang> = the interface language').toBe(lang);
  await expect.poll(() => p.evaluate(() => document.documentElement.dataset.textLarge), 'A-56: the measured text scale').toBe(on ? '1' : '0');
  const hy = await p.locator(scope).locator('visible=true').evaluateAll((es) => es.map((e) => { const c = getComputedStyle(e) as CSSStyleDeclaration & { webkitHyphens?: string };
    return c.hyphens || c.webkitHyphens; }));
  expect(hy.length, `A-56: ${scope} on the screen`).toBeGreaterThan(0);
  for (const h of hy) expect(h, `A-56: ${scope} hyphenates only at a large scale`).toBe(on ? 'auto' : 'manual');
};
/** A-85 (2): the smart arrows' screens - the shown article / card and ITS scroller (tablet: the detail pane; phone: the page's ion-content) */
const arrowsOwner = (p: Page) => p.locator(SHOWN).locator('[data-testid="article"], [data-testid="card"]').first();
const arrowsScroll = (p: Page) => arrowsOwner(p).evaluate((a) => {
  const el = (a.closest('.split__pane') ?? a.closest('ion-content')!.shadowRoot!.querySelector('.inner-scroll')) as HTMLElement;
  return { top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight, max: el.scrollHeight - el.clientHeight };
});
/** real wheel events over the article / card (the mouse over its pane), then the scroller at rest */
const wheelBy = async (p: Page, dy: number, n = 1) => {
  const b = (await arrowsOwner(p).boundingBox())!; const vp = p.viewportSize()!;
  await p.mouse.move(Math.min(b.x + b.width / 2, vp.width - 80), vp.height / 2);
  for (let i = 0; i < n; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(40); }
  let last = -1;
  await expect.poll(async () => { const t = (await arrowsScroll(p)).top; const same = t === last; last = t; return same; }, { intervals: [150] }).toBe(true);
};
/** the arrows the reader sees now (hidden = visibility:hidden after the fade: out of the tab order and of TalkBack) */
const arrowsAre = async (p: Page, up: boolean, down: boolean) => {
  for (const [id, on] of [['scroll-up', up], ['scroll-down', down]] as const) {
    await expect(onShown(p, id), id).toHaveAttribute('data-shown', on ? '1' : '0');
    if (on) await expect(onShown(p, id)).toBeVisible(); else await expect(onShown(p, id)).toBeHidden();
  }
};
/** the page ready to scroll: its pictures in (the height final), a card's history opened (242 closed is < 3 viewports: no arrow - checked) */
const arrowsPage = async (p: Page) => {
  await expect(arrowsOwner(p)).toBeVisible();
  await settled(p); await picturesSettled(p);
  if (await p.locator(SHOWN).getByTestId('card').count()) {
    const m = await arrowsScroll(p);
    if (m.height < 3 * m.client) { await wheelBy(p, 300, 2); await arrowsAre(p, false, false); } // a short page: never
    await onShown(p, 'history-more').click();
    await expect(p.locator(SHOWN).getByTestId('history').locator('.collapsible__box')).toHaveCount(0);
  }
  const m = await arrowsScroll(p);
  expect(m.height / m.client, 'a long page (>= 3 viewports)').toBeGreaterThanOrEqual(3);
  test.info().annotations.push({ type: 'viewports', description: (m.height / m.client).toFixed(2) });
};
/** the reader goes on scrolling (a scroll event, no move) until the shot - the idle fade (2.5 s) is proven on its own in `-up` */
const keepScrolling = (p: Page) => arrowsOwner(p).evaluate((a) => {
  const el = (a.closest('.split__pane') ?? a.closest('ion-content')!.shadowRoot!.querySelector('.inner-scroll')) as HTMLElement;
  window.setInterval(() => el.dispatchEvent(new Event('scroll')), 400);
});
/** the arrow DRAWN >= 3:1 against its circle AND against the page beside it (F3: pixels of the screenshot, never computed styles) */
const arrowsContrast = async (p: Page) => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (const id of ['scroll-up', 'scroll-down']) {
    const b = onShown(p, id); if ((await b.getAttribute('data-shown')) !== '1') continue;
    await expect(b).toHaveCSS('opacity', '1');
    const r = (await b.boundingBox())!; const cx = r.x + r.width / 2; const cy = r.y + r.height / 2;
    const circle = await drawnContrast(p, { x: cx - 14, y: cy - 14, width: 28, height: 28 });
    const page = await drawnContrast(p, { x: r.x + r.width + 2, y: cy - 12, width: 8, height: 24 }); // the page margin right of the circle (no picture there)
    const onPage = Math.round(wcag(rgb(circle.ink), rgb(page.bg)) * 100) / 100;
    test.info().annotations.push({ type: 'contrast', description: `${id}: ${circle.ink} on circle ${circle.bg} = ${circle.ratio}; on page ${page.bg} = ${onPage}` });
    expect(circle.ratio, `${id} vs its circle ${JSON.stringify(circle)}`).toBeGreaterThanOrEqual(3);
    expect(onPage, `${id} vs the page ${page.bg}`).toBeGreaterThanOrEqual(3);
  }
};
/** the arrows the reader sees vs the stars and «Додати коментар»: no rectangle in common */
const arrowsOverlap = (p: Page) => p.locator(SHOWN).evaluate((pg) => {
  const rs = (sel: string) => Array.from(pg.querySelectorAll(sel)).filter((e) => getComputedStyle(e).visibility === 'visible' && e.getClientRects().length).map((e) => e.getBoundingClientRect());
  const arrows = rs('.scroll-arrows__btn[data-shown="1"]'); const targets = rs('[data-testid="rating"], [data-testid="comment-add"]');
  return arrows.flatMap((a) => targets.filter((t) => a.left < t.right && t.left < a.right && a.top < t.bottom && t.top < a.bottom).map((t) => `${Math.round(t.top)}..${Math.round(t.bottom)}`));
});
/** item 5 (REVIEW cloud_27): on a tablet the arrows' corner is never over a link / button / icon of the detail pane - the pane swept top to
 *  bottom in third-of-a-screen steps, at each the arrows' column (shown or not) against every interactive element on screen (the cover
 *  picture excepted: a photo, tappable around them) */
const arrowsOverControls = (p: Page) => arrowsOwner(p).evaluate(async (art) => {
  const pane = art.closest('.split__pane') as HTMLElement; const col = pane.parentElement!.parentElement!.querySelector('.scroll-arrows') ?? document.querySelector('.scroll-arrows');
  if (!pane || !col) return ['no pane / no arrows'];
  const hits = new Set<string>();
  for (let y = 0; y <= pane.scrollHeight; y += pane.clientHeight / 3) {
    pane.scrollTop = y; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const a = col.getBoundingClientRect(); const v = pane.getBoundingClientRect();
    for (const e of Array.from(art.querySelectorAll('a, button, ion-button, ion-item[button], [role="button"], [role="link"], input, ion-icon, ion-toggle'))) {
      if (e.closest('.scroll-arrows, .aview__cover, .card__cover-wrap')) continue;
      const r = e.getBoundingClientRect();
      if (!r.width || r.bottom < v.top || r.top > v.bottom) continue;
      if (a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom) hits.add(`${e.tagName.toLowerCase()}.${(e as HTMLElement).className || ''} «${(e.textContent ?? '').trim().slice(0, 24)}»`);
    }
  }
  return [...hits];
});
const screens: { name: string; path: string; tall?: number; width?: number; font?: number; only?: string[]; before?: (p: Page) => Promise<void>; ready: (p: Page) => Promise<void> }[] = [
  { name: 'home', path: '/home', ready: async (p) => {
      // the old flake of home phone-ru (run 41339874788): live-status is loaded on purpose AFTER the first screen (D22, `afterFirstScreen`:
      // two frames + 800 ms, then the fetch) — on a busy runner that passed the default 5 s; the wait is for that load, not a sleep
      await expect(p.getByTestId('tiles'), 'D3: one tile row at the normal font (uk, ru)').toHaveAttribute('data-wrap', '0');
      await expect(p.getByTestId('tile-streams')).toBeVisible(); await expect(p.getByTestId('live-avatar').first()).toBeVisible({ timeout: 15_000 }); await expect(p.getByTestId('tab-live')).toBeVisible();
      await expect(p.getByTestId('home-live-1686')).toBeVisible(); // «Зараз в ефірі» from live-status
      await expect(p.getByTestId('mrow-37')).toContainText('км'); // «Поруч» (geolocation granted → Kyiv)
      await expect(p.getByTestId('home-checked')).toHaveText(/^(Перевірено сьогодні о|Проверено сегодня в|Checked today at) \d\d:\d\d$/, { timeout: 15_000 }); // A-52
      await expect(p.locator('[data-testid^="arow-"]')).toHaveCount(3); // «Нове на сайті» (stage 4)
      // A-25 #3: one of each kind, publication → video → news; A-25 #2: how many are live, in the header
      expect(await p.locator('[data-testid^="arow-"]').evaluateAll((es) => es.map((e) => e.getAttribute('data-kind')))).toEqual(['publication', 'video', 'news']);
      expect(await noLeads(p, 'ion-content'), 'A-55: «Нове на сайті» - the news row without a lead').toBe(1);
      await expect(p.getByTestId('home-live')).toContainText('(3)');
      await expect(p.getByTestId('home-live-more')).toHaveCount(0);
      // D65: the live ring follows the round avatar on every engine - box-shadow, never `outline` (square on Chrome 89-93)
      expect(await p.getByTestId('live-avatar').first().evaluate((e) => { const c = getComputedStyle(e); return [c.outlineStyle, /\b4px\b/.test(c.boxShadow)].join(); })).toBe('none,true');
      await avatarsLoaded(p);
    } },
  // A-25 #5 (R-24): the calendar in paragraphs as /live/ on a phone — folded 2, unfolded all 5 with their emphasis; at 17:30 Kyiv the
  // site already shows the next day and the strip says so (the clock is fixed: the fixture's calendar is of 2 Nov)
  ...(['calendar-evening', 'calendar-open'] as const).map((name) => ({ name, path: '/home',
    before: async (p: Page) => { await p.clock.setFixedTime(new Date(name === 'calendar-evening' ? '2026-11-01T15:30:00Z' : '2026-11-02T07:00:00Z')); },
    ready: async (p: Page) => {
      const cal = p.getByTestId('calendar').locator('visible=true');
      await expect(cal.locator('.cal__body p')).toHaveCount(2);
      await expect(cal.locator('.cal__body p').first().locator('strong')).toHaveCount(1);
      await expect(cal.locator('.cal__body u')).toHaveCount(1);
      await expect(p.getByTestId('calendar-tomorrow')).toHaveCount(name === 'calendar-evening' ? 1 : 0);
      if (name === 'calendar-evening') await expect(p.getByTestId('calendar-tomorrow')).toContainText(/^(Після 16:00 за київським часом|После 16:00 по киевскому времени|After 4 pm Kyiv time) /); // D59: words, no zone id
      if (name === 'calendar-open') {
        // D41: THE more button (MoreButton: outline, full width, in .more-btn) — not a bare text link; on «Головна» it folds back
        const tg = p.getByTestId('calendar-toggle');
        expect(await tg.evaluate((b) => [b.tagName, b.getAttribute('fill'), b.getAttribute('expand'), !!b.closest('.more-btn')].join())).toBe('ION-BUTTON,outline,block,true');
        await expect(tg).toHaveText(/Читати повністю|Читать полностью|Read in full/);
        await tg.click();
        await expect(cal.locator('.cal__body p')).toHaveCount(5);
        await expect(cal.locator('.cal__body em')).toHaveCount(1); // the readings, italic
        await expect(tg).toHaveText(/Згорнути|Свернуть|Show less/);
        await expect(tg.locator('button')).toHaveAttribute('aria-expanded', 'true'); // Ionic hands aria-* to its inner native button
      }
    } })),
  { name: 'home-live-more', path: '/home', before: livePlus2, ready: async (p) => {
      await expect(p.getByTestId('home-live')).toContainText('(5)');
      const rows = () => p.locator('ion-item[data-testid^="home-live-"]:not([data-testid="home-live-more"])');
      await expect(rows()).toHaveCount(3);
      await expect(p.getByTestId('home-live-more')).toHaveText(/Показати ще 2|Показать ещё 2|Show 2 more/); // D42: the hidden count
      await p.getByTestId('home-live-more').scrollIntoViewIfNeeded();
    } },
  { name: 'home-live-open', path: '/home', before: livePlus2, ready: async (p) => {
      // D42: unfolded — all 5, the same button folds back («Згорнути»)
      const rows = () => p.locator('ion-item[data-testid^="home-live-"]:not([data-testid="home-live-more"])');
      await p.getByTestId('home-live-more').click();
      await expect(rows()).toHaveCount(5);
      await expect(p.getByTestId('home-live-more')).toHaveText(/Згорнути|Свернуть|Show less/);
      await expect(p.getByTestId('home-live-more').locator('button')).toHaveAttribute('aria-expanded', 'true');
      await p.getByTestId('home-live-more').scrollIntoViewIfNeeded();
    } },
  { name: 'monasteries', path: '/monasteries', ready: async (p) => {
      await expect(p.getByTestId('list')).toBeVisible(); await expect(p.getByTestId('count')).toContainText('18');
      // REVIEW cloud_34 Q4 (b): the search field is NAMED by its words (SearchField: aria-label = placeholder), every list's search
      await expect(p.locator(SHOWN).getByTestId('search').locator('input')).toHaveAccessibleName((await words(p, ['monasteries.search']))[0]);
      // REVIEW cloud_35 Q2: its clear «×» is named in the interface language, not Ionic's «reset»
      await expect(p.locator(SHOWN).getByTestId('search').locator('.searchbar-clear-button')).toHaveAttribute('aria-label', (await words(p, ['common.clear']))[0]);
      // A-44 (R-31): the three lavras first - Kyiv, Pochaiv, Sviatohirsk - then the names as before
      expect(await p.getByTestId('list').locator('[data-testid^="mrow-"]').evaluateAll((rs) => rs.slice(0, 3).map((r) => r.getAttribute('data-testid')))).toEqual(['mrow-242', 'mrow-111', 'mrow-98']);
      // A-28 (withdraws D39): the filter button in the toolbar right of the search, the ONE way to the sheet (no «Фільтри» chip under it);
      // the placeholder says what the field searches; the search still takes most of the toolbar
      const hdr = p.locator('ion-header').locator('visible=true');
      await expect(hdr.getByTestId('filters-open')).toBeVisible();
      await expect(p.locator('.filters__chips').getByTestId('filters-open')).toHaveCount(0);
      await expect(p.locator('.filters__chips ion-chip:not([data-testid^="chip-"]):not([data-testid="eparchies-open"])')).toHaveCount(0);
      await expect(p.getByTestId('filters-count')).toHaveCount(0); // no active filter → no badge
      const ph = await p.getByTestId('search').locator('visible=true').locator('input').getAttribute('placeholder');
      expect(ph).toBe(await p.evaluate(() => document.documentElement.lang === 'ru' ? 'Поиск монастырей' : document.documentElement.lang === 'en' ? 'Search monasteries' : 'Пошук монастирів'));
      const sw = await p.getByTestId('search').locator('visible=true').evaluate((e) => e.getBoundingClientRect().width / innerWidth);
      expect(sw).toBeGreaterThan(p.viewportSize()!.width >= 600 ? 0.25 : 0.6);
      // the placeholder is read WHOLE: its text width (the input's own font) fits the input's content box
      const fit = await p.getByTestId('search').locator('visible=true').locator('input').evaluate((i: HTMLInputElement) => {
        const cs = getComputedStyle(i); const c = document.createElement('canvas').getContext('2d')!; c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        return { text: Math.ceil(c.measureText(i.placeholder).width), box: Math.floor(i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) }; });
      expect(fit.text, `placeholder ${fit.text}px in ${fit.box}px`).toBeLessThanOrEqual(fit.box);
      // the badge does not cover the icon it counts for (the 1-filter screen shows it; here: the icon is whole)
      // the search box and the button: side by side, the button fully inside the toolbar
      const sb = await p.getByTestId('search').locator('visible=true').evaluate((e) => e.getBoundingClientRect().right);
      const fb = await hdr.getByTestId('filters-open').evaluate((e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right }; });
      expect(fb.l).toBeGreaterThanOrEqual(sb - 1); expect(fb.r).toBeLessThanOrEqual(p.viewportSize()!.width);
      expect(fb.l - sb, 'the button right beside the field').toBeLessThanOrEqual(16);
      // D26: «N обителей» and the «Єпархії» chip share one vertical centre
      // the TEXT's own box (a stretched element box would hide a text sitting at its top)
      const mid = (id: string) => p.getByTestId(id).evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e.querySelector('ion-label') ?? e);
        const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
      expect(Math.abs((await mid('count')) - (await mid('eparchies-open')))).toBeLessThanOrEqual(1);
      await filterRows(p, 0);
    } },
  { name: 'monasteries-search', path: '/monasteries', ready: async (p) => {
      await expect(p.getByTestId('list')).toBeVisible();
      await p.getByTestId('search').locator('input').fill('церковшина'); // one typo: the fuzzy search still finds it
      await expect(p.getByTestId('mrow-37')).toBeVisible();
      await expect(p.getByTestId('count')).toContainText('1');
      await expect(p.locator('.suggest, [data-testid="suggest"]')).toHaveCount(0); // A-23 #3: no dropdown over the list
    } },
  // A-23 #4: the row as /monasteries/ (eparchy, full address, the head's line) + the matches marked in the site's yellow
  { name: 'monasteries-search-mark', path: '/monasteries', ready: async (p) => {
      await expect(p.getByTestId('list')).toBeVisible();
      await p.getByTestId('search').locator('input').fill('лавр'); // uk «Лаврська», ru «Лаврская»
      await expect(p.getByTestId('mrow-242')).toBeVisible();
      await expect(p.getByTestId('mrow-242').getByTestId('row-address').locator('mark.hl')).toHaveText(/^Лавр$/);
      await expect(p.getByTestId('mrow-242').getByTestId('row-head')).toContainText('Павел');
      // D27: EVERY found row shows why — a marked match on the row (or its «Збіг · …» line)
      await expect(p.locator('[data-testid="list"] .mrow')).toHaveCount(6); // the search has settled (98, 105, 108, 110, 111, 242)
      const unmarked = await p.locator('[data-testid="list"] .mrow').evaluateAll((es) => es.filter((e) => !e.querySelector('mark.hl')).map((e) => e.getAttribute('data-testid')));
      expect(unmarked, 'rows with nothing marked').toEqual([]);
      await expect(p.locator('[data-testid="row-why"]').first()).toBeVisible();
      await expect(p.getByTestId('mrow-242').getByTestId('row-born')).toHaveText(/^19\.04\.1961 (р\. н\.|г\. р\.)$/); // R-22
      const bg = await p.locator('mark.hl').first().evaluate((e) => getComputedStyle(e).backgroundColor);
      expect(bg).toBe('rgb(255, 255, 0)'); // the site's span.highlight colour
    } },
  { name: 'monasteries-search-empty', path: '/monasteries', ready: async (p) => {
      await expect(p.getByTestId('list')).toBeVisible();
      await p.getByTestId('search').locator('input').fill('qqqzzz');
      await expect(p.getByTestId('empty')).toContainText('qqqzzz');
      await expect(p.getByTestId('count')).toContainText('0');
    } },
  // REVIEW cloud_30 N1: the tablet at font 200 % - «18 обителей» is ONE unbreakable unit (cloud_30: «18 / обителе / й»); «Єпархії» may go below
  { name: 'monasteries-pinned-font200', path: '/monasteries', font: 200, only: ['tablet', 'phone-light'], ready: async (p) => {
      await expect(onShown(p, 'list')).toBeVisible();
      await expect(onShown(p, 'count')).toHaveText(/\d/);
      const m = await onShown(p, 'count').evaluate((e) => {
        const r = document.createRange(); r.selectNodeContents(e);
        const tops = new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top)));
        const b = e.getBoundingClientRect(); const pin = e.closest('[data-testid="filters-pin"]')!.getBoundingClientRect();
        return { lines: tops.size, right: b.right, pinRight: pin.right };
      });
      expect(m.lines, 'the count on ONE line').toBe(1);
      expect(m.right, 'inside the list').toBeLessThanOrEqual(m.pinRight + 0.5);
      const btn = (await onShown(p, 'eparchies-open').boundingBox())!;
      const pin = (await onShown(p, 'filters-pin').boundingBox())!;
      expect(btn.x + btn.width, '«Єпархії» inside the list').toBeLessThanOrEqual(pin.x + pin.width + 0.5);
    } },
  // A-96 W-3: the count + «Єпархії» (+ the chips) = ONE block pinned under the header while 3 screens of rows scroll; the first row starts
  // under it; «Єпархії» = THE filled button (primary fill, label >= 4.5:1 as drawn), its target >= 48 x 48 css px by hit-testing
  { name: 'monasteries-pinned', path: '/monasteries', before: withMany(120), ready: async (p) => {
      await expect(onShown(p, 'list')).toBeVisible();
      const at = () => onShown(p, 'filters-pin').evaluate((k) => {
        const pane = k.closest('.split__pane') as HTMLElement | null; const host = pane ?? (k.closest('ion-content') as HTMLElement);
        const sc = (pane ?? host.shadowRoot!.querySelector('.inner-scroll')) as HTMLElement;
        const first = k.parentElement!.querySelector('[data-testid^="mrow-"]')!.getBoundingClientRect();
        return { scroll: Math.round(sc.scrollTop), offset: Math.round(k.getBoundingClientRect().top - host.getBoundingClientRect().top), pinBottom: k.getBoundingClientRect().bottom, firstTop: first.top };
      });
      const top = await at();
      expect(top.firstTop, 'the first row under the pinned block').toBeGreaterThanOrEqual(top.pinBottom - 1);
      const b = (await onShown(p, 'list').boundingBox())!;
      await p.mouse.move(b.x + Math.min(b.width / 2, 150), Math.min(b.y + 300, (p.viewportSize()!.height * 2) / 3));
      for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, p.viewportSize()!.height); await p.waitForTimeout(120); }
      await expect.poll(async () => (await at()).scroll, { intervals: [200] }).toBeGreaterThan(p.viewportSize()!.height * 2);
      expect((await at()).offset, 'the block stays at the top of the list').toBeLessThanOrEqual(1);
      const btn = onShown(p, 'eparchies-open');
      const m = await btn.evaluate((e) => {
        const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
        const hit = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('[data-testid="eparchies-open"]') === e;
        const tall = Array.from({ length: 81 }, (_, i) => cy - 40 + i).filter((y) => hit(cx, y)).length;
        const across = Array.from({ length: Math.round(r.width) + 40 }, (_, i) => r.left - 20 + i).filter((x) => hit(x, cy)).length;
        const primary = getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim();
        const probe = document.createElement('span'); probe.style.color = primary; document.body.append(probe); const want = getComputedStyle(probe).color; probe.remove();
        return { tall, across, fill: getComputedStyle(e.shadowRoot!.querySelector('.button-native')!).backgroundColor, want };
      });
      expect(m.fill, 'filled with the primary colour').toBe(m.want);
      expect(Math.min(m.tall, m.across), `target ${m.across} x ${m.tall}`).toBeGreaterThanOrEqual(48);
      const bb = (await btn.locator('ion-label').boundingBox())!;
      const c = await drawnContrast(p, { x: bb.x, y: bb.y, width: bb.width, height: bb.height });
      expect(c.ratio, `«Єпархії» drawn ${c.ink} on ${c.bg}`).toBeGreaterThanOrEqual(4.5);
      expect(await btn.evaluate((e) => e.shadowRoot!.querySelector('.button-native')!.tagName), 'TalkBack hears a button (Ionic\'s inner native button, gotcha cloud_28)').toBe('BUTTON');
    } },
  { name: 'monasteries-filters', path: '/monasteries', ready: async (p) => {
      await expect(p.getByTestId('list')).toBeVisible();
      await p.getByTestId('filters-open').click();
      await expect(p.getByTestId('filter-sheet')).toBeVisible();
      await p.waitForTimeout(600);
    } },
  { name: 'monasteries-filters-dependent', path: '/monasteries', ready: async (p) => {
      // A-13: pick «Лаври» → the sex list offers only «чоловічі (3)», every value with its count
      await expect(p.getByTestId('list')).toBeVisible();
      await p.getByTestId('filters-open').click();
      await expect(p.getByTestId('filter-list')).toBeVisible();
      await p.getByTestId('filter-list').locator('ion-select').nth(1).click();
      await p.locator('ion-popover ion-radio, ion-popover ion-item').filter({ hasText: /(Лаври|Лавры|Lavras) \(3\)/ }).first().click();
      await p.waitForTimeout(500);
      await p.getByTestId('filter-list').locator('ion-select').nth(0).click();
      const opts = p.locator('ion-popover').last().locator('ion-radio');
      await expect(opts.filter({ hasText: /(чоловічі|мужские|male) \(3\)/ })).toHaveCount(1);
      await expect(opts.filter({ hasText: /жіночі|женские|female/ })).toHaveCount(0);
      await opts.filter({ hasText: /(чоловічі|мужские|male) \(3\)/ }).click();
      await expect(p.getByTestId('filter-sheet')).toBeVisible();
      // D19: the apply button carries the live count of the draft (plural forms), the same query as the list
      await expect(p.getByTestId('filters-apply')).toBeVisible();
      await expect(p.getByTestId('filters-apply')).toContainText(/Показати 3 обителі|Показать 3 обители|Show 3 monasteries/i);
      await p.waitForTimeout(400);
    } },
  { name: 'monasteries-filters-clear-one', path: '/monasteries', ready: async (p) => {
      // A-21(в): two filters chosen → each has its «×»; one «×» clears only it, the other stays and the count recounts
      await expect(p.getByTestId('list')).toBeVisible();
      await p.getByTestId('filters-open').click();
      await expect(p.getByTestId('filter-list')).toBeVisible();
      await p.getByTestId('filter-list').locator('ion-select').nth(1).click();
      await p.locator('ion-popover ion-radio, ion-popover ion-item').filter({ hasText: /(Лаври|Лавры|Lavras) \(3\)/ }).first().click();
      // D33: no pause — the next select opens while the first popover is still dismissing (the race that recursed)
      await p.getByTestId('filter-list').locator('ion-select').nth(0).click();
      await p.locator('ion-popover').last().locator('ion-radio').filter({ hasText: /(чоловічі|мужские|male) \(3\)/ }).click();
      await expect(p.getByTestId('clear-type')).toBeVisible();
      await expect(p.getByTestId('clear-object_type')).toBeVisible();
      await p.getByTestId('clear-object_type').click();
      await expect(p.getByTestId('clear-object_type')).toHaveCount(0);
      await expect(p.getByTestId('clear-type')).toBeVisible();
      await expect(p.getByTestId('filters-apply')).not.toContainText(/ 3 /); // the male houses, not the three lavras
      await p.getByTestId('filters-apply').click();
      await expect(p.getByTestId('chip-type')).toBeVisible(); // the same «×» on the chip above the list
      await expect(p.getByTestId('filters-count')).toHaveText('1'); // A-28: the toolbar button counts the active filters
      await filterRows(p, 1);
      await badgeRule(p);
      await p.waitForTimeout(400);
    } },
  { name: 'monasteries-filters-three', path: '/monasteries', ready: async (p) => {
      // D43: three active filters (lavras, male, near me) — still row 1 + ONE chip row, «Єпархії» not pushed to a line of its own
      await expect(p.getByTestId('list')).toBeVisible();
      await p.getByTestId('filters-open').click();
      await expect(p.getByTestId('filter-list')).toBeVisible();
      await p.getByTestId('filter-list').locator('ion-select').nth(1).click();
      await p.locator('ion-popover ion-radio, ion-popover ion-item').filter({ hasText: /(Лаври|Лавры|Lavras) \(3\)/ }).first().click();
      await p.getByTestId('filter-list').locator('ion-select').nth(0).click();
      await p.locator('ion-popover').last().locator('ion-radio').filter({ hasText: /(чоловічі|мужские|male) \(3\)/ }).click();
      await p.getByTestId('filter-list').locator('ion-toggle').nth(1).click();
      await p.getByTestId('filters-apply').click();
      await expect(p.getByTestId('filters-count')).toHaveText('3');
      await filterRows(p, 3);
      await badgeRule(p);
      await p.waitForTimeout(400);
    } },
  // PLAN 6: 138 houses — the count says all of them at once, the rows come in pages of 30 as the end nears; search and filters still see all
  { name: 'monasteries-pages', path: '/monasteries', before: withMany(120), ready: async (p) => {
      await expect(p.getByTestId('count').locator('visible=true')).toContainText('138');
      const shown = () => p.locator('[data-testid="list"] [data-testid^="mrow-"]').count();
      await expect.poll(shown).toBeGreaterThanOrEqual(30);
      expect(await shown(), 'one page (+ the next when the end is near), not all 138').toBeLessThan(138);
      for (let i = 0; i < 10 && (await shown()) < 138; i++) { await p.locator('[data-testid="list"] [data-testid^="mrow-"]').last().scrollIntoViewIfNeeded(); await p.waitForTimeout(250); }
      expect(await shown(), 'scrolling to the end brings every row').toBe(138);
      await expect(p.getByTestId('list-more')).toHaveCount(0);
      const codes = await p.locator('[data-testid="list"] [data-testid^="mrow-"]').evaluateAll((rs) => rs.map((r) => r.getAttribute('data-testid')));
      expect(codes.slice(0, 3), 'A-44: the three lavras first').toEqual(['mrow-242', 'mrow-111', 'mrow-98']);
      const names = (await p.locator('[data-testid="list"] .mrow__title').allTextContents()).slice(3);
      expect(names, 'then sorted by name across the pages').toEqual([...names].sort(new Intl.Collator(await p.evaluate(() => document.documentElement.lang || 'uk'), { sensitivity: 'base', numeric: true }).compare));
      await p.getByTestId('search').locator('input').fill('Церковщина');
      await expect(p.getByTestId('count').locator('visible=true')).toContainText(/\b\d+\b/);
      await expect.poll(shown).toBeGreaterThan(1); // the original and its copies — found in the whole list, not in the shown pages
      await p.getByTestId('search').locator('input').fill('');
      await expect(p.getByTestId('count').locator('visible=true')).toContainText('138');
      await p.locator('[data-testid="list"] [data-testid^="mrow-"]').first().scrollIntoViewIfNeeded();
    } },
  { name: 'monastery', path: '/monasteries/37', ready: async (p) => { await expect(p.getByTestId('card')).toBeVisible(); await expect(p.getByTestId('call')).toBeVisible(); await expect(p.getByTestId('gallery')).toContainText(/Фотогалерея|Photo gallery/); await expect(p.getByTestId('gallery')).toHaveAttribute('aria-label', /Фотогалерея: переглянути|Фотогалерея: посмотреть|Photo gallery: view/); await expect(p.getByTestId('gps')).toContainText('50.320787'); await expect(p.getByTestId('links')).toBeVisible(); await cardOrder(p);
      // D24: no label breaks inside a word — each word of a label sits on ONE line (its glyph boxes share a top), nothing overflows
      const split = await p.locator('.actions__btn span').evaluateAll((es) => es.flatMap((e) => {
        const t = e.firstChild as Text; const out: string[] = []; let i = 0;
        for (const w of (t.textContent ?? '').split(' ')) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + w.length); i += w.length + 1;
          if (new Set(Array.from(r.getClientRects()).map((b) => Math.round(b.top))).size > 1) out.push(w); }
        return out; }));
      expect(split, 'words split across lines').toEqual([]);
      await actionsRule(p, 5); // D34
      // D30: the divider under the actions follows the theme (a bright line on black was the defect)
      const [dark, rgb] = await p.locator('.actions').evaluate((e) => [document.documentElement.classList.contains('ion-palette-dark'),
        (getComputedStyle(e).borderBottomColor.match(/[\d.]+/g) ?? []).map(Number)] as const);
      const lum = (rgb[0] + rgb[1] + rgb[2]) / 3 * (rgb.length > 3 ? rgb[3] : 1) + (rgb.length > 3 ? (dark ? 0 : 255) * (1 - rgb[3]) : 0);
      expect(dark ? lum < 90 : lum > 180, `divider ${rgb} on ${dark ? 'dark' : 'light'}`).toBe(true);
    } },
  // D48: five actions fit a 360-412 dp phone without scrolling; six (242) and the largest system font (Android 14: 200 %) may scroll, every
  // label whole, the end faded only then. Phone profiles only (the tablet's card is the `monastery` screen above).
  ...[37, 242].flatMap((code) => [...[360, 390, 412].map((w) => ({ w, font: undefined as number | undefined })), { w: 360, font: 200 }].map(({ w, font }) => ({
    name: `card-actions-${code}-${font ? `font${font}` : `w${w}`}`, path: `/monasteries/${code}`, width: w, font, only: ['phone-light', 'phone-dark'],
    ready: async (p: Page) => { await expect(p.getByTestId('card')).toBeVisible(); await expect(p.getByTestId('actions')).toBeVisible();
      await actionsRule(p, code === 37 ? 5 : 6, code === 37 && !font ? true : undefined);
      if (font) await p.getByTestId('actions').scrollIntoViewIfNeeded(); } }))),
  // the largest system font (Android 14: 200 %): the toolbar title wraps only BETWEEN words, every tab label is whole — one rule (chromeText)
  ...([['home', '/home', 'home-near'], ['monasteries', '/monasteries', 'search'], ['card', '/monasteries/242', 'card'], ['streams', '/streams', 'channels'],
    ['article', '/articles?id=2869', 'article'], ['more', '/more', 'more-contacts'], ['eparchy', '/more/eparchies/1', 'eparchy-title'], ['notifications', '/more/notifications', 'topic-articles'],
    ['contacts', '/more/contacts', 'contacts-minimap']] as const).map(([tag, path, id]) => ({
    name: `font200-${tag}`, path, font: 200, only: ['phone-light', 'phone-dark'], ready: async (p: Page) => {
      await expect(p.getByTestId(id).locator('visible=true').first()).toBeAttached();
      if (tag === 'home') await expect(p.getByTestId('tiles'), 'D56: the labels do not fit four in a row with the padding: two per row').toHaveAttribute('data-wrap', '1');
      await chromeText(p);
    } })),
  // D60 at the largest font: the short hint, the three choices and both buttons stay inside the screen (the choice is the dialog's job)
  { name: 'font200-more-photos', path: '/more?photos=1', font: 200, only: ['phone-light', 'phone-dark'], ready: async (p: Page) => {
      await expect(p.locator('ion-alert.inok-dialog')).toBeVisible();
      await expect(p.locator('ion-alert .alert-radio-button')).toHaveCount(3);
      const out = await p.evaluate(() => { const vh = innerHeight; const els = [...document.querySelectorAll('ion-alert .alert-wrapper, ion-alert .alert-button')];
        return els.filter((e) => { const r = e.getBoundingClientRect(); return r.top < 0 || r.bottom > vh; }).length; });
      expect(out, 'the dialog and its buttons inside the viewport').toBe(0);
      const fit = await p.evaluate(() => { const m = document.querySelector('ion-alert .alert-message') as HTMLElement; const h = document.querySelector('ion-alert .alert-title') as HTMLElement;
        return { msgCut: m.scrollHeight > m.clientHeight + 1, titleTooWide: h.scrollWidth > h.clientWidth + 1,
          brokenWords: (() => { const t = h.firstChild as Text; const out: string[] = []; for (const m of t.data.matchAll(/\S+/g)) { const r = document.createRange();
            r.setStart(t, m.index!); r.setEnd(t, m.index! + m[0].length); if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) out.push(m[0]); } return out; })() }; });
      expect(fit, 'the whole hint shown; no word of the title broken').toEqual({ msgCut: false, titleTooWide: false, brokenWords: [] });
      await p.waitForTimeout(400);
    } },
  { name: 'monastery-full', path: '/monasteries/37', tall: 2600, ready: async (p) => { await expect(p.getByTestId('card')).toBeVisible(); await cardOrder(p); } },
  // R-22: the head's row of the card ends with the birth date as the site prints it; R-20: the phones as the card prints them
  // A-81 (3): the card's eparchy = a link in the link colour to its page in the app (phone: pushed; tablet: «Єпархії УПЦ» with it selected);
  // Back = the card; the target >= 24 x 24 px without moving the line; uk / ru (phone-ru) / en. Red on 7ba6af7 (plain grey text).
  ...([undefined, 'en'] as const).map((force) => ({
    name: `card-eparchy-link${force ? `-${force}` : ''}`, only: force ? ['phone-light'] : [...UK, 'phone-ru'], path: '/monasteries/242',
    before: force ? async (p: Page) => { await p.addInitScript((l) => localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ lang: l })), force); } : undefined,
    ready: async (p: Page) => {
      const link = p.getByTestId('card-eparchy').locator('visible=true');
      await expect(link).toHaveText(/^\S.* (єпархія|епархия|diocese)$/i);
      await expect(link).toHaveRole('link');
      const m = await link.evaluate((a) => {
        const line = a.closest('.card__sub')!; const h = () => Math.round(line.getBoundingClientRect().height * 10) / 10;
        const st = document.createElement('style'); st.textContent = '.card__eparchy::before { display: none }';
        document.head.append(st); const bare = h(); st.remove(); const withTarget = h();
        const primary = getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim();
        const probe = document.createElement('span'); probe.style.color = primary; document.body.append(probe); const want = getComputedStyle(probe).color; probe.remove();
        // the target as the finger meets it: every css px around the first piece's centre where a hit lands on the link
        const r = a.getClientRects()[0]; const cx = r.left + Math.min(r.width / 2, 40); const cy = (r.top + r.bottom) / 2;
        const hits = (pts: [number, number][]) => pts.filter(([x, y]) => document.elementFromPoint(x, y)?.closest('.card__eparchy') === a).length;
        const tall = hits(Array.from({ length: 61 }, (_, i) => [cx, cy - 30 + i] as [number, number]));
        const across = hits(Array.from({ length: 81 }, (_, i) => [r.left - 20 + i, cy] as [number, number]));
        return { tall, across, withTarget, bare, color: getComputedStyle(a).color, want, name: a.textContent };
      });
      expect(m.color, 'the link colour token').toBe(m.want);
      expect(Math.min(m.tall, m.across), `target ${m.across} x ${m.tall} css px (WCAG 2.5.8)`).toBeGreaterThanOrEqual(24);
      expect(m.withTarget, 'the line does not move').toBe(m.bare);
      const box = (await link.boundingBox())!;
      const c = await drawnContrast(p, { x: box.x, y: box.y, width: Math.min(box.width, 120), height: box.height });
      expect(c.ratio, `the link as drawn: ${c.ink} on ${c.bg}`).toBeGreaterThanOrEqual(4.5);
      const wide = (p.viewportSize()?.width ?? 0) >= 600;
      await link.click();
      await expect(p.getByTestId('eparchy-title').locator('visible=true')).toBeVisible();
      await expect(p).toHaveURL(wide ? /\/more\/eparchies\?id=\d+$/ : /\/more\/eparchies\/\d+$/);
      if (wide) await expect(p.locator('[data-testid^="erow-"].item').locator('visible=true').first()).toBeVisible(); // the list beside it
      const title = await p.getByTestId('eparchy-title').locator('visible=true').textContent();
      expect(title!.split(' ')[0], 'the eparchy of the card').toBe(m.name!.split(' ')[0]);
      await settled(p);
      await p.getByTestId('back').locator('visible=true').click();
      await expect(p).toHaveURL(/\/monasteries\/242$/);
      await expect(p.getByTestId('card').locator('visible=true')).toBeVisible();
      await expect(p.getByTestId('card-eparchy').locator('visible=true')).toBeVisible();
    },
  })),
  // A-81 (3): no eparchy / an id the export does not know -> the line as before, plain text, no link
  { name: 'card-eparchy-plain', only: ['phone-light'], path: '/monasteries/242', before: withExport((d) => { for (const m of d.monasteries) if (m.code === 242) m.eparchy_id = 99999; }), ready: async (p) => {
      await expect(p.getByTestId('card').locator('visible=true')).toBeVisible();
      await expect(p.locator('.card__sub').locator('visible=true').first()).toContainText(/Київ/);
      await expect(p.getByTestId('card-eparchy')).toHaveCount(0);
    } },
  { name: 'monastery-head', path: '/monasteries/242', tall: 1800, ready: async (p) => {
      await expect(p.getByTestId('card-head')).toContainText(/Павел.*19\.04\.1961\s(року народження|года рождения)/); // R-40: the CARD's word (the list keeps «р. н.»)
      await expect(p.getByTestId('phone-line')).toHaveCount(1); // R-20: the number dials …
      await expect(p.getByTestId('phone-text').locator('.info__line')).toHaveCount(5); // … the five printed text lines are plain text
      await expect(p.getByTestId('phone-text')).not.toHaveClass(/info--tap/);
      await expect(p.getByTestId('infos')).not.toContainText('{NL}');
      // D25: every fact row of the card (with or without an icon, the links' rows too) starts its text at ONE x
      const xs = await p.locator('[data-testid="infos"] .info__value, [data-testid="links"] .info__value').evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().left)));
      expect(xs.length).toBeGreaterThan(10);
      expect(new Set(xs).size, `text edges ${[...new Set(xs)]}`).toBe(1);
      expect(await leadOffsets(p, '[data-testid="infos"]')).toEqual([]); // D36: icons on the value's first line
      await actionsRule(p, 6); // D34: the six actions of card 242
      await p.getByTestId('card-head').scrollIntoViewIfNeeded();
    } },
  // A-10: a parent (98, the Sviatohirsk Lavra: «Канонічні підрозділи») and a child (110: «Є канонічним підрозділом (скит) обителі»)
  { name: 'monastery-units', path: '/monasteries/98', tall: 2000, ready: async (p) => {
      await expect(p.getByTestId('units')).toContainText(/Канонічні підрозділи|Канонические подразделения/);
      await expect(p.getByTestId('units').locator('[data-testid^="mrow-"]')).toHaveCount(3);
      await picturesLoaded(p, '[data-testid="card"] img', 1); // D20: the card's cover
      await p.getByTestId('units').scrollIntoViewIfNeeded();
    } },
  { name: 'monastery-division', path: '/monasteries/110', ready: async (p) => {
      await expect(p.getByTestId('division-of')).toContainText(/Є канонічним підрозділом \(скит\) обителі|Является каноническим подразделением \(скит\) обители/);
      await expect(p.getByTestId('division-of')).toContainText(/Святогірська Успенська Лавра|Святогорская Успенская Лавра/);
      await p.getByTestId('division-of').scrollIntoViewIfNeeded();
    } },
  // A-98 / A-109 (R-49): the card shows the button WITHOUT the «opens outside» sign and NO thumbnail grid; nothing of the gallery is asked
  // or fetched until a tap (the list, the files: 0 requests while the card is open)
  { name: 'card', only: UK, path: '/monasteries/242', before: countGallery, ready: async (p) => {
      const card = onShown(p, 'card');
      const btn = card.getByTestId('gallery');
      await expect(btn).toBeVisible({ timeout: 15_000 });
      await expect(btn).toHaveAttribute('data-in-app', '1');
      await expect(btn.locator('ion-icon')).toHaveCount(1); // the pictures sign only; openOutline gone (it leads nowhere outside now)
      await expect.poll(() => spokenName(btn)).toBe((await words(p, ['card.gallery_open']))[0]);
      await expect(card.getByTestId('gallery-grid')).toHaveCount(0);
      await expect(card.locator('[data-testid="photo-open"]')).toHaveAttribute('aria-label', (await words(p, ['card.gallery_open']))[0]);
      await p.waitForTimeout(1500); // the card's own requests (views, related, covers) are over
      expect(gallery(p), 'A-109: no gallery request before a tap').toEqual({ list: [], photos: [] });
    } },
  // A-109: «Фотогалерея» and a tap on the cover open THE viewer (A-96) with ALL the card's photos from photos[0]: «1 / 40», the full file of the
  // SHOWN photo only (thumb null = it is the one copy), the card's name as the caption (alt null); the list asked ONCE per launch
  { name: 'card-gallery', only: [...UK, 'phone-ru'], path: '/monasteries/242', before: countGallery, ready: async (p) => {
      const card = onShown(p, 'card');
      await expect(card.getByTestId('gallery')).toHaveAttribute('data-in-app', '1', { timeout: 15_000 }); // the config has arrived (else 1.0.7's site link)
      await card.getByTestId('gallery').click();
      const img = p.getByTestId('viewer-img');
      await expect(p.getByTestId('viewer-count')).toContainText('1 / 40');
      await expect(img).toHaveAttribute('src', /\/monasteries\/242\/00\.jpg$/);
      await expect(img).toHaveAttribute('data-full', '1');
      await expect(p.locator('.viewer__caption')).toHaveText((await card.locator('.card__title').textContent())!);
      expect(gallery(p).list).toHaveLength(1);
      expect(gallery(p).photos, 'only the shown photo (no neighbour ahead)').toEqual(['242/00.jpg']);
      await p.getByTestId('viewer-next').click();
      await expect(p.getByTestId('viewer-count')).toContainText('2 / 40');
      await expect(img).toHaveAttribute('src', /\/242\/01\.jpg$/);
      expect(gallery(p).photos.filter((x) => x !== '242/00.jpg'), 'paging fetches the new current photo only').toEqual(['242/01.jpg']);
      await p.getByTestId('viewer-close').click();
      await viewerGone(p);
      // the cover itself: the same gallery at its first photo, the held list (no second request)
      await card.locator('[data-testid="photo-open"]').click();
      await expect(p.getByTestId('viewer-count')).toContainText('1 / 40');
      await expect(img).toHaveAttribute('src', /\/242\/00\.jpg$/);
      expect(gallery(p).list, 'the list held for this launch').toHaveLength(1);
      await picturesLoaded(p, '[data-testid="viewer-img"]', 1);
    } },
  // A-109: a card with ONE photo (275, the live answer): the viewer shows it with no counter and no arrows (nothing to page)
  { name: 'card-gallery-one', only: ['phone-light'], path: '/monasteries/275', before: countGallery, ready: async (p) => {
      const card = onShown(p, 'card');
      await expect(card.getByTestId('gallery')).toHaveAttribute('data-in-app', '1', { timeout: 15_000 });
      await card.getByTestId('gallery').click();
      await expect(p.getByTestId('viewer-img')).toHaveAttribute('src', /\/monasteries\/275\/00\.JPG$/);
      await expect(p.getByTestId('viewer-count')).toHaveCount(0);
      await expect(p.getByTestId('viewer-next')).toHaveCount(0);
      expect(gallery(p)).toEqual({ list: [gallery(p).list[0]], photos: ['275/00.JPG'] });
      await picturesLoaded(p, '[data-testid="viewer-img"]', 1);
    } },
  // A-109 / A-110: offline the cover opens the cover alone (as 1.0.7) and «Фотогалерея» = the short message (~2 s, the star's way), no request
  { name: 'card-gallery-offline', only: UK, path: '/monasteries/242', before: countGallery, ready: async (p) => {
      const card = onShown(p, 'card');
      await expect(card.getByTestId('gallery')).toHaveAttribute('data-in-app', '1', { timeout: 15_000 }); // the config has arrived (else 1.0.7's site link)
      await p.evaluate(() => localStorage.setItem('inok.net', JSON.stringify({ connected: false, metered: false, dataSaver: false })));
      await card.locator('[data-testid="photo-open"]').click();
      await expect(p.getByTestId('viewer-img')).toHaveAttribute('src', /og_img\/242\.jpg$/);
      await expect(p.getByTestId('viewer-count')).toHaveCount(0); // one picture
      await p.getByTestId('viewer-close').click();
      await viewerGone(p);
      const toasts = p.locator('ion-toast[data-testid="gallery-offline"]:not(.overlay-hidden)');
      await card.getByTestId('gallery').click();
      await expect(toasts).toHaveCount(1);
      await expect(toasts.first()).toContainText((await words(p, ['card.gallery_offline']))[0]);
      await toastAboveTabs(p, 'ion-toast[data-testid="gallery-offline"]:not(.overlay-hidden)'); // D73
      await expect(toasts).toHaveCount(0, { timeout: 4000 }); // gone after ~2 s
      await expect(card.getByTestId('gallery')).toBeVisible(); // the button stays
      await card.getByTestId('gallery').click(); // the shot: the message above the tab bar
      await expect(toasts.first()).toContainText((await words(p, ['card.gallery_offline']))[0]);
      expect(gallery(p), 'offline: no request of the gallery').toEqual({ list: [], photos: [] });
      await expect(p.locator('ion-modal.viewer:not(.overlay-hidden)')).toHaveCount(0);
    } },
  // P1: a server WITHOUT `features.monastery_photos` = 1.0.7: the button opens the site's gallery (`gallery_url`), its «outside» sign kept
  { name: 'card-gallery-site', only: ['phone-light'], path: '/monasteries/242', before: async (p) => { await countGallery(p); await recordOpens(p);
      await p.addInitScript(() => { (window as any).__inokConfig = { features: { comments_write: false, embedded_player: false, articles_query: true, articles_sort_v2: true } }; }); }, ready: async (p) => {
      const btn = onShown(p, 'card').getByTestId('gallery');
      await expect(btn).toHaveAttribute('data-in-app', '0', { timeout: 15_000 });
      await expect(btn.locator('ion-icon')).toHaveCount(2);
      await expect(btn).toHaveAttribute('aria-label', (await words(p, ['card.gallery_hint']))[0]);
      expect(await opened(p, 'gallery')).toMatch(/^https:\/\/inok\.info\/monasteries\/242\/\?gallery=Y/);
      expect(gallery(p).list).toEqual([]);
    } },
  // A-111: «Очистити збережені фото» under «Автозавантаження фото» - the space read from the store (the browser ring's stand-in of the files:
  // `__inokPhotoStore`), the confirmation, the message; kept pictures (list thumbnails) stay. The same stand-in counts what is asked again.
  { name: 'settings-photos', only: UK, path: '/more', before: photoStore(SEED), ready: async (p) => {
      const btn = await photosBlock(p, '12,4');
      await expect.poll(() => innerDisabled(btn)).toBe(false);
      await expect.poll(() => spokenName(btn)).toBe(`${(await words(p, ['photos.clear']))[0]}, ${await p.getByTestId('photos-used').textContent()}`);
      await expect(p.locator('.more__clear-hint')).toHaveText((await words(p, ['photos.clear_hint']))[0]);
      // the row sits UNDER the choice, inside its block: no line between them, the button's text aligned with the select's
      const g = await p.evaluate(() => ({ sel: document.querySelector('[data-testid="photos-mode"]')!.getBoundingClientRect(), row: document.querySelector('[data-testid="more-photos-clear"]')!.getBoundingClientRect(),
        btn: document.querySelector('[data-testid="photos-clear"]')!.getBoundingClientRect(), used: document.querySelector('[data-testid="photos-used"]')!.getBoundingClientRect() }));
      expect(g.row.top).toBeGreaterThanOrEqual(g.sel.bottom - 1);
      expect(Math.abs(g.btn.left - g.sel.left), 'the button under the select\'s text').toBeLessThanOrEqual(2);
      expect(Math.abs((g.used.top + g.used.height / 2) - (g.btn.top + g.btn.height / 2)), `the space used beside the button, one line ${JSON.stringify(g)}`).toBeLessThanOrEqual(2);
      expect(g.btn.height, 'Ionic\'s standard button (its ::after makes the target 48 dp)').toBeGreaterThanOrEqual(40);
    } },
  { name: 'settings-photos-confirm', only: UK, path: '/more', before: photoStore(SEED), ready: async (p) => {
      const btn = await photosBlock(p, '12,4');
      const [clear, cancel, hint] = await words(p, ['photos.clear', 'common.cancel', 'photos.clear_hint']);
      const dlg = p.locator('ion-alert.photos-confirm:not(.overlay-hidden)');
      await btn.click();
      await expect(dlg.locator('.alert-title')).toHaveText(clear);
      await expect(dlg.locator('.alert-message')).toHaveText(hint);
      expect(await dlg.locator('.alert-button').evaluateAll((bs) => bs.map((b) => (b.textContent ?? '').trim()))).toEqual([cancel, clear]);
      await dlg.getByTestId('photos-confirm-cancel').click(); // an accidental tap: «Скасувати» removes nothing
      await expect(dlg).toHaveCount(0);
      await expect(p.getByTestId('photos-used')).toHaveText(/^12,4 /);
      expect(await stored(p)).toEqual({ kept: 2, photos: 3 });
      await btn.click(); // the shot: the dialog
      await expect(dlg.locator('.alert-button')).toHaveCount(2);
      await p.waitForTimeout(400); // the dialog's entrance is over
    } },
  { name: 'settings-photos-cleared', only: UK, path: '/more', before: photoStore(SEED), ready: async (p) => {
      const btn = await photosBlock(p, '12,4');
      const toasts = p.locator('ion-toast[data-testid="photos-cleared"]:not(.overlay-hidden)');
      // the shot: the page at its end, so the block stands above the message - the message, «0 МБ» and the unavailable button together
      await p.locator(SHOWN).locator('ion-content').evaluate((c) => (c as unknown as { scrollToBottom: (ms: number) => Promise<void> }).scrollToBottom(0));
      await btn.click();
      await p.locator('ion-alert.photos-confirm:not(.overlay-hidden)').getByTestId('photos-confirm-do').click();
      await expect(toasts).toHaveCount(1);
      await expect(toasts.first()).toContainText((await words(p, ['photos.cleared']))[0]);
      expect(await toasts.first().evaluate((t) => t.shadowRoot!.querySelector('[role="status"]')?.getAttribute('aria-live') ?? 'none')).toBe('polite');
      await toastAboveTabs(p, 'ion-toast[data-testid="photos-cleared"]:not(.overlay-hidden)'); // D73
      await expect(p.getByTestId('photos-used')).toHaveText(`0 ${(await words(p, ['photos.mb']))[0]}`);
      await expect.poll(() => innerDisabled(btn), 'TalkBack: «недоступно» (the inner button is disabled)').toBe(true);
      expect(await stored(p), 'the list thumbnails stay, the large photos go').toEqual({ kept: 2, photos: 0 });
    } },
  // A-111 + A-109: a gallery photo opened, «зайнято» grows, the clear, the same gallery again: its photo is ASKED AGAIN (the stand-in's
  // downloads), the list thumbnails are not; the gallery still opens and shows the photo
  { name: 'card-gallery-cleared', only: UK, path: '/monasteries/242', before: async (p) => { await countGallery(p); await photoStore({})(p); }, ready: async (p) => {
      const card = onShown(p, 'card');
      await expect(card.getByTestId('gallery')).toHaveAttribute('data-in-app', '1', { timeout: 15_000 });
      await card.getByTestId('gallery').click();
      await expect(p.getByTestId('viewer-img')).toHaveAttribute('data-full', '1');
      await p.getByTestId('viewer-close').click();
      await viewerGone(p);
      const asked = () => p.evaluate(() => ((window as any).__inokPhotoStoreLive.downloads as string[]).filter((u) => /\/monasteries\/242\/00\.jpg$/.test(u)).length);
      expect(await asked()).toBe(1);
      await p.locator('ion-tab-button[tab="more"]').click();
      const btn = await photosBlock(p, /^0,[1-9] |^[1-9]/); // the opened photo + the card's cover: more than 0
      await btn.click();
      await p.locator('ion-alert.photos-confirm:not(.overlay-hidden)').getByTestId('photos-confirm-do').click();
      await expect(p.getByTestId('photos-used')).toHaveText(/^0 /);
      await p.goBack();
      await expect(onShown(p, 'card')).toBeVisible();
      await settled(p);
      await onShown(p, 'card').getByTestId('gallery').click();
      await expect(p.getByTestId('viewer-img')).toHaveAttribute('data-full', '1');
      expect(await asked(), 'the photo is asked again after the clear').toBe(2);
      expect(gallery(p).list, 'the list held for this launch (no second list request)').toHaveLength(1);
      await picturesLoaded(p, '[data-testid="viewer-img"]', 1);
    } },
  // A-112: the viewer obeys «Автозавантаження фото» («Тільки Wi-Fi» by default; Wi-Fi off = mobile data). The card's gallery (R-49: no small
  // copy) shows the photo's empty frame (its w / h) and THE standard block under it (owner 15.11, as in a publication); no full file is asked by
  // opening or paging; the block clears the counter / «×» / the arrows
  { name: 'viewer-wait-card', only: UK, path: '/monasteries/242', before: countGallery, ready: async (p) => {
      await openCardGallery(p);
      const frame = p.getByTestId('viewer-wait');
      const block = viewerBlock(p);
      await expect(block).toHaveAttribute('data-why', 'wifi');
      await expect(block).toHaveAttribute('role', 'status'); // TalkBack hears the reason when it appears
      const [mobile, reason, link] = await words(p, ['photos.load_mobile', 'photos.reason_wifi', 'photos.title']);
      await expect(block.locator('.photo-wait__reason')).toHaveText(reason);
      await expect(block.getByTestId('photo-load')).toHaveText(mobile);
      await expect(block.getByTestId('photo-settings')).toHaveText(link);
      const f = (await frame.boundingBox())!;
      expect(Math.abs(f.width / f.height - 2045 / 1153), 'the frame keeps the photo shape').toBeLessThan(0.03);
      expect((await block.boundingBox())!.y, 'owner 15.11: the block UNDER the frame, as in a publication').toBeGreaterThanOrEqual(f.y + f.height - 1);
      await clearOf(p, block);
      await clearOf(p, block.getByTestId('photo-load'), ['viewer-prev', 'viewer-next']); // the button at mid-height, beside the page arrows
      // P11: a swipe on the waiting frame pages (the block's button is not a gesture), and back
      await swipe(p, frame, -160);
      await expect(p.getByTestId('viewer-count')).toContainText('2 / 40');
      await expect(viewerBlock(p)).toHaveAttribute('data-why', 'wifi');
      await p.waitForTimeout(400); // two presses within 300 ms are the viewer's double tap (zoom), not two swipes
      await swipe(p, p.getByTestId('viewer-wait'), 160);
      await expect(p.getByTestId('viewer-count')).toContainText('1 / 40');
      expect(gallery(p).photos, 'opening and paging ask NO full file').toEqual([]);
    } },
  // A-112: the button = the manual request: the photo comes, the block leaves, the focus is on the picture; ONE file asked
  { name: 'viewer-wait-loaded', only: UK, path: '/monasteries/242', before: countGallery, ready: async (p) => {
      await openCardGallery(p);
      await viewerBlock(p).getByTestId('photo-load').click();
      const img = p.getByTestId('viewer-img');
      await expect(img).toHaveAttribute('data-full', '1');
      await expect(img).toHaveAttribute('src', /\/monasteries\/242\/00\.jpg$/);
      await expect(viewerBlock(p)).toHaveCount(0);
      await expect(img).toBeFocused(); // P10: the focus is not lost with the button
      expect(gallery(p).photos).toEqual(['242/00.jpg']);
      await picturesLoaded(p, '[data-testid="viewer-img"]', 1);
    } },
  // A-112: WITHOUT a tap the next photo waits too - the count of asked files does not grow
  { name: 'viewer-wait-next', only: UK, path: '/monasteries/242', before: countGallery, ready: async (p) => {
      await openCardGallery(p);
      await p.getByTestId('viewer-next').click();
      await expect(p.getByTestId('viewer-count')).toContainText('2 / 40');
      await expect(p.getByTestId('viewer-wait')).toHaveAttribute('data-index', '1');
      await expect(viewerBlock(p)).toHaveAttribute('data-why', 'wifi');
      expect(gallery(p).photos, 'no full file asked').toEqual([]);
    } },
  // A-112 (his «Одно нажатие - вся галерея»): after the tap the NEXT photo loads by itself (the current one only, no neighbour ahead); closed and
  // opened again: the saved photos show at once (from the phone), the first unsaved one shows the block again (the consent is gone)
  { name: 'viewer-wait-allowed', only: UK, path: '/monasteries/242', before: async (p) => { await countGallery(p); await photoStore({})(p); }, ready: async (p) => {
      await openCardGallery(p);
      const img = p.getByTestId('viewer-img');
      const asked = () => p.evaluate(() => ((window as any).__inokPhotoStoreLive.downloads as string[]).filter((u) => /\/monasteries\/242\/\d\d\.jpg$/.test(u)).map((u) => u.split('/').pop()));
      await viewerBlock(p).getByTestId('photo-load').click();
      await expect(img).toHaveAttribute('data-full', '1');
      await p.getByTestId('viewer-next').click();
      await expect(p.getByTestId('viewer-count')).toContainText('2 / 40');
      await expect(img).toHaveAttribute('src', /\/242\/01\.jpg$/);
      await expect(img).toHaveAttribute('data-full', '1');
      expect(await asked(), 'the tap + the paged one, nothing ahead').toEqual(['00.jpg', '01.jpg']);
      await p.getByTestId('viewer-close').click();
      await viewerGone(p);
      await onShown(p, 'card').getByTestId('gallery').click();
      await expect(p.getByTestId('viewer-count')).toContainText('1 / 40');
      await expect(img).toHaveAttribute('data-full', '1'); // saved on the phone: shown at once
      await p.getByTestId('viewer-next').click();
      await expect(img).toHaveAttribute('src', /\/242\/01\.jpg$/);
      await p.getByTestId('viewer-next').click();
      await expect(p.getByTestId('viewer-count')).toContainText('3 / 40');
      await expect(viewerBlock(p)).toHaveAttribute('data-why', 'wifi'); // asked again
      expect(await asked(), 'nothing more after the reopening').toEqual(['00.jpg', '01.jpg']);
    } },
  // A-112 P7: Wi-Fi comes back while the viewer is open - the waiting photo loads by itself (the slot's network listener, the same hook)
  { name: 'viewer-wait-netback', only: ['phone-light'], path: '/monasteries/242', before: countGallery, ready: async (p) => {
      await openCardGallery(p);
      await expect(viewerBlock(p)).toHaveAttribute('data-why', 'wifi');
      await p.evaluate(() => { localStorage.setItem('inok.net', JSON.stringify({ connected: true, metered: false, dataSaver: false })); dispatchEvent(new Event('online')); });
      await expect(p.getByTestId('viewer-img')).toHaveAttribute('data-full', '1');
      expect(gallery(p).photos).toEqual(['242/00.jpg']);
      await picturesLoaded(p, '[data-testid="viewer-img"]', 1);
    } },
  { name: 'monastery-favourite', path: '/monasteries/37', ready: async (p) => {
      await expect(p.getByTestId('card')).toBeVisible();
      const [added, removed] = await words(p, ['card.favourite_added', 'card.favourite_removed']);
      const toasts = p.locator('ion-toast[data-testid="fav-toast"]:not(.overlay-hidden)');
      await p.getByTestId('fav').click();
      await expect(p.getByTestId('fav')).toHaveAttribute('data-on', '1');
      // A-96 W-6: «Додано до обраного» for ~2 s above the tab bar, read by TalkBack (role status, polite); a second tap REPLACES it at once
      await expect(toasts).toHaveCount(1);
      await expect(toasts.first()).toContainText(added);
      expect(await toasts.first().evaluate((t) => { const c = t.shadowRoot!.querySelector('[role="status"]'); return c ? `${c.getAttribute('aria-live')}` : 'none'; })).toBe('polite');
      await toastAboveTabs(p, 'ion-toast[data-testid="fav-toast"]:not(.overlay-hidden)'); // D73
      await p.getByTestId('fav').click();
      await expect(p.getByTestId('fav')).toHaveAttribute('data-on', '0');
      await expect(toasts.first()).toContainText(removed, { timeout: 1500 });
      await expect(toasts).toHaveCount(1);
      await expect(toasts).toHaveCount(0, { timeout: 4000 }); // gone after ~2 s
      await p.getByTestId('fav').click();
      await expect(toasts.first()).toContainText(added); // the shot: the favourite on, its message above the tab bar
      // the favourite shows up in «Обрані» (persistence across restarts is proven on the device, ring 3: the web DB is in-memory)
    } },
  { name: 'streams', path: '/streams', ready: async (p) => { await expect(p.getByTestId('channels')).toBeVisible(); await expect(p.getByTestId('calendar')).toBeVisible(); await avatarsLoaded(p); } },
  // A-85 (1): «Додайте свій канал» at the end of the streams' content -> the site's /live/ with the «add a channel» anchor in the in-app tab
  { name: 'streams-add-channel', only: ['phone-light', 'phone-dark', 'tablet'], path: '/streams', ready: async (p) => {
      await expect(p.getByTestId('channels')).toBeVisible();
      await p.route('https://inok.info/live/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>site</p>' }));
      const add = p.getByTestId('channel-add').locator('visible=true');
      await add.scrollIntoViewIfNeeded();
      await expect(add).toHaveText('Додайте свій канал');
      expect(await add.evaluate((b) => b.getBoundingClientRect().height), 'the comment button\'s size (>= 24, WCAG 2.5.8)').toBeGreaterThanOrEqual(36);
      // after every channel row, before the share footer
      const order = await p.evaluate(() => { const pg = document.querySelector('ion-tabs ion-router-outlet > .ion-page:not(.ion-page-hidden)')!;
        const y = (q: string) => Array.from(pg.querySelectorAll(q)).map((e) => e.getBoundingClientRect().top);
        return { rows: Math.max(...y('[data-testid="channels"] ion-item')), add: y('[data-testid="channel-add"]')[0], share: y('[data-testid="share-footer"]')[0] }; });
      expect(order.add).toBeGreaterThan(order.rows); expect(order.add).toBeLessThan(order.share);
      const [tab] = await Promise.all([p.waitForEvent('popup'), add.click()]);
      expect(tab.url()).toBe('https://inok.info/live/#skm-cta-channel');
      await tab.close();
      await add.scrollIntoViewIfNeeded();
    } },
  { name: 'streams-add-channel-offline', only: ['phone-light'], path: '/streams', before: net({ connected: false, metered: false, dataSaver: false }), ready: async (p) => {
      const add = p.getByTestId('channel-add').locator('visible=true');
      await add.scrollIntoViewIfNeeded();
      await expect(add).toHaveAttribute('data-net', 'off');
      await expect(p.getByTestId('channel-add-offline').locator('visible=true')).toHaveText('Щоб додати канал, потрібна мережа');
    } },
  // D58(в): opened with nothing to show, the map frames ALL the houses by THE fit (Ukraine, every mark whole) - not a fixed box
  { name: 'map', path: '/map', ready: async (p) => { await mapReady(p); await scopeFit(p); } },
  { name: 'map-markers', path: '/map', ready: async (p) => {
      await mapReady(p);
      // A-12: zoom to the Kyiv houses (the Lavra 242, «Церковщина» 37) - the site's SVG pins, no clusters at this zoom
      await jumpDrawn(p, { center: [30.545, 50.385], zoom: 10.6 });
      // 37 among the houses, the Lavra 242 in the lavras' own layer (A-21(б))
      expect(await p.evaluate(() => (window as any).__inokMap.queryRenderedFeatures({ layers: ['points', 'lavras'] }).length)).toBeGreaterThanOrEqual(2);
      expect(await p.evaluate(() => (window as any).__inokMap.hasImage('lavra_kpl'))).toBe(true);
    } },
  // A-21(б) / A-23 #9: zoomed out over Ukraine — Kyiv, Pochaiv, Sviatohirsk: the three lavra pins DRAWN, outside every cluster, above all
  { name: 'map-lavras', path: '/map', ready: async (p) => {
      await mapReady(p);
      await expect(p.getByTestId('map')).toHaveAttribute('data-lavras', '3');
      await expect(p.getByTestId('map')).toHaveAttribute('data-lavras-drawn', '3', { timeout: 15_000 });
      await expect(p.getByTestId('map')).toHaveAttribute('data-lavras-above', 'true');
    } },
  { name: 'map-card', path: '/map?code=37', ready: async (p) => { await mapReady(p); await expect(p.getByTestId('map-card')).toContainText('Церковщина'); } },
  { name: 'map-marker-tap', path: '/map', ready: async (p) => {
      await mapReady(p);
      // zoom to the marker, then click the canvas where the map projects it — a real marker tap
      const pt = await p.evaluate(async () => {
        const m = (window as any).__inokMap; m.jumpTo({ center: [30.535177, 50.320787], zoom: 13 });
        // tiles may never settle (proxy/offline) — wait only for the clustered source to re-tile at the new zoom
        for (let i = 0; i < 50 && m.queryRenderedFeatures({ layers: ['points'] }).length === 0; i++) await new Promise((r) => setTimeout(r, 100));
        await new Promise((r) => setTimeout(r, 800)); // symbol placement + fade: hit-testing works only after it
        const { x, y } = m.project([30.535177, 50.320787]); const b = m.getCanvas().getBoundingClientRect();
        return { x: b.left + x, y: b.top + y };
      });
      // the pin's body: the site's icon stands ON the point (anchor bottom) — try its middle, then a bit higher / lower
      for (const dy of [-18, -24, -12]) {
        await p.mouse.click(pt.x, pt.y + dy);
        if (await p.getByTestId('map-card').isVisible().catch(() => false)) break;
        await p.waitForTimeout(400);
      }
      await expect(p.getByTestId('map-card')).toContainText('Церковщина');
    } },
  // cloud_37 (A-121, found on the iOS simulator: R-TypeError «t.setData»): «near me» asked while the map is between two styles (the local
  // style swapped for the network one drops every source until our layers return) - no crash; the dot comes back with the layers
  { name: 'map-near-style-swap', path: '/map', only: ['phone-light'], ready: async (p) => {
      await mapReady(p);
      // the window made as long as on a slow phone: the marker pictures of the next style are held undecoded until released, so our sources
      // (dropped by the style swap) are not back yet when «near me» answers
      await p.evaluate(() => { const w = window as any; const orig = HTMLImageElement.prototype.decode; w.__held = []; w.__decode = orig;
        HTMLImageElement.prototype.decode = function () { return new Promise<void>((ok, ko) => w.__held.push(() => orig.call(this).then(ok, ko))); }; });
      await p.evaluate(() => { const m = (window as any).__inokMap; const st = m.getStyle(); const ours = new Set(['monasteries', 'lavras', 'place', 'me', 'radius']);
        // the next style as the network sends it: the base map only - none of our sources / layers (getStyle() would carry them over)
        m.setStyle({ ...st, sources: Object.fromEntries(Object.entries(st.sources).filter(([k]) => !ours.has(k))), layers: st.layers.filter((l: any) => !ours.has(l.source)) }, { diff: false }); });
      await p.waitForTimeout(400);
      expect(await p.evaluate(() => !!(window as any).__inokMap.getSource('me')), 'our sources are gone during the swap').toBe(false);
      await onShown(p, 'near-me').evaluate((b) => (b as HTMLElement).click());
      await expect(onShown(p, 'near-list')).toBeVisible({ timeout: 15_000 });
      await p.waitForTimeout(500);
      await expect(p.getByTestId('crash'), 'no crash screen (R-TypeError «t.setData» on the iOS simulator)').toHaveCount(0);
      await p.evaluate(() => { const w = window as any; HTMLImageElement.prototype.decode = w.__decode; for (const f of w.__held.splice(0)) f(); }); // the pictures come
      await expect.poll(() => p.evaluate(() => (window as any).__inokMap.getSource('me')?.serialize().data?.features?.length ?? -1), { timeout: 15_000 }).toBe(1);
    } },
  { name: 'map-near', path: '/map', ready: async (p) => {
      await mapReady(p);
      await p.getByTestId('near-me').click();
      await expect(p.getByTestId('near-list')).toBeVisible();
      await expect(p.getByTestId('near-count')).toContainText('2'); // Kyiv → the Lavra (242) and «Церковщина» ≈ 14 km, the others are far
      await expect(p.getByTestId('mrow-37')).toContainText('км');
      await p.waitForTimeout(800);
    } },
  // owner 02.11.2026: «Головна → Поруч → Всі» = the map with «near me» ON, exactly as its locate button starts it (one start, MAP_NEAR)
  { name: 'home-near-all', path: '/home', ready: async (p) => {
      await expect(p.getByTestId('home-near').locator('visible=true')).toBeVisible();
      await p.getByTestId('home-near').locator('visible=true').getByRole('link').click();
      await mapReady(p);
      await expect(p.getByTestId('near-list').locator('visible=true')).toBeVisible();
      await expect(p.getByTestId('near-count')).toContainText('2'); // the same 2 as «map-near» (the button)
      await expect(p.getByTestId('near-me').locator('visible=true')).toHaveAttribute('fill', 'solid');
      // the count is whole and inside the view (never a letter column, never under the row's fade)
      const c = await p.getByTestId('near-count').evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); const b = Array.from(r.getClientRects()); const row = e.parentElement!.getBoundingClientRect();
        return { lines: new Set(b.map((x) => Math.round(x.top))).size, right: Math.max(...b.map((x) => x.right)), end: row.right - 28 }; });
      expect(c.lines, 'one line').toBe(1);
      expect(c.right, 'clear of the fade').toBeLessThanOrEqual(c.end);
      await expect.poll(() => new URL(p.url()).search, 'the flag leaves the address (Back does not repeat it)').toBe('');
      await p.waitForTimeout(800);
    } },
  { name: 'map-offline', path: '/map', before: async (p) => { await p.route('https://tiles.openfreemap.org/**', (r) => r.abort()); },
    ready: async (p) => { await mapReady(p); await expect(p.getByTestId('map-offline')).toBeVisible(); await housesDrawn(p); } },
  // A-117 (1), the owner's phone (weak signal): the config already known (the map opened from the tab bar after «Головна»), the style
  // request NEVER answers, every other request fails. 1.0.10: a white map under the note, no house (JOURNAL «A1»); now the local style
  // with the clustered houses AND the lavras, the note after BASEMAP_WAIT_MS, the gestures alive (a zoom-in re-clusters)
  // cloud_37 (the iOS 16.4 simulator: «Object.values requires…» thrown inside MapLibre's areTilesLoaded by our 8-s tile timer = the crash
  // screen): tiles that never come + MapLibre failing that question -> no crash, the map stays
  { name: 'map-tiles-question-throws', path: '/map', only: ['phone-light'], before: async (p) => {
      await p.route('https://tiles.openfreemap.org/**', (r) => (/\/styles\//.test(r.request().url()) ? r.continue() : undefined)); },
    ready: async (p) => {
      await expect.poll(() => p.evaluate(() => !!(window as any).__inokMap), { timeout: 20_000 }).toBe(true);
      await p.evaluate(() => { (window as any).__inokMap.areTilesLoaded = () => { throw new TypeError('Object.values requires that input parameter not be null or undefined'); }; });
      await p.waitForTimeout(10_000); // past BASEMAP_WAIT_MS (8 s) after the network style's load
      await expect(p.getByTestId('crash'), 'no crash screen').toHaveCount(0);
      await expect(p.getByTestId('map').locator('visible=true')).toBeVisible();
    } },
  { name: 'map-offline-weak', path: '/home', before: async (p) => {
      await p.route('https://tiles.openfreemap.org/**', (r) => (/\/styles\//.test(r.request().url()) ? undefined : r.abort())); },
    ready: async (p) => {
      await expect(p.getByTestId('home-fresh').locator('visible=true')).toBeVisible();
      await p.locator('ion-tab-button[tab="map"]').click();
      await mapReady(p);
      await housesDrawn(p);
      await expect(p.getByTestId('map-offline')).toBeVisible({ timeout: 15_000 });
      expect(await p.evaluate(() => (window as any).__inokMap.getStyle().layers.length), 'the local style (background + our layers)').toBeLessThan(20);
      const z = await p.evaluate(() => (window as any).__inokMap.getZoom());
      await p.locator('.maplibregl-ctrl-zoom-in').locator('visible=true').click();
      await expect.poll(() => p.evaluate(() => (window as any).__inokMap.getZoom()), { message: 'the zoom button works offline' }).toBeGreaterThan(z + 0.5);
      await mapReady(p);
    } },
  // A-37 (owner 02.11.2026): a channel live NOW opens the broadcast itself (live[].video_id) on every screen; not live = the channel page
  { name: 'streams-open-live', only: UK, path: '/streams', before: recordOpens, ready: async (p) => {
      await expect(p.getByTestId('channels')).toBeVisible();
      expect(await opened(p, 'srow-1686')).toBe('https://www.youtube.com/watch?v=HzazQCqXxyE'); // live now: «Онлайн»
      expect(await opened(p, 'srow-1687')).toBe('https://www.youtube.com/channel/UCKzsQXAGrL_0jWlTBgGey1Q'); // the Lavra, not live: its page
    } },
  { name: 'home-live-video', only: UK, path: '/home', before: recordOpens, ready: async (p) => {
      expect(await opened(p, 'home-live-1686')).toBe('https://www.youtube.com/watch?v=HzazQCqXxyE');
    } },
  { name: 'card-stream-live', only: UK, path: '/monasteries/111', before: recordOpens, ready: async (p) => {
      expect(await opened(p, 'card-stream')).toBe('https://www.youtube.com/watch?v=HzazQCqXxyE'); // its channel 1686 (first in the export's order) is live
    } },
  { name: 'card-stream-channel', only: UK, path: '/monasteries/242', before: recordOpens, ready: async (p) => {
      expect(await opened(p, 'card-stream')).toBe('https://www.youtube.com/channel/UCKzsQXAGrL_0jWlTBgGey1Q'); // not live: the channel page, as before
    } },
  // A-96 W-7 (replaces A-36): «Ще → Режим інкогніто» — OFF at first: the screen names leave (only names); ON: nothing more leaves, and it is
  // remembered; TalkBack hears a switch with its state and the label + the hint
  { name: 'more-incognito', only: UK, path: '/home', ready: async (p) => {
      const sent = () => p.evaluate(() => [...((window as any).__inokAnalytics ?? [])]);
      await expect.poll(sent).toContain('home');
      await p.goto('/more'); // a restart: the switch read again, the screen logged
      await expect.poll(sent).toEqual(['more']);
      const toggle = p.getByTestId('incognito-toggle').locator('visible=true');
      await expect(toggle).toHaveAttribute('data-on', '0');
      const [title, hint] = await words(p, ['more.incognito', 'more.incognito_hint']);
      await expect(toggle).toContainText(title); await expect(toggle).toContainText(hint);
      expect(await toggle.evaluate((t) => { const i = t.shadowRoot!.querySelector('input,[role="switch"]')!; return `${i.getAttribute('role') ?? (i as HTMLInputElement).type}:${(i as HTMLInputElement).checked ?? i.getAttribute('aria-checked')}`; })).toMatch(/^(switch|checkbox):false$/);
      await toggle.click();
      await expect(toggle).toHaveAttribute('data-on', '1');
      const n = (await sent()).length;
      await p.goto('/streams');
      await expect(p.getByTestId('channels')).toBeVisible();
      expect(await sent(), 'off after a restart too: nothing sent').toEqual([]);
      await p.goto('/more');
      await expect(p.getByTestId('incognito-toggle').locator('visible=true')).toHaveAttribute('data-on', '1');
      expect(n).toBeGreaterThan(0);
      expect((await sent()).every((x: string) => /^[a-z]+$/.test(x))).toBe(true);
      await p.getByTestId('more-incognito').locator('visible=true').scrollIntoViewIfNeeded();
    } },
  // A-117 (2): the section opens on «Статті»; the whole feed = one tap on «Все» (the screens below that test the feed take it first)
  { name: 'articles-entry', path: '/home', ready: async (p) => {
      await expect(p.getByTestId('home-checked').locator('visible=true')).toBeVisible();
      await p.locator('ion-tab-button[tab="articles"]').click();
      await entryKind(p, 'publication');
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]').first()).toHaveAttribute('data-kind', 'publication');
      // an article and Back: the same kind; the tab button from another tab: the same top screen, the same kind
      await onShown(p, 'articles').locator('[data-testid^="arow-"]').first().click();
      await expect(p).toHaveURL(/\/articles\?id=\d+$/);
      await settled(p); await onShown(p, 'back').click();
      await entryKind(p, 'publication');
      await p.locator('ion-tab-button[tab="map"]').click();
      await expect(p).toHaveURL(/\/map$/);
      await p.locator('ion-tab-button[tab="articles"]').click();
      await entryKind(p, 'publication');
      // a kind chosen by the person is kept as before (A-27: the top screen stays mounted)
      await onShown(p, 'kind-tab-all').click();
      await p.locator('ion-tab-button[tab="streams"]').click();
      await expect(p).toHaveURL(/\/streams$/);
      await p.locator('ion-tab-button[tab="articles"]').click();
      await entryKind(p, 'all');
      await onShown(p, 'kind-tab-publication').click();
      await entryKind(p, 'publication');
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]').first()).toHaveAttribute('data-kind', 'publication');
    } },
  { name: 'articles', path: '/articles', ready: async (p) => { await entryKind(p, 'publication'); await toAll(p); await expect(p.getByTestId('articles')).toBeVisible(); await expect(p.locator('[data-testid^="arow-"]')).toHaveCount(10); await picturesLoaded(p, '.arow__cover img', 3); } },
  { name: 'articles-news', path: '/articles', ready: async (p) => {
      await expect(p.getByTestId('articles')).toBeVisible();
      await p.getByTestId('kind-tab-news').click();
      await expect(p.locator('[data-testid^="arow-"]')).toHaveCount(7);
      expect(await noLeads(p, '[data-testid="articles"]'), 'A-55: every news row without a lead').toBe(7);
      await hyphenated(p, '[data-testid="articles"] [data-testid^="arow-"] ion-label', false); // A-56: none at the normal scale (A-55)
    } },
  // A-87 (2) + A-96 W-8: the kind tabs stay under the toolbar while only the list scrolls; every tab looks the same (inactive grey, active blue)
  { name: 'articles-tabs-top', path: '/articles', ready: async (p) => {
      await toAll(p);
      await expect(p.locator('[data-testid^="arow-"]')).toHaveCount(10);
      const inks = await kindInks(p);
      expect(Object.fromEntries(Object.entries(inks).map(([k, v]) => [k, v.tone])), JSON.stringify(inks)).toEqual({ all: 'blue', publication: 'grey', video: 'grey', news: 'grey' });
      // A-88: TalkBack hears «tab, 1 of 4, selected» - the row is a tablist, each kind a tab with its selected state
      expect(await p.locator(SHOWN).getByTestId('kinds').evaluate((k) => [k.getAttribute('role'), ...Array.from(k.querySelectorAll('ion-segment-button'))
        .map((b) => { const n = b.shadowRoot?.querySelector('button'); return `${n?.getAttribute('role')}:${n?.getAttribute('aria-selected')}`; })]))
        .toEqual(['tablist', 'tab:true', 'tab:false', 'tab:false', 'tab:false']); // Ionic draws the tab on the inner (shadow) button
      await p.locator(SHOWN).getByTestId('kind-tab-publication').click();
      await expect(p.locator(SHOWN).getByTestId('kind-tab-publication')).toHaveClass(/segment-button-checked/);
      await p.mouse.move(0, 0); await p.waitForTimeout(400); // the segment's indicator transition
      const on = await kindInks(p);
      expect(Object.fromEntries(Object.entries(on).map(([k, v]) => [k, v.tone])), JSON.stringify(on)).toEqual({ all: 'grey', publication: 'blue', video: 'grey', news: 'grey' });
      await p.locator(SHOWN).getByTestId('kind-tab-all').click();
      await expect(p.locator(SHOWN).getByTestId('kind-tab-all')).toHaveClass(/segment-button-checked/);
      expect((await kindsAt(p)).offset, 'the tabs at the top of the list').toBeLessThanOrEqual(8);
    } },
  // A-97: the header - three icon-only buttons (search, sort, refresh) with their spoken names; «Публікації» printed where it fits beside
  // them, its TEXT dropped (never cut, never wrapped) where it does not - at 360 px x 100 / 200 % fonts x 3 languages
  ...[undefined, 200].map((font) => ({ name: `articles-header${font ? `-font${font}` : ''}`, font, only: font ? UK : [...UK, 'phone-ru'], path: '/articles', ready: async (p: Page) => {
      await expect(onShown(p, 'articles')).toBeVisible();
      const [search, sort, upd, title] = await words(p, ['articles.search_open', 'articles.sort', 'common.refresh', 'articles.title']);
      await expect.poll(() => spokenName(onShown(p, 'search-open'))).toBe(search);
      await expect.poll(() => spokenName(onShown(p, 'sort-open'))).toBe(sort);
      if (upd) await expect.poll(() => spokenName(onShown(p, 'refresh'))).toBe(upd);
      for (const id of ['search-open', 'sort-open', 'refresh']) expect(await onShown(p, id).evaluate((b) => b.querySelector('ion-icon')?.getAttribute('aria-hidden') === 'true' && !b.textContent?.trim()), `${id}: icon only`).toBe(true);
      const h = await onShown(p, 'page-title').evaluate((e) => ({ text: e.textContent, lines: Math.round((e.clientHeight - parseFloat(getComputedStyle(e).paddingTop) - parseFloat(getComputedStyle(e).paddingBottom)) / parseFloat(getComputedStyle(e).lineHeight)), fits: e.scrollWidth <= e.clientWidth + 1, dropped: (e as HTMLElement).dataset.dropped, color: getComputedStyle(e).color }));
      expect(h.text).toBe(title);
      expect(h.lines, 'never wrapped').toBe(1);
      expect(h.dropped, 'dropped exactly when it does not fit').toBe(h.fits ? '0' : '1');
      if (h.dropped === '1') expect(h.color, 'a dropped title is not drawn').toBe('rgba(0, 0, 0, 0)');
      for (const id of ['search-open', 'sort-open', 'refresh']) { const b = (await onShown(p, id).boundingBox())!; expect(b.x + b.width, `${id} inside the screen`).toBeLessThanOrEqual(p.viewportSize()!.width + 0.5); }
    } })),
  // A-97: the search - the header becomes the field (the monasteries' searchbar) with «×»; ONE request ~400 ms after typing stops (never per
  // letter); the matches marked yellow in the titles (THE highlight); a kind tab keeps the query; nothing found = the line; «×» = the list back
  { name: 'articles-search', only: [...UK, 'phone-ru'], path: '/articles', ready: async (p) => {
      await toAll(p);
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]')).toHaveCount(10);
      const asked: string[] = [];
      p.on('request', (r) => { if (/articles\.json\?q=/.test(r.url())) asked.push(decodeURIComponent(new URL(r.url()).searchParams.get('q') ?? '')); });
      await onShown(p, 'search-open').click();
      const field = p.locator(SHOWN).getByTestId('articles-search').locator('input');
      await expect(field).toBeFocused({ timeout: 3000 });
      const [ph, nothing] = await words(p, ['articles.search', 'articles.nothing']);
      await expect(field).toHaveAttribute('placeholder', ph);
      await expect(field).toHaveAccessibleName(ph); // REVIEW cloud_34 Q4 (b): the field's NAME = its words (SearchField), not a hint only
      const word = (await onShown(p, 'articles').locator('[data-testid^="arow-"] .mrow__title').first().innerText()).split(/\s+/).find((w) => w.length >= 5)!.slice(0, 4);
      await field.pressSequentially(word, { delay: 60 }); // four letters, 60 ms apart: one pause -> one request
      await expect(onShown(p, 'kinds')).toHaveAttribute('data-query', new RegExp(`\\|all\\|${word}\\|published$`), { timeout: 5000 });
      expect(asked, 'one request per pause, none per letter').toEqual([word]);
      await expect(onShown(p, 'articles').locator('mark.hl').first()).toBeVisible();
      expect((await onShown(p, 'articles').locator('mark.hl').first().innerText()).toLowerCase()).toBe(word.toLowerCase());
      await onShown(p, 'kind-tab-publication').click(); // a tab switch keeps the query
      await expect(onShown(p, 'kinds')).toHaveAttribute('data-query', new RegExp(`\\|publication\\|${word}\\|published$`));
      await field.fill('щщщщщщ');
      await expect(onShown(p, 'articles-empty')).toHaveText(nothing, { timeout: 5000 });
      await expect(onShown(p, 'articles-empty')).toHaveAttribute('role', 'status');
      await field.fill(word); // the shot: the found rows with the marks
      await expect(onShown(p, 'articles').locator('mark.hl').first()).toBeVisible({ timeout: 5000 });
    } },
  { name: 'articles-search-close', only: ['phone-light'], path: '/articles', ready: async (p) => {
      await toAll(p);
      await onShown(p, 'search-open').click();
      const field = p.locator(SHOWN).getByTestId('articles-search').locator('input');
      await field.fill('лавр');
      await expect(onShown(p, 'kinds')).toHaveAttribute('data-query', /лавр/, { timeout: 5000 });
      await p.locator(SHOWN).getByTestId('articles-search').locator('.searchbar-clear-button').click(); // «×»: the search closes
      await expect(onShown(p, 'page-title')).toBeVisible();
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]')).toHaveCount(10);
      await expect(onShown(p, 'kinds')).not.toHaveAttribute('data-query', /./);
    } },
  // A-97 + R-48 (A-101): the sort - a sheet of FOUR radio choices (the two dates, «за переглядами за тиждень», «за рейтингом»; the chosen one
  // checked), one choice for ALL tabs, the icon marked while not the default; «Показати більше» pages THAT list (the fixtures answer pages
  // of 4) without a repeated item; the orders = THE comparator (`articleOrder`): views_week most first, rating by the contract's table
  { name: 'articles-sort', only: [...UK, 'phone-ru'], path: '/articles', ready: async (p) => {
      await toAll(p);
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]')).toHaveCount(10);
      const asked: string[] = [];
      p.on('request', (r) => { const m = /articles\.json\?q=[^&]*&sort=(\w+)/.exec(decodeURIComponent(r.url())); if (m) asked.push(m[1]); });
      await onShown(p, 'sort-open').click();
      const opts = p.locator('ion-action-sheet.sort-sheet button[role="radio"]');
      await expect(opts).toHaveCount(4);
      const names = await words(p, ['articles.sort_published', 'articles.sort_created', 'articles.sort_views_week', 'articles.sort_rating', 'articles.sort']);
      expect(await opts.allInnerTexts()).toEqual(names.slice(0, 4));
      expect(await opts.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-checked')))).toEqual(['true', 'false', 'false', 'false']);
      await expect(p.locator('ion-action-sheet.sort-sheet .action-sheet-title')).toHaveText(names[4]);
      await p.locator('[data-testid="sort-views_week"]').click();
      await expect(onShown(p, 'sort-mark')).toBeVisible();
      await expect.poll(() => spokenName(onShown(p, 'sort-open'))).toBe(`${names[4]}: ${names[2]}`);
      await expect(onShown(p, 'kinds')).toHaveAttribute('data-query', /\|all\|\|views_week$/, { timeout: 5000 });
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]').first()).toHaveAttribute('data-testid', 'arow-2871'); // 25 this week: the most
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]')).toHaveCount(4);
      await onShown(p, 'articles-more').click();
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]')).toHaveCount(8);
      const ids = await onShown(p, 'articles').locator('[data-testid^="arow-"]').evaluateAll((rs) => rs.map((r) => r.getAttribute('data-testid')));
      expect(new Set(ids).size, 'no item twice').toBe(ids.length);
      const open = p.locator('ion-action-sheet.sort-sheet:not(.overlay-hidden)');
      await expect(open).toHaveCount(0); // the first sheet fully gone
      await onShown(p, 'sort-open').click();
      await expect(open.locator('[data-testid="sort-rating"]')).toBeVisible();
      await p.waitForTimeout(400); // the sheet's slide-in: a moving button is «not stable»
      await open.locator('[data-testid="sort-rating"]').click(); // (a closed sheet stays in the DOM) 5.0 (7) 2869, then 5.0 (2) 1892, then 5.0 (1) 2868, then 4.5, 4.3
      await expect(onShown(p, 'kinds')).toHaveAttribute('data-query', /\|all\|\|rating$/, { timeout: 5000 });
      expect(await onShown(p, 'articles').locator('[data-testid^="arow-"]').evaluateAll((rs) => rs.map((r) => r.getAttribute('data-testid'))))
        .toEqual(['arow-2869', 'arow-1892', 'arow-2868', 'arow-1894']);
      await onShown(p, 'kind-tab-news').click(); // the same order on every tab
      await expect(onShown(p, 'kinds')).toHaveAttribute('data-query', /\|news\|\|rating$/, { timeout: 5000 });
      await onShown(p, 'kind-tab-all').click();
      expect([...new Set(asked)], 'only the orders the server takes').toEqual(['views_week', 'rating']);
      await onShown(p, 'sort-open').click(); // the shot: the sheet, «За рейтингом» checked
      await expect(p.locator('ion-action-sheet:not(.overlay-hidden) [data-testid="sort-rating"]')).toHaveAttribute('aria-checked', 'true');
      await p.waitForTimeout(400);
    } },
  // R-48 (P2): a server WITHOUT `articles_sort_v2` - the sheet offers the two dates only; no request with the new orders is ever made
  { name: 'articles-sort-v2-off', only: UK, path: '/articles', before: async (p) => { await p.addInitScript(() => { (window as any).__inokConfig = { features: { comments_write: false, embedded_player: false, articles_query: true } }; }); }, ready: async (p) => {
      await toAll(p);
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]')).toHaveCount(10);
      const asked: string[] = [];
      p.on('request', (r) => { if (/sort=(views_week|rating)/.test(r.url())) asked.push(r.url()); });
      await onShown(p, 'sort-open').click();
      const opts = p.locator('ion-action-sheet.sort-sheet button[role="radio"]');
      await expect(opts).toHaveCount(2);
      expect(await opts.allInnerTexts()).toEqual(await words(p, ['articles.sort_published', 'articles.sort_created']));
      await expect(p.locator('[data-testid="sort-views_week"], [data-testid="sort-rating"]')).toHaveCount(0);
      expect(asked).toEqual([]);
      await p.waitForTimeout(400);
    } },
  // A-97: an old server (no `articles_query`) - no search, no sort, nothing asked; the list as in 1.0.5
  { name: 'articles-query-off', only: ['phone-light'], path: '/articles', before: async (p) => { await p.addInitScript(() => { (window as any).__inokConfig = { features: { comments_write: false, embedded_player: false } }; }); }, ready: async (p) => {
      await toAll(p);
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]')).toHaveCount(10);
      await expect(p.locator(SHOWN).getByTestId('search-open')).toHaveCount(0);
      await expect(p.locator(SHOWN).getByTestId('sort-open')).toHaveCount(0);
      await expect(onShown(p, 'refresh')).toBeVisible();
    } },
  // A-97 offline: the request fails -> the SAVED publications filtered here, with the note
  { name: 'articles-search-offline', only: ['phone-light'], path: '/articles', before: async (p) => { await p.route(/articles\.json\?q=/, (r) => r.abort('internetdisconnected')); }, ready: async (p) => {
      await toAll(p);
      await expect(onShown(p, 'articles').locator('[data-testid^="arow-"]')).toHaveCount(10);
      await onShown(p, 'search-open').click();
      const word = (await onShown(p, 'articles').locator('[data-testid^="arow-"] .mrow__title').first().innerText()).split(/\s+/).find((w) => w.length >= 5)!.slice(0, 4);
      await p.locator(SHOWN).getByTestId('articles-search').locator('input').fill(word);
      await expect(onShown(p, 'articles-offline')).toHaveText((await words(p, ['articles.query_offline']))[0], { timeout: 5000 });
      await expect(onShown(p, 'articles').locator('mark.hl').first()).toBeVisible();
    } },
  { name: 'articles-tabs-scrolled', path: '/articles', ready: async (p) => {
      await toAll(p);
      await expect(p.locator('[data-testid^="arow-"]')).toHaveCount(10);
      const before = await kindsAt(p);
      await wheelList(p, 400, 3);
      const after = await kindsAt(p);
      // the list scrolled as far as it goes (CI's tablet fonts make it shorter than here: run 43076510144 stopped below 200 px)
      expect(after.max, 'a list longer than its pane').toBeGreaterThan(50);
      expect(after.scroll, 'the list scrolled').toBeGreaterThanOrEqual(Math.min(200, after.max - 1));
      expect(after.offset, `pinned: the tabs at the scroller's top after ${after.scroll} px (were at ${before.offset})`).toBe(0);
      await expect(p.locator(SHOWN).getByTestId('kind-tab-all')).toBeInViewport({ ratio: 1 });
      // the tabs still work from there, and the rows do not show through them
      const row = await p.locator(SHOWN).getByTestId('kinds').evaluate((k) => getComputedStyle(k).backgroundColor);
      expect(row, 'the pinned row is opaque').not.toMatch(/rgba\(.*, 0\)|transparent/);
      if ((p.viewportSize()?.width ?? 0) >= 600) // A-79: the detail pane does not move with the list
        expect(await p.locator(SHOWN).getByTestId('detail-pane').evaluate((d) => d.scrollTop)).toBe(0);
    } },
  // the largest system font (Android 14: 200 %): no lead line (A-55), the row grows, a long word wraps inside it, nothing runs sideways
  { name: 'font200-articles-news', path: '/articles', font: 200, only: UK, ready: async (p) => {
      await p.getByTestId('kind-tab-news').click();
      await expect(p.locator('[data-testid^="arow-"]')).toHaveCount(7);
      expect(await noLeads(p, '[data-testid="articles"]')).toBe(7);
      await hyphenated(p, '[data-testid="articles"] [data-testid^="arow-"] ion-label', true); // A-56: a long word breaks with a hyphen where the engine can
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll').toBe(true);
    } },
  { name: 'article', path: '/articles?id=2869', ready: async (p) => {
      await expect(p.getByTestId('article')).toContainText('Обитель дитячої радості');
      // F1 (A-79 3): `2026-10-28T22:00:00Z` = the site's 29 October (Kyiv); 1.0.3 printed the device's (UTC) 28th - here and in its list row
      await expect(p.getByTestId('article').locator('.card__sub').first()).toContainText(/29 (жовтня|октября) 2026|October 29, 2026/);
      if ((p.viewportSize()?.width ?? 0) >= 600) await expect(p.getByTestId('arow-2869')).toContainText(/29 (жовтня|октября)|October 29/);
      await expect(p.getByTestId('rating')).toBeVisible();
      await leadShown(p);
    } },
  // A-50 #3 (R-33): the body's headings (2738 has five <h2>) take THE heading scale - bigger and bolder than the text, more space before than
  // after, tighter lines; h2 > h3 > h4 >= h5 >= text (h3-h5 measured on probes in the same body), and the scale follows «A+»
  ...[{ name: 'article-headings', font: undefined as number | undefined }, { name: 'font200-article-headings', font: 200 }].map(({ name, font }) => ({
    name, font, only: font ? UK : undefined, path: '/articles?id=2738', ready: async (p: Page) => {
      const body = p.locator('.aview__body').first();
      await expect(body.locator('h2')).toHaveCount(5);
      await hyphenated(p, '.aview .aview__body', !!font); // A-56: the article's text too - hyphens at 200 %, none at 100 %
      const m = () => body.evaluate((b) => {
        const px = (e: Element, k: 'fontSize' | 'lineHeight' | 'marginTop' | 'marginBottom') => parseFloat(getComputedStyle(e)[k]);
        const para = b.querySelector('p')!;
        const probes = ['h3', 'h4', 'h5'].map((t) => { const e = document.createElement(t); e.textContent = 'Проба'; b.appendChild(e); return e; });
        const hs = [b.querySelectorAll('h2')[1], ...probes]; // the 2nd: the 1st opens the body (no space before it)
        const r = { text: px(para, 'fontSize'), textLh: px(para, 'lineHeight') / px(para, 'fontSize'),
          sizes: hs.map((h) => px(h, 'fontSize')), weights: hs.map((h) => Number(getComputedStyle(h).fontWeight)),
          lh: hs.map((h) => px(h, 'lineHeight') / px(h, 'fontSize')), before: px(hs[0], 'marginTop'), after: px(hs[0], 'marginBottom') };
        probes.forEach((e) => e.remove());
        return r;
      });
      const a = await m();
      const [h2, h3, h4, h5] = a.sizes;
      expect(h2 > h3 && h3 > h4 && h4 >= h5 && h5 >= a.text, `sizes ${JSON.stringify(a)}`).toBe(true);
      expect(a.weights.every((w) => w >= 600), `weights ${a.weights}`).toBe(true);
      expect(a.before, 'more space before than after').toBeGreaterThan(a.after * 2);
      expect(Math.max(...a.lh), 'tighter than the text').toBeLessThan(a.textLh);
      if (!font) { // «A+» moves the headings with the text (one scale), then back for the shot
        await p.getByTestId('text-larger').locator('visible=true').first().click();
        await expect.poll(async () => (await m()).sizes[0] / a.sizes[0]).toBeCloseTo(1.15, 2);
        await p.getByTestId('text-smaller').locator('visible=true').first().click();
        await expect.poll(async () => (await m()).sizes[0]).toBe(h2);
      }
      await body.locator('h2').first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
    } })),
  // A-50 #1 (R-34, site fix): the RU lead of 2869 arrives as ONE paragraph (the live answer, fixtures/articles_ru.json) - shown as the site shows it
  { name: 'article-lead-ru', only: ['phone-ru'], path: '/articles?id=2869', before: async (p) => {
      await p.route(FEED_AND_ITEM, (r) => r.fulfill({ contentType: 'application/json', body: readFileSync('fixtures/articles_ru.json', 'utf8') }));
    }, ready: async (p) => {
      const lead = onShown(p, 'article').locator('.aview__lead');
      await expect(lead).toContainText('Необычайное место');
      await expect(lead.locator('p')).toHaveCount(1);
    } },
  // A-40: offline from the cache the lead is the same block
  { name: 'article-lead-offline', path: '/articles?id=2869', before: net({ connected: false, metered: false, dataSaver: false }), ready: leadShown },
  // A-23 #8: «A−» / «A+» in the toolbar — five steps, remembered for every article, only the article's text changes
  { name: 'article-text-size', path: '/articles?id=2869', ready: async (p) => {
      const size = () => p.locator('.aview__body').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      const title = () => p.locator('.aview .card__title').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      const base = await size(); const t0 = await title();
      await p.getByTestId('text-larger').locator('visible=true').first().click();
      await p.getByTestId('text-larger').locator('visible=true').first().click();
      await expect.poll(size).toBeCloseTo(base * 1.3, 0);
      expect(await title()).toBe(t0); // the heading is interface, not article text
      await p.getByTestId('text-larger').locator('visible=true').first().click();
      await expect(p.getByTestId('text-larger').locator('visible=true').first()).toHaveAttribute('disabled', ''); // 150 %: the end
      await p.goto('/articles?id=2868'); // another article keeps the choice
      await expect(p.getByTestId('article')).toBeVisible();
      await expect(p.locator('[data-testid="article"]').first()).toHaveAttribute('data-scale', '4');
      for (let i = 0; i < 4; i++) await p.getByTestId('text-smaller').locator('visible=true').first().click();
      await expect(p.getByTestId('text-smaller').locator('visible=true').first()).toHaveAttribute('disabled', ''); // 85 %
      await p.goto('/articles?id=2869');
      await expect(p.getByTestId('article')).toContainText('Обитель дитячої радості');
      await p.getByTestId('text-larger').locator('visible=true').first().click(); // back to 100 % … then +1 for the shot (115 %)
      await p.getByTestId('text-larger').locator('visible=true').first().click();
    } },
  // A-33 + A-34 (PLAN 8): the comments of 2869 (the live answer) — each with the site's two toggles and counts, «Додати коментар» under them
  { name: 'article-comments', only: UK, path: '/articles?id=2869', ready: async (p) => {
      const block = p.getByTestId('comments').locator('visible=true');
      await expect(block.locator('.comment')).toHaveCount(4);
      for (const id of [109, 108, 107, 106]) {
        await expect(p.getByTestId(`vote-up-${id}`).locator('visible=true')).toHaveAttribute('aria-label', /^Подобається: \d+$/);
        await expect(p.getByTestId(`vote-down-${id}`).locator('visible=true')).toHaveAttribute('aria-label', /^Не подобається: \d+$/);
      }
      await expect(p.getByTestId('vote-up-109').locator('visible=true')).toContainText('1');
      // 44 px targets, the two toggles of a comment on one line
      const boxes = await block.locator('.comment__votes').first().locator('button').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect()).map((r) => ({ h: r.height, w: r.width, top: Math.round(r.top) })));
      expect(boxes.every((b) => b.h >= 44 && b.w >= 44) && boxes[0].top === boxes[1].top, JSON.stringify(boxes)).toBe(true);
      await expect(p.getByTestId('comment-add').locator('visible=true')).toHaveText('Додати коментар');
      await block.locator('.comment').nth(1).scrollIntoViewIfNeeded();
    } },
  // A-34: before the Play release every vote is 503 vote_closed — the counts stay, the toggles go quiet, one short line, no error
  { name: 'article-vote-closed', only: UK, path: '/articles?id=2869', ready: async (p) => {
      const up = p.getByTestId('vote-up-108').locator('visible=true');
      await up.click();
      await expect(p.getByTestId('vote-status').locator('visible=true')).toHaveText('Голосування відкриється з виходом застосунку в Google Play');
      await expect(up).toHaveAttribute('data-mine', 'n'); // rolled back
      await expect(up).toContainText('1');
      await expect(p.locator('.comment__votes[data-closed="y"]').locator('visible=true')).toHaveCount(4); // every toggle knows
      await up.scrollIntoViewIfNeeded();
    } },
  // A-33: «Додати коментар» = the site's page + #skm-comment-add in the in-app tab; after it, the line and the comments re-read
  { name: 'article-comment-add', only: UK, path: '/articles?id=2869', ready: async (p) => {
      const asked: string[] = [];
      await p.route('https://inok.info/articles/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>site</p>' }));
      const add = p.getByTestId('comment-add').locator('visible=true');
      await expect(add).toBeVisible();
      p.on('request', (r) => { if (r.url().includes('comments.json')) asked.push(r.url()); });
      const [tab] = await Promise.all([p.waitForEvent('popup'), add.click()]);
      expect(tab.url()).toBe('https://inok.info/articles/publications/2869/#skm-comment-add');
      await tab.close();
      await expect(p.getByTestId('comment-pending').locator('visible=true')).toHaveText("Коментар з'явиться після перевірки");
      expect(asked.length, 'the comments re-read after the tab').toBeGreaterThan(0);
      await p.getByTestId('comment-pending').locator('visible=true').scrollIntoViewIfNeeded();
    } },
  // D52 (R-29): the cached feed says 0 comments and no rating; the comments answer says 4 and 5 (6) - the open article shows the server's
  { name: 'article-fresh-counts', only: UK, path: '/articles?id=2869', before: async (p) => {
      await p.route(FEED_AND_ITEM, async (r) => {
        const j = await fixtureJson(r); if (!j) return;
        j.items = j.items.map((x: { id: number }) => (x.id === 2869 ? { ...x, comments_count: 0, rating: null } : x));
        await r.fulfill({ json: j });
      });
    }, ready: async (p) => {
      const block = p.getByTestId('comments').locator('visible=true');
      await expect(block.locator('h2')).toHaveText('Коментарі · 4');
      await expect(block.locator('.comment')).toHaveCount(4);
      await expect(p.locator('.aview__avg').locator('visible=true')).toHaveText('5 (6)');
      await p.getByTestId('rating').locator('visible=true').scrollIntoViewIfNeeded();
    } },
  { name: 'article-comments-offline', only: UK, path: '/articles?id=2869', before: net({ connected: false, metered: false, dataSaver: false }), ready: async (p) => {
      const add = p.getByTestId('comment-add').locator('visible=true');
      await expect(add).toHaveAttribute('data-net', 'off');
      // D54: the button keeps its label (disabled), the reason is the block's grey line under it - the same look as the vote line
      await expect(add).toHaveText('Додати коментар');
      await expect(add).toHaveAttribute('disabled', '');
      const why = p.getByTestId('comment-offline').locator('visible=true');
      await expect(why).toHaveText('Щоб додати коментар, потрібна мережа');
      const look = (el: Element) => { const c = getComputedStyle(el); return [c.fontSize, c.color, c.marginTop, c.marginBottom].join('|'); };
      const vote = p.getByTestId('comments').locator('visible=true').getByTestId('vote-status'); // empty = not drawn; its style is still ITS
      expect(await why.evaluate(look), 'one look with the vote-closed line').toBe(await vote.evaluate(look));
      const [b, w] = [await add.boundingBox(), await why.boundingBox()];
      expect(w!.y, 'the line under the button').toBeGreaterThanOrEqual(b!.y + b!.height);
      expect(b!.height, 'one line, not two').toBeLessThan(56);
      // A-49: a report offline = the network line under that comment, no dialog
      await p.getByTestId('comment-report-109').locator('visible=true').click();
      await expect(p.getByTestId('comment-report-note-109').locator('visible=true')).toHaveText('Щоб поскаржитися, потрібна мережа');
      await expect(p.locator('ion-alert')).toHaveCount(0);
      await why.scrollIntoViewIfNeeded();
    } },
  // A-49 (Google Play UGC, R-32): under every comment and reply «Поскаржитися» + «Приховати» (44 dp, on the votes' line at the normal font);
  // the site's rules above «Додати коментар» (no link while rules_url is null); report = a confirmation with the rules, then the thanks
  // under the comment and the button rests; hide = one line in place, «Показати» brings it back; kept in SQLite across a re-read
  { name: 'article-comments-ugc', only: UK, path: '/articles?id=2869', ready: async (p) => {
      const block = p.getByTestId('comments').locator('visible=true');
      for (const id of [109, 108, 107, 106]) {
        await expect(block.getByTestId(`comment-report-${id}`)).toHaveText('Поскаржитися');
        await expect(block.getByTestId(`comment-hide-${id}`)).toHaveText('Приховати');
      }
      const line = await block.locator('.comment__bar').first().evaluate((bar) => Array.from(bar.querySelectorAll('button')).map((b) => { const r = b.getBoundingClientRect(); return { h: r.height, top: Math.round(r.top), right: Math.round(r.right) }; }));
      expect(line.length).toBe(4);
      expect(line.every((b) => b.h >= 44) && Math.max(...line.map((b) => b.top)) - Math.min(...line.map((b) => b.top)) <= 2, JSON.stringify(line)).toBe(true);
      const rules = block.getByTestId('comment-rules');
      await expect(rules).toContainText('Правила коментування');
      await expect(rules).toContainText('Пишіть доброзичливо');
      // T-1335: the rules page in the interface language (uk = the bare address), opened in the browser
      await expect(rules.getByTestId('comment-rules-link')).toHaveAttribute('href', 'https://inok.info/about/comment-rules/');
      const [r, add] = [await rules.boundingBox(), await block.getByTestId('comment-add').boundingBox()];
      expect(r!.y + r!.height, 'the rules before the form button').toBeLessThanOrEqual(add!.y);
      // report: the confirmation first (one own sentence, D68), then ONE report, the thanks, the button rests
      await block.getByTestId('comment-report-109').click();
      const dlg = p.locator('ion-alert.inok-dialog');
      await expect(dlg).toBeVisible();
      await expect(dlg.locator('.alert-title')).toHaveText('Поскаржитися на коментар?');
      // D68: the dialog = ONE own sentence; the site's form rules («…з'явиться після перевірки») are not repeated here
      await expect(dlg.locator('.alert-message')).toHaveText('Модератор inok.info перевірить цей коментар за правилами коментування сайту.');
      await dlg.locator('button', { hasText: 'Надіслати скаргу' }).click();
      await expect(dlg).toHaveCount(0);
      await expect(block.getByTestId('comment-report-note-109')).toHaveText('Дякуємо, модератор перевірить');
      await expect(block.getByTestId('comment-report-109')).toBeDisabled();
      // hide: one line in place, undo brings it back; hide again - it stays hidden after the comments are read again (SQLite)
      await block.getByTestId('comment-hide-108').click();
      await expect(block.getByTestId('comment-hidden-108')).toContainText('Коментар приховано на цьому телефоні');
      await expect(block.getByTestId('comment-108')).not.toContainText('Сергий');
      await block.getByTestId('comment-unhide-108').click();
      await expect(block.getByTestId('comment-108')).toContainText('Сергий');
      await block.getByTestId('comment-hide-108').click();
      // the browser's SQLite lives in the page: leave and come back INSIDE the app (the tab, then the row) - the hidden set is re-read
      await p.locator('ion-tab-button[tab="articles"]').click();
      await settled(p); await onShown(p, 'arow-2868').click(); await settled(p);
      await expect(onShown(p, 'article')).not.toContainText('Обитель дитячої радості');
      await p.locator('ion-tab-button[tab="articles"]').click();
      await settled(p); await onShown(p, 'arow-2869').click(); await settled(p);
      await expect(p.getByTestId('comment-hidden-108').locator('visible=true')).toBeVisible();
      await p.getByTestId('comment-hidden-108').locator('visible=true').scrollIntoViewIfNeeded();
    } },
  { name: 'article-report-dialog', only: UK, path: '/articles?id=2869', ready: async (p) => {
      await p.getByTestId('comment-report-107').locator('visible=true').click();
      const dlg = p.locator('ion-alert.inok-dialog');
      await expect(dlg).toBeVisible();
      const [box, vp] = [await dlg.locator('.alert-wrapper').boundingBox(), p.viewportSize()!];
      expect(box!.y >= 0 && box!.y + box!.height <= vp.height, 'the whole dialog on the screen').toBe(true);
      await expect(dlg.locator('.alert-button')).toHaveCount(2);
    } },
  // A-33: a video has comments too (1892: a comment with a reply, both with toggles); news has no block and no button
  { name: 'article-video-comments', only: UK, path: '/articles', ready: async (p) => {
      await p.getByTestId('kind-tab-video').locator('visible=true').click();
      await p.getByTestId('arow-1892').locator('visible=true').click();
      // P1 / P5: the list's copy is the 1.0.6 shape (no `video`); the open article shows ONE button and no «Читати повністю»
      await expect(onShown(p, 'article').getByTestId('article-video')).toHaveCount(1);
      await expect(onShown(p, 'article').getByTestId('read-site')).toHaveCount(0);
      const block = p.getByTestId('comments').locator('visible=true');
      await expect(block.locator('.comment--reply')).toHaveCount(1);
      await expect(block.locator('.comment--reply .comment__votes button')).toHaveCount(2);
      await expect(p.getByTestId('comment-add').locator('visible=true')).toBeVisible();
      await block.locator('.comment--reply').scrollIntoViewIfNeeded();
    } },
  { name: 'article-news-nocomments', only: UK, path: '/articles?id=2871', ready: async (p) => {
      await expect(p.getByTestId('article').locator('visible=true')).toBeVisible();
      await expect(p.getByTestId('comments').locator('visible=true')).toHaveCount(0);
      await expect(p.getByTestId('comment-add').locator('visible=true')).toHaveCount(0);
      await p.locator('.card__site').locator('visible=true').scrollIntoViewIfNeeded();
    } },
  // A-66 (his remark): before he rates, NO star is lit although the article has an average; the average stays as the number
  { name: 'article-unrated', path: '/articles?id=2869', ready: async (p) => {
      const r = p.getByTestId('rating');
      await expect(r).toBeVisible();
      await expect(r.locator('.aview__avg')).toBeVisible();
      await expect(r.locator('[data-testid^="star-"][data-lit="1"]')).toHaveCount(0);
      await expect(r.locator('[data-testid^="star-"][data-lit="0"]')).toHaveCount(5);
      await starColours(p, '[data-testid="rating"] [data-testid^="star-"] ion-icon', 5); // A-78 3: the outlines in THE token
      await r.scrollIntoViewIfNeeded();
    } },
  { name: 'article-rated', path: '/articles?id=2869', ready: async (p) => {
      await expect(p.getByTestId('rating')).toBeVisible();
      await p.getByTestId('star-3').click();
      await expect(p.getByTestId('rating')).toContainText(/3/);
      await expect(p.getByTestId('rating').locator('[data-lit="1"]')).toHaveCount(3); // A-66: his 3 lights three, whatever the average
      await expect(p.getByTestId('star-1')).toBeDisabled();
      await starColours(p, '[data-testid="rating"] [data-testid^="star-"] ion-icon', 5); // A-78 3: lit and outlined, disabled after the vote - THE token
      await p.getByTestId('rating').scrollIntoViewIfNeeded();
    } },
  // A-64 / A-67: THE soft notification question (one component, two uses); the browser plays the phone's permission (`inok.push`)
  { name: 'ask-articles', path: '/articles?id=2869', before: pushPerm('prompt'), ready: async (p) => {
      const d = await softAsk(p, 'articles');
      expect(await d.locator('.alert-title').innerText()).toBe((await words(p, ['ask.articles']))[0]);
      expect(await d.locator('.alert-button').evaluateAll((bs) => bs.map((b) => (b.textContent ?? '').trim()))).toEqual(await words(p, ['ask.yes', 'ask.setup', 'ask.no']));
      await stackedAnswers(d, 3);
      await noBand(d);
    } },
  { name: 'ask-streams', path: '/streams', before: pushPerm('prompt'), ready: async (p) => {
      const d = await softAsk(p, 'streams');
      expect(await d.locator('.alert-button').evaluateAll((bs) => bs.map((b) => (b.textContent ?? '').trim()))).toEqual(await words(p, ['ask.channels', 'ask.no']));
      await stackedAnswers(d, 2);
      await noBand(d);
    } },
  // A-67: the permission already refused (Android 13+) - the question says so; its button opens the phone's settings
  { name: 'ask-denied', path: '/streams', before: pushPerm('denied'), ready: async (p) => {
      const d = await softAsk(p, 'streams');
      expect(await d.locator('.alert-message').innerText()).toBe((await words(p, ['notifications.denied']))[0]);
      expect(await d.locator('.alert-button').evaluateAll((bs) => bs.map((b) => (b.textContent ?? '').trim()))).toEqual(await words(p, ['ask.open_settings', 'ask.no']));
      await noBand(d);
    } },
  // «Обрати канали» → «Ще → Сповіщення» at the channel list; nothing switched on by itself; never asked again
  { name: 'ask-channels-goes', only: UK, path: '/streams', before: pushPerm('prompt'), ready: async (p) => {
      const d = await softAsk(p, 'streams');
      await d.locator('.alert-button').first().click();
      await expect(p).toHaveURL(/\/more\/notifications#channels$/);
      await settled(p);
      await expect(onShown(p, 'push-channels')).toBeInViewport();
      const st = JSON.parse((await p.evaluate(() => localStorage.getItem('CapacitorStorage.settings'))) ?? '{}');
      expect(st.asked).toEqual(['streams']);
      expect((st.topics as string[]).filter((x) => x.startsWith('ch_'))).toEqual([]);
    } },
  // «Так» = the three kinds on (the system dialog first); asked once: a reload asks nothing; the other question keeps its own moment (A-73)
  { name: 'ask-articles-yes', only: UK, path: '/articles?id=2869', before: pushPerm('prompt'), ready: async (p) => {
      const d = await softAsk(p, 'articles');
      await d.locator('.alert-button').first().click();
      await expect(p.locator('ion-alert.soft-ask')).toHaveCount(0);
      await expect.poll(async () => JSON.parse((await p.evaluate(() => localStorage.getItem('CapacitorStorage.settings'))) ?? '{}').topics).toEqual(['articles']);
      await p.goto('/streams'); // a new launch in the browser: the streams question may come now, the articles one never
      await softAsk(p, 'streams');
      await p.locator('ion-alert.soft-ask .alert-button').last().click();
      await p.goto('/articles?id=2869');
      await expect(p.getByTestId('article').locator('visible=true')).toBeVisible();
      await p.waitForTimeout(3500); // longer than ASK_DELAY_MS: the absence of the dialog is the check
      await expect(p.locator('ion-alert.soft-ask')).toHaveCount(0);
      await p.goto('/more/notifications');
      await expect(p.getByTestId('topic-articles').locator('visible=true')).toHaveJSProperty('checked', true);
    } },
  // A-73: the two questions are INDEPENDENT - «Ні, дякую» to one, and the other still comes at ITS first moment in the SAME launch (in-app
  // navigation, no reload: 1.0.1's «one per launch» cap hid it), both orders; and at the next launch (a reload) when it was not reached
  ...([['streams', '/streams', 'articles', '/articles?id=2869'], ['articles', '/articles?id=2869', 'streams', '/streams']] as const).map(([first, from, other, to]) => (
    { name: `ask-independent-${first}-first`, only: UK, path: from, before: pushPerm('prompt'), ready: async (p: Page) => {
      await (await softAsk(p, first)).locator('.alert-button').last().click(); // «Ні, дякую»
      await expect(p.locator('ion-alert.soft-ask:not(.overlay-hidden)')).toHaveCount(0);
      await inAppGo(p, to);
      await softAsk(p, other);
      const st = JSON.parse((await p.evaluate(() => localStorage.getItem('CapacitorStorage.settings'))) ?? '{}');
      expect(st.asked).toEqual([first]);
    } })),
  { name: 'ask-independent-next-launch', only: UK, path: '/articles?id=2869', before: pushPerm('prompt'), ready: async (p) => {
      await (await softAsk(p, 'articles')).locator('.alert-button').last().click();
      await expect.poll(async () => JSON.parse((await p.evaluate(() => localStorage.getItem('CapacitorStorage.settings'))) ?? '{}').asked).toEqual(['articles']);
      await p.goto('/streams'); // the next launch
      await softAsk(p, 'streams');
    } },
  // R-39 (A-73 (2)): an article body's link to another article opens THAT article IN the app, in the app's language (1832 <-> 1833, the live
  // pair, fixtures/articles_links.json), x3 languages; the card link of the same body still opens the in-app card (A-21)
  { name: 'article-link-r39', only: UK, path: '/home', ready: async (p) => {
      const LINKS = JSON.parse(readFileSync('fixtures/articles_links.json', 'utf8')) as Record<string, { items: { id: number; title: string }[] }>;
      for (const lang of ['uk', 'ru', 'en'] as const) {
        await p.evaluate((l) => localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ lang: l })), lang);
        await p.goto('/articles?id=1832');
        const title = (id: number) => LINKS[lang].items.find((x) => x.id === id)!.title;
        await expect(onShown(p, 'article').locator('.card__title')).toHaveText(title(1832), { timeout: 15_000 });
        await onShown(p, 'article').locator('a[href*="/articles/publications/1833/"]').click();
        await expect(p).toHaveURL(/\/articles\?id=1833$/);
        await expect(onShown(p, 'article').locator('.card__title')).toHaveText(title(1833));
        expect(await p.evaluate(() => document.documentElement.lang)).toBe(lang);
        await onShown(p, 'article').locator('a[href*="/articles/publications/1832/"]').click();
        await expect(p).toHaveURL(/\/articles\?id=1832$/);
        await expect(onShown(p, 'article').locator('.card__title')).toHaveText(title(1832));
      }
      await onShown(p, 'article').locator('a[href*="/monasteries/242/"]').click();
      await expect(p).toHaveURL(/\/monasteries\/242$/);
    } },
  // A-78 1 (owner, his phone 09.11: «если закрыть приложение, то ссылка откроет приложение на начальном экране»): a link that STARTS the
  // app opens ITS screen. The native bridge answers `getLaunchUrl` in a few ms; 1.0.2's `/` -> `/home` redirect came after it and replaced
  // the link's screen (0 / 5 ms -> «Головна», measured). Every delay lands on the link's screen, Back = its parent (A-25: a screen opened
  // first); a link outside the app's
  // screens = «Головна» + the browser; a warm link (the app running) still opens.
  ...([['cold-link-article', 'https://inok.info/articles/publications/1832/', /\/articles\?id=1832$/, 'article'],
    ['cold-link-card', 'https://inok.info/monasteries/242/?lang=ru', /\/monasteries\/242$/, 'card']] as const).map(([name, url, at, shown]) => (
    { name, only: UK, path: '/', before: launchBy(url, 0), ready: async (p: Page) => {
      await expect(p).toHaveURL(at, { timeout: 30_000 });
      await expect(onShown(p, shown)).toBeVisible({ timeout: 20_000 });
      for (const ms of [5, 60, 400]) { // the same start, other bridge delays (the DB is ready now: the race is at its tightest)
        await p.evaluate(([u, m]) => sessionStorage.setItem('inok.launch', JSON.stringify({ url: u, ms: m })), [url, ms] as const);
        await p.goto('/');
        await expect(p, `delay ${ms} ms`).toHaveURL(at, { timeout: 15_000 });
        await expect(onShown(p, shown)).toBeVisible({ timeout: 20_000 });
      }
      await settled(p); await onShown(p, 'back').click();
      await expect(p).toHaveURL(name === 'cold-link-card' ? /\/monasteries$/ : /\/articles$/); // the parent: the list
      await p.goto('/'); // back to the link's screen for the shot
      await expect(p).toHaveURL(at, { timeout: 15_000 });
      await expect(onShown(p, shown)).toBeVisible({ timeout: 20_000 });
    } })),
  { name: 'cold-link-browser', only: UK, path: '/', before: async (p) => { await recordOpens(p); await launchBy('https://inok.info/monasteries/table/', 0)(p); }, ready: async (p) => {
      await expect(p).toHaveURL(/\/home$/, { timeout: 30_000 });
      await settled(p); await expect(onShown(p, 'home-new')).toBeVisible({ timeout: 20_000 });
      expect(await p.evaluate(() => (window as any).__opened)).toEqual(['https://inok.info/monasteries/table/']);
      // the app running: a link the system hands to it opens its screen over the current one (A-76 warm path unchanged)
      await p.evaluate(() => window.dispatchEvent(new CustomEvent('inok-url-open', { detail: 'https://inok.info/articles/publications/1833/' })));
      await expect(p).toHaveURL(/\/articles\?id=1833$/);
      await expect(onShown(p, 'article')).toBeVisible({ timeout: 20_000 });
    } },
  // A-75 (1) (CD S284: the uk PHONE store set showed «Київська region · Київська diocese», «у. b.»): the app STARTED in en, switched to uk in
  // «Ще → Мова» while the start's directory check is still running and then finds a new export - the export's unit words must follow the
  // CURRENT language (1.0.1 set them in the language of the moment the check began). Card 242, the list, «Трансляції», the eparchy page.
  { name: 'lang-switch-units', only: UK, path: '/home', before: async (p) => {
      await p.addInitScript(() => { if (!sessionStorage.getItem('inok.lang.set')) { localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ lang: 'en' })); sessionStorage.setItem('inok.lang.set', '1'); } });
      let n = 0;
      await p.route(/\/fixtures\/manifest\.json(\?.*)?$/, async (r) => {
        const j = await fixtureJson(r); if (!j) return;
        if (n++ > 0) { // the start's check: a new export, slow - the switch lands inside it
          j.export_version = '2026-11-08T09:00:00Z';
          await p.evaluate(() => { (window as unknown as { __slowStart: number }).__slowStart = Date.now(); }).catch(() => {});
          await new Promise((ok) => setTimeout(ok, 8000));
        }
        await r.fulfill({ json: j });
        if (n > 1) await p.evaluate(() => { (window as unknown as { __slowCheck: number }).__slowCheck = Date.now(); }).catch(() => {});
      });
    }, ready: async (p) => {
      await expect(p.getByTestId('home-near').locator('visible=true')).toBeVisible({ timeout: 20_000 });
      expect(await p.evaluate(() => document.documentElement.lang)).toBe('en');
      await expect.poll(() => p.evaluate(() => (window as unknown as { __slowStart?: number }).__slowStart), { timeout: 20_000 }).toBeTruthy(); // the check began in en
      await inAppGo(p, '/more/language');
      await onShown(p, 'lang-uk').click();
      await expect.poll(() => p.evaluate(() => document.documentElement.lang)).toBe('uk');
      await inAppGo(p, '/home');
      expect(await p.evaluate(() => (window as unknown as { __slowCheck?: number }).__slowCheck), 'the switch landed INSIDE the slow check').toBeUndefined();
      await expect.poll(() => p.evaluate(() => (window as unknown as { __slowCheck?: number }).__slowCheck), { timeout: 20_000 }).toBeTruthy(); // its answer came
      await expect(onShown(p, 'home-checked')).toHaveText(/^Перевірено/, { timeout: 20_000 }); // and the refresh is over
      await p.waitForTimeout(1500); // the re-import + the dictionary of that moment
      const EN = /\b(region|diocese|y\. b\.)/i;
      await inAppGo(p, '/monasteries/242');
      const sub = onShown(p, 'card').locator('.card__sub');
      await expect(sub).toContainText('єпархія');
      expect(await sub.innerText()).not.toMatch(EN);
      await inAppGo(p, '/monasteries');
      const rows = p.locator('[data-testid^="mrow-"]').locator('visible=true');
      await expect(rows.first()).toBeVisible();
      expect(await rows.first().innerText()).toMatch(/єпархія/);
      expect((await rows.allInnerTexts()).join('\n')).not.toMatch(EN);
      await inAppGo(p, '/streams');
      await expect(onShown(p, 'channels')).toBeVisible();
      expect(await onShown(p, 'channels').innerText()).not.toMatch(EN);
      await inAppGo(p, '/more/eparchies/1');
      await expect(onShown(p, 'eparchy-title')).toContainText('єпархія');
      expect(await onShown(p, 'eparchy-title').innerText()).not.toMatch(EN);
    } },
  // A-65 (R-38): the site's eye beside the date of an OPENED article - an eye and the number, spoken «Переглядів: 42» (fixtures: the live 2869)
  { name: 'article-views', path: '/articles?id=2869', ready: async (p) => {
      const eye = onShown(p, 'article').getByTestId('views');
      await eyeKeepsDot(p, 'article');
      await eyeOnLine(p, 'article');
      await expect(eye).toHaveAttribute('data-views', '42');
      await expect(eye).toHaveAttribute('aria-label', (await words(p, ['views.label']))[0].replace('{n}', '42'));
      expect(await onShown(p, 'article').locator('.card__sub').innerText()).toMatch(/·\s*42\s*$/); // beside the date, no word
    } },
  // below 40 the server says null: nothing, no gap, no « · » left over (2871)
  { name: 'article-views-none', only: ['phone-light'], path: '/articles?id=2871', ready: async (p) => {
      await expect(onShown(p, 'article')).toBeVisible();
      await expect(onShown(p, 'article').getByTestId('views')).toHaveCount(0);
      expect(await onShown(p, 'article').locator('.card__sub').innerText()).not.toMatch(/·\s*$/);
    } },
  // the card's eye at the right edge of its line, no dot (owner 12.11.2026; the route answers a number for 242: the live API refused the
  // cloud's address on 08.11)
  { name: 'card-views', only: [...UK, 'phone-ru'], path: '/monasteries/242', before: viewsFor({ 'monasteries/242/views': 1146 }), ready: async (p) => {
      await expect(onShown(p, 'card').getByTestId('views')).toHaveAttribute('data-views', '1146');
      await eyeRight(p, 'card');
      await eyeOnLine(p, 'card');
      await placeTwoLines(p, 'card');
    } },
  // A-78 2: the eye on the line at the system font scales 130 % and 200 % (the article 2869, the card 242), phone + tablet, both themes
  ...[130, 200].flatMap((font) => [
    { name: `eye-font${font}-article`, only: UK, font, path: '/articles?id=2869', ready: async (p: Page) => {
        await expect(onShown(p, 'article').getByTestId('views')).toHaveAttribute('data-views', '42');
        await eyeOnLine(p, 'article');
      } },
    { name: `eye-font${font}-card`, only: UK, font, path: '/monasteries/242', before: viewsFor({ 'monasteries/242/views': 1146 }), ready: async (p: Page) => {
        await expect(onShown(p, 'card').getByTestId('views')).toHaveAttribute('data-views', '1146');
        await eyeOnLine(p, 'card');
        await eyeRight(p, 'card');
        await placeTwoLines(p, 'card');
      } }]),
  // ONE view after `gi` s with a touch; none while «Статистика використання» is off; none from an own device (A-65)
  { name: 'views-sent', only: ['phone-light'], path: '/articles?id=2869', before: dwell(1, 3), ready: async (p) => {
      await expect(onShown(p, 'article').getByTestId('views')).toBeVisible();
      await p.mouse.wheel(0, 200);
      await expect.poll(() => p.evaluate(() => (window as any).__views as number), { timeout: 8000 }).toBe(1);
      await p.waitForTimeout(3500);
      expect(await p.evaluate(() => (window as any).__views)).toBe(1); // once, not every tick
    } },
  // A-96 W-7: the 1.0.5 setting «statistics off» (as stored by 1.0.5) = incognito ON after the update - no view sent
  { name: 'views-analytics-off', only: ['phone-light'], path: '/articles?id=2869', before: async (p) => { await dwell(1, 1)(p); await p.addInitScript(() => localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ analytics: false }))); }, ready: async (p) => {
      await expect(onShown(p, 'article').getByTestId('views')).toBeVisible(); // the eye is still shown
      await p.waitForTimeout(3000);
      expect(await p.evaluate(() => (window as any).__views)).toBe(0);
    } },
  { name: 'own-device', only: ['phone-light'], path: '/more/about', before: dwell(1, 1), ready: async (p) => {
      const line = onShown(p, 'version-line');
      for (let i = 0; i < 7; i++) await line.click();
      await expect(onShown(p, 'own-device')).toBeVisible();
      await p.goto('/articles?id=2869');
      await expect(onShown(p, 'article').getByTestId('views')).toBeVisible();
      await p.waitForTimeout(3000);
      expect(await p.evaluate(() => (window as any).__views)).toBe(0);
      await p.goto('/more/about');
      for (let i = 0; i < 7; i++) await onShown(p, 'version-line').click();
      await expect(onShown(p, 'own-device')).toHaveCount(0);
    } },
  // A-18 / R-17: the card 242 (the Kyiv-Pechersk Lavra) — the history collapsed, then «Публікації» / «Відео» / «Новини» (5 rows, more)
  { name: 'monastery-related', path: '/monasteries/242', tall: 2400, ready: async (p) => {
      await expect(p.getByTestId('history-more')).toBeVisible();
      // A-23 #5: «Джерела» are behind «Читати повністю» with the history (below the collapsed box's edge, not drawn)
      const hidden = await p.getByTestId('history').evaluate((el) => { const box = el.querySelector('.collapsible__box')!.getBoundingClientRect();
        return el.querySelector('.sources')!.getBoundingClientRect().top >= box.bottom; });
      expect(hidden).toBe(true);
      await expect(p.getByTestId('related-publication').locator('[data-testid^="arow-"]')).toHaveCount(5);
      await expect(p.getByTestId('related-video').locator('[data-testid^="arow-"]')).toHaveCount(3);
      await expect(p.getByTestId('related-more-video')).toHaveCount(0); // no more → no button
      expect(await noLeads(p, '[data-testid="related-news"]'), 'A-55: the card\'s «Новини» rows without a lead').toBe(5);
      expect(await noLeads(p, '[data-testid="related-publication"]'), 'publications: unchanged').toBe(0);
      await expect(p.getByTestId('card-updated')).toContainText('2026');
      await p.getByTestId('related-publication').scrollIntoViewIfNeeded();
      await picturesLoaded(p, '[data-testid="related-publication"] img', 3);
    } },
  { name: 'monastery-related-more', path: '/monasteries/242', tall: 2400, ready: async (p) => {
      // the lists differ by language: uk has 10 publications (the second page ends it); the fixture keeps only the first ru page
      const uk = (await p.evaluate(() => document.documentElement.lang)) === 'uk';
      await p.getByTestId('related-more-publication').click();
      if (uk) {
        await expect(p.getByTestId('related-publication').locator('[data-testid^="arow-"]')).toHaveCount(10);
        await expect(p.getByTestId('related-more-publication')).toHaveCount(0);
      }
      await p.getByTestId('history-more').click();
      await expect(p.getByTestId('history-more')).toHaveCount(0);
      await expect(p.getByTestId('history').locator('.collapsible__box')).toHaveCount(0); // history + «Джерела» open together
      // D28: «Відкрити на inok.info» is an ExternalLinkRow (the external mark, the rows' text edge), not a bare link
      await expect(p.getByTestId('open-site').locator('.info__ext')).toHaveCount(1);
      await expect(p.locator('.card__site a')).toHaveCount(0);
      await p.getByTestId('open-site').scrollIntoViewIfNeeded();
    } },
  // A-20: photos by the rule — a metered network (mobile / hotspot) waits for Wi-Fi; offline says so; the manual buttons load
  { name: 'monastery-photo-wifi', path: '/monasteries/242', before: net({ connected: true, metered: true, dataSaver: false }), ready: async (p) => {
      await expect(p.locator('[data-testid="photo-wait"][data-why]').first()).toHaveAttribute('data-why', 'wifi');
      await expect(p.getByTestId('photo-load')).toContainText(/мобільний інтернет|мобильный интернет|mobile data/);
      // A-50 #2: no bracket in the reason; «Автозавантаження фото» = the body size of the placeholder (not the caption), still underlined
      await expect(p.locator('.photo-wait__reason').first()).not.toContainText('(');
      expect(await p.getByTestId('photo-settings').first().evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize === getComputedStyle(e.closest('.photo-wait')!).fontSize, c.textDecorationLine].join(); })).toBe('true,underline');
      await expect(p.getByTestId('gallery')).toHaveCount(0); // A-23 #6: no «Фотогалерея» over a placeholder
      expect(await p.getByTestId('photo-load').first().evaluate((e) => getComputedStyle(e).textTransform)).toBe('none'); // D21: sentence case
      // owner 03.11.2026: the related rows' thumbnails are SMALL - loaded on mobile data; only the large cover waits, with its own button
      await picturesLoaded(p, '.arow__cover img', 1);
      await expect(p.getByTestId('photos-load-all')).toHaveCount(0);
    } },
  { name: 'article-photo-load-all', path: '/articles?id=2869', before: net({ connected: true, metered: true, dataSaver: false }), ready: async (p) => {
      await p.getByTestId('photos-load-all').click(); // every waiting large photo of the article, through the one queue
      await picturesLoaded(p, '.aview__cover img', 1);
      await p.locator('.aview__body .body-pic').first().scrollIntoViewIfNeeded(); // body pictures load when they come into view
      await picturesLoaded(p, '.aview__body .body-pic img', 1);
      await expect(p.getByTestId('photos-load-all')).toHaveCount(0);
    } },
  // owner 03.11.2026: the thumbnails of EVERY list load on any network - mobile data, Data Saver, any setting; the large photos keep A-20
  ...([['monasteries-thumbs-mobile', '/monasteries', '.mrow__cover img', false], ['articles-thumbs-mobile', '/articles', '.arow__cover img', false],
    ['eparchies-thumbs-saver', '/more/eparchies', '.mrow__cover--map img', true]] as const).map(([name, path, sel, saver]) => ({ name, path,
    before: async (p: Page) => { await net({ connected: true, metered: true, dataSaver: saver })(p); await p.addInitScript(() => {
      const k = 'CapacitorStorage.settings'; /* @capacitor/preferences on the web */ try { const v = JSON.parse(localStorage.getItem(k) ?? '{}'); localStorage.setItem(k, JSON.stringify({ ...v, photos: 'manual' })); } catch { /* none */ } }); },
    ready: async (p: Page) => {
      await picturesLoaded(p, sel, 3);
      await expect(p.locator('.mrow [data-testid="photo-wait"]').locator('visible=true')).toHaveCount(0); // no row waits
      expect(await p.evaluate(() => localStorage.getItem('CapacitorStorage.settings')), 'the setting is «manual» while the rows load').toContain('"photos":"manual"');
    } })),
  { name: 'article-photo-one', path: '/articles?id=2869', before: net({ connected: true, metered: true, dataSaver: false }), ready: async (p) => {
      // R-18: the cover and the four body pictures wait for Wi-Fi together → «Завантажити всі фото» for the article
      await expect(p.getByTestId('photos-load-all')).toBeVisible();
    } },
  // R-18: the pictures of the text in their places (article 2869 = https://inok.info/articles/publications/2869/, 4 pictures)
  { name: 'article-pictures', path: '/articles?id=2869', ready: async (p) => {
      await expect(p.locator('.aview__body .body-pic')).toHaveCount(4);
      await p.locator('.aview__body .body-pic').first().scrollIntoViewIfNeeded();
      await picturesLoaded(p, '.aview__body .body-pic img', 1);
    } },
  { name: 'article-viewer', path: '/articles?id=2869', ready: async (p) => {
      // a tap opens the full-screen viewer with the gallery's FULL file (the <a href> around the picture), not the browser
      await p.locator('.aview__body .body-pic').first().scrollIntoViewIfNeeded();
      await picturesLoaded(p, '.aview__body .body-pic img', 1);
      await p.locator('.aview__body [data-testid="photo-open"]').first().click();
      await expect(p.getByTestId('viewer-img')).toHaveAttribute('data-full', '1');
      await expect(p.getByTestId('viewer-img')).toHaveAttribute('src', /\/images\/articles\/2869\/01\.jpg$/);
      await picturesLoaded(p, '[data-testid="viewer-img"]', 1);
    } },
  // A-101 / R-47: ONE view for the three kinds - the live 1682 (a VIDEO on Facebook): the Facebook button (logo + «Дивитися на Facebook»,
  // its name = its words, the icon hidden) ABOVE the lead, then the FULL text with its gallery, the rating and comments; NO «Читати повністю»;
  // a tap opens the video's own page outside the app (`openVideo`: the handler app, never the site's in-app tab)
  { name: 'article-video-facebook', path: '/articles?id=1682', before: recordOpens, ready: async (p) => {
      const art = onShown(p, 'article');
      await expect(art.getByTestId('article-video')).toHaveCount(1, { timeout: 15_000 });
      const btn = art.getByTestId('article-video');
      await expect(btn).toHaveAttribute('data-host', 'facebook');
      const [fb] = await words(p, ['articles.watch_facebook']);
      await expect(btn).toHaveText(fb);
      expect(await btn.evaluate((b) => b.querySelector('ion-icon')?.getAttribute('aria-hidden'))).toBe('true');
      expect(await btn.evaluate((b) => (b.querySelector('ion-icon') as any)?.icon), 'the Facebook logo').toBe(logoFacebook);
      const y = async (sel: string) => (await art.locator(sel).first().boundingBox())!.y;
      expect(await y('[data-testid="article-video"]'), 'the button above the lead').toBeLessThan(await y('.aview__lead'));
      expect(await y('.aview__lead'), 'the lead above the text').toBeLessThan(await y('.aview__body'));
      await expect(art.getByTestId('gallery-grid').locator('[data-testid="photo-open"]').first()).toBeAttached();
      await expect(art.getByTestId('read-site')).toHaveCount(0);
      await expect(art.getByTestId('rating')).toBeAttached();
      await btn.click();
      await expect.poll(() => p.evaluate(() => (window as any).__opened)).toEqual(['https://www.facebook.com/inok.info/videos/1226721174137171/']);
      await art.evaluate((a) => (a.closest('.split__pane') ?? a.closest('ion-content'))?.scrollTo?.(0, 0));
      await p.waitForTimeout(300);
    } },
  // A-101 / R-47 + CD S302: the live 1892 (a YouTube video with no text on the site, body null): the YouTube button and the lead, nothing in the
  // text's place - NO «Читати повністю» (the site's page holds only the same video); the rating stays
  { name: 'article-video-youtube', path: '/articles?id=1892', before: recordOpens, ready: async (p) => {
      const art = onShown(p, 'article');
      await expect(art.getByTestId('article-video')).toHaveCount(1, { timeout: 15_000 });
      const btn = art.getByTestId('article-video');
      await expect(btn).toHaveAttribute('data-host', 'youtube');
      await expect(btn).toHaveText((await words(p, ['articles.watch']))[0]);
      await expect(art.locator('.aview__lead')).toBeVisible();
      expect((await btn.boundingBox())!.y).toBeLessThan((await art.locator('.aview__lead').boundingBox())!.y);
      await expect(art.locator('.aview__body')).toHaveCount(0);
      await expect(art.getByTestId('read-site')).toHaveCount(0);
      await expect(art.getByTestId('rating')).toBeAttached();
      await btn.click();
      await expect.poll(() => p.evaluate(() => (window as any).__opened)).toEqual(['https://www.youtube.com/watch?v=sw6gaWxW-x8']);
    } },
  // A-96 W-4 (R-45): the live 1714's «Фотогалерея» (one div.gallery, 5 x 150 px) - the thumbnails at their own size (never upscaled), a centred
  // even grid; the columns follow the width (phone 2, a phone turned / tablet more); the cells are buttons «Відкрити фото: Фото 3 з 5»
  { name: 'article-gallery', path: '/articles?id=1714', ready: async (p) => {
      const grid = onShown(p, 'article').getByTestId('gallery-grid');
      await expect(grid.locator('[data-testid="photo-open"]')).toHaveCount(5, { timeout: 15_000 });
      await grid.scrollIntoViewIfNeeded();
      await picturesLoaded(p, '[data-testid="gallery-grid"] img', 5);
      const geo = () => grid.evaluate((g) => {
        const cells = Array.from(g.querySelectorAll('img')).map((i) => { const b = i.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), w: b.width, nat: (i as HTMLImageElement).naturalWidth }; });
        const gb = g.getBoundingClientRect(); const rows = [...new Set(cells.map((c) => c.t))];
        const first = cells.filter((c) => c.t === rows[0]);
        return { cols: first.length, rows: rows.length, maxW: Math.max(...cells.map((c) => c.w)), left: first[0].l - gb.left, right: gb.right - first[first.length - 1].r,
          sameW: new Set(cells.map((c) => Math.round(c.w))).size, prev: g.previousElementSibling?.tagName, gw: gb.width };
      });
      const m = await geo();
      expect(m.maxW, 'never wider than the thumbnail\'s own 150 px').toBeLessThanOrEqual(150.5);
      expect(m.sameW, 'an even grid').toBe(1);
      expect(Math.abs(m.left - m.right), `centred: ${m.left} | ${m.right}`).toBeLessThanOrEqual(2);
      expect(m.prev, 'the «Фотогалерея» heading stays before the grid').toBe('H2');
      const vw = p.viewportSize()!.width;
      expect(m.cols, `columns in ${m.gw} px: as many 150 px cells (+ 8 px gaps) as fit`).toBe(Math.min(5, Math.floor((m.gw + 8) / 158)));
      if (vw < 600) expect(m.cols, 'a 360 px phone: two columns').toBe(2);
      const label = await grid.locator('[data-testid="photo-open"]').nth(2).getAttribute('aria-label');
      const [open, ph] = await words(p, ['photos.open', 'gallery.photo']);
      expect(label).toBe(`${open}: ${ph.replace('{n}', '3').replace('{total}', '5')}`);
      if (vw < 600) { // a phone turned: 780 px wide -> more columns, the same cells (rotation re-flows, no script)
        await p.setViewportSize({ width: 780, height: 360 }); await p.waitForTimeout(300);
        const turned = await geo(); // >= 600 px = two panes: the article pane's own width decides
        expect(turned.cols, `turned: columns in ${turned.gw} px`).toBe(Math.min(5, Math.floor((turned.gw + 8) / 158)));
        expect(turned.maxW).toBeLessThanOrEqual(150.5);
        await p.setViewportSize({ width: vw, height: 780 }); await p.waitForTimeout(300);
        await grid.scrollIntoViewIfNeeded();
      }
    } },
  // A-96 W-4: a tap opens THE viewer on that photo with the set: «3 / 5» (TalkBack «Фото 3 з 5», polite), the FULL file of that photo only;
  // the arrows and a swipe page, the ends disable their arrow; a swipe down closes; TalkBack names «Попереднє фото» / «Наступне фото» / «Закрити»
  { name: 'article-gallery-viewer', only: [...UK, 'phone-ru'], path: '/articles?id=1714', ready: async (p) => {
      const grid = onShown(p, 'article').getByTestId('gallery-grid');
      await expect(grid.locator('[data-testid="photo-open"]')).toHaveCount(5, { timeout: 15_000 });
      await grid.scrollIntoViewIfNeeded();
      await picturesLoaded(p, '[data-testid="gallery-grid"] img', 5);
      const fulls: string[] = [];
      p.on('request', (r) => { if (/\/images\/articles\/1714\/\d\d\.jpg$/.test(r.url())) fulls.push(r.url().split('/').pop()!); });
      await grid.locator('[data-testid="photo-open"]').nth(2).click();
      const img = p.getByTestId('viewer-img');
      const [ph, prev, next, close] = await words(p, ['gallery.photo', 'gallery.prev', 'gallery.next', 'common.close']);
      await expect(p.getByTestId('viewer-count')).toContainText('3 / 5');
      await expect(p.getByTestId('viewer-count')).toHaveAttribute('aria-live', 'polite');
      await expect(p.getByTestId('viewer-count').locator('.sr-only')).toHaveText(ph.replace('{n}', '3').replace('{total}', '5'));
      await expect(img).toHaveAttribute('data-full', '1');
      await expect(img).toHaveAttribute('src', /\/1714\/02\.jpg$/);
      expect(fulls, 'only the shown photo\'s full file (A-20: no neighbour fetched ahead)').toEqual(['02.jpg']);
      for (const [id, name] of [['viewer-prev', prev], ['viewer-next', next], ['viewer-close', close]]) await expect.poll(() => spokenName(p.getByTestId(id)), id).toBe(name);
      await p.getByTestId('viewer-next').click();
      await expect(p.getByTestId('viewer-count')).toContainText('4 / 5');
      await expect(img).toHaveAttribute('src', /\/1714\/03\.jpg$/);
      // a swipe to the left = the next one (a mouse drag = the same pointer events as a finger)
      const box = (await p.locator('.viewer__scroll').boundingBox())!;
      const drag = async (dx: number, dy: number) => { await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(350); };
      await drag(-140, 10);
      await expect(p.getByTestId('viewer-count')).toContainText('5 / 5');
      await expect(p.getByTestId('viewer-next')).toHaveClass(/button-disabled/);
      await drag(140, 0);
      await expect(p.getByTestId('viewer-count')).toContainText('4 / 5');
      await drag(0, 160); // a swipe down closes
      await expect(p.locator('ion-modal.viewer')).toHaveCount(0, { timeout: 5000 }).catch(async () => expect(p.locator('ion-modal.viewer:not(.overlay-hidden)')).toHaveCount(0));
      await grid.locator('[data-testid="photo-open"]').nth(0).click(); // the shot: the viewer on the first photo, «1 / 5», «Попереднє» disabled
      await expect(p.getByTestId('viewer-count')).toContainText('1 / 5');
      await expect(p.getByTestId('viewer-prev')).toHaveClass(/button-disabled/);
      await expect(img).toHaveAttribute('data-full', '1');
      await picturesLoaded(p, '[data-testid="viewer-img"]', 1);
    } },
  // A-96 W-4 + A-20: offline the viewer keeps the thumbnail and says why the full photo is not there (A-112: THE standard block)
  { name: 'article-gallery-offline', only: ['phone-light'], path: '/articles?id=1714', before: net({ connected: false, metered: false, dataSaver: false }), ready: async (p) => {
      const grid = onShown(p, 'article').getByTestId('gallery-grid');
      await expect(grid).toBeVisible({ timeout: 15_000 });
      await grid.scrollIntoViewIfNeeded();
      const open = grid.locator('[data-testid="photo-open"]');
      if (await open.count() === 0) return; // offline before the thumbnails were ever cached: the cells show THE icon placeholder (no viewer)
      await open.first().click();
      // A-112: the reason is THE standard block (offline: no button - nothing to load; the settings link stays)
      const block = viewerBlock(p);
      await expect(block).toHaveAttribute('data-why', 'offline');
      await expect(block.locator('.photo-wait__reason')).toHaveText((await words(p, ['photos.reason_offline']))[0]);
      await expect(block.getByTestId('photo-load')).toHaveCount(0);
      await expect(p.getByTestId('viewer-img')).toHaveAttribute('data-full', '0');
    } },
  // A-112: a publication's gallery on mobile data: the small copy is shown (a list-size picture) and THE block under it - no full file asked
  { name: 'viewer-wait-article', only: UK, path: '/articles?id=1714', before: net(MOBILE), ready: async (p) => {
      const fulls = await openArticleGallery(p);
      await expect(p.getByTestId('viewer-img')).toHaveAttribute('data-full', '0');
      const block = viewerBlock(p);
      await expect(block).toHaveAttribute('data-why', 'wifi');
      await expect(p.getByTestId('viewer-wait')).toHaveCount(0); // the small copy stands in the photo's place
      await expect(block.getByTestId('photo-load')).toHaveText((await words(p, ['photos.load_mobile']))[0]);
      await clearOf(p, block);
      const v = p.viewportSize()!;
      await expect.poll(async () => { const b = await block.boundingBox(); return b ? b.y + b.height : 1e9; }, 'the block is on the screen').toBeLessThanOrEqual(v.height);
      await p.getByTestId('viewer-next').click();
      await expect(p.getByTestId('viewer-count')).toContainText('4 / 5');
      await expect(block).toHaveAttribute('data-why', 'wifi');
      await p.getByTestId('viewer-prev').click();
      await expect(p.getByTestId('viewer-count')).toContainText('3 / 5');
      expect(fulls, 'opening and paging ask NO full file').toEqual([]);
      await picturesLoaded(p, '[data-testid="viewer-img"]', 1);
    } },
  // A-112 P8: «Автозавантаження фото» from the viewer closes it and opens the choice in «Ще» - the publication's way
  { name: 'viewer-wait-link', only: ['phone-light'], path: '/articles?id=1714', before: net(MOBILE), ready: async (p) => {
      await openArticleGallery(p);
      await p.locator('ion-modal.viewer [data-testid="photo-settings"]').click();
      await viewerGone(p);
      await expect(p).toHaveURL(/\/more\?photos=1$/);
      await expect(p.locator('ion-alert')).toBeVisible();
      await expect(p.locator('ion-alert .alert-radio-button[aria-checked="true"]')).toContainText(/Тільки Wi-Fi/);
    } },
  // A-29 (owner 02.11.2026): every list of houses shows the site's SQUARE list picture; a house without one shows the app's own sign
  { name: 'monasteries-thumbs', path: '/monasteries', before: withoutThumb([37]), ready: async (p) => {
      await picturesLoaded(p, '[data-testid="list"] .mrow__cover img', 3);
      const boxes = await p.locator('[data-testid="list"] .mrow__cover img').evaluateAll((es) => es.slice(0, 4).map((i) => {
        const b = (i as HTMLImageElement).getBoundingClientRect(); return { src: (i as HTMLImageElement).currentSrc, w: Math.round(b.width), h: Math.round(b.height) }; }));
      for (const b of boxes) { expect(b.src, 'the list square').toMatch(/\/images\/monasteries\/small\//); expect(b.w).toBe(b.h); }
      await p.getByTestId('mrow-37').scrollIntoViewIfNeeded();
      await expect(p.getByTestId('mrow-37').getByTestId('row-nophoto')).toBeVisible(); // «нет фото»: the app's sign, not a grey box
    } },
  // owner 02.11.2026: «Головна» refreshes from its header (and by the pull): the live list and the newest articles are asked again
  { name: 'home-refresh', path: '/home', ready: async (p) => {
      await expect(p.getByTestId('live-avatar').first()).toBeVisible({ timeout: 15_000 });
      const asked: string[] = [];
      p.on('request', (r) => { if (/live-status|articles/.test(r.url())) asked.push(r.url()); });
      const btn = onShown(p, 'refresh');
      await btn.click();
      await expect(btn).toHaveAttribute('data-busy', '0');
      expect(asked.some((u) => u.includes('live-status')), 'live-status asked again').toBe(true);
      expect(asked.some((u) => u.includes('articles')), 'the newest articles asked again').toBe(true);
    } },
  // A-52: the Home bottom line = the same full refresh: it says when it was checked, one message after a tap, the header button rests with it
  { name: 'home-checked', only: UK, path: '/home', ready: async (p) => {
      const line = p.getByTestId('home-checked');
      await expect(line).toHaveText(/^Перевірено сьогодні о \d\d:\d\d$/, { timeout: 15_000 });
      const asked: string[] = [];
      p.on('request', (r) => { if (/live-status|articles|manifest/.test(r.url())) asked.push(r.url()); });
      await p.getByTestId('home-fresh').scrollIntoViewIfNeeded();
      await p.getByTestId('home-fresh').click();
      await expect(p.locator('ion-toast.refresh-toast')).toHaveText(/Дані (актуальні|оновлено)/);
      await toastAboveTabs(p, 'ion-toast.refresh-toast'); // D73
      await expect(onShown(p, 'refresh')).toHaveAttribute('data-busy', '0');
      for (const k of ['live-status', 'articles', 'manifest']) expect(asked.some((u) => u.includes(k)), `${k} asked by the bottom line`).toBe(true);
    } },
  // A-52: «Ще → Оновити дані» = the same refresh; the last check, the directory's own date under it in small text
  { name: 'more-checked', only: UK, path: '/more', ready: async (p) => {
      await expect(p.getByTestId('more-checked')).toHaveText(/^Перевірено сьогодні о \d\d:\d\d$/, { timeout: 15_000 });
      await expect(p.getByTestId('data-date')).toContainText('Дані від');
      const [a, b] = await Promise.all(['more-checked', 'data-date'].map((id) => p.getByTestId(id).evaluate((e) => parseFloat(getComputedStyle(e).fontSize))));
      expect(b, 'the directory date in small text under the check line').toBeLessThan(a);
      await p.getByTestId('more-update').click();
      await expect(p.locator('ion-toast.refresh-toast')).toHaveText(/Дані (актуальні|оновлено)/);
      await toastAboveTabs(p, 'ion-toast.refresh-toast'); // D73
    } },
  // D73: a message on an ARTICLE (the rating refused - server busy) sits above the tab bar too: the five tabs stay visible
  { name: 'article-toast', only: UK, path: '/articles?id=2869', before: async (p) => {
      await p.route(/\/fixtures\/articles\.json\?rate=/, (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"busy"}' }));
    }, ready: async (p) => {
      await onShown(p, 'article').getByTestId('star-5').click();
      await expect(p.locator('ion-toast.rating-toast')).toBeVisible();
      await toastAboveTabs(p, 'ion-toast.rating-toast');
    } },
  // D72: the hoster's protection page (HTML) after the start: the manual refresh says «busy» in one line, the cached lists stay
  { name: 'home-busy', only: UK, path: '/home', before: async (p) => {
      let n = 0;
      await p.route(/\/fixtures\/manifest\.json/, async (r) => (n++ === 0 ? r.fallback() : r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!DOCTYPE html><html><head><title>Захищена сторінка</title></head><body></body></html>' })));
    }, ready: async (p) => {
      // the first manifest = the first-run import; the START refresh already meets the page: silent (no message), no «checked» time
      await expect(p.locator('[data-testid^="arow-"]')).toHaveCount(3, { timeout: 15_000 });
      await expect(onShown(p, 'refresh')).toHaveAttribute('data-busy', '0', { timeout: 15_000 });
      await expect(p.locator('ion-toast.refresh-toast')).toHaveCount(0);
      await expect(p.getByTestId('home-checked')).toHaveText('Оновити дані');
      await onShown(p, 'refresh').click();
      await expect(p.locator('ion-toast.refresh-toast')).toHaveText('Сервер зайнятий, спробуйте пізніше.');
      await toastAboveTabs(p, 'ion-toast.refresh-toast'); // D73
      await expect(p.locator('[data-testid^="arow-"]')).toHaveCount(3);
      await expect(p.getByTestId('tiles')).toBeVisible();
    } },
  // A-51 (R-35): an opened article takes its item from the server - an admin's edit shows without a restart (the feed still has the old copy)
  { name: 'article-server-copy', only: UK, path: '/articles?id=2869', before: async (p) => {
      await p.route(/\/fixtures\/articles\.json\?item=2869$/, async (r) => {
        const j = await fixtureJson(r); if (!j) return;
        j.items = j.items.map((x: { id: number; title: string }) => (x.id === 2869 ? { ...x, title: 'Заголовок, виправлений в адмінці' } : x));
        await r.fulfill({ json: j });
      });
    }, ready: async (p) => {
      await expect(onShown(p, 'article').locator('.card__title')).toHaveText('Заголовок, виправлений в адмінці');
    } },
  // D69: a push tap on a WARM app for an id the cache lacks - asked from the server (R-35), shown; never «not found»
  { name: 'article-push-warm', only: UK, path: '/home', before: async (p) => {
      await p.route(/\/fixtures\/articles\.json$/, async (r) => {
        const j = await fixtureJson(r); if (!j) return;
        j.items = j.items.filter((x: { id: number }) => x.id !== 2866); // the feed the app cached lacks it
        await r.fulfill({ json: j });
      });
    }, ready: async (p) => {
      await expect(p.getByTestId('home-checked')).toHaveText(/^Перевірено/, { timeout: 15_000 });
      await p.evaluate(() => { history.pushState({}, '', '/articles?id=2866'); dispatchEvent(new PopStateEvent('popstate')); });
      await expect(onShown(p, 'article')).toBeVisible();
      await expect(p.getByTestId('article-missing')).toHaveCount(0);
    } },
  // A-53 (R-37): the site's right-aligned verse (2868 ru, Pushkin) is right-aligned in the app; one CSS rule for bodies and histories
  { name: 'article-align-ru', only: UK, path: '/articles?id=2868', before: async (p) => {
      await ruLang(p);
      await p.route(FEED_AND_ITEM, (r) => r.fulfill({ contentType: 'application/json', body: readFileSync('fixtures/articles_ru.json', 'utf8') }));
    }, ready: async (p) => {
      const right = onShown(p, 'article').locator('.aview__body p.al-r');
      await expect(right).toHaveCount(2);
      expect(await right.evaluateAll((es) => es.map((e) => getComputedStyle(e).textAlign))).toEqual(['right', 'right']);
      await expect(right.last()).toContainText('Пушкин');
      // the text ends at the right edge of the body (as on the site), not at the left
      const [line, body] = await Promise.all([right.first().evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().right; }),
        onShown(p, 'article').locator('.aview__body').evaluate((e) => e.getBoundingClientRect().right - parseFloat(getComputedStyle(e).paddingRight))]);
      expect(Math.abs(body - line), 'the verse ends at the right edge').toBeLessThan(4);
      await right.first().scrollIntoViewIfNeeded();
    } },
  // A-53: in EVERY article list the badges (★ rating, 💬 comments) are line 2 under «kind · date»; no line 2 when neither is there
  { name: 'articles-badges', only: UK, path: '/articles', ready: async (p) => {
      const row = (id: number) => onShown(p, `arow-${id}`);
      await expect(row(2869).getByTestId('abadges-2869')).toHaveText('★ 5 (7) · 💬 4');
      await starColours(p, 'ion-tabs .ion-page:not(.ion-page-hidden) [data-testid="abadges-2869"] .star-mark', 1); // A-78 3: the row's «★» = the stars' token
      await expect(row(2871).locator('.arow__badges')).toHaveCount(0);
      const [date, badges] = await Promise.all([row(2869).locator('.mrow__sub:not(.arow__badges)').boundingBox(), row(2869).locator('.arow__badges').boundingBox()]);
      expect(badges!.y, 'line 2 under line 1').toBeGreaterThanOrEqual(date!.y + date!.height - 1);
      const [c1, c2] = await Promise.all(['.mrow__sub:not(.arow__badges)', '.arow__badges'].map((q) => row(2869).locator(q).evaluate((e) => { const c = getComputedStyle(e); return `${c.fontSize} ${c.color}`; })));
      expect(c2, 'the same size and colour').toBe(c1);
    } },
  // A-31 (owner 02.11.2026): the header picture of a card and of an article opens THE viewer of the body pictures — one wrapper, a corner sign
  { name: 'monastery-cover-open', path: '/monasteries/37', ready: async (p) => {
      await picturesLoaded(p, '.card__cover img', 1);
      await expect(onShown(p, 'card').locator('.card__cover .photo-open__hint')).toBeVisible();
      // nothing over the picture covers the sign (the «Фотогалерея» chip sits in the same frame)
      const clash = await onShown(p, 'card').locator('.card__cover-wrap').evaluate((w) => {
        const h = w.querySelector('.photo-open__hint')!.getBoundingClientRect();
        return Array.from(w.querySelectorAll('button, a, .chip, ion-chip')).filter((e) => !e.contains(w.querySelector('.photo-open__hint'))).some((e) => {
          const r = e.getBoundingClientRect(); return r.width > 0 && r.left < h.right && r.right > h.left && r.top < h.bottom && r.bottom > h.top; }); });
      expect(clash, 'the open sign under another control').toBe(false);
      // D49: the two controls over the cover are ONE style family (surface, shadow, height, icon size, corner inset) and nothing else is
      // drawn over it (≥600 dp: the favourite star sits at the end of the title row, not on the picture)
      const fam = await onShown(p, 'card').locator('.card__cover-wrap').evaluate((w) => {
        const wr = w.getBoundingClientRect();
        const one = (e: Element) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
          return { bg: cs.backgroundColor, shadow: cs.boxShadow, h: Math.round(r.height), icon: getComputedStyle(e.querySelector('ion-icon')!).fontSize,
            inset: Math.round(wr.right - r.right), vInset: Math.round(Math.min(r.top - wr.top, wr.bottom - r.bottom)) }; };
        const over = Array.from(w.querySelectorAll('button, ion-button, a')).filter((e) => !e.classList.contains('photo-open')).map((e) => e.className);
        return { hint: one(w.querySelector('.photo-open__hint')!), gallery: one(w.querySelector('[data-testid="gallery"]')!), over };
      });
      expect(fam.hint, 'one family: the open sign and «Фотогалерея»').toEqual({ ...fam.gallery });
      expect([fam.hint.inset, fam.hint.vInset], 'corner inset').toEqual([8, 8]);
      expect(fam.over, 'controls over the cover').toEqual([expect.stringContaining('card__photos')]);
      if ((p.viewportSize()?.width ?? 0) >= 600) await expect(onShown(p, 'card').locator('.card__title-row [data-testid="fav"]')).toBeVisible();
      await onShown(p, 'card').locator('.card__cover [data-testid="photo-open"]').click();
      await expect(p.getByTestId('viewer-img')).toBeVisible();
      await picturesLoaded(p, '[data-testid="viewer-img"]', 1);
      await expect(p.locator('ion-modal.viewer')).toHaveCount(1); // one viewer is open, not a second kind
    } },
  { name: 'article-cover-open', path: '/articles?id=2869', ready: async (p) => {
      await picturesLoaded(p, '.aview__cover img', 1);
      // A-30 (R-26): the header is the page's own large picture, not the stretched 150-px feed preview; the feed rows keep the preview
      await expect(p.locator('.aview__cover img').locator('visible=true')).toHaveAttribute('src', /\/images\/articles\/2869\/00\.jpg$/);
      if ((p.viewportSize()?.width ?? 0) >= 600) await expect(p.locator('[data-testid="arow-2869"] img')).toHaveAttribute('src', /small\/preview/);
      await expect(p.locator('.aview__cover .photo-open__hint').locator('visible=true')).toHaveCount(1);
      await p.locator('.aview__cover [data-testid="photo-open"]').locator('visible=true').click();
      await expect(p.getByTestId('viewer-img')).toBeVisible();
      await picturesLoaded(p, '[data-testid="viewer-img"]', 1);
    } },
  { name: 'article-photo-offline', path: '/articles?id=2869', before: net({ connected: false, metered: false, dataSaver: false }), ready: async (p) => {
      await expect(p.locator('[data-testid="photo-wait"][data-why]').first()).toHaveAttribute('data-why', 'offline');
      await expect(p.getByTestId('photo-load')).toHaveCount(0); // nothing to load with
      await expect(p.locator('[data-testid="photo-open"]')).toHaveCount(0); // A-31: a placeholder never opens the viewer
      // R-18: no picture yet, yet each body frame already has the file's proportions (700×395) — nothing jumps when it arrives
      const box = await p.locator('.aview__body .body-pic').first().boundingBox();
      expect(box && Math.abs(box.height / box.width - 395 / 700)).toBeLessThan(0.02);
      await expect(p.getByTestId('photos-load-all')).toHaveCount(0);
    } },
  { name: 'article-photo-manual', path: '/articles?id=2869', before: net({ connected: true, metered: false, dataSaver: true }), ready: async (p) => {
      await expect(p.locator('[data-testid="photo-wait"][data-why]').first()).toHaveAttribute('data-why', 'saver'); // Data Saver: no automatic download
      await p.getByTestId('photo-load').first().click(); // a manual tap always works (the cover's)
      await picturesLoaded(p, '.aview__cover img', 1);
    } },
  { name: 'more-photos', path: '/more?photos=1', ready: async (p) => {
      // the placeholder's link opens the choice at once; the default is «Тільки Wi-Fi»
      await expect(p.locator('ion-alert')).toBeVisible();
      await expect(p.locator('ion-alert .alert-radio-button[aria-checked="true"]')).toContainText(/Тільки Wi-Fi|Только Wi-Fi|Wi-Fi only/);
      // D60: the hint is two short lines (was 11): each sentence on its own line, at most two drawn lines each at 360 dp
      const msg = p.locator('ion-alert.inok-dialog .alert-message');
      await expect(msg).toContainText(/Мініатюри в списках\s— завжди|Миниатюры в списках\s— всегда|List thumbnails\s— always/);
      const drawn = await msg.evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); // distinct line tops of the TEXT (gotcha: a box hides its text)
        return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; });
      expect(drawn, 'drawn lines of the hint').toBeLessThanOrEqual(3);
      expect(drawn).toBeGreaterThanOrEqual(2);
      await p.waitForTimeout(400);
    } },
  { name: 'more', path: '/more', ready: async (p) => { await expect(p.getByTestId('more-list')).toBeVisible(); await expect(p.getByTestId('data-date')).toContainText('2026'); } },
  { name: 'favourites', path: '/more/favourites', ready: async (p) => { await expect(p.getByTestId('fav-empty')).toBeVisible(); } },
  { name: 'language', path: '/more/language', ready: async (p) => {
      await expect(p.getByTestId('lang-uk')).toBeVisible();
      if (p.viewportSize()!.width >= 600 || (await p.evaluate(() => document.documentElement.lang)) !== 'uk') return; // phones in uk: switch and back
      // A-56: <html lang> (the hyphenation dictionary) follows the interface language at once, and back
      for (const l of ['ru', 'en', 'uk']) {
        await p.getByTestId(`lang-${l}`).click();
        await expect.poll(() => p.evaluate(() => document.documentElement.lang), `A-56: lang after choosing ${l}`).toBe(l);
      }
    } },
  { name: 'notifications', path: '/more/notifications', ready: async (p) => { await expect(p.getByTestId('push-list')).toBeVisible(); await expect(p.getByTestId('topic-ch_1686')).toBeVisible(); await expect(p.getByTestId('kind-video')).toBeVisible(); await expect(p.getByTestId('channel-search')).toBeVisible(); } },
  { name: 'notifications-kinds', path: '/more/notifications', ready: async (p) => {
      // A-64: a new install listens to nothing - every switch off; the master on = the three kinds on
      await expect(p.locator('ion-toggle[data-testid^="kind-"].toggle-checked')).toHaveCount(0);
      await p.getByTestId('topic-articles').click();
      await expect(p.locator('ion-toggle[data-testid^="kind-"].toggle-checked')).toHaveCount(3);
      // A-11: one kind off → the master stays on and names the two kinds; D17: the channel search narrows the list
      await p.getByTestId('kind-publication').click();
      await expect(p.getByTestId('topic-articles')).toContainText(/Відео, Новини|Видео, Новости|Video, News/);
      await p.getByTestId('channel-search').locator('input').fill('лавр');
      await expect(p.locator('[data-testid^="topic-ch_"]')).toHaveCount(3); // the three lavras
    } },
  { name: 'more-theme', path: '/more', ready: async (p) => {
      // A-16: the choice applies at once — «Темна» in a light system, «Світла» in a dark one
      const html = p.locator('html');
      const sysDark = await p.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
      await expect(html).toHaveClass(sysDark ? /ion-palette-dark/ : /^(?!.*ion-palette-dark)/);
      await p.getByTestId(sysDark ? 'theme-light' : 'theme-dark').click();
      await expect(html).toHaveClass(sysDark ? /^(?!.*ion-palette-dark)/ : /ion-palette-dark/);
      await p.waitForTimeout(300);
    } },
  { name: 'home-from-card', path: '/more/about', ready: async (p) => {
      // the owner's word 01.11: home in one tap — the brand icon in the toolbar, and «Ще → Головна»
      await expect(p.getByTestId('app-version')).toBeVisible();
      await settled(p); await onShown(p, 'toolbar-home').click();
      await expect(p).toHaveURL(/\/home$/);
      await expect(p.getByTestId('tile-streams')).toBeVisible();
      await p.goto('/more');
      await p.getByTestId('more-home').click();
      await expect(p).toHaveURL(/\/home$/);
    } },
  // R-21 / A-23 #2: «Контакти» right after «Про Комісію»; the site's contacts from the export's block, the card's fact rows
  { name: 'contacts', path: '/more', ready: async (p) => {
      await expect(p.getByTestId('more-contacts')).toBeVisible();
      const keys = await p.locator('[data-testid^="more-"]').evaluateAll((es) => es.map((e) => e.getAttribute('data-testid')));
      expect(keys.indexOf('more-contacts')).toBe(keys.indexOf('more-commission') + 1);
      await p.getByTestId('more-contacts').click();
      await expect(p.getByTestId('contacts-address')).toContainText(/Лаврськ|Лаврск|Lavrska/);
      await expect(p.getByTestId('contacts-phone')).toContainText('+99(999)999-99-99') // masked in the fixture;
      await expect(p.getByTestId('contacts-phone')).toContainText('Telegram');
      await expect(p.getByTestId('contacts-email')).toContainText('@inok.info');
      await expect(p.getByTestId('contacts-hours').locator('.info__line')).toHaveCount(3);
      await expect(p.getByTestId('contacts-map')).toBeVisible();
      await expect(p.getByTestId('contacts-minimap')).toBeVisible(); // PLAN 5
      await expect(p.getByTestId('contacts')).not.toContainText(/Засновник|Учредитель|Founder|діє при|действует при/);
      // D25: every fact row's text starts at ONE x
      const xs = await p.getByTestId('contacts').locator('.info__value').evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().left)));
      expect(new Set(xs).size).toBe(1);
      expect(xs[0]).toBeGreaterThan(30); // after the lead column
      // D36: every row's icon sits on its value's FIRST line (the hours' clock too)
      expect(await leadOffsets(p, '[data-testid="contacts"]')).toEqual([]);
      // D37: the maps row leaves the app → the external mark, as every way out
      await expect(p.getByTestId('contacts-map').locator('.info__ext')).toHaveCount(1);
    } },
  // F2 (A-79 2): the tablet's three list-detail screens scroll their panes separately; a new item opens at its top
  { name: 'panes-articles', only: ['tablet'], path: '/articles?id=2738', ready: (p) => twoPanes(p, { wheel: 'detail', rows: 'arow-' }) },
  { name: 'panes-monasteries', only: ['tablet'], path: '/monasteries/37', before: withMany(120), ready: (p) => twoPanes(p, { wheel: 'list', rows: 'mrow-' }) },
  { name: 'panes-eparchies', only: ['tablet'], path: '/more/eparchies/1', ready: (p) => twoPanes(p, { wheel: 'detail', rows: 'erow-' }) },
  // PLAN 7 (A-14, A-22): «Єпархії УПЦ» = the first item of «Ще» and a chip at the right of the list's filter row; list = search + counts
  { name: 'eparchies', path: '/monasteries', ready: async (p) => {
      await p.getByTestId('eparchies-open').click();
      await expect(p.getByTestId('eparchy-count')).toContainText('10');
      await expect(p.getByTestId('erow-1').getByTestId('ep-counts')).toContainText(/Монастирів: 8|Монастырей: 8|Monasteries: 8/);
      await expect(p.getByTestId('erow-1').getByTestId('ep-counts')).toContainText(/Насельників|Насельников|Residents/);
      // the owner 01.11: the bare name in the list (no «єпархія»), «Насельників» on its own line
      await expect(p.getByTestId('erow-1').locator('.mrow__title')).toHaveText(/^(Київська|Киевская|Kyiv)$/);
      const tops = await p.getByTestId('erow-1').getByTestId('ep-counts').locator('.meta__g').evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(tops.length).toBe(2); expect(tops[1]).toBeGreaterThan(tops[0]);
      await picturesLoaded(p, '[data-testid^="erow-"] img', 3);
    } },
  { name: 'eparchies-search', path: '/more', ready: async (p) => {
      await expect(p.getByTestId('more-eparchies')).toBeVisible();
      const keys = await p.locator('[data-testid^="more-"]').evaluateAll((es) => es.map((e) => e.getAttribute('data-testid')));
      expect(keys.filter((k) => k !== 'more-list').slice(0, 2)).toEqual(['more-eparchies', 'more-home']); // A-22
      await p.getByTestId('more-eparchies').click();
      await p.getByTestId('eparchy-search').locator('input').fill('kyiv'); // any language
      await expect(p.locator('[data-testid^="erow-"]')).toHaveCount(1);
      await expect(p.getByTestId('erow-1')).toBeVisible();
    } },
  // the eparchy's page: its map picture, counts, «Обителі на карті», Wikipedia, its houses as list rows — lavras first (A-21)
  { name: 'eparchy', path: '/more/eparchies/1', tall: 2200, ready: async (p) => {
      await expect(p.getByTestId('eparchy-title').locator('visible=true')).toHaveText(/Київська єпархія|Киевская епархия|Kyiv/);
      await expect(p.getByTestId('eparchy-monasteries').locator('visible=true')).toContainText('8');
      // A-44: the eparchy's houses = the one list order - the lavras first
      expect(await p.getByTestId('eparchy-houses').locator('visible=true').locator('[data-testid^="mrow-"]').evaluateAll((rs) => rs.slice(0, 3).map((r) => r.getAttribute('data-testid')))).toEqual(['mrow-242', 'mrow-111', 'mrow-98']);
      await expect(p.getByTestId('eparchy-wiki').locator('visible=true').locator('.info__ext')).toHaveCount(1);
      // A-25 #4 (R-23): «Сайт єпархії» right BEFORE «Вікіпедія», a way out (the external mark)
      await expect(p.getByTestId('eparchy-site').locator('visible=true').locator('.info__ext')).toHaveCount(1);
      const ids = await p.locator('.infos .info').locator('visible=true').evaluateAll((es) => es.map((e) => e.getAttribute('data-testid')));
      expect(ids.indexOf('eparchy-wiki') - ids.indexOf('eparchy-site')).toBe(1);
      const codes = await p.locator('[data-testid="eparchy-houses"] [data-testid^="mrow-"]').evaluateAll((es) => es.map((e) => e.getAttribute('data-testid')));
      expect(codes).toHaveLength(8);
      expect(new Set(codes.slice(0, 3))).toEqual(new Set(['mrow-98', 'mrow-111', 'mrow-242']));
      await picturesLoaded(p, '.eparchy__map img', 1);
    } },
  // PLAN 5 (cloud_11): THE mini-map — the main map's set-up, every house of the eparchy inside its frame, a pin clear of every edge;
  // one button (its label on .over-map) that opens `/map?eparchy=` (the nav matrix plays the tap and Back)
  ...([[1, '8', 'kyiv'], [17, '2', 'konotop']] as const).map(([id, n, tag]) => ({ name: `eparchy-minimap-${tag}`, path: `/more/eparchies/${id}`, ready: async (p: Page) => {
      await miniReady(p, 'eparchy-map', n);
      await expect(onShown(p, 'eparchy-map')).toHaveAccessibleName(/Обителі на карті|Обители на карте|Monasteries on the map/); // A-88: the name = its visible words (axe label-in-name)
      const m = await drawnMarks(p, '__inokMiniMap');
      expect(m.n, 'houses drawn').toBeGreaterThan(0);
      // D50 / D53: every mark's DRAWN box (the pin's head, the cluster's circle) at least 8 clear of the frame, above the label row (44)
      expect(Math.min(m.l, m.w - m.r, m.t) >= 8 && m.b <= m.h - 44 - 8, `marks clear of the frame and the label ${JSON.stringify(m)}`).toBe(true);
      // D57 (REVIEW cloud_13): the taller frame gives the zoom back - Kyiv's houses, not a map of Europe (cloud_12: 3.63; the 2 : 1 frame: 2.47)
      if (tag === 'kyiv') expect(m.z, `the Kyiv eparchy framed, not Europe ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(3.6);
      expect(m.under, 'no basemap label under a pin or a cluster').toEqual([]);
    } })),
  // offline (the style cannot load): the honest stub of the same size, the label stays, the tap still opens the main map
  { name: 'eparchy-minimap-offline', path: '/more/eparchies/1', before: async (p) => { await p.route('https://tiles.openfreemap.org/**', (r) => r.abort()); }, ready: async (p) => {
      await expect(onShown(p, 'minimap-stub')).toBeVisible({ timeout: 20_000 });
      await expect(onShown(p, 'minimap-stub')).toContainText(/інтернет|интернет|online/);
      await onShown(p, 'eparchy-map').scrollIntoViewIfNeeded();
      const [stubH, w] = await onShown(p, 'eparchy-map').evaluate((b) => [b.getBoundingClientRect().height, b.getBoundingClientRect().width]);
      expect(w / stubH, 'the stub keeps the map frame (D57: 3 : 2)').toBeCloseTo(1.5, 1);
    } },
  // «Контакти»: the office on THE map set-up; a tap → the main map at the same place (zoom 14), the point drawn there
  { name: 'contacts-minimap', path: '/more/contacts', ready: async (p) => {
      await miniReady(p, 'contacts-minimap', '0');
      expect(await p.evaluate(() => (window as any).__inokMiniMap.queryRenderedFeatures({ layers: ['place'] }).length), 'the office drawn').toBe(1);
      const top = await onShown(p, 'contacts-minimap').evaluate((b) => b.getBoundingClientRect().top);
      expect(top, 'the mini-map opens the page (no empty third)').toBeLessThan(140);
    } },
  { name: 'contacts-map-place', path: '/more/contacts', ready: async (p) => {
      await miniReady(p, 'contacts-minimap', '0');
      await onShown(p, 'contacts-minimap').click();
      await expect(p).toHaveURL(/\/map\?at=50\.434353,30\.561425$/);
      await mapReady(p);
      // polled: a style switch in place (config after the first screen) re-draws the source a frame later (flake of run 41440830330)
      await expect.poll(() => p.evaluate(() => { const map = (window as any).__inokMap; return { z: map.getZoom(), place: map.queryRenderedFeatures({ layers: ['place'] }).length }; }),
        { message: 'the same place, the same zoom', timeout: 10_000 }).toEqual({ z: 14, place: 1 });
      expect(await p.getByTestId('map').getAttribute('data-lavras-drawn'), 'the Lavra beside the office').not.toBe('0');
      // D51: the office = a pin of the markers' family (the brand colour); its name on a tap
      expect(await p.evaluate(() => (window as any).__inokMap.hasImage('place_office'))).toBe(true);
      const pt = await p.evaluate(() => { const m = (window as any).__inokMap; const q = m.project([30.561425, 50.434353]); const b = m.getCanvas().getBoundingClientRect(); return { x: b.left + q.x, y: b.top + q.y }; });
      await p.mouse.click(pt.x, pt.y - 20); // the pin's body stands above its point
      await expect(p.getByTestId('map-place-card').locator('visible=true')).toHaveText(/Редакція «Монастирського вісника України»|Редакция|Editorial office/);
    } },
  // D35: Київська (its 8 fixture houses span Pochaiv … Sviatohirsk, 12.5° — as in the live export: 48 houses incl. both lavras) and a narrow one
  { name: 'map-eparchy', path: '/map?eparchy=1', ready: async (p) => {
      await mapReady(p, '8');
      await expect(p.getByTestId('map-scope')).toContainText(/Київська єпархія|Киевская епархия|Kyiv/);
      await scopeFit(p);
    } },
  { name: 'map-eparchy-narrow', path: '/map?eparchy=17', ready: async (p) => {
      await mapReady(p, '2');
      await expect(p.getByTestId('map-scope')).toContainText(/Конотопська|Конотопская|Konotop/);
      await scopeFit(p);
    } },
  { name: 'about', path: '/more/about', before: withPlay(null), ready: async (p) => {
      await expect(p.getByTestId('app-version')).toBeVisible();
      // A-80 2: the site's switch absent (R-41 open) -> share + rate hidden; «Перевірити оновлення» always; the browser = not from Play
      await expect(p.getByTestId('about-share')).toHaveCount(0);
      await expect(p.getByTestId('about-rate')).toHaveCount(0);
      await onShown(p, 'about-update').click();
      await expect(onShown(p, 'about-update-note')).toHaveText(/Встановлено не з Google Play|Установлено не из Google Play|Not installed from Google Play/);
      expect(await asked(p)).toEqual([]); // nothing opened
    } },
  // A-80 1: the three rows under the version (the switch on): icons + words; share = one line + the Play URL; rate = the Play app
  { name: 'about-store', path: '/more/about', before: withPlay({ updateAvailability: 1, currentVersionName: '1.0.4' }, STORE_ON), ready: async (p) => {
      await expect(onShown(p, 'about-share')).toBeVisible(); // the rows come with the site's config (after the first screen)
      const ids = await p.locator('[data-testid="app-version"]').locator('xpath=ancestor::ion-list[1]').locator('ion-item').evaluateAll((es) => es.map((e) => e.getAttribute('data-testid')));
      expect(ids.slice(ids.indexOf('version-line'), ids.indexOf('version-line') + 4)).toEqual(['version-line', 'about-share', 'about-rate', 'about-update']);
      for (const id of ['about-share', 'about-rate', 'about-update']) await expect(onShown(p, id).locator('ion-icon[slot="start"]')).toBeVisible();
      await p.evaluate(() => { (navigator as unknown as { share: (o: object) => Promise<void> }).share = async (o) => { (window as unknown as { __asked: string[] }).__asked.push(`share ${JSON.stringify(o)}`); }; });
      await onShown(p, 'about-share').click();
      await onShown(p, 'about-rate').click();
      await onShown(p, 'about-update').click();
      await expect(onShown(p, 'about-update-note')).toHaveText(/(остання|последняя|the latest) .*1\.0\.\d+/);
      const a = (await asked(p)).filter((x) => x !== 'info'); // the start-up check asks Play too (A-80 ADDENDUM 1)
      expect(a[0]).toMatch(/^share .*"text":"(Монастирський|Монастырский|Monastic).*inok\.info.*","url":"https:\/\/play\.google\.com\/store\/apps\/details\?id=info\.inok\.app"/);
      expect(a.slice(1)).toEqual(['store {"androidPackageName":"info.inok.app","androidStorePackageName":"com.android.vending"}']);
    } },
  // cloud_36 (B2): the iPhone (the web plays it: `inok.platform` = ios) - the Play listing is never offered (share / rate hidden even with the
  // site's switch on), the update check asks the App Store's lookup: not there yet = «не з App Store»; a newer version = its store page
  { name: 'about-ios', only: ['phone-light', 'phone-dark', 'tablet'], path: '/more/about', before: async (p) => {
      await withPlay(null, STORE_ON)(p);
      await p.addInitScript(() => { localStorage.setItem('inok.platform', 'ios'); });
      await p.route('https://itunes.apple.com/lookup?**', (r) => r.fulfill({ json: { resultCount: 0, results: [] } })); },
    ready: async (p) => {
      await expect(onShown(p, 'app-version')).toBeVisible();
      await expect.poll(() => p.evaluate(() => !!(window as any).__inokConfig)).toBe(true);
      await expect(p.getByTestId('about-share')).toHaveCount(0);
      await expect(p.getByTestId('about-rate')).toHaveCount(0);
      await onShown(p, 'about-update').click();
      await expect(onShown(p, 'about-update-note')).toHaveText(/Встановлено не з App Store|Установлено не из App Store|Not installed from the App Store/);
    } },
  { name: 'about-ios-update', only: ['phone-light'], path: '/more/about', before: async (p) => {
      await recordOpens(p);
      await p.addInitScript(() => { localStorage.setItem('inok.platform', 'ios'); });
      await p.route('https://itunes.apple.com/lookup?**', (r) => r.fulfill({ json: { resultCount: 1, results: [{ version: '9.9.9', trackId: 6700000001 }] } })); },
    ready: async (p) => {
      await onShown(p, 'about-update').click();
      await expect.poll(() => p.evaluate(() => (window as any).__opened)).toEqual(['https://apps.apple.com/app/id6700000001']);
    } },
  // A-120 (1): the social block on both «Ще» screens - every profile; 320 dp x font 200 % (the row may go one per row); the iOS shell
  ...(['commission', 'about'] as const).flatMap((pg) => [
    { name: `social-${pg}`, path: `/more/${pg}`, before: recordOpens, ready: (p: Page) => socialBlock(p, pg === 'commission', true) },
    { name: `social-${pg}-font200`, path: `/more/${pg}`, width: 320, font: 200, only: ['phone-light', 'phone-dark'], before: recordOpens,
      ready: (p: Page) => socialBlock(p, pg === 'commission', false) },
    { name: `social-${pg}-ios`, path: `/more/${pg}`, only: ['phone-light', 'phone-dark', 'tablet'], before: async (p: Page) => {
        await recordOpens(p); await p.addInitScript(() => { localStorage.setItem('inok.platform', 'ios'); }); },
      ready: (p: Page) => socialBlock(p, pg === 'commission', true) },
  ]),
  // NOTE 5 (REVIEW cloud_36): the iPad 13" (1032 x 1376 pt) - tiles, calendar and the lists of «Головна» share ONE column edge (cloud_36: the
  // calendar ran edge to edge, the rows stopped at the 960-px column)
  { name: 'home-ipad13', path: '/home', width: 1032, tall: 1376, only: ['tablet'], ready: async (p: Page) => {
      await expect(onShown(p, 'calendar')).toBeVisible(); await expect(onShown(p, 'home-new')).toBeVisible();
      const e = await p.locator(SHOWN).evaluate((pg) => { const r = (s: string) => pg.querySelector(s)!.getBoundingClientRect();
        const tiles = Array.from(pg.querySelectorAll('.tiles .tile')).map((t) => t.getBoundingClientRect());
        return { tilesL: Math.round(tiles[0].left), tilesR: Math.round(tiles[tiles.length - 1].right), calL: Math.round(r('.cal').left), calR: Math.round(r('.cal').right),
          listL: Math.round(r('.home__list').left), listR: Math.round(r('.home__list').right), vw: innerWidth }; });
      expect([e.calL, e.calR], `the calendar on the tiles' edges ${JSON.stringify(e)}`).toEqual([e.tilesL, e.tilesR]);
      expect(Math.abs((e.listL + e.listR) / 2 - e.vw / 2), `the lists centred in the same column ${JSON.stringify(e)}`).toBeLessThanOrEqual(1);
      expect(e.listR - e.tilesR, `the list's edge = the tiles' row edge + its 12 px inset ${JSON.stringify(e)}`).toBe(12);
    } },
  { name: 'about-update-available', only: ['phone-light'], path: '/more/about', before: withPlay({ updateAvailability: 2, immediateUpdateAllowed: true }), ready: async (p) => {
      await onShown(p, 'about-update').click();
      await expect.poll(async () => (await asked(p)).slice(-2)).toEqual(['info', 'immediate']); // the row asks Play, then Google's own screen
    } },
  // A-80 ADDENDUM 1: the start-up offer, the plugin mocked - flexible: the banner above the tab bar, «Оновити» -> the download -> «Перезапустити»
  { name: 'update-banner', path: '/home', before: withPlay({ updateAvailability: 2, clientVersionStalenessDays: 4, flexibleUpdateAllowed: true, immediateUpdateAllowed: true }), ready: async (p) => {
      const b = await bannerAboveTabs(p, 'update-offer');
      await expect(b).toContainText(/Доступна нова версія|Доступна новая версия|A new version is available/);
      await p.locator('[data-testid="update-offer-do"]').click();
      const r = await bannerAboveTabs(p, 'update-restart');
      await expect(r).toContainText(/Перезапустити|Перезапустить|Restart/);
      await bannerContrast(p, 'update-restart'); // F3: the same banner, the same token
      await p.locator('[data-testid="update-restart-do"]').click();
      await expect.poll(() => asked(p)).toEqual(['info', 'flexible', 'complete']);
    } },
  { name: 'update-banner-shown', path: '/home', before: withPlay({ updateAvailability: 2, clientVersionStalenessDays: 4, flexibleUpdateAllowed: true }), ready: async (p) => {
      await bannerAboveTabs(p, 'update-offer'); // the shot: the banner as the reader sees it
      await bannerContrast(p, 'update-offer'); // F3: red on 7ba6af7 (2.00:1 light, 1.90:1 dark)
    } },
  { name: 'update-banner-dismiss', only: ['phone-light'], path: '/home', before: withPlay({ updateAvailability: 2, clientVersionStalenessDays: 4, flexibleUpdateAllowed: true }), ready: async (p) => {
      await bannerAboveTabs(p, 'update-offer');
      await p.locator('[data-testid="update-offer-close"]').click();
      await expect(p.locator('ion-toast[data-testid="update-offer"]')).toBeHidden();
      await p.reload(); await settled(p); // the next start the same day: Play asked (F4: a local call at every start), no banner
      await expect.poll(() => asked(p)).toEqual(['info']); await p.waitForTimeout(1500);
      await expect(p.locator('ion-toast[data-testid="update-offer"]')).toHaveCount(0);
    } },
  // F4 (REVIEW cloud_25): the day's check already ran (marks = now); an update DOWNLOADED -> «Перезапустити»; below the minimum -> Google's
  // screen - at the next start, not tomorrow. Red on 7ba6af7 (the once-a-day gate returned before Play was asked).
  { name: 'update-downloaded-same-day', only: ['phone-light'], path: '/home', before: async (p) => {
      await sameDayMarks(p); await withPlay({ updateAvailability: 2, installStatus: 11, clientVersionStalenessDays: 4, flexibleUpdateAllowed: true })(p);
    }, ready: async (p) => {
      const r = await bannerAboveTabs(p, 'update-restart');
      await expect(r).toContainText(/Перезапустити|Перезапустить|Restart/);
      await p.locator('[data-testid="update-restart-do"]').click();
      await expect.poll(() => asked(p)).toEqual(['info', 'complete']);
    } },
  { name: 'update-immediate-same-day', only: ['phone-light'], path: '/home', before: async (p) => {
      await sameDayMarks(p); await withPlay({ updateAvailability: 2, clientVersionStalenessDays: 0, immediateUpdateAllowed: true }, { min_app_version: '9.0.0' })(p);
    }, ready: async (p) => {
      await expect.poll(() => asked(p)).toEqual(['info', 'immediate']);
      await expect(p.locator('ion-toast[data-testid="update-offer"]')).toHaveCount(0);
    } },
  { name: 'update-immediate', only: ['phone-light'], path: '/home', before: withPlay({ updateAvailability: 2, clientVersionStalenessDays: 0, immediateUpdateAllowed: true }, { min_app_version: '9.0.0' }), ready: async (p) => {
      await expect.poll(() => asked(p)).toEqual(['info', 'immediate']); // below the site's minimum: Google's full screen, no banner
      await expect(p.locator('ion-toast[data-testid="update-offer"]')).toHaveCount(0);
    } },
  { name: 'update-none', only: ['phone-light'], path: '/home', before: withPlay({ updateAvailability: 2, clientVersionStalenessDays: 1, flexibleUpdateAllowed: true }), ready: async (p) => {
      await expect.poll(() => asked(p)).toEqual(['info']); await p.waitForTimeout(1000); // 1 day in Play: not yet
      await expect(p.locator('ion-toast[data-testid="update-offer"]')).toHaveCount(0);
    } },
  { name: 'update-not-play', only: ['phone-light'], path: '/home', before: withPlay('not_play'), ready: async (p) => {
      await expect.poll(() => asked(p)).toEqual(['info']); await p.waitForTimeout(1000);
      await expect(p.locator('ion-toast')).toHaveCount(0); // not from Play: nothing at start-up
    } },
  // A-24: the base map in the interface language (the profile's uk / ru, and en), no disputed dashes, no occupation-era Crimea label
  ...(['kyiv', 'crimea'] as const).flatMap((place) => [undefined, 'en'].map((force) => ({
    name: `basemap-${place}${force ? `-${force}` : ''}`, path: '/map',
    before: force ? async (p: Page) => { await p.addInitScript((l) => localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ lang: l })), force); } : undefined,
    ready: async (p: Page) => {
      await mapReady(p);
      await jumpDrawn(p, place === 'kyiv' ? { center: [30.52, 50.45], zoom: 8.5 } : { center: [34.2, 45.2], zoom: 6.6 }); // D61: idle = tiles + label placement
      const r = await p.evaluate(() => {
        const m = (window as any).__inokMap; const lang = document.documentElement.lang;
        const st = m.getStyle(); const text = JSON.stringify(st.layers.find((l: any) => l.id === 'label_state')?.layout?.['text-field']);
        const places = m.queryRenderedFeatures({ layers: st.layers.filter((l: any) => l['source-layer'] === 'place').map((l: any) => l.id) }).map((f: any) => f.properties);
        const disputed = st.layers.find((l: any) => l.id === 'boundary_disputed')?.layout?.visibility;
        return { lang, text, places: places.map((x: any) => [x['name:en'] ?? x.name, x[`name:${lang}`] ?? null]), disputed };
      });
      expect(r.text).toBe(JSON.stringify(['coalesce', ['get', `name:${r.lang}`], ['get', 'name:latin'], ['get', 'name']]));
      expect(r.disputed).toBe('none');
      expect(r.places.length, 'labels drawn').toBeGreaterThan(0);
      expect(r.places.filter(([en]: string[]) => /^Republic of Crimea$/.test(en)), 'no occupation-era label').toEqual([]);
      if (place === 'crimea') expect(r.places.map(([en]: string[]) => en)).toContain('Autonomous Republic of Crimea');
    },
  }))),
  // A-85 (2): the smart «up» / «down» arrows - the longest article of the fixtures (2869: 24 viewports on a phone, 11 on the tablet; the
  // spec's 1832 is not in them) and card 242 (its history opened: 10 / 4.8 viewports), driven by real wheel events
  ...[['', '/articles?id=2869'], ['-card', '/monasteries/242']].flatMap(([kind, path]) => [
    { name: `scroll-arrows${kind}-down`, only: UK, path, ready: async (p: Page) => {
        await arrowsPage(p);
        await arrowsAre(p, false, false); // nothing before the first move
        await wheelBy(p, 300, 2); // DOWN with room
        await arrowsAre(p, false, true);
        await arrowsContrast(p); await keepScrolling(p);
      } },
    { name: `scroll-arrows${kind}-up`, only: UK, path, ready: async (p: Page) => {
        await arrowsPage(p);
        const m = await arrowsScroll(p);
        await wheelBy(p, 400, Math.ceil((2.6 * m.client) / 400)); // down past 1.5 viewports from the top
        await arrowsAre(p, false, true);
        await expect(onShown(p, 'scroll-down')).toHaveAttribute('data-shown', '0', { timeout: 4000 }); // the idle fade (2.5 s)
        await arrowsAre(p, false, false);
        await wheelBy(p, -120); // UP: the intent
        await arrowsAre(p, true, false);
        await arrowsContrast(p); await keepScrolling(p);
      } },
    { name: `scroll-arrows${kind}-both`, only: UK, path, ready: async (p: Page) => {
        await arrowsPage(p);
        const m = await arrowsScroll(p);
        await wheelBy(p, 400, Math.ceil((2.6 * m.client) / 400));
        await wheelBy(p, -120); // up: «up» joins «down» (both conditions hold)
        await arrowsAre(p, true, true);
        await arrowsContrast(p); await keepScrolling(p);
      } },
  ]),
  // item 5 (REVIEW cloud_27, named): the tablet's arrows keep their own corner - the detail pane's content leaves it free
  ...[['article', '/articles?id=2869'], ['card', '/monasteries/242']].map(([kind, path]) => ({ name: `scroll-arrows-gutter-${kind}`, only: ['tablet'], path, ready: async (p: Page) => {
      await arrowsPage(p);
      expect(await arrowsOverControls(p), 'controls under the arrows').toEqual([]);
      await p.locator(SHOWN).getByTestId(kind === 'card' ? 'card' : 'article').evaluate((a) => { const pane = a.closest('.split__pane') as HTMLElement; pane.scrollTop = pane.scrollHeight; });
      const m = await arrowsScroll(p); await wheelBy(p, -400, Math.ceil((1.3 * m.client) / 400)); // the end, then up out of the end zone: «up» shown over the last blocks («Джерела»)
      await arrowsAre(p, true, false);
    } })),
  // A-85 (2): a tap = the very end (focus on the last block) / the very top (focus on the title); at the end nothing over the stars / «Додати коментар»
  { name: 'scroll-arrows-end', only: UK, path: '/articles?id=2869', ready: async (p) => {
      await arrowsPage(p);
      await wheelBy(p, 300, 2);
      await onShown(p, 'scroll-down').click();
      await expect.poll(async () => { const m = await arrowsScroll(p); return m.max - m.top; }, { timeout: 10_000 }).toBeLessThanOrEqual(1);
      await arrowsAre(p, false, false); // the end zone
      await expect.poll(() => p.evaluate(() => document.activeElement?.className)).toBe('card__site');
      await wheelBy(p, -400, 6); // up, out of the end zone: «up»
      await arrowsAre(p, true, false);
      await onShown(p, 'scroll-up').click();
      await expect.poll(async () => (await arrowsScroll(p)).top, { timeout: 10_000 }).toBe(0);
      await expect.poll(() => p.evaluate(() => document.activeElement?.tagName)).toBe('H1');
      await arrowsAre(p, false, false); // the top zone (and «down» never shown on this run)
      const m = await arrowsScroll(p);
      await wheelBy(p, 400, Math.ceil(m.max / 400) + 2); // the reader reads to the very end
      await expect.poll(async () => { const x = await arrowsScroll(p); return x.max - x.top; }).toBeLessThanOrEqual(1);
      const back = Math.ceil((1.3 * m.client) / 400);
      await wheelBy(p, -400, back); // a last look up, out of the end zone: «up» shows ...
      await arrowsAre(p, true, false);
      await wheelBy(p, 400, back + 2); // ... and back to the very end: the end zone hides it
      expect(await arrowsOverlap(p), 'arrows over the stars / «Додати коментар»').toEqual([]);
      await arrowsAre(p, false, false);
      await expect(onShown(p, 'comment-add')).toBeInViewport();
    } },
  // 1.0.5 round 2 (owner 11.11.2026, Huawei P30 Pro, Android 10): the native overlap with the 3-button bar (MainActivity / NavOverlap.java
  // publishes --inok-nav-bottom when Capacitor's own value is 0) lifts the tab bar - every tab button whole above the bar, nothing under it
  { name: 'nav-overlap-3button', only: UK, path: '/home', before: async (p) => {
      await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--inok-nav-bottom', '48px')));
    }, ready: async (p) => {
      await expect(p.getByTestId('home-new')).toBeVisible();
      const r = await p.evaluate(() => ({ vh: innerHeight, bar: document.querySelector('ion-tab-bar')!.getBoundingClientRect().bottom,
        buttons: Math.max(...Array.from(document.querySelectorAll('ion-tab-button')).map((b) => b.getBoundingClientRect().bottom)) }));
      expect(r.bar, 'the tab bar reaches the screen bottom (its background under the buttons)').toBeGreaterThan(r.vh - 1);
      expect(r.buttons, `every tab button above the 48 px of the navigation bar (${JSON.stringify(r)})`).toBeLessThanOrEqual(r.vh - 48 + 0.5);
    } },
  { name: 'back-eparchy-map', path: '/more/eparchies/1', ready: async (p) => {
      // A-25 #1: eparchy page → its map → the header arrow (= the system Back) → the eparchy page again, not «Головна»
      await expect(p.getByTestId('eparchy-title').locator('visible=true')).toBeVisible();
      await p.getByTestId('eparchy-map').locator('visible=true').click();
      await mapReady(p, '8');
      await settled(p); await onShown(p, 'back').click(); // D45: the arrow of the shown page, after its transition
      await expect(p).toHaveURL(/\/more\/eparchies\/1$/);
      await expect(p.getByTestId('eparchy-title').locator('visible=true')).toBeVisible();
    } },
];

for (const [profile, cfg] of Object.entries(profiles)) {
  test.describe(profile, () => {
    // inok.info answers 403 to a «HeadlessChrome» user agent (covers, avatars); the app's WebView sends a normal Android one
    test.use({ userAgent: ANDROID_UA, viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor, colorScheme: cfg.colorScheme, locale: cfg.locale, geolocation: KYIV, permissions: ['geolocation'],
      timezoneId: 'UTC' }); // F1: the device far from Kyiv (as CI and the emulator) - a site date must still print the SITE's day
    for (const s of screens) {
      if (s.only && !s.only.includes(profile)) continue;
      test(s.name, async ({ page }) => {
        // THROTTLE=4: a slow runner on demand (CDP CPU throttling) - how a CI-only red is reproduced locally (cloud_16)
        if (process.env.THROTTLE) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) });
        const errors: string[] = [];
        // D33: the error WITH its first stack frames — a flaky error must name where it comes from
        page.on('pageerror', (e) => benignPageError(e) || errors.push(`${String(e)} @ ${(e.stack ?? '').split('\n').slice(1, 12).map((l) => l.trim()).join(' < ')}`));
        if (s.tall || s.width) await page.setViewportSize({ width: s.width ?? cfg.viewport.width, height: s.tall ?? cfg.viewport.height });
        // the system font scale: the WebView's text zoom = the root size (every size of the app is in rem)
        if (s.font) await page.addInitScript((f) => document.addEventListener('DOMContentLoaded', () => {
          const st = document.createElement('style'); st.textContent = `html { font-size: ${f}% !important; }`; document.head.append(st); }), s.font);
        await localPictures(page);
        await watchTransitions(page);
        if (s.before) await s.before(page);
        await page.goto(s.path);
        await s.ready(page);
        await settled(page); // D45: the shot and the checks below see ONE shown page, its transition over
        await picturesSettled(page);
        await page.waitForTimeout(300);
        // A-12/A-13: the brand icon left of the title on every screen except the monasteries list (its search takes the toolbar)
        // the page the screen ENDS on (a screen may navigate): a list with its search in the toolbar (two-pane: the list's toolbar)
        const at = new URL(page.url()).pathname.replace(/\/$/, '');
        const isList = at === '/monasteries' || at === '/more/eparchies' || (cfg.viewport.width >= 600 && /^\/(monasteries|more\/eparchies)\//.test(at))
          || (at === '/articles' && await page.locator(SHOWN).getByTestId('articles-search').count() > 0); // A-97: the search took the toolbar
        await expect(page.getByTestId('toolbar-logo').locator('visible=true')).toHaveCount(isList ? 0 : 1);
        // A-25 #6: the back arrow on every screen but «Головна» — one, in the visible header
        await expect(page.getByTestId('back').locator('visible=true')).toHaveCount(at === '/home' ? 0 : 1);
        // D15/D18: the tab's live dot is ONE colour on every screen and theme — the DRAWN pixel, not the CSS value
        if (await page.getByTestId('tab-live').count()) { const px = await dotPixel(page); if (px) expect(px, `${s.name}: live dot pixel`).toEqual([198, 40, 40]); }
        // owner 02.11.2026: the pull-down gesture and the header's «Оновити» go together, and only on the screens that change while open
        const rf = await page.locator('ion-tabs ion-router-outlet > .ion-page:not(.ion-page-hidden)').evaluate((pg) => ({
          puller: pg.querySelectorAll('ion-refresher').length, button: Array.from(pg.querySelectorAll('ion-header [data-testid="refresh"]')).filter((b) => b.getBoundingClientRect().width > 0).length }));
        const changing = at === '/home' || at === '/streams' || (at === '/articles' && (cfg.viewport.width >= 600 || !new URL(page.url()).searchParams.has('id')));
        expect(rf, 'refresh: gesture + header button together, only where content changes').toEqual(changing ? { puller: 1, button: 1 } : { puller: 0, button: 0 });
        // D47: whatever is drawn over a map (scope chip, banners, the house card) is THE `.over-map` surface: opaque, with its shadow
        const seeThrough = await page.locator('.map-pane').evaluateAll((panes) => panes.flatMap((pane) => Array.from(pane.children)
          .filter((c) => !c.classList.contains('map-canvas') && c.getBoundingClientRect().width > 0).flatMap((c) => {
            const sf = c.classList.contains('over-map') ? c : c.querySelector('.over-map');
            if (!sf) return [`${c.className}: not .over-map`];
            const cs = getComputedStyle(sf); const m = cs.backgroundColor.match(/rgba\([^)]*,\s*([\d.]+)\)/);
            return (m && parseFloat(m[1]) < 1) || cs.boxShadow === 'none' ? [`${c.className}: ${cs.backgroundColor} / ${cs.boxShadow}`] : [];
          })));
        expect(seeThrough, 'see-through surfaces over the map').toEqual([]);
        // D38: a meta group («★ 5 (4)», «Насельників: 1429») never breaks inside — on every screen; the one exception: a group wider than
        // the WHOLE line (200 % font in the tablet's list pane) wraps inside itself rather than run off the row (it then fills its line)
        const broken = await page.locator('.meta__g').evaluateAll((es) => es.filter((e) => {
          const r = document.createRange(); r.selectNodeContents(e); return new Set(Array.from(r.getClientRects()).map((b) => Math.round(b.top))).size > 1
            && e.getBoundingClientRect().width < (e.parentElement as HTMLElement).clientWidth - 1; })
          .map((e) => e.textContent));
        expect(broken, 'meta groups broken inside').toEqual([]);
        // D40: the shot at REST — no hover under the last click's pointer, no focus ring / pressed state left by a click
        await page.mouse.move(0, 0);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
        await page.waitForTimeout(150);
        await expect(page.locator('.ion-activated, .ion-focused, :focus-visible')).toHaveCount(0);
        await page.screenshot({ path: `${OUT}${s.name}__${profile}.png`, fullPage: false });
        expect(errors, 'no uncaught page errors').toEqual([]);
        // A-88: the accessibility gate (screens/a11y.ts) - the screen as shot, every WCAG 2.1 A / AA rule
        if (A11Y_PROFILES.includes(profile)) {
          const hits = await axeScreen(page, s.name, profile);
          if (process.env.A11Y !== 'report') expect(hits, 'axe WCAG 2.1 A + AA violations (screens/out/a11y/)').toEqual([]);
        }
      });
    }
  });
}
