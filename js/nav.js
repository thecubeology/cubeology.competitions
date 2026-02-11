(function () {
  // Inject NAV theme styles immediately to prevent flashes/uneven overrides
  (function injectNavTheme() {
    try {
      if (document.getElementById("cbNavThemeLock")) return;
      const style = document.createElement("style");
      style.id = "cbNavThemeLock";
      style.textContent = `
/* NAV THEME LOCK - HOME CLEAN (design-only)
   Applied inline to minimize flashes/uneven overrides across pages. */
.topbar{
  position: sticky !important;
  top: 0 !important;
  z-index: 1000 !important;
  background: rgba(255,255,255,0.82) !important;
  backdrop-filter: blur(12px) saturate(140%) !important;
  -webkit-backdrop-filter: blur(12px) saturate(140%) !important;
  border-bottom: 1px solid rgba(15,23,42,0.10) !important;
}
.topbar .container.nav{
  height: 64px !important;
  display:flex !important;
  align-items:center !important;
  justify-content:space-between !important;
  gap:14px !important;
}
.brand, .brand *{ color: rgba(15,23,42,0.92) !important; }

/* Desktop nav */
.navlinks{ display:flex !important; align-items:center !important; gap:14px !important; }
.navlinks a{
  color: rgba(15,23,42,0.78) !important;
  font-weight: 900 !important;
  letter-spacing: -0.01em !important;
}
.navlinks a.on{
  color: rgba(15,23,42,0.92) !important;
  background: rgba(15,23,42,0.04) !important;
  border: 1px solid rgba(15,23,42,0.10) !important;
  border-radius: 12px !important;
}

/* Store button consistency (dashboard was overriding) */
.navlinks .btn.primary,
.navlinks a.btn.primary{
  background: linear-gradient(90deg, rgba(37,99,235,1), rgba(109,40,217,1)) !important;
  border-color: transparent !important;
  color: #fff !important;
  box-shadow: 0 10px 18px rgba(37,99,235,0.18) !important;
}

/* Auth icon button: stand out */
#hdrAuthBtn.authIconBtn{
  width: 40px !important;
  height: 40px !important;
  padding: 0 !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  border-radius: 14px !important;
  border: 1px solid rgba(37,99,235,0.22) !important;
  background: linear-gradient(180deg, rgba(37,99,235,0.10), rgba(109,40,217,0.08)) !important;
  box-shadow: 0 10px 18px rgba(2,6,23,0.08) !important;
}
#hdrAuthBtn .authIcon{
  width: 20px !important;
  height: 20px !important;
  display:block !important;
  color: rgba(15,23,42,0.90) !important;
}

/* Mobile burger */
@media (min-width: 821px){
  .burgerBtn{ display:none !important; }
}
@media (max-width: 820px){
  .navlinks{ display:none !important; }
  .burgerBtn{
    display:inline-flex !important;
    width: 42px !important;
    height: 42px !important;
    padding: 0 !important;
    border-radius: 14px !important;
    border: 1px solid rgba(15,23,42,0.14) !important;
    background: rgba(255,255,255,0.86) !important;
    box-shadow: 0 10px 18px rgba(2,6,23,0.08) !important;
    align-items:center !important;
    justify-content:center !important;
  }
  .burgerIcon span{ background: rgba(15,23,42,0.86) !important; }

  /* Drawer: light (no dark burger menu) */
  .drawer{ background: rgba(255,255,255,0.92) !important; border-left: 1px solid rgba(15,23,42,0.12) !important; }
  .drawerOverlay{ background: rgba(2,6,23,0.32) !important; backdrop-filter: blur(6px) !important; -webkit-backdrop-filter: blur(6px) !important; }

  /* Make 'Menu' label dark */
  .drawerHeader, .drawerHeader *{ color: rgba(15,23,42,0.92) !important; }

  /* Drawer links */
  .drawerLinks a{
    background: rgba(255,255,255,0.92) !important;
    border: 1px solid rgba(15,23,42,0.10) !important;
    color: rgba(15,23,42,0.90) !important;
  }
  .drawerLinks a .hint{ color: rgba(15,23,42,0.60) !important; }

  /* Highlight Login/Dashboard item */
  #drawerAuthLink{
    background: linear-gradient(90deg, rgba(37,99,235,1), rgba(109,40,217,1)) !important;
    border-color: transparent !important;
    color: #fff !important;
  }
  #drawerAuthLink #drawerAuthText{ color:#fff !important; }
  #drawerAuthLink #drawerAuthHint, #drawerAuthLink .hint{ color: rgba(255,255,255,0.85) !important; }
}
      `.trim();

      const head = document.head || document.getElementsByTagName("head")[0];
      if (head && head.firstChild) head.insertBefore(style, head.firstChild);
      else if (head) head.appendChild(style);
    } catch (e) {}
  })();

  const body = document.body;

  /* ==============================
     BURGER / DRAWER LOGIC
  ============================== */
  const openBtn = document.querySelector("[data-nav-open]");
  const overlay = document.querySelector("[data-nav-overlay]");
  const closeBtn = document.querySelector("[data-nav-close]");
  const drawer = document.querySelector("[data-nav-drawer]");

  function openNav() {
    body.classList.add("nav-open");
    body.style.overflow = "hidden";
  }
  function closeNav() {
    body.classList.remove("nav-open");
    body.style.overflow = "";
  }

  if (openBtn && overlay && closeBtn && drawer) {
    openBtn.addEventListener("click", openNav);
    closeBtn.addEventListener("click", closeNav);
    overlay.addEventListener("click", closeNav);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeNav();
    });

    drawer.addEventListener("click", (e) => {
      if (e.target.closest("a")) closeNav();
    });
  }

  /* ==============================
     AUTH BUTTON IN HEADER + DRAWER
  ============================== */

  function loadSupabase() {
    return new Promise((resolve, reject) => {
      if (window.supabase?.createClient) return resolve();
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Desktop header icon
  function injectHeaderButton() {
    const navlinks = document.querySelector(".navlinks");
    if (!navlinks) return null;

    let btn = document.getElementById("hdrAuthBtn");
    if (btn) return btn;

    btn = document.createElement("a");
    btn.id = "hdrAuthBtn";
    btn.className = "authIconBtn navAuthBtn";
    btn.href = "/auth/login.html";
    btn.title = "Login";
    btn.setAttribute("aria-label", "Login");
    btn.innerHTML = `
      <svg class="authIcon" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 12c2.76 0 5-2.69 5-6s-2.24-6-5-6-5 2.69-5 6 2.24 6 5 6zm0 2c-4.42 0-8 3.13-8 7v1h16v-1c0-3.87-3.58-7-8-7z" fill="currentColor"/>
      </svg>
    `;
    navlinks.appendChild(btn);
    return btn;
  }

  // Mobile drawer link (inside burger menu)
  function injectDrawerLink() {
    const links = document.querySelector(".drawerLinks");
    if (!links) return null;

    let a = document.getElementById("drawerAuthLink");
    if (a) return a;

    a = document.createElement("a");
    a.id = "drawerAuthLink";
    a.href = "/auth/login.html";
    a.innerHTML = `<span id="drawerAuthText">Login</span><span class="hint" id="drawerAuthHint">Sign in</span>`;

    // Put it at TOP
    links.prepend(a);
    return a;
  }

  function setBtnState(btn, href, title, state) {
    if (!btn) return;
    btn.href = href;
    btn.title = title;
    btn.dataset.state = state || "";
    btn.setAttribute("aria-label", title);
  }

  function setDrawerState(a, href, text, hint) {
    if (!a) return;
    a.href = href;
    const t = a.querySelector("#drawerAuthText");
    const h = a.querySelector("#drawerAuthHint");
    if (t) t.textContent = text;
    if (h) h.textContent = hint;
    a.dataset.state = text.toLowerCase();
  }

  async function updateAuthTargets() {
    const hdrBtn = injectHeaderButton();
    const drwLink = injectDrawerLink();

    // defaults
    setBtnState(hdrBtn, "/auth/login.html", "Login", "loggedout");
    setDrawerState(drwLink, "/auth/login.html", "Login", "Sign in");

    if (!window.CB?.SUPABASE_URL || !window.CB?.SUPABASE_KEY) return;

    try {
      await loadSupabase();
    } catch (e) {
      return; // keep login
    }

    if (!window.supabase?.createClient) return;

    const supabase = window.supabase.createClient(
      window.CB.SUPABASE_URL,
      window.CB.SUPABASE_KEY
    );

    // 1) login status
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user || null;
    } catch (e) {
      user = null;
    }

    if (!user) return; // stay login

    const email = String(user.email || "").toLowerCase().trim();

    // signed in, but no email -> account
    if (!email) {
      setBtnState(hdrBtn, "/auth/account.html", "Account", "signedin");
      setDrawerState(drwLink, "/auth/account.html", "Account", "Manage linking");
      return;
    }

    // 2) linked?
    let pid = "";
    try {
      const { data: prof, error } = await supabase
        .from("profiles")
        .select("player_id")
        .eq("email", email)
        .maybeSingle();

      if (!error && prof?.player_id) pid = String(prof.player_id).trim();
    } catch (e) {
      pid = "";
    }

    if (pid) {
      setBtnState(hdrBtn, "/dashboard/", "Dashboard", "linked");
      setDrawerState(drwLink, "/dashboard/", "Dashboard", "Your private page");
    } else {
      setBtnState(hdrBtn, "/auth/account.html", "Account", "unlinked");
      setDrawerState(drwLink, "/auth/account.html", "Account", "Request linking");
    }
  }

  document.addEventListener("DOMContentLoaded", updateAuthTargets);
})();