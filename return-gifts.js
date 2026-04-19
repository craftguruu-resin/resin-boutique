(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART || !D.listProductsAll) return;

  var DEFAULT_SORT = "name-asc";
  var rgSortWired = false;

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

  function sortSelect() {
    return document.getElementById("rgSortSelect");
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

  function wireSortOnce() {
    if (rgSortWired) return;
    var sel = sortSelect();
    if (!sel) return;
    rgSortWired = true;
    var params = new URLSearchParams(window.location.search);
    sel.value = allowedSort(params.get("sort") || DEFAULT_SORT);
    sel.addEventListener("change", function () {
      syncReturnGiftsUrl();
      paint();
    });
  }

  function paint() {
    wireSortOnce();
    var grid = document.getElementById("rgGrid");
    if (!grid) return;
    var items = sortItems(collectReturnGifts());
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML =
        '<p class="band-empty" style="grid-column:1/-1">No return-gift pieces yet. Vendors can flag products in <strong>Products</strong> admin.</p>';
      return;
    }
    items.forEach(function (p, i) {
      var minP = minPrice(p);
      var card = document.createElement("article");
      card.className = "product-card reveal-tile is-inview";
      card.style.setProperty("--stagger", String(i));
      card.innerHTML =
        '<a class="product-card__link" href="product.html?id=' +
        encodeURIComponent(p.id) +
        '" aria-label="View ' +
        escAttr(p.name) +
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
