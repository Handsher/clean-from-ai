// Try the reply prompt on real posts, outside the browser, with the exact request the extension sends.
//   node tools/try-replies.mjs posts.json voice.txt [voice_check.py]
// posts.json: [{ author, text, quoted?, images?: [url], frameFiles?: [jpg path] }]
// Auth: ANTHROPIC_API_KEY, or the `ant auth login` profile (OAuth) when no key is set.
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildRequest, replyText } from '../reply-prompt.js';

const [postsFile, voiceFile, voiceCheck] = process.argv.slice(2);
const posts = JSON.parse(readFileSync(postsFile, 'utf8'));
const voice = voiceFile ? readFileSync(voiceFile, 'utf8') : '';

const oauth = !process.env.ANTHROPIC_API_KEY;
const client = oauth
  ? new Anthropic({ authToken: execFileSync('ant', ['auth', 'print-credentials', '--access-token']).toString().trim() })
  : new Anthropic();

let cost = 0;
for (const p of posts) {
  const post = { ...p, frames: (p.frameFiles || []).map(f => readFileSync(resolve(dirname(postsFile), f)).toString('base64')) };
  const req = buildRequest(post, voice);
  if (oauth) req.betas = [...req.betas, 'oauth-2025-04-20'];
  const t0 = Date.now();
  const res = await client.beta.messages.create(req);
  const text = replyText(res);
  const u = res.usage;
  const dollars = ((u.input_tokens + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) * 4 + u.output_tokens * 20) / 1e6;
  cost += dollars;
  let check = '';
  if (voiceCheck) {
    try { check = execFileSync('python3', [voiceCheck, 'reply', text]).toString().split('\n')[0]; }
    catch (e) { check = e.stdout.toString().trim().replace(/\n/g, ' '); }
  }
  console.log(`\n@${p.author} [${post.images?.length || 0} img, ${post.frames.length} frames]: ${p.text.slice(0, 90).replace(/\n/g, ' ')}`);
  console.log(`  -> ${text}`);
  console.log(`     ${check}  ·  ${((Date.now() - t0) / 1000).toFixed(1)}s  ·  $${dollars.toFixed(4)}  ·  in ${u.input_tokens} out ${u.output_tokens}`);
}
console.log(`\ntotal $${cost.toFixed(3)} for ${posts.length} replies`);
