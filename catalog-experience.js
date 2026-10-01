(function () {
  "use strict";

  var body = document.body;
  if (!body || !body.classList.contains("guest-site")) return;
  var listing = body.classList.contains("page-category") || body.classList.contains("page-wishlist") || !!document.querySelector("#rmGrid, #rgGrid");
  var pdp = body.classList.contains("page-product") || !!document.querySelector("#productCatalogGallery, .rm-pdp-gallery");

  function visibleCards() {
    var host = document.querySelector("#productGrid, #rmGrid, #rgGrid, #wishlistGrid, .plp-grid, .rm-grid-cards");
    if (!host) return [];
    return Array.prototype.filter.call(host.querySelectorAll(".plp-card, .rm-card-shop, .product-card"), function (card) {
      return !card.hidden && card.getAttribute("aria-hidden") !== "true";
    });
  }

  function activeParams() {
    var p = new URLSearchParams(window.location.search);
    return ["q", "minp", "maxp", "sort"].filter(function (key) { return String(p.get(key) || "").trim(); });
  }

  function wireListingMeta() {
    if (!listing) return;
    var titleRow = document.querySelector(".plp-title-row");
    if (!titleRow) return;
    var meta = document.getElementById("cgCatalogMeta");
    if (!meta) {
      meta = document.createElement("div");
      meta.id = "cgCatalogMeta";
      meta.className = "cg-catalog-meta";
      meta.setAttribute("role", "status");
      meta.setAttribute("aria-live", "polite");
      titleRow.insertAdjacentElement("afterend", meta);
    }
    var cards = visibleCards();
    var params = activeParams();
    /* Loading and true empty states are owned by their catalogue renderer.
       Do not inject another generic blank-state block above the grid. */
    if (!cards.length) {
      if (meta) meta.remove();
      return;
    }
    var label = cards.length + (cards.length === 1 ? " piece shown" : " pieces shown");
    meta.innerHTML = "<span class='cg-catalog-meta__count'>" + label + "</span>" +
      (params.length ? "<span class='cg-catalog-meta__state'>Filters active</span><span class='cg-catalog-meta__chips'></span><button type='button' class='cg-catalog-meta__clear'>Clear filters</button>" : "");
    var chips = meta.querySelector(".cg-catalog-meta__chips");
    if (chips) {
      var labels = { q: "Search", minp: "Min", maxp: "Max", sort: "Sort" };
      var current = new URLSearchParams(window.location.search);
      params.forEach(function (key) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "cg-catalog-meta__chip";
        chip.setAttribute("aria-label", "Remove " + (labels[key] || key) + " filter");
        chip.textContent = (labels[key] || key) + ": " + String(current.get(key) || "").trim() + " ×";
        chip.addEventListener("click", function () {
          var next = new URL(window.location.href);
          next.searchParams.delete(key);
          next.searchParams.delete("page");
          window.location.href = next.pathname + (next.search ? next.search : "") + next.hash;
        });
        chips.appendChild(chip);
      });
    }
    var clear = meta.querySelector(".cg-catalog-meta__clear");
    if (clear) clear.addEventListener("click", function () {
      var next = new URL(window.location.href);
      ["q", "minp", "maxp", "sort", "page"].forEach(function (key) { next.searchParams.delete(key); });
      window.location.href = next.pathname + (next.search ? next.search : "") + next.hash;
    });
  }

  function wireCardImageFallbacks() {
    visibleCards().forEach(function (card) {
      card.querySelectorAll("img").forEach(function (img) {
        if (!img.getAttribute("alt")) {
          var name = card.querySelector(".plp-card__name, .rm-card-shop__title, h3");
          if (name && String(name.textContent || "").trim()) img.alt = String(name.textContent).trim();
        }
        if (img.dataset.cgExperienceFallback === "1") return;
        img.dataset.cgExperienceFallback = "1";
        img.addEventListener("error", function () {
          img.classList.add("cg-image-failed");
          var media = img.closest(".plp-card__media, .rm-card-shop__img, .product-card__media, .product-card-image");
          if (media) media.classList.add("cg-media-failed");
        });
        img.addEventListener("load", function () {
          img.classList.remove("cg-image-failed");
          var media = img.closest(".plp-card__media, .rm-card-shop__img, .product-card__media, .product-card-image");
          if (media) media.classList.remove("cg-media-failed");
        });
      });
    });
  }

  function removeListingWishlistControls() {
    if (body.classList.contains("page-wishlist")) return;
    document.querySelectorAll("#productGrid .plp-card__wish, #rmGrid .plp-card__wish, #rgGrid .plp-card__wish, .plp-grid:not(#wishlistGrid) .plp-card__wish").forEach(function (button) {
      button.remove();
    });
  }

  function wirePdpImages() {
    if (!pdp) return;
    var gallery = document.querySelector("#productCatalogGallery, .rm-pdp-gallery");
    if (!gallery) return;
    var title = document.querySelector("#productTitle, #rmPdpTitle, #resinPdpTitle, h1");
    var titleText = title ? String(title.textContent || "").trim() : "Product image";
    gallery.querySelectorAll("img").forEach(function (img) {
      var hero = img.closest(".product-hero-img, .rm-pdp__hero-zoom, .rm-pdp__hero-wrap");
      if (hero && !img.getAttribute("alt")) img.alt = titleText || "Product image";
      if (!hero) img.alt = "";
      if (hero) {
        img.loading = "eager";
        img.setAttribute("fetchpriority", "high");
      }
    });
    gallery.querySelectorAll("button").forEach(function (button, index) {
      if (!button.getAttribute("aria-label") && (button.matches(".product-catalog-gallery__thumb, .rm-pdp__thumb") || button.querySelector("img"))) {
        button.setAttribute("aria-label", "View product image " + (index + 1));
      }
    });
  }

  function wirePdpSupport() {
    if (!pdp) return;
    var anchor = document.querySelector(".product-overview, .rm-pdp__detail-card, .rm-pdp__detail");
    var hasExistingHelp = document.querySelector("#productWaBuy, #resinPdpBulk, #rmPdpBulk, .cg-pdp__wa-buy, .bulk-buy-btn--pdp");
    if (anchor && !hasExistingHelp && !document.getElementById("cgPdpSupport")) {
      var support = document.createElement("section");
      support.id = "cgPdpSupport";
      support.className = "cg-pdp-support";
      support.setAttribute("aria-label", "Product help");
      support.innerHTML =
        "<a href='policies.html#shipping'><span aria-hidden='true'>▣</span><span><strong>Shipping & returns</strong><small>See delivery and purchase guidance</small></span></a>" +
        "<a href='https://wa.me/918824350056?text=Hi%20Craftguru%2C%20I%20need%20help%20with%20this%20product.' target='_blank' rel='noopener noreferrer'><span aria-hidden='true'>↗</span><span><strong>Need help choosing?</strong><small>Message the Craftguru studio</small></span></a>";
      anchor.insertAdjacentElement("afterend", support);
    }
    var gallery = document.querySelector("#productCatalogGallery, .rm-pdp-gallery");
    if (gallery) {
      /* Reuse the mobile gallery counter created by guest-layout.js. This
         keeps mobile PDPs from showing two competing counters while still
         adding a counter on desktop layouts. */
      var count = gallery.querySelector(".cg-mobile-gallery-count") || document.getElementById("cgPdpGalleryCount");
      if (!count) {
        count = document.createElement("span");
        count.id = "cgPdpGalleryCount";
        count.className = "cg-pdp-gallery-count";
        count.setAttribute("aria-live", "polite");
        gallery.appendChild(count);
      }
      if (count.dataset.cgExperienceCount === "1") return;
      count.dataset.cgExperienceCount = "1";
      var sync = function () {
        var thumbs = gallery.querySelectorAll(".product-catalog-gallery__thumb, .rm-pdp__thumb, button[data-idx]");
        var active = gallery.querySelector(".product-catalog-gallery__thumb.is-active, .rm-pdp__thumb.is-active, button[data-idx].is-active");
        var index = active ? Array.prototype.indexOf.call(thumbs, active) + 1 : 1;
        var label;
        if (count.classList.contains("cg-mobile-gallery-count")) {
          label = thumbs.length > 1 ? index + " of " + thumbs.length : "";
        } else {
          label = thumbs.length > 1 ? index + " / " + thumbs.length : "";
        }
        /* This observer watches the gallery child list. Writing an identical
           value back would create another child mutation and lock the PDP. */
        if (count.textContent !== label) count.textContent = label;
      };
      new MutationObserver(sync).observe(gallery, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
      sync();
    }
  }

  function boot() {
    wireListingMeta();
    wireCardImageFallbacks();
    removeListingWishlistControls();
    wirePdpImages();
    wirePdpSupport();
    var host = document.querySelector("#productGrid, #rmGrid, #rgGrid, #wishlistGrid, .plp-grid, .rm-grid-cards, #productCatalogGallery, .rm-pdp-gallery");
    /* Raw-material/photo-frame PDPs render the gallery and purchase detail as
       siblings in one async pass. Observe the document for PDPs so the help
       rail is mounted even when the detail card arrives after the gallery. */
    var observerTarget = pdp ? document.body : host;
    if (observerTarget && window.MutationObserver) {
      new MutationObserver(function () {
        wireListingMeta();
        wireCardImageFallbacks();
        removeListingWishlistControls();
        wirePdpImages();
        wirePdpSupport();
      }).observe(observerTarget, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
