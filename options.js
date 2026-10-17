// Settings for AI replies. The API key goes to chrome.storage.local only (never sync), so it stays on this computer.

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

$('saveVoice').addEventListener('click', async () => {
  await chrome.storage.local.set({ voice: $('voice').value.slice(0, 8000) });
  status('voiceStatus', t('opt_saved'), true);
});

chrome.storage.sync.get({ replies: true }).then(s => renderReplies(s.replies !== false));
chrome.storage.local.get({ apiKey: '', voice: '' }).then(s => {
  if (s.apiKey) $('key').placeholder = '•••• ' + s.apiKey.slice(-4); // never put the key itself back on the page
  $('voice').value = s.voice;
});
