// Turns "AI-looking" text into plain notepad text. Pure, shared by content.js, popup.js and test.js.
// Rules are grouped so each group can be switched off in the popup.
const RULES = {
  invisible: [ // hidden chars used as watermarks / ASCII smuggling
    [/[\u200B\u200C\u2060-\u2064\uFEFF\u00AD\u180E\u200E\u200F\u202A-\u202E\u2066-\u2069\uFE00-\uFE0D]/g, ''],
    [/[\u{E0100}-\u{E01EF}]/gu, ''], // variation-selector "emoji smuggling"
    [/(\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F})|[\u{E0000}-\u{E007F}]/gu, (m, flag) => flag || ''], // tag chars, except subdivision flags
    [/(?<![\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F])\u200D/gu, ''], // ZWJ, except inside emoji
  ],
  spaces: [
    [/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' '],
    [/[\u2028\u2029]/g, '\n'],
  ],
  dashes: [
    [/(\d)\s*\u2013\s*(\d)/g, (m, a, b) => a + '-' + b],
    [/[ \t]*[\u2014\u2013\u2015][ \t]*/g, ' - '],
  ],
  quotes: [
    [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
    [/[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g, '"'],
  ],
  bullets: [
    [/^[ \t]*[\u2022\u25CF\u25AA\u25E6\u2023\u2043][ \t]*/gm, '- '],
  ],
  fancy: [ // bold/italic math letters, fullwidth, ligatures, ellipsis -> plain
    [/[^\p{ASCII}\s]/gu, ch => ch.normalize('NFKC')],
  ],
};

// Returns the cleaned text and how many AI tells were replaced. `off` = { groupName: false } to skip a group.
function analyze(text, off = {}) {
  let count = 0;
  text = text.normalize('NFC'); // invisible: just composes letters typed as base + accent
  for (const group in RULES) {
    if (off[group] === false) continue;
    for (const [re, rep] of RULES[group]) {
      text = text.replace(re, (...m) => {
        const out = typeof rep === 'function' ? rep(...m) : rep;
        if (out !== m[0]) count++;
        return out;
      });
    }
  }
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '');
  return { text, count };
}

const clean = (text, off) => analyze(text, off).text;

// Settings come back from chrome.storage.sync; keep only the shape we wrote (booleans, known rule names).
function sanitizeSettings(s) {
  const rules = {};
  if (s && typeof s.rules === 'object' && s.rules) for (const k in RULES) if (s.rules[k] === false) rules[k] = false;
  return { enabled: !s || s.enabled !== false, rules };
}

if (typeof module !== 'undefined') module.exports = { clean, analyze, sanitizeSettings, RULES };
