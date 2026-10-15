// Strings live in _locales/<lang>/messages.json; Chrome picks the browser's UI language and falls back to English.
const t = (key, subs) => chrome.i18n.getMessage(key, subs);

// Counted strings: messages.json has one entry per plural form (btn_clean_one, btn_clean_few, ...).
const tn = (key, n) => {
  const form = new Intl.PluralRules(chrome.i18n.getUILanguage()).select(n);
  return t(`${key}_${form}`, [String(n)]) || t(`${key}_other`, [String(n)]);
};
