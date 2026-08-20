# Bell Ringer — BBA Business Quiz Trainer

A tiny, static, no-build website for practicing business-quiz questions ahead of
the SSASIT vs Amroli inter-college BBA quiz. Pure HTML/CSS/JS — no frameworks,
no backend, works straight off GitHub Pages.

## What it does

- Loads questions from `questions.json`, grouped into "boards" (categories:
  Business Terms, Marketing, Finance, Founders, Taglines, GDP/Economy,
  Accounting, Numerical problems, etc.)
- **Flashcard mode**: question → reveal answer → mark yourself right/wrong
- **Shuffled drill mode**: same thing, but questions are randomized each run
- Live scoreboard tracks correct/missed as you go
- End-of-session summary with your % score

## Run it locally

No install needed. Just open `index.html` in a browser, or serve it locally:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

(Opening `index.html` directly via `file://` also works in most browsers,
but a local server avoids any fetch/CORS quirks with `questions.json`.)

## Deploy to GitHub Pages (free hosting)

1. Push this repo to GitHub (see commands below).
2. Go to your repo → **Settings → Pages**.
3. Under "Build and deployment", set **Source: Deploy from a branch**,
   branch: `main`, folder: `/ (root)`.
4. Save. GitHub gives you a live URL like:
   `https://<your-username>.github.io/bba-quiz-practice/`
5. Wait ~1 minute, then visit that URL — it's live and practice-ready.

## Add or edit questions

Everything lives in `questions.json`. Each category looks like:

```json
{
  "id": "finance",
  "name": "Finance & Economics",
  "questions": [
    { "q": "What is 'liquidity'?", "a": "The ease with which an asset can be converted to cash" }
  ]
}
```

Add a new question by adding another `{ "q": "...", "a": "..." }` object to
any category's `questions` array — or add a whole new category object to
the top-level `categories` array. No code changes needed; the site reads the
file at runtime.

## Project structure

```
bba-quiz-practice/
├── index.html       # page structure
├── style.css         # ticker/newspaper-inspired theme
├── script.js         # quiz logic (fetch, shuffle, scoring)
├── questions.json    # all quiz content — edit this to add rounds
└── README.md
```

## Roadmap ideas (optional, for later)

- Add a countdown timer per question to simulate real quiz pressure
- Track weak categories across sessions using `localStorage`
- Add a "rapid fire" mode with a fixed time limit per question
