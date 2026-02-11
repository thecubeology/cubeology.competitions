(function () {
  // ---------- helpers ----------
  function byId(id) { return document.getElementById(id); }

  // Grab first existing element from multiple possible IDs (so code is resilient)
  function pickId(...ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  function normalizeEmail(v) { return String(v || "").trim().toLowerCase(); }
  function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function digitsOnly(v) { return String(v || "").replace(/\D+/g, ""); }

  function showMsg(text, type = "info") {
    const box = pickId("msg");
    if (!box) return;
    box.textContent = text || "";
    box.className = "authMsg " + type;
    box.style.display = text ? "block" : "none";
  }

  function needConfig() {
    if (!window.CB?.SUPABASE_URL || !window.CB?.SUPABASE_KEY) {
      showMsg("Config missing. Please check /js/config.js", "error");
      return false;
    }
    if (!window.supabase?.createClient) {
      showMsg("Supabase library failed to load (CDN).", "error");
      return false;
    }
    return true;
  }

  // ---------- init ----------
  if (!needConfig()) return;

  const sb = window.supabase.createClient(window.CB.SUPABASE_URL, (window.CB.SUPABASE_KEY || window.CB.SUPABASE_ANON_KEY));

  // Match your login.html IDs (and keep compatibility with older IDs too)
  const form = pickId("formPassword", "authForm");
  const emailInput = pickId("email");
  const passWrap = pickId("passwordField");
  const passInput = pickId("password");
  const otpBox = pickId("otpBox");
  const otpCode = pickId("otpCode");
  const title = pickId("title");
  const subtitle = pickId("subtitle");

  const primaryBtn = pickId("primaryBtn", "btnPrimary");
  const secondaryBtn = pickId("secondaryBtn", "btnSecondary");
  const toggleOtp = pickId("toggleOtp");
  const switchText = pickId("switchText");
  const resendOtpBtn = pickId("resendOtpBtn", "btnResendOtp");
  const otpStatusHint = pickId("otpStatusHint");
  const btnGoogle = pickId("btnGoogle");

  let mode = "signin"; // signin | signup
  let otpMode = false;
  let resendTimer = null;
  let otpSentAt = 0;

  // ---------- UI state ----------
  function setLoading(on) {
    if (primaryBtn) primaryBtn.disabled = !!on;
    if (secondaryBtn) secondaryBtn.disabled = !!on;
    if (toggleOtp) toggleOtp.disabled = !!on;
    if (resendOtpBtn) resendOtpBtn.disabled = !!on;
    if (emailInput) emailInput.disabled = !!on;
    if (passInput) passInput.disabled = !!on;
    if (otpCode) otpCode.disabled = !!on;
    if (btnGoogle) btnGoogle.disabled = !!on;
  }

  function stopResendTimer() {
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = null;
    if (resendOtpBtn) {
      resendOtpBtn.disabled = true;
      resendOtpBtn.textContent = "Resend OTP (60s)";
    }
  }

  function startResendTimer() {
    otpSentAt = Date.now();
    if (resendOtpBtn) resendOtpBtn.disabled = true;

    if (resendTimer) clearInterval(resendTimer);

    resendTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - otpSentAt) / 1000);
      const left = Math.max(0, 60 - elapsed);

      if (resendOtpBtn) {
        resendOtpBtn.textContent = left > 0 ? `Resend OTP (${left}s)` : "Resend OTP";
        resendOtpBtn.disabled = left > 0;
      }

      if (left <= 0) {
        clearInterval(resendTimer);
        resendTimer = null;
      }
    }, 250);
  }

 function refreshLabels() {
  if (!primaryBtn) return;

  // 🔹 SIGN UP MODE → hide secondary button completely
  if (mode === "signup") {
    primaryBtn.textContent = "Create Account";
    if (secondaryBtn) secondaryBtn.style.display = "none";
    return;
  }

  // 🔹 SIGN IN MODE
  if (secondaryBtn) secondaryBtn.style.display = "block";

  if (!otpMode) {
    primaryBtn.textContent = "Sign in";
    if (secondaryBtn) secondaryBtn.textContent = "Forgot password?";
    return;
  }

  const code = digitsOnly(otpCode?.value || "");
  primaryBtn.textContent = (code.length === 6) ? "Verify OTP" : "Continue";
  if (secondaryBtn) secondaryBtn.textContent = "Back";
}


  function setOtpMode(on) {
    otpMode = !!on;

    // show/hide panels
    if (otpBox) otpBox.style.display = otpMode ? "block" : "none";
    if (passWrap) passWrap.style.display = otpMode ? "none" : "block";

    // required fields
    if (passInput) passInput.required = !otpMode;
    if (otpCode) otpCode.required = false;

    // toggle text
    if (switchText) switchText.textContent = otpMode ? "Use password instead?" : "Use OTP / login link instead?";
    if (toggleOtp) toggleOtp.textContent = otpMode ? "Use Password" : "Use OTP";

    if (otpMode) {
      showMsg("", "info");
      if (otpStatusHint) otpStatusHint.textContent = "After you click Continue, we’ll send an email link + OTP automatically.";
      setTimeout(() => otpCode?.focus(), 50);
    } else {
      if (otpCode) otpCode.value = "";
      stopResendTimer();
    }

    refreshLabels();
  }

  function setTabs(newMode) {
    mode = newMode;

    // highlight tabs
    document.querySelectorAll("[data-mode]").forEach((b) => {
      b.classList.toggle("on", b.dataset.mode === mode);
    });

    if (title) title.textContent = (mode === "signup") ? "Sign up" : "Sign in";
    if (subtitle) {
      subtitle.textContent = (mode === "signup")
        ? "Create your account using password. OTP is available as a backup."
        : "Use password as primary. OTP / login link is available as a backup option.";
    }

    // If user is on signup, force password mode (OTP signup gets confusing)
    if (mode === "signup") setOtpMode(false);

    refreshLabels();
    showMsg("", "info");
  }

  // ---------- auth actions ----------
  async function sendOtp(email) {
    const redirectTo = `${location.origin}/auth/auth-callback.html`;

    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true }
    });

    if (error) throw error;

    startResendTimer();
    if (otpStatusHint) otpStatusHint.textContent = "OTP sent. Check Inbox/Spam. Enter the 6-digit code here or use the email link.";
    showMsg("OTP / login link sent. Please check your email.", "success");

    setTimeout(() => otpCode?.focus(), 80);
  }

  async function verifyOtp(email, token) {
    // Supabase supports OTP verification via type "email" for emailed OTP/link flows
    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    if (error) throw error;

    showMsg("Login successful. Redirecting…", "success");
    location.replace("/auth/auth-callback.html");
  }

  async function passwordSignIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    showMsg("Login successful. Redirecting…", "success");
    location.replace("/auth/auth-callback.html");
  }

  async function passwordSignUp(email, password) {
    const redirectTo = `${location.origin}/auth/auth-callback.html`;

    const { error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo }
    });

    if (error) throw error;

    showMsg("Account created. Please check your email to confirm (if enabled), then sign in.", "success");
  }

  async function googleSignIn() {
    const redirectTo = `${location.origin}/auth/auth-callback.html`;

    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });

    if (error) throw error;
  }

  // ---------- events ----------
  // Tabs (Sign in / Sign up)
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setTabs(btn.dataset.mode));
  });

  // Toggle OTP <-> Password
  if (toggleOtp) {
    toggleOtp.addEventListener("click", () => setOtpMode(!otpMode));
  }

  // OTP input digits only
  if (otpCode) {
    otpCode.addEventListener("input", () => {
      otpCode.value = digitsOnly(otpCode.value).slice(0, 6);
      refreshLabels();
    });
  }

  // Secondary button: forgot password OR back
  if (secondaryBtn) {
    secondaryBtn.addEventListener("click", async () => {
      if (otpMode) {
        setOtpMode(false);
        showMsg("", "info");
        return;
      }

      // Keep it simple: push user to OTP (since reset flow needs a separate update-password page)
      showMsg("Use OTP mode to log in if you forgot your password.", "info");
      setOtpMode(true);
    });
  }

  // Resend OTP
  if (resendOtpBtn) {
    resendOtpBtn.addEventListener("click", async () => {
      const email = normalizeEmail(emailInput?.value);
      if (!isValidEmail(email)) return showMsg("Please enter a valid email first.", "error");

      try {
        setLoading(true);
        await sendOtp(email);
      } catch (e) {
        showMsg(e?.message || "Failed to resend OTP.", "error");
      } finally {
        setLoading(false);
        refreshLabels();
      }
    });
  }

  // Google
  if (btnGoogle) {
    btnGoogle.addEventListener("click", async () => {
      try {
        showMsg("", "info");
        setLoading(true);
        await googleSignIn();
      } catch (e) {
        showMsg(e?.message || "Google sign-in failed.", "error");
      } finally {
        setLoading(false);
      }
    });
  }

  // Form submit
  if (form) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();

      const email = normalizeEmail(emailInput?.value);
      if (!isValidEmail(email)) return showMsg("Please enter a valid email.", "error");

      try {
        showMsg("", "info");
        setLoading(true);

        if (!otpMode) {
          const pw = String(passInput?.value || "");
          if (pw.length < 6) return showMsg("Password should be at least 6 characters.", "error");

          if (mode === "signup") await passwordSignUp(email, pw);
          else await passwordSignIn(email, pw);
          return;
        }

        // OTP mode
        const code = digitsOnly(otpCode?.value || "");
        if (code.length !== 6) {
          // Continue: auto-send OTP/link
          await sendOtp(email);
          refreshLabels();
          return;
        }

        // Verify
        await verifyOtp(email, code);
      } catch (e) {
        showMsg(e?.message || "Something went wrong.", "error");
      } finally {
        setLoading(false);
        refreshLabels();
      }
    });
  }

  // ---------- initial ----------
  setTabs("signin");
  setOtpMode(false);
  refreshLabels();

  // If already logged in, route through auth-callback (dashboard vs account logic happens there)
  (async () => {
    try {
      const { data } = await sb.auth.getUser();
      if (data?.user) location.replace("/auth/auth-callback.html");
    } catch (e) {
      // ignore
    }
  })();
})();
