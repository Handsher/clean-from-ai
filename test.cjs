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
