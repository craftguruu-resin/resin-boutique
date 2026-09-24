"use strict";

var catalogFromData = require("./catalog-from-data.js");
var vendorProductsDb = require("./vendor-products-db.js");
var vendorCatalogDb = require("./vendor-catalog-db.js");
var poolMod = require("./db/pool.js");
var resinClocksTaxonomy = require("./resin-clocks-taxonomy.js");
var resinGurujiProductsTaxonomy = require("./resin-guruji-products-taxonomy.js");
var resinKeychainsTaxonomy = require("./resin-keychains-taxonomy.js");

/** Re-export merge helpers from index — duplicated minimally to avoid circular deps. */
function normalizeSubcategoryEntry(s) {
  if (!s || !s.id) return null;
  return { id: String(s.id).trim().slice(0, 80), label: String(s.label || s.id).slice(0, 200) };
}

function normalizeCategorySubcategories(raw) {
  if (!raw) return [{ id: "all", label: "All" }];
  if (Array.isArray(raw)) {
    return raw.map(normalizeSubcategoryEntry).filter(Boolean);
  }
  try {
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed.map(normalizeSubcategoryEntry).filter(Boolean);
  } catch (_) {}
  return [{ id: "all", label: "All" }];
}

function mergeSubcategoryListsUnion(dbSubs, catalogSubs) {
  var out = [];
  var seen = Object.create(null);
  function pushList(list) {
    (list || []).forEach(function (s) {
      if (!s || !s.id) return;
      var id = String(s.id).trim();
      if (!id || seen[id]) return;
      seen[id] = true;
      var o = { id: id, label: String(s.label || id).slice(0, 200) };
      if (s.image) o.image = String(s.image).trim().slice(0, 500);
      if (s.imageFit) o.imageFit = String(s.imageFit).trim().slice(0, 20);
      out.push(o);
    });
  }
  pushList(dbSubs);
  pushList(catalogSubs);
  return out;
}

function mergeCategoriesDbWithCatalog(dbRows) {
  var map = Object.create(null);
  (dbRows || []).forEach(function (row) {
    var id = String((row && row.id) || "").trim().slice(0, 80);
    if (!id) return;
    map[id] = {
      id: id,
      label: row.label,
      folder: row.folder || "",
      subcategories: normalizeCategorySubcategories(row.subcategories),
      nav_image: String((row.nav_image != null && row.nav_image) || "").trim(),
      nav_image_fit: String((row.nav_image_fit != null && row.nav_image_fit) || "").trim(),
      vendor_owned: Boolean(row.vendor_owned),
    };
  });
  var catalogList = [];
  try {
    catalogList = catalogFromData.getCategoriesList() || [];
  } catch (_) {}
  catalogList.forEach(function (c) {
    if (!c || !c.id) return;
    var cid = String(c.id).trim().slice(0, 80);
    if (!cid) return;
    var fromDataSubs = Array.isArray(c.subcategories)
      ? c.subcategories.map(normalizeSubcategoryEntry).filter(Boolean)
      : [];
    if (!map[cid]) {
      map[cid] = {
        id: cid,
        label: c.label || cid,
        folder: c.folder || "",
        subcategories: fromDataSubs,
        nav_image: "",
        vendor_owned: false,
      };
    } else {
      map[cid].subcategories = mergeSubcategoryListsUnion(map[cid].subcategories || [], fromDataSubs);
      if (!String(map[cid].folder || "").trim() && String(c.folder || "").trim()) map[cid].folder = c.folder;
      if ((!map[cid].label || map[cid].label === map[cid].id) && c.label) map[cid].label = c.label;
    }
  });
  Object.keys(map).forEach(function (k) {
    var row = map[k];
    if (row && String(row.id) === "resin-clocks") {
      row.subcategories = resinClocksTaxonomy.listCanonicalSubcategories();
    } else if (row && String(row.id) === "resin-guruji-products") {
      row.subcategories = resinGurujiProductsTaxonomy.listCanonicalSubcategories();
    } else if (row && String(row.id) === "resin-keychains") {
      row.subcategories = resinKeychainsTaxonomy.listCanonicalSubcategories();
    }
  });
  return Object.keys(map)
    .map(function (k) {
      return map[k];
    })
    .sort(function (a, b) {
      return String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" });
    });
}

function categoriesFromDataJsOnly() {
  return catalogFromData.getCategoriesList().map(function (c) {
    return {
      id: c.id,
      label: c.label,
      folder: c.folder || "",
      subcategories: normalizeCategorySubcategories(c.subcategories),
      nav_image: "",
      nav_image_fit: "",
      vendor_owned: false,
    };
  });
}

/**
 * Same payload as GET /api/catalog/storefront-bootstrap
 * @param {function(Error|null, object)} cb
 */
function loadStorefrontBootstrap(cb) {
  var out = { ok: true, products: [], categories: [], overrides: {}, suppressedProductIds: [] };
  var pending = 3;
  var failed = false;

  function finish() {
    if (failed) return;
    if (pending > 0) return;
    cb(null, out);
  }

  function failOnce(msg) {
    if (failed) return;
    failed = true;
    cb(new Error(String(msg || "Bootstrap failed")));
  }

  vendorProductsDb.listExtraProductsForStorefront(function (e, list) {
    if (e) return failOnce(e.message || e);
    out.products = list || [];
    pending -= 1;
    finish();
  });

  if (!poolMod.isEnabled()) {
    out.categories = categoriesFromDataJsOnly();
    pending -= 1;
    finish();
  } else {
    poolMod
      .getPool()
      .query(
        "SELECT id, label, folder, subcategories, COALESCE(vendor_owned, false) AS vendor_owned, COALESCE(nav_image, '') AS nav_image, COALESCE(nav_image_fit, '') AS nav_image_fit, updated_at FROM categories ORDER BY label ASC"
      )
      .then(function (r) {
        out.categories = mergeCategoriesDbWithCatalog(r.rows);
        pending -= 1;
        finish();
      })
      .catch(function (e3) {
        out.categories = categoriesFromDataJsOnly();
        if (!out.categories.length) failOnce(e3.message || e3);
        pending -= 1;
        finish();
      });
  }

  vendorCatalogDb.listOverridesMap(function (e4, map) {
    if (e4) return failOnce(e4.message || e4);
    var overridesOut = {};
    Object.keys(map || {}).forEach(function (k) {
      var key = String(k != null ? k : "").trim();
      if (!key) return;
      var x = map[k];
      var o = {};
      if (x.s != null && Number.isFinite(Number(x.s))) o.s = Number(x.s);
      if (x.m != null && Number.isFinite(Number(x.m))) o.m = Number(x.m);
      if (x.l != null && Number.isFinite(Number(x.l))) o.l = Number(x.l);
      if (x.stockS != null && Number.isFinite(Number(x.stockS))) o.stockS = Number(x.stockS);
      if (x.stockM != null && Number.isFinite(Number(x.stockM))) o.stockM = Number(x.stockM);
      if (x.stockL != null && Number.isFinite(Number(x.stockL))) o.stockL = Number(x.stockL);
      o.returnGift = !!x.returnGift;
      o.delisted = !!x.delisted;
      if (vendorCatalogDb.catalogOptionsHasPayload(x.options)) {
        o.options = vendorCatalogDb.sanitizeOptionsForPublic(x.options);
      }
      overridesOut[key] = o;
    });
    out.overrides = overridesOut;
    vendorCatalogDb.listSuppressedProductIds(function (eSup, suppressed) {
      if (eSup) return failOnce(eSup.message || eSup);
      out.suppressedProductIds = suppressed || [];
      pending -= 1;
      finish();
    });
  });
}

function getStaticCatalog() {
  return catalogFromData.getResinData();
}

module.exports = {
  loadStorefrontBootstrap: loadStorefrontBootstrap,
  getStaticCatalog: getStaticCatalog,
  mergeCategoriesDbWithCatalog: mergeCategoriesDbWithCatalog,
};
