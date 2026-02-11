/* home-clean.js
   CubeMeet-style UI powered by your existing CSV sources & logic.
   Requires:
     window.CB.CSV_COMPETITIONS
     window.CB.CSV_RANKINGS
   Optional:
     window.CB.CSV_UPCOMING (registered list)
     Supabase profile mapping (email -> player_id) as used across your site.
*/

const IST_OFFSET_MIN = 330;
const DAY_MS = 24 * 60 * 60 * 1000;

function safe(v){ return (v ?? "").toString().trim(); }
function low(v){ return safe(v).toLowerCase(); }
function isTruthy(v){
  const x = low(v);
  return x === "true" || x === "yes" || x === "1";
}

/* CSV helper fallback (if api.js didn't load / CB_API missing) */
(function ensureCBAPI(){
  try{
    window.CB_API = window.CB_API || {};
    if(typeof window.CB_API.getCSV === "function") return;

    function splitCSVLine(line){
      const out = [];
      let cur = "", q = false;
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

    window.CB_API.getCSV = async function(url){
      const res = await fetch(url, { cache: "no-store" });
      if(!res.ok) throw new Error("Failed to load CSV");
      const text = await res.text();
      return parseCSV(text);
    };
  }catch(_e){}
})();

/* IST parsing (same behavior as your home.js) */
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

function fmtDateRange(c){
  const cs = c._cs;
  const ce = c._ce;
  if(!cs && !ce) return "—";
  const fmt = (ts) => {
    const d = new Date(ts + IST_OFFSET_MIN*60*1000);
    const dd = String(d.getUTCDate()).padStart(2,"0");
    const mm = String(d.getUTCMonth()+1).padStart(2,"0");
    const yy = d.getUTCFullYear();
    return `${dd}/${mm}/${yy}`;
  };
  if(cs && ce && Math.abs(ce - cs) >= DAY_MS) return `${fmt(cs)} – ${fmt(ce)}`;
  if(cs) return fmt(cs);
  return fmt(ce);
}

function parseEventsList(raw){
  const s = safe(raw);
  if(!s) return [];
  return s.split(/[,|]/g).map(x => safe(x)).filter(Boolean);
}

function compState(c, now){
  if(c._compEnded) return "ended";
  const cs = c._cs, ce = c._ce;
  if(cs && ce && now >= cs && now <= ce) return "ongoing";
  if(cs && now < cs) return "upcoming";
  return "scheduled";
}

function regState(c, now){
  const rs = c._regStartTS ?? parseIST(c.reg_start);
  const re = c._regEndTS ?? parseIST(c.reg_end);

  if(rs && now < rs) return "soon";
  if(re && now > re) return "closed";
  if(rs && re && now >= rs && now <= re) return "open";
  if(rs && !re && now >= rs) return "open";
  if(!rs && re && now <= re) return "open";
  return "unknown";
}

/* routing helpers (same as home.js) */
function compIdLower(c){ return low(c?.comp_id); }

function isCustomComp(c){
  const pt = low(c?.page_type);
  return pt === "custom" || pt === "folder" || pt === "special";
}

function detailsHrefForComp(c){
  const id = compIdLower(c);
  if(!id) return "/competitions/";
  return isCustomComp(c)
    ? `/competitions/${encodeURIComponent(id)}/`
    : `/competitions/view/?id=${encodeURIComponent(id)}`;
}

function registerLinkForComp(c){
  return safe(c.register_url) || safe(c.register_link);
}

/* Auth context: matches your home.js approach */
function needAuthConfig(){
  if(!window.CB?.SUPABASE_URL || !window.CB?.SUPABASE_KEY) return false;
  if(!window.supabase?.createClient) return false;
  return true;
}

async function ensureProfileRow(sb, user){
  const email = low(user?.email);
  if(!email) return null;

  let { data: row, error } = await sb
    .from("profiles")
    .select("email,user_id,player_id,player_name,role")
    .eq("email", email)
    .maybeSingle();

  if(error) throw error;

  if(!row){
    const ins = await sb
      .from("profiles")
      .insert([{ email, user_id: user.id, role: "user" }])
      .select("email,user_id,player_id,player_name,role")
      .maybeSingle();
    if(ins.error) throw ins.error;
    row = ins.data || null;
  }
  return row;
}

async function getUserContext(){
  // Mirrors competitions.js logic: builds
  // - registeredCompIds from CSV_UPCOMING (or fallback CSV_REGISTRATIONS)
  // - competedCompIds from CSV_RANKINGS
  const ctx = {
    loggedIn: false,
    playerId: "",
    role: "user",
    registeredCompIds: new Set(),
    competedCompIds: new Set(),
    _rankRows: [] // for other uses (optional)
  };

  try{
    if(!(window.CB?.SUPABASE_URL && window.CB?.SUPABASE_KEY && window.supabase?.createClient)) return ctx;

    const sb = window.supabase.createClient(window.CB.SUPABASE_URL, window.CB.SUPABASE_KEY);
    const { data } = await sb.auth.getUser();
    const user = data?.user;
    if(!user) return ctx;

    ctx.loggedIn = true;

    // Ensure profile row exists (same as existing pattern)
    const email = low(user?.email);
    if(email){
      const sel = await sb
        .from("profiles")
        .select("email,user_id,player_id,role")
        .eq("email", email)
        .maybeSingle();

      if(sel?.error) throw sel.error;

      let row = sel.data || null;

      if(!row){
        const ins = await sb
          .from("profiles")
          .insert([{ email, user_id: user.id, role: "user" }])
          .select("email,user_id,player_id,role")
          .maybeSingle();
        if(ins?.error) throw ins.error;
        row = ins.data || null;
      }

      ctx.playerId = safe(row?.player_id);
      ctx.role = safe(row?.role) || "user";
    }

    if(!ctx.playerId) return ctx;

    // Registered comps (upcoming registrations)
    const regCSV = window.CB?.CSV_UPCOMING || window.CB?.CSV_REGISTRATIONS || window.CB?.CSV_REGISTRATION || window.CB?.CSV_REG;
    if(regCSV){
      const regRows = await window.CB_API.getCSV(regCSV);
      (regRows || [])
        .filter(r => safe(r.player_id) === ctx.playerId)
        .forEach(r => {
          const cid = low(r.comp_id);
          if(cid) ctx.registeredCompIds.add(cid);
        });
    }

    // Competed comps (rankings/results)
    const rkCSV = window.CB?.CSV_RANKINGS || window.CB?.CSV_RESULTS || window.CB?.CSV_RANK;
    if(rkCSV){
      const rkRows = await window.CB_API.getCSV(rkCSV);
      ctx._rankRows = Array.isArray(rkRows) ? rkRows : [];
      (rkRows || [])
        .filter(r => safe(r.player_id) === ctx.playerId)
        .forEach(r => {
          const cid = low(r.comp_id);
          if(cid) ctx.competedCompIds.add(cid);
        });
    }
  }catch(e){
    console.warn("Home: user context load failed", e);
  }

  return ctx;
}

/* Stats */
function computeSolveStatsLikeHome(rankRows){
  const solveFields = ["s1","s2","s3","s4","s5"];
  let totalSolves = 0;
  const players = new Set();
  for(const r of (rankRows || [])){
    const pid = safe(r.player_id);
    if(pid) players.add(pid);
    for(const f of solveFields){
      const v = low(r[f]);
      if(!v) continue;
      if(v === "dnf") continue;
      totalSolves++;
    }
  }
  return { totalSolves, uniquePlayers: players.size };
}

function computeHomeStats(comps, ranks){
  const now = Date.now();
  const upcoming = (comps || []).filter(c => compState(c, now) === "upcoming").length;
  const competitions = (comps || []).length;

  const ss = computeSolveStatsLikeHome(ranks || []);
  return {
    upcoming,
    competitions,
    competitors: ss.uniquePlayers,
    solves: ss.totalSolves
  };
}


function setText(id, v){
  const el = document.getElementById(id);
  if(el) el.textContent = v;
}

/* Card rendering */
function statePill(c, now){
  const s = compState(c, now);
  if(s === "ongoing") return "Live";
  if(s === "upcoming") return "Upcoming";
  if(s === "ended") return "Completed";
  return "Scheduled";
}

function eventsChips(c, limit=5){
  const evs = parseEventsList(c.events);
  if(!evs.length) return "";
  const shown = evs.slice(0, limit);
  const more = evs.length - shown.length;
  const chips = shown.map(e => `<span class="hc-chip">${escapeHtml(e)}</span>`).join("");
  const extra = more > 0 ? `<span class="hc-chip">+${more}</span>` : "";
  return chips + extra;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

function featuredCardHTML(c, userCtx, showBanner=true){
  const now = Date.now();

  const id = low(c.comp_id);
  const title = escapeHtml(safe(c.title) || safe(c.name) || safe(c.comp_name) || safe(c.comp_id).toUpperCase());
  const loc = escapeHtml(safe(c.location) || safe(c.city) || safe(c.venue) || "");
  const date = fmtDateRange(c);

  const reg = regState(c, now);              // soon | open | closed | unknown
  const regLink = registerLinkForComp(c);
  const detailsHref = detailsHrefForComp(c);

  const isRegistered = !!(userCtx?.registeredCompIds?.has(id));
  const isEnded = !!c._compEnded;

  // "Competed" detection: if rankings/results has this comp_id + player_id
  let hasCompeted = false;
  try{
    if(isEnded && userCtx?.playerId && Array.isArray(userCtx._rankRows)){
      const pid = String(userCtx.playerId);
      hasCompeted = userCtx._rankRows.some(r => safe(r.player_id) === pid && low(r.comp_id) === id);
    }
  }catch(_e){ hasCompeted = false; }

  // Top-right pill + class
  let pillText = "Upcoming";
  let pillClass = "";

  if(isRegistered && !isEnded){
    pillText = "Registered";
    pillClass = "pill-green";
  }else if(!isEnded && reg === "closed"){
    pillText = "Registrations Closed";
    pillClass = "pill-red";
  }else if(isEnded){
    if(hasCompeted){
      pillText = "Competed";
      pillClass = "pill-green";
    }else{
      pillText = "Past";
      pillClass = "pill-amber";
    }
  }else{
    const s = compState(c, now);
    if(s === "ongoing"){ pillText = "Live"; pillClass = "pill-redLive"; }
    else if(s === "upcoming"){ pillText = "Upcoming"; pillClass = ""; }
    else { pillText = "Scheduled"; pillClass = ""; }
  }

  // Primary action rules:
  let primaryHTML = `<a class="hc-action primary" href="${detailsHref}">View Details</a>`;

  if(isRegistered && !isEnded){
    primaryHTML = `<button class="hc-action primary disabled" type="button" disabled>Registered</button>`;
  }else if(!isEnded && reg === "open" && regLink){
    primaryHTML = `<a class="hc-action primary" href="${regLink}" target="_blank" rel="noopener">Register Now</a>`;
  }else if(!isEnded && reg === "closed"){
    primaryHTML = `<button class="hc-action primary disabled" type="button" disabled>Registration Closed</button>`;
  }

  const secondaryHTML = `<a class="hc-action" href="${detailsHref}">Details</a>`;

  // Banner (2:1) from poster_url (featured only)
  const poster = safe(c.poster_url || c.poster || c.banner_url || c.banner);
  const banner = (showBanner && poster)
    ? `<div class="hc-banner" aria-hidden="true"><img src="${escapeHtml(poster)}" alt="" loading="lazy"></div>`
    : ``;

return `
    <article class="hc-card">
      ${banner}

      <div class="hc-row">
        <h3 class="hc-title2">${title}</h3>
        <span class="hc-pill ${pillClass}">${pillText}</span>
      </div>

      <div class="hc-meta">
        ${loc ? `<div class="hc-metaLine"><span class="hc-dot"></span><span>${loc}</span></div>` : ``}
        <div class="hc-metaLine"><span class="hc-dot"></span><span>${escapeHtml(date)}</span></div>
      </div>

      <div class="hc-events">${eventsChips(c)}</div>

      <div class="hc-actions">
        ${primaryHTML}
        ${secondaryHTML}
      </div>
    </article>
  `;
}


/* ---------- All Competitions slider ---------- */
function applyCompFilterUI(active){
  const tabs = Array.from(document.querySelectorAll('[data-comp-filter]'));
  tabs.forEach(btn => {
    const on = btn.getAttribute('data-comp-filter') === active;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function filterCompsForView(comps, view){
  if(view === "completed") return comps.filter(c => c._state === "ended");
  if(view === "upcoming") return comps.filter(c => (c._state === "upcoming" || c._state === "ongoing"));
  return comps;
}

function renderAllCompetitionsSlider(comps, userCtx, view="all"){
  const track = document.getElementById("allCompTrack");
  if(!track) return;

  const list = filterCompsForView(comps, view);

  const sorted = [...list].sort((a,b) => {
    if(view === "completed"){
      return (b._ce ?? 0) - (a._ce ?? 0);
    }
    if(view === "upcoming"){
      return (a._cs ?? 9e15) - (b._cs ?? 9e15);
    }
    const aEnded = a._state === "ended";
    const bEnded = b._state === "ended";
    if(aEnded !== bEnded) return aEnded ? 1 : -1;
    if(!aEnded) return (a._cs ?? 9e15) - (b._cs ?? 9e15);
    return (b._ce ?? 0) - (a._ce ?? 0);
  });

  track.innerHTML = sorted.length
    ? sorted.map(c => `<div class="hc-slide">${featuredCardHTML(c, userCtx, false)}</div>`).join("")
    : `<div class="hc-slide"><div class="hc-card"><div class="hc-title2">No competitions found</div></div></div>`;
}

function hookAllSliderArrows(){
  const track = document.getElementById("allCompTrack");
  const prev = document.querySelector("[data-all-prev]");
  const next = document.querySelector("[data-all-next]");
  const prevM = document.querySelector("[data-all-prev-mobile]");
  const nextM = document.querySelector("[data-all-next-mobile]");
  if(!track) return;

  const step = () => {
    const first = track.querySelector(".hc-slide");
    if(!first) return 360;
    const w = first.getBoundingClientRect().width;
    return w + 14;
  };

  const goPrev = () => track.scrollBy({ left: -step(), behavior: "smooth" });
  const goNext = () => track.scrollBy({ left: step(), behavior: "smooth" });

  if(prev) prev.addEventListener("click", goPrev);
  if(next) next.addEventListener("click", goNext);
  if(prevM) prevM.addEventListener("click", goPrev);
  if(nextM) nextM.addEventListener("click", goNext);
}

async function init(){
  try{
    if(!window.CB?.CSV_COMPETITIONS || !window.CB?.CSV_RANKINGS){
      console.warn("Missing CSV keys in window.CB");
      return;
    }

    const [userCtx, compsRaw, ranks] = await Promise.all([
      getUserContext(),
      window.CB_API.getCSV(window.CB.CSV_COMPETITIONS),
      window.CB_API.getCSV(window.CB.CSV_RANKINGS)
    ]);

    const now = Date.now();

    const comps = (compsRaw || []).map(c => {
      const cs = parseIST(c.comp_start) ?? parseIST(c.comp_date);
      const ce = parseIST(c.comp_end) ?? cs;

      const regStartTS = parseIST(c.reg_start);
      const regEndTS   = parseIST(c.reg_end);

      // comp end key: comp_end > end-of-day(comp_date)
      const compEndTS = parseIST(c.comp_end);
      const dateOnly = safe(c.comp_date).split(" ")[0];
      const eod = parseIST(dateOnly) != null ? (parseIST(dateOnly) + DAY_MS - 1) : null;
      const pastKey = compEndTS ?? eod;

      const compEnded = pastKey ? (now > pastKey) : false;

      const obj = {
        ...c,
        _cs: cs,
        _ce: ce,
        _regStartTS: regStartTS,
        _regEndTS: regEndTS,
        _compEnded: compEnded,
        _featured: isTruthy(c.featured)
      };

      obj._state = compState(obj, now);
      obj._reg = regState(obj, now);
      return obj;
    });

    // stats
    const st = computeHomeStats(comps, ranks);
    setText("statUpcoming", Number(st.upcoming).toLocaleString("en-IN"));
    setText("statCompetitions", Number(st.competitions).toLocaleString("en-IN"));
    setText("statCompetitors", Number(st.competitors).toLocaleString("en-IN"));
    setText("statSolves", Number(st.solves).toLocaleString("en-IN"));
// featured list: prefer featured upcoming/ongoing, else nearest upcoming
    const featured = comps
      .filter(c => (c._state === "upcoming" || c._state === "ongoing"))
      .sort((a,b) => {
        const af = a._featured ? 0 : 1;
        const bf = b._featured ? 0 : 1;
        if(af !== bf) return af - bf;
        return (a._cs ?? 9e15) - (b._cs ?? 9e15);
      })
      .slice(0, 3);

    const grid = document.getElementById("featuredGrid");
    if(grid){
      grid.innerHTML = featured.length
        ? featured.map(c => featuredCardHTML(c, userCtx, true)).join("")
        : `<div class="hc-card"><div class="hc-title2">No competitions found</div></div>`;
    }
    // All competitions slider (default: all)
    renderAllCompetitionsSlider(comps, userCtx, "all");
    applyCompFilterUI("all");
    hookAllSliderArrows();

    const tabButtons = Array.from(document.querySelectorAll('[data-comp-filter]'));
    tabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-comp-filter") || "all";
        applyCompFilterUI(view);
        renderAllCompetitionsSlider(comps, userCtx, view);
        const track = document.getElementById("allCompTrack");
        if(track) track.scrollTo({ left: 0, behavior: "smooth" });
      });
    });

  }catch(e){
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", init);
