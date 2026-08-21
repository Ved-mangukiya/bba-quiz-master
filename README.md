# Bell Ringer — Business Quiz Trainer (Financial Edition)

A high-performance, mobile-first business quiz practice arena engineered for **SSASIT** students participating in the **Amroli College Inter-College Business Quiz Competition**.

Curated and built by **Ved Mangukiya** (BBA Student, Surat, Gujarat).

---

## 🌟 Key Features

1. **600 Curated Master Questions (Zero Duplicates)**:
   - **Board 01: Business Terms & Abbreviations** (45 Questions)
   - **Board 02: Marketing Concepts & Frameworks** (45 Questions)
   - **Board 03: Finance, Banking & Markets** (55 Questions)
   - **Board 04: Company Founders & Origins** (45 Questions)
   - **Board 05: Brand Taglines & Logos** (38 Questions)
   - **Board 06: Business Leaders & Management Theorists** (30 Questions)
   - **Board 07: Management Concepts, Principles & Ops** (51 Questions)
   - **Board 08: Indian Economy, Policies & Institutions** (55 Questions)
   - **Board 09: World Economics & Global Trade** (53 Questions)
   - **Board 10: Accounting Fundamentals & Statements** (35 Questions)
   - **Board 11: How Business Works & Applied Strategy** (43 Questions)
   - **Board 12: General Knowledge of Business & Industry** (55 Questions)
   - **Board 13: Human Resource Management & Labour Codes** (50 Questions)

2. **Dual Quiz Format Engine & Non-Repeating Shuffled Drill**:
   - **🎯 4-Option MCQ Mode (Kahoot-Style)**: Dynamically generates 4 distinct multiple-choice options (1 correct answer + 3 plausible distractors from the board). Guaranteed zero distractor duplicates. Keyboard shortcuts: `1`-`4` or `A`-`D`.
   - **🎴 Flashcard Mode**: Flip-to-reveal self-check with swipe gestures and space/arrow key shortcuts.
   - **🎲 Non-Repeating Shuffle**: True random Fisher-Yates permutation with smart persistent cycle tracking so questions never repeat across sessions until the entire active board pool is completed.

3. **Synchronized Constant-Velocity Ticker Tape**:
   - Financial market marquee scrolling at an identical, comfortable reading speed (`42px/s`) across all pages with pause-on-hover and edge fade masks.

4. **Dedicated Developer Dossier (`developer.html`)**:
   - Creator profile for **Ved Mangukiya**, event context (Amroli College organizing, SSASIT participating), and syllabus matrix overview.

5. **Local Performance Radar**:
   - Automatically tracks accuracy across all 13 boards in `localStorage` without external telemetry. Flags boards below 75% accuracy for focused drills and provides instant "Review Missed Questions" capability.

6. **Direct Serial Number Navigation & Question Matrix Palette**:
   - **Jump to Any Sr No**: Direct numeric jump bar allows hopping directly to any question (1 to 600) instantly.
   - **Exam-Grade Question Navigator (`J` / `G`)**: Interactive modal matrix displaying all questions color-coded by status:
     - 🟢 **Correct** (Answered Right)
     - 🔴 **Missed** (Answered Wrong)
     - ⚪ **Unanswered** (Pending)
     - 🟡 **Current** (Active Question)
     - 🔖 **Flagged** (Bookmarked for Review)
   - **Filter Tabs & Next Unanswered**: Easily filter by Unanswered, Correct, Missed, or Flagged, with a **"⏩ Jump to Next Unanswered"** button ensuring zero missed questions.

7. **Full LocalStorage Session Persistence & Next-Day Resume**:
   - Every answer, jump, bookmark, and score update is continuously auto-saved in `localStorage`.
   - Close the browser or return the next day—the **"Resume Saved Practice Session"** card welcomes you with exact board progress, completion percentage, and score.
   - Jump right back in where you left off with zero data loss, or discard and start fresh anytime.

8. **Question Flagging / Bookmarking (`B`)**:
   - Flag tricky questions on the fly for targeted review in the Question Matrix before concluding your session.

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
