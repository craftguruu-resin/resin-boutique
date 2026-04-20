(function () {
  "use strict";

  var M = window.CraftguruCatalogMerge;
  var D = window.RESIN_DATA;

  function apiBase() {
    return M && typeof M.getApiBase === "function" ? M.getApiBase() : "";
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
    var tagged = list.filter(function (m) {
      var badge = (m.options && m.options.badge) || "";
      return /best|popular|top/i.test(String(badge));
    });
    var pick = tagged.length ? tagged.slice(0, 6) : list.slice(0, 6);
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
      subs.forEach(function (s) {
        var o2 = document.createElement("option");
        o2.value = s.id;
        o2.textContent = s.name;
        if (par.sub === s.id && par.base === bid) o2.selected = true;
        subSel.appendChild(o2);
      });
    }
    baseSel.addEventListener("change", refillSub);
    refillSub();
    var searchEl = document.getElementById("rmFilterSearch");
    if (searchEl && !searchEl.dataset.rmInit) {
      searchEl.dataset.rmInit = "1";
      searchEl.value = "";
    }
  }

  function renderCategoryChips(doc) {
    var wrap = document.getElementById("rmCategoryChips");
    if (!wrap) return;
    var cats = (doc && doc.categories) || [];
    wrap.innerHTML = "";
    cats.forEach(function (c) {
      var a = document.createElement("a");
      a.className = "rm-category-chip";
      a.href = window.RmShopNav ? window.RmShopNav.shopHref(c.id, "") : "#";
      if (c.image) {
        a.innerHTML =
          '<span class="rm-category-chip__img"><img src="' +
          escAttr(c.image) +
          '" alt="" width="48" height="48" loading="lazy" /></span><span class="rm-category-chip__lab">' +
          esc(c.name) +
          "</span>";
      } else {
        a.innerHTML = '<span class="rm-category-chip__lab">' + esc(c.name) + "</span>";
      }
      wrap.appendChild(a);
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
    var b = apiBase();
    var nav = document.getElementById("rmNavTree");
    var par = qsParams();
    if (nav && window.RmShopNav) {
      window.RmShopNav.mount(nav, { activeBase: par.base, activeSub: par.sub });
    }
    if (window.RmShopNav && window.RmShopNav.fetchTaxonomy) {
      window.RmShopNav
        .fetchTaxonomy()
        .then(function (doc) {
          fillFilterSelectsFromTaxonomy(doc);
          renderCategoryChips(doc);
        })
        .catch(function () {});
    }
    wireFiltersOnce();
    if (!b) {
      render([]);
      renderBestSellers([]);
      return;
    }
    fetch(b + "/api/catalog/raw-materials", { cache: "no-store" })
      .then(function (res) {
        return res.json();
      })
      .then(function (j) {
        if (!j || !j.ok) {
          allMaterials = [];
          render([]);
          renderBestSellers([]);
          return;
        }
        allMaterials = j.materials || [];
        renderBestSellers(allMaterials);
        var needle = "";
        try {
          var se = document.getElementById("rmFilterSearch");
          needle = se && se.value ? se.value.trim().toLowerCase() : "";
        } catch (_) {}
        var rows = allMaterials.filter(function (m) {
          return materialsMatchFilters(m, par.base, par.sub, needle);
        });
        render(rows);
      })
      .catch(function () {
        allMaterials = [];
        render([]);
        renderBestSellers([]);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
