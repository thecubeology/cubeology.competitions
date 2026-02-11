/* competitions.js — FINAL (Account-aware Register → Registered → Compete → Results)
   ✅ Details default: /competitions/view/?id=comp_id
   ✅ Details custom (only if flagged): /competitions/comp_id/
   ✅ Results default: /competitions/results/?id=comp_id
   ✅ Results custom (only if flagged): /competitions/comp_id/results/
   ✅ Compete page: /competitions/view/compete/?id=comp_id
   ✅ Register Now until reg_end (exact IST timestamp)
   ✅ After reg_end:
        - If REGISTERED: show Compete Now (until competition ends)
        - If NOT registered: show Registration Closed (NOW A RED PILL, not a link)
   ✅ After competition ends: View Results

   ✅ Past comps badge:
       - Default shows "PAST"
       - If logged-in user has competed in that past comp (based on CSV_RANKINGS like dashboard),
         show "COMPETED" instead of "PAST"
*/

const IST_OFFSET_MIN = 330;
const DAY_MS = 24 * 60 * 60 * 1000;

function safe(v){ return (v ?? "").toString().trim(); }
function low(v){ return safe(v).toLowerCase(); }
function isTruthy(v){
  const x = low(v);
  return x === "true" || x === "yes" || x === "1";
}


function parseISTDate(s){
  // Accepts:
  // - "01/02/2026 00:00:00" (DD/MM/YYYY HH:MM:SS) assumed IST
  // - ISO strings
  // Returns a Date object (UTC-based) representing that IST moment.
  const raw = safe(s);
  if(!raw) return null;

  // DD/MM/YYYY HH:MM:SS
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){
    const dd = parseInt(m[1],10);
    const mm = parseInt(m[2],10);
    const yyyy = parseInt(m[3],10);
    const HH = parseInt(m[4]||"00",10);
    const MI = parseInt(m[5]||"00",10);
    const SS = parseInt(m[6]||"00",10);
    // Convert IST -> UTC by subtracting 5:30
    const utcMs = Date.UTC(yyyy, mm-1, dd, HH, MI, SS) - (5.5*60*60*1000);
    return new Date(utcMs);
  }

  // Try ISO / other Date-parsable formats
  const d = new Date(raw);
  if(!isNaN(d.getTime())) return d;

  return null;
}

function toNum(v){
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

/* ---------------- ROUTING HELPERS ---------------- */

function compIdLower(c){
  return low(c?.comp_id);
}

/** Custom details page? (ONLY if you still have a folder /competitions/<id>/ ) */
function isCustomComp(c){
  const pt = low(c?.page_type);
  return pt === "custom" || pt === "folder" || pt === "special";
}

/** Custom results page? (folder exists like /competitions/<id>/results/) */
function isCustomResultsComp(c){
  const pt = low(c?.page_type);
  const rpt = low(c?.results_page_type);
  const flag = isTruthy(c?.results_custom);
  return rpt === "custom" || flag || pt === "custom_results";
}

function detailsLinkForComp(c){
  const id = compIdLower(c);
  if(!id) return "/competitions/";
  return isCustomComp(c)
    ? `/competitions/${encodeURIComponent(id)}/`
    : `/competitions/view/?id=${encodeURIComponent(id)}`;
}

function resultsLinkForComp(c){
  const id = compIdLower(c);
  if(!id) return "/competitions/";
  return isCustomResultsComp(c)
    ? `/competitions/${encodeURIComponent(id)}/results/`
    : `/competitions/results/?id=${encodeURIComponent(id)}`;
}

function competeLinkForComp(c){
  const id = compIdLower(c);
  if(!id) return "/competitions/";
  return `/competitions/view/compete/?id=${encodeURIComponent(id)}`;
}

function registerLinkForComp(c){
  // Primary: register_url (new column). Back-compat: register_link.
  return safe(c.register_url) || safe(c.register_link);
}

/* ---------------- DATE / STATE ---------------- */

function dateOnlyText(s){
  const t = safe(s);
  return t ? t.split(" ")[0] : "";
}

function parseIST(s){
  const t = safe(s);
  if(!t) return null;

  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(m){
    const dd=+m[1], mm=+m[2], yyyy=+m[3], hh=+m[4], min=+m[5], ss=+(m[6] || 0);
    return Date.UTC(yyyy, mm-1, dd, hh, min, ss) - IST_OFFSET_MIN*60*1000;
  }

  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const dd=+m[1], mm=+m[2], yyyy=+m[3];
    return Date.UTC(yyyy, mm-1, dd, 0, 0, 0) - IST_OFFSET_MIN*60*1000;
  }

  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m){
    const yyyy=+m[1], mm=+m[2], dd=+m[3];
    return Date.UTC(yyyy, mm-1, dd, 0, 0, 0) - IST_OFFSET_MIN*60*1000;
  }

  return null;
}

/** IST end-of-day for a date (23:59:59.999 IST) */
function endOfDayIST(dateStr){
  const start = parseIST(dateOnlyText(dateStr));
  if(start == null) return null;
  return start + DAY_MS - 1;
}

/** comp_date might be "dd/mm/yyyy - dd/mm/yyyy": use LAST date for end-of-day */
function compDateEndOfDayIST(compDateText){
  const t = safe(compDateText);
  if(!t) return null;
  const parts = t.split(/\s*-\s*/).map(x => safe(x)).filter(Boolean);
  const last = parts.length >= 2 ? parts[parts.length - 1] : t;
  return endOfDayIST(last);
}

function normalizeSingleDate(t){
  const s = safe(t).split(" ")[0];
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const dd = m[1].padStart(2,"0");
    const mm = m[2].padStart(2,"0");
    const yy = m[3].slice(-2);
    return `${dd}/${mm}/${yy}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m){
    const yy = m[1].slice(-2);
    const mm = m[2].padStart(2,"0");
    const dd = m[3].padStart(2,"0");
    return `${dd}/${mm}/${yy}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if(m){
    const dd = m[1].padStart(2,"0");
    const mm = m[2].padStart(2,"0");
    const yy = m[3].padStart(2,"0");
    return `${dd}/${mm}/${yy}`;
  }
  return safe(t).split(" IST")[0];
}

function normalizeCompDateText(s){
  const t = safe(s);
  if(!t) return "";
  const parts = t.split(/\s*-\s*/);
  if(parts.length === 2){
    const a = normalizeSingleDate(parts[0]);
    const b = normalizeSingleDate(parts[1]);
    return [a,b].filter(Boolean).join(" - ");
  }
  return normalizeSingleDate(t);
}

/* Competition state pill logic */
function compState(c, now){
  if(c._compEnded) return "ended";
  const cs = c._cs;
  const ce = c._ce;
  if(cs && ce && now >= cs && now <= ce) return "ongoing";
  if(cs && now < cs) return "upcoming";
  return "scheduled";
}

function regState(c, now){
  if(low(c.reg_sold) === "sold" || low(c.reg_sold) === "soldout") return "soldout";
  const cap = toNum(c.reg_capacity);
  const sold = toNum(c.reg_sold);
  if(cap != null && sold != null && sold >= cap) return "soldout";

  const rs = parseIST(c.reg_start);
  const re = parseIST(c.reg_end);

  if(rs && now < rs) return "soon";
  if(re && now > re) return "closed";
  if(rs || re) return "open";
  return "unknown";
}

/* ---------------- USER CONTEXT (LOGIN + REGISTRATION + COMPETED) ---------------- */

let USER_CTX = {
  loggedIn: false,
  playerId: "",
  registeredCompIds: new Set(), // from CSV_UPCOMING
  competedCompIds: new Set(),   // from CSV_RANKINGS
};

function needAuthConfig(){
  return !!(window.CB?.SUPABASE_URL && window.CB?.SUPABASE_KEY && window.supabase?.createClient);
}

async function ensureProfileRow(supabaseClient, user){
  const email = low(user?.email);
  if(!email) return null;

  const sel = await supabaseClient
    .from("profiles")
    .select("email,user_id,player_id,role")
    .eq("email", email)
    .maybeSingle();

  if(sel.error) throw sel.error;

  let row = sel.data || null;

  if(!row){
    const ins = await supabaseClient
      .from("profiles")
      .insert([{ email, user_id: user.id, role: "user" }])
      .select("email,user_id,player_id,role")
      .maybeSingle();

    if(ins.error) throw ins.error;
    row = ins.data || null;
  }

  return row;
}

async function loadUserContext(){
  if(!needAuthConfig()) return;

  try{
    const sb = window.supabase.createClient(window.CB.SUPABASE_URL, window.CB.SUPABASE_KEY);
    const { data } = await sb.auth.getUser();
    const user = data?.user;
    if(!user) return;

    USER_CTX.loggedIn = true;

    const prof = await ensureProfileRow(sb, user);
    const pid = safe(prof?.player_id);
    if(!pid) return;

    USER_CTX.playerId = pid;

    // Registered comps (upcoming)
    if(window.CB?.CSV_UPCOMING){
      const upRows = await window.CB_API.getCSV(window.CB.CSV_UPCOMING);
      (upRows || [])
        .filter(r => safe(r.player_id) === pid)
        .forEach(r => {
          const cid = low(r.comp_id);
          if(cid) USER_CTX.registeredCompIds.add(cid);
        });
    }

    // Competed comps (from rankings like dashboard)
    if(window.CB?.CSV_RANKINGS){
      const rkRows = await window.CB_API.getCSV(window.CB.CSV_RANKINGS);
      (rkRows || [])
        .filter(r => safe(r.player_id) === pid)
        .forEach(r => {
          const cid = low(r.comp_id);
          if(cid) USER_CTX.competedCompIds.add(cid);
        });
    }
  }catch(e){
    console.warn("Competitions: user context load failed", e);
  }
}

/* ---------------- UI HELPERS ---------------- */

function compactRegLine(c){
  if(c._competeWindow) return "Registration Closed";
  const r = c._reg;
  if(r === "closed") return "Registration Closed";
  if(r === "soon") return safe(c.reg_start) ? `Reg starts: ${safe(c.reg_start)}` : "Reg starts soon";
  if(r === "open") return safe(c.reg_end) ? `Reg ends: ${safe(c.reg_end)}` : "Reg open";
  if(r === "soldout") return "Sold Out";
  return "";
}

function modeBox(c){
  const m = safe(c.mode_label);
  if(!m) return "";
  return `<span class="modeBox">${m}</span>`;
}

function registeredPillHTML(){
  return `<span class="pill registered">✓ Registered</span>`;
}


function disabledPrimaryBtnHTML(label){
  return `<a class="btn primary disabled" href="#" aria-disabled="true">${label}</a>`;
}

function closedPillHTML(){
  // ✅ Red pill, not clickable
  return `<span class="pill closed">Registration Closed</span>`;
}

function badgePills(c){
  const s = c._state;
  const r = c._reg;
  const feat = c._featured ? `<span class="pill pink">FEATURED</span>` : ``;

  // Past state: PAST vs COMPETED (personalized)
  if(s === "ended"){
    const didCompete = !!(USER_CTX.playerId && USER_CTX.competedCompIds.has(compIdLower(c)));
    const pastPill = didCompete
      ? `<span class="pill green">COMPETED</span>`
      : `<span class="pill amber">PAST</span>`;
    return `${modeBox(c)}${feat}${pastPill}`;
  }

  const compPill =
    s === "ongoing" ? `<span class="pill cyan">ONGOING</span>` :
    s === "upcoming" ? `<span class="pill amber">UPCOMING</span>` :
    `<span class="pill">SCHEDULED</span>`;

  const regPill =
    c._competeWindow ? `<span class="pill pink">REG CLOSED</span>` :
    r === "open" ? `<span class="pill violet">REG OPEN</span>` :
    r === "soon" ? `<span class="pill">OPENS SOON</span>` :
    r === "closed" ? `<span class="pill pink">REG CLOSED</span>` :
    r === "soldout" ? `<span class="pill pink">SOLD OUT</span>` :
    ``;

  return `${modeBox(c)}${feat}${compPill}${regPill}`;
}

function cardHTML(c){
  const name = safe(c.comp_name) || safe(c.comp_id);
  const dateText = normalizeCompDateText(c.comp_date);

  const isPast = c._compEnded;
  const detailsHref = detailsLinkForComp(c);
  const resultsHref = resultsLinkForComp(c);
  const competeHref = competeLinkForComp(c);
  const regHref = registerLinkForComp(c);

  const regText = compactRegLine(c);
  const prizesWorth = safe(c.prizes_worth);

  const isRegistered = USER_CTX.playerId
    ? USER_CTX.registeredCompIds.has(compIdLower(c))
    : false;

  let actionsHTML = "";

  if(isPast){
    actionsHTML = `
      <a class="btn" href="${detailsHref}">View details</a>
      <a class="btn primary" href="${resultsHref}">View Results</a>
    `;
  }else{
    if(c._reg === "open"){
      if(isRegistered){
        actionsHTML = `
          <a class="btn" href="${detailsHref}">View details</a>
          ${registeredPillHTML()}
        `;
      }else{
        actionsHTML = `
          <a class="btn" href="${detailsHref}">View details</a>
          ${regHref
            ? `<a class="btn primary" href="${regHref}" target="_blank" rel="noopener">Register Now</a>`
            : disabledPrimaryBtnHTML("Register Link Soon")
          }
        `;
      }
    }
    else if(c._competeWindow){
      if(isRegistered){
        actionsHTML = `
          <a class="btn" href="${detailsHref}">View details</a>
          <a class="btn primary" href="${competeHref}">Compete Now</a>
        `;
      }else{
        // ✅ NOT registered → plain red pill (NOT a link)
        actionsHTML = `
          <a class="btn" href="${detailsHref}">View details</a>
          ${closedPillHTML()}
        `;
      }
    }else{
      // Not open, not compete window: show state-aware disabled CTA
      const label =
        (c._reg === "soon") ? "Regs Open Soon" :
        (c._reg === "closed") ? "Regs Closed" :
        (c._reg === "soldout") ? "Sold Out" :
        "Register Now";
      actionsHTML = `
        <a class="btn" href="${detailsHref}">View details</a>
        ${isRegistered ? registeredPillHTML() : disabledPrimaryBtnHTML(label)}
      `;
    }
}

  return `
    <div class="cCard">
      <div class="badgesRow">${badgePills(c)}</div>

      <div class="cTitle">${name}</div>
      <div class="cDate">${dateText || "—"}</div>

      ${(!isPast && regText) ? `<div class="cMeta"><b>${regText}</b></div>` : ``}
      ${safe(c.events) ? `<div class="cMeta"><b>Events:</b> ${safe(c.events)}</div>` : ``}

      ${
        (!isPast && prizesWorth)
          ? `<div class="cMeta"><span class="prizeInline">${prizesWorth}</span></div>`
          : ``
      }

      <div class="cActions">
        ${actionsHTML}
      </div>
    </div>
  `;
}

function setHTML(id, html){
  const el = document.getElementById(id);
  if(el) el.innerHTML = html;
}

function distinctEvents(list){
  const s = new Set();
  (list||[]).forEach(c=>{
    safe(c.events).split("|").map(x=>safe(x)).filter(Boolean).forEach(e=>s.add(e));
  });
  return Array.from(s).sort((a,b)=>a.localeCompare(b));
}
function distinctModes(list){
  const s = new Set();
  (list||[]).forEach(c=>{
    const m = safe(c.mode_label);
    if(m) s.add(m);
  });
  return Array.from(s).sort((a,b)=>a.localeCompare(b));
}

/* ---------------- STATE ---------------- */

let ALL = [];
let UP_LIMIT = 6;
let ON_LIMIT = 6;
let WANT_REG = "any";

function apply(){
  const now = Date.now();

  const feat =
    ALL.find(x => x._featured && (x._state === "upcoming" || x._state === "ongoing")) ||
    ALL.find(x => x._state === "upcoming") ||
    ALL.find(x => x._state === "ongoing") ||
    ALL.filter(x => x._state === "ended")
       .sort((a,b)=>(b._pastKey||b._compEndEOD||0)-(a._pastKey||a._compEndEOD||0))[0] ||
    ALL[0];

  if(feat){
    const name = safe(feat.comp_name) || safe(feat.comp_id);
    const poster = safe(feat.poster_url);
    const dateText = normalizeCompDateText(feat.comp_date);

    const detailsHref = detailsLinkForComp(feat);
    const resultsHref = resultsLinkForComp(feat);
    const competeHref = competeLinkForComp(feat);
    const regHref = registerLinkForComp(feat);

    const regText = compactRegLine(feat);
    const hook = safe(feat.short_hook) || "";
    const highlight = safe(feat.highlight_prizes);
    const prizesWorth = safe(feat.prizes_worth);

    const isRegistered = USER_CTX.playerId
      ? USER_CTX.registeredCompIds.has(compIdLower(feat))
      : false;

    let featuredActions = "";

    if(feat._compEnded){
      featuredActions = `
        <a class="btn" href="${detailsHref}">View Details</a>
        <a class="btn primary" href="${resultsHref}">View Results</a>
      `;
    }else if(feat._reg === "open"){
      if(isRegistered){
        featuredActions = `
          <a class="btn" href="${detailsHref}">View Details</a>
          ${registeredPillHTML()}
        `;
      }else{
        featuredActions = `
          <a class="btn" href="${detailsHref}">View Details</a>
          ${regHref
            ? `<a class="btn primary" href="${regHref}" target="_blank" rel="noopener">Register Now</a>`
            : disabledPrimaryBtnHTML("Register Link Soon")
          }
        `;
      }
    }
    else if(feat._competeWindow){
      if(isRegistered){
        featuredActions = `
          <a class="btn" href="${detailsHref}">View Details</a>
          <a class="btn primary" href="${competeHref}">Compete Now</a>
        `;
      }else{
        // ✅ NOT registered → plain red pill (NOT a link)
        featuredActions = `
          <a class="btn" href="${detailsHref}">View Details</a>
          ${closedPillHTML()}
        `;
      }
    }else{
      const label =
        (feat._reg === "soon") ? "Regs Open Soon" :
        (feat._reg === "closed") ? "Regs Closed" :
        (feat._reg === "soldout") ? "Sold Out" :
        "Register Now";
      featuredActions = `
        <a class="btn" href="${detailsHref}">View Details</a>
        ${isRegistered ? registeredPillHTML() : disabledPrimaryBtnHTML(label)}
      `;
    }
setHTML("featuredWrap", `
      <div class="featuredCard">
        <div class="poster">
          ${poster ? `<img src="${poster}" alt="${name} poster" loading="lazy">`
                   : `<div style="padding:16px;font-weight:950;color:rgba(15,23,42,.6);">No poster</div>`}
        </div>

        <div>
          <div class="badgesRow" style="margin-bottom:10px;">${badgePills(feat)}</div>
          <h1 class="fName">${name}</h1>
          <div class="fDate">${dateText || "—"}</div>

          ${hook ? `<div class="fHook">${hook}</div>` : ``}
          ${prizesWorth ? `<div class="fPrize">${prizesWorth}</div>` : ``}

          <div class="fGrid">
            ${safe(feat.events) ? `<div class="fItem">${safe(feat.events)}</div>` : ``}
            ${highlight ? `<div class="fItem">${highlight}</div>` : ``}
            ${regText ? `<div class="fItem"><b>${regText}</b></div>` : ``}
          </div>

          <div class="bannerActions">
            ${featuredActions}
          </div>
        </div>
      </div>
    `);
  }

  const qEl = document.getElementById("searchBox");
  const q = qEl ? low(qEl.value) : "";

  const eventSel = document.getElementById("eventSelect");
  const wantEvent = eventSel ? safe(eventSel.value) : "";

  const modeSel = document.getElementById("modeSelect");
  const wantMode = modeSel ? safe(modeSel.value) : "";

  const sortSel = document.getElementById("sortSelect");
  const wantSort = sortSel ? safe(sortSel.value) : "smart";

  let filtered = ALL.filter(c=>{
    if(q){
      const hay = `${low(c.comp_id)} ${low(c.comp_name)} ${low(c.events)} ${low(c.mode_label)}`;
      if(!hay.includes(q)) return false;
    }
    if(wantMode && safe(c.mode_label) !== wantMode) return false;
    if(wantEvent){
      const evs = safe(c.events).split("|").map(x=>safe(x));
      if(!evs.includes(wantEvent)) return false;
    }
    if(WANT_REG !== "any" && c._reg !== WANT_REG) return false;
    return true;
  });

  const byName = (a,b)=> (safe(a.comp_name)||safe(a.comp_id)).localeCompare(safe(b.comp_name)||safe(b.comp_id));
  const byStartAsc = (a,b)=>(a._cs||0)-(b._cs||0);
  const byStartDesc = (a,b)=>(b._cs||0)-(a._cs||0);
  const byEndedDesc = (a,b)=>(b._pastKey||b._compEndEOD||0)-(a._pastKey||a._compEndEOD||0);

  if(wantSort === "name_asc") filtered = filtered.slice().sort(byName);
  if(wantSort === "start_asc") filtered = filtered.slice().sort(byStartAsc);
  if(wantSort === "start_desc") filtered = filtered.slice().sort(byStartDesc);

  const upcomingAll = filtered.filter(c=>c._state === "upcoming").sort(byStartAsc);
  const ongoingAll  = filtered.filter(c=>c._state === "ongoing").sort(byStartAsc);
  const pastAll     = filtered.filter(c=>c._state === "ended").sort(byEndedDesc);

  const upcoming = upcomingAll.slice(0, UP_LIMIT);
  const ongoing  = ongoingAll.slice(0, ON_LIMIT);

  setHTML("upcomingCarousel", upcoming.map(cardHTML).join("") || `<div class="muted">No upcoming competitions.</div>`);
  setHTML("ongoingCarousel", ongoing.map(cardHTML).join("") || `<div class="muted">No ongoing competitions.</div>`);
  setHTML("pastCarousel", pastAll.map(cardHTML).join("") || `<div class="muted">No past competitions.</div>`);

  const meta = document.getElementById("metaLine");
  if(meta) meta.textContent = `Showing ${filtered.length} competitions • Updated from CSV`;
}

function bindUI(){
  const filtersBtn = document.getElementById("filtersBtn");
  const panel = document.getElementById("filtersPanel");
  if(filtersBtn && panel){
    filtersBtn.addEventListener("click", ()=>{
      const open = !panel.hasAttribute("hidden");
      if(open){
        panel.setAttribute("hidden", "");
        filtersBtn.setAttribute("aria-expanded", "false");
      }else{
        panel.removeAttribute("hidden");
        filtersBtn.setAttribute("aria-expanded", "true");
      }
    });
  }

  const searchBox = document.getElementById("searchBox");
  if(searchBox) searchBox.addEventListener("input", apply);

  const clearSearch = document.getElementById("clearSearch");
  if(clearSearch && searchBox){
    clearSearch.addEventListener("click", ()=>{
      searchBox.value = "";
      apply();
      searchBox.focus();
    });
  }

  ["eventSelect","modeSelect","sortSelect"].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener("change", apply);
  });

  const chipWrap = document.getElementById("regChips");
  if(chipWrap){
    chipWrap.addEventListener("click", (e)=>{
      const btn = e.target.closest("[data-reg]");
      if(!btn) return;
      WANT_REG = btn.dataset.reg || "any";
      chipWrap.querySelectorAll(".chip").forEach(x=>x.classList.remove("on"));
      btn.classList.add("on");
      apply();
    });
  }

  const resetBtn = document.getElementById("resetBtn");
  if(resetBtn){
    resetBtn.addEventListener("click", ()=>{
      WANT_REG = "any";
      const chipWrap = document.getElementById("regChips");
      if(chipWrap){
        chipWrap.querySelectorAll(".chip").forEach(x=>x.classList.remove("on"));
        const any = chipWrap.querySelector('[data-reg="any"]');
        if(any) any.classList.add("on");
      }
      const eventSelect = document.getElementById("eventSelect");
      const modeSelect = document.getElementById("modeSelect");
      const sortSelect = document.getElementById("sortSelect");
      const searchBox = document.getElementById("searchBox");
      if(eventSelect) eventSelect.value = "";
      if(modeSelect) modeSelect.value = "";
      if(sortSelect) sortSelect.value = "smart";
      if(searchBox) searchBox.value = "";
      apply();
    });
  }

  const upAll = document.getElementById("upcomingViewAll");
  if(upAll){
    upAll.addEventListener("click",(e)=>{
      const isAll = e.target.dataset.all === "1";
      e.target.dataset.all = isAll ? "0" : "1";
      e.target.textContent = isAll ? "View all" : "Show less";
      UP_LIMIT = isAll ? 6 : 9999;
      apply();
    });
  }

  const onAll = document.getElementById("ongoingViewAll");
  if(onAll){
    onAll.addEventListener("click",(e)=>{
      const isAll = e.target.dataset.all === "1";
      e.target.dataset.all = isAll ? "0" : "1";
      e.target.textContent = isAll ? "View all" : "Show less";
      ON_LIMIT = isAll ? 6 : 9999;
      apply();
    });
  }

  document.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-scroll]");
    if(!btn) return;
    const sel = btn.getAttribute("data-scroll");
    const dir = Number(btn.getAttribute("data-dir") || "1");
    const el = document.querySelector(sel);
    if(!el) return;

    const amt = Math.max(320, Math.round(el.clientWidth * 0.92));
    el.scrollBy({ left: dir * amt, behavior: "smooth" });
  });
}

(async function init(){
  bindUI();

  // Must load user registration + competed context BEFORE rendering
  await loadUserContext();

  try{
    const now = Date.now();
    const raw = await window.CB_API.getCSV(window.CB.CSV_COMPETITIONS);

    ALL = (raw || []).map(c => {
      const cs = parseIST(c.comp_start) ?? parseIST(c.comp_date);
      const ce = parseIST(c.comp_end) ?? cs;

      const compEndEOD = compDateEndOfDayIST(c.comp_date);
      const compEndTS  = parseIST(c.comp_end);
      const pastKey    = compEndTS ?? compEndEOD;

      const regEndTS = parseIST(c.reg_end);
      const reg = regState(c, now);

      const competeWindow = !!safe(c.register_link) && !!regEndTS && !!pastKey
        ? (now > regEndTS && now <= pastKey)
        : false;

      const compEnded = !!pastKey ? (now > pastKey) : false;

      const obj = {
        ...c,
        _cs: cs,
        _ce: ce,
        _compEndEOD: compEndEOD,
        _pastKey: pastKey,
        _featured: isTruthy(c.featured),
        _reg: reg,
        _competeWindow: competeWindow,
        _compEnded: compEnded
      };

      obj._state = compState(obj, now);
      return obj;
    });

    const evs = distinctEvents(ALL);
    const eventSelect = document.getElementById("eventSelect");
    if(eventSelect){
      evs.forEach(e => {
        const opt = document.createElement("option");
        opt.value = e;
        opt.textContent = e;
        eventSelect.appendChild(opt);
      });
    }

    const modes = distinctModes(ALL);
    const modeSelect = document.getElementById("modeSelect");
    if(modeSelect){
      modes.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        modeSelect.appendChild(opt);
      });
    }

    apply();
  }catch(err){
    console.error(err);
    setHTML("featuredWrap", `
      <div class="colCard">
        <div class="muted">Error loading competitions CSV.</div>
      </div>
    `);
    const meta = document.getElementById("metaLine");
    if(meta) meta.textContent = "Error loading competitions CSV.";
  }
})();
