/**
 * Home self-heal watchdog.
 *
 * If the Home page's hero or category grid fail to populate within a few
 * seconds of load (for any reason — a hung fetch, a script error, a slow
 * cold backend, anything), silently reload the page ONCE to recover,
 * instead of leaving the visitor looking at a blank page and needing to
 * manually refresh. Guards against reload loops with a sessionStorage
 * flag: if the reload attempt is ALSO broken, it gives up rather than
 * reloading forever.
 */
(function () {
  "use strict";
  if (document.body.className.indexOf("page-home") === -1) return;

  var CHECK_DELAY_MS = 4500;
  var RELOAD_FLAG_KEY = "cgHomeSelfHealReloaded";

  function isBroken() {
    var grid = document.getElementById("productGrid");
    var hero = document.getElementById("heroAtelierBuiltin");
    var gridEmpty = !grid || grid.children.length === 0;
    var heroMissing = !hero;
    var heroImg = hero ? hero.querySelector("img") : null;
    var heroImgBroken =
      hero &&
      (!heroImg ||
        (heroImg.complete && heroImg.naturalWidth === 0 && heroImg.src));
    return gridEmpty && (heroMissing || heroImgBroken);
  }

  function attemptSelfHeal() {
    if (!isBroken()) return;

    var alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem(RELOAD_FLAG_KEY) === "1";
    } catch (e) {}

    if (alreadyTried) {
      if (window.console && console.warn) {
        console.warn(
          "[home-self-heal] page still broken after an automatic reload attempt — giving up to avoid a reload loop."
        );
      }
      return;
    }

    if (window.console && console.warn) {
      console.warn(
        "[home-self-heal] hero/category grid empty after " +
          CHECK_DELAY_MS +
          "ms — reloading once to recover."
      );
    }

    try {
      sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
    } catch (e) {}

    window.location.reload();
  }

  function clearFlagIfHealthy() {
    if (isBroken()) return;
    try {
      sessionStorage.removeItem(RELOAD_FLAG_KEY);
    } catch (e) {}
  }

  window.setTimeout(attemptSelfHeal, CHECK_DELAY_MS);
  window.setTimeout(clearFlagIfHealthy, CHECK_DELAY_MS + 500);
})();
