(function () {
  "use strict";

  var core = window.CraftguruCraftCategoryCard;

  if (core && core.buildCategoryCard) {
    window.CraftguruPremiumCards = core;
    window.CraftguruCategoryCard = core;
    return;
  }

  /* Fallback if craft-category-card.js failed to load */
  function esc(s) {
    var el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  }

  function escAttr(s) {
    return String(s == null ? "" : s).replace(/"/g, "&quot;");
  }

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

    var mediaInner = opts.imgSrc
      ? '<img src="' +
        escAttr(opts.imgSrc) +
        '" alt="" loading="lazy" decoding="async" data-image-fit="contain" />'
      : '<div class="craft-cat-card__media-empty" aria-hidden="true"></div>';

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
      "</div></div></a>";

    return card;
  }

  window.CraftguruPremiumCards = { buildCategoryCard: buildCategoryCard, esc: esc, escAttr: escAttr };
  window.CraftguruCategoryCard = window.CraftguruPremiumCards;
})();
