// node test.cjs  (or npm test)
const assert = require('assert');
// clean.js is a plain browser script; package.json's "type": "module" stops require() from seeing its exports, so load it by hand.
const loaded = { exports: {} };
new Function('module', require('fs').readFileSync(require('path').join(__dirname, 'clean.js'), 'utf8'))(loaded);
const { clean, analyze, sanitizeSettings } = loaded.exports;

// settings from storage: only booleans and known rule names survive
assert.deepEqual(sanitizeSettings(undefined), { enabled: true, rules: {} });
assert.deepEqual(sanitizeSettings({ enabled: 'yes', rules: null }), { enabled: true, rules: {} });
assert.deepEqual(sanitizeSettings({ enabled: false, rules: { quotes: false, bogus: false, dashes: 'off' } }), { enabled: false, rules: { quotes: false } });
assert.equal(sanitizeSettings(JSON.parse('{"rules":{"__proto__":{"x":1}}}')).rules.x, undefined);

assert.equal(clean('hi​there﻿'), 'hithere');
assert.equal(clean('a b c'), 'a b c');
assert.equal(clean('this — that'), 'this - that');
assert.equal(clean('this—that'), 'this - that');
assert.equal(clean('pages 10–20'), 'pages 10-20');
assert.equal(clean('“quoted” it’s «ok»'), '"quoted" it\'s "ok"');
assert.equal(clean('wait…'), 'wait...');
assert.equal(clean('𝐛𝐨𝐥𝐝'), 'bold');
assert.equal(clean('• one\n• two'), '- one\n- two');
assert.equal(clean('x\u{E0041}\u{E0042}y'), 'xy'); // hidden tag text
assert.equal(clean('a\u{E0101}b'), 'ab');
assert.equal(clean('й'), 'й'); // decomposed Ukrainian letter gets composed, not dropped
// must not break emoji, flags, Ukrainian
for (const keep of ['👨‍👩‍👧', '❤️', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '👍🏽', 'їжак й ґанок', 'line1\n\nline2'])
  assert.equal(clean(keep), keep);

// counting and switching groups off
assert.equal(analyze('it’s — “x”​').count, 5);
assert.equal(analyze('plain text').count, 0);
assert.equal(clean('“x” — y', { quotes: false }), '“x” - y');
assert.equal(clean('“x” — y', { dashes: false, quotes: false }), '“x” — y');
console.log('ok');

// voice folder import: own posts only, no AI-ish essays, only the last 12 months
import('./voice-import.js').then(({ buildVoice }) => {
  const row = (text, src, created) => JSON.stringify({ text, src, created });
  const v = buildVoice([
    { name: 'VOICE.md', text: 'short, lowercase' },
    { name: 'posts.jsonl', text: [
      row('@bob nice one)', 'self', 'Fri Oct 16 12:00:00 +0000 2026'),
      row('someone else wrote this', 'circle', 'Fri Oct 16 12:00:00 +0000 2026'),
      row('an essay — written with AI', 'self', 'Fri Oct 16 12:00:00 +0000 2026'),
      row('GM yappers #MEME', 'self', 'Mon Jan 17 12:00:00 +0000 2024'),
      row('opened the analytics.\n43.5K impressions.\nwe keep going.', 'self', 'Fri Oct 16 12:00:00 +0000 2026'),
      'not json',
    ].join('\n') },
    { name: 'script.py', text: 'print(1)' },
  ]);
  assert.equal(v.notes, 1);
  assert.equal(v.posts, 1);
  assert.ok(v.text.includes('- nice one)') && !/someone else|essay|yappers|print|43\.5K/.test(v.text));
  console.log('voice import ok');
});

// per-reply style: 3 different reply kinds, never one that needs the user's own media, habits at the measured rates
import('./reply-prompt.js').then(({ pickStyle }) => {
  const profile = {
    replies: { n: 10, lengths: [10, 20, 40], rates: { smile: 0.1, emoji: 0.5 } },
    moves: { hype: { n: 5, len: 40, examples: [] }, agree: { n: 3, len: 10, examples: [] }, question: { n: 2, len: 60, examples: [] }, self_share: { n: 50, examples: [] } },
  };
  let smiles = 0;
  for (let i = 0; i < 2000; i++) {
    const s = pickStyle(profile, 'reply');
    assert.equal(new Set(s.moves.map(m => m.move)).size, 3);
    assert.ok(!s.moves.some(m => m.move === 'self_share'));
    smiles += s.use.smile;
  }
  assert.ok(smiles > 120 && smiles < 280, 'smile rate ~10%: ' + smiles);
  assert.equal(pickStyle(null, 'reply'), null);
  assert.equal(pickStyle({ replies: profile.replies }, 'post'), null); // no measured posts: no post style
  console.log('style ok');
});
