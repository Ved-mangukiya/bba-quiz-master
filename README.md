# Bell Ringer — Business Quiz Trainer (Financial Edition)

A high-performance, mobile-first business quiz practice arena engineered for **SSASIT** students participating in the **Amroli College Inter-College Business Quiz Competition**.

Curated and built by **Ved Mangukiya** (BBA Student, Surat, Gujarat).

---

## 🌟 Key Features

1. **360 Curated Master Questions (Zero Duplicates)**:
   - **Board 01: Business Terms & Abbreviations** (45 Questions)
   - **Board 02: Marketing Concepts & Frameworks** (35 Questions)
   - **Board 03: Finance, Banking & Markets** (35 Questions)
   - **Board 04: Company Founders & Origins** (35 Questions)
   - **Board 05: Brand Taglines & Slogans** (30 Questions)
   - **Board 06: Business Leaders & Management Theorists** (30 Questions)
   - **Board 07: Management Principles & Operations** (25 Questions)
   - **Board 08: Indian Economy & Business Ecosystem** (30 Questions)
   - **Board 09: World Economy, GDP & International Trade** (25 Questions)
   - **Board 10: Accounting Fundamentals & Statements** (25 Questions)
   - **Board 11: How Business Works & Applied Strategy** (25 Questions)
   - **Board 12: Numerical Problem-Solving & Business Math** (20 Questions)

2. **Dual Quiz Format Engine**:
   - **🎯 4-Option MCQ Mode (Kahoot-Style)**: Dynamically generates 4 distinct multiple-choice options (1 correct answer + 3 plausible distractors from the board). Awards +1 point for correct clicks with immediate feedback; wrong selections highlight the correct answer and register into the missed pool. Keyboard shortcuts: `1`-`4` or `A`-`D`.
   - **🎴 Flashcard Mode**: Flip-to-reveal self-check with swipe gestures and space/arrow key shortcuts.

3. **Synchronized Constant-Velocity Ticker Tape**:
   - Financial market marquee scrolling at an identical, comfortable reading speed (`42px/s`) across all pages with pause-on-hover and edge fade masks.

4. **Dedicated Developer Dossier (`developer.html`)**:
   - Creator profile for **Ved Mangukiya**, event context (Amroli College organizing, SSASIT participating), and syllabus matrix overview.

5. **Local Performance Radar**:
   - Automatically tracks accuracy across all 12 boards in `localStorage` without external telemetry. Flags boards below 75% accuracy for focused drills and provides instant "Review Missed Questions" capability.

---

## 🚀 Running Locally

You can run the project using any local web server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js npx
npx serve .
```

Open `http://localhost:8000` in your browser.
