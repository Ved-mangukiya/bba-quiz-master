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
  const STORAGE_KEY_SHUFFLE_CYCLE = "bellringer_shuffle_cycle_v1";
  const STORAGE_KEY_ACTIVE_SESSION = "bellringer_active_session_v1";
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

  // Bookmarks & Navigator filter state
  let bookmarks = new Set();
  let currentNavFilter = "all";

  // Configuration state
  let selectedFormat = "mcq"; // 'mcq' (4 options) or 'flashcard' (reveal)
  let selectedCategoryId = "all";
  let selectedMode = "shuffle"; // 'shuffle' or 'flash' (sequential)
  let timerDuration = 0; // 0 = off, 15, 30
  let timerInterval = null;
  let timerRemaining = 0;

  // Current question's generated MCQ options
  let currentMcqOptions = [];

  // Historical session recording for back-navigation review
  let sessionHistory = [];
  let maxAnsweredIdx = 0;

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
    checkAndRenderResumeBanner();
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

  function clearAllStats() {
    if (confirm("Are you sure you want to reset all saved session stats, weak category history, and shuffle queue?")) {
      localStorage.removeItem(STORAGE_KEY_STATS);
      localStorage.removeItem(STORAGE_KEY_SHUFFLE_CYCLE);
      localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
      bookmarks.clear();
      renderWeakCategories();
      updateLifetimeStatsSummary();
      checkAndRenderResumeBanner();
    }
  }

  // --- Active Quiz Session Persistence & Next-Day Resumption ---
  function getCategoryName(id) {
    if (!DATA || !DATA.categories) return "All Boards";
    if (id === "all") return "All Boards";
    const cat = DATA.categories.find((c) => c.id === id);
    return cat ? cat.name : "All Boards";
  }

  function getActiveSession() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn("Could not read active session from localStorage", e);
      return null;
    }
  }

  function saveActiveSession() {
    if (!pool || pool.length === 0) return;
    try {
      const session = {
        version: 1,
        savedAt: Date.now(),
        selectedCategoryId,
        selectedCategoryName: getCategoryName(selectedCategoryId),
        selectedFormat,
        selectedMode,
        timerDuration,
        idx,
        maxAnsweredIdx,
        correct,
        missed,
        roundTotalByCat,
        roundMissedByCat,
        missedPool: (missedPool || []).map((item) => ({
          q: item.q,
          a: item.a,
          board: item.board,
          categoryId: item.categoryId
        })),
        pool: pool.map((item) => ({
          q: item.q,
          a: item.a,
          board: item.board,
          categoryId: item.categoryId
        })),
        sessionHistory: sessionHistory.map((h) => {
          if (!h) return null;
          return {
            answered: Boolean(h.answered),
            format: h.format,
            selectedIndex: h.selectedIndex !== undefined ? h.selectedIndex : null,
            isCorrect: Boolean(h.isCorrect),
            gotItRight: Boolean(h.gotItRight),
            mcqOptions: h.mcqOptions ? [...h.mcqOptions] : null
          };
        }),
        bookmarks: Array.from(bookmarks)
      };
      localStorage.setItem(STORAGE_KEY_ACTIVE_SESSION, JSON.stringify(session));
    } catch (e) {
      console.warn("Could not save active session to localStorage", e);
    }
  }

  function clearActiveSession() {
    try {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
    } catch (e) {
      console.warn("Could not clear active session from localStorage", e);
    }
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return "Saved recently";
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (isToday) return `Saved today at ${timeStr}`;
    if (isYesterday) return `Saved yesterday at ${timeStr}`;
    return `Saved on ${date.toLocaleDateString([], { day: "numeric", month: "short" })} at ${timeStr}`;
  }

  function checkAndRenderResumeBanner() {
    const resumeCard = el("resume-session-card");
    if (!resumeCard) return;

    const session = getActiveSession();
    if (!session || !Array.isArray(session.pool) || session.pool.length === 0) {
      resumeCard.hidden = true;
      return;
    }

    const answeredCount = (session.sessionHistory || []).filter((h) => h && h.answered).length;
    const totalCount = session.pool.length;
    const pct = totalCount ? Math.round((answeredCount / totalCount) * 100) : 0;
    const accuracy = answeredCount ? Math.round((session.correct / answeredCount) * 100) : 0;

    const boardTag = el("resume-board-tag");
    const formatTag = el("resume-format-tag");
    const timeText = el("resume-time-text");
    const headline = el("resume-headline");
    const statsLine = el("resume-stats-line");
    const progressFill = el("resume-progress-fill");
    const qNumSpan = el("resume-q-num");

    if (boardTag) boardTag.textContent = session.selectedCategoryName || "All Boards";
    if (formatTag) formatTag.textContent = session.selectedFormat === "mcq" ? "4-Option MCQ" : "Flashcard";
    if (timeText) timeText.textContent = formatTimeAgo(session.savedAt);
    if (headline) headline.textContent = `In-Progress Drill (${pct}% Complete)`;
    if (statsLine) {
      statsLine.textContent = `Question ${Math.min(session.idx + 1, totalCount)} of ${totalCount} • ${session.correct} Correct, ${session.missed} Missed (${accuracy}% Accuracy)`;
    }
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (qNumSpan) qNumSpan.textContent = Math.min(session.idx + 1, totalCount);

    resumeCard.hidden = false;
  }

  function resumeSession() {
    const session = getActiveSession();
    if (!session || !Array.isArray(session.pool) || session.pool.length === 0) {
      alert("No active saved session found.");
      return;
    }

    stopTimer();

    selectedCategoryId = session.selectedCategoryId || "all";
    selectedFormat = session.selectedFormat || "mcq";
    selectedMode = session.selectedMode || "shuffle";
    timerDuration = session.timerDuration || 0;

    pool = session.pool || [];
    idx = typeof session.idx === "number" ? session.idx : 0;
    if (idx >= pool.length) idx = pool.length - 1;
    if (idx < 0) idx = 0;

    maxAnsweredIdx = session.maxAnsweredIdx || 0;
    correct = session.correct || 0;
    missed = session.missed || 0;
    roundTotalByCat = session.roundTotalByCat || {};
    roundMissedByCat = session.roundMissedByCat || {};
    missedPool = session.missedPool || [];
    sessionHistory = session.sessionHistory || [];
    bookmarks = new Set(session.bookmarks || []);

    // Sync chips UI to saved config
    syncConfigChips();

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

    window.scrollTo({ top: el("main-content").offsetTop - 20, behavior: "smooth" });
    showQuestion();
  }

  function discardActiveSession() {
    if (confirm("Are you sure you want to discard your saved in-progress session and start fresh?")) {
      clearActiveSession();
      checkAndRenderResumeBanner();
    }
  }

  function syncConfigChips() {
    // Format chips
    qAll(".format-chips .chip").forEach((chip) => {
      const match = chip.dataset.format === selectedFormat;
      chip.classList.toggle("is-active", match);
      chip.setAttribute("aria-checked", match ? "true" : "false");
    });

    // Mode chips
    qAll(".mode-chips .chip").forEach((chip) => {
      const match = chip.dataset.mode === selectedMode;
      chip.classList.toggle("is-active", match);
      chip.setAttribute("aria-checked", match ? "true" : "false");
    });

    // Category chips & select
    const select = el("category-select");
    if (select) select.value = selectedCategoryId;
    qAll("#category-chips .chip").forEach((chip) => {
      const match = chip.dataset.category === selectedCategoryId;
      chip.classList.toggle("is-active", match);
      chip.setAttribute("aria-checked", match ? "true" : "false");
    });

    // Timer chips
    qAll(".timer-chips .chip").forEach((chip) => {
      const match = parseInt(chip.dataset.timer, 10) === timerDuration;
      chip.classList.toggle("is-active", match);
      chip.setAttribute("aria-checked", match ? "true" : "false");
    });
  }

  // --- Question Navigator & Direct Jump Controls ---
  function jumpToQuestion(targetIndex) {
    if (targetIndex < 0 || targetIndex >= pool.length) return;
    if (isTransitioning) return;
    stopTimer();
    idx = targetIndex;
    closeQuestionNavigator();
    showQuestion();
    saveActiveSession();
  }

  function handleQuickJump(value) {
    const num = parseInt(value, 10);
    if (isNaN(num)) return;
    if (num < 1 || num > pool.length) {
      alert(`Please enter a valid question number between 1 and ${pool.length}.`);
      return;
    }
    jumpToQuestion(num - 1);
  }

  function toggleBookmark(targetIndex = idx) {
    if (targetIndex < 0 || targetIndex >= pool.length) return;
    if (bookmarks.has(targetIndex)) {
      bookmarks.delete(targetIndex);
    } else {
      bookmarks.add(targetIndex);
    }
    updateBookmarkButton();
    saveActiveSession();

    const modal = el("question-navigator-modal");
    if (modal && !modal.hidden) {
      renderQuestionGrid(currentNavFilter);
      updateNavigatorCounts();
    }
  }

  function updateBookmarkButton() {
    const isBookmarked = bookmarks.has(idx);

    const btn = el("bookmark-btn");
    if (btn) {
      btn.classList.toggle("is-bookmarked", isBookmarked);
      const textSpan = btn.querySelector(".bookmark-text");
      if (textSpan) textSpan.textContent = isBookmarked ? "Flagged" : "Flag";
      btn.setAttribute("aria-pressed", isBookmarked ? "true" : "false");
    }

    const mobileBtn = el("mobile-bookmark-btn");
    if (mobileBtn) {
      mobileBtn.classList.toggle("is-bookmarked", isBookmarked);
      const mobileText = el("mobile-bookmark-text");
      if (mobileText) mobileText.textContent = isBookmarked ? "Flagged" : "Flag";
      mobileBtn.setAttribute("aria-pressed", isBookmarked ? "true" : "false");
    }
  }

  function openQuestionNavigator(filter = "all") {
    const modal = el("question-navigator-modal");
    if (!modal) return;

    currentNavFilter = filter;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");

    // Sync active filter tab
    qAll(".nav-filter-tab").forEach((tab) => {
      const match = tab.dataset.filter === currentNavFilter;
      tab.classList.toggle("is-active", match);
      tab.setAttribute("aria-selected", match ? "true" : "false");
    });

    updateNavigatorCounts();
    renderQuestionGrid(currentNavFilter);

    // Focus search input
    const input = el("modal-jump-input");
    if (input) {
      input.value = "";
      input.max = pool.length;
      setTimeout(() => input.focus(), 50);
    }

    // Scroll current question cell into view
    setTimeout(() => {
      const currentCell = document.querySelector(".grid-cell-btn.is-current");
      if (currentCell) {
        currentCell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    }, 100);
  }

  function closeQuestionNavigator() {
    const modal = el("question-navigator-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  function updateNavigatorCounts() {
    let correctCount = 0;
    let missedCount = 0;
    let answeredCount = 0;

    sessionHistory.forEach((h) => {
      if (h && h.answered) {
        answeredCount++;
        if (h.isCorrect || h.gotItRight) {
          correctCount++;
        } else {
          missedCount++;
        }
      }
    });

    const unansweredCount = Math.max(0, pool.length - answeredCount);
    const bookmarkedCount = bookmarks.size;

    const countAll = el("nav-count-all");
    const countUnanswered = el("nav-count-unanswered");
    const countCorrect = el("nav-count-correct");
    const countMissed = el("nav-count-missed");
    const countBookmarked = el("nav-count-bookmarked");

    if (countAll) countAll.textContent = pool.length;
    if (countUnanswered) countUnanswered.textContent = unansweredCount;
    if (countCorrect) countCorrect.textContent = correctCount;
    if (countMissed) countMissed.textContent = missedCount;
    if (countBookmarked) countBookmarked.textContent = bookmarkedCount;
  }

  function renderQuestionGrid(filter = "all") {
    const grid = el("question-grid");
    const emptyState = el("grid-empty-state");
    if (!grid) return;

    grid.innerHTML = "";
    let visibleCount = 0;

    pool.forEach((item, i) => {
      const hist = sessionHistory[i];
      const isAnswered = Boolean(hist && hist.answered);
      const isCorrect = Boolean(hist && (hist.isCorrect || hist.gotItRight));
      const isMissed = Boolean(hist && hist.answered && !isCorrect);
      const isCurrent = (i === idx);
      const isBookmarked = bookmarks.has(i);

      // Filtering logic
      if (filter === "unanswered" && isAnswered) return;
      if (filter === "correct" && !isCorrect) return;
      if (filter === "missed" && !isMissed) return;
      if (filter === "bookmarked" && !isBookmarked) return;

      visibleCount++;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "grid-cell-btn";
      btn.dataset.index = i;
      btn.textContent = `${i + 1}`;

      if (isCurrent) btn.classList.add("is-current");
      if (isCorrect) btn.classList.add("is-correct");
      else if (isMissed) btn.classList.add("is-missed");
      else btn.classList.add("is-unanswered");

      if (isBookmarked) btn.classList.add("is-bookmarked");

      let statusLabel = isCurrent ? "Current Question" : (isCorrect ? "Correct" : (isMissed ? "Missed" : "Unanswered"));
      if (isBookmarked) statusLabel += ", Flagged";
      btn.setAttribute("aria-label", `Question ${i + 1}: ${statusLabel}`);
      btn.title = `Question ${i + 1} (${statusLabel})`;

      btn.addEventListener("click", () => {
        jumpToQuestion(i);
      });

      grid.appendChild(btn);
    });

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  }

  function jumpToNextUnanswered() {
    if (!pool || pool.length === 0) return;

    // 1. Search forward from idx + 1 to pool.length - 1
    for (let i = idx + 1; i < pool.length; i++) {
      const hist = sessionHistory[i];
      if (!hist || !hist.answered) {
        jumpToQuestion(i);
        return;
      }
    }

    // 2. Wrap around from 0 to idx - 1
    for (let i = 0; i < idx; i++) {
      const hist = sessionHistory[i];
      if (!hist || !hist.answered) {
        jumpToQuestion(i);
        return;
      }
    }

    // 3. If current question itself is unanswered, stay on it
    if (!sessionHistory[idx] || !sessionHistory[idx].answered) {
      closeQuestionNavigator();
      return;
    }

    alert("Outstanding! You have answered all questions in this session.");
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
    sessionHistory = [];
    bookmarks = new Set();
    maxAnsweredIdx = 0;

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
    saveActiveSession();
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
    const historyItem = sessionHistory[idx];
    const isReviewed = Boolean(historyItem && historyItem.answered);

    // Update navigation controls state & bookmark button
    updateNavControls(isReviewed);
    updateBookmarkButton();

    // Update quick jump input placeholder
    const quickJumpInput = el("quick-jump-input");
    if (quickJumpInput) {
      quickJumpInput.placeholder = `${idx + 1}`;
      quickJumpInput.max = pool.length;
    }

    // Update text & layout
    el("card-question").textContent = item.q;
    el("card-answer").textContent = item.a;
    el("card-category-badge").textContent = item.board;
    el("current-board").textContent = item.board;

    const cardKicker = el("card-kicker");
    if (cardKicker) {
      cardKicker.textContent = isReviewed ? `QUESTION ${idx + 1} • REVIEW` : `QUESTION ${idx + 1}`;
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

    if (isReviewed) {
      // === REVIEW MODE: Show previously answered state ===
      renderReviewedQuestion(item, historyItem);
    } else {
      // === LIVE MODE: Show active interactive question ===
      renderLiveQuestion(item);
    }

    // Smooth card entry animation
    const card = el("quiz-card");
    card.classList.remove("card-slide-in", "card-verdict-right", "card-verdict-wrong");
    void card.offsetWidth; // Trigger reflow for animation restart
    card.classList.add("card-slide-in");

    // Persist current position
    saveActiveSession();
  }

  // --- Render Answered / Historical Question (Review Mode) ---
  function renderReviewedQuestion(item, historyItem) {
    hasAnsweredCurrent = true;

    // Hide active prompt & live verdict row & reveal btn
    const cardPrompt = el("card-prompt");
    if (cardPrompt) cardPrompt.hidden = true;
    el("reveal-btn").hidden = true;
    el("verdict-row").hidden = true;

    // Show review banner and review action row
    const reviewBanner = el("review-banner");
    const reviewActionRow = el("review-action-row");
    if (reviewBanner) reviewBanner.hidden = false;
    if (reviewActionRow) reviewActionRow.hidden = false;

    // Dynamic button label for review action button
    const reviewNextBtnText = el("review-next-btn-text");
    if (reviewNextBtnText) {
      if (idx + 1 === maxAnsweredIdx && maxAnsweredIdx < pool.length) {
        reviewNextBtnText.textContent = `Return to Live Question (Q${maxAnsweredIdx + 1})`;
      } else if (idx + 1 < pool.length) {
        reviewNextBtnText.textContent = `Next Question (Q${idx + 2})`;
      } else {
        reviewNextBtnText.textContent = "View Final Results & Dispatch";
      }
    }

    const bannerIcon = el("review-banner-icon");
    const bannerTitle = el("review-banner-title");
    const bannerDetail = el("review-banner-detail");

    if (selectedFormat === "mcq") {
      el("mcq-container").hidden = false;
      el("answer-panel").hidden = true;

      const grid = el("mcq-grid");
      grid.innerHTML = "";
      currentMcqOptions = historyItem.mcqOptions || generateMcqOptions(item);

      currentMcqOptions.forEach((opt, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mcq-btn";
        btn.dataset.index = index;
        btn.disabled = true;
        btn.setAttribute("aria-label", `Option ${opt.letter}: ${opt.text}`);

        const wasChosen = index === historyItem.selectedIndex;
        const isOptionCorrect = opt.isCorrect;

        if (wasChosen) {
          if (isOptionCorrect) {
            btn.classList.add("is-correct");
          } else {
            btn.classList.add("is-wrong");
          }
        } else if (isOptionCorrect && !historyItem.isCorrect) {
          btn.classList.add("is-revealed-correct");
        }

        btn.innerHTML = `
          <span class="mcq-letter">${opt.letter}</span>
          <span class="mcq-text">${opt.text}</span>
          ${wasChosen ? `<span class="mcq-choice-tag ${isOptionCorrect ? 'correct-tag' : ''}">${isOptionCorrect ? '✓ Your Choice' : '✕ Your Choice'}</span>` : ''}
          ${!wasChosen && isOptionCorrect ? `<span class="mcq-choice-tag correct-tag">✓ Correct Answer</span>` : ''}
        `;
        grid.appendChild(btn);
      });

      const chosenOpt = (historyItem.selectedIndex !== null && historyItem.selectedIndex >= 0) ? currentMcqOptions[historyItem.selectedIndex] : null;
      const correctOpt = currentMcqOptions.find((o) => o.isCorrect);

      if (historyItem.isCorrect) {
        reviewBanner.className = "review-banner is-correct-banner";
        if (bannerIcon) bannerIcon.textContent = "✓";
        if (bannerTitle) bannerTitle.textContent = "You Answered Correctly";
        if (bannerDetail) {
          bannerDetail.innerHTML = `You selected <strong>Option ${chosenOpt ? chosenOpt.letter : ''}</strong>: <em>${chosenOpt ? chosenOpt.text : item.a}</em>`;
        }
      } else {
        reviewBanner.className = "review-banner is-wrong-banner";
        if (bannerIcon) bannerIcon.textContent = "✕";
        if (bannerTitle) bannerTitle.textContent = "You Missed This Question";
        if (bannerDetail) {
          const chosenText = chosenOpt ? `Option ${chosenOpt.letter} (${chosenOpt.text})` : "Timed Out / Unanswered";
          const correctText = correctOpt ? `Option ${correctOpt.letter} (${correctOpt.text})` : item.a;
          bannerDetail.innerHTML = `<span><strong>What you clicked:</strong> ${chosenText}</span><br><span><strong>Official Correct Answer:</strong> ${correctText}</span>`;
        }
      }
    } else {
      // Flashcard Mode Review
      el("mcq-container").hidden = true;
      el("answer-panel").hidden = false;

      if (historyItem.gotItRight) {
        reviewBanner.className = "review-banner is-correct-banner";
        if (bannerIcon) bannerIcon.textContent = "✓";
        if (bannerTitle) bannerTitle.textContent = "You Marked: Got It Right";
        if (bannerDetail) {
          bannerDetail.innerHTML = `<strong>Official Answer:</strong> ${item.a}`;
        }
      } else {
        reviewBanner.className = "review-banner is-wrong-banner";
        if (bannerIcon) bannerIcon.textContent = "✕";
        if (bannerTitle) bannerTitle.textContent = "You Marked: Missed";
        if (bannerDetail) {
          bannerDetail.innerHTML = `<strong>Official Answer:</strong> ${item.a}`;
        }
      }
    }
  }

  // --- Render Live Question (Active Answering Mode) ---
  function renderLiveQuestion(item) {
    // Hide review elements
    const reviewBanner = el("review-banner");
    const reviewActionRow = el("review-action-row");
    if (reviewBanner) reviewBanner.hidden = true;
    if (reviewActionRow) reviewActionRow.hidden = true;

    // Format-specific rendering
    if (selectedFormat === "mcq") {
      el("mcq-container").hidden = false;
      el("card-prompt").hidden = true;
      el("answer-panel").hidden = true;
      el("reveal-btn").hidden = true;
      el("verdict-row").hidden = true;

      renderMcqGrid(item);
    } else {
      el("mcq-container").hidden = true;
      el("card-prompt").hidden = false;
      el("answer-panel").hidden = true;
      el("reveal-btn").hidden = false;
      el("verdict-row").hidden = true;

      setTimeout(() => {
        const revealBtn = el("reveal-btn");
        if (revealBtn && !revealBtn.hidden) revealBtn.focus();
      }, 50);
    }

    // Start countdown timer if configured
    if (timerDuration > 0) {
      startTimer(timerDuration);
    } else {
      const timerDisplay = el("timer-display");
      if (timerDisplay) timerDisplay.hidden = true;
    }
  }

  // --- Update Navigation Buttons & Status Indicators ---
  function updateNavControls(isReviewed) {
    const prevBtn = el("prev-btn");
    const nextBtn = el("next-btn");
    const statusBadge = el("nav-status-badge");
    const statusText = el("nav-status-text");

    // Previous Buttons: active whenever idx > 0
    if (prevBtn) {
      prevBtn.disabled = idx <= 0;
      prevBtn.classList.toggle("is-disabled", idx <= 0);
    }

    const mobilePrevBtn = el("mobile-prev-btn");
    if (mobilePrevBtn) {
      mobilePrevBtn.disabled = idx <= 0;
      mobilePrevBtn.classList.toggle("is-disabled", idx <= 0);
    }

    const mobileProgress = el("mobile-nav-progress");
    if (mobileProgress && pool) {
      mobileProgress.textContent = `Matrix (Q ${idx + 1})`;
    }

    // Top Navigation Next Button & Review Badge
    if (isReviewed) {
      if (statusBadge) {
        statusBadge.hidden = false;
        if (statusText) statusText.textContent = `REVIEWING Q${idx + 1} OF ${pool.length}`;
      }
      if (nextBtn) {
        nextBtn.hidden = false;
        nextBtn.disabled = false;
      }
    } else {
      if (statusBadge) statusBadge.hidden = true;
      if (nextBtn) nextBtn.hidden = true;
    }
  }

  // --- Navigation Handlers ---
  function handlePrevQuestion() {
    if (idx > 0 && !isTransitioning) {
      stopTimer();
      idx--;
      showQuestion();
      saveActiveSession();
    }
  }

  function handleNextQuestion() {
    if (isTransitioning) return;
    stopTimer();
    if (idx < pool.length - 1) {
      idx++;
      showQuestion();
      saveActiveSession();
    } else if (idx === pool.length - 1 && sessionHistory[idx] && sessionHistory[idx].answered) {
      endSession();
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
    const isCorrect = Boolean(selectedOpt && selectedOpt.isCorrect);

    // Save to sessionHistory for instant and future back-navigation review
    sessionHistory[idx] = {
      answered: true,
      format: "mcq",
      mcqOptions: [...currentMcqOptions],
      selectedIndex: selectedIndex,
      isCorrect: isCorrect,
      item: currentItem
    };

    maxAnsweredIdx = Math.max(maxAnsweredIdx, idx + 1);

    // Track category round stats
    if (currentItem.categoryId) {
      roundTotalByCat[currentItem.categoryId] = (roundTotalByCat[currentItem.categoryId] || 0) + 1;
    }

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
      saveActiveSession();

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
      saveActiveSession();

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

    // Save to sessionHistory for back-navigation review
    sessionHistory[idx] = {
      answered: true,
      format: "flashcard",
      gotItRight: gotItRight,
      item: currentItem
    };

    maxAnsweredIdx = Math.max(maxAnsweredIdx, idx + 1);

    // Track category participation
    if (currentItem.categoryId) {
      roundTotalByCat[currentItem.categoryId] = (roundTotalByCat[currentItem.categoryId] || 0) + 1;
    }

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
    saveActiveSession();

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
      if (!hasAnsweredCurrent && (!sessionHistory[idx] || !sessionHistory[idx].answered)) {
        const correctIdx = currentMcqOptions.findIndex((o) => o.isCorrect);
        handleMcqSelection(correctIdx === 0 ? 1 : 0); // Pick a wrong answer to register missed
      }
    } else {
      // In Flashcard mode: reveal answer and flash card border
      if (!isAnswerRevealed && (!sessionHistory[idx] || !sessionHistory[idx].answered)) {
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

    clearActiveSession();

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
    checkAndRenderResumeBanner();

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
    checkAndRenderResumeBanner();
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
      // Escape closes open Navigator modal
      if (e.key === "Escape") {
        const modal = el("question-navigator-modal");
        if (modal && !modal.hidden) {
          e.preventDefault();
          closeQuestionNavigator();
          return;
        }
      }

      // Avoid firing shortcuts when user is typing in inputs or textareas
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      if (activeTag === "input" || activeTag === "textarea") return;

      const sessionVisible = !el("session").hidden;
      if (!sessionVisible) return;

      // J or G -> Open Question Navigator Matrix
      if ((e.key === "j" || e.key === "J" || e.key === "g" || e.key === "G") && !isTransitioning) {
        const modal = el("question-navigator-modal");
        if (!modal || modal.hidden) {
          e.preventDefault();
          openQuestionNavigator("all");
          return;
        }
      }

      // B -> Flag / Bookmark Question
      if ((e.key === "b" || e.key === "B") && !isTransitioning) {
        e.preventDefault();
        toggleBookmark();
        return;
      }

      // PREVIOUS QUESTION SHORTCUT (P or ArrowUp or Alt+ArrowLeft)
      if ((e.key === "p" || e.key === "P" || e.key === "ArrowUp" || (e.altKey && e.key === "ArrowLeft")) && !isTransitioning) {
        if (idx > 0) {
          e.preventDefault();
          handlePrevQuestion();
          return;
        }
      }

      const isReviewed = Boolean(sessionHistory[idx] && sessionHistory[idx].answered);

      // In Review Mode: N, Space, Enter, or ArrowRight advances forward
      if (isReviewed && !isTransitioning) {
        if (e.key === "n" || e.key === "N" || e.code === "Space" || e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
          e.preventDefault();
          handleNextQuestion();
          return;
        }
      }

      // MCQ MODE SHORTCUTS (1, 2, 3, 4 or A, B, C, D) - only in active live mode
      if (selectedFormat === "mcq" && !isReviewed) {
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

      // FLASHCARD MODE SHORTCUTS - only in active live mode
      if (selectedFormat === "flashcard" && !isReviewed) {
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

    // Previous & Next Navigation Buttons
    const prevBtn = el("prev-btn");
    if (prevBtn) {
      prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handlePrevQuestion();
      });
    }

    const nextBtn = el("next-btn");
    if (nextBtn) {
      nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleNextQuestion();
      });
    }

    const reviewNextBtn = el("review-next-btn");
    if (reviewNextBtn) {
      reviewNextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleNextQuestion();
      });
    }

    // Resume Drill & Discard Session
    const resumeBtn = el("resume-btn");
    if (resumeBtn) {
      resumeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        resumeSession();
      });
    }

    const discardBtn = el("discard-session-btn");
    if (discardBtn) {
      discardBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        discardActiveSession();
      });
    }

    // Question Navigator Matrix Open / Close / Filter
    const openNavBtn = el("open-navigator-btn");
    if (openNavBtn) {
      openNavBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openQuestionNavigator("all");
      });
    }

    const closeNavBtn = el("close-navigator-btn");
    if (closeNavBtn) {
      closeNavBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeQuestionNavigator();
      });
    }

    const doneNavBtn = el("modal-done-btn");
    if (doneNavBtn) {
      doneNavBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeQuestionNavigator();
      });
    }

    const nextUnansweredBtn = el("modal-next-unanswered-btn");
    if (nextUnansweredBtn) {
      nextUnansweredBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        jumpToNextUnanswered();
      });
    }

    // Filter tab buttons
    qAll(".nav-filter-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.stopPropagation();
        openQuestionNavigator(tab.dataset.filter);
      });
    });

    // Close modal on outside click
    const navModal = el("question-navigator-modal");
    if (navModal) {
      navModal.addEventListener("click", (e) => {
        if (e.target === navModal) closeQuestionNavigator();
      });
    }

    // Bookmark / Flag button
    const bookmarkBtn = el("bookmark-btn");
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleBookmark();
      });
    }

    // Quick Jump Serial Number Controls
    const quickJumpBtn = el("quick-jump-btn");
    const quickJumpInput = el("quick-jump-input");
    if (quickJumpBtn && quickJumpInput) {
      quickJumpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleQuickJump(quickJumpInput.value);
      });
      quickJumpInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleQuickJump(quickJumpInput.value);
        }
      });
    }

    // Modal Search / Jump Controls
    const modalJumpBtn = el("modal-jump-btn");
    const modalJumpInput = el("modal-jump-input");
    if (modalJumpBtn && modalJumpInput) {
      modalJumpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleQuickJump(modalJumpInput.value);
      });
      modalJumpInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleQuickJump(modalJumpInput.value);
        }
      });
    }

    // Mobile Bottom Floating Dock Actions
    const mobilePrevBtn = el("mobile-prev-btn");
    if (mobilePrevBtn) {
      mobilePrevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handlePrevQuestion();
      });
    }

    const mobileNavBtn = el("mobile-navigator-btn");
    if (mobileNavBtn) {
      mobileNavBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openQuestionNavigator("all");
      });
    }

    const mobileBookmarkBtn = el("mobile-bookmark-btn");
    if (mobileBookmarkBtn) {
      mobileBookmarkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleBookmark();
      });
    }

    const mobileNextUnansweredBtn = el("mobile-next-unanswered-btn");
    if (mobileNextUnansweredBtn) {
      mobileNextUnansweredBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        jumpToNextUnanswered();
      });
    }

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
