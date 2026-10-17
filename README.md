# Clean from AI

Browser extension that strips hidden AI watermark characters and AI-style typography from the posts you write on X and Typefully, or from any text you paste.

- **Hidden characters** — zero-width spaces, Unicode tag characters, variation selectors.
- **Typography** — long dashes → `-`, curly quotes → `"` `'`, bullets → `-`, 𝐛𝐨𝐥𝐝 letters → plain.
- **Live counter** — a badge on the eraser button shows how many AI tells are in your draft.
- **Popup** — paste any text, clean it, copy it. Switch any rule group off.
- **Reply with AI** — a ✦ button under every post on X. Claude Opus 5.5 reads the post, its images and 4 frames from its video, writes a reply in your voice, the cleaner cleans it, and it lands in X's reply box. You post it yourself. Needs your own Anthropic API key (about 1 cent per reply).
- **15 languages** — English, Ukrainian, German, French, Spanish, Portuguese (BR), Italian, Polish, Dutch, Turkish, Japanese, Korean, Chinese (Simplified), Hindi, Indonesian. Add one by copying `_locales/en`.

Cleaning is fully offline. The only network call is the AI reply you click, straight to `api.anthropic.com` with your key. [Privacy policy](https://handsher.github.io/clean-from-ai/) · [Security audit](SECURITY-AUDIT.md)

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
| `test.cjs` | `node test.cjs` — checks the rules on emoji, flags, Ukrainian, watermarks. |
| `background.js`, `reply-prompt.js` | The AI reply: the Claude request (prompt, images, frames) and the API call. |
| `options.html/js/css` | Settings: API key, your voice, AI replies on/off. |
| `vendor/anthropic.js` | Anthropic's official SDK, bundled (`npm ci && npm run build`). |
| `tools/try-replies.mjs` | Try the reply prompt on real posts from the terminal. |
| `docs/` | The privacy policy page (GitHub Pages). |

## License

MIT
