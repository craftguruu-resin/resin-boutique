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
   * White category card — image top (~70%), solid white body (~30%). No glass, no overlap.
   * @param {Object} opts
   * @param {string} opts.href
   * @param {string} opts.title
   * @param {string} [opts.subtitle] — e.g. "3 products"
   * @param {string} [opts.ctaText]
   * @param {string} [opts.imgSrc]
   * @param {string} [opts.imgFallback]
   * @param {Function} [opts.onImgError]
   * @param {string} [opts.ariaLabel]
   * @param {string} [opts.extraClass]
   * @param {number} [opts.stagger]
   * @param {string} [opts.searchText]
   * @param {string} [opts.minPrice]
   * @param {boolean} [opts.hasPreview]
   */
  function buildCategoryCard(opts) {
    opts = opts || {};
    var card = document.createElement("article");
    var extra = opts.extraClass ? " " + opts.extraClass : "";
    card.className = "craft-cat-card is-inview" + extra;
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
    var ctaText = opts.ctaText || "Explore collection →";
    var ariaLabel = opts.ariaLabel || "Explore " + title + " collection";

    var mediaInner;
    var imgFit = opts.imgFit != null ? String(opts.imgFit).trim() : "";
    if (opts.imgSrc) {
      var srcsetAttr =
        opts.imgSrcSet ? ' srcset="' + escAttr(opts.imgSrcSet) + '"' : "";
      var sizesAttr = opts.imgSizes ? ' sizes="' + escAttr(opts.imgSizes) + '"' : "";
      mediaInner =
        '<img src="' +
        escAttr(opts.imgSrc) +
        '"' +
        srcsetAttr +
        sizesAttr +
        ' alt="" width="640" height="457" loading="lazy" decoding="async"' +
        (imgFit ? ' data-image-fit="' + escAttr(imgFit) + '"' : "") +
        " />";
    } else {
      mediaInner = '<div class="craft-cat-card__media-empty" aria-hidden="true"></div>';
    }

    card.innerHTML =
      '<a class="craft-cat-card__hit" href="' +
      escAttr(href) +
      '" aria-label="' +
      escAttr(ariaLabel) +
      '">' +
      '<div class="craft-cat-card__shell">' +
      '<div class="craft-cat-card__media">' +
      mediaInner +
      "</div>" +
      '<div class="craft-cat-card__body">' +
      '<h3 class="craft-cat-card__name">' +
      esc(title) +
      "</h3>" +
      (subtitle ? '<p class="craft-cat-card__count">' + esc(subtitle) + "</p>" : "") +
      '<span class="craft-cat-card__cta">' +
      esc(ctaText) +
      "</span>" +
      "</div>" +
      "</div>" +
      "</a>";

    if (opts.imgSrc && opts.imgFallback && typeof opts.onImgError === "function") {
      var previewImg = card.querySelector(".craft-cat-card__media img");
      if (previewImg) opts.onImgError(previewImg, opts.imgFallback);
    } else if (opts.imgSrc) {
      var errImg = card.querySelector(".craft-cat-card__media img");
      if (errImg) {
        errImg.addEventListener(
          "error",
          function onCatImgErr() {
            errImg.removeEventListener("error", onCatImgErr);
            var media = errImg.closest(".craft-cat-card__media");
            if (media) {
              media.innerHTML = '<div class="craft-cat-card__media-empty" aria-hidden="true"></div>';
            }
          },
          { once: true }
        );
      }
    }

    var fitImg = card.querySelector(".craft-cat-card__media img");
    if (fitImg) {
      if (window.CraftguruImageFit && window.CraftguruImageFit.applyImageFit) {
        window.CraftguruImageFit.applyImageFit(fitImg, imgFit);
      } else if (imgFit === "contain" || imgFit === "cover") {
        fitImg.setAttribute("data-image-fit", imgFit);
      } else {
        fitImg.removeAttribute("data-image-fit");
      }
    }

    return card;
  }

  /** Ensure category grids stay visible (no reveal fade hiding cards). */
  function ensureCategoryGridsVisible() {
    ["shop", "productGrid", "rmCategoryHub"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.remove("reveal", "reveal-tile");
      el.classList.add("is-inview");
      el.hidden = false;
      el.style.opacity = "1";
      el.style.visibility = "visible";
    });
    document.querySelectorAll(".craft-cat-card").forEach(function (card) {
      card.classList.remove("reveal", "reveal-tile");
      card.classList.add("is-inview");
    });
  }

  window.CraftguruCraftCategoryCard = {
    buildCategoryCard: buildCategoryCard,
    ensureCategoryGridsVisible: ensureCategoryGridsVisible,
    esc: esc,
    escAttr: escAttr,
  };
})();
