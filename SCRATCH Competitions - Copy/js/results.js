/* /js/results.js
   Universal results page: /competitions/results/?id=comp_id
   - Filters rankings CSV to one comp_id
   - Event chips (3x3 always first)
   - Category dropdown only (Overall + age categories if present)
   - Ranks by AO5 if any AO5 exists for bucket; else by Single
   - Ignores H2H rows in leaderboard
*/

(function(){
  const solveFields = ["s1","s2","s3","s4","s5"];
  const $ = (id)=>document.getElementById(id);

  const state = {
    compId: "",
    compRow: null,
    allRows: [],     // all rankings rows filtered to this compId
    events: [],
    event: "",
    cats: ["Overall"],
    cat: "Overall",
    search: "",
    page: 1,
    pageSize: 100,
    bucketMode: "ao5", // "ao5" or "single"
  };

  function safe(v){ return (v ?? "").toString().trim(); }
  function low(v){ return safe(v).toLowerCase(); }

  function getCompIdFromUrl(){
    const u = new URL(location.href);
    return low(u.searchParams.get("id") || "");
  }

  function escapeHtml(str){
    return safe(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  // ---------- Event ordering (3x3 first) ----------
  function normEvent(e){
    const s = low(e).replaceAll("×","x").replaceAll(" ","");
    if(s === "3x3" || s === "333") return "3x3";
    if(s === "2x2" || s === "222") return "2x2";
    if(s === "4x4" || s === "444") return "4x4";
    if(s === "5x5" || s === "555") return "5x5";
    if(s === "6x6" || s === "666") return "6x6";
    if(s === "7x7" || s === "777") return "7x7";
    if(s.includes("pyraminx") || s === "pyraminx" || s === "pyra") return "pyraminx";
    if(s.includes("skewb") || s === "skewb") return "skewb";
    if(s.includes("clock") || s === "clock") return "clock";
    if(s.includes("megaminx") || s === "megaminx") return "megaminx";
    if(s.includes("square-1") || s.includes("sq1") || s.includes("square1")) return "sq1";
    if(s.includes("oh") || s.includes("onehanded") || s.includes("one-handed")) return "3x3oh";
    return s;
  }

  const EVENT_ORDER = [
    "3x3","2x2","4x4","5x5","6x6","7x7",
    "3x3oh","clock","pyraminx","skewb","megaminx","sq1"
  ];

  function sortEvents(a,b){
    const na = normEvent(a);
    const nb = normEvent(b);
    const ia = EVENT_ORDER.indexOf(na);
    const ib = EVENT_ORDER.indexOf(nb);
    if(ia !== -1 || ib !== -1){
      if(ia === -1) return 1;
      if(ib === -1) return -1;
      return ia - ib;
    }
    return a.localeCompare(b);
  }

  // ---------- Age category ordering: Upto X, X-Y, X+ ----------
  function parseAgeCat(cat){
    const raw = safe(cat);
    const s = low(raw)
      .replaceAll("years","yrs")
      .replaceAll("year","yr")
      .replaceAll(" ", "");

    // UptoX
    let m =
      s.match(/^upto(\d+)(?:yrs?|yr)?$/) ||
      s.match(/^upto(\d+)$/);

    if(!m){
      // "up to 10 yrs" variant
      const s2 = low(raw).replaceAll("years","yrs").replaceAll("year","yr");
      m = s2.match(/up\s*to\s*(\d+)\s*(?:yrs?|yr)?/i);
    }
    if(m){
      const end = Number(m[1]);
      return { type: 0, start: 0, end, raw };
    }

    // X-Y
    m = s.match(/^(\d+)-(\d+)(?:yrs?|yr)?$/);
    if(m){
      const start = Number(m[1]);
      const end = Number(m[2]);
      return { type: 1, start, end, raw };
    }

    // X+
    m = s.match(/^(\d+)\+(?:yrs?|yr)?$/);
    if(m){
      const start = Number(m[1]);
      return { type: 2, start, end: Infinity, raw };
    }

    // fallback: first number
    const firstNum = (raw.match(/(\d+)/)?.[1]);
    const n = firstNum ? Number(firstNum) : 9999;
    return { type: 9, start: n, end: n, raw };
  }

  function sortAgeCats(a,b){
    const A = parseAgeCat(a);
    const B = parseAgeCat(b);
    if(A.type !== B.type) return A.type - B.type;
    if(A.start !== B.start) return A.start - B.start;
    if(A.end !== B.end) return A.end - B.end;
    return A.raw.localeCompare(B.raw);
  }

  // ---------- Time parsing ----------
  function isDNFValue(v){
    const s = low(v);
    if(!s) return true;
    if(s === "dnf") return true;
    if(s === "999" || s === "9999") return true;
    return false;
  }

  function parseTimeToSeconds(v){
    const s0 = safe(v);
    if(!s0) return null;
    if(isDNFValue(s0)) return null;

    // mm:ss.xx
    const mmss = s0.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
    if(mmss){
      const mm = Number(mmss[1]);
      const ss = Number(mmss[2]);
      let frac = mmss[3] ?? "0";
      if(frac.length === 1) frac = frac + "0";
      if(frac.length >= 3) frac = frac.slice(0,2);
      const dec = Number("0." + frac);
      return mm*60 + ss + dec;
    }

    // plain seconds
    const n = Number(s0);
    if(!Number.isFinite(n) || n <= 0) return null;
    if(n === 999 || n === 9999) return null;
    return n;
  }

  function fmtTime(v){
    const secs = (typeof v === "number") ? v : parseTimeToSeconds(v);
    if(secs === null) return "DNF";

    const fixed = Math.round(secs * 100) / 100;
    const whole = Math.floor(fixed);
    const dec = Math.round((fixed - whole) * 100);
    const decStr = String(dec).padStart(2,"0");

    if(whole >= 60){
      const mm = Math.floor(whole / 60);
      const ss = whole % 60;
      return `${mm}:${String(ss).padStart(2,"0")}.${decStr}`;
    }
    return `${whole}.${decStr}`;
  }

  function isH2HRow(r){
    return low(r.h2h_mode) === "h2h";
  }

  function calcAo5FromSolves(solvesSecs){
    const dnfs = solvesSecs.filter(x=>x===null).length;
    if(dnfs >= 2) return { ao5: null, bestIdx: -1, worstIdx: -1 };

    const vals = solvesSecs.map((v,i)=>({v,i}));
    let best = null;
    let worst = null;

    for(const it of vals){
      if(it.v === null){
        worst = it; // DNF is worst
      }else{
        if(!best || it.v < best.v) best = it;
        if(!worst){
          worst = it;
        }else{
          const worstVal = (worst.v === null) ? Infinity : worst.v;
          if(it.v > worstVal) worst = it;
        }
      }
    }

    const keep = vals.filter(it => it.i !== best.i && it.i !== worst.i);
    if(keep.length !== 3) return { ao5: null, bestIdx: best?.i ?? -1, worstIdx: worst?.i ?? -1 };

    const sum = keep.reduce((s,it)=> s + it.v, 0);
    return { ao5: sum / 3, bestIdx: best.i, worstIdx: worst.i };
  }

  function computeSingleSecs(r){
    let secs = parseTimeToSeconds(r.best_single);
    if(secs !== null) return secs;

    let localMin = null;
    for(const f of solveFields){
      const s = parseTimeToSeconds(r[f]);
      if(s === null) continue;
      localMin = (localMin === null) ? s : Math.min(localMin, s);
    }
    return localMin;
  }

  function computeAo5Secs(r){
    let ao5Secs = parseTimeToSeconds(r.ao5);
    const solvesSecs = solveFields.map(f => parseTimeToSeconds(r[f]));
    const calc = calcAo5FromSolves(solvesSecs);
    if(ao5Secs === null) ao5Secs = calc.ao5;
    return { ao5Secs, solvesSecs, bestIdx: calc.bestIdx, worstIdx: calc.worstIdx };
  }

  function getBucketRows(){
    const ev = low(state.event);
    const cat = state.cat;

    let rows = state.allRows.filter(r => low(r.event) === ev && !isH2HRow(r));
    if(cat !== "Overall"){
      rows = rows.filter(r => safe(r.age_cat) === cat);
    }
    return rows;
  }

  function bucketHasAnyAo5(rows){
    for(const r of rows){
      const { ao5Secs } = computeAo5Secs(r);
      if(ao5Secs !== null) return true;
    }
    return false;
  }

  function buildLeaderboard(rows, mode){
    const best = new Map();

    for(const r of rows){
      const pid = safe(r.player_id);
      if(!pid) continue;

      const name = safe(r.name) || `Player ${pid}`;

      if(mode === "ao5"){
        const { ao5Secs, solvesSecs, bestIdx, worstIdx } = computeAo5Secs(r);
        if(ao5Secs === null) continue;

        const cur = best.get(pid);
        if(!cur || ao5Secs < cur.valueSecs){
          best.set(pid, {
            pid, name,
            valueSecs: ao5Secs,
            valueText: fmtTime(ao5Secs),
            row: r,
            solvesSecs, bestIdx, worstIdx
          });
        }
      }else{
        const singleSecs = computeSingleSecs(r);
        if(singleSecs === null) continue;

        const cur = best.get(pid);
        if(!cur || singleSecs < cur.valueSecs){
          best.set(pid, {
            pid, name,
            valueSecs: singleSecs,
            valueText: fmtTime(singleSecs),
            row: r
          });
        }
      }
    }

    const out = Array.from(best.values());
    out.sort((a,b)=> a.valueSecs - b.valueSecs);
    return out;
  }

  function filterBySearch(list, q){
    const s = low(q);
    if(!s) return list;
    return list.filter(x => low(x.name).includes(s) || safe(x.pid).includes(s));
  }

  function renderEventControls(){
    const chips = $("resEventChips");
    const sel = $("resEventSelect");
    if(!chips || !sel) return;

    sel.innerHTML = state.events.map(e=>`<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");
    sel.value = state.event;

    chips.innerHTML = state.events.map(e=>{
      const on = low(e) === low(state.event) ? "on" : "";
      return `<button class="resChip ${on}" type="button" data-ev="${escapeHtml(e)}">${escapeHtml(e)}</button>`;
    }).join("");

    chips.querySelectorAll("button[data-ev]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        state.event = btn.dataset.ev;
        state.page = 1;
        render();
      });
    });

    sel.onchange = ()=>{
      state.event = sel.value;
      state.page = 1;
      render();
    };
  }

  function renderCatControls(){
    const block = $("resCatBlock");
    const sel = $("resCatSelect");
    if(!block || !sel) return;

    if(state.cats.length <= 1){
      block.style.display = "none";
      state.cat = "Overall";
      return;
    }

    block.style.display = "block";
    sel.innerHTML = state.cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    sel.value = state.cat;

    sel.onchange = ()=>{
      state.cat = sel.value;
      state.page = 1;
      render();
    };
  }

  /* =========================================================
   REPLACE render() in /js/results.js with this upgraded one
   - Adds Top 3 podium bar (like your image)
   - Adds top1/top2/top3 classes to first 3 rows
   - Mobile friendly (podium scroll handled in CSS)
========================================================= */

function render(){
  renderEventControls();
  renderCatControls();

  const rowsEl = $("resRows");
  const emptyEl = $("resEmpty");
  const metaTitle = $("resMetaTitle");
  const metaCount = $("resMetaCount");
  const resultHead = $("resResultHead");
  const podiumWrap = $("resPodiumWrap");
  const podiumEl = $("resPodium");

  if(!rowsEl || !emptyEl) return;

  const bucketRows = getBucketRows();
  const useAo5 = bucketHasAnyAo5(bucketRows);
  state.bucketMode = useAo5 ? "ao5" : "single";

  if(resultHead) resultHead.textContent = useAo5 ? "AO5" : "Single";

  const all = buildLeaderboard(bucketRows, state.bucketMode);
  const filtered = filterBySearch(all, state.search);

  if(metaTitle){
    metaTitle.textContent = `${state.event} • ${state.cat} • ${useAo5 ? "AO5" : "Single"}`;
  }
  if(metaCount) metaCount.textContent = `${filtered.length} players`;

  /* ---------- Top 3 podium bar (based on filtered list) ---------- */
  if(podiumWrap && podiumEl){
    const top3 = filtered.slice(0,3);
    if(top3.length === 3){
      podiumWrap.style.display = "block";
      const cls = ["resPodiumGold","resPodiumSilver","resPodiumBronze"];
      podiumEl.innerHTML = top3.map((p,i)=>{
        return `
          <div class="resPodiumCard ${cls[i]}">
            <div class="resPodiumRank">#${i+1}</div>
            <div class="resPodiumName">${escapeHtml(p.name)}</div>
            <div class="resPodiumScore">${escapeHtml(p.valueText)}</div>
          </div>
        `;
      }).join("");
    }else{
      podiumWrap.style.display = "none";
      podiumEl.innerHTML = "";
    }
  }

  /* ---------- pagination ---------- */
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);

  const start = (state.page - 1) * state.pageSize;
  const pageItems = filtered.slice(start, start + state.pageSize);

  rowsEl.innerHTML = pageItems.map((x, idx)=>{
    const rank = start + idx + 1;
    const personHref = `/persons/?id=${encodeURIComponent(x.pid)}`;

    const rowTopClass =
      rank === 1 ? "top1" :
      rank === 2 ? "top2" :
      rank === 3 ? "top3" : "";

    const extra = (state.bucketMode === "ao5")
      ? `<button class="resShowSolves" type="button" data-solves-btn="${rank}">Show solves</button>`
      : `<span></span>`;

    const solvesBlock = (state.bucketMode === "ao5")
      ? `
        <div class="resSolvesWrap" data-solves-wrap="${rank}" style="display:none;">
          <div class="resSolvesRow">
            ${solveFields.map((f,i)=>{
              const v = x.solvesSecs?.[i] ?? parseTimeToSeconds(x.row?.[f]);
              const cls =
                (i === x.bestIdx) ? "resSolve best" :
                (i === x.worstIdx) ? "resSolve worst" :
                "resSolve";
              return `<div class="${cls}">${fmtTime(v === null ? "DNF" : v)}</div>`;
            }).join("")}
          </div>
        </div>`
      : "";

    return `
      <div class="resRow ${rowTopClass}">
        <div class="resCellRank">#${rank}</div>

        <div class="resCellPlayer">
          <a href="${personHref}">${escapeHtml(x.name)}</a>
          <div style="color:rgba(0,0,0,.55); font-size:12px;">ID: ${escapeHtml(x.pid)}</div>
        </div>

        <div class="resResult ${x.valueText==="DNF" ? "dnf":""}">${escapeHtml(x.valueText)}</div>

        <div>${extra}</div>

        ${solvesBlock}
      </div>
    `;
  }).join("");

  emptyEl.style.display = pageItems.length ? "none" : "block";

  if(state.bucketMode === "ao5"){
    rowsEl.querySelectorAll("button[data-solves-btn]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-solves-btn");
        const wrap = rowsEl.querySelector(`[data-solves-wrap="${CSS.escape(id)}"]`);
        if(!wrap) return;
        const on = wrap.style.display !== "none";
        wrap.style.display = on ? "none" : "block";
        btn.textContent = on ? "Show solves" : "Hide solves";
      });
    });
  }

  const info = $("resPageInfo");
  if(info) info.textContent = `Page ${state.page} of ${totalPages}`;
  $("resFirst").onclick = ()=>{ state.page=1; render(); };
  $("resPrev").onclick  = ()=>{ state.page=Math.max(1,state.page-1); render(); };
  $("resNext").onclick  = ()=>{ state.page=Math.min(totalPages,state.page+1); render(); };
  $("resLast").onclick  = ()=>{ state.page=totalPages; render(); };
}


  function renderHeaderAndStats(comps){
    const titleEl = $("resTitle");
    const subEl = $("resSub");

    const comp = (comps || []).find(c => low(c.comp_id) === state.compId) || null;
    state.compRow = comp;

    const name = safe(comp?.comp_name) || state.compId || "Results";
    const date = safe(comp?.comp_date);
    const mode = safe(comp?.mode_label);

    if(titleEl) titleEl.textContent = name;
    if(subEl) subEl.textContent = [date, mode].filter(Boolean).join(" • ") || "Competition results";

    // back button -> competition view
    const back = $("backToComp");
    if(back){
      back.href = `/competitions/view/?id=${encodeURIComponent(state.compId)}`;
      back.textContent = "← Back to competition";
    }

    const uniquePlayers = new Set(state.allRows.map(r=>safe(r.player_id)).filter(Boolean)).size;
    const uniqueEvents = new Set(state.allRows.map(r=>safe(r.event)).filter(Boolean)).size;

    // Total solves = count of filled s1..s5 cells (DNF included if present)
    let totalSolves = 0;
    for(const r of state.allRows){
      for(const f of solveFields){
        const v = safe(r[f]);
        if(v) totalSolves += 1;
      }
    }

    $("statParticipants").textContent = uniquePlayers.toLocaleString("en-IN");
    $("statEvents").textContent = uniqueEvents.toLocaleString("en-IN");
    $("statSolves").textContent = totalSolves.toLocaleString("en-IN");
  }

  async function init(){
    state.compId = getCompIdFromUrl();

    if(!state.compId){
      $("resTitle").textContent = "Results";
      $("resSub").textContent = "Missing competition id in URL.";
      $("resEmpty").style.display = "block";
      $("resEmpty").textContent = "Open like: /competitions/results/?id=YOUR_COMP_ID";
      return;
    }

    // bind UI
    $("resSearch").addEventListener("input",(e)=>{
      state.search = e.target.value;
      state.page = 1;
      render();
    });

    $("resPageSize").addEventListener("change",(e)=>{
      state.pageSize = parseInt(e.target.value,10) || 100;
      state.page = 1;
      render();
    });

    try{
      const [ranks, comps] = await Promise.all([
        window.CB_API.getCSV(window.CB.CSV_RANKINGS),
        window.CB_API.getCSV(window.CB.CSV_COMPETITIONS),
      ]);

      state.allRows = (ranks || []).filter(r => low(r.comp_id) === state.compId);

      renderHeaderAndStats(comps || []);

      // events
      const evSet = new Set(state.allRows.map(r=>safe(r.event)).filter(Boolean));
      state.events = Array.from(evSet);
      state.events.sort(sortEvents);

      state.event = state.events[0] || "3x3";

      // categories (Overall + age cats if present)
      const catSet = new Set(state.allRows.map(r=>safe(r.age_cat)).filter(Boolean));
      const ageCats = Array.from(catSet).sort(sortAgeCats);
      state.cats = ["Overall", ...ageCats];
      state.cat = "Overall";

      render();
    }catch(err){
      console.error(err);
      $("resEmpty").style.display = "block";
      $("resEmpty").textContent = "Error loading results.";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
