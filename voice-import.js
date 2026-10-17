// Turns a folder of voice material into the "Your voice" text: notes (.md/.txt) as they are, the user's own posts
// from .jsonl files, and post -> reply pairs (how the user actually answers other people). It also measures the
// user's habits (length, emoji, "!", the ")" smile...) and reply moves, so each reply can be varied the way the
// user's real ones vary. Shared by options.js (the folder picker), tools/try-replies.mjs and tools/eval-replies.mjs.

export const VOICE_LIMIT = 60000; // ~15k tokens: cached after the first reply, so a long profile stays cheap
const MAX_PAIRS = 60;

// Phrases only AI drafts use (the same list as x-posting/voice/analyze.py): a post containing one isn't the user's voice.
const TELLS = ['turns out', 'the whole thing', "here's the thing", 'here is what', "that's the part", 'the real ', 'genuinely',
  'honestly,', 'quietly', "it's not just", 'not because', 'the gap', 'the part nobody', 'nobody talks about', 'nobody warns',
  'let that sink in', 'game changer', 'game-changer', 'in a world', 'deserves', "that's it.", 'the difference is',
  'what that looks like', 'honest question', 'genuine question', 'be honest:', 'am i the only one'];

// A post the user wrote, as a style example, or null when it would teach the wrong thing: AI phrases, long dashes,
// essays, and 2+ lines ending in a period (the same tell voice_check.py fails on).
function own(text) {
  const t = text.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
    .replace(/^(@\w+\s*)+/, '').replace(/https?:\/\/\S+/g, '').trim();
  const periods = t.split('\n').filter(l => l.trimEnd().endsWith('.')).length;
  const low = t.toLowerCase();
  return t.length >= 2 && t.length <= 280 && !/[—–]/.test(t) && periods < 2 && !TELLS.some(x => low.includes(x)) ? t : null;
}

const EMOJI = /\p{Extended_Pictographic}/u;

// The habits we vary per reply. Measured on the user's texts, then sampled at those rates.
export function habits(t) {
  return {
    smile: (t.match(/\)/g) || []).length > (t.match(/\(/g) || []).length, // the ")" smile, not a closing bracket
    emoji: EMOJI.test(t),
    exclaim: t.includes('!'),
    lines: /\n\s*\S/.test(t.trim()),
    dots: /\.\.\.|…/.test(t),
    slang: /\b(u|ur|bro|man|rn|wtf|lol)\b/i.test(t),
    lower: /^[a-z]/.test(t),
  };
}

function measure(texts) {
  if (!texts.length) return null;
  const rates = {};
  for (const h of texts.map(habits)) for (const [k, v] of Object.entries(h)) rates[k] = (rates[k] || 0) + (v ? 1 : 0);
  for (const k in rates) rates[k] = Math.round((rates[k] / texts.length) * 100) / 100;
  return { n: texts.length, lengths: texts.map(t => t.length).sort((a, b) => a - b), rates };
}

const oneLine = t => t.replace(/\s*\n+\s*/g, ' / ');

// Only the last 12 months before the newest item: people change how they write (an old crypto-era account full of
// "LFG" and hashtags would pull replies back to a style the user left). Newest first, duplicates dropped.
function recent(items, key) {
  const newest = Math.max(0, ...items.map(i => i.when));
  const kept = items.filter(i => !i.when || !newest || newest - i.when <= 365 * 864e5).sort((a, b) => b.when - a.when);
  return [...new Map(kept.map(i => [key(i), i])).values()];
}

// files: [{ name, text }].
// jsonl rows: { text, src?, created?, reply? } = a post (rows with a "src" count only when src is "self": a corpus
// that also holds other people's posts marks the user's own that way),
// or { post, reply, post_author?, created?, move? } = a pair (move: what kind of reply it is, e.g. "hype", "question").
export function buildVoice(files) {
  const notes = [];
  const posts = [];
  const pairs = [];
  for (const { name, text } of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    if (/\.(md|txt)$/i.test(name)) {
      if (text.trim()) notes.push(`# ${name}\n${text.trim()}`);
    } else if (/\.jsonl$/i.test(name)) {
      for (const line of text.split('\n')) {
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        const when = Date.parse(row?.created) || 0;
        if (typeof row?.post === 'string' && typeof row?.reply === 'string') {
          const reply = own(row.reply);
          const post = row.post.replace(/https?:\/\/\S+/g, '').trim();
          if (reply && post) pairs.push({ post: post.slice(0, 280), author: row.post_author, reply, move: row.move, when });
        } else if (typeof row?.text === 'string' && (!('src' in row) || row.src === 'self')) {
          const t = own(row.text);
          if (t) posts.push({ t, when, isReply: row.reply === true });
        }
      }
    }
  }
  const mine = recent(posts, p => p.t);
  const replies = recent(pairs, p => p.reply);

  // how the user's replies and posts vary: replies from the pairs when there are some, else from the user's own replies
  const replyTexts = replies.length ? replies.map(p => p.reply) : mine.filter(p => p.isReply).map(p => p.t);
  const moves = {};
  for (const p of replies) {
    if (!p.move) continue;
    const m = (moves[p.move] ??= { n: 0, examples: [], lengths: [] });
    m.n++;
    m.lengths.push(p.reply.length);
    if (m.examples.length < 3) m.examples.push({ post: p.post.slice(0, 160), reply: p.reply });
  }
  for (const m of Object.values(moves)) m.len = m.lengths.sort((a, b) => a - b)[m.lengths.length >> 1]; // typical length of this kind
  const profile = { replies: measure(replyTexts), posts: measure(mine.filter(p => !p.isReply).map(p => p.t)), moves };

  let out = notes.join('\n\n');
  if (replies.length) {
    out += `\n\n# How I replied to real posts, newest first. This is the best guide to my reply style: how long, how direct, what I pick up on. Copy the manner, never the facts or numbers.\n`
      + replies.slice(0, MAX_PAIRS).map(p => `post${p.author ? ` by @${p.author}` : ''}: ${oneLine(p.post)}\nme: ${oneLine(p.reply)}`).join('\n\n');
  }
  if (mine.length) {
    out += `\n\n# Posts and replies I wrote, newest first (style examples: copy how they're written, never the facts, numbers or stories in them, which may be old)\n`
      + mine.map(p => '- ' + oneLine(p.t)).join('\n');
  }
  return { text: out.slice(0, VOICE_LIMIT).trim(), notes: notes.length, posts: mine.length, pairs: Math.min(replies.length, MAX_PAIRS), profile };
}
