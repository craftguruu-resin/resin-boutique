(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART) return;

  var els = {
    categoryGrid: document.getElementById("categoryGrid"),
    productGrid: document.getElementById("productGrid"),
    filterLabel: document.getElementById("filterLabel"),
    cartCount: document.getElementById("cartCount"),
    cartToggle: document.getElementById("cartToggle"),
    cartDrawer: document.getElementById("cartDrawer"),
    cartBackdrop: document.getElementById("cartBackdrop"),
    cartClose: document.getElementById("cartClose"),
    cartList: document.getElementById("cartList"),
    cartSubtotal: document.getElementById("cartSubtotal"),
    checkoutBtn: document.getElementById("checkoutBtn"),
    year: document.getElementById("year"),
    heroStage: document.getElementById("heroStage"),
  };

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  function imgUrl(rel) {
    return D.imageUrl ? D.imageUrl(rel) : rel;
  }

  function getLineImage(line) {
    if (line && line.image) return line.image;
    if (!D || !D.getProduct || !line || !line.id) return "";
    var p = D.getProduct(line.id);
    return p && p.image ? p.image : "";
  }

  function minCompactPrice(product) {
    if (!product || !product.prices) return null;
    var keys = ["s", "m", "l"];
    var min = null;
    keys.forEach(function (k) {
      var v = product.prices[k];
      if (v == null) return;
      if (min === null || v < min) min = v;
    });
    return min;
  }

  function firstShopProductPerCategory() {
    var out = [];
    var seen = {};
    if (!D.categories || !D.byCategory) return out;
    D.categories.forEach(function (cat) {
      if (!cat || cat.id === "craftguru-details") return;
      var ids = D.byCategory[cat.id];
      if (!ids || !ids.length) return;
      var pick = "";
      for (var ii = 0; ii < ids.length; ii++) {
        var cand = D.getProduct(ids[ii]);
        if (cand && cand.listed !== false && cand.image && !cand.outOfStock) {
          pick = ids[ii];
          break;
        }
      }
      if (!pick) {
        for (var jj = 0; jj < ids.length; jj++) {
          var c2 = D.getProduct(ids[jj]);
          if (c2 && c2.listed !== false && c2.image) {
            pick = ids[jj];
            break;
          }
        }
      }
      if (!pick) return;
      var p = D.getProduct(pick);
      if (!p || !p.image || seen[p.id]) return;
      seen[p.id] = 1;
      out.push(p);
    });
    return out;
  }

  function paintHeroFloatCatalog() {
    var root = document.getElementById("heroFloatscape");
    if (!root) return;
    var imgs = root.querySelectorAll("img[data-hero-float-img]");
    if (!imgs.length) return;
    var pool = firstShopProductPerCategory();
    var n = Math.min(imgs.length, pool.length);
    var i;
    for (i = 0; i < n; i++) {
      imgs[i].src = imgUrl(pool[i].image);
      imgs[i].alt = "";
    }
    root.querySelectorAll(".hero-float-polar").forEach(function (fig, idx) {
      fig.hidden = idx >= n;
    });
  }

  function renderHeroSpotlight() {
    var host = document.getElementById("heroSpotlightStrip");
    if (!host) return;
    var pool = firstShopProductPerCategory().slice(0, 6);
    if (!pool.length) {
      host.innerHTML = "";
      host.setAttribute("hidden", "");
      return;
    }
    host.removeAttribute("hidden");
    var parts = pool.map(function (p) {
      var href = "product.html?id=" + encodeURIComponent(p.id);
      var nm = String(p.name || "Piece").trim();
      var short = nm.length > 44 ? nm.slice(0, 44) + "…" : nm;
      return (
        '<a class="hero-spot-card reveal-tile" href="' +
        href +
        '"><span class="hero-spot-card__glow" aria-hidden="true"></span><span class="hero-spot-card__media"><img src="' +
        escapeAttr(imgUrl(p.image)) +
        '" alt="" loading="lazy" width="240" height="240" /></span><span class="hero-spot-card__meta"><span class="hero-spot-card__name">' +
        escapeHtml(short) +
        '</span><span class="hero-spot-card__hint">Open piece →</span></span></a>'
      );
    });
    host.innerHTML =
      '<p class="hero-spotlight__kicker">Our best sellers</p>' +
      '<div class="hero-spotlight__track">' +
      parts.join("") +
      "</div>";
    observeTiles();
  }

  function minPriceInCategory(catId) {
    var ids = D.byCategory && D.byCategory[catId];
    if (!ids || !ids.length) return null;
    var m = null;
    for (var i = 0; i < ids.length; i++) {
      var p = D.getProduct(ids[i]);
      var c = minCompactPrice(p);
      if (c != null && (m === null || c < m)) m = c;
    }
    return m;
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

  function syncHomeFindUrl() {
    try {
      var u = new URL(window.location.href);
      var inp = document.getElementById("globalFindQuery");
      var cap = document.getElementById("globalFindHomePriceCap");
      var q = inp && inp.value.trim();
      var m = cap && cap.value;
      if (q) u.searchParams.set("q", q);
      else u.searchParams.delete("q");
      if (m) u.searchParams.set("maxp", m);
      else u.searchParams.delete("maxp");
      var hash = window.location.hash || "";
      history.replaceState(
        {},
        "",
        u.pathname + (u.search ? "?" + u.searchParams.toString() : "") + hash
      );
    } catch (_) {}
  }

  function applyHomeCatalogFilter() {
    var inp = document.getElementById("globalFindQuery");
    var capEl = document.getElementById("globalFindHomePriceCap");
    var q = inp ? inp.value.trim() : "";
    var hint = document.getElementById("globalFindHint");
    var cap = capEl && capEl.value ? parseFloat(capEl.value, 10) : NaN;

    if (els.categoryGrid) {
      els.categoryGrid.querySelectorAll(".category-pill").forEach(function (pill) {
        var hay = (pill.getAttribute("data-search-text") || pill.textContent || "").toLowerCase();
        pill.classList.toggle("is-catalog-hidden", !partialTokenMatch(hay, q));
      });
    }
    if (els.productGrid) {
      var cards = els.productGrid.querySelectorAll(".featured-cat-card");
      var n = 0;
      var total = cards.length;
      cards.forEach(function (card) {
        var t = (card.getAttribute("data-search-text") || "").toLowerCase();
        var nameOk = partialTokenMatch(t, q);
        var mp = parseFloat(card.getAttribute("data-min-price") || "", 10);
        var priceOk = isNaN(cap) ? true : !isNaN(mp) && mp <= cap;
        var match = nameOk && priceOk;
        card.classList.toggle("is-catalog-hidden", !match);
        if (match) n++;
      });
      if (hint) {
        if (n === total) hint.textContent = "";
        else {
          var parts = [];
          if (q) parts.push(n + "/" + total + " name matches");
          if (!isNaN(cap)) parts.push("≤ ₹" + cap + " “from”");
          hint.textContent = parts.length ? "Showing " + parts.join(" · ") + "." : "";
        }
      }
    }
    syncHomeFindUrl();
  }

  function renderCategories() {
    if (!els.categoryGrid) return;
    els.categoryGrid.innerHTML = "";
    var rail = els.categoryGrid.classList && els.categoryGrid.classList.contains("category-grid--rail");
    D.categories.forEach(function (cat, i) {
      var a = document.createElement("a");
      /* Rail sits in a narrow column: reveal-pill starts at opacity 0 and often never gets is-inview — keep links always visible. */
      a.className = rail ? "category-pill category-pill--rail" : "category-pill reveal-pill";
      if (!rail) {
        a.style.setProperty("--delay", (0.035 * i).toFixed(3) + "s");
      }
      a.href = "category.html?cat=" + encodeURIComponent(cat.id);
      a.textContent = cat.label;
      a.setAttribute("data-search-text", (cat.label + " " + cat.id).toLowerCase());
      els.categoryGrid.appendChild(a);
    });
    applyHomeCatalogFilter();
  }

  var FEATURED_SKIP_CATEGORIES = {
    "craftguru-details": true,
  };

  function firstProductInCategory(catId) {
    var ids = D.byCategory && D.byCategory[catId];
    if (!ids || !ids.length) return null;
    var pass;
    for (pass = 0; pass < 2; pass++) {
      for (var i = 0; i < ids.length; i++) {
        var p = D.getProduct(ids[i]);
        if (!p || p.listed === false) continue;
        if (pass === 0 && p.outOfStock) continue;
        return p;
      }
    }
    return null;
  }

  function firstInStockListedProduct(catId) {
    var ids = D.byCategory && D.byCategory[catId];
    if (!ids || !ids.length) return null;
    for (var i = 0; i < ids.length; i++) {
      var p = D.getProduct(ids[i]);
      if (!p || p.listed === false || p.outOfStock) continue;
      return p;
    }
    return null;
  }

  function quickAddFromCategory(catId) {
    var p = firstInStockListedProduct(catId);
    if (!p) {
      try {
        window.alert(
          "No in-stock piece is available to add from this line right now. Open the collection to pick a piece."
        );
      } catch (_) {}
      return;
    }
    var keys = D.getOfferedSizeKeysForProduct ? D.getOfferedSizeKeysForProduct(p) : ["m"];
    var size = keys.indexOf("m") >= 0 ? "m" : keys[0];
    var base = p.prices && p.prices[size];
    if (base == null || !Number.isFinite(Number(base)) || Number(base) <= 0) {
      try {
        window.alert("Pricing is not available for this piece yet.");
      } catch (_) {}
      return;
    }
    CART.addItem({
      id: p.id,
      size: size,
      name: p.name,
      price: Number(base),
      image: p.image || "",
      qty: 1,
    });
    updateCartUI();
    if (window.RESIN_SHELL) {
      window.RESIN_SHELL.updateBadge();
      window.RESIN_SHELL.renderDrawer();
    }
    if (window.RESIN_SHELL && window.RESIN_SHELL.openDrawer) {
      window.RESIN_SHELL.openDrawer();
    } else if (els.cartToggle) {
      els.cartToggle.click();
    }
  }

  function renderFeatured() {
    if (!els.productGrid) return;
    els.productGrid.className = "featured-cat-grid";
    els.productGrid.innerHTML = "";
    if (els.filterLabel) {
      els.filterLabel.textContent =
        "Use the orb (top right): type any part of a name for instant matches, set a max “from” price for featured lines, then open a piece—full MRP on the product page.";
    }
    var cats = D.categories.filter(function (c) {
      if (FEATURED_SKIP_CATEGORIES[c.id]) return false;
      var ids = D.byCategory && D.byCategory[c.id];
      return ids && ids.length > 0;
    });
    cats.forEach(function (cat, i) {
      var preview = firstProductInCategory(cat.id);
      var count = (D.byCategory[cat.id] || []).length;
      var minFrom = minPriceInCategory(cat.id);
      var card = document.createElement("article");
      card.className = "featured-cat-card reveal-tile";
      card.style.setProperty("--stagger", String(i));
      card.setAttribute("data-min-price", minFrom != null ? String(minFrom) : "");
      var bits = [(cat.label || "").toLowerCase(), (cat.id || "").toLowerCase(), String(count), "pieces"];
      if (minFrom != null) {
        bits.push(String(minFrom));
        if (CART.formatMoney) bits.push(CART.formatMoney(minFrom).toLowerCase().replace(/\s/g, ""));
      }
      card.setAttribute("data-search-text", bits.join(" "));
      var imgRel = preview && preview.image ? preview.image : "";
      var catHref = "category.html?cat=" + encodeURIComponent(cat.id);
      var imgBlock = imgRel
        ? '<a class="featured-cat-card__media-hit" href="' +
          catHref +
          '" aria-label="Browse ' +
          escapeAttr(cat.label) +
          ' — photos"><div class="featured-cat-card__media"><img src="' +
          escapeAttr(imgUrl(imgRel)) +
          '" alt="" loading="lazy" width="640" height="480" /></div></a>'
        : '<a class="featured-cat-card__media-hit" href="' +
          catHref +
          '" aria-label="Browse ' +
          escapeAttr(cat.label) +
          '"><div class="featured-cat-card__media featured-cat-card__media--empty" aria-hidden="true"></div></a>';
      card.innerHTML =
        '<div class="featured-cat-card__shine" aria-hidden="true"></div>' +
        imgBlock +
        '<div class="featured-cat-card__body">' +
        "<h3><a href=\"" +
        catHref +
        "\">" +
        escapeHtml(cat.label) +
        "</a></h3>" +
        "<p>" +
        String(count) +
        " pieces in this line</p>" +
        '<div class="featured-cat-card__row">' +
        '<a class="featured-cat-card__cta" href="' +
        catHref +
        '">View collection →</a>' +
        '<button type="button" class="featured-cat-card__quick-add" data-quick-cat="' +
        escapeAttr(cat.id) +
        '">Add to cart</button>' +
        "</div>" +
        "</div>";
      els.productGrid.appendChild(card);
    });
    observeTiles();
    bindCardTilt(Array.prototype.slice.call(els.productGrid.querySelectorAll(".featured-cat-card")));
    applyHomeCatalogFilter();
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  var revealObserver;
  var tileObserver;

  function observeReveals() {
    if (prefersReducedMotion()) {
      document.querySelectorAll(".reveal, .reveal-tile, .reveal-pill").forEach(function (el) {
        el.classList.add("is-inview");
      });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-inview");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { root: null, rootMargin: "0px 0px -6% 0px", threshold: 0.12 }
      );
    }
    document.querySelectorAll(".reveal:not(.is-inview)").forEach(function (el) {
      revealObserver.observe(el);
    });
    document.querySelectorAll(".reveal-pill:not(.is-inview)").forEach(function (el) {
      revealObserver.observe(el);
    });
    document.querySelectorAll(".hero-title .reveal-line:not(.is-inview)").forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  function observeTiles() {
    if (prefersReducedMotion()) {
      document.querySelectorAll(".reveal-tile").forEach(function (el) {
        el.classList.add("is-inview");
      });
      return;
    }
    if (!tileObserver) {
      tileObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-inview");
              tileObserver.unobserve(entry.target);
            }
          });
        },
        { root: null, rootMargin: "0px 0px -4% 0px", threshold: 0.08 }
      );
    }
    document.querySelectorAll(".reveal-tile:not(.is-inview)").forEach(function (el) {
      tileObserver.observe(el);
    });
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

  function bindHeroTilt() {
    if (prefersReducedMotion() || !els.heroStage) return;
    var nodes = els.heroStage.querySelectorAll("[data-tilt]");
    nodes.forEach(function (node) {
      node.addEventListener(
        "mousemove",
        function (e) {
          var r = node.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width - 0.5;
          var y = (e.clientY - r.top) / r.height - 0.5;
          node.style.transform =
            "perspective(900px) rotateY(" +
            (x * 8).toFixed(2) +
            "deg) rotateX(" +
            (y * -7).toFixed(2) +
            "deg) scale(1.01)";
        },
        { passive: true }
      );
      node.addEventListener("mouseleave", function () {
        node.style.transform = "";
      });
    });
  }

  function updateCartUI() {
    var lines = CART.load();
    var count = CART.countItems();
    if (els.cartCount) els.cartCount.textContent = String(count);
    if (els.cartSubtotal) els.cartSubtotal.textContent = CART.formatMoney(CART.subtotal());

    if (!els.cartList) return;
    if (lines.length === 0) {
      els.cartList.innerHTML = '<li class="cart-empty">Your cart is empty.</li>';
      return;
    }

    els.cartList.innerHTML = "";
    lines.forEach(function (line) {
      var li = document.createElement("li");
      li.className = "cart-item";
      var sz = D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size;
      var imgRel = getLineImage(line);
      var imgBlock = imgRel
        ? '<img src="' + escapeAttr(imgUrl(imgRel)) + '" alt="" width="56" height="56" />'
        : '<span class="cart-item__ph" aria-hidden="true"></span>';
      li.innerHTML =
        imgBlock +
        '<div class="cart-item-info">' +
        "<strong>" +
        escapeHtml(line.name) +
        "</strong>" +
        "<span>" +
        sz +
        " · " +
        CART.formatMoney(line.price) +
        " ea</span>" +
        "</div>" +
        '<span class="cart-item-qty">×' +
        line.qty +
        "</span>" +
        '<button type="button" class="cart-item__remove" data-remove-id="' +
        escapeAttr(line.id) +
        '" data-remove-size="' +
        escapeAttr(line.size) +
        '" aria-label="Remove ' +
        escapeAttr(line.name || "item") +
        '">×</button>';
      els.cartList.appendChild(li);
    });
  }

  if (els.cartList && !els.cartList.dataset.removeBound) {
    els.cartList.dataset.removeBound = "1";
    els.cartList.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".cart-item__remove") : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      CART.removeLine(btn.getAttribute("data-remove-id"), btn.getAttribute("data-remove-size"));
      updateCartUI();
    });
  }

  function openCart() {
    els.cartDrawer.classList.add("is-open");
    els.cartBackdrop.hidden = false;
    requestAnimationFrame(function () {
      els.cartBackdrop.classList.add("is-open");
    });
    els.cartDrawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeCart() {
    els.cartBackdrop.classList.remove("is-open");
    els.cartDrawer.classList.remove("is-open");
    els.cartDrawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setTimeout(function () {
      if (!els.cartDrawer.classList.contains("is-open")) {
        els.cartBackdrop.hidden = true;
      }
    }, 300);
  }

  if (els.cartToggle) els.cartToggle.addEventListener("click", openCart);
  if (els.cartClose) els.cartClose.addEventListener("click", closeCart);
  if (els.cartBackdrop) els.cartBackdrop.addEventListener("click", closeCart);
  if (els.checkoutBtn)
    els.checkoutBtn.addEventListener("click", function () {
      if (CART.countItems() === 0) {
        alert("Your cart is empty.");
        return;
      }
      closeCart();
      window.location.href = "checkout.html";
    });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && els.cartDrawer && els.cartDrawer.classList.contains("is-open")) {
      closeCart();
    }
  });

  if (els.year) els.year.textContent = String(new Date().getFullYear());

  document.querySelectorAll(".nav-dock-link").forEach(function (link) {
    link.addEventListener("click", function () {
      document.querySelectorAll(".nav-dock-link").forEach(function (l) {
        l.classList.remove("is-active");
      });
      link.classList.add("is-active");
    });
  });

  var hp = new URLSearchParams(window.location.search);
  var bootQ = (hp.get("q") || "").trim();
  var bootMaxp = (hp.get("maxp") || "").trim();
  var gq = document.getElementById("globalFindQuery");
  var gCap = document.getElementById("globalFindHomePriceCap");
  if (bootQ && gq) gq.value = bootQ;
  if (bootMaxp && gCap) {
    var ok = { "35": 1, "50": 1, "75": 1, "100": 1, "150": 1, "250": 1, "500": 1, "1000": 1 };
    if (ok[bootMaxp]) gCap.value = bootMaxp;
  }

  renderCategories();
  renderFeatured();
  paintHeroFloatCatalog();
  renderHeroSpotlight();
  if (gq) {
    gq.addEventListener("input", applyHomeCatalogFilter);
  }
  if (gCap) {
    gCap.addEventListener("change", applyHomeCatalogFilter);
  }
  observeReveals();
  bindHeroTilt();
  updateCartUI();

  window.addEventListener("storage", function (e) {
    if (e.key === "resin_atelier_cart_v1") updateCartUI();
  });

  window.addEventListener("resinCartChanged", function () {
    updateCartUI();
  });

  if (els.productGrid) {
    els.productGrid.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest(".featured-cat-card__quick-add") : null;
      if (!btn || !els.productGrid.contains(btn)) return;
      ev.preventDefault();
      ev.stopPropagation();
      var cid = btn.getAttribute("data-quick-cat");
      if (!cid) return;
      quickAddFromCategory(cid);
    });
  }

  window.addEventListener("craftguruCatalogPricesMerged", function () {
    renderCategories();
    renderFeatured();
    paintHeroFloatCatalog();
    renderHeroSpotlight();
  });
})();
