// Service worker: the only part of the extension that uses the network, and only when you click "Reply with AI"
// under a post, "Write with AI" in the post box, or "Test key" in settings. It calls Claude with YOUR API key.

import Anthropic from './vendor/anthropic.js';
import { MODEL, buildRequest, replyText } from './reply-prompt.js';

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
  const { voice } = await chrome.storage.local.get({ voice: '' });
  const res = await (await client()).beta.messages.create(buildRequest(input, voice));
  return { text: replyText(res), usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
}

async function test() {
  const anthropic = await client();
  const m = await anthropic.models.retrieve(MODEL); // free call: proves the key works and can see the model
  return { model: m.id };
}
