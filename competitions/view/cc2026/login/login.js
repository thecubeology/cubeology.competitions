(function(){
  const $ = (id)=>document.getElementById(id);

  function show(msg){
    const el = $("msg");
    if(el) el.textContent = msg || "";
  }

  function safeNext(){
    const u = new URL(location.href);
    const next = u.searchParams.get("next") || "";
    if(!next) return "";
    try{
      const dest = new URL(next, location.origin);
      if(dest.origin !== location.origin) return "";
      return dest.pathname + dest.search + dest.hash;
    }catch(e){ return ""; }
  }

  if(!window.CB?.SUPABASE_URL || !window.CB?.SUPABASE_KEY){
    show("Missing config. Please load /js/config.js (SUPABASE_URL + SUPABASE_KEY).");
    return;
  }

  const sb = window.supabase.createClient(window.CB.SUPABASE_URL, window.CB.SUPABASE_KEY);

  const emailEl = $("email");
  const passEl  = $("password");

  const passField = $("passwordField");
  const otpHint   = $("otpHint");
  const otpVerify = $("otpVerify");
  const otpCode   = $("otpCode");
  const btnVerify = $("btnVerifyOtp");

  const primaryBtn = $("primaryBtn");
  const googleBtn  = $("btnGoogle");
  const form       = $("formAuth");

  let mode = "signin";
  let method = "password";

  function callbackUrl(){
    return new URL("callback.html", location.href).toString();
  }

  function setMode(m){
    mode = m;
    document.querySelectorAll("[data-mode]").forEach(b=> b.classList.toggle("on", b.dataset.mode===mode));
    $("title").textContent = mode === "signup" ? "Sign up" : "Sign in";
    primaryBtn.textContent = (method === "otp") ? "Send OTP" : (mode === "signup" ? "Create Account" : "Sign in");
    show("");
  }

  function setMethod(m){
    method = m;
    document.querySelectorAll("[data-method]").forEach(b=> b.classList.toggle("on", b.dataset.method===method));
    const isOtp = method === "otp";
    passField.style.display = isOtp ? "none" : "block";
    otpHint.style.display   = isOtp ? "block" : "none";
    otpVerify.style.display = "none";
    if(otpCode) otpCode.value = "";
    primaryBtn.textContent  = isOtp ? "Send OTP" : (mode === "signup" ? "Create Account" : "Sign in");
    show("");
  }

  document.querySelectorAll("[data-mode]").forEach(b=> b.addEventListener("click", ()=> setMode(b.dataset.mode)));
  document.querySelectorAll("[data-method]").forEach(b=> b.addEventListener("click", ()=> setMethod(b.dataset.method)));

  async function goAfterAuth(){
    const nextPath = safeNext();
    if(nextPath) localStorage.setItem("cb_return_to", location.origin + nextPath);
    location.replace("callback.html");
  }

  sb.auth.getUser().then(({data})=>{
    if(data?.user?.email) goAfterAuth();
  }).catch(()=>{});

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const em = String(emailEl.value||"").trim().toLowerCase();
    const pw = String(passEl.value||"");
    if(!em){ show("Enter email"); return; }

    try{
      show("Working…");

      if(method === "password"){
        if(!pw || pw.length < 6){ show("Password should be at least 6 characters."); return; }
        if(mode === "signup"){
          const { error } = await sb.auth.signUp({
            email: em,
            password: pw,
            options: { emailRedirectTo: callbackUrl() }
          });
          if(error) throw error;
          show("Account created. If email confirmation is enabled, confirm your email, then sign in.");
          return;
        } else {
          const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
          if(error) throw error;
          await goAfterAuth();
          return;
        }
      }

      const { error } = await sb.auth.signInWithOtp({
        email: em,
        options: { emailRedirectTo: callbackUrl(), shouldCreateUser: (mode === "signup") }
      });
      if(error) throw error;

      if(otpVerify) otpVerify.style.display = "block";
      if(otpHint) otpHint.style.display = "none";
      show("OTP sent. Enter the OTP from your email to verify.");
      if(otpCode) otpCode.focus();

    }catch(err){
      show(err?.message || "Something went wrong.");
    }
  });

  if(btnVerify){
    btnVerify.addEventListener("click", async ()=>{
      const em = String(emailEl.value||"").trim().toLowerCase();
      const code = String(otpCode.value||"").trim();
      if(!em){ show("Enter email"); return; }
      if(!code){ show("Enter OTP"); return; }

      try{
        show("Verifying…");
        const { error } = await sb.auth.verifyOtp({ email: em, token: code, type: "email" });
        if(error) throw error;
        await goAfterAuth();
      }catch(err){
        show(err?.message || "OTP verification failed.");
      }
    });
  }

  googleBtn.addEventListener("click", async ()=>{
    try{
      show("Opening Google…");
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl() }
      });
      if(error) throw error;
    }catch(err){
      show(err?.message || "Google sign-in failed.");
    }
  });

  setMode("signin");
  setMethod("password");
})();