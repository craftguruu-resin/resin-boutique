(function () {
  "use strict";

  function esc(s) {
    var el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  }

  function escAttr(s) {
    return String(s == null ? "" : s).replace(/"/g, "&quot;");
  }

  /**
   * Glass-theme category card — contain image, frosted panel with wavy top edge, title, count, CTA.
   * @param {Object} opts
   * @param {string} opts.href
   * @param {string} opts.title
   * @param {string} [opts.subtitle]
   * @param {string} [opts.ctaText]
   * @param {string} [opts.imgSrc]
   * @param {string} [opts.imgFit] - "contain" (default) or "cover"
   * @param {string} [opts.imgFallback]
   * @param {Function} [opts.onImgError]
   * @param {string} [opts.searchText]
   * @param {string} [opts.minPrice]
   * @param {boolean} [opts.hasPreview]
   * @param {number} [opts.stagger]
   * @param {string} [opts.ariaLabel]
   * @param {string} [opts.extraClass]
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
    var imgFit = opts.imgFit || "contain";

    var mediaInner;
    if (opts.imgSrc) {
      var fitAttr =
        imgFit === "contain" || imgFit === "cover"
          ? ' data-image-fit="' + escAttr(imgFit) + '"'
          : ' data-image-fit="contain"';
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

    if (opts.imgSrc) {
      var fitImg = card.querySelector(".featured-collection-card__media img");
      if (fitImg && window.CraftguruImageFit && window.CraftguruImageFit.applyImageFit) {
        window.CraftguruImageFit.applyImageFit(fitImg, imgFit);
      } else if (fitImg) {
        fitImg.setAttribute("data-image-fit", imgFit === "cover" ? "cover" : "contain");
      }
    }

    return card;
  }

  window.CraftguruPremiumCards = {
    buildCategoryCard: buildCategoryCard,
    esc: esc,
    escAttr: escAttr,
  };
})();
