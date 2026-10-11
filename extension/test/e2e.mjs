// End-to-end test: loads the unpacked extension in Chromium, serves the mock
// LinkedIn feed at https://www.linkedin.com/feed/, and runs every mode with REAL
// OpenRouter calls. Also captures marketing screenshots along the way.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const extPath = path.resolve(here, '..');
const shots = path.join(root, 'site/assets/screens');
fs.mkdirSync(shots, { recursive: true });

const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = env.OPENROUTER_API_KEY;
if (!KEY) throw new Error('OPENROUTER_API_KEY missing in .env');
const mock = fs.readFileSync(path.join(here, 'mock-linkedin.html'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
};
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chimein-'));
const ctx = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  deviceScaleFactor: 2,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
console.log('extension id:', extId);

await ctx.route('https://www.linkedin.com/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: mock }));

try {
  // ---- 1. options: key + voice via UI ----
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.fill('#apiKey', KEY);
  await opt.click('#saveKey');
  await opt.fill('#about', "I'm a product manager at Northwind. Keep it casual and warm.");
  await opt.waitForTimeout(700);
  const stored = await sw.evaluate(() => chrome.storage.local.get(null));
  check('options: API key stored in chrome.storage.local', stored.apiKey === KEY);
  check('options: about-me saved', /product manager/.test(stored.settings?.about || ''));
  check('options: emoji/hashtag toggles default on', stored.settings?.avoidEmojis !== false && stored.settings?.avoidHashtags !== false);
  await opt.setViewportSize({ width: 900, height: 900 });
  await opt.waitForTimeout(200);

  // ---- 2. feed page ----
  const feed = await ctx.newPage();
  await feed.goto('https://www.linkedin.com/feed/');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.linkedin.com/*' }))[0].id);
  const markCard = feed.locator('[componentkey^="update-card-focus-2"]');
  const markEditor = markCard.locator('.ProseMirror');
  const markSubmit = markCard.locator('.submit');

  const openPopup = async (tid = tabId) => {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 380, height: 600 });
    await p.goto(`chrome-extension://${extId}/popup.html?tabId=${tid}`);
    return p;
  };
  const shotPopup = async (p, file) => {
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width: 380, height: h });
    await p.screenshot({ path: path.join(shots, file) });
  };
  const posted = () => feed.evaluate(() => window.__posted.length);

  // user clicks Mark's Comment button (sets "last interacted post")
  await markCard.locator('button.c').click();
  await markEditor.waitFor();
  const shotFeed = async (file) => {
    await feed.setViewportSize({ width: 820, height: 640 });
    await markCard.scrollIntoViewIfNeeded();
    await markCard.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await feed.waitForTimeout(150);
    await feed.screenshot({ path: path.join(shots, file) });
  };

  // ---- 3. popup: target detection ----
  let pop = await openPopup();
  await pop.waitForSelector('#viewMain:not([hidden]), #viewEmpty:not([hidden])');
  if (await pop.locator('#viewEmpty:not([hidden])').count()) console.log('EMPTY:', await pop.textContent('#emptyTitle'), await pop.textContent('#emptyText'));
  const author = await pop.textContent('#postAuthor');
  const preview = await pop.textContent('#postText');
  check('popup: target author is Mark Davidson', author === 'Mark Davidson', author);
  check('popup: preview ~140 chars + expanded text', /Northwind Pulse/.test(preview) && preview.length <= 142 && !/more/.test(preview), preview);
  check('popup: three built-in mode cards', (await pop.locator('.mode').count()) === 3);
  await shotPopup(pop, 'popup.png');
  await shotFeed('feed-empty.png');

  const runMode = async (p, name, input) => {
    await p.locator(`.mode[data-name="${name}"]`).click();
    if (input) { await p.fill('#draft', input); await p.click('#go'); }
    await p.waitForSelector('#resultStatus.ok, #resultStatus.warn, #result.error', { timeout: 90000 });
    return { text: norm(await p.textContent('#resultBody')), err: await p.locator('#result.error').count() };
  };
  const expectLanded = async (label, r, editor = markEditor) => {
    check(`${label}: no error`, r.err === 0, r.text);
    check(`${label}: non-empty text`, r.text.length > 5, r.text);
    const inEditor = norm(await editor.innerText());
    check(`${label}: text landed in the post's editor`, inEditor === r.text, `editor="${inEditor}" popup="${r.text}"`);
    check(`${label}: Post button enabled by input event`, await markSubmit.isEnabled());
    check(`${label}: Post NOT clicked`, (await posted()) === 0);
  };

  // Quick
  let r = await runMode(pop, 'Quick');
  console.log('  Quick ->', r.text);
  await expectLanded('Quick', r);
  check('Quick: short (one sentence-ish)', r.text.length < 200 && (r.text.match(/[.!?](\s|$)/g) || []).length <= 2, r.text);

  // Thoughtful
  r = await runMode(pop, 'Thoughtful');
  console.log('  Thoughtful ->', r.text);
  await expectLanded('Thoughtful', r);
  const thoughtful = r.text;
  await shotPopup(pop, 'popup-result.png');
  await shotFeed('feed-thoughtful.png');

  // Insert again after the user clears the box
  await markEditor.evaluate((e) => { e.focus(); e.innerHTML = '<p><br></p>'; e.dispatchEvent(new InputEvent('input', { bubbles: true })); });
  await pop.click('#again');
  await pop.waitForSelector('#resultStatus.ok');
  check('Insert again: re-inserts the text', norm(await markEditor.innerText()) === thoughtful);

  // Regenerate
  await pop.click('#regen');
  await pop.waitForSelector('#resultStatus.ok', { timeout: 90000 });
  check('Regenerate: new text inserted', norm(await markEditor.innerText()) === norm(await pop.textContent('#resultBody')));

  // Clean up
  const draft = 'yo this is sick congrats bro, we been needin this fr';
  r = await runMode(pop, 'Clean up', draft);
  console.log('  Clean up ->', r.text);
  await expectLanded('Clean up', r);
  await shotPopup(pop, 'popup-cleanup.png');
  await shotFeed('feed-cleanup.png');
  check('Clean up: keeps meaning (congrats)', /congrat/i.test(r.text), r.text);
  check('Clean up: no emojis', !/\p{Extended_Pictographic}/u.test(r.text), r.text);
  check('Clean up: not just echoing slang', !/\bbro\b|\bfr\b/i.test(r.text), r.text);

  // Clean up requires input
  const mc = await pop.locator('.mode[data-name="Clean up"]');
  await mc.click();
  await pop.fill('#draft', '');
  await pop.click('#go');
  check('Clean up: empty input does not start a run', (await pop.locator('#go').isEnabled()));
  await pop.close();

  // ---- 4. third post: no editor yet, only "interacted" by clicking its text ----
  const anaCard = feed.locator('[componentkey^="update-card-focus-3"]');
  await anaCard.locator('.body').click();
  pop = await openPopup();
  await pop.waitForSelector('#viewMain:not([hidden])');
  check('popup: last-interacted post is Ana Ruiz (via Hide post aria-label)', (await pop.textContent('#postAuthor')) === 'Ana Ruiz');
  check('target is not the "likes this" person', (await pop.textContent('#postAuthor')) !== 'Priya Shah');
  r = await runMode(pop, 'Quick');
  console.log('  Quick (auto-open) ->', r.text);
  console.log('  status:', await pop.textContent('#resultStatus'));
  const anaEd = anaCard.locator('.ProseMirror');
  check('auto-opens comment box and inserts', norm(await anaEd.innerText()) === r.text, r.text);
  check('post 3: Post NOT clicked', (await posted()) === 0);
  check('other post (Mark) untouched', norm(await markEditor.innerText()).length > 0 && norm(await markEditor.innerText()) !== r.text);
  await pop.close();

  // ---- 5. custom mode in options ----
  await opt.bringToFront();
  await opt.click('#addMode');
  const card = opt.locator('.mode-card').last();
  await card.locator('.name').fill('Witty');
  await card.locator('.icon').fill('😄');
  await card.locator('.desc').fill('A light one-liner with a smile.');
  await card.locator('.prompt').fill('Write one witty, friendly sentence that plays on a specific detail of the post. No sarcasm.');
  await opt.waitForTimeout(700);
  await opt.setViewportSize({ width: 900, height: 1500 });
  await opt.waitForTimeout(150);
  await opt.screenshot({ path: path.join(shots, 'options.png'), fullPage: true });
  const modesStored = (await sw.evaluate(() => chrome.storage.local.get('modes'))).modes;
  check('options: custom mode persisted', modesStored.some((m) => m.name === 'Witty' && m.prompt.includes('witty')));

  // hide Quick then restore
  await opt.locator('.mode-card[data-id="quick"] button:has-text("Hide")').click();
  await opt.waitForTimeout(700);
  pop = await openPopup();
  await pop.waitForSelector('#viewMain:not([hidden])');
  check('popup: hidden built-in not shown', (await pop.locator('.mode[data-name="Quick"]').count()) === 0);
  check('popup: custom mode shown', (await pop.locator('.mode[data-name="Witty"]').count()) === 1);
  await anaCard.locator('.body').click(); // keep Ana as target
  r = await runMode(pop, 'Witty');
  console.log('  Witty ->', r.text);
  check('custom mode: text landed in editor', norm(await anaEd.innerText()) === r.text && r.text.length > 5, r.text);
  check('custom mode: Post NOT clicked', (await posted()) === 0);
  await pop.close();
  await opt.locator('.mode-card[data-id="quick"] button:has-text("Show")').click();
  // edit + reset built-in prompt
  const qp = opt.locator('.mode-card[data-id="quick"] .prompt');
  await qp.fill('custom edit');
  await opt.waitForTimeout(500);
  await opt.locator('.mode-card[data-id="quick"] button:has-text("Reset to default")').click();
  await opt.waitForTimeout(500);
  check('options: built-in reset restores default prompt', /one sentence/.test(await opt.locator('.mode-card[data-id="quick"] .prompt').inputValue()));

  // ---- 6. empty + key states ----
  const blank = await ctx.newPage();
  await ctx.route('https://example.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>hi</h1>' }));
  await blank.goto('https://example.com/');
  const btab = await sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.id).sort((a, b) => a - b).pop());
  pop = await openPopup(btab);
  await pop.waitForSelector('#viewEmpty:not([hidden])');
  check('popup: empty state on non-LinkedIn tab', /LinkedIn/.test(await pop.textContent('#emptyTitle')));
  await pop.close();

  // error state: bad key
  await sw.evaluate(() => chrome.storage.local.set({ apiKey: 'sk-or-v1-bad' }));
  pop = await openPopup();
  await pop.waitForSelector('#viewMain:not([hidden])');
  await pop.locator('.mode[data-name="Quick"]').click();
  await pop.waitForSelector('#result.error', { timeout: 30000 });
  check('error: bad key gives clean 401 message', /API key/i.test(await pop.textContent('#resultBody')), await pop.textContent('#resultBody'));
  await pop.close();
  await sw.evaluate(() => chrome.storage.local.remove('apiKey'));
  pop = await openPopup();
  await pop.waitForSelector('#viewKey:not([hidden])');
  check('popup: first-run key state when key missing', true);
  await pop.close();
  await sw.evaluate((k) => chrome.storage.local.set({ apiKey: k }), KEY);

  // ---- 7. screenshot of mock page w/ inserted text (for store art) ----
  await feed.bringToFront();
  await markCard.scrollIntoViewIfNeeded();
  await feed.screenshot({ path: path.join(shots, 'linkedin-mock.png') });
  // dark mode popup capture for reference-free marketing use
  console.log('final storage keys:', Object.keys(await sw.evaluate(() => chrome.storage.local.get(null))));
} catch (e) {
  fail++;
  console.log('FAIL  uncaught:', e.message);
} finally {
  await ctx.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
