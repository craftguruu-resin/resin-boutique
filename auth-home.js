/**
 * Homepage sign up / log in — email + 6-digit OTP (server: /api/guest-auth/*).
 * Set <html data-bill-api-base="http://127.0.0.1:3847"> to match your API (see vendor pages).
 */
(function () {
  "use strict";

  var SESSION_KEY = "cg_session_email";
  var GUEST_TOKEN_KEY = "craftguruGuestToken";

  var BILL_STATIC_SERVER_PORTS = {
    "5500": 1,
    "5501": 1,
    "8080": 1,
    "8888": 1,
    "3000": 1,
    "3001": 1,
    "5173": 1,
    "5174": 1,
    "4173": 1,
  };

  function billIsLoopbackHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function billIsStaticDevPageForEmptyBase() {
    try {
      var loc = window.location;
      if (!loc || loc.protocol === "file:") return true;
      var port = String(loc.port || (loc.protocol === "https:" ? "443" : "80"));
      if (BILL_STATIC_SERVER_PORTS[port]) return true;
      if (billIsLoopbackHost(loc.hostname)) return true;
    } catch (_) {}
    return false;
  }

  function isPrivateLanHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(h)) return false;
    var p = h.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    return false;
  }

  function getApiBase() {
    try {
      var v0 = document.documentElement.getAttribute("data-bill-api-base");
      if (v0 != null) {
        var t = String(v0).trim().replace(/\/+$/, "");
        if (
          t.length === 0 &&
          window.location &&
          window.location.protocol !== "file:" &&
          !billIsStaticDevPageForEmptyBase()
        ) {
          return String(window.location.origin).replace(/\/+$/, "");
        }
        if (t.length) {
          try {
            if (window.location && window.location.protocol !== "file:") {
              var ph = String(window.location.hostname || "").toLowerCase();
              var tl = t.toLowerCase();
              var cfgLocal = tl.indexOf("127.0.0.1") >= 0 || tl.indexOf("localhost") >= 0;
              var loop = ph === "localhost" || ph === "127.0.0.1" || ph === "[::1]";
              if (cfgLocal && !loop && !isPrivateLanHost(ph)) {
                t = "";
              }
            }
          } catch (_) {}
          if (t.length) return t;
        }
      }
    } catch (_) {}
    try {
      var po = document.documentElement.getAttribute("data-bill-api-port");
      var port = (po != null && String(po).trim()) || "3847";
      if (window.location && window.location.protocol !== "file:") {
        var loc = window.location;
        var lp = String(loc.port || (loc.protocol === "https:" ? "443" : "80"));
        if (lp !== port && (loc.hostname === "localhost" || loc.hostname === "127.0.0.1")) {
          return "http://127.0.0.1:" + port;
        }
        if (BILL_STATIC_SERVER_PORTS[lp]) {
          return "http://127.0.0.1:" + port;
        }
        return String(loc.origin).replace(/\/+$/, "");
      }
    } catch (_) {}
    return "http://127.0.0.1:3847";
  }

  function normalizeEmail(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase();
  }

  function postJson(url, body, cb) {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var json = null;
          if (text) {
            try {
              json = JSON.parse(text);
            } catch (_) {}
          }
          if (!res.ok) {
            var errMsg =
              (json && (json.error || json.message || json.detail)) ||
              res.statusText ||
              "Request failed";
            var err = new Error(errMsg);
            if (json && json.code) err.code = json.code;
            err.status = res.status;
            cb(err, null);
            return;
          }
          cb(null, json);
        });
      })
      .catch(function (err) {
        cb(err && err.message ? err : new Error("Network error"), null);
      });
  }

  function getSessionEmail() {
    try {
      return localStorage.getItem(SESSION_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function setSessionEmail(email) {
    try {
      if (email) localStorage.setItem(SESSION_KEY, normalizeEmail(email));
      else localStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  function setGuestToken(token) {
    try {
      if (token) localStorage.setItem(GUEST_TOKEN_KEY, token);
      else localStorage.removeItem(GUEST_TOKEN_KEY);
    } catch (_) {}
  }

  var els = {};

  function bindEls() {
    els.modal = document.getElementById("authModal");
    els.modalBackdrop = document.getElementById("authModalBackdrop");
    els.modalClose = document.getElementById("authModalClose");
    els.tabSignup = document.getElementById("authTabSignup");
    els.tabLogin = document.getElementById("authTabLogin");
    els.panelSignup = document.getElementById("authPanelSignup");
    els.panelLogin = document.getElementById("authPanelLogin");
    els.emailSu = document.getElementById("authEmailSignup");
    els.nameSu = document.getElementById("authNameSignup");
    els.otpSu = document.getElementById("authOtpSignup");
    els.msgSu = document.getElementById("authMsgSignup");
    els.btnOtpSu = document.getElementById("authSendOtpSignup");
    els.btnGoSu = document.getElementById("authSubmitSignup");
    els.emailLo = document.getElementById("authEmailLogin");
    els.otpLo = document.getElementById("authOtpLogin");
    els.msgLo = document.getElementById("authMsgLogin");
    els.btnOtpLo = document.getElementById("authSendOtpLogin");
    els.btnGoLo = document.getElementById("authSubmitLogin");
    els.signupBtn = document.getElementById("homeAuthSignup");
    els.loginBtn = document.getElementById("homeAuthLogin");
    els.logoutBtn = document.getElementById("homeAuthLogout");
    els.ordersLink = document.getElementById("homeAuthOrders");
    els.userLabel = document.getElementById("homeAuthUser");
  }

  function setMsg(el, text, tone) {
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.classList.toggle("auth-msg--ok", tone === "ok");
  }

  function setBtnBusy(btn, busy, busyLabel) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset._authBusy) btn.dataset._authLabel = btn.textContent;
      btn.dataset._authBusy = "1";
      btn.disabled = true;
      btn.textContent = busyLabel || "Please wait…";
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset._authLabel || btn.textContent;
      delete btn.dataset._authBusy;
      delete btn.dataset._authLabel;
    }
  }

  function closeCartDrawer() {
    var drawer = document.getElementById("cartDrawer");
    var backdrop = document.getElementById("cartBackdrop");
    if (!drawer || !backdrop || !drawer.classList.contains("is-open")) return;
    backdrop.classList.remove("is-open");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    setTimeout(function () {
      if (!drawer.classList.contains("is-open")) backdrop.hidden = true;
    }, 300);
  }

  function openAuth(mode) {
    if (!els.modal) return;
    closeCartDrawer();
    els.modal.removeAttribute("hidden");
    els.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    switchTab(mode || "signup");
  }

  function closeAuth() {
    if (!els.modal) return;
    els.modal.setAttribute("hidden", "hidden");
    els.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function switchTab(mode) {
    var su = mode === "signup";
    if (els.tabSignup) els.tabSignup.classList.toggle("is-active", su);
    if (els.tabLogin) els.tabLogin.classList.toggle("is-active", !su);
    if (els.panelSignup) els.panelSignup.classList.toggle("is-hidden", !su);
    if (els.panelLogin) els.panelLogin.classList.toggle("is-hidden", su);
  }

  function renderAuthBar() {
    var email = getSessionEmail();
    var hasToken = false;
    try {
      hasToken = !!localStorage.getItem(GUEST_TOKEN_KEY);
    } catch (_) {}
    var inAuth = !!email || hasToken;
    if (els.userLabel) {
      els.userLabel.textContent = email ? email : hasToken ? "Signed in" : "";
      els.userLabel.classList.toggle("is-hidden", !inAuth);
    }
    if (els.signupBtn) els.signupBtn.classList.toggle("is-hidden", inAuth);
    if (els.loginBtn) els.loginBtn.classList.toggle("is-hidden", inAuth);
    if (els.logoutBtn) els.logoutBtn.classList.toggle("is-hidden", !inAuth);
    if (els.ordersLink) els.ordersLink.classList.toggle("is-hidden", !inAuth);
  }

  function boot() {
    bindEls();
    renderAuthBar();

    if (els.signupBtn) els.signupBtn.addEventListener("click", function () { openAuth("signup"); });
    if (els.loginBtn) els.loginBtn.addEventListener("click", function () { openAuth("login"); });
    if (els.logoutBtn) {
      els.logoutBtn.addEventListener("click", function () {
        setSessionEmail("");
        setGuestToken("");
        if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogout === "function") {
          window.RESIN_CART.onAccountLogout();
        }
        renderAuthBar();
      });
    }
    if (els.modal) {
      if (els.modalBackdrop) els.modalBackdrop.addEventListener("click", closeAuth);
      if (els.modalClose) els.modalClose.addEventListener("click", closeAuth);
      if (els.tabSignup) els.tabSignup.addEventListener("click", function () { switchTab("signup"); });
      if (els.tabLogin) els.tabLogin.addEventListener("click", function () { switchTab("login"); });
    }

    var base = getApiBase();

    (function hydrateFromGuestToken() {
      var tok = "";
      try {
        tok = localStorage.getItem(GUEST_TOKEN_KEY) || "";
      } catch (_) {}
      if (!tok) return;
      fetch(base + "/api/guest/me", {
        headers: { Authorization: "Bearer " + tok },
        cache: "no-store",
      })
        .then(function (res) {
          if (res.status === 401) {
            setGuestToken("");
            setSessionEmail("");
            renderAuthBar();
            return null;
          }
          return res.text().then(function (text) {
            try {
              return JSON.parse(text);
            } catch (_) {
              return null;
            }
          });
        })
        .then(function (j) {
          if (j && j.ok && j.email) setSessionEmail(normalizeEmail(j.email));
          renderAuthBar();
        })
        .catch(function () {
          renderAuthBar();
        });
    })();

    var gEl = document.getElementById("homeGoogleSignIn");
    if (gEl && window.CRAFT_GOOGLE_SIGNIN && CRAFT_GOOGLE_SIGNIN.isConfigured()) {
      CRAFT_GOOGLE_SIGNIN.bootstrap(function (credential) {
        setMsg(els.msgSu, "");
        setMsg(els.msgLo, "");
        postJson(base + "/api/guest-auth/google/session", { credential: credential }, function (err, json) {
          if (err) {
            setMsg(els.msgSu, err.message || "Google sign-in failed.");
            if (els.msgLo) setMsg(els.msgLo, err.message || "Google sign-in failed.");
            return;
          }
          var em = json && json.email ? normalizeEmail(json.email) : "";
          if (json && json.token) setGuestToken(json.token);
          if (em) setSessionEmail(em);
          if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogin === "function") {
            window.RESIN_CART.onAccountLogin();
          }
          if (window.CRAFT_AUTH_DB && window.CRAFT_AUTH_DB.putUser) {
            window.CRAFT_AUTH_DB.putUser({ email: em, name: "", createdAt: Date.now() }, function () {
              renderAuthBar();
              closeAuth();
            });
          } else {
            renderAuthBar();
            closeAuth();
          }
        });
      });
      CRAFT_GOOGLE_SIGNIN.renderButton(gEl, { width: 280 });
    }

    if (els.btnOtpSu) {
      els.btnOtpSu.addEventListener("click", function () {
        setMsg(els.msgSu, "");
        var em = normalizeEmail(els.emailSu && els.emailSu.value);
        if (!em || em.indexOf("@") < 1) {
          setMsg(els.msgSu, "Enter a valid email address.");
          return;
        }
        setBtnBusy(els.btnOtpSu, true, "Sending…");
        postJson(base + "/api/guest-auth/signup/request-otp", { email: em, name: (els.nameSu && els.nameSu.value) || "" }, function (err, json) {
          setBtnBusy(els.btnOtpSu, false);
          if (err) {
            if (err.status === 409 || err.code === "USE_LOGIN") {
              setMsg(els.msgSu, err.message || "This email is already registered. Use Log in.");
              return;
            }
            setMsg(els.msgSu, err.message || "Could not send code.");
            return;
          }
          var hint = json && json.devMailSkipped ? " (code is in the API server console if SMTP is off)" : "";
          setMsg(els.msgSu, "Enter the 6-digit code sent to your email. It expires in 5 minutes." + hint, "ok");
        });
      });
    }

    if (els.btnGoSu) {
      els.btnGoSu.addEventListener("click", function () {
        setMsg(els.msgSu, "");
        var em = normalizeEmail(els.emailSu && els.emailSu.value);
        var otp = String((els.otpSu && els.otpSu.value) || "").replace(/\D/g, "").slice(0, 6);
        if (!em || em.indexOf("@") < 1 || otp.length !== 6) {
          setMsg(els.msgSu, "Enter your email and the 6-digit code.");
          return;
        }
        setBtnBusy(els.btnGoSu, true, "Verifying…");
        postJson(
          base + "/api/guest-auth/signup/verify",
          { email: em, code: otp, name: (els.nameSu && els.nameSu.value) || "" },
          function (err, json) {
            if (err) {
              setBtnBusy(els.btnGoSu, false);
              if (err.status === 409 || err.code === "USE_LOGIN") {
                setMsg(els.msgSu, err.message || "This email is already registered. Use Log in.");
                return;
              }
              setMsg(els.msgSu, err.message || "Verification failed.");
              return;
            }
            if (json && json.token) setGuestToken(json.token);
            setSessionEmail(em);
            if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogin === "function") {
              window.RESIN_CART.onAccountLogin();
            }
            function finishSignupUi() {
              setBtnBusy(els.btnGoSu, false);
              renderAuthBar();
              closeAuth();
            }
            if (window.CRAFT_AUTH_DB && window.CRAFT_AUTH_DB.putUser) {
              window.CRAFT_AUTH_DB.putUser(
                { email: em, name: (els.nameSu && els.nameSu.value) || "", createdAt: Date.now() },
                function () {
                  finishSignupUi();
                }
              );
            } else {
              finishSignupUi();
            }
          }
        );
      });
    }

    if (els.btnOtpLo) {
      els.btnOtpLo.addEventListener("click", function () {
        setMsg(els.msgLo, "");
        var em = normalizeEmail(els.emailLo && els.emailLo.value);
        if (!em || em.indexOf("@") < 1) {
          setMsg(els.msgLo, "Enter a valid email address.");
          return;
        }
        setBtnBusy(els.btnOtpLo, true, "Sending…");
        postJson(base + "/api/guest-auth/login/request-otp", { email: em }, function (err) {
          setBtnBusy(els.btnOtpLo, false);
          if (err) {
            setMsg(els.msgLo, err.message || "Could not send code.");
            return;
          }
          setMsg(els.msgLo, "Enter the 6-digit code from your email (valid for 5 minutes).", "ok");
        });
      });
    }

    if (els.btnGoLo) {
      els.btnGoLo.addEventListener("click", function () {
        setMsg(els.msgLo, "");
        var em = normalizeEmail(els.emailLo && els.emailLo.value);
        var otp = String((els.otpLo && els.otpLo.value) || "").replace(/\D/g, "").slice(0, 6);
        if (!em || em.indexOf("@") < 1 || otp.length !== 6) {
          setMsg(els.msgLo, "Enter your email and the 6-digit code.");
          return;
        }
        setBtnBusy(els.btnGoLo, true, "Verifying…");
        postJson(base + "/api/guest-auth/login/verify", { email: em, code: otp }, function (err, json) {
          setBtnBusy(els.btnGoLo, false);
          if (err) {
            setMsg(els.msgLo, err.message || "Verification failed.");
            return;
          }
          if (json && json.token) setGuestToken(json.token);
          setSessionEmail(em);
          if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogin === "function") {
            window.RESIN_CART.onAccountLogin();
          }
          renderAuthBar();
          closeAuth();
          if (window.CRAFT_AUTH_DB && window.CRAFT_AUTH_DB.getUser && window.CRAFT_AUTH_DB.putUser) {
            window.CRAFT_AUTH_DB.getUser(em, function (e2, user) {
              var name = (user && user.name) || "";
              var createdAt = (user && user.createdAt) || Date.now();
              window.CRAFT_AUTH_DB.putUser({ email: em, name: name, createdAt: createdAt }, function () {});
            });
          }
        });
      });
    }

    document.addEventListener(
      "keydown",
      function (e) {
        if (e.key !== "Escape") return;
        if (els.modal && !els.modal.hasAttribute("hidden")) {
          e.preventDefault();
          closeAuth();
        }
      },
      true
    );
  }

  window.CRAFT_AUTH_HOME = {
    boot: boot,
    getSessionEmail: getSessionEmail,
    getApiBase: getApiBase,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
