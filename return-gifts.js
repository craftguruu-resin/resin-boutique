(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART || !D.listProductsAll) return;

  var DEFAULT_SORT = "name-asc";
  var rgControlsWired = false;
  var rgDualApi = null;
  var rgDualWired = false;
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
      filtersToggleId: "rgFiltersToggle",
      filtersPanelId: "rgFiltersPanel",
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

  function sortSelect() {
    return document.getElementById("rgSortSelect");
  }

  function filterViewEl() {
    return document.getElementById("rgFilterView");
  }

  function allowedSort(s) {
    return { "name-asc": 1, "name-desc": 1, "price-asc": 1, "price-desc": 1 }[s] ? s : DEFAULT_SORT;
  }

  function syncReturnGiftsUrl() {
    var sel = sortSelect();
    if (!sel) return;
    try {
      var u = new URL(window.location.href);
      var sort = allowedSort(sel.value);
      if (sort !== DEFAULT_SORT) u.searchParams.set("sort", sort);
      else u.searchParams.delete("sort");
      var minEl = document.getElementById("rgPriceMin");
      var maxEl = document.getElementById("rgPriceMax");
      var lo = minEl && String(minEl.value || "").trim();
      var hi = maxEl && String(maxEl.value || "").trim();
      if (lo && /^[0-9]+(\.[0-9]+)?$/.test(lo)) u.searchParams.set("minp", lo);
      else u.searchParams.delete("minp");
      if (hi && /^[0-9]+(\.[0-9]+)?$/.test(hi)) u.searchParams.set("maxp", hi);
      else u.searchParams.delete("maxp");
      history.replaceState({}, "", u.pathname + (u.search ? "?" + u.searchParams.toString() : ""));
    } catch (_) {}
  }

  function sortItems(items) {
    var sel = sortSelect();
    var sort = sel ? allowedSort(sel.value) : DEFAULT_SORT;
    var arr = items.slice();
    if (sort === "name-desc") {
      arr.sort(function (a, b) {
        return String(b.name || "").localeCompare(String(a.name || ""), undefined, { sensitivity: "base" });
      });
    } else if (sort === "price-asc") {
      arr.sort(function (a, b) {
        return minPrice(a) - minPrice(b);
      });
    } else if (sort === "price-desc") {
      arr.sort(function (a, b) {
        return minPrice(b) - minPrice(a);
      });
    } else {
      arr.sort(function (a, b) {
        return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
      });
    }
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

  function filterByPriceAndView(items) {
    var arr = items.slice();
    var fv = filterViewEl();
    if (fv && fv.value === "photo") {
      arr = arr.filter(function (p) {
        return !!(p && String(p.image || "").trim());
      });
    }
    var minEl = document.getElementById("rgPriceMin");
    var maxEl = document.getElementById("rgPriceMax");
    var lo = minEl && String(minEl.value || "").trim() !== "" ? parseFloat(minEl.value, 10) : NaN;
    var hi = maxEl && String(maxEl.value || "").trim() !== "" ? parseFloat(maxEl.value, 10) : NaN;
    if (Number.isFinite(lo)) {
      arr = arr.filter(function (p) {
        return minPrice(p) >= lo;
      });
    }
    if (Number.isFinite(hi)) {
      arr = arr.filter(function (p) {
        return minPrice(p) <= hi;
      });
    }
    return arr;
  }

  function wireControlsOnce() {
    if (rgControlsWired) return;
    var sel = sortSelect();
    if (!sel) return;
    rgControlsWired = true;
    var params = new URLSearchParams(window.location.search);
    sel.value = allowedSort(params.get("sort") || DEFAULT_SORT);
    sel.addEventListener("change", function () {
      syncReturnGiftsUrl();
      paint();
    });
    var fv = filterViewEl();
    if (fv) {
      fv.addEventListener("change", function () {
        paint();
        syncReturnGiftsUrl();
      });
    }
    var minEl = document.getElementById("rgPriceMin");
    var maxEl = document.getElementById("rgPriceMax");
    var numOk = function (s) {
      return /^[0-9]+(\.[0-9]+)?$/.test(String(s || "").trim());
    };
    if (minEl && numOk(params.get("minp"))) minEl.value = params.get("minp").trim();
    if (maxEl && numOk(params.get("maxp"))) maxEl.value = params.get("maxp").trim();

    if (window.CraftguruCatalogFilterUi && !rgDualWired) {
      rgDualWired = true;
      rgDualApi = window.CraftguruCatalogFilterUi.wireDualPriceRange({
        rootId: "rgFiltersPanel",
        rangeMinId: "rgPriceRangeLo",
        rangeMaxId: "rgPriceRangeHi",
        inputMinId: "rgPriceMin",
        inputMaxId: "rgPriceMax",
        labelId: "rgPriceRangeLabel",
        absMax: 8000,
        step: 25,
        onCommit: function () {
          paint();
          syncReturnGiftsUrl();
        },
      });
    } else if (rgDualApi && rgDualApi.syncFromInputs) {
      rgDualApi.syncFromInputs();
    }

    var clr = document.getElementById("rgFilterClear");
    if (clr) {
      clr.addEventListener("click", function () {
        if (minEl) minEl.value = "";
        if (maxEl) maxEl.value = "";
        if (rgDualApi && typeof rgDualApi.reset === "function") rgDualApi.reset();
        if (fv) fv.value = "all";
        sel.value = DEFAULT_SORT;
        paint();
        syncReturnGiftsUrl();
      });
    }
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
    wireControlsOnce();
    mountRgPlpOnce();
    var grid = document.getElementById("rgGrid");
    if (!grid) return;
    grid.className = "plp-grid featured-collections-grid";
    var base = collectReturnGifts();
    var items = sortItems(filterByPriceAndView(filterBySearch(base)));
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML =
        '<p class="band-empty" style="grid-column:1/-1">No corporate gifting pieces match these filters. Try clearing filters or changing the price range.</p>';
      syncReturnGiftsUrl();
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
    syncReturnGiftsUrl();
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
