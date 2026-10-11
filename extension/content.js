// Chime In content script. Finds the "target post" on LinkedIn and drops text
// into its comment box. It NEVER clicks Post/Submit.
(() => {
  if (window.__chimeInLoaded) return;
  window.__chimeInLoaded = true;

  // ---- All LinkedIn selectors live here. Update these when the DOM changes. ----
  const SELECTORS = {
    // Tried in priority order; first one that has an ancestor match wins.
    postContainers: [
      'div[role="listitem"][componentkey^="update-card-focus"]',
      '[role="listitem"]',
      '[data-urn*="urn:li:activity"]',
      '[data-id*="urn:li:activity"]',
      '.feed-shared-update-v2',
      'div[role="article"]',
      'article',
    ],
    postText: [
      '[data-testid="expandable-text-box"]',
      '.update-components-text',
      '.feed-shared-inline-show-more-text',
      '.feed-shared-update-v2__description',
    ],
    postTextFallback: 'span[dir="ltr"], div[dir="ltr"]',
    // Current SDUI build: author is only exposed through menu-button aria-labels.
    authorAriaPatterns: [/^Open control menu for post by (.+)$/i, /^Hide post by (.+)$/i],
    expandTextButton: '[data-testid="expandable-text-button"]',
    authorName: [
      '.update-components-actor__title span[aria-hidden="true"]',
      '.update-components-actor__name',
    ],
    authorLink: 'a[href*="/in/"], a[href*="/company/"]',
    commentEditor: [
      'div.ProseMirror[contenteditable="true"][role="textbox"]',
      '[aria-label="Text editor for creating comment"][contenteditable="true"]',
      '[data-testid="ui-core-tiptap-text-editor-wrapper"] [contenteditable="true"]',
      '.comments-comment-box__form [contenteditable="true"]',
      '.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    // Areas of a post that hold other people's comments (excluded from post text).
    commentsArea: '.comments-comments-list, .comments-comment-list, [class*="comments-comment-item"], article article',
    commentButton: 'button, [role="button"]',
    // Comment composer (its own "Comment" button is the SUBMIT button: never click inside here).
    composer: '[componentkey*="asyncInlineCommentBox"], [data-testid="ui-core-tiptap-text-editor-wrapper"], .comments-comment-box, form',
    // Never click a button whose class/type looks like a submit button.
    forbiddenClick: /submit|primary-action|post-button/i,
  };
  const STAMP = 'data-chimein-id';

  // ---------- helpers ----------
  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const clean = (s) => (s || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findPost(node) {
    if (!node || !node.closest) return null;
    for (const sel of SELECTORS.postContainers) {
      const hit = node.closest(sel);
      if (hit) return hit;
    }
    return null;
  }

  function allPosts() {
    const seen = new Set();
    const out = [];
    for (const sel of SELECTORS.postContainers) {
      for (const el of document.querySelectorAll(sel)) {
        const post = findPost(el);
        if (post && !seen.has(post) && isVisible(post)) { seen.add(post); out.push(post); }
      }
      if (out.length) break; // use the most specific selector family that matched
    }
    if (!out.length && /\/(feed\/update|posts)\//.test(location.pathname)) {
      const main = document.querySelector('main');
      if (main) out.push(main);
    }
    return out;
  }

  function stampId(post) {
    let id = post.getAttribute(STAMP);
    if (!id) {
      id = 'ci_' + Math.random().toString(36).slice(2, 10);
      post.setAttribute(STAMP, id);
    }
    return id;
  }
  const byId = (id) => (id ? document.querySelector(`[${STAMP}="${CSS.escape(id)}"]`) : null);

  // ---------- extraction ----------
  function expandText(post) {
    // "... more" only reveals text in place; it is safe to click.
    for (const b of post.querySelectorAll(SELECTORS.expandTextButton)) {
      if (b.closest(SELECTORS.commentsArea) || !isVisible(b)) continue;
      try { b.click(); } catch { /* ignore */ }
    }
  }

  function extractText(post) {
    for (const sel of SELECTORS.postText) {
      for (const el of post.querySelectorAll(sel)) {
        if (el.closest(SELECTORS.commentsArea)) continue;
        const t = clean(el.innerText);
        if (t) return t;
      }
    }
    let best = '';
    for (const el of post.querySelectorAll(SELECTORS.postTextFallback)) {
      if (el.closest(SELECTORS.commentsArea) || el.closest('[contenteditable]')) continue;
      const t = clean(el.innerText);
      if (t.length > best.length) best = t;
    }
    return best;
  }

  function extractAuthor(post) {
    for (const b of post.querySelectorAll('[aria-label]')) {
      const l = b.getAttribute('aria-label') || '';
      for (const re of SELECTORS.authorAriaPatterns) {
        const m = l.match(re);
        if (m && m[1].trim()) return m[1].trim();
      }
    }
    for (const sel of SELECTORS.authorName) {
      const el = post.querySelector(sel);
      const t = clean(el && el.innerText);
      if (t) return t.split('\n')[0];
    }
    for (const a of post.querySelectorAll(SELECTORS.authorLink)) {
      const t = clean(a.innerText).split('\n')[0];
      if (t) return t;
    }
    return '';
  }

  function describe(post) {
    const text = extractText(post).slice(0, 3000);
    const author = extractAuthor(post);
    return {
      id: stampId(post),
      author,
      text,
      preview: text.length > 140 ? text.slice(0, 140).trimEnd() + '…' : text,
      hasEditor: !!findEditor(post),
    };
  }

  // ---------- target post ----------
  let lastPostRef = null;
  const remember = (e) => {
    const post = findPost(e.target);
    if (post) lastPostRef = new WeakRef(post);
  };
  document.addEventListener('focusin', remember, true);
  document.addEventListener('click', remember, true);

  function centeredPost() {
    const vc = window.innerHeight / 2;
    let best = null, bestD = Infinity;
    for (const p of allPosts()) {
      const r = p.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      const d = Math.abs(r.top + r.height / 2 - vc);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function targetPost() {
    const last = lastPostRef && lastPostRef.deref();
    if (last && last.isConnected) return last;
    return centeredPost();
  }

  // ---------- comment box ----------
  function findEditor(post) {
    for (const sel of SELECTORS.commentEditor) {
      for (const el of post.querySelectorAll(sel)) {
        if (isVisible(el) && !el.closest('[class*="comments-comment-item"] article')) return el;
      }
    }
    return null;
  }

  function findCommentButton(post) {
    for (const b of post.querySelectorAll(SELECTORS.commentButton)) {
      if (b.closest(SELECTORS.commentsArea) || b.closest(SELECTORS.composer)) continue;
      const label = (b.getAttribute('aria-label') || '').trim();
      const text = clean(b.innerText);
      const hay = label || text;
      if (/\d/.test(hay) && /comments?/i.test(hay)) continue; // "12 comments" counter
      // Require an aria-label: the composer's submit button is a bare "Comment" text button.
      if (/^comment(\s|$)/i.test(label)) {
        if (b.getAttribute('type') === 'submit' || SELECTORS.forbiddenClick.test(b.className || '')) continue;
        if (isVisible(b)) return b;
      }
    }
    return null;
  }

  async function waitFor(fn, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(100);
    }
    return null;
  }

  async function ensureEditor(post) {
    let ed = findEditor(post);
    if (ed) return ed;
    const btn = findCommentButton(post);
    if (!btn) return null;
    btn.click(); // opens the comment box; this is the ONLY thing we ever click
    // The SDUI comment box mounts lazily and can take several seconds.
    return waitFor(() => findEditor(post), 12000);
  }

  function insertText(editor, text) {
    editor.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(editor);
    sel.addRange(range);
    let ok = false;
    try {
      const lines = text.split(/\n+/).filter(Boolean);
      ok = document.execCommand('insertText', false, lines[0] || text);
      for (const l of lines.slice(1)) {
        document.execCommand('insertParagraph');
        document.execCommand('insertText', false, l);
      }
    } catch { ok = false; }
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    if (ok && norm(editor.innerText).includes(norm(text).slice(0, 30))) return 'execCommand';
    // Fallback: build paragraphs and fire an input event.
    editor.innerHTML = '';
    for (const line of text.split(/\n/)) {
      const p = document.createElement('p');
      if (line) p.textContent = line; else p.appendChild(document.createElement('br'));
      editor.appendChild(p);
    }
    editor.classList.remove('ql-blank');
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return 'fallback';
  }

  async function doInsert(postId, text) {
    let post = byId(postId);
    if (!post || !post.isConnected) post = targetPost();
    if (!post) return { ok: false, error: 'Could not find the post on the page.' };
    post.scrollIntoView({ block: 'center', behavior: 'instant' });
    const editor = await ensureEditor(post);
    if (!editor) return { ok: false, error: "Couldn't open the comment box. Click the post's Comment button, then use Insert again." };
    const method = insertText(editor, text);
    return { ok: true, method };
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.type === 'chimein:getTarget') {
      const post = targetPost();
      if (!post) { sendResponse({ found: false }); return; }
      expandText(post);
      sleep(200).then(() => sendResponse({ found: true, ...describe(post) }));
      return true;
    } else if (msg?.type === 'chimein:insert') {
      doInsert(msg.postId, msg.text).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
  });
})();
