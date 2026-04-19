(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART) return;

  var cgHeroTimer = null;

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
        if (cand && cand.listed !== false && cand.image) {
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

  function stopHeroCarouselTimer() {
    if (cgHeroTimer) {
      clearInterval(cgHeroTimer);
      cgHeroTimer = null;
    }
  }

  function hidePromoHero() {
    stopHeroCarouselTimer();
    var stage = document.getElementById("heroStage");
    var promo = document.getElementById("heroPromoCarousel");
    var img = document.getElementById("heroPromoImg");
    if (stage) {
      stage.classList.remove("hero-atelier--promo");
    }
    if (promo) {
      promo.setAttribute("hidden", "");
      promo.classList.remove("hero-promo-carousel--slide");
    }
    if (img) {
      img.classList.remove(
        "hero-promo-carousel__img--leave",
        "hero-promo-carousel__img--enter-start",
        "hero-promo-carousel__img--enter-run"
      );
    }
  }

  function bootConfigurableHero() {
    stopHeroCarouselTimer();
    var M = window.CraftguruCatalogMerge;
    var base = M && typeof M.getApiBase === "function" ? M.getApiBase() : "";
    if (!base) {
      hidePromoHero();
      return;
    }
    fetch(base + "/api/catalog/hero-slides", { cache: "no-store" })
      .then(function (res) {
        return res.json();
      })
      .then(function (j) {
        hidePromoHero();
        if (!j || !j.ok || !j.slides || !j.slides.length) return;

        var settings = j.heroSettings || {};
        var mode = String(settings.displayMode || "carousel").toLowerCase();
        var pinId = settings.singleSlideId != null ? Number(settings.singleSlideId) : NaN;
        var intervalMs = Math.round(Number(settings.carouselIntervalMs) || 5000);
        if (!Number.isFinite(intervalMs) || intervalMs < 1500) intervalMs = 5000;
        if (intervalMs > 60000) intervalMs = 60000;

        var slides = j.slides.slice();
        if (mode === "single" && Number.isFinite(pinId)) {
          var pinned = slides.filter(function (s) {
            return Number(s.id) === pinId;
          });
          if (pinned.length) slides = pinned;
        }

        var stage = document.getElementById("heroStage");
        var promo = document.getElementById("heroPromoCarousel");
        var img = document.getElementById("heroPromoImg");
        if (!stage || !promo || !img) return;

        function encodedSrc(rel) {
          var r = String(rel || "").trim();
          if (!r) return "";
          if (r.indexOf("http") === 0 || r.indexOf("//") === 0) return r;
          return D.imageUrl ? D.imageUrl(r) : r;
        }
        function stripPromoMotionClasses() {
          img.classList.remove(
            "hero-promo-carousel__img--leave",
            "hero-promo-carousel__img--enter-start",
            "hero-promo-carousel__img--enter-run"
          );
        }
        function sameHeroSrc(a, b) {
          try {
            if (!a || !b) return false;
            if (a === b) return true;
            var da = a.split("?")[0];
            var db = b.split("?")[0];
            return da === db || decodeURIComponent(da) === decodeURIComponent(db);
          } catch (_) {
            return false;
          }
        }

        var useSlideMotion = slides.length > 1 && mode !== "single";
        if (useSlideMotion) {
          promo.classList.add("hero-promo-carousel--slide");
        } else {
          promo.classList.remove("hero-promo-carousel--slide");
        }

        stage.classList.add("hero-atelier--promo");
        promo.removeAttribute("hidden");

        var idx = 0;
        var firstHeroGo = true;
        var heroBusy = false;

        function applySlide() {
          if (heroBusy) return;

          if (slides.length <= 1 || mode === "single" || !useSlideMotion) {
            var s0 = slides[idx % slides.length];
            idx += 1;
            stripPromoMotionClasses();
            img.alt = "Homepage promotion";
            img.src = encodedSrc(s0 && s0.image);
            firstHeroGo = false;
            return;
          }

          var s = slides[idx % slides.length];
          var nextSrc = encodedSrc(s && s.image);
          idx += 1;

          if (firstHeroGo) {
            firstHeroGo = false;
            stripPromoMotionClasses();
            img.alt = "Homepage promotion";
            img.src = nextSrc;
            return;
          }

          if (prefersReducedMotion() || sameHeroSrc(img.getAttribute("src") || "", nextSrc)) {
            stripPromoMotionClasses();
            img.alt = "Homepage promotion";
            img.src = nextSrc;
            return;
          }

          heroBusy = true;
          var leaveConsumed = false;
          var leaveSafety = window.setTimeout(function () {
            img.removeEventListener("transitionend", onLeaveEnd);
            afterPreload();
          }, 750);
          function afterPreload() {
            if (leaveConsumed) return;
            leaveConsumed = true;
            window.clearTimeout(leaveSafety);
            img.removeEventListener("transitionend", onLeaveEnd);
            stripPromoMotionClasses();
            img.alt = "Homepage promotion";
            img.src = nextSrc;
            img.classList.add("hero-promo-carousel__img--enter-start");
            void img.offsetWidth;
            img.classList.remove("hero-promo-carousel__img--enter-start");
            img.classList.add("hero-promo-carousel__img--enter-run");
            var enterDone = false;
            var enterSafety = window.setTimeout(function () {
              img.removeEventListener("transitionend", onEnterEnd);
              if (!enterDone) {
                enterDone = true;
                img.classList.remove("hero-promo-carousel__img--enter-run");
                heroBusy = false;
              }
            }, 750);
            function onEnterEnd(ev) {
              if (ev.target !== img) return;
              if (enterDone) return;
              enterDone = true;
              window.clearTimeout(enterSafety);
              img.removeEventListener("transitionend", onEnterEnd);
              img.classList.remove("hero-promo-carousel__img--enter-run");
              heroBusy = false;
            }
            img.addEventListener("transitionend", onEnterEnd, { once: true });
          }
          function onLeaveEnd(ev) {
            if (ev.target !== img) return;
            window.clearTimeout(leaveSafety);
            img.removeEventListener("transitionend", onLeaveEnd);
            var pre = new Image();
            pre.onload = function () {
              afterPreload();
            };
            pre.onerror = function () {
              afterPreload();
            };
            pre.src = nextSrc;
          }
          img.addEventListener("transitionend", onLeaveEnd, { once: true });
          img.classList.add("hero-promo-carousel__img--leave");
        }
        applySlide();
        if (useSlideMotion) {
          cgHeroTimer = setInterval(applySlide, intervalMs);
        }
      })
      .catch(function () {
        hidePromoHero();
      });
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

  /** Same set as category.html: listed on storefront (not delisted via catalog overrides). */
  function listedProductsInCategory(catId) {
    if (!D || !D.listProductsAll) return [];
    return D.listProductsAll(catId, null) || [];
  }

  function minPriceInCategory(catId) {
    var list = listedProductsInCategory(catId);
    if (!list.length) return null;
    var m = null;
    for (var i = 0; i < list.length; i++) {
      var c = minCompactPrice(list[i]);
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

  var DEFAULT_HOME_SORT = "name-asc";
  var homeFeaturedSortWired = false;

  function homeFeaturedSortEl() {
    return document.getElementById("homeFeaturedSort");
  }

  function sortFeaturedCategories(cats) {
    var sel = homeFeaturedSortEl();
    var sort = (sel && sel.value) || DEFAULT_HOME_SORT;
    var arr = cats.slice();
    if (sort === "name-desc") {
      arr.sort(function (a, b) {
        return String(b.label || "").localeCompare(String(a.label || ""), undefined, { sensitivity: "base" });
      });
    } else if (sort === "price-asc") {
      arr.sort(function (a, b) {
        var ma = minPriceInCategory(a.id);
        var mb = minPriceInCategory(b.id);
        var na = ma != null ? ma : Infinity;
        var nb = mb != null ? mb : Infinity;
        return na - nb;
      });
    } else if (sort === "price-desc") {
      arr.sort(function (a, b) {
        var ma = minPriceInCategory(a.id);
        var mb = minPriceInCategory(b.id);
        var na = ma != null ? ma : -Infinity;
        var nb = mb != null ? mb : -Infinity;
        return nb - na;
      });
    } else {
      arr.sort(function (a, b) {
        return String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" });
      });
    }
    return arr;
  }

  function wireHomeFeaturedSortOnce() {
    if (homeFeaturedSortWired) return;
    var sel = homeFeaturedSortEl();
    if (!sel) return;
    homeFeaturedSortWired = true;
    sel.addEventListener("change", function () {
      renderFeatured();
      syncHomeFindUrl();
    });
  }

  var homeExtraFilterWired = false;
  var homeDualApi = null;

  function wireHomeFiltersOnce() {
    wireHomeFeaturedSortOnce();
    var tb = document.getElementById("homeFeaturedToolbar");
    if (!tb) return;
    if (!homeExtraFilterWired) {
      homeExtraFilterWired = true;
      var v = document.getElementById("homeFeaturedView");
      if (v) {
        v.addEventListener("change", function () {
          applyHomeCatalogFilter();
          syncHomeFindUrl();
        });
      }
      var clr = document.getElementById("homeFeaturedFilterClear");
      if (clr) {
        clr.addEventListener("click", function () {
          if (v) v.value = "all";
          var s = homeFeaturedSortEl();
          if (s) s.value = DEFAULT_HOME_SORT;
          var gq = document.getElementById("globalFindQuery");
          if (gq) gq.value = "";
          var minE = document.getElementById("homePriceMin");
          var maxE = document.getElementById("homePriceMax");
          if (minE) minE.value = "";
          if (maxE) maxE.value = "";
          var cap = document.getElementById("globalFindHomePriceCap");
          if (cap) cap.value = "";
          if (homeDualApi && typeof homeDualApi.reset === "function") homeDualApi.reset();
          renderFeatured();
          applyHomeCatalogFilter();
          syncHomeFindUrl();
        });
      }
      if (window.CraftguruCatalogFilterUi) {
        homeDualApi = window.CraftguruCatalogFilterUi.wireDualPriceRange({
          rootId: "homeFeaturedToolbar",
          rangeMinId: "homePriceRangeLo",
          rangeMaxId: "homePriceRangeHi",
          inputMinId: "homePriceMin",
          inputMaxId: "homePriceMax",
          labelId: "homePriceRangeLabel",
          absMax: 12000,
          step: 50,
          onCommit: function () {
            applyHomeCatalogFilter();
            syncHomeFindUrl();
          },
        });
      }
    } else if (homeDualApi && homeDualApi.syncFromInputs) {
      homeDualApi.syncFromInputs();
    }
  }

  function syncHomeFindUrl() {
    try {
      var u = new URL(window.location.href);
      var inp = document.getElementById("globalFindQuery");
      var sortEl = document.getElementById("homeFeaturedSort");
      var minE = document.getElementById("homePriceMin");
      var maxE = document.getElementById("homePriceMax");
      var q = inp && inp.value.trim();
      var sort = sortEl && sortEl.value;
      var lo = minE && String(minE.value || "").trim();
      var hi = maxE && String(maxE.value || "").trim();
      if (q) u.searchParams.set("q", q);
      else u.searchParams.delete("q");
      if (lo && /^[0-9]+(\.[0-9]+)?$/.test(lo)) u.searchParams.set("minp", lo);
      else u.searchParams.delete("minp");
      if (hi && /^[0-9]+(\.[0-9]+)?$/.test(hi)) u.searchParams.set("maxp", hi);
      else u.searchParams.delete("maxp");
      if (sort && sort !== DEFAULT_HOME_SORT) u.searchParams.set("sort", sort);
      else u.searchParams.delete("sort");
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
    var minE = document.getElementById("homePriceMin");
    var maxE = document.getElementById("homePriceMax");
    var lo = minE && String(minE.value || "").trim() !== "" ? parseFloat(minE.value, 10) : NaN;
    var hi = maxE && String(maxE.value || "").trim() !== "" ? parseFloat(maxE.value, 10) : NaN;
    var cap = capEl && capEl.value ? parseFloat(capEl.value, 10) : NaN;
    if (!Number.isFinite(hi) && Number.isFinite(cap)) hi = cap;
    var viewEl = document.getElementById("homeFeaturedView");
    var viewPhoto = viewEl && viewEl.value === "photo";

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
        var priceOk = true;
        if (Number.isFinite(lo)) priceOk = priceOk && !isNaN(mp) && mp >= lo;
        if (Number.isFinite(hi)) priceOk = priceOk && !isNaN(mp) && mp <= hi;
        var previewOk = !viewPhoto || card.getAttribute("data-has-preview") === "1";
        var match = nameOk && priceOk && previewOk;
        card.classList.toggle("is-catalog-hidden", !match);
        if (match) n++;
      });
      if (hint) {
        if (n === total) hint.textContent = "";
        else {
          var parts = [];
          if (q) parts.push(n + "/" + total + " name matches");
          if (Number.isFinite(lo) || Number.isFinite(hi)) {
            var pr =
              (Number.isFinite(lo) ? "from ₹" + lo : "") +
              (Number.isFinite(lo) && Number.isFinite(hi) ? " – " : "") +
              (Number.isFinite(hi) ? "₹" + hi : "");
            parts.push(pr);
          }
          if (viewPhoto) parts.push("preview photo");
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
    var list = listedProductsInCategory(catId);
    if (!list.length) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i]) return list[i];
    }
    return null;
  }

  function renderFeatured() {
    if (!els.productGrid) return;
    wireHomeFiltersOnce();
    els.productGrid.className = "featured-cat-grid";
    els.productGrid.innerHTML = "";
    if (els.filterLabel) {
      els.filterLabel.textContent =
        "Use the toolbar: filter type, sort, and drag the price range. Header search still narrows names. Open a line for full MRP on each product.";
    }
    var cats = D.categories.filter(function (c) {
      if (FEATURED_SKIP_CATEGORIES[c.id]) return false;
      return listedProductsInCategory(c.id).length > 0;
    });
    cats = sortFeaturedCategories(cats);
    cats.forEach(function (cat, i) {
      var preview = firstProductInCategory(cat.id);
      var count = listedProductsInCategory(cat.id).length;
      var minFrom = minPriceInCategory(cat.id);
      var card = document.createElement("article");
      card.className = "featured-cat-card reveal-tile";
      card.style.setProperty("--stagger", String(i));
      card.setAttribute("data-min-price", minFrom != null ? String(minFrom) : "");
      var bits = [(cat.label || "").toLowerCase(), (cat.id || "").toLowerCase(), String(count), "products", "category"];
      if (minFrom != null) {
        bits.push(String(minFrom));
        if (CART.formatMoney) bits.push(CART.formatMoney(minFrom).toLowerCase().replace(/\s/g, ""));
      }
      card.setAttribute("data-search-text", bits.join(" "));
      var imgRel = preview && preview.image ? preview.image : "";
      card.setAttribute("data-has-preview", imgRel ? "1" : "0");
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
        (count === 1 ? " product in this category" : " products in this category") +
        "</p>" +
        '<div class="featured-cat-card__row">' +
        '<a class="featured-cat-card__cta" href="' +
        catHref +
        '">View collection →</a>' +
        '<a class="featured-cat-card__quick-add" href="' +
        catHref +
        '">Choose product</a>' +
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
        escapeHtml(String(sz || "")) +
        " · Qty " +
        line.qty +
        " · " +
        CART.formatMoney(line.price) +
        " each</span>" +
        "</div>" +
        '<div class="cart-item__side">' +
        '<div class="cart-item-qty-wrap">' +
        '<button type="button" class="cart-item__qty cart-item__qty--minus" data-qty-delta="-1" data-line-id="' +
        escapeAttr(line.id) +
        '" data-line-size="' +
        escapeAttr(line.size) +
        '" aria-label="Decrease quantity">−</button>' +
        '<span class="cart-item-qty-num">' +
        line.qty +
        "</span>" +
        '<button type="button" class="cart-item__qty cart-item__qty--plus" data-qty-delta="1" data-line-id="' +
        escapeAttr(line.id) +
        '" data-line-size="' +
        escapeAttr(line.size) +
        '" aria-label="Increase quantity">+</button>' +
        "</div>" +
        '<button type="button" class="cart-item__remove" data-remove-id="' +
        escapeAttr(line.id) +
        '" data-remove-size="' +
        escapeAttr(line.size) +
        '" aria-label="Remove ' +
        escapeAttr(line.name || "item") +
        '">×</button>' +
        "</div>";
      els.cartList.appendChild(li);
    });
  }

  if (els.cartList && !els.cartList.dataset.removeBound) {
    els.cartList.dataset.removeBound = "1";
    els.cartList.addEventListener("click", function (e) {
      var rm = e.target && e.target.closest ? e.target.closest(".cart-item__remove") : null;
      if (rm) {
        e.preventDefault();
        e.stopPropagation();
        CART.removeLine(rm.getAttribute("data-remove-id"), rm.getAttribute("data-remove-size"));
        updateCartUI();
        return;
      }
      var q = e.target && e.target.closest ? e.target.closest(".cart-item__qty") : null;
      if (!q) return;
      e.preventDefault();
      e.stopPropagation();
      var id = q.getAttribute("data-line-id");
      var size = q.getAttribute("data-line-size");
      var d = parseInt(q.getAttribute("data-qty-delta") || "0", 10) || 0;
      CART.incrementLine(id, size, d);
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
  var bootMinp = (hp.get("minp") || "").trim();
  var bootSort = hp.get("sort") || DEFAULT_HOME_SORT;
  var gq = document.getElementById("globalFindQuery");
  var gCap = document.getElementById("globalFindHomePriceCap");
  var gSort = document.getElementById("homeFeaturedSort");
  var hMin = document.getElementById("homePriceMin");
  var hMax = document.getElementById("homePriceMax");
  if (bootQ && gq) gq.value = bootQ;
  var capOk = { "35": 1, "50": 1, "75": 1, "100": 1, "150": 1, "250": 1, "500": 1, "1000": 1 };
  if (bootMinp && hMin && /^[0-9]+(\.[0-9]+)?$/.test(bootMinp)) hMin.value = bootMinp;
  if (bootMaxp && hMax) {
    if (capOk[bootMaxp]) {
      hMax.value = bootMaxp;
      if (gCap) gCap.value = bootMaxp;
    } else if (/^[0-9]+(\.[0-9]+)?$/.test(bootMaxp)) {
      hMax.value = bootMaxp;
    }
  }
  if (gSort) {
    var sortOk = { "name-asc": 1, "name-desc": 1, "price-asc": 1, "price-desc": 1 };
    gSort.value = sortOk[bootSort] ? bootSort : DEFAULT_HOME_SORT;
  }

  renderCategories();
  renderFeatured();
  paintHeroFloatCatalog();
  bootConfigurableHero();
  renderHeroSpotlight();
  if (gq) {
    gq.addEventListener("input", applyHomeCatalogFilter);
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

  window.addEventListener("craftguruCatalogPricesMerged", function () {
    renderCategories();
    renderFeatured();
    paintHeroFloatCatalog();
    bootConfigurableHero();
    renderHeroSpotlight();
  });
})();
