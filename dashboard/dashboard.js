(function(){
  function $(id){ return document.getElementById(id); }
  function setMsg(text, type="info"){
    const el = $("msg");
    if(!el) return;
    el.textContent = text || "";
    el.className = "dashMsg " + type;
    el.style.display = text ? "block" : "none";
  }

  function low(v){ return String(v||"").trim().toLowerCase(); }
  function safe(v){ return String(v||"").trim(); }

  function resultsHref(cid){
    return `/competitions/results/?id=${encodeURIComponent(low(cid))}`;
  }

  function needConfig(){
    if(!window.CB?.SUPABASE_URL || !window.CB?.SUPABASE_KEY){
      setMsg("Config missing. Please check /js/config.js", "error");
      return false;
    }
    if(!window.supabase?.createClient){
      setMsg("Auth library failed to load (CDN).", "error");
      return false;
    }
    return true;
  }

  function hardClearAuthStorage(){
    try{
      const keys = [];
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(!k) continue;
        if(k.startsWith("sb-") && k.endsWith("-auth-token")) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    }catch(e){}
  }

  async function safeSignOut(supabase){
    try{ await supabase.auth.signOut({ scope: "local" }); }catch(e){}
    hardClearAuthStorage();
    location.replace("/auth/login.html");
  }

  // ---------- CSV helpers ----------
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

  // ---------- date parsing (range-aware) ----------
  function parseDMY(dmy){
    const s = safe(dmy);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(!m) return null;
    const dd = parseInt(m[1],10);
    const mm = parseInt(m[2],10);
    const yy = parseInt(m[3],10);
    if(!dd || !mm || !yy) return null;
    return new Date(Date.UTC(yy, mm-1, dd, 0, 0, 0));
  }

  function parseDateRange(value){
    const s = safe(value);
    if(!s) return { start:null, end:null };
    const parts = s.split(/\s*-\s*/).map(x=>x.trim()).filter(Boolean);
    if(parts.length === 1){
      const d = parseDMY(parts[0]);
      return { start:d, end:d };
    }
    const start = parseDMY(parts[0]);
    const end = parseDMY(parts[parts.length-1]);
    return { start, end };
  }

  function prettyDate(value){
    const { start, end } = parseDateRange(value);
    if(!start && !end) return safe(value) || "—";
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const fmt = (d) => `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    if(start && end && start.getTime() !== end.getTime()) return `${fmt(start)} – ${fmt(end)}`;
    return fmt(end || start);
  }

  function compDateSortKey(comp){
    const a = parseDateRange(comp?.comp_end || "");
    const b = parseDateRange(comp?.comp_date || "");
    const c = parseDateRange(comp?.comp_start || "");
    const end = a.end || b.end || c.end || a.start || b.start || c.start;
    return end ? end.getTime() : 0;
  }

  function compById(compRows){
    const map = {};
    for(const r of (compRows||[])){
      const id = low(r.comp_id || r.id || "");
      if(!id) continue;
      map[id] = r;
    }
    return map;
  }

  // ---------- event order ----------
  function normalizeEvent(ev){
    const e = safe(ev);
    if(!e) return "";
    return e.replace(/\s+/g," ").trim();
  }
  const EVENT_ORDER = ["3x3","2x2","4x4","5x5","pyraminx","skewb","clock","megaminx","square-1"];
  function eventKey(e){ return low(e).replace(/\s+/g,""); }
  function eventSortIndex(e){
    const k = eventKey(e);
    const idx = EVENT_ORDER.indexOf(k);
    return idx === -1 ? 999 : idx;
  }

  // ============================================================
  // ✅ PERSONS-STYLE METRICS + MEDALS
  // ============================================================

  const SOLVE_FIELDS = ["s1","s2","s3","s4","s5"];

  function parseSolveCell(raw) {
    const s = safe(raw);
    if (!s) return { kind: "empty", sec: null };

    const t = s.toLowerCase();
    if (t.includes("dnf")) return { kind: "dnf", sec: null };

    if (/^\d+(\.\d+)?$/.test(t)) {
      const v = Number(t);
      if (!Number.isFinite(v)) return { kind: "dnf", sec: null };
      if (v === 999 || v === 9999) return { kind: "dnf", sec: null };
      if (v >= 900) return { kind: "dnf", sec: null };
      return { kind: "time", sec: v };
    }

    const mm = t.match(/^(\d+):(\d+(\.\d+)?)$/);
    if (mm) {
      const m = Number(mm[1]);
      const s2 = Number(mm[2]);
      if (![m, s2].every(Number.isFinite)) return { kind: "dnf", sec: null };
      const total = m * 60 + s2;
      if (total >= 900) return { kind: "dnf", sec: null };
      return { kind: "time", sec: total };
    }

    const hh = t.match(/^(\d+):(\d+):(\d+(\.\d+)?)$/);
    if (hh) {
      const h = Number(hh[1]), m = Number(hh[2]), s3 = Number(hh[3]);
      if (![h, m, s3].every(Number.isFinite)) return { kind: "dnf", sec: null };
      const total = h * 3600 + m * 60 + s3;
      if (total >= 900) return { kind: "dnf", sec: null };
      return { kind: "time", sec: total };
    }

    return { kind: "dnf", sec: null };
  }

  function extractCells(r) {
    return SOLVE_FIELDS.map((f) => parseSolveCell(r[f]));
  }

  function computeAo5FromCells(cells) {
    // if missing solves => Ao5 not available ("-")
    if (cells.some((x) => x.kind === "empty")) return { kind: "na", sec: null };

    const dnfs = cells.filter((x) => x.kind === "dnf").length;
    if (dnfs >= 2) return { kind: "dnf", sec: null };

    const secs = cells.map((x) => (x.kind === "time" ? x.sec : Number.POSITIVE_INFINITY));
    const sorted = secs.slice().sort((a, b) => a - b);
    const mid3 = sorted.slice(1, 4);
    if (mid3.some((v) => !Number.isFinite(v))) return { kind: "dnf", sec: null };

    return { kind: "time", sec: (mid3[0] + mid3[1] + mid3[2]) / 3 };
  }

  function isH2HRow(r) {
    const hm = low(r.h2h_mode);
    return hm === "1" || hm === "true" || hm === "yes" || hm === "h2h";
  }

  function getBestSingleFromRow(r) {
    const bs = parseSolveCell(r.best_single);
    if (bs.kind === "time") return bs.sec;
    const times = extractCells(r).filter((x) => x.kind === "time").map((x) => x.sec);
    return times.length ? Math.min(...times) : null;
  }

  function getAo5Metric(r) {
    const computed = computeAo5FromCells(extractCells(r));
    // prefer computed ao5
    if (computed.kind === "time" || computed.kind === "dnf" || computed.kind === "na") return computed;

    const fromSheet = parseSolveCell(r.ao5);
    if (fromSheet.kind === "time" || fromSheet.kind === "dnf") return fromSheet;

    return { kind: "na", sec: null };
  }

  function fmtTime(sec){
    if(sec == null || !Number.isFinite(sec)) return "-";
    if(sec < 60) return sec.toFixed(2);
    const m = Math.floor(sec/60);
    const r = sec - m*60;
    return `${m}:${r.toFixed(2).padStart(5,"0")}`;
  }

  function fmtAo5(metric){
    if(metric.kind === "dnf") return { txt:"DNF", cls:"valDNF" };
    if(metric.kind === "na") return { txt:"-", cls:"valMuted" };
    if(metric.kind === "time") return { txt:fmtTime(metric.sec), cls:"" };
    return { txt:"-", cls:"valMuted" };
  }

  function fmtSingle(sec, hadDNF){
    if(sec != null) return { txt:fmtTime(sec), cls:"" };
    if(hadDNF) return { txt:"DNF", cls:"valDNF" };
    return { txt:"-", cls:"valMuted" };
  }

  function computeRanksForCompRoundEventPersons(allRows, compId, round, event) {
    const scope = allRows.filter((r) =>
      safe(r.comp_id) === compId &&
      low(safe(r.round)) === low(round) &&
      low(normalizeEvent(r.event)) === low(event) &&
      !isH2HRow(r)
    );

    const bestByPlayer = new Map();

    for (const r of scope) {
      const pid = safe(r.player_id);
      if (!pid) continue;

      const ao5 = getAo5Metric(r);
      const single = getBestSingleFromRow(r);

      const metric =
        ao5.kind === "time" ? { kind: "ao5", sec: ao5.sec } :
        ao5.kind === "dnf" ? { kind: "dnf", sec: null } :
        single != null ? { kind: "single", sec: single } :
        { kind: "dnf", sec: null };

      const prev = bestByPlayer.get(pid);
      if (!prev) bestByPlayer.set(pid, metric);
      else {
        const order = (m) => (m.kind === "ao5" ? 1 : m.kind === "single" ? 2 : 3);
        if (order(metric) < order(prev)) bestByPlayer.set(pid, metric);
        else if (order(metric) === order(prev)) {
          if (metric.sec != null && prev.sec != null && metric.sec < prev.sec) bestByPlayer.set(pid, metric);
        }
      }
    }

    const ord = (m) => (m.kind === "ao5" ? 1 : m.kind === "single" ? 2 : 3);

    const overallList = Array.from(bestByPlayer.entries()).sort((a, b) => {
      const A = a[1], B = b[1];
      if (ord(A) !== ord(B)) return ord(A) - ord(B);
      if (A.sec == null && B.sec == null) return 0;
      if (A.sec == null) return 1;
      if (B.sec == null) return -1;
      return A.sec - B.sec;
    });

    const overallRank = new Map();
    let k = 0;
    for (const [pid] of overallList) overallRank.set(pid, ++k);

    const ageByPlayer = new Map();
    for (const r of scope) {
      const pid = safe(r.player_id);
      const age = safe(r.age_cat);
      if (pid && age) ageByPlayer.set(pid, age);
    }

    const ageRank = new Map();
    const groups = new Map();
    for (const [pid, metric] of bestByPlayer.entries()) {
      const age = ageByPlayer.get(pid);
      if (!age) continue;
      if (!groups.has(age)) groups.set(age, []);
      groups.get(age).push([pid, metric]);
    }

    for (const [age, arr] of groups.entries()) {
      arr.sort((a, b) => {
        const A = a[1], B = b[1];
        const ord2 = (m) => (m.kind === "ao5" ? 1 : m.kind === "single" ? 2 : 3);
        if (ord2(A) !== ord2(B)) return ord2(A) - ord2(B);
        if (A.sec == null && B.sec == null) return 0;
        if (A.sec == null) return 1;
        if (B.sec == null) return -1;
        return A.sec - B.sec;
      });
      let rr = 0;
      for (const [pid] of arr) ageRank.set(pid, ++rr);
    }

    return { overallRank, ageRank };
  }

  function medalTallyForCompPersons(allRows, mineRows, compId){
    const overall = { g:0,s:0,b:0,total:0 };
    const age = { g:0,s:0,b:0,total:0 };

    const seen = new Set();
    for(const r of mineRows){
      const ev = normalizeEvent(r.event);
      const rd = safe(r.round||"");
      const key = `${compId}||${low(rd)}||${low(ev)}`;
      if(!ev || !rd || seen.has(key)) continue;
      seen.add(key);

      const ranksObj = computeRanksForCompRoundEventPersons(allRows, compId, rd, ev);
      const pid = safe(r.player_id);

      const rk = ranksObj.overallRank.get(pid);
      if(rk === 1) overall.g++;
      else if(rk === 2) overall.s++;
      else if(rk === 3) overall.b++;

      const ark = ranksObj.ageRank.get(pid);
      if(ark === 1) age.g++;
      else if(ark === 2) age.s++;
      else if(ark === 3) age.b++;
    }

    overall.total = overall.g + overall.s + overall.b;
    age.total = age.g + age.s + age.b;
    return { overall, age };
  }

  // ---------- Rankings table ----------
  function buildEventLeaderboards(allRows){
    const byEvent = {};
    for(const r of allRows){
      const ev = normalizeEvent(r.event);
      if(!ev) continue;
      (byEvent[ev] ||= []).push(r);
    }

    const out = {};
    for(const ev of Object.keys(byEvent)){
      const rows = byEvent[ev];

      const bestS = {};
      const bestA = {};
      const anyDNFsingle = {};
      const anyDNFao5 = {};

      for(const rr of rows){
        const pid = safe(rr.player_id);
        if(!pid) continue;

        const single = getBestSingleFromRow(rr);
        if(single != null){
          bestS[pid] = Math.min(bestS[pid] ?? Infinity, single);
        } else {
          if(extractCells(rr).some(x=>x.kind==="dnf")) anyDNFsingle[pid]=true;
        }

        const ao5 = getAo5Metric(rr);
        if(ao5.kind === "dnf") anyDNFao5[pid] = true;
        if(ao5.kind === "time"){
          bestA[pid] = Math.min(bestA[pid] ?? Infinity, ao5.sec);
        }
      }

      const singleList = Object.keys(bestS).map(pid=>({pid, sec:bestS[pid]})).sort((a,b)=>a.sec-b.sec);
      const ao5List = Object.keys(bestA).map(pid=>({pid, sec:bestA[pid]})).sort((a,b)=>a.sec-b.sec);

      const rankSingle = {};
      singleList.forEach((x,i)=>rankSingle[x.pid]=i+1);
      const rankAo5 = {};
      ao5List.forEach((x,i)=>rankAo5[x.pid]=i+1);

      out[ev] = { bestSingle: bestS, bestAo5: bestA, rankSingle, rankAo5, anyDNFsingle, anyDNFao5 };
    }

    return out;
  }

  function renderMyRankings(pid, mine, lbs){
    const wrap = $("rkTableWrap");
    if(!wrap) return;

    const evs = Array.from(new Set(mine.map(r=>normalizeEvent(r.event)).filter(Boolean)))
      .sort((a,b)=>{
        const ia = eventSortIndex(a), ib = eventSortIndex(b);
        if(ia !== ib) return ia-ib;
        return a.localeCompare(b);
      });

    if(!evs.length){
      wrap.innerHTML = `<div class="mutedCell" style="font-weight:900;">No rankings available yet.</div>`;
      return;
    }

    let html = `<div class="tableWrap"><table class="table">
      <thead>
        <tr>
          <th>Event</th>
          <th>Rank (Single)</th>
          <th>PR Single</th>
          <th>PR Ao5</th>
          <th>Rank (Ao5)</th>
        </tr>
      </thead><tbody>`;

    for(const ev of evs){
      const lb = lbs[ev];
      const rs = lb?.rankSingle?.[pid] ?? null;
      const ra = lb?.rankAo5?.[pid] ?? null;

      const bs = lb?.bestSingle?.[pid];
      const ba = lb?.bestAo5?.[pid];

      const prSingle = (bs !== undefined) ? fmtTime(bs) : (lb?.anyDNFsingle?.[pid] ? "DNF" : "-");
      const prAo5 = (ba !== undefined) ? fmtTime(ba) : (lb?.anyDNFao5?.[pid] ? "DNF" : "-");

      html += `<tr>
        <td style="font-weight:950;">${ev}</td>
        <td style="font-weight:950;">${rs ? rs : "-"}</td>
        <td style="font-weight:950;">${prSingle}</td>
        <td style="font-weight:950;">${prAo5}</td>
        <td style="font-weight:950;">${ra ? ra : "-"}</td>
      </tr>`;
    }

    html += `</tbody></table></div>`;
    wrap.innerHTML = html;
  }

  // ---------- Past comps (persons-style result rows) ----------
  function renderPast(allRows, mineByComp, cMap){
    const wrap = $("pastWrap");
    if(!wrap) return;

    const compIds = Object.keys(mineByComp);
    if(!compIds.length){
      wrap.innerHTML = `<div class="mutedCell" style="font-weight:900;">No past competitions found.</div>`;
      return;
    }

    // latest first
    compIds.sort((a,b)=>compDateSortKey(cMap[b]||{}) - compDateSortKey(cMap[a]||{}));

    let html = "";

    for(const cid of compIds){
      const comp = cMap[cid] || {};
      const name = safe(comp.comp_name || comp.name || cid.toUpperCase());
      const dateText = prettyDate(comp.comp_date || comp.comp_end || comp.comp_start || "");
      const meta = `${cid.toUpperCase()} • ${dateText}`;
      const rows = mineByComp[cid];

      // group by event
      const byEv = {};
      for(const r of rows){
        const ev = normalizeEvent(r.event);
        if(!ev) continue;
        (byEv[ev] ||= []).push(r);
      }

      const evs = Object.keys(byEv).sort((a,b)=>{
        const ia = eventSortIndex(a), ib = eventSortIndex(b);
        if(ia !== ib) return ia-ib;
        return a.localeCompare(b);
      });

      // build results table per event: best single + ao5 from best row metric
      let resultRowsHtml = "";
      for(const ev of evs){
        const evRows = byEv[ev];

        // best single: min of best single across rows
        let bestSingle = null;
        let hadDNFsingle = false;

        // best ao5: min of time ao5; if any dnf ao5 and no time => DNF; if NA => "-"
        let bestAo5Time = null;
        let hadDNFao5 = false;
        let anyAo5NA = false;

        for(const r of evRows){
          const single = getBestSingleFromRow(r);
          if(single != null) bestSingle = (bestSingle==null) ? single : Math.min(bestSingle, single);
          else if(extractCells(r).some(x=>x.kind==="dnf")) hadDNFsingle = true;

          const ao5 = getAo5Metric(r);
          if(ao5.kind === "time") bestAo5Time = (bestAo5Time==null) ? ao5.sec : Math.min(bestAo5Time, ao5.sec);
          if(ao5.kind === "dnf") hadDNFao5 = true;
          if(ao5.kind === "na") anyAo5NA = true;
        }

        const singleFmt = fmtSingle(bestSingle, hadDNFsingle);

        let aoFmt;
        if(bestAo5Time != null) aoFmt = { txt: fmtTime(bestAo5Time), cls:"" };
        else if(hadDNFao5) aoFmt = { txt:"DNF", cls:"valDNF" };
        else aoFmt = { txt:"-", cls:"valMuted" };

        resultRowsHtml += `
          <div class="compResultsRow">
            <div><span class="evChip">${ev}</span></div>
            <div class="${singleFmt.cls}">${singleFmt.txt}</div>
            <div class="${aoFmt.cls}">${aoFmt.txt}</div>
          </div>
        `;
      }

      html += `
        <div class="compCard">
          <div class="compTop">
            <div class="compLeft">
              <div class="compTitle">${name}</div>
              <div class="compMeta">${meta}</div>
            </div>
            <div class="compAction">
              <a class="btn primary" href="${resultsHref(cid)}">View Results</a>
            </div>
          </div>

          <div class="compResults">
            <div class="compResultsHead">
              <div>Event</div>
              <div>Single</div>
              <div>Ao5</div>
            </div>
            ${resultRowsHtml || `<div class="compResultsRow"><div class="valMuted">-</div><div class="valMuted">-</div><div class="valMuted">-</div></div>`}
          </div>
        </div>
      `;
    }

    wrap.innerHTML = html;
  }

  // ---------- Upcoming (unchanged) ----------
  function renderUpcoming(upcomingMine, cMap){
    const wrap = $("upcomingWrap");
    if(!wrap) return;

    if(!upcomingMine || !upcomingMine.length){
      wrap.innerHTML = `<div class="mutedCell" style="font-weight:900;">No upcoming competitions assigned yet.</div>`;
      return;
    }

    const byComp = {};
    for(const r of upcomingMine){
      const cid = low(r.comp_id);
      if(!cid) continue;
      (byComp[cid] ||= []).push(r);
    }

    const compIds = Object.keys(byComp).sort((a,b)=>compDateSortKey(cMap[a]||{}) - compDateSortKey(cMap[b]||{}));

    let html = "";
    for(const cid of compIds){
      const comp = cMap[cid] || {};
      const name = safe(comp.comp_name || comp.name || cid.toUpperCase());
      const dateText = prettyDate(comp.comp_start || comp.comp_date || comp.comp_end || "");
      const meta = `${cid.toUpperCase()} • ${dateText}`;

      const events = Array.from(new Set(byComp[cid].map(r=>normalizeEvent(r.event)).filter(Boolean)))
        .sort((x,y)=>{
          const ix = eventSortIndex(x), iy = eventSortIndex(y);
          if(ix!==iy) return ix-iy;
          return x.localeCompare(y);
        });

      html += `
        <div class="compCard">
          <div class="compTop">
            <div class="compLeft">
              <div class="compTitle">${name}</div>
              <div class="compMeta">${meta}</div>
            </div>
            <div class="compAction">
              <a class="btn" href="/competitions/view/?id=${encodeURIComponent(cid)}">Open</a>
            </div>
          </div>

          ${events.length ? `
            <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;">
              ${events.map(e=>`<span class="evChip">${e}</span>`).join("")}
            </div>
          ` : ""}
        </div>
      `;
    }

    wrap.innerHTML = html;
  }

  function renderOverviewCards(nextComp, lastComp){
    const nextWrap = $("nextCompCard");
    const lastWrap = $("lastCompCard");

    if(nextWrap){
      nextWrap.innerHTML = !nextComp
        ? `<div class="dashMiniT">Next Competition</div><div class="dashMiniV">—</div>`
        : `
          <div class="dashMiniT">Next Competition</div>
          <div class="dashMiniV">${safe(nextComp.name)}</div>
          <div class="mutedCell" style="margin-top:6px;">${nextComp.meta}</div>
          <div style="margin-top:10px;">
            <a class="btn primary" href="/competitions/view/?id=${encodeURIComponent(nextComp.id)}">Open</a>
          </div>
        `;
    }

    if(lastWrap){
      lastWrap.innerHTML = !lastComp
        ? `<div class="dashMiniT">Last Competition</div><div class="dashMiniV">—</div>`
        : `
          <div class="dashMiniT">Last Competition</div>
          <div class="dashMiniV">${safe(lastComp.name)}</div>
          <div class="mutedCell" style="margin-top:6px;">${lastComp.meta}</div>
          <div style="margin-top:10px;">
            <a class="btn primary" href="${resultsHref(lastComp.id)}">View Results</a>
          </div>
        `;
    }
  }

  function renderMedalsTab(totalOverall, totalAge){
    const wrap = $("medalsWrap");
    if(!wrap) return;

    const totals = {
      g: totalOverall.g + totalAge.g,
      s: totalOverall.s + totalAge.s,
      b: totalOverall.b + totalAge.b,
    };
    totals.total = totals.g + totals.s + totals.b;

    wrap.innerHTML = `
      <div class="medalsGrid">
        <div class="medalCard">
          <div class="medalCardT">Total Medals</div>
          <div class="medalCardSub">Overall + Age Category</div>
          <div class="medalRow">
            <span class="medalPill">🥇 ${totals.g}</span>
            <span class="medalPill">🥈 ${totals.s}</span>
            <span class="medalPill">🥉 ${totals.b}</span>
            <span class="medalPill total">Total ${totals.total}</span>
          </div>
        </div>

        <div class="medalCard">
          <div class="medalCardT">Overall Medals</div>
          <div class="medalCardSub">Ranked across all participants</div>
          <div class="medalRow">
            <span class="medalPill">🥇 ${totalOverall.g}</span>
            <span class="medalPill">🥈 ${totalOverall.s}</span>
            <span class="medalPill">🥉 ${totalOverall.b}</span>
            <span class="medalPill total">Total ${totalOverall.total}</span>
          </div>
        </div>

        <div class="medalCard">
          <div class="medalCardT">Age Category Medals</div>
          <div class="medalCardSub">Ranked within your age category</div>
          <div class="medalRow">
            <span class="medalPill">🥇 ${totalAge.g}</span>
            <span class="medalPill">🥈 ${totalAge.s}</span>
            <span class="medalPill">🥉 ${totalAge.b}</span>
            <span class="medalPill total">Total ${totalAge.total}</span>
          </div>
        </div>
      </div>
    `;
  }

  function bindTabs(){
    const nav = $("dashNav");
    if(!nav) return;
    nav.querySelectorAll("[data-tab]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        nav.querySelectorAll(".dashNavBtn").forEach(b=>b.classList.remove("on"));
        btn.classList.add("on");
        const tab = btn.dataset.tab;
        document.querySelectorAll(".dashPanel").forEach(p=>p.classList.remove("on"));
        $("panel-" + tab)?.classList.add("on");
      });
    });
  }

  async function ensureProfileRow(supabase, user){
    const email = low(user?.email);
    if(!email) return null;

    let { data: row, error } = await supabase
      .from("profiles")
      .select("email,user_id,player_id,player_name,role")
      .eq("email", email)
      .maybeSingle();

    if(error) throw error;

    if(!row){
      const ins = await supabase
        .from("profiles")
        .insert([{ email, user_id: user.id, role: "user" }])
        .select("email,user_id,player_id,player_name,role")
        .maybeSingle();

      if(ins.error) throw ins.error;
      row = ins.data || null;
    }

    return row;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if(!needConfig()) return;
    bindTabs();

    const supabase = window.supabase.createClient(window.CB.SUPABASE_URL, window.CB.SUPABASE_KEY);

    $("btnSignOut")?.addEventListener("click", async () => {
      $("btnSignOut").disabled = true;
      $("btnSignOut").textContent = "Signing out…";
      await safeSignOut(supabase);
    });

    const { data: udata } = await supabase.auth.getUser();
    const user = udata?.user;
    if(!user){
      location.replace("/auth/login.html");
      return;
    }

    const prof = await ensureProfileRow(supabase, user);
    const pid = safe(prof?.player_id);
    if(!pid){
      location.replace("/auth/account.html");
      return;
    }

    const pname = safe(prof?.player_name) || "Participant";
    $("meName").textContent = pname;
    $("meMeta").textContent = `Player ID: ${pid}`;

    $("meEmail").textContent = safe(user.email) || "—";
    $("mePid").textContent = pid || "—";
const profileBtn = $("btnProfile");
if(profileBtn){
  profileBtn.href = `https://competitions.thecubeology.com/persons/?id=${encodeURIComponent(pid)}`;
}

    setMsg("Loading your dashboard…", "info");

    const [rankRows, compRows] = await Promise.all([
      getCSV(window.CB.CSV_RANKINGS),
      getCSV(window.CB.CSV_COMPETITIONS),
    ]);

    const allRows = (rankRows || []).map(r => ({
      ...r,
      player_id: safe(r.player_id),
      comp_id: safe(r.comp_id),
      round: safe(r.round),
      event: normalizeEvent(r.event),
      age_cat: safe(r.age_cat || r.age_category || r.agecategory || ""),
      best_single: safe(r.best_single),
      ao5: safe(r.ao5),
      h2h_mode: safe(r.h2h_mode),
      s1: safe(r.s1), s2: safe(r.s2), s3: safe(r.s3), s4: safe(r.s4), s5: safe(r.s5),
    })).filter(r => r.comp_id && r.event);

    const mine = allRows.filter(r => safe(r.player_id) === pid);

    const eventsSet = new Set(mine.map(r => r.event).filter(Boolean));
    const compsSet = new Set(mine.map(r => low(r.comp_id)).filter(Boolean));

    let solves = 0;
    for(const r of mine){
      solves += extractCells(r).filter(x=>x.kind==="time").length;
    }

    const cMap = compById(compRows || []);

    const mineByComp = {};
    for(const r of mine){
      const cid = low(r.comp_id);
      if(!cid) continue;
      (mineByComp[cid] ||= []).push(r);
    }

    // medal totals (overall & age)
    const totalOverall = { g:0,s:0,b:0,total:0 };
    const totalAge = { g:0,s:0,b:0,total:0 };

    for(const cid of Object.keys(mineByComp)){
      const compIdLabel = safe((cMap[cid]||{}).comp_id) || safe(mineByComp[cid][0]?.comp_id) || cid.toUpperCase();
      const m = medalTallyForCompPersons(allRows, mineByComp[cid], compIdLabel);
      totalOverall.g += m.overall.g; totalOverall.s += m.overall.s; totalOverall.b += m.overall.b;
      totalAge.g += m.age.g; totalAge.s += m.age.s; totalAge.b += m.age.b;
    }
    totalOverall.total = totalOverall.g + totalOverall.s + totalOverall.b;
    totalAge.total = totalAge.g + totalAge.s + totalAge.b;

    const totalMedals = totalOverall.total + totalAge.total;

    $("statEvents").textContent = String(eventsSet.size);
    $("statComps").textContent = String(compsSet.size);
    $("statSolves").textContent = String(solves);
    $("statMedals").textContent = String(totalMedals);

    renderMedalsTab(totalOverall, totalAge);

    // Upcoming
    let upcomingMine = [];
    if(window.CB?.CSV_UPCOMING){
      try{
        const upRows = await getCSV(window.CB.CSV_UPCOMING);
        upcomingMine = (upRows || []).filter(r => safe(r.player_id) === pid);
      }catch(e){ upcomingMine = []; }
    }

    // Overview next + last
    let nextComp = null;
    if(upcomingMine.length){
      const by = {};
      for(const r of upcomingMine){
        const cid = low(r.comp_id);
        if(!cid) continue;
        by[cid] = true;
      }
      const cids = Object.keys(by).sort((a,b)=>compDateSortKey(cMap[a]||{})-compDateSortKey(cMap[b]||{}));
      const cid = cids[0];
      const c = cMap[cid] || {};
      nextComp = {
        id: cid,
        name: safe(c.comp_name || c.name || cid.toUpperCase()),
        meta: `${cid.toUpperCase()} • ${prettyDate(c.comp_start || c.comp_date || c.comp_end || "")}`
      };
    }

    let lastComp = null;
    const pastCompIds = Object.keys(mineByComp).sort((a,b)=>compDateSortKey(cMap[b]||{})-compDateSortKey(cMap[a]||{}));
    if(pastCompIds[0]){
      const cid = pastCompIds[0];
      const c = cMap[cid] || {};
      lastComp = {
        id: cid,
        name: safe(c.comp_name || c.name || cid.toUpperCase()),
        meta: `${cid.toUpperCase()} • ${prettyDate(c.comp_date || c.comp_end || c.comp_start || "")}`
      };
    }

    renderOverviewCards(nextComp, lastComp);

    const lbs = buildEventLeaderboards(allRows);
    renderMyRankings(pid, mine, lbs);
    renderPast(allRows, mineByComp, cMap);
    renderUpcoming(upcomingMine, cMap);

    setMsg("", "info");
  });
})();
