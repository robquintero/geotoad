"use strict";

const ROUND_LENGTH = 5;
const DAILY_STATE_VERSION = 4;
const QUESTION_SECONDS = 60;
const COMPLETION_BONUS = 100;
const MAX_WRONG_GUESSES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = "geotoad:";
const LEGACY_STORAGE_PREFIX = "froggy-five:";
const RARITY_POINTS = { common: 25, rare: 50, epic: 100 };
const QUESTION_BANK = window.GEOTOAD_QUESTION_BANK;
if (!Array.isArray(QUESTION_BANK)) throw new Error("The Geotoad question bank could not be loaded.");
const DAILY_CYCLE_CACHE = new Map();
const DAILY_COMBINATION_KEYS = new Set();
const PAD_GAP = 104;
const FROG_SCALE = 0.2;
const ATLAS_FRAME_SIZE = 384;
const FROG_FRAME_CENTROIDS = [
  [[185.66, 251.73], [193.19, 260.44], [204.68, 191.11], [208.03, 183.38]],
  [[188.67, 198.77], [192.63, 215.19], [192.96, 179.5], [189.57, 183.44]]
];
const FROG_ANCHOR_SCREEN_Y = 0.67;
const POND_ASSET_PATHS = {
  action: "assets/sprites/pond-atlas.png"
};
const WATER_PALETTES = [
  ["#4c9da1", "#327d86", "#20566f"],
  ["#478fa8", "#2c718d", "#204f70"],
  ["#3d83a4", "#286889", "#1c486c"],
  ["#438f94", "#2b747d", "#1d5368"],
  ["#438f7c", "#2d745f", "#205851"],
  ["#4a879c", "#316d86", "#204a69"]
];
const PAD_X_PATTERN = [0.5, 0.29, 0.68, 0.42, 0.76, 0.24, 0.55, 0.81, 0.37, 0.63, 0.2, 0.47, 0.73, 0.34];
const pondScene = {
  assets: null,
  canvasContext: null,
  width: 0,
  height: 0,
  pixelRatio: 1,
  zoom: 1,
  zoomFrom: 1,
  zoomTo: 1,
  zoomStartedAt: 0,
  cameraX: 0,
  cameraY: 0,
  frogX: 0,
  frogY: 0,
  landedPadIndex: 0,
  hop: null,
  lastFrameTime: 0,
  resizeObserver: null,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  audioContext: null
};
const $ = (selector) => document.querySelector(selector);

const elements = {
  answerArea: $("#answer-area"),
  answerChips: $("#answer-chips"),
  answerFeedback: $("#answer-feedback"),
  answerForm: $("#answer-form"),
  answerInput: $("#answer-input"),
  bestScore: $("#best-score"),
  category: $("#category-pill"),
  clockFace: $("#clock-face"),
  clockProgress: $("#clock-progress"),
  clockSubtitle: $("#clock-subtitle"),
  clockTitle: $("#clock-title"),
  currentScore: $("#current-score"),
  mobileRoundIndex: $(".mobile-round-index"),
  mobileRoundCategory: $(".mobile-round-category"),
  closeHelp: $("#close-help"),
  closeHelpDone: $("#close-help-done"),
  closeResult: $("#close-result"),
  dayLabel: $("#today-label"),
  dailyBadgeLabel: $("#daily-badge-label"),
  footerYear: $("#footer-year"),
  foundCount: $("#found-count"),
  gameLayout: $(".game-layout"),
  gameNumber: $("#game-number"),
  gameHelpButton: $("#game-help-button"),
  helpDialog: $("#help-dialog"),
  homeStartButton: $("#home-start-button"),
  homeFreestyleButton: $("#home-freestyle-button"),
  homeDescription: $(".home-description"),
  homeCountdown: $("#home-countdown"),
  frogCaption: $("#frog-caption"),
  frogQuestionBadge: $("#frog-question-badge"),
  pondCanvas: $("#pond-canvas"),
  hopProgressLabel: $("#hop-progress-label"),
  mistakeCount: $("#mistake-count"),
  mistakeDots: $("#mistake-dots"),
  frogStage: $("#frog-stage"),
  playedCount: $("#played-count"),
  progressCount: $("#progress-count"),
  progressDots: $("#progress-dots"),
  questionArea: $("#question-area"),
  questionIndex: $("#question-index"),
  questionNote: $("#question-note"),
  questionTitle: $("#question-title"),
  resultBreakdown: $("#result-breakdown"),
  resultDialog: $("#result-dialog"),
  resultEpic: $("#result-epic"),
  resultFound: $("#result-found"),
  resultKicker: $("#result-kicker"),
  resultMissed: $("#result-missed"),
  resultScore: $("#result-score"),
  resultSummary: $("#result-summary"),
  resultTypeLabel: $("#result-type-label"),
  resultPersistenceNote: $("#result-persistence-note"),
  returnHomeButton: $("#return-home"),
  freestyleAgainButton: $("#freestyle-again"),
  shareButton: $("#share-button"),
  shareStatus: $("#share-status"),
  startButton: $("#start-button"),
  startButtonLabel: $("#start-button-label"),
  streakCount: $("#streak-count"),
  timerValue: $("#timer-value"),
  toast: $("#toast")
};

let today = dateKey(new Date());
let dailyQuestions = getDailyQuestions(today);
let dailyKey = `${STORAGE_PREFIX}daily:${today}`;
const statsKey = `${STORAGE_PREFIX}stats`;
let state = null;
let stats = readJson(statsKey, readJson(`${LEGACY_STORAGE_PREFIX}stats`, { best: 0, played: 0, streak: 0, lastPlayed: "" }));
let ticker = null;
let toastTimer = null;
let feedbackTimer = null;
let transitioning = false;
const soundEnabled = true;

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function updateDailyHeader() {
  elements.dayLabel.textContent = formatToday(new Date());
  elements.gameNumber.textContent = `HOP NO. ${String(getDailyGameNumber(today)).padStart(3, "0")}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Could not read saved game data (${key}).`, error);
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Could not save game data (${key}).`, error);
    showToast("Couldn't save your game on this device.");
  }
}

function saveGameState() {
  if (state?.mode === "freestyle") return;
  saveJson(dailyKey, state);
}

function getDailyQuestions(key) {
  const [year, month, day] = key.split("-").map(Number);
  const dayNumber = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(2025, 0, 1)) / DAY_MS);
  const cycleLength = Math.max(1, Math.floor(QUESTION_BANK.length / ROUND_LENGTH));
  const cycle = Math.floor(dayNumber / cycleLength);
  const dayInCycle = ((dayNumber % cycleLength) + cycleLength) % cycleLength;
  for (let cycleIndex = 0; cycleIndex <= cycle; cycleIndex += 1) {
    if (DAILY_CYCLE_CACHE.has(cycleIndex)) continue;
    let seed = cycleIndex + 2025;
    while (true) {
      const shuffled = seededShuffle(QUESTION_BANK, seed);
      const combinationKeys = Array.from({ length: cycleLength }, (_, index) =>
        shuffled.slice(index * ROUND_LENGTH, (index + 1) * ROUND_LENGTH)
          .map((question) => question.prompt)
          .sort()
          .join("|")
      );
      if (combinationKeys.every((key) => !DAILY_COMBINATION_KEYS.has(key))) {
        combinationKeys.forEach((key) => DAILY_COMBINATION_KEYS.add(key));
        DAILY_CYCLE_CACHE.set(cycleIndex, shuffled);
        break;
      }
      seed += 1;
    }
  }
  const cycleQuestions = DAILY_CYCLE_CACHE.get(cycle);
  const start = dayInCycle * ROUND_LENGTH;
  return cycleQuestions.slice(start, start + ROUND_LENGTH);
}

function formatToday(date) {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(date).toUpperCase();
}

function seededShuffle(items, seed) {
  let value = seed >>> 0;
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    value = (value * 1664525 + 1013904223) >>> 0;
    const swapIndex = Math.floor((value / 0x100000000) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function loadDailyState() {
  const saved = readJson(dailyKey, null);
  if (!saved || saved.dailyVersion !== DAILY_STATE_VERSION || !Array.isArray(saved.answersFound) || saved.answersFound.length !== ROUND_LENGTH) {
    state = createEmptyState(dailyQuestions, "daily");
    saveGameState();
    return;
  }
  state = saved;
  state.mode = "daily";
  if (!Array.isArray(state.wrongGuesses) || state.wrongGuesses.length !== ROUND_LENGTH) {
    state.wrongGuesses = dailyQuestions.map(() => 0);
  }
  if (!Array.isArray(state.questionScores) || state.questionScores.length !== ROUND_LENGTH) {
    state.questionScores = dailyQuestions.map(() => 0);
  }
}

function normalizeAnswer(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function createEmptyState(questions = dailyQuestions, mode = "daily") {
  return {
    dailyVersion: DAILY_STATE_VERSION,
    mode,
    status: "ready",
    questionIndex: 0,
    answersFound: questions.map(() => []),
    wrongGuesses: questions.map(() => 0),
    questionScores: questions.map(() => 0),
    questionEndsAt: null,
    totalScore: 0,
    startedAt: null
  };
}

function init() {
  validateQuestionBank();
  loadDailyState();
  updateDailyHeader();
  elements.footerYear.textContent = String(new Date().getFullYear());
  elements.progressDots.innerHTML = Array.from({ length: ROUND_LENGTH }, (_, index) =>
    `<span class="progress-dot${index === 0 ? " is-current" : ""}" data-dot="${index}"></span>`
  ).join("");

  if (!stats || typeof stats !== "object") stats = { best: 0, played: 0, streak: 0, lastPlayed: "" };
  updateStats();
  renderState();
  bindEvents();
  startPondRenderer();
  updateHomeDailyCountdown();
  window.setInterval(updateHomeDailyCountdown, 1000);
  window.setInterval(checkLocalDay, 30000);
  document.addEventListener("visibilitychange", checkLocalDay);
}

function validateQuestionBank() {
  if (QUESTION_BANK.length !== 50) {
    throw new Error(`The Geotoad question bank must contain 50 prompts; found ${QUESTION_BANK.length}.`);
  }
  const prompts = new Set();
  QUESTION_BANK.forEach((question) => {
    if (
      typeof question.category !== "string" ||
      !question.category.trim() ||
      question.answerType !== "country" ||
      typeof question.prompt !== "string" ||
      !question.prompt.trim() ||
      typeof question.note !== "string" ||
      !question.note.trim() ||
      !Array.isArray(question.answers) ||
      question.answers.length < 3
    ) {
      throw new Error("Each Geotoad question needs a category, a country-list prompt, a scope note, and at least three answers.");
    }
    const promptKey = normalizeAnswer(question.prompt);
    if (prompts.has(promptKey)) throw new Error(`Duplicate Geotoad prompt: ${question.prompt}`);
    prompts.add(promptKey);
    if (!Array.isArray(question.sources) || !question.sources.length) {
      throw new Error(`Missing sources for: ${question.prompt}`);
    }
    question.sources.forEach((source) => {
      if (typeof source !== "string" || !source.startsWith("https://")) {
        throw new Error(`Invalid source URL for: ${question.prompt}`);
      }
    });
    const acceptedAnswers = new Set();
    question.answers.forEach((answer) => {
      if (
        typeof answer.name !== "string" ||
        !answer.name.trim() ||
        !Array.isArray(answer.aliases) ||
        answer.aliases.some((alias) => typeof alias !== "string" || !alias.trim()) ||
        !Object.hasOwn(RARITY_POINTS, answer.rarity)
      ) {
        throw new Error(`Invalid answer or rarity in: ${question.prompt}`);
      }
      [answer.name, ...answer.aliases].forEach((value) => {
        const normalized = normalizeAnswer(value);
        if (!normalized || acceptedAnswers.has(normalized)) {
          throw new Error(`Duplicate or empty answer "${value}" in: ${question.prompt}`);
        }
        acceptedAnswers.add(normalized);
      });
    });
  });
}

function validateAnswerRankings() {
  dailyQuestions.forEach((question) => {
    question.answers.forEach(({ name }) => {
      const rarity = getAnswerRarity(question, name);
      if (!Object.hasOwn(RARITY_POINTS, rarity)) {
        throw new Error(`Missing or invalid rarity ranking for "${name}" in "${question.prompt}".`);
      }
    });
  });
}

function getAnswerRarity(question, answerName) {
  const record = question.answers.find((answer) => normalizeAnswer(answer.name) === normalizeAnswer(answerName));
  const rarity = record?.rarity;
  if (!rarity) throw new Error(`Missing rarity ranking for "${answerName}" in "${question.prompt}".`);
  return rarity;
}

function bindEvents() {
  elements.startButton.addEventListener("click", () => {
    playUiSound(state.status === "between" ? "transition" : "confirm");
    startGame();
  });
  elements.homeStartButton.addEventListener("click", () => {
    playUiSound("confirm");
    activateDailyGame();
    startGame();
  });
  elements.homeFreestyleButton.addEventListener("click", () => {
    playUiSound("confirm");
    startFreestyle();
  });
  elements.answerForm.addEventListener("submit", submitAnswer);
  elements.gameHelpButton.addEventListener("click", () => { playUiSound("tap"); elements.helpDialog.showModal(); });
  elements.closeHelp.addEventListener("click", () => { playUiSound("tap"); elements.helpDialog.close(); });
  elements.closeHelpDone.addEventListener("click", () => { playUiSound("tap"); elements.helpDialog.close(); });
  elements.closeResult.addEventListener("click", () => { playUiSound("tap"); elements.resultDialog.close(); });
  elements.returnHomeButton.addEventListener("click", () => {
    playUiSound("tap");
    elements.resultDialog.close();
    activateDailyGame();
    renderHome();
  });
  elements.freestyleAgainButton.addEventListener("click", () => {
    playUiSound("confirm");
    elements.resultDialog.close();
    startFreestyle();
  });
  elements.shareButton.addEventListener("click", () => { playUiSound("tap"); shareResult(); });
  elements.answerInput.addEventListener("input", () => {
    if (feedbackTimer) window.clearTimeout(feedbackTimer);
    elements.answerFeedback.textContent = "";
    elements.answerFeedback.classList.remove("is-correct");
  });
  elements.resultDialog.addEventListener("click", (event) => {
    if (event.target === elements.resultDialog) elements.resultDialog.close();
  });
  elements.helpDialog.addEventListener("click", (event) => {
    if (event.target === elements.helpDialog) elements.helpDialog.close();
  });
}

function getAudioContext() {
  if (!soundEnabled) return null;
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!pondScene.audioContext) pondScene.audioContext = new AudioContextConstructor();
  if (pondScene.audioContext.state === "suspended") {
    pondScene.audioContext.resume().catch((error) => console.error("Could not resume game audio.", error));
  }
  return pondScene.audioContext;
}

function playTone(startFrequency, endFrequency, duration, volume = 0.045, delay = 0, type = "sine") {
  const audio = getAudioContext();
  if (!audio) return;
  const startAt = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startAt + duration);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

function playUiSound(kind) {
  if (kind === "transition") {
    playTone(440, 590, 0.12, 0.04);
    playTone(660, 880, 0.16, 0.035, 0.11);
    return;
  }
  if (kind === "confirm") {
    playTone(520, 700, 0.11, 0.035, 0, "triangle");
    return;
  }
  playTone(440, 360, 0.055, 0.018, 0, "triangle");
}

function playAnswerSound(answerNumber) {
  const pitch = Math.min(1080, 480 * 1.055 ** Math.max(0, answerNumber - 1));
  playTone(pitch, pitch * 1.24, 0.14, 0.05, 0, "sine");
  playTone(pitch * 1.5, pitch * 1.68, 0.18, 0.025, 0.085, "triangle");
}

function playCorrectionSound() {
  playTone(540, 690, 0.1, 0.025, 0, "sine");
}

function playErrorSound() {
  playTone(230, 170, 0.14, 0.025, 0, "triangle");
}

function playTimeoutSound() {
  playTone(620, 480, 0.28, 0.018, 0, "sine");
}

function renderState() {
  updateCurrentScore();
  validateAnswerRankings();
  if (state.status === "ready") {
    renderHome();
    return;
  }
  if (state.status === "between") {
    renderTransition();
    return;
  }
  if (state.status === "complete") {
    renderHome();
    return;
  }
  if (state.status === "playing") {
    if ((state.wrongGuesses[state.questionIndex] || 0) >= MAX_WRONG_GUESSES) {
      renderQuestion();
      advanceQuestion("strikes");
      return;
    }
    if (!Number.isFinite(state.questionEndsAt)) {
      state.questionEndsAt = Date.now() + QUESTION_SECONDS * 1000;
      saveGameState();
    }
    elements.startButtonLabel.textContent = "RESUME TODAY'S GAME";
    renderQuestion();
    setInputEnabled(true);
    updateTimer();
    ticker = window.setInterval(updateTimer, 100);
    return;
  }
}

function renderHome() {
  transitioning = false;
  window.clearInterval(ticker);
  elements.gameLayout.classList.add("is-home");
  elements.gameLayout.classList.remove("is-transition");
  pondScene.zoom = 0.62;
  pondScene.zoomFrom = 0.62;
  pondScene.zoomTo = 0.62;
  const firstQuestion = getDailyQuestions(today)[0];
  validateAnswerRankings();
  elements.answerArea.hidden = false;
  setInputEnabled(false);
  elements.questionIndex.textContent = "QUESTION 01 / 05";
  elements.category.textContent = firstQuestion.category;
  elements.questionTitle.textContent = firstQuestion.prompt;
  elements.questionNote.textContent = firstQuestion.note;
  elements.answerInput.value = "";
  elements.answerFeedback.textContent = "";
  elements.answerFeedback.classList.remove("is-correct");
  elements.answerChips.replaceChildren();
  elements.foundCount.textContent = `0 / ${firstQuestion.answers.length}`;
  updateMistakeMeter();
  const hasCompletedToday = state.status === "complete";
  elements.dailyBadgeLabel.textContent = "TODAY'S CHALLENGE";
  elements.gameNumber.textContent = `HOP NO. ${String(getDailyGameNumber(today)).padStart(3, "0")}`;
  const homeAction = hasCompletedToday ? "VIEW TODAY'S SCORE" : "START TODAY'S HOP";
  elements.homeStartButton.innerHTML = `${homeAction} <span aria-hidden="true">→</span>`;
  elements.homeDescription.textContent = hasCompletedToday
    ? "Today's hop is complete. Come see how you did."
    : "Your first hop is ready. Five rounds, sixty seconds each. Let's see how far you can go.";
  updateHomeDailyCountdown();
  elements.homeFreestyleButton.hidden = false;
  elements.startButtonLabel.textContent = hasCompletedToday ? "VIEW TODAY'S SCORE" : "BEGIN TODAY'S HOP";
  elements.startButton.disabled = false;
  elements.progressCount.textContent = "QUESTION 1 OF 5";
  elements.timerValue.textContent = "60";
  elements.clockTitle.textContent = "THE CLOCK IS YOURS";
  elements.clockSubtitle.textContent = "60 SECONDS PER QUESTION";
  elements.clockProgress.style.strokeDashoffset = "0";
  elements.clockFace.classList.remove("is-complete");
  updateProgress();
  updateFrogTrail();
  updateMobileRoundStatus();
}

function startGame() {
  if (state.status === "complete") {
    showResult();
    return;
  }
  if (state.status === "between") {
    continueGame();
    return;
  }
  if (state.status === "playing") {
    elements.answerInput.focus();
    return;
  }
  animatePondZoom(1);
  state.status = "playing";
  state.questionIndex = 0;
  state.startedAt = Date.now();
  state.questionEndsAt = Date.now() + QUESTION_SECONDS * 1000;
  saveGameState();
  renderQuestion();
  setInputEnabled(true);
  updateTimer();
  ticker = window.setInterval(updateTimer, 100);
  elements.startButtonLabel.textContent = "GAME IN PROGRESS";
  elements.startButton.disabled = true;
  focusAnswerInput();
}

function startFreestyle() {
  window.clearInterval(ticker);
  dailyQuestions = seededShuffle(QUESTION_BANK, Math.floor(Math.random() * 0x100000000)).slice(0, ROUND_LENGTH);
  state = createEmptyState(dailyQuestions, "freestyle");
  elements.dailyBadgeLabel.textContent = "FREESTYLE";
  elements.gameNumber.textContent = "UNLIMITED";
  resetPondToCurrentProgress();
  animatePondZoom(1);
  startGame();
}

function activateDailyGame() {
  today = dateKey(new Date());
  dailyKey = `${STORAGE_PREFIX}daily:${today}`;
  dailyQuestions = getDailyQuestions(today);
  loadDailyState();
  updateDailyHeader();
  elements.dailyBadgeLabel.textContent = "TODAY'S CHALLENGE";
  resetPondToCurrentProgress();
}

function checkLocalDay() {
  if (state?.mode === "freestyle") return;
  const localToday = dateKey(new Date());
  if (localToday === today) return;
  window.clearInterval(ticker);
  if (elements.resultDialog.open) elements.resultDialog.close();
  transitioning = false;
  today = localToday;
  dailyKey = `${STORAGE_PREFIX}daily:${today}`;
  dailyQuestions = getDailyQuestions(today);
  loadDailyState();
  updateDailyHeader();
  elements.dailyBadgeLabel.textContent = "TODAY'S CHALLENGE";
  resetPondToCurrentProgress();
  renderState();
}

function updateHomeDailyCountdown() {
  if (!elements.gameLayout.classList.contains("is-home")) return;
  const now = new Date();
  if (dateKey(now) !== today) {
    checkLocalDay();
    if (!elements.gameLayout.classList.contains("is-home")) return;
  }
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const remaining = Math.max(0, nextMidnight.getTime() - now.getTime());
  const hours = String(Math.floor(remaining / 3600000)).padStart(2, "0");
  const minutes = String(Math.floor((remaining % 3600000) / 60000)).padStart(2, "0");
  const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
  elements.homeCountdown.dateTime = nextMidnight.toISOString();
  elements.homeCountdown.textContent = `${hours}:${minutes}:${seconds}`;
}

function getDailyGameNumber(key) {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(2025, 0, 1)) / DAY_MS) + 1;
}

function resetPondToCurrentProgress() {
  if (!pondScene.width || !pondScene.height) return;
  const hops = totalPadsHopped();
  const position = padPosition(hops, pondScene.width);
  pondScene.hop = null;
  pondScene.landedPadIndex = hops;
  pondScene.frogX = position.x;
  pondScene.frogY = position.y;
  pondScene.cameraX = position.x - pondScene.width * 0.5;
  pondScene.cameraY = position.y - pondScene.height * FROG_ANCHOR_SCREEN_Y;
}

function renderQuestion() {
  elements.gameLayout.classList.remove("is-home", "is-transition");
  elements.clockFace.classList.remove("is-complete");
  const index = Math.min(state.questionIndex, ROUND_LENGTH - 1);
  const question = dailyQuestions[index];
  const found = state.answersFound[index];
  elements.questionIndex.textContent = `QUESTION ${String(index + 1).padStart(2, "0")} / 05`;
  elements.category.textContent = question.category;
  elements.questionTitle.textContent = question.prompt;
  elements.questionNote.textContent = question.note;
  elements.answerArea.hidden = false;
  elements.answerInput.value = "";
  elements.answerFeedback.textContent = "";
  elements.answerFeedback.classList.remove("is-correct");
  elements.answerChips.innerHTML = "";
  found.forEach((answer) => addChip(answer, getAnswerRarity(question, answer)));
  elements.foundCount.textContent = `${found.length} / ${question.answers.length}`;
  updateMistakeMeter();
  elements.progressCount.textContent = `QUESTION ${index + 1} OF ${ROUND_LENGTH}`;
  updateCurrentScore();
  elements.startButtonLabel.textContent = "GAME IN PROGRESS";
  elements.startButton.disabled = true;
  elements.clockTitle.textContent = "THE CLOCK IS YOURS";
  elements.clockSubtitle.textContent = `${QUESTION_SECONDS} SECONDS PER QUESTION`;
  updateProgress();
  updateFrogTrail();
  updateMobileRoundStatus();
}

function setInputEnabled(enabled) {
  elements.answerInput.disabled = !enabled;
  elements.answerForm.querySelector("button[type='submit']").disabled = !enabled;
}

function submitAnswer(event) {
  event.preventDefault();
  if (state.status !== "playing" || transitioning) return;
  const raw = elements.answerInput.value.trim();
  const normalized = normalizeAnswer(raw);
  if (!normalized) return;

  const question = dailyQuestions[state.questionIndex];
  const found = state.answersFound[state.questionIndex];
  const alreadyFound = new Set(found.map(normalizeAnswer));
  const answer = question.answers.find((candidate) =>
    [candidate.name, ...candidate.aliases].some((alias) => normalizeAnswer(alias) === normalized)
  );

  if (!answer) {
    const suggestion = findCloseAnswer(question, normalized, alreadyFound);
    if (suggestion) {
      const message = `Spelling corrected to ${suggestion.name}.`;
      elements.answerInput.value = suggestion.name;
      elements.answerInput.setSelectionRange(suggestion.name.length, suggestion.name.length);
      elements.answerFeedback.textContent = message;
      elements.answerFeedback.classList.add("is-correct");
      playCorrectionSound();
      if (feedbackTimer) window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => {
        if (elements.answerFeedback.textContent === message) {
          elements.answerFeedback.textContent = "";
          elements.answerFeedback.classList.remove("is-correct");
        }
      }, 1600);
      return;
    }
    state.wrongGuesses[state.questionIndex] += 1;
    playErrorSound();
    saveGameState();
    updateMistakeMeter();
    const remaining = MAX_WRONG_GUESSES - state.wrongGuesses[state.questionIndex];
    elements.answerFeedback.textContent = remaining
      ? `Not on the list — ${remaining} ${remaining === 1 ? "guess" : "guesses"} left.`
      : "Three strikes! Geotoad is hopping to the next question.";
    elements.answerFeedback.classList.remove("is-correct");
    elements.questionArea.classList.remove("is-shaking");
    void elements.questionArea.offsetWidth;
    elements.questionArea.classList.add("is-shaking");
    elements.answerInput.select();
    if (remaining === 0) advanceQuestion("strikes");
    return;
  }
  if (alreadyFound.has(normalizeAnswer(answer.name))) {
    elements.answerFeedback.textContent = `${answer.name} is already in your answers.`;
    elements.answerFeedback.classList.remove("is-correct");
    elements.answerInput.select();
    return;
  }

  acceptAnswer(answer.name);
}

function acceptAnswer(answerName) {
  if (state.status !== "playing" || transitioning) return;
  const question = dailyQuestions[state.questionIndex];
  const found = state.answersFound[state.questionIndex];
  if (found.some((answer) => normalizeAnswer(answer) === normalizeAnswer(answerName))) return;
  const rarity = getAnswerRarity(question, answerName);
  const answerPoints = RARITY_POINTS[rarity];
  elements.answerFeedback.textContent = "";
  if (feedbackTimer) window.clearTimeout(feedbackTimer);
  found.push(answerName);
  playAnswerSound(found.length);
  const fullCredit = found.length === question.answers.length;
  const earnedPoints = answerPoints + (fullCredit ? COMPLETION_BONUS : 0);
  state.questionScores[state.questionIndex] += earnedPoints;
  state.totalScore += earnedPoints;
  updateCurrentScore();
  saveGameState();
  addChip(answerName, rarity);
  elements.foundCount.textContent = `${found.length} / ${question.answers.length}`;
  elements.answerFeedback.textContent = fullCredit
    ? `Perfect! +${earnedPoints} points.`
    : `Hop! +${earnedPoints} points · ${rarity}.`;
  elements.answerFeedback.classList.add("is-correct");
  elements.answerInput.value = "";
  focusAnswerInput();
  updateFrogTrail();
  if (feedbackTimer) window.clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => {
    elements.answerFeedback.textContent = "";
    elements.answerFeedback.classList.remove("is-correct");
  }, 1100);

  if (fullCredit) {
    setInputEnabled(false);
    advanceQuestion("complete");
  }
}

function findCloseAnswer(question, normalizedInput, alreadyFound) {
  let closest = null;
  let bestDistance = Infinity;
  let tied = false;
  question.answers.forEach((candidate) => {
    if (alreadyFound.has(normalizeAnswer(candidate.name))) return;
    [candidate.name, ...candidate.aliases].forEach((alias) => {
      const normalizedAlias = normalizeAnswer(alias);
      const distance = editDistance(normalizedInput, normalizedAlias);
      const threshold = Math.max(normalizedInput.length, normalizedAlias.length) >= 10 ? 2 : 1;
      if (distance === 0 || distance > threshold) return;
      if (distance < bestDistance) {
        closest = candidate;
        bestDistance = distance;
        tied = false;
      } else if (distance === bestDistance && closest.name !== candidate.name) {
        tied = true;
      }
    });
  });
  return tied ? null : closest;
}

function editDistance(left, right) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const distances = Array.from({ length: rows }, () => Array(columns).fill(0));
  for (let row = 0; row < rows; row += 1) distances[row][0] = row;
  for (let column = 0; column < columns; column += 1) distances[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + cost
      );
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        distances[row][column] = Math.min(distances[row][column], distances[row - 2][column - 2] + cost);
      }
    }
  }
  return distances[left.length][right.length];
}

function updateMistakeMeter() {
  const mistakes = Math.min(MAX_WRONG_GUESSES, state.wrongGuesses[state.questionIndex] || 0);
  elements.mistakeDots.querySelectorAll("i").forEach((dot, index) => {
    dot.classList.toggle("is-used", index < mistakes);
  });
  elements.mistakeCount.textContent = `${mistakes} / ${MAX_WRONG_GUESSES}`;
}

function totalAnswersFound() {
  return state.answersFound.reduce((total, answers) => total + answers.length, 0);
}

function totalPadsHopped() {
  return state.answersFound.reduce((total, answers, questionIndex) => {
    const question = dailyQuestions[questionIndex];
    return total + answers.reduce((hops, answer) => {
      const rarity = getAnswerRarity(question, answer);
      return hops + (rarity === "epic" ? 3 : rarity === "rare" ? 2 : 1);
    }, 0);
  }, 0);
}

function padPosition(index, width) {
  const patternIndex = index % PAD_X_PATTERN.length;
  const cycle = Math.floor(index / PAD_X_PATTERN.length);
  const drift = ((cycle % 3) - 1) * 0.035;
  return {
    x: width * Math.max(0.19, Math.min(0.81, PAD_X_PATTERN[patternIndex] + drift)),
    y: -index * PAD_GAP
  };
}

function startPondRenderer() {
  const assetEntries = Object.entries(POND_ASSET_PATHS);
  Promise.all(assetEntries.map(([name, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([name, image]);
    image.onerror = () => reject(new Error(`Unable to load pond sprite: ${src}`));
    image.src = src;
  }))).then((loadedAssets) => {
    pondScene.assets = Object.fromEntries(loadedAssets);
    pondScene.canvasContext = elements.pondCanvas.getContext("2d", { alpha: false });
    if (!pondScene.canvasContext) throw new Error("This browser could not create the pond canvas.");
    if (elements.gameLayout.classList.contains("is-home")) {
      pondScene.zoom = 0.62;
      pondScene.zoomFrom = 0.62;
      pondScene.zoomTo = 0.62;
    }
    resizePondCanvas();
    const hops = totalPadsHopped();
    pondScene.landedPadIndex = hops;
    const start = padPosition(hops, pondScene.width);
    pondScene.frogX = start.x;
    pondScene.frogY = start.y;
    pondScene.cameraX = start.x - pondScene.width * 0.5;
    pondScene.cameraY = start.y - pondScene.height * FROG_ANCHOR_SCREEN_Y;
    pondScene.resizeObserver = new ResizeObserver(resizePondCanvas);
    pondScene.resizeObserver.observe(elements.frogStage);
    window.requestAnimationFrame(renderPondFrame);
  }).catch((error) => {
    console.error("Could not initialize the lily pond.", error);
    elements.frogCaption.textContent = "The pond sprites couldn't load.";
    showToast("Froggy couldn't load the pond. Refresh to try again.");
  });
}

function resizePondCanvas() {
  if (!pondScene.canvasContext) return;
  const bounds = elements.frogStage.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  pondScene.width = bounds.width;
  pondScene.height = bounds.height;
  pondScene.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  elements.pondCanvas.width = Math.round(bounds.width * pondScene.pixelRatio);
  elements.pondCanvas.height = Math.round(bounds.height * pondScene.pixelRatio);
  pondScene.canvasContext.setTransform(pondScene.pixelRatio, 0, 0, pondScene.pixelRatio, 0, 0);
  if (pondScene.landedPadIndex >= 0 && !pondScene.hop) {
    const currentPad = padPosition(pondScene.landedPadIndex, pondScene.width);
    pondScene.frogX = currentPad.x;
    pondScene.frogY = currentPad.y;
    pondScene.cameraX = currentPad.x - pondScene.width * 0.5;
    pondScene.cameraY = currentPad.y - pondScene.height * FROG_ANCHOR_SCREEN_Y;
  }
}

function renderPondFrame(timestamp) {
  if (!pondScene.assets || !pondScene.canvasContext) return;
  const delta = pondScene.lastFrameTime ? Math.min(timestamp - pondScene.lastFrameTime, 50) : 16;
  pondScene.lastFrameTime = timestamp;
  if (pondScene.zoom !== pondScene.zoomTo) {
    const progress = Math.min(1, (timestamp - pondScene.zoomStartedAt) / 650);
    const eased = progress * progress * (3 - 2 * progress);
    pondScene.zoom = pondScene.zoomFrom + (pondScene.zoomTo - pondScene.zoomFrom) * eased;
  }
  updatePondMovement(timestamp, delta);
  drawPond(timestamp);
  window.requestAnimationFrame(renderPondFrame);
}

function animatePondZoom(target) {
  if (pondScene.reducedMotion) {
    pondScene.zoom = target;
    pondScene.zoomFrom = target;
    pondScene.zoomTo = target;
    return;
  }
  pondScene.zoomFrom = pondScene.zoom;
  pondScene.zoomTo = target;
  pondScene.zoomStartedAt = performance.now();
}

function updatePondMovement(timestamp, delta) {
  if (!pondScene.hop && pondScene.landedPadIndex < totalPadsHopped()) {
    const from = padPosition(pondScene.landedPadIndex, pondScene.width);
    const to = padPosition(pondScene.landedPadIndex + 1, pondScene.width);
    pondScene.hop = {
      from,
      to,
      startTime: timestamp,
      duration: pondScene.reducedMotion ? 150 : 420
    };
  }

  if (pondScene.hop) {
    const progress = Math.min(1, (timestamp - pondScene.hop.startTime) / pondScene.hop.duration);
    const eased = progress * progress * (3 - 2 * progress);
    pondScene.frogX = pondScene.hop.from.x + (pondScene.hop.to.x - pondScene.hop.from.x) * eased;
    pondScene.frogY = pondScene.hop.from.y + (pondScene.hop.to.y - pondScene.hop.from.y) * eased;
    if (progress >= 1) {
      pondScene.landedPadIndex += 1;
      pondScene.hop = null;
    }
  }

  const targetCameraY = pondScene.frogY - pondScene.height * FROG_ANCHOR_SCREEN_Y;
  const easing = 1 - Math.exp(-delta / 110);
  const targetCameraX = pondScene.frogX - pondScene.width * 0.5;
  pondScene.cameraX += (targetCameraX - pondScene.cameraX) * easing;
  pondScene.cameraY += (targetCameraY - pondScene.cameraY) * easing;
}

function drawPond(timestamp) {
  const context = pondScene.canvasContext;
  const { width, height, cameraY, reducedMotion, zoom } = pondScene;
  const time = pondScene.reducedMotion ? 0 : timestamp / 1000;
  const swayX = reducedMotion ? 0 : Math.sin(time * 0.32) * 4.2 + Math.sin(time * 0.17) * 1.8;
  const swayY = reducedMotion ? 0 : Math.sin(time * 0.24 + 1.2) * 2.4 + Math.sin(time * 0.13) * 1;
  const hopProgress = pondScene.hop
    ? Math.min(1, (timestamp - pondScene.hop.startTime) / pondScene.hop.duration)
    : 0;
  const palettePosition = pondScene.landedPadIndex + (reducedMotion ? (hopProgress >= 1 ? 1 : 0) : hopProgress);
  const paletteIndex = Math.floor(palettePosition);
  const paletteProgress = palettePosition - paletteIndex;
  const palette = WATER_PALETTES[paletteIndex % WATER_PALETTES.length];
  const nextPalette = WATER_PALETTES[(paletteIndex + 1) % WATER_PALETTES.length];
  const drift = reducedMotion ? 0 : time;
  context.save();
  context.translate(swayX, swayY);
  const water = context.createLinearGradient(
    width * (0.08 + Math.sin(drift * 0.11) * 0.08),
    height * (Math.cos(drift * 0.09) * 0.08),
    width * (0.22 + Math.sin(drift * 0.08 + 1) * 0.1),
    height * (0.92 + Math.cos(drift * 0.07) * 0.08)
  );
  water.addColorStop(0, blendHex(palette[0], nextPalette[0], paletteProgress));
  water.addColorStop(0.48, blendHex(palette[1], nextPalette[1], paletteProgress));
  water.addColorStop(1, blendHex(palette[2], nextPalette[2], paletteProgress));
  context.fillStyle = water;
  context.fillRect(-6, -6, width + 12, height + 12);

  const glowX = width * (0.5 + (reducedMotion ? 0 : Math.sin(drift * 0.12) * 0.16));
  const glowY = height * (0.36 + (reducedMotion ? 0 : Math.cos(drift * 0.1) * 0.11));
  const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, width * 0.78);
  glow.addColorStop(0, blendHex("#e4f8e1", "#d9f4f4", paletteProgress, 0.18));
  glow.addColorStop(1, "rgba(199,235,223,0)");
  context.fillStyle = glow;
  context.fillRect(-6, -6, width + 12, height + 12);
  context.translate(width / 2, height / 2);
  context.scale(zoom, zoom);
  context.translate(-width / 2, -height / 2);
  drawWaterRipples(context, time, width, height, cameraY);
  drawLilyPads(context, width, height, cameraY, zoom);
  drawFrog(context, timestamp, width, height, cameraY);
  context.restore();
}

function blendHex(from, to, amount, alpha = 1) {
  const start = from.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16));
  const end = to.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16));
  const channels = start.map((value, index) => Math.round(value + (end[index] - value) * amount));
  if (alpha === 1) return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  return `rgba(${channels.join(",")},${alpha})`;
}

function drawWaterRipples(context, time, width, height, cameraY) {
  context.save();
  context.lineWidth = 1;
  const firstBand = Math.floor(-cameraY / 88) - 2;
  for (let band = firstBand; band < firstBand + 14; band += 1) {
    const worldY = -band * 88;
    const screenY = worldY - cameraY;
    if (screenY < -35 || screenY > height + 35) continue;
    context.beginPath();
    context.moveTo(-20, screenY);
    context.bezierCurveTo(width * 0.25, screenY - 9 + Math.sin(time + band) * 3, width * 0.72, screenY + 9, width + 20, screenY - 2);
    context.strokeStyle = `rgba(231,255,247,${0.105 + (band % 3) * 0.018})`;
    context.stroke();
  }
  context.restore();
}

function drawLilyPads(context, width, height, cameraY, zoom) {
  const cameraPad = Math.floor(-cameraY / PAD_GAP);
  const isZoomedOut = zoom < 1;
  const firstPad = Math.max(0, cameraPad - (isZoomedOut ? 18 : 5));
  const lastPad = Math.max(firstPad + (isZoomedOut ? 42 : 12), pondScene.landedPadIndex + 9);
  const padHeight = width <= 700
    ? Math.min(68, Math.max(48, width * 0.14))
    : Math.min(96, Math.max(76, width * 0.22));

  for (let index = firstPad; index <= lastPad; index += 1) {
    const point = padPosition(index, width);
    const y = point.y - cameraY;
    if (y < -padHeight * 1.5 || y > height + padHeight * 1.5) continue;
    const image = pondScene.assets.action;
    const sourceX = (index % 2 ? 3 : 2) * ATLAS_FRAME_SIZE;
    const depthFade = Math.max(0.82, 1 - Math.abs(y - height * 0.52) / (height * 4));
    context.save();
    context.globalAlpha = depthFade;
    const screenX = point.x - pondScene.cameraX;
    context.drawImage(image, sourceX, ATLAS_FRAME_SIZE, ATLAS_FRAME_SIZE, ATLAS_FRAME_SIZE, screenX - padHeight * 0.5, y - padHeight * 0.5, padHeight, padHeight);
    context.restore();
  }
}

function drawFrog(context, timestamp, width, height, cameraY) {
  const hop = pondScene.hop;
  const progress = hop ? Math.min(1, (timestamp - hop.startTime) / hop.duration) : 1;
  const jumpArc = hop ? Math.sin(progress * Math.PI) : 0;
  const anchorX = pondScene.frogX - pondScene.cameraX;
  const anchorY = pondScene.frogY - cameraY - jumpArc * Math.min(62, height * 0.2);
  const from = hop ? hop.from : padPosition(pondScene.landedPadIndex, width);
  const to = hop ? hop.to : padPosition(pondScene.landedPadIndex + 1, width);
  const heading = Math.atan2(to.x - from.x, from.y - to.y);
  const frame = hop
    ? progress < 0.12 ? { column: 1, row: 0 }
      : progress < 0.22 ? { column: 3, row: 0 }
        : progress < 0.58 ? { column: 2, row: 0 }
          : progress < 0.8 ? { column: 0, row: 1 }
            : progress < 0.94 ? { column: 1, row: 1 }
              : { column: 0, row: 0 }
    : { column: 0, row: 0 };
  const atlas = pondScene.assets.action;
  const scale = FROG_SCALE * (1 + jumpArc * 0.08);
  const squash = hop && progress < 0.12 ? 0.9
    : hop && progress < 0.22 ? 1.08
      : hop && progress > 0.8 ? 0.92
        : 1;
  const stretch = hop && progress < 0.12 ? 1.08
    : hop && progress < 0.22 ? 0.92
      : hop && progress > 0.8 ? 1.06
        : 1;
  const spriteWidth = ATLAS_FRAME_SIZE * scale * squash;
  const spriteHeight = ATLAS_FRAME_SIZE * scale * stretch;

  context.save();
  context.globalAlpha = 0.3 * (1 - jumpArc * 0.55);
  context.fillStyle = "#123e46";
  context.beginPath();
  context.ellipse(anchorX, pondScene.frogY - cameraY + 5, Math.max(14, spriteWidth * 0.24), 4, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.translate(anchorX, anchorY);
  context.rotate(heading);
  const [centroidX, centroidY] = FROG_FRAME_CENTROIDS[frame.row][frame.column];
  const visualCenterX = (ATLAS_FRAME_SIZE / 2 - centroidX) * scale;
  const visualCenterY = (ATLAS_FRAME_SIZE / 2 - centroidY) * scale;
  context.drawImage(
    atlas,
    frame.column * ATLAS_FRAME_SIZE,
    frame.row * ATLAS_FRAME_SIZE,
    ATLAS_FRAME_SIZE,
    ATLAS_FRAME_SIZE,
    visualCenterX - spriteWidth / 2,
    visualCenterY - spriteHeight / 2,
    spriteWidth,
    spriteHeight
  );
  context.restore();
}

function updateFrogTrail() {
  const totalHops = totalPadsHopped();
  const isPlaying = state.status === "playing";
  elements.frogStage.setAttribute("aria-label", `Geotoad has made ${totalHops} hops on a lily-pad trail.`);
  elements.frogCaption.textContent = isPlaying
    ? `${dailyQuestions[state.questionIndex].category.toLowerCase()} · every answer moves Geotoad forward`
    : state.status === "complete" ? "Geotoad made it across the pond!" : "Every right answer earns a hop.";
  elements.frogQuestionBadge.textContent = isPlaying
    ? `QUESTION ${state.questionIndex + 1} / ${ROUND_LENGTH}`
    : state.status === "complete" ? "POND CROSSED!" : "READY TO HOP";
  elements.hopProgressLabel.textContent = state.mode === "freestyle"
    ? `${totalHops} ${totalHops === 1 ? "HOP" : "HOPS"} THIS GAME`
    : `${totalHops} ${totalHops === 1 ? "HOP" : "HOPS"} TODAY`;
}

function updateMobileRoundStatus() {
  const roundMatch = elements.questionIndex.textContent.match(/^QUESTION (\d+) \/ (\d+)$/);
  elements.mobileRoundIndex.textContent = roundMatch
    ? `ROUND ${Number(roundMatch[1])} / ${Number(roundMatch[2])}`
    : elements.questionIndex.textContent;
  elements.mobileRoundCategory.textContent = elements.category.textContent;
}

function addChip(answer, rarity) {
  const chip = document.createElement("span");
  chip.className = "answer-chip";
  chip.dataset.rarity = rarity;
  const name = document.createElement("span");
  name.textContent = answer;
  const tier = document.createElement("small");
  tier.textContent = rarity;
  chip.append(name, tier);
  elements.answerChips.append(chip);
}

function updateTimer() {
  if (state.status !== "playing" || transitioning) return;
  const remainingMs = Math.max(0, state.questionEndsAt - Date.now());
  const remaining = Math.ceil(remainingMs / 1000);
  elements.clockFace.classList.remove("is-complete");
  elements.timerValue.textContent = String(remaining);
  elements.clockFace.setAttribute("aria-label", `${remaining} seconds remaining`);
  const dashOffset = 125.66 * (1 - remainingMs / (QUESTION_SECONDS * 1000));
  elements.clockProgress.style.strokeDashoffset = String(Math.max(0, Math.min(125.66, dashOffset)));
  elements.clockFace.classList.toggle("is-urgent", remaining <= 5 && remaining > 0);
  if (remainingMs <= 0) advanceQuestion("timeout");
}

function advanceQuestion(reason = "timeout") {
  if (state.status !== "playing" || transitioning) return;
  if (reason === "timeout") playTimeoutSound();
  transitioning = true;
  window.clearInterval(ticker);
  setInputEnabled(false);
  const index = state.questionIndex;
  const found = state.answersFound[index];
  const question = dailyQuestions[index];
  const missing = question.answers.filter((answer) => !found.includes(answer.name)).map((answer) => answer.name);
  state.status = "between";
  state.questionEndsAt = null;
  state.transitionReason = reason;
  saveGameState();
  renderTransition(missing.length);
}

function renderTransition(missingCount) {
  transitioning = true;
  window.clearInterval(ticker);
  elements.gameLayout.classList.remove("is-home");
  elements.gameLayout.classList.add("is-transition");
  setInputEnabled(false);
  elements.answerArea.hidden = true;
  const index = state.questionIndex;
  const question = dailyQuestions[index];
  const found = state.answersFound[index].length;
  const total = question.answers.length;
  const reason = state.transitionReason || "timeout";
  elements.questionIndex.textContent = `ROUND ${index + 1} COMPLETE`;
  elements.category.textContent = "HOP LOG";
  elements.questionTitle.textContent = reason === "strikes"
    ? "Three strikes."
    : reason === "timeout" ? "Time's up." : "Nice hop!";
  const progressNote = missingCount === undefined
    ? `${found} of ${total} answers found.`
    : `${found} of ${total} answers found. ${missingCount ? `${missingCount} still to find.` : "You found them all!"}`;
  elements.questionNote.textContent = `${progressNote} Round score: ${state.questionScores[index].toLocaleString()} points.`;
  elements.progressCount.textContent = index + 1 === ROUND_LENGTH
    ? "FINAL ROUND COMPLETE"
    : `NEXT · ROUND ${index + 2} OF ${ROUND_LENGTH}`;
  elements.startButtonLabel.textContent = index + 1 === ROUND_LENGTH
    ? state.mode === "freestyle" ? "SEE FREESTYLE RESULTS" : "SEE TODAY'S RESULTS"
    : `HOP TO ROUND ${index + 2}`;
  elements.startButton.disabled = false;
  elements.timerValue.textContent = reason === "timeout" ? "0" : "✓";
  elements.clockFace.classList.toggle("is-complete", reason !== "timeout");
  elements.clockTitle.textContent = "ROUND COMPLETE";
  elements.clockSubtitle.textContent = `${state.totalScore.toLocaleString()} POINTS`;
  elements.clockProgress.style.strokeDashoffset = reason === "timeout" ? "125.66" : "0";
  elements.clockFace.classList.remove("is-urgent");
  updateProgress();
  updateFrogTrail();
  updateMobileRoundStatus();
}

function continueGame() {
  if (state.questionIndex + 1 >= ROUND_LENGTH) {
    completeGame();
    return;
  }
  state.questionIndex += 1;
  state.status = "playing";
  state.transitionReason = null;
  state.questionEndsAt = Date.now() + QUESTION_SECONDS * 1000;
  saveGameState();
  transitioning = false;
  renderQuestion();
  setInputEnabled(true);
  updateTimer();
  ticker = window.setInterval(updateTimer, 100);
  focusAnswerInput();
}

function focusAnswerInput() {
  if (window.matchMedia("(max-width: 700px), (max-height: 620px)").matches) return;
  elements.answerInput.focus();
}

function completeGame() {
  window.clearInterval(ticker);
  state.status = "complete";
  state.questionEndsAt = null;
  state.completedAt = Date.now();
  saveGameState();
  if (state.mode !== "freestyle") {
    stats.played += 1;
    stats.best = Math.max(stats.best, state.totalScore);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = dateKey(yesterday);
    stats.streak = stats.lastPlayed === yesterdayKey ? stats.streak + 1 : stats.lastPlayed === today ? stats.streak : 1;
    stats.lastPlayed = today;
    saveJson(statsKey, stats);
    updateStats();
  }
  renderComplete();
  showResult();
}

function renderComplete() {
  transitioning = false;
  elements.gameLayout.classList.remove("is-home", "is-transition");
  window.clearInterval(ticker);
  setInputEnabled(false);
  elements.answerArea.hidden = true;
  const isFreestyle = state.mode === "freestyle";
  elements.questionIndex.textContent = isFreestyle ? "FREESTYLE COMPLETE" : "DAILY MAP COMPLETE";
  elements.category.textContent = "NICELY DONE";
  elements.questionTitle.textContent = "Geotoad crossed the pond.";
  elements.questionNote.textContent = isFreestyle
    ? "Nice adventure. Freestyle scores aren't saved—take another hop whenever you like."
    : "Your score is saved. Come back tomorrow for a fresh set of questions.";
  elements.progressCount.textContent = "ALL 5 QUESTIONS COMPLETE";
  elements.startButtonLabel.textContent = isFreestyle ? "SEE FREESTYLE RESULTS" : "SEE TODAY'S RESULTS";
  elements.startButton.disabled = false;
  elements.timerValue.textContent = "✓";
  elements.clockFace.classList.add("is-complete");
  elements.clockTitle.textContent = "MAP COMPLETE";
  elements.clockSubtitle.textContent = `${state.totalScore.toLocaleString()} POINTS EARNED`;
  elements.clockProgress.style.strokeDashoffset = "0";
  elements.clockFace.classList.remove("is-urgent");
  updateProgress();
  updateFrogTrail();
  updateMobileRoundStatus();
}

function updateProgress() {
  const dots = elements.progressDots.querySelectorAll(".progress-dot");
  dots.forEach((dot, index) => {
    const isBetween = state.status === "between";
    dot.classList.toggle("is-current", state.status !== "complete" && (isBetween ? index === state.questionIndex + 1 : index === state.questionIndex));
    dot.classList.toggle("is-done", state.status === "complete" || index < state.questionIndex || (isBetween && index === state.questionIndex));
  });
}

function updateStats() {
  elements.bestScore.textContent = stats.played ? stats.best.toLocaleString() : "—";
  elements.playedCount.textContent = String(stats.played || 0);
  elements.streakCount.textContent = String(stats.streak || 0);
}

function updateCurrentScore() {
  elements.currentScore.textContent = state.totalScore.toLocaleString();
}

function showResult() {
  const found = state.answersFound.reduce((sum, answers) => sum + answers.length, 0);
  const total = dailyQuestions.reduce((sum, question) => sum + question.answers.length, 0);
  const foundByRarity = { common: 0, rare: 0, epic: 0 };
  state.answersFound.forEach((answers, index) => {
    answers.forEach((answer) => {
      foundByRarity[getAnswerRarity(dailyQuestions[index], answer)] += 1;
    });
  });
  const percent = Math.round(found / total * 100);
  elements.resultScore.textContent = state.totalScore.toLocaleString();
  const isFreestyle = state.mode === "freestyle";
  elements.resultTypeLabel.textContent = isFreestyle ? "FREESTYLE COMPLETE" : "DAILY MAP COMPLETE";
  elements.resultKicker.textContent = percent >= 75 ? "WORLD CLASS NAVIGATOR" : percent >= 45 ? "NICELY NAVIGATED" : "THE MAP IS A BIG PLACE";
  elements.resultSummary.textContent = `You found ${found} of ${total} possible answers across ${isFreestyle ? "this freestyle set" : "today's five questions"}. That's ${percent}% completion. Your rare and epic discoveries earned extra points.`;
  elements.resultPersistenceNote.textContent = isFreestyle
    ? "Freestyle scores and answers aren't saved. Play as often as you like."
    : "Your daily score and answers are saved on this device.";
  elements.freestyleAgainButton.hidden = !isFreestyle;
  elements.resultFound.textContent = String(found);
  elements.resultMissed.textContent = String(total - found);
  elements.resultEpic.textContent = String(foundByRarity.rare + foundByRarity.epic);
  elements.resultBreakdown.replaceChildren();
  dailyQuestions.forEach((question, index) => {
    const foundAnswers = new Set(state.answersFound[index].map(normalizeAnswer));
    const answersFound = question.answers.filter((answer) => foundAnswers.has(normalizeAnswer(answer.name)));
    const answersMissed = question.answers.filter((answer) => !foundAnswers.has(normalizeAnswer(answer.name)));
    const row = document.createElement("section");
    row.className = "result-question";
    const details = document.createElement("div");
    details.className = "result-question-heading";
    const title = document.createElement("strong");
    title.textContent = question.prompt;
    const summary = document.createElement("small");
    summary.textContent = `${answersFound.length} found · ${answersMissed.length} missed`;
    const sources = document.createElement("div");
    sources.className = "result-sources";
    (question.sources || []).forEach((source, sourceIndex) => {
      const link = document.createElement("a");
      link.href = source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = question.sources.length > 1 ? `SOURCE ${sourceIndex + 1}` : "SOURCE";
      sources.append(link);
    });
    const score = document.createElement("span");
    score.textContent = `${state.questionScores[index].toLocaleString()} PTS`;
    details.append(title, summary, sources);

    const chart = document.createElement("div");
    chart.className = "result-chart";
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", `${answersFound.length} of ${question.answers.length} answers found`);
    const chartTrack = document.createElement("div");
    chartTrack.className = "result-bar-track";
    const foundBar = document.createElement("span");
    foundBar.className = "result-bar-found";
    foundBar.style.width = `${answersFound.length / question.answers.length * 100}%`;
    const missedBar = document.createElement("span");
    missedBar.className = "result-bar-missed";
    missedBar.style.width = `${answersMissed.length / question.answers.length * 100}%`;
    chartTrack.append(foundBar, missedBar);
    chart.append(chartTrack);

    const answerList = document.createElement("div");
    answerList.className = "result-answers";
    const appendAnswerGroup = (labelText, answers, isFound) => {
      const group = document.createElement("div");
      group.className = `result-answer-group${isFound ? " is-found" : " is-missed"}`;
      const label = document.createElement("span");
      label.className = "result-answer-label";
      label.textContent = labelText;
      const chips = document.createElement("div");
      chips.className = "result-answer-chips";
      answers.forEach(({ name }) => {
        const rarity = getAnswerRarity(question, name);
        const chip = document.createElement("span");
        chip.className = "result-answer-chip";
        chip.dataset.rarity = rarity;
        chip.dataset.found = String(isFound);
        const answerText = document.createElement("span");
        answerText.textContent = name;
        const rank = document.createElement("small");
        rank.textContent = `${rarity} · ${RARITY_POINTS[rarity]}`;
        chip.append(answerText, rank);
        chips.append(chip);
      });
      group.append(label, chips);
      answerList.append(group);
    };
    appendAnswerGroup("FOUND", answersFound, true);
    appendAnswerGroup("MISSED", answersMissed, false);
    row.append(details, score, chart, answerList);
    elements.resultBreakdown.append(row);
  });
  elements.shareStatus.textContent = "";
  if (!elements.resultDialog.open) elements.resultDialog.showModal();
}

async function shareResult() {
  const symbols = state.answersFound.map((found, index) => {
    const total = dailyQuestions[index].answers.length;
    const ratio = found.length / total;
    return ratio === 1 ? "🟩" : ratio >= .5 ? "🟨" : ratio > 0 ? "🟧" : "⬜";
  }).join("");
  const shareText = `Geotoad · ${state.mode === "freestyle" ? "Freestyle" : formatToday(new Date())}\n${state.totalScore.toLocaleString()} points · ${symbols}\nFive questions. One happy toad.`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "My Geotoad result", text: shareText });
      elements.shareStatus.textContent = "Your pond is on its way.";
    } else if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shareText);
      elements.shareStatus.textContent = "Copied — share your Geotoad result.";
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = shareText;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.append(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();
      if (!copied) throw new Error("The browser could not copy the share text.");
      elements.shareStatus.textContent = "Copied — share your Geotoad result.";
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Could not share the game result.", error);
    elements.shareStatus.textContent = "Sharing isn't available here. Try again on another browser.";
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
}

init();
