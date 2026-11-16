// store_checks.mjs - THE read-backs of a store frame (A-74 (1): the emulator run and the browser ring make the SAME assertions; A-15 one source).
// Each is a JS expression evaluated in the app's page: by scripts/emu_nav.mjs `check <name>` on the emulator (DevTools socket) and by
// screens/store.spec.ts in the browser ring. Values are plain strings, so a shell compares them.
export const CHECKS = {
  /** the app's language = `<html lang>` */
  lang: 'document.documentElement.lang',
  /** the app's theme = Ionic's palette class */
  theme: "document.documentElement.classList.contains('ion-palette-dark') ? 'dark' : 'light'",
  /** A-68: no dialog / sheet SHOWN over the screen; Ionic keeps closed overlays in the DOM with `overlay-hidden` */
  dialog: "Array.from(document.querySelectorAll('ion-alert, ion-modal, ion-action-sheet, ion-popover')).some((e) => !e.classList.contains('overlay-hidden') && e.getClientRects().length > 0) ? 'dialog' : 'clear'",
  /** A-75 (1): the export's unit words on the page on top follow the app's language - uk / ru never «region / diocese / y. b.», en never «єпарх / епарх»:
   *  'ok' | 'none' (nothing to read) | 'WRONG <lang>: <the line>' */
  units: `(() => {
    const l = document.documentElement.lang;
    const shown = Array.from(document.querySelectorAll('.card__sub, [data-testid^="mrow-"], [data-testid="eparchy-title"], [data-testid="channels"]')).filter((e) => {
      const pg = e.closest('.ion-page'); return e.getClientRects().length > 0 && (!pg || !pg.classList.contains('ion-page-hidden')); });
    if (!shown.length) return 'none';
    const bad = l === 'en' ? /єпарх|епарх|област|р\\. н\\.|г\\. р\\./i : /\\b(region|diocese|y\\. b\\.)/i;
    const hit = shown.map((e) => e.innerText.replace(/\\s+/g, ' ')).find((x) => bad.test(x));
    return hit ? 'WRONG ' + l + ': ' + hit.slice(0, 120) : 'ok';
  })()`,
  /** A-78 4: the eye of the card on top in THE token (icon AND number; the store set is light: #8a6a12, dark #c4a24e) - 'ok' | 'none' | 'WRONG …' */
  eye: `(() => {
    const e = Array.from(document.querySelectorAll('[data-testid="views"]')).find((x) => x.getClientRects().length > 0 && !x.closest('.ion-page-hidden'));
    if (!e) return 'none';
    const want = document.documentElement.classList.contains('ion-palette-dark') ? 'rgb(196, 162, 78)' : 'rgb(138, 106, 18)';
    const got = [e.querySelector('span'), e.querySelector('ion-icon')].map((x) => getComputedStyle(x).color);
    return got.every((g) => g === want) ? 'ok' : 'WRONG ' + got.join(' / ');
  })()`,
  /** A-78 4: the rating stars of the article on top in THE token (light #b37d00, dark #f2a900) - 'ok' | 'none' | 'WRONG …' */
  stars: `(() => {
    const es = Array.from(document.querySelectorAll('[data-testid="rating"] [data-testid^="star-"] ion-icon')).filter((x) => x.getClientRects().length > 0 && !x.closest('.ion-page-hidden'));
    if (es.length !== 5) return 'none';
    const want = document.documentElement.classList.contains('ion-palette-dark') ? 'rgb(242, 169, 0)' : 'rgb(179, 125, 0)';
    const got = es.map((x) => getComputedStyle(x).color);
    return got.every((g) => g === want) ? 'ok' : 'WRONG ' + got[0];
  })()`,
  /** A-79 5 (F2): tablet frame 06 - the article beside the list shows its TOP: its title whole, below the toolbar - 'ok' | 'none' | 'CUT …' */
  articleTop: `(() => {
    const pg = Array.from(document.querySelectorAll('ion-tabs ion-router-outlet > .ion-page')).filter((p) => !p.classList.contains('ion-page-hidden')).pop();
    const t = pg?.querySelector('[data-testid="article"] .card__title'); if (!t) return 'none';
    const h = pg.querySelector('ion-header')?.getBoundingClientRect().bottom ?? 0; const r = t.getBoundingClientRect();
    return r.top >= h - 1 && r.bottom <= innerHeight ? 'ok' : 'CUT title ' + Math.round(r.top) + ' / toolbar ' + Math.round(h);
  })()`,
  /** A-78 4: phone frame 03 - each of the three lavra pins drawn WHOLE inside the map and clear of what is drawn over it - 'ok' | 'none' | 'CUT …' */
  lavras: `(() => {
    const m = window.__inokMap; if (!m) return 'none';
    const c = m.getContainer().getBoundingClientRect();
    const over = Array.from(m.getContainer().closest('.map-pane')?.children ?? []).filter((e) => !e.classList.contains('map-canvas') && e.getClientRects().length > 0)
      .concat(Array.from(m.getContainer().querySelectorAll('.maplibregl-ctrl'))).map((e) => e.getBoundingClientRect());
    const pins = (m.getSource('lavras')?.serialize().data?.features ?? []).map((f) => {
      const q = m.project(f.geometry.coordinates); const im = m.getImage(f.properties.icon);
      const w = im.data.width / im.pixelRatio, h = im.data.height / im.pixelRatio;
      return { code: f.properties.code, l: c.left + q.x - w / 2, r: c.left + q.x + w / 2, t: c.top + q.y - h, b: c.top + q.y };
    });
    if (pins.length !== 3) return 'none ' + pins.length;
    const cut = pins.filter((p) => p.l < c.left || p.r > c.right || p.t < c.top || p.b > c.bottom
      || over.some((o) => p.l < o.right && p.r > o.left && p.t < o.bottom && p.b > o.top));
    return cut.length ? 'CUT ' + cut.map((p) => p.code).join(',') : 'ok';
  })()`,
  /** A-122 (B3): nothing over the frame - no dialog / sheet, no toast, no update banner, no offline note - 'clear' | the names of what is shown */
  overlays: `(() => {
    const vis = (e) => e.getClientRects().length > 0 && !e.classList.contains('overlay-hidden') && !e.closest('.ion-page-hidden');
    const hit = [];
    if (Array.from(document.querySelectorAll('ion-alert, ion-modal, ion-action-sheet, ion-popover')).some(vis)) hit.push('dialog');
    if (Array.from(document.querySelectorAll('ion-toast')).some(vis)) hit.push('toast');
    for (const id of ['update-offer', 'update-restart', 'map-offline', 'soft-ask']) if (Array.from(document.querySelectorAll('[data-testid="' + id + '"]')).some(vis)) hit.push(id);
    return hit.length ? hit.join(',') : 'clear';
  })()`,
  /** A-122 (B3): every picture slot IN VIEW of the page on top is a loaded picture (or the house's own «no picture» mark) - never «Фото
   *  завантажиться…», never an empty slot still loading - 'ok' | 'WAIT n; EMPTY n; IMG n' */
  photos: `(() => {
    const pg = Array.from(document.querySelectorAll('ion-tabs ion-router-outlet > .ion-page')).filter((p) => !p.classList.contains('ion-page-hidden'));
    // in view = inside its own scrolling content's box (a row under the tab bar or the header is not in the frame)
    const inView = (e) => { const r = e.getBoundingClientRect(); const c = (e.closest('ion-content') || document.documentElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > Math.max(0, c.top) && r.top < Math.min(innerHeight, c.bottom) && r.right > 0 && r.left < innerWidth; };
    const slots = pg.flatMap((p) => Array.from(p.querySelectorAll('.aview__cover, .card__cover, .chav__img, .eparchy__map, .mrow__cover, .body-pic'))).filter(inView);
    let wait = 0, empty = 0, img = 0; const which = [];
    const who = (s) => which.push((s.closest('[data-testid]')?.dataset.testid || s.className).slice(0, 24));
    for (const s of slots) { // CoverImage's own word (data-photo): none = the item has no picture at all (its plain tile) - never a fault
      const st = s.dataset.photo;
      if (st === 'none') continue;
      if (st === 'wait' || s.querySelector('[data-testid="photo-wait"]')) { wait++; who(s); continue; }
      const im = s.querySelector('img');
      if (im) { if (!im.complete || !im.naturalWidth) { img++; who(s); } continue; }
      if (st === 'loading' || !s.children.length) { empty++; who(s); }
    }
    return wait + empty + img ? 'WAIT ' + wait + '; EMPTY ' + empty + '; IMG ' + img + ' (' + which.slice(0, 3).join(', ') + ')' : 'ok';
  })()`,
  /** A-122 (B3): card 242's «Фотогалерея» opens the app's own viewer (no «opens outside» sign) - 'in-app' | 'site' | 'none' */
  gallery: `(() => {
    const g = Array.from(document.querySelectorAll('[data-testid="card"] [data-testid="gallery"]')).find((e) => e.getClientRects().length > 0 && !e.closest('.ion-page-hidden'));
    return !g ? 'none' : g.dataset.inApp === '1' && g.querySelectorAll('ion-icon').length === 1 ? 'in-app' : 'site';
  })()`,
  /** A-117 (2) / A-122: the kind tab of «Публікації» that is active on the page on top - 'publication' | 'all' | … | 'none' */
  kind: `(() => {
    const t = Array.from(document.querySelectorAll('[data-testid^="kind-tab-"].segment-button-checked')).find((e) => e.getClientRects().length > 0 && !e.closest('.ion-page-hidden'));
    return t ? t.dataset.testid.slice(9) : 'none';
  })()`,
  /** A-122 (B3): «Зараз в ефірі» as it is at the minute of the frame - the number of broadcasts on «Головна» ('0' when none) */
  live: `(() => {
    const h = Array.from(document.querySelectorAll('[data-testid="home-live"]')).find((e) => e.getClientRects().length > 0 && !e.closest('.ion-page-hidden'));
    const m = h && h.textContent.match(/\((\d+)\)/); return h ? (m ? m[1] : '0') : 'none';
  })()`,
};

/** A-78 4: what a store frame DOES before its shot (scripts/emu_nav.mjs `do <name>`; the browser ring runs the same) - 'ok' | 'none' */
export const ACTIONS = {
  /** phone frame 03: the map fitted to the three lavras' bounds, the padding = a lavra pin's drawn size + 24 dp air + whatever sits over that edge */
  fitLavras: `(() => {
    const m = window.__inokMap; const fs = m?.getSource('lavras')?.serialize().data?.features ?? [];
    if (fs.length < 2) return 'none';
    const c = m.getContainer().getBoundingClientRect(); const im = m.getImage(fs[0].properties.icon);
    const w = im.data.width / im.pixelRatio, h = im.data.height / im.pixelRatio;
    const pad = { top: h + 24, bottom: 24, left: w / 2 + 24, right: w / 2 + 24 };
    Array.from(m.getContainer().closest('.map-pane')?.children ?? []).filter((e) => !e.classList.contains('map-canvas') && e.getClientRects().length > 0)
      .concat(Array.from(m.getContainer().querySelectorAll('.maplibregl-ctrl'))).forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width < c.width * 0.3) { if (r.left + r.width / 2 > c.left + c.width / 2) pad.right = Math.max(pad.right, c.right - r.left + w / 2 + 8); else pad.left = Math.max(pad.left, r.right - c.left + w / 2 + 8); }
        else if (r.top + r.height / 2 < c.top + c.height / 2) pad.top = Math.max(pad.top, r.bottom - c.top + h + 8);
        else pad.bottom = Math.max(pad.bottom, c.bottom - r.top + 8);
      });
    const xs = fs.map((f) => f.geometry.coordinates[0]), ys = fs.map((f) => f.geometry.coordinates[1]);
    m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: pad, duration: 0 });
    return 'ok';
  })()`,
  /** tablet frame 06: the selected article's row of the list in view (its centre), «Показати більше» until it is there (at most 15 pages) */
  showSelected: `(async () => {
    const id = new URLSearchParams(location.search).get('id'); if (!id) return 'none';
    const pages = () => Array.from(document.querySelectorAll('ion-tabs ion-router-outlet > .ion-page')).filter((p) => !p.classList.contains('ion-page-hidden'));
    const inView = (e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; };
    for (let i = 0; i < 40; i++) { // a page transition may still show two pages: every shown copy of the row is scrolled, the answer is read back
      const rows = pages().map((p) => p.querySelector('[data-testid="arow-' + id + '"]')).filter(Boolean);
      rows.forEach((r) => r.scrollIntoView({ block: 'center' }));
      await new Promise((ok) => setTimeout(ok, 600));
      if (rows.length && pages().every((p) => { const r = p.querySelector('[data-testid="arow-' + id + '"]'); return r && inView(r); })) return 'ok';
      const more = pages().pop()?.querySelector('[data-testid="articles-more"]');
      if (!rows.length && more && !more.disabled && i % 3 === 0) { more.scrollIntoView({ block: 'end' }); more.click(); }
      await new Promise((ok) => setTimeout(ok, 400));
    }
    return 'none';
  })()`,
};
