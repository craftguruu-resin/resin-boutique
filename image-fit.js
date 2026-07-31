/**
 * Per-image display fit (cover vs contain) stored in product options_json.
 * Used on vendor panel and guest storefront listings / PDP.
 */
(function (root) {
  "use strict";

  var CATEGORY_PREVIEW_FIT_FALLBACK = {
    "resin-clocks": "contain",
  };

  function stripUrlCache(u) {
    return String(u == null ? "" : u)
      .trim()
      .replace(/[?&]v=\d+/gi, "")
      .replace(/\?&/, "?")
      .replace(/[?&]$/, "");
  }

  function normalizeImageFit(mode) {
    var m = String(mode == null ? "" : mode)
      .trim()
      .toLowerCase();
    if (m === "contain" || m === "cover") return m;
    return "";
  }

  function rowHasImageFit(row) {
    return !!(row && normalizeImageFit(row.imageFit));
  }

  function optionsHasImageFit(opt) {
    if (!opt || typeof opt !== "object") return false;
    if (normalizeImageFit(opt.heroImageFit)) return true;
    if (opt.galleryImageFits && typeof opt.galleryImageFits === "object") {
      var gk;
      for (gk in opt.galleryImageFits) {
        if (Object.prototype.hasOwnProperty.call(opt.galleryImageFits, gk) && normalizeImageFit(opt.galleryImageFits[gk])) {
          return true;
        }
      }
    }
    var lists = ["colors", "sizes", "qtyOptions"];
    for (var i = 0; i < lists.length; i++) {
      var arr = opt[lists[i]];
      if (!Array.isArray(arr)) continue;
      for (var j = 0; j < arr.length; j++) {
        if (rowHasImageFit(arr[j])) return true;
      }
    }
    return false;
  }

  function getFitForUrl(opt, url) {
    if (!opt || !url) return "";
    var key = stripUrlCache(url).toLowerCase();
    if (!key) return "";

    var hero = stripUrlCache(opt.heroImage || "").toLowerCase();
    if (hero && key === hero) {
      var hf = normalizeImageFit(opt.heroImageFit);
      if (hf) return hf;
    }

    if (opt.galleryImageFits && typeof opt.galleryImageFits === "object") {
      var gk;
      for (gk in opt.galleryImageFits) {
        if (!Object.prototype.hasOwnProperty.call(opt.galleryImageFits, gk)) continue;
        if (stripUrlCache(gk).toLowerCase() === key) {
          return normalizeImageFit(opt.galleryImageFits[gk]);
        }
      }
    }

    var lists = ["colors", "sizes", "qtyOptions"];
    for (var i = 0; i < lists.length; i++) {
      var arr = opt[lists[i]];
      if (!Array.isArray(arr)) continue;
      for (var j = 0; j < arr.length; j++) {
        var row = arr[j];
        if (!row || !row.image) continue;
        if (stripUrlCache(row.image).toLowerCase() === key) {
          return normalizeImageFit(row.imageFit);
        }
      }
    }
    return "";
  }

  function productDisplayImagePath(p) {
    if (!p) return "";
    var img = String(p.image || "").trim();
    if (img) return img;
    if (p.options && String(p.options.heroImage || "").trim()) return String(p.options.heroImage).trim();
    if (Array.isArray(p.gallery)) {
      for (var g = 0; g < p.gallery.length; g++) {
        var gi = String(p.gallery[g] || "").trim();
        if (gi) return gi;
      }
    }
    return "";
  }

  function getProductCoverImageFit(product) {
    if (!product) return "";
    var img = productDisplayImagePath(product);
    if (!img) return "";
    return getFitForUrl(product.options, img);
  }

  function findImageFitInCategory(catId, imageUrl, listProductsAll) {
    if (!imageUrl || typeof listProductsAll !== "function") return "";
    var products = listProductsAll(catId, null) || [];
    for (var i = 0; i < products.length; i++) {
      var fit = getFitForUrl(products[i].options, imageUrl);
      if (fit) return fit;
    }
    return "";
  }

  function getCategoryPreviewImageFit(catId, imageUrl, dataApi) {
    if (!imageUrl) return "";
    var nav = "";
    var navFit = "";
    if (dataApi && typeof dataApi.getCategoryNavImage === "function") {
      nav = String(dataApi.getCategoryNavImage(catId) || "").trim();
    }
    if (dataApi && typeof dataApi.getCategoryNavImageFit === "function") {
      navFit = normalizeImageFit(dataApi.getCategoryNavImageFit(catId));
    }
    var key = stripUrlCache(imageUrl).toLowerCase();
    var navKey = stripUrlCache(nav).toLowerCase();
    if (nav && navKey && key === navKey) {
      if (navFit) return navFit;
      if (catId && CATEGORY_PREVIEW_FIT_FALLBACK[catId]) {
        return normalizeImageFit(CATEGORY_PREVIEW_FIT_FALLBACK[catId]);
      }
      return "";
    }
    var fit = "";
    if (dataApi && typeof dataApi.listProductsAll === "function") {
      fit = findImageFitInCategory(catId, imageUrl, dataApi.listProductsAll);
    }
    if (fit) return fit;
    if (catId && CATEGORY_PREVIEW_FIT_FALLBACK[catId]) {
      return normalizeImageFit(CATEGORY_PREVIEW_FIT_FALLBACK[catId]);
    }
    return "";
  }

  function applyImageFit(imgEl, fit) {
    if (!imgEl) return;
    var f = normalizeImageFit(fit);
    if (f) imgEl.setAttribute("data-image-fit", f);
    else imgEl.removeAttribute("data-image-fit");
  }

  /** Toggle: default/cover → contain → default */
  function toggleImageFit(current) {
    var f = normalizeImageFit(current);
    if (f === "contain") return "";
    return "contain";
  }

  function fitButtonLabel(fit) {
    return normalizeImageFit(fit) === "contain" ? "Fit: contain ✓" : "Fit image";
  }

  function setHeroImageFit(opt, fit) {
    opt = opt && typeof opt === "object" ? opt : {};
    var f = normalizeImageFit(fit);
    if (f) opt.heroImageFit = f;
    else delete opt.heroImageFit;
    return opt;
  }

  function setGalleryImageFit(opt, url, fit) {
    opt = opt && typeof opt === "object" ? opt : {};
    var u = stripUrlCache(url);
    if (!u) return opt;
    if (!opt.galleryImageFits || typeof opt.galleryImageFits !== "object") {
      opt.galleryImageFits = {};
    }
    var f = normalizeImageFit(fit);
    if (f) opt.galleryImageFits[u] = f;
    else delete opt.galleryImageFits[u];
    if (!Object.keys(opt.galleryImageFits).length) delete opt.galleryImageFits;
    return opt;
  }

  function getHeroImageFit(opt) {
    return normalizeImageFit(opt && opt.heroImageFit);
  }

  function getGalleryImageFit(opt, url) {
    if (!opt || !url || !opt.galleryImageFits) return "";
    var key = stripUrlCache(url).toLowerCase();
    var gk;
    for (gk in opt.galleryImageFits) {
      if (!Object.prototype.hasOwnProperty.call(opt.galleryImageFits, gk)) continue;
      if (stripUrlCache(gk).toLowerCase() === key) {
        return normalizeImageFit(opt.galleryImageFits[gk]);
      }
    }
    return "";
  }

  function syncCoverColorImageFit(opt) {
    if (!opt || !Array.isArray(opt.colors)) return opt;
    var heroFit = getHeroImageFit(opt);
    var hero = stripUrlCache(opt.heroImage || "").toLowerCase();
    opt.colors = opt.colors.map(function (c) {
      if (!c || typeof c !== "object") return c;
      var copy = Object.assign({}, c);
      var id = String(copy.id || "").trim().toLowerCase();
      var img = stripUrlCache(copy.image || "").toLowerCase();
      if (id === "c-cover" || id === "cover" || (hero && img === hero)) {
        if (heroFit) copy.imageFit = heroFit;
        else delete copy.imageFit;
      }
      return copy;
    });
    return opt;
  }

  root.CraftguruImageFit = {
    stripUrlCache: stripUrlCache,
    normalizeImageFit: normalizeImageFit,
    optionsHasImageFit: optionsHasImageFit,
    getFitForUrl: getFitForUrl,
    getProductCoverImageFit: getProductCoverImageFit,
    getCategoryPreviewImageFit: getCategoryPreviewImageFit,
    findImageFitInCategory: findImageFitInCategory,
    applyImageFit: applyImageFit,
    toggleImageFit: toggleImageFit,
    fitButtonLabel: fitButtonLabel,
    setHeroImageFit: setHeroImageFit,
    setGalleryImageFit: setGalleryImageFit,
    getHeroImageFit: getHeroImageFit,
    getGalleryImageFit: getGalleryImageFit,
    syncCoverColorImageFit: syncCoverColorImageFit,
    CATEGORY_PREVIEW_FIT_FALLBACK: CATEGORY_PREVIEW_FIT_FALLBACK,
  };
})(typeof window !== "undefined" ? window : this);
