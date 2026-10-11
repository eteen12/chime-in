// Composes Chrome Web Store assets from the real screenshots captured by the e2e test.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'site/assets/screens', f)).toString('base64');
const logo = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'scripts/logo.svg')).toString('base64');
const out = path.join(root, 'store');
fs.mkdirSync(out, { recursive: true });

const base = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0E0F13;background:#FAF9F6;overflow:hidden}
.bg{position:absolute;inset:0;background:radial-gradient(900px 500px at 85% -10%,rgba(127,184,255,.45),transparent 60%),radial-gradient(700px 500px at 0% 110%,rgba(47,107,255,.14),transparent 60%),#FAF9F6}
.cap{position:absolute;left:80px;top:50%;transform:translateY(-50%);width:520px}
.cap .k{font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#2F6BFF}
.cap h1{font-size:54px;line-height:1.05;letter-spacing:-.03em;margin:14px 0 16px}
.cap p{font-size:20px;line-height:1.45;color:#6B6F7B;margin:0}
.shot{position:absolute;border-radius:18px;box-shadow:0 30px 80px rgba(14,15,19,.22),0 0 0 1px rgba(0,0,0,.07)}
`;
const win = (img) => `<div class="win"><div class="bar"><i></i><i></i><i></i><span>linkedin.com/feed</span></div><img src="${S(img)}"></div>`;
const scene = (kicker, title, feedImg, popImg) => `<div class="bg"></div>
  <div class="head"><div class="k">${kicker}</div><h1>${title}</h1></div>
  <div class="row">${feedImg ? win(feedImg) : ''}<img class="shot pop" src="${S(popImg)}"></div>`;
const css = base + `
.head{position:absolute;top:34px;left:0;right:0;text-align:center}
.head .k{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#2F6BFF}
.head h1{margin:6px 0 0;font-size:40px;letter-spacing:-.03em}
.row{position:absolute;top:128px;left:0;right:0;bottom:36px;display:flex;justify-content:center;align-items:flex-start;gap:36px}
.win{width:700px;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 30px 70px rgba(14,15,19,.2),0 0 0 1px rgba(0,0,0,.08)}
.bar{height:34px;background:#ECEBE7;display:flex;align-items:center;gap:7px;padding:0 14px}
.bar i{width:10px;height:10px;border-radius:50%;background:#C9C8C3}
.bar span{margin-left:12px;background:#fff;border-radius:6px;padding:2px 90px 2px 10px;font-size:12px;color:#6B6F7B}
.win img{display:block;width:100%;height:auto}
.pop{position:static;height:636px;width:auto}
`;
const pages = [
  { file: 'screenshot-1.png', html: scene('Thoughtful mode', 'A real comment, dropped into the box', 'feed-thoughtful.png', 'popup-result.png') },
  { file: 'screenshot-2.png', html: scene('Clean up mode', 'Type it casual. Get it polished.', 'feed-cleanup.png', 'popup-cleanup.png') },
  { file: 'screenshot-3.png', html: scene('Pick a style', 'One click, right on the post', 'feed-empty.png', 'popup.png') },
  { file: 'screenshot-4.png', html: `<div class="bg"></div><div class="head"><div class="k">Settings</div><h1>Your prompts, your modes</h1></div>
    <div class="row"><div class="win" style="width:940px"><div class="bar"><i></i><i></i><i></i><span>Chime In settings</span></div>
    <div style="height:600px;overflow:hidden;background:#FAF9F6;position:relative"><img src="${S('options.png')}" style="width:760px;margin:-640px 90px 0"><div style="position:absolute;left:0;right:0;bottom:0;height:120px;background:linear-gradient(transparent,#FAF9F6)"></div></div></div></div>` },
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
for (const p of pages) {
  await page.setContent(`<style>${css}</style>${p.html}`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, p.file) });
}
// promo tile 440x280
await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<style>${base}.t{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px}
.t img{width:84px;height:84px;filter:drop-shadow(0 10px 18px rgba(47,107,255,.35))}.t h1{margin:4px 0 0;font-size:40px;letter-spacing:-.03em}.t p{margin:0;color:#6B6F7B;font-size:16px}</style>
<div class="bg"></div><div class="t"><img src="${logo}"><h1>Chime In</h1><p>LinkedIn comments in one click</p></div>`);
await page.screenshot({ path: path.join(out, 'promo-small-440x280.png') });
fs.copyFileSync(path.join(root, 'extension/icons/icon128.png'), path.join(out, 'icon128.png'));
await browser.close();
