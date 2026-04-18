(function () {
  "use strict";

  var D = typeof window !== "undefined" ? window.RESIN_DATA : null;
  if (!D || typeof D.applyPriceOverrides !== "function") return;

  var STATIC_DEV_PORTS = { "5500": 1, "5501": 1, "8080": 1, "8888": 1, "3001": 1, "5173": 1, "5174": 1, "4173": 1 };

  function isPrivateLanHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(h)) return false;
    var p = h.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    return false;
  }

  function billApiPortOverride() {
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

  function billApiBase() {
    try {
      var v = document.documentElement.getAttribute("data-bill-api-base");
      if (v != null) {
        var t = String(v).trim().replace(/\/+$/, "");
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
      if (window.location && window.location.protocol !== "file:") {
        var loc = window.location;
        var port = loc.port || (loc.protocol === "https:" ? "443" : "80");
        if (STATIC_DEV_PORTS[port]) {
          return "http://127.0.0.1:" + (billApiPortOverride() || "3847");
        }
        return String(loc.origin).replace(/\/+$/, "");
      }
    } catch (_) {}
    var p = billApiPortOverride();
    if (p) return "http://127.0.0.1:" + p;
    return "http://127.0.0.1:3847";
  }

  function runMerge() {
    var base = billApiBase();
    if (!base) return Promise.resolve();
    return fetch(base + "/api/catalog/price-overrides", { cache: "no-store" })
      .then(function (res) {
        return res.json();
      })
      .then(function (j) {
        if (j && j.ok && j.overrides) {
          D.applyPriceOverrides(j.overrides);
        }
        return fetch(base + "/api/catalog/vendor-products", { cache: "no-store" })
          .then(function (r2) {
            return r2.json();
          })
          .then(function (j2) {
            if (j2 && j2.ok && j2.products && typeof D.applyVendorProductsMerge === "function") {
              D.applyVendorProductsMerge(j2.products);
            }
          })
          .catch(function () {});
      })
      .then(function () {
        try {
          window.dispatchEvent(new CustomEvent("craftguruCatalogPricesMerged"));
        } catch (_) {}
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runMerge);
  } else {
    runMerge();
  }

  window.CraftguruCatalogMerge = { refresh: runMerge };

  function wireCatalogRefreshControl() {
    var cartEl = document.getElementById("cartToggle");
    var host = cartEl && cartEl.parentElement;
    if (!host || document.getElementById("catalogSyncBtn")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "catalogSyncBtn";
    btn.className = "icon-btn catalog-sync-btn";
    btn.setAttribute("aria-label", "Refresh catalog prices from server");
    btn.title = "Refresh catalog";
    btn.textContent = "↻";
    btn.addEventListener("click", function () {
      btn.disabled = true;
      runMerge().finally(function () {
        btn.disabled = false;
      });
    });
    host.insertBefore(btn, cartEl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireCatalogRefreshControl);
  } else {
    wireCatalogRefreshControl();
  }
})();
