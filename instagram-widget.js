(function () {
  "use strict";

  var IG = window.CRAFTGURU_IG;
  var PROFILE_URL = (IG && IG.PROFILE_URL) || "https://www.instagram.com/craftguruindia/";

  var IG_ICON =
    (IG && IG.ICON_SVG) ||
    '<svg class="cg-ig-widget__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>' +
      "</svg>";

  function getMountRoot() {
    return document.getElementById("cgSocialFloatStack") || document.body;
  }

  function mountWidget() {
    if (document.getElementById("cgInstagramWidget")) return;

    var root = document.createElement("div");
    root.id = "cgInstagramWidget";
    root.className = "cg-ig-widget";
    root.innerHTML =
      '<a class="cg-ig-widget__fab" id="cgInstagramFab" href="' +
      PROFILE_URL +
      '" target="_blank" rel="noopener noreferrer" aria-label="Follow Craftguru on Instagram">' +
      '<span class="cg-ig-widget__ring cg-ig-widget__ring--1" aria-hidden="true"></span>' +
      '<span class="cg-ig-widget__ring cg-ig-widget__ring--2" aria-hidden="true"></span>' +
      '<span class="cg-ig-widget__glow" aria-hidden="true"></span>' +
      '<span class="cg-ig-widget__fab-core">' +
      IG_ICON +
      "</span>" +
      "</a>";

    var mount = getMountRoot();
    var wa = document.getElementById("cgWhatsAppWidget");
    if (mount.id === "cgSocialFloatStack" && wa) {
      mount.insertBefore(root, wa);
    } else {
      mount.appendChild(root);
    }
  }

  function ensureStyles() {
    if (document.querySelector('link[href*="instagram-widget.css"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "instagram-widget.css";
    document.head.appendChild(link);
  }

  function boot() {
    ensureStyles();
    mountWidget();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
