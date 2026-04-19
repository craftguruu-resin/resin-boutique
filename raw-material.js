(function () {
  "use strict";

  var M = window.CraftguruCatalogMerge;
  var D = window.RESIN_DATA;

  function apiBase() {
    return M && typeof M.getApiBase === "function" ? M.getApiBase() : "";
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function escAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  function imgSrc(rel) {
    if (!rel) return "";
    return D && D.imageUrl ? D.imageUrl(rel) : rel;
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
      card.className = "rm-card";
      card.innerHTML =
        '<div class="rm-card__img">' +
        (m.image ? '<img src="' + escAttr(imgSrc(m.image)) + '" alt="" loading="lazy" width="400" height="300" />' : "") +
        "</div>" +
        '<div class="rm-card__body"><h3>' +
        esc(m.name || "Material") +
        "</h3>" +
        (m.description ? "<p>" + esc(m.description) + "</p>" : "") +
        (m.note ? "<p><small>" + esc(m.note) + "</small></p>" : "") +
        "</div>";
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
