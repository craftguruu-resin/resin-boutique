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
   * Craftguru category card — image layer + frosted glass panel with organic wave.
   * @param {Object} opts
   * @param {string} opts.href
   * @param {string} opts.title
   * @param {string} [opts.subtitle]
   * @param {string} [opts.ctaText]
   * @param {string} [opts.imgSrc]
   * @param {string} [opts.imgFit] - always "contain" by default
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
    card.className = "cg-category-card" + extra;
    if (opts.stagger != null) card.style.setProperty("--cg-stagger", String(opts.stagger));
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
    var imgFit = opts.imgFit === "cover" ? "cover" : "contain";

    var mediaInner;
    if (opts.imgSrc) {
      mediaInner =
        '<img src="' +
        escAttr(opts.imgSrc) +
        '" alt="" loading="lazy" decoding="async" data-image-fit="' +
        escAttr(imgFit) +
        '" />';
    } else {
      mediaInner = '<div class="cg-category-card__media-empty" aria-hidden="true"></div>';
    }

    card.innerHTML =
      '<a class="cg-category-card__link" href="' +
      escAttr(href) +
      '" aria-label="' +
      escAttr(ariaLabel) +
      '">' +
      '<div class="cg-category-card__shell">' +
      '<div class="cg-category-card__media">' +
      mediaInner +
      "</div>" +
      '<div class="cg-category-card__glass">' +
      '<div class="cg-category-card__body">' +
      '<h3 class="cg-category-card__title">' +
      esc(title) +
      "</h3>" +
      (subtitle ? '<p class="cg-category-card__count">' + esc(subtitle) + "</p>" : "") +
      '<span class="cg-category-card__cta">' +
      esc(ctaText) +
      "</span>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</a>";

    if (opts.imgSrc && opts.imgFallback && typeof opts.onImgError === "function") {
      var previewImg = card.querySelector(".cg-category-card__media img");
      if (previewImg) opts.onImgError(previewImg, opts.imgFallback);
    }

    if (opts.imgSrc) {
      var fitImg = card.querySelector(".cg-category-card__media img");
      if (fitImg && window.CraftguruImageFit && window.CraftguruImageFit.applyImageFit) {
        window.CraftguruImageFit.applyImageFit(fitImg, imgFit);
      } else if (fitImg) {
        fitImg.setAttribute("data-image-fit", imgFit);
      }
    }

    return card;
  }

  window.CraftguruCategoryCard = {
    buildCategoryCard: buildCategoryCard,
    esc: esc,
    escAttr: escAttr,
  };
})();
