import { chromium } from 'playwright';
import fs from 'node:fs';
const svg = fs.readFileSync(new URL('./logo.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const s of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body>`);
  await page.screenshot({ path: new URL(`../extension/icons/icon${s}.png`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
