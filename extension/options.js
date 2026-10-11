import { getApiKey, setApiKey, getSettings, saveSettings, getModes, saveModes, resetBuiltin } from './lib/storage.js';
import { DEFAULT_MODEL, newCustomMode } from './lib/defaults.js';

const $ = (id) => document.getElementById(id);
let modes = [];
let settings = {};
let savedTimer;

function flashSaved(msg = 'Saved') {
  const el = $('saved');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove('on'), 1400);
}
const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---- key ----
$('toggleKey').addEventListener('click', () => {
  const k = $('apiKey');
  k.type = k.type === 'password' ? 'text' : 'password';
  $('toggleKey').textContent = k.type === 'password' ? 'Show' : 'Hide';
});
$('saveKey').addEventListener('click', async () => {
  await setApiKey($('apiKey').value);
  flashSaved('Key saved');
});

// ---- settings ----
const persistSettings = debounce(async () => {
  settings = {
    ...settings,
    model: $('model').value.trim() || DEFAULT_MODEL,
    about: $('about').value,
    avoidEmojis: $('avoidEmojis').checked,
    avoidHashtags: $('avoidHashtags').checked,
  };
  await saveSettings(settings);
  flashSaved();
}, 300);
['model', 'about'].forEach((id) => $(id).addEventListener('input', persistSettings));
['avoidEmojis', 'avoidHashtags'].forEach((id) => $(id).addEventListener('change', persistSettings));

// ---- modes ----
const persistModes = debounce(async () => { await saveModes(modes); flashSaved(); }, 300);

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => e.append(k));
  return e;
}

function renderModes() {
  const list = $('modes');
  list.textContent = '';
  modes.forEach((m, i) => {
    const card = el('div', { className: 'mode-card' + (m.hidden ? ' is-hidden' : '') });
    card.dataset.id = m.id;

    const icon = el('input', { type: 'text', className: 'icon', placeholder: 'Icon', maxLength: 4, value: m.icon || '' });
    icon.setAttribute('aria-label', 'Icon');
    const name = el('input', { type: 'text', className: 'name', placeholder: 'Mode name', value: m.name });
    name.setAttribute('aria-label', 'Mode name');
    const top = el('div', { className: 'mode-top' }, icon, name);
    if (m.builtin) top.append(el('span', { className: 'badge', textContent: 'Built-in' }));

    const desc = el('input', { type: 'text', className: 'desc', placeholder: 'One-line description (shown in the popup)', value: m.desc || '' });
    desc.setAttribute('aria-label', 'Description');
    const prompt = el('textarea', { className: 'prompt', rows: 4, placeholder: 'Instructions for the model, e.g. "Write a witty one-liner that references the post."', value: m.prompt || '' });
    prompt.setAttribute('aria-label', 'Prompt');

    const needs = el('input', { type: 'checkbox', checked: !!m.needsInput, disabled: !!m.builtin });
    const needsLbl = el('label', { className: 'switch' }, needs, ' Needs my input');

    const up = el('button', { className: 'btn sm', textContent: '↑', title: 'Move up', disabled: i === 0 });
    const down = el('button', { className: 'btn sm', textContent: '↓', title: 'Move down', disabled: i === modes.length - 1 });
    const actions = el('div', { className: 'mode-actions' }, up, down);
    let hideBtn, resetBtn, delBtn;
    if (m.builtin) {
      hideBtn = el('button', { className: 'btn sm', textContent: m.hidden ? 'Show' : 'Hide' });
      resetBtn = el('button', { className: 'btn sm', textContent: 'Reset to default' });
      actions.append(hideBtn, resetBtn);
    } else {
      delBtn = el('button', { className: 'btn sm danger', textContent: 'Delete' });
      actions.append(delBtn);
    }
    const foot = el('div', { className: 'mode-foot' }, needsLbl, actions);
    card.append(top, desc, prompt, foot);
    list.append(card);

    const bind = (node, key, ev = 'input') => node.addEventListener(ev, () => { m[key] = node.value; persistModes(); });
    bind(icon, 'icon'); bind(name, 'name'); bind(desc, 'desc'); bind(prompt, 'prompt');
    needs.addEventListener('change', () => { m.needsInput = needs.checked; persistModes(); });
    up.addEventListener('click', () => move(i, -1));
    down.addEventListener('click', () => move(i, 1));
    hideBtn?.addEventListener('click', () => { m.hidden = !m.hidden; persistModes(); renderModes(); });
    resetBtn?.addEventListener('click', () => { modes[i] = { ...resetBuiltin(m), defaultPrompt: m.defaultPrompt }; persistModes(); renderModes(); });
    delBtn?.addEventListener('click', () => {
      if (!confirm(`Delete "${m.name}"?`)) return;
      modes.splice(i, 1); persistModes(); renderModes();
    });
  });
}

function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= modes.length) return;
  [modes[i], modes[j]] = [modes[j], modes[i]];
  persistModes();
  renderModes();
}

$('addMode').addEventListener('click', () => {
  modes.push(newCustomMode());
  persistModes();
  renderModes();
  const last = $('modes').lastElementChild;
  last.scrollIntoView({ block: 'center', behavior: 'smooth' });
  last.querySelector('.name').select();
});

(async function init() {
  $('apiKey').value = await getApiKey();
  settings = await getSettings();
  $('model').value = settings.model;
  $('about').value = settings.about;
  $('avoidEmojis').checked = settings.avoidEmojis;
  $('avoidHashtags').checked = settings.avoidHashtags;
  modes = await getModes();
  renderModes();
})();
