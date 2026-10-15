// Popup: clean any pasted text, switch rule groups on/off, show how much was cleaned. Settings sync to content.js.

const GROUPS = [
  ['invisible', 'Hidden', 'U+200B → ∅', 'Zero-width and tag watermarks'],
  ['spaces', 'Spaces', 'NBSP → ␣', 'Non-breaking, thin and wide spaces'],
  ['dashes', 'Dashes', '— – → -', 'Long dashes'],
  ['quotes', 'Quotes', '“ ” ’ → " \'', 'Curly quotes and apostrophes'],
  ['bullets', 'Bullets', '• → -', 'Bullet points'],
  ['fancy', 'Fancy', '𝐁𝐨𝐥𝐝 … → Bold ...', 'Bold/italic Unicode letters, ellipsis'],
];

const $ = id => document.getElementById(id);
let settings = { enabled: true, rules: {} };

function renderPower() {
  $('power').setAttribute('aria-pressed', settings.enabled);
  $('power').lastChild.textContent = settings.enabled ? 'On' : 'Paused';
  $('power').title = settings.enabled ? 'Pause on X and Typefully' : 'Turn on for X and Typefully';
}

function renderRules() {
  $('rules').replaceChildren(...GROUPS.map(([id, name, sample, hint]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rule';
    b.dataset.rule = id;
    b.title = hint;
    b.setAttribute('aria-pressed', settings.rules[id] !== false);
    b.innerHTML = '<b></b><code></code>';
    b.firstChild.textContent = name;
    b.lastChild.textContent = sample;
    return b;
  }));
}

function scanInput() {
  const text = $('input').value;
  const n = analyze(text, settings.rules).count;
  $('found').textContent = !text.trim() ? '' : n ? `${n} tell${n > 1 ? 's' : ''}` : 'clean';
  $('found').className = 'found' + (!text.trim() ? '' : n ? ' has' : ' ok');
  $('go').disabled = !text.trim();
}

async function cleanAndCopy() {
  if ($('go').disabled) return;
  const { text, count } = analyze($('input').value, settings.rules);
  $('input').value = text;
  const copied = await navigator.clipboard.writeText(text).then(() => true, () => false);
  $('found').textContent = copied ? 'copied' : 'cleaned';
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

const showTotal = n => ($('total').textContent = (Number(n) || 0).toLocaleString('en-US'));
const version = chrome.runtime?.getManifest?.().version;
if (version) $('version').textContent = 'v' + version;
renderRules();
chrome.storage.sync.get({ enabled: true, rules: {} }).then(s => { settings = sanitizeSettings(s); renderPower(); renderRules(); scanInput(); });
chrome.storage.local.get({ total: 0 }).then(s => showTotal(s.total));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.total) showTotal(changes.total.newValue);
});
