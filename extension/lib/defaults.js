// Shared defaults for Chime In (used by background, popup and options).

export const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash';
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const KEYS_URL = 'https://openrouter.ai/keys';

export const BASE_SYSTEM_PROMPT =
  'You write LinkedIn comments on behalf of the user. Output only the comment text: no quotes, no preamble, ' +
  'no explanation, no markdown. Write in first person as the user, in plain natural language that sounds like a real ' +
  'person and not a press release. Never invent specific facts, numbers or experiences about the user that were not ' +
  'given to you. Do not repeat the post back word for word. Avoid em dashes. Write a single paragraph.';

export const DEFAULT_SETTINGS = {
  model: DEFAULT_MODEL,
  about: '',
  avoidEmojis: true,
  avoidHashtags: true,
};

export const BUILTIN_MODES = [
  {
    id: 'quick',
    name: 'Quick',
    icon: '⚡',
    desc: 'One short, positive line.',
    needsInput: false,
    prompt:
      'Write a very short, simple, positive comment: exactly one sentence. Keep it a little vague and general ' +
      '(congratulate, show support, or say it is great to see) without making specific claims about the post.',
  },
  {
    id: 'thoughtful',
    name: 'Thoughtful',
    icon: '💭',
    desc: '2-4 sentences that engage a real point.',
    needsInput: false,
    prompt:
      'Write a thoughtful comment of 2 to 4 sentences. Engage with one specific point from the post, and connect it to ' +
      'a related idea or a general experience in a believable way. Keep it natural and conversational, not salesy or gushing.',
  },
  {
    id: 'cleanup',
    name: 'Clean up',
    icon: '✨',
    desc: 'Type it casually, get it polished.',
    needsInput: true,
    prompt:
      'The user will give you what they want to say, in casual language. Rewrite it as a polished, professional but ' +
      'human LinkedIn comment. Keep their meaning, opinions and any facts exactly as given, fix tone and grammar, and ' +
      'keep roughly the same length. Do not add claims they did not make.',
  },
];

export function newCustomMode() {
  return {
    id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: 'New mode',
    icon: '',
    desc: '',
    prompt: '',
    needsInput: false,
    builtin: false,
    hidden: false,
  };
}
