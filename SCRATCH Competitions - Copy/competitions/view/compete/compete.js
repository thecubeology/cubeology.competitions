/* compete.js (FINAL — typing formatting fixed)
   ✅ Competition + events list comes from Google Sheet CSV
   ✅ Event config + scrambles come from Firestore: events/{event_id}
   ✅ Participant saves go to: events/{event_id}/participants/{pid}
   ✅ URL: /competitions/view/compete/?id=rco26

   FIXES IN THIS VERSION:
   - Typing input is TRUE digits-only (no "." ":" typing)
   - Live formatting while typing:
       972   -> 9.72
       1234  -> 12.34
       12345 -> 1:23.45
       10000 -> 1:00.00
   - No “0.0 + typed text” issue anymore (we keep a raw digit buffer)
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   0) CONFIG
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyB-YtP0KRSpDxcm1yn0SIkZNvTzMbEpDyI",
  authDomain: "onlinecompetitionportal.firebaseapp.com",
  projectId: "onlinecompetitionportal",
  storageBucket: "onlinecompetitionportal.firebasestorage.app",
  messagingSenderId: "457034587324",
  appId: "1:457034587324:web:cbff90e1eee993e111c4b9"
};

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9qCCGUoHYG6RZL6MlLkOAWw60yYIomChaU-Yxz5j9xHBeqfNcuY_uBxntgbAw-HUMY-Z7sGK7_gnR/pub?gid=985077061&single=true&output=csv";

const EMAIL_DOMAIN = "@ff.local";
const LS_PID_PREFIX = "cubeology_pid_";

/* =========================
   1) URL → comp key
========================= */
const compKey = normalizeKey(new URLSearchParams(location.search).get("id") || "");

/* =========================
   2) Firebase init
========================= */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* =========================
   3) ELEMENTS
========================= */
const compName = document.getElementById("compName");
const msg = document.getElementById("msg");

const homeBox = document.getElementById("homeBox");
const eventsWrap = document.getElementById("eventsWrap");

const loginBox = document.getElementById("loginBox");
const playBox = document.getElementById("playBox");
const doneBox = document.getElementById("doneBox");
const videoBox = document.getElementById("videoBox");

const loginEventTitle = document.getElementById("loginEventTitle");
const loginEventTime = document.getElementById("loginEventTime");

const eventTitle = document.getElementById("eventTitle");
const eventTime = document.getElementById("eventTime");
const phasePill = document.getElementById("phasePill");

const scrNo = document.getElementById("scrNo");
const scrTotal = document.getElementById("scrTotal");
const scrText = document.getElementById("scrText");
const scrImg = document.getElementById("scrImg");

const solveDots = document.getElementById("solveDots");
const solveLabel = document.getElementById("solveLabel");

const videoOpensText = document.getElementById("videoOpensText");
const videoWindowText = document.getElementById("videoWindowText");

const timeErr = document.getElementById("timeErr");
const saveToast = document.getElementById("saveToast");

// mode buttons
const btnModeTimer = document.getElementById("btnModeTimer");
const btnModeTyping = document.getElementById("btnModeTyping");
const modeHint = document.getElementById("modeHint");

// timer ui
const timerWrap = document.getElementById("timerWrap");
const timerDisplay = document.getElementById("timerDisplay");
const timerInfo = document.getElementById("timerInfo");
const penaltySummary = document.getElementById("penaltySummary");

// penalty buttons
const btnOK = document.getElementById("btnOK");
const btnPlus2 = document.getElementById("btnPlus2");
const btnDNFTimer = document.getElementById("btnDNFTimer");

// time input
const typingWrap = document.getElementById("typingWrap");
const timeValue = document.getElementById("timeValue");
const btnDNF = document.getElementById("btnDNF");

// DONE UI
const ao5Wrap = document.getElementById("ao5Wrap");
const ao5Value = document.getElementById("ao5Value");
const solveList = document.getElementById("solveList");

// modal
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalOk = document.getElementById("modalOk");

// loading overlay
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingTitle = document.getElementById("loadingTitle");
const loadingSub = document.getElementById("loadingSub");

/* =========================
   4) STATE
========================= */
let COMP_ROWS = [];
let COMP_EVENTS = [];

let ACTIVE_EVENT_ID = "";
let ACTIVE_EVENT_NAME = "";
let ACTIVE_EVENT_TIME_LABEL = "";

let cfg = null;
let isBusy = false;

const LS_PID_KEY = LS_PID_PREFIX + (compKey || "unknown");
let PID = (localStorage.getItem(LS_PID_KEY) || "").trim().toLowerCase();

/* =========================
   5) HELPERS
========================= */
function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_-]/g, "");
}
function isMobile() {
  return window.matchMedia && window.matchMedia("(pointer:coarse)").matches;
}
function setMsg(t) {
  msg.textContent = t;
}
function showTimeError(text) {
  timeErr.textContent = text;
  timeErr.style.display = "block";
}
function clearTimeError() {
  timeErr.textContent = "";
  timeErr.style.display = "none";
}
function pidToEmail(pid) {
  return `${pid}${EMAIL_DOMAIN}`;
}

function showModal(title, body) {
  modalTitle.textContent = title;
  modalBody.textContent = body;
  modal.style.display = "block";
}
modalOk.onclick = () => (modal.style.display = "none");

function showLoading(title = "Loading…", sub = "Please wait…") {
  loadingTitle.textContent = title;
  loadingSub.textContent = sub;
  loadingOverlay.style.display = "block";
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}
function hideLoading() {
  loadingOverlay.style.display = "none";
}

function lockUI(locked) {
  isBusy = locked;

  ["btnLogin", "btnNext", "btnVideo", "btnHomeFromLogin", "btnHomeFromDone", "btnHomeFromVideo", "btnGoToVideo", "btnDNF"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = locked;
      el.style.opacity = locked ? 0.75 : 1;
    }
  );

  [btnModeTimer, btnModeTyping, btnOK, btnPlus2, btnDNFTimer].forEach((el) => {
    if (!el) return;
    el.disabled = locked || el.disabled;
    el.style.opacity = el.disabled ? 0.65 : 1;
  });
}

function show(view) {
  homeBox.style.display = "none";
  loginBox.style.display = "none";
  playBox.style.display = "none";
  doneBox.style.display = "none";
  videoBox.style.display = "none";

  if (view === "HOME") homeBox.style.display = "block";
  if (view === "LOGIN") loginBox.style.display = "block";
  if (view === "PLAY") playBox.style.display = "block";
  if (view === "DONE") doneBox.style.display = "block";
  if (view === "VIDEO") videoBox.style.display = "block";
}

function showScrambleImage(url) {
  if (!url) {
    scrImg.style.display = "none";
    scrImg.removeAttribute("src");
    return;
  }
  scrImg.style.display = "none";
  scrImg.onload = () => (scrImg.style.display = "block");
  scrImg.onerror = () => (scrImg.style.display = "none");
  scrImg.src = url;
}

function formatDateTimeIST(ms) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

/* =========================
   6) CSV PARSER
========================= */
function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => String(s ?? "").trim());
}

function parseCSV(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (!lines.length) return [];

  const header = parseCSVLine(lines[0]).map((h) => normalizeKey(h));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => (row[h] = (cols[idx] ?? "").trim()));
    rows.push(row);
  }
  return rows;
}

/* =========================
   7) TIME FORMATTING + AO5
========================= */
function normalizeTimeInputStrict(raw) {
  if (!raw) return { ok: false, msg: "Enter a time first." };
  const s = String(raw).trim();
  if (!s) return { ok: false, msg: "Enter a time first." };
  if (/^dnf$/i.test(s)) return { ok: true, value: "DNF" };

  const t = s.replace(/\s+/g, "").replace(/,/g, ".");
  const m1 = t.match(/^(\d+):(\d{1,2})\.(\d{2,3})$/);
  if (m1) {
    const mm = parseInt(m1[1], 10);
    const ss = parseInt(m1[2], 10);
    const dec = m1[3];
    if (Number.isNaN(mm) || mm < 0) return { ok: false, msg: "Minutes must be valid digits." };
    if (Number.isNaN(ss) || ss < 0 || ss > 59) return { ok: false, msg: "Seconds must be between 0 and 59." };
    return { ok: true, value: `${mm}:${String(ss).padStart(2, "0")}.${dec}` };
  }
  const m2 = t.match(/^(\d+)\.(\d{2,3})$/);
  if (m2) {
    const ss = parseInt(m2[1], 10);
    const dec = m2[2];
    if (Number.isNaN(ss) || ss < 0) return { ok: false, msg: "Seconds must be valid digits." };
    return { ok: true, value: `${ss}.${dec}` };
  }
  return { ok: false, msg: "Invalid format. Use ss.xx / m:ss.xx / DNF." };
}

function msToTimeString(ms) {
  const totalMs = Math.max(0, Math.round(ms));
  const totalSec = Math.floor(totalMs / 1000);
  const milli = totalMs % 1000;

  let cs = Math.round(milli / 10);
  let carry = 0;
  if (cs === 100) {
    cs = 0;
    carry = 1;
  }

  const sec = totalSec + carry;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  const csStr = String(cs).padStart(2, "0");

  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, "0")}.${csStr}`;
  return `${seconds}.${csStr}`;
}

function timeStringToMs(t) {
  if (!t) return null;
  const s = String(t).trim();
  if (!s) return null;
  if (/^dnf$/i.test(s)) return Infinity;

  let mm = 0,
    ss = 0,
    dec = "";
  if (s.includes(":")) {
    const [mPart, rest] = s.split(":");
    const [sPart, dPart] = rest.split(".");
    mm = parseInt(mPart, 10);
    ss = parseInt(sPart, 10);
    dec = dPart || "";
  } else {
    const [sPart, dPart] = s.split(".");
    ss = parseInt(sPart, 10);
    dec = dPart || "";
  }

  if (Number.isNaN(mm) || Number.isNaN(ss)) return null;
  const decMs =
    dec.length === 2
      ? parseInt(dec, 10) * 10
      : parseInt(String(dec).padEnd(3, "0").slice(0, 3), 10);
  if (Number.isNaN(decMs)) return null;

  return (mm * 60 + ss) * 1000 + decMs;
}

function computeAo5(timesStrArr) {
  const msArr = timesStrArr.map(timeStringToMs);
  if (msArr.some((v) => v === null)) return { ok: false, value: "—" };

  const dnfCount = msArr.filter((v) => v === Infinity).length;
  if (dnfCount >= 2) return { ok: true, value: "DNF" };

  const sorted = [...msArr].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, 4);
  if (trimmed.some((v) => v === Infinity)) return { ok: true, value: "DNF" };

  const avg = (trimmed[0] + trimmed[1] + trimmed[2]) / 3;
  return { ok: true, value: msToTimeString(avg) };
}

/* =========================
   8) MODE + INSPECTION + TIMER
========================= */
const MODE = { NONE: "NONE", TIMER: "TIMER", TYPING: "TYPING" };
let activeMode = MODE.NONE;

let modeLocked = false;

// solve timer
let timerRunning = false;
let timerCaptured = false;
let baseMs = 0;
let timerStartPerf = 0;
let rafId = null;

// inspection
let inspecting = false;
let inspectionStartPerf = 0;
let inspectionRAF = null;
let holding = false;
let holdArmed = false;

// penalties
const PEN = { OK: "OK", PLUS2: "PLUS2", DNF: "DNF" };

// locked by inspection once solve starts
let inspectionPenalty = PEN.OK;
// chosen after solve
let postPenalty = PEN.OK;

// typing inspection UI
let typingInspectionBox = null;
let typingInspectionRunning = false;
let typingInspectionStartPerf = 0;
let typingInspectionRAF = null;

/* =========================
   9) Typing formatter (AUTO digits + MANUAL with ':' '.')
   Goal:
   - Digits-only fast mode: 1234 => 12.34, 12345 => 1:23.45
   - Manual mode: user can type 1:23.45 or 12.34 normally
   - IMPORTANT FIX:
     If user starts in AUTO then presses ':' or '.',
     we convert the digit buffer into normal literal text
     (so no "0.01:" or "0.0" prefix happens).
========================= */

let typingDigits = "";       // only used in AUTO
let typingManual = false;    // true when user enters ':' or '.'

function formatDigitsToTime(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return "";

  // last 2 digits = centiseconds
  const cs = d.slice(-2).padStart(2, "0");
  const left = d.slice(0, -2);

  // 1-4 digits => seconds.xx
  if (d.length <= 4) {
    const sec = parseInt(left || "0", 10);
    if (Number.isNaN(sec)) return "";
    return `${sec}.${cs}`;
  }

  // 5+ digits => mm:ss.xx  (last 2 of left = ss)
  const mmPart = left.slice(0, -2) || "0";
  const ssPart = left.slice(-2) || "00";

  let mm = parseInt(mmPart, 10);
  let ss = parseInt(ssPart, 10);
  if (Number.isNaN(mm) || Number.isNaN(ss)) return "";

  // if ss > 59 treat LEFT as total seconds and convert to m:ss
  if (ss > 59) {
    const totalSec = parseInt(left, 10);
    if (Number.isNaN(totalSec)) return "";
    mm = Math.floor(totalSec / 60);
    ss = totalSec % 60;
  }

  return `${mm}:${String(ss).padStart(2, "0")}.${cs}`;
}

function setTypingValueFromDigits() {
  const formatted = formatDigitsToTime(typingDigits);
  timeValue.value = formatted;
  try { timeValue.setSelectionRange(timeValue.value.length, timeValue.value.length); } catch {}
}

function resetTypingBuffer() {
  typingDigits = "";
  typingManual = false;
  timeValue.value = "";
}

// convert AUTO buffer to "literal" (no auto formatting)
// Example: digits "1" -> "1" (not "0.01")
function digitsToLiteral(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  return d; // literal number string
}

function sanitizeManual(v) {
  return String(v || "").replace(/[^\d\.\:]/g, "");
}

function enableTypingInputGuards() {
  timeValue.setAttribute("inputmode", "decimal"); // allow decimal keypad
  timeValue.setAttribute("autocomplete", "off");
  timeValue.setAttribute("autocorrect", "off");
  timeValue.setAttribute("spellcheck", "false");

  // IMPORTANT: whenever typing mode opens, keep it empty and clean
  timeValue.addEventListener("focus", () => {
    if (activeMode !== MODE.TYPING) return;
    if (!timeValue.value.trim()) resetTypingBuffer();
  });

  timeValue.addEventListener("keydown", (e) => {
    if (activeMode !== MODE.TYPING) return;
    if (timeValue.readOnly) return;

    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) return; // allow shortcuts

    const navKeys = [
      "ArrowLeft","ArrowRight","ArrowUp","ArrowDown",
      "Home","End","Tab","Enter"
    ];
    if (navKeys.includes(e.key)) return;

    // Backspace / Delete
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();

      if (!typingManual) {
        // AUTO: remove last digit from buffer
        typingDigits = typingDigits.slice(0, -1);
        setTypingValueFromDigits();
      } else {
        // MANUAL: simple end-delete (fast cubing use)
        const s = timeValue.value || "";
        timeValue.value = s.slice(0, -1);

        // if user removed ':' and '.', revert to AUTO using remaining digits
        const now = timeValue.value;
        if (/^\d*$/.test(now)) {
          typingManual = false;
          typingDigits = now;
          setTypingValueFromDigits();
        }
      }
      return;
    }

    // allow typing ":" or "." manually
    if (e.key === ":" || e.key === ".") {
      e.preventDefault();

      // if still AUTO, convert buffer to literal then append char
      if (!typingManual) {
        const literal = digitsToLiteral(typingDigits);
        typingManual = true;

        // if no digits typed yet:
        if (!literal) {
          // allow "0." if user starts with dot, and disallow ":" without minutes
          if (e.key === ".") {
            timeValue.value = "0.";
          }
          return;
        }

        timeValue.value = literal + e.key;
        try { timeValue.setSelectionRange(timeValue.value.length, timeValue.value.length); } catch {}
        return;
      }

      // already manual: just append if not duplicated
      const cur = timeValue.value || "";
      if (e.key === ":" && cur.includes(":")) return;
      if (e.key === "." && cur.includes(".")) return;

      timeValue.value = cur + e.key;
      try { timeValue.setSelectionRange(timeValue.value.length, timeValue.value.length); } catch {}
      return;
    }

    // digits
    if (/^\d$/.test(e.key)) {
      e.preventDefault();

      if (!typingManual) {
        // AUTO mode: digit buffer
        typingDigits += e.key;
        setTypingValueFromDigits();
      } else {
        // MANUAL mode: append digit normally
        timeValue.value = (timeValue.value || "") + e.key;
        try { timeValue.setSelectionRange(timeValue.value.length, timeValue.value.length); } catch {}
      }
      return;
    }

    // block everything else
    e.preventDefault();
  });

  // Paste handling
  timeValue.addEventListener("paste", (e) => {
    if (activeMode !== MODE.TYPING) return;
    if (timeValue.readOnly) return;

    e.preventDefault();
    const txt = (e.clipboardData || window.clipboardData).getData("text") || "";
    const cleaned = sanitizeManual(txt).trim();
    if (!cleaned) return;

    // if paste contains ":" or ".", go MANUAL
    if (cleaned.includes(":") || cleaned.includes(".")) {
      typingManual = true;
      typingDigits = "";
      timeValue.value = cleaned;
      try { timeValue.setSelectionRange(timeValue.value.length, timeValue.value.length); } catch {}
      return;
    }

    // digits only => AUTO
    typingManual = false;
    typingDigits += cleaned.replace(/\D/g, "");
    setTypingValueFromDigits();
  });

  // Mobile/IME fallback
  timeValue.addEventListener("input", () => {
    if (activeMode !== MODE.TYPING) return;
    if (timeValue.readOnly) return;

    const v = sanitizeManual(timeValue.value);

    if (v.includes(":") || v.includes(".")) {
      typingManual = true;
      typingDigits = "";
      timeValue.value = v;
      return;
    }

    // digits only => AUTO
    typingManual = false;
    typingDigits = v.replace(/\D/g, "");
    setTypingValueFromDigits();
  });
}
/* =========================
   10) Inspection (same as before)
========================= */
function inspectionElapsedSec() {
  return (performance.now() - inspectionStartPerf) / 1000;
}
function penaltyFromInspection(elapsedSec) {
  if (elapsedSec > 17) return PEN.DNF;
  if (elapsedSec > 15) return PEN.PLUS2;
  return PEN.OK;
}

function renderInspectionDisplay() {
  if (!inspecting) return;

  const el = inspectionElapsedSec();
  const pen = penaltyFromInspection(el);

  timerDisplay.style.color = holdArmed ? "#16a34a" : "#b91c1c";

  if (pen === PEN.OK) {
    const left = Math.max(0, 15 - el);
    timerDisplay.textContent = String(Math.ceil(left));
  } else if (pen === PEN.PLUS2) {
    timerDisplay.textContent = "+2";
  } else {
    timerDisplay.textContent = "DNF";
  }

  inspectionRAF = requestAnimationFrame(renderInspectionDisplay);
}

function stopInspectionRAF() {
  if (inspectionRAF) cancelAnimationFrame(inspectionRAF);
  inspectionRAF = null;
}

function startInspectionUI() {
  if (inspecting || timerRunning || timerCaptured) return;
  if (isBusy) return;

  modeLocked = true;
  applyModeUI();

  inspecting = true;
  inspectionStartPerf = performance.now();
  holding = false;
  holdArmed = false;

  timerDisplay.textContent = "15";
  timerDisplay.style.color = "#b91c1c";

  stopInspectionRAF();
  inspectionRAF = requestAnimationFrame(renderInspectionDisplay);

  saveToast.style.display = "block";
  saveToast.style.background = "#fff7ed";
  saveToast.style.borderColor = "#fed7aa";
  saveToast.style.color = "#9a3412";
  saveToast.textContent = isMobile()
    ? "Inspection started. Tap again to start solve."
    : "Inspection started. Hold SPACE until green, release to start.";
}

function armHoldGreen() {
  holdArmed = true;
  timerDisplay.style.color = "#16a34a";

  saveToast.style.display = "block";
  saveToast.style.background = "#f0fdf4";
  saveToast.style.borderColor = "#bbf7d0";
  saveToast.style.color = "#14532d";
  saveToast.textContent = "Ready ✅ Release SPACE to start.";
}

function timerTick() {
  if (!timerRunning) return;
  const elapsed = performance.now() - timerStartPerf;
  timerDisplay.style.color = "var(--ink)";
  timerDisplay.textContent = msToTimeString(elapsed);
  rafId = requestAnimationFrame(timerTick);
}

function timerStartSolveNow() {
  const el = inspectionElapsedSec();
  inspectionPenalty = penaltyFromInspection(el);

  inspecting = false;
  stopInspectionRAF();

  timerRunning = true;
  timerStartPerf = performance.now();

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(timerTick);

  saveToast.style.display = "block";
  saveToast.style.background = "#eff6ff";
  saveToast.style.borderColor = "#bfdbfe";
  saveToast.style.color = "#1d4ed8";
  saveToast.textContent =
    inspectionPenalty === PEN.PLUS2
      ? "Solve running (Inspection: +2 locked)"
      : inspectionPenalty === PEN.DNF
      ? "Solve running (Inspection: DNF locked)"
      : "Solve running";
}

function timerStopSolve() {
  if (!timerRunning) return;

  timerRunning = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;

  baseMs = performance.now() - timerStartPerf;
  timerDisplay.style.color = "var(--ink)";
  timerDisplay.textContent = msToTimeString(baseMs);

  timerCaptured = true;
  postPenalty = PEN.OK;

  setFinalTimeFromTimer();

  timeValue.readOnly = true;
  timeValue.style.background = "var(--bgSoft)";
  timeValue.style.borderColor = "var(--border)";

  saveToast.style.display = "block";
  saveToast.style.background = "#eff6ff";
  saveToast.style.borderColor = "#bfdbfe";
  saveToast.style.color = "#1d4ed8";
  saveToast.textContent = "Time captured ✓ Choose penalty (OK / +2 / DNF).";

  applyModeUI();
}

function setFinalTimeFromTimer() {
  if (inspectionPenalty === PEN.DNF || postPenalty === PEN.DNF) {
    timeValue.value = "DNF";
    return;
  }
  const inspMs = inspectionPenalty === PEN.PLUS2 ? 2000 : 0;
  const postMs = postPenalty === PEN.PLUS2 ? 2000 : 0;
  const finalMs = baseMs + inspMs + postMs;
  timeValue.value = msToTimeString(finalMs);
}

function setBtnVisual(btn, on, kind = "OK") {
  if (!btn) return;
  if (!on) {
    btn.style.borderColor = "var(--border)";
    btn.style.background = "#fff";
    btn.style.color = "var(--ink)";
    return;
  }
  if (kind === "OK") {
    btn.style.borderColor = "#bfdbfe";
    btn.style.background = "#eff6ff";
    btn.style.color = "#1d4ed8";
  } else if (kind === "PLUS2") {
    btn.style.borderColor = "#fde68a";
    btn.style.background = "#fffbeb";
    btn.style.color = "#92400e";
  } else {
    btn.style.borderColor = "#fecdd3";
    btn.style.background = "#fff1f2";
    btn.style.color = "#9f1239";
  }
}

function updatePenaltyButtons() {
  setBtnVisual(btnOK, postPenalty === PEN.OK, "OK");
  setBtnVisual(btnPlus2, postPenalty === PEN.PLUS2, "PLUS2");
  setBtnVisual(btnDNFTimer, postPenalty === PEN.DNF, "DNF");
}

function updatePenaltySummary() {
  if (!timerCaptured) {
    penaltySummary.style.display = "none";
    return;
  }

  const original = msToTimeString(baseMs);

  if (inspectionPenalty === PEN.DNF) {
    penaltySummary.innerHTML = `Inspection: <b>DNF</b><br>Final: <b>DNF</b>`;
    penaltySummary.style.display = "block";
    return;
  }
  if (postPenalty === PEN.DNF) {
    penaltySummary.innerHTML = `Original: <b>${original}</b><br>Post-solve: <b>DNF</b><br>Final: <b>DNF</b>`;
    penaltySummary.style.display = "block";
    return;
  }

  const inspTxt = inspectionPenalty === PEN.PLUS2 ? "+2.00" : "OK";
  const postTxt = postPenalty === PEN.PLUS2 ? "+2.00" : "OK";

  const inspMs = inspectionPenalty === PEN.PLUS2 ? 2000 : 0;
  const postMs = postPenalty === PEN.PLUS2 ? 2000 : 0;
  const final = msToTimeString(baseMs + inspMs + postMs);

  penaltySummary.innerHTML =
    `Inspection: <b>${inspTxt}</b> • Post-solve: <b>${postTxt}</b><br>` +
    `Original: <b>${original}</b> → Final: <b>${final}</b>`;

  penaltySummary.style.display = "block";
}

/* =========================
   11) Typing inspection box (same as before)
========================= */
function ensureTypingInspectionBox() {
  if (typingInspectionBox) return;

  typingInspectionBox = document.createElement("div");
  typingInspectionBox.id = "typingInspectionBox";
  typingInspectionBox.style.cssText = `
    margin-top:14px;
    border:1px solid var(--border);
    border-radius:16px;
    padding:14px;
    background:var(--bgSoft);
  `;

  typingInspectionBox.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
      <div>
        <div style="font-weight:950;color:var(--ink);font-size:16px;">Inspection Timer</div>
        <div style="margin-top:6px;color:var(--muted);font-weight:850;font-size:13px;line-height:1.35;">
          +2 after 15s • DNF after 17s (verification may apply for typing mode)
        </div>
      </div>
      <button id="btnTypingInspection" type="button" style="
        padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:#fff;
        font-weight:950;cursor:pointer;color:var(--ink);min-height:44px;
      ">Start</button>
    </div>

    <div id="typingInspectionDisplay" style="
      margin-top:12px;
      font-weight:980;
      font-size:56px;
      letter-spacing:1px;
      line-height:1;
      text-align:center;
      padding:16px 10px;
      border-radius:14px;
      background:#fff;
      border:1px solid var(--border);
      color:#b91c1c;
    ">15</div>
  `;

  typingWrap.insertBefore(typingInspectionBox, typingWrap.firstChild);

  const btn = typingInspectionBox.querySelector("#btnTypingInspection");
  btn.onclick = () => {
    if (typingInspectionRunning) {
      stopTypingInspectionUI();
      btn.textContent = "Start";
      return;
    }
    typingInspectionRunning = true;
    typingInspectionStartPerf = performance.now();
    btn.textContent = "Stop";
    tickTypingInspection();
  };
}

function stopTypingInspectionUI() {
  typingInspectionRunning = false;
  if (typingInspectionRAF) cancelAnimationFrame(typingInspectionRAF);
  typingInspectionRAF = null;
  if (typingInspectionBox) {
    const disp = typingInspectionBox.querySelector("#typingInspectionDisplay");
    if (disp) {
      disp.textContent = "15";
      disp.style.color = "#b91c1c";
    }
  }
}

function tickTypingInspection() {
  if (!typingInspectionRunning || !typingInspectionBox) return;

  const disp = typingInspectionBox.querySelector("#typingInspectionDisplay");
  const el = (performance.now() - typingInspectionStartPerf) / 1000;
  const p = penaltyFromInspection(el);

  disp.style.color = "#b91c1c";
  if (p === PEN.OK) {
    const left = Math.max(0, 15 - el);
    disp.textContent = String(Math.ceil(left));
  } else if (p === PEN.PLUS2) {
    disp.textContent = "+2";
  } else {
    disp.textContent = "DNF";
  }

  typingInspectionRAF = requestAnimationFrame(tickTypingInspection);
}

/* =========================
   12) MODE UI
========================= */
function setModeButtonStyles() {
  const onStyle = "border-color:#1d4ed8;background:#eff6ff;color:#1d4ed8;";
  const offStyle = "border-color:var(--border);background:#fff;color:var(--ink);";
  btnModeTimer.style.cssText = activeMode === MODE.TIMER ? onStyle : offStyle;
  btnModeTyping.style.cssText = activeMode === MODE.TYPING ? onStyle : offStyle;
}

function applyModeUI() {
  setModeButtonStyles();

  btnModeTimer.disabled = modeLocked;
  btnModeTyping.disabled = modeLocked;

  if (typingInspectionBox) typingInspectionBox.style.display = "none";

  if (activeMode === MODE.TIMER) {
    timerWrap.style.display = "block";
    typingWrap.style.display = "block";

    timeValue.readOnly = true;
    timeValue.style.background = "var(--bgSoft)";
    timeValue.style.borderColor = "var(--border)";

    btnDNF.disabled = true;
    btnDNF.style.opacity = 0.6;

    modeHint.innerHTML = modeLocked ? `Mode: <b>Timer</b> (locked).` : `Mode: <b>Timer</b>`;

    const canPenalty = timerCaptured;
    [btnOK, btnPlus2, btnDNFTimer].forEach((b) => {
      b.disabled = !canPenalty;
      b.style.opacity = b.disabled ? 0.65 : 1;
    });

    timerInfo.innerHTML = isMobile()
      ? `Tap timer → inspection starts • Tap again → start solve • Tap → stop`
      : `SPACE → start inspection • Hold SPACE until green • Release → start • SPACE → stop`;
  } else if (activeMode === MODE.TYPING) {
    timerWrap.style.display = "none";
    typingWrap.style.display = "block";

    timeValue.readOnly = false;
    timeValue.style.background = "#fff";
    timeValue.style.borderColor = "var(--border)";

    btnDNF.disabled = false;
    btnDNF.style.opacity = 1;

    modeHint.innerHTML = modeLocked ? `Mode: <b>Typing</b> (locked).` : `Mode: <b>Typing</b>`;

    [btnOK, btnPlus2, btnDNFTimer].forEach((b) => {
      b.disabled = true;
      b.style.opacity = 0.65;
    });

    ensureTypingInspectionBox();
    if (typingInspectionBox) typingInspectionBox.style.display = "block";

    timerInfo.innerHTML = `Type digits only (example: 1234 → 12.34, 12345 → 1:23.45).`;
  } else {
    timerWrap.style.display = "none";
    typingWrap.style.display = "none";
    modeHint.innerHTML = `Select a mode to continue.`;
    timerInfo.innerHTML = "";
  }

  timerDisplay.style.cursor =
    activeMode === MODE.TIMER && isMobile() && !timerCaptured ? "pointer" : "default";

  updatePenaltyButtons();
  updatePenaltySummary();
}

function resetSolveState() {
  activeMode = MODE.NONE;
  modeLocked = false;

  timerRunning = false;
  timerCaptured = false;
  baseMs = 0;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;

  inspecting = false;
  stopInspectionRAF();
  holding = false;
  holdArmed = false;

  inspectionPenalty = PEN.OK;
  postPenalty = PEN.OK;

  timerDisplay.textContent = "0.00";
  timerDisplay.style.color = "var(--ink)";

  penaltySummary.style.display = "none";
  saveToast.style.display = "none";

  timeValue.value = "";
  timeValue.readOnly = false;
  timeValue.style.background = "#fff";
  timeValue.style.borderColor = "var(--border)";

  clearTimeError();

  stopTypingInspectionUI();
  resetTypingBuffer();

  applyModeUI();
}

function setMode(next) {
  if (modeLocked) return;
  activeMode = next;
  clearTimeError();
  resetTypingBuffer();
  applyModeUI();
}

btnModeTimer.onclick = () => setMode(MODE.TIMER);
btnModeTyping.onclick = () => setMode(MODE.TYPING);

/* typing DNF button */
btnDNF.onclick = () => {
  if (activeMode !== MODE.TYPING) return;
  if (timeValue.readOnly) return;
  clearTimeError();
  typingDigits = "";
  timeValue.value = "DNF";
  timeValue.focus();
};

/* =========================
   13) Timer interactions
========================= */
timerDisplay.addEventListener("click", () => {
  if (!isMobile()) return;
  if (modal.style.display === "block") return;
  if (playBox.style.display !== "block") return;
  if (isBusy) return;
  if (activeMode !== MODE.TIMER) return;
  if (timerCaptured) return;

  if (!inspecting && !timerRunning) {
    startInspectionUI();
    return;
  }
  if (inspecting && !timerRunning) {
    timerStartSolveNow();
    return;
  }
  if (timerRunning) {
    timerStopSolve();
  }
});

let spaceHeld = false;

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  if (spaceHeld) return;
  if (modal.style.display === "block") return;
  if (playBox.style.display !== "block") return;
  if (isBusy) return;
  if (activeMode !== MODE.TIMER) return;
  if (timerCaptured) return;
  if (isMobile()) return;

  const a = document.activeElement;
  const tag = (a?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  e.preventDefault();
  spaceHeld = true;

  if (!inspecting && !timerRunning) {
    startInspectionUI();
    return;
  }

  if (inspecting && !timerRunning) {
    holding = true;
    setTimeout(() => {
      if (!holding) return;
      if (!inspecting) return;
      armHoldGreen();
    }, 250);
    return;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  if (!spaceHeld) return;
  spaceHeld = false;

  if (modal.style.display === "block") return;
  if (playBox.style.display !== "block") return;
  if (isBusy) return;
  if (activeMode !== MODE.TIMER) return;
  if (timerCaptured) return;
  if (isMobile()) return;

  e.preventDefault();

  if (inspecting && !timerRunning) {
    holding = false;
    if (holdArmed) timerStartSolveNow();
    return;
  }

  if (timerRunning) timerStopSolve();
});

/* =========================
   14) Post-solve penalty buttons
========================= */
btnOK.onclick = () => {
  if (activeMode !== MODE.TIMER || !timerCaptured) return;
  postPenalty = PEN.OK;
  setFinalTimeFromTimer();
  applyModeUI();
};
btnPlus2.onclick = () => {
  if (activeMode !== MODE.TIMER || !timerCaptured) return;
  postPenalty = PEN.PLUS2;
  setFinalTimeFromTimer();
  applyModeUI();
};
btnDNFTimer.onclick = () => {
  if (activeMode !== MODE.TIMER || !timerCaptured) return;
  postPenalty = PEN.DNF;
  setFinalTimeFromTimer();
  applyModeUI();
};

/* =========================
   15) FIREBASE + FLOW
========================= */
async function fetchCSV() {
  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("CSV fetch failed");
  return parseCSV(await res.text());
}

function filterCompRows(rows) {
  const k = compKey;
  const filtered = rows.filter((r) => {
    const slug = normalizeKey(r.slug || "");
    const compid = normalizeKey(r.comp_id || "");
    return (slug && slug === k) || (compid && compid === k);
  });
  const slugMatches = filtered.filter((r) => normalizeKey(r.slug || "") === k);
  return slugMatches.length ? slugMatches : filtered;
}

function renderEvents() {
  eventsWrap.innerHTML = "";
  if (!COMP_EVENTS.length) {
    eventsWrap.innerHTML = `<div style="grid-column:1/-1;color:var(--muted);font-weight:900;">No events found for this competition.</div>`;
    return;
  }

  COMP_EVENTS.forEach((row) => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText = `
      text-align:left;cursor:pointer;border:1px solid var(--border);background:#fff;
      border-radius:16px;padding:14px;box-shadow:0 10px 22px rgba(0,0,0,.06);
      transition:.15s; min-height:84px;
    `;

    const title = document.createElement("div");
    title.style.cssText = "font-weight:950;font-size:16px;color:var(--ink);";
    title.textContent = row.event_name || row.event_id || "Event";

    const time = document.createElement("div");
    time.style.cssText = "margin-top:6px;color:var(--muted);font-weight:850;font-size:13px;line-height:1.25;";
    time.textContent = row.time_label || "";

    b.appendChild(title);
    b.appendChild(time);

    b.onmouseover = () => (b.style.transform = "translateY(-1px)");
    b.onmouseout = () => (b.style.transform = "translateY(0px)");

    b.onclick = async () => {
      await selectEvent({
        id: (row.event_id || "").trim(),
        name: (row.event_name || "").trim() || (row.event_id || "").trim(),
        timeLabel: (row.time_label || "").trim()
      });
    };

    eventsWrap.appendChild(b);
  });
}

async function loadEventConfig(eventId) {
  const ref = doc(db, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Event config missing: events/" + eventId);
  return snap.data();
}

function phaseFromCfg(cfg) {
  const now = Date.now();
  const start = cfg?.slotStart?.toMillis?.() ?? 0;
  const end = cfg?.slotEnd?.toMillis?.() ?? 0;
  const dead = cfg?.videoDeadline?.toMillis?.() ?? null;

  if (now < start) return "BEFORE";
  if (now >= start && now <= end) return "LIVE";
  if (dead && now > dead) return "CLOSED";
  return "VIDEO";
}

async function selectEvent(ev) {
  try {
    lockUI(true);
    await showLoading("Loading…", "Opening event…");

    ACTIVE_EVENT_ID = ev.id;
    ACTIVE_EVENT_NAME = ev.name;
    ACTIVE_EVENT_TIME_LABEL = ev.timeLabel;

    cfg = await loadEventConfig(ACTIVE_EVENT_ID);

    const ph = phaseFromCfg(cfg);
    const startMs = cfg?.slotStart?.toMillis?.() ?? 0;

    if (ph === "BEFORE") {
      const startText = formatDateTimeIST(startMs);
      showModal(ACTIVE_EVENT_NAME, startText ? `This event will start on ${startText} (IST).` : `This event has not started yet.`);
      ACTIVE_EVENT_ID = "";
      cfg = null;
      return;
    }

    if (ph === "CLOSED") {
      showModal(ACTIVE_EVENT_NAME, "Submissions are closed for this event.");
      ACTIVE_EVENT_ID = "";
      cfg = null;
      return;
    }

    loginEventTitle.textContent = ACTIVE_EVENT_NAME;
    loginEventTime.textContent = ACTIVE_EVENT_TIME_LABEL;

    setMsg("Selected " + ACTIVE_EVENT_NAME + ". Login to begin.");
    show("LOGIN");
  } catch (e) {
    setMsg("Error: " + (e.message || e));
    show("HOME");
  } finally {
    hideLoading();
    lockUI(false);
  }
}

function participantRef() {
  return doc(db, "events", ACTIVE_EVENT_ID, "participants", PID);
}

function renderSolveTracker(cur, total) {
  solveDots.innerHTML = "";
  for (let i = 1; i <= total; i++) {
    const d = document.createElement("div");
    d.style.cssText = `width:10px;height:10px;border-radius:999px;border:1px solid var(--border);background:var(--bgSoft);`;
    if (i < cur) {
      d.style.background = "#bbf7d0";
      d.style.borderColor = "#86efac";
    } else if (i === cur) {
      d.style.background = "#eff6ff";
      d.style.borderColor = "#60a5fa";
      d.style.boxShadow = "0 0 0 4px rgba(29,78,216,.10)";
    }
    solveDots.appendChild(d);
  }
  solveLabel.textContent = `Solve ${cur} of ${total}`;
}

async function refreshAfterLogin() {
  const ph = phaseFromCfg(cfg);

  eventTitle.textContent = ACTIVE_EVENT_NAME;
  eventTime.textContent = ACTIVE_EVENT_TIME_LABEL;

  const slotEndMs = cfg?.slotEnd?.toMillis?.() ?? 0;
  const endLabel = formatDateTimeIST(slotEndMs);

  const videoDeadlineMs = cfg?.videoDeadline?.toMillis?.() ?? 0;
  const deadLabel = videoDeadlineMs ? formatDateTimeIST(videoDeadlineMs) : "";

  if (ph === "CLOSED") {
    showModal(ACTIVE_EVENT_NAME, "Submissions are closed for this event.");
    goHome();
    return;
  }

  const pSnap = await getDoc(participantRef());
  if (!pSnap.exists()) {
    showModal(ACTIVE_EVENT_NAME, "You are not registered for this event.");
    goHome();
    return;
  }
  const p = pSnap.data();

  const total = Array.isArray(cfg.scramblesText) ? cfg.scramblesText.length : 5;
  scrTotal.textContent = total;

  if (ph === "VIDEO") {
    phasePill.textContent = "Video";
    phasePill.style.borderColor = "#bfdbfe";
    phasePill.style.background = "#eff6ff";
    phasePill.style.color = "#1d4ed8";

    show("VIDEO");
    videoWindowText.textContent =
      deadLabel ? `Submit video link before ${deadLabel} (IST).` : `Submit your video link now.`;

    setMsg("Submit your video link for " + ACTIVE_EVENT_NAME + ".");
    return;
  }

  phasePill.textContent = "Live";
  phasePill.style.borderColor = "#bbf7d0";
  phasePill.style.background = "#f0fdf4";
  phasePill.style.color = "#14532d";

  const cur = Number(p.current || 1);

  if (cur >= total + 1) {
  show("DONE");
  setMsg("All solves submitted ✅");

  // ✅ Allow video submission immediately after all 5 solves are done
  videoOpensText.textContent =
    deadLabel
      ? `You can submit your video link now. Deadline: ${deadLabel} (IST).`
      : `You can submit your video link now.`;

  return;
}


  renderSolveTracker(cur, total);

  const idx = cur - 1;
  scrNo.textContent = cur;

  const st = (cfg.scramblesText || [])[idx] || "(Scramble missing)";
  const si = (cfg.scramblesImg || [])[idx] || "";

  scrText.classList.remove("on");
  scrText.textContent = "";
  showScrambleImage(si);

  resetSolveState();
  show("PLAY");
  setMsg("Select Timer or Typing. (Timer mode has compulsory inspection.)");

  setTimeout(() => {
    scrText.textContent = st;
    requestAnimationFrame(() => scrText.classList.add("on"));
  }, 200);
}

await setPersistence(auth, browserLocalPersistence);

document.getElementById("btnLogin").onclick = async () => {
  if (isBusy) return;
  try {
    lockUI(true);
    await showLoading("Logging in…", "Verifying credentials…");

    if (!ACTIVE_EVENT_ID || !cfg) {
      setMsg("Please choose an event first.");
      return;
    }

    PID = document.getElementById("pid").value.trim().toLowerCase();
    const pass = document.getElementById("pass").value.trim();

    if (!PID || !pass) {
      setMsg("Enter PID and Password.");
      return;
    }

    localStorage.setItem(LS_PID_KEY, PID);

    await signInWithEmailAndPassword(auth, pidToEmail(PID), pass);

    setMsg("Login successful. Loading…");
    await refreshAfterLogin();
  } catch (e) {
    setMsg("Login failed: " + (e.message || e));
  } finally {
    hideLoading();
    lockUI(false);
  }
};

document.getElementById("btnNext").onclick = async () => {
  if (isBusy) return;

  const btnNext = document.getElementById("btnNext");
  const oldText = btnNext.textContent;

  try {
    lockUI(true);
    btnNext.textContent = "Saving…";

    const ph = phaseFromCfg(cfg);
    if (ph !== "LIVE") {
      showModal(ACTIVE_EVENT_NAME, "Solve window is not live right now.");
      return;
    }

    clearTimeError();

    if (activeMode === MODE.NONE) {
      showTimeError("Please select Timer or Typing mode first.");
      return;
    }

    if (activeMode === MODE.TIMER) {
      if (!timerCaptured) {
        showTimeError("Complete the solve first (inspection + solve).");
        return;
      }
      const finalVal = (timeValue.value || "").trim();
      if (!finalVal) {
        showTimeError("Timer result missing.");
        return;
      }
    }

    if (activeMode === MODE.TYPING) {
      const raw = (timeValue.value || "").trim();
      const res = normalizeTimeInputStrict(raw);
      if (!res.ok) {
        showTimeError(res.msg || "Invalid time.");
        timeValue.focus();
        return;
      }
      timeValue.value = res.value;
      modeLocked = true;
      applyModeUI();
    }

    await showLoading("Saving…", "Locking this solve and loading next scramble…");

    const pRef = participantRef();
    const pSnap = await getDoc(pRef);
    if (!pSnap.exists()) {
      showTimeError("Not registered for this event.");
      return;
    }
    const p = pSnap.data();

    const total = Array.isArray(cfg.scramblesText) ? cfg.scramblesText.length : 5;
    const cur = Number(p.current || 1);
    if (cur < 1 || cur > total) {
      showTimeError("Invalid state.");
      return;
    }

    const field = "t" + cur;
    if ((p[field] || "") !== "") {
      showTimeError("This solve is already locked.");
      return;
    }

    const update = {};
    update[field] = (timeValue.value || "").trim();
    update.current = cur + 1;
    update.status = cur + 1 >= total + 1 ? "COMPLETED" : "IN_PROGRESS";
    update.updatedAt = serverTimestamp();

    await updateDoc(pRef, update);

    saveToast.style.display = "block";
    saveToast.style.background = "#f0fdf4";
    saveToast.style.borderColor = "#bbf7d0";
    saveToast.style.color = "#14532d";
    saveToast.textContent = `Solve ${cur} saved ✓ Loading next…`;

    await refreshAfterLogin();
  } catch (e) {
    showTimeError("Error saving time: " + (e.message || e));
  } finally {
    hideLoading();
    btnNext.textContent = oldText;
    lockUI(false);
  }
};

function goHome() {
  cfg = null;
  ACTIVE_EVENT_ID = "";
  ACTIVE_EVENT_NAME = "";
  ACTIVE_EVENT_TIME_LABEL = "";
  setMsg("Choose an event to begin.");
  show("HOME");
  resetSolveState();
}

document.getElementById("btnHomeFromLogin").onclick = goHome;
document.getElementById("btnHomeFromDone").onclick = goHome;
document.getElementById("btnHomeFromVideo").onclick = goHome;
function isValidVideoUrl(u) {
  const url = String(u || "").trim();
  if (!url) return false;
  return /^https?:\/\//i.test(url); // keep it flexible: YT/Drive/others
}

async function openVideoSubmission() {
  const ph = phaseFromCfg(cfg);

  // If fully closed (after deadline), block
  if (ph === "CLOSED") {
    showModal(ACTIVE_EVENT_NAME, "Video submission is closed for this event.");
    return;
  }

  // Must be logged in + registered
  const pSnap = await getDoc(participantRef());
  if (!pSnap.exists()) {
    showModal(ACTIVE_EVENT_NAME, "You are not registered for this event.");
    goHome();
    return;
  }

  const p = pSnap.data();
  const total = Array.isArray(cfg.scramblesText) ? cfg.scramblesText.length : 5;
  const cur = Number(p.current || 1);

  // ✅ Only allow opening video submission if all solves are completed
  if (cur < total + 1) {
    showModal(ACTIVE_EVENT_NAME, "Finish all 5 solves first, then submit your video link.");
    return;
  }

  // Show video screen (even if slot hasn't ended)
  const videoDeadlineMs = cfg?.videoDeadline?.toMillis?.() ?? 0;
  const deadLabel = videoDeadlineMs ? formatDateTimeIST(videoDeadlineMs) : "";

  phasePill.textContent = "Video";
  phasePill.style.borderColor = "#bfdbfe";
  phasePill.style.background = "#eff6ff";
  phasePill.style.color = "#1d4ed8";

  show("VIDEO");
  videoWindowText.textContent = deadLabel
    ? `Submit video link before ${deadLabel} (IST).`
    : `Submit your video link now.`;

  // Prefill if already submitted earlier
  const prev = (p.videoLink || p.video_link || "").trim();
  if (prev) {
    document.getElementById("videoLink").value = prev;
    document.getElementById("btnVideo").textContent = "Update Video Link";
  } else {
    document.getElementById("btnVideo").textContent = "Submit Video";
  }

  setMsg("Submit your video link for " + ACTIVE_EVENT_NAME + ".");
}

// ✅ DONE screen button -> open video submission
document.getElementById("btnGoToVideo").onclick = async () => {
  if (isBusy) return;
  try {
    lockUI(true);
    await showLoading("Opening…", "Preparing video submission…");
    await openVideoSubmission();
  } catch (e) {
    showModal(ACTIVE_EVENT_NAME, "Error: " + (e.message || e));
  } finally {
    hideLoading();
    lockUI(false);
  }
};

// ✅ VIDEO screen submit button -> save link in Firestore
document.getElementById("btnVideo").onclick = async () => {
  if (isBusy) return;

  const btn = document.getElementById("btnVideo");
  const oldText = btn.textContent;

  try {
    lockUI(true);
    btn.textContent = "Saving…";

    const ph = phaseFromCfg(cfg);
    if (ph === "CLOSED") {
      showModal(ACTIVE_EVENT_NAME, "Video submission is closed for this event.");
      return;
    }

    const pSnap = await getDoc(participantRef());
    if (!pSnap.exists()) {
      showModal(ACTIVE_EVENT_NAME, "You are not registered for this event.");
      goHome();
      return;
    }

    const p = pSnap.data();
    const total = Array.isArray(cfg.scramblesText) ? cfg.scramblesText.length : 5;
    const cur = Number(p.current || 1);

    if (cur < total + 1) {
      showModal(ACTIVE_EVENT_NAME, "Finish all 5 solves first, then submit your video link.");
      return;
    }

    const link = document.getElementById("videoLink").value.trim();
    if (!isValidVideoUrl(link)) {
      showModal(ACTIVE_EVENT_NAME, "Please paste a valid link starting with http:// or https://");
      return;
    }

    await showLoading("Saving…", "Submitting your video link…");

    // Save in Firestore (store both keys for safety)
    await updateDoc(participantRef(), {
      videoLink: link,
      video_link: link,
      videoSubmittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showModal(ACTIVE_EVENT_NAME, "Video link submitted ✅");
    setMsg("Video link submitted ✅");
  } catch (e) {
    showModal(ACTIVE_EVENT_NAME, "Failed to submit: " + (e.message || e));
  } finally {
    hideLoading();
    btn.textContent = oldText;
    lockUI(false);
  }
};

/* =========================
   16) BOOT
========================= */
async function boot() {
  try {
    await showLoading("Loading…", "Preparing competition portal…");

    // enable typing guards once
    enableTypingInputGuards();

    if (!compKey) {
      compName.textContent = "Competition Portal";
      setMsg("Missing competition id in URL.");
      show("HOME");
      return;
    }

    COMP_ROWS = await fetchCSV();
    COMP_EVENTS = filterCompRows(COMP_ROWS);
    buildDayStructure(COMP_ROWS);

    if (!COMP_EVENTS.length) {
      compName.textContent = "Competition Portal";
      setMsg("Competition not found for id=" + compKey);
      show("HOME");
      return;
    }

    const first = COMP_EVENTS[0];
    compName.textContent = first.comp_name || first.comp_id || "Competition Portal";

    if(DAY_MODE){ renderDayTabs(); } else { renderEvents(); }
    show("HOME");
    resetSolveState();
  } catch (e) {
    compName.textContent = "Competition Portal";
    setMsg("Setup error: " + (e.message || e));
  } finally {
    hideLoading();
  }
}

/* =======================================================
   🔥 MULTI-DAY + SLOT + HIDE_EVENT UPGRADE (ADDITION ONLY)
   Backward compatible — if CSV has no day_id, old mode runs.
   UI:
    - Day tabs show only day_label (no date/time)
    - Default selects first day
    - Event cards show timeLabel from Firestore (events/{event_id})
   Hide rule:
    - If hide_event provided (dd/mm/yyyy hh:mm:ss IST) and now > hide_event, hide event button
    - Else if date provided, hide after date 23:59:59 IST
======================================================= */

function parseDMY(d){
  if(!d) return null;
  const [dd,mm,yy]=String(d).split("/");
  return new Date(yy,mm-1,dd,0,0,0);
}
function parseDMYHM(d){
  if(!d) return null;
  const [date,time="23:59:59"]=String(d).split(" ");
  const [dd,mm,yy]=date.split("/");
  const [hh,mi,ss]=time.split(":");
  return new Date(yy,mm-1,dd,hh,mi,ss);
}

let DAY_MODE=false;
let DAYS_MAP={};
let ACTIVE_DAY_ID=null;

function buildDayStructure(rows){
  const hasDayColumn = rows.length && Object.prototype.hasOwnProperty.call(rows[0], "day_id");
  DAY_MODE = hasDayColumn;
  if(!DAY_MODE) return;

  DAYS_MAP = {};
  rows.forEach(r=>{
    if(normalizeKey(r.slug||r.comp_id)!==compKey) return;

    const dId = r.day_id || "D1";
    const dLabel = r.day_label || dId;
    const dDate = parseDMY(r.date);

    if(!DAYS_MAP[dId]) DAYS_MAP[dId]={label:dLabel,date:dDate,events:[]};
    DAYS_MAP[dId].events.push(r);
  });
}

async function fetchEventTimeLabel(eventId){
  try{
    const snap = await getDoc(doc(db,"events",eventId));
    if(!snap.exists()) return "";
    const cfg = snap.data()||{};
    return (cfg.timeLabel||cfg.time_label||"");
  }catch(_e){
    return "";
  }
}

function renderDayTabs(){
  if(!DAY_MODE) return;

  // clear the default message
  try{ setMsg("Select an event to begin."); }catch(_e){}

  // remove existing
  const old = document.getElementById("dayTabs");
  if(old) old.remove();

  const wrap=document.createElement("div");
  wrap.id="dayTabs";
  wrap.style.cssText="display:flex;gap:10px;margin:10px 0 14px;flex-wrap:wrap;";

  const ids = Object.keys(DAYS_MAP);

  // Helper: is a day fully closed?
  const isDayClosed = (day) => {
    return day.events.every(row=>{
      let hide = parseDMYHM(row.hide_event);
      if(!hide && row.date) hide = parseDMYHM(row.date + " 23:59:59");
      return hide && new Date() > hide;
    });
  };

  // Pick earliest open day (in CSV order)
  const firstOpenId = ids.find(id => !isDayClosed(DAYS_MAP[id])) || ids[0];

  // If current day not set or has become closed, move to earliest open
  if(!ACTIVE_DAY_ID || isDayClosed(DAYS_MAP[ACTIVE_DAY_ID])) {
    ACTIVE_DAY_ID = firstOpenId;
  }

  ids.forEach(id=>{
    const day=DAYS_MAP[id];
    const closed = isDayClosed(day);
    const isActive = id===ACTIVE_DAY_ID;

    const b=document.createElement("button");
    b.type="button";
    b.className="dayBtn";
    b.textContent = (day.label || id);

    b.style.cssText = [
      "padding:9px 14px",
      "border-radius:999px",
      "border:1px solid var(--border)",
      "font-weight:950",
      "cursor:"+(closed?"not-allowed":"pointer"),
      "background:"+(isActive?"#0f172a":"#fff"),
      "color:"+(isActive?"#fff":"var(--ink)"),
      "opacity:"+(closed?".45":"1"),
      "box-shadow:"+(isActive?"0 10px 22px rgba(15,23,42,.18)":"0 8px 18px rgba(0,0,0,.06)")
    ].join(";");

    if(closed){
      b.disabled = true;
    }else{
      b.onclick = () => {
        ACTIVE_DAY_ID = id;
        renderDayTabs();
        renderEventsForDay(id);
      };
    }

    wrap.appendChild(b);
  });

  homeBox.insertBefore(wrap, eventsWrap);

  // Render the active day (which is guaranteed to be earliest open)
  renderEventsForDay(ACTIVE_DAY_ID);
}


function renderEventsForDay(dayId){
  eventsWrap.innerHTML="";

  const now=new Date();
  const day = DAYS_MAP[dayId];
  if(!day) return;

  day.events.forEach(row=>{
    let hide=parseDMYHM(row.hide_event);
    if(!hide && row.date){
      hide=parseDMYHM(row.date+" 23:59:59");
    }
    if(hide && now>hide) return;

    const eventId=row.event_id;

    const b=document.createElement("button");
    b.type="button";
    b.style.cssText="text-align:left;cursor:pointer;border:1px solid var(--border);background:#fff;border-radius:16px;padding:16px 16px;box-shadow:0 10px 22px rgba(0,0,0,.06);transition:.15s; min-height:90px;";

    const title=document.createElement("div");
    title.style.cssText="font-weight:1000;font-size:18px;color:var(--ink);";
    title.textContent=row.event_name||eventId;

    const meta=document.createElement("div");
    meta.style.cssText="margin-top:8px;color:var(--muted);font-weight:850;font-size:13px;line-height:1.2;";
    meta.textContent="";

    b.appendChild(title);
    b.appendChild(meta);

    b.onclick=()=>selectEvent({id:eventId,name:row.event_name,timeLabel:meta.textContent||""});
    eventsWrap.appendChild(b);

    // hydrate timeLabel from Firestore
    fetchEventTimeLabel(eventId).then(t=>{
      if(t) meta.textContent=t;
    });
  });
}

boot();
