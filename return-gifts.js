(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART || !D.listProductsAll) return;

  var DEFAULT_SORT = "name-asc";
  var rgControlsWired = false;
  var rgDualApi = null;
  var rgDualWired = false;

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
    var toolbar = document.getElementById("rgToolbar");
    var sel = sortSelect();
    if (!toolbar || !sel) return;
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
        rootId: "rgToolbar",
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

  function paint() {
    wireControlsOnce();
    var grid = document.getElementById("rgGrid");
    if (!grid) return;
    var base = collectReturnGifts();
    var items = sortItems(filterByPriceAndView(base));
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML =
        '<p class="band-empty" style="grid-column:1/-1">No return-gift pieces match these filters. Try clearing filters or changing the price range.</p>';
      syncReturnGiftsUrl();
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
        '" alt="" loading="lazy" decoding="async" />' +
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
    syncReturnGiftsUrl();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint);
  } else {
    paint();
  }

  window.addEventListener("craftguruCatalogPricesMerged", paint);
})();
