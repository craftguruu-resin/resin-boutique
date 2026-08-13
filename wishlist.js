(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  var PLP = window.CraftguruProductListing;
  var grid = document.getElementById("wishlistGrid");
  var emptyEl = document.getElementById("wishlistEmpty");

  function imgUrl(rel) {
    return D && D.imageUrl ? D.imageUrl(rel) : rel;
  }

  function productHref(id, kind) {
    var k = String(kind || "catalog").toLowerCase();
    if (k === "raw_material") return "raw-material-product.html?id=" + encodeURIComponent(id);
    if (k === "photo_frame") return "photo-frame-product.html?id=" + encodeURIComponent(id);
    return "product.html?id=" + encodeURIComponent(id);
  }

  function resolveCatalogProduct(id) {
    if (!D || typeof D.getProduct !== "function") return null;
    return D.getProduct(id);
  }

  function priceLabelForProduct(p) {
    if (!p || !D || typeof D.formatStartingFromPrice !== "function") return "";
    var fmt = CART && CART.formatMoney ? CART.formatMoney : null;
    return D.formatStartingFromPrice(p, fmt);
  }

  function paint() {
    if (!grid) return;
    var WL = window.RESIN_WISHLIST;
    var items = WL && WL.load ? WL.load() : [];
    grid.innerHTML = "";
    if (!items.length) {
      if (emptyEl) emptyEl.removeAttribute("hidden");
      return;
    }
    if (emptyEl) emptyEl.setAttribute("hidden", "hidden");

    items.forEach(function (row, i) {
      var id = String((row && row.productId) || "").trim();
      if (!id) return;
      var kind = String((row && row.kind) || "catalog").toLowerCase();
      var p = resolveCatalogProduct(id);
      var name = p && p.name ? p.name : id;
      var img = p && p.image ? p.image : "";
      var href = productHref(id, kind);
      var priceLabel = p ? priceLabelForProduct(p) : "";
      var cardFit = p && D.getProductCoverImageFit ? D.getProductCoverImageFit(p) : "";

      if (PLP && PLP.buildProductCard) {
        var card = PLP.buildProductCard({
          productId: id,
          productName: name,
          name: name,
          href: href,
          ctaHref: href,
          imgSrc: img ? imgUrl(img) : "",
          imgFit: cardFit,
          priceLabel: priceLabel,
          wishlistKind: kind,
          stagger: i,
        });
        grid.appendChild(card);
        return;
      }

      var article = document.createElement("article");
      article.className = "plp-card";
      article.innerHTML =
        '<a class="plp-card__hit" href="' +
        href +
        '"></a><div class="plp-card__body"><h3 class="plp-card__name">' +
        name +
        "</h3>" +
        (priceLabel ? "<p class='plp-card__price'>" + priceLabel + "</p>" : "") +
        "</div>";
      grid.appendChild(article);
    });

    if (PLP && PLP.wireAllCardWishlists) PLP.wireAllCardWishlists(grid);
  }

  function whenCatalogReady() {
    var cm = window.CraftguruCatalogMerge;
    if (cm && typeof cm.whenReady === "function") {
      return cm.whenReady().then(function () {
        paint();
      });
    }
    paint();
    return Promise.resolve();
  }

  window.addEventListener("resinWishlistChanged", paint);
  window.addEventListener("craftguruCatalogPricesMerged", paint);
  window.addEventListener("craftguruCatalogVendorProductsMerged", paint);

  whenCatalogReady();
})();
