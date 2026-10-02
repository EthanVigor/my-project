(() => {
  "use strict";

  const STORAGE_KEY = "habit-tracker:v1";
  const RECOVERY_KEY = `${STORAGE_KEY}:recovery`;
  const MAX_NAME_LENGTH = 30;
  const SAMPLE_HABITS = ["喝水", "运动", "读书"];
  const RING_CIRCUMFERENCE = 2 * Math.PI * 50;

  const dom = {
    dateLine: document.querySelector("#dateLine"),
    stickerDay: document.querySelector("#stickerDay"),
    footerDate: document.querySelector("#footerDate"),
    storageNotice: document.querySelector("#storageNotice"),
    habitCount: document.querySelector("#habitCount"),
    addHabitForm: document.querySelector("#addHabitForm"),
    habitName: document.querySelector("#habitName"),
    formMessage: document.querySelector("#formMessage"),
    habitList: document.querySelector("#habitList"),
    emptyState: document.querySelector("#emptyState"),
    focusAddButton: document.querySelector("#focusAddButton"),
    progressRing: document.querySelector("#progressRing"),
    progressCircle: document.querySelector("#progressCircle"),
    progressPercent: document.querySelector("#progressPercent"),
    progressCount: document.querySelector("#progressCount"),
    todaySummary: document.querySelector("#todaySummary"),
    calendarTitle: document.querySelector("#calendarTitle"),
    calendarGrid: document.querySelector("#calendarGrid"),
    monthSummary: document.querySelector("#monthSummary"),
    prevMonth: document.querySelector("#prevMonth"),
    nextMonth: document.querySelector("#nextMonth"),
    dayDialog: document.querySelector("#dayDialog"),
    dayDialogEyebrow: document.querySelector("#dayDialogEyebrow"),
    dayDialogTitle: document.querySelector("#dayDialogTitle"),
    dayDialogSubtitle: document.querySelector("#dayDialogSubtitle"),
    dayHabitList: document.querySelector("#dayHabitList"),
    deleteDialog: document.querySelector("#deleteDialog"),
    deleteMessage: document.querySelector("#deleteMessage"),
    cancelDelete: document.querySelector("#cancelDelete"),
    confirmDelete: document.querySelector("#confirmDelete"),
    toast: document.querySelector("#toast")
  };

  const checkIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor">
      <path d="m5 12.5 4.2 4.2L19 7"></path>
    </svg>`;
  const editIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>
    </svg>`;
  const deleteIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18"></path>
      <path d="M8 6V4h8v2"></path>
      <path d="M19 6l-1 14H6L5 6"></path>
      <path d="M10 11v5M14 11v5"></path>
    </svg>`;

  let storage = null;
  let storageAvailable = true;
  let state = null;
  let currentTodayKey = toDateKey(new Date());
  let displayedMonth = startOfMonth(new Date());
  let editingHabitId = null;
  let pendingDeleteHabitId = null;
  let selectedDateKey = null;
  let toastTimer = null;
  let deferredMessage = "";

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function fromDateKey(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function isDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    return toDateKey(fromDateKey(value)) === value;
  }

  function addDays(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12, 0, 0, 0);
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
  }

  function formatLongDate(date) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long"
    }).format(date);
  }

  function formatShortDate(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatWeekday(date) {
    return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `habit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeName(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
  }

  function comparisonName(value) {
    return normalizeName(value).toLocaleLowerCase("zh-CN");
  }

  function nameLength(value) {
    return Array.from(value).length;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function createDefaultState() {
    const createdAt = toDateKey(new Date());
    return {
      version: 1,
      habits: SAMPLE_HABITS.map((name, index) => ({
        id: createId(),
        name,
        createdAt,
        order: index
      })),
      completions: {}
    };
  }

  function sanitizeState(raw) {
    if (!raw || typeof raw !== "object" || raw.version !== 1 || !Array.isArray(raw.habits)) {
      return null;
    }

    const usedIds = new Set();
    const habits = [];

    raw.habits.forEach((candidate, index) => {
      if (!candidate || typeof candidate !== "object") {
        return;
      }

      const name = normalizeName(candidate.name).slice(0, MAX_NAME_LENGTH);
      if (!name) {
        return;
      }

      let id = typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : createId();
      if (usedIds.has(id)) {
        id = createId();
      }
      usedIds.add(id);

      let createdAt = isDateKey(candidate.createdAt)
        ? candidate.createdAt
        : toDateKey(new Date());
      if (createdAt > toDateKey(new Date())) {
        createdAt = toDateKey(new Date());
      }

      habits.push({
        id,
        name,
        createdAt,
        order: Number.isFinite(candidate.order) ? candidate.order : index
      });
    });

    habits.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));

    const completions = {};
    if (raw.completions && typeof raw.completions === "object") {
      Object.entries(raw.completions).forEach(([dateKey, dayRecord]) => {
        if (!isDateKey(dateKey) || !dayRecord || typeof dayRecord !== "object") {
          return;
        }

        const cleanRecord = {};
        Object.entries(dayRecord).forEach(([habitId, completed]) => {
          if (completed === true && usedIds.has(habitId)) {
            cleanRecord[habitId] = true;
          }
        });

        if (Object.keys(cleanRecord).length > 0) {
          completions[dateKey] = cleanRecord;
        }
      });
    }

    return {
      version: 1,
      habits,
      completions
    };
  }

  function getStorage() {
    try {
      const testKey = `${STORAGE_KEY}:test`;
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (error) {
      storageAvailable = false;
      return null;
    }
  }

  function loadState() {
    storage = getStorage();
    if (!storage) {
      return createDefaultState();
    }

    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      const freshState = createDefaultState();
      persistState(freshState);
      return freshState;
    }

    try {
      const parsed = sanitizeState(JSON.parse(raw));
      if (!parsed) {
        throw new Error("Unsupported data shape");
      }
      return parsed;
    } catch (error) {
      try {
        storage.setItem(RECOVERY_KEY, raw);
      } catch (backupError) {
        // The recovery copy is a best-effort safeguard.
      }
      const freshState = createDefaultState();
      persistState(freshState);
      deferredMessage = "原有数据无法读取，已重新初始化。";
      return freshState;
    }
  }

  function persistState(nextState = state) {
    if (!storage) {
      storageAvailable = false;
      renderStorageNotice();
      return false;
    }

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      storageAvailable = true;
      renderStorageNotice();
      return true;
    } catch (error) {
      storageAvailable = false;
      renderStorageNotice();
      return false;
    }
  }

  function renderStorageNotice() {
    if (!dom.storageNotice) {
      return;
    }
    dom.storageNotice.hidden = storageAvailable;
  }

  function getHabitById(habitId) {
    return state.habits.find((habit) => habit.id === habitId) || null;
  }

  function isCompleted(dateKey, habitId) {
    return state.completions[dateKey]?.[habitId] === true;
  }

  function getActiveHabits(dateKey) {
    return state.habits.filter((habit) => habit.createdAt <= dateKey);
  }

  function getCompletedCount(dateKey, habits = getActiveHabits(dateKey)) {
    return habits.reduce((count, habit) => count + (isCompleted(dateKey, habit.id) ? 1 : 0), 0);
  }

  function getCurrentStreak(habit) {
    const todayComplete = isCompleted(currentTodayKey, habit.id);
    let cursor = fromDateKey(currentTodayKey);

    if (!todayComplete) {
      cursor = addDays(cursor, -1);
    }

    let streak = 0;
    while (toDateKey(cursor) >= habit.createdAt) {
      if (!isCompleted(toDateKey(cursor), habit.id)) {
        break;
      }
      streak += 1;
      cursor = addDays(cursor, -1);
    }

    return streak;
  }

  function validateHabitName(rawName, ignoredHabitId = null) {
    const name = normalizeName(rawName);
    if (!name) {
      return { error: "先写下一个习惯名称吧。" };
    }
    if (nameLength(name) > MAX_NAME_LENGTH) {
      return { error: `习惯名称不能超过 ${MAX_NAME_LENGTH} 个字符。` };
    }
    const duplicate = state.habits.some(
      (habit) => habit.id !== ignoredHabitId && comparisonName(habit.name) === comparisonName(name)
    );
    if (duplicate) {
      return { error: "这个习惯已经在清单里啦。" };
    }
    return { name, error: "" };
  }

  function render() {
    renderHeader();
    renderHabits();
    renderProgress();
    renderCalendar();
    if (dom.dayDialog.open && selectedDateKey) {
      renderDayDialog();
    }
  }

  function renderHeader() {
    const now = new Date();
    dom.dateLine.textContent = formatLongDate(now);
    dom.stickerDay.textContent = pad2(now.getDate());
    dom.footerDate.textContent = `${now.getFullYear()}年 · 慢慢来，也算前进`;
  }

  function renderHabits() {
    const habits = [...state.habits].sort((a, b) => a.order - b.order);
    dom.habitCount.textContent = `${habits.length} 项`;
    dom.emptyState.hidden = habits.length !== 0;
    dom.habitList.hidden = habits.length === 0;

    dom.habitList.innerHTML = habits.map((habit, index) => {
      const done = isCompleted(currentTodayKey, habit.id);
      const streak = getCurrentStreak(habit);
      const editing = editingHabitId === habit.id;
      const colorClass = `habit-color-${index % 5}`;
      const createdDate = fromDateKey(habit.createdAt);
      const createdText = habit.createdAt === currentTodayKey
        ? "今天加入"
        : `从 ${formatShortDate(createdDate)} 开始`;
      const streakText = streak > 0 ? `连续 ${streak} 天` : "等待第一次打卡";

      return `
        <article
          class="habit-card ${colorClass} ${done ? "is-done" : ""} ${editing ? "is-editing" : ""}"
          data-habit-id="${escapeHtml(habit.id)}"
          style="animation-delay: ${Math.min(index * 35, 210)}ms"
        >
          <button
            class="habit-check"
            type="button"
            data-action="toggle"
            aria-pressed="${done}"
            aria-label="${done ? `撤销“${escapeHtml(habit.name)}”今天的打卡` : `完成“${escapeHtml(habit.name)}”今天的打卡`}"
          >
            ${checkIcon}
          </button>

          <div class="habit-info">
            ${editing ? `
              <form class="rename-form" data-action="rename-form" novalidate>
                <label class="sr-only" for="rename-${escapeHtml(habit.id)}">修改习惯名称</label>
                <input
                  class="rename-input"
                  id="rename-${escapeHtml(habit.id)}"
                  type="text"
                  maxlength="${MAX_NAME_LENGTH}"
                  value="${escapeHtml(habit.name)}"
                  autocomplete="off"
                >
                <button class="mini-button save" type="submit">保存</button>
                <button class="mini-button cancel" type="button" data-action="cancel-edit">取消</button>
              </form>
            ` : `
              <div class="habit-name-row">
                <h3 class="habit-name" title="${escapeHtml(habit.name)}">${escapeHtml(habit.name)}</h3>
                <span class="streak-pill" title="当前连续打卡天数">🔥 ${streak}</span>
              </div>
              <p class="habit-subtext">${streakText} · ${createdText}</p>
            `}
          </div>

          ${editing ? "" : `
            <div class="habit-actions">
              <button class="habit-action edit" type="button" data-action="edit" aria-label="编辑“${escapeHtml(habit.name)}”" title="编辑">
                ${editIcon}
              </button>
              <button class="habit-action delete" type="button" data-action="delete" aria-label="删除“${escapeHtml(habit.name)}”" title="删除">
                ${deleteIcon}
              </button>
            </div>
          `}
        </article>
      `;
    }).join("");

    if (editingHabitId) {
      requestAnimationFrame(() => {
        const input = dom.habitList.querySelector(".rename-input");
        if (input) {
          input.focus();
          input.select();
        }
      });
    }
  }

  function renderProgress() {
    const total = state.habits.length;
    const completed = state.habits.reduce(
      (count, habit) => count + (isCompleted(currentTodayKey, habit.id) ? 1 : 0),
      0
    );
    const ratio = total ? completed / total : 0;
    const percent = Math.round(ratio * 100);

    dom.progressCircle.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - ratio));
    dom.progressPercent.textContent = `${percent}%`;
    dom.progressCount.textContent = `${completed} / ${total}`;
    dom.progressRing.setAttribute(
      "aria-label",
      total
        ? `今天已完成 ${completed} 项，共 ${total} 项，完成度 ${percent}%`
        : "今天还没有习惯"
    );

    if (!total) {
      dom.todaySummary.textContent = "还没有习惯，先添加一项吧。";
    } else if (completed === total) {
      dom.todaySummary.textContent = "今天的习惯全部完成，漂亮！";
    } else if (completed === 0) {
      dom.todaySummary.textContent = `今天有 ${total} 项，挑一项开始吧。`;
    } else {
      dom.todaySummary.textContent = `已经完成 ${completed} 项，还剩 ${total - completed} 项。`;
    }
  }

  function canMoveToNextMonth() {
    const currentMonth = startOfMonth(new Date());
    return displayedMonth < currentMonth;
  }

  function renderCalendar() {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();
    const firstDay = new Date(year, month, 1, 12, 0, 0, 0);
    const daysInMonth = new Date(year, month + 1, 0, 12, 0, 0, 0).getDate();
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const parts = [];

    dom.calendarTitle.textContent = `${year}年${month + 1}月`;
    dom.nextMonth.disabled = !canMoveToNextMonth();

    for (let index = 0; index < mondayOffset; index += 1) {
      parts.push('<span class="calendar-spacer" aria-hidden="true"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day, 12, 0, 0, 0);
      const dateKey = toDateKey(date);
      const activeHabits = getActiveHabits(dateKey);
      const completed = getCompletedCount(dateKey, activeHabits);
      const total = activeHabits.length;
      const future = dateKey > currentTodayKey;
      const isToday = dateKey === currentTodayKey;
      const isSelected = dateKey === selectedDateKey;
      const ratio = total ? completed / total : 0;
      const alpha = total ? Math.min(0.58, 0.06 + ratio * 0.46) : 0;
      const classes = [
        "calendar-day",
        isToday ? "is-today" : "",
        isSelected ? "is-selected" : "",
        future ? "is-future" : "",
        completed > 0 ? "has-completion" : ""
      ].filter(Boolean).join(" ");
      const stateText = total ? `完成 ${completed} 项，共 ${total} 项` : "当天没有习惯";

      parts.push(`
        <button
          class="${classes}"
          type="button"
          role="gridcell"
          data-date="${dateKey}"
          style="--day-alpha: ${alpha.toFixed(2)}"
          aria-label="${month + 1}月${day}日，${stateText}${isToday ? "，今天" : ""}"
          ${isToday ? 'aria-current="date"' : ""}
          ${future ? "disabled" : ""}
        >
          <span class="day-number">${day}</span>
          ${total ? `<span class="day-count">${completed}/${total}</span>` : ""}
        </button>
      `);
    }

    const totalCells = mondayOffset + daysInMonth;
    const trailingCells = (7 - (totalCells % 7)) % 7;
    for (let index = 0; index < trailingCells; index += 1) {
      parts.push('<span class="calendar-spacer" aria-hidden="true"></span>');
    }

    dom.calendarGrid.innerHTML = parts.join("");
    renderMonthSummary(year, month, daysInMonth);
  }

  function renderMonthSummary(year, month, daysInMonth) {
    let activeDays = 0;
    let completionCount = 0;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = toDateKey(new Date(year, month, day, 12, 0, 0, 0));
      if (dateKey > currentTodayKey) {
        continue;
      }
      const completed = getCompletedCount(dateKey);
      if (completed > 0) {
        activeDays += 1;
        completionCount += completed;
      }
    }

    if (completionCount === 0) {
      dom.monthSummary.textContent = "这个月还没有完成记录。";
    } else {
      dom.monthSummary.textContent = `已完成 ${completionCount} 次，坚持了 ${activeDays} 天。`;
    }
  }

  function renderDayDialog() {
    if (!selectedDateKey) {
      return;
    }

    const date = fromDateKey(selectedDateKey);
    const isToday = selectedDateKey === currentTodayKey;
    const habits = getActiveHabits(selectedDateKey);
    const completed = getCompletedCount(selectedDateKey, habits);

    dom.dayDialogEyebrow.textContent = isToday ? "今日清单" : "历史记录";
    dom.dayDialogTitle.textContent = `${formatShortDate(date)} · ${formatWeekday(date)}`;
    dom.dayDialogSubtitle.textContent = isToday
      ? `已完成 ${completed}/${habits.length} 项，今天可以随时修改。`
      : `当天完成 ${completed}/${habits.length} 项；历史记录仅供查看。`;

    if (habits.length === 0) {
      dom.dayHabitList.innerHTML = '<div class="day-empty">这一天还没有需要打卡的习惯。</div>';
      return;
    }

    dom.dayHabitList.innerHTML = habits.map((habit) => {
      const done = isCompleted(selectedDateKey, habit.id);
      return `
        <div class="day-habit-item ${done ? "is-complete" : ""}">
          <div class="day-status" aria-hidden="true">${done ? "✓" : "·"}</div>
          <div>
            <p class="day-habit-name">${escapeHtml(habit.name)}</p>
            <p class="day-habit-state">${done ? "已完成" : "未完成"}</p>
          </div>
          ${isToday ? `
            <button
              class="day-toggle"
              type="button"
              data-action="toggle"
              data-habit-id="${escapeHtml(habit.id)}"
            >${done ? "撤销" : "完成"}</button>
          ` : `<span class="day-habit-state">${done ? "✓" : "—"}</span>`}
        </div>
      `;
    }).join("");
  }

  function addHabit(rawName) {
    const validation = validateHabitName(rawName);
    if (validation.error) {
      dom.formMessage.textContent = validation.error;
      dom.habitName.focus();
      return false;
    }

    const maxOrder = state.habits.reduce((maximum, habit) => Math.max(maximum, habit.order), -1);
    state.habits.push({
      id: createId(),
      name: validation.name,
      createdAt: currentTodayKey,
      order: maxOrder + 1
    });

    dom.formMessage.textContent = "";
    dom.habitName.value = "";
    persistState();
    render();
    showToast(`已添加“${validation.name}”`);
    dom.habitName.focus();
    return true;
  }

  function updateHabitName(habitId, rawName) {
    const habit = getHabitById(habitId);
    if (!habit) {
      return false;
    }

    const validation = validateHabitName(rawName, habitId);
    if (validation.error) {
      dom.formMessage.textContent = validation.error;
      return false;
    }

    habit.name = validation.name;
    editingHabitId = null;
    dom.formMessage.textContent = "";
    persistState();
    render();
    showToast("习惯名称已更新");
    return true;
  }

  function startEditing(habitId) {
    editingHabitId = habitId;
    dom.formMessage.textContent = "";
    renderHabits();
  }

  function toggleCompletion(habitId, dateKey = currentTodayKey) {
    if (dateKey !== currentTodayKey) {
      showToast("历史打卡仅供查看，不能补卡。");
      return;
    }

    const habit = getHabitById(habitId);
    if (!habit || habit.createdAt > dateKey) {
      return;
    }

    if (!state.completions[dateKey]) {
      state.completions[dateKey] = {};
    }

    if (state.completions[dateKey][habitId]) {
      delete state.completions[dateKey][habitId];
    } else {
      state.completions[dateKey][habitId] = true;
    }

    if (Object.keys(state.completions[dateKey]).length === 0) {
      delete state.completions[dateKey];
    }

    persistState();
    render();
  }

  function requestDelete(habitId) {
    const habit = getHabitById(habitId);
    if (!habit) {
      return;
    }

    pendingDeleteHabitId = habitId;
    dom.deleteMessage.textContent = `“${habit.name}”及其过去所有打卡记录都会被清除，此操作无法撤销。`;
    if (typeof dom.deleteDialog.showModal === "function") {
      dom.deleteDialog.showModal();
    } else if (window.confirm(dom.deleteMessage.textContent)) {
      confirmDelete();
    }
  }

  function confirmDelete() {
    const habit = getHabitById(pendingDeleteHabitId);
    if (!habit) {
      dom.deleteDialog.close();
      return;
    }

    state.habits = state.habits.filter((item) => item.id !== habit.id);
    Object.keys(state.completions).forEach((dateKey) => {
      delete state.completions[dateKey][habit.id];
      if (Object.keys(state.completions[dateKey]).length === 0) {
        delete state.completions[dateKey];
      }
    });

    pendingDeleteHabitId = null;
    if (editingHabitId === habit.id) {
      editingHabitId = null;
    }

    persistState();
    render();
    dom.deleteDialog.close();
    showToast(`已删除“${habit.name}”`);
  }

  function openDayDialog(dateKey) {
    if (!isDateKey(dateKey) || dateKey > currentTodayKey) {
      return;
    }

    selectedDateKey = dateKey;
    renderDayDialog();
    if (!dom.dayDialog.open) {
      if (typeof dom.dayDialog.showModal === "function") {
        dom.dayDialog.showModal();
      } else {
        dom.dayDialog.setAttribute("open", "");
      }
    }
  }

  function closeDayDialog() {
    selectedDateKey = null;
    renderCalendar();
  }

  function showToast(message, duration = 2300) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove("is-visible");
    }, duration);
  }

  function moveMonth(offset) {
    if (offset > 0 && !canMoveToNextMonth()) {
      return;
    }
    displayedMonth = addMonths(displayedMonth, offset);
    selectedDateKey = null;
    renderCalendar();
  }

  function handleDateRollover() {
    const nextTodayKey = toDateKey(new Date());
    if (nextTodayKey === currentTodayKey) {
      return;
    }

    const previousTodayKey = currentTodayKey;
    currentTodayKey = nextTodayKey;
    if (selectedDateKey === previousTodayKey) {
      selectedDateKey = nextTodayKey;
    }
    render();
    showToast("新的一天，继续加油！");
  }

  function bindEvents() {
    dom.addHabitForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addHabit(dom.habitName.value);
    });

    dom.habitName.addEventListener("input", () => {
      dom.formMessage.textContent = "";
    });

    dom.focusAddButton.addEventListener("click", () => {
      dom.habitName.focus();
    });

    dom.habitList.addEventListener("click", (event) => {
      const actionElement = event.target.closest("[data-action]");
      const card = event.target.closest("[data-habit-id]");
      if (!actionElement || !card) {
        return;
      }

      const habitId = card.dataset.habitId;
      const action = actionElement.dataset.action;
      if (action === "toggle") {
        toggleCompletion(habitId);
      } else if (action === "edit") {
        startEditing(habitId);
      } else if (action === "delete") {
        requestDelete(habitId);
      } else if (action === "cancel-edit") {
        editingHabitId = null;
        renderHabits();
      }
    });

    dom.habitList.addEventListener("submit", (event) => {
      const form = event.target.closest('[data-action="rename-form"]');
      if (!form) {
        return;
      }
      event.preventDefault();
      const card = form.closest("[data-habit-id]");
      const input = form.querySelector(".rename-input");
      if (card && input) {
        updateHabitName(card.dataset.habitId, input.value);
      }
    });

    dom.calendarGrid.addEventListener("click", (event) => {
      const dayButton = event.target.closest("[data-date]");
      if (dayButton && !dayButton.disabled) {
        openDayDialog(dayButton.dataset.date);
      }
    });

    dom.dayHabitList.addEventListener("click", (event) => {
      const toggle = event.target.closest('[data-action="toggle"]');
      if (toggle && selectedDateKey) {
        toggleCompletion(toggle.dataset.habitId, selectedDateKey);
      }
    });

    dom.prevMonth.addEventListener("click", () => moveMonth(-1));
    dom.nextMonth.addEventListener("click", () => moveMonth(1));

    dom.cancelDelete.addEventListener("click", () => {
      pendingDeleteHabitId = null;
      dom.deleteDialog.close();
    });

    dom.confirmDelete.addEventListener("click", confirmDelete);

    dom.dayDialog.addEventListener("close", closeDayDialog);
    dom.deleteDialog.addEventListener("close", () => {
      pendingDeleteHabitId = null;
    });

    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) {
        return;
      }
      try {
        const nextState = sanitizeState(JSON.parse(event.newValue));
        if (nextState) {
          state = nextState;
          render();
          showToast("已同步其他页面的修改");
        }
      } catch (error) {
        // Ignore malformed cross-tab updates; the next valid update will sync.
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        handleDateRollover();
      }
    });

    window.setInterval(handleDateRollover, 30000);
  }

  function init() {
    state = loadState();
    bindEvents();
    renderStorageNotice();
    render();

    if (deferredMessage) {
      showToast(deferredMessage, 4000);
    }
    if (!storageAvailable) {
      showToast("浏览器存储不可用，修改不会在刷新后保留。", 4200);
    }
  }

  init();
})();