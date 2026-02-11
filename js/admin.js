(function(){
  function $(id){ return document.getElementById(id); }

  function setMsg(text, type="info"){
    const el = $("msg");
    if(!el) return;
    el.textContent = text || "";
    el.className = "authMsg " + type;
    el.style.display = text ? "block" : "none";
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

  const ADMIN_UID = "0fa2d8ed-7958-4a68-9c0c-4178af0efb7c";

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

  let supabase;
  let currentRow = null;

  function showFound(row){
    currentRow = row;
    $("foundBox").style.display = "grid";
    $("fEmail").textContent = row.email || "—";
    $("fUid").textContent = row.user_id || "— (not logged in yet)";
    $("fPid").textContent = row.player_id || "Not linked";
    $("fName").textContent = row.player_name || "—";
    $("fRole").textContent = (row.user_id === ADMIN_UID) ? "admin" : "user";

    $("setPid").value = row.player_id || "";
    $("setName").value = row.player_name || "";
  }

  function clearFound(){
    currentRow = null;
    $("foundBox").style.display = "none";
    $("setPid").value = "";
    $("setName").value = "";
  }

  async function requireAdmin(){
    const { data: udata } = await supabase.auth.getUser();
    const user = udata?.user;
    if(!user){
      location.replace("/auth/login.html");
      return false;
    }
    if(user.id !== ADMIN_UID){
      setMsg("Access denied. Admin only.", "error");
      return false;
    }
    return true;
  }

  async function findByEmail(email){
    return await supabase
      .from("profiles")
      .select("email,user_id,player_id,player_name,role")
      .eq("email", email)
      .maybeSingle();
  }

  document.addEventListener("DOMContentLoaded", async ()=>{
    if(!needConfig()) return;

    supabase = window.supabase.createClient(window.CB.SUPABASE_URL, (window.CB.SUPABASE_KEY || window.CB.SUPABASE_ANON_KEY));

    // Fix signout
    const logoutBtn = $("logoutBtn");
    if(logoutBtn){
      logoutBtn.addEventListener("click", async ()=>{
        logoutBtn.disabled = true;
        logoutBtn.textContent = "Signing out…";
        await safeSignOut(supabase);
      });
    }

    setMsg("Checking admin access…", "info");
    const ok = await requireAdmin();
    if(!ok) return;
    setMsg("Admin access granted.", "success");

    $("btnFind").addEventListener("click", async ()=>{
      const email = ($("searchEmail").value || "").trim().toLowerCase();
      if(!email) return setMsg("Enter an email to search.", "error");

      setMsg("Searching…", "info");
      clearFound();

      const { data, error } = await findByEmail(email);
      if(error) return setMsg(error.message, "error");

      if(!data){
        // Create new entry even if user never logged in
        const pid = ($("setPid").value || "").trim();
        const pname = ($("setName").value || "").trim();

        setMsg("No entry found. Creating a new entry…", "info");

        const { error: insErr } = await supabase
          .from("profiles")
          .insert({
            email,
            player_id: pid || null,
            player_name: pname || null,
            user_id: null
          });

        if(insErr) return setMsg(insErr.message, "error");

        const { data: created, error: e2 } = await findByEmail(email);
        if(e2) return setMsg(e2.message, "error");

        showFound(created);
        setMsg("Created new entry. When this email logs in later, it will auto-link.", "success");
        return;
      }

      showFound(data);
      setMsg("Entry found. You can edit and save.", "success");
    });

    $("btnSave").addEventListener("click", async ()=>{
      const email = ($("searchEmail").value || "").trim().toLowerCase();
      if(!email) return setMsg("Enter email first.", "error");

      const pid = ($("setPid").value || "").trim();
      const pname = ($("setName").value || "").trim();

      setMsg("Saving…", "info");

      const { error } = await supabase
        .from("profiles")
        .update({ player_id: pid || null, player_name: pname || null })
        .eq("email", email);

      if(error) return setMsg(error.message, "error");

      const { data, error: e2 } = await findByEmail(email);
      if(e2) return setMsg(e2.message, "error");

      showFound(data);
      setMsg("Saved.", "success");
    });

    $("btnDelete").addEventListener("click", async ()=>{
      const email = ($("searchEmail").value || "").trim().toLowerCase();
      if(!email) return setMsg("Enter email first.", "error");

      const ok = confirm("Delete this email entry from database?\n\nThis will remove the email + PID/name mapping.");
      if(!ok) return;

      setMsg("Deleting…", "info");

      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("email", email);

      if(error) return setMsg(error.message, "error");

      clearFound();
      $("searchEmail").value = "";
      setMsg("Deleted successfully.", "success");
    });

    $("btnUnlink").addEventListener("click", async ()=>{
      const email = ($("searchEmail").value || "").trim().toLowerCase();
      if(!email) return setMsg("Enter email first.", "error");

      setMsg("Removing link…", "info");

      const { error } = await supabase
        .from("profiles")
        .update({ player_id: null, player_name: null })
        .eq("email", email);

      if(error) return setMsg(error.message, "error");

      const { data } = await findByEmail(email);
      showFound(data);
      setMsg("Link removed (email entry remains).", "success");
    });

    $("btnClear").addEventListener("click", ()=>{
      $("searchEmail").value = "";
      clearFound();
      setMsg("", "info");
    });
  });
})();
