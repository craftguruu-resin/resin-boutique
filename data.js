/** Catalog logic only. Product/category records are owned by PostgreSQL/Vendor Panel. */
(function (global) {
  "use strict";

  var CATEGORIES = [];
  var PRODUCTS = [];
  var BY_ID = Object.create(null);
  var BY_CAT = Object.create(null);
  var BY_CAT_SUB = Object.create(null);
  var SUPPRESSED = Object.create(null);
  var PAGE_SIZE = 48;

  var SIZE_LABELS = {
    s: { key: "s", name: "Compact", hint: "Smallest pour" },
    m: { key: "m", name: "Classic", hint: "Most popular" },
    l: { key: "l", name: "Grand", hint: "Largest format" }
  };

  function normalizeCategoryId(id) {
    id = String(id || "").trim();
    return CATEGORIES.some(function (c) { return c.id === id; }) ? id : id;
  }

  function getCategoryObject(id) {
    id = normalizeCategoryId(id);
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  function getCategoryLabel(id) {
    var c = getCategoryObject(id);
    return c ? c.label : String(id || "");
  }

  function getSubcategories(id) {
    var c = getCategoryObject(id);
    return c && Array.isArray(c.subcategories) ? c.subcategories : [];
  }

  function getSubcategoryLabel(catId, subId) {
    var subs = getSubcategories(catId);
    for (var i = 0; i < subs.length; i++) if (subs[i].id === subId) return subs[i].label;
    return String(subId || "");
  }

  function rebuildCategoryProductIndex() {
    BY_ID = Object.create(null);
    BY_CAT = Object.create(null);
    BY_CAT_SUB = Object.create(null);
    PRODUCTS.forEach(function (p) {
      if (!p || !p.id || SUPPRESSED[p.id] || p.listed === false) return;
      BY_ID[p.id] = p;
      if (!BY_CAT[p.category]) BY_CAT[p.category] = [];
      BY_CAT[p.category].push(p.id);
      if (!BY_CAT_SUB[p.category]) BY_CAT_SUB[p.category] = Object.create(null);
      var sub = String(p.subcategory || "all");
      if (!BY_CAT_SUB[p.category][sub]) BY_CAT_SUB[p.category][sub] = [];
      BY_CAT_SUB[p.category][sub].push(p.id);
    });
  }

  function getProduct(id) { return BY_ID[String(id || "")] || null; }

  function listProductsAll(catId, subId) {
    var ids = subId
      ? ((BY_CAT_SUB[catId] && BY_CAT_SUB[catId][subId]) || [])
      : (BY_CAT[catId] || []);
    return ids.map(function (id) { return BY_ID[id]; }).filter(Boolean);
  }

  function listProductPage(catId, subId, page) {
    var list = listProductsAll(catId, subId);
    var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    var p = Math.min(Math.max(1, page || 1), pages);
    var start = (p - 1) * PAGE_SIZE;
    return { items: list.slice(start, start + PAGE_SIZE), page: p, pages: pages, total: list.length, pageSize: PAGE_SIZE };
  }

  function getFeatured(limit) { return PRODUCTS.slice(0, limit || 12).filter(function (p) { return p && !SUPPRESSED[p.id] && p.listed !== false; }); }

  function imageUrl(relPath) {
    relPath = String(relPath || "").trim();
    return relPath ? relPath.split("/").map(encodeURIComponent).join("/") : "";
  }

  function imageSrcSet(relPath, widths) { return imageUrl(relPath); }
  function imageSizes() { return "100vw"; }

  function getSizeProfile(catId, sizeKey) {
    var defaults = { s: { dim: "", pour: "", viz: 0.78 }, m: { dim: "", pour: "", viz: 1 }, l: { dim: "", pour: "", viz: 1.26 } };
    return defaults[sizeKey] || { dim: "", pour: "", viz: 1 };
  }

  function getSizeLabelNameForProduct(p, key) {
    var x = p && p.sizeLabels && p.sizeLabels[key];
    if (x && typeof x === "object" && x.name) return String(x.name);
    return SIZE_LABELS[key] ? SIZE_LABELS[key].name : String(key || "");
  }

  function getOfferedSizeKeysForProduct(p) {
    if (!p || !p.prices) return [];
    return ["s","m","l"].filter(function (k) { return Number(p.prices[k]) > 0; });
  }

  function getStartingPriceInr(p) {
    if (!p) return 0;
    var vals = ["s","m","l"].map(function (k) { return Number(p.prices && p.prices[k]); }).filter(function (n) { return Number.isFinite(n) && n > 0; });
    /* Vendor-created products can have more than the legacy S/M/L tiers.
       Include those custom size prices so homepage/category "From" pricing
       matches the selectable options on the product page. */
    var sizes = p.options && p.options.useSize && Array.isArray(p.options.sizes) ? p.options.sizes : [];
    sizes.forEach(function (size) {
      var n = Number(size && size.priceInr);
      if (Number.isFinite(n) && n > 0) vals.push(n);
    });
    return vals.length ? Math.min.apply(null, vals) : 0;
  }

  function formatStartingFromPrice(p, formatMoneyFn) {
    var n = getStartingPriceInr(p);
    return n > 0 ? "From " + (typeof formatMoneyFn === "function" ? formatMoneyFn(n) : "₹" + n) : "";
  }

  function getProductCoverImageFit() { return ""; }
  function getCategoryPreviewImageFit() { return ""; }
  function getCategoryCardPreview() { return { image: "", fit: "", fallback: "" }; }

  function normalizeOptionsOverride(raw) {
    if (!raw) return null;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch (_) { return null; } }
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  }
  function catalogOptionsHasPayload(opt) { return !!normalizeOptionsOverride(opt); }
  function getOfferedOptionSizes(opt) { return opt && Array.isArray(opt.sizes) ? opt.sizes : []; }
  function sanitizeOptionSizes(opt) { return normalizeOptionsOverride(opt) || {}; }

  function applyPriceOverrides(map) {
    if (!map) return 0;
    var n = 0;
    PRODUCTS.forEach(function (p) {
      var o = map[p.id];
      if (!o) return;
      p.prices = p.prices || {};
      ["s","m","l"].forEach(function (k) {
        if (o[k] != null && Number.isFinite(Number(o[k]))) { p.prices[k] = Number(o[k]); n++; }
      });

      /* The public override payload owns all vendor-managed storefront
         fields, not only prices. This is what makes saved size/colour rows
         available to product.html for both bundled and vendor-added pieces. */
      if (o.name != null && String(o.name).trim()) p.name = String(o.name).trim();
      p.returnGift = o.returnGift === true;
      p.listed = o.listed !== false;
      if (o.sizeLabels && typeof o.sizeLabels === "object") {
        p.sizeLabels = o.sizeLabels;
      }
      if (o.options && typeof o.options === "object") {
        if (!p._catalogImage) p._catalogImage = p.image;
        p.options = normalizeOptionsOverride(o.options);
        p._vendorOptionsApplied = true;
        /* Use the vendor's configured cover in listings as well as the PDP. */
        if (p.options && String(p.options.heroImage || "").trim()) {
          p.image = String(p.options.heroImage).trim();
        }
      } else if (p.vendorCatalogRow || p._vendorOptionsApplied) {
        delete p.options;
        if (p._catalogImage) p.image = p._catalogImage;
        delete p._vendorOptionsApplied;
      }
    });
    rebuildCategoryProductIndex();
    return n;
  }

  function applyCatalogSuppressions(ids) {
    (ids || []).forEach(function (id) { id = String(id || "").trim(); if (id) SUPPRESSED[id] = 1; });
    PRODUCTS = PRODUCTS.filter(function (p) { return !SUPPRESSED[p.id]; });
    rebuildCategoryProductIndex();
    return ids ? ids.length : 0;
  }

  function isProductSuppressed(id) { return !!SUPPRESSED[String(id || "").trim()]; }

  function applyVendorProductsMerge(rows) {
    var incoming = Object.create(null);
    (rows || []).forEach(function (row) {
      if (row && row.id && row.isActive !== false && row.listed !== false) {
        incoming[String(row.id)] = 1;
      }
    });

    /* This endpoint is an authoritative snapshot of vendor-only products.
       Drop a previously merged row when the vendor deactivates or deletes it. */
    PRODUCTS = PRODUCTS.filter(function (p) {
      return !p || !p.vendorCatalogRow || !!incoming[String(p.id || "")];
    });

    (rows || []).forEach(function (row) {
      if (!row || !row.id || row.isActive === false || row.listed === false || SUPPRESSED[row.id]) return;
      var p = {
        id: String(row.id),
        name: String(row.name || row.id),
        category: String(row.category || row.categoryId || ""),
        subcategory: String(row.subcategory || row.subcategoryId || "all"),
        image: String(row.image || ""),
        prices: row.prices || {},
        vendorCatalogRow: true
      };
      if (row.sizeLabels) p.sizeLabels = row.sizeLabels;
      if (row.gallery || row.galleryImages) p.gallery = row.gallery || row.galleryImages;
      if (row.options) p.options = normalizeOptionsOverride(row.options);
      if (row.description) p.description = String(row.description);
      var idx = -1;
      for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === p.id) { idx = i; break; }
      if (idx >= 0) PRODUCTS[idx] = p; else PRODUCTS.push(p);
    });
    rebuildCategoryProductIndex();
    if (global.RESIN_DATA) {
      global.RESIN_DATA.allProducts = PRODUCTS;
      global.RESIN_DATA.byCategory = BY_CAT;
    }
    return (rows || []).length;
  }

  function applyCategoriesMerge(rows) {
    if (!Array.isArray(rows)) return 0;
    CATEGORIES = rows.map(function (c) {
      return {
        id: String(c.id || ""),
        label: String(c.label || c.id || ""),
        folder: String(c.folder || ""),
        subcategories: Array.isArray(c.subcategories) ? c.subcategories : []
      };
    }).filter(function (c) { return c.id; });
    rebuildCategoryProductIndex();
    if (global.RESIN_DATA) {
      global.RESIN_DATA.categories = CATEGORIES;
      global.RESIN_DATA.byCategory = BY_CAT;
      global.RESIN_DATA.allProducts = PRODUCTS;
    }
    return CATEGORIES.length;
  }

  function searchCatalogPartial(q, limit) {
    q = String(q || "").toLowerCase().trim();
    if (!q) return [];
    return PRODUCTS.filter(function (p) {
      return !SUPPRESSED[p.id] && p.listed !== false && String(p.name || "").toLowerCase().indexOf(q) >= 0;
    }).slice(0, limit || 12);
  }

  function searchCategoriesPartial(q, limit) {
    q = String(q || "").toLowerCase().trim();
    return CATEGORIES.filter(function (c) { return !q || (String(c.label).toLowerCase().indexOf(q) >= 0); }).slice(0, limit || 12);
  }

  function productSearchHaystack(p) { return [p && p.name, p && p.id, p && p.category, p && p.subcategory].filter(Boolean).join(" ").toLowerCase(); }
  function partialTokenMatch(h, q) {
    q = String(q || "").toLowerCase().trim();
    return !q || q.split(/\s+/).every(function (x) { return String(h || "").toLowerCase().indexOf(x) >= 0; });
  }

  global.RESIN_DATA = {
    categories: CATEGORIES,
    sizeLabels: SIZE_LABELS,
    pageSize: PAGE_SIZE,
    allProducts: PRODUCTS,
    byCategory: BY_CAT,
    getProduct: getProduct,
    getCategoryLabel: getCategoryLabel,
    getCategoryPreviewImage: function () { return ""; },
    getCategoryPreviewImagePair: function () { return { primary: "", fallback: "" }; },
    getCategoryNavImageFit: function () { return ""; },
    listAllListedProducts: function () { return PRODUCTS.slice(); },
    pickRandomCatalogProductImage: function () { return ""; },
    getSubcategoryPreviewImage: function () { return ""; },
    getSubcategoryLabel: getSubcategoryLabel,
    getSizeProfile: getSizeProfile,
    getSizeLabelNameForProduct: getSizeLabelNameForProduct,
    getSizeProfileForProduct: getSizeProfile,
    getOfferedSizeKeysForProduct: getOfferedSizeKeysForProduct,
    countOfferedSizesForProduct: function (p) { return getOfferedSizeKeysForProduct(p).length; },
    getStartingPriceInr: getStartingPriceInr,
    formatStartingFromPrice: formatStartingFromPrice,
    lineSizeLabel: getSizeLabelNameForProduct,
    normalizeCategoryId: normalizeCategoryId,
    getSubcategories: getSubcategories,
    listCategorySubcategories: function (catId) { return getSubcategories(catId); },
    listCategoryPage: listProductPage,
    listProductPage: listProductPage,
    listProductsAll: listProductsAll,
    getFeatured: getFeatured,
    imageUrl: imageUrl,
    imageSrcSet: imageSrcSet,
    imageSizes: imageSizes,
    applyPriceOverrides: applyPriceOverrides,
    applyCatalogSuppressions: applyCatalogSuppressions,
    isProductSuppressed: isProductSuppressed,
    applyVendorProductsMerge: applyVendorProductsMerge,
    rebuildCategoryProductIndex: rebuildCategoryProductIndex,
    applyCategoriesMerge: applyCategoriesMerge,
    searchCatalogPartial: searchCatalogPartial,
    searchCategoriesPartial: searchCategoriesPartial,
    partialTokenMatch: partialTokenMatch,
    productSearchHaystack: productSearchHaystack,
    catalogOptionsHasPayload: catalogOptionsHasPayload,
    normalizeOptionsOverride: normalizeOptionsOverride,
    getOfferedOptionSizes: getOfferedOptionSizes,
    sanitizeOptionSizes: sanitizeOptionSizes,
    getProductCoverImageFit: getProductCoverImageFit,
    getCategoryPreviewImageFit: getCategoryPreviewImageFit,
    getCategoryCardPreview: getCategoryCardPreview
  };
})(typeof window !== "undefined" ? window : this);
