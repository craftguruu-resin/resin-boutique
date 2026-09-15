/* Home first-load normalizer.
 * Home must always enter at the top of the document.
 * Do not let browser/session history restoration reopen Home at a stale
 * scroll position. Other pages keep their existing restoration behavior.
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

  function disableHomeScrollRestore() {
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    } catch (_) {}

    // guest-layout.js persists the last document position here. A Home load
    // must never consume that value; otherwise the category rail can remain
    // visible while the header/hero open in a stale viewport state.
    try {
      sessionStorage.removeItem("cgPageScroll");
      sessionStorage.removeItem("craftguruNavScrollTop");
    } catch (_) {}
  }

  function resetHomeViewport() {
    disableHomeScrollRestore();
    try {
      window.scrollTo(0, 0);
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        document.documentElement.scrollLeft = 0;
        document.documentElement.scrollTop = 0;
        document.body.scrollLeft = 0;
        document.body.scrollTop = 0;
      }
    } catch (_) {}
  }

  // Register immediately (the script is loaded from <head>) and repeat at
  // every browser lifecycle point that can apply scroll restoration.
  disableHomeScrollRestore();
  resetHomeViewport();

  document.addEventListener("DOMContentLoaded", resetHomeViewport, { once: false });
  window.addEventListener("pageshow", resetHomeViewport, { once: false });
  window.addEventListener("load", resetHomeViewport, { once: false });
  window.addEventListener("popstate", resetHomeViewport, { once: false });
  window.addEventListener("hashchange", resetHomeViewport, { once: false });

  requestAnimationFrame(resetHomeViewport);
  requestAnimationFrame(function () {
    requestAnimationFrame(resetHomeViewport);
  });
})();
