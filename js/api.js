(function(){
  function parseCSV(text){
    const rows = [];
    let row = [], cur = "", inQ = false;
    for(let i=0;i<text.length;i++){
      const c = text[i], n = text[i+1];
      if(inQ){
        if(c === '"' && n === '"'){ cur += '"'; i++; }
        else if(c === '"'){ inQ = false; }
        else cur += c;
      }else{
        if(c === '"') inQ = true;
        else if(c === ","){ row.push(cur); cur=""; }
        else if(c === "\n"){ row.push(cur); rows.push(row); row=[]; cur=""; }
        else if(c !== "\r") cur += c;
      }
    }
    row.push(cur); rows.push(row);
    const head = rows.shift();
    return rows.filter(r=>r.some(x=>x)).map(r=>{
      const o={}; head.forEach((h,i)=>o[h]=r[i]||""); return o;
    });
  }

  async function getCSV(url){
    const res = await fetch(url, { cache:"no-store" });
    if(!res.ok) throw new Error("CSV load failed");
    return parseCSV(await res.text());
  }

  window.CB_API = { getCSV };
})();
