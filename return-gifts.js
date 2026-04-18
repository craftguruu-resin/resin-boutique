(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART || !D.listProductsAll) return;

  function esc(s) {
    var el = document.createElement("div");
    el.textContent = s;
    return el.innerHTML;
  }

  function escAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  function imgSrc(rel) {
    return D.imageUrl ? D.imageUrl(rel) : rel;
  }

  function minPrice(p) {
    if (!p || !p.prices) return 0;
    var keys = ["s", "m", "l"];
    var m = null;
    keys.forEach(function (k) {
      var v = p.prices[k];
      if (v == null || !Number.isFinite(Number(v))) return;
      if (m === null || v < m) m = v;
    });
    return m == null ? 0 : m;
  }

  function collectReturnGifts() {
    var out = [];
    var seen = {};
    (D.categories || []).forEach(function (c) {
      if (!c) return;
      D.listProductsAll(c.id, null).forEach(function (p) {
        if (!p || !p.returnGift || seen[p.id]) return;
        seen[p.id] = 1;
        out.push(p);
      });
    });
    return out;
  }

  function paint() {
    var grid = document.getElementById("rgGrid");
    if (!grid) return;
    var items = collectReturnGifts();
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML =
        '<p class="band-empty" style="grid-column:1/-1">No return-gift pieces yet. Vendors can flag products in <strong>Products</strong> admin.</p>';
      return;
    }
    items.forEach(function (p, i) {
      var minP = minPrice(p);
      var oos = !!p.outOfStock;
      var card = document.createElement("article");
      card.className = "product-card reveal-tile is-inview" + (oos ? " product-card--out-of-stock" : "");
      card.style.setProperty("--stagger", String(i));
      card.innerHTML =
        '<a class="product-card__link" href="product.html?id=' +
        encodeURIComponent(p.id) +
        '"' +
        (oos ? ' tabindex="-1" aria-disabled="true"' : "") +
        ' aria-label="View ' +
        escAttr(p.name) +
        (oos ? " (out of stock)" : "") +
        '"></a>' +
        '<div class="product-card__shine" aria-hidden="true"></div>' +
        '<div class="product-card-image">' +
        '<div class="product-card-share">' +
        '<button type="button" class="product-card-share__btn">Share</button>' +
        '<div class="product-card-share__pop" hidden aria-hidden="true"></div>' +
        "</div>" +
        '<span class="product-badge">Return gift</span>' +
        '<div class="product-card__media">' +
        '<img src="' +
        escAttr(imgSrc(p.image)) +
        '" alt="" loading="lazy" width="600" height="450" />' +
        "</div>" +
        (oos
          ? '<div class="product-card__oos-overlay" role="status"><span class="product-card__oos-title">Out of stock</span><span class="product-card__oos-note">Contact the seller to order.</span></div>'
          : "") +
        "</div>" +
        '<div class="product-card-body">' +
        "<h3>" +
        esc(p.name) +
        "</h3>" +
        '<p class="product-card__from">From ' +
        CART.formatMoney(minP) +
        "</p>" +
        '<div class="product-meta">' +
        '<a class="add-btn add-btn--mini" href="product.html?id=' +
        encodeURIComponent(p.id) +
        '">Open piece →</a>' +
        "</div>" +
        "</div>";
      grid.appendChild(card);
      var sbtn = card.querySelector(".product-card-share__btn");
      if (sbtn && window.CRAFTGURU_SHARE && window.CRAFTGURU_SHARE.mountCardShare) {
        window.CRAFTGURU_SHARE.mountCardShare(sbtn, { id: p.id, name: p.name });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint);
  } else {
    paint();
  }

  window.addEventListener("craftguruCatalogPricesMerged", paint);
})();
