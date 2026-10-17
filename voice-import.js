// Turns a folder of voice material into the "Your voice" text: notes (.md/.txt) as they are, the user's own posts
// from .jsonl files, and post -> reply pairs (how the user actually answers other people). Shared by options.js
// (the folder picker), tools/try-replies.mjs and tools/eval-replies.mjs.

export const VOICE_LIMIT = 60000; // ~15k tokens: cached after the first reply, so a long profile stays cheap
const MAX_PAIRS = 60;

// A post the user wrote, as a style example, or null when it would teach the wrong thing:
// essays and long dashes are mostly drafts written with AI, and 2+ lines ending in a period is the same tell
// voice_check.py fails on.
function own(text) {
  const t = text.replace(/^(@\w+\s*)+/, '').replace(/https?:\/\/\S+/g, '').trim();
  const periods = t.split('\n').filter(l => l.trimEnd().endsWith('.')).length;
  return t.length >= 3 && t.length <= 280 && !/[—–]/.test(t) && periods < 2 ? t : null;
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
// jsonl rows: { text, src?, created? } = a post (rows with a "src" count only when src is "self": a corpus that also
// holds other people's posts marks the user's own that way), or { post, reply, post_author?, created? } = a pair.
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
          if (reply && post) pairs.push({ post: post.slice(0, 280), author: row.post_author, reply, when });
        } else if (typeof row?.text === 'string' && (!('src' in row) || row.src === 'self')) {
          const t = own(row.text);
          if (t) posts.push({ t, when });
        }
      }
    }
  }
  const mine = recent(posts, p => p.t).map(p => p.t);
  const replies = recent(pairs, p => p.reply).slice(0, MAX_PAIRS);
  let out = notes.join('\n\n');
  if (replies.length) {
    out += `\n\n# How I replied to real posts, newest first. This is the best guide to my reply style: how long, how direct, what I pick up on. Copy the manner, never the facts or numbers.\n`
      + replies.map(p => `post${p.author ? ` by @${p.author}` : ''}: ${oneLine(p.post)}\nme: ${oneLine(p.reply)}`).join('\n\n');
  }
  if (mine.length) {
    out += `\n\n# Posts and replies I wrote, newest first (style examples: copy how they're written, never the facts, numbers or stories in them, which may be old)\n`
      + mine.map(t => '- ' + oneLine(t)).join('\n');
  }
  return { text: out.slice(0, VOICE_LIMIT).trim(), notes: notes.length, posts: mine.length, pairs: replies.length };
}
