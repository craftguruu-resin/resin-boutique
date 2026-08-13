(function () {
  "use strict";

  window.CraftguruCategoryScroll = window.CraftguruCategoryScroll || {};
  var reduce = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {}

  /** Scroll active pill/link inside its rail only — never scroll the document. */
  function scrollActiveWithinRail(container, active, mode) {
    if (!container || !active) return;
    requestAnimationFrame(function () {
      try {
        var behavior = reduce ? "auto" : "smooth";
        if (mode !== "vertical" && container.scrollWidth > container.clientWidth + 2) {
          var cx = active.offsetLeft + active.offsetWidth / 2;
          container.scrollTo({
            left: Math.max(0, cx - container.clientWidth / 2),
            behavior: behavior,
          });
          return;
        }
        if (mode !== "horizontal" && container.scrollHeight > container.clientHeight + 2) {
          var cy = active.offsetTop + active.offsetHeight / 2;
          container.scrollTo({
            top: Math.max(0, cy - container.clientHeight / 2),
            behavior: behavior,
          });
        }
      } catch (_) {}
    });
  }

  window.CraftguruCategoryScroll.scrollActivePill = function (container) {
    if (!container) return;
    var active = container.querySelector(".category-pill.is-active, .category-pill--rail.is-active");
    if (!active) return;
    scrollActiveWithinRail(container, active, "horizontal");
  };

  window.CraftguruCategoryScroll.scrollActiveNavLink = function (container) {
    if (!container) return;
    var active = container.querySelector(".rm-nav-tree__link.is-active");
    if (!active) return;
    scrollActiveWithinRail(container, active, "vertical");
  };

  window.CraftguruCategoryScroll.resetPageScroll = function () {
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    } catch (_) {}
    try {
      if (sessionStorage.getItem("craftguruNavScrollTop") === "1") {
        sessionStorage.removeItem("craftguruNavScrollTop");
      }
    } catch (_) {}
    window.scrollTo(0, 0);
  };
})();

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

  function catalogJsonApiBase() {
    var M = window.CraftguruCatalogMerge;
    if (M && typeof M.getApiBase === "function") {
      var b = String(M.getApiBase() || "")
        .trim()
        .replace(/\/+$/, "");
      if (b) return b;
    }
    try {
      if (window.location && window.location.protocol !== "file:") {
        return String(window.location.origin || "").replace(/\/+$/, "");
      }
    } catch (_) {}
    return "";
  }

  function headerSearchUsesRawMaterialsApi() {
    var pn = currentPageName();
    return (
      pn === "raw-material-shop.html" ||
      pn === "raw-material-product.html" ||
      pn === "raw-material.html" ||
      pn === "photo-frame-shop.html" ||
      pn === "photo-frame-product.html" ||
      pn === "photo-frames.html"
    );
  }

  function rawMaterialsSearchFetchUrl(q) {
    var root = catalogJsonApiBase();
    var pn = currentPageName();
    var isPhotoFrame =
      pn === "photo-frame-shop.html" || pn === "photo-frame-product.html" || pn === "photo-frames.html";
    var path =
      (isPhotoFrame ? "/api/catalog/photo-frame-products?q=" : "/api/catalog/raw-materials?q=") +
      encodeURIComponent(q);
    try {
      if (pn === "raw-material-shop.html" || pn === "photo-frame-shop.html" || pn === "photo-frames.html") {
        var u = new URL(window.location.href);
        var b = u.searchParams.get("base") || "";
        var s = u.searchParams.get("sub") || "";
        if (b) path += "&base=" + encodeURIComponent(b);
        if (s) path += "&sub=" + encodeURIComponent(s);
      }
    } catch (_) {}
    return root ? root + path : path;
  }

  function removeGuestCategoryRail() {
    var main = document.querySelector("main.sub-main");
    if (!main) return;
    var rail = document.getElementById("guestPageCategoryRail");
    var wrap = main.querySelector(".guest-main-with-rail-inner");
    if (wrap) {
      while (wrap.firstChild) {
        main.insertBefore(wrap.firstChild, wrap);
      }
      wrap.remove();
    }
    if (rail) {
      rail.remove();
    }
  }

  function injectCategoryRail() {
    removeGuestCategoryRail();
    var pn = currentPageName();
    if (pn === "index.html") return;
    if (pn === "about.html") return;
    if (pn === "account.html") return;
    if (pn === "checkout.html") return;
    if (pn === "raw-material-product.html") return;
    if (pn === "raw-material-shop.html") return;
    if (pn === "photo-frame-product.html") return;
    if (pn === "photo-frame-shop.html") return;
    /* Same as raw-material-shop: owns its rm-nav-tree; do not inject main catalog rail. */
    if (pn === "photo-frames.html") return;
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
    aside.className =
      "home-category-rail home-category-rail--split home-category-rail--icons guest-page-category-rail";
    aside.setAttribute("aria-labelledby", "guest-cat-rail-heading");

    var label = document.createElement("p");
    label.className = "home-category-rail__label";
    label.id = "guest-cat-rail-heading";
    label.textContent = "Shop by category";

    var grid = document.createElement("div");
    grid.className = "category-grid category-grid--rail";
    grid.setAttribute("role", "navigation");
    grid.setAttribute("aria-label", "Product categories");

    var railApi = window.CRAFT_RAIL_ICONS;

    D.categories.forEach(function (c) {
      if (!c) return;
      var a = document.createElement("a");
      a.className = "category-pill category-pill--rail";
      a.setAttribute("data-cat-id", String(c.id));
      a.href = "category.html?cat=" + encodeURIComponent(c.id);
      if (railApi && railApi.fillRailLink) {
        railApi.fillRailLink(a, { id: c.id, label: c.label || c.id });
      } else {
        a.textContent = c.label || c.id;
      }
      if (pn === "category.html") {
        try {
          var u = new URLSearchParams(window.location.search);
          if (u.get("cat") === c.id) a.classList.add("is-active");
        } catch (_) {}
      }
      grid.appendChild(a);
    });

    [
      ["raw-material-shop.html", "Resin raw material"],
      ["photo-frame-shop.html", "Photo frames shop"],
      ["photo-frames.html", "Photo frames"],
      ["return-gifts.html", "Corporate Gifting"],
    ].forEach(function (pair) {
      var a2 = document.createElement("a");
      a2.className = "category-pill category-pill--rail guest-page-category-rail__extra-pill";
      a2.href = pair[0];
      if (railApi && railApi.fillRailLink) {
        railApi.fillRailLink(a2, { id: pair[0], label: pair[1] });
      } else {
        a2.textContent = pair[1];
      }
      if (pn === pair[0]) a2.classList.add("is-active");
      grid.appendChild(a2);
    });

    aside.appendChild(label);
    aside.appendChild(grid);
    main.appendChild(aside);
    main.appendChild(wrap);
    if (window.CraftguruCategoryScroll && window.CraftguruCategoryScroll.scrollActivePill) {
      window.CraftguruCategoryScroll.scrollActivePill(grid);
    }
  }

  /** Update rail labels/icons in place — avoids mobile layout flash on catalog merge. */
  function patchCategoryRailFromData() {
    var grid = document.querySelector("#guestPageCategoryRail .category-grid--rail");
    var D = window.RESIN_DATA;
    if (!grid || !D || !D.categories) {
      injectCategoryRail();
      return;
    }
    var railApi = window.CRAFT_RAIL_ICONS;
    D.categories.forEach(function (c) {
      if (!c) return;
      var a = grid.querySelector('[data-cat-id="' + String(c.id).replace(/"/g, "") + '"]');
      if (!a) return;
      if (railApi && railApi.fillRailLink) {
        railApi.fillRailLink(a, { id: c.id, label: c.label || c.id });
      } else {
        a.textContent = c.label || c.id;
      }
    });
    if (window.CraftguruCategoryScroll && window.CraftguruCategoryScroll.scrollActivePill) {
      window.CraftguruCategoryScroll.scrollActivePill(grid);
    }
  }

  function syncGuestSearchToPageFilter(q) {
    var gf = document.getElementById("globalFindQuery");
    if (!gf) return;
    var next = String(q || "").trim();
    if (gf.value === next) return;
    gf.value = next;
    try {
      gf.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (_) {
      try {
        var ev = document.createEvent("Event");
        ev.initEvent("input", true, true);
        gf.dispatchEvent(ev);
      } catch (_2) {}
    }
  }

  function bootGuestSearchFromUrl(inp) {
    if (!inp) return;
    try {
      var q = (new URLSearchParams(window.location.search).get("q") || "").trim();
      if (!q) return;
      inp.value = q;
      syncGuestSearchToPageFilter(q);
    } catch (_) {}
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
    var ph = "Search resin catalog…";
    if (headerSearchUsesRawMaterialsApi()) {
      var pnx = currentPageName();
      ph =
        pnx === "photo-frame-shop.html" || pnx === "photo-frame-product.html" || pnx === "photo-frames.html"
          ? "Search photo frames…"
          : "Search raw materials…";
    }
    wrap.innerHTML =
      '<span class="guest-header-search__icon" aria-hidden="true">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10.5" cy="10.5" r="6.25" stroke="currentColor" stroke-width="1.6" />' +
      '<path d="M14.6 14.6L20 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />' +
      "</svg></span>" +
      '<label class="guest-header-search__lbl visually-hidden" for="guestCatalogSearchInput">Search catalog</label>' +
      '<input type="search" id="guestCatalogSearchInput" class="guest-header-search__input" placeholder="' +
      escapeAttr(ph) +
      '" autocomplete="off" />' +
      '<div id="guestCatalogSearchResults" class="guest-header-search__results" hidden></div>';
    cluster.appendChild(wrap);

    var inp = document.getElementById("guestCatalogSearchInput");
    var res = document.getElementById("guestCatalogSearchResults");
    if (!inp || !res) return;

    function renderCategoryHits(cats, D2, q) {
      if (!cats.length) return "";
      return cats
        .map(function (c) {
          var href = "category.html?cat=" + encodeURIComponent(c.id);
          if (q) href += "&q=" + encodeURIComponent(q);
          return (
            '<a class="guest-header-search__hit guest-header-search__hit--category" href="' +
            escapeAttr(href) +
            '">' +
            '<span class="guest-header-search__hit-txt"><strong>' +
            escapeHtml(D2.getCategoryLabel ? D2.getCategoryLabel(c.id) : c.label || c.id) +
            '</strong><span class="guest-header-search__hit-sub">Category</span></span></a>'
          );
        })
        .join("");
    }

    function renderCrossCatalogShortcuts(q) {
      if (!q || headerSearchUsesRawMaterialsApi()) return "";
      var enc = encodeURIComponent(q);
      return (
        '<div class="guest-header-search__sections" role="group" aria-label="Other catalogs">' +
        '<a class="guest-header-search__hit guest-header-search__hit--section" href="raw-material-shop.html?q=' +
        enc +
        '"><span class="guest-header-search__hit-txt"><strong>Raw materials</strong><span class="guest-header-search__hit-sub">Search supplies</span></span></a>' +
        '<a class="guest-header-search__hit guest-header-search__hit--section" href="photo-frames.html?q=' +
        enc +
        '"><span class="guest-header-search__hit-txt"><strong>Photo frames</strong><span class="guest-header-search__hit-sub">Search frames</span></span></a>' +
        '<a class="guest-header-search__hit guest-header-search__hit--section" href="return-gifts.html?q=' +
        enc +
        '"><span class="guest-header-search__hit-txt"><strong>Corporate gifting</strong><span class="guest-header-search__hit-sub">Bulk &amp; return gifts</span></span></a>' +
        "</div>"
      );
    }

    function renderResinCatalogHits(items, D2, q, cats) {
      var catHtml = renderCategoryHits(cats || [], D2, q);
      var sectionHtml = renderCrossCatalogShortcuts(q);
      if (!items.length && !catHtml && !sectionHtml) {
        res.innerHTML = '<p class="guest-header-search__empty">No matches.</p>';
        res.hidden = false;
        return;
      }
      var productHtml = items.length
        ? items
            .map(function (p) {
              var href = "product.html?id=" + encodeURIComponent(p.id);
              var img = p.image && D2.imageUrl ? D2.imageUrl(p.image, 80) : p.image || "";
              var from =
                D2.formatStartingFromPrice && window.RESIN_CART && window.RESIN_CART.formatMoney
                  ? D2.formatStartingFromPrice(p, window.RESIN_CART.formatMoney)
                  : "";
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
                escapeHtml(
                  (D2.getCategoryLabel ? D2.getCategoryLabel(p.category) : p.category) +
                    (from ? " · " + from : "")
                ) +
                "</span></span></a>"
              );
            })
            .join("")
        : "";
      res.innerHTML = sectionHtml + catHtml + productHtml;
      res.hidden = false;
    }

    function renderRawMaterialHits(materials, D2) {
      var list = (materials || []).slice(0, 14);
      if (!list.length) {
        res.innerHTML = '<p class="guest-header-search__empty">No matches.</p>';
        res.hidden = false;
        return;
      }
      var pnHit = currentPageName();
      var isPfHit =
        pnHit === "photo-frame-shop.html" || pnHit === "photo-frame-product.html" || pnHit === "photo-frames.html";
      var pdpHref = isPfHit ? "photo-frame-product.html?id=" : "raw-material-product.html?id=";
      var subDefault = isPfHit ? "Photo frame" : "Raw material";
      res.innerHTML = list
        .map(function (m) {
          var href = pdpHref + encodeURIComponent(m.id);
          var img = m.image && D2 && D2.imageUrl ? D2.imageUrl(m.image, 80) : String((m && m.image) || "").trim();
          var sub =
            [m.baseCategorySlug, m.subcategorySlug].filter(Boolean).join(" · ") || subDefault;
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
            escapeHtml(m.name || "Material") +
            "</strong><span class=\"guest-header-search__hit-sub\">" +
            escapeHtml(sub) +
            "</span></span></a>"
          );
        })
        .join("");
      res.hidden = false;
    }

    function runSearch() {
      var D2 = window.RESIN_DATA;
      var q = String(inp.value || "").trim();
      syncGuestSearchToPageFilter(q);
      if (!q) {
        res.hidden = true;
        res.innerHTML = "";
        return;
      }
      if (headerSearchUsesRawMaterialsApi()) {
        fetch(rawMaterialsSearchFetchUrl(q))
          .then(function (r) {
            return r.json();
          })
          .then(function (j) {
            if (!j || !j.ok) {
              res.innerHTML = '<p class="guest-header-search__empty">No matches.</p>';
              res.hidden = false;
              return;
            }
            renderRawMaterialHits(j.materials || [], D2);
          })
          .catch(function () {
            res.innerHTML = '<p class="guest-header-search__empty">Search unavailable.</p>';
            res.hidden = false;
          });
        return;
      }
      if (!D2 || typeof D2.searchCatalogPartial !== "function") {
        res.hidden = true;
        res.innerHTML = "";
        return;
      }
      var cats =
        typeof D2.searchCategoriesPartial === "function" ? D2.searchCategoriesPartial(q, 4) : [];
      var items = D2.searchCatalogPartial(q, 14);
      renderResinCatalogHits(items, D2, q, cats);
    }

    var t = null;
    inp.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(runSearch, 120);
    });
    inp.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var v = String(inp.value || "").trim();
      syncGuestSearchToPageFilter(v);
      var gf = document.getElementById("globalFindQuery");
      if (!gf) return;
      try {
        gf.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      } catch (_) {
        try {
          var ev = document.createEvent("KeyboardEvent");
          ev.initKeyboardEvent("keydown", true, true, window, "Enter", 0, "", false, "");
          gf.dispatchEvent(ev);
        } catch (_2) {}
      }
    });
    inp.addEventListener("focus", function () {
      if (String(inp.value || "").trim()) runSearch();
    });
    document.addEventListener("click", function (ev) {
      if (!wrap.contains(ev.target)) {
        res.hidden = true;
      }
    });
    bootGuestSearchFromUrl(inp);
    if (String(inp.value || "").trim()) runSearch();
    window.addEventListener("craftguruCatalogVendorProductsMerged", function () {
      if (!String(inp.value || "").trim()) return;
      runSearch();
    });
    window.addEventListener("craftguruCatalogPricesMerged", function () {
      if (!String(inp.value || "").trim()) return;
      runSearch();
    });
    window.addEventListener("craftguruCatalogCategoriesMerged", function () {
      if (!String(inp.value || "").trim()) return;
      runSearch();
    });
  }

  function removeLegacyCatalogSyncButton() {
    var btn = document.getElementById("catalogSyncBtn");
    if (btn) btn.remove();
  }

  function ensureSiteTopActions(host) {
    if (!host) return null;
    var actions = host.querySelector(".site-top-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "site-top-actions";
      var cartEl = document.getElementById("cartToggle");
      if (cartEl) {
        host.insertBefore(actions, cartEl);
      } else {
        host.appendChild(actions);
      }
    }
    return actions;
  }

  /** Catalog subpages historically omitted the home auth bar — inject so Sign up / Log in match index.html. */
  function injectStorefrontAuthChrome() {
    removeLegacyCatalogSyncButton();
    if (document.getElementById("homeAuthBar")) {
      var topEndExisting = document.querySelector(".site-top-end");
      var wishExisting = document.getElementById("homeWishlistLink");
      var cartExisting = document.getElementById("cartToggle");
      if (topEndExisting && wishExisting && cartExisting) {
        var actionsExisting = ensureSiteTopActions(topEndExisting);
        if (actionsExisting && wishExisting.parentElement !== actionsExisting) {
          actionsExisting.insertBefore(wishExisting, cartExisting);
        }
      }
      wireHeaderWishlistLink();
      return;
    }
    var pn = currentPageName();
    if (!pn) return;
    var pl = pn.toLowerCase();
    if (pl.indexOf("vendor") === 0) return;

    var topEnd = document.querySelector(".site-top-end");
    if (!topEnd) return;

    var bar = document.createElement("div");
    bar.className = "home-auth-bar";
    bar.id = "homeAuthBar";
    bar.innerHTML =
      '<span class="home-auth-user is-hidden" id="homeAuthUser"></span>' +
      '<button type="button" class="home-auth-btn" id="homeAuthSignup">Sign up</button>' +
      '<button type="button" class="home-auth-btn" id="homeAuthLogin">Log in</button>' +
      '<a href="account.html" class="home-auth-btn home-auth-btn--soft is-hidden" id="homeAuthOrders">My orders</a>' +
      '<button type="button" class="home-auth-btn is-hidden" id="homeAuthLogout">Log out</button>';
    topEnd.insertBefore(bar, topEnd.firstChild);

    var cartEl = document.getElementById("cartToggle");
    var actions = ensureSiteTopActions(topEnd);
    var wishlist = document.createElement("a");
    wishlist.href = "wishlist.html";
    wishlist.className = "home-auth-btn home-header-wish";
    wishlist.id = "homeWishlistLink";
    wishlist.setAttribute("aria-label", "Wishlist");
    wishlist.title = "Wishlist";
    wishlist.innerHTML =
      '<span aria-hidden="true">♡</span><span class="home-header-wish__label">Wishlist</span>' +
      '<span class="home-header-wish__count" id="homeWishlistCount" hidden></span>';
    if (actions && cartEl) {
      actions.insertBefore(wishlist, cartEl);
    } else if (cartEl) {
      topEnd.insertBefore(wishlist, cartEl);
    } else {
      topEnd.appendChild(wishlist);
    }

    if (document.getElementById("authModal")) return;

    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="auth-modal" id="authModal" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">' +
      '<button type="button" class="auth-modal__backdrop" id="authModalBackdrop" aria-label="Close"></button>' +
      '<div class="auth-modal__sheet">' +
      '<div class="auth-modal__head">' +
      '<h2 id="authModalTitle">Account</h2>' +
      '<button type="button" class="auth-modal__x" id="authModalClose" aria-label="Close">✕</button>' +
      "</div>" +
      '<p class="auth-google-hint">Optional: sign in with Google (same session as email code across the site).</p>' +
      '<div class="auth-google-slot" id="homeGoogleSignIn" aria-label="Sign in with Google"></div>' +
      '<p class="auth-or-divider"><span>or use email code</span></p>' +
      '<div class="auth-tabs">' +
      '<button type="button" class="auth-tab is-active" id="authTabSignup">Sign up</button>' +
      '<button type="button" class="auth-tab" id="authTabLogin">Log in</button>' +
      "</div>" +
      '<div id="authPanelSignup">' +
      '<div class="auth-field"><label for="authNameSignup">Name (optional)</label>' +
      '<input id="authNameSignup" type="text" autocomplete="name" placeholder="Your name" /></div>' +
      '<div class="auth-field"><label for="authEmailSignup">Email</label>' +
      '<input id="authEmailSignup" type="email" autocomplete="email" placeholder="you@example.com" maxlength="200" /></div>' +
      '<button type="button" class="checkout-pay-secondary" id="authSendOtpSignup">Send OTP</button>' +
      '<div class="auth-field"><label for="authOtpSignup">Enter OTP</label>' +
      '<input id="authOtpSignup" type="text" inputmode="numeric" maxlength="6" placeholder="6-digit code" /></div>' +
      '<p class="auth-msg" id="authMsgSignup" style="display: none"></p>' +
      '<button type="button" class="auth-submit" id="authSubmitSignup">Create account</button>' +
      "</div>" +
      '<div id="authPanelLogin" class="is-hidden">' +
      '<div class="auth-field"><label for="authEmailLogin">Email</label>' +
      '<input id="authEmailLogin" type="email" autocomplete="email" placeholder="you@example.com" maxlength="200" /></div>' +
      '<button type="button" class="checkout-pay-secondary" id="authSendOtpLogin">Send OTP</button>' +
      '<div class="auth-field"><label for="authOtpLogin">Enter OTP</label>' +
      '<input id="authOtpLogin" type="text" inputmode="numeric" maxlength="6" placeholder="6-digit code" /></div>' +
      '<p class="auth-msg" id="authMsgLogin" style="display: none"></p>' +
      '<button type="button" class="auth-submit" id="authSubmitLogin">Log in</button>' +
      "</div></div></div>";
    var modal = wrap.firstElementChild;
    if (modal) document.body.appendChild(modal);
    /* auth-db.js, google-signin.js, auth-home.js must be included in page markup after guest-layout.js (see category.html). */
    if (window.CRAFT_AUTH_HOME && typeof window.CRAFT_AUTH_HOME.boot === "function") {
      window.CRAFT_AUTH_HOME.boot();
    }
    wireHeaderWishlistLink();
  }

  function syncHeaderWishlistUi() {
    var countEl = document.getElementById("homeWishlistCount");
    var link = document.getElementById("homeWishlistLink");
    if (!countEl && !link) return;
    var n = 0;
    try {
      var WL = window.RESIN_WISHLIST;
      if (WL && typeof WL.load === "function") n = (WL.load() || []).length;
    } catch (_) {}
    if (countEl) {
      if (n > 0) {
        countEl.textContent = String(n);
        countEl.removeAttribute("hidden");
      } else {
        countEl.textContent = "";
        countEl.setAttribute("hidden", "hidden");
      }
    }
    if (link) link.classList.toggle("is-on", n > 0);
  }

  function wireHeaderWishlistLink() {
    syncHeaderWishlistUi();
    var link = document.getElementById("homeWishlistLink");
    if (link && !link.dataset.wishHeaderWired) {
      link.dataset.wishHeaderWired = "1";
      link.title = "Wishlist";
      link.addEventListener("click", function (ev) {
        try {
          var tok = String(localStorage.getItem("craftguruGuestToken") || "").trim();
          if (!tok) {
            ev.preventDefault();
            if (window.CRAFT_AUTH_HOME && typeof window.CRAFT_AUTH_HOME.openAuth === "function") {
              window.CRAFT_AUTH_HOME.openAuth("login");
            } else {
              window.location.href = "account.html";
            }
          }
        } catch (_) {}
      });
    }
    window.addEventListener("resinWishlistChanged", syncHeaderWishlistUi);
  }

  function injectScriptOnce(src, defer) {
    if (document.querySelector('script[src="' + src + '"]') || document.querySelector('script[src*="' + src + '"]')) {
      return;
    }
    var script = document.createElement("script");
    script.src = src;
    if (defer) script.defer = true;
    document.body.appendChild(script);
  }

  function ensureRailIconsLoaded(done) {
    if (window.CRAFT_RAIL_ICONS) {
      if (done) done();
      return;
    }
    var existing = document.querySelector('script[src*="category-rail-icons.js"]');
    if (existing) {
      existing.addEventListener("load", function () {
        if (done) done();
      });
      return;
    }
    var script = document.createElement("script");
    script.src = "category-rail-icons.js";
    script.onload = function () {
      if (done) done();
    };
    script.onerror = function () {
      if (done) done();
    };
    document.head.appendChild(script);
  }

  function ensureStylesheet(href) {
    if (document.querySelector('link[href*="' + href + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureSocialFloatStack() {
    var stack = document.getElementById("cgSocialFloatStack");
    if (stack) return stack;
    stack = document.createElement("div");
    stack.id = "cgSocialFloatStack";
    stack.className = "cg-social-float-stack";
    stack.setAttribute("aria-label", "Contact shortcuts");
    document.body.appendChild(stack);
    return stack;
  }

  function injectSocialFloatWidgets() {
    var pn = currentPageName();
    if (pn.indexOf("vendor") === 0) return;
    ensureSocialFloatStack();
    ensureStylesheet("social-float-stack.css");
    ensureStylesheet("whatsapp-widget.css");
    ensureStylesheet("instagram-widget.css");
    injectScriptOnce("craftguru-whatsapp.js", false);
    injectScriptOnce("craftguru-instagram.js", false);
    injectScriptOnce("whatsapp-widget.js", true);
    injectScriptOnce("instagram-widget.js", true);
  }

  /* Run as soon as guest-layout loads so floats appear on every storefront page. */
  if (document.body) {
    injectSocialFloatWidgets();
  } else {
    document.addEventListener("DOMContentLoaded", injectSocialFloatWidgets);
  }

  function ensureLayoutResponsiveStyles() {
    ensureStylesheet("layout-responsive.css");
    try {
      document.documentElement.classList.add("guest-responsive-root");
    } catch (_) {}
  }

  function wireMobileSidebarDrawers() {
    var mq = window.matchMedia("(max-width: 899px)");
    var backdrop = null;

    function ensureBackdrop() {
      if (backdrop) return backdrop;
      backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "cg-rail-backdrop";
      backdrop.setAttribute("aria-label", "Close navigation menu");
      backdrop.hidden = true;
      backdrop.addEventListener("click", closeAllDrawers);
      document.body.appendChild(backdrop);
      return backdrop;
    }

    function closeAllDrawers() {
      document.body.classList.remove("cg-rail-open");
      if (backdrop) backdrop.hidden = true;
      document.querySelectorAll(".cg-rail-drawer-panel.is-open").forEach(function (panel) {
        panel.classList.remove("is-open");
        restorePanelFromBody(panel);
      });
      document.querySelectorAll(".cg-rail-toggle[aria-expanded='true']").forEach(function (btn) {
        btn.setAttribute("aria-expanded", "false");
      });
    }

    /** Move drawer panel to body so it stacks above the backdrop (main is z-index: 1). */
    function portalPanelToBody(sidebar) {
      if (!sidebar || !mq.matches) return;
      if (!sidebar._cgRailAnchor && sidebar.parentElement && sidebar.parentElement !== document.body) {
        sidebar._cgRailAnchor = {
          parent: sidebar.parentElement,
          next: sidebar.nextSibling,
        };
      }
      if (sidebar.parentElement !== document.body) {
        var bd = ensureBackdrop();
        if (bd && bd.parentElement === document.body) {
          document.body.insertBefore(sidebar, bd.nextSibling);
        } else {
          document.body.appendChild(sidebar);
        }
      }
      sidebar.dataset.cgRailPortaled = "1";
    }

    function restorePanelFromBody(sidebar) {
      if (!sidebar || sidebar.dataset.cgRailPortaled !== "1") return;
      var anchor = sidebar._cgRailAnchor;
      if (anchor && anchor.parent && anchor.parent.isConnected !== false) {
        if (anchor.next && anchor.next.parentNode === anchor.parent) {
          anchor.parent.insertBefore(sidebar, anchor.next);
        } else {
          anchor.parent.appendChild(sidebar);
        }
      }
      sidebar.dataset.cgRailPortaled = "0";
      delete sidebar._cgRailAnchor;
    }

    function collectSidebars() {
      var items = [];
      var home = document.getElementById("categories");
      if (home && home.classList.contains("home-category-rail")) {
        items.push({
          el: home,
          label: "Shop by category",
          host: home.closest(".home-landing-layout"),
        });
      }
      var guest = document.getElementById("guestPageCategoryRail");
      if (guest) {
        items.push({
          el: guest,
          label: "Shop by category",
          host: guest.closest(".guest-main-with-rail-inner") || guest.parentElement,
        });
      }
      document.querySelectorAll(".rm-shop-layout .rm-category-rail, .rm-shop-layout .rm-nav-tree-wrap").forEach(function (el) {
        var titleEl = el.querySelector(".home-category-rail__label, .rm-nav-tree__title, .rm-nav-tree__title-link");
        var label = titleEl ? String(titleEl.textContent || "").trim() : "Shop by category";
        items.push({
          el: el,
          label: label || "Categories",
          host: el.closest(".rm-shop-layout") || el.parentElement,
        });
      });
      return items;
    }

    function wireSidebar(item) {
      var sidebar = item.el;
      if (!sidebar || sidebar.dataset.cgRailDrawer === "1") return;
      sidebar.dataset.cgRailDrawer = "1";
      sidebar.classList.add("cg-rail-drawer-panel");
      if (!sidebar.id) {
        sidebar.id = "cg-rail-drawer-" + Math.random().toString(36).slice(2, 9);
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cg-rail-toggle";
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", sidebar.id);
      btn.innerHTML =
        '<span class="cg-rail-toggle__bars" aria-hidden="true"><span></span><span></span><span></span></span>' +
        '<span class="cg-rail-toggle__text">' +
        escapeHtml(item.label) +
        "</span>";

      var host = item.host;
      if (host) {
        host.insertBefore(btn, host.firstChild);
      } else if (sidebar.parentElement) {
        sidebar.parentElement.insertBefore(btn, sidebar);
      }

      btn.addEventListener("click", function () {
        if (btn.getAttribute("aria-expanded") === "true") {
          closeAllDrawers();
          return;
        }
        closeAllDrawers();
        portalPanelToBody(sidebar);
        sidebar.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        document.body.classList.add("cg-rail-open");
        ensureBackdrop().hidden = false;
      });

      sidebar.addEventListener("click", function (ev) {
        var link =
          ev.target &&
          ev.target.closest &&
          ev.target.closest("a.category-pill--rail, a.rm-nav-tree__link, a.category-pill");
        if (!link || !mq.matches) return;
        var dest = String(link.getAttribute("href") || "").trim();
        /* Restoring the panel during click can cancel first-tap navigation on mobile. */
        if (dest && dest !== "#" && dest.charAt(0) !== "#") return;
        closeAllDrawers();
      });
    }

    function removeOrphanToggles() {
      document.querySelectorAll(".cg-rail-toggle").forEach(function (btn) {
        var id = btn.getAttribute("aria-controls");
        if (!id || !document.getElementById(id)) btn.remove();
      });
    }

    function applyDrawerMode() {
      document.body.classList.toggle("cg-rail-drawer-enabled", mq.matches);
      if (!mq.matches) {
        closeAllDrawers();
        document.querySelectorAll(".cg-rail-drawer-panel").forEach(restorePanelFromBody);
        return;
      }
      ensureBackdrop();
      removeOrphanToggles();
      collectSidebars().forEach(wireSidebar);
    }

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", applyDrawerMode);
    } else if (typeof mq.addListener === "function") {
      mq.addListener(applyDrawerMode);
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeAllDrawers();
    });

    applyDrawerMode();
  }

  function injectFooterMainMenu() {
    var D = window.RESIN_DATA;
    if (!D || !D.categories) return;
    var cols = document.querySelectorAll(".footer-sitemap__col");
    var col = null;
    cols.forEach(function (c) {
      var h = c.querySelector(".footer-sitemap__title");
      if (h && /main menu/i.test(String(h.textContent || ""))) col = c;
    });
    if (!col) return;
    var ul = col.querySelector(".footer-sitemap__list");
    if (!ul) return;
    ul.innerHTML = "";
    D.categories.forEach(function (c) {
      if (!c || !c.id) return;
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "category.html?cat=" + encodeURIComponent(String(c.id));
      a.textContent = D.getCategoryLabel ? D.getCategoryLabel(c.id) : c.label || c.id;
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  function ensureIconRailStyles() {
    if (document.querySelector('link[href*="category-rail-icons.css"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "category-rail-icons.css";
    document.head.appendChild(link);
  }

  function ensureCloudinaryPreconnect() {
    if (document.querySelector("link[data-cg-preconnect='cloudinary']")) return;
    var link = document.createElement("link");
    link.rel = "preconnect";
    link.href = "https://res.cloudinary.com";
    link.crossOrigin = "anonymous";
    link.setAttribute("data-cg-preconnect", "cloudinary");
    document.head.appendChild(link);
  }

  function boot() {
    document.body.classList.add("guest-site");
    ensureCloudinaryPreconnect();
    removeLegacyCatalogSyncButton();
    if (window.CraftguruCategoryScroll && window.CraftguruCategoryScroll.resetPageScroll) {
      window.CraftguruCategoryScroll.resetPageScroll();
    }
    ensureLayoutResponsiveStyles();
    ensureIconRailStyles();
    ensureRailIconsLoaded(function () {
      injectCategoryRail();
      wireMobileSidebarDrawers();
      if (window.CraftguruCategoryScroll && window.CraftguruCategoryScroll.resetPageScroll) {
        requestAnimationFrame(function () {
          window.CraftguruCategoryScroll.resetPageScroll();
        });
      }
    });
    wireMobileSidebarDrawers();
    injectHeaderSearch();
    injectStorefrontAuthChrome();
    wireHeaderWishlistLink();
    injectSocialFloatWidgets();
    injectFooterMainMenu();
  }

  window.addEventListener("craftguruCatalogCategoriesMerged", function () {
    try {
      ensureRailIconsLoaded(function () {
        patchCategoryRailFromData();
        wireMobileSidebarDrawers();
      });
      injectFooterMainMenu();
    } catch (_) {}
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
