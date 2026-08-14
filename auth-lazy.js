/**
 * Lazy-load guest auth stack on first interaction (sign up / log in).
 */
(function () {
  "use strict";

  var loaded = false;
  var loading = false;
  var queue = [];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.body.appendChild(s);
    });
  }

  function runQueue() {
    while (queue.length) {
      var fn = queue.shift();
      try {
        fn();
      } catch (_) {}
    }
  }

  function ensureAuthScripts(cb) {
    if (loaded) {
      if (cb) cb();
      return;
    }
    if (cb) queue.push(cb);
    if (loading) return;
    loading = true;
    var v = "20260816";
    Promise.resolve()
      .then(function () {
        return loadScript("auth-db.js?v=" + v);
      })
      .then(function () {
        return loadScript("google-signin.js?v=" + v);
      })
      .then(function () {
        return loadScript("auth-home.js?v=" + v);
      })
      .then(function () {
        loaded = true;
        loading = false;
        runQueue();
      })
      .catch(function () {
        loading = false;
      });
  }

  function wireTriggers() {
    var ids = ["homeAuthSignup", "homeAuthLogin", "homeAuthLogout", "homeAuthOrders"];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("click", function () {
        ensureAuthScripts();
      });
      el.addEventListener("focus", function () {
        ensureAuthScripts();
      });
    });
    var modal = document.getElementById("authModal");
    if (modal) {
      modal.addEventListener("click", function () {
        ensureAuthScripts();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireTriggers);
  } else {
    wireTriggers();
  }

  window.CraftguruAuthLazy = {
    ensure: ensureAuthScripts,
  };
})();
