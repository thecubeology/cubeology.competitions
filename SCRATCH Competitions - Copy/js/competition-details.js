const IST_OFFSET_MIN = 330;

function safe(v){ return (v ?? "").toString().trim(); }
function isTruthy(v){
  const x = safe(v).toLowerCase();
  return x === "true" || x === "yes" || x === "1" || x === "sold" || x === "soldout";
}

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
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m){
    const yyyy=+m[1], mm=+m[2], dd=+m[3];
    return Date.UTC(yyyy, mm-1, dd, 0, 0) - IST_OFFSET_MIN*60*1000;
  }
  return null;
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
  return safe(t);
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

function regState(c, now){
  if(isTruthy(c.reg_sold)) return "soldout";
  const rs = parseIST(c.reg_start);
  const re = parseIST(c.reg_end);
  if(rs && now < rs) return "soon";
  if(re && now > re) return "closed";
  if(rs || re) return "open";
  return "unknown";
}

function compactRegLine(c, now){
  const r = regState(c, now);
  const rs = normalizeSingleDate(safe(c.reg_start));
  const re = normalizeSingleDate(safe(c.reg_end));
  if(r === "soldout") return "Sold Out";
  if(r === "closed") return "Registrations closed";
  if(r === "soon") return rs ? `Regs start on: ${rs}` : "Reg starts soon";
  return re ? `Regs close on: ${re}` : "Registrations open";
}

function registerBtnLabel(r){
  if(r === "soldout") return "Sold Out";
  if(r === "open") return "Register Now";
  if(r === "soon") return "Reg starts soon";
  if(r === "closed") return "Registrations Closed";
  return "Register";
}

function registerBtnDisabled(r, link){
  if(!link) return true;
  return r === "closed" || r === "soldout" || r === "soon";
}

function safeFeesLine(c){
  const base = safe(c.base_fee);
  const per = safe(c.per_event_fee);

  const fmt = (v) => {
    const x = safe(v);
    if(!x) return "";
    if(/[a-zA-Z]/.test(x)) return x; // allow Free
    return `₹${x}`;
  };

  const a = base ? `${fmt(base)}` : "";
  const b = per ? `${fmt(per)}/event` : "";
  return [a,b].filter(Boolean).join(" • ");
}

(async function(){
  const wrap = document.getElementById("detailWrap");
  const COMP_ID = safe(window.CB_COMP_ID).toUpperCase();

  try{
    const rows = await window.CB_API.getCSV(window.CB.CSV_COMPETITIONS);
    const c = (rows || []).find(x => safe(x.comp_id).toUpperCase() === COMP_ID);

    if(!c){
      wrap.innerHTML = `<div class="detailCard"><div class="muted">Competition not found.</div></div>`;
      return;
    }

    const now = Date.now();
    const r = regState(c, now);
    const regLine = compactRegLine(c, now);

    const regLink = safe(c.register_link);
    const regDisabled = registerBtnDisabled(r, regLink);

    const title = safe(c.comp_name) || safe(c.comp_id);
    const dateText = normalizeCompDateText(c.comp_date);
    const desc = safe(c.description) || safe(c.short_hook);
    const events = safe(c.events) || "—";
    const mode = safe(c.mode_label) || "—";
    const fees = safeFeesLine(c);
    const cap = safe(c.reg_capacity) ? safe(c.reg_capacity) : "";

    document.title = `${title} • Cubeology`;

    wrap.innerHTML = `
      <div class="detailCard">
        <div class="detailTop">
          <div>
            <div class="pills">
              ${isTruthy(c.featured) ? `<span class="pill pink">FEATURED</span>` : ``}
              ${r === "open" ? `<span class="pill green">REG OPEN</span>` : ``}
              ${r === "soon" ? `<span class="pill amber">STARTS SOON</span>` : ``}
              ${r === "closed" ? `<span class="pill red">CLOSED</span>` : ``}
              ${r === "soldout" ? `<span class="pill red">SOLD OUT</span>` : ``}
            </div>
            <h1 class="title">${title}</h1>
            <div class="sub">${dateText}</div>
            <div class="sub" style="margin-top:8px;">${regLine}</div>
          </div>
        </div>

        ${desc ? `<div class="desc">${desc}</div>` : ``}

        <div class="kvGrid">
          <div class="kvRow">
            <div class="kvItem">
              <div class="kvLabel">Events</div>
              <div class="kvValue">${events}</div>
            </div>
            <div class="kvItem">
              <div class="kvLabel">Mode</div>
              <div class="kvValue">${mode}</div>
            </div>
          </div>

          ${(fees || cap) ? `
            <div class="kvRow">
              ${fees ? `
                <div class="kvItem">
                  <div class="kvLabel">Fees</div>
                  <div class="kvValue">${fees}</div>
                </div>
              ` : ``}
              ${cap ? `
                <div class="kvItem">
                  <div class="kvLabel">Capacity</div>
                  <div class="kvValue">${cap}</div>
                </div>
              ` : ``}
            </div>
          ` : ``}
        </div>

        <div class="actions">
          <a class="btn primary bigCTA ${regDisabled ? "disabled" : ""}"
             href="${regDisabled ? "#" : regLink}"
             aria-disabled="${regDisabled}"
             ${regDisabled ? "" : `target="_blank" rel="noopener"`}>
            ${registerBtnLabel(r)}
          </a>

          <a class="btn ghost less" href="/competitions/RCO26/rules/">Rules</a>

          <a class="btn dark" href="/rankings/">View results</a>
        </div>
      </div>
    `;
  }catch(err){
    console.error(err);
    wrap.innerHTML = `<div class="detailCard"><div class="muted">Error loading competition.</div></div>`;
  }
})();
