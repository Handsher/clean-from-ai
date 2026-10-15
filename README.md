# Clean from AI

Browser extension that strips hidden AI watermark characters and AI-style typography from the posts you write on X and Typefully, or from any text you paste.

- **Hidden characters** — zero-width spaces, Unicode tag characters, variation selectors.
- **Typography** — long dashes → `-`, curly quotes → `"` `'`, bullets → `-`, 𝐛𝐨𝐥𝐝 letters → plain.
- **Live counter** — a badge on the eraser button shows how many AI tells are in your draft.
- **Popup** — paste any text, clean it, copy it. Switch any rule group off.
- **15 languages** — English, Ukrainian, German, French, Spanish, Portuguese (BR), Italian, Polish, Dutch, Turkish, Japanese, Korean, Chinese (Simplified), Hindi, Indonesian. Add one by copying `_locales/en`.

No network code, no dependencies, no build step. One permission (`storage`). [Privacy policy](https://handsher.github.io/clean-from-ai/) · [Security audit](SECURITY-AUDIT.md)

## Install (unpacked)

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → pick this folder.
3. Open x.com or typefully.com and start writing. The eraser appears next to the post button.

## Files

| File | What it does |
|---|---|
| `clean.js` | The cleaning rules. Pure function, shared by everything. |
| `content.js` | Adds the eraser button to X and Typefully editors. |
| `popup.html/js/css` | The window that opens from the toolbar icon. |
| `test.js` | `node test.js` — checks the rules on emoji, flags, Ukrainian, watermarks. |
| `docs/` | The privacy policy page (GitHub Pages). |

## License

MIT
