/* ============================================
   CUBING CLASH 3.0 (CC2026) — ULTRA PREMIUM
   High-Converting | Advanced Animations
   ORIGINAL LOGIC PRESERVED + REQUESTED UPDATES APPLIED
   ============================================ */

const CC2026 = {
  compId: "cc2026",
  registerLink: "https://rzp.io/rzp/cc2026",
  competeUrl: (id) => `/competitions/view/compete/?id=${encodeURIComponent(id)}`,
  resultsUrl: (id) => `/competitions/results/?id=${encodeURIComponent(id)}`,

  // Fallbacks (used only if Competitions CSV not found / missing fields)
  regStartIST: "01/02/2026 12:00:00", // open "from now" by default
  regEndIST: "09/04/2026 12:00:00",

  // Milestones (fallbacks; if CSV has fields, they will override automatically)
  prelimsStartIST: "10/04/2026 00:00:00",
  prelimsEndIST:   "12/04/2026 23:59:59",
  rrStartIST:      "18/04/2026 00:00:00",
  rrEndIST:        "19/04/2026 23:59:59",
  playoffsStartIST:"25/04/2026 00:00:00",
  playoffsEndIST:  "26/04/2026 23:59:59",

  // Season end (results etc)
  seasonEndIST: "26/04/2026 23:59:59",

  // Fees rules
  earlyBirdStartIST: "01/02/2026 00:00:00",
  earlyBirdEndIST: "28/02/2026 23:59:59",
  earlyBirdCap: 50,
  fee: {
    early: { base: 299, perEvent: 100 },
    normal:{ base: 399, perEvent: 100 }
  }
};


/* ============================================
   EARLY BIRD CAP HELPERS (SAFE)
   - This site currently does NOT compute early-bird slots from backend.
   - So cap is treated as open (date window drives early-bird visibility).
   ============================================ */
function isEarlyBirdCapOpen(){
  // If you later wire a backend count, replace this function.
  // For now: return true so calculator never breaks.
  return true;
}

const IST_OFFSET_MIN = 330;

const $ = (id) => document.getElementById(id);
const safe = (v) => (v ?? "").toString().trim();
const low  = (v) => safe(v).toLowerCase();

/* ============================================================
   ✅ Dashboard-style CSV API fallback
   - CC2026 page expects window.CB_API.getCSV
   - Some pages (like dashboard.js) implement their own CSV helpers.
   - To keep existing CC2026 logic unchanged, we provide getCSV here
     ONLY if CB_API is missing.
   ============================================================ */
(function ensureCBAPI(){
  try{
    window.CB_API = window.CB_API || {};
    if(typeof window.CB_API.getCSV === "function") return;

    function splitCSVLine(line){
      const out = [];
      let cur = "";
      let q = false;
      for(let i=0;i<line.length;i++){
        const ch = line[i];
        if(ch === '"'){
          if(q && line[i+1] === '"'){ cur += '"'; i++; }
          else q = !q;
        } else if(ch === "," && !q){
          out.push(cur); cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out;
    }

    function parseCSV(text){
      const lines = String(text||"").replace(/\r/g,"").split("\n").filter(Boolean);
      if(!lines.length) return [];
      const head = splitCSVLine(lines[0]).map(h => low(h));
      const out = [];
      for(let i=1;i<lines.length;i++){
        const cols = splitCSVLine(lines[i]);
        const row = {};
        head.forEach((h, idx) => row[h] = (cols[idx] ?? "").trim());
        out.push(row);
      }
      return out;
    }

    window.CB_API.getCSV = async function getCSV(url){
      const res = await fetch(url, { cache: "no-store" });
      if(!res.ok) throw new Error("Failed to load CSV");
      const text = await res.text();
      return parseCSV(text);
    };
  }catch(e){
    // do nothing — existing code will handle missing getCSV
  }
})();

/* ============================================
   IST DATE HANDLING (UNCHANGED)
   ============================================ */
function parseIST(s){
  const t = safe(s);
  if(!t) return null;

  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(m){
    return Date.UTC(+m[3], m[2]-1, +m[1], +m[4], +m[5], +(m[6]||0)) - IST_OFFSET_MIN*60*1000;
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    return Date.UTC(+m[3], m[2]-1, +m[1]) - IST_OFFSET_MIN*60*1000;
  }
  return null;
}

function fmtIST(ts){
  if(!Number.isFinite(ts)) return "—";
  const d = new Date(ts + IST_OFFSET_MIN*60*1000);
  return `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} IST`;
}

// "Now in IST" formatted as DD/MM/YYYY HH:MM:SS
function nowISTString(){
  const now = Date.now();
  const d = new Date(now + IST_OFFSET_MIN*60*1000);
  const dd = String(d.getUTCDate()).padStart(2,"0");
  const mm = String(d.getUTCMonth()+1).padStart(2,"0");
  const yy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2,"0");
  const mi = String(d.getUTCMinutes()).padStart(2,"0");
  const ss = String(d.getUTCSeconds()).padStart(2,"0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`;
}

/* ============================================
   COMPETITIONS CSV META LOADER (NEW)
   - Reads reg_start/reg_end (+ optional round dates) from Competitions sheet CSV
   - Auto-detects the CSV key in window.CB
   ============================================ */
function pickCompetitionsCsvKey(){
  if(!window.CB) return null;

  // Prefer obvious key names if they exist
  const preferred = [
    "CSV_COMPETITIONS",
    "CSV_COMPETITION",
    "CSV_COMP",
    "CSV_COMPETITIONS_SHEET",
    "CSV_COMPETITION_SHEET"
  ];

  for(const k of preferred){
    if(window.CB[k]) return window.CB[k];
  }

  // Otherwise auto-detect: any CB key containing CSV + COMPET
  const keys = Object.keys(window.CB);
  const found = keys.find(k => low(k).includes("csv") && low(k).includes("compet"));
  if(found) return window.CB[found];

  return null;
}

function coerceISTFromCsv(v){
  // Accept DD/MM/YYYY HH:MM[:SS] or DD/MM/YYYY
  const t = safe(v);
  if(!t) return null;
  const ts = parseIST(t);
  return Number.isFinite(ts) ? t : null;
}

async function loadCompetitionMeta(){
  try{
    if(!window.CB_API?.getCSV) return;

    const csvUrl = pickCompetitionsCsvKey();
    if(!csvUrl) return;

    const rows = await window.CB_API.getCSV(csvUrl) || [];
    const row = rows.find(r =>
      low(r.comp_id) === CC2026.compId ||
      low(r.id) === CC2026.compId ||
      low(r.comp) === CC2026.compId
    );

    if(!row) return;

    // Required fields
    const regStart = coerceISTFromCsv(row.reg_start);
    const regEnd   = coerceISTFromCsv(row.reg_end);

    // If user wants "regs open from now", keep behavior open if reg_start is missing
    // (If CSV has reg_start, we respect it)
    CC2026.regStartIST = regStart || CC2026.regStartIST || nowISTString();
    CC2026.regEndIST   = regEnd   || CC2026.regEndIST;

    // Optional milestone fields (if you add these columns in CSV)
    // Supported column names (flexible):
    // prelims_start/prelims_end, rr_start/rr_end, playoffs_start/playoffs_end
    CC2026.prelimsStartIST = coerceISTFromCsv(row.prelims_start) || CC2026.prelimsStartIST;
    CC2026.prelimsEndIST   = coerceISTFromCsv(row.prelims_end)   || CC2026.prelimsEndIST;

    CC2026.rrStartIST      = coerceISTFromCsv(row.rr_start)      || CC2026.rrStartIST;
    CC2026.rrEndIST        = coerceISTFromCsv(row.rr_end)        || CC2026.rrEndIST;

    CC2026.playoffsStartIST= coerceISTFromCsv(row.playoffs_start)|| CC2026.playoffsStartIST;
    CC2026.playoffsEndIST  = coerceISTFromCsv(row.playoffs_end)  || CC2026.playoffsEndIST;

    // If CSV has season_end, use it
    CC2026.seasonEndIST    = coerceISTFromCsv(row.season_end)    || CC2026.seasonEndIST;

  }catch(e){
    console.warn("CC2026 meta load failed:", e);
  }
}

/* ============================================
   COUNTDOWN (UPDATED: CHAINED MILESTONES)
   ============================================ */
let cdTimer = null;

function fmtCountdown(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  return {
    days: Math.floor(s/86400),
    hours: String(Math.floor((s%86400)/3600)).padStart(2,"0"),
    minutes: String(Math.floor((s%3600)/60)).padStart(2,"0"),
    seconds: String(s%60).padStart(2,"0")
  };
}

function renderTiming(){
  const openEl = $("regOpenText");
  const closeEl = $("regCloseText");

  // show from CSV (if available)
  const openTs = parseIST(CC2026.regStartIST || nowISTString());
  const closeTs = parseIST(CC2026.regEndIST);

  if(openEl) openEl.textContent = fmtIST(openTs);
  if(closeEl) closeEl.textContent = fmtIST(closeTs);
}

function getCountdownMilestones(){
  const regEnd       = parseIST(CC2026.regEndIST);       // 09 Apr 2026 12:00:00

  return [
    {
      key: "regClose",
      label: "Registrations close in",
      ts: regEnd
    },
    {
      key:"preStart",
      label:"Prelims start in",
      ts: parseIST(CC2026.prelimsStartIST)
    },
    {
      key:"preEnd",
      label:"Prelims end in",
      ts: parseIST(CC2026.prelimsEndIST)
    },
    {
      key:"rrStart",
      label:"Playoffs Phase 1 starts in",
      ts: parseIST(CC2026.rrStartIST)
    },
    {
      key:"rrEnd",
      label:"Playoffs Phase 1 ends in",
      ts: parseIST(CC2026.rrEndIST)
    },
    {
      key:"poStart",
      label:"Playoffs start in",
      ts: parseIST(CC2026.playoffsStartIST)
    },
    {
      key:"poEnd",
      label:"Playoffs end in",
      ts: parseIST(CC2026.playoffsEndIST)
    }
  ].filter(m => Number.isFinite(m.ts));
}

function startCountdown(){
  const box = $("countdownBox");
  const label = $("countdownLabel");
  const daysEl = $("cdDays");
  const hoursEl = $("cdHours");
  const minutesEl = $("cdMinutes");
  const secondsEl = $("cdSeconds");

  const tick = () => {
    const now = Date.now();
    const milestones = getCountdownMilestones();

    // Find first milestone in future
    const next = milestones.find(m => m.ts > now);

    if(!next){
      // All ended
      if(label) label.textContent = "Competition concluded";
      if(daysEl) daysEl.textContent = "00";
      if(hoursEl) hoursEl.textContent = "00";
      if(minutesEl) minutesEl.textContent = "00";
      if(secondsEl) secondsEl.textContent = "00";
      box?.classList.add("isClosed");
      box?.classList.remove("isSoon");
      return;
    }

    const cd = fmtCountdown(next.ts - now);
    if(daysEl) daysEl.textContent = String(cd.days).padStart(2, "0");
    if(hoursEl) hoursEl.textContent = cd.hours;
    if(minutesEl) minutesEl.textContent = cd.minutes;
    if(secondsEl) secondsEl.textContent = cd.seconds;

    if(label && box){
      label.textContent = next.label;

      // Styling classes:
      // - Before reg close: normal
      // - If reg close is upcoming but <24h: isSoon
      const regCloseTs = parseIST(CC2026.regEndIST);
      if(Number.isFinite(regCloseTs) && now < regCloseTs && (regCloseTs - now) < 24*3600*1000){
        box.classList.add("isSoon");
        box.classList.remove("isClosed");
      }else{
        box.classList.remove("isSoon", "isClosed");
      }
    }
  };

  clearInterval(cdTimer);
  tick();
  cdTimer = setInterval(tick, 1000);
}

/* ============================================
   USER CONTEXT (UNCHANGED LOGIC)
   ============================================ */
let ctx = {
  isLoggedIn: false,
  email: "",
  playerId: "",
  isRegistered: false,
  hasCompeted: false,
  isLoading: true,
  loadedAt: 0
};





/* ============================================
   REGISTRATIONS METER (UNIQUE player_id from CSV_UPCOMING)
   Fast perceived load: show cached count instantly, then refresh in background
   ============================================ */
const CC2026_REG_LIMIT = 100;
const REG_CACHE_KEY = "cc2026_regcount_cache_v1";
const REG_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

function getRegistrationsCsvUrl(){
  try{
    if(window.CB && typeof window.CB.CSV_UPCOMING === "string" && window.CB.CSV_UPCOMING.trim()){
      return window.CB.CSV_UPCOMING.trim();
    }
    // Fallback: auto-detect a CSV key that looks like registrations/entries
    if(window.CB && typeof window.CB === "object"){
      const keys = Object.keys(window.CB);
      const pick = keys.find(k => /csv/i.test(k) && /(reg|registr|entry|upcoming)/i.test(k) && typeof window.CB[k] === "string");
      if(pick) return String(window.CB[pick]).trim();
    }
  }catch(_e){}
  return "";
}

function splitCSVLineFast(line){
  // Minimal CSV split with quotes support (fast enough for Sheets CSV)
  const out = [];
  let cur = "";
  let q = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"'){
      if(q && line[i+1] === '"'){ cur += '"'; i++; }
      else q = !q;
    }else if(ch === "," && !q){
      out.push(cur); cur = "";
    }else cur += ch;
  }
  out.push(cur);
  return out;
}
function parseCSVFast(text){
  const clean = String(text || "").replace(/\r/g, "");
  const lines = clean.split("\n").filter(l => l && l.trim().length);
  if(!lines.length) return [];
  const head = splitCSVLineFast(lines[0]).map(h => String(h||"").trim().toLowerCase());
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const cols = splitCSVLineFast(lines[i]);
    const row = {};
    for(let c=0;c<head.length;c++) row[head[c]] = (cols[c] ?? "").trim();
    rows.push(row);
  }
  return rows;
}


function readRegCache(){
  try{
    const raw = localStorage.getItem(REG_CACHE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || typeof data !== "object") return null;
    if(!data.ts || (Date.now() - Number(data.ts)) > REG_CACHE_TTL_MS) return null;
    if(typeof data.count !== "number") return null;
    return data;
  }catch(_e){ return null; }
}
function writeRegCache(count){
  try{
    localStorage.setItem(REG_CACHE_KEY, JSON.stringify({ ts: Date.now(), count: Number(count)||0 }));
  }catch(_e){}
}



function formatRupeesPlus(n){
  const v = Math.max(0, Math.round(Number(n)||0));
  return "₹" + v.toLocaleString("en-IN") + "+";
}

function getPrizePoolTarget(regCount){
  const c = Math.max(0, Number(regCount)||0);
  if(c >= 150) return 100000;
  if(c >= 100) return 75000;
  return 60000;
}

function get3x3GuaranteedCount(regCount){
  const c = Math.max(0, Number(regCount)||0);
  return (c >= 125) ? 16 : 8;
}

function applyPrizePoolEverywhere(target){
  const prizeText = formatRupeesPlus(target);

  // Update any "Prize Pool" stat-card values
  document.querySelectorAll(".stat-card").forEach(card => {
    const label = card.querySelector(".stat-label");
    const valEl = card.querySelector(".stat-value");
    if(!label || !valEl) return;
    if(low(label.textContent).includes("prize pool")){
      valEl.textContent = prizeText;
      valEl.setAttribute("data-countup", String(target));
      valEl.setAttribute("data-last", String(target));
    }
  });

  // Update the fees section prize amount (and any other rupee+ countups)
  document.querySelectorAll('[data-prefix="₹"][data-suffix="+"][data-countup]').forEach(el => {
    const cur = Number(el.getAttribute("data-countup")||0);
    // Only touch "prize pool-like" numbers (avoid messing with fees calculator)
    if([60000, 75000, 100000].includes(cur) || /₹\s*\d[\d,]*\+/.test(el.textContent)){
      el.textContent = prizeText;
      el.setAttribute("data-countup", String(target));
      el.setAttribute("data-last", String(target));
    }
  });
}

function applyGuaranteedPrizeText(regCount){
  const el = $("overallGuaranteedDesc");
  if(!el) return;

  const g = get3x3GuaranteedCount(regCount);
  // Keep it crisp + consistent everywhere
  el.textContent = (g >= 16)
    ? "3×3: Top 16 guaranteed prizes • Other events: Top 8 overall guaranteed prizes."
    : "3×3: Top 8 guaranteed prizes • Other events: Top 8 overall guaranteed prizes.";
}

function renderRegistrationsMeter(count, _limit, mode, rows){
  const box = $("regMeter");
  if(!box) return;

  const c = Math.max(0, Number(count) || 0);

  const pill = $("regmeterPill");
  const countEl = $("regmeterCountLive");
  const hintEl = $("regmeterMilestoneHint");
  const segBar = $("msSegBar");
  const segFill100 = $("msSegFill100");
  const segFill125 = $("msSegFill125");
  const segFill150 = $("msSegFill150");

  if(countEl) countEl.textContent = c.toLocaleString("en-IN");

  if(pill){
    if(mode === "syncing") pill.textContent = "Syncing…";
    else if(mode === "cached") pill.textContent = "Updated recently";
    else pill.textContent = "Live";
  }

  const milestones = [100,125,150];
  const next = milestones.find(ms => c < ms) || null;
  if(hintEl){
    hintEl.textContent = next ? `Next milestone: ${next.toLocaleString("en-IN")}` : "All milestones unlocked — thank you!";
  }

  // Next milestone reward fixed block
  const nextTargetEl = $("msNextTarget");
  const nextRewardEl = $("msNextReward");
  const nextLiveEl = $("msNextLive");

  const rewardText = (ms) => {
    if(ms === 100) return "₹75,000+ prize pool + First‑100 special workshop access";
    if(ms === 125) return "3×3 guaranteed prizes expand to Top 16";
    if(ms === 150) return "₹1,00,000+ prize pool";
        return "All milestone rewards unlocked — thank you!";
  };

  if(nextTargetEl) nextTargetEl.textContent = next ? next.toLocaleString("en-IN") : "—";
  if(nextRewardEl) nextRewardEl.textContent = next ? rewardText(next) : rewardText(null);
  if(nextLiveEl) nextLiveEl.textContent = (mode === "live") ? "Live" : (mode === "cached" ? "Updated recently" : "Updating…");

// Segmented progress (0→150): [0-100][100-125][125-150]
const max = 150;
const clamped = Math.max(0, Math.min(max, c));

const seg1 = Math.max(0, Math.min(100, clamped));                 // 0..100
const seg2 = Math.max(0, Math.min(25,  clamped - 100));           // 0..25
const seg3 = Math.max(0, Math.min(25,  clamped - 125));           // 0..25

const seg1Pct = (seg1 / 100) * 100;
const seg2Pct = (seg2 / 25)  * 100;
const seg3Pct = (seg3 / 25)  * 100;

if(segFill100) segFill100.style.width = seg1Pct.toFixed(2) + "%";
if(segFill125) segFill125.style.width = seg2Pct.toFixed(2) + "%";
if(segFill150) segFill150.style.width = seg3Pct.toFixed(2) + "%";

if(segBar) segBar.setAttribute("aria-valuenow", String(clamped));

  // Marker + dropdown state
function setState(ms){
  const row = $(`msRow${ms}`);
  const badge = $(`msBadge${ms}`);

  const reached = c >= ms;
  const current = !reached && next === ms;

  if(row){
    row.classList.toggle("is-reached", reached);
    row.classList.toggle("is-current", current);
  }
  if(badge){
    badge.textContent = reached ? "Unlocked" : (current ? "Next" : "Locked");
    badge.classList.toggle("is-reached", reached);
    badge.classList.toggle("is-current", current);
  }
}
  milestones.forEach(setState);

  // Workshop text: visible ONLY until 100 reached
  const ws = $("msWorkshopText");
  if(ws) ws.style.display = (c < 100) ? "" : "none";

  // Rewards auto-sync
  const prizeTarget = getPrizePoolTarget(c);
  applyPrizePoolEverywhere(prizeTarget);
  applyGuaranteedPrizeText(c);
}


/* =========================================================
   MILESTONE REWARDS — auto-sync prize pool & prize texts
   - Base: ₹60,000+
   - 100+: ₹75,000+
   - 125+: ₹1,00,000+ + 3×3 guaranteed prizes Top 16
   - 150+: ₹1,00,000+ (still)
   ========================================================= */

let __cc2026PrizePoolTarget = 60000;

function getPrizePoolTarget(regCount){
  const c = Math.max(0, Number(regCount)||0);
  // 100 → 75k, 150 → 1L (125 only changes Top16 for 3×3)
  if(c >= 150) return 100000;
  if(c >= 100) return 75000;
  return 60000;
}

function get3x3GuaranteedCount(regCount){
  const c = Math.max(0, Number(regCount)||0);
  return (c >= 125) ? 16 : 8;
}

function animateCountUp(el, to, dur=850){
  try{
    const target = Math.max(0, Math.round(Number(to)||0));
    const from = Number(el.getAttribute("data-last") || el.textContent.replace(/[^\d]/g,"") || 0) || 0;
    const start = performance.now();

    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const val = Math.round(from + (target - from) * (p<1 ? (1 - Math.pow(1-p, 3)) : 1));
      // Preserve rupee formatting if it already has ₹
      el.textContent = "₹" + val.toLocaleString("en-IN") + "+";
      if(p < 1) requestAnimationFrame(step);
      else el.setAttribute("data-last", String(target));
    };
    requestAnimationFrame(step);
  }catch(_e){
    el.textContent = "₹" + (Math.max(0, Math.round(Number(to)||0))).toLocaleString("en-IN") + "+";
  }
}

function applyMilestoneRewards(regCount){
  const target = getPrizePoolTarget(regCount);
  const top3 = get3x3GuaranteedCount(regCount);

  // Prize pool numbers (any element using data-countup on this page)
  const els = document.querySelectorAll("[data-countup]");
  if(els && els.length){
    els.forEach(el => {
      // Only touch elements that look like prize pool (₹ ... +). (Avoid other counters if any.)
      const txt = (el.textContent || "").trim();
      const looksLikeMoney = txt.includes("₹") || /prize/i.test(el.closest?.(".stat-card,.prize-pool,.hero")?.textContent || "");
      if(!looksLikeMoney) return;

      el.setAttribute("data-countup", String(target));
      // If it's already counted once, we still want to update it on milestone change.
      if(__cc2026PrizePoolTarget !== target){
        animateCountUp(el, target, 900);
      }else{
        // Ensure correct formatting on first load as well
        if(!txt.includes("₹")) animateCountUp(el, target, 650);
      }
    });
  }
  __cc2026PrizePoolTarget = target;

  // Prize descriptions
  const overall = $("prizeOverallDesc");
  if(overall){
    overall.textContent = "Top 8 across all events (overall category) will get guaranteed prizes.";
  }
  const p3 = $("prize3x3Desc");
  if(p3){
    p3.textContent = `Top ${top3} overall in 3×3 will get confirmed prizes.` + (top3 === 16 ? " (Unlocked)" : " (Unlocks Top 16 at 125+ registrations.)");
  }
}

/* =========================================================
   REGISTRATION ACTIVITY TOAST
   - Shows: “A participant registered from City, Country — Today / Yesterday / DD Mon”
   - Uses CSV columns: city, country, reg_date (or registration_date/date)
   ========================================================= */



async function refreshRegistrationsMeter(){
  // FIX: removed accidental token that broke JS parsing
  const url = getRegistrationsCsvUrl();
  if(!url) return;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6500);

  try{
    const res = await fetch(url, { cache: "force-cache", signal: controller.signal });
    if(!res.ok) throw new Error("CSV load failed");
    const txt = await res.text();
    const rows = parseCSVFast(txt);

    const set = new Set();
    for(const r of rows){
      const v = (r["player_id"] || "").trim();
      if(v) set.add(v);
    }
    const count = set.size;
    writeRegCache(count);
    renderRegistrationsMeter(count, CC2026_REG_LIMIT, "live", rows);
  }catch(_e){
    // keep cached display if available; do not throw
  }finally{
    clearTimeout(t);
  }
}

function initRegistrationsMeter(){
  const box = $("regMeter");
  if(!box) return;

  // Render cache instantly (perceived speed)
  const cached = readRegCache();
  if(cached){
    renderRegistrationsMeter(cached.count, CC2026_REG_LIMIT, "cached", null);
  }else{
    renderRegistrationsMeter(0, CC2026_REG_LIMIT, "syncing", null);
  }

  // Background refresh ASAP (but after first paint)
  const run = () => refreshRegistrationsMeter();
  if("requestIdleCallback" in window){
    requestIdleCallback(run, { timeout: 1200 });
  }else{
    setTimeout(run, 250);
  }
}





const CTX_CACHE_KEY = "cc2026_ctx_cache_v1";
const CTX_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function loadCtxCache(){
  try{
    const raw = sessionStorage.getItem(CTX_CACHE_KEY) || localStorage.getItem(CTX_CACHE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || typeof data !== "object") return null;
    if(!data.loadedAt || (Date.now() - Number(data.loadedAt)) > CTX_CACHE_TTL_MS) return null;
    return data;
  }catch(_e){ return null; }
}

function saveCtxCache(nextCtx){
  try{
    const data = { ...nextCtx, loadedAt: Date.now() };
    const raw = JSON.stringify(data);
    sessionStorage.setItem(CTX_CACHE_KEY, raw);
    localStorage.setItem(CTX_CACHE_KEY, raw);
  }catch(_e){}
}

function preloadUserContext(){
  const cached = loadCtxCache();
  if(!cached) return false;
  // Only trust cache for logged-in + registered/competed states to avoid accidental lockout.
  if(cached.isLoggedIn){
    ctx = { ...ctx, ...cached, isLoading: true };
    window.ctx = ctx;
    try{ if(typeof renderCTAs==='function') renderCTAs(); }catch(_e){}
    try{ if(typeof updateStickyCTA==='function') updateStickyCTA(); }catch(_e){}
    return true;
  }
  return false;
}

async function loadUserContext(){
  if(!window.supabase || !window.CB?.SUPABASE_URL || !window.CB?.SUPABASE_KEY){
    ctx.isLoading = false;
    window.ctx = ctx;
    try{ if(typeof renderCTAs==='function') renderCTAs(); }catch(_e){}
    try{ if(typeof updateStickyCTA==='function') updateStickyCTA(); }catch(_e){}
    return;
  }

  // --- Dashboard-style CSV helpers (local, no dependency on /api.js) ---
  async function getCSV(url){
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error("Failed to load CSV");
    const text = await res.text();
    return parseCSV(text);
  }

  function parseCSV(text){
    const lines = String(text||"").replace(/\r/g,"").split("\n").filter(Boolean);
    if(!lines.length) return [];
    const head = splitCSVLine(lines[0]).map(h => low(h));
    const out = [];
    for(let i=1;i<lines.length;i++){
      const cols = splitCSVLine(lines[i]);
      const row = {};
      head.forEach((h, idx) => row[h] = (cols[idx] ?? "").trim());
      out.push(row);
    }
    return out;
  }

  function splitCSVLine(line){
    const out = [];
    let cur = "";
    let q = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch === '"'){
        if(q && line[i+1] === '"'){ cur += '"'; i++; }
        else q = !q;
      } else if(ch === "," && !q){
        out.push(cur); cur="";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  const supa = window.supabase.createClient(window.CB.SUPABASE_URL, window.CB.SUPABASE_KEY);

  let user = null;
  try{
    const { data } = await supa.auth.getUser();
    user = data?.user || null;
  }catch(_e){ user = null; }

  if(!user?.email){
  // Logged out: stop "checking…" state and render normal CTAs
  ctx.isLoggedIn = false;
  ctx.email = "";
  ctx.playerId = "";
  ctx.isRegistered = false;
  ctx.hasCompeted = false;
  ctx.isLoading = false;
  window.ctx = ctx;
  try{ if(typeof renderCTAs==='function') renderCTAs(); }catch(_e){}
  try{ if(typeof updateStickyCTA==='function') updateStickyCTA(); }catch(_e){}
  return;
}

  ctx.isLoggedIn = true;
  ctx.email = user.email;

  // Dashboard-style: ensure profile row exists
  async function ensureProfileRow(){
    const email = low(user.email);
    if(!email) return null;

    let row = null;
    try{
      const { data, error } = await supa
        .from("profiles")
        .select("email,user_id,player_id,player_name,role")
        .eq("email", email)
        .maybeSingle();
      if(error) throw error;
      row = data || null;
    }catch(_e){ row = null; }

    if(!row){
      try{
        const ins = await supa
          .from("profiles")
          .insert([{ email, user_id: user.id, role: "user" }])
          .select("email,user_id,player_id,player_name,role")
          .maybeSingle();
        if(ins.error) throw ins.error;
        row = ins.data || null;
      }catch(_e){ row = null; }
    }
    return row;
  }

  const prof = await ensureProfileRow();

  // NOTE: player_id can be 0, so don't treat falsy as missing
  const pidRaw = prof?.player_id;
  const pidSafe = safe(pidRaw);
  if(pidRaw === undefined || pidRaw === null || pidSafe === "") {
    // Keep logged-in state, but cannot determine registration without Player ID
    ctx.playerId = "";
    ctx.isRegistered = false;
    ctx.hasCompeted = false;
    ctx.isLoading = false;

    // render the correct "logged in but not registered" UI immediately
    window.ctx = ctx;
    try{ renderCTAs(ctx); }catch(_e){}
    try{ updateStickyCTA(ctx); }catch(_e){}
    try{ const s = $("authSyncStatus"); if(s) s.textContent = "Account synced"; }catch(_e){}
    return;
  }

  ctx.playerId = pidSafe;

  // Upcoming registration check (CC2026)
  try{
    const upcoming = await getCSV(window.CB.CSV_UPCOMING) || [];
    const up = upcoming.find(r =>
      low(r.comp_id) === "cc2026" &&
      (safe(r.player_id) === ctx.playerId || low(r.email) === low(ctx.email))
    );
    ctx.isRegistered = !!up;
  }catch(_e){ ctx.isRegistered = false; }

  // Has competed check
  try{
    const rankings = await getCSV(window.CB.CSV_RANKINGS) || [];
    const rk = rankings.find(r => low(r.comp_id) === "cc2026" && safe(r.player_id) === ctx.playerId);
    ctx.hasCompeted = !!rk;
  }catch(_e){ ctx.hasCompeted = false; }

  // Expose for other modules/UI (sticky CTA reads window.ctx)
  ctx.isLoading = false;
  saveCtxCache(ctx);
  window.ctx = ctx;
  try{ if(typeof renderCTAs==='function') renderCTAs(); }catch(_e){}
  try{ if(typeof updateStickyCTA==='function') updateStickyCTA(); }catch(_e){}
  try{ if(typeof updateStickyCTA==='function') updateStickyCTA(); }catch(_e){}
}

/* ============================================
   CTA RENDERING (UPDATED AS REQUESTED)
   - NO "Get Notified"
   - Treat registration as open-from-now (if regStart missing)
   - Show "Registered" when logged-in + registered
   ============================================ */
function makePill(text, cls = ""){
  const s = document.createElement("span");
  s.className = `pill ${cls}`.trim();
  s.textContent = text;
  return s;
}

function makeLoginBtn(text="Login / Sign Up"){
  // Dedicated CC2026 login flow (returns to this page after auth)
  const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
  const a = makeBtn(text, `./login/?mode=signin&next=${next}`, "btn-secondary");
  a.addEventListener("click", () => {
    try{ localStorage.setItem("cb_return_to", window.location.href); }catch(_e){}
  });
  return a;
}

function makeBtn(text, href, cls = "", newTab = false){
  const a = document.createElement("a");
  a.className = `btn ${cls}`.trim();
  a.textContent = text;
  a.href = href;
  if(newTab){
    a.target = "_blank";
    a.rel = "noopener";
  }
  return a;
}

function makeDisabledBtn(text, cls = ""){
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn ${cls} isDisabled`.trim();
  b.textContent = text;
  b.disabled = true;
  b.setAttribute("aria-disabled", "true");
  return b;
}

function renderCTAs(){
  const pills = $("heroPills");
  const feePills = $("feePills");
  const row = $("ctaRow");
  const footer = $("footerCtas");
  const note = $("ctaNote");

  if(pills) pills.innerHTML = "";
  if(feePills) feePills.innerHTML = "";
  if(row) row.innerHTML = "";
  if(footer) footer.innerHTML = "";

  const now = Date.now();
  const open = parseIST(CC2026.regStartIST || nowISTString()) || now;
  const close = parseIST(CC2026.regEndIST);
  const end = parseIST(CC2026.seasonEndIST);

  // Pills
  if(now < close) pills?.appendChild(makePill("REGISTRATION LIVE", "gold"));
  else pills?.appendChild(makePill("REGISTRATION CLOSED", "red"));


  if(ctx.isLoading) pills?.appendChild(makePill("SYNCING…", "yellow"));
  if(!ctx.isLoading && ctx.isLoggedIn) pills?.appendChild(makePill("LOGGED IN", "neutral"));
  if(!ctx.isLoading && ctx.isRegistered) pills?.appendChild(makePill("REGISTERED", "green"));
// Fee phase pills (early bird / normal)
  const earlyBirdEnd = parseIST(CC2026.earlyBirdEndIST);
  const earlyLive = Number.isFinite(earlyBirdEnd) ? (now < earlyBirdEnd) : false;
  const normalLive = Number.isFinite(earlyBirdEnd) ? (now >= earlyBirdEnd) : true;

  // If early bird is live -> show both pills
  // If normal is live -> show only normal and hide early completely in calculator init
  const feePillsHost = $("feePills") || pills; // if you create separate fee pill container, it will use it
  if(feePillsHost){
    if(earlyLive){
      feePillsHost.appendChild(makePill("EARLY BIRD: CURRENT", "green"));
      feePillsHost.appendChild(makePill("NORMAL: UPCOMING", "yellow"));
    }else{
      // Normal is live: show Normal as CURRENT (green) and Early Bird as PAST (red)
      feePillsHost.appendChild(makePill("EARLY BIRD: PAST", "red"));
      feePillsHost.appendChild(makePill("NORMAL: CURRENT", "green"));
    }
  }

  // Buttons
  const add = (wrap) => {
    if(!wrap) return;


    // Prevent wrong clicks while user status is still syncing
    if(ctx.isLoading){
      wrap.appendChild(makeDisabledBtn("Checking status…", "btn-secondary"));
      wrap.appendChild(makeBtn("Fees Calculator", "#fees", "btn-secondary"));
      wrap.appendChild(makeDisabledBtn("Checking…", "btn-secondary"));
      return;
    }
    if(now < close){
      if(ctx.isLoggedIn && ctx.isRegistered){
        // requested: show Registered instead of register now
        wrap.appendChild(makeDisabledBtn("Registered", "btn-success"));
      }else{
        wrap.appendChild(makeBtn("Register Now", CC2026.registerLink, "btn-primary", true));
      }
      wrap.appendChild(makeBtn("Fees Calculator", "#fees", "btn-secondary"));
    }else if(now < end){
      if(ctx.isRegistered){
        wrap.appendChild(makeBtn("Compete Now", CC2026.competeUrl("cc2026"), "btn-primary"));
      }else{
        wrap.appendChild(makeBtn("Registration Closed", "#fees", "btn-secondary"));
      }
    }else{
      wrap.appendChild(makeBtn("View Results", CC2026.resultsUrl("cc2026"), "btn-primary"));
    }
  // Account button
    if(ctx.isLoggedIn){
      // Dashboard for CC2026 + small sign out text (requested)
      wrap.appendChild(makeBtn("Dashboard", "./dashboard/", "btn-secondary"));
      const so = document.createElement("span");
      so.className = "cc-signout-link";
      so.textContent = "Sign out";
      so.title = "Sign out of your Cubeology account";
      so.addEventListener("click", async () => {
        try{
          const supa = window.supabase.createClient(window.CB.SUPABASE_URL, window.CB.SUPABASE_KEY);
          await supa.auth.signOut();
        }catch(_e){}
        try{ location.reload(); }catch(_e){}
      });
      wrap.appendChild(so);
    }else{
      wrap.appendChild(makeLoginBtn("Login / Sign Up"));
    }

  };


  add(row);
  add(footer);

  if(note){
    note.textContent = "Registration status may take some time to update after payment.";
  }
}

/* ============================================
   FEES CALCULATOR (NEW LOGIC)
   Works if your HTML has these IDs:
   - feeCalcWrap (container)
   - feeModeAuto / feeModeEarly / feeModeNormal (toggle buttons)
   - feeEventsSelect (select for number of events)
   - feeBreakdown (small text area)
   - feeTotal (final total)
   ============================================ */
function rupee(n){
  const x = Math.max(0, Math.round(n || 0));
  return `₹${x.toLocaleString("en-IN")}`;
}

function setText(id, txt){
  const el = $(id);
  if(el) el.textContent = txt;
}

function initFeesCalculator(){
  const wrap = $("feeCalcWrap");
  const sel = $("feeEventsSelect");
  const totalEl = $("feeTotal");
  const breakdownEl = $("feeBreakdown");

  // toggles (optional)
  const tAuto  = $("feeModeAuto");
  const tEarly = $("feeModeEarly");
  const tNorm  = $("feeModeNormal");

  if(!wrap || !sel || !totalEl) return;

  const now = Date.now();
  const earlyBirdStart = parseIST(CC2026.earlyBirdStartIST);
  const earlyBirdEnd = parseIST(CC2026.earlyBirdEndIST);

  const dateEarly = (Number.isFinite(earlyBirdStart) ? (now >= earlyBirdStart) : true) &&
                    (Number.isFinite(earlyBirdEnd) ? (now <= earlyBirdEnd) : false);

  // Early Bird applies only if date window is valid AND cap not reached
  let capEarly = true;
  try{ capEarly = isEarlyBirdCapOpen(); }catch(_e){ capEarly = true; }

  const earlyLive = dateEarly && capEarly;
  const normalLive = !earlyLive;

  // If normal is live: remove early bird pricing completely
  if(normalLive && !earlyLive){
    if(tEarly) tEarly.style.display = "none";
    if(tAuto)  tAuto.style.display  = "none"; // auto no longer needed because early removed
  }

  let mode = "auto"; // default auto-detect
  if(normalLive && !earlyLive) mode = "normal";

  const setActiveToggle = () => {
    const all = [tAuto,tEarly,tNorm].filter(Boolean);
    all.forEach(b => b.classList.remove("active"));

    const pick = (mode === "auto") ? tAuto : (mode === "early" ? tEarly : tNorm);
    pick?.classList.add("active");
  };

  const getEffectiveMode = () => {
    if(normalLive && !earlyLive) return "normal"; // forced
    if(mode === "auto"){
      return earlyLive ? "early" : "normal";
    }
    return mode;
  };

  const calc = () => {
    const nEvents = Math.max(0, parseInt(sel.value || "0", 10) || 0);
    const em = getEffectiveMode();

    const conf = (em === "early") ? CC2026.fee.early : CC2026.fee.normal;

    // Pricing as requested:
    // Early Bird: ₹299 base + ₹100 per event  -> 1 event = ₹399
    // Normal:     ₹399 base + ₹100 per event  -> 1 event = ₹499
    const total = conf.base + conf.perEvent * nEvents;

    totalEl.textContent = rupee(total);

    if(breakdownEl){
      const label = (em === "early") ? "Early Bird" : "Normal";
      breakdownEl.textContent =
        `${label} Fees: ${rupee(conf.base)} base + ${rupee(conf.perEvent)} × ${nEvents} event${nEvents===1?"":"s"}`;
    }

    // Optional: add pills if you placed these IDs
    const pillEarly = $("feePillEarly");
    const pillNorm  = $("feePillNormal");

    if(pillEarly) pillEarly.className = `pill ${earlyLive ? "green" : "yellow"}`;
    if(pillNorm)  pillNorm.className  = `pill ${normalLive ? "gold" : "yellow"}`;

    if(pillEarly) pillEarly.textContent = earlyLive ? "Early Bird: Current" : "Early Bird: Ended";
    if(pillNorm)  pillNorm.textContent  = normalLive ? "Normal: Current" : "Normal: Upcoming";
  };

  const onToggle = (m) => {
    mode = m;
    setActiveToggle();
    calc();
  };

  // bind
  sel.addEventListener("change", calc);
  sel.addEventListener("input", calc);

  tAuto?.addEventListener("click", () => onToggle("auto"));
  tEarly?.addEventListener("click", () => onToggle("early"));
  tNorm?.addEventListener("click", () => onToggle("normal"));

  setActiveToggle();
  calc();
}

/* ============================================
   PRIZE POOL COUNT-UP (NEW)
   - Animates ₹60,000+ from 0 to 60,000 when the element enters viewport
   ============================================ */
function fmtNumberWithCommas(n){
  try{ return Number(n).toLocaleString("en-IN"); }catch(_e){ return String(n); }
}

function animateCountUp(el, target, durationMs=850){
  if(!el) return;
  const prefix = el.getAttribute("data-prefix") || "₹";
  const suffix = el.getAttribute("data-suffix") || "+";
  const t0 = performance.now();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const step = (now) => {
    const p = Math.min(1, (now - t0) / durationMs);
    const v = Math.round(target * easeOutCubic(p));
    el.textContent = `${prefix}${fmtNumberWithCommas(v)}${suffix}`;
    if(p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initPrizePoolCountUp(){
  const els = Array.from(document.querySelectorAll("[data-countup]"));
  if(!els.length) return;

  const fire = (el) => {
    if(el.dataset.counted === "1") return;
    el.dataset.counted = "1";
    const target = parseInt(el.getAttribute("data-countup") || "0", 10) || 0;
    animateCountUp(el, target, 850);
  };

  // Start at ₹0+ (keeps the same prefix/suffix)
  els.forEach(el => {
    const prefix = el.getAttribute("data-prefix") || "₹";
    const suffix = el.getAttribute("data-suffix") || "+";
    el.textContent = `${prefix}0${suffix}`;
    el.dataset.counted = "0";
  });

  if("IntersectionObserver" in window){
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if(en.isIntersecting) fire(en.target); });
    }, { threshold: 0.35 });
    els.forEach(el => io.observe(el));
  }else{
    els.forEach(el => fire(el));
  }
}


/* ============================================
   TIMELINE STATE HIGHLIGHT (OPTIONAL)
   - Adds .past / .active on timeline items if your HTML uses:
     <div class="timeline-item" data-start="DD/MM/YYYY HH:MM:SS" data-end="..."></div>
   ============================================ */

/* ============================================
   TIMELINE TEXT OVERRIDES (ADD-ON ONLY)
   - Updates visible timeline labels to match latest requested dates
   - Does NOT affect any logic (data-start/data-end remain used for state highlight)
   ============================================ */


function initTimelineStateHighlight(){
  const items = [...document.querySelectorAll(".timeline-item[data-start]")];
  if(!items.length) return;

  const now = Date.now();

  items.forEach(it => {
    const s = parseIST(it.dataset.start);
    const e = parseIST(it.dataset.end || it.dataset.start);
    it.classList.remove("past", "active");

    if(Number.isFinite(e) && now > e){
      it.classList.add("past");
    }else if(Number.isFinite(s) && now >= s){
      it.classList.add("active");
    }else{
      // future: keep default (faded by CSS)
    }
  });
}

/* ============================================
   TABS NAVIGATION (UNCHANGED)
   ============================================ */
function getTabButtons(){ return [...document.querySelectorAll(".tabBtn")]; }

function markActiveTab(tab){
  const buttons = getTabButtons();
  const target = low(tab || "overview");
  const valid = new Set(buttons.map(b => low(b.dataset.tab)));
  const final = valid.has(target) ? target : "overview";

  buttons.forEach(b => {
    const on = low(b.dataset.tab) === final;
    b.classList.toggle("isActive", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  const curr = low(location.hash || "").replace("#", "");
  if(curr !== final){
    history.replaceState(null, "", `${location.pathname}${location.search}#${final}`);
  }
}

function setActiveTab(tab){
  markActiveTab(tab);
  const sec = document.getElementById(low(tab));
  if(sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initTabs(){
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".tabBtn");
    if(!b) return;
    e.preventDefault();
    setActiveTab(b.dataset.tab);
  });

  window.addEventListener("load", () => {
    const tab = low(location.hash || "").replace("#", "") || "overview";
    setActiveTab(tab);
  });

  window.addEventListener("hashchange", () => {
    const tab = low(location.hash || "").replace("#", "") || "overview";
    setActiveTab(tab);
  });
}

/* ============================================
   PREMIUM ANIMATIONS & EFFECTS (UNCHANGED)
   ============================================ */

// Particle Background
function initParticles(){
  const canvas = $("particleCanvas");
  if(!canvas) return;

  const ctx2d = canvas.getContext("2d");
  let particles = [];
  let animationId;
  let isActive = true;

  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticles(){
    particles = [];
    const count = window.innerWidth < 768 ? 25 : 50;
    for(let i = 0; i < count; i++){
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.2
      });
    }
  }

  function draw(){
    if(!isActive) return;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;

      if(p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if(p.y < 0 || p.y > canvas.height) p.vy *= -1;

      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx2d.fillStyle = `rgba(255, 215, 0, ${p.opacity})`;
      ctx2d.fill();

      // Connect nearby particles
      for(let j = i + 1; j < particles.length; j++){
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if(dist < 100){
          ctx2d.beginPath();
          ctx2d.moveTo(p.x, p.y);
          ctx2d.lineTo(p2.x, p2.y);
          ctx2d.strokeStyle = `rgba(255, 215, 0, ${0.1 * (1 - dist / 100)})`;
          ctx2d.stroke();
        }
      }
    });

    animationId = requestAnimationFrame(draw);
  }

  resize();
  createParticles();
  draw();

  window.addEventListener("resize", () => {
    resize();
    createParticles();
  });

  // Pause when not visible
  document.addEventListener("visibilitychange", () => {
    if(document.hidden){
      isActive = false;
      cancelAnimationFrame(animationId);
    }else{
      isActive = true;
      draw();
    }
  });
}

// Scroll Progress
let _raf = 0;
function updateScrollProgress(){
  const bar = $("scrollProgress");
  if(!bar) return;
  const doc = document.documentElement;
  const max = (doc.scrollHeight - doc.clientHeight) || 1;
  const p = Math.min(1, Math.max(0, window.scrollY / max));
  bar.style.width = `${p * 100}%`;
}

function initScrollProgress(){
  const onScroll = () => {
    if(_raf) return;
    _raf = requestAnimationFrame(() => {
      _raf = 0;
      updateScrollProgress();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  updateScrollProgress();
}

// Navbar Scroll Effect
function initNavbarScroll(){
  const navbar = $("navbar");
  if(!navbar) return;

  const onScroll = () => {
    if(window.scrollY > 50) navbar.classList.add("navbar-scrolled");
    else navbar.classList.remove("navbar-scrolled");
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// Counter Animation
function animateCounters(){
  const counters = document.querySelectorAll(".counter");

  counters.forEach(counter => {
    const target = parseInt(counter.dataset.target);
    if(!Number.isFinite(target)) return;

    const duration = 2000;
    const start = performance.now();

    function update(currentTime){
      const elapsed = currentTime - start;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(easeOut * target);

      counter.textContent = current.toLocaleString();

      if(progress < 1) requestAnimationFrame(update);
      else counter.textContent = target.toLocaleString();
    }

    requestAnimationFrame(update);
  });
}

// Hero Entrance Animation
function initHeroAnimation(){
  setTimeout(() => {
    const line1 = $("titleLine1");
    const line2 = $("titleLine2");
    const subtitle = $("heroSubtitle");
    const stats = document.querySelectorAll(".stat-card");
    const countdown = $("countdownBox");
    const ctaArea = $("ctaArea");

    if(line1) line1.classList.add("animated");
    if(line2) setTimeout(() => line2.classList.add("animated"), 200);
    if(subtitle) setTimeout(() => subtitle.classList.add("animated"), 400);

    stats.forEach((stat, i) => {
      setTimeout(() => stat.classList.add("animated"), 500 + i * 100);
    });

    if(countdown) setTimeout(() => countdown.classList.add("animated"), 800);
    if(ctaArea) setTimeout(() => ctaArea.classList.add("animated"), 1000);

    setTimeout(animateCounters, 600);
  }, 300);
}

// Scroll Reveal Animation
function initScrollReveal(){
  if(!("IntersectionObserver" in window)){
    document.querySelectorAll(".reveal, .reveal-left, .reveal-right, .reveal-scale").forEach(el => {
      el.classList.add("visible");
    });
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(prefersReducedMotion){
    document.querySelectorAll(".reveal, .reveal-left, .reveal-right, .reveal-scale").forEach(el => {
      el.classList.add("visible");
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
  });

  document.querySelectorAll(".reveal, .reveal-left, .reveal-right, .reveal-scale").forEach(el => {
    observer.observe(el);
  });
}

// Active Section Observer
function initActiveSectionObserver(){
  if(!("IntersectionObserver" in window)) return;

  const ids = ["overview", "dates", "format", "fees", "rules", "referral", "winners", "faq"];
  const sections = ids.map(id => document.getElementById(id)).filter(Boolean);
  if(!sections.length) return;

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if(visible?.target?.id) markActiveTab(visible.target.id);
  }, { threshold: [0.2, 0.4, 0.6] });

  sections.forEach(s => observer.observe(s));
}

// FAQ Accordion
function initFAQ(){
  const faqItems = document.querySelectorAll(".faq-item");

  faqItems.forEach(item => {
    const question = item.querySelector(".faq-question");
    if(!question) return;

    question.addEventListener("click", () => {
      const isActive = item.classList.contains("active");

      faqItems.forEach(i => {
        i.classList.remove("active");
        const q = i.querySelector(".faq-question");
        if(q) q.setAttribute("aria-expanded", "false");
      });

      if(!isActive){
        item.classList.add("active");
        question.setAttribute("aria-expanded", "true");
      }
    });
  });
}

// Mobile Menu Toggle
function initMobileMenu(){
  const toggle = $("mobileMenuToggle");
  const tabs = document.querySelector(".navbar-tabs");

  if(!toggle || !tabs) return;

  if(!tabs.id) tabs.id = "mobileNavTabs";
  toggle.setAttribute("aria-controls", tabs.id);
  toggle.setAttribute("aria-expanded", "false");

  const close = () => {
    toggle.classList.remove("active");
    tabs.classList.remove("mobile-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    toggle.classList.add("active");
    tabs.classList.add("mobile-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    if(tabs.classList.contains("mobile-open")) close();
    else open();
  });

  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tabBtn");
    if(!btn) return;
    close();
  });

  document.addEventListener("click", (e) => {
    if(!tabs.classList.contains("mobile-open")) return;
    if(e.target.closest("#" + toggle.id)) return;
    if(e.target.closest(".navbar-tabs")) return;
    close();
  });

  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape") close();
  });

  window.addEventListener("resize", () => {
    if(window.innerWidth > 1024) close();
  }, { passive: true });
}

/* ============================================
   BOOT SEQUENCE (UPDATED ORDER)
   ============================================ */
document.addEventListener("DOMContentLoaded", async () => {
  try{
    // Premium features
    initParticles();
    initTabs();
    initScrollProgress();
    initNavbarScroll();
    initScrollReveal();
    initActiveSectionObserver();
    initFAQ();
    initMobileMenu();
    initHeroAnimation();

    // Seamless marquee (preserved)
    (function makeEventsMarqueeSeamless(){
      const track = document.querySelector(".events-track");
      if(!track) return;
      if(track.dataset.duplicated === "1") return;
      track.innerHTML += track.innerHTML;
      track.dataset.duplicated = "1";
    })();

    // NEW: read comp meta from Competitions CSV before rendering timing + countdown + CTAs
    await loadCompetitionMeta();

    // Core functionality
    renderTiming();
    // Early Bird urgency (static cap text)
    initRegistrationsMeter();
// Fast UI sync: use cached login/registration state immediately (then refresh from network)
    preloadUserContext();

    const ctxPromise = loadUserContext();
    // Render immediately in "syncing" mode to prevent wrong clicks
    renderCTAs();
    await ctxPromise;
    renderCTAs();
    // Refresh urgency + fees after async loads
    initRegistrationsMeter();
    // NEW: calculator + timeline state (only works if DOM supports)
    initFeesCalculator();
    initTimelineStateHighlight();

  }catch(err){
    console.error("CC2026 boot error:", err);
    try{ ctx.isLoading = false; window.ctx = ctx; }catch(_e){}
try{ renderTiming(); startCountdown(); }catch(_e){}
    try{ renderCTAs(); }catch(_e){}
  }
});


/* ============================================
   STICKY REGISTER CTA (ADD-ON, NO CORE LOGIC CHANGE)
   - Clean floating CTA on mobile + desktop
   - Mirrors CTA state: Register / Registered / Compete / Results
   ============================================ */
function updateStickyCTA(){
  const btn = $("stickyRegisterBtn");
  if(!btn) return;

  const now = Date.now();
  const close = parseIST(CC2026.regEndIST);
  const end = parseIST(CC2026.seasonEndIST);

  // Hide by default
  btn.style.display = "none";

  if(ctx.isLoading) return;

  // Show sticky REGISTER ONLY if:
  // - user logged in
  // - NOT registered
  // - registration still open
  if(!ctx.isRegistered && now < close){
    btn.textContent = "Register Now";
    btn.href = CC2026.registerLink;
    btn.style.display = "inline-flex";
    return;
  }

  // Compete phase
  if(ctx.isRegistered && now >= close && now < end){
    btn.textContent = "Compete Now";
    btn.href = CC2026.competeUrl("cc2026");
    btn.style.display = "inline-flex";
    return;
  }
}

// Keep click behavior simple + consistent
window.addEventListener("DOMContentLoaded", () => {
  // Run a few times as user context loads async
  updateStickyCTA();
  setTimeout(updateStickyCTA, 600);
  setTimeout(updateStickyCTA, 1500);
  setTimeout(updateStickyCTA, 3000);
});



(function landingReturnHook(){
  try{
    const u = new URL(window.location.href);
    const ret = u.searchParams.get("return");
    if(ret){
      // If someone opens landing with ?return=..., just clean it for UX
      u.searchParams.delete("return");
      history.replaceState({}, "", u.toString());
    }
  }catch(_e){}
})();



try{ initPrizePoolCountUp(); }catch(_e){}