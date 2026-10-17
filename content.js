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
  return (await pasteInto(editor, cleaned)) ? count : 0;
}

// Replace everything in a rich editor with `text`. False if the editor wouldn't take focus (a paste could land elsewhere).
async function pasteInto(editor, text) {
  editor.focus();
  if (!editor.contains(document.activeElement)) return false;
  document.execCommand('selectAll');
  await new Promise(r => setTimeout(r, 50)); // let the editor pick up the new selection
  const data = new DataTransfer();
  data.setData('text/plain', text);
  // ProseMirror turns plain-text blank lines into nothing, so give it one <p> per line. Draft.js gets plain text only.
  if (!editor.querySelector('[data-block="true"]')) data.setData('text/html', text.split('\n').map(l => `<p>${escapeHtml(l)}</p>`).join(''));
  editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  return true;
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
  const label = n ? tn('btn_clean', n) : t(rich ? 'btn_rich' : 'btn_none');
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

// --- Reply with AI: a button in each post's action row (reply / repost / like) ---
// Nothing is read from a post until you click its button. Then its text, images and a few video frames go to
// background.js, which asks Claude with your own API key; the reply is cleaned and put in X's reply box for you to post.
const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5c.9 5.6 3.9 8.6 9.5 9.5-5.6.9-8.6 3.9-9.5 9.5-.9-5.6-3.9-8.6-9.5-9.5 5.6-.9 8.6-3.9 9.5-9.5z"/></svg>';
let replies = { on: false }; // on = feature enabled in settings and an API key is saved

function addReplyButton(article) {
  const row = article.querySelector('[data-testid="reply"]')?.closest('[role="group"]');
  if (!row || row.querySelector('.cleanai-reply')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cleanai-reply';
  btn.innerHTML = SPARK;
  btn.title = t('reply_button');
  btn.setAttribute('aria-label', t('reply_button'));
  btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); replyTo(article, btn); });
  row.append(btn);
}

async function replyTo(article, btn) {
  if (btn.classList.contains('cleanai-busy')) return;
  btn.classList.add('cleanai-busy');
  btn.classList.remove('cleanai-error');
  try {
    const post = await readPost(article);
    const res = await chrome.runtime.sendMessage({ type: 'cleanai:generate', input: { kind: 'reply', post } });
    if (!res?.ok) throw new Error(res?.error || 'API');
    const text = clean(res.text, settings.rules); // the reply goes through the same cleaner as everything you post
    if (!text.trim()) throw new Error('EMPTY');
    article.querySelector('[data-testid="reply"]').click(); // X opens its own reply box; you review and press Reply
    const editor = await waitFor(() => document.querySelector(`[role="dialog"] ${X_EDITOR}`) || document.activeElement?.closest?.(X_EDITOR), 4000);
    if (!editor || !(await pasteInto(editor, text))) throw new Error('NO_EDITOR');
  } catch (e) {
    btn.classList.add('cleanai-error');
    btn.title = t('reply_error_' + (e.message in ERRORS ? e.message : 'API'));
  } finally {
    btn.classList.remove('cleanai-busy');
  }
}
const ERRORS = { NO_KEY: 1, BAD_KEY: 1, RATE_LIMIT: 1, NETWORK: 1, REFUSAL: 1, NO_EDITOR: 1, EMPTY: 1, EMPTY_DRAFT: 1, API: 1 };

async function waitFor(fn, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 100))) {
    const v = fn();
    if (v) return v;
  }
  return null;
}

// The clicked post only. Quoted posts sit inside the article as their own block with a second tweetText.
async function readPost(article) {
  const texts = [...article.querySelectorAll('[data-testid="tweetText"]')];
  const author = (article.querySelector('[data-testid="User-Name"]')?.innerText.match(/@(\w{1,15})/) || [])[1];
  const images = [...article.querySelectorAll('[data-testid="tweetPhoto"] img[src*="pbs.twimg.com/media/"]')]
    .map(img => { const u = new URL(img.src); u.searchParams.set('name', 'small'); return u.href; });
  const video = article.querySelector('video');
  if (video?.poster?.startsWith('https://pbs.twimg.com/')) images.push(video.poster);
  const clip = video ? await videoFrames(video) : {};
  const link = article.querySelector('a[href*="/status/"] time')?.closest('a')?.getAttribute('href') || '';
  return {
    id: (link.match(/\/status\/(\d+)/) || [])[1], // lets background.js fetch the thread and other replies
    author,
    text: texts[0]?.innerText || '',
    quoted: texts[1]?.innerText || '',
    images: [...new Set(images)].slice(0, 4),
    frames: clip.frames || [],
    duration: clip.duration,
  };
}

// Frames spread across the video: { duration, frames: [{ data: JPEG base64, t: seconds }] }. X streams video through
// MediaSource, so the canvas isn't tainted (a plain cross-origin file is: then only the poster image goes).
// A seek into a part X hasn't downloaded yet takes a moment: wait until that frame is really there, and drop it
// rather than send the previous frame twice.
async function videoFrames(video, count = 8) {
  if (!(video.duration > 0) || !isFinite(video.duration) || !video.videoWidth) return {};
  const scale = Math.min(1, 768 / video.videoWidth);
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(video.videoWidth * scale), height: Math.round(video.videoHeight * scale) });
  const ctx = canvas.getContext('2d');
  const was = { time: video.currentTime, paused: video.paused };
  const frames = [];
  let last = '';
  video.pause();
  try {
    for (let i = 0; i < count; i++) {
      if (!(await seek(video, video.duration * (i + 0.5) / count))) continue;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]; // throws on a tainted canvas
      if (data !== last) frames.push({ data, t: Math.round(video.currentTime * 10) / 10 });
      last = data;
    }
  } catch { /* keep the frames we got */ }
  await seek(video, was.time);
  if (!was.paused) video.play().catch(() => {});
  return { duration: video.duration, frames };
}

// True once the frame at `time` can be drawn, false if it doesn't arrive within 4 s.
const seek = (video, time) => new Promise(resolve => {
  const done = ok => { clearTimeout(timer); video.removeEventListener('seeked', onSeeked); video.removeEventListener('canplay', onReady); resolve(ok); };
  const onReady = () => done(true);
  const onSeeked = () => (video.readyState >= 2 ? done(true) : video.addEventListener('canplay', onReady)); // 2 = this frame is decoded
  const timer = setTimeout(() => done(false), 4000);
  video.addEventListener('seeked', onSeeked);
  video.currentTime = time;
});

// Images the user attached in the post box are local blob: pictures; Claude needs them as data.
function imageData(img, max = 1024) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * s), height: Math.round(img.naturalHeight * s) });
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
}

// --- Write with AI: a button in the post box. Your draft (an idea, notes, any language) + your attached media
// become a post in your voice. In a reply box under a post, it writes the reply, following your draft if you typed one.
function addWriteButton(bar, eraser) {
  let box = bar;
  while (box && !box.querySelector(X_EDITOR)) box = box.parentElement;
  const wrap = document.createElement('div');
  wrap.className = 'cleanai-wrap cleanai-write';
  wrap.setAttribute('role', 'presentation');
  wrap.innerHTML = `<button type="button" class="cleanai-btn">${SPARK}</button>`;
  const btn = wrap.firstChild;
  btn.title = t('write_button');
  btn.setAttribute('aria-label', t('write_button'));
  btn.addEventListener('mousedown', e => e.preventDefault()); // keep the cursor in the editor
  btn.addEventListener('click', async e => {
    e.preventDefault();
    if (btn.classList.contains('cleanai-busy')) return;
    btn.classList.add('cleanai-busy');
    btn.classList.remove('cleanai-error');
    btn.title = t('write_button');
    try {
      const editor = (box || document).querySelector(X_EDITOR);
      if (!editor) throw new Error('NO_EDITOR');
      const draft = readText(editor).trim();
      const article = bar.closest('[role="dialog"]')?.querySelector('article[data-testid="tweet"]');
      let input;
      if (article) {
        input = { kind: 'reply', post: await readPost(article), draft };
      } else {
        const images = [...(box || bar).querySelectorAll('[data-testid="attachments"] img, img[src^="blob:"]')]
          .filter(img => img.naturalWidth > 40).slice(0, 4).map(img => (img.src.startsWith('https://') ? img.src : imageData(img)));
        const video = (box || bar).querySelector('video');
        const clip = video ? await videoFrames(video) : {};
        if (!draft && !images.length && !clip.frames?.length) throw new Error('EMPTY_DRAFT');
        input = { kind: 'post', draft, media: { images: [...new Set(images)], frames: clip.frames || [], duration: clip.duration } };
      }
      const res = await chrome.runtime.sendMessage({ type: 'cleanai:generate', input });
      if (!res?.ok) throw new Error(res?.error || 'API');
      const text = clean(res.text, settings.rules);
      if (!text.trim()) throw new Error('EMPTY');
      if (!(await pasteInto(editor, text))) throw new Error('NO_EDITOR'); // Cmd+Z brings your draft back
    } catch (err) {
      btn.classList.add('cleanai-error');
      btn.title = t('reply_error_' + (err.message in ERRORS ? err.message : 'API'));
    } finally {
      btn.classList.remove('cleanai-busy');
    }
  });
  eraser.after(wrap);
}

function scan() {
  for (const bar of document.querySelectorAll('[data-testid="toolBar"]')) {
    const wrap = bar.querySelector('.cleanai-wrap:not(.cleanai-write)');
    const write = bar.querySelector('.cleanai-write');
    if (!settings.enabled) { wrap?.remove(); write?.remove(); continue; }
    const eraser = wrap || addXButton(bar); // re-added if X re-renders the toolbar
    updateBadge(eraser);
    if (replies.on && !write) addWriteButton(bar, eraser);
    else if (!replies.on) write?.remove();
  }
  if (focused) placeFloater(); // badge + position follow typing (the editor grows)
  if (replies.on && settings.enabled) document.querySelectorAll('article[data-testid="tweet"]').forEach(addReplyButton);
  else document.querySelectorAll('.cleanai-reply').forEach(b => b.remove());
}

let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; scan(); });
}).observe(document.body, { childList: true, subtree: true, characterData: true }); // characterData = typing

chrome.storage.sync.get({ enabled: true, rules: {} }).then(s => { settings = sanitizeSettings(s); scan(); });
const readReplies = () => Promise.all([chrome.storage.sync.get({ replies: true }), chrome.storage.local.get({ hasKey: false })])
  .then(([s, l]) => { replies = { on: s.replies !== false && l.hasKey === true }; scan(); });
readReplies();
chrome.storage.onChanged.addListener((changes, area) => {
  if ('replies' in changes || 'hasKey' in changes) readReplies();
  if (area !== 'sync') return;
  const next = { ...settings };
  for (const key of ['enabled', 'rules']) if (key in changes) next[key] = changes[key].newValue;
  settings = sanitizeSettings(next);
  scan();
});
