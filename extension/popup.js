import { getApiKey, setApiKey, getModes } from './lib/storage.js';

const $ = (id) => document.getElementById(id);
const views = ['viewKey', 'viewEmpty', 'viewMain'];
const show = (name) => views.forEach((v) => ($(v).hidden = v !== name));

let tabId = null;
let target = null;      // {id, author, text, preview}
let modes = [];
let selectedMode = null;
let lastParams = null;  // for regenerate

async function resolveTab() {
  const q = new URLSearchParams(location.search).get('tabId');
  if (q) {
    try { return await chrome.tabs.get(Number(q)); } catch { return null; }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function empty(title, text) {
  $('emptyTitle').textContent = title;
  $('emptyText').textContent = text;
  show('viewEmpty');
}

async function init() {
  if (!(await getApiKey())) { show('viewKey'); $('keyInput').focus(); return; }

  const tab = await resolveTab();
  if (!tab || !/^https:\/\/www\.linkedin\.com\//.test(tab.url || '')) {
    return empty('Open a LinkedIn post', 'Chime In works on linkedin.com. Open a post, click into its comment box, then come back here.');
  }
  tabId = tab.id;
  let res;
  try { res = await chrome.tabs.sendMessage(tabId, { type: 'chimein:getTarget' }); }
  catch { return empty('Reload this LinkedIn tab', 'Chime In was installed after this page loaded. Refresh the tab and try again.'); }
  if (!res || !res.found) {
    return empty('No post found', 'Scroll so a post is in view, or click into its comment box, then reopen Chime In.');
  }
  target = res;
  $('postAuthor').textContent = res.author || 'Unknown author';
  $('postText').textContent = res.preview || '(No text found in this post)';

  modes = (await getModes()).filter((m) => !m.hidden);
  renderModes();
  show('viewMain');

  const { lastRun } = await chrome.storage.local.get('lastRun');
  if (lastRun && lastRun.tabId === tabId && lastRun.postId === target.id && Date.now() - lastRun.ts < 15 * 60e3) {
    lastParams = { modeId: lastRun.modeId, input: lastRun.input };
    renderRun(lastRun);
  }
}

function renderModes() {
  const box = $('modes');
  box.textContent = '';
  for (const m of modes) {
    const b = document.createElement('button');
    b.className = 'mode';
    b.dataset.mode = m.id;
    b.dataset.name = m.name;
    b.innerHTML = '<span class="mode-icon"></span><span><span class="mode-name"></span><span class="mode-desc"></span></span>';
    b.querySelector('.mode-icon').textContent = m.icon || m.name.slice(0, 1).toUpperCase();
    b.querySelector('.mode-name').textContent = m.name;
    b.querySelector('.mode-desc').textContent = m.desc || (m.needsInput ? 'Uses what you type.' : '');
    b.addEventListener('click', () => onMode(m));
    box.appendChild(b);
  }
}

function onMode(m) {
  if (m.needsInput) {
    selectedMode = m;
    document.querySelectorAll('.mode').forEach((el) => el.classList.toggle('active', el.dataset.mode === m.id));
    $('inputBox').hidden = false;
    $('draft').focus();
    return;
  }
  selectedMode = null;
  $('inputBox').hidden = true;
  document.querySelectorAll('.mode').forEach((el) => el.classList.remove('active'));
  start({ modeId: m.id, input: '' });
}

function start(params) {
  lastParams = params;
  renderRun({ status: 'loading' });
  chrome.runtime.sendMessage({ type: 'chimein:run', tabId, post: target, ...params });
}

$('go').addEventListener('click', () => {
  const input = $('draft').value.trim();
  if (!input) { $('draft').focus(); return; }
  start({ modeId: selectedMode.id, input });
});
$('draft').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('go').click();
});

function renderRun(run) {
  const box = $('result'), body = $('resultBody'), st = $('resultStatus');
  box.hidden = false;
  box.classList.toggle('error', run.status === 'error');
  const busy = run.status === 'loading' || run.status === 'generated';
  document.querySelectorAll('.mode, #go').forEach((el) => (el.disabled = busy));
  st.className = 'status';
  $('resultActions').hidden = busy;
  $('copy').hidden = $('again').hidden = run.status === 'error';
  if (run.status === 'loading') {
    $('resultLabel').textContent = 'Writing';
    body.textContent = '';
    st.innerHTML = '<span class="spinner"></span>Generating your comment…';
  } else if (run.status === 'generated') {
    $('resultLabel').textContent = 'Comment';
    body.textContent = run.text;
    st.innerHTML = '<span class="spinner"></span>Adding it to the comment box…';
  } else if (run.status === 'error') {
    $('resultLabel').textContent = 'Something went wrong';
    body.textContent = run.error;
    st.textContent = '';
  } else if (run.status === 'done') {
    $('resultLabel').textContent = 'Comment';
    body.textContent = run.text;
    if (run.inserted) { st.textContent = 'Added to the comment box. Review, then post.'; st.classList.add('ok'); }
    else { st.textContent = run.insertError || 'Could not insert.'; st.classList.add('warn'); }
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.lastRun) return;
  const run = changes.lastRun.newValue;
  if (run && run.tabId === tabId && lastParams) renderRun(run);
});

$('regen').addEventListener('click', () => lastParams && start(lastParams));
$('copy').addEventListener('click', async () => {
  const text = $('resultBody').textContent;
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  const b = $('copy'); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200);
});
$('again').addEventListener('click', async () => {
  $('resultStatus').textContent = 'Inserting…';
  const r = await chrome.runtime.sendMessage({ type: 'chimein:reinsert', tabId });
  const st = $('resultStatus');
  st.className = 'status ' + (r?.ok ? 'ok' : 'warn');
  st.textContent = r?.ok ? 'Added to the comment box. Review, then post.' : (r?.error || 'Could not insert.');
});

$('saveKey').addEventListener('click', async () => {
  const v = $('keyInput').value.trim();
  if (!v) return $('keyInput').focus();
  await setApiKey(v);
  init();
});
$('keyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('saveKey').click(); });
$('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());

init();
