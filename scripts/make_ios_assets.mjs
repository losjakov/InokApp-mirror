// make_ios_assets.mjs - cloud_36 (B1): the iOS app icon and launch picture from THE brand source (brand.mjs = src/assets/brand/inok.svg,
// A-13 / A-15), as make_icons.mjs makes Android's. AppIcon = ONE 1024 x 1024 opaque square (Xcode 14+ «single size»; iOS draws its own
// rounded mask): the favicon's disc colour + the three domes at 68 % of the side (iOS masks only the corners). Splash = 2732 x 2732,
// white, the favicon itself in the middle (LaunchScreen.storyboard: «Splash», centred, no scaling of the mark).
//   node scripts/make_ios_assets.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { ROOT, bgHex, domes, svg, uri } from './brand.mjs';

const XC = path.join(ROOT, 'ios/App/App/Assets.xcassets');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (file, px, html) => {
    await p.setViewportSize({ width: px, height: px });
    await p.setContent(`<body style="margin:0">${html}</body>`);
    await p.waitForTimeout(50);
    await p.screenshot({ path: file, omitBackground: false });
  };
  const art = Math.round(1024 * 0.68), off = Math.round((1024 - art) / 2); // iOS masks only the corners: the domes may take more of the square than Android's safe zone
  await shot(path.join(XC, 'AppIcon.appiconset/AppIcon-512@2x.png'), 1024,
    `<div style="width:1024px;height:1024px;background:${bgHex};position:relative"><img src="${uri(domes)}" style="position:absolute;left:${off}px;top:${off}px;width:${art}px;height:${art}px"></div>`);
  const mark = 512, at = (2732 - mark) / 2;
  for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
    await shot(path.join(XC, 'Splash.imageset', n), 2732,
      `<div style="width:2732px;height:2732px;background:#fff;position:relative"><img src="${uri(svg)}" style="position:absolute;left:${at}px;top:${at}px;width:${mark}px;height:${mark}px"></div>`);
  await b.close();
  console.log('iOS icon (1024, opaque, background', bgHex + ') and launch picture (2732, white)');
})();
