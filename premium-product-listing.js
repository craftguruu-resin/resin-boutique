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

  var CATEGORY_DESCRIPTIONS = {
    "resin-clocks":
      "Elegant handcrafted resin clocks that blend art with time. Perfect for your home, office & gifting.",
    "resin-coasters":
      "Hand-poured resin coasters with premium finishes — protect surfaces while adding artisan charm to every table.",
    "resin-customised-frames":
      "Personalised resin photo frames and ring platters — turn cherished memories into lasting keepsakes.",
    "resin-keychains":
      "Custom resin keychains in alphabet, shape, photo, and name styles — perfect everyday gifts and bulk orders.",
    "resin-name-plates":
      "Elegant resin name plates for homes and desks — handcrafted with premium finishes and custom lettering.",
    "resin-pooja-plate":
      "Beautiful resin pooja platters in rich colours — ideal for festivals, gifting, and sacred spaces.",
    "resin-mantra-frame":
      "Devotional resin mantra frames with metal stands — meaningful gifts for home and office altars.",
    "resin-cutlery-and-tissue-holder":
      "Functional resin trays and tissue holders — stylish organisation for dining and living spaces.",
    "resin-car-hanging":
      "Sacred resin car hangings — handcrafted devotional pieces for safe, meaningful journeys.",
    "resin-key-holder":
      "Wall-mounted resin key holders in ocean, textured, and classic finishes for organised entryways.",
    "resin-guruji-products":
      "Devotional Guruji resin frames, magnets, and keychains — thoughtful spiritual gifts.",
    "mini-resin-deshboard":
      "Mini resin dashboard idols and signs — compact devotional pieces for cars and desks.",
    "corporate-gifting":
      "Curated resin keepsakes for teams, clients, and events — bulk orders and bespoke pours welcome.",
    "raw-materials":
      "Studio-grade epoxy, pigments, molds, and tools — everything you need for professional resin pours.",
    "photo-frames":
      "Hand-poured personalised resin photo frames — ocean pours, florals, clocks, and bespoke keepsakes.",
  };

  function fnv1a32(str) {
    var h = 2166136261 >>> 0;
    var s = String(str || "");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function defaultRatingMeta(productId) {
    var h = fnv1a32(productId);
    var rating = 4.5 + (h % 6) / 10;
    var reviews = 12 + (h % 37);
    return { rating: Math.round(rating * 10) / 10, reviewCount: reviews };
  }

  function resolveRating(opts) {
    if (opts.rating != null && opts.reviewCount != null) {
      var r = parseFloat(String(opts.rating), 10);
      var c = parseInt(String(opts.reviewCount), 10);
      if (Number.isFinite(r) && Number.isFinite(c) && c > 0) {
        return { rating: Math.min(5, Math.max(1, r)), reviewCount: c };
      }
    }
    if (opts.productId) return defaultRatingMeta(opts.productId);
    return { rating: 4.8, reviewCount: 24 };
  }

  function starsHtml(rating) {
    var r = Math.min(5, Math.max(0, Number(rating) || 0));
    var full = Math.floor(r);
    var half = r - full >= 0.5 ? 1 : 0;
    var empty = 5 - full - half;
    var out = "";
    var i;
    for (i = 0; i < full; i++) out += '<span aria-hidden="true">★</span>';
    if (half) out += '<span aria-hidden="true">★</span>';
    for (i = 0; i < empty; i++) out += '<span class="is-dim" aria-hidden="true">★</span>';
    return out;
  }

  function isProductNew(opts) {
    if (opts.isNew === true) return true;
    if (opts.isNew === false) return false;
    var name = String(opts.name || "").toLowerCase();
    var id = String(opts.productId || "").toLowerCase();
    return name.indexOf("new ") === 0 || name.indexOf(" new ") >= 0 || id.indexOf("new-") >= 0;
  }

  function getCategoryDescription(catId, fallback) {
    var key = String(catId || "").trim();
    if (key && CATEGORY_DESCRIPTIONS[key]) return CATEGORY_DESCRIPTIONS[key];
    if (fallback) return String(fallback);
    return "Browse handcrafted resin pieces from Craft Guru — premium quality, pan-India delivery.";
  }

  function whatsappIconHtml(opts) {
    var WA = window.CRAFTGURU_WA;
    if (!WA || typeof WA.listingButtonHtml !== "function") return "";
    return WA.listingButtonHtml(
      Object.assign({}, opts || {}, {
        className: "bulk-buy-btn--plp-icon",
      })
    );
  }

  /**
   * Premium PLP product card matching mockup layout.
   */
  function buildProductCard(opts) {
    opts = opts || {};
    var card = document.createElement("article");
    var extra = opts.extraClass ? " " + opts.extraClass : "";
    card.className = "plp-card is-inview" + extra;
    if (opts.stagger != null) card.style.setProperty("--stagger", String(opts.stagger));
    if (opts.productId) card.setAttribute("data-product-id", opts.productId);
    if (opts.productName) card.setAttribute("data-product-name", String(opts.productName).toLowerCase());
    if (opts.minPrice != null && opts.minPrice !== "") {
      card.setAttribute("data-min-price", String(opts.minPrice));
    }

    var href = opts.href || "#";
    var name = opts.name || opts.title || "";
    var priceLabel = opts.priceLabel || opts.price || "";
    var ctaText = opts.ctaText || "View options →";
    var ctaHref = opts.ctaHref || href;
    var meta = resolveRating(opts);
    var showNew = isProductNew({ isNew: opts.isNew, name: name, productId: opts.productId });
    var wishKind = opts.wishlistKind || "catalog";

    var fitAttr =
      opts.imgFit === "contain" || opts.imgFit === "cover"
        ? ' data-image-fit="' + escAttr(opts.imgFit) + '"'
        : "";

    var mediaInner = opts.imgSrc
      ? '<img src="' +
        escAttr(opts.imgSrc) +
        '" alt="' +
        escAttr(name) +
        '" loading="lazy" decoding="async"' +
        fitAttr +
        " />"
      : '<div class="plp-card__media-empty" aria-hidden="true"></div>';

    var discountHtml = opts.discountHtml || "";
    var mrpHtml = opts.mrpHtml || "";

    card.innerHTML =
      '<a class="plp-card__hit" href="' +
      escAttr(href) +
      '" aria-label="View ' +
      escAttr(name) +
      '"></a>' +
      '<div class="plp-card__media-wrap">' +
      (showNew ? '<span class="plp-card__badge">New</span>' : "") +
      (opts.productId
        ? '<button type="button" class="plp-card__wish" data-wish-id="' +
          escAttr(opts.productId) +
          '" data-wish-kind="' +
          escAttr(wishKind) +
          '" aria-pressed="false" aria-label="Save to wishlist">♡</button>'
        : "") +
      '<div class="plp-card__media">' +
      mediaInner +
      "</div></div>" +
      '<div class="plp-card__body">' +
      '<div class="plp-card__name-row">' +
      '<span class="plp-card__spark" aria-hidden="true">✦</span>' +
      '<h3 class="plp-card__name">' +
      esc(name) +
      "</h3></div>" +
      '<div class="plp-card__rating">' +
      '<span class="plp-card__stars" aria-label="Rated ' +
      escAttr(meta.rating) +
      ' out of 5">' +
      starsHtml(meta.rating) +
      "</span>" +
      '<span class="plp-card__review-count">(' +
      esc(meta.reviewCount) +
      ")</span></div>" +
      (priceLabel
        ? '<p class="plp-card__price">' +
          esc(priceLabel) +
          mrpHtml +
          discountHtml +
          "</p>"
        : "") +
      "</div>" +
      '<div class="plp-card__actions">' +
      '<a class="plp-card__cta" href="' +
      escAttr(ctaHref) +
      '">' +
      esc(ctaText) +
      "</a>" +
      whatsappIconHtml({
        productName: name,
        productId: opts.productId,
        productUrl: opts.productUrl || href,
      }) +
      "</div>";

    wireCardWishlist(card);
    applyCardImageFit(card, opts.imgFit);

    return card;
  }

  function applyCardImageFit(card, fit) {
    if (!card) return;
    var img = card.querySelector(".plp-card__media img");
    if (!img) return;
    if (window.CraftguruImageFit && window.CraftguruImageFit.applyImageFit) {
      window.CraftguruImageFit.applyImageFit(img, fit || "");
    } else if (fit === "contain" || fit === "cover") {
      img.setAttribute("data-image-fit", fit);
    }
  }

  function wireCardWishlist(card) {
    if (!card) return;
    var btn = card.querySelector(".plp-card__wish");
    if (!btn || btn.dataset.plpWishWired === "1") return;
    btn.dataset.plpWishWired = "1";
    var id = btn.getAttribute("data-wish-id");
    var kind = btn.getAttribute("data-wish-kind") || "catalog";
    var WL = window.RESIN_WISHLIST;
    if (WL && typeof WL.syncButton === "function") WL.syncButton(btn, id, kind);
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!WL || typeof WL.toggle !== "function") return;
      btn.setAttribute("aria-busy", "true");
      WL.toggle(id, kind, function () {
        WL.syncButton(btn, id, kind);
      });
    });
  }

  function wireAllCardWishlists(root) {
    (root || document).querySelectorAll(".plp-card__wish:not([data-plp-wish-wired='1'])").forEach(function (btn) {
      var card = btn.closest(".plp-card");
      if (card) wireCardWishlist(card);
    });
  }

  function trustBarHtml() {
    return (
      '<ul class="plp-trust-bar" aria-label="Why Craft Guru">' +
      '<li class="plp-trust-bar__item">' +
      '<span class="plp-trust-bar__icon plp-trust-bar__icon--teal" aria-hidden="true">♥</span>' +
      '<div class="plp-trust-bar__text"><strong>Handcrafted with Love</strong><span>Made in Jaipur</span></div></li>' +
      '<li class="plp-trust-bar__item">' +
      '<span class="plp-trust-bar__icon plp-trust-bar__icon--pink" aria-hidden="true">◆</span>' +
      '<div class="plp-trust-bar__text"><strong>Premium Quality</strong><span>Artisan resin pours</span></div></li>' +
      '<li class="plp-trust-bar__item">' +
      '<span class="plp-trust-bar__icon plp-trust-bar__icon--green" aria-hidden="true">✓</span>' +
      '<div class="plp-trust-bar__text"><strong>Safe &amp; Secure Packaging</strong><span>Careful dispatch</span></div></li>' +
      '<li class="plp-trust-bar__item">' +
      '<span class="plp-trust-bar__icon plp-trust-bar__icon--orange" aria-hidden="true">🚚</span>' +
      '<div class="plp-trust-bar__text"><strong>Pan India Delivery</strong><span>Tracked shipping</span></div></li>' +
      "</ul>"
    );
  }

  function bulkBannerHtml() {
    var WA = window.CRAFTGURU_WA;
    var href = "return-gifts.html";
    if (WA && typeof WA.buildUrl === "function") {
      href = WA.buildUrl(
        "Hi, I'm interested in bulk or corporate gifting options.\n\nPlease share:\n- Bulk pricing\n- Minimum order quantity\n- Customisation options\n- Delivery timeline"
      );
    }
    return (
      '<aside class="plp-bulk-banner" aria-label="Bulk and corporate gifting">' +
      '<span class="plp-bulk-banner__icon" aria-hidden="true">🎁</span>' +
      '<div class="plp-bulk-banner__copy">' +
      "<strong>Looking for Bulk or Corporate Gifting?</strong>" +
      "<span>Get special discounts on bulk orders.</span></div>" +
      '<a class="plp-bulk-banner__cta" href="' +
      escAttr(href) +
      '" target="_blank" rel="noopener noreferrer">Enquire now →</a></aside>'
    );
  }

  function injectTrustBar(beforeEl) {
    if (!beforeEl || !beforeEl.parentNode) return null;
    var existing = beforeEl.parentNode.querySelector(".plp-trust-bar");
    if (existing) return existing;
    var wrap = document.createElement("div");
    wrap.innerHTML = trustBarHtml();
    var bar = wrap.firstElementChild;
    beforeEl.parentNode.insertBefore(bar, beforeEl);
    return bar;
  }

  function injectBulkBanner(afterEl) {
    if (!afterEl || !afterEl.parentNode) return null;
    var shell = afterEl.closest(".plp-shell") || afterEl.parentNode;
    var existing = shell.querySelector(".plp-bulk-banner");
    if (existing) return existing;
    var wrap = document.createElement("div");
    wrap.innerHTML = bulkBannerHtml();
    var banner = wrap.firstElementChild;
    if (afterEl.nextSibling) {
      afterEl.parentNode.insertBefore(banner, afterEl.nextSibling);
    } else {
      afterEl.parentNode.appendChild(banner);
    }
    return banner;
  }

  function mountListingShell(opts) {
    opts = opts || {};
    var grid = opts.gridEl || (opts.gridId ? document.getElementById(opts.gridId) : null);
    if (!grid) return;
    grid.classList.add("plp-grid");
    if (opts.trustBar !== false) injectTrustBar(grid);
    if (opts.bulkBanner !== false) injectBulkBanner(grid);
  }

  window.addEventListener("resinWishlistChanged", function () {
    wireAllCardWishlists(document);
  });

  window.CraftguruProductListing = {
    esc: esc,
    escAttr: escAttr,
    buildProductCard: buildProductCard,
    applyCardImageFit: applyCardImageFit,
    wireCardWishlist: wireCardWishlist,
    wireAllCardWishlists: wireAllCardWishlists,
    getCategoryDescription: getCategoryDescription,
    defaultRatingMeta: defaultRatingMeta,
    starsHtml: starsHtml,
    trustBarHtml: trustBarHtml,
    bulkBannerHtml: bulkBannerHtml,
    injectTrustBar: injectTrustBar,
    injectBulkBanner: injectBulkBanner,
    mountListingShell: mountListingShell,
  };
})();
