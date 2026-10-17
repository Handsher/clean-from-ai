// Settings for AI replies. The API key goes to chrome.storage.local only (never sync), so it stays on this computer.
import { buildVoice, VOICE_LIMIT } from './voice-import.js';

const $ = id => document.getElementById(id);

document.documentElement.lang = chrome.i18n.getUILanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);

const status = (id, text, ok) => { $(id).textContent = text; $(id).className = 'found ' + (ok ? 'ok' : 'has'); };

function renderReplies(on) {
  $('replies').setAttribute('aria-pressed', on);
  $('replies').lastChild.textContent = t(on ? 'power_on' : 'power_paused');
}

$('replies').addEventListener('click', async () => {
  const on = $('replies').getAttribute('aria-pressed') !== 'true';
  renderReplies(on);
  await chrome.storage.sync.set({ replies: on });
});

$('save').addEventListener('click', async () => {
  const apiKey = $('key').value.trim();
  if (!apiKey) return;
  await chrome.storage.local.set({ apiKey, hasKey: true });
  $('key').value = '';
  $('key').placeholder = '•••• ' + apiKey.slice(-4);
  status('keyStatus', t('opt_saved'), true);
});

$('test').addEventListener('click', async () => {
  status('keyStatus', '…', true);
  const res = await chrome.runtime.sendMessage({ type: 'cleanai:test' });
  res?.ok ? status('keyStatus', t('opt_key_ok'), true) : status('keyStatus', t('reply_error_' + (res?.error || 'API')), false);
});

$('remove').addEventListener('click', async () => {
  await chrome.storage.local.remove(['apiKey']);
  await chrome.storage.local.set({ hasKey: false });
  $('key').placeholder = 'sk-ant-...';
  status('keyStatus', t('opt_key_removed'), true);
});

$('saveX').addEventListener('click', async () => {
  const xKey = $('xkey').value.trim();
  if (!xKey) return;
  await chrome.storage.local.set({ xKey });
  $('xkey').value = '';
  $('xkey').placeholder = '•••• ' + xKey.slice(-4);
  status('xStatus', t('opt_saved'), true);
});

$('removeX').addEventListener('click', async () => {
  await chrome.storage.local.remove(['xKey']);
  $('xkey').placeholder = 'twitterapi.io';
  status('xStatus', t('opt_key_removed'), true);
});

$('saveVoice').addEventListener('click', async () => {
  await chrome.storage.local.set({ voice: $('voice').value.slice(0, VOICE_LIMIT) });
  status('voiceStatus', t('opt_saved'), true);
});

// A whole folder (for example x-posting/voice): notes + the user's own posts, read here, never uploaded as files.
$('importVoice').addEventListener('click', () => $('folder').click());
$('folder').addEventListener('change', async e => {
  const picked = [...e.target.files].filter(f => /\.(md|txt|jsonl)$/i.test(f.name) && f.size < 20e6);
  const files = await Promise.all(picked.map(async f => ({ name: f.name, text: await f.text() })));
  const voice = buildVoice(files);
  e.target.value = '';
  if (!voice.text) return status('voiceStatus', t('reply_error_EMPTY'), false);
  $('voice').value = voice.text;
  await chrome.storage.local.set({ voice: voice.text, voiceProfile: voice.profile }); // profile: measured habits + reply kinds
  status('voiceStatus', t('opt_imported', [String(voice.notes), String(voice.posts)]), true);
});

chrome.storage.sync.get({ replies: true }).then(s => renderReplies(s.replies !== false));
chrome.storage.local.get({ apiKey: '', xKey: '', voice: '' }).then(s => {
  if (s.apiKey) $('key').placeholder = '•••• ' + s.apiKey.slice(-4); // never put the key itself back on the page
  if (s.xKey) $('xkey').placeholder = '•••• ' + s.xKey.slice(-4);
  $('voice').value = s.voice;
});
