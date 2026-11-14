// make_store_assets.mjs - Google Play's hi-res icon (512x512, 32-bit PNG, full square: Play applies its own mask and shadow) and the
// feature graphic (1024x500, per listing language: the app's name from src/i18n/<lang>.json) from the ONE brand source (brand.mjs).
// The icon = the launcher's adaptive icon (the disc colour + the domes at 54/108 of the side), written as a 32-bit PNG WITH alpha, fully
// opaque (Google asks 32-bit; CD S282 measured the old one 24-bit). The feature graphic (A-68): a WHITE ring concentric with the logo's
// green disc, radius = the disc's + 6 px, BEHIND the logo (the domes lie over it); «inok.info» in the domes' gold #ffd340, opaque;
// 24-bit PNG without alpha (Play refuses alpha there). Output: store/graphics/.
//   node scripts/make_store_assets.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { ROOT, bgHex, disc, domes, svg, uri } from './brand.mjs';

const OUT = path.join(ROOT, 'store/graphics');
fs.mkdirSync(OUT, { recursive: true });
const TOOLBAR = '#0c6486'; // the app's toolbar (src/theme/variables.css --inok-toolbar-bg)
const GOLD = '#ffd340'; // A-68 b3: the domes' gold (contrast on the toolbar blue ~4.6:1)
const LOGO = 220, RING = 6; // the logo's side and the white ring beyond the disc, px at 1024 x 500
const b = await chromium.launch();
const p = await b.newPage();
/** A PNG of colour type 6 (8-bit RGBA = «32-bit»), filter 0 on every row. */
function pngRGBA(w, h, px) {
  const chunk = (type, data) => { const t = Buffer.from(type, 'ascii'); const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc(h * (1 + 4 * w));
  for (let y = 0; y < h; y++) px.copy(raw, y * (1 + 4 * w) + 1, y * 4 * w, (y + 1) * 4 * w);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// a page shot = a 24-bit RGB PNG (the feature graphic: Play refuses alpha there)
const shot = async (file, w, h, html) => {
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(`<body style="margin:0;font-family:Roboto,'Segoe UI',system-ui,sans-serif">${html}</body>`);
  await p.waitForTimeout(80);
  await p.screenshot({ path: path.join(OUT, file) });
};
const art = Math.round(512 * 54 / 108), off = Math.round((512 - art) / 2);
// the icon: the page shot as before (the picture unchanged), its pixels read back on a canvas and written as a colour-type-6 PNG -
// Chromium's own encoder writes an opaque page as 24-bit RGB, Google asks 32-bit (A-68)
await shot('icon-512.png', 512, 512, `<div style="width:512px;height:512px;background:${bgHex};position:relative">
  <img src="${uri(domes)}" style="position:absolute;left:${off}px;top:${off}px;width:${art}px;height:${art}px"></div>`);
const rgb = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, 'icon-512.png')).toString('base64');
const rgba = await p.evaluate(async (src) => {
  const im = new Image(); im.src = src; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  return Array.from(g.getImageData(0, 0, c.width, c.height).data);
}, rgb);
fs.writeFileSync(path.join(OUT, 'icon-512.png'), pngRGBA(512, 512, Buffer.from(rgba)));
const k = LOGO / disc.side, ringR = disc.r * k + RING; // the disc's radius in px at this size + 6 px
for (const lang of ['uk', 'ru', 'en']) {
  const name = JSON.parse(fs.readFileSync(path.join(ROOT, `src/i18n/${lang}.json`), 'utf8'))['app.name'];
  await shot(`feature-${lang}.png`, 1024, 500, `<div style="width:1024px;height:500px;background:${TOOLBAR};display:flex;align-items:center;gap:48px;padding:0 72px;box-sizing:border-box">
    <div style="position:relative;width:${LOGO}px;height:${LOGO}px;flex:none">
      <div style="position:absolute;left:${disc.cx * k - ringR}px;top:${disc.cy * k - ringR}px;width:${2 * ringR}px;height:${2 * ringR}px;border-radius:50%;background:#fff"></div>
      <img src="${uri(svg)}" style="position:absolute;left:0;top:0;width:${LOGO}px;height:${LOGO}px"></div>
    <div style="color:#fff;font-size:60px;font-weight:600;line-height:1.15">${name}<div style="font-size:30px;font-weight:400;color:${GOLD};margin-top:18px">inok.info</div></div></div>`);
}
await b.close();
console.log('store graphics:', fs.readdirSync(OUT).join(' '));
