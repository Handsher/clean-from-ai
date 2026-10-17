// Service worker: the only part of the extension that uses the network, and only when you click "Reply with AI"
// under a post, "Write with AI" in the post box, or "Test key" in settings. It calls Claude with YOUR API key.

import Anthropic from './vendor/anthropic.js';
import { MODEL, buildRequest, pickStyle, replyText } from './reply-prompt.js';

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (sender.id !== chrome.runtime.id) return; // only our own content script and pages
  if (msg?.type === 'cleanai:generate') run(() => generate(msg.input), send);
  else if (msg?.type === 'cleanai:test') run(test, send);
  else return;
  return true; // answer asynchronously
});

function run(job, send) {
  job().then(r => send({ ok: true, ...r }), e => send({ ok: false, error: errorCode(e), detail: String(e?.message || e).slice(0, 300) }));
}

function errorCode(e) {
  if (e?.message === 'NO_KEY') return 'NO_KEY';
  if (e?.message === 'REFUSAL') return 'REFUSAL';
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'BAD_KEY';
  if (e instanceof Anthropic.RateLimitError) return 'RATE_LIMIT';
  if (e instanceof Anthropic.APIConnectionError) return 'NETWORK';
  return 'API';
}

async function client() {
  const { apiKey } = await chrome.storage.local.get({ apiKey: '' });
  if (!apiKey) throw new Error('NO_KEY');
  // dangerouslyAllowBrowser: the key is the user's own and lives only in this extension's local storage, never in a web page.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

async function generate(input) {
  const { voice, xKey, voiceProfile } = await chrome.storage.local.get({ voice: '', xKey: '', voiceProfile: null });
  const anthropic = await client();
  input = { ...input, style: pickStyle(voiceProfile, input.kind) }; // vary kind, length and habits at the user's own rates
  if (input.kind === 'reply' && xKey && /^\d+$/.test(input.post?.id || '')) input = { ...input, context: await xContext(input.post.id, xKey) };
  const res = await anthropic.beta.messages.create(buildRequest(input, voice));
  return { text: replyText(res), usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
}

// Optional context from X (twitterapi.io, the user's own key): the author's bio, the post it answers, and the most
// liked replies so far. On held-out tests it lifted how well replies understood the post. Any failure here is
// ignored: the reply is still written, just without the extra context.
async function xContext(id, key) {
  const get = (path, params) => fetch(`https://api.twitterapi.io/twitter/${path}?${new URLSearchParams(params)}`, {
    headers: { 'X-API-Key': key }, signal: AbortSignal.timeout(6000),
  }).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  const strip = t => (t || '').replace(/^(@\w+\s*)+/, '').replace(/https?:\/\/\S+/g, '').trim();
  const [one, rep] = await Promise.all([get('tweets', { tweet_ids: id }), get('tweet/replies/v2', { tweetId: id, queryType: 'Likes' })]);
  const post = one.tweets?.[0];
  const parent = post?.inReplyToId ? (await get('tweets', { tweet_ids: post.inReplyToId })).tweets?.[0] : null;
  const replies = (rep.tweets || rep.data?.tweets || []).filter(t => t.id !== id).map(t => ({ author: t.author?.userName, text: strip(t.text), likes: t.likeCount || 0 })).filter(r => r.text);
  return {
    bio: post?.author?.description || '',
    thread: parent ? [{ author: parent.author?.userName, text: parent.text || '' }] : [],
    replies: replies.slice(0, 15),
  };
}

async function test() {
  const anthropic = await client();
  const m = await anthropic.models.retrieve(MODEL); // free call: proves the key works and can see the model
  return { model: m.id };
}
