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
      var pair =
        D.getCategoryPreviewImagePair && D.getCategoryPreviewImagePair(c.id)
          ? D.getCategoryPreviewImagePair(c.id)
          : {
              primary: D.getCategoryPreviewImage ? D.getCategoryPreviewImage(c.id) : "",
              fallback: "",
            };
      var previewImg = String((pair && pair.primary) || "").trim();
      var previewFallback = String((pair && pair.fallback) || "").trim();
      if (previewImg && D.imageUrl) {
        var img = document.createElement("img");
        img.src = D.imageUrl(previewImg);
        img.alt = "";
        img.width = 28;
        img.height = 28;
        img.loading = "lazy";
        img.style.objectFit = "cover";
        img.style.borderRadius = "6px";
        img.style.marginRight = "0.4rem";
        img.style.verticalAlign = "middle";
        if (previewFallback) {
          var fbUrl = D.imageUrl(previewFallback);
          img.setAttribute("data-fallback-src", fbUrl);
          img.addEventListener("error", function onRailImgError() {
            var alt = img.getAttribute("data-fallback-src") || "";
            if (alt && img.src !== alt) {
              img.src = alt;
              img.removeAttribute("data-fallback-src");
              return;
            }
            img.removeEventListener("error", onRailImgError);
            img.remove();
          });
        }
        a.appendChild(img);
      }
      a.appendChild(document.createTextNode(c.label || c.id));
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

    function renderResinCatalogHits(items, D2) {
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
          var img = m.image && D2 && D2.imageUrl ? D2.imageUrl(m.image) : String((m && m.image) || "").trim();
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
      if (!q) {
        res.hidden = true;
        res.innerHTML = "";
        return;
      }
      if (headerSearchUsesRawMaterialsApi()) {
        fetch(rawMaterialsSearchFetchUrl(q), { cache: "no-store" })
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
      var items = D2.searchCatalogPartial(q, 14);
      renderResinCatalogHits(items, D2);
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
    window.addEventListener("craftguruCatalogVendorProductsMerged", function () {
      runSearch();
    });
    window.addEventListener("craftguruCatalogPricesMerged", function () {
      runSearch();
    });
  }

  /** Catalog subpages historically omitted the home auth bar — inject so Sign up / Log in match index.html. */
  function injectStorefrontAuthChrome() {
    if (document.getElementById("homeAuthBar")) return;
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
  }

  function boot() {
    document.body.classList.add("guest-site");
    injectCategoryRail();
    injectHeaderSearch();
    injectStorefrontAuthChrome();
  }

  window.addEventListener("craftguruCatalogCategoriesMerged", function () {
    try {
      if (document.getElementById("guestPageCategoryRail")) return;
      injectCategoryRail();
    } catch (_) {}
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
