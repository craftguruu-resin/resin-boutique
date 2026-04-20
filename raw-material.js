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

  function materialsMatchFilters(m, base, sub, needle) {
    var b = String(base || "").trim();
    var s = String(sub || "").trim();
    var n = String(needle || "")
      .trim()
      .toLowerCase();
    if (b && String(m.baseCategorySlug || "").trim() !== b) return false;
    if (s && String(m.subcategorySlug || "").trim() !== s) return false;
    if (n) {
      var sku = String(m.sku || "").toLowerCase();
      var name = String(m.name || "").toLowerCase();
      if (name.indexOf(n) < 0 && sku.indexOf(n) < 0) return false;
    }
    return true;
  }

  function renderBestSellers(all) {
    var el = document.getElementById("rmBestGrid");
    if (!el) return;
    var list = (all || []).slice();
    function badgeScore(m) {
      var badge = String((m.options && m.options.badge) || "");
      if (/best|popular|pick|new|top/i.test(badge)) return 2;
      if (m.image) return 1;
      return 0;
    }
    list.sort(function (a, b) {
      return badgeScore(b) - badgeScore(a);
    });
    var tagged = list.filter(function (m) {
      var badge = (m.options && m.options.badge) || "";
      return /best|popular|pick|new|top/i.test(String(badge));
    });
    var pick = [];
    var seen = Object.create(null);
    function addUnique(m) {
      if (!m || !m.id || seen[m.id]) return;
      seen[m.id] = 1;
      pick.push(m);
    }
    tagged.forEach(addUnique);
    list.forEach(function (m) {
      if (pick.length >= 8) return;
      addUnique(m);
    });
    el.innerHTML = "";
    if (!pick.length) {
      el.innerHTML = '<p class="rm-best-sellers__empty">Listings will appear here once materials are published.</p>';
      return;
    }
    pick.forEach(function (m) {
      var card = document.createElement("article");
      card.className = "rm-best-card";
      var href = "raw-material-product.html?id=" + encodeURIComponent(m.id);
      var img = m.image ? imgSrc(m.image) : "";
      var meta = minOfferMeta(m);
      card.innerHTML =
        '<a href="' +
        escAttr(href) +
        '">' +
        (img ? '<div class="rm-best-card__img"><img src="' + escAttr(img) + '" alt="" loading="lazy" width="200" height="160" /></div>' : "") +
        '<div class="rm-best-card__body"><h3 class="rm-best-card__title">' +
        esc(m.name || "") +
        "</h3>" +
        '<p class="rm-best-card__price">' +
        esc(fmtPrice(meta.min)) +
        "</p></div></a>";
      el.appendChild(card);
    });
  }

  function fillFilterSelectsFromTaxonomy(doc) {
    var baseSel = document.getElementById("rmFilterBase");
    var subSel = document.getElementById("rmFilterSub");
    if (!baseSel || !subSel) return;
    var par = qsParams();
    var cats = (doc && doc.categories) || [];
    baseSel.innerHTML = '<option value="">All categories</option>';
    cats.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      if (par.base === c.id) o.selected = true;
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
        if (par.sub === s.id && par.base === bid) o2.selected = true;
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
  }

  var HUB_STOP = {
    resin: 1,
    material: 1,
    materials: 1,
    crystal: 1,
    craft: 1,
    guru: 1,
    clear: 1,
    epoxy: 1,
    high: 1,
    grade: 1,
    studio: 1,
  };

  /** When DB rows lack base_category_slug, attribute at most one hub bucket from the product name (avoids double-counting). */
  function inferredHubCategoryId(m, cats) {
    if (String(m.baseCategorySlug || "").trim()) return null;
    var name = String(m.name || "").toLowerCase();
    if (!name) return null;
    var hits = [];
    for (var ci = 0; ci < cats.length; ci++) {
      var c = cats[ci];
      var parts = String(c.name || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(function (t) {
          return t.length > 4 && !HUB_STOP[t];
        });
      for (var pi = 0; pi < parts.length; pi++) {
        if (name.indexOf(parts[pi]) >= 0) {
          hits.push(c.id);
          break;
        }
      }
    }
    return hits.length === 1 ? hits[0] : null;
  }

  /** Main-storefront-style category cards (featured-cat-card). */
  function renderRmCategoryHub(doc, materials) {
    var hub = document.getElementById("rmCategoryHub");
    if (!hub || !doc || !doc.categories) return;
    var mats = materials || [];
    var cats = doc.categories;
    hub.innerHTML = "";
    cats.forEach(function (c, idx) {
      var count = 0;
      for (var i = 0; i < mats.length; i++) {
        var m = mats[i];
        if (String(m.baseCategorySlug || "") === c.id) {
          count++;
          continue;
        }
        if (inferredHubCategoryId(m, cats) === c.id) count++;
      }
      var href = window.RmShopNav ? window.RmShopNav.shopHref(c.id, "") : "raw-material-shop.html?base=" + encodeURIComponent(c.id);
      var card = document.createElement("article");
      card.className = "featured-cat-card reveal-tile is-inview";
      card.style.setProperty("--stagger", String(idx % 10));
      var imgRel = c.image || "";
      var imgBlock = imgRel
        ? '<a class="featured-cat-card__media-hit" href="' +
          escAttr(href) +
          '" aria-label="Browse ' +
          escAttr(c.name) +
          '"><div class="featured-cat-card__media"><img src="' +
          escAttr(imgSrc(imgRel)) +
          '" alt="" loading="lazy" width="640" height="480" /></div></a>'
        : '<a class="featured-cat-card__media-hit" href="' +
          escAttr(href) +
          '"><div class="featured-cat-card__media featured-cat-card__media--empty" aria-hidden="true"></div></a>';
      card.innerHTML =
        '<div class="featured-cat-card__shine" aria-hidden="true"></div>' +
        imgBlock +
        '<div class="featured-cat-card__body">' +
        '<h3><a href="' +
        escAttr(href) +
        '">' +
        esc(c.name) +
        "</a></h3>" +
        "<p>" +
        esc(String(count)) +
        (count === 1 ? " product in this category" : " products in this category") +
        "</p>" +
        '<div class="featured-cat-card__row">' +
        '<a class="featured-cat-card__cta" href="' +
        escAttr(href) +
        '">View collection →</a>' +
        '<a class="featured-cat-card__quick-add" href="' +
        escAttr(href) +
        '">Choose product</a>' +
        "</div></div>";
      hub.appendChild(card);
    });
  }

  function wireFiltersOnce() {
    if (filterWired) return;
    filterWired = true;
    var apply = document.getElementById("rmFilterApply");
    var clear = document.getElementById("rmFilterClear");
    var baseSel = document.getElementById("rmFilterBase");
    var subSel = document.getElementById("rmFilterSub");
    var searchEl = document.getElementById("rmFilterSearch");
    function go() {
      var b = baseSel ? baseSel.value : "";
      var s = subSel && !subSel.disabled ? subSel.value : "";
      var u = "raw-material-shop.html";
      var parts = [];
      if (b) parts.push("base=" + encodeURIComponent(b));
      if (s) parts.push("sub=" + encodeURIComponent(s));
      if (parts.length) u += "?" + parts.join("&");
      window.location.href = u;
    }
    if (apply) apply.addEventListener("click", go);
    if (clear) {
      clear.addEventListener("click", function () {
        window.location.href = "raw-material-shop.html";
      });
    }
    if (searchEl) {
      searchEl.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          var needle = searchEl.value.trim().toLowerCase();
          var rows = allMaterials.filter(function (m) {
            return materialsMatchFilters(m, baseSel ? baseSel.value : "", subSel && !subSel.disabled ? subSel.value : "", needle);
          });
          render(rows);
        }
      });
    }
  }

  function sortSelect() {
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
    });
  }

  function render(list) {
    wireSortOnce();
    lastMaterials = list || [];
    var g = document.getElementById("rmGrid");
    if (!g) return;
    g.innerHTML = "";
    var rows = sortedList(lastMaterials);
    if (!rows.length) {
      g.innerHTML = '<p class="band-empty" style="grid-column:1/-1">No materials listed yet.</p>';
      return;
    }
    rows.forEach(function (m) {
      var card = document.createElement("article");
      card.className = "rm-card-shop";
      var href = "raw-material-product.html?id=" + encodeURIComponent(m.id);
      var img = m.image ? imgSrc(m.image) : "";
      var meta = minOfferMeta(m);
      var effMrp = effectiveMrpInr(m, meta.sel);
      var showFrom = !!(m.options && (m.options.useSize || m.options.useQty));
      var mrp =
        effMrp != null && Number(effMrp) > Number(meta.min)
          ? '<span class="rm-card-shop__mrp">' + esc(fmtPrice(effMrp)) + "</span>"
          : "";
      card.innerHTML =
        '<a href="' +
        escAttr(href) +
        '">' +
        '<div class="rm-card-shop__img">' +
        (img ? '<img src="' + escAttr(img) + '" alt="" loading="lazy" width="400" height="300" />' : "") +
        "</div>" +
        '<div class="rm-card-shop__body">' +
        '<span class="rm-card-shop__brand">Craft Guru</span>' +
        "<h3 class=\"rm-card-shop__title\">" +
        esc(m.name || "Material") +
        "</h3>" +
        (m.description ? '<p class="rm-card-shop__desc">' + esc(m.description) + "</p>" : "<p class=\"rm-card-shop__desc\"></p>") +
        '<div class="rm-card-shop__row">' +
        '<span class="rm-card-shop__price">' +
        esc((showFrom ? "From " : "") + fmtPrice(meta.min)) +
        "</span>" +
        "<span>" +
        mrp +
        discountHtml(m) +
        "</span></div></div></a>";
      g.appendChild(card);
    });
  }

  function load() {
    var nav = document.getElementById("rmNavTree");
    var par = qsParams();
    if (nav && window.RmShopNav) {
      window.RmShopNav.mount(nav, { activeBase: par.base, activeSub: par.sub });
    }
    wireFiltersOnce();

    function applyMaterials(doc, materials) {
      allMaterials = materials || [];
      renderBestSellers(allMaterials);
      if (doc) {
        renderRmCategoryHub(doc, allMaterials);
      }
      var needle = "";
      try {
        var se = document.getElementById("rmFilterSearch");
        needle = se && se.value ? se.value.trim().toLowerCase() : "";
      } catch (_) {}
      var rows = allMaterials.filter(function (m) {
        return materialsMatchFilters(m, par.base, par.sub, needle);
      });
      render(rows);
    }

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
})();
