/* rankings.js — FIXED: Event chips styled via CSS,
   Persons tab outputs only names, H2H sets toggling works via CSS */

(function(){
  const IST_OFFSET_MIN = 330;

  const EVENT_ORDER = [
    "3x3","2x2","4x4","5x5","6x6","7x7",
    "Pyraminx","Skewb","Clock","Megaminx","OH","Square 1",
    "3BLD","4BLD","5BLD","FMC","Mirror Cube"
  ];
  const EVENT_RANK = new Map(EVENT_ORDER.map((e,i)=>[e.toLowerCase(), i]));

  const solveFields = ["s1","s2","s3","s4","s5"];
  const $ = (id)=> document.getElementById(id);

  const state = {
    rawRankRows: [],
    rawCompRows: [],
    compById: new Map(),

    tab: "rankings",
    event: "3x3",
    mode: "single",
    search: "",
    page: 1,
    pageSize: 100,

    persons: [],
    pSearch: "",
    pSort: "id",
    pPage: 1,
    pPageSize: 100,

    compsList: [],
    cSearch: "",
    cPage: 1,
    cPageSize: 50,

    h2hCompId: "",
    h2hEvent: "3x3",
    h2hView: "playoff",
    h2hGroup: "A",
  };

  function safe(v){ return (v ?? "").toString().trim(); }
  function low(v){ return safe(v).toLowerCase(); }

  function parseIST(s){
    const t = safe(s);
    if(!t) return null;

    let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if(m){
      const dd=+m[1], mm=+m[2], yyyy=+m[3], hh=+m[4], min=+m[5];
      return Date.UTC(yyyy, mm-1, dd, hh, min) - IST_OFFSET_MIN*60*1000;
    }

    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m){
      const dd=+m[1], mm=+m[2], yyyy=+m[3];
      return Date.UTC(yyyy, mm-1, dd, 0, 0) - IST_OFFSET_MIN*60*1000;
    }

    const parts = t.split(/\s*-\s*/);
    if(parts.length === 2){
      return parseIST(parts[1]) ?? parseIST(parts[0]);
    }

    return null;
  }

  function escapeHtml(str){
    return safe(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

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

  function fmtH2HCell(rawVal){
    const s = safe(rawVal);
    if(!s) return "–";
    const secs = parseTimeToSeconds(s);
    if(secs === null) return "DNF";
    return fmtTime(secs);
  }

  function eventSortKey(e){
    const k = low(e);
    if(EVENT_RANK.has(k)) return EVENT_RANK.get(k);
    return 999;
  }

  function computeStatsHomeStyle(rankRows){
    let totalSolves = 0;
    const players = new Set();
    const comps = new Set();
    const events = new Set();

    for(const r of (rankRows||[])){
      const pid = safe(r.player_id);
      if(pid) players.add(pid);
      const cid = safe(r.comp_id);
      if(cid) comps.add(cid);

      const ev = safe(r.event);
      if(ev) events.add(ev);

      for(const f of solveFields){
        const v = low(r[f]);
        if(!v) continue;
        if(v === "dnf") continue;
        totalSolves++;
      }
    }
    return { totalSolves, uniquePlayers: players.size, uniqueComps: comps.size, uniqueEvents: events.size };
  }

  function buildCompMap(comps){
    const m = new Map();
    for(const c of comps){
      const id = low(c.comp_id);
      if(!id) continue;
      m.set(id, c);
    }
    return m;
  }

  function compNameById(cid){
    const c = state.compById.get(low(cid));
    return safe(c?.comp_name) || safe(cid) || "—";
  }
  function compDateById(cid){
    const c = state.compById.get(low(cid));
    return safe(c?.comp_date) || "—";
  }

  function compEndKeyFromCompRow(c){
    const ce = parseIST(c?.comp_end);
    if(ce !== null) return ce;

    const cd = safe(c?.comp_date);
    if(!cd) return 0;
    const parts = cd.split(/\s*-\s*/);
    if(parts.length === 2){
      return parseIST(parts[1]) ?? parseIST(parts[0]) ?? 0;
    }
    return parseIST(cd) ?? 0;
  }

  function compEndKeyFromCompDate(comp_date){
    const t = safe(comp_date);
    if(!t) return 0;
    const parts = t.split(/\s*-\s*/);
    if(parts.length === 2){
      return parseIST(parts[1]) ?? parseIST(parts[0]) ?? 0;
    }
    return parseIST(t) ?? 0;
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
        worst = it;
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
    if(keep.length !== 3) return { ao5: null, bestIdx: best.i, worstIdx: worst.i };

    const sum = keep.reduce((s,it)=> s + it.v, 0);
    return { ao5: sum / 3, bestIdx: best.i, worstIdx: worst.i };
  }

  function pickBestSingles(rows, event){
    const best = new Map();
    for(const r of rows){
      if(low(r.event) !== low(event)) continue;
      const pid = safe(r.player_id);
      if(!pid) continue;

      let secs = parseTimeToSeconds(r.best_single);
      if(secs === null){
        let localMin = null;
        for(const f of solveFields){
          const s = parseTimeToSeconds(r[f]);
          if(s === null) continue;
          localMin = (localMin === null) ? s : Math.min(localMin, s);
        }
        secs = localMin;
      }
      if(secs === null) continue;

      const cur = best.get(pid);
      if(!cur || secs < cur.secs){
        best.set(pid, { secs, row: r });
      }
    }

    const out = [];
    for(const [pid, obj] of best.entries()){
      out.push({
        player_id: pid,
        name: safe(obj.row.name) || `Player ${pid}`,
        comp_id: safe(obj.row.comp_id),
        valueSecs: obj.secs,
        valueText: fmtTime(obj.secs),
        row: obj.row,
      });
    }
    out.sort((a,b)=> a.valueSecs - b.valueSecs);
    return out;
  }

  function pickBestAo5(rows, event){
    const best = new Map();
    for(const r of rows){
      if(low(r.event) !== low(event)) continue;
      if(isH2HRow(r)) continue;

      const pid = safe(r.player_id);
      if(!pid) continue;

      let ao5Secs = parseTimeToSeconds(r.ao5);
      const solvesSecs = solveFields.map(f => parseTimeToSeconds(r[f]));
      const calc = calcAo5FromSolves(solvesSecs);

      if(ao5Secs === null) ao5Secs = calc.ao5;
      if(ao5Secs === null) continue;

      const cur = best.get(pid);
      if(!cur || ao5Secs < cur.ao5Secs){
        best.set(pid, { ao5Secs, row: r, solvesSecs, bestIdx: calc.bestIdx, worstIdx: calc.worstIdx });
      }
    }

    const out = [];
    for(const [pid, obj] of best.entries()){
      out.push({
        player_id: pid,
        name: safe(obj.row.name) || `Player ${pid}`,
        comp_id: safe(obj.row.comp_id),
        valueSecs: obj.ao5Secs,
        valueText: fmtTime(obj.ao5Secs),
        solvesSecs: obj.solvesSecs,
        bestIdx: obj.bestIdx,
        worstIdx: obj.worstIdx,
        row: obj.row
      });
    }
    out.sort((a,b)=> a.valueSecs - b.valueSecs);
    return out;
  }

  function filterBySearch(list, q){
    const s = low(q);
    if(!s) return list;
    return list.filter(x => low(x.name).includes(s) || safe(x.player_id).includes(s));
  }

  function setTab(tab){
    state.tab = tab;

    document.querySelectorAll(".rkTab").forEach(b=>{
      b.classList.toggle("on", b.dataset.tab === tab);
    });

    document.querySelectorAll(".rkPanel").forEach(p=> p.classList.remove("on"));
    const panel = document.getElementById(`panel-${tab}`);
    if(panel) panel.classList.add("on");

    if(tab === "rankings") renderRankings();
    if(tab === "persons") renderPersons();
    if(tab === "competitions") renderCompetitions();
    if(tab === "h2h") renderH2H();
  }

  function renderEventControls(events){
    const select = $("rkEventSelect");
    const chips = $("rkEventChips");
    if(!select || !chips) return;

    select.innerHTML = events.map(e=>`<option value="${e}">${e}</option>`).join("");
    select.value = state.event;

    chips.innerHTML = events.map(e=>{
      const on = low(e) === low(state.event) ? "on" : "";
      return `<button class="rkChip ${on}" type="button" data-ev="${e}">${e}</button>`;
    }).join("");

    chips.querySelectorAll("button[data-ev]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        state.event = btn.dataset.ev;
        state.page = 1;
        renderRankings();
        select.value = state.event;
        chips.querySelectorAll(".rkChip").forEach(x=>x.classList.toggle("on", x.dataset.ev === state.event));
      });
    });

    select.addEventListener("change", ()=>{
      state.event = select.value;
      state.page = 1;
      renderRankings();
      chips.querySelectorAll(".rkChip").forEach(x=>x.classList.toggle("on", x.dataset.ev === state.event));
    });
  }

  function setMode(mode){
    state.mode = mode;
    state.page = 1;
    document.querySelectorAll(".rkModeBtn[data-mode]").forEach(b=>{
      b.classList.toggle("on", b.dataset.mode === mode);
    });
    renderRankings();
  }

  function renderRankings(){
    const rowsEl = $("rkRows");
    const emptyEl = $("rkEmpty");
    const metaTitle = $("rkMetaTitle");
    const metaCount = $("rkMetaCount");
    if(!rowsEl || !emptyEl) return;

    const eventsSet = new Set();
    for(const r of state.rawRankRows){
      const e = safe(r.event);
      if(e) eventsSet.add(e);
    }
    const events = Array.from(eventsSet).sort((a,b)=>{
      const ka = eventSortKey(a), kb = eventSortKey(b);
      if(ka !== kb) return ka - kb;
      return a.localeCompare(b);
    });

    if(!events.includes("3x3") && events.length) state.event = events[0];
    renderEventControls(events);

    if(metaTitle) metaTitle.textContent = `${state.event} • ${state.mode === "single" ? "Single" : "Ao5"}`;

    const all = (state.mode === "single")
      ? pickBestSingles(state.rawRankRows, state.event)
      : pickBestAo5(state.rawRankRows, state.event);

    const filtered = filterBySearch(all, state.search);
    if(metaCount) metaCount.textContent = `${filtered.length} players`;

    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.pageSize;
    const pageItems = filtered.slice(start, start + state.pageSize);

    rowsEl.innerHTML = pageItems.map((x, idx)=>{
      const rank = start + idx + 1;
      const personHref = `/persons/?id=${encodeURIComponent(x.player_id)}`;
      const compHref = `/competitions/results/?id=${encodeURIComponent(low(x.comp_id))}`;

      const extra = (state.mode === "ao5")
        ? `<button class="rkShowSolves" type="button" data-solves-btn="${rank}">Show solves</button>`
        : `<span></span>`;

      const solvesBlock = (state.mode === "ao5")
        ? `
          <div class="rkSolvesWrap" data-solves-wrap="${rank}" style="display:none;">
            <div class="rkSolvesScroll">
              <div class="rkSolvesRow">
                ${solveFields.map((f,i)=>{
                  const v = x.solvesSecs?.[i] ?? parseTimeToSeconds(x.row?.[f]);
                  const cls = (i === x.bestIdx) ? "rkSolve best" : (i === x.worstIdx) ? "rkSolve worst" : "rkSolve";
                  return `<div class="${cls}">${fmtTime(v === null ? "DNF" : v)}</div>`;
                }).join("")}
              </div>
            </div>
          </div>`
        : "";

      return `
        <div class="rkRow">
          <div class="rkCellRank rkRank">${rank}</div>

          <div class="rkCellPlayer rkPlayer" data-rank="#${rank}">
            <a href="${personHref}">${escapeHtml(x.name)}</a>
            <div class="rkPlayerId">ID: ${escapeHtml(x.player_id)}</div>
          </div>

          <div class="rkCellResult rkResult">${escapeHtml(x.valueText)}</div>

          <div class="rkCellExtra">${extra}</div>

          <div class="rkCellComp rkComp">
            <a href="${compHref}">${escapeHtml(compNameById(x.comp_id))}</a>
          </div>

          ${solvesBlock}
        </div>
      `;
    }).join("");

    emptyEl.style.display = pageItems.length ? "none" : "block";

    if(state.mode === "ao5"){
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

    const info = $("rkPageInfo");
    if(info) info.textContent = `Page ${state.page} of ${totalPages}`;

    $("rkFirst").onclick = ()=>{ state.page=1; renderRankings(); };
    $("rkPrev").onclick  = ()=>{ state.page=Math.max(1,state.page-1); renderRankings(); };
    $("rkNext").onclick  = ()=>{ state.page=Math.min(totalPages,state.page+1); renderRankings(); };
    $("rkLast").onclick  = ()=>{ state.page=totalPages; renderRankings(); };
  }

  function buildPersons(){
    const map = new Map();
    for(const r of state.rawRankRows){
      const pid = safe(r.player_id);
      if(!pid) continue;
      const name = safe(r.name) || `Player ${pid}`;
      if(!map.has(pid)) map.set(pid, name);
    }
    return Array.from(map.entries()).map(([pid,name])=>({ player_id: pid, name }));
  }

  function renderPersons(){
    const rowsEl = $("pRows");
    const emptyEl = $("pEmpty");
    const meta = $("pMetaCount");
    if(!rowsEl || !emptyEl) return;

    let list = state.persons.slice();

    if(state.pSort === "id"){
      list.sort((a,b)=> Number(a.player_id) - Number(b.player_id));
    }else{
      list.sort((a,b)=> a.name.localeCompare(b.name));
    }

    const q = low(state.pSearch);
    if(q){
      list = list.filter(x => low(x.name).includes(q) || safe(x.player_id).includes(q));
    }

    if(meta) meta.textContent = `${list.length} persons`;

    const totalPages = Math.max(1, Math.ceil(list.length / state.pPageSize));
    state.pPage = Math.min(state.pPage, totalPages);

    const start = (state.pPage - 1) * state.pPageSize;
    const pageItems = list.slice(start, start + state.pPageSize);

  rowsEl.innerHTML = pageItems.map(x => {
  const href = `/persons/?id=${encodeURIComponent(x.player_id)}`;
  return `
    <div class="rkListRow">
      <div class="rkListNameCell">
        <a href="${href}">${escapeHtml(x.name)}</a>
      </div>
      <div class="rkListIdCell">
        ${escapeHtml(x.player_id)}
      </div>
    </div>
  `;
}).join("");



    emptyEl.style.display = pageItems.length ? "none" : "block";

    const info = $("pPageInfo");
    if(info) info.textContent = `Page ${state.pPage} of ${totalPages}`;

    $("pFirst").onclick = ()=>{ state.pPage=1; renderPersons(); };
    $("pPrev").onclick  = ()=>{ state.pPage=Math.max(1,state.pPage-1); renderPersons(); };
    $("pNext").onclick  = ()=>{ state.pPage=Math.min(totalPages,state.pPage+1); renderPersons(); };
    $("pLast").onclick  = ()=>{ state.pPage=totalPages; renderPersons(); };
  }

  function getRegisterLink(c){
    return safe(
      c?.register_link ||
      c?.reg_link ||
      c?.registration_link ||
      c?.register ||
      c?.reg_url ||
      c?.register_now ||
      ""
    );
  }

  function buildCompetitionsList(){
    const arr = (state.rawCompRows || []).map(c=>{
      const cid = low(c.comp_id);
      return {
        comp_id: cid,
        comp_name: safe(c.comp_name) || cid,
        comp_date: safe(c.comp_date) || "",
        register_link: getRegisterLink(c),
        _endKey: compEndKeyFromCompRow(c)
      };
    }).filter(x=>x.comp_id);

    const seen = new Set();
    const out = [];
    for(const c of arr){
      if(seen.has(c.comp_id)) continue;
      seen.add(c.comp_id);
      out.push(c);
    }

    out.sort((a,b)=> (b._endKey||0) - (a._endKey||0));
    return out;
  }

  function renderCompetitions(){
    const rowsEl = $("cRows");
    const emptyEl = $("cEmpty");
    const meta = $("cMetaCount");
    if(!rowsEl || !emptyEl) return;

    let list = state.compsList.slice();
    const q = low(state.cSearch);
    if(q){
      list = list.filter(x => low(x.comp_name).includes(q) || low(x.comp_id).includes(q));
    }

    if(meta) meta.textContent = `${list.length} competitions`;

    const totalPages = Math.max(1, Math.ceil(list.length / state.cPageSize));
    state.cPage = Math.min(state.cPage, totalPages);

    const start = (state.cPage - 1) * state.cPageSize;
    const pageItems = list.slice(start, start + state.cPageSize);

    const now = Date.now();

    rowsEl.innerHTML = pageItems.map(c=>{
      const resultsHref = `/competitions/results/?id=${encodeURIComponent(c.comp_id)}`;
      const detailsHref = `/competitions/view/?id=${encodeURIComponent(c.comp_id)}`;
      const isOver = (c._endKey || 0) > 0 ? (c._endKey < now) : true;

      const actions = isOver
        ? `<a class="rkActionBtn primary" href="${resultsHref}">View results</a>`
        : (c.register_link
            ? `<a class="rkActionBtn primary" href="${escapeHtml(c.register_link)}" target="_blank" rel="noopener">Register now</a>`
            : `<a class="rkActionBtn" href="${detailsHref}">View details</a>`);

      return `
        <div class="rkCompCard">
          <div class="rkCompName">${escapeHtml(c.comp_name)}</div>
          <div class="rkCompDate">${escapeHtml(c.comp_date || "—")}</div>

          <div class="rkCompActions">
            <a class="rkActionBtn" href="${detailsHref}">View details</a>
            ${actions}
          </div>
        </div>
      `;
    }).join("");

    emptyEl.style.display = pageItems.length ? "none" : "block";

    const info = $("cPageInfo");
    if(info) info.textContent = `Page ${state.cPage} of ${totalPages}`;

    $("cFirst").onclick = ()=>{ state.cPage=1; renderCompetitions(); };
    $("cPrev").onclick  = ()=>{ state.cPage=Math.max(1,state.cPage-1); renderCompetitions(); };
    $("cNext").onclick  = ()=>{ state.cPage=Math.min(totalPages,state.cPage+1); renderCompetitions(); };
    $("cLast").onclick  = ()=>{ state.cPage=totalPages; renderCompetitions(); };
  }

  /* H2H */
  function buildH2HCompetitionOptions(){
    const compSet = new Set();
    for(const r of state.rawRankRows){
      if(!isH2HRow(r)) continue;
      const cid = low(r.comp_id);
      if(cid) compSet.add(cid);
    }

    const arr = Array.from(compSet).map(cid=>({
      comp_id: cid,
      comp_name: compNameById(cid),
      _endKey: compEndKeyFromCompDate(compDateById(cid))
    }));
    arr.sort((a,b)=> (b._endKey||0) - (a._endKey||0));
    return arr;
  }

  function buildH2HEventOptions(comp_id){
    const set = new Set();
    for(const r of state.rawRankRows){
      if(!isH2HRow(r)) continue;
      if(low(r.comp_id) !== low(comp_id)) continue;
      const ev = safe(r.event);
      if(ev) set.add(ev);
    }
    const arr = Array.from(set).sort((a,b)=>{
      const ka = eventSortKey(a), kb = eventSortKey(b);
      if(ka !== kb) return ka - kb;
      return a.localeCompare(b);
    });
    return arr.length ? arr : ["3x3"];
  }

  function hasPrelims(comp_id, event){
    for(const r of state.rawRankRows){
      if(low(r.comp_id) !== low(comp_id)) continue;
      if(low(r.event) !== low(event)) continue;
      const q = safe(r.prelims_qualification);
      if(q) return true;
    }
    return false;
  }

  function getPrelimsN(comp_id, event){
    for(const r of state.rawRankRows){
      if(low(r.comp_id) !== low(comp_id)) continue;
      if(low(r.event) !== low(event)) continue;
      const q = safe(r.prelims_qualification);
      const n = parseInt(q,10);
      if(Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }

  function buildMatchGroups(rows){
    const matches = new Map();
    for(const r of rows){
      const mid = safe(r.h2h_match_id);
      if(!mid) continue;

      const setNo = safe(r.h2h_set_no) || "1";
      const bracket = safe(r.h2h_bracket) || safe(r.h2h_round_name) || "Match";
      const rrGroup = safe(r.h2h_group);

      if(!matches.has(mid)){
        matches.set(mid, {
          match_id: mid,
          bracket,
          group: rrGroup,
          minIndex: r._rowIndex ?? 0,
          sets: new Map(),
        });
      }

      const m = matches.get(mid);
      m.minIndex = Math.min(m.minIndex, r._rowIndex ?? 0);

      if(!m.sets.has(setNo)){
        m.sets.set(setNo, { A: null, B: null });
      }

      const setObj = m.sets.get(setNo);
      if(!setObj.A) setObj.A = r;
      else if(!setObj.B) setObj.B = r;

      if(rrGroup && !m.group) m.group = rrGroup;
    }
    return matches;
  }

  function decideWinnerForSolve(aSecs, bSecs){
    if(aSecs === null && bSecs === null) return "tie";
    if(aSecs === null) return "b";
    if(bSecs === null) return "a";
    if(aSecs < bSecs) return "a";
    if(bSecs < aSecs) return "b";
    return "tie";
  }

  function renderH2H(){
    const compSel = $("hCompSelect");
    const evSel = $("hEventSelect");
    const listEl = $("h2hRows");
    const emptyEl = $("hEmpty");
    const metaTitle = $("hMetaTitle");
    const metaCount = $("hMetaCount");
    const groupsWrap = $("hGroups");
    const prelimBtn = $("hPrelimsBtn");

    if(!compSel || !evSel || !listEl || !emptyEl) return;

    const compOpts = buildH2HCompetitionOptions();
    compSel.innerHTML = compOpts.map(c=>`<option value="${c.comp_id}">${escapeHtml(c.comp_name)}</option>`).join("");

    if(!compOpts.length){
      if(metaTitle) metaTitle.textContent = "Head-to-Head";
      if(metaCount) metaCount.textContent = "—";
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      emptyEl.textContent = "No matches found.";
      prelimBtn.style.display = "none";
      groupsWrap.style.display = "none";
      return;
    }

    if(!state.h2hCompId){
      state.h2hCompId = compOpts[0]?.comp_id || "";
    }
    compSel.value = state.h2hCompId;

    const evOpts = buildH2HEventOptions(state.h2hCompId);
    evSel.innerHTML = evOpts.map(e=>`<option value="${e}">${escapeHtml(e)}</option>`).join("");
    if(!evOpts.some(e=>low(e)===low(state.h2hEvent))) state.h2hEvent = evOpts[0];
    evSel.value = state.h2hEvent;

    const showPre = hasPrelims(state.h2hCompId, state.h2hEvent);
    prelimBtn.style.display = showPre ? "inline-flex" : "none";
    if(state.h2hView === "prelims" && !showPre) state.h2hView = "playoff";

    const rrGroupSet = new Set();
    for(const r of state.rawRankRows){
      if(!isH2HRow(r)) continue;
      if(low(r.comp_id) !== low(state.h2hCompId)) continue;
      if(low(r.event) !== low(state.h2hEvent)) continue;
      const g = safe(r.h2h_group);
      if(g === "A" || g === "B") rrGroupSet.add(g);
    }
    const hasRR = rrGroupSet.size > 0;
    groupsWrap.style.display = (state.h2hView === "roundrobin" && hasRR) ? "flex" : "none";

    const compName = compNameById(state.h2hCompId);
    if(metaTitle){
      metaTitle.textContent =
        state.h2hView === "prelims" ? `${compName} • Prelims • ${state.h2hEvent}` :
        state.h2hView === "roundrobin" ? `${compName} • Round Robin • Group ${state.h2hGroup} • ${state.h2hEvent}` :
        `${compName} • Playoff • ${state.h2hEvent}`;
    }

    const scopeRows = state.rawRankRows.filter(r =>
      low(r.comp_id) === low(state.h2hCompId) && low(r.event) === low(state.h2hEvent)
    );

    /* PRELIMS */
    if(state.h2hView === "prelims"){
      const n = getPrelimsN(state.h2hCompId, state.h2hEvent);

      const onlyThisComp = scopeRows.filter(r => !isH2HRow(r));
      const bestMap = new Map();

      for(const r of onlyThisComp){
        const pid = safe(r.player_id);
        if(!pid) continue;

        let ao5Secs = parseTimeToSeconds(r.ao5);
        const solvesSecs = solveFields.map(f => parseTimeToSeconds(r[f]));
        const calc = calcAo5FromSolves(solvesSecs);

        if(ao5Secs === null) ao5Secs = calc.ao5;
        if(ao5Secs === null) continue;

        const cur = bestMap.get(pid);
        if(!cur || ao5Secs < cur.ao5Secs){
          bestMap.set(pid, { ao5Secs, row: r, solvesSecs, bestIdx: calc.bestIdx, worstIdx: calc.worstIdx });
        }
      }

      const arr = Array.from(bestMap.entries()).map(([pid,o])=>({
        player_id: pid,
        name: safe(o.row.name) || `Player ${pid}`,
        valueSecs: o.ao5Secs,
        valueText: fmtTime(o.ao5Secs),
        solvesSecs: o.solvesSecs,
        bestIdx: o.bestIdx,
        worstIdx: o.worstIdx
      })).sort((a,b)=>a.valueSecs-b.valueSecs);

      if(metaCount) metaCount.textContent = n ? `${arr.length} players • Top ${n} qualify` : `${arr.length} players`;

      listEl.innerHTML = arr.map((x, i)=>{
        const rank = i + 1;
        const qualifies = (n && rank <= n);
        const href = `/persons/?id=${encodeURIComponent(x.player_id)}`;

        return `
          <div class="preCard ${qualifies ? "qualified" : ""}">
            <div class="preTop">
              <div class="preName"><a href="${href}">${escapeHtml(x.name)}</a></div>
              <div class="preResult">${escapeHtml(x.valueText)}</div>
            </div>

            <div class="preActions">
              <button class="h2hToggleSets" type="button" data-pre-solves="${rank}">Show solves</button>
            </div>

            <div class="rkSolvesWrap" data-pre-wrap="${rank}" style="display:none;margin-top:8px;">
              <div class="rkSolvesScroll">
                <div class="rkSolvesRow">
                  ${x.solvesSecs.map((s,idx)=>{
                    const cls = (idx===x.bestIdx) ? "rkSolve best" : (idx===x.worstIdx) ? "rkSolve worst" : "rkSolve";
                    return `<div class="${cls}">${fmtTime(s === null ? "DNF" : s)}</div>`;
                  }).join("")}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");

      emptyEl.style.display = arr.length ? "none" : "block";

      listEl.querySelectorAll("button[data-pre-solves]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const id = btn.getAttribute("data-pre-solves");
          const wrap = listEl.querySelector(`[data-pre-wrap="${CSS.escape(id)}"]`);
          if(!wrap) return;
          const on = wrap.style.display !== "none";
          wrap.style.display = on ? "none" : "block";
          btn.textContent = on ? "Show solves" : "Hide solves";
        });
      });

      return;
    }

    /* MATCHES */
    const h2hRows = scopeRows.filter(r => isH2HRow(r));
    let viewRows = h2hRows;

    if(state.h2hView === "roundrobin"){
      viewRows = h2hRows.filter(r => safe(r.h2h_group) === state.h2hGroup);
    }else{
      viewRows = h2hRows.filter(r => !(safe(r.h2h_group)==="A" || safe(r.h2h_group)==="B"));
    }

    const matches = buildMatchGroups(viewRows);

    const matchArr = Array.from(matches.values()).map(m=>{
      let aId = null, bId = null;
      let aName = "—", bName = "—";
      let aWins = 0, bWins = 0;

      for(const pair of m.sets.values()){
        const A = pair.A, B = pair.B;
        if(A && !aId){ aId = safe(A.player_id); aName = safe(A.name)||`Player ${aId}`; }
        if(B && !bId){ bId = safe(B.player_id); bName = safe(B.name)||`Player ${bId}`; }

        const winner = safe(A?.set_winner_id || B?.set_winner_id);
        if(winner && aId && winner === aId) aWins++;
        else if(winner && bId && winner === bId) bWins++;
      }

      const winnerId = safe(Array.from(m.sets.values())[0]?.A?.match_winner_id || Array.from(m.sets.values())[0]?.B?.match_winner_id);
      const leftWin = (winnerId && aId && winnerId === aId);
      const rightWin = (winnerId && bId && winnerId === bId);

      return {
        bracket: m.bracket || "Match",
        group: m.group || "",
        aId, bId, aName, bName,
        aWins, bWins,
        leftWin, rightWin,
        sets: m.sets,
        minIndex: m.minIndex
      };
    });

    matchArr.sort((x,y)=> (y.minIndex||0) - (x.minIndex||0));
    if(metaCount) metaCount.textContent = `${matchArr.length} matches`;

    listEl.innerHTML = matchArr.map((m, idx)=>{
      const leftHref = m.aId ? `/persons/?id=${encodeURIComponent(m.aId)}` : "#";
      const rightHref = m.bId ? `/persons/?id=${encodeURIComponent(m.bId)}` : "#";

      const leftCls = m.leftWin ? "win" : "lose";
      const rightCls = m.rightWin ? "win" : "lose";

      const setHtml = Array.from(m.sets.entries()).sort((a,b)=> Number(a[0]) - Number(b[0])).map(([setNo, pair])=>{
        const A = pair.A, B = pair.B;

        const aLabel = safe(A?.name) || (m.aId ? `Player ${m.aId}` : "Player");
        const bLabel = safe(B?.name) || (m.bId ? `Player ${m.bId}` : "Player");

        const aTimesRaw = solveFields.map(f => A?.[f]);
        const bTimesRaw = solveFields.map(f => B?.[f]);

        const aSecs = aTimesRaw.map(v => safe(v) ? parseTimeToSeconds(v) : null);
        const bSecs = bTimesRaw.map(v => safe(v) ? parseTimeToSeconds(v) : null);

        const aCells = aTimesRaw.map((raw,i)=>{
          const w = decideWinnerForSolve(aSecs[i], bSecs[i]);
          const cls = (w==="a") ? "h2hTime win" : (w==="b") ? "h2hTime lose" : "h2hTime";
          return `<div class="${cls}">${fmtH2HCell(raw)}</div>`;
        }).join("");

        const bCells = bTimesRaw.map((raw,i)=>{
          const w = decideWinnerForSolve(aSecs[i], bSecs[i]);
          const cls = (w==="b") ? "h2hTime win" : (w==="a") ? "h2hTime lose" : "h2hTime";
          return `<div class="${cls}">${fmtH2HCell(raw)}</div>`;
        }).join("");

        const aNameCls = m.leftWin ? "h2hCompareName win" : "h2hCompareName lose";
        const bNameCls = m.rightWin ? "h2hCompareName win" : "h2hCompareName lose";

        const aNameLink = m.aId ? `<a href="/persons/?id=${encodeURIComponent(m.aId)}">${escapeHtml(aLabel)}</a>` : escapeHtml(aLabel);
        const bNameLink = m.bId ? `<a href="/persons/?id=${encodeURIComponent(m.bId)}">${escapeHtml(bLabel)}</a>` : escapeHtml(bLabel);

        return `
          <div class="h2hSet">
            <div class="h2hSetTitle">Set ${escapeHtml(setNo)}</div>

            <div class="h2hCompareScroll">
              <div class="h2hCompareInner">
                <div class="h2hCompareRow">
                  <div class="${aNameCls}">${aNameLink}</div>
                  <div class="h2hCompareTimes">${aCells}</div>
                </div>

                <div class="h2hCompareRow">
                  <div class="${bNameCls}">${bNameLink}</div>
                  <div class="h2hCompareTimes">${bCells}</div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");

      const header = (state.h2hView === "roundrobin" && m.group)
        ? `${m.bracket} • Group ${m.group}`
        : `${m.bracket}`;

      return `
        <div class="h2hCard">
          <div class="h2hTop">
            <div class="h2hRound">${escapeHtml(header)}</div>
            <button class="h2hToggleSets" type="button" data-sets="${idx}">Show sets</button>
          </div>

          <div class="h2hSummary">
            <div class="h2hName ${leftCls}"><a href="${leftHref}">${escapeHtml(m.aName)}</a></div>

            <div class="h2hScore">
              <span class="${leftCls}">${m.aWins}</span>
              <span class="mid">|</span>
              <span class="${rightCls}">${m.bWins}</span>
            </div>

            <div class="h2hName ${rightCls}" style="text-align:right;"><a href="${rightHref}">${escapeHtml(m.bName)}</a></div>
          </div>

          <div class="h2hSets" data-sets-wrap="${idx}">
            ${setHtml}
          </div>
        </div>
      `;
    }).join("");

    emptyEl.style.display = matchArr.length ? "none" : "block";

    listEl.querySelectorAll("button[data-sets]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-sets");
        const wrap = listEl.querySelector(`[data-sets-wrap="${CSS.escape(id)}"]`);
        if(!wrap) return;
        const on = wrap.classList.contains("on");
        wrap.classList.toggle("on", !on);
        btn.textContent = on ? "Show sets" : "Hide sets";
      });
    });

    compSel.onchange = ()=>{
      state.h2hCompId = compSel.value;
      const evOpts2 = buildH2HEventOptions(state.h2hCompId);
      state.h2hEvent = evOpts2[0] || "3x3";
      state.h2hView = "playoff";
      state.h2hGroup = "A";
      document.querySelectorAll(".rkModeBtn[data-h2hview]").forEach(b=>b.classList.toggle("on", b.dataset.h2hview === state.h2hView));
      renderH2H();
    };
    evSel.onchange = ()=>{
      state.h2hEvent = evSel.value;
      renderH2H();
    };
  }

  function bindGlobalControls(){
    document.querySelectorAll(".rkTab").forEach(btn=>{
      btn.addEventListener("click", ()=> setTab(btn.dataset.tab));
    });

    document.querySelectorAll(".rkModeBtn[data-mode]").forEach(btn=>{
      btn.addEventListener("click", ()=> setMode(btn.dataset.mode));
    });

    $("rkSearch").addEventListener("input", (e)=>{
      state.search = e.target.value;
      state.page = 1;
      renderRankings();
    });
    $("rkPageSize").addEventListener("change",(e)=>{
      state.pageSize = parseInt(e.target.value,10) || 100;
      state.page = 1;
      renderRankings();
    });

    $("pSearch").addEventListener("input",(e)=>{
      state.pSearch = e.target.value;
      state.pPage = 1;
      renderPersons();
    });
    $("pPageSize").addEventListener("change",(e)=>{
      state.pPageSize = parseInt(e.target.value,10) || 100;
      state.pPage = 1;
      renderPersons();
    });
    $("pSortId").addEventListener("click", ()=>{
      state.pSort = "id";
      $("pSortId").classList.add("on");
      $("pSortAZ").classList.remove("on");
      state.pPage = 1;
      renderPersons();
    });
    $("pSortAZ").addEventListener("click", ()=>{
      state.pSort = "az";
      $("pSortAZ").classList.add("on");
      $("pSortId").classList.remove("on");
      state.pPage = 1;
      renderPersons();
    });

    $("cSearch").addEventListener("input",(e)=>{
      state.cSearch = e.target.value;
      state.cPage = 1;
      renderCompetitions();
    });
    $("cPageSize").addEventListener("change",(e)=>{
      state.cPageSize = parseInt(e.target.value,10) || 50;
      state.cPage = 1;
      renderCompetitions();
    });

    document.querySelectorAll(".rkModeBtn[data-h2hview]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        state.h2hView = btn.dataset.h2hview;
        document.querySelectorAll(".rkModeBtn[data-h2hview]").forEach(b=>b.classList.toggle("on", b === btn));
        renderH2H();
      });
    });
    document.querySelectorAll(".rkModeBtn[data-group]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        state.h2hGroup = btn.dataset.group;
        document.querySelectorAll(".rkModeBtn[data-group]").forEach(b=>b.classList.toggle("on", b === btn));
        renderH2H();
      });
    });
  }

  async function getCSVWithCache(key, url, ttlMs){
    try{
      const raw = sessionStorage.getItem(key);
      if(raw){
        const obj = JSON.parse(raw);
        if(obj && obj.t && (Date.now() - obj.t) < ttlMs && Array.isArray(obj.data)){
          return obj.data;
        }
      }
    }catch(_){}

    const data = await window.CB_API.getCSV(url);
    try{
      sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
    }catch(_){}
    return data;
  }

  async function init(){
    bindGlobalControls();

    try{
      const [ranks, comps] = await Promise.all([
        getCSVWithCache("rk_csv_rankings", window.CB.CSV_RANKINGS, 0),
        getCSVWithCache("rk_csv_comps", window.CB.CSV_COMPETITIONS, 0),
      ]);

      state.rawRankRows = (ranks || []).map((r,i)=>({ ...r, _rowIndex: i }));
      state.rawCompRows = comps || [];
      state.compById = buildCompMap(state.rawCompRows);

      const s = computeStatsHomeStyle(state.rawRankRows);
      $("statPlayers").textContent = s.uniquePlayers.toLocaleString("en-IN");
      $("statSolves").textContent = s.totalSolves.toLocaleString("en-IN");
      $("statEvents").textContent = s.uniqueEvents.toLocaleString("en-IN");

      state.compsList = buildCompetitionsList();
      const now = Date.now();
      const pastCount = state.compsList.filter(c => (c._endKey || 0) > 0 ? (c._endKey < now) : true).length;
      $("statComps").textContent = pastCount.toLocaleString("en-IN");

      state.persons = buildPersons();

      setMode("single");
      setTab("rankings");

      const hOpts = buildH2HCompetitionOptions();
      state.h2hCompId = hOpts[0]?.comp_id || "";
      state.h2hEvent = "3x3";
      state.h2hView = "playoff";
      state.h2hGroup = "A";
      renderH2H();

    }catch(err){
      console.error(err);
      $("rkRows").innerHTML = "";
      $("rkEmpty").style.display = "block";
      $("rkEmpty").textContent = "Error loading rankings.";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
