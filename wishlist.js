(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  var PLP = window.CraftguruProductListing;
  var grid = document.getElementById("wishlistGrid");
  var emptyEl = document.getElementById("wishlistEmpty");
  var liveProducts = Object.create(null);
  var liveProductsKey = "";
  var liveProductsPending = false;

  function imgUrl(rel) {
    return D && D.imageUrl ? D.imageUrl(rel) : rel;
  }

  function esc(s) {
    var el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  }

  function productHref(id, kind) {
    var k = String(kind || "catalog").toLowerCase();
    if (k === "raw_material") return "raw-material-product.html?id=" + encodeURIComponent(id);
    if (k === "photo_frame") return "photo-frame-product.html?id=" + encodeURIComponent(id);
    return "product.html?id=" + encodeURIComponent(id);
  }

  function resolveCatalogProduct(id) {
    var staticProduct = D && typeof D.getProduct === "function" ? D.getProduct(id) : null;
    return liveProducts[String(id || "")] || staticProduct || null;
  }

  function priceLabelForProduct(p) {
    if (!p) return "";
    var fmt = CART && CART.formatMoney ? CART.formatMoney : null;
    if (p.startingPrice != null && fmt) return "From " + fmt(p.startingPrice);
    if (!D || typeof D.formatStartingFromPrice !== "function") return "";
    return D.formatStartingFromPrice(p, fmt);
  }

  function apiBase() {
    try {
      var merge = window.CraftguruCatalogMerge;
      if (merge && typeof merge.getApiBase === "function") return String(merge.getApiBase() || "").replace(/\/+$/, "");
    } catch (_) {}
    try { return String(window.location.origin || "").replace(/\/+$/, ""); } catch (_) { return ""; }
  }

  function refreshLiveProducts(items) {
    var ids = (items || []).map(function (row) { return String((row && row.productId) || "").trim(); }).filter(Boolean).sort();
    var key = ids.join("|");
    var base = apiBase();
    if (!key || !base || liveProductsPending || key === liveProductsKey) return;
    liveProductsPending = true;
    fetch(base + "/api/catalog/resolve-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ productIds: ids }),
    })
      .then(function (res) { return res.json().then(function (body) { return { okHttp: res.ok, body: body || {} }; }); })
      .then(function (result) {
        if (!result.okHttp || !result.body.ok) return;
        liveProducts = Object.create(null);
        (result.body.products || []).forEach(function (product) {
          if (product && product.id) liveProducts[String(product.id)] = product;
        });
        liveProductsKey = key;
        paint(true);
      })
      .catch(function () {})
      .then(function () { liveProductsPending = false; });
  }

  function paint(skipRefresh) {
    if (!grid) return;
    var WL = window.RESIN_WISHLIST;
    var items = WL && WL.load ? WL.load() : [];
    grid.innerHTML = "";
    if (!items.length) {
      if (emptyEl) emptyEl.removeAttribute("hidden");
      return;
    }
    if (emptyEl) emptyEl.setAttribute("hidden", "hidden");
    if (!skipRefresh) refreshLiveProducts(items);

    items.forEach(function (row, i) {
      var id = String((row && row.productId) || "").trim();
      if (!id) return;
      var kind = String((row && row.kind) || "catalog").toLowerCase();
      var p = resolveCatalogProduct(id);
      var name = p && p.name ? p.name : id;
      var productImages = p && D && D.getProductImageCandidates && !p.startingPrice ? D.getProductImageCandidates(p) : [p && p.image];
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
          imgSrc: productImages[0] ? imgUrl(productImages[0]) : "",
          imgFallbacks: productImages.slice(1).map(imgUrl).filter(Boolean),
          imgFit: cardFit,
          priceLabel: priceLabel,
          wishlistKind: kind,
          stagger: i,
        });
        if (!p) {
          card.classList.add("is-unavailable");
          var unavailable = document.createElement("p");
          unavailable.className = "plp-card__availability";
          unavailable.setAttribute("role", "status");
          unavailable.textContent = "This item is no longer available.";
          card.querySelector(".plp-card__body") && card.querySelector(".plp-card__body").appendChild(unavailable);
        }
        grid.appendChild(card);
        return;
      }

      var article = document.createElement("article");
      article.className = "plp-card";
      article.innerHTML =
        '<a class="plp-card__hit" href="' +
        href +
        '"></a><div class="plp-card__body"><h3 class="plp-card__name">' +
        esc(name) +
        "</h3>" +
        (priceLabel ? "<p class='plp-card__price'>" + priceLabel + "</p>" : "<p class='plp-card__availability' role='status'>This item is no longer available.</p>") +
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
  window.addEventListener("craftguruCatalogCategoriesMerged", paint);

  whenCatalogReady();
})();
