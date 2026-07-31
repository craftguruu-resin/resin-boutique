(function () {
  "use strict";

  /* Wave shape lives in CSS mask only — no DOM overlay (avoids hard image cut). */
  var WAVE_SVG = "";

  function esc(s) {
    var el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  }

  function escAttr(s) {
    return String(s == null ? "" : s).replace(/"/g, "&quot;");
  }

  /**
   * Glass-theme category card — cover image, frosted panel with wavy top edge, title, count, CTA.
   */
  function buildCategoryCard(opts) {
    opts = opts || {};
    var card = document.createElement("article");
    var extra = opts.extraClass ? " " + opts.extraClass : "";
    card.className = "featured-collection-card is-inview" + extra;
    if (opts.stagger != null) card.style.setProperty("--stagger", String(opts.stagger));
    if (opts.searchText) card.setAttribute("data-search-text", opts.searchText);
    if (opts.minPrice != null && opts.minPrice !== "") {
      card.setAttribute("data-min-price", String(opts.minPrice));
    }
    if (opts.hasPreview != null) {
      card.setAttribute("data-has-preview", opts.hasPreview ? "1" : "0");
    }

    var href = opts.href || "#";
    var title = opts.title || "";
    var subtitle = opts.subtitle || "";
    var ctaText = opts.ctaText || "EXPLORE COLLECTION →";
    var ariaLabel = opts.ariaLabel || "Explore " + title + " collection";

    var mediaInner;
    if (opts.imgSrc) {
      var fitAttr =
        opts.imgFit === "contain" || opts.imgFit === "cover"
          ? ' data-image-fit="' + escAttr(opts.imgFit) + '"'
          : "";
      mediaInner =
        '<img src="' +
        escAttr(opts.imgSrc) +
        '" alt="" loading="lazy" decoding="async"' +
        fitAttr +
        " />";
    } else {
      mediaInner = '<div class="featured-collection-card__media-empty" aria-hidden="true"></div>';
    }

    card.innerHTML =
      '<a class="featured-collection-card__hit" href="' +
      escAttr(href) +
      '" aria-label="' +
      escAttr(ariaLabel) +
      '">' +
      '<div class="featured-collection-card__visual">' +
      '<div class="featured-collection-card__media">' +
      mediaInner +
      "</div>" +
      '<div class="featured-collection-card__panel">' +
      '<div class="featured-collection-card__panel-body">' +
      '<h3 class="featured-collection-card__name">' +
      esc(title) +
      "</h3>" +
      (subtitle ? '<p class="featured-collection-card__count">' + esc(subtitle) + "</p>" : "") +
      '<span class="featured-collection-card__cta">' +
      esc(ctaText) +
      "</span>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</a>";

    if (opts.imgSrc && opts.imgFallback && typeof opts.onImgError === "function") {
      var previewImg = card.querySelector(".featured-collection-card__media img");
      if (previewImg) opts.onImgError(previewImg, opts.imgFallback);
    }

    if (opts.imgFit && opts.imgSrc) {
      var fitImg = card.querySelector(".featured-collection-card__media img");
      if (fitImg && window.CraftguruImageFit && window.CraftguruImageFit.applyImageFit) {
        window.CraftguruImageFit.applyImageFit(fitImg, opts.imgFit);
      } else if (fitImg && (opts.imgFit === "contain" || opts.imgFit === "cover")) {
        fitImg.setAttribute("data-image-fit", opts.imgFit);
      }
    }

    return card;
  }

  window.CraftguruPremiumCards = {
    buildCategoryCard: buildCategoryCard,
    WAVE_SVG: WAVE_SVG,
    esc: esc,
    escAttr: escAttr,
  };
})();
