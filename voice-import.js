// Turns a folder of voice material into the "Your voice" text: notes (.md/.txt) as they are, plus the user's own
// posts from .jsonl files. Shared by options.js (the folder picker) and tools/try-replies.mjs.

export const VOICE_LIMIT = 60000; // ~15k tokens: cached after the first reply, so a long profile stays cheap

// files: [{ name, text }]. jsonl rows need a "text" field; rows with a "src" field count only when src is "self"
// (a corpus that also holds other people's posts marks the user's own that way).
export function buildVoice(files) {
  const notes = [];
  const posts = [];
  for (const { name, text } of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    if (/\.(md|txt)$/i.test(name)) {
      if (text.trim()) notes.push(`# ${name}\n${text.trim()}`);
    } else if (/\.jsonl$/i.test(name)) {
      for (const line of text.split('\n')) {
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        if (typeof row?.text !== 'string' || ('src' in row && row.src !== 'self')) continue; // other people: not your voice
        const t = row.text.replace(/^(@\w+\s*)+/, '').replace(/https?:\/\/\S+/g, '').trim();
        // essays and long dashes are mostly drafts written with AI: they would teach the opposite of the goal
        if (t.length >= 3 && t.length <= 280 && !/[—–]/.test(t)) posts.push({ t, when: Date.parse(row.created) || 0 });
      }
    }
  }
  // only the last 12 months before the newest post: people change how they write (an old crypto-era account
  // full of "LFG" and hashtags would pull replies back to a style the user left)
  const newest = Math.max(0, ...posts.map(p => p.when));
  const recent = posts.filter(p => !p.when || !newest || newest - p.when <= 365 * 864e5);
  const mine = [...new Map(recent.sort((a, b) => b.when - a.when).map(p => [p.t, p])).values()].map(p => p.t); // newest first
  let out = notes.join('\n\n');
  if (mine.length) out += `\n\n# Posts and replies I actually wrote, newest first\n` + mine.map(t => '- ' + t.replace(/\s*\n+\s*/g, ' / ')).join('\n');
  return { text: out.slice(0, VOICE_LIMIT).trim(), notes: notes.length, posts: mine.length };
}
