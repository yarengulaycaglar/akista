const STORAGE_KEYS = ["odak-plan-v4", "odak-plan-v2", "emlak-gunum-v1"];
const STORAGE_KEY = "odak-plan-v4";
const NOTIFIED_KEY = "odak-plan-notified-v4";

const categories = [
  "İş",
  "Kişisel",
  "Randevu",
  "Ev",
  "Sağlık",
  "Telefon",
  "Takip",
  "Alışveriş",
  "Ödeme",
  "Evrak",
  "Diğer"
];

const priorityLabels = {
  must: "Bugün şart",
  important: "Önemli",
  later: "Sonra"
};

const energyLabels = {
  low: "Düşük enerji",
  medium: "Normal enerji",
  high: "Yüksek enerji"
};

const state = {
  tasks: loadTasks(),
  selectedTaskId: null,
  currentView: "todayView",
  calendarMonth: todayISO().slice(0, 7),
  selectedDate: todayISO(),
  suggestedTaskId: null,
  timer: {
    taskId: null,
    totalSeconds: 25 * 60,
    leftSeconds: 25 * 60,
    intervalId: null,
    running: false
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function currentTimeHM() {
  return new Date().toTimeString().slice(0, 5);
}

function addDaysISO(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function minutesToHM(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutesToNow(minutes) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toTimeString().slice(0, 5);
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00`));
}

function loadTasks() {
  for (const key of STORAGE_KEYS) {
    try {
      const tasks = JSON.parse(localStorage.getItem(key)) || [];
      if (Array.isArray(tasks) && tasks.length) {
        return tasks.map(normalizeTask);
      }
    } catch {}
  }
  return [];
}

function normalizeTask(task) {
  return {
    id: task.id || String(Date.now() + Math.random()),
    type: task.type || "task",
    title: task.title || "Başlıksız görev",
    firstStep: task.firstStep || task.first_step || "",
    date: task.date || todayISO(),
    time: task.time || "",
    duration: String(task.duration || "25"),
    energy: task.energy || "medium",
    category: task.category || "Diğer",
    priority: task.priority || "important",
    notes: task.notes || "",
    done: Boolean(task.done),
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: task.updatedAt || new Date().toISOString()
  };
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks.map(normalizeTask)));
}

function sortTasks(tasks) {
  const rank = { must: 0, important: 1, later: 2 };
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const at = a.time || "99:99";
    const bt = b.time || "99:99";
    if (at !== bt) return at.localeCompare(bt);
    return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
  });
}

function taskMeta(task) {
  const parts = [];
  if (task.type === "appointment") parts.push("Randevu");
  if (task.time) parts.push(`Saat ${task.time}`);
  if (task.duration) parts.push(`${task.duration} dk`);
  parts.push(task.category);
  return parts;
}

function chooseNextTask() {
  const today = todayISO();
  const now = currentTimeHM();
  const openToday = state.tasks.filter(t => t.date === today && !t.done);
  if (!openToday.length) return null;

  const upcomingTimed = sortTasks(openToday.filter(t => t.time && t.time >= now));
  if (upcomingTimed.length) return upcomingTimed[0];

  const musts = sortTasks(openToday.filter(t => t.priority === "must"));
  if (musts.length) return musts[0];

  return sortTasks(openToday)[0];
}

function renderTaskCard(task) {
  const card = document.createElement("article");
  card.className = `task-card ${task.done ? "done" : ""} ${task.id === state.suggestedTaskId ? "suggested" : ""}`;
  card.innerHTML = `
    <button class="check-btn ${task.done ? "checked" : ""}" aria-label="Tamamlandı işaretle">${task.done ? "✓" : ""}</button>
    <div class="task-main">
      <div class="task-title"></div>
      <div class="task-meta"></div>
    </div>
    <button class="more-btn" aria-label="Detay">›</button>
  `;
  card.querySelector(".task-title").textContent = task.title;
  const meta = card.querySelector(".task-meta");
  taskMeta(task).forEach(text => {
    const span = document.createElement("span");
    span.className = "badge";
    span.textContent = text;
    meta.appendChild(span);
  });
  const priority = document.createElement("span");
  priority.className = `badge ${task.priority}`;
  priority.textContent = priorityLabels[task.priority] || task.priority;
  meta.appendChild(priority);

  const energy = document.createElement("span");
  energy.className = `badge energy-${task.energy || "medium"}`;
  energy.textContent = energyLabels[task.energy || "medium"];
  meta.appendChild(energy);

  card.querySelector(".check-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDone(task.id);
  });
  card.querySelector(".more-btn").addEventListener("click", () => openDetail(task.id));
  card.addEventListener("click", () => openDetail(task.id));
  return card;
}

function renderList(container, tasks, emptyText) {
  container.innerHTML = "";
  if (!tasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-card";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  sortTasks(tasks).forEach(task => container.appendChild(renderTaskCard(task)));
}

function renderTimeline(container, tasks) {
  container.innerHTML = "";
  const sorted = sortTasks(tasks);
  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "empty-card";
    empty.textContent = "Bugün için akış yok. İstersen hızlı görev ekleyebilirsin.";
    container.appendChild(empty);
    return;
  }
  sorted.forEach(task => {
    const item = document.createElement("article");
    item.className = "timeline-item";
    item.innerHTML = `
      <div class="timeline-time"></div>
      <div>
        <div class="timeline-title"></div>
        <div class="timeline-sub"></div>
      </div>
    `;
    item.querySelector(".timeline-time").textContent = task.time || "Esnek";
    item.querySelector(".timeline-title").textContent = task.title;
    const first = task.firstStep ? `İlk adım: ${task.firstStep}` : `${task.category} • ${priorityLabels[task.priority]}`;
    item.querySelector(".timeline-sub").textContent = first;
    item.addEventListener("click", () => openDetail(task.id));
    container.appendChild(item);
  });
}

function renderToday() {
  const today = todayISO();
  const todays = state.tasks.filter(t => t.date === today);
  const openToday = todays.filter(t => !t.done);
  const appointments = todays.filter(t => t.type === "appointment");
  const focus = sortTasks(openToday).slice(0, 3);
  const done = todays.filter(t => t.done);
  const next = chooseNextTask();

  $("#todayLabel").textContent = formatDate(today);
  $("#todayCount").textContent = todays.length;
  $("#doneCount").textContent = done.length;
  $("#focusCount").textContent = focus.length;
  $("#appointmentCount").textContent = appointments.filter(t => !t.done).length;

  const nextTimed = sortTasks(openToday.filter(t => t.time))[0];
  $("#nextTime").textContent = nextTimed ? nextTimed.time : "—";

  if (next) {
    $("#nextTitle").textContent = next.title;
    $("#nextSubtitle").textContent = next.firstStep ? `İlk küçük adım: ${next.firstStep}` : "Akışı başlatmak için detaya girip ilk küçük adımı belirleyebilirsin.";
    $("#startNextBtn").disabled = false;
  } else {
    $("#nextTitle").textContent = "Bugün için akış tamam.";
    $("#nextSubtitle").textContent = "İstersen yarının planına geçebilir ya da aklına geleni hızlıca yakalayabilirsin.";
    $("#startNextBtn").disabled = true;
  }

  renderList($("#focusList"), focus, "Bugün için ana odak yok. Bir görev ekleyip ilk küçük adımı belirleyebilirsin.");
  renderTimeline($("#timelineList"), todays.filter(t => !t.done));
  renderList($("#doneToday"), done, "Henüz tamamlanan iş yok. Küçük bir adımla başla.");
}


function monthLabel(monthISOValue) {
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(new Date(`${monthISOValue}-01T12:00:00`));
}

function addMonths(monthISOValue, offset) {
  const d = new Date(`${monthISOValue}-01T12:00:00`);
  d.setMonth(d.getMonth() + offset);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 7);
}

function startOfCalendarGrid(monthISOValue) {
  const first = new Date(`${monthISOValue}-01T12:00:00`);
  const day = first.getDay(); // 0 Sunday, 1 Monday
  const mondayBased = (day + 6) % 7;
  first.setDate(first.getDate() - mondayBased);
  first.setMinutes(first.getMinutes() - first.getTimezoneOffset());
  return first.toISOString().slice(0, 10);
}

function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const d = new Date(year, monthIndex, 1, 12);
  const add = (weekday - d.getDay() + 7) % 7;
  d.setDate(1 + add + (nth - 1) * 7);
  return d.toISOString().slice(0, 10);
}

function holiday(date, name, type = "resmi", note = "") {
  return { date, name, type, note };
}

function fixedHoliday(date, name, type = "resmi", note = "") {
  return { date, name, type, note };
}

const RELIGIOUS_HOLIDAYS = [
  holiday("2024-04-09", "Ramazan Bayramı Arifesi", "resmi", "yarım gün"),
  holiday("2024-04-10", "Ramazan Bayramı 1. gün"),
  holiday("2024-04-11", "Ramazan Bayramı 2. gün"),
  holiday("2024-04-12", "Ramazan Bayramı 3. gün"),
  holiday("2024-06-15", "Kurban Bayramı Arifesi", "resmi", "yarım gün"),
  holiday("2024-06-16", "Kurban Bayramı 1. gün"),
  holiday("2024-06-17", "Kurban Bayramı 2. gün"),
  holiday("2024-06-18", "Kurban Bayramı 3. gün"),
  holiday("2024-06-19", "Kurban Bayramı 4. gün"),

  holiday("2025-03-29", "Ramazan Bayramı Arifesi", "resmi", "yarım gün"),
  holiday("2025-03-30", "Ramazan Bayramı 1. gün"),
  holiday("2025-03-31", "Ramazan Bayramı 2. gün"),
  holiday("2025-04-01", "Ramazan Bayramı 3. gün"),
  holiday("2025-06-05", "Kurban Bayramı Arifesi", "resmi", "yarım gün"),
  holiday("2025-06-06", "Kurban Bayramı 1. gün"),
  holiday("2025-06-07", "Kurban Bayramı 2. gün"),
  holiday("2025-06-08", "Kurban Bayramı 3. gün"),
  holiday("2025-06-09", "Kurban Bayramı 4. gün"),

  holiday("2026-03-19", "Ramazan Bayramı Arifesi", "resmi", "yarım gün"),
  holiday("2026-03-20", "Ramazan Bayramı 1. gün"),
  holiday("2026-03-21", "Ramazan Bayramı 2. gün"),
  holiday("2026-03-22", "Ramazan Bayramı 3. gün"),
  holiday("2026-05-26", "Kurban Bayramı Arifesi", "resmi", "yarım gün"),
  holiday("2026-05-27", "Kurban Bayramı 1. gün"),
  holiday("2026-05-28", "Kurban Bayramı 2. gün"),
  holiday("2026-05-29", "Kurban Bayramı 3. gün"),
  holiday("2026-05-30", "Kurban Bayramı 4. gün"),

  holiday("2027-03-09", "Ramazan Bayramı Arifesi", "resmi", "tahmini / yarım gün"),
  holiday("2027-03-10", "Ramazan Bayramı 1. gün", "resmi", "tahmini"),
  holiday("2027-03-11", "Ramazan Bayramı 2. gün", "resmi", "tahmini"),
  holiday("2027-03-12", "Ramazan Bayramı 3. gün", "resmi", "tahmini"),
  holiday("2027-05-15", "Kurban Bayramı Arifesi", "resmi", "tahmini / yarım gün"),
  holiday("2027-05-16", "Kurban Bayramı 1. gün", "resmi", "tahmini"),
  holiday("2027-05-17", "Kurban Bayramı 2. gün", "resmi", "tahmini"),
  holiday("2027-05-18", "Kurban Bayramı 3. gün", "resmi", "tahmini"),
  holiday("2027-05-19", "Kurban Bayramı 4. gün", "resmi", "tahmini"),

  holiday("2028-02-26", "Ramazan Bayramı Arifesi", "resmi", "tahmini / yarım gün"),
  holiday("2028-02-27", "Ramazan Bayramı 1. gün", "resmi", "tahmini"),
  holiday("2028-02-28", "Ramazan Bayramı 2. gün", "resmi", "tahmini"),
  holiday("2028-02-29", "Ramazan Bayramı 3. gün", "resmi", "tahmini"),
  holiday("2028-05-04", "Kurban Bayramı Arifesi", "resmi", "tahmini / yarım gün"),
  holiday("2028-05-05", "Kurban Bayramı 1. gün", "resmi", "tahmini"),
  holiday("2028-05-06", "Kurban Bayramı 2. gün", "resmi", "tahmini"),
  holiday("2028-05-07", "Kurban Bayramı 3. gün", "resmi", "tahmini"),
  holiday("2028-05-08", "Kurban Bayramı 4. gün", "resmi", "tahmini"),

  holiday("2029-02-14", "Ramazan Bayramı Arifesi", "resmi", "tahmini / yarım gün"),
  holiday("2029-02-15", "Ramazan Bayramı 1. gün", "resmi", "tahmini"),
  holiday("2029-02-16", "Ramazan Bayramı 2. gün", "resmi", "tahmini"),
  holiday("2029-02-17", "Ramazan Bayramı 3. gün", "resmi", "tahmini"),
  holiday("2029-04-23", "Kurban Bayramı Arifesi", "resmi", "tahmini / yarım gün"),
  holiday("2029-04-24", "Kurban Bayramı 1. gün", "resmi", "tahmini"),
  holiday("2029-04-25", "Kurban Bayramı 2. gün", "resmi", "tahmini"),
  holiday("2029-04-26", "Kurban Bayramı 3. gün", "resmi", "tahmini"),
  holiday("2029-04-27", "Kurban Bayramı 4. gün", "resmi", "tahmini"),

  holiday("2030-02-03", "Ramazan Bayramı Arifesi", "resmi", "tahmini / yarım gün"),
  holiday("2030-02-04", "Ramazan Bayramı 1. gün", "resmi", "tahmini"),
  holiday("2030-02-05", "Ramazan Bayramı 2. gün", "resmi", "tahmini"),
  holiday("2030-02-06", "Ramazan Bayramı 3. gün", "resmi", "tahmini"),
  holiday("2030-04-12", "Kurban Bayramı Arifesi", "resmi", "tahmini / yarım gün"),
  holiday("2030-04-13", "Kurban Bayramı 1. gün", "resmi", "tahmini"),
  holiday("2030-04-14", "Kurban Bayramı 2. gün", "resmi", "tahmini"),
  holiday("2030-04-15", "Kurban Bayramı 3. gün", "resmi", "tahmini"),
  holiday("2030-04-16", "Kurban Bayramı 4. gün", "resmi", "tahmini")
];

function getHolidaysForDate(iso) {
  const year = Number(iso.slice(0, 4));
  const monthDay = iso.slice(5);
  const fixed = [
    fixedHoliday(`${year}-01-01`, "Yılbaşı"),
    fixedHoliday(`${year}-04-23`, "Ulusal Egemenlik ve Çocuk Bayramı"),
    fixedHoliday(`${year}-05-01`, "Emek ve Dayanışma Günü"),
    fixedHoliday(`${year}-05-19`, "Atatürk'ü Anma, Gençlik ve Spor Bayramı"),
    fixedHoliday(`${year}-07-15`, "Demokrasi ve Millî Birlik Günü"),
    fixedHoliday(`${year}-08-30`, "Zafer Bayramı"),
    fixedHoliday(`${year}-10-28`, "Cumhuriyet Bayramı Arifesi", "resmi", "yarım gün"),
    fixedHoliday(`${year}-10-29`, "Cumhuriyet Bayramı"),
    fixedHoliday(`${year}-11-10`, "Atatürk'ü Anma Günü", "özel"),
    fixedHoliday(`${year}-11-24`, "Öğretmenler Günü", "özel"),
    fixedHoliday(`${year}-12-31`, "Yılbaşı Gecesi", "özel")
  ].filter(h => h.date === iso);

  const movingSpecial = [
    fixedHoliday(nthWeekdayOfMonth(year, 4, 0, 2), "Anneler Günü", "özel"),
    fixedHoliday(nthWeekdayOfMonth(year, 5, 0, 3), "Babalar Günü", "özel")
  ].filter(h => h.date === iso);

  const religious = RELIGIOUS_HOLIDAYS.filter(h => h.date === iso);
  return [...fixed, ...movingSpecial, ...religious];
}

function setCalendarMonth(monthISOValue) {
  state.calendarMonth = monthISOValue;
  renderCalendar();
}

function setSelectedDate(iso) {
  state.selectedDate = iso;
  state.calendarMonth = iso.slice(0, 7);
  renderCalendar();
}

function renderCalendar() {
  const grid = $("#calendarGrid");
  if (!grid) return;

  $("#calendarMonthLabel").textContent = monthLabel(state.calendarMonth);
  $("#calendarMonthPicker").value = state.calendarMonth;

  grid.innerHTML = "";
  const start = startOfCalendarGrid(state.calendarMonth);
  const today = todayISO();

  for (let i = 0; i < 42; i++) {
    const iso = addDaysISO(start, i);
    const tasks = state.tasks.filter(t => t.date === iso);
    const openTasks = tasks.filter(t => !t.done);
    const holidays = getHolidaysForDate(iso);
    const day = document.createElement("button");
    day.type = "button";
    day.className = [
      "calendar-day",
      iso.slice(0, 7) !== state.calendarMonth ? "outside" : "",
      iso === today ? "today" : "",
      iso === state.selectedDate ? "selected" : ""
    ].filter(Boolean).join(" ");
    day.innerHTML = `
      <span class="calendar-day-number">${Number(iso.slice(8))}</span>
      <span class="calendar-day-meta"></span>
    `;

    const meta = day.querySelector(".calendar-day-meta");
    if (openTasks.length) {
      const dot = document.createElement("span");
      dot.className = "calendar-dot";
      dot.textContent = `${openTasks.length} iş`;
      meta.appendChild(dot);
    }
    if (tasks.some(t => t.type === "appointment" && !t.done)) {
      const dot = document.createElement("span");
      dot.className = "calendar-dot";
      dot.textContent = "randevu";
      meta.appendChild(dot);
    }
    if (holidays.length) {
      const h = document.createElement("span");
      h.className = "holiday-mini";
      h.textContent = holidays[0].name;
      meta.appendChild(h);
    }

    day.addEventListener("click", () => setSelectedDate(iso));
    grid.appendChild(day);
  }

  renderSelectedDay();
}

function renderSelectedDay() {
  const title = $("#selectedDayTitle");
  if (!title) return;

  const iso = state.selectedDate;
  title.textContent = formatDate(iso);

  const holidayBox = $("#selectedDayHolidays");
  holidayBox.innerHTML = "";
  const holidays = getHolidaysForDate(iso);
  holidays.forEach(h => {
    const pill = document.createElement("div");
    pill.className = `holiday-pill ${h.type === "özel" ? "special" : ""}`;
    pill.innerHTML = `<span>${h.name}${h.note ? ` • ${h.note}` : ""}</span><small>${h.type === "özel" ? "özel gün" : "resmi"}</small>`;
    holidayBox.appendChild(pill);
  });

  const selectedTasks = state.tasks.filter(t => t.date === iso);
  renderList($("#selectedDayTasks"), selectedTasks, "Bu gün için kayıt yok. Takvimden geçmiş veya gelecek günleri kontrol edebilirsin.");
}

function addForSelectedDate(type) {
  showView("addView");
  syncTypeToggle(type);
  $("#date").value = state.selectedDate;
  if (type === "appointment") $("#category").value = "Randevu";
}

function renderWeek() {
  const start = todayISO();
  const weekList = $("#weekList");
  weekList.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const iso = addDaysISO(start, i);
    const tasks = sortTasks(state.tasks.filter(t => t.date === iso));
    const card = document.createElement("section");
    card.className = "day-card";
    card.innerHTML = `
      <div class="day-head">
        <h3>${i === 0 ? "Bugün" : formatDate(iso)}</h3>
        <span class="day-count">${tasks.filter(t => t.done).length}/${tasks.length}</span>
      </div>
      <div class="task-list"></div>
    `;
    renderList(card.querySelector(".task-list"), tasks, "Bu gün için kayıt yok.");
    weekList.appendChild(card);
  }
}

function renderAll() {
  const category = $("#filterCategory").value || "all";
  const priority = $("#filterPriority").value || "all";
  const query = ($("#searchInput").value || "").trim().toLowerCase();

  let tasks = state.tasks.filter(t => !t.done);
  if (category !== "all") tasks = tasks.filter(t => t.category === category);
  if (priority !== "all") tasks = tasks.filter(t => t.priority === priority);
  if (query) {
    tasks = tasks.filter(t =>
      (t.title || "").toLowerCase().includes(query) ||
      (t.firstStep || "").toLowerCase().includes(query) ||
      (t.notes || "").toLowerCase().includes(query)
    );
  }
  renderList($("#allTasks"), tasks, "Açık iş bulunamadı. İstersen yeni bir görev ekleyebilirsin.");
}

function render() {
  renderToday();
  renderCalendar();
  renderWeek();
  renderAll();
}

function toggleDone(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.updatedAt = new Date().toISOString();
  saveTasks();
  render();
  toast(task.done ? "Tamamlandı. Küçük adım işe yaradı." : "Tekrar açıldı");
}

function openDetail(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  state.selectedTaskId = id;
  $("#detailTitle").textContent = task.title;
  $("#detailMeta").textContent = `${formatDate(task.date)}${task.time ? " • " + task.time : ""} • ${task.duration || 25} dk • ${task.category} • ${priorityLabels[task.priority]}`;
  $("#detailFirstStep").innerHTML = `<strong>İlk küçük adım</strong>${task.firstStep || "Henüz yok. Şu soruyu cevapla: Başlamak için fiziksel olarak ne yapacağım?"}`;
  $("#detailNotes").textContent = task.notes || "Not yok.";
  $("#calendarBtn").style.display = task.type === "appointment" ? "inline-flex" : "none";
  $("#detailDialog").showModal();
}

function selectedTask() {
  return state.tasks.find(t => t.id === state.selectedTaskId);
}

function moveSelected(days) {
  const task = selectedTask();
  if (!task) return;
  task.date = addDaysISO(todayISO(), days);
  task.updatedAt = new Date().toISOString();
  saveTasks();
  render();
  $("#detailDialog").close();
  toast(days === 1 ? "Yarına atıldı" : "Haftaya atıldı");
}

function snoozeSelected() {
  const task = selectedTask();
  if (!task) return;
  task.date = todayISO();
  task.time = addMinutesToNow(30);
  task.updatedAt = new Date().toISOString();
  saveTasks();
  render();
  $("#detailDialog").close();
  toast("30 dakika sonraya ertelendi");
}

function deleteSelected() {
  const task = selectedTask();
  if (!task) return;
  state.tasks = state.tasks.filter(t => t.id !== task.id);
  saveTasks();
  render();
  $("#detailDialog").close();
  toast("Silindi");
}

function createICS(task) {
  const date = task.date.replaceAll("-", "");
  const startTime = task.time ? task.time.replace(":", "") + "00" : "090000";
  const [hour, minute] = task.time ? task.time.split(":").map(Number) : [9, 0];
  const end = new Date(`${task.date}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00`);
  end.setMinutes(end.getMinutes() + Number(task.duration || 60));
  const endDate = end.toISOString().slice(0,10).replaceAll("-", "");
  const endTime = end.toTimeString().slice(0,8).replaceAll(":", "");
  const uid = `${task.id}@odak-plan`;
  const description = (task.notes || "Akışta randevusu").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Akista//TR",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${date}T${startTime}`,
    `DTEND:${endDate}T${endTime}`,
    `SUMMARY:${task.title}`,
    `DESCRIPTION:${description}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${task.title}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function downloadCalendar() {
  const task = selectedTask();
  if (!task) return;
  const blob = new Blob([createICS(task)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${task.title.replace(/[^a-z0-9ığüşöçİĞÜŞÖÇ -]/gi, "").slice(0,40) || "randevu"}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Takvim dosyası hazırlandı");
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}

function showView(viewId) {
  state.currentView = viewId;
  $$(".view").forEach(v => v.classList.toggle("active", v.id === viewId));
  $$(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewId));
  if (viewId === "addView") $("#title").focus();
}

function syncTypeToggle(type) {
  $("#type").value = type;
  $$(".toggle-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.type === type));
  if (type === "appointment" && $("#category").value === "İş") {
    $("#category").value = "Randevu";
  }
}

function setupForm() {
  const categorySelect = $("#category");
  const filterCategory = $("#filterCategory");
  categories.forEach(cat => {
    categorySelect.appendChild(new Option(cat, cat));
    filterCategory.appendChild(new Option(cat, cat));
  });
  $("#date").value = todayISO();
  $("#category").value = categories[0];

  $$(".toggle-btn").forEach(btn => btn.addEventListener("click", () => syncTypeToggle(btn.dataset.type)));

  $("#taskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("#title").value.trim();
    if (!title) return;
    state.tasks.push(normalizeTask({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      type: $("#type").value,
      title,
      firstStep: $("#firstStep").value.trim(),
      date: $("#date").value,
      time: $("#time").value,
      duration: $("#duration").value,
      energy: $("#energy").value,
      category: $("#category").value,
      priority: $("#priority").value,
      notes: $("#notes").value.trim(),
      done: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    saveTasks();
    e.target.reset();
    $("#date").value = todayISO();
    $("#category").value = categories[0];
    $("#priority").value = "important";
    $("#duration").value = "25";
    $("#energy").value = "medium";
    syncTypeToggle("task");
    render();
    showView("todayView");
    toast("Kaydedildi");
  });

  $$("[data-template]").forEach(btn => btn.addEventListener("click", () => applyTemplate(btn.dataset.template)));
  $$("[data-quick]").forEach(btn => btn.addEventListener("click", () => {
    showView("addView");
    syncTypeToggle(btn.dataset.quick);
  }));
}

function applyTemplate(name) {
  const templates = {
    "Güne başla": { title: "Güne başla", firstStep: "Bugünün ilk 3 işini seç", category: "Kişisel", priority: "must", duration: "15", energy: "low", notes: "Takvime bak. Bugün mutlaka yapılacak 3 işi belirle." },
    "Telefon aç": { title: "Telefon aç", firstStep: "Kişinin numarasını aç", category: "Telefon", duration: "15", energy: "medium", notes: "Konuşulacak 3 noktayı yaz." },
    "Toplantı": { title: "Toplantı", type: "appointment", firstStep: "Adres/link ve çıkış saatini kontrol et", category: "Randevu", duration: "45", energy: "medium", notes: "Yanına alınacaklar, adres/link, konuşulacak maddeler." },
    "Doktor randevusu": { title: "Doktor randevusu", type: "appointment", firstStep: "Randevu saatini ve adresi kontrol et", category: "Sağlık", duration: "60", energy: "medium", notes: "Sorulacak sorular, ilaçlar, tahlil notları." },
    "Evrak işi": { title: "Evrak işi", firstStep: "Gerekli dosyayı aç", category: "Evrak", duration: "25", energy: "medium", notes: "Eksik bilgi ve gönderilecek kişi." },
    "Ev işi": { title: "Ev işi", firstStep: "Sadece 5 dakika başla", category: "Ev", duration: "15", energy: "low", notes: "İlk küçük adım: örn. çamaşırları ayır, tezgahı boşalt." },
    "Fatura öde": { title: "Fatura öde", firstStep: "Banka uygulamasını aç", category: "Ödeme", duration: "10", energy: "low", notes: "Ödenecek tutar ve son gün." }
  };
  const t = templates[name];
  if (!t) return;
  $("#title").value = t.title;
  $("#firstStep").value = t.firstStep || "";
  syncTypeToggle(t.type || "task");
  $("#category").value = t.category;
  $("#priority").value = t.priority || "important";
  $("#duration").value = t.duration || "25";
  $("#energy").value = t.energy || "medium";
  $("#notes").value = t.notes || "";
}

function quickCapture() {
  const input = $("#quickCapture");
  const title = input.value.trim();
  if (!title) return;
  state.tasks.push(normalizeTask({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type: "task",
    title,
    firstStep: "Sadece başlamak için gereken ilk hareketi seç",
    date: todayISO(),
    time: "",
    duration: "5",
    energy: "low",
    category: "Diğer",
    priority: "later",
    notes: "Hızlı yakalama ile eklendi.",
    done: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
  input.value = "";
  saveTasks();
  render();
  toast("Zihinden çıkarıldı");
}

function suggestNext() {
  const next = chooseNextTask();
  if (!next) {
    toast("Bugün için açık iş yok");
    return;
  }
  state.suggestedTaskId = next.id;
  render();
  toast(`Sıradaki: ${next.title}`);
}

function setupButtons() {
  $$(".nav-btn").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
  $("#settingsBtn").addEventListener("click", () => $("#settingsDialog").showModal());
  $("#focusHelpBtn").addEventListener("click", () => toast("3 ana odak listeyi küçültür. Önce bugün tarihli, açık ve yüksek öncelikli işler seçilir."));
  $("#thisWeekBtn").addEventListener("click", () => renderWeek());
  $("#prevMonthBtn").addEventListener("click", () => setCalendarMonth(addMonths(state.calendarMonth, -1)));
  $("#nextMonthBtn").addEventListener("click", () => setCalendarMonth(addMonths(state.calendarMonth, 1)));
  $("#calendarTodayBtn").addEventListener("click", () => setSelectedDate(todayISO()));
  $("#calendarMonthPicker").addEventListener("change", (e) => setCalendarMonth(e.target.value || todayISO().slice(0, 7)));
  $("#addTaskForSelectedDate").addEventListener("click", () => addForSelectedDate("task"));
  $("#addAppointmentForSelectedDate").addEventListener("click", () => addForSelectedDate("appointment"));
  $("#tomorrowBtn").addEventListener("click", () => moveSelected(1));
  $("#nextWeekBtn").addEventListener("click", () => moveSelected(7));
  $("#snoozeBtn").addEventListener("click", snoozeSelected);
  $("#deleteBtn").addEventListener("click", deleteSelected);
  $("#calendarBtn").addEventListener("click", downloadCalendar);
  $("#focusBtn").addEventListener("click", () => startTimerForTask(selectedTask(), Number(selectedTask()?.duration || 25)));
  $("#fiveMinuteBtn").addEventListener("click", () => startTimerForTask(selectedTask(), 5));
  $("#startNextBtn").addEventListener("click", () => startTimerForTask(chooseNextTask(), Number(chooseNextTask()?.duration || 25)));
  $("#suggestNextBtn").addEventListener("click", suggestNext);
  $("#quickCaptureBtn").addEventListener("click", quickCapture);
  $("#quickCapture").addEventListener("keydown", (e) => {
    if (e.key === "Enter") quickCapture();
  });
  $("#hideDoneBtn").addEventListener("click", () => document.body.classList.toggle("hide-done"));

  $("#timerStartPauseBtn").addEventListener("click", toggleTimer);
  $("#timerDoneBtn").addEventListener("click", markTimerTaskDone);
  $("#timerResetBtn").addEventListener("click", resetTimer);

  $("#clearDoneBtn").addEventListener("click", () => {
    const before = state.tasks.length;
    state.tasks = state.tasks.filter(t => !t.done);
    saveTasks();
    render();
    toast(`${before - state.tasks.length} biten kayıt temizlendi`);
  });
  $("#filterCategory").addEventListener("change", renderAll);
  $("#filterPriority").addEventListener("change", renderAll);
  $("#searchInput").addEventListener("input", renderAll);
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Tüm işler silinsin mi?")) return;
    state.tasks = [];
    saveTasks();
    render();
    $("#settingsDialog").close();
    toast("Tüm veriler silindi");
  });
  $("#exportBtn").addEventListener("click", exportData);
  $("#importFile").addEventListener("change", importData);
  $("#enableNotificationsBtn").addEventListener("click", requestNotifications);
}

function exportData() {
  const blob = new Blob([JSON.stringify({ version: 4, exportedAt: new Date().toISOString(), tasks: state.tasks }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `odak-plan-yedek-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Yedek indirildi");
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.tasks)) throw new Error("Geçersiz dosya");
      state.tasks = parsed.tasks.map(normalizeTask);
      saveTasks();
      render();
      toast("Yedek içe aktarıldı");
    } catch {
      toast("Yedek dosyası okunamadı");
    }
  };
  reader.readAsText(file);
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    toast("Bu tarayıcı bildirim desteklemiyor");
    return;
  }
  const permission = await Notification.requestPermission();
  toast(permission === "granted" ? "Bildirim izni verildi" : "Bildirim izni verilmedi");
}

function checkDueTasks() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]");
  const now = new Date();
  state.tasks.forEach(task => {
    if (task.done || !task.time || notified.includes(task.id)) return;
    const due = new Date(`${task.date}T${task.time}:00`);
    const diff = due - now;
    if (diff > -60_000 && diff <= 15 * 60_000) {
      new Notification(task.type === "appointment" ? "Randevu yaklaşıyor" : "Görev zamanı", {
        body: `${task.time} • ${task.title}`,
        icon: "icons/icon-192.png"
      });
      notified.push(task.id);
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified.slice(-200)));
    }
  });
}

function startTimerForTask(task, minutes) {
  if (!task) {
    toast("Başlatılacak iş yok");
    return;
  }
  state.timer.taskId = task.id;
  state.timer.totalSeconds = Math.max(1, minutes) * 60;
  state.timer.leftSeconds = state.timer.totalSeconds;
  state.timer.running = false;
  clearInterval(state.timer.intervalId);
  $("#timerTaskTitle").textContent = task.title;
  $("#timerStep").textContent = task.firstStep ? `İlk adım: ${task.firstStep}` : "Sadece ilk küçük adımı yap.";
  updateTimerUI();
  $("#detailDialog").close();
  $("#timerDialog").showModal();
}

function updateTimerUI() {
  const left = state.timer.leftSeconds;
  const m = Math.floor(left / 60);
  const s = left % 60;
  $("#timerMinutes").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const done = state.timer.totalSeconds ? 100 - (left / state.timer.totalSeconds * 100) : 0;
  $(".timer-circle").style.setProperty("--timer-progress", `${Math.min(100, Math.max(0, done))}%`);
  $("#timerStartPauseBtn").textContent = state.timer.running ? "Duraklat" : "Başlat";
}

function toggleTimer() {
  if (state.timer.running) {
    clearInterval(state.timer.intervalId);
    state.timer.running = false;
    updateTimerUI();
    return;
  }
  state.timer.running = true;
  state.timer.intervalId = setInterval(() => {
    state.timer.leftSeconds -= 1;
    if (state.timer.leftSeconds <= 0) {
      state.timer.leftSeconds = 0;
      clearInterval(state.timer.intervalId);
      state.timer.running = false;
      toast("Süre bitti. Devam mı, tamam mı?");
    }
    updateTimerUI();
  }, 1000);
  updateTimerUI();
}

function resetTimer() {
  clearInterval(state.timer.intervalId);
  state.timer.leftSeconds = state.timer.totalSeconds;
  state.timer.running = false;
  updateTimerUI();
}

function markTimerTaskDone() {
  const task = state.tasks.find(t => t.id === state.timer.taskId);
  if (task) {
    task.done = true;
    task.updatedAt = new Date().toISOString();
    saveTasks();
    render();
  }
  clearInterval(state.timer.intervalId);
  state.timer.running = false;
  $("#timerDialog").close();
  toast("Tamamlandı. Bir sonraki küçük adım daha kolay.");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function seedDemoIfEmpty() {
  if (state.tasks.length) return;
  const today = todayISO();
  state.tasks = [
    { id: "demo-1", type: "task", title: "Bugünün 3 ana odağını seç", firstStep: "Sadece 3 iş seç", date: today, time: "09:30", duration: "15", energy: "low", category: "Kişisel", priority: "must", notes: "Tüm listeye değil, sadece ilk üçe bak.", done: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "demo-2", type: "appointment", title: "Örnek randevu", firstStep: "Adres ve çıkış saatini kontrol et", date: today, time: "14:00", duration: "45", energy: "medium", category: "Randevu", priority: "important", notes: "Bu örneği silebilirsin. Takvime ekle butonunu deneyebilirsin.", done: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "demo-3", type: "task", title: "Fatura öde", firstStep: "Banka uygulamasını aç", date: today, time: "18:00", duration: "10", energy: "low", category: "Ödeme", priority: "later", notes: "Son ödeme gününü kontrol et.", done: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ].map(normalizeTask);
  saveTasks();
}

function boot() {
  setupForm();
  setupButtons();
  seedDemoIfEmpty();
  render();
  registerServiceWorker();
  setInterval(checkDueTasks, 30_000);
  checkDueTasks();
}

document.addEventListener("DOMContentLoaded", boot);
