/* Universal Rules Page
   URL options:
   - /rules/?id=rco26            (recommended from competition page)
   - /rules/?variant=New%20System (optional direct)

   Logic:
   1) If id given -> load competition row -> read rules_variant + custom rules flags
      - if custom rules -> redirect to /rules/<id>/
   2) Load variant HTML from /rules/variants/<slug>.html
*/

function safe(v){ return (v ?? "").toString().trim(); }
function low(v){ return safe(v).toLowerCase(); }
function isTruthy(v){
  const x = low(v);
  return x === "true" || x === "yes" || x === "1";
}

function slugifyVariant(v){
  return low(v)
    .replace(/&/g,"and")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
}

function getQuery(){
  const p = new URLSearchParams(location.search);
  return {
    id: low(p.get("id")),
    variant: safe(p.get("variant"))
  };
}

function isCustomRulesComp(c){
  const rpt = low(c?.rules_page_type);
  const flag = isTruthy(c?.rules_custom);
  return rpt === "custom" || flag;
}

function renderError(msg){
  const wrap = document.getElementById("rulesWrap");
  if(!wrap) return;
  wrap.innerHTML = `
    <div class="rulesCard">
      <div class="err">${msg}</div>
    </div>
  `;
}

async function loadVariantHTML(variant){
  const slug = slugifyVariant(variant);
  if(!slug) return null;

  const url = `/rules/variants/${encodeURIComponent(slug)}.html?v=1`;
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) return null;
  return await res.text();
}

function setBackLink(id){
  const back = document.getElementById("backBtn");
  if(!back) return;
  if(id){
    back.href = `/competitions/view/?id=${encodeURIComponent(id)}`;
    back.textContent = "← Back to Competition";
  }else{
    back.href = "/competitions/";
    back.textContent = "← Back";
  }
}

(async function init(){
  const q = getQuery();
  setBackLink(q.id);

  let comp = null;
  let variant = q.variant;

  try{
    if(q.id){
      const rows = await window.CB_API.getCSV(window.CB.CSV_COMPETITIONS);
      comp = (rows || []).find(r => low(r.comp_id) === q.id);

      if(!comp){
        renderError(`Competition not found for id: <b>${safe(q.id)}</b>`);
        return;
      }

      // Custom rules redirect
      if(isCustomRulesComp(comp)){
        location.replace(`/rules/${encodeURIComponent(q.id)}/`);
        return;
      }

      variant = safe(comp.rules_variant) || variant;
    }

    if(!variant){
      renderError(`No rules specified. Missing <b>rules_variant</b> in sheet (or pass <b>?variant=</b>).`);
      return;
    }

    const html = await loadVariantHTML(variant);
    if(!html){
      renderError(`Rules file not found for variant: <b>${variant}</b>.<br><br>
      Create: <b>/rules/variants/${slugifyVariant(variant)}.html</b>`);
      return;
    }

    const title = comp ? (safe(comp.comp_name) || safe(comp.comp_id)) : "Competition Rules";

    const wrap = document.getElementById("rulesWrap");
    wrap.innerHTML = `
      <div class="rulesCard">
        <div class="rulesHead">
          <div>
            <h1 class="rulesTitle">${title} • Rules</h1>
            <div class="sub">Applies to variant: <b>${variant}</b></div>
          </div>
          <div class="badge">${variant}</div>
        </div>

        <div class="rulesBody">${html}</div>
      </div>
    `;

    document.title = `${title} Rules • Cubeology`;

  }catch(err){
    console.error(err);
    renderError("Error loading rules. Please try again or check CSV / variant file.");
  }
})();
