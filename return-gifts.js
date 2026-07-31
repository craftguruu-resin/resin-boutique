(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART || !D.listProductsAll) return;

  var DEFAULT_SORT = "name-asc";
  var PLP = window.CraftguruProductListing;
  var rgPlpMounted = false;

  function mountRgPlpOnce() {
    if (rgPlpMounted || !PLP) return;
    var grid = document.getElementById("rgGrid");
    if (!grid) return;
    rgPlpMounted = true;
    PLP.mountListingShell({
      gridEl: grid,
      storageKey: "plp-view-return-gifts",
    });
  }

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

  function productPageUrl(id) {
    var path = "product.html?id=" + encodeURIComponent(id);
    try {
      return new URL(path, window.location.href).href;
    } catch (_) {
      return path;
    }
  }

  function bulkBuyCardHtml(p) {
    var WA = window.CRAFTGURU_WA;
    if (!WA || typeof WA.listingButtonHtml !== "function") return "";
    return WA.listingButtonHtml({
      productName: p.name,
      productId: p.id,
      productUrl: productPageUrl(p.id),
    });
  }

  function minPrice(p) {
    if (D.getStartingPriceInr) {
      return D.getStartingPriceInr(p) || 0;
    }
    if (!p || !p.prices) return 0;
    var keys = ["s", "m", "l"];
    var m = null;
    keys.forEach(function (k) {
      var v = Number(p.prices[k]);
      if (!Number.isFinite(v) || v <= 0) return;
      if (m === null || v < m) m = v;
    });
    return m == null ? 0 : m;
  }

  function fromPriceLabel(p) {
    if (D.formatStartingFromPrice) {
      return D.formatStartingFromPrice(p, CART.formatMoney);
    }
    var minP = minPrice(p);
    return minP > 0 ? "From " + CART.formatMoney(minP) : "";
  }

  function sortItems(items) {
    var arr = items.slice();
    arr.sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
    });
    return arr;
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

  function filterBySearch(items) {
    var gf = document.getElementById("globalFindQuery");
    var q = gf ? String(gf.value || "").trim() : "";
    if (!q || !D || typeof D.partialTokenMatch !== "function") return items;
    return items.filter(function (p) {
      var hay = D.productSearchHaystack
        ? D.productSearchHaystack(p)
        : ((p.name || "") + " " + (p.id || "")).toLowerCase();
      return D.partialTokenMatch(hay, q);
    });
  }

  function wireReturnGiftsSearchOnce() {
    var gf = document.getElementById("globalFindQuery");
    if (!gf || gf.dataset.rgSearchWired === "1") return;
    gf.dataset.rgSearchWired = "1";
    gf.addEventListener("input", function () {
      paint();
    });
  }

  function paint() {
    wireReturnGiftsSearchOnce();
    mountRgPlpOnce();
    var grid = document.getElementById("rgGrid");
    if (!grid) return;
    grid.className = "plp-grid product-grid";
    var base = collectReturnGifts();
    var items = sortItems(filterBySearch(base));
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML =
        '<p class="band-empty" style="grid-column:1/-1">No corporate gifting pieces match your search. Try different words in the header.</p>';
      return;
    }
    items.forEach(function (p, i) {
      var minP = minPrice(p);
      var pHref = "product.html?id=" + encodeURIComponent(p.id);
      var priceLabel = fromPriceLabel(p);
      var buildCard = PLP && PLP.buildProductCard;
      var card;
      if (buildCard) {
        card = buildCard({
          href: pHref,
          ctaHref: pHref,
          name: p.name,
          productId: p.id,
          productName: p.name,
          productUrl: productPageUrl(p.id),
          priceLabel: priceLabel,
          minPrice: minP > 0 ? String(minP) : "",
          imgSrc: p.image ? imgSrc(p.image) : "",
          imgFit: D.getProductCoverImageFit ? D.getProductCoverImageFit(p) : "",
          wishlistKind: "catalog",
          ctaText: "View options →",
          stagger: i,
        });
        if (D.productSearchHaystack) {
          card.setAttribute("data-search-text", D.productSearchHaystack(p));
        }
      } else {
        card = document.createElement("article");
        card.className = "plp-card is-inview";
        card.style.setProperty("--stagger", String(i));
        card.innerHTML =
          '<a class="plp-card__hit" href="' +
          escAttr(pHref) +
          '"></a><div class="plp-card__body"><h3 class="plp-card__name">' +
          esc(p.name) +
          '</h3><p class="plp-card__price">' +
          esc(priceLabel) +
          '</p></div><div class="plp-card__actions"><a class="plp-card__cta" href="' +
          escAttr(pHref) +
          '">View options →</a>' +
          bulkBuyCardHtml(p) +
          "</div>";
      }
      grid.appendChild(card);
    });
    if (PLP && PLP.wireAllCardWishlists) PLP.wireAllCardWishlists(grid);
  }

  window.addEventListener("craftguruCatalogVendorProductsMerged", function () {
    paint();
  });
  window.addEventListener("craftguruCatalogPricesMerged", function () {
    paint();
  });
  window.addEventListener("craftguruCatalogCategoriesMerged", function () {
    paint();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint);
  } else {
    paint();
  }

  window.addEventListener("craftguruCatalogPricesMerged", paint);
})();
