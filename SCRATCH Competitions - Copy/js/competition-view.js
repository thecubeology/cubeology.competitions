/* competition-view.js — FINAL (Account-aware Register → Registered → Compete → Results)
   ✅ Register Now until reg_end (exact IST timestamp)
   ✅ After reg_end (and before competition end):
        - If REGISTERED: show Compete Now
        - If NOT registered: show Registration Closed (RED PILL, not link)
   ✅ Compete Now URL: /competitions/view/compete/?id=COMP_ID
   ✅ Competition ends at comp_end if provided else comp_date end-of-day (23:59:59.999 IST)
   ✅ After competition end → View Results

   ✅ Past vs Competed:
   - If ended: show PAST for everyone
   - If user has competed (CSV_RANKINGS contains their player_id + comp_id) show COMPETED instead of PAST

   ✅ Registered pill:
   - If reg is open and user is registered → show ✓ Registered pill (not a button)

   ✅ NEW (Custom competition redirect):
   - If CSV column "Custom" = yes/true/1, redirect generic view:
       /competitions/view/?id=CC2026  →  /competitions/view/cc2026/
     (slug defaults to comp_id lowercased; optional CSV column "custom_slug" supported)

   Note: CSS must include:
   .pill.registered { ... }   (you already have)
   .pill.closed { ... }       (red pill, same as Home/Competitions)
*/

const IST_OFFSET_MIN = 330;
const DAY_MS = 24 * 60 * 60 * 1000;

function safe(v){ return (v ?? "").toString().trim(); }
function low(v){ return safe(v).toLowerCase(); }
function isTruthy(v){
  const x = low(v);
  return x === "true" || x === "yes" || x === "1";
}
function num(v){
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function compIdFromURL(){
  const p = new URLSearchParams(location.search);
  return low(p.get("id"));
}

function dateOnlyText(s){
  const t = safe(s);
  return t ? t.split(" ")[0] : "";
}

/** Converts date formats into dd/mm/yyyy (for display) */
function normalizeSingleDate(t){
  const s = dateOnlyText(t);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const dd=m[1].padStart(2,"0"), mm=m[2].padStart(2,"0"), yy=m[3];
    return `${dd}/${mm}/${yy}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m){
    const yy=m[1], mm=m[2].padStart(2,"0"), dd=m[3].padStart(2,"0");
    return `${dd}/${mm}/${yy}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if(m){
    const dd=m[1].padStart(2,"0"), mm=m[2].padStart(2,"0"), yy=`20${m[3].padStart(2,"0")}`;
    return `${dd}/${mm}/${yy}`;
  }
  return s;
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

/**
 * parseIST():
 * Accepts:
 * - "dd/mm/yyyy hh:mm(:ss)"  (your sheet format)
 * - "dd/mm/yyyy"
 * - "yyyy-mm-dd"
 * Returns UTC timestamp (ms) corresponding to IST time.
 */
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

function splitEvents(s){
  const t = safe(s);
  if(!t) return [];
  return t.split("|")
    .flatMap(part => part.split(","))
    .map(x => safe(x))
    .filter(Boolean);
}

function money(v){
  const n = num(v);
  if(n == null) return "";
  return `₹${n.toLocaleString("en-IN")}`;
}

function htmlEscape(s){
  return safe(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

/* ---------------- ROUTING HELPERS ---------------- */

function isCustomResultsComp(c){
  const pt = low(c?.page_type);
  const rpt = low(c?.results_page_type);
  const flag = isTruthy(c?.results_custom);
  return rpt === "custom" || flag || pt === "custom_results";
}

function resultsHref(c){
  const id = low(c?.comp_id);
  if(!id) return "/competitions/";
  return isCustomResultsComp(c)
    ? `/competitions/${encodeURIComponent(id)}/results/`
    : `/competitions/results/?id=${encodeURIComponent(id)}`;
}

function competeHref(compId){
  return `/competitions/view/compete/?id=${encodeURIComponent(compId)}`;
}

/* ---------------- ✅ NEW: CUSTOM COMP PAGE REDIRECT HELPERS ---------------- */

function isCustomComp(c){
  // CSV column: Custom (recommended). also supports: custom
  return isTruthy(c?.Custom) || isTruthy(c?.custom);
}

function customCompSlug(c){
  // Optional: custom_slug for nicer folder names; else defaults to comp_id (lowercase)
  const slug = low(c?.custom_slug || c?.CustomSlug || c?.customSlug);
  return slug || low(c?.comp_id);
}

function customCompHref(c){
  const slug = customCompSlug(c);
  if(!slug) return null;
  // Cloudflare Pages friendly (folder + index.html)
  return `/competitions/view/${encodeURIComponent(slug)}/`;
}

function alreadyOnCustomPath(c){
  const slug = customCompSlug(c);
  if(!slug) return false;
  const p = low(location.pathname || "");
  return p.includes(`/competitions/view/${slug}`);
}

/* ---------------- ✅ NEW: AUTO-DETECT CUSTOM FOLDER (NO CSV FLAG NEEDED) ----------------
   If a folder exists for this comp under /competitions/view/<slug>/ then the generic view:
     /competitions/view/?id=COMP_ID
   will auto-redirect to:
     /competitions/view/<slug>/
   This runs ONLY when you're on the generic ?id= page, so it won't affect custom pages.
-------------------------------------------------------------------------- */

async function pathExists(url, timeoutMs=220){
  try{
    const ctrl = new AbortController();
    const t = setTimeout(() => { try{ ctrl.abort(); }catch(_e){} }, timeoutMs);

    // Try HEAD first (fast). Some hosts may block HEAD; fallback to GET.
    let r = await fetch(url, { method: "HEAD", cache: "no-store", signal: ctrl.signal });
    if(r.status === 405 || r.status === 403){
      r = await fetch(url, { method: "GET", cache: "no-store", signal: ctrl.signal });
    }
    clearTimeout(t);

    // Treat any 2xx/3xx as exists (Cloudflare may redirect index.html)
    return (r.status >= 200 && r.status < 400);
  }catch(_e){
    return false;
  }
}


function customCacheKey(compId){
  return `cb_custom_path_${String(compId||"").toLowerCase()}`;
}

function getCachedCustomHref(compId){
  try{
    const v = localStorage.getItem(customCacheKey(compId));
    if(!v) return null;
    if(v === "none") return null;
    return v;
  }catch(_e){
    return null;
  }
}

function setCachedCustomHref(compId, href){
  try{
    localStorage.setItem(customCacheKey(compId), href ? String(href) : "none");
  }catch(_e){}
}


async function autoDetectCustomHref(c){
  const slug = customCompSlug(c);
  if(!slug) return null;

  // Instant: if we've already detected this on this device, redirect immediately.
  const cached = getCachedCustomHref(slug);
  if(cached) return cached;

  const a = `/competitions/view/${encodeURIComponent(slug)}/`;
  if(await pathExists(a)){
    setCachedCustomHref(slug, a);
    return a;
  }

  const b = `/${encodeURIComponent(slug)}/`;
  if(await pathExists(b)){
    setCachedCustomHref(slug, b);
    return b;
  }

  setCachedCustomHref(slug, null);
  return null;
}

/* ---------------- RULES HELPERS ---------------- */

function hasRulesSystem(c){
  const v = safe(c.rules_variant);
  const url = safe(c.rules_url);
  const custom = isTruthy(c.rules_custom) || low(c.rules_page_type) === "custom";
  return !!v || !!url || custom;
}

function rulesHref(c){
  const id = low(c?.comp_id);
  const url = safe(c.rules_url);
  if(url) return url;
  if(!id) return "/rules/";
  const custom = isTruthy(c.rules_custom) || low(c.rules_page_type) === "custom";
  return custom ? `/rules/${encodeURIComponent(id)}/` : `/rules/?id=${encodeURIComponent(id)}`;
}

/* ---------------- ACCOUNT CONTEXT (same as Home/Competitions) ---------------- */

const USER_CTX = {
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
    if(!pid) return; // logged in but not linked

    USER_CTX.playerId = pid;

    if(window.CB?.CSV_UPCOMING){
      const upRows = await window.CB_API.getCSV(window.CB.CSV_UPCOMING);
      (upRows || [])
        .filter(r => safe(r.player_id) === pid)
        .forEach(r => {
          const cid = low(r.comp_id);
          if(cid) USER_CTX.registeredCompIds.add(cid);
        });
    }

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
    console.warn("Competition view: user context load failed", e);
  }
}

/* ---------------- STATE HELPERS ---------------- */

function compEndTimestamp(c){
  // Preferred: comp_end (exact IST timestamp)
  const endTS = parseIST(c.comp_end);
  if(endTS != null) return endTS;

  // Fallback: comp_date end-of-day IST
  return compDateEndOfDayIST(c.comp_date);
}

function compStartTimestamp(c){
  return parseIST(c.comp_start) ?? parseIST(c.comp_date);
}

function compState(c, now){
  const cs = compStartTimestamp(c);
  const ce = parseIST(c.comp_end) ?? cs; // for "ongoing" feeling; end-of-competition uses compEndTimestamp()
  if(cs && ce && now >= cs && now <= ce) return "ongoing";
  if(cs && now < cs) return "upcoming";

  const endKey = compEndTimestamp(c);
  if(endKey && now > endKey) return "ended";

  return "scheduled";
}

/* ---------------- UI HELPERS ---------------- */

function registeredPillHTML(){
  return `<span class="pill registered">✓ Registered</span>`;
}
function closedPillHTML(){
  return `<span class="pill closed">Registration Closed</span>`;
}

function pillsHTML(c, now){
  const out = [];
  const st = compState(c, now);
  const mode = safe(c.mode_label);
  const id = low(c.comp_id);

  if(mode) out.push(`<span class="pill violet">${htmlEscape(mode)}</span>`);
  if(isTruthy(c.featured)) out.push(`<span class="pill pink">FEATURED</span>`);
  if(st === "upcoming") out.push(`<span class="pill amber">UPCOMING</span>`);
  if(st === "ongoing") out.push(`<span class="pill cyan">ONGOING</span>`);
  if(st === "scheduled") out.push(`<span class="pill">SCHEDULED</span>`);

  // ✅ Ended: PAST vs COMPETED (personalized)
  if(st === "ended"){
    const didCompete = !!(USER_CTX.playerId && USER_CTX.competedCompIds.has(id));
    out.push(didCompete ? `<span class="pill green">COMPETED</span>` : `<span class="pill amber">PAST</span>`);
  }

  return out.join("");
}

function kpill(type, k, v){
  if(!v) return "";
  return `<div class="kpill ${type}"><span class="k">${htmlEscape(k)}</span><span class="v">${htmlEscape(v)}</span></div>`;
}

function isPrizeLabelLine(line){
  const s = safe(line);
  const cleaned = s.replace(/[\u{1F300}-\u{1FAFF}]/gu, "").trim();

  const allow = new Set([
    "3x3","3×3","2x2","2×2","4x4","4×4","5x5","5×5","6x6","6×6","7x7","7×7",
    "oh","fmc","clock","skewb","pyraminx","megaminx","square 1","square-1",
    "3bld","4bld","5bld","mirror"
  ]);

  const key = cleaned.toLowerCase();
  if(allow.has(key)) return true;

  const looksLikeProduct = /[a-z]{3,}/i.test(cleaned) && /(\d|v\d|uv|rs3m|gan|moyu|yuxin|mgc|qiyi|tornado)/i.test(cleaned);
  if(looksLikeProduct) return false;

  const isShort = cleaned.length <= 12 && !/[.]/.test(cleaned) && !/\d{2,}/.test(cleaned);
  const isSingleOrTwoWords = cleaned.split(/\s+/).length <= 2;

  return isShort && isSingleOrTwoWords;
}

function renderRichText(text){
  const raw = safe(text);
  if(!raw) return "";

  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  let html = `<div class="rt">`;
  let started = false;

  for(const line of lines){
    const isHeader = /:\s*$/.test(line) && line.length <= 52;
    const isBullet = /^[-•]\s+/.test(line);

    if(isHeader){
      html += `${started ? `<div class="sec"></div>` : ""}<div class="hdr">${htmlEscape(line.replace(/:\s*$/,""))}</div>`;
      started = true;
      continue;
    }

    if(isBullet){
      html += `<div class="line">${htmlEscape(line.replace(/^[-•]\s+/,""))}</div>`;
      continue;
    }

    if(isPrizeLabelLine(line)){
      html += `<span class="tag">${htmlEscape(line)}</span>`;
      continue;
    }

    html += `<div class="line">${htmlEscape(line)}</div>`;
  }

  html += `</div>`;
  return html;
}

function renderNotFound(id){
  const el = document.getElementById("cvWrap");
  if(!el) return;
  el.innerHTML = `
    <div class="cvShell">
      <div class="cvCard">
        <div class="cvBody">
          <div class="err">
            Competition not found for id: <b>${htmlEscape(id) || "—"}</b><br><br>
            Use: <b>/competitions/view/?id=comp_id</b>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ----------------------------- */
/* ✅ ACTION MODEL (same logic as Home/Competitions) */
/* ----------------------------- */

function actionModel(c, now){
  const compId = low(c.comp_id);
  const regLink = safe(c.register_link);

  const regEndTS = parseIST(c.reg_end);          // exact IST time
  const compEnd  = compEndTimestamp(c);          // comp_end or comp_date EOD fallback
  const resultsAllowed = !!compEnd && now > compEnd;

  const regOpen = !!regLink && (
    regEndTS ? now <= regEndTS : true
  );

  const competeWindow = !!regLink && !!regEndTS && !!compEnd
    ? (now > regEndTS && now <= compEnd)
    : false;

  const isRegistered = !!(USER_CTX.playerId && USER_CTX.registeredCompIds.has(compId));

  return { compId, regLink, regEndTS, compEnd, resultsAllowed, regOpen, competeWindow, isRegistered };
}

/* ----------------------------- */
/* ✅ MAIN RENDER */
/* ----------------------------- */

function renderComp(c){
  const now = Date.now();
  const id = low(c.comp_id);

  const name = safe(c.comp_name) || (id ? id.toUpperCase() : "Competition");
  const compDate = normalizeCompDateText(c.comp_date);

  const poster = safe(c.poster_url);
  const events = splitEvents(c.events);

  const regStartTxt = normalizeSingleDate(c.reg_start);
  const regEndTxt   = normalizeSingleDate(c.reg_end);

  const baseFee = money(c.base_fee);
  const perEventFee = money(c.per_event_fee);
  const feesText = (baseFee || perEventFee)
    ? `${baseFee ? `${baseFee} base` : "—"}${perEventFee ? ` • +${perEventFee}/event` : ""}`
    : "";

  const prizesWorth = safe(c.prizes_worth);
  const prizesText = safe(c.prizes);
  const desc = safe(c.description);
  const hook = safe(c.short_hook);
  const mode = safe(c.mode_label);

  const A = actionModel(c, now);

  const rulesOk = hasRulesSystem(c);
  const rulesBtn = rulesOk ? `<a class="btn ghost" href="${rulesHref(c)}">View Rules</a>` : ``;

  // ✅ Primary + Secondary (match logic)
  let primaryHTML = "";
  let secondaryHTML = "";

  if(A.resultsAllowed){
    primaryHTML = `<a class="btn primary" href="${resultsHref(c)}">View Results</a>`;
    secondaryHTML = rulesBtn;
  }else if(A.regOpen){
    if(A.isRegistered){
      // ✅ Registered pill (not a button)
      primaryHTML = registeredPillHTML();
      secondaryHTML = `<a class="btn" href="/competitions/view/?id=${encodeURIComponent(id)}">Refresh</a>`; // harmless; optional
      // Better: show rules beside
      secondaryHTML = rulesBtn || secondaryHTML;
    }else{
      primaryHTML = `<a class="btn primary" href="${A.regLink}" target="_blank" rel="noopener">Register Now</a>`;
      secondaryHTML = rulesBtn;
    }
  }else if(A.competeWindow){
    if(A.isRegistered){
      primaryHTML = `<a class="btn primary" href="${competeHref(id)}">Compete Now</a>`;
      secondaryHTML = rulesBtn;
    }else{
      // ✅ Registration Closed pill (red, not link)
      primaryHTML = closedPillHTML();
      secondaryHTML = rulesBtn;
    }
  }else{
    // fallback (dates missing etc.)
    primaryHTML = rulesBtn || `<a class="btn ghost" href="/competitions/">Back</a>`;
    secondaryHTML = `<a class="btn ghost" href="/competitions/">Back</a>`;
  }

  const regClosedLine = (A.competeWindow && !A.isRegistered)
    ? `<div class="note">Registration Closed</div>`
    : (A.competeWindow ? `<div class="note">Registration Closed</div>` : "");

  const bannerHTML = poster ? `
    <div class="cvBannerWrap">
      <div class="banner">
        <div class="bannerBlur" style="background-image:url('${poster}')"></div>
        <div class="bannerTint"></div>
        <img class="bannerImg" src="${poster}" alt="${htmlEscape(name)}" loading="eager" decoding="async">
      </div>
    </div>
  ` : "";

  document.title = `${name} • Cubeology`;

  const el = document.getElementById("cvWrap");
  if(!el) return;

  el.innerHTML = `
    <div class="cvShell">
      <div class="cvCard">

        <div class="cvTop">
          <div class="cvTopRow">
            <div>
              <h1 class="cvTitle">${htmlEscape(name)}</h1>
              <div class="cvMeta">
                <div class="cvDate">${htmlEscape(compDate || "—")}</div>
              </div>
            </div>

            <div class="pills">${pillsHTML(c, now)}</div>
          </div>

          <div class="cvActions">
            ${primaryHTML}
            ${secondaryHTML}
          </div>

          ${regClosedLine}

          ${hook ? `<div class="hook">${htmlEscape(hook)}</div>` : ``}
        </div>

        ${bannerHTML}

        <div class="cvBody">

          <div class="tiles">
            ${prizesWorth ? `
              <div class="tile gold">
                <div class="tileTop">
                  <div class="tileLabel">Prizes Worth</div>
                  <div class="tileIcon">🏆</div>
                </div>
                <div class="tileValue">${htmlEscape(prizesWorth)}</div>
              </div>
            ` : ``}

            ${(regStartTxt || regEndTxt) ? `
              <div class="tile">
                <div class="tileTop">
                  <div class="tileLabel">Registration</div>
                  <div class="tileIcon">🗓️</div>
                </div>
                <div class="tileValue">
                  ${regStartTxt ? htmlEscape(regStartTxt) : "—"}
                  ${regStartTxt && regEndTxt ? " → " : ""}
                  ${regEndTxt ? htmlEscape(regEndTxt) : ""}
                  ${A.competeWindow ? `<div class="note" style="margin-top:8px;">Registration Closed</div>` : ``}
                </div>
              </div>
            ` : ``}

            ${feesText ? `
              <div class="tile">
                <div class="tileTop">
                  <div class="tileLabel">Fees</div>
                  <div class="tileIcon">💳</div>
                </div>
                <div class="tileValue">${htmlEscape(feesText)}</div>
              </div>
            ` : ``}
          </div>

          <div class="cols">
            <div class="panel">
              <div class="h2">Events</div>
              ${
                events.length
                  ? `<div class="events">${events.map(e=>`<span class="eventPill">${htmlEscape(e)}</span>`).join("")}</div>`
                  : `<div class="note">No events listed.</div>`
              }
            </div>

            <div class="panel">
              <div class="h2">Key Details</div>
              <div class="kpills">
                ${kpill("violet","Mode", mode)}
                ${(regStartTxt && regEndTxt) ? kpill("amber","Reg", `${regStartTxt} → ${regEndTxt}`) : kpill("amber","Reg Start", regStartTxt) + kpill("amber","Reg End", regEndTxt)}
                ${feesText ? kpill("cyan","Fees", feesText) : ``}
                ${events.length ? kpill("pink","Events", `${events.length} events`) : ``}
              </div>
            </div>
          </div>

          ${(prizesText || prizesWorth) ? `
            <details class="acc" open>
              <summary>
                <div class="accLeft">
                  <div class="accIcon">🏆</div>
                  <div>Prizes</div>
                </div>
                <div class="chev" aria-hidden="true"></div>
              </summary>
              <div class="accBody">
                ${prizesText ? renderRichText(prizesText) : (prizesWorth ? `<div>${htmlEscape(prizesWorth)}</div>` : ``)}
              </div>
            </details>
          ` : ``}

          ${desc ? `
            <details class="acc">
              <summary>
                <div class="accLeft">
                  <div class="accIcon">📌</div>
                  <div>Description</div>
                </div>
                <div class="chev" aria-hidden="true"></div>
              </summary>
              <div class="accBody">
                ${renderRichText(desc)}
              </div>
            </details>
          ` : ``}

          <div class="footerActions">
            ${primaryHTML}
            ${secondaryHTML}
          </div>

          ${!A.resultsAllowed ? `<div class="note">Results will appear after the competition ends.</div>` : ``}

        </div>
      </div>
    </div>

    <div class="mobileBar">
      ${primaryHTML || `<a class="btn ghost" href="/competitions/">Back</a>`}
      ${secondaryHTML || `<a class="btn ghost" href="/competitions/">Back</a>`}
    </div>
  `;
}

/* ----------------------------- */
/* INIT */
/* ----------------------------- */
(async function init(){
  const id = compIdFromURL();
  if(!id){ renderNotFound(""); return; }

  try{
    // ✅ Load account + registration + competed context first
    await loadUserContext();

    const rows = await window.CB_API.getCSV(window.CB.CSV_COMPETITIONS);
    const comp = (rows || []).find(r => low(r.comp_id) === id);
    if(!comp){ renderNotFound(id); return; }

    // ✅ Custom competition routing
    // Rule:
    // - If CSV Custom=yes/true/1 -> redirect to custom folder
    // - OR if a folder exists for the comp (auto-detect) -> redirect to that folder
    // This only runs on the generic /competitions/view/?id=COMP_ID page.
    if(!alreadyOnCustomPath(comp)){
      let href = null;

      // 1) Explicit CSV flag wins
      if(isCustomComp(comp)){
        href = customCompHref(comp);
      }

      // 2) Otherwise, auto-detect if a custom folder exists
      if(!href){
        href = await autoDetectCustomHref(comp);
      }

      if(href){
        location.replace(href);
        return;
      }
    }

renderComp(comp);
  }catch(e){
    console.error(e);
    renderNotFound(id);
  }
})();
