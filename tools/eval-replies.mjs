// Does the reply sound like the user and get the post? Measured on the user's own real replies, held out.
//   node tools/eval-replies.mjs <voice folder> [max items]
// For each real reply (Oct 2026, the user's own voice per VOICE.md) it hides that reply from the voice profile,
// generates replies to the same post three ways, and a blind judge (Opus) scores them next to the real one:
//   A  voice notes + posts (what shipped until 3.4)
//   B  A + post -> reply pairs from the user's history
//   C  B + live X context: author bio, thread above, other replies (twitterapi.io via ../x.sh)
//   D  C with the voice-first reply prompt below (the shipped REPLY since 3.5; A-C use it too now, so pass
//      opts.reply with an older prompt to compare against it)
// X data is cached in <voice folder>/corpus/eval_context.json so reruns cost only the Claude calls.
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRequest, replyText } from '../reply-prompt.js';
import { buildVoice } from '../voice-import.js';

const [dir, maxArg] = process.argv.slice(2);
const MAX = Number(maxArg) || 20;
const XSH = join(dir, '..', '..', 'x.sh');
const read = p => readFileSync(join(dir, p), 'utf8');
const jsonl = p => read(p).split('\n').filter(Boolean).map(l => JSON.parse(l));

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic()
  : new Anthropic({ authToken: execFileSync('ant', ['auth', 'print-credentials', '--access-token']).toString().trim() });
const OAUTH = process.env.ANTHROPIC_API_KEY ? [] : ['oauth-2025-04-20'];

const self = jsonl('corpus/self.jsonl');
const pairs = jsonl('corpus/reply_pairs.jsonl');
const notes = read('VOICE.md');
const strip = t => t.replace(/^(@\w+\s*)+/, '').replace(/https?:\/\/\S+/g, '').trim();

// The eval set: October replies that are real answers (not a bare link, not in the user's own thread).
const items = pairs.filter(p => p.created.includes('Oct') && !/https?:\/\//.test(p.reply) && strip(p.reply).length >= 8 && /\/status\/(\d+)/.test(p.post_url || '')).slice(-MAX);

// --- X context, cached ---
const cachePath = join(dir, 'corpus', 'eval_context.json');
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const x = (ep, args) => JSON.parse(execFileSync(XSH, [ep, ...Object.entries(args).map(([k, v]) => `${k}=${v}`)]).toString() || '{}');
for (const p of items) {
  const id = p.post_url.match(/\/status\/(\d+)/)[1];
  if (cache[id]) continue;
  const post = x('tweets', { tweet_ids: id }).tweets?.[0] || {};
  const thread = post.inReplyToId ? (x('tweets', { tweet_ids: post.inReplyToId }).tweets || []) : [];
  const rep = x('tweet/replies/v2', { tweetId: id, queryType: 'Likes' });
  const others = (rep.tweets || rep.data?.tweets || []).filter(t => t.id !== id && t.author?.userName?.toLowerCase() !== 'handsher_ngu');
  cache[id] = {
    bio: post.author?.description || p.post_author_bio || '',
    thread: thread.map(t => ({ author: t.author?.userName, text: t.text || '' })),
    replies: others.slice(0, 15).map(t => ({ author: t.author?.userName, text: strip(t.text || ''), likes: t.likeCount || 0 })).filter(r => r.text),
  };
  writeFileSync(cachePath, JSON.stringify(cache, null, 1));
}

// --- generation ---
// D: the reply prompt rewritten voice-first (understanding shows in what you react to, not in length)
const VOICE_FIRST = `You write one reply to a post on X, as the user. Output only the reply text: no quotes around it, no preamble, no alternatives.

Start from the post's point: work out what the author is actually saying or asking and what they would want to hear back. Images and video are evidence for it: read them closely.

Then answer the way the user answers people (see "How I replied to real posts" in the voice): the same length, usually one short line; the same directness and warmth; the same kind of thing they pick up on. The understanding shows in what you react to, not in how much you write: a short reply that gets the point beats a clever one. Don't try to be witty or insightful unless that is how the user replies. If the user wrote what they want to say, say that. Reply in the language of the post.`;

async function generate(input, voice, opts) {
  const req = buildRequest(input, voice, opts);
  req.betas = [...req.betas, ...OAUTH];
  return replyText(await client.beta.messages.create(req));
}

const JUDGE = `You judge replies on X written for one specific person. You get examples of how this person really replies, a post, and several candidate replies to it in random order. One of the candidates may be the person's real reply.

Score every candidate from 1 to 10 on:
- voice: would this person write exactly this? Compare with the examples: length, slang, punctuation, what they pick up on, how direct they are. Polished or "assistant-like" text scores low even if it is good.
- understanding: does it get what the post is actually saying or asking (including its images)?
- value: does it add something real (an observation, a take, a tip, a joke on a specific detail, a real question)? Generic reactions score low.
Then guess which candidate the person really wrote.`;

const SCHEMA = {
  type: 'object',
  properties: {
    scores: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, voice: { type: 'integer' }, understanding: { type: 'integer' }, value: { type: 'integer' } }, required: ['id', 'voice', 'understanding', 'value'], additionalProperties: false } },
    real_guess: { type: 'integer' },
  },
  required: ['scores', 'real_guess'],
  additionalProperties: false,
};

async function judge(item, candidates, refs) {
  const order = candidates.map((c, i) => ({ ...c, id: i + 1 })).sort(() => Math.random() - 0.5);
  const res = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    betas: OAUTH,
    system: JUDGE,
    messages: [{ role: 'user', content: [
      ...(item.post_media || []).slice(0, 4).map(url => ({ type: 'image', source: { type: 'url', url } })),
      { type: 'text', text: [
        '<how_this_person_replies>', refs.map(r => `post: ${r.post.slice(0, 200).replace(/\n+/g, ' / ')}\nthem: ${strip(r.reply).replace(/\n+/g, ' / ')}`).join('\n\n'), '</how_this_person_replies>',
        `<post author="@${item.post_author}" bio="${(item.post_author_bio || '').replace(/"/g, "'")}">\n${item.post}\n</post>`,
        '<candidates>', order.map(c => `${c.id}: ${c.text.replace(/\n+/g, ' / ')}`).join('\n'), '</candidates>',
      ].join('\n') },
    ] }],
  });
  const out = JSON.parse(res.content.find(b => b.type === 'text').text);
  return { scores: Object.fromEntries(out.scores.map(s => [order.find(c => c.id === s.id).name, s])), guessed: order.find(c => c.id === out.real_guess)?.name };
}

// --- run ---
const totals = {};
const rows = [];
for (const [n, item] of items.entries()) {
  const id = item.post_url.match(/\/status\/(\d+)/)[1];
  // hide the held-out reply everywhere the model could see it
  const selfRows = self.filter(r => r.id !== item.id).map(r => JSON.stringify(r)).join('\n');
  const pairRows = pairs.filter(r => r.id !== item.id).map(r => JSON.stringify(r)).join('\n');
  const voiceA = buildVoice([{ name: 'VOICE.md', text: notes }, { name: 'self.jsonl', text: selfRows }]).text;
  const voiceB = buildVoice([{ name: 'VOICE.md', text: notes }, { name: 'self.jsonl', text: selfRows }, { name: 'reply_pairs.jsonl', text: pairRows }]).text;
  const post = { author: item.post_author, text: item.post, images: (item.post_media || []).map(u => u + '?name=small') };
  const [A, B, C, D] = await Promise.all([
    generate({ kind: 'reply', post }, voiceA),
    generate({ kind: 'reply', post }, voiceB),
    generate({ kind: 'reply', post, context: cache[id] }, voiceB),
    generate({ kind: 'reply', post, context: cache[id] }, voiceB, { reply: VOICE_FIRST }),
  ]);
  const real = strip(item.reply);
  const refs = pairs.filter(r => r.id !== item.id && r.created.includes('Oct')).slice(-15);
  const { scores, guessed } = await judge(item, [{ name: 'A', text: A }, { name: 'B', text: B }, { name: 'C', text: C }, { name: 'D', text: D }, { name: 'real', text: real }], refs);
  for (const [k, s] of Object.entries(scores)) {
    totals[k] ??= { voice: 0, understanding: 0, value: 0, n: 0, guessedAsReal: 0 };
    totals[k].voice += s.voice; totals[k].understanding += s.understanding; totals[k].value += s.value; totals[k].n++;
  }
  if (guessed) totals[guessed].guessedAsReal++;
  rows.push({ post: item.post.slice(0, 120), real, A, B, C, D, scores, guessed });
  console.log(`\n[${n + 1}/${items.length}] @${item.post_author}: ${item.post.slice(0, 100).replace(/\n+/g, ' / ')}`);
  for (const [k, t] of [['real', real], ['A', A], ['B', B], ['C', C], ['D', D]]) {
    const s = scores[k];
    console.log(`  ${k.padEnd(4)} v${s.voice} u${s.understanding} val${s.value}${guessed === k ? '  <- judge: real' : ''}  ${t.replace(/\n+/g, ' / ')}`);
  }
}
console.log('\n=== averages (1-10) over', items.length, 'held-out replies ===');
for (const [k, t] of Object.entries(totals)) {
  console.log(`${k.padEnd(4)} voice ${(t.voice / t.n).toFixed(1)}  understanding ${(t.understanding / t.n).toFixed(1)}  value ${(t.value / t.n).toFixed(1)}  judged as the real one: ${t.guessedAsReal}/${t.n}`);
}
writeFileSync(join(dir, 'corpus', 'eval_results.json'), JSON.stringify({ totals, rows }, null, 1));
