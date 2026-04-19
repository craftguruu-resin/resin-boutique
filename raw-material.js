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

  var lastMaterials = [];
  var sortWired = false;
  var DEFAULT_SORT = "name-asc";

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

  function discountHtml(m) {
    if (m.mrpInr == null || !Number.isFinite(Number(m.mrpInr))) return "";
    var mrp = Number(m.mrpInr);
    var p = Number(m.priceInr) || 0;
    if (!(mrp > p)) return "";
    var pct = Math.round(((mrp - p) / mrp) * 100);
    return '<span class="rm-card-shop__pill">' + esc(String(pct) + "% off") + "</span>";
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
      var mrp =
        m.mrpInr != null && Number(m.mrpInr) > Number(m.priceInr)
          ? '<span class="rm-card-shop__mrp">' + esc(fmtPrice(m.mrpInr)) + "</span>"
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
        esc(fmtPrice(m.priceInr)) +
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
    if (!b) {
      render([]);
      return;
    }
    fetch(b + "/api/catalog/raw-materials", { cache: "no-store" })
      .then(function (res) {
        return res.json();
      })
      .then(function (j) {
        if (!j || !j.ok) {
          render([]);
          return;
        }
        render(j.materials || []);
      })
      .catch(function () {
        render([]);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
