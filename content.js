// "Clean AI" eraser for your own drafts, with a live count of AI tells. Other people's posts are left alone.
// X composer (new post, reply, quote, edit): the eraser sits in X's icon row.
// Any other editor you're typing in (Typefully, X DMs): the eraser floats at the editor's top-right corner.

const X_EDITOR = '[data-testid^="tweetTextarea_"][contenteditable="true"]';
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(-45 13.5 13)"><rect x="5.5" y="9.5" width="16" height="7" rx="1.8"/><path d="M10.5 9.5v7"/></g><path d="M8 21h12"/><path fill="currentColor" stroke="none" d="M5.5 2c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8z"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let settings = { enabled: true, rules: {} };

// Text as the editor stores it: one line per block (innerText would double the empty lines).
function readText(editor) {
  const draftBlocks = editor.querySelectorAll('[data-block="true"]'); // X / Draft.js
  if (draftBlocks.length) return [...draftBlocks].map(b => b.textContent).join('\n');
  const kids = [...editor.children];
  if (kids.length && kids.every(k => getComputedStyle(k).display === 'block')) // ProseMirror / Tiptap paragraphs
    return kids.map(k => k.innerText.replace(/\n$/, '')).join('\n');
  return editor.innerText;
}

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Headings, lists, images... a plain-text paste would wipe them, so formatted drafts (X Articles) are left alone.
const isRich = editor => !!editor.querySelector('img, video, audio, iframe, h1, h2, h3, ul, ol, blockquote, table, pre');

// Rich editors ignore direct DOM edits, but all of them accept a paste over a full selection.
async function cleanEditor(editor) {
  if (isRich(editor)) return 0;
  const text = readText(editor);
  const { text: cleaned, count } = analyze(text, settings.rules);
  if (!text.trim() || cleaned === text) return 0;
  editor.focus();
  if (!editor.contains(document.activeElement)) return 0; // editor refused focus: a paste now could land elsewhere
  document.execCommand('selectAll');
  await new Promise(r => setTimeout(r, 50)); // let the editor pick up the new selection
  const data = new DataTransfer();
  data.setData('text/plain', cleaned);
  // ProseMirror turns plain-text blank lines into nothing, so give it one <p> per line. Draft.js gets plain text only.
  if (!editor.querySelector('[data-block="true"]')) data.setData('text/html', cleaned.split('\n').map(l => `<p>${escapeHtml(l)}</p>`).join(''));
  editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  return count;
}

function makeButton(getEditors) {
  const wrap = document.createElement('div');
  wrap.className = 'cleanai-wrap';
  wrap.setAttribute('role', 'presentation');
  wrap.innerHTML = `<button type="button" class="cleanai-btn">${ICON}</button><span class="cleanai-badge" hidden></span>`;
  wrap.getEditors = getEditors;
  const btn = wrap.firstChild;
  btn.addEventListener('mousedown', e => e.preventDefault()); // keep the cursor in the editor
  let busy = false;
  btn.addEventListener('click', async e => {
    e.preventDefault();
    if (busy) return; // a second click mid-paste would paste twice
    busy = true;
    let removed = 0;
    try { for (const editor of getEditors()) removed += await cleanEditor(editor); } finally { busy = false; }
    btn.innerHTML = CHECK;
    btn.classList.add('cleanai-done');
    setTimeout(() => { btn.innerHTML = ICON; btn.classList.remove('cleanai-done'); }, 1500);
    if (removed) chrome.storage.local.get({ total: 0 }).then(s => chrome.storage.local.set({ total: (Number(s.total) || 0) + removed })).catch(() => {});
  });
  return wrap;
}

// Live badge: how many AI tells are in the draft right now. Only touches the DOM when something changes.
function updateBadge(wrap) {
  let n = 0, rich = false;
  for (const editor of wrap.getEditors()) isRich(editor) ? (rich = true) : (n += analyze(readText(editor), settings.rules).count);
  const badge = wrap.lastChild, btn = wrap.firstChild;
  const label = n ? `Clean ${n} AI tell${n > 1 ? 's' : ''}` : rich ? 'Clean AI (not available for formatted posts)' : 'Clean AI (no AI tells found)';
  if (badge.hidden !== !n) badge.hidden = !n;
  const shown = n > 99 ? '99+' : String(n);
  if (n && badge.textContent !== shown) badge.textContent = shown;
  if (btn.title !== label) btn.title = label, btn.setAttribute('aria-label', label);
}

// --- X composer: eraser in X's icon row ---
function addXButton(bar) {
  let box = bar;
  while (box && !box.querySelector(X_EDITOR)) box = box.parentElement; // this composer only
  const wrap = makeButton(() => (box || document).querySelectorAll(X_EDITOR));
  // Climb from one of X's icons to the row that holds them all.
  let item = bar.querySelector('[data-testid="ScrollSnap-List"] > *, [role="tablist"] > *')
    || bar.querySelector('[data-testid="gifSearchButton"], [data-testid="createPollButton"], [data-testid="geoButton"]');
  while (item && item.parentElement !== bar && item.parentElement.children.length < 3) item = item.parentElement;
  item ? item.parentElement.append(wrap) : bar.prepend(wrap);
  return wrap;
}

// --- Any other editor: one floating eraser that follows the editor you're typing in ---
let focused = null;
const floater = makeButton(() => (focused?.isConnected ? [focused] : []));
floater.classList.add('cleanai-float');

function placeFloater() {
  if (!focused?.isConnected || !settings.enabled) return floater.remove();
  if (!floater.isConnected) document.body.append(floater);
  const r = focused.getBoundingClientRect();
  floater.style.left = Math.max(4, Math.min(r.right - 30, innerWidth - 42)) + 'px';
  floater.style.top = Math.max(4, r.top - 38) + 'px';
  updateBadge(floater);
}

document.addEventListener('focusin', e => {
  const editor = e.target.closest?.('[contenteditable="true"]');
  if (!editor || editor.matches(X_EDITOR)) return; // X composer has its own button
  focused = editor;
  placeFloater();
});
document.addEventListener('focusout', () => setTimeout(() => {
  if (!document.activeElement?.closest?.('[contenteditable="true"]')) { focused = null; placeFloater(); }
}, 150));
addEventListener('scroll', () => focused && placeFloater(), true);
addEventListener('resize', () => focused && placeFloater());

function scan() {
  for (const bar of document.querySelectorAll('[data-testid="toolBar"]')) {
    const wrap = bar.querySelector('.cleanai-wrap');
    if (!settings.enabled) { wrap?.remove(); continue; }
    updateBadge(wrap || addXButton(bar)); // re-added if X re-renders the toolbar
  }
  if (focused) placeFloater(); // badge + position follow typing (the editor grows)
}

let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; scan(); });
}).observe(document.body, { childList: true, subtree: true, characterData: true }); // characterData = typing

chrome.storage.sync.get({ enabled: true, rules: {} }).then(s => { settings = sanitizeSettings(s); scan(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  const next = { ...settings };
  for (const key of ['enabled', 'rules']) if (key in changes) next[key] = changes[key].newValue;
  settings = sanitizeSettings(next);
  scan();
});
