/* Home first-load normalizer.
 * Prevent browser/session scroll restoration from opening the Home page
 * halfway down the document on a fresh navigation or reload.
 */
(function () {
  "use strict";

  function isHome() {
    try {
      var p = String(window.location.pathname || "/").toLowerCase();
      return p === "/" || p === "/index.html" || p.endsWith("/index.html");
    } catch (_) {
      return false;
    }
  }

  if (!isHome()) return;

  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (_) {}

  function resetHomeViewport() {
    try {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    } catch (_) {}
  }

  // Run before layout settles, then again after DOM/CSS/image initialization.
  resetHomeViewport();
  document.addEventListener("DOMContentLoaded", resetHomeViewport, { once: false });
  window.addEventListener("pageshow", resetHomeViewport, { once: false });
  window.addEventListener("load", resetHomeViewport, { once: false });
  requestAnimationFrame(resetHomeViewport);
  requestAnimationFrame(function () {
    requestAnimationFrame(resetHomeViewport);
  });
})();
