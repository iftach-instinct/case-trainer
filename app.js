(function () {
  "use strict";

  const content = typeof module !== "undefined" && module.exports
    ? require("./content.js") : globalThis.CASE_TRAINER_CONTENT;
  const STORAGE_KEY = "noam-case-trainer:v1";
  const MIN_CHARACTERS = 20;
  const MAX_CHARACTERS = 10000;
  const STAGE_COUNT = content.stages.length;

  function countCharacters(value) {
    return Array.from(value.trim()).length;
  }

  function createInitialState() {
    return {
      version: 1,
      currentStage: 0,
      answers: Array(STAGE_COUNT).fill(""),
      revealed: Array(STAGE_COUNT).fill(false)
    };
  }

  function canReveal(answer) {
    return countCharacters(answer) >= MIN_CHARACTERS;
  }

  function lastUnlockedStage(state) {
    const firstUnrevealed = state.revealed.indexOf(false);
    return firstUnrevealed === -1 ? STAGE_COUNT - 1 : firstUnrevealed;
  }

  function normalizeState(saved) {
    const clean = createInitialState();
    if (!saved || saved.version !== 1) return clean;
    let previousRevealed = true;
    for (let i = 0; i < STAGE_COUNT; i += 1) {
      clean.answers[i] = Array.isArray(saved.answers) && typeof saved.answers[i] === "string"
        ? saved.answers[i].slice(0, MAX_CHARACTERS) : "";
      clean.revealed[i] = previousRevealed && Array.isArray(saved.revealed)
        && saved.revealed[i] === true && canReveal(clean.answers[i]);
      previousRevealed = clean.revealed[i];
    }
    const requestedStage = Number.isInteger(saved.currentStage) ? saved.currentStage : 0;
    clean.currentStage = Math.max(0, Math.min(requestedStage, lastUnlockedStage(clean)));
    return clean;
  }

  // Export the same state rules used by the UI for dependency-free Node checks.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      STORAGE_KEY, MIN_CHARACTERS, MAX_CHARACTERS, STAGE_COUNT,
      countCharacters, createInitialState, canReveal, lastUnlockedStage, normalizeState
    };
  }
  if (typeof document === "undefined") return;

  const byId = (id) => document.getElementById(id);
  const app = byId("app");
  const panel = byId("stage-panel");
  const stepper = byId("stepper-list");
  const previousButton = byId("prev-btn");
  const nextButton = byId("next-btn");
  const saveHint = byId("save-hint");
  const resetDialog = byId("reset-dialog");
  const resetButton = byId("reset-btn");
  let state = createInitialState();
  let saveTimer;
  let loadMessage = "הכתיבה נשמרת אוטומטית בדפדפן הזה בלבד. אין להזין פרטים מזהים של ילדים אמיתיים.";

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      state = normalizeState(saved);
      loadMessage = saved && saved.version === 1
        ? "התרגול השמור נטען. אפשר להמשיך מהמקום שבו עצרתם."
        : "התרגול השמור לא תואם לגרסה הזו. נפתח תרגול חדש.";
    }
  } catch (_) {
    loadMessage = "לא ניתן לטעון תרגול שמור. אפשר לתרגל כרגיל; השמירה תלויה בזמינות האחסון בדפדפן.";
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saveHint.textContent = "נשמר בדפדפן הזה בלבד. אין להזין פרטים מזהים של ילדים אמיתיים.";
    } catch (_) {
      saveHint.textContent = "האחסון בדפדפן אינו זמין. הכתיבה נשמרת כרגע בזיכרון בלבד ותאבד בסגירה או ברענון. אפשר להעתיק אותה לפני היציאה.";
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function updateNavigation() {
    const completed = state.revealed.filter(Boolean).length;
    const percentage = Math.round(completed / STAGE_COUNT * 100);
    byId("progress-bar").style.width = `${percentage}%`;
    byId("progressbar").setAttribute("aria-valuenow", String(percentage));
    byId("progressbar").setAttribute("aria-valuetext", `${completed} מתוך ${STAGE_COUNT} שלבים הושלמו`);
    byId("progress-label").textContent = `${completed} מתוך ${STAGE_COUNT} שלבים הושלמו · שלב נוכחי ${state.currentStage + 1}`;
    stepper.replaceChildren();
    content.stages.forEach((stage, index) => {
      const item = element("li", "stepper-item");
      const button = element("button", "step-button");
      button.type = "button";
      button.disabled = index > lastUnlockedStage(state);
      if (index === state.currentStage) button.setAttribute("aria-current", "step");
      if (state.revealed[index]) button.classList.add("is-complete");
      button.setAttribute("aria-label", `שלב ${index + 1}: ${stage.shortTitle}${state.revealed[index] ? ", הושלם" : button.disabled ? ", נעול" : ""}`);
      const number = element("span", "step-number", state.revealed[index] ? "✓" : String(index + 1));
      number.setAttribute("aria-hidden", "true");
      button.append(number, element("span", "step-title", stage.shortTitle));
      button.addEventListener("click", () => goToStage(index));
      item.append(button);
      stepper.append(item);
    });
    previousButton.disabled = state.currentStage === 0;
    nextButton.hidden = state.currentStage === STAGE_COUNT - 1;
    nextButton.disabled = !state.revealed[state.currentStage];
    nextButton.setAttribute("aria-describedby", "navigation-hint");
    byId("navigation-hint").textContent = state.revealed[state.currentStage]
      ? (state.currentStage === STAGE_COUNT - 1 ? "אפשר לחזור לשלבים הקודמים ולעיין במחשבות שכתבתם." : "השיקולים פתוחים. אפשר להמשיך לשלב הבא.")
      : "השלב הבא ייפתח אחרי כתיבה וחשיפת השיקולים בשלב הזה.";
    byId("completion").hidden = completed !== STAGE_COUNT;
  }

  function updateAnswerControls() {
    const index = state.currentStage;
    const length = countCharacters(state.answers[index]);
    const isRevealed = state.revealed[index];
    const allowed = canReveal(state.answers[index]);
    byId("char-count").textContent = `${length} תווים · לפחות ${MIN_CHARACTERS}`;
    byId("char-count").classList.toggle("is-ready", allowed);
    const revealButton = byId("reveal-btn");
    revealButton.disabled = !allowed || isRevealed;
    revealButton.textContent = isRevealed ? "✓ השיקולים נחשפו" : "חשיפת השיקולים המקצועיים";
    const hint = isRevealed ? "השיקולים פתוחים. אפשר לערוך את הכתיבה; ירידה מתחת ל־20 תווים תנעל מחדש את השלב ואת השלבים שאחריו."
      : allowed ? "אפשר לחשוף את השיקולים. התוכן שכתבתם אינו נבדק ואינו מקבל ציון."
        : `כתבו עוד ${MIN_CHARACTERS - length} תווים לפחות כדי לחשוף את השיקולים. רווחים בתחילת הטקסט ובסופו אינם נספרים.`;
    // Announce eligibility changes, not every keystroke.
    const gateState = isRevealed ? "revealed" : allowed ? "ready" : "locked";
    const gateStatus = byId("gate-status");
    if (gateStatus.dataset.state !== gateState) {
      gateStatus.dataset.state = gateState;
      gateStatus.textContent = isRevealed ? "השיקולים המקצועיים נחשפו." : allowed ? "הגעתם ל־20 תווים. כפתור החשיפה זמין." : "נדרשת כתיבה של 20 תווים לפחות.";
    }
    byId("answer-hint").textContent = hint;
    byId("expert-panel").hidden = !isRevealed;
    revealButton.setAttribute("aria-expanded", String(isRevealed));
  }

  function renderStage(moveFocus) {
    const stage = content.stages[state.currentStage];
    panel.setAttribute("aria-labelledby", "stage-title");
    panel.removeAttribute("aria-live");
    panel.innerHTML = `
      <div class="case-heading"><span class="eyebrow">מקרה בדוי · תרגול לימודי</span><span class="case-tag">תיק 01</span></div>
      <p class="case-name"></p>
      <p class="case-meta"></p>
      <p class="case-introduction"></p>
      <div class="stage-heading"><p class="stage-kicker"></p><h1 id="stage-title"></h1></div>
      <section class="vignette" aria-labelledby="vignette-title"><h2 id="vignette-title">מתוך התיק</h2><div id="vignette-copy"></div></section>
      <p class="notice" id="stage-detail"></p>
      <section class="writing-section" aria-labelledby="question-title">
        <h2 id="question-title">רגע למחשבה שלכם</h2>
        <label for="answer" id="question-text"></label>
        <textarea id="answer" rows="6" maxlength="10000" dir="rtl" aria-describedby="answer-hint char-count privacy-hint"></textarea>
        <div class="answer-meta"><p id="answer-hint"></p><span id="char-count"></span></div>
        <p class="privacy-hint" id="privacy-hint">התייחסו רק למקרה הבדוי. אין להזין מידע אישי או פרטים מזהים. עד 10,000 תווים.</p>
        <button type="button" id="reveal-btn" class="btn btn-primary reveal-button" aria-controls="expert-panel" aria-expanded="false" aria-describedby="answer-hint"></button>
        <span id="gate-status" class="sr-only" role="status" aria-live="polite"></span>
      </section>
      <section id="expert-panel" class="expert-panel" aria-labelledby="expert-title" hidden>
        <p class="eyebrow">פותחים את החשיבה</p><h2 id="expert-title" tabindex="-1">שיקולים מקצועיים לדיון בהדרכה</h2>
        <p class="expert-intro">השוו למחשבות שלכם: מה דומה, מה שונה ומה עדיין פתוח? אלו כיווני חשיבה לימודיים, ולא אבחנה או תשובה יחידה נכונה.</p>
        <div id="expert-sections"></div><p class="reflection" id="reflection"></p>
      </section>
      <section id="completion" class="completion" aria-labelledby="completion-title" hidden>
        <span class="completion-icon" aria-hidden="true">✓</span><h2 id="completion-title">השלמתם את שלושת שלבי התרגול</h2>
        <p>מההפניה ועד לסיכום ביניים: תרגלתם החזקת השערות, זיהוי מידע חסר והקשבה לחוויה של נועם. התרגול אינו מפיק אבחנה או ציון.</p>
        <p>הכתיבה שלכם זמינה בכל שלב. אפשר לחזור אליה, להביא שאלות להדרכה או להתחיל מחדש באמצעות איפוס התרגול.</p>
      </section>
      <p class="navigation-hint" id="navigation-hint"></p>`;
    panel.querySelector(".case-name").textContent = content.title;
    panel.querySelector(".case-meta").textContent = content.subtitle;
    panel.querySelector(".case-introduction").textContent = content.introduction;
    panel.querySelector(".stage-kicker").textContent = stage.subtitle;
    byId("stage-title").textContent = stage.title;
    stage.vignette.forEach((text) => byId("vignette-copy").append(element("p", "", text)));
    byId("stage-detail").textContent = stage.detail;
    byId("question-text").textContent = stage.question;
    const answer = byId("answer");
    answer.placeholder = stage.placeholder;
    answer.value = state.answers[state.currentStage];
    stage.experts.forEach((section) => {
      const wrapper = element("section", "expert-section");
      wrapper.append(element("h3", "", section.title));
      section.paragraphs.forEach((text) => wrapper.append(element("p", "", text)));
      if (section.bullets) {
        const list = element("ul", "");
        section.bullets.forEach((text) => list.append(element("li", "", text)));
        wrapper.append(list);
      }
      byId("expert-sections").append(wrapper);
    });
    byId("reflection").textContent = stage.reflection;
    answer.addEventListener("input", () => {
      state.answers[state.currentStage] = answer.value.slice(0, MAX_CHARACTERS);
      if (state.revealed[state.currentStage] && !canReveal(state.answers[state.currentStage])) {
        state.revealed.fill(false, state.currentStage);
        updateNavigation();
      }
      updateAnswerControls();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 250);
    });
    answer.addEventListener("blur", save);
    byId("reveal-btn").addEventListener("click", () => {
      if (!canReveal(state.answers[state.currentStage]) || state.revealed[state.currentStage]) return;
      state.revealed[state.currentStage] = true;
      updateAnswerControls();
      updateNavigation();
      save();
      byId("expert-title").focus();
    });
    updateAnswerControls();
    updateNavigation();
    document.title = `${stage.shortTitle} · התיק של נועם · מאמן תיקים`;
    if (moveFocus) panel.focus();
  }

  function goToStage(index) {
    if (index < 0 || index > lastUnlockedStage(state) || index === state.currentStage) return;
    state.currentStage = index;
    save();
    renderStage(true);
  }

  previousButton.addEventListener("click", () => goToStage(state.currentStage - 1));
  nextButton.addEventListener("click", () => goToStage(state.currentStage + 1));

  function reset() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    state = createInitialState();
    try {
      localStorage.removeItem(STORAGE_KEY);
      saveHint.textContent = "התרגול אופס והכתיבה השמורה נמחקה. אפשר להתחיל מחדש.";
    } catch (_) {
      saveHint.textContent = "התרגול אופס בחלון הזה, אך לא ניתן למחוק את האחסון. כדי להסיר שמירה קודמת, יש למחוק את נתוני האתר בהגדרות הדפדפן.";
    }
    renderStage(true);
  }

  resetButton.addEventListener("click", () => {
    if (typeof resetDialog.showModal === "function") {
      resetDialog.returnValue = "cancel";
      resetDialog.showModal();
      byId("reset-cancel").focus();
    } else if (window.confirm("לאפס את התרגול ולמחוק את כל הכתיבה השמורה? לא ניתן לבטל.")) {
      reset();
    }
  });
  resetDialog.addEventListener("close", () => {
    if (resetDialog.returnValue === "confirm") reset();
    else resetButton.focus();
  });
  resetDialog.addEventListener("cancel", () => { resetDialog.returnValue = "cancel"; });
  window.addEventListener("pagehide", () => { if (saveTimer !== undefined) save(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && saveTimer !== undefined) save();
  });

  app.hidden = false;
  saveHint.textContent = loadMessage;
  renderStage(false);
})();
