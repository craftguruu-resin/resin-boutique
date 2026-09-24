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
      if (window.CraftguruApiBase && typeof window.CraftguruApiBase.get === "function") {
        return window.CraftguruApiBase.get();
      }
    } catch (_) {}
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
          if (window.CraftguruApiBase && window.CraftguruApiBase.isAndroidWebView && window.CraftguruApiBase.isAndroidWebView()) {
            return "http://10.0.2.2:" + (billApiPortOverride() || "3847");
          }
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
  var lastMergeAt = 0;
  var CATEGORIES_CACHE_KEY = "__cgCategoriesCache";
  var VENDOR_CACHE_KEY = "__cgVendorProductsCache";
  var OVERRIDES_CACHE_KEY = "__cgCatalogOverridesCache";
  var CACHE_TTL_MS = 5 * 60 * 1000;
  var VISIBILITY_REFRESH_MIN_MS = 2 * 60 * 1000;
  var CATALOG_CHANGE_KEY = "craftguruCatalogChangedAt";

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

  function cacheFresh(entry) {
    return entry && entry.ts && Date.now() - entry.ts < CACHE_TTL_MS;
  }

  function applyOverridesPayload(j) {
    if (!j || !j.ok) return;
    if (j.overrides) {
      try {
        window.__cgCatalogOverrides = j.overrides;
      } catch (_) {}
      D.applyPriceOverrides(j.overrides);
    }
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
    if (typeof D.rebuildCategoryProductIndex === "function") {
      D.rebuildCategoryProductIndex();
    }
  }

  function hydrateCatalogFromSessionCache() {
    var cat = readSessionJson(CATEGORIES_CACHE_KEY);
    if (cacheFresh(cat) && cat.categories && typeof D.applyCategoriesMerge === "function") {
      D.applyCategoriesMerge(cat.categories);
    }
    var vendor = readSessionJson(VENDOR_CACHE_KEY);
    if (cacheFresh(vendor) && vendor.products && typeof D.applyVendorProductsMerge === "function") {
      D.applyVendorProductsMerge(vendor.products);
    }
    var ovWrap = readSessionJson(OVERRIDES_CACHE_KEY);
    if (cacheFresh(ovWrap) && ovWrap.overrides) {
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
      sessionStorage.removeItem(CATEGORIES_CACHE_KEY);
      sessionStorage.removeItem(VENDOR_CACHE_KEY);
      sessionStorage.removeItem(OVERRIDES_CACHE_KEY);
    } catch (_) {}
  }

  function catalogFetch(base, path) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, 4000);
    /* Session storage above is the deliberate short-lived catalog cache.
       Do not let the browser's HTTP cache override it: a category page can
       otherwise receive an older /storefront-bootstrap response for up to a
       minute just after Vendor Panel creates a product. That made the home
       category card visible while its destination page stayed empty. */
    var opts = { credentials: "same-origin", cache: "no-store" };
    if (controller) opts.signal = controller.signal;
    return fetch(base + path, opts)
      .then(function (res) {
        window.clearTimeout(timer);
        return res.json();
      })
      .catch(function (err) {
        window.clearTimeout(timer);
        throw err;
      });
  }

  function runMerge(forceFresh) {
    if (mergeInflight) {
      /*
       * A forced refresh must never silently reuse the older in-flight request.
       * This matters on category navigation: the page can start with a cached
       * catalog request, while the user explicitly needs the latest backend
       * product set. Finish the current request, then perform the forced fetch.
       */
      if (forceFresh) {
        return mergeInflight.then(function () {
          return runMerge(true);
        });
      }
      return mergeInflight;
    }

    var base = billApiBase();
    if (!base) {
      mergeFinished = true;
      dispatchCatalogEvent("craftguruCatalogPricesMerged");
      return Promise.resolve();
    }

    if (forceFresh) clearSessionCatalogCache();

    var catEntry = readSessionJson(CATEGORIES_CACHE_KEY);
    var vendorEntry = readSessionJson(VENDOR_CACHE_KEY);
    var ovEntry = readSessionJson(OVERRIDES_CACHE_KEY);
    var needCategories = forceFresh || !cacheFresh(catEntry) || !catEntry.categories;
    var needVendor = forceFresh || !cacheFresh(vendorEntry) || !vendorEntry.products;
    var needOverrides = forceFresh || !cacheFresh(ovEntry) || !ovEntry.overrides;

    if (!needCategories && !needVendor && !needOverrides) {
      mergeFinished = true;
      lastMergeAt = Date.now();
      dispatchCatalogEvent("craftguruCatalogPricesMerged");
      return Promise.resolve();
    }

    if (needCategories && needVendor && needOverrides) {
      mergeInflight = catalogFetch(base, "/api/catalog/storefront-bootstrap")
        .then(function (j) {
          if (j && j.ok) {
            if (j.categories && typeof D.applyCategoriesMerge === "function") {
              D.applyCategoriesMerge(j.categories);
              writeSessionJson(CATEGORIES_CACHE_KEY, { ts: Date.now(), categories: j.categories });
            }
            if (j.products && typeof D.applyVendorProductsMerge === "function") {
              D.applyVendorProductsMerge(j.products);
              writeSessionJson(VENDOR_CACHE_KEY, { ts: Date.now(), products: j.products });
            }
            applyOverridesPayload(j);
            writeSessionJson(OVERRIDES_CACHE_KEY, {
              ts: Date.now(),
              overrides: j.overrides || {},
              suppressedProductIds: j.suppressedProductIds || [],
            });
            dispatchCatalogEvent("craftguruCatalogCategoriesMerged");
            dispatchCatalogEvent("craftguruCatalogVendorProductsMerged");
          }
        })
        .catch(function () {})
        .finally(function () {
          mergeFinished = true;
          mergeInflight = null;
          lastMergeAt = Date.now();
          dispatchCatalogEvent("craftguruCatalogPricesMerged");
        });
      return mergeInflight;
    }

    var tasks = [];

    if (needCategories) {
      tasks.push(
        catalogFetch(base, "/api/catalog/categories").then(function (jc) {
          if (jc && jc.ok && jc.categories && typeof D.applyCategoriesMerge === "function") {
            D.applyCategoriesMerge(jc.categories);
            writeSessionJson(CATEGORIES_CACHE_KEY, { ts: Date.now(), categories: jc.categories });
          }
          dispatchCatalogEvent("craftguruCatalogCategoriesMerged");
        })
      );
    } else if (catEntry && catEntry.categories) {
      dispatchCatalogEvent("craftguruCatalogCategoriesMerged");
    }

    if (needVendor) {
      tasks.push(
        catalogFetch(base, "/api/catalog/vendor-products").then(function (j2) {
          if (j2 && j2.ok && j2.products && typeof D.applyVendorProductsMerge === "function") {
            D.applyVendorProductsMerge(j2.products);
            writeSessionJson(VENDOR_CACHE_KEY, { ts: Date.now(), products: j2.products });
          }
          dispatchCatalogEvent("craftguruCatalogVendorProductsMerged");
        })
      );
    } else {
      dispatchCatalogEvent("craftguruCatalogVendorProductsMerged");
    }

    if (needOverrides) {
      tasks.push(
        catalogFetch(base, "/api/catalog/price-overrides").then(function (j) {
          applyOverridesPayload(j);
        })
      );
    }

    mergeInflight = Promise.all(tasks)
      .catch(function () {})
      .finally(function () {
        mergeFinished = true;
        mergeInflight = null;
        lastMergeAt = Date.now();
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
    document.addEventListener("DOMContentLoaded", function () {
      runMerge(true);
    });
  } else {
    runMerge(true);
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
    if (Date.now() - lastMergeAt < VISIBILITY_REFRESH_MIN_MS) return;
    if (visibilityRefreshTimer) clearTimeout(visibilityRefreshTimer);
    visibilityRefreshTimer = setTimeout(function () {
      visibilityRefreshTimer = null;
      runMerge(false);
    }, 400);
  });

  /* A save in the vendor panel can happen in another tab. Refresh the
     public catalog immediately instead of waiting for the session cache TTL. */
  window.addEventListener("storage", function (ev) {
    if (ev.key !== CATALOG_CHANGE_KEY || !ev.newValue) return;
    runMerge(true);
  });

  /* Returning from the vendor panel via the browser Back button restores a
     cached page. Fetch once so the returned storefront includes that save. */
  window.addEventListener("pageshow", function (ev) {
    if (ev.persisted) runMerge(true);
  });

  function removeLegacyCatalogSyncButton() {
    var btn = document.getElementById("catalogSyncBtn");
    if (btn) btn.remove();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeLegacyCatalogSyncButton);
  } else {
    removeLegacyCatalogSyncButton();
  }
})();
