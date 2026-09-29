(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART) return;

  var cgHeroTimer = null;
  var cgHeroSlides = [];
  var cgHeroIndex = 0;
  var cgHeroBusy = false;
  var cgHeroIntervalMs = 5000;
  var cgHeroPaused = false;

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

  function imgUrl(rel, width) {
    return D.imageUrl ? D.imageUrl(rel, width || 480) : rel;
  }

  function getLineImage(line) {
    if (!line) return "";
    var p = D && D.getProduct && line.id ? D.getProduct(line.id) : null;
    /* Use the current product cover, never the last PDP gallery thumbnail
       persisted on an older cart line. */
    var cover = p && D.getProductCoverImage ? D.getProductCoverImage(p) : p && p.image;
    return cover || line.image || "";
  }

  function minCompactPrice(product) {
    if (D && typeof D.getStartingPriceInr === "function") {
      var n = D.getStartingPriceInr(product);
      return n > 0 ? n : null;
    }
    if (!product || !product.prices) return null;
    var keys = ["s", "m", "l"];
    var min = null;
    keys.forEach(function (k) {
      var v = Number(product.prices[k]);
      if (!Number.isFinite(v) || v <= 0) return;
      if (min === null || v < min) min = v;
    });
    return min;
  }

  function categoryPreviewPair(catId) {
    if (D.getCategoryPreviewImagePair) return D.getCategoryPreviewImagePair(catId);
    var img = D.getCategoryPreviewImage ? D.getCategoryPreviewImage(catId) : "";
    return { primary: img, fallback: "" };
  }

  function applyImageFitToImg(img, fit) {
    if (!img) return;
    if (window.CraftguruImageFit && typeof window.CraftguruImageFit.applyImageFit === "function") {
      window.CraftguruImageFit.applyImageFit(img, fit);
    } else if (fit === "contain") {
      img.setAttribute("data-image-fit", "contain");
    } else {
      img.removeAttribute("data-image-fit");
    }
  }

  function categoryPreviewFit(catId, imgRel) {
    if (D.getCategoryPreviewImageFit) return D.getCategoryPreviewImageFit(catId, imgRel);
    if (window.CraftguruImageFit) {
      return window.CraftguruImageFit.getCategoryPreviewImageFit(catId, imgRel, D);
    }
    return "";
  }

  function wireCategoryPreviewImgOnerror(img, fallbackRel) {
    if (!img || !fallbackRel) return;
    var fb = imgUrl(fallbackRel);
    img.setAttribute("data-fallback-src", fb);
    img.addEventListener("error", function onPreviewImgError() {
      var alt = img.getAttribute("data-fallback-src") || "";
      if (alt && img.src !== alt) {
        img.src = alt;
        img.removeAttribute("data-fallback-src");
        return;
      }
      img.removeEventListener("error", onPreviewImgError);
      var media = img.closest(".craft-cat-card__media, .featured-cat-card__media");
      if (media) {
        media.classList.add("craft-cat-card__media-empty", "featured-cat-card__media--empty");
        img.remove();
      }
    });
  }

  function firstShopProductPerCategory() {
    var out = [];
    var seen = {};
    if (!D.categories) return out;
    D.categories.forEach(function (cat) {
      if (!cat || cat.id === "craftguru-details") return;
      var rel = D.getCategoryPreviewImage ? D.getCategoryPreviewImage(cat.id) : "";
      if (!rel) return;
      var list = listedProductsInCategory(cat.id);
      var p = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && (list[i].image === rel || list[i].id)) {
          p = list[i];
          break;
        }
      }
      if (!p && list.length) p = list[list.length - 1];
      if (!p) {
        p = { id: "cat-preview-" + cat.id, image: rel, category: cat.id, name: cat.label, prices: { s: 0, m: 0, l: 0 } };
      } else {
        p = Object.assign({}, p, { image: rel });
      }
      if (seen[p.id]) return;
      seen[p.id] = 1;
      out.push(p);
    });
    return out;
  }

  function stopHeroCarouselTimer() {
    if (cgHeroTimer) {
      clearTimeout(cgHeroTimer);
      cgHeroTimer = null;
    }
  }

  function heroApiUrl(path) {
    var base = window.CraftguruApiBase && window.CraftguruApiBase.get ? window.CraftguruApiBase.get() : "";
    return String(base || "").replace(/\/+$/, "") + path;
  }

  function heroWantsReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function heroImageUrl(slide) {
    return imgUrl(slide && slide.image ? slide.image : "", 1440);
  }

  function setHeroToolbar() {
    var controls = document.getElementById("heroPromoControls");
    var dots = document.getElementById("heroPromoDots");
    var count = document.getElementById("heroPromoCount");
    if (count) count.textContent = cgHeroSlides.length ? String(cgHeroIndex + 1) + " / " + String(cgHeroSlides.length) : "";
    if (controls) controls.hidden = cgHeroSlides.length < 2;
    if (!dots) return;
    dots.innerHTML = "";
    cgHeroSlides.forEach(function (_slide, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "hero-promo-carousel__dot" + (i === cgHeroIndex ? " is-active" : "");
      dot.setAttribute("aria-label", "Show hero slide " + String(i + 1));
      dot.setAttribute("aria-current", i === cgHeroIndex ? "true" : "false");
      dot.setAttribute("data-hero-index", String(i));
      dots.appendChild(dot);
    });
  }

  function scheduleHeroSlide() {
    stopHeroCarouselTimer();
    if (cgHeroPaused || cgHeroSlides.length < 2 || heroWantsReducedMotion()) return;
    cgHeroTimer = window.setTimeout(function () {
      cgHeroTimer = null;
      showHeroSlide(cgHeroIndex + 1, true);
    }, cgHeroIntervalMs);
  }

  function showHeroSlide(nextIndex, animate) {
    var img = document.getElementById("heroPromoImg");
    var promo = document.getElementById("heroPromoCarousel");
    if (!img || !promo || !cgHeroSlides.length || cgHeroBusy) return;
    var total = cgHeroSlides.length;
    var normalized = ((Number(nextIndex) % total) + total) % total;
    var src = heroImageUrl(cgHeroSlides[normalized]);
    if (!src) return;
    var useMotion = !!animate && normalized !== cgHeroIndex && !heroWantsReducedMotion();
    cgHeroBusy = true;
    stopHeroCarouselTimer();

    function finish() {
      img.classList.remove(
        "hero-promo-carousel__img--leave",
        "hero-promo-carousel__img--enter-start",
        "hero-promo-carousel__img--enter-run"
      );
      cgHeroIndex = normalized;
      cgHeroBusy = false;
      setHeroToolbar();
      scheduleHeroSlide();
    }

    function loadAndPaint() {
      if (!useMotion) {
        img.src = src;
        finish();
        return;
      }
      var leftDone = false;
      var leftFallback = window.setTimeout(afterLeave, 1050);
      function afterLeave() {
        if (leftDone) return;
        leftDone = true;
        window.clearTimeout(leftFallback);
        img.removeEventListener("transitionend", onLeave);
        img.classList.remove("hero-promo-carousel__img--leave");
        img.src = src;
        img.classList.add("hero-promo-carousel__img--enter-start");
        void img.offsetWidth;
        img.classList.remove("hero-promo-carousel__img--enter-start");
        img.classList.add("hero-promo-carousel__img--enter-run");
        var enterDone = false;
        var enterFallback = window.setTimeout(function () {
          if (enterDone) return;
          enterDone = true;
          img.removeEventListener("transitionend", onEnter);
          finish();
        }, 1050);
        function onEnter(ev) {
          if (ev.target !== img || enterDone) return;
          enterDone = true;
          window.clearTimeout(enterFallback);
          img.removeEventListener("transitionend", onEnter);
          finish();
        }
        img.addEventListener("transitionend", onEnter);
      }
      function onLeave(ev) {
        if (ev.target !== img) return;
        afterLeave();
      }
      img.addEventListener("transitionend", onLeave);
      img.classList.add("hero-promo-carousel__img--leave");
    }

    if (!useMotion) {
      loadAndPaint();
      return;
    }
    var preloader = new Image();
    preloader.onload = loadAndPaint;
    preloader.onerror = function () {
      cgHeroBusy = false;
      scheduleHeroSlide();
    };
    preloader.src = src;
  }

  function wireHeroCarousel() {
    var promo = document.getElementById("heroPromoCarousel");
    if (!promo || promo.getAttribute("data-cg-hero-wired") === "1") return;
    promo.setAttribute("data-cg-hero-wired", "1");
    var prev = document.getElementById("heroPromoPrev");
    var next = document.getElementById("heroPromoNext");
    var dots = document.getElementById("heroPromoDots");
    if (prev) prev.addEventListener("click", function () { showHeroSlide(cgHeroIndex - 1, true); });
    if (next) next.addEventListener("click", function () { showHeroSlide(cgHeroIndex + 1, true); });
    if (dots) dots.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-hero-index]") : null;
      if (!btn) return;
      showHeroSlide(Number(btn.getAttribute("data-hero-index")), true);
    });
    promo.addEventListener("mouseenter", function () { cgHeroPaused = true; stopHeroCarouselTimer(); });
    promo.addEventListener("mouseleave", function () { cgHeroPaused = false; scheduleHeroSlide(); });
    promo.addEventListener("focusin", function () { cgHeroPaused = true; stopHeroCarouselTimer(); });
    promo.addEventListener("focusout", function () { cgHeroPaused = false; scheduleHeroSlide(); });
    document.addEventListener("visibilitychange", function () {
      cgHeroPaused = document.hidden;
      if (cgHeroPaused) stopHeroCarouselTimer();
      else scheduleHeroSlide();
    });
  }

  function hidePromoHero() {
    stopHeroCarouselTimer();
    cgHeroSlides = [];
    cgHeroIndex = 0;
    cgHeroBusy = false;
    var stage = document.getElementById("heroStage");
    var promo = document.getElementById("heroPromoCarousel");
    var img = document.getElementById("heroPromoImg");
    if (stage) {
      stage.classList.remove("home-resin-hero--promo");
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
    var controls = document.getElementById("heroPromoControls");
    if (controls) controls.hidden = true;
  }

  function bootConfigurableHero() {
    stopHeroCarouselTimer();
    var stage = document.getElementById("heroStage");
    var promo = document.getElementById("heroPromoCarousel");
    var img = document.getElementById("heroPromoImg");
    if (!stage || !promo || !img || !window.fetch) return;
    /* SSR may already have painted the first campaign image. Preserve it
       while the public feed hydrates, avoiding a built-in-hero flash. */
    var hasSsrHero = stage.classList.contains("home-resin-hero--promo") && !promo.hidden;
    if (!hasSsrHero) hidePromoHero();
    fetch(heroApiUrl("/api/catalog/hero-slides"), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("Hero unavailable");
        return res.json();
      })
      .then(function (pack) {
        var settings = (pack && pack.heroSettings) || {};
        var slides = (pack && pack.slides) || [];
        slides = slides.filter(function (slide) { return !!heroImageUrl(slide); });
        if (!pack || !pack.ok || settings.customHeroEnabled === false || !slides.length) return;
        var fixed = String(settings.displayMode || "").toLowerCase() === "single";
        if (fixed && settings.singleSlideId != null) {
          var pinned = slides.filter(function (slide) { return Number(slide.id) === Number(settings.singleSlideId); });
          if (pinned.length) slides = pinned;
        }
        cgHeroSlides = slides;
        cgHeroIndex = 0;
        cgHeroIntervalMs = Math.max(2500, Math.min(60000, Number(settings.carouselIntervalMs) || 5000));
        promo.hidden = false;
        stage.classList.add("home-resin-hero--promo");
        promo.classList.toggle("hero-promo-carousel--slide", slides.length > 1 && !fixed);
        wireHeroCarousel();
        showHeroSlide(0, false);
      })
      .catch(function () {
        // The built-in hero remains available if the public hero feed is unavailable.
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
      applyImageFitToImg(
        imgs[i],
        D.getCategoryPreviewImageFit ? D.getCategoryPreviewImageFit(pool[i].category, pool[i].image) : ""
      );
    }
    root.querySelectorAll(".hero-float-polar").forEach(function (fig, idx) {
      fig.hidden = idx >= n;
    });
  }

  function renderHeroSpotlight() {
    /* Best sellers strip removed from Resin Home — keep no-op for legacy callers. */
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

  /* Vendor-controlled category order is the storefront default. */
  var DEFAULT_HOME_SORT = "featured";
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
    } else if (sort === "name-asc") {
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
      var cards = els.productGrid.querySelectorAll(".craft-cat-card");
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

  var homeFilterTimer = null;
  function scheduleHomeCatalogFilter() {
    var y = window.scrollY || 0;
    clearTimeout(homeFilterTimer);
    homeFilterTimer = setTimeout(function () {
      applyHomeCatalogFilter();
      requestAnimationFrame(function () {
        window.scrollTo(0, y);
      });
    }, 120);
  }

  function patchHomeCategoriesFromMerge() {
    if (!els.categoryGrid || !els.categoryGrid.children.length) return false;
    var railApi = window.CRAFT_RAIL_ICONS;
    D.categories.forEach(function (cat) {
      var link = els.categoryGrid.querySelector('[data-cat-id="' + String(cat.id).replace(/"/g, "") + '"]');
      if (!link) return;
      link.setAttribute("data-search-text", (cat.label + " " + cat.id).toLowerCase());
      if (railApi && railApi.fillRailLink) {
        railApi.fillRailLink(link, { id: cat.id, label: cat.label });
      } else {
        link.textContent = cat.label;
      }
    });
    applyHomeCatalogFilter();
    return true;
  }

  function renderCategories() {
    if (!els.categoryGrid) return;
    if (els.categoryGrid.getAttribute("data-cg-ssr") === "1" && els.categoryGrid.children.length) {
      patchHomeCategoriesFromMerge();
      return;
    }
    els.categoryGrid.innerHTML = "";
    var rail = els.categoryGrid.classList && els.categoryGrid.classList.contains("category-grid--rail");
    var railApi = window.CRAFT_RAIL_ICONS;
    D.categories.forEach(function (cat, i) {
      if (!cat || String(cat.id || "").trim() === "craftguru-details") return;
      var a = document.createElement("a");
      /* Rail sits in a narrow column: reveal-pill starts at opacity 0 and often never gets is-inview — keep links always visible. */
      a.className = rail ? "category-pill category-pill--rail" : "category-pill reveal-pill";
      if (!rail) {
        a.style.setProperty("--delay", (0.035 * i).toFixed(3) + "s");
      }
      a.href = "category.html?cat=" + encodeURIComponent(cat.id);
      a.setAttribute("data-cat-id", String(cat.id));
      a.setAttribute("data-search-text", (cat.label + " " + cat.id).toLowerCase());
      if (rail && railApi && railApi.fillRailLink) {
        railApi.fillRailLink(a, { id: cat.id, label: cat.label });
      } else {
        a.textContent = cat.label;
      }
      els.categoryGrid.appendChild(a);
    });
    applyHomeCatalogFilter();
  }

  function wireHomeCategoryToggle() {
    var btn = document.getElementById("homeCategoryToggle");
    var rail = document.getElementById("categories");
    if (!btn || !rail || btn.dataset.cgWired === "1") return;
    btn.dataset.cgWired = "1";
    btn.addEventListener("click", function () {
      var open = rail.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  var FEATURED_SKIP_CATEGORIES = {
    "craftguru-details": true,
  };

  function renderFeatured() {
    if (!els.productGrid) return;
    if (els.productGrid.getAttribute("data-cg-ssr") === "1" && els.productGrid.children.length) {
      wireHomeFiltersOnce();
      els.productGrid.className = "featured-collections-grid";
      patchFeaturedCardImages();
      applyHomeCatalogFilter();
      var shop = document.getElementById("shop");
      if (shop) shop.classList.add("is-inview");
      return;
    }
    wireHomeFiltersOnce();
    els.productGrid.className = "featured-collections-grid";
    els.productGrid.innerHTML = "";
    if (els.filterLabel && !els.filterLabel.textContent.trim()) {
      els.filterLabel.textContent = "Shop by category";
    }
    var cats = D.categories.filter(function (c) {
      if (FEATURED_SKIP_CATEGORIES[c.id]) return false;
      return listedProductsInCategory(c.id).length > 0;
    });
    cats = sortFeaturedCategories(cats);
    cats.forEach(function (cat, i) {
      var pair = categoryPreviewPair(cat.id);
      var imgRel = (pair && pair.primary) || "";
      var imgFallback = (pair && pair.fallback) || "";
      if (!imgRel && !imgFallback && D.pickRandomCatalogProductImage) {
        imgRel = D.pickRandomCatalogProductImage() || "";
      }
      var count = listedProductsInCategory(cat.id).length;
      var minFrom = minPriceInCategory(cat.id);
      var hasPreview = imgRel || imgFallback;
      var catHref = "category.html?cat=" + encodeURIComponent(cat.id);
      var countLabel = String(count) + (count === 1 ? " product" : " products");
      var bits = [(cat.label || "").toLowerCase(), (cat.id || "").toLowerCase(), String(count), "products", "category"];
      if (minFrom != null) {
        bits.push(String(minFrom));
        if (CART.formatMoney) bits.push(CART.formatMoney(minFrom).toLowerCase().replace(/\s/g, ""));
      }
      var buildCard = window.CraftguruPremiumCards && window.CraftguruPremiumCards.buildCategoryCard;
      var card;
      if (buildCard) {
        card = buildCard({
          href: catHref,
          title: cat.label,
          subtitle: countLabel,
          ctaText: "Explore collection →",
          imgSrc: imgRel ? imgUrl(imgRel, 640) : imgFallback ? imgUrl(imgFallback, 640) : "",
          imgSrcSet:
            imgRel || imgFallback
              ? D.imageSrcSet
                ? D.imageSrcSet(imgRel || imgFallback, [320, 480, 640, 960])
                : ""
              : "",
          imgSizes: D.imageSizes ? D.imageSizes("card") : "",
          imgFit: categoryPreviewFit(cat.id, imgRel || imgFallback),
          imgFallback: imgFallback,
          onImgError: wireCategoryPreviewImgOnerror,
          searchText: bits.join(" "),
          minPrice: minFrom != null ? String(minFrom) : "",
          hasPreview: hasPreview,
          stagger: i,
          ariaLabel: "Explore " + cat.label + " collection",
        });
      } else {
        card = document.createElement("article");
        card.className = "craft-cat-card is-inview";
        card.style.setProperty("--stagger", String(i));
        card.setAttribute("data-min-price", minFrom != null ? String(minFrom) : "");
        card.setAttribute("data-search-text", bits.join(" "));
        card.setAttribute("data-has-preview", hasPreview ? "1" : "0");
        card.innerHTML =
          '<a class="craft-cat-card__hit" href="' +
          catHref +
          '" aria-label="Explore ' +
          escapeAttr(cat.label) +
          ' collection">' +
          '<div class="craft-cat-card__shell">' +
          '<div class="craft-cat-card__media">' +
          (imgRel || imgFallback
            ? '<img src="' + escapeAttr(imgUrl(imgRel || imgFallback)) + '" alt="" width="640" height="457" loading="lazy" decoding="async" data-image-fit="contain" />'
            : '<div class="craft-cat-card__media-empty" aria-hidden="true"></div>') +
          "</div>" +
          '<div class="craft-cat-card__body">' +
          '<h3 class="craft-cat-card__name">' +
          escapeHtml(cat.label) +
          "</h3>" +
          '<p class="craft-cat-card__count">' +
          countLabel +
          "</p>" +
          '<span class="craft-cat-card__cta">Explore collection →</span>' +
          "</div></div></a>";
        if (imgRel && imgFallback) {
          wireCategoryPreviewImgOnerror(card.querySelector(".craft-cat-card__media img"), imgFallback);
        }
        var previewImgFit = card.querySelector(".craft-cat-card__media img");
        if (previewImgFit) applyImageFitToImg(previewImgFit, "contain");
      }
      els.productGrid.appendChild(card);
    });
    if (window.CraftguruCraftCategoryCard && window.CraftguruCraftCategoryCard.ensureCategoryGridsVisible) {
      window.CraftguruCraftCategoryCard.ensureCategoryGridsVisible();
    }
    if (!cats.length && D.listAllListedProducts) {
      var featuredPool = D.listAllListedProducts().filter(function (p) {
        return p && productDisplayImageSafe(p);
      });
      if (featuredPool.length) {
        var picks = featuredPool.slice();
        for (var s = picks.length - 1; s > 0; s--) {
          var r = Math.floor(Math.random() * (s + 1));
          var tmp = picks[s];
          picks[s] = picks[r];
          picks[r] = tmp;
        }
        picks.slice(0, Math.min(8, picks.length)).forEach(function (p, fi) {
          var pImg = productDisplayImageSafe(p);
          if (!pImg) return;
          var pHref = "product.html?id=" + encodeURIComponent(p.id);
          var pCard = document.createElement("article");
          pCard.className = "featured-cat-card is-inview";
          pCard.style.setProperty("--stagger", String(fi));
          pCard.setAttribute("data-has-preview", "1");
          pCard.setAttribute("data-search-text", ((p.name || "") + " " + (p.id || "")).toLowerCase());
          pCard.innerHTML =
            '<div class="featured-cat-card__shine" aria-hidden="true"></div>' +
            '<a class="featured-cat-card__media-hit" href="' +
            pHref +
            '"><div class="featured-cat-card__media"><img src="' +
            escapeAttr(imgUrl(pImg)) +
            '" alt="" loading="lazy" decoding="async" /></div></a>' +
            '<div class="featured-cat-card__body">' +
            "<h3><a href=\"" +
            pHref +
            "\">" +
            escapeHtml(p.name || "Resin piece") +
            "</a></h3>" +
            "<p>Featured from our catalog</p>" +
            '<div class="featured-cat-card__row">' +
            '<a class="featured-cat-card__cta" href="' +
            pHref +
            '">View piece →</a>' +
            "</div></div>";
          var poolPreviewImg = pCard.querySelector(".featured-cat-card__media img");
          if (poolPreviewImg) {
            var poolFit = D.getProductCoverImageFit ? D.getProductCoverImageFit(p) : "";
            applyImageFitToImg(poolPreviewImg, poolFit);
          }
          els.productGrid.appendChild(pCard);
        });
      }
    }
    applyHomeCatalogFilter();
    var shop = document.getElementById("shop");
    if (shop) shop.classList.add("is-inview");
  }

  function renderCatalogUnavailable() {
    if (D && typeof D.applyPublishedCategoryFallback === "function") {
      D.applyPublishedCategoryFallback();
    }
    renderCategories();
    if (!els.productGrid) return;
    els.productGrid.className = "featured-collections-grid cg-catalog-recovery";
    els.productGrid.innerHTML =
      '<section class="cg-catalog-recovery__panel" role="status" aria-live="polite">' +
      '<h2>Our catalogue is refreshing</h2>' +
      '<p>Categories are available, but product details cannot be loaded just now. Please retry in a moment or message our studio for help.</p>' +
      '<div class="cg-catalog-recovery__actions"><button type="button" class="cg-catalog-recovery__retry" data-cg-retry-catalog>Retry catalogue</button><a href="https://wa.me/918824350056?text=Hi%20Craftguru%2C%20I%20need%20help%20browsing%20the%20catalogue." target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></div>' +
      "</section>";
    var retry = els.productGrid.querySelector("[data-cg-retry-catalog]");
    if (retry) {
      retry.addEventListener("click", function () {
        retry.disabled = true;
        retry.textContent = "Retrying…";
        var M = window.CraftguruCatalogMerge;
        if (M && typeof M.refresh === "function") M.refresh();
      });
    }
    var shop = document.getElementById("shop");
    if (shop) shop.classList.add("is-inview");
  }

  function setCatalogStaleNotice(show) {
    var old = document.getElementById("cgCatalogStaleNotice");
    if (!show) {
      if (old) old.remove();
      return;
    }
    if (old || !els.productGrid || !els.productGrid.parentNode) return;
    var note = document.createElement("p");
    note.id = "cgCatalogStaleNotice";
    note.className = "cg-catalog-stale-note";
    note.setAttribute("role", "status");
    note.textContent = "Showing the last available catalogue while we reconnect. Prices and stock will refresh automatically.";
    els.productGrid.parentNode.insertBefore(note, els.productGrid);
  }

  function productDisplayImageSafe(p) {
    if (!p) return "";
    if (D && typeof D.getProductImageCandidates === "function") {
      var candidates = D.getProductImageCandidates(p);
      if (candidates.length) return candidates[0];
    }
    var img = String(p.image || "").trim();
    if (img && img.indexOf("placeholder-product") < 0) return img;
    if (Array.isArray(p.gallery)) {
      for (var g = 0; g < p.gallery.length; g++) {
        var gi = String(p.gallery[g] || "").trim();
        if (gi && gi.indexOf("placeholder-product") < 0) return gi;
      }
    }
    return "";
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
    var tiltRaf = null;
    var tiltPending = null;
    function applyTilt(node, e) {
      var r = node.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      node.style.transform =
        "perspective(900px) rotateY(" +
        (x * 8).toFixed(2) +
        "deg) rotateX(" +
        (y * -7).toFixed(2) +
        "deg) scale(1.01)";
    }
    nodes.forEach(function (node) {
      node.addEventListener(
        "mousemove",
        function (e) {
          tiltPending = { node: node, e: e };
          if (!tiltRaf) {
            tiltRaf = requestAnimationFrame(function () {
              tiltRaf = null;
              var p = tiltPending;
              tiltPending = null;
              if (p) applyTilt(p.node, p.e);
            });
          }
        },
        { passive: true }
      );
      node.addEventListener("mouseleave", function () {
        node.style.transform = "";
      });
    });
  }

  function findHomeCartLine(id, size, ex) {
    var lines = CART.load();
    var sid = String(id || "");
    var ss = String(size || "");
    var xk = ex == null || ex === "" ? "" : String(ex);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (
        l.id === sid &&
        l.size === ss &&
        (CART.lineExtraKey ? CART.lineExtraKey(l.lineExtra) : "") === xk
      ) {
        return l;
      }
    }
    return null;
  }

  function patchHomeCartLineFromButton(qBtn) {
    var id = qBtn.getAttribute("data-line-id");
    var size = qBtn.getAttribute("data-line-size");
    var xk = qBtn.getAttribute("data-line-extrak");
    var line = findHomeCartLine(id, size, xk);
    var li = qBtn.closest ? qBtn.closest(".cart-item") : null;
    if (!line || !li) return false;
    var num = li.querySelector(".cart-item-qty-num");
    if (num) num.textContent = String(line.qty);
    var span = li.querySelector(".cart-item-info span");
    if (span) {
      var sz =
        (line.variantLabel && String(line.variantLabel).trim()) ||
        (D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size);
      span.textContent =
        String(sz || "") +
        " · Qty " +
        line.qty +
        " · " +
        CART.formatMoney(line.price) +
        " each";
    }
    if (els.cartSubtotal) els.cartSubtotal.textContent = CART.formatMoney(CART.subtotal());
    if (CART.syncShippingNotice) CART.syncShippingNotice();
    return true;
  }

  function updateCartUI() {
    var lines = CART.load();
    var count = CART.countItems();
    if (els.cartCount) els.cartCount.textContent = String(count);
    if (els.cartSubtotal) els.cartSubtotal.textContent = CART.formatMoney(CART.subtotal());
    if (CART.syncShippingNotice) CART.syncShippingNotice();
    if (els.checkoutBtn) {
      var hasCartItems = lines.length > 0;
      els.checkoutBtn.disabled = !hasCartItems;
      els.checkoutBtn.setAttribute("aria-disabled", hasCartItems ? "false" : "true");
    }

    if (!els.cartList) return;
    if (lines.length === 0) {
      els.cartList.innerHTML = '<li class="cart-empty">Your cart is empty.</li>';
      return;
    }

    els.cartList.innerHTML = "";
    lines.forEach(function (line) {
      var li = document.createElement("li");
      li.className = "cart-item";
      var sz =
        (line.variantLabel && String(line.variantLabel).trim()) ||
        (D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size);
      var imgRel = getLineImage(line);
      var imgBlock = imgRel
        ? '<img src="' + escapeAttr(imgUrl(imgRel)) + '" alt="" width="56" height="56" />'
        : '<span class="cart-item__ph" aria-hidden="true"></span>';
      var stockLimit = CART.lineStockLimit ? CART.lineStockLimit(line) : null;
      var availability = stockLimit == null
        ? "Availability is checked again at checkout"
        : stockLimit > Number(line.qty || 0)
          ? "In stock · final availability confirmed at checkout"
          : "Last available quantity in your cart";
      li.innerHTML =
        imgBlock +
        '<div class="cart-item-info">' +
        "<strong>" +
        escapeHtml(CART.liveDisplayName ? CART.liveDisplayName(line) : line.name) +
        "</strong>" +
        "<span>" +
        escapeHtml(String(sz || "")) +
        " · Qty " +
        line.qty +
        " · " +
        CART.formatMoney(line.price) +
        ' each</span><p class="cart-item__status" role="status">' + escapeHtml(availability) + "</p>" +
        "</div>" +
        '<div class="cart-item__side">' +
        '<div class="cart-item-qty-wrap">' +
        '<button type="button" class="cart-item__qty cart-item__qty--minus" data-qty-delta="-1" data-line-id="' +
        escapeAttr(line.id) +
        '" data-line-size="' +
        escapeAttr(line.size) +
        '" data-line-extrak="' +
        escapeAttr(CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "") +
        '" aria-label="Decrease quantity">−</button>' +
        '<span class="cart-item-qty-num">' +
        line.qty +
        "</span>" +
        '<button type="button" class="cart-item__qty cart-item__qty--plus" data-qty-delta="1" data-line-id="' +
        escapeAttr(line.id) +
        '" data-line-size="' +
        escapeAttr(line.size) +
        '" data-line-extrak="' +
        escapeAttr(CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "") +
        '" aria-label="Increase quantity">+</button>' +
        "</div>" +
        '<button type="button" class="cart-item__remove" data-remove-id="' +
        escapeAttr(line.id) +
        '" data-remove-size="' +
        escapeAttr(line.size) +
        '" data-remove-extrak="' +
        escapeAttr(CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "") +
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
        CART.removeLine(
          rm.getAttribute("data-remove-id"),
          rm.getAttribute("data-remove-size"),
          rm.getAttribute("data-remove-extrak")
        );
        updateCartUI();
        return;
      }
      var q = e.target && e.target.closest ? e.target.closest(".cart-item__qty") : null;
      if (!q) return;
      e.preventDefault();
      e.stopPropagation();
      var id = q.getAttribute("data-line-id");
      var size = q.getAttribute("data-line-size");
      var xk = q.getAttribute("data-line-extrak");
      var d = parseInt(q.getAttribute("data-qty-delta") || "0", 10) || 0;
      var status = q.closest(".cart-item") && q.closest(".cart-item").querySelector(".cart-item__status");
      if (status) status.textContent = "Updating quantity…";
      CART.incrementLine(id, size, d, xk);
      if (els.cartCount) els.cartCount.textContent = String(CART.countItems());
      if (!patchHomeCartLineFromButton(q)) updateCartUI();
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
    if (window.CraftguruOverlayLock) window.CraftguruOverlayLock.acquire("cart");
  }

  function closeCart() {
    els.cartBackdrop.classList.remove("is-open");
    els.cartDrawer.classList.remove("is-open");
    els.cartDrawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (window.CraftguruOverlayLock) window.CraftguruOverlayLock.release("cart");
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

  function bootStep(name, fn) {
    try {
      fn();
    } catch (err) {
      if (window.console && console.error) {
        console.error("[app] boot step failed: " + name, err);
      }
    }
  }

  bootStep("renderCategories", renderCategories);
  bootStep("wireHomeCategoryToggle", wireHomeCategoryToggle);
  bootStep("renderFeatured", renderFeatured);
  bootStep("paintHeroFloatCatalog", paintHeroFloatCatalog);
  bootStep("bootConfigurableHero", bootConfigurableHero);
  bootStep("renderHeroSpotlight", renderHeroSpotlight);
  if (gq) {
    gq.addEventListener("input", scheduleHomeCatalogFilter);
  }
  observeReveals();
  bindHeroTilt();
  updateCartUI();

  window.addEventListener("storage", function (e) {
    if (e.key === "resin_atelier_cart_v1") updateCartUI();
  });

  window.addEventListener("resinCartChanged", function () {
    var count = CART.countItems();
    if (els.cartCount) els.cartCount.textContent = String(count);
    if (!els.cartList) return;
    var lines = CART.load();
    if (!lines.length) {
      updateCartUI();
      return;
    }
    var drawerOpen = els.cartDrawer && els.cartDrawer.classList.contains("is-open");
    if (!drawerOpen) {
      if (els.cartSubtotal) els.cartSubtotal.textContent = CART.formatMoney(CART.subtotal());
      if (CART.syncShippingNotice) CART.syncShippingNotice();
      return;
    }
    var items = els.cartList.querySelectorAll(".cart-item");
    if (items.length !== lines.length) {
      updateCartUI();
      return;
    }
    if (els.cartSubtotal) els.cartSubtotal.textContent = CART.formatMoney(CART.subtotal());
    if (CART.syncShippingNotice) CART.syncShippingNotice();
  });

  function patchFeaturedCardImages() {
    if (!els.productGrid) return false;
    var cards = els.productGrid.querySelectorAll(".craft-cat-card");
    if (!cards.length) return false;
    cards.forEach(function (card) {
      var catId = "";
      var link = card.querySelector(".craft-cat-card__hit");
      if (link && link.getAttribute("href")) {
        try {
          var u = new URL(link.href, window.location.href);
          catId = u.searchParams.get("cat") || "";
        } catch (_) {}
      }
      if (!catId) return;
      var pair = categoryPreviewPair(catId);
      var imgRel = (pair && pair.primary) || "";
      var imgFallback = (pair && pair.fallback) || "";
      if (!imgRel && !imgFallback) return;
      var media = card.querySelector(".craft-cat-card__media");
      if (!media) return;
      var img = media.querySelector("img");
      var fit = categoryPreviewFit(catId, imgRel || imgFallback);
      if (!img) {
        if (!imgRel) return;
        media.innerHTML =
          '<img src="' +
          escapeAttr(imgUrl(imgRel, 640)) +
          '" srcset="' +
          escapeAttr(D.imageSrcSet ? D.imageSrcSet(imgRel, [320, 480, 640, 960]) : "") +
          '" sizes="' +
          escapeAttr(D.imageSizes ? D.imageSizes("card") : "") +
          '" alt="" width="640" height="457" loading="lazy" decoding="async" data-image-fit="' +
          escapeAttr(fit) +
          '" />';
        img = media.querySelector("img");
      } else if (imgRel) {
        img.src = imgUrl(imgRel, 640);
        if (D.imageSrcSet) img.srcset = D.imageSrcSet(imgRel, [320, 480, 640, 960]);
        if (D.imageSizes) img.sizes = D.imageSizes("card");
      }
      if (img) {
        img.setAttribute("data-image-fit", fit);
        if (window.CraftguruImageFit && window.CraftguruImageFit.applyImageFit) {
          window.CraftguruImageFit.applyImageFit(img, fit);
        }
        if (imgFallback) {
          wireCategoryPreviewImgOnerror(img, imgFallback);
        }
      }
    });
    return true;
  }

  function patchFeaturedCardPrices() {
    if (!els.productGrid) return;
    var cards = els.productGrid.querySelectorAll(".craft-cat-card[data-min-price]");
    if (!cards.length) return false;
    cards.forEach(function (card) {
      var catId = "";
      var link = card.querySelector(".craft-cat-card__hit");
      if (link && link.getAttribute("href")) {
        try {
          var u = new URL(link.href, window.location.href);
          catId = u.searchParams.get("cat") || "";
        } catch (_) {}
      }
      if (!catId) return;
      var minFrom = minPriceInCategory(catId);
      if (minFrom != null) card.setAttribute("data-min-price", String(minFrom));
    });
    return true;
  }

  window.addEventListener("craftguruCatalogCategoriesMerged", function () {
    bootStep("patchHomeCategoriesFromMerge", function () {
      if (!patchHomeCategoriesFromMerge()) renderCategories();
    });
    bootStep("paintHeroFloatCatalog", paintHeroFloatCatalog);
    bootStep("renderHeroSpotlight", renderHeroSpotlight);
  });

  var storefrontMergeTimer = null;
  function onStorefrontCatalogMerged() {
    var merge = window.CraftguruCatalogMerge;
    var failed = !!(merge && typeof merge.hasLoadFailure === "function" && merge.hasLoadFailure());
    var hasCached = !!(merge && typeof merge.hasUsableCachedCatalog === "function" && merge.hasUsableCachedCatalog());
    if (failed && !hasCached) {
      setCatalogStaleNotice(false);
      renderCatalogUnavailable();
      return;
    }
    setCatalogStaleNotice(failed && hasCached);
    clearTimeout(storefrontMergeTimer);
    storefrontMergeTimer = setTimeout(function () {
      bootStep("patchHomeCategoriesFromMerge", function () {
        /* A backend update can add a category as well as a product. Rebuild
           the rail so the left-hand selector stays complete and current. */
        renderCategories();
      });
      bootStep("renderFeatured", function () {
        /* Rebuilding, rather than only replacing images/prices, refreshes
           category counts and includes a newly populated category. */
        renderFeatured();
      });
      bootStep("paintHeroFloatCatalog", paintHeroFloatCatalog);
      bootStep("bootConfigurableHero", bootConfigurableHero);
      bootStep("renderHeroSpotlight", renderHeroSpotlight);
    }, 40);
  }

  window.addEventListener("craftguruCatalogPricesMerged", onStorefrontCatalogMerged);
  window.addEventListener("craftguruCatalogLoadFailed", function () {
    onStorefrontCatalogMerged();
  });
})();
