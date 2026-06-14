const STORAGE_KEY = "word-memorizer-state-v1";
const WEAK_THRESHOLD = 70;

const sampleWords = [
  {
    word: "abandon",
    meaning: "放弃；舍弃",
    example: "Do not abandon a useful habit after one bad day.",
  },
  {
    word: "fragile",
    meaning: "脆弱的；易碎的",
    example: "The fragile cup needs careful handling.",
  },
  {
    word: "resilient",
    meaning: "有韧性的；能恢复的",
    example: "A resilient learner keeps adjusting the method.",
  },
  {
    word: "context",
    meaning: "语境；背景",
    example: "Guessing from context can help you remember new words.",
  },
  {
    word: "efficient",
    meaning: "高效的",
    example: "Short daily reviews are more efficient than cramming.",
  },
];

const defaultState = {
  words: [],
  log: [],
  currentFilter: "all",
  autoWeak: true,
};

let state = loadState();
let deck = [];
let currentCard = null;
let currentIndex = 0;

const els = {
  totalWords: document.querySelector("#totalWords"),
  dueWords: document.querySelector("#dueWords"),
  weakWords: document.querySelector("#weakWords"),
  masteredWords: document.querySelector("#masteredWords"),
  wordForm: document.querySelector("#wordForm"),
  wordInput: document.querySelector("#wordInput"),
  meaningInput: document.querySelector("#meaningInput"),
  exampleInput: document.querySelector("#exampleInput"),
  bulkInput: document.querySelector("#bulkInput"),
  bulkImportBtn: document.querySelector("#bulkImportBtn"),
  loadSampleBtn: document.querySelector("#loadSampleBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  wordList: document.querySelector("#wordList"),
  filterButtons: document.querySelectorAll(".filter"),
  autoWeakToggle: document.querySelector("#autoWeakToggle"),
  queueMeta: document.querySelector("#queueMeta"),
  emptyState: document.querySelector("#emptyState"),
  flashCard: document.querySelector("#flashCard"),
  cardTag: document.querySelector("#cardTag"),
  cardProgress: document.querySelector("#cardProgress"),
  cardWord: document.querySelector("#cardWord"),
  cardMeaning: document.querySelector("#cardMeaning"),
  cardExample: document.querySelector("#cardExample"),
  answerBox: document.querySelector("#answerBox"),
  revealBtn: document.querySelector("#revealBtn"),
  gradeRow: document.querySelector("#gradeRow"),
  speakBtn: document.querySelector("#speakBtn"),
  reviewLog: document.querySelector("#reviewLog"),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.words)) return structuredClone(defaultState);
    return {
      ...structuredClone(defaultState),
      ...saved,
      words: saved.words.map(normalizeWord),
      log: Array.isArray(saved.log) ? saved.log.slice(0, 30) : [],
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeWord(raw) {
  return {
    id: raw.id || crypto.randomUUID(),
    word: String(raw.word || "").trim(),
    meaning: String(raw.meaning || "").trim(),
    example: String(raw.example || "").trim(),
    mastery: clamp(Number(raw.mastery ?? 0), 0, 100),
    seenCount: Number(raw.seenCount || 0),
    lapses: Number(raw.lapses || 0),
    streak: Number(raw.streak || 0),
    intervalHours: Number(raw.intervalHours || 0),
    dueAt: Number(raw.dueAt || Date.now()),
    lastSeenAt: Number(raw.lastSeenAt || 0),
    createdAt: Number(raw.createdAt || Date.now()),
  };
}

function createWord({ word, meaning, example = "" }) {
  return normalizeWord({
    word,
    meaning,
    example,
    createdAt: Date.now(),
    dueAt: Date.now(),
  });
}

function addWords(items) {
  const existing = new Set(state.words.map((item) => item.word.toLowerCase()));
  const next = [];

  for (const item of items) {
    const word = String(item.word || "").trim();
    const meaning = String(item.meaning || "").trim();
    if (!word || !meaning || existing.has(word.toLowerCase())) continue;
    existing.add(word.toLowerCase());
    next.push(createWord({ word, meaning, example: item.example || "" }));
  }

  if (next.length > 0) {
    state.words = [...next, ...state.words];
    rebuildDeck();
    persistAndRender();
  }

  return next.length;
}

function isDue(word) {
  return word.dueAt <= Date.now();
}

function isWeak(word) {
  return word.seenCount > 0 && word.mastery < WEAK_THRESHOLD;
}

function isMastered(word) {
  return word.seenCount > 0 && word.mastery >= 88 && word.streak >= 3;
}

function getTag(word) {
  if (word.seenCount === 0) return "新词";
  if (isWeak(word)) return "薄弱词";
  if (isMastered(word)) return "熟练";
  return "复习";
}

function buildDeck() {
  const now = Date.now();
  const due = state.words.filter((word) => word.dueAt <= now);
  const dueIds = new Set(due.map((word) => word.id));
  const weak = state.autoWeak
    ? state.words.filter((word) => isWeak(word) && !dueIds.has(word.id))
    : [];

  const cards = [];

  for (const word of due) {
    cards.push(word);
    if (state.autoWeak && isWeak(word)) {
      const extra = Math.min(3, Math.ceil((WEAK_THRESHOLD - word.mastery) / 20));
      for (let index = 0; index < extra; index += 1) cards.push(word);
    }
  }

  for (const word of weak) {
    const extra = Math.min(2, Math.ceil((WEAK_THRESHOLD - word.mastery) / 25));
    for (let index = 0; index < extra; index += 1) cards.push(word);
  }

  return shuffle(cards).sort((a, b) => {
    const dueDiff = a.dueAt - b.dueAt;
    if (dueDiff !== 0) return dueDiff;
    return a.mastery - b.mastery;
  });
}

function rebuildDeck() {
  deck = buildDeck();
  currentIndex = 0;
  currentCard = deck[0] || null;
}

function showCurrentCard() {
  if (!currentCard) {
    els.emptyState.classList.remove("hidden");
    els.flashCard.classList.add("hidden");
    els.queueMeta.textContent = state.words.length
      ? "当前没有到期卡片，薄弱词会按计划再次出现"
      : "暂无复习队列";
    return;
  }

  els.emptyState.classList.add("hidden");
  els.flashCard.classList.remove("hidden");
  els.answerBox.classList.add("hidden");
  els.gradeRow.classList.add("hidden");
  els.revealBtn.classList.remove("hidden");

  els.cardTag.textContent = getTag(currentCard);
  els.cardProgress.textContent = `${Math.min(currentIndex + 1, deck.length)} / ${deck.length}`;
  els.cardWord.textContent = currentCard.word;
  els.cardMeaning.textContent = currentCard.meaning;
  els.cardExample.textContent = currentCard.example || "暂无例句";
  els.queueMeta.textContent = describeQueue();
}

function revealAnswer() {
  if (!currentCard) return;
  els.answerBox.classList.remove("hidden");
  els.gradeRow.classList.remove("hidden");
  els.revealBtn.classList.add("hidden");
}

function gradeCurrent(grade) {
  if (!currentCard) return;

  const word = state.words.find((item) => item.id === currentCard.id);
  if (!word) return;

  applyGrade(word, grade);
  state.log.unshift({
    id: crypto.randomUUID(),
    word: word.word,
    grade,
    mastery: word.mastery,
    time: Date.now(),
  });
  state.log = state.log.slice(0, 30);

  currentIndex += 1;
  currentCard = deck[currentIndex] || null;

  if (!currentCard) rebuildDeck();
  persistAndRender();
}

function applyGrade(word, grade) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  word.seenCount += 1;
  word.lastSeenAt = now;

  if (grade === "again") {
    word.mastery = clamp(word.mastery - 18, 0, 100);
    word.streak = 0;
    word.lapses += 1;
    word.intervalHours = 0.08;
    word.dueAt = now + 5 * 60 * 1000;
    return;
  }

  if (grade === "hard") {
    word.mastery = clamp(word.mastery + 8, 0, 68);
    word.streak = 0;
    word.intervalHours = Math.max(0.2, word.intervalHours * 0.55);
    word.dueAt = now + Math.max(12 * 60 * 1000, word.intervalHours * hour);
    return;
  }

  if (grade === "good") {
    word.mastery = clamp(word.mastery + 20, 0, 90);
    word.streak += 1;
    word.intervalHours = word.intervalHours ? word.intervalHours * 2.1 : 24;
    word.dueAt = now + word.intervalHours * hour;
    return;
  }

  word.mastery = clamp(word.mastery + 30, 0, 100);
  word.streak += 1;
  word.intervalHours = word.intervalHours ? word.intervalHours * 3.2 : 72;
  word.dueAt = now + word.intervalHours * hour;

  if (word.mastery >= 96 && word.streak >= 4) {
    word.dueAt = now + 14 * day;
  }
}

function describeQueue() {
  const dueCount = state.words.filter(isDue).length;
  const weakCount = state.words.filter(isWeak).length;
  if (deck.length === 0) return "今天已经清空";
  if (state.autoWeak) {
    return `${deck.length} 张卡片，含 ${dueCount} 个到期词和 ${weakCount} 个薄弱词`;
  }
  return `${deck.length} 张到期卡片`;
}

function renderStats() {
  els.totalWords.textContent = state.words.length;
  els.dueWords.textContent = state.words.filter(isDue).length;
  els.weakWords.textContent = state.words.filter(isWeak).length;
  els.masteredWords.textContent = state.words.filter(isMastered).length;
}

function renderWordList() {
  const filtered = state.words.filter((word) => {
    if (state.currentFilter === "due") return isDue(word);
    if (state.currentFilter === "weak") return isWeak(word);
    if (state.currentFilter === "mastered") return isMastered(word);
    return true;
  });

  els.wordList.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = state.words.length ? "这个筛选下暂无单词" : "词库还是空的";
    els.wordList.append(empty);
    return;
  }

  for (const word of filtered) {
    const item = document.createElement("article");
    item.className = "word-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(word.word)}</strong>
        <p>${escapeHtml(word.meaning)} · ${getTag(word)} · ${Math.round(word.mastery)}%</p>
        <div class="meter" aria-label="掌握度 ${Math.round(word.mastery)}%">
          <span style="width: ${Math.round(word.mastery)}%"></span>
        </div>
      </div>
      <button type="button" data-delete="${word.id}" title="删除 ${escapeHtml(word.word)}" aria-label="删除 ${escapeHtml(word.word)}">×</button>
    `;
    els.wordList.append(item);
  }
}

function renderLog() {
  els.reviewLog.innerHTML = "";
  for (const entry of state.log.slice(0, 12)) {
    const item = document.createElement("li");
    item.textContent = `${entry.word}：${gradeText(entry.grade)}，掌握度 ${Math.round(entry.mastery)}%`;
    els.reviewLog.append(item);
  }
}

function persistAndRender() {
  saveState();
  renderStats();
  renderWordList();
  renderLog();
  showCurrentCard();
  syncControls();
}

function syncControls() {
  els.autoWeakToggle.checked = state.autoWeak;
  for (const button of els.filterButtons) {
    button.classList.toggle("active", button.dataset.filter === state.currentFilter);
  }
}

function parseBulk(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [word = "", meaning = "", ...rest] = line.split(",");
      return {
        word: word.trim(),
        meaning: meaning.trim(),
        example: rest.join(",").trim(),
      };
    });
}

function deleteWord(id) {
  state.words = state.words.filter((word) => word.id !== id);
  rebuildDeck();
  persistAndRender();
}

function exportData() {
  const payload = JSON.stringify(state.words, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `word-memorizer-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function speak(word) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function gradeText(grade) {
  return {
    again: "不会",
    hard: "不熟",
    good: "记得",
    easy: "熟练",
  }[grade];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.wordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const added = addWords([
    {
      word: els.wordInput.value,
      meaning: els.meaningInput.value,
      example: els.exampleInput.value,
    },
  ]);
  if (added) event.target.reset();
});

els.bulkImportBtn.addEventListener("click", () => {
  const added = addWords(parseBulk(els.bulkInput.value));
  if (added) els.bulkInput.value = "";
});

els.loadSampleBtn.addEventListener("click", () => {
  addWords(sampleWords);
});

els.exportBtn.addEventListener("click", exportData);

els.resetBtn.addEventListener("click", () => {
  const ok = window.confirm("确定清空所有单词和复习记录吗？");
  if (!ok) return;
  state = structuredClone(defaultState);
  rebuildDeck();
  persistAndRender();
});

els.wordList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  deleteWord(button.dataset.delete);
});

els.filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.currentFilter = button.dataset.filter;
    persistAndRender();
  });
});

els.autoWeakToggle.addEventListener("change", () => {
  state.autoWeak = els.autoWeakToggle.checked;
  rebuildDeck();
  persistAndRender();
});

els.revealBtn.addEventListener("click", revealAnswer);

els.gradeRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-grade]");
  if (!button) return;
  gradeCurrent(button.dataset.grade);
});

els.speakBtn.addEventListener("click", () => {
  if (currentCard) speak(currentCard.word);
});

window.addEventListener("keydown", (event) => {
  if (!currentCard) return;
  if (event.target.matches("input, textarea")) return;
  if (event.key === " ") {
    event.preventDefault();
    revealAnswer();
  }
  if (["1", "2", "3", "4"].includes(event.key) && !els.gradeRow.classList.contains("hidden")) {
    const grades = ["again", "hard", "good", "easy"];
    gradeCurrent(grades[Number(event.key) - 1]);
  }
});

rebuildDeck();
persistAndRender();
