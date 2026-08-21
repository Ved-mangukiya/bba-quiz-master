/**
 * BELL RINGER — BBA Business Quiz Practice System
 * Financial Newspaper & Ticker Tape Edition
 * Supports Flashcard (Reveal) and 4-Option MCQ (Kahoot-Style) modes.
 * Curated & Engineered by Ved Mangukiya · BBA Student, Surat, Gujarat
 */

(function () {
  "use strict";

  // --- State & Constants ---
  const STORAGE_KEY_STATS = "bellringer_quiz_stats_v1";
  const STORAGE_KEY_THEME = "bellringer_theme_v1";
  const TICKER_PIXELS_PER_SECOND = 42; // Constant comfortable reading velocity across all pages

  let DATA = null;
  let pool = [];
  let missedPool = [];
  let roundMissedByCat = {};
  let roundTotalByCat = {};
  let idx = 0;
  let correct = 0;
  let missed = 0;
  let isAnswerRevealed = false;
  let isTransitioning = false;
  let hasAnsweredCurrent = false;

  // Configuration state
  let selectedFormat = "mcq"; // 'mcq' (4 options) or 'flashcard' (reveal)
  let selectedCategoryId = "all";
  let selectedMode = "shuffle"; // 'shuffle' or 'flash' (sequential)
  let timerDuration = 0; // 0 = off, 15, 30
  let timerInterval = null;
  let timerRemaining = 0;

  // Current question's generated MCQ options
  let currentMcqOptions = [];

  // Touch / Swipe Gesture Tracking
  let touchStartX = 0;
  let touchStartY = 0;
  let currentTouchX = 0;
  let currentTouchY = 0;
  let isDraggingCard = false;
  let touchMovedSignificant = false;

  // DOM Helpers
  const el = (id) => document.getElementById(id);
  const qAll = (selector) => Array.from(document.querySelectorAll(selector));

  // --- Initialize Application ---
  async function init() {
    initTheme();
    setupEventListeners();
    await loadData();
    renderWeakCategories();
    updateLifetimeStatsSummary();
  }

  // --- Theme Management ---
  function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
    const initialTheme = savedTheme || "light"; // Default clean white broadsheet theme
    setTheme(initialTheme);

    const themeToggleBtn = el("theme-toggle");
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        setTheme(newTheme);
      });
    }

    // Keyboard shortcut for theme: Alt+T
    window.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
        setTheme(currentTheme === "dark" ? "light" : "dark");
      }
    });
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY_THEME, theme);
  }

  // --- Data Loading & UI Population ---
  async function loadData() {
    try {
      const res = await fetch("questions.json");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      DATA = await res.json();

      let totalQuestions = 0;
      DATA.categories.forEach((cat) => {
        totalQuestions += (cat.questions || []).length;
      });

      const totalBadge = el("total-pool-count");
      if (totalBadge) {
        totalBadge.textContent = `${DATA.categories.length} boards • ${totalQuestions} questions`;
      }

      buildCategoryControls(totalQuestions);
      buildTicker(totalQuestions);
    } catch (err) {
      console.error("Failed to load questions data:", err);
      const totalBadge = el("total-pool-count");
      if (totalBadge) totalBadge.textContent = "Error loading questions.json";
    }
  }

  function buildCategoryControls(totalQuestions) {
    const select = el("category-select");
    const chipsContainer = el("category-chips");

    if (!select || !chipsContainer) return;

    select.innerHTML = "";
    chipsContainer.innerHTML = "";

    // "All boards" option
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = `All boards (mixed) — ${totalQuestions} Qs`;
    select.appendChild(allOpt);

    // "All boards" chip
    const allChip = document.createElement("button");
    allChip.type = "button";
    allChip.className = "chip is-active";
    allChip.dataset.category = "all";
    allChip.setAttribute("role", "radio");
    allChip.setAttribute("aria-checked", "true");
    allChip.innerHTML = `
      <span class="chip-title">All Boards <span class="chip-count">${totalQuestions}</span></span>
      <span class="chip-sub">Full syllabus drill (${totalQuestions} Qs)</span>
    `;
    chipsContainer.appendChild(allChip);

    // Category options & chips
    DATA.categories.forEach((cat) => {
      const count = (cat.questions || []).length;

      // Select option
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = `${cat.name} (${count})`;
      select.appendChild(opt);

      // Chip button
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.category = cat.id;
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", "false");
      chip.innerHTML = `
        <span class="chip-title">${cat.name} <span class="chip-count">${count}</span></span>
        <span class="chip-sub">${getBoardSubtext(cat.id)}</span>
      `;
      chipsContainer.appendChild(chip);
    });

    // Handle Chip Clicks
    chipsContainer.addEventListener("click", (e) => {
      const chipBtn = e.target.closest(".chip");
      if (!chipBtn) return;

      qAll("#category-chips .chip").forEach((c) => {
        c.classList.remove("is-active");
        c.setAttribute("aria-checked", "false");
      });

      chipBtn.classList.add("is-active");
      chipBtn.setAttribute("aria-checked", "true");
      selectedCategoryId = chipBtn.dataset.category;
      select.value = selectedCategoryId;

      // Scroll chip into view smoothly
      chipBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });

    // Sync select change
    select.addEventListener("change", (e) => {
      selectedCategoryId = e.target.value;
      qAll("#category-chips .chip").forEach((c) => {
        const match = c.dataset.category === selectedCategoryId;
        c.classList.toggle("is-active", match);
        c.setAttribute("aria-checked", match ? "true" : "false");
        if (match) c.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      });
    });
  }

  function getBoardSubtext(id) {
    const map = {
      terms: "Acronyms & Jargon",
      marketing: "4Ps, STP, BCG Matrix",
      finance: "Markets, Capital & Banking",
      companies: "Founders & Origins",
      taglines: "Brand Slogans & Logos",
      leaders: "Theorists & Executives",
      management: "Org Principles & Ops",
      india: "Policy, NITI & Banking",
      gdp: "Global Macro & Trade",
      accounting: "Statements & Entries",
      howbusiness: "Integration & Strategy",
      bizgk: "M&A, Tech & Milestones",
      hr: "Recruitment, POSH & Labour",
    };
    return map[id] || "Subject Drill";
  }

  function buildTicker(totalQuestions = 600) {
    const ticker = el("ticker");
    if (!ticker || !DATA || !DATA.categories) return;

    const headlineItems = [
      `<span><span class="ticker-tag">CURATOR</span> <strong>VED MANGUKIYA</strong> <span class="up">▲ SURAT</span></span>`,
      `<span><span class="ticker-tag">EVENT</span> <strong>AMROLI COLLEGE QUIZ</strong> <span class="up">▲ SSASIT TEAM</span></span>`,
      `<span><span class="ticker-tag">SYLLABUS</span> <strong>${totalQuestions} QUESTIONS</strong> <span class="up">▲ ${DATA.categories.length} BOARDS</span></span>`
    ];

    const categoryItems = DATA.categories.map((cat, i) => {
      const dir = i % 2 === 0 ? "up" : "down";
      const arrow = dir === "up" ? "▲" : "▼";
      return `<span><strong>${cat.name.toUpperCase()}</strong> <span class="${dir}">${arrow} ${cat.questions.length} Qs</span></span>`;
    });

    const fullSequence = [...headlineItems, ...categoryItems].join("");
    // Double content for continuous infinite seamless marquee
    ticker.innerHTML = fullSequence + fullSequence;

    // Calculate exact animation duration dynamically based on constant pixel velocity (42px/s)
    requestAnimationFrame(() => {
      const singleCycleWidth = ticker.scrollWidth / 2;
      const durationSeconds = Math.round(singleCycleWidth / TICKER_PIXELS_PER_SECOND);
      ticker.style.animationDuration = `${durationSeconds}s`;
    });
  }

  // --- Mode & Format Chip Controls ---
  function setupOptionChips() {
    // Format Chips (MCQ vs Flashcard)
    const formatChips = qAll(".format-chips .chip");
    formatChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        formatChips.forEach((c) => {
          c.classList.remove("is-active");
          c.setAttribute("aria-checked", "false");
        });
        chip.classList.add("is-active");
        chip.setAttribute("aria-checked", "true");
        selectedFormat = chip.dataset.format;
      });
    });

    // Mode Chips (Sequential vs Shuffle)
    const modeSelect = el("mode-select");
    const modeChips = qAll(".mode-chips .chip");
    modeChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        modeChips.forEach((c) => {
          c.classList.remove("is-active");
          c.setAttribute("aria-checked", "false");
        });
        chip.classList.add("is-active");
        chip.setAttribute("aria-checked", "true");
        selectedMode = chip.dataset.mode;
        if (modeSelect) modeSelect.value = selectedMode;
      });
    });

    // Timer Chips
    const timerChips = qAll(".timer-chips .chip");
    timerChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        timerChips.forEach((c) => {
          c.classList.remove("is-active");
          c.setAttribute("aria-checked", "false");
        });
        chip.classList.add("is-active");
        chip.setAttribute("aria-checked", "true");
        timerDuration = parseInt(chip.dataset.timer, 10) || 0;
      });
    });
  }

  // --- LocalStorage Performance History ---
  function getStats() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_STATS);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn("Could not read stats from localStorage", e);
      return {};
    }
  }

  function saveQuestionResult(categoryId, wasCorrect) {
    if (!categoryId) return;
    try {
      const stats = getStats();
      if (!stats[categoryId]) {
        stats[categoryId] = { total: 0, correct: 0, missed: 0, lastUpdated: Date.now() };
      }
      stats[categoryId].total += 1;
      if (wasCorrect) {
        stats[categoryId].correct += 1;
      } else {
        stats[categoryId].missed += 1;
      }
      stats[categoryId].lastUpdated = Date.now();
      localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(stats));
    } catch (e) {
      console.warn("Could not write stats to localStorage", e);
    }
  }

  function renderWeakCategories() {
    const weakCard = el("weak-categories-card");
    const weakChipsList = el("weak-chips-list");
    const weakSummaryText = el("weak-summary-text");
    if (!weakCard || !weakChipsList || !DATA) return;

    const stats = getStats();
    const categoriesWithStats = [];

    DATA.categories.forEach((cat) => {
      const s = stats[cat.id];
      if (s && s.total >= 3) {
        const accuracy = Math.round((s.correct / s.total) * 100);
        categoriesWithStats.push({
          id: cat.id,
          name: cat.name,
          accuracy,
          total: s.total,
          correct: s.correct,
        });
      }
    });

    if (categoriesWithStats.length === 0) {
      weakCard.hidden = true;
      return;
    }

    // Sort by lowest accuracy first
    categoriesWithStats.sort((a, b) => a.accuracy - b.accuracy);
    const weakList = categoriesWithStats.filter((c) => c.accuracy < 75);

    if (weakList.length === 0) {
      weakCard.hidden = true;
      return;
    }

    weakCard.hidden = false;
    weakSummaryText.textContent = `You have ${weakList.length} board${weakList.length > 1 ? "s" : ""} below 75% accuracy. Tap to practice:`;
    weakChipsList.innerHTML = "";

    weakList.slice(0, 3).forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "weak-chip-btn";
      btn.innerHTML = `<span>${item.name}</span> <span class="weak-pct">${item.accuracy}%</span>`;
      btn.addEventListener("click", () => {
        // Select this category chip directly
        const targetChip = document.querySelector(`.chip[data-category="${item.id}"]`);
        if (targetChip) {
          targetChip.click();
          targetChip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      });
      weakChipsList.appendChild(btn);
    });
  }

  function updateLifetimeStatsSummary() {
    const label = el("lifetime-stats-label");
    if (!label) return;
    const stats = getStats();
    let totalQ = 0;
    let correctQ = 0;
    Object.values(stats).forEach((s) => {
      totalQ += s.total || 0;
      correctQ += s.correct || 0;
    });

    if (totalQ > 0) {
      const pct = Math.round((correctQ / totalQ) * 100);
      label.textContent = `Lifetime: ${totalQ} answered • ${correctQ} correct (${pct}%)`;
    } else {
      label.textContent = "Lifetime: No sessions completed yet";
    }
  }

  const STORAGE_KEY_SHUFFLE_CYCLE = "bellringer_shuffle_cycle_v1";

  function clearAllStats() {
    if (confirm("Are you sure you want to reset all saved session stats, weak category history, and shuffle queue?")) {
      localStorage.removeItem(STORAGE_KEY_STATS);
      localStorage.removeItem(STORAGE_KEY_SHUFFLE_CYCLE);
      renderWeakCategories();
      updateLifetimeStatsSummary();
    }
  }

  // --- Session Logic ---
  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Non-repeating shuffle queue manager across sessions
  function getShuffleQueue(categoryId, fullList) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SHUFFLE_CYCLE);
      const allQueues = stored ? JSON.parse(stored) : {};
      const queue = allQueues[categoryId];

      if (Array.isArray(queue) && queue.length > 0) {
        // Map stored question keys back to fullList items
        const validItems = queue
          .map((storedItem) => fullList.find((item) => item.q === storedItem.q))
          .filter(Boolean);

        if (validItems.length > 0) {
          return validItems;
        }
      }
    } catch (e) {
      console.warn("Could not read shuffle queue from localStorage", e);
    }
    // If queue exhausted or empty, generate a fresh non-repeating permutation
    const freshShuffle = shuffleArray(fullList);
    saveShuffleQueue(categoryId, freshShuffle);
    return freshShuffle;
  }

  function saveShuffleQueue(categoryId, remainingList) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SHUFFLE_CYCLE);
      const allQueues = stored ? JSON.parse(stored) : {};
      allQueues[categoryId] = (remainingList || []).map((item) => ({ q: item.q }));
      localStorage.setItem(STORAGE_KEY_SHUFFLE_CYCLE, JSON.stringify(allQueues));
    } catch (e) {
      console.warn("Could not write shuffle queue to localStorage", e);
    }
  }

  function advanceShuffleQueue() {
    if (selectedMode === "shuffle" && pool && pool.length > 0) {
      const remaining = pool.slice(idx + 1);
      saveShuffleQueue(selectedCategoryId, remaining);
    }
  }

  function buildPool(categoryId) {
    if (!DATA || !DATA.categories) return [];
    if (categoryId === "all") {
      let all = [];
      DATA.categories.forEach((cat) => {
        (cat.questions || []).forEach((q) => {
          all.push({ ...q, board: cat.name, categoryId: cat.id });
        });
      });
      return all;
    }
    const cat = DATA.categories.find((c) => c.id === categoryId);
    if (!cat) return [];
    return (cat.questions || []).map((q) => ({
      ...q,
      board: cat.name,
      categoryId: cat.id,
    }));
  }

  /**
   * Intelligently generate 4 distinct choices for MCQ mode:
   * 1 correct answer + 3 plausible distractors from the same category/pool.
   * Guaranteed zero duplicates across all 4 options.
   */
  function generateMcqOptions(currentItem) {
    const correctAnswer = currentItem.a.trim();
    const currentCatId = currentItem.categoryId;

    // 1. Gather all unique answers from the same category
    let poolAnswers = [];
    const sameCat = DATA.categories.find((c) => c.id === currentCatId);
    if (sameCat && sameCat.questions) {
      poolAnswers = sameCat.questions
        .map((q) => q.a.trim())
        .filter((ans) => ans.toLowerCase() !== correctAnswer.toLowerCase());
    }

    // 2. If same category has fewer than 3 distractors, pull from all categories
    if (poolAnswers.length < 3) {
      DATA.categories.forEach((cat) => {
        if (cat.id !== currentCatId) {
          cat.questions.forEach((q) => {
            const trimmed = q.a.trim();
            if (
              trimmed.toLowerCase() !== correctAnswer.toLowerCase() &&
              !poolAnswers.some((a) => a.toLowerCase() === trimmed.toLowerCase())
            ) {
              poolAnswers.push(trimmed);
            }
          });
        }
      });
    }

    // 3. Shuffle and pick 3 unique distractors (case-insensitive deduplication)
    const uniqueDistractors = [];
    const seenLower = new Set([correctAnswer.toLowerCase()]);
    shuffleArray(poolAnswers).forEach((ans) => {
      const lower = ans.toLowerCase();
      if (!seenLower.has(lower) && uniqueDistractors.length < 3) {
        seenLower.add(lower);
        uniqueDistractors.push(ans);
      }
    });

    // 4. Combine correct answer + 3 distractors
    const rawOptions = [
      { text: correctAnswer, isCorrect: true },
      ...uniqueDistractors.map((distractor) => ({ text: distractor, isCorrect: false })),
    ];

    // 5. Shuffle the 4 options and assign letters A, B, C, D
    const letters = ["A", "B", "C", "D"];
    const finalShuffled = shuffleArray(rawOptions);
    return finalShuffled.map((opt, i) => ({
      ...opt,
      letter: letters[i],
      index: i,
    }));
  }

  function startSession(customPool = null) {
    stopTimer();

    if (customPool && Array.isArray(customPool) && customPool.length > 0) {
      pool = selectedMode === "shuffle" ? shuffleArray(customPool) : [...customPool];
    } else {
      const fullList = buildPool(selectedCategoryId);
      if (selectedMode === "shuffle") {
        pool = getShuffleQueue(selectedCategoryId, fullList);
      } else {
        pool = fullList;
      }
    }

    if (pool.length === 0) {
      alert("No questions found for the selected board.");
      return;
    }

    idx = 0;
    correct = 0;
    missed = 0;
    missedPool = [];
    roundMissedByCat = {};
    roundTotalByCat = {};
    isTransitioning = false;

    // Show session screen & hide start deck
    el("session").hidden = false;
    el("summary").hidden = true;
    el("control-deck").hidden = true;

    // Configure desktop/mobile hints based on format
    if (selectedFormat === "mcq") {
      el("mcq-desktop-hints").hidden = false;
      el("flash-desktop-hints").hidden = true;
      el("mobile-hint-text").textContent = "👉 Tap an option to select your answer";
    } else {
      el("mcq-desktop-hints").hidden = true;
      el("flash-desktop-hints").hidden = false;
      el("mobile-hint-text").textContent = "👉 Swipe card left for Missed, right for Correct";
    }

    // Scroll to top of main content
    window.scrollTo({ top: el("main-content").offsetTop - 20, behavior: "smooth" });

    showQuestion();
  }

  function showQuestion() {
    stopTimer();
    isAnswerRevealed = false;
    isTransitioning = false;
    hasAnsweredCurrent = false;

    if (idx >= pool.length) {
      endSession();
      return;
    }

    const item = pool[idx];

    // Track category participation
    if (item.categoryId) {
      roundTotalByCat[item.categoryId] = (roundTotalByCat[item.categoryId] || 0) + 1;
    }

    // Update text & layout
    el("card-question").textContent = item.q;
    el("card-answer").textContent = item.a;
    el("card-category-badge").textContent = item.board;
    el("current-board").textContent = item.board;

    // Format-specific rendering
    if (selectedFormat === "mcq") {
      // MCQ Mode: Render 4 options
      el("mcq-container").hidden = false;
      el("card-prompt").hidden = true;
      el("answer-panel").hidden = true;
      el("reveal-btn").hidden = true;
      el("verdict-row").hidden = true;

      renderMcqGrid(item);
    } else {
      // Flashcard Mode: Reveal button flow
      el("mcq-container").hidden = true;
      el("card-prompt").hidden = false;
      el("answer-panel").hidden = true;
      el("reveal-btn").hidden = false;
      el("verdict-row").hidden = true;

      // Focus reveal button for keyboard accessibility
      setTimeout(() => {
        const revealBtn = el("reveal-btn");
        if (revealBtn && !revealBtn.hidden) revealBtn.focus();
      }, 50);
    }

    // Reset swipe badges
    hideSwipeBadges();

    // Progress updates
    const currentNum = idx + 1;
    const totalNum = pool.length;
    const pct = Math.round((idx / totalNum) * 100);

    el("progress-count").textContent = `${currentNum} / ${totalNum}`;
    el("correct-count").textContent = correct;
    el("missed-count").textContent = missed;

    const progressPercent = el("progress-percent");
    if (progressPercent) progressPercent.textContent = `${pct}%`;

    const progressFill = el("progress-fill");
    if (progressFill) progressFill.style.width = `${pct}%`;

    const progressTrack = el("progress-bar-track");
    if (progressTrack) progressTrack.setAttribute("aria-valuenow", pct);

    // Smooth card entry animation
    const card = el("quiz-card");
    card.classList.remove("card-slide-in", "card-verdict-right", "card-verdict-wrong");
    void card.offsetWidth; // Trigger reflow for animation restart
    card.classList.add("card-slide-in");

    // Start countdown timer if configured
    if (timerDuration > 0) {
      startTimer(timerDuration);
    } else {
      const timerDisplay = el("timer-display");
      if (timerDisplay) timerDisplay.hidden = true;
    }
  }

  // --- Render MCQ Option Buttons ---
  function renderMcqGrid(item) {
    const grid = el("mcq-grid");
    if (!grid) return;

    grid.innerHTML = "";
    currentMcqOptions = generateMcqOptions(item);

    currentMcqOptions.forEach((opt, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mcq-btn";
      btn.dataset.index = index;
      btn.setAttribute("aria-label", `Option ${opt.letter}: ${opt.text}`);
      btn.innerHTML = `
        <span class="mcq-letter">${opt.letter}</span>
        <span class="mcq-text">${opt.text}</span>
      `;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleMcqSelection(index);
      });
      grid.appendChild(btn);
    });
  }

  // --- Handle MCQ Answer Selection ---
  function handleMcqSelection(selectedIndex) {
    if (hasAnsweredCurrent || isTransitioning) return;
    hasAnsweredCurrent = true;
    isTransitioning = true;
    stopTimer();

    const selectedOpt = currentMcqOptions[selectedIndex];
    const currentItem = pool[idx];
    const isCorrect = selectedOpt && selectedOpt.isCorrect;

    // Disable all option buttons
    const allBtns = qAll(".mcq-btn");
    allBtns.forEach((b) => (b.disabled = true));

    // Highlight selected button
    const chosenBtn = allBtns[selectedIndex];
    if (isCorrect) {
      if (chosenBtn) chosenBtn.classList.add("is-correct");
      correct++;
      el("correct-count").textContent = correct;
      saveQuestionResult(currentItem.categoryId, true);
      advanceShuffleQueue();

      // Card micro-interaction
      const card = el("quiz-card");
      card.classList.remove("card-verdict-right", "card-verdict-wrong", "card-slide-in");
      void card.offsetWidth;
      card.classList.add("card-verdict-right");

      // Advance after brief positive confirmation
      setTimeout(() => {
        idx++;
        showQuestion();
      }, 700);
    } else {
      if (chosenBtn) chosenBtn.classList.add("is-wrong");
      missed++;
      el("missed-count").textContent = missed;
      missedPool.push(currentItem);
      if (currentItem.categoryId) {
        roundMissedByCat[currentItem.categoryId] = (roundMissedByCat[currentItem.categoryId] || 0) + 1;
      }
      saveQuestionResult(currentItem.categoryId, false);
      advanceShuffleQueue();

      // Reveal the true correct answer button
      const correctIdx = currentMcqOptions.findIndex((o) => o.isCorrect);
      if (correctIdx >= 0 && allBtns[correctIdx]) {
        allBtns[correctIdx].classList.add("is-revealed-correct");
      }

      // Card shake micro-interaction
      const card = el("quiz-card");
      card.classList.remove("card-verdict-right", "card-verdict-wrong", "card-slide-in");
      void card.offsetWidth;
      card.classList.add("card-verdict-wrong");

      // Advance after 1.2s so user can read the correct answer
      setTimeout(() => {
        idx++;
        showQuestion();
      }, 1200);
    }
  }

  // --- Flashcard Mode: Reveal Answer ---
  function revealAnswer() {
    if (isAnswerRevealed || isTransitioning || selectedFormat === "mcq") return;
    isAnswerRevealed = true;
    stopTimer();

    // Show answer panel & hide prompt / reveal button
    el("answer-panel").hidden = false;
    const cardPrompt = el("card-prompt");
    if (cardPrompt) cardPrompt.hidden = true;

    el("reveal-btn").hidden = true;
    el("verdict-row").hidden = false;

    // Focus right-btn for quick keyboard navigation
    const rightBtn = el("right-btn");
    if (rightBtn) rightBtn.focus();
  }

  // --- Flashcard Mode: Mark and Advance ---
  function markAndAdvance(gotItRight) {
    if (isTransitioning || selectedFormat === "mcq") return;
    isTransitioning = true;
    stopTimer();

    const currentItem = pool[idx];

    // Save statistics & round tracking
    if (gotItRight) {
      correct++;
    } else {
      missed++;
      missedPool.push(currentItem);
      if (currentItem.categoryId) {
        roundMissedByCat[currentItem.categoryId] = (roundMissedByCat[currentItem.categoryId] || 0) + 1;
      }
    }

    if (currentItem.categoryId) {
      saveQuestionResult(currentItem.categoryId, gotItRight);
    }
    advanceShuffleQueue();

    // Micro-interaction animation
    const card = el("quiz-card");
    card.classList.remove("card-verdict-right", "card-verdict-wrong", "card-slide-in");
    void card.offsetWidth;

    if (gotItRight) {
      card.classList.add("card-verdict-right");
    } else {
      card.classList.add("card-verdict-wrong");
    }

    // Brief tactile delay before transitioning to next question
    setTimeout(() => {
      idx++;
      showQuestion();
    }, 240);
  }

  // --- Countdown Timer ---
  function startTimer(seconds) {
    const timerDisplay = el("timer-display");
    const timerFill = el("timer-fill");
    const timerText = el("timer-text");

    if (!timerDisplay || !timerFill || !timerText) return;

    timerDisplay.hidden = false;
    timerDisplay.classList.remove("timer-warning");

    timerRemaining = seconds;
    timerText.textContent = `${timerRemaining}s`;
    timerFill.style.width = "100%";

    const totalMs = seconds * 1000;
    const startTime = Date.now();

    timerInterval = setInterval(() => {
      const elapsedMs = Date.now() - startTime;
      const remainingMs = Math.max(0, totalMs - elapsedMs);
      const remainingSec = Math.ceil(remainingMs / 1000);

      timerRemaining = remainingSec;
      timerText.textContent = `${remainingSec}s`;
      timerFill.style.width = `${(remainingMs / totalMs) * 100}%`;

      if (remainingSec <= 5) {
        timerDisplay.classList.add("timer-warning");
      }

      if (remainingMs <= 0) {
        stopTimer();
        handleTimerExpired();
      }
    }, 100);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function handleTimerExpired() {
    // When time expires:
    if (selectedFormat === "mcq") {
      // In MCQ mode: automatically mark wrong if not answered
      if (!hasAnsweredCurrent) {
        const correctIdx = currentMcqOptions.findIndex((o) => o.isCorrect);
        handleMcqSelection(correctIdx === 0 ? 1 : 0); // Pick a wrong answer to register missed
      }
    } else {
      // In Flashcard mode: reveal answer and flash card border
      if (!isAnswerRevealed) {
        revealAnswer();
        const card = el("quiz-card");
        if (card) {
          card.classList.add("card-verdict-wrong");
          setTimeout(() => card.classList.remove("card-verdict-wrong"), 400);
        }
      }
    }
  }

  // --- Session End & Summary ---
  function endSession() {
    stopTimer();
    el("session").hidden = true;
    el("summary").hidden = false;
    el("control-deck").hidden = true;

    const total = correct + missed;
    const pct = total ? Math.round((correct / total) * 100) : 0;

    // Fill summary progress bar
    const summaryFill = el("summary-bar-fill");
    if (summaryFill) {
      summaryFill.style.width = "0%";
      setTimeout(() => {
        summaryFill.style.width = `${pct}%`;
      }, 100);
    }

    const pctBadge = el("summary-percentage");
    if (pctBadge) pctBadge.textContent = `${pct}%`;

    const headline = el("summary-headline");
    if (headline) {
      if (pct >= 85) headline.textContent = "Outstanding Performance.";
      else if (pct >= 70) headline.textContent = "Strong Round — Bell Rang.";
      else if (pct >= 50) headline.textContent = "Good Drill — Keep Polishing.";
      else headline.textContent = "Review Needed — Train Again.";
    }

    const detail = el("summary-detail");
    if (detail) {
      detail.textContent = `${correct} correct • ${missed} missed out of ${total} total questions.`;
    }

    // Review Missed Questions button visibility
    const reviewBtn = el("review-btn");
    const reviewBadge = el("review-count-badge");
    if (reviewBtn && reviewBadge) {
      if (missedPool.length > 0) {
        reviewBtn.hidden = false;
        reviewBadge.textContent = missedPool.length;
      } else {
        reviewBtn.hidden = true;
      }
    }

    // Render Board Breakdown
    renderSummaryBreakdown();

    // Refresh weak categories radar for future sessions
    renderWeakCategories();
    updateLifetimeStatsSummary();

    // Scroll to top of summary
    window.scrollTo({ top: el("main-content").offsetTop - 20, behavior: "smooth" });
  }

  function renderSummaryBreakdown() {
    const breakdownGrid = el("breakdown-grid");
    if (!breakdownGrid || !DATA) return;

    breakdownGrid.innerHTML = "";

    const attemptedCatIds = Object.keys(roundTotalByCat);
    if (attemptedCatIds.length === 0) return;

    attemptedCatIds.forEach((catId) => {
      const cat = DATA.categories.find((c) => c.id === catId);
      const name = cat ? cat.name : catId;
      const totalInRound = roundTotalByCat[catId] || 0;
      const missedInRound = roundMissedByCat[catId] || 0;
      const correctInRound = totalInRound - missedInRound;
      const acc = totalInRound ? Math.round((correctInRound / totalInRound) * 100) : 0;

      const row = document.createElement("div");
      row.className = "breakdown-row";
      row.innerHTML = `
        <span class="breakdown-board">${name}</span>
        <span class="breakdown-stat ${acc >= 70 ? "good" : "bad"}">${correctInRound}/${totalInRound} (${acc}%)</span>
      `;
      breakdownGrid.appendChild(row);
    });
  }

  function resetToStart() {
    stopTimer();
    el("control-deck").hidden = false;
    el("session").hidden = true;
    el("summary").hidden = true;
    renderWeakCategories();
    updateLifetimeStatsSummary();
  }

  // --- Card Tap to Reveal (Flashcard Mode Only) ---
  function setupCardTap() {
    const card = el("quiz-card");
    if (!card) return;

    card.addEventListener("click", (e) => {
      // Only active in Flashcard mode
      if (selectedFormat === "flashcard") {
        if (!isAnswerRevealed && !isTransitioning && !touchMovedSignificant) {
          revealAnswer();
        }
      }
    });
  }

  // --- Swipe Gestures for Touch Screens (Flashcard Mode Only) ---
  function setupSwipeGestures() {
    const card = el("quiz-card");
    const badgeLeft = el("swipe-badge-left");
    const badgeRight = el("swipe-badge-right");

    if (!card) return;

    card.addEventListener(
      "touchstart",
      (e) => {
        if (selectedFormat !== "flashcard" || isTransitioning) return;
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        currentTouchX = touch.clientX;
        currentTouchY = touch.clientY;
        isDraggingCard = true;
        touchMovedSignificant = false;
      },
      { passive: true }
    );

    card.addEventListener(
      "touchmove",
      (e) => {
        if (selectedFormat !== "flashcard" || !isDraggingCard || isTransitioning) return;
        const touch = e.touches[0];
        currentTouchX = touch.clientX;
        currentTouchY = touch.clientY;

        const deltaX = currentTouchX - touchStartX;
        const deltaY = currentTouchY - touchStartY;

        if (Math.abs(deltaX) > 10) {
          touchMovedSignificant = true;
        }

        // Only show swipe rotation/badges if answer is revealed in flashcard mode
        if (isAnswerRevealed && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 15) {
          const rotation = deltaX * 0.05;
          card.style.transform = `translateX(${deltaX * 0.75}px) rotate(${rotation}deg)`;

          if (deltaX > 25) {
            // Swiping Right -> Correct
            if (badgeRight) {
              badgeRight.style.opacity = Math.min(1, (deltaX - 25) / 50);
              badgeRight.style.transform = `rotate(-8deg) scale(${Math.min(1.1, 0.9 + deltaX * 0.003)})`;
            }
            if (badgeLeft) badgeLeft.style.opacity = 0;
          } else if (deltaX < -25) {
            // Swiping Left -> Missed
            if (badgeLeft) {
              badgeLeft.style.opacity = Math.min(1, (-deltaX - 25) / 50);
              badgeLeft.style.transform = `rotate(8deg) scale(${Math.min(1.1, 0.9 - deltaX * 0.003)})`;
            }
            if (badgeRight) badgeRight.style.opacity = 0;
          } else {
            hideSwipeBadges();
          }
        }
      },
      { passive: true }
    );

    const handleTouchEnd = () => {
      if (!isDraggingCard) return;
      isDraggingCard = false;

      const deltaX = currentTouchX - touchStartX;
      const deltaY = currentTouchY - touchStartY;

      card.style.transform = "";
      hideSwipeBadges();

      if (selectedFormat === "flashcard" && isAnswerRevealed && !isTransitioning) {
        if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
          if (deltaX > 60) {
            markAndAdvance(true);
          } else if (deltaX < -60) {
            markAndAdvance(false);
          }
        }
      }
    };

    card.addEventListener("touchend", handleTouchEnd, { passive: true });
    card.addEventListener("touchcancel", handleTouchEnd, { passive: true });
  }

  function hideSwipeBadges() {
    const badgeLeft = el("swipe-badge-left");
    const badgeRight = el("swipe-badge-right");
    if (badgeLeft) badgeLeft.style.opacity = 0;
    if (badgeRight) badgeRight.style.opacity = 0;
  }

  // --- Global Keyboard Shortcuts ---
  function setupKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      // Avoid firing shortcuts when user is typing in form controls
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      if (activeTag === "input" || activeTag === "textarea") return;

      const sessionVisible = !el("session").hidden;
      if (!sessionVisible) return;

      // MCQ MODE SHORTCUTS (1, 2, 3, 4 or A, B, C, D)
      if (selectedFormat === "mcq") {
        const key = e.key.toLowerCase();
        let selectedIndex = -1;

        if (key === "1" || key === "a") selectedIndex = 0;
        else if (key === "2" || key === "b") selectedIndex = 1;
        else if (key === "3" || key === "c") selectedIndex = 2;
        else if (key === "4" || key === "d") selectedIndex = 3;

        if (selectedIndex >= 0 && selectedIndex < currentMcqOptions.length) {
          e.preventDefault();
          handleMcqSelection(selectedIndex);
          return;
        }
      }

      // FLASHCARD MODE SHORTCUTS
      if (selectedFormat === "flashcard") {
        // Space or Enter -> Reveal Answer
        if ((e.code === "Space" || e.key === " " || e.key === "Enter") && !isAnswerRevealed && !isTransitioning) {
          e.preventDefault();
          revealAnswer();
          return;
        }

        // Arrow Right -> Got it Right
        if ((e.key === "ArrowRight" || e.code === "ArrowRight") && isAnswerRevealed && !isTransitioning) {
          e.preventDefault();
          markAndAdvance(true);
          return;
        }

        // Arrow Left -> I Missed It
        if ((e.key === "ArrowLeft" || e.code === "ArrowLeft") && isAnswerRevealed && !isTransitioning) {
          e.preventDefault();
          markAndAdvance(false);
          return;
        }
      }
    });
  }

  // --- Attach Event Listeners ---
  function setupEventListeners() {
    setupOptionChips();
    setupKeyboardShortcuts();
    setupCardTap();
    setupSwipeGestures();

    // Start Session
    el("start-btn").addEventListener("click", () => startSession());

    // Reveal Answer Button
    el("reveal-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      revealAnswer();
    });

    // Right / Wrong Buttons
    el("right-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      markAndAdvance(true);
    });
    el("wrong-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      markAndAdvance(false);
    });

    // End Session Early
    el("end-btn").addEventListener("click", endSession);

    // Summary Actions
    el("restart-btn").addEventListener("click", resetToStart);
    el("back-home-btn").addEventListener("click", resetToStart);

    // Review Missed Questions
    const reviewBtn = el("review-btn");
    if (reviewBtn) {
      reviewBtn.addEventListener("click", () => {
        if (missedPool.length > 0) {
          startSession(missedPool);
        }
      });
    }

    // Reset LocalStorage Stats
    const clearStatsBtn = el("clear-stats-btn");
    if (clearStatsBtn) {
      clearStatsBtn.addEventListener("click", clearAllStats);
    }
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
