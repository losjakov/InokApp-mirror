// make_icons.mjs - the Android launcher icons from ONE source, src/assets/brand/inok.svg (= https://inok.info/favicon.svg,
// unchanged; owner A-13). Adaptive icon (API 26+): background = the favicon's green disc colour, foreground = the three domes
// inside the 66 dp safe zone of the 108 dp canvas, monochrome = the same domes as a silhouette (Android 13 themed icons);
// legacy ic_launcher / ic_launcher_round (API < 26) = the favicon itself. Rendered by the pre-installed Chromium.
//   node scripts/make_icons.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

import { ROOT, bgHex, domes, svg, uri } from './brand.mjs';
const RES = path.join(ROOT, 'android/app/src/main/res');
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (file, px, html) => {
    await p.setViewportSize({ width: px, height: px });
    await p.setContent(`<body style="margin:0;background:transparent">${html}</body>`);
    await p.waitForTimeout(50);
    await p.screenshot({ path: file, omitBackground: true });
  };
  for (const [d, k] of Object.entries(DENS)) {
    const dir = path.join(RES, `mipmap-${d}`);
    const fg = 108 * k, art = Math.round(54 * k), off = Math.round((fg - art) / 2); // 54 of 108 dp: the side domes stay whole inside the round mask (72 dp visible, 66 dp safe zone)
    const img = (s, f = '') => `<img src="${uri(s)}" style="position:absolute;left:${off}px;top:${off}px;width:${art}px;height:${art}px;${f}">`;
    await shot(path.join(dir, 'ic_launcher_foreground.png'), fg, img(domes));
    await shot(path.join(dir, 'ic_launcher_monochrome.png'), fg, img(domes, 'filter:brightness(0)'));
    for (const n of ['ic_launcher', 'ic_launcher_round'])
      await shot(path.join(dir, `${n}.png`), 48 * k, `<img src="${uri(svg)}" style="width:${48 * k}px;height:${48 * k}px">`);
  }
  await b.close();
  fs.writeFileSync(path.join(RES, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bgHex}</color>\n</resources>\n`);
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  for (const n of ['ic_launcher', 'ic_launcher_round']) fs.writeFileSync(path.join(RES, `mipmap-anydpi-v26/${n}.xml`), adaptive);
  console.log('launcher icons: background', bgHex, 'densities', Object.keys(DENS).join(' '));
})();
