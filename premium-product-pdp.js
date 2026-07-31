/**
 * Premium PDP — shared HTML builders & wiring (mirrors premium-product-listing.js pattern).
 * Used by resin-product-pdp.js, raw-material-product.js, photo-frame-product.js, product.js.
 */
(function (global) {
  "use strict";

  var PREPAID_DISCOUNT_PCT = 5;
  var MAX_VISIBLE_THUMBS = 5;

  function esc(s) {
    var el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  }

  function escAttr(s) {
    return String(s == null ? "" : s).replace(/"/g, "&quot;");
  }

  function featurePillsHtml() {
    return (
      '<div class="cg-pdp__feature-pills rm-pdp__feature-bar" aria-label="Product highlights">' +
      '<span class="cg-pdp__feature-pill">Handmade With Love</span>' +
      '<span class="cg-pdp__feature-pill">Premium Quality</span>' +
      '<span class="cg-pdp__feature-pill">Made To Last</span>' +
      '<span class="cg-pdp__feature-pill">Perfect For Gifting</span>' +
      "</div>"
    );
  }

  function fullscreenBtnHtml() {
    return (
      '<button type="button" class="cg-pdp__fullscreen" data-cg-pdp-fullscreen aria-label="View fullscreen">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>' +
      "<span>Fullscreen</span></button>"
    );
  }

  function discountBannerHtml() {
    return (
      '<div class="cg-pdp__discount-banner" role="note">' +
      '<span class="cg-pdp__discount-icon" aria-hidden="true">🎁</span>' +
      "<span>Flat <strong>" +
      PREPAID_DISCOUNT_PCT +
      "% OFF</strong> on prepaid orders · Pay online at checkout</span></div>"
    );
  }

  function categoryTagHtml(label) {
    var t = String(label || "").trim();
    if (!t) return "";
    return '<span class="cg-pdp__cat-tag">' + esc(t.toUpperCase()) + "</span>";
  }

  function priceTaxNoteHtml() {
    return '<p class="cg-pdp__tax-note">Inclusive of all taxes</p>';
  }

  function trustRowHtml(bullets) {
    bullets = bullets && bullets.length
      ? bullets
      : ["Hand-finished in Jaipur", "MRP includes GST", "Secure Checkout"];
    var icons = ["✦", "◎", "✓"];
    var items = bullets
      .slice(0, 3)
      .map(function (t, i) {
        return (
          '<span class="cg-pdp__trust-item">' +
          '<span class="cg-pdp__trust-icon" aria-hidden="true">' +
          (icons[i] || "✓") +
          "</span>" +
          esc(t) +
          "</span>"
        );
      })
      .join("");
    return '<div class="cg-pdp__trust-row rm-trust rm-trust--modern" aria-label="Product assurances">' + items + "</div>";
  }

  function buyActionsRowHtml(opts) {
    opts = opts || {};
    var buyId = opts.buyNowId || "cgPdpBuyNow";
    var waId = opts.waBuyId || "cgPdpWaBuy";
    return (
      '<div class="cg-pdp__buy-row">' +
      '<button type="button" class="cg-pdp__buy-now rm-pdp__buy-now" id="' +
      escAttr(buyId) +
      '">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M13 2L4 14h7l-1 8 10-14h-7l0-6z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></svg>' +
      "<span>Buy Now</span></button>" +
      '<button type="button" class="cg-pdp__wa-buy" id="' +
      escAttr(waId) +
      '">' +
      (global.CRAFTGURU_WA && global.CRAFTGURU_WA.ICON_SVG ? global.CRAFTGURU_WA.ICON_SVG : "") +
      "<span>Buy on WhatsApp</span></button></div>"
    );
  }

  function serviceBannerHtml() {
    return (
      '<section class="cg-pdp__service-banner" aria-label="Shopping services">' +
      '<div class="cg-pdp__service-item">' +
      '<span class="cg-pdp__service-icon cg-pdp__service-icon--teal" aria-hidden="true">🚚</span>' +
      "<div><strong>Estimated Delivery</strong><span>4–7 working days</span></div></div>" +
      '<div class="cg-pdp__service-item">' +
      '<span class="cg-pdp__service-icon cg-pdp__service-icon--pink" aria-hidden="true">↺</span>' +
      "<div><strong>Easy Returns &amp; Refunds</strong><span>7 days return policy</span></div></div>" +
      '<div class="cg-pdp__service-item">' +
      '<span class="cg-pdp__service-icon cg-pdp__service-icon--green" aria-hidden="true">📦</span>' +
      "<div><strong>Secure Packaging</strong><span>Damage-proof packaging</span></div></div>" +
      '<div class="cg-pdp__service-item">' +
      '<span class="cg-pdp__service-icon cg-pdp__service-icon--orange" aria-hidden="true">♥</span>' +
      "<div><strong>Loved by 10,000+</strong><span>Happy Customers</span></div></div>" +
      "</section>"
    );
  }

  function qualityFeaturesForType(productType) {
    var t = String(productType || "").toLowerCase();
    if (t.indexOf("clock") >= 0) {
      return [
        { title: "High Quality Resin", sub: "Glossy finish & vibrant colours" },
        { title: "Silent Movement", sub: "Premium quality quartz mechanism" },
        { title: "Perfect Gift", sub: "Ideal for home, office & special occasions" },
      ];
    }
    if (t.indexOf("raw") >= 0 || t.indexOf("material") >= 0) {
      return [
        { title: "Studio-Grade Quality", sub: "Professional resin craft supplies" },
        { title: "Trusted Formulations", sub: "Consistent pours & vivid pigments" },
        { title: "Perfect for Creators", sub: "Ideal for artists & hobbyists" },
      ];
    }
    if (t.indexOf("frame") >= 0 || t.indexOf("photo") >= 0) {
      return [
        { title: "High Quality Resin", sub: "Crystal-clear pours & rich colours" },
        { title: "Personalised Keepsake", sub: "Custom photos & artisan finishes" },
        { title: "Perfect Gift", sub: "Memorable gifts for every occasion" },
      ];
    }
    return [
      { title: "High Quality Resin", sub: "Glossy finish & vibrant colours" },
      { title: "Handcrafted Detail", sub: "Artisan pours made in Jaipur" },
      { title: "Perfect Gift", sub: "Ideal for home, office & special occasions" },
    ];
  }

  function qualityBannerHtml(productType) {
    var feats = qualityFeaturesForType(productType);
    var blocks = feats
      .map(function (f, i) {
        return (
          '<div class="cg-pdp__quality-block">' +
          '<span class="cg-pdp__quality-num" aria-hidden="true">' +
          String(i + 1) +
          "</span>" +
          "<strong>" +
          esc(f.title) +
          "</strong><span>" +
          esc(f.sub) +
          "</span></div>"
        );
      })
      .join("");
    return (
      '<section class="cg-pdp__quality-banner" aria-label="Product quality">' +
      '<span class="cg-pdp__quality-leaf cg-pdp__quality-leaf--tl" aria-hidden="true"></span>' +
      '<span class="cg-pdp__quality-leaf cg-pdp__quality-leaf--br" aria-hidden="true"></span>' +
      '<div class="cg-pdp__quality-inner">' +
      blocks +
      "</div></section>"
    );
  }

  function bottomSectionsHtml(productType) {
    return serviceBannerHtml() + qualityBannerHtml(productType);
  }

  function titleRowHtml(opts) {
    opts = opts || {};
    var title = opts.title || "";
    var shareHostId = opts.shareHostId || "";
    var wishId = opts.wishId || "";
    var shareHost = shareHostId
      ? '<div class="product-share-bar product-share-bar--rm-pdp cg-pdp__share-host" id="' + escAttr(shareHostId) + '" aria-label="Share"></div>'
      : "";
    var wishBtn = wishId
      ? '<button type="button" class="cg-pdp__wishlist-link" id="' +
        escAttr(wishId) +
        '" aria-label="Save to wishlist"><span aria-hidden="true">♡</span> Wishlist</button>'
      : "";
    return (
      '<div class="cg-pdp__title-row">' +
      '<h1 class="rm-pdp__title cg-pdp__title">' +
      esc(title) +
      "</h1>" +
      '<div class="cg-pdp__title-actions">' +
      shareHost +
      wishBtn +
      "</div></div>"
    );
  }

  function buildThumbButtons(entries, activeIdx, imgSrcFn, maxVisible) {
    maxVisible = maxVisible == null ? MAX_VISIBLE_THUMBS : maxVisible;
    var visible = [];
    for (var ti = 0; ti < entries.length; ti++) {
      var ent = entries[ti];
      if (!String(ent.url || "").trim()) continue;
      visible.push({ ent: ent, ti: ti });
    }
    var hiddenCount = Math.max(0, visible.length - maxVisible);

    var html = "";
    visible.forEach(function (row, vi) {
      var ent = row.ent;
      var ti = row.ti;
      var u = ent.url || "";
      var syncAttr = "";
      if (ent.kind === "color" && ent.cid) {
        syncAttr = ' data-gallery-sync="color" data-gallery-cid="' + escAttr(ent.cid) + '"';
      } else if (ent.kind === "size" && ent.sid) {
        syncAttr = ' data-gallery-sync="size" data-gallery-sid="' + escAttr(ent.sid) + '"';
      } else if (ent.kind === "qty" && ent.qid) {
        syncAttr = ' data-gallery-sync="qty" data-gallery-qid="' + escAttr(ent.qid) + '"';
      }
      var hiddenAttr = hiddenCount > 0 && vi >= maxVisible ? " hidden" : "";
      html +=
        '<button type="button" class="rm-pdp__thumb cg-pdp__thumb' +
        (ti === activeIdx ? " is-active" : "") +
        '" data-img-idx="' +
        ti +
        '"' +
        syncAttr +
        hiddenAttr +
        '><img src="' +
        escAttr(imgSrcFn(u)) +
        '" alt="" width="72" height="72" loading="lazy" /></button>';
    });
    if (hiddenCount > 0) {
      html +=
        '<button type="button" class="cg-pdp__more-views" data-cg-pdp-more-views aria-label="' +
        escAttr("+" + hiddenCount + " more views") +
        '">+' +
        hiddenCount +
        "<br><span>More Views</span></button>";
    }
    return html;
  }

  function singleBuyMessage(opts) {
    opts = opts || {};
    var name = String(opts.productName || opts.name || "product").trim();
    var qty = opts.qty != null ? opts.qty : 1;
    var price = opts.price != null ? opts.price : "";
    var variant = String(opts.variantLabel || "").trim();
    var url = opts.productUrl || (global.location && global.location.href) || "";
    var WA = global.CRAFTGURU_WA;
    if (WA && typeof WA.absoluteUrl === "function") url = WA.absoluteUrl(url);
    var lines = ["Hi, I'd like to buy this product.", "", "Product: " + name];
    if (variant) lines.push("Variant: " + variant);
    lines.push("Quantity: " + qty);
    if (price !== "") lines.push("Price: " + price);
    lines.push("URL: " + url);
    return lines.join("\n");
  }

  function wireFullscreen(root) {
    if (!root || root.dataset.cgPdpFsWired === "1") return;
    root.dataset.cgPdpFsWired = "1";
    root.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("[data-cg-pdp-fullscreen]");
      if (!btn || !root.contains(btn)) return;
      var img =
        root.querySelector("#rmPdpHeroImg") ||
        root.querySelector("#resinPdpHero") ||
        root.querySelector("#productImage") ||
        root.querySelector(".rm-pdp__hero-zoom img");
      if (!img || !img.src) return;
      var overlay = document.createElement("div");
      overlay.className = "cg-pdp__lightbox";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Product image fullscreen");
      overlay.innerHTML =
        '<button type="button" class="cg-pdp__lightbox-close" aria-label="Close">✕</button>' +
        '<img src="' +
        escAttr(img.src) +
        '" alt="' +
        escAttr(img.alt || "") +
        '" />';
      function close() {
        overlay.remove();
        document.body.classList.remove("cg-pdp-lightbox-open");
      }
      overlay.addEventListener("click", function (ev) {
        if (ev.target === overlay || ev.target.closest(".cg-pdp__lightbox-close")) close();
      });
      document.addEventListener(
        "keydown",
        function onKey(ev) {
          if (ev.key === "Escape") {
            close();
            document.removeEventListener("keydown", onKey);
          }
        },
        { once: true }
      );
      document.body.classList.add("cg-pdp-lightbox-open");
      document.body.appendChild(overlay);
    });
  }

  function wireWhatsAppBuy(btn, getOpts) {
    if (!btn || btn.dataset.cgWaWired === "1") return;
    btn.dataset.cgWaWired = "1";
    btn.addEventListener("click", function () {
      var opts = typeof getOpts === "function" ? getOpts() : getOpts || {};
      var WA = global.CRAFTGURU_WA;
      var msg = singleBuyMessage(opts);
      var url = WA && WA.buildUrl ? WA.buildUrl(msg) : "https://wa.me/918824350056?text=" + encodeURIComponent(msg);
      try {
        global.open(url, "_blank", "noopener,noreferrer");
      } catch (_) {
        global.location.href = url;
      }
    });
  }

  function wireMoreViews(root) {
    if (!root || root.dataset.cgPdpMvWired === "1") return;
    root.dataset.cgPdpMvWired = "1";
    root.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("[data-cg-pdp-more-views]");
      if (!btn || !root.contains(btn)) return;
      var track = root.querySelector(".rm-pdp-thumb-track");
      if (!track) return;
      track.querySelectorAll(".rm-pdp__thumb[hidden]").forEach(function (thumb) {
        thumb.removeAttribute("hidden");
      });
      btn.setAttribute("hidden", "");
    });
  }

  function mountBottomSections(container, productType) {
    if (!container) return;
    var existing = container.querySelector(".cg-pdp__service-banner");
    if (existing) return;
    var wrap = document.createElement("div");
    wrap.className = "cg-pdp__bottom";
    wrap.innerHTML = bottomSectionsHtml(productType);
    container.appendChild(wrap);
  }

  global.CraftguruPremiumPdp = {
    PREPAID_DISCOUNT_PCT: PREPAID_DISCOUNT_PCT,
    MAX_VISIBLE_THUMBS: MAX_VISIBLE_THUMBS,
    esc: esc,
    escAttr: escAttr,
    featurePillsHtml: featurePillsHtml,
    fullscreenBtnHtml: fullscreenBtnHtml,
    discountBannerHtml: discountBannerHtml,
    categoryTagHtml: categoryTagHtml,
    priceTaxNoteHtml: priceTaxNoteHtml,
    trustRowHtml: trustRowHtml,
    buyActionsRowHtml: buyActionsRowHtml,
    serviceBannerHtml: serviceBannerHtml,
    qualityBannerHtml: qualityBannerHtml,
    qualityFeaturesForType: qualityFeaturesForType,
    bottomSectionsHtml: bottomSectionsHtml,
    titleRowHtml: titleRowHtml,
    buildThumbButtons: buildThumbButtons,
    singleBuyMessage: singleBuyMessage,
    wireFullscreen: wireFullscreen,
    wireWhatsAppBuy: wireWhatsAppBuy,
    wireMoreViews: wireMoreViews,
    mountBottomSections: mountBottomSections,
  };
})(typeof window !== "undefined" ? window : this);
