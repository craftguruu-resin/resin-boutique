(function () {
  "use strict";

  var TOKEN_KEY = "craftguruVendorToken";
  var STATIC_DEV_PORTS = {
    "3000": 1,
    "3001": 1,
    "4200": 1,
    "4321": 1,
    "5000": 1,
    "5500": 1,
    "5501": 1,
    "5502": 1,
    "8080": 1,
    "8081": 1,
    "8888": 1,
    "5173": 1,
    "5174": 1,
    "4173": 1,
    "6274": 1,
  };

  function isLoopbackHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  /** Live Server often opens as http://192.168.x.x:5500 — not loopback, but still not the Node API. */
  function isPrivateLanHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(h)) return false;
    var p = h.split(".").map(function (x) {
      return Number(x);
    });
    if (p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    return false;
  }

  /** Vendor + checkout HTML is usually served by Live Server / Vite, not Express — API is on another port. */
  function isApiConsumerShellPage() {
    try {
      var p = (window.location.pathname || "").replace(/\\/g, "/").split("/").pop() || "";
      p = String(p).split("?")[0].toLowerCase();
      if (!p) return false;
      if (
        p === "checkout.html" ||
        p === "vendororder.html" ||
        p === "vendor-portal.html" ||
        p === "vendor-products-manage.html" ||
        p === "vendor-hero.html" ||
        p === "vendor-raw-materials.html"
      ) {
        return true;
      }
      if (p.indexOf("vendor-") !== 0) return false;
      if (p.slice(-5) === ".html") return true;
      return p.indexOf(".") === -1 && p.length > 7;
    } catch (_) {
      return false;
    }
  }

  function apiPortOverride() {
    try {
      var v = document.documentElement.getAttribute("data-bill-api-port");
      if (v != null && String(v).trim()) {
        var n = parseInt(String(v).trim(), 10);
        if (Number.isFinite(n) && n > 0 && n < 65536) return String(n);
      }
    } catch (_) {}
    try {
      var ls = localStorage.getItem("craftguruBillApiPort");
      if (ls != null && String(ls).trim()) {
        var n2 = parseInt(String(ls).trim(), 10);
        if (Number.isFinite(n2) && n2 > 0 && n2 < 65536) return String(n2);
      }
    } catch (_) {}
    return "";
  }

  function apiBase() {
    var configuredBase = "";
    try {
      var v0 = document.documentElement.getAttribute("data-bill-api-base");
      if (v0 != null) configuredBase = String(v0).trim().replace(/\/+$/, "");
    } catch (_) {}
    /** Shipped HTML defaults to localhost API; on Render/production use this page's origin instead. */
    try {
      if (configuredBase.length && window.location && window.location.protocol !== "file:") {
        var cb = configuredBase.toLowerCase();
        var cfgLocal = cb.indexOf("127.0.0.1") >= 0 || cb.indexOf("localhost") >= 0;
        var pageHost = String(window.location.hostname || "").toLowerCase();
        if (cfgLocal && !isLoopbackHost(pageHost) && !isPrivateLanHost(pageHost)) {
          configuredBase = "";
        }
      }
    } catch (_) {}

    var po = apiPortOverride() || "3847";
    try {
      if (window.location && window.location.protocol !== "file:") {
        var loc = window.location;
        var port = String(loc.port || (loc.protocol === "https:" ? "443" : "80"));
        if (STATIC_DEV_PORTS[port] && po === port) {
          po = "3847";
        }
        if (isApiConsumerShellPage() && port === po && (isLoopbackHost(loc.hostname) || isPrivateLanHost(loc.hostname))) {
          return String(loc.origin).replace(/\/+$/, "");
        }
        if (isApiConsumerShellPage() && port !== po) {
          if (isLoopbackHost(loc.hostname)) {
            return "http://127.0.0.1:" + po;
          }
          if (isPrivateLanHost(loc.hostname)) {
            return "http://" + loc.hostname + ":" + po;
          }
          if (STATIC_DEV_PORTS[port]) {
            return "http://127.0.0.1:" + po;
          }
        }
        if (configuredBase.length) return configuredBase;
        return String(loc.origin).replace(/\/+$/, "");
      }
    } catch (_) {}

    if (configuredBase.length) return configuredBase;
    var pOnly = apiPortOverride();
    if (pOnly) return "http://127.0.0.1:" + pOnly;
    return "http://127.0.0.1:3847";
  }

  /** Use root-relative /api/... when this page is already served from the API origin (avoids localhost vs 127.0.0.1 mismatches). */
  function vendorApiUrl(path) {
    var p = String(path || "");
    if (!p.startsWith("/")) p = "/" + p;
    var base = String(apiBase() || "").replace(/\/+$/, "");
    try {
      if (window.location && window.location.protocol !== "file:") {
        var o = String(window.location.origin || "").replace(/\/+$/, "");
        if (o && o === base) return p;
      }
    } catch (_) {}
    return base + p;
  }

  function getToken() {
    var t = "";
    try {
      t = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
    } catch (_) {
      try {
        t = sessionStorage.getItem(TOKEN_KEY) || "";
      } catch (_) {}
    }
    if (t) {
      try {
        localStorage.setItem(TOKEN_KEY, t);
      } catch (_) {}
      try {
        sessionStorage.setItem(TOKEN_KEY, t);
      } catch (_) {}
    }
    return t;
  }

  function setToken(t) {
    var v = t || "";
    try {
      localStorage.setItem(TOKEN_KEY, v);
    } catch (_) {}
    try {
      sessionStorage.setItem(TOKEN_KEY, v);
    } catch (_) {}
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
  }

  /** Same-directory vendor HTML links (works with Live Server, Express, and subpaths). */
  function vendorPageHref(filename) {
    try {
      return new URL(String(filename || "").replace(/^\//, ""), window.location.href).href;
    } catch (_) {
      return String(filename || "");
    }
  }

  /** When not signed in, open the dashboard first; optional return to another vendor page after login. */
  function vendorDashboardLoginUrl(optNextFilename) {
    var next = String(optNextFilename || "").trim();
    if (!next) {
      try {
        next = (window.location.pathname || "").split("/").pop() || "";
      } catch (_) {
        next = "";
      }
    }
    next = next.split("/").pop().split("?")[0];
    var dash = vendorPageHref("vendor-dashboard.html");
    if (!next || next === "vendor-dashboard.html") return dash;
    if (next.indexOf("vendor-") !== 0 || !/\.html$/i.test(next)) return dash;
    return dash + "?vendorNext=" + encodeURIComponent(next);
  }

  function mergeBillSecretInto(headers) {
    var h = headers || {};
    try {
      var sec = document.documentElement.getAttribute("data-bill-api-secret");
      if (sec != null && String(sec).trim()) {
        h["x-bill-api-secret"] = String(sec).trim();
      }
    } catch (_) {}
    return h;
  }

  function authHeaders() {
    var t = getToken();
    var h = mergeBillSecretInto({});
    if (t) {
      h.Authorization = "Bearer " + t;
      h["x-vendor-token"] = t;
    }
    return h;
  }

  /** Avoid stale HTTP cache (some browsers cache GET + auth oddly across navigations). */
  function vendorFetch(url, init) {
    var o = init ? Object.assign({}, init) : {};
    if (o.cache == null) o.cache = "no-store";
    return fetch(url, o);
  }

  /** After a vendor API returns 401, call this to produce a clearer error (rejects). */
  function explainVendor401(base) {
    return vendorFetch(base + "/api/vendor/status")
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .then(function (meta) {
        if (meta && meta.vendorAuthRequired) {
          throw new Error(
            "Vendor login required (server has vendor auth on — e.g. Render with RENDER=true, or VENDOR_REQUIRE_AUTH=1). Sign in on the vendor page, then return here."
          );
        }
        if (meta && meta.billSecretConfigured) {
          throw new Error(
            "The API rejected the request (HTTP 401). The server has BILL_API_SECRET set — add the same value as data-bill-api-secret on this page's <html> tag (match checkout.html), then hard refresh."
          );
        }
        throw new Error(
          "HTTP 401 while vendor login is optional — wrong API URL (data-bill-api-port / data-bill-api-base), a proxy, or a stale cache. Hard refresh (Cmd+Shift+R) and confirm npm start in server/."
        );
      });
  }

  function parseApiJson(res) {
    return res.text().then(function (text) {
      var trimmed = String(text || "").trim();
      if (trimmed.charAt(0) === "<") {
        throw new Error(
          "The API returned HTML instead of JSON (HTTP " +
            res.status +
            "). The browser is still calling the wrong host (often Live Server on :5500, or http://192.168.x.x:5500). From server/ run npm start, then hard-refresh this page (Cmd+Shift+R). Prefer opening vendor pages from http://127.0.0.1:3847/vendor-inventory.html so HTML and API match. In the console run: CraftguruVendor.apiBase() — it should print http://127.0.0.1:3847 (or your LAN IP on the API port). Override with data-bill-api-base on <html> if needed."
        );
      }
      var j = {};
      if (trimmed) {
        try {
          j = JSON.parse(trimmed);
        } catch (_) {
          throw new Error("Server did not return valid JSON.");
        }
      }
      return { status: res.status, okHttp: res.ok, json: j };
    });
  }

  function doLogin(username, password) {
    var base = apiBase();
    var u = String(username || "").trim();
    var pw = String(password || "").trim();
    return vendorFetch(vendorApiUrl("/api/vendor/login"), {
      method: "POST",
      headers: mergeBillSecretInto({ "Content-Type": "application/json" }),
      body: JSON.stringify({ username: u, password: pw }),
    })
      .catch(function () {
        throw new Error(
          "Cannot reach the API at " +
            base +
            ". From the server folder run: npm start. If the vendor page uses Live Server on another port, CORS is relaxed for localhost in dev; ensure the API is running on the port in data-bill-api-port or default 3847."
        );
      })
      .then(function (res) {
        return parseApiJson(res).then(function (x) {
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Sign-in failed");
          return x.json.token;
        });
      });
  }

  function injectSidebar() {
    var nav = String(
      (document.body && document.body.getAttribute("data-vendor-nav")) || "dashboard"
    );
    var mount = document.getElementById("vsSidebarMount");
    if (!mount) return;
    function link(key, href, label, icon) {
      var active = nav === key ? " vs-nav__link--active" : "";
      return (
        "<li class='vs-nav__item'><a class='vs-nav__link" +
        active +
        "' href='" +
        href +
        "'><span class='vs-nav__ico' aria-hidden='true'>" +
        icon +
        "</span>" +
        label +
        "</a></li>"
      );
    }
    mount.innerHTML =
      "<aside class='vs-sidebar' role='navigation' aria-label='Vendor'>" +
      "<div class='vs-sidebar__brand'>" +
      "<a class='vs-sidebar__logo' href='" +
      vendorPageHref("index.html") +
      "'><img class='vs-sidebar__logo-img' src='" +
      vendorPageHref("media/brand-craftguru.png") +
      "' width='200' height='60' alt='Craftguru' decoding='async' /></a>" +
      "<p class='vs-sidebar__sub'>Studio vendor</p></div>" +
      "<ul class='vs-nav'>" +
      link("dashboard", vendorPageHref("vendor-dashboard.html"), "Dashboard", "▣") +
      link("tags", vendorPageHref("vendor-tags.html"), "Orders &amp; tags", "◇") +
      link("inventory", vendorPageHref("vendor-inventory.html"), "Inventory", "◫") +
      link("products", vendorPageHref("vendor-products-manage.html"), "Products", "✎") +
      link("hero", vendorPageHref("vendor-hero.html"), "Hero images", "◎") +
      link("raw", vendorPageHref("vendor-raw-materials.html"), "Raw materials", "◆") +
      link("returns", vendorPageHref("vendor-returns.html"), "Returns", "↩") +
      "</ul>" +
      "<div class='vs-sidebar__foot'>" +
      "<a href='#' id='vsVendorSignOut'>Sign out</a> · <a href='" +
      vendorPageHref("index.html") +
      "'>Storefront</a> · Parcel tags match checkout guidance." +
      "</div></aside>";
    try {
      var so = document.getElementById("vsVendorSignOut");
      if (so) {
        so.addEventListener("click", function (e) {
          e.preventDefault();
          clearToken();
          location.reload();
        });
      }
    } catch (_) {}
  }

  /** Vendor HTML pages that load this script (not checkout). */
  function isVendorPortalPage() {
    try {
      var p = (window.location.pathname || "").replace(/\\/g, "/").split("/").pop() || "";
      p = String(p).split("?")[0].toLowerCase();
      return p.indexOf("vendor-") === 0 && p.slice(-5) === ".html";
    } catch (_) {
      return false;
    }
  }

  function ensureVendorAuthGate() {
    if (!isVendorPortalPage()) return;
    if (document.getElementById("vsVendorAuthGate")) return;

    function hideGate() {
      try {
        document.documentElement.classList.remove("vs-html--vendor-locked");
      } catch (_) {}
      try {
        document.body.classList.remove("vs-body--vendor-locked");
      } catch (_) {}
      var g = document.getElementById("vsVendorAuthGate");
      if (g) g.remove();
    }

    function showGate(networkErr) {
      if (document.getElementById("vsVendorAuthGate")) return;
      try {
        document.documentElement.classList.add("vs-html--vendor-locked");
      } catch (_) {}
      try {
        document.body.classList.add("vs-body--vendor-locked");
      } catch (_) {}
      var wrap = document.createElement("div");
      wrap.id = "vsVendorAuthGate";
      wrap.className = "vs-auth-gate";
      wrap.setAttribute("role", "dialog");
      wrap.setAttribute("aria-modal", "true");
      wrap.setAttribute("aria-labelledby", "vsVendorAuthTitle");
      wrap.innerHTML =
        "<div class='vs-auth-gate__panel vs-card'>" +
        "<h1 id='vsVendorAuthTitle' class='vs-auth-gate__title'>Vendor sign-in</h1>" +
        "<p class='vs-auth-gate__hint'>Use the username and password configured on the server (e.g. Render: VENDOR_PORTAL_USER / VENDOR_PORTAL_PASSWORD).</p>" +
        "<p class='vs-auth-gate__err' id='vsVendorAuthErr' role='alert'></p>" +
        "<form class='vs-auth-gate__form' id='vsVendorAuthForm' autocomplete='on'>" +
        "<label class='vs-field'><span class='vs-field__lab'>Username</span>" +
        "<input class='vs-input' type='text' name='username' id='vsVendorAuthUser' autocomplete='username' required /></label>" +
        "<label class='vs-field'><span class='vs-field__lab'>Password</span>" +
        "<input class='vs-input' type='password' name='password' id='vsVendorAuthPass' autocomplete='current-password' required /></label>" +
        "<button type='submit' class='vs-btn vs-btn--primary' id='vsVendorAuthSubmit'>Sign in</button>" +
        "</form></div>";
      document.body.appendChild(wrap);
      var errEl = document.getElementById("vsVendorAuthErr");
      if (errEl && networkErr) errEl.textContent = String(networkErr);

      document.getElementById("vsVendorAuthForm").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var u = document.getElementById("vsVendorAuthUser");
        var pw = document.getElementById("vsVendorAuthPass");
        var btn = document.getElementById("vsVendorAuthSubmit");
        var err = document.getElementById("vsVendorAuthErr");
        if (err) err.textContent = "";
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Signing in…";
        }
        doLogin(u && u.value, pw && pw.value)
          .then(function (tok) {
            setToken(tok);
            hideGate();
            location.reload();
          })
          .catch(function (e) {
            if (err) err.textContent = (e && e.message) || "Sign-in failed";
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Sign in";
            }
          });
      });
    }

    vendorFetch(vendorApiUrl("/api/vendor/status"))
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .then(function (meta) {
        if (!meta || !meta.vendorAuthRequired) {
          hideGate();
          return;
        }
        return vendorFetch(vendorApiUrl("/api/vendor/session"), { headers: authHeaders() }).then(function (r) {
          if (r.status === 200) {
            hideGate();
            return;
          }
          showGate();
        });
      })
      .catch(function () {
        showGate("Cannot reach the API at " + apiBase() + ". Start the server (npm start in server/) or fix data-bill-api-base / port.");
      });
  }

  window.CraftguruVendor = {
    TOKEN_KEY: TOKEN_KEY,
    apiBase: apiBase,
    vendorApiUrl: vendorApiUrl,
    vendorPageHref: vendorPageHref,
    vendorDashboardLoginUrl: vendorDashboardLoginUrl,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    authHeaders: authHeaders,
    vendorFetch: vendorFetch,
    explainVendor401: explainVendor401,
    doLogin: doLogin,
    parseApiJson: parseApiJson,
  };

  document.addEventListener("DOMContentLoaded", function () {
    injectSidebar();
    ensureVendorAuthGate();
  });
})();
