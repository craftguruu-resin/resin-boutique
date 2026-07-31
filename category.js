(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART || !D.listProductsAll) return;

  var els = {
    heading: document.getElementById("categoryHeading"),
    desc: document.getElementById("categoryDesc"),
    crumbCat: document.getElementById("crumbCat"),
    crumbSubWrap: document.getElementById("crumbSubWrap"),
    crumbSubLabel: document.getElementById("crumbSubLabel"),
    sub: document.getElementById("categorySub"),
    flowStep: document.getElementById("categoryFlowStep"),
    pager: document.getElementById("pagination"),
    subGrid: document.getElementById("subcategoryGrid"),
    productGrid: document.getElementById("productGrid"),
  };

  var PLP = window.CraftguruProductListing;
  var plpShellMounted = false;

  function mountPlpShellOnce() {
    if (plpShellMounted || !PLP || !els.productGrid) return;
    plpShellMounted = true;
    PLP.mountListingShell({
      gridEl: els.productGrid,
      storageKey: "plp-view-category",
    });
  }

  function gfQuery() {
    return document.getElementById("globalFindQuery");
  }
  function gfSort() {
    return document.getElementById("globalFindSort");
  }
  function gfHint() {
    return document.getElementById("globalFindHint");
  }
  function gfPriceCap() {
    return document.getElementById("globalFindPriceCap");
  }

  /** On category page, sort is internal only (header search remains the user-facing filter). */
  function categorySortEl() {
    return null;
  }

  function effectiveSort() {
    var allowed = { relevance: 1, "name-asc": 1, "name-desc": 1, "price-asc": 1, "price-desc": 1 };
    return allowed[urlSort] ? urlSort : DEFAULT_SORT;
  }

  function categoryPriceMinEl() {
    return document.getElementById("categoryPriceMin");
  }

  function categoryPriceMaxEl() {
    return document.getElementById("categoryPriceMax");
  }

  function partialTokenMatch(haystack, queryRaw) {
    var h = String(haystack || "")
      .toLowerCase()
      .replace(/\s+/g, " ");
    var q = String(queryRaw || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!q) return true;
    var parts = q.split(" ").filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      if (h.indexOf(parts[i]) === -1) return false;
    }
    return true;
  }

  function productSearchHaystack(p) {
    var bits = [(p.name || "").toLowerCase()];
    var mp = minPrice(p);
    bits.push(String(mp));
    if (CART.formatMoney) {
      bits.push(CART.formatMoney(mp).toLowerCase().replace(/\s/g, ""));
      ["s", "m", "l"].forEach(function (k) {
        if (p.prices && p.prices[k] != null) {
          bits.push(String(p.prices[k]));
          bits.push(CART.formatMoney(p.prices[k]).toLowerCase().replace(/\s/g, ""));
        }
      });
    }
    return bits.join(" ").replace(/\s+/g, " ");
  }

  /** Default when no visible sort control — stable popularity order. */
  var DEFAULT_SORT = "relevance";

  var params = new URLSearchParams(window.location.search);
  var cat = D.normalizeCategoryId(params.get("cat"));
  var page = parseInt(params.get("page") || "1", 10) || 1;
  var urlQ = (params.get("q") || "").trim();
  var urlSort = params.get("sort") || DEFAULT_SORT;
  var urlMinp = (params.get("minp") || "").trim();
  var urlMaxp = (params.get("maxp") || "").trim();

  function liveCatalogList() {
    return D.listProductsAll(cat, null);
  }

  var activeSubId = "";
  var labelForList = "";
  var subLabelForList = "";
  var multiSub = false;
  var catalogBarWired = false;
  var gfInputWired = false;
  var categoryToolbarWired = false;
  var filterInputTimer = null;
  var categoryPriceDualApi = null;
  var categoryPriceDualWired = false;

  function categoryFilterViewEl() {
    return document.getElementById("categoryFilterView");
  }
  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
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

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function bindCardTilt() {
    /* Disabled — mousemove tilt caused repaint flicker on card interaction */
  }

  /** Deterministic “curated” order so list does not jump when prices refresh in the background. */
  function fnv1a32(str) {
    var h = 2166136261 >>> 0;
    var s = String(str || "");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function curatedDisplayOrder(slice) {
    return slice.slice().sort(function (a, b) {
      return fnv1a32(a.id) - fnv1a32(b.id);
    });
  }

  function categoryUrl(c, pg, q, sort, minp, maxp) {
    var p = new URLSearchParams();
    p.set("cat", c);
    if (pg && pg > 1) p.set("page", String(pg));
    if (q) p.set("q", q);
    if (sort && sort !== DEFAULT_SORT) p.set("sort", sort);
    if (minp) p.set("minp", minp);
    else p.delete("minp");
    if (maxp) p.set("maxp", maxp);
    else p.delete("maxp");
    return "category.html?" + p.toString();
  }

  function minPrice(p) {
    if (D.getStartingPriceInr) {
      return D.getStartingPriceInr(p) || 0;
    }
    if (!p || !p.prices) return 0;
    var vals = [];
    ["s", "m", "l"].forEach(function (k) {
      var v = Number(p.prices[k]);
      if (Number.isFinite(v) && v > 0) vals.push(v);
    });
    return vals.length ? Math.min.apply(null, vals) : 0;
  }

  function fromPriceLabel(p) {
    if (D.formatStartingFromPrice) {
      return D.formatStartingFromPrice(p, CART.formatMoney);
    }
    var minP = minPrice(p);
    return minP > 0 ? "From " + CART.formatMoney(minP) : "";
  }

  function syncUrl() {
    var qEl = gfQuery();
    if (!qEl) return;
    var q = qEl.value.trim();
    var sort = effectiveSort();
    var u = new URL(window.location.href);
    if (q) u.searchParams.set("q", q);
    else u.searchParams.delete("q");
    if (sort && sort !== DEFAULT_SORT) u.searchParams.set("sort", sort);
    else u.searchParams.delete("sort");
    u.searchParams.delete("minp");
    u.searchParams.delete("maxp");
    if (page > 1) u.searchParams.set("page", String(page));
    else u.searchParams.delete("page");
    u.searchParams.set("cat", cat);
    u.searchParams.delete("sub");
    try {
      history.replaceState({}, "", u.pathname + "?" + u.searchParams.toString());
    } catch (_) {}
  }

  function getFilteredSortedItems() {
    var qEl = gfQuery();
    var q = (qEl && qEl.value) || "";
    q = String(q).trim();
    var sort = effectiveSort();
    var arr = liveCatalogList().slice();
    if (q) {
      arr = arr.filter(function (p) {
        return partialTokenMatch(productSearchHaystack(p), q);
      });
    }
    if (sort === "name-asc") {
      arr.sort(function (a, b) {
        return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
      });
    } else if (sort === "name-desc") {
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
    }
    return { items: arr, sort: sort };
  }

  function buildPageResult(filtered, sort) {
    var total = filtered.length;
    var ps = D.pageSize || 48;
    var pages = Math.max(1, Math.ceil(total / ps));
    page = Math.min(Math.max(1, page), pages);
    var start = (page - 1) * ps;
    var slice = filtered.slice(start, start + ps);
    var displayItems = sort === "relevance" ? curatedDisplayOrder(slice) : slice;
    return {
      items: displayItems,
      page: page,
      pages: pages,
      total: total,
      pageSize: ps,
      sort: sort,
    };
  }

  function updateCatalogHint(result, q) {
    var h = gfHint();
    if (!h) return;
    var qOn = !!(q && String(q).trim());
    var totalInCat = liveCatalogList().length;
    if (!qOn && result.total === totalInCat) {
      h.textContent = "Showing all " + result.total + " piece(s). Use search in the header to narrow results.";
    } else if (result.total === 0) {
      h.textContent = "No match — try different words in the header search.";
    } else {
      h.textContent = "Showing " + result.total + " of " + totalInCat + " piece(s).";
    }
  }

  function applyCatalogFilters(resetPage) {
    if (resetPage) page = 1;
    var fs = getFilteredSortedItems();
    var result = buildPageResult(fs.items, fs.sort);
    updateCatalogHint(result, (gfQuery() && gfQuery().value.trim()) || "");
    renderProductList(result, activeSubId, labelForList, multiSub ? subLabelForList : "");
    syncUrl();
  }

  function fillCategorySortSelectIfNeeded() {
    var sel = document.getElementById("categorySortSelect");
    if (!sel || sel.options.length) return;
    var rows = [
      ["relevance", "Popularity"],
      ["name-asc", "Name · A → Z"],
      ["name-desc", "Name · Z → A"],
      ["price-asc", "Price · low → high"],
      ["price-desc", "Price · high → low"],
    ];
    rows.forEach(function (o) {
      var op = document.createElement("option");
      op.value = o[0];
      op.textContent = o[1];
      sel.appendChild(op);
    });
  }

  function syncHeaderSortFromToolbar() {
    var t = document.getElementById("categorySortSelect");
    var g = gfSort();
    if (t && g && t.value) g.value = t.value;
  }

  function wireCatalogBarOnce() {
    if (catalogBarWired) return;
    catalogBarWired = true;
    var sEl = categorySortEl();
    if (sEl) {
      sEl.addEventListener("change", function () {
        syncHeaderSortFromToolbar();
        applyCatalogFilters(true);
      });
    }
    var fv = categoryFilterViewEl();
    if (fv) {
      fv.addEventListener("change", function () {
        applyCatalogFilters(true);
      });
    }
  }

  function wireCategoryToolbarOnce() {
    if (categoryToolbarWired) return;
    var minEl = categoryPriceMinEl();
    var maxEl = categoryPriceMaxEl();
    if (!minEl || !maxEl) return;
    categoryToolbarWired = true;
    var clr = document.getElementById("categoryFilterClear");
    if (clr) {
      clr.addEventListener("click", function () {
        minEl.value = "";
        maxEl.value = "";
        if (categoryPriceDualApi && typeof categoryPriceDualApi.reset === "function") {
          categoryPriceDualApi.reset();
        }
        var fv = categoryFilterViewEl();
        if (fv) fv.value = "all";
        var s = categorySortEl();
        if (s) s.value = DEFAULT_SORT;
        syncHeaderSortFromToolbar();
        var qIn = gfQuery();
        if (qIn) qIn.value = "";
        applyCatalogFilters(true);
      });
    }
  }

  function wireGlobalFindQueryOnce() {
    if (gfInputWired) return;
    var inp = gfQuery();
    if (!inp) return;
    gfInputWired = true;
    inp.addEventListener("input", function () {
      applyCatalogFilters(true);
    });
  }

  function setBarsProductMode() {
    if (window.GLOBAL_FIND) {
      window.GLOBAL_FIND.setSortBlockVisible(false);
      window.GLOBAL_FIND.clearHint();
    }
    var fw = document.getElementById("globalFindCategoryFilterWrap");
    if (fw) fw.hidden = true;
    var sw = document.getElementById("globalFindSortWrap");
    if (sw) sw.hidden = true;
  }

  function renderProductList(result, subId, label, subLabel) {
    if (els.subGrid) {
      els.subGrid.innerHTML = "";
      els.subGrid.hidden = true;
    }
    if (els.productGrid) els.productGrid.hidden = false;

    if (els.flowStep) els.flowStep.hidden = true;
    if (els.sub) {
      if (result.pages > 1) {
        els.sub.hidden = false;
        els.sub.textContent = "Page " + result.page + " of " + result.pages;
      } else {
        els.sub.textContent = "";
        els.sub.hidden = true;
      }
    }

    if (els.crumbSubWrap && els.crumbSubLabel) {
      if (subLabel) {
        els.crumbSubWrap.hidden = false;
        els.crumbSubLabel.textContent = subLabel;
      } else {
        els.crumbSubWrap.hidden = true;
      }
    }

    if (!els.productGrid) return;
    els.productGrid.innerHTML = "";

    if (result.items.length === 0) {
      els.productGrid.innerHTML =
        '<p class="band-empty" style="grid-column:1/-1">No products match your search. Try different words in the header.</p>';
      if (els.pager) els.pager.innerHTML = "";
      return;
    }

    result.items.forEach(function (p, i) {
      var minP = minPrice(p);
      var pHref = "product.html?id=" + encodeURIComponent(p.id);
      var cardFit = D.getProductCoverImageFit ? D.getProductCoverImageFit(p) : "";
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
          priceLabel: fromPriceLabel(p),
          minPrice: minP > 0 ? String(minP) : "",
          imgSrc: imgSrc(p.image),
          imgFit: cardFit,
          wishlistKind: "catalog",
          ctaText: "View options →",
          stagger: i,
        });
      } else {
        card = document.createElement("article");
        card.className = "plp-card is-inview";
        card.setAttribute("data-product-id", p.id);
        card.style.setProperty("--stagger", String(i));
        card.innerHTML =
          '<a class="plp-card__hit" href="' +
          escapeAttr(pHref) +
          '"></a><div class="plp-card__body"><h3 class="plp-card__name">' +
          escapeHtml(p.name) +
          '</h3><p class="plp-card__price">' +
          escapeHtml(fromPriceLabel(p)) +
          '</p></div><div class="plp-card__actions"><a class="plp-card__cta" href="' +
          escapeAttr(pHref) +
          '">View options →</a>' +
          bulkBuyCardHtml(p) +
          "</div>";
      }
      els.productGrid.appendChild(card);
    });
    if (PLP && PLP.wireAllCardWishlists) PLP.wireAllCardWishlists(els.productGrid);

    if (els.pager) {
      els.pager.innerHTML = "";
      if (result.pages <= 1) return;

      var qEl = gfQuery();
      var sEl = categorySortEl();
      var qNow = qEl ? qEl.value.trim() : "";
      var sortNow = sEl ? sEl.value : DEFAULT_SORT;
      var minEl = categoryPriceMinEl();
      var maxEl = categoryPriceMaxEl();
      var minpNow = minEl && minEl.value != null ? String(minEl.value).trim() : "";
      var maxpNow = maxEl && maxEl.value != null ? String(maxEl.value).trim() : "";

      function linkFor(pg) {
        return categoryUrl(cat, pg, qNow, sortNow, minpNow, maxpNow);
      }

      if (result.page > 1) {
        var prev = document.createElement("a");
        prev.className = "pager-btn";
        prev.href = linkFor(result.page - 1);
        prev.textContent = "← Previous";
        els.pager.appendChild(prev);
      }

      var info = document.createElement("span");
      info.className = "pager-info";
      info.textContent = "Page " + result.page + " / " + result.pages;
      els.pager.appendChild(info);

      if (result.page < result.pages) {
        var next = document.createElement("a");
        next.className = "pager-btn";
        next.href = linkFor(result.page + 1);
        next.textContent = "Next →";
        els.pager.appendChild(next);
      }
    }
  }

  function render() {
    labelForList = D.getCategoryLabel(cat);
    mountPlpShellOnce();
    if (els.heading) els.heading.textContent = labelForList;
    if (els.crumbCat) els.crumbCat.textContent = labelForList;
    if (els.desc && PLP) {
      els.desc.textContent = PLP.getCategoryDescription(cat);
    }
    document.title = labelForList + " — Craft guru";

    try {
      var uCur = new URL(window.location.href);
      if (uCur.searchParams.get("sub")) {
        uCur.searchParams.delete("sub");
        history.replaceState({}, "", uCur.pathname + "?" + uCur.searchParams.toString());
      }
    } catch (_) {}

    activeSubId = "";
    multiSub = false;
    subLabelForList = "";

    setBarsProductMode();
    fillCategorySortSelectIfNeeded();
    wireCatalogBarOnce();
    wireCategoryToolbarOnce();
    wireGlobalFindQueryOnce();

    var qIn = gfQuery();
    var sIn = categorySortEl();
    var minIn = categoryPriceMinEl();
    var maxIn = categoryPriceMaxEl();
    if (qIn) qIn.value = urlQ;
    if (sIn) {
      var allowed = { relevance: 1, "name-asc": 1, "name-desc": 1, "price-asc": 1, "price-desc": 1 };
      sIn.value = allowed[urlSort] ? urlSort : DEFAULT_SORT;
    }
    var numOk = function (s) {
      return /^[0-9]+(\.[0-9]+)?$/.test(String(s || "").trim());
    };
    if (minIn) {
      minIn.value = numOk(urlMinp) ? urlMinp : "";
    }
    if (maxIn) {
      var allowedCap = { "35": 1, "50": 1, "75": 1, "100": 1, "150": 1, "250": 1, "500": 1, "1000": 1 };
      if (urlMaxp && (allowedCap[urlMaxp] || numOk(urlMaxp))) {
        maxIn.value = urlMaxp;
      } else {
        maxIn.value = "";
      }
    }
    syncHeaderSortFromToolbar();

    if (window.CraftguruCatalogFilterUi) {
      if (!categoryPriceDualWired) {
        categoryPriceDualWired = true;
        categoryPriceDualApi = window.CraftguruCatalogFilterUi.wireDualPriceRange({
          rootId: "categoryFiltersPanel",
          rangeMinId: "categoryPriceRangeLo",
          rangeMaxId: "categoryPriceRangeHi",
          inputMinId: "categoryPriceMin",
          inputMaxId: "categoryPriceMax",
          labelId: "categoryPriceRangeLabel",
          absMax: 8000,
          step: 25,
          onCommit: function () {
            applyCatalogFilters(true);
          },
        });
      } else if (categoryPriceDualApi && categoryPriceDualApi.syncFromInputs) {
        categoryPriceDualApi.syncFromInputs();
      }
    }

    var fs = getFilteredSortedItems();
    var pages = Math.max(1, Math.ceil(fs.items.length / (D.pageSize || 48)));
    page = Math.min(Math.max(1, page), pages);
    var result = buildPageResult(fs.items, fs.sort);
    updateCatalogHint(result, urlQ);
    renderProductList(result, activeSubId, labelForList, multiSub ? subLabelForList : "");
    var rail = document.querySelector("#guestPageCategoryRail .category-grid--rail");
    if (window.CraftguruCategoryScroll && window.CraftguruCategoryScroll.scrollActivePill) {
      window.CraftguruCategoryScroll.scrollActivePill(rail);
    }
  }

  function patchProductGridPrices() {
    if (!els.productGrid) return;
    var cards = els.productGrid.querySelectorAll(".plp-card[data-product-id], .product-card[data-product-id]");
    if (!cards.length) return;
    cards.forEach(function (card) {
      var id = card.getAttribute("data-product-id");
      if (!id || !D.getProduct) return;
      var p = D.getProduct(id);
      if (!p) return;
      var minP = minPrice(p);
      card.setAttribute("data-min-price", String(minP));
      var fromEl = card.querySelector(".plp-card__price, .product-card__from");
      if (fromEl) {
        fromEl.textContent = fromPriceLabel(p);
      }
    });
  }

  function patchProductGridImageFit() {
    if (!els.productGrid) return;
    els.productGrid.querySelectorAll(".plp-card[data-product-id], .product-card[data-product-id]").forEach(function (card) {
      var id = card.getAttribute("data-product-id");
      if (!id || !D.getProduct) return;
      var p = D.getProduct(id);
      if (!p) return;
      var cardFit = D.getProductCoverImageFit ? D.getProductCoverImageFit(p) : "";
      if (PLP && PLP.applyCardImageFit) {
        PLP.applyCardImageFit(card, cardFit);
      } else {
        var cardImg = card.querySelector(".plp-card__media img, .product-card__media img, .product-card-image img");
        if (cardImg && window.CraftguruImageFit && window.CraftguruImageFit.applyImageFit) {
          window.CraftguruImageFit.applyImageFit(cardImg, cardFit);
        }
      }
    });
  }

  function onCatalogDataMerged() {
    labelForList = D.getCategoryLabel(cat);
    if (els.heading) els.heading.textContent = labelForList;
    if (els.crumbCat) els.crumbCat.textContent = labelForList;
    document.title = labelForList + " — Craft guru";
    if (els.productGrid && els.productGrid.querySelectorAll(".plp-card[data-product-id], .product-card[data-product-id]").length) {
      patchProductGridPrices();
      patchProductGridNames();
      patchProductGridImageFit();
      applyCatalogFilters(false);
    } else {
      applyCatalogFilters(false);
    }
  }

  function patchProductGridNames() {
    if (!els.productGrid) return;
    els.productGrid.querySelectorAll(".plp-card[data-product-id], .product-card[data-product-id]").forEach(function (card) {
      var id = card.getAttribute("data-product-id");
      if (!id || !D.getProduct) return;
      var p = D.getProduct(id);
      if (!p || !p.name) return;
      card.setAttribute("data-product-name", String(p.name).toLowerCase());
      var h = card.querySelector(".plp-card__name, h3");
      if (h) h.textContent = p.name;
      var img = card.querySelector(".plp-card__media img, .product-card-image img, img");
      if (img) img.alt = p.name;
    });
  }

  window.addEventListener("craftguruCatalogVendorProductsMerged", onCatalogDataMerged);
  window.addEventListener("craftguruCatalogPricesMerged", onCatalogDataMerged);
  window.addEventListener("craftguruCatalogCategoriesMerged", onCatalogDataMerged);

  render();
})();
