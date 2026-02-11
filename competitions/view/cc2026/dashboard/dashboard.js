
/* CC2026 Dashboard (v16) — stable logic, ID-based matching, safe Discord visibility */
(function(){
  const COMP_ID = "cc2026";
  const DISCORD_URL = "https://discord.gg/CNamy5uU9s";
  const PRELIMS_TS_UTC = Date.UTC(2026, 3, 9, 18, 30, 0); // 10/04/2026 00:00 IST
  const REG_CLOSE_TS_UTC = Date.UTC(2026, 3, 9, 6, 30, 0); // 09/04/2026 12:00 IST

  const $ = (s)=>document.querySelector(s);
  const $$ = (s)=>Array.from(document.querySelectorAll(s));
  const safe = (v)=>String(v ?? "").trim();
  const low  = (v)=>safe(v).toLowerCase();

  function show(el, on){ if(el) el.hidden = !on; }
  function setText(sel, txt){ const el = $(sel); if(el) el.textContent = txt; }

  function toast(msg){
    const el = $("#toast");
    if(!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>el.classList.remove("show"), 1400);
  }

  function ensureConfig(){
    return !!(window.CB?.SUPABASE_URL && window.CB?.SUPABASE_KEY && window.supabase?.createClient);
  }
  function sb(){
    return window.supabase.createClient(window.CB.SUPABASE_URL, window.CB.SUPABASE_KEY);
  }

  // CSV parser (quoted commas/newlines)
  function parseCSV(text){
    if(!text) return [];
    const rows = [];
    let cur = "", inQ = false, row = [];
    for(let i=0;i<text.length;i++){
      const ch = text[i];
      if(ch === '"'){
        if(inQ && text[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
      }else if(ch === "," && !inQ){
        row.push(cur); cur = "";
      }else if((ch === "\n" || ch === "\r") && !inQ){
        if(ch === "\r" && text[i+1] === "\n") i++;
        row.push(cur); cur = "";
        if(row.length > 1 || (row.length===1 && row[0].trim()!=="")) rows.push(row);
        row = [];
      }else{
        cur += ch;
      }
    }
    row.push(cur);
    if(row.length > 1 || (row.length===1 && row[0].trim()!=="")) rows.push(row);

    if(!rows.length) return [];
    const headers = rows[0].map(h=>safe(h));
    const out = [];
    for(let r=1;r<rows.length;r++){
      const rec = {};
      const cols = rows[r];
      for(let c=0;c<headers.length;c++){
        rec[headers[c]] = safe(cols[c] ?? "");
      }
      out.push(rec);
    }
    return out;
  }

  async function fetchCSV(url){
    const res = await fetch(url, { cache: "no-store" });
    const txt = await res.text();
    const rows = parseCSV(txt);
    // normalize keys to lower-case for robust access
    return rows.map(r=>{
      const o = {};
      Object.keys(r).forEach(k => { o[low(k)] = r[k]; });
      return o;
    });
  }

  function getRegistrationsCsvUrl(){
    return safe(window.CB?.CSV_UPCOMING || "");
  }
  function getAnnouncementsCsvUrl(){
    return safe(window.CB?.CSV_ANNOUNCEMENTS || "");
  }
  function registerLink(){
    return "https://rzp.io/rzp/cc2026";
  }

  function fmtCountdown(ms){
    const s = Math.max(0, Math.floor(ms/1000));
    const d = Math.floor(s/86400);
    const hh = String(Math.floor((s%86400)/3600)).padStart(2,"0");
    const mm = String(Math.floor((s%3600)/60)).padStart(2,"0");
    const ss = String(s%60).padStart(2,"0");
    return `${d}d ${hh}:${mm}:${ss}`;
  }

  function startCountdown(){
    const tick = ()=> setText("#cdTimer", fmtCountdown(PRELIMS_TS_UTC - Date.now()));
    tick();
    setInterval(tick, 1000);
  }

  function setBadge(state, text){
    const b = $("#regBadge");
    if(!b) return;
    b.classList.remove("db-badge--ok","db-badge--bad","db-badge--neutral");
    if(state==="ok") b.classList.add("db-badge--ok");
    else if(state==="bad") b.classList.add("db-badge--bad");
    else b.classList.add("db-badge--neutral");
    b.textContent = text;
  }

  function setTab(name){
    $$(".db-tab").forEach(b=>b.classList.toggle("isActive", b.dataset.tab === name));
    $$(".db-panel").forEach(p=>p.classList.toggle("isActive", p.id === "tab-"+name));
  }

  function setTabLock(tabName, locked){
    const btn = $("#tabBtn-"+tabName);
    const lock = $("#lock-"+tabName);
    if(btn){
      btn.classList.toggle("isDim", locked);
      if(locked && !btn.querySelector(".lockIco")){
        const s = document.createElement("span");
        s.className = "lockIco";
        s.textContent = "🔒";
        btn.appendChild(s);
      }
      if(!locked){
        btn.querySelector(".lockIco")?.remove();
      }
    }
    if(lock) lock.hidden = !locked;
  }

  function showBadgeIf(el, val){
    if(!el) return;
    const t = safe(val);
    if(t){ el.textContent = t; el.style.display = "inline-flex"; }
    else { el.style.display = "none"; }
  }

  function renderEvents(events){
    const host = $("#eventsChips");
    if(!host) return;
    host.innerHTML = "";
    if(!events || !events.length){
      host.innerHTML = '<span class="db-muted">—</span>';
      return;
    }
    events.forEach(e=>{
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = e;
      host.appendChild(chip);
    });
  }

  // upcoming CSV columns (lowercased):
  // date, comp_id, player_id, name, event, age category, referrer, referrer_id ...
  function findMyRows(upcomingRows, playerId){
    const pid = safe(playerId);
    if(!pid) return [];
    return upcomingRows.filter(r=>{
      const comp = low(r["comp_id"] || "");
      const rid  = safe(r["player_id"] || "");
      return (!comp || comp === COMP_ID) && rid === pid;
    });
  }

  function computeReferralCount(upcomingRows, playerId){
    const pid = safe(playerId);
    if(!pid) return 0;
    const referred = upcomingRows.filter(r=>{
      const comp = low(r["comp_id"] || "");
      if(comp && comp !== COMP_ID) return false;
      return safe(r["referrer_id"] || "") === pid;
    });
    const uniq = new Set(referred.map(r=> safe(r["player_id"] || "")).filter(Boolean));
    return uniq.size;
  }

  function applyReferralUI(refCount){
    setText("#refCount", String(refCount));

    const max = 15;
    const clamped = Math.max(0, Math.min(max, Number(refCount)||0));
    const pct = (clamped / max) * 100;

    const fill = $("#refFill");
    if(fill) fill.style.width = pct.toFixed(2) + "%";

    // Position ticks and tick lines proportionally on a 0–15 scale
    const positionFor = (v)=> (Math.max(0, Math.min(max, v)) / max) * 100;

    $$(".refbar__tick").forEach(t=>{
      const v = Number(t.getAttribute("data-val")||0);
      const p = positionFor(v);
      t.style.left = p.toFixed(4) + "%";
      t.style.color = (refCount >= v) ? "rgba(255,212,0,1)" : "rgba(255,255,255,.65)";
    });

    $$(".refbar__tickline").forEach(l=>{
      const v = Number(l.getAttribute("data-val")||0);
      const p = positionFor(v);
      l.style.left = p.toFixed(4) + "%";
      l.style.background = (refCount >= v) ? "rgba(255,212,0,.40)" : "rgba(255,212,0,.18)";
    });

    const setMs = (id, n)=>{
      const el = $(id);
      if(!el) return;
      const unlocked = refCount >= n;
      const need = Math.max(0, n - refCount);
      el.textContent = unlocked ? "Unlocked" : (need===1 ? "1 more" : `${need} more`);
      // Golden pill when unlocked
      el.classList.toggle("gold", unlocked);
    };

    setMs("#ms3", 3);
    setMs("#ms6", 6);
    setMs("#ms10", 10);
    setMs("#ms15", 15);

    // Slight highlight for the next milestone
    const milestones = [3, 6, 10, 15];
    const next = milestones.find(m => refCount < m);
    $$(".db-msPill").forEach(p => p.classList.remove("next"));
    if(next){
      const nextEl = $("#ms"+next);
      nextEl?.classList.add("next");
    }
  }

  function escapeHtml(str){
    return safe(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function parseDateAny(s){
    const t = safe(s);
    if(!t) return null;
    // dd/mm/yyyy or dd-mm-yyyy
    let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(m){
      const dd = parseInt(m[1],10), mm = parseInt(m[2],10), yy = parseInt(m[3],10);
      return Date.UTC(yy, mm-1, dd, 0, 0, 0);
    }
    m = t.match(/^(\d{1,2})\-(\d{1,2})\-(\d{4})/);
    if(m){
      const dd = parseInt(m[1],10), mm = parseInt(m[2],10), yy = parseInt(m[3],10);
      return Date.UTC(yy, mm-1, dd, 0, 0, 0);
    }
    const p = Date.parse(t);
    return Number.isFinite(p) ? p : null;
  }

  async function loadAnnouncements(){
    const url = getAnnouncementsCsvUrl();
    const hint = $("#annHint");
    const list = $("#annList");
    if(!list) return;
    list.innerHTML = "";
    if(!url){
      if(hint) hint.textContent = "No announcements feed configured.";
      return;
    }
    try{
      const rows = await fetchCSV(url);
      // visible: empty or yes => show. no => hide
      const visible = rows.filter(r => low(r["visible"]) !== "no");
      const mapped = visible.map((r,i)=>{
        const pinned = low(r["pinned"]) === "yes";
        const ts = parseDateAny(r["date"]);
        return { r, pinned, ts, i };
      });
      mapped.sort((a,b)=>{
        if(a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const at = a.ts ?? -Infinity;
        const bt = b.ts ?? -Infinity;
        return bt - at;
      });
      if(hint) hint.textContent = mapped.length ? "" : "No announcements right now.";
      mapped.forEach(({r, pinned})=>{
        const title = safe(r["title"]) || "Update";
        const msg   = safe(r["message"]);
        const date  = safe(r["date"]);
        const item = document.createElement("div");
        item.className = "annItem";
        item.innerHTML = `
          <div class="annTop">
            <div class="annTitle">${escapeHtml(title)}</div>
            <div class="annMeta">
              ${pinned ? '<span class="tag pin">PINNED</span>' : ''}
              ${date ? '<span class="tag">'+escapeHtml(date)+'</span>' : ''}
            </div>
          </div>
          <div class="annMsg">${escapeHtml(msg)}</div>
        `;
        list.appendChild(item);
      });
    }catch(e){
      console.error(e);
      if(hint) hint.textContent = "Could not load announcements.";
    }
  }

  async function main(){
    if(!ensureConfig()){
      // Make the page visibly usable even if config.js failed to load
      show($("#dashRoot"), true);
      setBadge("bad","Config missing");
      // still allow reading rules + registration
      $("#btnRules")?.setAttribute("href", "/cc2026/#format");
      $("#btnRegister")?.setAttribute("href", registerLink());
      return;
    }

    // Hooks
    $$(".db-tab").forEach(b=>b.addEventListener("click", ()=>setTab(b.dataset.tab)));
    $("#btnRules")?.setAttribute("href", "/cc2026/#format");
    $("#btnDiscord").setAttribute("href", DISCORD_URL);

    const regUrl = registerLink();
    $("#btnRegister")?.setAttribute("href", regUrl);
    $("#lockRegister1")?.setAttribute("href", regUrl);
    $("#lockRegister2")?.setAttribute("href", regUrl);

    // Auto-close registrations (09 Apr 2026, 12:00 PM IST)
    const regClosed = Date.now() >= REG_CLOSE_TS_UTC;
    if(regClosed){
      // Hide all Register Now CTAs everywhere
      $("#btnRegister") && ($("#btnRegister").style.display = "none");
      $("#lockRegister1") && ($("#lockRegister1").style.display = "none");
      $("#lockRegister2") && ($("#lockRegister2").style.display = "none");
    }

    startCountdown();

    // Auth
    const client = sb();
    const { data: { user } } = await client.auth.getUser();

    if(!user){
      // redirect to CC2026 login and keep return
      const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.replace("../login/?mode=signin&next="+next);
      return;
    }

    $("#btnLogout")?.addEventListener("click", async ()=>{
      try{ await client.auth.signOut(); }catch(_e){}
      window.location.replace("../");
    });

    const email = safe(user.email);
    let playerId = "";
    let playerName = "";

    // fetch profile by email
    try{
      const { data, error } = await client
        .from("profiles")
        .select("player_id, player_name")
        .eq("email", email)
        .maybeSingle();
      if(!error && data){
        playerId = safe(data.player_id);
        playerName = safe(data.player_name);
      }
    }catch(_e){}

    // If no linked profile => show only error block
    if(!playerId){
      show($("#linkError"), true);
      show($("#dashRoot"), false);
      return;
    }

    show($("#linkError"), false);
    show($("#dashRoot"), true);

    // Hello line
    const nameEl = $("#helloName");
    if(playerName){
      nameEl.textContent = playerName;
      nameEl.style.display = "";
    }else{
      nameEl.textContent = "";
      nameEl.style.display = "none";
    }

    // Prepare referral message (ID-based)
    const myDisplayName = playerName || "(User Name if available)";
    $("#refMsg").value =
`Hey,

Cubing Clash 3.0 is a multi-round worldwide Rubik's Cube competition with ₹60,000+ prizes.

Register here:
https://competitions.thecubeology.com/competitions/view/cc2026/

While registering, write my Name in the Referred By column:
${myDisplayName}
`;

    $("#copyMsg")?.addEventListener("click", async ()=>{
      try{ await navigator.clipboard.writeText($("#refMsg").value || ""); }catch(_e){}
      toast("Copied ✅");
    });

    // Fetch upcoming CSV
    const upcomingUrl = getRegistrationsCsvUrl();
    let upcoming = [];
    if(upcomingUrl){
      try{ upcoming = await fetchCSV(upcomingUrl); }catch(_e){ upcoming = []; }
    }

    const myRows = findMyRows(upcoming, playerId);
    const isRegistered = myRows.length > 0;
    const isRegClosed = Date.now() >= REG_CLOSE_TS_UTC;

    // Badges + actions (Discord only after registration)
    setBadge(
      isRegistered ? "ok" : (isRegClosed ? "bad" : "bad"),
      isRegistered ? "Registered ✓" : (isRegClosed ? "Registrations closed" : "Not registered")
    );
    $("#btnDiscord").style.display = isRegistered ? "" : "none";
    $("#btnRegister").style.display = (isRegistered || isRegClosed) ? "none" : "";
    $("#btnContact").setAttribute("href","mailto:info@thecubeology.com");

    // Lock CTAs should also close after registration close time
    $("#lockRegister1").style.display = isRegClosed ? "none" : "";
    $("#lockRegister2").style.display = isRegClosed ? "none" : "";

    // Tab locks: referrals always open
    setTabLock("overview", !isRegistered);
    setTabLock("announcements", !isRegistered);
    setTab("overview"); // default for registered, but lock overlay shows for non-registered

    if(!isRegistered) setTab("referrals");

    // Overview content
    setText("#statusText", isRegistered ? "Registered for CC2026 ✅" : (isRegClosed ? "Registrations closed" : "Not registered"));
    const first = myRows[0] || {};
    const ageCategory = safe(first["age category"] || first["age_category"] || "");
    const category = safe(first["category"] || first["cat"] || "");
    showBadgeIf($("#ageCat"), ageCategory);
    showBadgeIf($("#category"), category);

    if(isRegistered){
      const events = myRows.map(r=> safe(r["event"] || "")).filter(Boolean);
      const uniq = Array.from(new Set(events));
      renderEvents(uniq);
      // load announcements
      await loadAnnouncements();
    }else{
      renderEvents([]);
      setText("#annHint", "Register to view announcements.");
    }

    // Referral count always (ID-based)
    const refCount = computeReferralCount(upcoming, playerId);
    applyReferralUI(refCount);
  }

  main().catch((e)=>{
    console.error(e);
    setBadge("bad","Error");
  });
})();
