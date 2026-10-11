# Chime In - Chrome Web Store listing

**Name:** Chime In
**Category:** Productivity
**Version:** 1.0.0

## Short description (<=132 chars)
Draft a LinkedIn comment in one click and drop it into the comment box. You review it and hit Post yourself.

## Detailed description
Chime In writes LinkedIn comments for you, then puts them in the comment box so you can read, tweak and post them yourself. It never submits anything.

Open any LinkedIn post, click into its comment box (or just scroll it into view), and press Alt+Shift+C or the toolbar icon. Pick a style:

- Quick: one short, friendly, positive sentence.
- Thoughtful: 2-4 sentences that engage with a specific point in the post.
- Clean up: type what you want to say in casual language and get a polished, professional-but-human comment that keeps your meaning.

Make it yours:
- Add your own modes with custom prompts, reorder, hide or edit the built-ins.
- Add an "about me / tone" note, e.g. "I'm a product manager, keep it casual."
- Avoid emojis and hashtags (on by default).
- Choose any model available on OpenRouter.

Bring your own key: Chime In uses your own OpenRouter API key (get one at https://openrouter.ai/keys). The key is stored only in your browser. There is no Chime In server and no account.

Regenerate, copy, or insert again with one click. If the comment box is closed, Chime In opens it for you, but it never clicks Post.

Chime In is not affiliated with or endorsed by LinkedIn.

## Single purpose
Generate a draft comment for the LinkedIn post the user is looking at and insert it into that post's comment box for the user to review and submit themselves.

## Permission justifications
- **storage**: Saves the user's OpenRouter API key, model choice, tone preferences and custom modes locally in chrome.storage.local, and the status of the latest generation.
- **Host permission https://www.linkedin.com/***: Runs the content script that finds the post the user is working on, reads its author and text, and inserts the generated comment into that post's comment box. It never clicks Post/Submit.
- **Host permission https://openrouter.ai/***: Sends the generation request (post author and text, plus the user's own draft in Clean up mode) to OpenRouter with the user's own API key, from the background service worker.
- **Commands (_execute_action, Alt+Shift+C)**: Keyboard shortcut to open the popup. Not a permission, listed for completeness.
- No remote code is loaded. No "tabs", "scripting", "activeTab" or "<all_urls>" permissions are used.

## Data usage disclosure
- Data sent: the author name and text of the selected LinkedIn post, the user's optional typed draft, the user's tone/"about me" note and the prompt of the chosen mode. They are sent directly from the user's browser to OpenRouter (https://openrouter.ai) using the user's own API key, solely to generate the comment. OpenRouter and the selected model provider process this under their own terms and privacy policies.
- Data stored: the API key, settings and modes in chrome.storage.local on the user's device only.
- The developer collects NO data: no analytics, telemetry, accounts or servers. Nothing is sold or shared with third parties, nor used for purposes unrelated to the single purpose.
- Certifications: does not sell user data; does not use or transfer data for purposes unrelated to the item's single purpose; does not use or transfer data to determine creditworthiness or for lending.
- Data types touched in the Web Store form: "Website content" (post text, sent to OpenRouter on user action). Authentication information: the user's own OpenRouter key, stored locally.

## Assets
- Icon: store/icon128.png
- Screenshots (1280x800): screenshot-1.png ... screenshot-4.png
- Small promo tile (440x280): promo-small-440x280.png
