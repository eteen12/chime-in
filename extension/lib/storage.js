// chrome.storage.local helpers for Chime In.
import { BUILTIN_MODES, DEFAULT_SETTINGS } from './defaults.js';

const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);

export async function getApiKey() {
  const { apiKey } = await get('apiKey');
  return (apiKey || '').trim();
}
export const setApiKey = (apiKey) => set({ apiKey: (apiKey || '').trim() });

export async function getSettings() {
  const { settings } = await get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
export const saveSettings = (settings) => set({ settings });

// Modes are stored as an ordered array. Built-ins keep `defaultPrompt` out of
// storage: we always read defaults from code so "reset" and upgrades work.
function reconcile(stored) {
  const list = Array.isArray(stored) ? stored.map((m) => ({ ...m })) : [];
  for (const b of BUILTIN_MODES) {
    const found = list.find((m) => m.id === b.id);
    if (found) {
      found.builtin = true;
      found.needsInput = b.needsInput; // fixed for built-ins
      found.defaultPrompt = b.prompt;
      if (!found.prompt) found.prompt = b.prompt;
    } else {
      list.push({ ...b, builtin: true, hidden: false, defaultPrompt: b.prompt });
    }
  }
  return list;
}

export async function getModes() {
  const { modes } = await get('modes');
  return reconcile(modes);
}
export async function saveModes(modes) {
  // never persist defaultPrompt
  await set({ modes: modes.map(({ defaultPrompt, ...rest }) => rest) });
}
export function resetBuiltin(mode) {
  const b = BUILTIN_MODES.find((x) => x.id === mode.id);
  return b ? { ...mode, name: b.name, icon: b.icon, desc: b.desc, prompt: b.prompt, hidden: false } : mode;
}
