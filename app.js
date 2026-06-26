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
