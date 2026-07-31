(function () {
  "use strict";

  var M = window.CraftguruCatalogMerge;
  var D = window.RESIN_DATA;

  function apiBase() {
    return M && typeof M.getApiBase === "function" ? M.getApiBase() : "";
  }

  /** Same host as the storefront when data-bill-api-base is blank (e.g. stripped on production). */
  function catalogApiBase() {
    var b = String(apiBase() || "")
      .trim()
      .replace(/\/+$/, "");
    if (b) return b;
    try {
      if (window.location && window.location.protocol !== "file:") {
        return String(window.location.origin || "").replace(/\/+$/, "");
      }
    } catch (_) {}
    return "";
  }

  function catalogMaterialsFetchUrl() {
    var base = catalogApiBase();
    var path = "/api/catalog/raw-materials";
    return base ? base + path : path;
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
    if (!rel) return "";
    if (String(rel).indexOf("http") === 0 || String(rel).indexOf("//") === 0) return rel;
    return D && D.imageUrl ? D.imageUrl(rel) : rel;
  }

  function hubCategoryPreview(c) {
    if (D && D.getCategoryCardPreview && c && c.id) {
      var resin = D.getCategoryCardPreview(c.id);
      if (resin && resin.image) {
        return { image: resin.image, fit: String(resin.fit || "").trim().toLowerCase() };
      }
    }
    return {
      image: (c && c.image) || "",
      fit: String((c && c.imageFit) || "").trim().toLowerCase(),
    };
  }

  function applyListingImageFit(imgEl, row) {
    if (!imgEl || !row) return;
    var fit = "";
    if (D && D.getProductCoverImageFit) {
      fit = D.getProductCoverImageFit(row);
    } else if (window.CraftguruImageFit) {
      fit = window.CraftguruImageFit.getProductCoverImageFit(row);
    }
    if (window.CraftguruImageFit && window.CraftguruImageFit.applyImageFit) {
      window.CraftguruImageFit.applyImageFit(imgEl, fit);
    } else if (fit === "contain" || fit === "cover") {
      imgEl.setAttribute("data-image-fit", fit);
    }
  }

  function refetchTaxonomyAndHub() {
    var taxP = Promise.resolve(rmShopTaxDoc);
    if (window.RmShopNav && window.RmShopNav.fetchTaxonomy) {
      taxP = window.RmShopNav.fetchTaxonomy().catch(function () {
        return rmShopTaxDoc;
      });
    }
    taxP.then(function (doc) {
      if (!doc) return;
      rmShopTaxDoc = doc;
      fillFilterSelectsFromTaxonomy(doc);
      if (isRawMaterialShopHome()) {
        renderRmCategoryHub(doc, allMaterials, rmShopHubFilter);
      }
    });
  }

  function fmtPrice(n) {
    try {
      if (window.RESIN_CART && typeof window.RESIN_CART.formatMoney === "function") {
        return window.RESIN_CART.formatMoney(n);
      }
    } catch (_) {}
    return "₹" + Math.round(Number(n) || 0);
  }

  function findOpt(list, id) {
    if (!id || !list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function finN(n) {
    var x = Number(n);
    return Number.isFinite(x) ? x : null;
  }

  function effectivePriceInr(m, sel) {
    var base = finN(m.priceInr) != null ? Number(m.priceInr) : 0;
    if (!Number.isFinite(base) || base < 0) base = 0;
    var opt = m.options || {};
    var s = opt.useSize && sel.sid ? findOpt(opt.sizes, sel.sid) : null;
    var q = opt.useQty && sel.qid ? findOpt(opt.qtyOptions, sel.qid) : null;
    var ps = s ? finN(s.priceInr) : null;
    var pq = q ? finN(q.priceInr) : null;
    if (opt.useSize && opt.useQty) {
      return (ps != null ? ps : base) + (pq != null ? pq : 0);
    }
    if (opt.useSize && s) return ps != null ? ps : base;
    if (opt.useQty && q) return pq != null ? pq : base;
    return base;
  }

  function effectiveMrpInr(m, sel) {
    var baseM = finN(m.mrpInr);
    var opt = m.options || {};
    var s = opt.useSize && sel.sid ? findOpt(opt.sizes, sel.sid) : null;
    var q = opt.useQty && sel.qid ? findOpt(opt.qtyOptions, sel.qid) : null;
    var ms = s ? finN(s.mrpInr) : null;
    var mq = q ? finN(q.mrpInr) : null;
    if (opt.useSize && opt.useQty) {
      var sm = ms != null ? ms : baseM;
      var qm = mq != null ? mq : 0;
      if (sm == null && (!qm || qm === 0)) return null;
      if (sm == null) return null;
      return sm + qm;
    }
    if (opt.useSize && s) return ms != null ? ms : baseM;
    if (opt.useQty && q) return mq != null ? mq : baseM;
    return baseM;
  }

  function minOfferMeta(m) {
    var opt = m.options || {};
    if (!opt.useSize && !opt.useQty) {
      return {
        min: Number(m.priceInr) || 0,
        sel: { sid: "", qid: "" },
      };
    }
    var sizes = opt.useSize && opt.sizes && opt.sizes.length ? opt.sizes : [{ id: "" }];
    var qtys = opt.useQty && opt.qtyOptions && opt.qtyOptions.length ? opt.qtyOptions : [{ id: "" }];
    if (!opt.useSize) sizes = [{ id: "" }];
    if (!opt.useQty) qtys = [{ id: "" }];
    var bestP = Infinity;
    var bestSid = "";
    var bestQid = "";
    sizes.forEach(function (s) {
      qtys.forEach(function (q) {
        var sid = opt.useSize ? String(s.id || "") : "";
        var qid = opt.useQty ? String(q.id || "") : "";
        var p = effectivePriceInr(m, { sid: sid, qid: qid });
        if (p < bestP) {
          bestP = p;
          bestSid = sid;
          bestQid = qid;
        }
      });
    });
    return { min: bestP === Infinity ? Number(m.priceInr) || 0 : bestP, sel: { sid: bestSid, qid: bestQid } };
  }

  function discountHtml(m) {
    var meta = minOfferMeta(m);
    var mrp = effectiveMrpInr(m, meta.sel);
    var p = meta.min;
    if (mrp == null || !Number.isFinite(mrp) || !(mrp > p)) return "";
    var pct = Math.round(((mrp - p) / mrp) * 100);
    return '<span class="rm-card-shop__pill">' + esc(String(pct) + "% off") + "</span>";
  }

  var lastMaterials = [];
  var allMaterials = [];
  var sortWired = false;
  var filterWired = false;
  var DEFAULT_SORT = "name-asc";
  var rmShopHydratingFilters = false;
  /** Taxonomy doc for hub + filter bar (set after fetch). */
  var rmShopTaxDoc = null;
  /** Hub-only filter from toolbar (not URL). Cleared by Reset. */
  var rmShopHubFilter = null;
  var rmShopSpaWired = false;
  var rmNavMaterialCount = -1;
  var PLP = window.CraftguruProductListing;
  var rmPlpMounted = false;

  function humanizeSlug(s) {
    return String(s || "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function mountRmPlpOnce() {
    if (rmPlpMounted || !PLP) return;
    var grid = document.getElementById("rmGrid");
    if (!grid) return;
    rmPlpMounted = true;
    PLP.mountListingShell({
      gridEl: grid,
      storageKey: "plp-view-raw-material",
    });
  }

  function updateRmPlpHeader(par) {
    var shell = document.getElementById("rmPlpShell");
    var heading = document.getElementById("rmPlpHeading");
    var title = document.getElementById("rmPlpTitle");
    var desc = document.getElementById("rmPlpDesc");
    if (!shell || !heading) return;
    var parts = [];
    if (par.base) {
      var tax = rmShopTaxDoc;
      var baseLabel = par.base;
      if (tax && tax.baseCategories) {
        for (var i = 0; i < tax.baseCategories.length; i++) {
          if (tax.baseCategories[i].id === par.base) {
            baseLabel = tax.baseCategories[i].label || baseLabel;
            break;
          }
        }
      } else {
        baseLabel = humanizeSlug(par.base);
      }
      parts.push(baseLabel);
      if (par.sub) {
        var subLabel = par.sub;
        if (tax && tax.subcategories && tax.subcategories[par.base]) {
          var subs = tax.subcategories[par.base];
          for (var j = 0; j < subs.length; j++) {
            if (subs[j].id === par.sub) {
              subLabel = subs[j].label || subLabel;
              break;
            }
          }
        } else {
          subLabel = humanizeSlug(par.sub);
        }
        parts.push(subLabel);
      }
    } else if (String(par.needle || "").trim()) {
      parts.push("Search results");
    } else {
      parts.push("Materials");
    }
    var label = parts.join(" · ");
    heading.textContent = label;
    if (title) title.textContent = label;
    if (desc && PLP) desc.textContent = PLP.getCategoryDescription("raw-materials");
  }

  function qsParams() {
    try {
      var u = new URL(window.location.href);
      return {
        base: (u.searchParams.get("base") || "").trim(),
        sub: (u.searchParams.get("sub") || "").trim(),
      };
    } catch (_) {
      return { base: "", sub: "" };
    }
  }

  /** Shop "home": no category drill-in — Shop by category + hub filter bar only here. */
  function isRawMaterialShopHome() {
    var p = qsParams();
    return !String(p.base || "").trim() && !String(p.sub || "").trim();
  }

  function shouldShowRmProductGrid(par, needle) {
    if (String(par.base || "").trim() || String(par.sub || "").trim()) return true;
    if (String(needle || "").trim()) return true;
    return false;
  }

  function toggleRmShopHomeOnlySections(needle) {
    var home = isRawMaterialShopHome();
    var par = qsParams();
    var showGrid = shouldShowRmProductGrid(par, needle);
    var hub = document.querySelector(".rm-cat-hub");
    var tb = document.getElementById("rm-shop");
    var hero = document.getElementById("rm-hero");
    var grid = document.getElementById("rmGrid");
    var shell = document.getElementById("rmPlpShell");
    if (hub) hub.toggleAttribute("hidden", !home);
    if (tb) tb.toggleAttribute("hidden", !home);
    if (hero) hero.toggleAttribute("hidden", !home);
    if (shell) shell.toggleAttribute("hidden", !showGrid);
    if (grid && showGrid) grid.removeAttribute("hidden");
  }

  function readHubFilterFromDom() {
    var baseSel = document.getElementById("rmFilterBase");
    var subSel = document.getElementById("rmFilterSub");
    var searchEl = document.getElementById("rmFilterSearch");
    var priceEl = document.getElementById("rmFilterPriceMax");
    return {
      base: baseSel ? String(baseSel.value || "").trim() : "",
      sub: subSel && !subSel.disabled ? String(subSel.value || "").trim() : "",
      needle: searchEl ? String(searchEl.value || "").trim() : "",
      priceMax: priceEl ? String(priceEl.value || "").trim() : "",
    };
  }

  function normalizeHubFilter(h) {
    if (!h) return null;
    var b = String(h.base || "").trim();
    var s = String(h.sub || "").trim();
    var n = String(h.needle || "")
      .trim()
      .toLowerCase();
    var capRaw = h.priceMax;
    var capN = capRaw != null && String(capRaw).trim() !== "" ? Number(capRaw) : NaN;
    var hasCap = Number.isFinite(capN) && capN > 0;
    if (!b && !s && !n && !hasCap) return null;
    var out = {};
    if (b) out.base = b;
    if (s) out.sub = s;
    if (n) out.needle = n;
    if (hasCap) out.priceMax = capN;
    return out;
  }

  function materialMatchesHubFilter(m, hub) {
    if (!hub) return true;
    var b = String(hub.base || "").trim();
    var s = String(hub.sub || "").trim();
    var n = String(hub.needle || "")
      .trim()
      .toLowerCase();
    if (b && !slugEq(m.baseCategorySlug, b)) return false;
    if (s && !slugEq(m.subcategorySlug, s)) return false;
    if (n) {
      var name = String(m.name || "").toLowerCase();
      var sku = String(m.sku || "").toLowerCase();
      var idl = String(m.id || "").toLowerCase();
      if (name.indexOf(n) < 0 && sku.indexOf(n) < 0 && idl.indexOf(n) < 0) return false;
    }
    if (hub.priceMax != null && Number.isFinite(Number(hub.priceMax)) && Number(hub.priceMax) > 0) {
      var cap = Number(hub.priceMax);
      var minP = minOfferMeta(m).min;
      if (!Number.isFinite(minP) || minP > cap) return false;
    }
    return true;
  }

  /** Hub cards count only materials with an explicit base taxonomy slug (no name-based guessing). */
  function materialBelongsToHubCategory(m, c) {
    return slugEq(m.baseCategorySlug, c.id);
  }

  function minPriceForCategoryHubCard(c, mats, cats, hubN) {
    var best = Infinity;
    for (var i = 0; i < mats.length; i++) {
      var m = mats[i];
      if (!materialMatchesHubFilter(m, hubN)) continue;
      if (!materialBelongsToHubCategory(m, c)) continue;
      var p = minOfferMeta(m).min;
      if (Number.isFinite(p) && p < best) best = p;
    }
    return best === Infinity ? 0 : best;
  }

  function slugEq(a, b) {
    return (
      String(a || "")
        .trim()
        .toLowerCase() ===
      String(b || "")
        .trim()
        .toLowerCase()
    );
  }

  function materialSearchHaystack(m) {
    return [
      m.name,
      m.sku,
      m.id,
      m.description,
      m.baseCategorySlug,
      m.subcategorySlug,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function materialsMatchFilters(m, base, sub, needle) {
    var b = String(base || "").trim();
    var s = String(sub || "").trim();
    var n = String(needle || "").trim();
    if (b && !slugEq(m.baseCategorySlug, b)) return false;
    if (s && !slugEq(m.subcategorySlug, s)) return false;
    if (n) {
      var hay = materialSearchHaystack(m);
      if (D && typeof D.partialTokenMatch === "function") {
        if (!D.partialTokenMatch(hay, n)) return false;
      } else {
        var nl = n.toLowerCase();
        if (hay.indexOf(nl) < 0) return false;
      }
    }
    return true;
  }

  function fillFilterSelectsFromTaxonomy(doc) {
    rmShopHydratingFilters = true;
    try {
      var baseSel = document.getElementById("rmFilterBase");
      var subSel = document.getElementById("rmFilterSub");
      if (!baseSel || !subSel) return;
      var cats = (doc && doc.categories) || [];
      baseSel.innerHTML = '<option value="">All categories</option>';
      cats.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.name;
        baseSel.appendChild(o);
      });
      function refillSub() {
        var bid = baseSel.value;
        subSel.innerHTML = '<option value="">All</option>';
        subSel.disabled = !bid;
        if (!bid) return;
        var cat = null;
        for (var ci = 0; ci < cats.length; ci++) {
          if (cats[ci].id === bid) {
            cat = cats[ci];
            break;
          }
        }
        var subs = (cat && cat.subcategories) || [];
        if (!subs.length && subSel.options[0]) {
          subSel.options[0].textContent = "Whole category (no sub-folders)";
        }
        subs.forEach(function (s) {
          var o2 = document.createElement("option");
          o2.value = s.id;
          o2.textContent = s.name;
          subSel.appendChild(o2);
        });
      }
      if (!baseSel.dataset.rmTaxWired) {
        baseSel.dataset.rmTaxWired = "1";
        baseSel.addEventListener("change", refillSub);
      }
      refillSub();
      var searchEl = document.getElementById("rmFilterSearch");
      if (searchEl && !searchEl.dataset.rmInit) {
        searchEl.dataset.rmInit = "1";
        searchEl.value = "";
      }
    } finally {
      rmShopHydratingFilters = false;
    }
  }

  function countMaterialsForHubCard(c, mats, cats, hubN) {
    var n = 0;
    for (var i = 0; i < mats.length; i++) {
      var m = mats[i];
      if (!materialMatchesHubFilter(m, hubN)) continue;
      if (materialBelongsToHubCategory(m, c)) n++;
    }
    return n;
  }

  /** Main-storefront-style category cards; toolbar filter only changes this section. */
  function renderRmCategoryHub(doc, materials, hubFilter) {
    var hub = document.getElementById("rmCategoryHub");
    if (!hub || !doc || !doc.categories) return;
    var mats = materials || [];
    var cats = doc.categories;
    var hubN = normalizeHubFilter(hubFilter);
    hub.className = "featured-collections-grid";
    hub.innerHTML = "";
    var catsToShow = cats.slice();
    if (hubN && hubN.base) {
      catsToShow = cats.filter(function (c) {
        return c.id === hubN.base;
      });
    } else if (hubN && hubN.needle && !hubN.base) {
      catsToShow = cats.filter(function (c) {
        return countMaterialsForHubCard(c, mats, cats, hubN) > 0;
      });
    }
    var sortCtl = document.getElementById("rmSortSelect");
    var sortVal = (sortCtl && sortCtl.value) || DEFAULT_SORT;
    if (sortVal === "price-asc") {
      catsToShow.sort(function (a, b) {
        return (
          minPriceForCategoryHubCard(a, mats, cats, hubN) - minPriceForCategoryHubCard(b, mats, cats, hubN)
        );
      });
    } else if (sortVal === "price-desc") {
      catsToShow.sort(function (a, b) {
        return (
          minPriceForCategoryHubCard(b, mats, cats, hubN) - minPriceForCategoryHubCard(a, mats, cats, hubN)
        );
      });
    } else if (sortVal === "name-desc") {
      catsToShow.sort(function (a, b) {
        return String((b && b.name) || "").localeCompare(String((a && a.name) || ""), undefined, {
          sensitivity: "base",
        });
      });
    } else {
      catsToShow.sort(function (a, b) {
        return String((a && a.name) || "").localeCompare(String((b && b.name) || ""), undefined, {
          sensitivity: "base",
        });
      });
    }
    catsToShow.forEach(function (c, idx) {
      var count = countMaterialsForHubCard(c, mats, cats, hubN);
      var href = window.RmShopNav
        ? window.RmShopNav.shopHref(c.id, "")
        : "raw-material-shop.html?base=" + encodeURIComponent(c.id);
      var preview = hubCategoryPreview(c);
      var imgRel = preview.image || "";
      var imgFit = preview.fit || "";
      var countLabel = String(count) + (count === 1 ? " product" : " products");
      var card = window.CraftguruPremiumCards.buildCategoryCard({
        href: href,
        title: c.name,
        subtitle: countLabel,
        ctaText: "EXPLORE COLLECTION →",
        imgSrc: imgRel ? imgSrc(imgRel) : "",
        imgFit: imgFit || "contain",
        hasPreview: !!imgRel,
        stagger: idx % 10,
        ariaLabel: "Browse " + c.name,
      });
      hub.appendChild(card);
    });
  }

  function wireFiltersOnce() {
    if (filterWired) return;
    filterWired = true;
    var apply = document.getElementById("rmFilterApply");
    var clear = document.getElementById("rmFilterClear");
    var searchEl = document.getElementById("rmFilterSearch");
    if (apply) {
      apply.addEventListener("click", function () {
        rmShopHubFilter = readHubFilterFromDom();
        if (rmShopTaxDoc) renderRmCategoryHub(rmShopTaxDoc, allMaterials, rmShopHubFilter);
      });
    }
    if (clear) {
      clear.addEventListener("click", function () {
        rmShopHubFilter = null;
        var se = document.getElementById("rmFilterSearch");
        if (se) se.value = "";
        var pm = document.getElementById("rmFilterPriceMax");
        if (pm) pm.value = "";
        var sortEl = document.getElementById("rmSortSelect");
        if (sortEl) sortEl.value = DEFAULT_SORT;
        if (rmShopTaxDoc) {
          fillFilterSelectsFromTaxonomy(rmShopTaxDoc);
          renderRmCategoryHub(rmShopTaxDoc, allMaterials, null);
        }
      });
    }
    if (searchEl) {
      searchEl.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          rmShopHubFilter = readHubFilterFromDom();
          if (rmShopTaxDoc) renderRmCategoryHub(rmShopTaxDoc, allMaterials, rmShopHubFilter);
        }
      });
    }
  }

  function sortSelect() {
    var plp = document.getElementById("rmPlpSortSelect");
    if (plp && plp.offsetParent !== null) return plp;
    return document.getElementById("rmSortSelect");
  }

  function sortedList(list) {
    var sel = sortSelect();
    var sort = (sel && sel.value) || DEFAULT_SORT;
    var arr = (list || []).slice();
    if (sort === "name-desc") {
      arr.sort(function (a, b) {
        return String((b && b.name) || "").localeCompare(String((a && a.name) || ""), undefined, { sensitivity: "base" });
      });
    } else if (sort === "price-asc") {
      arr.sort(function (a, b) {
        return minOfferMeta(a).min - minOfferMeta(b).min;
      });
    } else if (sort === "price-desc") {
      arr.sort(function (a, b) {
        return minOfferMeta(b).min - minOfferMeta(a).min;
      });
    } else {
      arr.sort(function (a, b) {
        return String((a && a.name) || "").localeCompare(String((b && b.name) || ""), undefined, { sensitivity: "base" });
      });
    }
    return arr;
  }

  function wireSortOnce() {
    if (sortWired) return;
    var sel = sortSelect();
    if (!sel) return;
    sortWired = true;
    sel.addEventListener("change", function () {
      render(lastMaterials);
      if (rmShopTaxDoc) {
        renderRmCategoryHub(rmShopTaxDoc, allMaterials, rmShopHubFilter);
      }
    });
  }

  function render(list) {
    wireSortOnce();
    mountRmPlpOnce();
    lastMaterials = list || [];
    var g = document.getElementById("rmGrid");
    if (!g) return;
    var par = qsParams();
    var needle = "";
    try {
      var gq = document.getElementById("globalFindQuery");
      if (gq) needle = String(gq.value || "").trim();
    } catch (_) {}
    updateRmPlpHeader({ base: par.base, sub: par.sub, needle: needle });
    g.innerHTML = "";
    var rows = sortedList(lastMaterials);
    if (!rows.length) {
      var catalogTotal = (allMaterials && allMaterials.length) || 0;
      var parLive = qsParams();
      var hasBrowse = !!(parLive.base || parLive.sub);
      var emptyMsg;
      if (catalogTotal === 0) {
        emptyMsg = "No materials listed yet.";
      } else if (!hasBrowse) {
        emptyMsg = "Choose a category from Shop by category or the sidebar to see products.";
      } else {
        g.innerHTML =
          '<p class="band-empty" style="grid-column:1/-1">' +
          esc(
            "No materials match this category or filters. Choose another category, subcategory, or reset filters."
          ) +
          ' <a class="rm-empty-link" href="raw-material-shop.html">Back to raw material shop home</a></p>';
        return;
      }
      g.innerHTML = '<p class="band-empty" style="grid-column:1/-1">' + esc(emptyMsg) + "</p>";
      return;
    }
    rows.forEach(function (m, i) {
      var href = "raw-material-product.html?id=" + encodeURIComponent(m.id);
      var img = m.image ? imgSrc(m.image) : "";
      var meta = minOfferMeta(m);
      var effMrp = effectiveMrpInr(m, meta.sel);
      var showFrom = !!(m.options && (m.options.useSize || m.options.useQty));
      var priceLabel = meta.min > 0 ? (showFrom ? "From " : "") + fmtPrice(meta.min) : "";
      var mrpHtml =
        effMrp != null && Number(effMrp) > Number(meta.min)
          ? '<span class="plp-card__mrp">' + esc(fmtPrice(effMrp)) + "</span>"
          : "";
      var disc = discountHtml(m);
      var discountBlock = disc ? disc.replace("rm-card-shop__pill", "plp-card__discount") : "";
      var abs;
      try {
        abs = new URL(href, window.location.href).href;
      } catch (_) {
        abs = href;
      }
      var buildCard = PLP && PLP.buildProductCard;
      var card;
      if (buildCard) {
        card = buildCard({
          href: href,
          ctaHref: href,
          name: m.name || "Material",
          productId: m.id,
          productName: m.name,
          productUrl: abs,
          priceLabel: priceLabel,
          mrpHtml: mrpHtml,
          discountHtml: discountBlock,
          minPrice: meta.min > 0 ? String(meta.min) : "",
          imgSrc: img,
          imgFit: D && D.getProductCoverImageFit ? D.getProductCoverImageFit(m) : "",
          rating: m.ratingScore,
          reviewCount: m.reviewCount,
          wishlistKind: "raw_material",
          ctaText: "View options →",
          stagger: i,
        });
      } else {
        card = document.createElement("article");
        card.className = "plp-card";
        card.innerHTML = '<a class="plp-card__hit" href="' + escAttr(href) + '"></a>';
      }
      g.appendChild(card);
      if (!buildCard) {
        var listImg = card.querySelector(".plp-card__media img");
        applyListingImageFit(listImg, m);
      }
    });
    if (PLP && PLP.wireAllCardWishlists) PLP.wireAllCardWishlists(g);
  }

  function applyShopShellFromParams() {
    var par = qsParams();
    var tax = rmShopTaxDoc;
    if (tax && isRawMaterialShopHome()) {
      renderRmCategoryHub(tax, allMaterials, rmShopHubFilter);
    }
    var needle = "";
    try {
      var gq = document.getElementById("globalFindQuery");
      if (gq) needle = String(gq.value || "").trim();
    } catch (_) {}
    toggleRmShopHomeOnlySections(needle);
    var navEl = document.getElementById("rmNavTree");
    if (navEl && window.RmShopNav) {
      var forceNavRebuild = rmNavMaterialCount !== allMaterials.length;
      rmNavMaterialCount = allMaterials.length;
      if (forceNavRebuild && navEl.dataset) navEl.dataset.rmNavBuilt = "";
      window.RmShopNav.mount(navEl, {
        activeBase: par.base,
        activeSub: par.sub,
        materials: allMaterials,
        forceRebuild: forceNavRebuild,
      });
    }
    if (shouldShowRmProductGrid(par, needle)) {
      var rows = allMaterials.filter(function (m) {
        return materialsMatchFilters(m, par.base, par.sub, needle);
      });
      if (!rows.length && par.base && par.sub && allMaterials.length) {
        rows = allMaterials.filter(function (m) {
          return materialsMatchFilters(m, par.base, "", needle);
        });
      }
      render(rows);
    } else {
      var g0 = document.getElementById("rmGrid");
      if (g0) g0.innerHTML = "";
    }
  }

  function wireRmShopSpaNavOnce() {
    if (rmShopSpaWired) return;
    if (!document.getElementById("rmNavTree")) return;
    rmShopSpaWired = true;
    document.body.addEventListener(
      "click",
      function (e) {
        var navRoot = document.getElementById("rmNavTree");
        if (!navRoot || !navRoot.contains(e.target)) return;
        var a = e.target && e.target.closest && e.target.closest("a.category-pill--rail");
        if (!a || !a.getAttribute("href")) return;
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var href = a.getAttribute("href") || "";
        if (href.indexOf("raw-material-shop.html") < 0) return;
        try {
          var abs = new URL(a.href, window.location.href);
          if (abs.origin !== window.location.origin) return;
          var file = abs.pathname
            .split("/")
            .filter(Boolean)
            .pop();
          if (!file || file.split("?")[0] !== "raw-material-shop.html") return;
        } catch (_) {
          return;
        }
        e.preventDefault();
        var u = new URL(a.href, window.location.href);
        history.pushState({}, "", u.pathname + u.search + u.hash);
        applyShopShellFromParams();
      },
      true
    );
    window.addEventListener("popstate", function () {
      applyShopShellFromParams();
    });
  }

  function applyMaterials(doc, materials) {
    allMaterials = materials || [];
    if (doc) rmShopTaxDoc = doc;
    applyShopShellFromParams();
    wireRmShopSpaNavOnce();
  }

  function wireRmHeaderGlobalFindOnce() {
    var gq = document.getElementById("globalFindQuery");
    if (!gq || gq.dataset.rmNeedleWired === "1") return;
    gq.dataset.rmNeedleWired = "1";
    var t = null;
    gq.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        applyShopShellFromParams();
      }, 160);
    });
  }

  function load() {
    toggleRmShopHomeOnlySections("");
    wireFiltersOnce();
    wireRmHeaderGlobalFindOnce();

    var taxP = Promise.resolve(null);
    if (window.RmShopNav && window.RmShopNav.fetchTaxonomy) {
      taxP = window.RmShopNav.fetchTaxonomy().catch(function () {
        return null;
      });
    }
    taxP
      .then(function (doc) {
        if (doc) {
          fillFilterSelectsFromTaxonomy(doc);
        }
        return fetch(catalogMaterialsFetchUrl(), { cache: "no-store" })
          .then(function (res) {
            return res.json();
          })
          .then(function (j) {
            if (!j || !j.ok) {
              applyMaterials(doc, []);
              return;
            }
            applyMaterials(doc, j.materials || []);
          });
      })
      .catch(function () {
        applyMaterials(null, []);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }

  window.addEventListener("craftguruShopTaxonomyRefresh", refetchTaxonomyAndHub);
  window.addEventListener("craftguruCatalogCategoriesMerged", refetchTaxonomyAndHub);
})();
