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

  function dispatchCatalogEvent(name) {
    try {
      window.dispatchEvent(new CustomEvent(name));
    } catch (_) {}
  }

  var mergeInflight = null;
  var mergeFinished = false;
  var VENDOR_CACHE_KEY = "__cgVendorProductsCache";
  var OVERRIDES_CACHE_KEY = "__cgCatalogOverridesCache";
  var CACHE_TTL_MS = 5 * 60 * 1000;

  function readSessionJson(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function writeSessionJson(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function hydrateCatalogFromSessionCache() {
    var now = Date.now();
    var vendor = readSessionJson(VENDOR_CACHE_KEY);
    if (vendor && vendor.products && vendor.ts && now - vendor.ts < CACHE_TTL_MS) {
      if (typeof D.applyVendorProductsMerge === "function") {
        D.applyVendorProductsMerge(vendor.products);
      }
    }
    var ovWrap = readSessionJson(OVERRIDES_CACHE_KEY);
    if (ovWrap && ovWrap.overrides && ovWrap.ts && now - ovWrap.ts < CACHE_TTL_MS) {
      try {
        window.__cgCatalogOverrides = ovWrap.overrides;
      } catch (_) {}
      if (ovWrap.suppressed && ovWrap.suppressed.length && typeof D.applyCatalogSuppressions === "function") {
        try {
          window.__cgCatalogSuppressions = ovWrap.suppressed;
        } catch (_) {}
        D.applyCatalogSuppressions(ovWrap.suppressed);
      }
      if (typeof D.applyPriceOverrides === "function") {
        D.applyPriceOverrides(ovWrap.overrides);
      }
      if (typeof D.rebuildCategoryProductIndex === "function") {
        D.rebuildCategoryProductIndex();
      }
    }
  }

  hydrateCatalogFromSessionCache();

  function clearSessionCatalogCache() {
    try {
      sessionStorage.removeItem(VENDOR_CACHE_KEY);
      sessionStorage.removeItem(OVERRIDES_CACHE_KEY);
    } catch (_) {}
  }

  function runMerge(forceFresh) {
    if (mergeInflight) return mergeInflight;
    if (forceFresh) clearSessionCatalogCache();

    var base = billApiBase();
    if (!base) {
      mergeFinished = true;
      dispatchCatalogEvent("craftguruCatalogPricesMerged");
      return Promise.resolve();
    }

    mergeInflight = fetch(base + "/api/catalog/categories", { cache: "no-store" })
      .then(function (res) {
        return res.json();
      })
      .then(function (jc) {
        if (jc && jc.ok && jc.categories && typeof D.applyCategoriesMerge === "function") {
          D.applyCategoriesMerge(jc.categories);
        }
        dispatchCatalogEvent("craftguruCatalogCategoriesMerged");
      })
      .catch(function () {})
      .then(function () {
        return fetch(base + "/api/catalog/vendor-products", { cache: "no-store" });
      })
      .then(function (res) {
        return res.json();
      })
      .then(function (j2) {
        if (j2 && j2.ok && j2.products && typeof D.applyVendorProductsMerge === "function") {
          D.applyVendorProductsMerge(j2.products);
          writeSessionJson(VENDOR_CACHE_KEY, { ts: Date.now(), products: j2.products });
        }
        dispatchCatalogEvent("craftguruCatalogVendorProductsMerged");
        return fetch(base + "/api/catalog/price-overrides", { cache: "no-store" }).then(function (res) {
          return res.json();
        });
      })
      .then(function (j) {
        if (j && j.ok && j.overrides) {
          try {
            window.__cgCatalogOverrides = j.overrides;
          } catch (_) {}
          /* Applies per-product options_json to all resin product.html PDPs via product.js */
          D.applyPriceOverrides(j.overrides);
        }
        if (j && j.ok) {
          var suppressed = [];
          if (j.suppressedProductIds && j.suppressedProductIds.length) {
            suppressed = suppressed.concat(j.suppressedProductIds);
          }
          if (j.overrides && typeof j.overrides === "object") {
            Object.keys(j.overrides).forEach(function (k) {
              if (j.overrides[k] && j.overrides[k].listed === false) suppressed.push(k);
            });
          }
          if (suppressed.length && typeof D.applyCatalogSuppressions === "function") {
            try {
              window.__cgCatalogSuppressions = suppressed;
            } catch (_) {}
            D.applyCatalogSuppressions(suppressed);
          }
          if (j.overrides) {
            writeSessionJson(OVERRIDES_CACHE_KEY, {
              ts: Date.now(),
              overrides: j.overrides,
              suppressed: suppressed,
            });
          }
        }
        if (typeof D.rebuildCategoryProductIndex === "function") {
          D.rebuildCategoryProductIndex();
        }
      })
      .catch(function () {})
      .finally(function () {
        mergeFinished = true;
        mergeInflight = null;
        dispatchCatalogEvent("craftguruCatalogPricesMerged");
      });

    return mergeInflight;
  }

  function whenCatalogReady() {
    if (mergeInflight) return mergeInflight;
    if (mergeFinished) return Promise.resolve();
    return new Promise(function (resolve) {
      window.addEventListener(
        "craftguruCatalogPricesMerged",
        function () {
          resolve();
        },
        { once: true }
      );
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runMerge);
  } else {
    runMerge();
  }

  window.CraftguruCatalogMerge = {
    refresh: function () {
      return runMerge(true);
    },
    whenReady: whenCatalogReady,
    getApiBase: billApiBase,
    clearCache: clearSessionCatalogCache,
  };

  var visibilityRefreshTimer = null;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (visibilityRefreshTimer) clearTimeout(visibilityRefreshTimer);
    visibilityRefreshTimer = setTimeout(function () {
      visibilityRefreshTimer = null;
      runMerge(true);
    }, 400);
  });

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
      runMerge(true).finally(function () {
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
