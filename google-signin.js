/**
 * Google Identity Services — Sign In button (optional).
 * Set the same client id on <html data-google-client-id="....apps.googleusercontent.com">
 * and in server/.env as GOOGLE_CLIENT_ID.
 */
(function (global) {
  "use strict";

  var SCRIPT_URL = "https://accounts.google.com/gsi/client";
  var scriptLoading = false;
  var scriptLoaded = false;
  var initDone = false;
  var pendingButtons = [];

  function clientId() {
    try {
      var v = document.documentElement.getAttribute("data-google-client-id");
      return v != null ? String(v).trim() : "";
    } catch (_) {
      return "";
    }
  }

  function loadScript(cb) {
    if (scriptLoaded) {
      return cb();
    }
    if (global.google && global.google.accounts && global.google.accounts.id) {
      scriptLoaded = true;
      return cb();
    }
    if (scriptLoading) {
      var t0 = Date.now();
      var poll = function () {
        if (global.google && global.google.accounts && global.google.accounts.id) {
          scriptLoaded = true;
          scriptLoading = false;
          cb();
        } else if (Date.now() - t0 > 20000) {
          scriptLoading = false;
          cb();
        } else {
          global.setTimeout(poll, 50);
        }
      };
      return poll();
    }
    scriptLoading = true;
    var s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.defer = true;
    s.onload = function () {
      scriptLoading = false;
      scriptLoaded = !!(global.google && global.google.accounts && global.google.accounts.id);
      cb();
    };
    s.onerror = function () {
      scriptLoading = false;
      cb();
    };
    document.head.appendChild(s);
  }

  function flushPendingButtons() {
    if (!initDone || !global.google || !global.google.accounts || !global.google.accounts.id) return;
    pendingButtons.forEach(function (pair) {
      var el = pair[0];
      var opts = pair[1] || {};
      if (!el || !el.parentNode) return;
      try {
        var merged = Object.assign(
          {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            width: typeof opts.width === "number" ? opts.width : 280,
            locale: "en",
          },
          opts
        );
        if (merged.type === "icon") {
          delete merged.text;
          delete merged.width;
          if (!merged.shape) merged.shape = "circle";
        }
        global.google.accounts.id.renderButton(el, merged);
      } catch (_) {}
    });
    pendingButtons = [];
  }

  global.CRAFT_GOOGLE_SIGNIN = {
    isConfigured: function () {
      return clientId().length > 0;
    },
    /**
     * @param {function(string): void} onCredential — JWT from Google (post to /api/guest-auth/google/session)
     */
    bootstrap: function (onCredential) {
      if (!clientId() || typeof onCredential !== "function") return;
      global.__CRAFT_GOOGLE_CB = onCredential;
      loadScript(function () {
        if (!global.google || !global.google.accounts || !global.google.accounts.id) return;
        if (!initDone) {
          global.google.accounts.id.initialize({
            client_id: clientId(),
            callback: function (resp) {
              if (resp && resp.credential && global.__CRAFT_GOOGLE_CB) {
                global.__CRAFT_GOOGLE_CB(resp.credential);
              }
            },
          });
          initDone = true;
        }
        flushPendingButtons();
      });
    },
    /** Queue a host element for the Google button (call after bootstrap, or before — order is handled). */
    renderButton: function (el, buttonOpts) {
      if (!el || !clientId()) return;
      pendingButtons.push([el, buttonOpts || {}]);
      if (initDone) flushPendingButtons();
    },
  };
})(typeof window !== "undefined" ? window : this);
