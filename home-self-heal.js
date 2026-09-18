/**
 * Home loading skeleton controller + self-heal watchdog.
 *
 * The skeleton (#cgHomeSkeleton) is static HTML/CSS with zero dependency on
 * this script running successfully -- it's visible from first paint no
 * matter what. This script's only job is to remove it once real content is
 * confirmed ready, or to reload the page (while the skeleton is still
 * covering everything) if content never becomes ready in time. Either way,
 * a visitor should never see blank/partial content -- only the skeleton,
 * then the finished page.
 */
(function () {
  "use strict";
  if (document.body.className.indexOf("page-home") === -1) return;

  var POLL_INTERVAL_MS = 150;
  var MAX_WAIT_MS = 6000;
  var RELOAD_FLAG_KEY = "cgHomeSelfHealReloaded";
  var startedAt = Date.now();
  var pollTimer = null;
  var settled = false;

  function getSkeleton() {
    return document.getElementById("cgHomeSkeleton");
  }

  function isContentReady() {
    var grid = document.getElementById("productGrid");
    var hero = document.getElementById("heroAtelierBuiltin");
    var gridReady = !!grid && grid.children.length > 0;

    var heroReady = false;
    if (hero) {
      var heroImg = hero.querySelector("img");
      if (heroImg) {
        heroReady = heroImg.complete && heroImg.naturalWidth > 0;
      }
    }
    if (!heroReady) {
      var promo = document.getElementById("heroPromoCarousel");
      if (promo && !promo.hidden) {
        var promoImg = document.getElementById("heroPromoImg");
        heroReady =
          !!promoImg && promoImg.complete && promoImg.naturalWidth > 0;
      }
    }

    return gridReady && heroReady;
  }

  function removeSkeleton() {
    if (settled) return;
    settled = true;
    if (pollTimer) window.clearInterval(pollTimer);
    var skeleton = getSkeleton();
    if (!skeleton) return;
    skeleton.style.transition = "opacity 220ms ease";
    skeleton.style.opacity = "0";
    window.setTimeout(function () {
      if (skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
    }, 260);
    try {
      sessionStorage.removeItem(RELOAD_FLAG_KEY);
    } catch (e) {}
  }

  function reloadBehindSkeleton() {
    if (settled) return;
    settled = true;
    if (pollTimer) window.clearInterval(pollTimer);

    var alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem(RELOAD_FLAG_KEY) === "1";
    } catch (e) {}

    if (alreadyTried) {
      if (window.console && console.warn) {
        console.warn(
          "[home-self-heal] content still not ready after a reload attempt -- showing the page as-is to avoid a reload loop."
        );
      }
      removeSkeleton();
      return;
    }

    if (window.console && console.warn) {
      console.warn(
        "[home-self-heal] hero/category grid not ready after " +
          MAX_WAIT_MS +
          "ms -- reloading behind the loading screen."
      );
    }
    try {
      sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
    } catch (e) {}
    window.location.reload();
  }

  function poll() {
    if (settled) return;
    if (isContentReady()) {
      removeSkeleton();
      return;
    }
    if (Date.now() - startedAt >= MAX_WAIT_MS) {
      reloadBehindSkeleton();
    }
  }

  if (!getSkeleton()) return;

  poll();
  pollTimer = window.setInterval(poll, POLL_INTERVAL_MS);
})();
