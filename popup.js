// Popup: clean any pasted text, switch rule groups on/off, show how much was cleaned. Settings sync to content.js.

// [rule id, sample shown on the chip]; name and hint come from _locales as rule_<id> / hint_<id>
const GROUPS = [
  ['invisible', 'U+200B → ∅'],
  ['spaces', 'NBSP → ␣'],
  ['dashes', '— – → -'],
  ['quotes', '“ ” ’ → " \''],
  ['bullets', '• → -'],
  ['fancy', '𝐁𝐨𝐥𝐝 … → Bold ...'],
];

const $ = id => document.getElementById(id);
let settings = { enabled: true, rules: {} };

// Static text in popup.html
document.documentElement.lang = chrome.i18n.getUILanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));

function renderPower() {
  $('power').setAttribute('aria-pressed', settings.enabled);
  $('power').lastChild.textContent = t(settings.enabled ? 'power_on' : 'power_paused');
  $('power').title = t(settings.enabled ? 'power_pause' : 'power_resume');
}

function renderRules() {
  $('rules').replaceChildren(...GROUPS.map(([id, sample]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rule';
    b.dataset.rule = id;
    b.title = t('hint_' + id);
    b.setAttribute('aria-pressed', settings.rules[id] !== false);
    b.innerHTML = '<b></b><code></code>';
    b.firstChild.textContent = t('rule_' + id);
    b.lastChild.textContent = sample;
    return b;
  }));
}

function scanInput() {
  const text = $('input').value;
  const n = analyze(text, settings.rules).count;
  $('found').textContent = !text.trim() ? '' : n ? tn('found', n) : t('found_clean');
  $('found').className = 'found' + (!text.trim() ? '' : n ? ' has' : ' ok');
  $('go').disabled = !text.trim();
}

async function cleanAndCopy() {
  if ($('go').disabled) return;
  const { text, count } = analyze($('input').value, settings.rules);
  $('input').value = text;
  const copied = await navigator.clipboard.writeText(text).then(() => true, () => false);
  $('found').textContent = t(copied ? 'found_copied' : 'found_cleaned');
  $('found').className = 'found ok';
  if (count) {
    const { total } = await chrome.storage.local.get({ total: 0 });
    chrome.storage.local.set({ total: (Number(total) || 0) + count });
  }
}

$('input').addEventListener('input', scanInput);
$('input').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); cleanAndCopy(); } });
$('go').addEventListener('click', cleanAndCopy);

$('power').addEventListener('click', () => {
  settings.enabled = !settings.enabled;
  renderPower();
  chrome.storage.sync.set({ enabled: settings.enabled });
});

$('rules').addEventListener('click', e => {
  const b = e.target.closest('.rule');
  if (!b) return;
  const on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', on);
  settings.rules = { ...settings.rules, [b.dataset.rule]: on };
  chrome.storage.sync.set({ rules: settings.rules });
  scanInput();
});

const showTotal = n => ($('total').textContent = tn('removed', Number(n) || 0));
const version = chrome.runtime?.getManifest?.().version;
if (version) $('version').textContent = 'v' + version;
renderRules();
chrome.storage.sync.get({ enabled: true, rules: {} }).then(s => { settings = sanitizeSettings(s); renderPower(); renderRules(); scanInput(); });
chrome.storage.local.get({ total: 0 }).then(s => showTotal(s.total));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.total) showTotal(changes.total.newValue);
});
