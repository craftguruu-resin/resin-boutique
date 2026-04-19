(function () {
  "use strict";

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  function currentPageName() {
    try {
      var p = (window.location.pathname || "").split("/").pop() || "";
      return String(p).split("?")[0].toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function injectCategoryRail() {
    if (document.getElementById("guestPageCategoryRail")) return;
    var pn = currentPageName();
    if (pn === "index.html") return;
    if (pn === "account.html") return;
    if (pn === "checkout.html") return;
    var main = document.querySelector("main.sub-main");
    if (!main) return;
    var D = window.RESIN_DATA;
    if (!D || !D.categories) return;

    var wrap = document.createElement("div");
    wrap.className = "guest-main-with-rail-inner";
    while (main.firstChild) {
      wrap.appendChild(main.firstChild);
    }

    var aside = document.createElement("aside");
    aside.id = "guestPageCategoryRail";
    aside.className = "home-category-rail home-category-rail--split guest-page-category-rail";
    aside.setAttribute("aria-labelledby", "guest-cat-rail-heading");

    var label = document.createElement("p");
    label.className = "home-category-rail__label";
    label.id = "guest-cat-rail-heading";
    label.textContent = "Shop by category";

    var grid = document.createElement("div");
    grid.className = "category-grid category-grid--rail";
    grid.setAttribute("role", "navigation");
    grid.setAttribute("aria-label", "Product categories");

    D.categories.forEach(function (c) {
      if (!c) return;
      var a = document.createElement("a");
      a.className = "category-pill category-pill--rail";
      a.href = "category.html?cat=" + encodeURIComponent(c.id);
      a.textContent = c.label || c.id;
      if (pn === "category.html") {
        try {
          var u = new URLSearchParams(window.location.search);
          if (u.get("cat") === c.id) a.classList.add("is-active");
        } catch (_) {}
      }
      grid.appendChild(a);
    });

    [
      ["raw-material.html", "Resin raw material"],
      ["photo-frames.html", "Photo frames"],
      ["return-gifts.html", "Return gifts"],
    ].forEach(function (pair) {
      var a2 = document.createElement("a");
      a2.className = "category-pill category-pill--rail guest-page-category-rail__extra-pill";
      a2.href = pair[0];
      a2.textContent = pair[1];
      if (pn === pair[0]) a2.classList.add("is-active");
      grid.appendChild(a2);
    });

    aside.appendChild(label);
    aside.appendChild(grid);
    main.appendChild(aside);
    main.appendChild(wrap);
  }

  function injectHeaderSearch() {
    if (document.getElementById("guestHeaderSearch")) return;
    var top = document.querySelector(".site-top");
    var brand = document.querySelector(".site-top .brand");
    if (!top || !brand) return;
    var cluster = document.createElement("div");
    cluster.className = "guest-top-cluster";
    brand.parentNode.insertBefore(cluster, brand);
    cluster.appendChild(brand);
    var wrap = document.createElement("div");
    wrap.id = "guestHeaderSearch";
    wrap.className = "guest-header-search";
    wrap.innerHTML =
      '<span class="guest-header-search__icon" aria-hidden="true">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10.5" cy="10.5" r="6.25" stroke="currentColor" stroke-width="1.6" />' +
      '<path d="M14.6 14.6L20 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />' +
      "</svg></span>" +
      '<label class="guest-header-search__lbl visually-hidden" for="guestCatalogSearchInput">Search catalog</label>' +
      '<input type="search" id="guestCatalogSearchInput" class="guest-header-search__input" placeholder="Search pieces…" autocomplete="off" />' +
      '<div id="guestCatalogSearchResults" class="guest-header-search__results" hidden></div>';
    cluster.appendChild(wrap);

    var inp = document.getElementById("guestCatalogSearchInput");
    var res = document.getElementById("guestCatalogSearchResults");
    if (!inp || !res) return;

    function runSearch() {
      var D2 = window.RESIN_DATA;
      var q = String(inp.value || "").trim();
      if (!q || !D2 || typeof D2.searchCatalogPartial !== "function") {
        res.hidden = true;
        res.innerHTML = "";
        return;
      }
      var items = D2.searchCatalogPartial(q, 14);
      if (!items.length) {
        res.innerHTML = '<p class="guest-header-search__empty">No matches.</p>';
        res.hidden = false;
        return;
      }
      res.innerHTML = items
        .map(function (p) {
          var href = "product.html?id=" + encodeURIComponent(p.id);
          var img = p.image && D2.imageUrl ? D2.imageUrl(p.image) : p.image || "";
          var rowCls = "guest-header-search__hit";
          return (
            '<a class="' +
            rowCls +
            '" href="' +
            escapeAttr(href) +
            '">' +
            (img
              ? '<span class="guest-header-search__hit-img"><img src="' +
                escapeAttr(img) +
                '" alt="" width="40" height="40" loading="lazy" /></span>'
              : "") +
            '<span class="guest-header-search__hit-txt"><strong>' +
            escapeHtml(p.name) +
            "</strong><span class=\"guest-header-search__hit-sub\">" +
            escapeHtml(D2.getCategoryLabel ? D2.getCategoryLabel(p.category) : p.category) +
            "</span></span></a>"
          );
        })
        .join("");
      res.hidden = false;
    }

    var t = null;
    inp.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(runSearch, 120);
    });
    inp.addEventListener("focus", function () {
      if (String(inp.value || "").trim()) runSearch();
    });
    document.addEventListener("click", function (ev) {
      if (!wrap.contains(ev.target)) {
        res.hidden = true;
      }
    });
    window.addEventListener("craftguruCatalogPricesMerged", function () {
      runSearch();
    });
  }

  function boot() {
    document.body.classList.add("guest-site");
    injectCategoryRail();
    injectHeaderSearch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
