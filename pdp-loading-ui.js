/**
 * Shared PDP loading / not-found shells for catalog, raw materials, and photo frames.
 */
(function (global) {
  "use strict";

  function skeletonInner() {
    return (
      '<div class="pdp-loading-skel" aria-hidden="true">' +
      '<div class="pdp-loading-skel__media"></div>' +
      '<div class="pdp-loading-skel__lines">' +
      '<span class="pdp-loading-skel__line pdp-loading-skel__line--lg"></span>' +
      '<span class="pdp-loading-skel__line"></span>' +
      '<span class="pdp-loading-skel__line pdp-loading-skel__line--sm"></span>' +
      "</div></div>"
    );
  }

  function catalogLoadingHtml(message) {
    message = message || "Preparing the latest size and pricing options…";
    return (
      '<div class="pdp-load-shell product-page-awaiting-catalog" role="status" aria-live="polite" data-pdp-phase="loading">' +
      skeletonInner() +
      "<h1>Loading</h1>" +
      "<p>" +
      message +
      "</p></div>"
    );
  }

  function rmLoadingHtml(message) {
    message = message || "Loading product details…";
    return (
      '<div class="rm-pdp rm-pdp--modern rm-pdp--loading" role="status" aria-live="polite" data-pdp-phase="loading">' +
      skeletonInner() +
      '<p class="pdp-load-shell__msg">' +
      message +
      "</p></div>"
    );
  }

  function isLoadingPhase(root) {
    return !!(root && root.querySelector && root.querySelector("[data-pdp-phase=\"loading\"]"));
  }

  global.CRAFTGURU_PDP_LOAD = {
    catalogLoadingHtml: catalogLoadingHtml,
    rmLoadingHtml: rmLoadingHtml,
    isLoadingPhase: isLoadingPhase,
  };
})(typeof window !== "undefined" ? window : this);
