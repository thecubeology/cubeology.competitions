// /js/user-context.js
(function(){
  function low(v){ return String(v||"").trim().toLowerCase(); }
  function safe(v){ return String(v||"").trim(); }

  function needConfig(){
    return !!(window.CB?.SUPABASE_URL && window.CB?.SUPABASE_KEY && window.supabase?.createClient);
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

  // small cache so every page load doesn’t refetch CSV_UPCOMING repeatedly
  const CACHE_KEY = "cb_upcoming_cache_v1";
  const CACHE_TTL_MS = 60 * 1000; // 1 minute

  async function getUpcomingRowsCached(getCSV){
    try{
      const raw = sessionStorage.getItem(CACHE_KEY);
      if(raw){
        const obj = JSON.parse(raw);
        if(obj && (Date.now() - obj.ts) < CACHE_TTL_MS && Array.isArray(obj.rows)){
          return obj.rows;
        }
      }
    }catch(e){}

    if(!window.CB?.CSV_UPCOMING) return [];
    const rows = await getCSV(window.CB.CSV_UPCOMING);

    try{
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: rows || [] }));
    }catch(e){}

    return rows || [];
  }

  // PUBLIC: one call gives you everything you need for “registered” logic.
  window.CB_USERCTX = {
    async load(getCSV){
      // default: logged out
      const out = {
        loggedIn: false,
        user: null,
        pid: "",
        player_name: "",
        registeredCompSet: new Set(), // comp_id lowercase
        upcomingRowsMine: []          // rows from CSV_UPCOMING for this pid (events etc)
      };

      if(!needConfig()) return out;

      const sb = window.supabase.createClient(window.CB.SUPABASE_URL, window.CB.SUPABASE_KEY);
      const { data: udata } = await sb.auth.getUser();
      const user = udata?.user;
      if(!user) return out;

      out.loggedIn = true;
      out.user = user;

      const prof = await ensureProfileRow(sb, user);
      const pid = safe(prof?.player_id);
      out.pid = pid;
      out.player_name = safe(prof?.player_name);

      if(!pid) return out; // signed-in but not linked yet

      const upRows = await getUpcomingRowsCached(getCSV);
      const mine = (upRows || []).filter(r => safe(r.player_id) === pid);

      out.upcomingRowsMine = mine;

      const set = new Set();
      for(const r of mine){
        const cid = low(r.comp_id);
        if(cid) set.add(cid);
      }
      out.registeredCompSet = set;

      return out;
    },

    isRegistered(ctx, compId){
      const id = low(compId);
      return !!id && !!ctx?.registeredCompSet?.has(id);
    },

    // optional: get events user registered for, per competition
    registeredEvents(ctx, compId){
      const id = low(compId);
      const rows = (ctx?.upcomingRowsMine || []).filter(r => low(r.comp_id) === id);
      const evs = Array.from(new Set(rows.map(r => safe(r.event)).filter(Boolean)));
      return evs;
    }
  };
})();
