/**
 * Resolves storefront API base before any deferred catalog scripts run.
 * Strips dev-only localhost URLs on production / native WebView hosts.
 */
(function (global) {
  "use strict";

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

  function isLoopbackHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function isAndroidWebView() {
    try {
      if (document.documentElement.getAttribute("data-native-app") === "android") return true;
      return /CraftGuruAndroid/i.test(navigator.userAgent || "");
    } catch (_) {
      return false;
    }
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

  function normalizeConfiguredBase(raw) {
    var t = String(raw || "").trim().replace(/\/+$/, "");
    if (!t.length) return "";
    try {
      if (global.location && global.location.protocol !== "file:") {
        var ph = String(global.location.hostname || "").toLowerCase();
        var tl = t.toLowerCase();
        var cfgLocal = tl.indexOf("127.0.0.1") >= 0 || tl.indexOf("localhost") >= 0;
        if (cfgLocal && !isLoopbackHost(ph) && !isPrivateLanHost(ph)) {
          return "";
        }
      }
    } catch (_) {}
    return t;
  }

  function resolveApiBase() {
    try {
      var configured = document.documentElement.getAttribute("data-bill-api-base");
      if (configured != null) {
        var normalized = normalizeConfiguredBase(configured);
        if (normalized) return normalized;
      }
    } catch (_) {}

    try {
      if (global.location && global.location.protocol !== "file:") {
        var loc = global.location;
        var port = String(loc.port || (loc.protocol === "https:" ? "443" : "80"));
        if (STATIC_DEV_PORTS[port]) {
          if (isAndroidWebView()) {
            var apiPort = billApiPortOverride() || "3847";
            return "http://10.0.2.2:" + apiPort;
          }
          return "http://127.0.0.1:" + (billApiPortOverride() || "3847");
        }
        return String(loc.origin).replace(/\/+$/, "");
      }
    } catch (_) {}

    if (isAndroidWebView()) {
      return "http://10.0.2.2:" + (billApiPortOverride() || "3847");
    }
    var p = billApiPortOverride();
    if (p) return "http://127.0.0.1:" + p;
    return "http://127.0.0.1:3847";
  }

  function applyHtmlApiBase() {
    try {
      var base = resolveApiBase();
      var loc = global.location;
      var onProdHost =
        loc &&
        loc.protocol !== "file:" &&
        !isLoopbackHost(loc.hostname) &&
        !STATIC_DEV_PORTS[String(loc.port || (loc.protocol === "https:" ? "443" : "80"))];

      if (onProdHost || isAndroidWebView()) {
        var configured = document.documentElement.getAttribute("data-bill-api-base") || "";
        var cfgLocal =
          configured.indexOf("127.0.0.1") >= 0 || configured.indexOf("localhost") >= 0;
        if (cfgLocal && base && base.indexOf("127.0.0.1") < 0 && base.indexOf("localhost") < 0) {
          document.documentElement.setAttribute("data-bill-api-base", base);
        } else if (cfgLocal && onProdHost) {
          document.documentElement.setAttribute("data-bill-api-base", "");
        }
      }
    } catch (_) {}
  }

  applyHtmlApiBase();

  global.CraftguruApiBase = {
    get: resolveApiBase,
    refresh: function () {
      applyHtmlApiBase();
      return resolveApiBase();
    },
    isAndroidWebView: isAndroidWebView,
  };
})(typeof window !== "undefined" ? window : this);
