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
    if (document.getElementById("guestCatRail")) return;
    if (currentPageName() === "index.html") return;
    var D = window.RESIN_DATA;
    if (!D || !D.categories) return;
    var aside = document.createElement("aside");
    aside.id = "guestCatRail";
    aside.className = "guest-cat-rail";
    aside.setAttribute("aria-label", "Shop categories");
    var inner = document.createElement("div");
    inner.className = "guest-cat-rail__inner";
    var h = document.createElement("p");
    h.className = "guest-cat-rail__title";
    h.textContent = "Categories";
    inner.appendChild(h);
    var nav = document.createElement("nav");
    nav.className = "guest-cat-rail__nav";
    D.categories.forEach(function (c) {
      if (!c || c.id === "craftguru-details") return;
      var a = document.createElement("a");
      a.className = "guest-cat-rail__link";
      a.href = "category.html?cat=" + encodeURIComponent(c.id);
      a.textContent = c.label || c.id;
      var page = currentPageName();
      if (page === "category.html") {
        try {
          var u = new URLSearchParams(window.location.search);
          if (u.get("cat") === c.id) a.classList.add("is-active");
        } catch (_) {}
      }
      nav.appendChild(a);
    });
    inner.appendChild(nav);
    var extra = document.createElement("div");
    extra.className = "guest-cat-rail__extra";
    var pn = currentPageName();
    extra.innerHTML =
      '<a class="guest-cat-rail__link guest-cat-rail__link--sub' +
      (pn === "raw-material.html" ? " is-active" : "") +
      '" href="raw-material.html">Resin raw material</a>' +
      '<a class="guest-cat-rail__link guest-cat-rail__link--sub' +
      (pn === "photo-frames.html" ? " is-active" : "") +
      '" href="photo-frames.html">Photo frames</a>' +
      '<a class="guest-cat-rail__link guest-cat-rail__link--sub' +
      (pn === "return-gifts.html" ? " is-active" : "") +
      '" href="return-gifts.html">Return gifts</a>';
    inner.appendChild(extra);
    aside.appendChild(inner);
    document.body.insertBefore(aside, document.body.firstChild);
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
          return (
            '<a class="guest-header-search__hit" href="' +
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
