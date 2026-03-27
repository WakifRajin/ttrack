let appData = JSON.parse(localStorage.getItem("tuitionData_v2")) || {
  students: [],
  sessions: [],
  payments: [],
};
let prefs = JSON.parse(localStorage.getItem("tuitionPrefs")) || {
  dark: false,
  currency: "৳",
  defaultDuration: 60,
};
let activeStudentId = null,
  editingStudentId = null,
  tempSubjects = [];
let calViewDate = new Date(),
  analyticsTab = "overview",
  currentView = "dashboard";
let accountPanelOpen = false;
const COLORS = [
  "#5b5ef4",
  "#f97316",
  "#22c55e",
  "#ef4444",
  "#eab308",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
];

window.appData = appData;
window.prefs = prefs;
window.renderAll = renderAll;
window.applyPrefs = applyPrefs;

// AUTH UI
function switchAuthTab(tab) {
  const su = tab === "signup";
  document.getElementById("tab-signin").classList.toggle("active", !su);
  document.getElementById("tab-signup").classList.toggle("active", su);
  document.getElementById("signup-extra").classList.toggle("hidden", !su);
  document.getElementById("auth-submit-btn").textContent = su
    ? "Create Account"
    : "Sign In";
  document.getElementById("auth-footer-link").innerHTML = su
    ? "<a onclick=\"switchAuthTab('signin')\">← Back to sign in</a>"
    : "<a onclick=\"switchAuthTab('signup')\">Create an account →</a>";
  document.getElementById("auth-error").style.display = "none";
}

function toggleAccountPanel() {
  accountPanelOpen = !accountPanelOpen;
  document
    .getElementById("account-panel")
    .classList.toggle("hidden", !accountPanelOpen);
}
document.addEventListener("click", (e) => {
  if (
    accountPanelOpen &&
    !e.target.closest("#account-panel") &&
    !e.target.closest("#avatar-btn")
  ) {
    accountPanelOpen = false;
    document.getElementById("account-panel").classList.add("hidden");
  }
});

// PREFS
function applyPrefs() {
  if (prefs.dark) {
    document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("dark-toggle")?.classList.add("on");
    const t = document.getElementById("theme-btn");
    if (t) t.textContent = "☀️";
  } else {
    document.documentElement.removeAttribute("data-theme");
    document.getElementById("dark-toggle")?.classList.remove("on");
    const t = document.getElementById("theme-btn");
    if (t) t.textContent = "🌙";
  }
  document
    .querySelectorAll(".currency-label")
    .forEach((el) => (el.textContent = prefs.currency));
  const cs = document.getElementById("currency-select");
  if (cs) cs.value = prefs.currency;
  const dd = document.getElementById("default-duration");
  if (dd) dd.value = prefs.defaultDuration;
}
function toggleDark() {
  prefs.dark = !prefs.dark;
  savePref();
}
function savePref() {
  prefs.currency =
    document.getElementById("currency-select")?.value || prefs.currency;
  prefs.defaultDuration =
    parseInt(document.getElementById("default-duration")?.value) || 60;
  window.prefs = prefs;
  localStorage.setItem("tuitionPrefs", JSON.stringify(prefs));
  applyPrefs();
  renderDashboard();
  _cloud();
}
function save() {
  window.appData = appData;
  localStorage.setItem("tuitionData_v2", JSON.stringify(appData));
  _cloud();
}
function _cloud() {
  window.__saveToCloud?.();
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  d.setHours(0, 0, 0, 0);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const dayOffset = Math.floor((d - jan1) / 86400000);
  const week = Math.floor((dayOffset + jan1.getDay()) / 7) + 1;
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeStudentSettings(shouldSave = false) {
  let changed = false;
  appData.students.forEach((s) => {
    if (!["daily", "weekly", "monthly"].includes(s.paymentCycle)) {
      s.paymentCycle = "daily";
      changed = true;
    }
    if (!Number.isFinite(Number(s.monthlyRequiredClasses))) {
      s.monthlyRequiredClasses = 8;
      changed = true;
    }
    if (!Number.isFinite(Number(s.billingAmount))) {
      s.billingAmount = Number(s.rate) || 0;
      changed = true;
    }
    if (s.paymentCycle === "daily") {
      const rate = Number(s.rate) || 0;
      if ((Number(s.billingAmount) || 0) !== rate) {
        s.billingAmount = rate;
        changed = true;
      }
    }
  });
  if (changed && shouldSave) save();
}

function getMonthlySessionsCount(studentId, baseDate = new Date()) {
  return appData.sessions.filter((x) => {
    if (x.studentId !== studentId) return false;
    const d = new Date(x.date);
    return (
      d.getMonth() === baseDate.getMonth() &&
      d.getFullYear() === baseDate.getFullYear()
    );
  }).length;
}

function getStudentPaymentSummary(student) {
  const cycle = student.paymentCycle || "daily";
  const sessions = appData.sessions.filter((x) => x.studentId === student.id);
  const payments = (appData.payments || []).filter(
    (x) => x.studentId === student.id,
  );
  const paidTotal = payments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0,
  );

  let chargePerUnit = 0;
  let dueUnits = 0;
  let cycleLabel = "per class";

  if (cycle === "weekly") {
    cycleLabel = "per week";
    chargePerUnit = Number(student.billingAmount) || 0;
    dueUnits = new Set(sessions.map((s) => getWeekKey(s.date)).filter(Boolean))
      .size;
  } else if (cycle === "monthly") {
    cycleLabel = "per month";
    chargePerUnit = Number(student.billingAmount) || 0;
    dueUnits = new Set(
      sessions
        .map((s) => String(s.date || "").slice(0, 7))
        .filter((k) => k.length === 7),
    ).size;
  } else {
    cycleLabel = "per class";
    chargePerUnit = Number(student.rate) || 0;
    dueUnits = sessions.length;
  }

  const totalBilled = dueUnits * chargePerUnit;
  const owed = Math.max(totalBilled - paidTotal, 0);

  return {
    cycle,
    cycleLabel,
    chargePerUnit,
    dueUnits,
    totalBilled,
    paidTotal,
    owed,
    monthlyClasses: getMonthlySessionsCount(student.id),
    monthlyRequiredClasses: Math.max(
      0,
      parseInt(student.monthlyRequiredClasses) || 0,
    ),
  };
}

function syncBillingInputState() {
  const cycle = document.getElementById("s-payment-cycle")?.value || "daily";
  const rateInput = document.getElementById("s-rate");
  const amountInput = document.getElementById("s-billing-amount");
  const label = document.getElementById("s-billing-label");
  if (!amountInput || !label || !rateInput) return;

  if (cycle === "daily") {
    label.textContent = "Charge per Class";
    amountInput.value = rateInput.value;
    amountInput.placeholder = "Uses Rate per Class";
    amountInput.disabled = true;
  } else if (cycle === "weekly") {
    label.textContent = "Charge per Week";
    amountInput.placeholder = "e.g. 2000";
    amountInput.disabled = false;
  } else {
    label.textContent = "Charge per Month";
    amountInput.placeholder = "e.g. 8000";
    amountInput.disabled = false;
  }
}

// INIT
(function init() {
  normalizeStudentSettings(true);
  applyPrefs();
  document.getElementById("quick-date").valueAsDate = new Date();
  document.getElementById("log-date").valueAsDate = new Date();
  document.getElementById("pay-date").valueAsDate = new Date();
  document.getElementById("quick-duration").value = prefs.defaultDuration;
  document
    .getElementById("s-rate")
    ?.addEventListener("input", syncBillingInputState);
})();

// NAV
function switchView(v) {
  ["dashboard", "students", "analytics", "settings"].forEach((n) => {
    document.getElementById("view-" + n).classList.toggle("hidden", n !== v);
    document.getElementById("nav-" + n)?.classList.toggle("active", n === v);
  });
  currentView = v;
  window.scrollTo({ top: 0, behavior: "instant" });
  if (v === "analytics") renderAnalytics();
  if (v === "students") {
    renderStudentTabs();
    if (activeStudentId) renderStudentDetail();
  }
}

// SEARCH
function toggleSearch() {
  const el = document.getElementById("search-bar-wrap");
  el.classList.toggle("hidden");
  if (!el.classList.contains("hidden"))
    document.getElementById("global-search").focus();
}
function renderSearch() {
  const q = document.getElementById("global-search").value.toLowerCase().trim();
  const el = document.getElementById("search-results");
  if (!q) {
    el.innerHTML = "";
    return;
  }
  const sm = appData.students.filter((s) => s.name.toLowerCase().includes(q));
  const ss = appData.sessions.filter(
    (s) =>
      (s.subject || "").toLowerCase().includes(q) ||
      (s.notes || "").toLowerCase().includes(q),
  );
  let html = "";
  if (sm.length) {
    html += '<div class="section-label">Students</div>';
    html += sm
      .map(
        (
          s,
        ) => `<div class="session-item" onclick="goToStudent(${s.id})" style="cursor:pointer">
      <div><div class="session-date">${s.name}</div><div class="session-meta">${s.grade || ""} ${s.subjects?.join(", ") || ""}</div></div>
      <span class="badge badge-blue">${appData.sessions.filter((x) => x.studentId === s.id).length} classes</span></div>`,
      )
      .join("");
  }
  if (ss.length) {
    html += '<div class="section-label">Sessions</div>';
    html += ss
      .slice(0, 5)
      .map((s) => {
        const st = appData.students.find((x) => x.id === s.studentId);
        return `<div class="session-item"><div><div class="session-date">${s.date}</div><div class="session-meta">${st?.name || ""} — ${s.subject || ""}</div></div></div>`;
      })
      .join("");
  }
  if (!html)
    html =
      '<p style="color:var(--text3);font-size:.85rem;text-align:center;padding:12px">No results</p>';
  el.innerHTML = html;
}
function goToStudent(id) {
  activeStudentId = id;
  document.getElementById("search-bar-wrap").classList.add("hidden");
  switchView("students");
}

// STUDENTS
function openAddStudent() {
  editingStudentId = null;
  tempSubjects = [];
  [
    "s-name",
    "s-rate",
    "s-grade",
    "s-phone",
    "s-notes",
    "s-billing-amount",
  ].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("s-monthly-required").value = 8;
  document.getElementById("s-payment-cycle").value = "daily";
  document.getElementById("student-modal-title").textContent =
    "Add New Student";
  document.getElementById("student-save-btn").textContent = "Save Student";
  renderSubjectPills();
  renderColorPicker(COLORS[Math.floor(Math.random() * COLORS.length)]);
  syncBillingInputState();
  toggleModal("student-modal", true);
}
function openEditStudent(id) {
  const s = appData.students.find((x) => x.id === id);
  if (!s) return;
  editingStudentId = id;
  tempSubjects = [...(s.subjects || [])];
  document.getElementById("s-name").value = s.name;
  document.getElementById("s-rate").value = s.rate || "";
  document.getElementById("s-grade").value = s.grade || "";
  document.getElementById("s-monthly-required").value =
    parseInt(s.monthlyRequiredClasses) || 8;
  document.getElementById("s-payment-cycle").value = s.paymentCycle || "daily";
  document.getElementById("s-billing-amount").value = Number.isFinite(
    Number(s.billingAmount),
  )
    ? Number(s.billingAmount)
    : s.rate || "";
  document.getElementById("s-phone").value = s.phone || "";
  document.getElementById("s-notes").value = s.notes || "";
  document.getElementById("student-modal-title").textContent = "Edit Student";
  document.getElementById("student-save-btn").textContent = "Save Changes";
  renderSubjectPills();
  renderColorPicker(s.color || COLORS[0]);
  syncBillingInputState();
  toggleModal("student-modal", true);
}
let selectedColor = COLORS[0];
function renderColorPicker(c) {
  selectedColor = c || COLORS[0];
  document.getElementById("color-picker").innerHTML = COLORS.map(
    (x) =>
      `<div onclick="selectedColor='${x}';renderColorPicker('${x}')" style="width:28px;height:28px;border-radius:50%;background:${x};cursor:pointer;border:3px solid ${x === selectedColor ? "var(--text)" : "transparent"};transition:.2s"></div>`,
  ).join("");
}
function addSubject(e) {
  if (e.key !== "Enter") return;
  const v = e.target.value.trim();
  if (v && !tempSubjects.includes(v)) tempSubjects.push(v);
  e.target.value = "";
  renderSubjectPills();
}
function removeSubject(s) {
  tempSubjects = tempSubjects.filter((x) => x !== s);
  renderSubjectPills();
}
function renderSubjectPills() {
  document.getElementById("s-subjects-list").innerHTML = tempSubjects
    .map(
      (s) =>
        `<span class="subject-pill">${s}<span class="remove" onclick="removeSubject('${s}')">✕</span></span>`,
    )
    .join("");
}
function saveStudent() {
  const name = document.getElementById("s-name").value.trim();
  if (!name) {
    showToast("⚠️ Name is required");
    return;
  }
  const rate = parseFloat(document.getElementById("s-rate").value) || 0;
  const paymentCycle =
    document.getElementById("s-payment-cycle").value || "daily";
  const monthlyRequiredClasses = Math.max(
    0,
    parseInt(document.getElementById("s-monthly-required").value) || 0,
  );
  let billingAmount =
    parseFloat(document.getElementById("s-billing-amount").value) || 0;
  if (paymentCycle === "daily") billingAmount = rate;
  const sd = {
    name,
    rate,
    grade: document.getElementById("s-grade").value.trim(),
    phone: document.getElementById("s-phone").value.trim(),
    notes: document.getElementById("s-notes").value.trim(),
    subjects: [...tempSubjects],
    color: selectedColor,
    monthlyRequiredClasses,
    paymentCycle,
    billingAmount,
  };
  if (editingStudentId) {
    const i = appData.students.findIndex((s) => s.id === editingStudentId);
    appData.students[i] = { ...appData.students[i], ...sd };
    showToast("✅ Student updated");
  } else {
    const ns = { id: Date.now(), ...sd };
    appData.students.push(ns);
    activeStudentId = ns.id;
    showToast("✅ Student added");
  }
  save();
  toggleModal("student-modal", false);
  renderStudentTabs();
  if (activeStudentId) renderStudentDetail();
  renderDashboard();
  if (currentView !== "students") switchView("students");
}
function renderStudentTabs() {
  const tl = document.getElementById("tab-list"),
    em = document.getElementById("empty-state-students"),
    det = document.getElementById("student-detail");
  if (!appData.students.length) {
    em.classList.remove("hidden");
    det.classList.add("hidden");
    tl.innerHTML = "";
    return;
  }
  em.classList.add("hidden");
  if (!activeStudentId) activeStudentId = appData.students[0].id;
  tl.innerHTML = appData.students
    .map(
      (s) =>
        `<div class="tab ${s.id === activeStudentId ? "active" : ""}" onclick="setActiveStudent(${s.id})" style="${s.id === activeStudentId ? "background:" + s.color + ";border-color:" + s.color : ""}">${s.name}</div>`,
    )
    .join("");
  det.classList.remove("hidden");
  renderStudentDetail();
}
function setActiveStudent(id) {
  activeStudentId = id;
  renderStudentTabs();
}
function renderStudentDetail() {
  const s = appData.students.find((x) => x.id === activeStudentId);
  if (!s) return;
  const pay = getStudentPaymentSummary(s);
  const sessions = appData.sessions
    .filter((x) => x.studentId === activeStudentId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const payments = (appData.payments || []).filter(
    (x) => x.studentId === activeStudentId,
  );
  const now = new Date();
  const ms = sessions.filter((x) => {
    const d = new Date(x.date);
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });
  const owed = pay.owed;
  const earned = pay.totalBilled;
  let streak = 0;
  const sds = new Set(sessions.map((x) => x.date));
  let chk = new Date();
  for (let i = 0; i < 60; i++) {
    const ds = chk.toISOString().split("T")[0];
    if (sds.has(ds)) streak++;
    chk.setDate(chk.getDate() - 1);
    if (i > 0 && !sds.has(ds)) break;
  }
  document.getElementById("student-detail").innerHTML = `
    <div class="card" style="border-left:4px solid ${s.color || "var(--primary)"}">
      <div class="flex-between">
        <div><div style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800">${s.name}</div>
          <div style="font-size:.82rem;color:var(--text3);margin-top:3px">${s.grade ? '<span class="badge badge-gray">' + s.grade + "</span> " : ""} ${s.phone ? "📞 " + s.phone : ""} <span class="badge badge-blue" style="margin-left:6px">${pay.monthlyClasses}/${pay.monthlyRequiredClasses} classes this month</span></div>
        </div>
        <div class="flex-gap"><div class="icon-btn" onclick="openEditStudent(${s.id})">✏️</div><div class="icon-btn" onclick="confirmAction('student',${s.id})" style="color:var(--danger)">🗑️</div></div>
      </div>
      ${s.subjects?.length ? '<div style="margin-top:10px">' + s.subjects.map((x) => '<span class="subject-pill">' + x + "</span>").join("") + "</div>" : ""}
      ${s.notes ? '<div style="margin-top:10px;font-size:.82rem;color:var(--text2);padding:8px;background:var(--surface2);border-radius:8px">📝 ' + s.notes + "</div>" : ""}
    </div>
    <div class="stats-grid stats-grid-4">
      <div class="stat-card blue"><div class="stat-value">${ms.length}</div><div class="stat-label">This Month</div></div>
      <div class="stat-card orange"><div class="stat-value">${sessions.length}</div><div class="stat-label">Total</div></div>
      <div class="stat-card green"><div class="stat-value small">${prefs.currency}${earned.toLocaleString()}</div><div class="stat-label">Billed</div></div>
      <div class="stat-card red"><div class="stat-value small">${prefs.currency}${owed.toLocaleString()}</div><div class="stat-label">Owed</div></div>
    </div>
    ${streak > 0 ? '<div class="streak-display" style="margin-bottom:14px"><div><div class="streak-num">' + streak + '</div></div><div><div style="font-weight:700">Streak 🔥</div><div style="font-size:.78rem;color:var(--text3)">Consecutive days</div></div></div>' : ""}
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn btn-primary" onclick="openLogModal(${s.id})" style="flex:2">+ Log Class</button>
      <button class="btn btn-success" onclick="openPaymentModal(${s.id})" style="flex:1">💰 Pay</button>
    </div>
    <div class="card" id="student-bar-chart-wrap"><div class="card-title"><span>📈</span> Last 8 Weeks</div><canvas id="student-bar-chart" height="140"></canvas></div>
    <div class="card">
      <div class="card-title flex-between"><span><span>💳</span> Payments</span><span class="badge badge-gray">${pay.cycle.charAt(0).toUpperCase() + pay.cycle.slice(1)} billing</span><span class="badge ${owed > 0 ? "badge-red" : "badge-green"}">${owed > 0 ? "Owes " + prefs.currency + owed.toLocaleString() : "All Paid"}</span></div>
      ${
        payments.length
          ? payments
              .slice()
              .reverse()
              .map(
                (p) =>
                  `<div class="payment-item"><div><div style="font-weight:600">${prefs.currency}${p.amount.toLocaleString()}</div><div style="font-size:.78rem;color:var(--text3)">${p.date}${p.note ? " — " + p.note : ""}</div></div><button class="btn btn-outline btn-sm" onclick="confirmAction('payment',${p.id})">✕</button></div>`,
              )
              .join("")
          : '<p style="color:var(--text3);font-size:.85rem">No payments recorded.</p>'
      }
    </div>
    <div class="card">
      <div class="card-title"><span>📋</span> Session History (${sessions.length})</div>
      ${sessions.length ? sessions.map((sess) => `<div class="session-item"><div style="flex:1;min-width:0"><div class="session-date">📅 ${sess.date}</div><div class="session-meta">${sess.duration || 60} min${sess.subject ? " · " + sess.subject : ""}</div>${sess.notes ? '<div style="font-size:.78rem;color:var(--text3);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📝 ' + sess.notes + "</div>" : ""}</div><div class="flex-gap" style="flex-shrink:0"><span class="badge ${pay.cycle === "daily" ? (sess.payment === "paid" ? "badge-green" : "badge-yellow") : "badge-gray"}">${pay.cycle === "daily" ? (sess.payment === "paid" ? "Paid" : "Unpaid") : pay.cycle + " billed"}</span><div class="icon-btn" onclick="openEditSession(${sess.id})" style="width:30px;height:30px;font-size:.8rem">✏️</div><div class="icon-btn" onclick="confirmAction('session',${sess.id})" style="width:30px;height:30px;font-size:.8rem;color:var(--danger)">🗑️</div></div></div>`).join("") : '<p style="color:var(--text3);font-size:.85rem;text-align:center">No sessions yet.</p>'}
    </div>`;
  setTimeout(() => renderStudentBarChart(s.id), 50);
}

// SESSIONS
function openLogModal(sid) {
  const st = appData.students.find((x) => x.id === sid);
  const isDaily = (st?.paymentCycle || "daily") === "daily";
  document.getElementById("log-student-id").value = sid;
  document.getElementById("log-date").valueAsDate = new Date();
  document.getElementById("log-duration").value = prefs.defaultDuration;
  document.getElementById("log-subject").value = "";
  document.getElementById("log-notes").value = "";
  document.getElementById("log-payment").value = "unpaid";
  document
    .getElementById("log-payment-group")
    ?.classList.toggle("hidden", !isDaily);
  toggleModal("log-modal", true);
}
function saveSession() {
  const sid = parseInt(document.getElementById("log-student-id").value),
    date = document.getElementById("log-date").value;
  if (!date) {
    showToast("⚠️ Select a date");
    return;
  }
  appData.sessions.push({
    id: Date.now(),
    studentId: sid,
    date,
    duration: parseInt(document.getElementById("log-duration").value) || 60,
    subject: document.getElementById("log-subject").value.trim(),
    notes: document.getElementById("log-notes").value.trim(),
    payment: document.getElementById("log-payment").value,
  });
  save();
  toggleModal("log-modal", false);
  showToast("✅ Session logged!");
  renderAll();
}
function logSession() {
  const sid = parseInt(document.getElementById("quick-student").value),
    date = document.getElementById("quick-date").value;
  if (!sid || !date) {
    showToast("⚠️ Select student & date");
    return;
  }
  appData.sessions.push({
    id: Date.now(),
    studentId: sid,
    date,
    duration: parseInt(document.getElementById("quick-duration").value) || 60,
    subject: document.getElementById("quick-subject").value.trim(),
    notes: document.getElementById("quick-notes").value.trim(),
    payment: "unpaid",
  });
  save();
  showToast("✅ Session logged!");
  document.getElementById("quick-subject").value = "";
  document.getElementById("quick-notes").value = "";
  renderAll();
}
function openEditSession(id) {
  const s = appData.sessions.find((x) => x.id === id);
  if (!s) return;
  const st = appData.students.find((x) => x.id === s.studentId);
  const isDaily = (st?.paymentCycle || "daily") === "daily";
  document.getElementById("edit-session-id").value = id;
  document.getElementById("edit-date").value = s.date;
  document.getElementById("edit-duration").value = s.duration || 60;
  document.getElementById("edit-subject").value = s.subject || "";
  document.getElementById("edit-notes").value = s.notes || "";
  document.getElementById("edit-payment").value = s.payment || "unpaid";
  document
    .getElementById("edit-payment-group")
    ?.classList.toggle("hidden", !isDaily);
  toggleModal("edit-session-modal", true);
}
function updateSession() {
  const id = parseInt(document.getElementById("edit-session-id").value),
    idx = appData.sessions.findIndex((x) => x.id === id);
  if (idx < 0) return;
  appData.sessions[idx] = {
    ...appData.sessions[idx],
    date: document.getElementById("edit-date").value,
    duration: parseInt(document.getElementById("edit-duration").value) || 60,
    subject: document.getElementById("edit-subject").value.trim(),
    notes: document.getElementById("edit-notes").value.trim(),
    payment: document.getElementById("edit-payment").value,
  };
  save();
  toggleModal("edit-session-modal", false);
  showToast("✅ Session updated");
  renderAll();
}

// PAYMENTS
function openPaymentModal(sid) {
  const st = appData.students.find((s) => s.id === sid);
  const cycle = st?.paymentCycle || "daily";
  document.getElementById("pay-student-id").value = sid;
  document.getElementById("pay-amount").value = "";
  document.getElementById("pay-date").valueAsDate = new Date();
  document.getElementById("pay-note").value = "";
  const amountLabel = document.getElementById("pay-amount-label");
  const cycleHint = document.getElementById("pay-cycle-hint");
  if (amountLabel) {
    amountLabel.innerHTML = `${
      cycle === "daily"
        ? "Class Payment"
        : cycle === "weekly"
          ? "Weekly Payment"
          : "Monthly Payment"
    } (<span class="currency-label">${prefs.currency}</span>)`;
  }
  if (cycleHint) {
    cycleHint.textContent =
      cycle === "daily"
        ? "Payments are matched against class dues."
        : cycle === "weekly"
          ? "Payments are tracked against weekly billing cycles."
          : "Payments are tracked against monthly billing cycles.";
  }
  toggleModal("payment-modal", true);
}
function savePayment() {
  const sid = parseInt(document.getElementById("pay-student-id").value),
    amount = parseFloat(document.getElementById("pay-amount").value),
    date = document.getElementById("pay-date").value;
  if (!amount || amount <= 0) {
    showToast("⚠️ Enter a valid amount");
    return;
  }
  if (!appData.payments) appData.payments = [];
  appData.payments.push({
    id: Date.now(),
    studentId: sid,
    amount,
    date,
    note: document.getElementById("pay-note").value.trim(),
  });
  const st = appData.students.find((s) => s.id === sid);
  const rate = st?.rate || 0;
  if ((st?.paymentCycle || "daily") === "daily" && rate > 0) {
    let rem = amount;
    appData.sessions
      .filter((s) => s.studentId === sid && s.payment !== "paid")
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach((s) => {
        if (rem >= rate) {
          s.payment = "paid";
          rem -= rate;
        }
      });
  }
  save();
  toggleModal("payment-modal", false);
  showToast("💰 Payment recorded!");
  renderAll();
}

// CONFIRM/DELETE
function confirmAction(type, id = null) {
  const cfg = {
    student: {
      icon: "👤",
      title: "Delete Student?",
      msg: "This will permanently delete this student and all their sessions and payments.",
      btn: "Delete",
      fn: () => deleteStudent(id),
    },
    session: {
      icon: "📅",
      title: "Delete Session?",
      msg: "This will remove this class record permanently.",
      btn: "Delete",
      fn: () => deleteSession(id),
    },
    payment: {
      icon: "💳",
      title: "Delete Payment?",
      msg: "Remove this payment record?",
      btn: "Delete",
      fn: () => deletePayment(id),
    },
    all: {
      icon: "🗑️",
      title: "Wipe All Data?",
      msg: "This is permanent. All students, sessions, and payments will be deleted.",
      btn: "Clear All",
      fn: clearAllData,
    },
  }[type];
  if (!cfg) return;
  document.getElementById("confirm-icon").textContent = cfg.icon;
  document.getElementById("confirm-title").textContent = cfg.title;
  document.getElementById("confirm-msg").textContent = cfg.msg;
  const btn = document.getElementById("confirm-btn");
  btn.textContent = cfg.btn;
  btn.onclick = cfg.fn;
  toggleModal("confirm-modal", true);
}
function deleteStudent(id) {
  appData.sessions = appData.sessions.filter((s) => s.studentId !== id);
  appData.payments = (appData.payments || []).filter((p) => p.studentId !== id);
  appData.students = appData.students.filter((s) => s.id !== id);
  activeStudentId = appData.students[0]?.id || null;
  save();
  toggleModal("confirm-modal", false);
  showToast("🗑️ Student deleted");
  renderAll();
}
function deleteSession(id) {
  appData.sessions = appData.sessions.filter((s) => s.id !== id);
  save();
  toggleModal("confirm-modal", false);
  showToast("🗑️ Session removed");
  renderAll();
}
function deletePayment(id) {
  appData.payments = (appData.payments || []).filter((p) => p.id !== id);
  save();
  toggleModal("confirm-modal", false);
  showToast("🗑️ Payment removed");
  renderAll();
}
function clearAllData() {
  appData = { students: [], sessions: [], payments: [] };
  activeStudentId = null;
  save();
  toggleModal("confirm-modal", false);
  showToast("🗑️ All data cleared");
  renderAll();
  switchView("dashboard");
}

// DASHBOARD
function renderDashboard() {
  const now = new Date(),
    h = now.getHours();
  document.getElementById("dash-greeting").textContent =
    h < 12
      ? "Good morning 🌅"
      : h < 17
        ? "Good afternoon ☀️"
        : "Good evening 🌙";
  document.getElementById("dash-date").textContent = now.toLocaleDateString(
    "en-GB",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );
  const ms = appData.sessions.filter((s) => {
    const d = new Date(s.date);
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });
  document.getElementById("dash-month-classes").textContent = ms.length;
  document.getElementById("dash-total-classes").textContent =
    appData.sessions.length;
  document.getElementById("dash-students").textContent =
    appData.students.length;
  let mi = 0;
  ms.forEach((s) => {
    const st = appData.students.find((x) => x.id === s.studentId);
    if (st) mi += st.rate || 0;
  });
  document.getElementById("dash-month-income").textContent =
    prefs.currency + mi.toLocaleString();
  const qs = document.getElementById("quick-student");
  qs.innerHTML = appData.students.length
    ? appData.students
        .map((s) => `<option value="${s.id}">${s.name}</option>`)
        .join("")
    : '<option value="">Add a student first</option>';
  renderInsights();
  renderMonthlyChart();
  renderCalendar();
  renderRecentSessions();
}
function renderInsights() {
  const el = document.getElementById("insight-row"),
    now = new Date(),
    ins = [];
  if (!appData.students.length) {
    el.innerHTML = "";
    return;
  }
  const ms = appData.sessions.filter((s) => {
    const d = new Date(s.date);
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });
  if (ms.length) {
    const c = {};
    ms.forEach((s) => (c[s.studentId] = (c[s.studentId] || 0) + 1));
    const tid = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
    const tn = appData.students.find((x) => x.id == tid)?.name;
    if (tn)
      ins.push(
        `<div class="insight-chip">⭐ Most active: <strong>${tn}</strong></div>`,
      );
  }
  let owed = 0;
  appData.students.forEach((s) => {
    owed += getStudentPaymentSummary(s).owed;
  });
  if (owed > 0)
    ins.push(
      `<div class="insight-chip">⏳ Pending: <strong>${prefs.currency}${owed.toLocaleString()}</strong></div>`,
    );
  const ws = new Date(now);
  ws.setDate(now.getDate() - now.getDay());
  const wc = appData.sessions.filter((s) => new Date(s.date) >= ws).length;
  ins.push(
    `<div class="insight-chip">📅 This week: <strong>${wc} class${wc !== 1 ? "es" : ""}</strong></div>`,
  );
  if (appData.students.length && ms.length)
    ins.push(
      `<div class="insight-chip">📊 Avg/student: <strong>${(ms.length / appData.students.length).toFixed(1)}/mo</strong></div>`,
    );
  el.innerHTML = ins.join("");
}
function renderRecentSessions() {
  const el = document.getElementById("recent-sessions");
  const r = appData.sessions
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  if (!r.length) {
    el.innerHTML =
      '<p style="color:var(--text3);font-size:.85rem;text-align:center;padding:8px">No sessions yet.</p>';
    return;
  }
  el.innerHTML = r
    .map((s) => {
      const st = appData.students.find((x) => x.id === s.studentId);
      const cycle = st?.paymentCycle || "daily";
      const badgeClass =
        cycle === "daily"
          ? s.payment === "paid"
            ? "badge-green"
            : "badge-yellow"
          : "badge-gray";
      const badgeText =
        cycle === "daily"
          ? s.payment === "paid"
            ? "Paid"
            : "Unpaid"
          : `${cycle} billed`;
      return `<div class="session-item"><div><div class="session-date">${st?.name || "Unknown"}</div><div class="session-meta">${s.date} · ${s.duration || 60}min${s.subject ? " · " + s.subject : ""}</div></div><span class="badge ${badgeClass}">${badgeText}</span></div>`;
    })
    .join("");
}

// CHARTS
function renderMonthlyChart() {
  const canvas = document.getElementById("monthly-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d"),
    now = new Date(),
    labels = [],
    counts = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(d.toLocaleDateString("en", { month: "short" }));
    counts.push(
      appData.sessions.filter((s) => {
        const dd = new Date(s.date);
        return (
          dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear()
        );
      }).length,
    );
  }
  drawBarChart(ctx, canvas, labels, counts, "var(--primary)");
}
function renderStudentBarChart(sid) {
  const canvas = document.getElementById("student-bar-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d"),
    now = new Date(),
    labels = [],
    counts = [];
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(now);
    ws.setDate(now.getDate() - i * 7 - now.getDay());
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    labels.push("W" + (8 - i));
    counts.push(
      appData.sessions.filter(
        (s) =>
          s.studentId === sid &&
          new Date(s.date) >= ws &&
          new Date(s.date) <= we,
      ).length,
    );
  }
  const st = appData.students.find((x) => x.id === sid);
  drawBarChart(ctx, canvas, labels, counts, st?.color || "var(--primary)");
}
function drawBarChart(ctx, canvas, labels, data, color) {
  const dpr = window.devicePixelRatio || 1,
    W = canvas.offsetWidth,
    H = canvas.offsetHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const dk = document.documentElement.getAttribute("data-theme") === "dark";
  const tc = dk ? "#9b9db8" : "#4b4d6b",
    gc = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  ctx.clearRect(0, 0, W, H);
  const p = { t: 10, r: 10, b: 24, l: 28 },
    cW = W - p.l - p.r,
    cH = H - p.t - p.b,
    max = Math.max(...data, 1),
    n = data.length,
    bW = (cW / n) * 0.6,
    gap = cW / n;
  for (let i = 0; i <= 4; i++) {
    const y = p.t + cH * (1 - i / 4);
    ctx.beginPath();
    ctx.moveTo(p.l, y);
    ctx.lineTo(p.l + cW, y);
    ctx.strokeStyle = gc;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = tc;
    ctx.font = "10px DM Sans";
    ctx.textAlign = "right";
    ctx.fillText(Math.round((max * i) / 4), p.l - 4, y + 4);
  }
  data.forEach((v, i) => {
    const x = p.l + i * gap + (gap - bW) / 2,
      bh = cH * (v / max),
      y = p.t + cH - bh;
    const grad = ctx.createLinearGradient(0, y, 0, y + bh);
    const c = color.startsWith("var")
      ? getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim() || "#5b5ef4"
      : color;
    grad.addColorStop(0, c);
    grad.addColorStop(1, c + "55");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, bW, bh, Math.min(5, bW / 2));
    ctx.fill();
    if (v > 0) {
      ctx.fillStyle = tc;
      ctx.font = "bold 10px DM Sans";
      ctx.textAlign = "center";
      ctx.fillText(v, x + bW / 2, y - 3);
    }
    ctx.fillStyle = tc;
    ctx.font = "10px DM Sans";
    ctx.textAlign = "center";
    ctx.fillText(labels[i], x + bW / 2, H - p.b + 14);
  });
}

// CALENDAR
function calNav(d) {
  calViewDate.setMonth(calViewDate.getMonth() + d);
  renderCalendar();
}
function renderCalendar() {
  const y = calViewDate.getFullYear(),
    m = calViewDate.getMonth();
  document.getElementById("cal-label").textContent =
    calViewDate.toLocaleDateString("en", {
      month: "long",
      year: "numeric",
    });
  document.getElementById("cal-day-names").innerHTML = [
    "Su",
    "Mo",
    "Tu",
    "We",
    "Th",
    "Fr",
    "Sa",
  ]
    .map((d) => `<div class="cal-day-name">${d}</div>`)
    .join("");
  const first = new Date(y, m, 1).getDay(),
    dim = new Date(y, m + 1, 0).getDate(),
    today = new Date().toISOString().split("T")[0];
  const sm = {};
  appData.sessions.forEach((s) => {
    sm[s.date] = (sm[s.date] || 0) + 1;
  });
  let html = "";
  for (let i = 0; i < first; i++) {
    const pd = new Date(y, m, 0 - first + i + 1);
    html += `<div class="cal-day other-month">${pd.getDate()}</div>`;
  }
  for (let d = 1; d <= dim; d++) {
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      cnt = sm[ds] || 0;
    const cls = [
      "cal-day",
      cnt > 0 ? "has-session" : "",
      cnt >= 2 ? "session-count-2" : "",
      cnt >= 3 ? "session-count-3" : "",
      ds === today ? "today" : "",
    ]
      .filter(Boolean)
      .join(" ");
    html += `<div class="${cls}">${d}${cnt > 0 ? '<div style="width:4px;height:4px;border-radius:50%;background:var(--primary)"></div>' : ""}</div>`;
  }
  document.getElementById("mini-calendar").innerHTML = html;
}

// ANALYTICS
function switchAnalyticsTab(tab) {
  analyticsTab = tab;
  document
    .querySelectorAll("#analytics-tabs .page-tab")
    .forEach((el, i) =>
      el.classList.toggle(
        "active",
        ["overview", "students", "income"][i] === tab,
      ),
    );
  renderAnalytics();
}
function renderAnalytics() {
  const el = document.getElementById("analytics-content");
  if (analyticsTab === "overview") el.innerHTML = renderOverviewAnalytics();
  else if (analyticsTab === "students") el.innerHTML = renderStudentAnalytics();
  else el.innerHTML = renderIncomeAnalytics();
}
function renderOverviewAnalytics() {
  const now = new Date(),
    months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString("en", {
        month: "short",
        year: "2-digit",
      }),
      count: appData.sessions.filter((s) => {
        const dd = new Date(s.date);
        return (
          dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear()
        );
      }).length,
    });
  }
  const max = Math.max(...months.map((m) => m.count), 1);
  const bars = months
    .map(
      (m) =>
        `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="font-size:.75rem;font-weight:700;color:var(--text2)">${m.count || ""}</div><div style="width:100%;border-radius:6px 6px 0 0;background:var(--primary);opacity:${0.3 + 0.7 * (m.count / max)};min-height:4px;height:${Math.max(4, 100 * (m.count / max))}px"></div><div style="font-size:.68rem;color:var(--text3)">${m.label}</div></div>`,
    )
    .join("");
  const sm = {};
  appData.sessions.forEach((s) => {
    if (s.subject) sm[s.subject] = (sm[s.subject] || 0) + 1;
  });
  const ts = Object.entries(sm)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const wd = Array(7).fill(0);
  appData.sessions.forEach((s) => {
    wd[new Date(s.date).getDay()]++;
  });
  const mw = Math.max(...wd, 1);
  return `<div class="card"><div class="card-title"><span>📊</span> Sessions by Month</div><div style="display:flex;align-items:flex-end;gap:6px;height:120px;padding:8px 0">${bars}</div></div>
    <div class="card"><div class="card-title"><span>📅</span> Activity by Day of Week</div><div style="display:flex;align-items:flex-end;gap:6px;height:100px;padding:8px 0">${wd.map((v, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;border-radius:5px 5px 0 0;background:var(--accent);min-height:4px;height:${Math.max(4, 80 * (v / mw))}px"></div><div style="font-size:.68rem;color:var(--text3)">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][i]}</div></div>`).join("")}</div></div>
    ${ts.length ? `<div class="card"><div class="card-title"><span>📚</span> Top Subjects</div>${ts.map(([s, c], i) => `<div style="margin-bottom:10px"><div class="flex-between" style="margin-bottom:4px"><span style="font-size:.88rem;font-weight:500">${s}</span><span style="font-size:.8rem;color:var(--text3)">${c} sessions</span></div><div class="progress-bar"><div class="progress-fill" style="width:${100 * (c / ts[0][1])}%;background:${COLORS[i % COLORS.length]}"></div></div></div>`).join("")}</div>` : ""}`;
}
function renderStudentAnalytics() {
  if (!appData.students.length)
    return '<div class="empty-state"><div class="empty-icon">👥</div><p>Add students first</p></div>';
  const now = new Date(),
    rows = appData.students
      .map((s) => {
        const ss = appData.sessions.filter((x) => x.studentId === s.id);
        const ms = ss.filter((x) => {
          const d = new Date(x.date);
          return (
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear()
          );
        });
        const pay = getStudentPaymentSummary(s);
        return {
          s,
          total: ss.length,
          month: ms.length,
          target: Math.max(0, parseInt(s.monthlyRequiredClasses) || 0),
          owed: pay.owed,
          cycle: s.paymentCycle || "daily",
        };
      })
      .sort((a, b) => b.total - a.total);
  const mt = Math.max(...rows.map((r) => r.total), 1);
  return `<div class="card"><div class="card-title"><span>👥</span> Student Comparison</div>${rows.map((r) => `<div style="margin-bottom:14px"><div class="flex-between" style="margin-bottom:5px"><div class="flex-gap"><div class="color-dot" style="background:${r.s.color || "var(--primary)"}"></div><span style="font-weight:600">${r.s.name}</span>${r.s.grade ? '<span class="badge badge-gray">' + r.s.grade + "</span>" : ""}</div><div class="flex-gap"><span class="badge badge-blue">${r.month}/${r.target} classes</span><span class="badge badge-gray">${r.cycle}</span>${r.owed > 0 ? '<span class="badge badge-red">' + prefs.currency + r.owed.toLocaleString() + "</span>" : '<span class="badge badge-green">Paid</span>'}</div></div><div style="font-size:.78rem;color:var(--text3);margin-bottom:4px">${r.total} total sessions</div><div class="progress-bar"><div class="progress-fill" style="width:${100 * (r.total / mt)}%;background:${r.s.color || "var(--primary)"}"></div></div></div>`).join("")}</div>`;
}
function renderIncomeAnalytics() {
  const now = new Date();
  let te = 0,
    to = 0;
  appData.students.forEach((s) => {
    const pay = getStudentPaymentSummary(s);
    te += pay.totalBilled;
    to += pay.owed;
  });
  const mr = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    let inc = 0;
    appData.sessions
      .filter((s) => {
        const dd = new Date(s.date);
        return (
          dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear()
        );
      })
      .forEach((s) => {
        const st = appData.students.find((x) => x.id === s.studentId);
        if (st) inc += st.rate || 0;
      });
    mr.push({
      label: d.toLocaleDateString("en", { month: "short" }),
      income: inc,
    });
  }
  const mi = Math.max(...mr.map((m) => m.income), 1);
  return `<div class="stats-grid"><div class="stat-card green"><div class="stat-value small">${prefs.currency}${te.toLocaleString()}</div><div class="stat-label">Total Earned</div></div><div class="stat-card red"><div class="stat-value small">${prefs.currency}${to.toLocaleString()}</div><div class="stat-label">Still Owed</div></div></div>
    <div class="card"><div class="card-title"><span>💰</span> Monthly Income</div><div style="display:flex;align-items:flex-end;gap:8px;height:120px;padding:8px 0">${mr.map((m) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="font-size:.7rem;font-weight:700;color:var(--success)">${m.income > 0 ? prefs.currency + m.income : ""}</div><div style="width:100%;border-radius:6px 6px 0 0;background:var(--success);min-height:4px;opacity:.85;height:${Math.max(4, 100 * (m.income / mi))}px"></div><div style="font-size:.68rem;color:var(--text3)">${m.label}</div></div>`).join("")}</div></div>
    <div class="card"><div class="card-title"><span>👤</span> Income by Student</div>${
      appData.students
        .map((s) => {
          const e =
            appData.sessions.filter((x) => x.studentId === s.id).length *
            (s.rate || 0);
          return e > 0
            ? `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><div class="flex-gap"><div class="color-dot" style="background:${s.color || "var(--primary)"}"></div><span style="font-weight:500">${s.name}</span></div><div class="flex-gap"><span style="font-weight:700;color:var(--success)">${prefs.currency}${e.toLocaleString()}</span><span class="badge badge-gray">${prefs.currency}${s.rate || 0}/class</span></div></div>`
            : "";
        })
        .join("") ||
      '<p style="color:var(--text3);font-size:.85rem">Set rates on students to track income.</p>'
    }</div>
    <div class="card"><div class="card-title"><span>📋</span> Payment History</div>${
      (appData.payments || []).length
        ? (appData.payments || [])
            .slice()
            .reverse()
            .map((p) => {
              const st = appData.students.find((x) => x.id === p.studentId);
              return `<div class="payment-item"><div><div style="font-weight:600">${st?.name || ""} — ${prefs.currency}${p.amount.toLocaleString()}</div><div style="font-size:.78rem;color:var(--text3)">${p.date}${p.note ? " · " + p.note : ""}</div></div><span class="badge badge-green">Received</span></div>`;
            })
            .join("")
        : '<p style="color:var(--text3);font-size:.85rem">No payments recorded yet.</p>'
    }</div>`;
}

// UTILITIES
function renderAll() {
  if (window.appData) appData = window.appData;
  if (window.prefs) prefs = window.prefs;
  normalizeStudentSettings(false);
  renderDashboard();
  if (currentView === "students") {
    renderStudentTabs();
    if (activeStudentId) renderStudentDetail();
  }
  if (currentView === "analytics") renderAnalytics();
}
function toggleModal(id, show) {
  document.getElementById(id).classList.toggle("hidden", !show);
}
function showToast(msg) {
  const w = document.getElementById("toast-wrap"),
    el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  w.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
function exportData() {
  const d = {
    exportDate: new Date().toISOString(),
    version: "3.0",
    ...appData,
  };
  const a = document.createElement("a");
  a.href =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(d, null, 2));
  a.download = `tuition_backup_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.json`;
  a.click();
  showToast("📥 Data exported!");
}
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (e) => {
    try {
      const imp = JSON.parse(e.target.result);
      if (!imp.students) {
        showToast("❌ Invalid backup file");
        return;
      }
      appData = {
        students: imp.students || [],
        sessions: imp.sessions || [],
        payments: imp.payments || [],
      };
      window.appData = appData;
      save();
      renderAll();
      showToast("✅ Data imported!");
    } catch {
      showToast("❌ Failed to parse file");
    }
  };
  r.readAsText(file);
}
