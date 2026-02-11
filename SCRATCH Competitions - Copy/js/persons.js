/* =========================================================
   persons.js — FULL FINAL (H2H WIN/LOSE COLORS + CENTER SCORE + UX FIXES)

   ✅ Implemented now:
   - H2H card header:
       * Score centered between names
       * Winner name + score GREEN, loser name + score RED (like your screenshot)
       * Opponent name is at right end
   - H2H chips:
       * Remove "Match 1/Match 2/Match 2025..." chips completely
       * Keep Round + Group + Bracket (from h2h_bracket) only
   - No "No head-to-head..." empty text shown
   - When H2H mode ON:
       * events with no H2H are disabled (unclickable + muted)
   - Mobile solves after "Show solves" slightly bigger but still fits screen
   - Auto move Mode toggle bar below event pills (if DOM structure allows)

   Requires:
   - window.CB_API.getCSV(url)
   - window.CB.CSV_RANKINGS, window.CB.CSV_COMPETITIONS
========================================================= */
(function () {
  "use strict";

  const SOLVE_FIELDS = ["s1", "s2", "s3", "s4", "s5"];
  const $ = (id) => document.getElementById(id);

  /* ---------- Utils ---------- */
  function safe(v) { return (v ?? "").toString().trim(); }
  function low(v) { return safe(v).toLowerCase(); }
  function escapeHtml(s) {
    return safe(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function showError(msg) {
    const el = $("psError");
    if (!el) return;
    el.style.display = "block";
    el.textContent = safe(msg) || "Unknown error";
  }

  /* ---------- Event ordering ---------- */
  function normalizeEvent(e) { return safe(e).replace(/\s+/g, " ").trim(); }
  function eventKey(ev) {
    const e = normalizeEvent(ev);
    const l = e.toLowerCase();
    if (l === "3x3") return { g: 1, n: 0, t: e };
    if (l === "2x2") return { g: 2, n: 0, t: e };
    const big = l.match(/^([5-9])x\1$/);
    if (big) return { g: 3, n: Number(big[1]), t: e }; // after 2x2
    if (l === "4x4") return { g: 4, n: 0, t: e };
    if (l === "pyraminx") return { g: 5, n: 0, t: e };
    if (l === "skewb") return { g: 7, n: 0, t: e };
    if (l === "clock") return { g: 8, n: 0, t: e };
    if (l.includes("mirror")) return { g: 9, n: 0, t: e }; // last
    return { g: 6, n: 0, t: e }; // others after Pyraminx
  }
  function sortEvents(list) {
    return list.slice().sort((a, b) => {
      const A = eventKey(a), B = eventKey(b);
      if (A.g !== B.g) return A.g - B.g;
      if (A.g === 3 && A.n !== B.n) return A.n - B.n;
      return A.t.localeCompare(B.t);
    });
  }

  /* ---------- Competition themes ---------- */
  function pickTheme(compName) {
    const n = low(compName);
    if (n.includes("cubing frost") || n.includes("frosted fingers"))
      return { a: "rgba(56,189,248,.22)", b: "rgba(167,139,250,.14)" };
    if (n.includes("cubing heatwaves"))
      return { a: "rgba(251,146,60,.26)", b: "rgba(251,191,36,.14)" };
    if (n.includes("cubing colour splash") || n.includes("cubing color splash"))
      return { a: "rgba(236,72,153,.20)", b: "rgba(34,197,94,.14)" };
    if (n.includes("twist n fall") || n.includes("twist & fall"))
      return { a: "rgba(245,158,11,.22)", b: "rgba(234,88,12,.12)" };
    if (n.includes("cubing clash"))
      return { a: "rgba(0,0,0,.10)", b: "rgba(250,204,21,.22)" };
    if (n.includes("new year cube bash"))
      return { a: "rgba(168,85,247,.22)", b: "rgba(236,72,153,.12)" };
    if (n.includes("republic cube open"))
      return { a: "rgba(249,115,22,.22)", b: "rgba(34,197,94,.16)" };
    return { a: "rgba(219,39,119,.16)", b: "rgba(124,58,237,.10)" };
  }
  function applyThemeVars(el, compName) {
    if (!el) return;
    const t = pickTheme(compName);
    el.style.setProperty("--psA", t.a);
    el.style.setProperty("--psB", t.b);
  }

  /* ---------- Time parsing ---------- */
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

  function fmtTime(sec) {
    if (sec == null || !Number.isFinite(sec)) return "DNF";
    if (sec < 60) return sec.toFixed(2);
    const m = Math.floor(sec / 60);
    const s = (sec - m * 60).toFixed(2).padStart(5, "0");
    return `${m}:${s}`;
  }

  function extractCells(r) {
    return SOLVE_FIELDS.map((f) => parseSolveCell(r[f]));
  }

  /* ---------- H2H detection ---------- */
  function isH2HRow(r) {
    const hm = low(r.h2h_mode);
    return hm === "1" || hm === "true" || hm === "yes" || hm === "h2h";
  }

  /* ---------- Date parsing ---------- */
  function parseCompDateToTs(dateStr) {
    const s = safe(dateStr);
    if (!s) return null;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
      const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
      const d = new Date(yy, mm - 1, dd);
      return isNaN(d.getTime()) ? null : d.getTime();
    }
    const d2 = new Date(s);
    return isNaN(d2.getTime()) ? null : d2.getTime();
  }

  /* ---------- Ao5 computation ---------- */
  function computeAo5FromCells(cells) {
    if (cells.some((x) => x.kind === "empty")) return { kind: "na", sec: null };

    const dnfs = cells.filter((x) => x.kind === "dnf").length;
    if (dnfs >= 2) return { kind: "dnf", sec: null };

    const secs = cells.map((x) => (x.kind === "time" ? x.sec : Number.POSITIVE_INFINITY));
    const sorted = secs.slice().sort((a, b) => a - b);
    const mid3 = sorted.slice(1, 4);
    if (mid3.some((v) => !Number.isFinite(v))) return { kind: "dnf", sec: null };

    return { kind: "time", sec: (mid3[0] + mid3[1] + mid3[2]) / 3 };
  }

  function getAo5Metric(r) {
    const computed = computeAo5FromCells(extractCells(r));
    if (computed.kind === "time" || computed.kind === "dnf") return computed;

    const fromSheet = parseSolveCell(r.ao5);
    if (fromSheet.kind === "time" || fromSheet.kind === "dnf") return fromSheet;

    return { kind: "na", sec: null };
  }

  function getBestSingleFromRow(r) {
    const bs = parseSolveCell(r.best_single);
    if (bs.kind === "time") return bs.sec;
    const times = extractCells(r).filter((x) => x.kind === "time").map((x) => x.sec);
    return times.length ? Math.min(...times) : null;
  }

  /* ---------- PR ranks (overall) ---------- */
  function computeOverallSingleRanksForEvent(allRows, event) {
    const bestByPlayer = new Map();
    for (const r of allRows) {
      if (low(normalizeEvent(r.event)) !== low(event)) continue;
      const pid = safe(r.player_id);
      if (!pid) continue;
      const best = getBestSingleFromRow(r);
      if (best == null) continue;
      const prev = bestByPlayer.get(pid);
      if (prev == null || best < prev) bestByPlayer.set(pid, best);
    }
    const list = Array.from(bestByPlayer.entries()).sort((a, b) => a[1] - b[1]);
    const rank = new Map();
    let i = 0;
    for (const [pid] of list) rank.set(pid, ++i);
    return rank;
  }

  function computeOverallAo5RanksForEvent(allRows, event) {
    const bestByPlayer = new Map();
    for (const r of allRows) {
      if (low(normalizeEvent(r.event)) !== low(event)) continue;
      if (isH2HRow(r)) continue;
      const pid = safe(r.player_id);
      if (!pid) continue;
      const ao5 = getAo5Metric(r);
      if (ao5.kind !== "time") continue;
      const prev = bestByPlayer.get(pid);
      if (prev == null || ao5.sec < prev) bestByPlayer.set(pid, ao5.sec);
    }
    const list = Array.from(bestByPlayer.entries()).sort((a, b) => a[1] - b[1]);
    const rank = new Map();
    let i = 0;
    for (const [pid] of list) rank.set(pid, ++i);
    return rank;
  }

  function ensurePrHeaderLabels() {
    const head = document.querySelector(".psPrHead");
    if (!head) return;
    const cells = head.querySelectorAll("div");
    if (cells[0]) cells[0].textContent = "Event";
    if (cells[1]) cells[1].textContent = "Rank (Single)";
    if (cells[2]) cells[2].textContent = "Single";
    if (cells[3]) cells[3].textContent = "Average Rank (Average)";
    if (cells[4]) cells[4].textContent = "Average";
  }

  function renderPR(playerId, allRows) {
    const prRows = $("psPrRows");
    const prMobile = $("psPrMobile");
    if (!prRows || !prMobile) return;

    ensurePrHeaderLabels();

    const myEvents = new Set(
      allRows.filter((r) => safe(r.player_id) === playerId)
        .map((r) => normalizeEvent(r.event))
        .filter(Boolean)
    );
    const events = sortEvents(Array.from(myEvents));

    const rows = [];
    for (const ev of events) {
      let myBestSingle = null;
      let myBestAo5 = null;

      for (const r of allRows) {
        if (safe(r.player_id) !== playerId) continue;
        if (low(normalizeEvent(r.event)) !== low(ev)) continue;

        const bs = getBestSingleFromRow(r);
        if (bs != null) myBestSingle = (myBestSingle == null || bs < myBestSingle) ? bs : myBestSingle;

        if (!isH2HRow(r)) {
          const ao5 = getAo5Metric(r);
          if (ao5.kind === "time") myBestAo5 = (myBestAo5 == null || ao5.sec < myBestAo5) ? ao5.sec : myBestAo5;
        }
      }

      const singleRankMap = computeOverallSingleRanksForEvent(allRows, ev);
      const ao5RankMap = computeOverallAo5RanksForEvent(allRows, ev);

      rows.push({
        ev,
        singleRank: singleRankMap.get(playerId) || null,
        ao5Rank: ao5RankMap.get(playerId) || null,
        bestSingle: myBestSingle,
        bestAo5: myBestAo5
      });
    }

    prRows.innerHTML = rows.map((x) => `
      <div class="psPrRow">
        <div class="psPrEvent center">${escapeHtml(x.ev)}</div>
        <div class="center">${x.singleRank ? `#${x.singleRank}` : "—"}</div>
        <div class="center">${x.bestSingle != null ? escapeHtml(fmtTime(x.bestSingle)) : "—"}</div>
        <div class="center">${x.ao5Rank ? `#${x.ao5Rank}` : "—"}</div>
        <div class="center">${x.bestAo5 != null ? escapeHtml(fmtTime(x.bestAo5)) : "—"}</div>
      </div>
    `).join("");

    // mobile slider (unchanged)
    prMobile.innerHTML = `
      <div class="psPrSlider" id="psPrSlider">
        ${rows.map((x) => `
          <div class="psPrSlide">
            <div class="psPrSlideTop">${escapeHtml(x.ev)}</div>
            <div class="psPrSlideGrid">
              <div><div class="psMiniLabel">Rank (Single)</div><div class="psMiniVal">${x.singleRank ? `#${x.singleRank}` : "—"}</div></div>
              <div><div class="psMiniLabel">Single</div><div class="psMiniVal">${x.bestSingle != null ? escapeHtml(fmtTime(x.bestSingle)) : "—"}</div></div>
              <div><div class="psMiniLabel">Average Rank (Average)</div><div class="psMiniVal">${x.ao5Rank ? `#${x.ao5Rank}` : "—"}</div></div>
              <div><div class="psMiniLabel">Average</div><div class="psMiniVal">${x.bestAo5 != null ? escapeHtml(fmtTime(x.bestAo5)) : "—"}</div></div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  /* ---------- Rankings for comp card ---------- */
  function medalClass(n) {
    if (n === 1) return "medal gold";
    if (n === 2) return "medal silver";
    if (n === 3) return "medal bronze";
    return "medal";
  }

  function computeRanksForCompRoundEvent(allRows, compId, round, event) {
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
        if (ord(A) !== ord(B)) return ord(A) - ord(B);
        if (A.sec == null && B.sec == null) return 0;
        if (A.sec == null) return 1;
        if (B.sec == null) return -1;
        return A.sec - B.sec;
      });
      let rr = 0;
      for (const [pid] of arr) ageRank.set(pid, ++rr);
    }

    return { overallRank, ageRank, ageByPlayer };
  }

  function buildSolveRowHTML(r) {
    const cells = extractCells(r);
    const full5 = cells.every((x) => x.kind !== "empty");

    if (!full5) {
      const bs = getBestSingleFromRow(r);
      const txt = bs != null ? fmtTime(bs) : "—";
      return `<div class="psSolveRow"><span class="psSolvePill neutral">${escapeHtml(txt)}</span></div>`;
    }

    const hasDNF = cells.some((x) => x.kind === "dnf");
    const times = cells.filter((x) => x.kind === "time").map((x) => x.sec);
    const best = times.length ? Math.min(...times) : null;
    const worstTime = times.length ? Math.max(...times) : null;

    const pills = cells.map((x) => {
      if (x.kind === "dnf") return `<span class="psSolvePill worst">DNF</span>`;
      if (x.kind === "time") {
        let cls = "";
        if (best != null && x.sec === best) cls = "best";
        else if (!hasDNF && worstTime != null && x.sec === worstTime) cls = "worst";
        return `<span class="psSolvePill ${cls}">${escapeHtml(fmtTime(x.sec))}</span>`;
      }
      return `<span class="psSolvePill neutral">—</span>`;
    }).join("");

    return `<div class="psSolveRow">${pills}</div>`;
  }

  /* ---------- Helpers for UI ---------- */
  function findModeBarElement() {
    // Prefer wrapper if exists
    const byId = $("psModeBar");
    if (byId) return byId;
    const byClass = document.querySelector(".psModeBar");
    if (byClass) return byClass;
    // Fallback: parent of first mode button
    const btn = document.querySelector(".psModeBtn");
    return btn ? btn.parentElement : null;
  }

  function disableEventPillsForH2H(pillsWrap, h2hEventsSet, selectedEvent) {
    const buttons = pillsWrap.querySelectorAll(".psPill");
    buttons.forEach((b) => {
      const ev = safe(b.dataset.ev);
      const has = h2hEventsSet.has(low(ev));
      const isSelected = low(ev) === low(selectedEvent);
      // disable only when no H2H
      if (!has) {
        b.classList.add("disabledH2H");
        b.setAttribute("aria-disabled", "true");
        b.disabled = true;
      } else {
        b.classList.remove("disabledH2H");
        b.removeAttribute("aria-disabled");
        b.disabled = false;
      }
      // keep selected visually
      if (isSelected) b.classList.add("on");
    });
  }

  /* =========================================================
     MAIN UI
  ========================================================= */
  function setupUI(playerId, allRows, compRows, nameById) {
    const pillsWrap = $("psEventPills");
    const listRounds = $("psCompList");
    const emptyRounds = $("psCompEmpty");
    const listH2H = $("psH2HList");
    const emptyH2H = $("psH2HEmpty"); // will be kept hidden in H2H mode
    if (!pillsWrap || !listRounds || !emptyRounds || !listH2H || !emptyH2H) return;

    const compNameById = new Map();
    const compDateById = new Map();
    for (const c of compRows || []) {
      const id = safe(c.comp_id);
      if (!id) continue;
      compNameById.set(id, safe(c.comp_name) || id);
      compDateById.set(id, parseCompDateToTs(c.comp_date));
    }

    const evSet = new Set(
      allRows.filter((r) => safe(r.player_id) === playerId)
        .map((r) => normalizeEvent(r.event))
        .filter(Boolean)
    );
    const events = sortEvents(Array.from(evSet));
    let selectedEvent = events[0] || "";

    // Precompute which events actually have H2H for this player
    const h2hEventsSet = new Set(
      allRows
        .filter((r) => isH2HRow(r) && safe(r.player_id) === playerId)
        .map((r) => low(normalizeEvent(r.event)))
        .filter(Boolean)
    );

    let currentMode = "ao5";

    function renderEventPills() {
      pillsWrap.innerHTML = events.map((ev) => `
        <button class="psPill ${low(ev) === low(selectedEvent) ? "on" : ""}" type="button" data-ev="${escapeHtml(ev)}">
          ${escapeHtml(ev)}
        </button>
      `).join("");

      // Attach click events
      pillsWrap.querySelectorAll(".psPill").forEach((b) => {
        b.addEventListener("click", () => {
          if (b.disabled) return;
          selectedEvent = b.dataset.ev || "";
          renderEventPills();
          if (currentMode === "ao5") renderRounds();
          else renderH2H();
        });
      });

      // If in H2H mode, disable pills without H2H
      if (currentMode === "h2h") {
        disableEventPillsForH2H(pillsWrap, h2hEventsSet, selectedEvent);
      }
    }

    const modeBtns = document.querySelectorAll(".psModeBtn");
    function setMode(next) {
      currentMode = next;
      modeBtns.forEach((b) => b.classList.toggle("on", b.dataset.mode === next));

      listRounds.style.display = next === "ao5" ? "" : "none";
      listH2H.style.display = next === "h2h" ? "" : "none";

      // hide empty H2H text always
      emptyH2H.style.display = "none";

      // if switching to H2H and selected event has no H2H -> auto pick first H2H event if exists
      if (next === "h2h") {
        if (!h2hEventsSet.has(low(selectedEvent))) {
          const firstH2H = events.find((e) => h2hEventsSet.has(low(e)));
          if (firstH2H) selectedEvent = firstH2H;
        }
        renderEventPills();
        renderH2H();
      } else {
        renderEventPills();
        renderRounds();
      }
    }
    modeBtns.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode || "ao5")));

    // ✅ Move mode toggles below event pills (JS-driven layout adjustment)
    (function moveModeBelowEvents() {
      const bar = findModeBarElement();
      if (!bar) return;
      if (bar.dataset.moved === "1") return;
      const parent = pillsWrap.parentElement;
      if (!parent) return;
      // insert after pillsWrap
      parent.insertBefore(bar, pillsWrap.nextSibling);
      bar.dataset.moved = "1";
    })();

    /* ---------- NORMAL ROUNDS ---------- */
    function renderRounds() {
      listRounds.innerHTML = "";
      emptyRounds.style.display = "none";

      const mine = allRows.filter((r) =>
        safe(r.player_id) === playerId &&
        low(normalizeEvent(r.event)) === low(selectedEvent) &&
        !isH2HRow(r)
      );

      const groups = new Map();
      for (const r of mine) {
        const hasAny = SOLVE_FIELDS.some((f) => safe(r[f])) || safe(r.best_single) || safe(r.ao5);
        if (!hasAny) continue;

        const cid = safe(r.comp_id) || "unknown";
        const round = safe(r.round) || "Round";
        const key = `${cid}||${round}`;
        if (!groups.has(key)) groups.set(key, { cid, round, rows: [] });
        groups.get(key).rows.push(r);
      }

      const list = Array.from(groups.values()).sort((a, b) => {
        const ta = compDateById.get(a.cid);
        const tb = compDateById.get(b.cid);
        if (ta != null && tb != null && ta !== tb) return tb - ta;
        const ra = Math.max(...a.rows.map((x) => x._rowIndex || 0));
        const rb = Math.max(...b.rows.map((x) => x._rowIndex || 0));
        return rb - ra;
      });

      if (!list.length) {
        emptyRounds.style.display = "block";
        emptyRounds.textContent = "No rounds found for this event.";
        return;
      }

      for (const g of list) {
        const compName = compNameById.get(g.cid) || safe(g.rows[0]?.comp_name) || g.cid;

        const { overallRank, ageRank, ageByPlayer } = computeRanksForCompRoundEvent(allRows, g.cid, g.round, selectedEvent);
        const myOverall = overallRank.get(playerId) || null;
        const myAge = ageRank.get(playerId) || null;
        const myAgeCat = ageByPlayer.get(playerId) || "";

        let bestSingle = null;
        let bestAo5 = null;

        for (const r of g.rows) {
          const bs = getBestSingleFromRow(r);
          if (bs != null) bestSingle = bestSingle == null || bs < bestSingle ? bs : bestSingle;

          const ao5 = getAo5Metric(r);
          if (ao5.kind === "time") bestAo5 = bestAo5 == null || ao5.sec < bestAo5 ? ao5.sec : bestAo5;
        }

        const card = document.createElement("div");
        card.className = "psCompCard";
        card.innerHTML = `
          <div class="psCompInner">
            <div class="psCompTop">
              <div class="psCompTitleWrap">
                <h3 class="psCompTitle">${escapeHtml(compName)}</h3>
                <div class="psCompSub">${escapeHtml(g.round)}</div>
              </div>

              <div class="psCompRanks">
                <span class="${myOverall ? medalClass(myOverall) : "medal"}">Overall ${myOverall ? `#${myOverall}` : "—"}</span>
                ${myAgeCat ? `<span class="${myAge ? medalClass(myAge) : "medal"}">Age ${myAge ? `#${myAge}` : "—"}</span>` : ""}
              </div>
            </div>

            <div class="psCompMid">
              <div class="psCompNums">
                <div><span class="psNumLabel">Ao5</span><span class="psNumVal">${escapeHtml(bestAo5 == null ? "—" : fmtTime(bestAo5))}</span></div>
                <div><span class="psNumLabel">Single</span><span class="psNumVal">${escapeHtml(bestSingle == null ? "—" : fmtTime(bestSingle))}</span></div>
              </div>

              <button class="psBtn" type="button">Show solves</button>
            </div>

            <div class="psSolves">
              ${g.rows.map(buildSolveRowHTML).join("")}
            </div>
          </div>
        `;

        applyThemeVars(card.querySelector(".psCompInner"), compName);

        const btn = card.querySelector(".psBtn");
        const solvesWrap = card.querySelector(".psSolves");
        btn.addEventListener("click", () => {
          const on = solvesWrap.classList.toggle("on");
          btn.textContent = on ? "Hide solves" : "Show solves";
          // add mobile class when open
          if (on) card.classList.add("solvesOpen");
          else card.classList.remove("solvesOpen");
        });

        listRounds.appendChild(card);
      }
    }

    /* ---------- H2H ---------- */
    function cleanBracketName(x) {
      return safe(x).replace(/bracket/ig, "").replace(/\s+/g, " ").trim();
    }
    function chip(txt) {
      if (!safe(txt)) return "";
      return `<span class="psChip">${escapeHtml(txt)}</span>`;
    }

    function renderH2H() {
      listH2H.innerHTML = "";

      const mine = allRows.filter((r) =>
        isH2HRow(r) &&
        safe(r.player_id) === playerId &&
        low(normalizeEvent(r.event)) === low(selectedEvent)
      );

      // ✅ DO NOT show empty text at all (you asked)
      if (!mine.length) return;

      // group by competition
      const comps = new Map();
      for (const r of mine) {
        const cid = safe(r.comp_id) || "unknown";
        if (!comps.has(cid)) comps.set(cid, []);
        comps.get(cid).push(r);
      }

      const compList = Array.from(comps.entries()).map(([cid, rows]) => {
        const compName = compNameById.get(cid) || safe(rows[0]?.comp_name) || cid;
        const ts = compDateById.get(cid) ?? 0;
        return { cid, compName, ts, rows };
      }).sort((a, b) => b.ts - a.ts);

      for (const comp of compList) {
        const compBlock = document.createElement("div");
        compBlock.className = "psH2HCompBlock";
        compBlock.innerHTML = `
          <div class="psH2HCompHead">
            <div class="psH2HCompTitle">${escapeHtml(comp.compName)}</div>
            <div class="psH2HCompSub">${escapeHtml(selectedEvent)}</div>
          </div>
          <div class="psH2HCompMatches"></div>
        `;
        applyThemeVars(compBlock.querySelector(".psH2HCompHead"), comp.compName);

        const matchesWrap = compBlock.querySelector(".psH2HCompMatches");

        // group by match id
        const matches = new Map();
        for (const r of comp.rows) {
          const mid = safe(r.h2h_match_id) || `${safe(r.h2h_round_name)}||${safe(r.h2h_bracket)}||${safe(r.h2h_group)}`;
          if (!matches.has(mid)) matches.set(mid, []);
          matches.get(mid).push(r);
        }

        const matchList = Array.from(matches.entries())
          .map(([id, rows]) => ({ id, rows }))
          .sort((a, b) => (b.rows[0]?._rowIndex || 0) - (a.rows[0]?._rowIndex || 0));

        for (const m of matchList) {
          const r0 = m.rows[0];

          const opId = safe(r0.h2h_opponent_id);
          const opName = nameById.get(opId) || (opId ? `Player ${opId}` : "Opponent");
          const myName = nameById.get(playerId) || safe(r0.name) || `Player ${playerId}`;

          const roundName = safe(r0.h2h_round_name) || "Match";
          const bracketName = cleanBracketName(r0.h2h_bracket);
          const groupName = safe(r0.h2h_group);

          // group by set
          const setMap = new Map();
          for (const r of m.rows) {
            const setNo = safe(r.h2h_set_no) || "1";
            if (!setMap.has(setNo)) setMap.set(setNo, []);
            setMap.get(setNo).push(r);
          }
          const sets = Array.from(setMap.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));

          let matchMySets = 0, matchOpSets = 0;
          let setsHTML = "";

          for (const [setNo, arr] of sets) {
            const meRow = arr.find((x) => safe(x.player_id) === playerId) || arr[0];

            const opRow = allRows.find((x) =>
              isH2HRow(x) &&
              safe(x.comp_id) === safe(meRow.comp_id) &&
              safe(x.h2h_match_id) === safe(meRow.h2h_match_id) &&
              safe(x.h2h_set_no) === safe(meRow.h2h_set_no) &&
              safe(x.player_id) === opId
            );

            const myCells = extractCells(meRow);
            const opCells = opRow ? extractCells(opRow) : myCells.map(() => ({ kind: "empty", sec: null }));

            let mySolveWins = 0, opSolveWins = 0;

            const myPills = myCells.map((x, i) => {
              const y = opCells[i];
              if (x.kind === "empty") return `<span class="psH2HPill neutral">—</span>`;
              let cls = "neutral";
              if (x.kind === "time" && y.kind === "time") {
                if (x.sec < y.sec) { cls = "win"; mySolveWins++; }
                else if (y.sec < x.sec) { cls = "lose"; opSolveWins++; }
              } else if (x.kind === "dnf" && y.kind === "time") { cls = "lose"; opSolveWins++; }
              else if (x.kind === "time" && y.kind === "dnf") { cls = "win"; mySolveWins++; }
              const txt = x.kind === "dnf" ? "DNF" : fmtTime(x.sec);
              return `<span class="psH2HPill ${cls}">${escapeHtml(txt)}</span>`;
            }).join("");

            const opPills = opCells.map((x, i) => {
              if (x.kind === "empty") return `<span class="psH2HPill neutral">—</span>`;
              let cls = "neutral";
              const y = myCells[i];
              if (x.kind === "time" && y.kind === "time") {
                if (x.sec < y.sec) cls = "win";
                else if (y.sec < x.sec) cls = "lose";
              } else if (x.kind === "dnf" && y.kind === "time") cls = "lose";
              else if (x.kind === "time" && y.kind === "dnf") cls = "win";
              const txt = x.kind === "dnf" ? "DNF" : fmtTime(x.sec);
              return `<span class="psH2HPill ${cls}">${escapeHtml(txt)}</span>`;
            }).join("");

            let setWinner = "tie";
            if (mySolveWins > opSolveWins) { setWinner = "me"; matchMySets++; }
            else if (opSolveWins > mySolveWins) { setWinner = "op"; matchOpSets++; }

            setsHTML += `
              <div class="psH2HSetHeader">
                <div class="psH2HSetLabel">Set ${escapeHtml(setNo)}</div>
                <div class="psH2HSetScore">${mySolveWins}–${opSolveWins}</div>
                <div class="psH2HSetResult ${setWinner === "me" ? "win" : setWinner === "op" ? "lose" : ""}">
                  ${setWinner === "me" ? "Won" : setWinner === "op" ? "Lost" : "Tie"}
                </div>
              </div>

              <div class="psH2HSetWrap">
                <div class="psH2HNamesCol">
                  <a class="psH2HRowName" href="/persons/?id=${encodeURIComponent(playerId)}">${escapeHtml(myName)}</a>
                  <a class="psH2HRowName" href="/persons/?id=${encodeURIComponent(opId)}">${escapeHtml(opName)}</a>
                </div>
                <div class="psH2HSetScroller">
                  <div class="psH2HSetSolves">
                    <div class="psH2HPillsRow ${setWinner==="me" ? "win" : setWinner==="op" ? "lose" : ""}" 
     data-name="${escapeHtml(myName)}">
  ${myPills}
</div>

<div class="psH2HPillsRow ${setWinner==="op" ? "win" : setWinner==="me" ? "lose" : ""}" 
     data-name="${escapeHtml(opName)}">
  ${opPills}
</div>

                  </div>
                </div>
              </div>
            `;
          }

          const matchWinner = matchMySets === matchOpSets ? "tie" : (matchMySets > matchOpSets ? "me" : "op");

          // ✅ Winner/Loser colors on names + centered score
          const myCls = matchWinner === "me" ? "h2hWin" : matchWinner === "op" ? "h2hLose" : "";
          const opCls = matchWinner === "op" ? "h2hWin" : matchWinner === "me" ? "h2hLose" : "";
          const myScoreCls = matchWinner === "me" ? "h2hWin" : matchWinner === "op" ? "h2hLose" : "";
          const opScoreCls = matchWinner === "op" ? "h2hWin" : matchWinner === "me" ? "h2hLose" : "";

          const matchEl = document.createElement("div");
          matchEl.className = "psH2HMatch";
          matchEl.innerHTML = `
            <div class="psH2HMatchTop">
              <div class="psH2HChips">
                ${chip(roundName)}
                ${groupName ? chip(`Group ${groupName}`) : ""}
                ${bracketName ? chip(bracketName) : ""}
              </div>

              <div class="psH2HScoreLineCenter">
                <a class="psH2HName ${myCls}" href="/persons/?id=${encodeURIComponent(playerId)}">${escapeHtml(myName)}</a>

                <div class="psH2HScoreCenter">
                  <span class="${myScoreCls}">${matchMySets}</span>
                  <span class="sep">|</span>
                  <span class="${opScoreCls}">${matchOpSets}</span>
                </div>

                <a class="psH2HName ${opCls}" href="/persons/?id=${encodeURIComponent(opId)}">${escapeHtml(opName)}</a>

                <button class="psBtn" type="button">Show sets</button>
              </div>
            </div>

            <div class="psH2HSetsWrap">
              ${setsHTML || ""}
            </div>
          `;

          applyThemeVars(matchEl.querySelector(".psH2HMatchTop"), comp.compName);

          const btn = matchEl.querySelector(".psBtn");
          const setsWrap = matchEl.querySelector(".psH2HSetsWrap");
          btn.addEventListener("click", () => {
            const on = setsWrap.classList.toggle("on");
            btn.textContent = on ? "Hide sets" : "Show sets";
          });

          matchesWrap.appendChild(matchEl);
        }

        listH2H.appendChild(compBlock);
      }
    }

    renderEventPills();
    setMode("ao5");
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    const playerId = safe(new URLSearchParams(location.search).get("id"));

    if ($("psId")) $("psId").textContent = playerId || "—";

    if (!playerId) {
      if ($("psName")) $("psName").textContent = "No player selected";
      showError("Open this page like: /persons/?id=PLAYER_ID");
      return;
    }

    try {
      if (!window.CB_API || typeof window.CB_API.getCSV !== "function") {
        throw new Error("CB_API.getCSV is missing. Make sure your shared CSV loader is included before persons.js.");
      }
      if (!window.CB || !window.CB.CSV_RANKINGS) {
        throw new Error("window.CB.CSV_RANKINGS is missing. Make sure your config is loaded before persons.js.");
      }

      const [rankRows, compRows] = await Promise.all([
        window.CB_API.getCSV(window.CB.CSV_RANKINGS),
        window.CB_API.getCSV(window.CB.CSV_COMPETITIONS),
      ]);

      const allRows = (rankRows || []).map((r, idx) => ({ ...r, _rowIndex: idx + 1 }));

      const nameById = new Map();
      for (const r of allRows) {
        const pid = safe(r.player_id);
        const nm = safe(r.name);
        if (pid && nm && !nameById.has(pid)) nameById.set(pid, nm);
      }

      const mine = allRows.filter((r) => safe(r.player_id) === playerId);

      if (!mine.length) {
        if ($("psName")) $("psName").textContent = `Player ${playerId}`;
        if ($("psEventsCount")) $("psEventsCount").textContent = "0";
        if ($("psCompsCount")) $("psCompsCount").textContent = "0";
        if ($("psSolvesCount")) $("psSolvesCount").textContent = "0";
        showError("No rows found for this player_id in the rankings sheet.");
        return;
      }

      if ($("psName")) $("psName").textContent = nameById.get(playerId) || safe(mine[0].name) || `Player ${playerId}`;

      const events = new Set(mine.map((r) => normalizeEvent(r.event)).filter(Boolean));
      const comps = new Set(mine.map((r) => safe(r.comp_id)).filter(Boolean));

      // total solves: only valid times
      let solves = 0;
      for (const r of mine) {
        for (const f of SOLVE_FIELDS) {
          const cell = parseSolveCell(r[f]);
          if (cell.kind === "time") solves++;
        }
      }

      if ($("psEventsCount")) $("psEventsCount").textContent = String(events.size);
      if ($("psCompsCount")) $("psCompsCount").textContent = String(comps.size);
      if ($("psSolvesCount")) $("psSolvesCount").textContent = String(solves);

      renderPR(playerId, allRows);
      setupUI(playerId, allRows, compRows || [], nameById);
    } catch (e) {
      console.error(e);
      if ($("psName")) $("psName").textContent = "Error";
      showError(e?.message ? String(e.message) : String(e));
    }
  }

  init();
})();
