// Chime In service worker: generates a comment via OpenRouter, then asks the
// content script to drop it into the post's comment box. It never submits.
import { BASE_SYSTEM_PROMPT, OPENROUTER_URL } from './lib/defaults.js';
import { getApiKey, getSettings, getModes } from './lib/storage.js';

const setRun = (run) => chrome.storage.local.set({ lastRun: run });

function buildSystemPrompt(mode, s) {
  const parts = [BASE_SYSTEM_PROMPT, mode.prompt];
  const rules = [];
  if (s.avoidEmojis) rules.push('Do not use emojis.');
  if (s.avoidHashtags) rules.push('Do not use hashtags.');
  if (rules.length) parts.push(rules.join(' '));
  if (s.about && s.about.trim()) parts.push('About the user and their preferred tone:\n' + s.about.trim());
  return parts.filter(Boolean).join('\n\n');
}

function buildUserMessage(mode, post, input) {
  let msg = `Post author: ${post.author || 'Unknown'}\n\nPost:\n"""\n${post.text || '(no text found)'}\n"""`;
  if (mode.needsInput) msg += `\n\nWhat I want to say:\n"""\n${input || ''}\n"""`;
  return msg;
}

function stripQuotes(t) {
  t = (t || '').trim();
  const pairs = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’'], ['`', '`']];
  for (const [a, b] of pairs) {
    if (t.length > 1 && t.startsWith(a) && t.endsWith(b)) return t.slice(a.length, t.length - b.length).trim();
  }
  return t;
}

export async function callOpenRouter({ key, model, system, user }) {
  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/eteen12/chime-in',
        'X-Title': 'Chime In',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 400,
        temperature: 0.8,
        reasoning: { enabled: false },
      }),
    });
  } catch {
    throw new Error("Couldn't reach OpenRouter. Check your internet connection and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const apiMsg = data?.error?.message;
    if (res.status === 401) throw new Error('OpenRouter rejected your API key. Check it in Settings.');
    if (res.status === 402) throw new Error('Your OpenRouter account is out of credits. Add credits at openrouter.ai/credits.');
    if (res.status === 429) throw new Error('OpenRouter is rate limiting you. Wait a moment and try again.');
    if (res.status === 400 || res.status === 404) throw new Error(`OpenRouter error: ${apiMsg || 'check the model id in Settings.'}`);
    throw new Error(`OpenRouter error (${res.status}): ${apiMsg || 'something went wrong.'}`);
  }
  const text = stripQuotes(data?.choices?.[0]?.message?.content);
  if (!text) throw new Error('The model returned an empty reply. Try again or pick a different model in Settings.');
  return text;
}

async function insertIntoTab(tabId, postId, text) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'chimein:insert', postId, text });
    return r || { ok: false, error: 'No response from the page.' };
  } catch {
    return { ok: false, error: 'Could not reach the LinkedIn tab. Reload the page and try again.' };
  }
}

async function run(msg) {
  const { tabId, modeId, input, post } = msg;
  const base = { tabId, modeId, postId: post?.id || null, input: input || '', post, ts: Date.now() };
  await setRun({ ...base, status: 'loading' });
  try {
    const key = await getApiKey();
    if (!key) throw new Error('Add your OpenRouter API key first.');
    const modes = await getModes();
    const mode = modes.find((m) => m.id === modeId);
    if (!mode) throw new Error('That mode no longer exists.');
    if (mode.needsInput && !(input || '').trim()) throw new Error('This mode needs your input first.');
    const settings = await getSettings();
    const text = await callOpenRouter({
      key,
      model: (settings.model || '').trim() || 'deepseek/deepseek-v4.1-flash',
      system: buildSystemPrompt(mode, settings),
      user: buildUserMessage(mode, post || {}, input),
    });
    await setRun({ ...base, status: 'generated', text });
    const ins = await insertIntoTab(tabId, post?.id, text);
    await setRun({ ...base, status: 'done', text, inserted: !!ins.ok, insertError: ins.ok ? null : ins.error });
  } catch (e) {
    await setRun({ ...base, status: 'error', error: e.message || String(e) });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'chimein:run') {
    run(msg); // fire and forget; popup watches storage
    sendResponse({ started: true });
  } else if (msg?.type === 'chimein:reinsert') {
    (async () => {
      const { lastRun } = await chrome.storage.local.get('lastRun');
      if (!lastRun?.text) return sendResponse({ ok: false, error: 'Nothing to insert yet.' });
      const ins = await insertIntoTab(msg.tabId, lastRun.postId, lastRun.text);
      await setRun({ ...lastRun, status: 'done', inserted: !!ins.ok, insertError: ins.ok ? null : ins.error });
      sendResponse(ins);
    })();
    return true;
  }
});
