"use strict";

var catalogFromData = require("./catalog-from-data.js");
var hiddenResinCatalog = require("./hidden-resin-catalog.js");
var resinClocksTaxonomy = require("./resin-clocks-taxonomy.js");
var resinGurujiProductsTaxonomy = require("./resin-guruji-products-taxonomy.js");
var resinKeychainsTaxonomy = require("./resin-keychains-taxonomy.js");

function staticCategoryIdSet() {
  var set = Object.create(null);
  try {
    (catalogFromData.getCategoriesList() || []).forEach(function (c) {
      if (c && c.id) set[String(c.id).trim().slice(0, 80)] = 1;
    });
  } catch (_) {}
  return set;
}

function slugifyId(s) {
  var t = String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return t || "vendor-category";
}

function normalizeSubcategoriesJson(subs) {
  if (typeof subs === "string") {
    try {
      subs = JSON.parse(subs);
    } catch (_) {
      subs = [];
    }
  }
  if (!Array.isArray(subs)) subs = [];
  var out = [];
  var seen = Object.create(null);
  subs.forEach(function (x) {
    var id = "";
    var label = "";
    var image = "";
    if (x == null) return;
    if (typeof x === "string") {
      id = String(x).trim().slice(0, 80);
      label = id;
    } else if (typeof x === "object") {
      id =
        String(
          (x.id != null && x.id) ||
            (x.subcategory_id != null && x.subcategory_id) ||
            (x.slug != null && x.slug) ||
            ""
        ).trim().slice(0, 80);
      label = String((x.label != null && x.label) || (x.name != null && x.name) || id || "")
        .trim()
        .slice(0, 200);
      image = String((x.image != null && x.image) || (x.photo != null && x.photo) || "")
        .trim()
        .slice(0, 500);
    }
    if (!id) return;
    if (seen[id]) return;
    seen[id] = 1;
    var o = { id: id, label: label || id };
    if (image) o.image = image;
    out.push(o);
  });
  if (!out.some(function (s) {
    return s.id === "all";
  })) {
    out.unshift({ id: "all", label: "All" });
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ id?: string, label: string, folder?: string, navImage?: string, subcategories?: unknown }} body
 * @param {(err?: Error, row?: object) => void} cb
 */
function createCategory(pool, body, cb) {
  var label = String((body && body.label) || "").trim().slice(0, 200);
  if (!label) {
    return process.nextTick(function () {
      cb(new Error("label is required"));
    });
  }
  var staticSet = staticCategoryIdSet();
  var idRaw = String((body && body.id) || "").trim();
  var id = idRaw ? slugifyId(idRaw) : slugifyId(label);
  if (!id || id.length < 2) {
    return process.nextTick(function () {
      cb(new Error("Invalid category id"));
    });
  }
  if (hiddenResinCatalog.isHiddenResinCategoryId(id)) {
    return process.nextTick(function () {
      cb(new Error("This category id is reserved and cannot be used"));
    });
  }
  if (staticSet[id]) {
    return process.nextTick(function () {
      cb(new Error("That id is reserved for the built-in catalog; pick another slug"));
    });
  }
  var folder = String((body && body.folder) || label).trim().slice(0, 200);
  var navImage = String((body && body.navImage) || (body && body.nav_image) || "")
    .trim()
    .slice(0, 500);
  var subs = normalizeSubcategoriesJson(body && body.subcategories);
  pool.query(
    "INSERT INTO categories (id, label, folder, subcategories, vendor_owned, nav_image) VALUES ($1, $2, $3, $4::jsonb, true, $5) RETURNING id, label, folder, subcategories, vendor_owned, nav_image",
    [id.slice(0, 80), label, folder, JSON.stringify(subs), navImage]
  )
    .then(function (r) {
      catalogFromData.invalidateCache();
      cb(null, r.rows[0]);
    })
    .catch(function (e) {
      if (e && e.code === "23505") {
        return cb(new Error("Category id already exists"));
      }
      cb(e || new Error("create failed"));
    });
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} catId
 * @param {{ label?: string, folder?: string, navImage?: string, nav_image?: string, subcategories?: unknown }} body
 * @param {(err?: Error, row?: object) => void} cb
 */
function updateCategory(pool, catId, body, cb) {
  catId = String(catId || "").trim().slice(0, 80);
  if (!catId) {
    return process.nextTick(function () {
      cb(new Error("Invalid category id"));
    });
  }
  pool
    .query("SELECT id, label, folder, subcategories, vendor_owned, nav_image FROM categories WHERE id = $1 LIMIT 1", [catId])
    .then(function (r) {
      if (!r.rows.length) {
        var err = new Error("Category not found");
        return cb(err);
      }
      var row = r.rows[0];
      var label = body.label != null ? String(body.label).trim().slice(0, 200) : String(row.label || "");
      var folder = body.folder != null ? String(body.folder).trim().slice(0, 200) : String(row.folder || "");
      var navIn = body.navImage != null ? body.navImage : body.nav_image;
      var navImage =
        navIn != null ? String(navIn).trim().slice(0, 500) : String(row.nav_image != null ? row.nav_image : "").trim();
      var subs =
        body.subcategories != null
          ? normalizeSubcategoriesJson(body.subcategories)
          : normalizeSubcategoriesJson(row.subcategories);
      if (catId === "resin-clocks") {
        subs = resinClocksTaxonomy.listCanonicalSubcategories();
      }
      if (catId === "resin-guruji-products") {
        subs = resinGurujiProductsTaxonomy.listCanonicalSubcategories();
      }
      if (catId === "resin-keychains") {
        subs = resinKeychainsTaxonomy.listCanonicalSubcategories();
      }
      return pool
        .query(
          "UPDATE categories SET label = $2, folder = $3, subcategories = $4::jsonb, nav_image = $5, updated_at = now() WHERE id = $1 RETURNING id, label, folder, subcategories, vendor_owned, nav_image",
          [catId, label || catId, folder, JSON.stringify(subs), navImage]
        )
        .then(function (r2) {
          catalogFromData.invalidateCache();
          cb(null, r2.rows[0]);
        });
    })
    .catch(cb);
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} catId
 * @param {string} subId
 * @param {(err?: Error) => void} cb
 */
function deleteSubcategory(pool, catId, subId, cb) {
  catId = String(catId || "").trim().slice(0, 80);
  subId = String(subId || "").trim().slice(0, 80);
  if (!catId || !subId || subId === "all") {
    return process.nextTick(function () {
      cb(new Error("Invalid category or subcategory"));
    });
  }
  if (catId === "resin-clocks" && resinClocksTaxonomy.isAllowedSubcategoryId(subId)) {
    return process.nextTick(function () {
      cb(new Error("Resin Clocks only allows the five built-in lines; this subcategory cannot be removed"));
    });
  }
  if (catId === "resin-guruji-products" && resinGurujiProductsTaxonomy.isAllowedSubcategoryId(subId)) {
    return process.nextTick(function () {
      cb(new Error("Resin Guruji Products only allows the three built-in lines; this subcategory cannot be removed"));
    });
  }
  if (catId === "resin-keychains" && resinKeychainsTaxonomy.isAllowedSubcategoryId(subId)) {
    return process.nextTick(function () {
      cb(new Error("Resin keychains only allows the four built-in lines; this subcategory cannot be removed"));
    });
  }
  pool
    .query("SELECT subcategories FROM categories WHERE id = $1 LIMIT 1", [catId])
    .then(function (r) {
      if (!r.rows.length) return cb(new Error("Category not found"));
      var subs = normalizeSubcategoriesJson(r.rows[0].subcategories);
      var next = subs.filter(function (s) {
        return s.id !== subId;
      });
      if (next.length === subs.length) return cb(new Error("Subcategory not found"));
      if (!next.some(function (s) {
        return s.id === "all";
      })) {
        if (catId !== "resin-clocks" && catId !== "resin-guruji-products" && catId !== "resin-keychains") {
          next.unshift({ id: "all", label: "All" });
        }
      }
      return pool
        .query(
          "UPDATE categories SET subcategories = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING id",
          [catId, JSON.stringify(next)]
        )
        .then(function () {
          var fallbackSub =
            catId === "resin-guruji-products" ? "guruji-frames" : catId === "resin-keychains" ? "shape-keychain" : "all";
          return pool.query(
            "UPDATE products SET subcategory_id = $3, updated_at = now() WHERE category_id = $1 AND subcategory_id = $2",
            [catId, subId, fallbackSub]
          );
        })
        .then(function () {
          catalogFromData.invalidateCache();
          cb();
        });
    })
    .catch(cb);
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} catId
 * @param {(err?: Error) => void} cb
 */
function deleteVendorOwnedCategory(pool, catId, cb) {
  catId = String(catId || "").trim().slice(0, 80);
  if (!catId) {
    return process.nextTick(function () {
      cb(new Error("Invalid category id"));
    });
  }
  var client;
  pool
    .connect()
    .then(function (c) {
      client = c;
      return client.query("BEGIN");
    })
    .then(function () {
      return client.query("SELECT vendor_owned FROM categories WHERE id = $1 FOR UPDATE", [catId]);
    })
    .then(function (r) {
      if (!r.rows.length) {
        throw Object.assign(new Error("Category not found"), { code: "NOT_FOUND" });
      }
      if (!r.rows[0].vendor_owned) {
        throw Object.assign(new Error("Cannot delete built-in catalog category"), { code: "FORBIDDEN" });
      }
      return client.query(
        "DELETE FROM catalog_price_overrides WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)",
        [catId]
      );
    })
    .then(function () {
      return client.query(
        "UPDATE vendor_inventory_items SET product_id = '', category_id = '' WHERE category_id = $1 OR product_id IN (SELECT id FROM products WHERE category_id = $1)",
        [catId]
      );
    })
    .then(function () {
      return client.query("DELETE FROM products WHERE category_id = $1", [catId]);
    })
    .then(function () {
      return client.query("DELETE FROM categories WHERE id = $1 AND vendor_owned = true", [catId]);
    })
    .then(function () {
      return client.query("COMMIT");
    })
    .then(function () {
      if (client) client.release();
      catalogFromData.invalidateCache();
      cb();
    })
    .catch(function (e) {
      var err = e;
      if (client) {
        return client
          .query("ROLLBACK")
          .catch(function () {})
          .then(function () {
            client.release();
            cb(err);
          });
      }
      cb(err);
    });
}

module.exports = {
  staticCategoryIdSet: staticCategoryIdSet,
  slugifyId: slugifyId,
  createCategory: createCategory,
  updateCategory: updateCategory,
  deleteSubcategory: deleteSubcategory,
  deleteVendorOwnedCategory: deleteVendorOwnedCategory,
};
