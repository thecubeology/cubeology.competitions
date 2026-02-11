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

  document.addEventListener("DOMContentLoaded", async () => {
    if(!needConfig()) return;

    const supabase = window.supabase.createClient(window.CB.SUPABASE_URL, (window.CB.SUPABASE_KEY || window.CB.SUPABASE_ANON_KEY));

    const signOutBtn = $("btnSignOut");
    if(signOutBtn){
      signOutBtn.addEventListener("click", async () => {
        signOutBtn.disabled = true;
        signOutBtn.textContent = "Signing out…";
        await safeSignOut(supabase);
      });
    }

    const { data: udata } = await supabase.auth.getUser();
    const user = udata?.user;
    if(!user){
      location.replace("/auth/login.html");
      return;
    }

    $("subtitle").textContent = "Loading your profile…";

    const email = (user.email || "").toLowerCase();

    let { data: existingByEmail, error: e1 } = await supabase
      .from("profiles")
      .select("email,user_id,player_id,player_name,role")
      .eq("email", email)
      .maybeSingle();

    if (e1) {
      setMsg(e1.message, "error");
      $("subtitle").textContent = "Unable to load profile.";
      return;
    }

    if (existingByEmail?.email && !existingByEmail.user_id) {
      const { error: e2 } = await supabase
        .from("profiles")
        .update({ user_id: user.id })
        .eq("email", email);
      if (e2) {
        setMsg(e2.message, "error");
        $("subtitle").textContent = "Unable to attach your account.";
        return;
      }
    }

    if (!existingByEmail) {
      const { error: e3 } = await supabase
        .from("profiles")
        .insert({ email, user_id: user.id });
      if (e3) {
        setMsg(e3.message, "error");
        $("subtitle").textContent = "Unable to create your profile.";
        return;
      }
    }

    const { data: prof, error } = await supabase
      .from("profiles")
      .select("email, player_id, player_name, role, user_id")
      .eq("email", email)
      .single();

    if(error){
      setMsg(error.message, "error");
      $("subtitle").textContent = "Unable to load profile.";
      return;
    }

    const isAdmin = (user.id === ADMIN_UID);

    $("kv").style.display = "grid";
    $("email").textContent = prof.email || user.email || "—";
    $("pid").textContent = prof.player_id || "Not linked";
    $("pname").textContent = prof.player_name || "—";

    const roleRowLabel = document.querySelector('#kv .k:nth-child(7)');
    const roleRowValue = $("role");
    if(isAdmin){
      roleRowValue.textContent = "admin";
      if(roleRowLabel) roleRowLabel.style.display = "";
      roleRowValue.style.display = "";
      $("adminActions").style.display = "flex";
    } else {
      if(roleRowLabel) roleRowLabel.style.display = "none";
      roleRowValue.style.display = "none";
      roleRowValue.textContent = "";
    }

    if(prof.player_id){
      $("subtitle").textContent = "Your account is linked. Welcome!";
      $("linkedActions").style.display = "flex";
      $("btnMyProfile").href = "/persons/?id=" + encodeURIComponent(prof.player_id);
      setMsg("", "info");
    } else {
      $("subtitle").textContent = "Your account is created, but not linked to a Cubeology Player yet.";
      $("unlinkedActions").style.display = "block";
      setMsg("", "info");

      const pidHint = "PID_HERE";
      const body =
`Hi Cubeology Team,

Please link my Cubeology account.

PID: ${pidHint}
Participant name: YOUR_NAME_HERE
Email to link: ${prof.email || user.email || "YOUR_EMAIL_HERE"}

(Recommended) Proof: I am attaching payment/registration screenshot for verification.

Thanks.`;

      const mailto = "mailto:info@thecubeology.com"
        + "?subject=" + encodeURIComponent("Cubeology Profile Linking Request")
        + "&body=" + encodeURIComponent(body);

      const ml = $("mailtoLink");
      if(ml) ml.href = mailto;
    }
  });
})();
