(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART || !D.listProductsAll) return;

  var els = {
    heading: document.getElementById("categoryHeading"),
    crumbCat: document.getElementById("crumbCat"),
    crumbCatLink: document.getElementById("crumbCatLink"),
    crumbSubWrap: document.getElementById("crumbSubWrap"),
    crumbSubLabel: document.getElementById("crumbSubLabel"),
    sub: document.getElementById("categorySub"),
    flowStep: document.getElementById("categoryFlowStep"),
    pager: document.getElementById("pagination"),
    subGrid: document.getElementById("subcategoryGrid"),
    productGrid: document.getElementById("productGrid"),
  };

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

  var params = new URLSearchParams(window.location.search);
  var cat = D.normalizeCategoryId(params.get("cat"));
  var page = parseInt(params.get("page") || "1", 10) || 1;
  var urlQ = (params.get("q") || "").trim();
  var urlSort = params.get("sort") || "relevance";
  var urlMaxp = (params.get("maxp") || "").trim();

  function liveCatalogList() {
    return D.listProductsAll(cat, null);
  }

  var activeSubId = "";
  var labelForList = "";
  var subLabelForList = "";
  var multiSub = false;
  var catalogBarWired = false;
  var priceCapWired = false;
  var gfInputWired = false;
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

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function bindCardTilt(cards) {
    if (prefersReducedMotion()) return;
    cards.forEach(function (card) {
      card.addEventListener(
        "mousemove",
        function (e) {
          var r = card.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width - 0.5;
          var y = (e.clientY - r.top) / r.height - 0.5;
          card.style.setProperty("--ty", (x * 11).toFixed(2) + "deg");
          card.style.setProperty("--tx", (y * -9).toFixed(2) + "deg");
        },
        { passive: true }
      );
      card.addEventListener("mouseleave", function () {
        card.style.setProperty("--tx", "0deg");
        card.style.setProperty("--ty", "0deg");
      });
    });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function categoryUrl(c, pg, q, sort, maxp) {
    var p = new URLSearchParams();
    p.set("cat", c);
    if (pg && pg > 1) p.set("page", String(pg));
    if (q) p.set("q", q);
    if (sort && sort !== "relevance") p.set("sort", sort);
    if (maxp) p.set("maxp", maxp);
    return "category.html?" + p.toString();
  }

  function minPrice(p) {
    if (!p || !p.prices) return 0;
    var vals = [];
    ["s", "m", "l"].forEach(function (k) {
      if (p.prices[k] != null && !isNaN(p.prices[k])) vals.push(p.prices[k]);
    });
    return vals.length ? Math.min.apply(null, vals) : 0;
  }

  function syncUrl() {
    var qEl = gfQuery();
    var sEl = gfSort();
    var capEl = gfPriceCap();
    if (!qEl || !sEl) return;
    var q = qEl.value.trim();
    var sort = sEl.value || "relevance";
    var maxp = capEl && capEl.value ? capEl.value.trim() : "";
    var u = new URL(window.location.href);
    if (q) u.searchParams.set("q", q);
    else u.searchParams.delete("q");
    if (sort && sort !== "relevance") u.searchParams.set("sort", sort);
    else u.searchParams.delete("sort");
    if (maxp) u.searchParams.set("maxp", maxp);
    else u.searchParams.delete("maxp");
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
    var sEl = gfSort();
    var q = (qEl && qEl.value) || "";
    q = String(q).trim();
    var sort = (sEl && sEl.value) || "relevance";
    var arr = liveCatalogList().slice();
    if (q) {
      arr = arr.filter(function (p) {
        return partialTokenMatch(productSearchHaystack(p), q);
      });
    }
    var capEl = gfPriceCap();
    var cap = capEl && capEl.value ? parseFloat(capEl.value, 10) : NaN;
    if (!isNaN(cap)) {
      arr = arr.filter(function (p) {
        return minPrice(p) <= cap;
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
    var displayItems = sort === "relevance" ? shuffle(slice) : slice;
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
    var capEl = gfPriceCap();
    var capOn = capEl && capEl.value;
    var qOn = !!(q && String(q).trim());
    var totalInCat = liveCatalogList().length;
    if (!qOn && !capOn && result.total === totalInCat) {
      h.textContent = "Showing all " + result.total + " piece(s). Search, price cap, or sort in the header.";
    } else if (result.total === 0) {
      h.textContent = "No match — try shorter words, clear the price cap, or reset sort.";
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

  function wireCatalogBarOnce() {
    if (catalogBarWired) return;
    catalogBarWired = true;
    var sEl = gfSort();
    if (sEl) {
      sEl.addEventListener("change", function () {
        applyCatalogFilters(true);
      });
    }
  }

  function wirePriceCapOnce() {
    if (priceCapWired) return;
    var cap = gfPriceCap();
    if (!cap) return;
    priceCapWired = true;
    cap.addEventListener("change", function () {
      applyCatalogFilters(true);
    });
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
      window.GLOBAL_FIND.setSortBlockVisible(true);
      window.GLOBAL_FIND.clearHint();
    }
    var fw = document.getElementById("globalFindCategoryFilterWrap");
    if (fw) fw.hidden = false;
  }

  function renderProductList(result, subId, label, subLabel) {
    if (els.subGrid) {
      els.subGrid.innerHTML = "";
      els.subGrid.hidden = true;
    }
    if (els.productGrid) els.productGrid.hidden = false;

    if (els.flowStep) {
      els.flowStep.innerHTML =
        '<span class="flow-step__n">Shop</span> Choose a piece — <span class="flow-step__muted">size &amp; price on the next page</span>';
    }

    if (els.sub) {
      if (result.pages <= 1) {
        els.sub.textContent =
          result.total + " pieces" + (subLabel ? " · " + subLabel : "") + " — tap one to continue";
      } else {
        els.sub.textContent =
          result.total +
          " pieces · page " +
          result.page +
          " of " +
          result.pages +
          (subLabel ? " · " + subLabel : "");
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
        '<p class="band-empty" style="grid-column:1/-1">No products match your filters. Clear search or change sort.</p>';
      if (els.pager) els.pager.innerHTML = "";
      return;
    }

    result.items.forEach(function (p, i) {
      var minP = minPrice(p);
      var oos = !!p.outOfStock;
      var card = document.createElement("article");
      card.className = "product-card reveal-tile is-inview" + (oos ? " product-card--out-of-stock" : "");
      card.setAttribute("data-product-id", p.id);
      card.setAttribute("data-product-name", (p.name || "").toLowerCase());
      card.setAttribute("data-min-price", String(minP));
      if (oos) card.setAttribute("data-out-of-stock", "1");
      card.style.setProperty("--stagger", String(i));
      card.innerHTML =
        '<a class="product-card__link" href="product.html?id=' +
        encodeURIComponent(p.id) +
        '"' +
        (oos ? ' tabindex="-1" aria-disabled="true"' : "") +
        ' aria-label="View ' +
        escapeAttr(p.name) +
        (oos ? " (out of stock)" : "") +
        '"></a>' +
        '<div class="product-card__shine" aria-hidden="true"></div>' +
        '<div class="product-card-image">' +
        '<div class="product-card-share">' +
        '<button type="button" class="product-card-share__btn">Share</button>' +
        '<div class="product-card-share__pop" hidden aria-hidden="true"></div>' +
        "</div>" +
        '<span class="product-badge">' +
        escapeHtml(D.getCategoryLabel(p.category)) +
        "</span>" +
        '<div class="product-card__media">' +
        '<img src="' +
        escapeAttr(imgSrc(p.image)) +
        '" alt="" loading="lazy" width="600" height="450" />' +
        "</div>" +
        (oos
          ? '<div class="product-card__oos-overlay" role="status"><span class="product-card__oos-title">Out of stock</span><span class="product-card__oos-note">Contact the seller to order.</span></div>'
          : "") +
        "</div>" +
        '<div class="product-card-body">' +
        "<h3>" +
        escapeHtml(p.name) +
        "</h3>" +
        '<p class="product-card__from">From ' +
        CART.formatMoney(minP) +
        " · " +
        (D.countOfferedSizesForProduct ? D.countOfferedSizesForProduct(p) : 3) +
        " size" +
        (D.countOfferedSizesForProduct && D.countOfferedSizesForProduct(p) === 1 ? "" : "s") +
        "</p>" +
        '<div class="product-meta">' +
        '<span class="price-note">' +
        (oos ? "Unavailable" : "Tap for sizes") +
        "</span>" +
        (oos
          ? '<span class="add-btn add-btn--mini add-btn--mini--disabled" aria-disabled="true">Out of stock</span>'
          : '<a class="add-btn add-btn--mini" href="product.html?id=' +
            encodeURIComponent(p.id) +
            '">Size &amp; price →</a>') +
        "</div>" +
        "</div>";
      els.productGrid.appendChild(card);
      var sbtn = card.querySelector(".product-card-share__btn");
      if (sbtn && window.CRAFTGURU_SHARE && window.CRAFTGURU_SHARE.mountCardShare) {
        window.CRAFTGURU_SHARE.mountCardShare(sbtn, { id: p.id, name: p.name });
      }
    });

    bindCardTilt(Array.prototype.slice.call(els.productGrid.querySelectorAll(".product-card")));

    if (els.pager) {
      els.pager.innerHTML = "";
      if (result.pages <= 1) return;

      var qEl = gfQuery();
      var sEl = gfSort();
      var qNow = qEl ? qEl.value.trim() : "";
      var sortNow = sEl ? sEl.value : "relevance";
      var capEl = gfPriceCap();
      var maxpNow = capEl && capEl.value ? capEl.value.trim() : "";

      function linkFor(pg) {
        return categoryUrl(cat, pg, qNow, sortNow, maxpNow);
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
    if (els.heading) els.heading.textContent = labelForList;
    if (els.crumbCat) els.crumbCat.textContent = labelForList;
    if (els.crumbCatLink) els.crumbCatLink.href = categoryUrl(cat, 1, "", "relevance", "");
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
    wireCatalogBarOnce();
    wireGlobalFindQueryOnce();
    wirePriceCapOnce();

    var qIn = gfQuery();
    var sIn = gfSort();
    var capIn = gfPriceCap();
    if (qIn) qIn.value = urlQ;
    if (sIn) {
      var allowed = { relevance: 1, "name-asc": 1, "name-desc": 1, "price-asc": 1, "price-desc": 1 };
      sIn.value = allowed[urlSort] ? urlSort : "relevance";
    }
    if (capIn) {
      var allowedCap = { "": 1, "35": 1, "50": 1, "75": 1, "100": 1, "150": 1, "250": 1, "500": 1, "1000": 1 };
      capIn.value = allowedCap[urlMaxp] ? urlMaxp : "";
    }

    var fs = getFilteredSortedItems();
    var pages = Math.max(1, Math.ceil(fs.items.length / (D.pageSize || 48)));
    page = Math.min(Math.max(1, page), pages);
    var result = buildPageResult(fs.items, fs.sort);
    updateCatalogHint(result, urlQ);
    renderProductList(result, activeSubId, labelForList, multiSub ? subLabelForList : "");
  }

  window.addEventListener("craftguruCatalogPricesMerged", function () {
    applyCatalogFilters(false);
  });

  render();
})();
