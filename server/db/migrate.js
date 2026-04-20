"use strict";

var fs = require("fs");
var path = require("path");
var bcrypt = require("bcryptjs");
var poolMod = require("./pool.js");
var catalogFromData = require("../catalog-from-data.js");
var rawMaterialsDb = require("../raw-materials-db.js");
var photoFramesDb = require("../photo-frames-db.js");
var schemaHotfix = require("./schema-hotfix.js");

/**
 * Apply schema.sql (idempotent) and ensure default vendor row.
 * @param {(err?: Error) => void} cb
 */
function migrate(cb) {
  var p = poolMod.getPool();
  if (!p) {
    return process.nextTick(function () {
      cb(new Error("DATABASE_URL is not set"));
    });
  }
  var sqlPath = path.join(__dirname, "schema.sql");
  var fullSql = fs.readFileSync(sqlPath, "utf8");
  p.query(fullSql)
    .then(function () {
      return bootstrapVendorUserPromise(p);
    })
    .then(function () {
      return bootstrapCategoriesPromise(p);
    })
    .then(function () {
      return schemaHotfix.ensureVendorInventoryColumns();
    })
    .then(function () {
      return rawMaterialsDb.seedDemoMaterialsPromise(p);
    })
    .then(function () {
      return photoFramesDb.seedDemoPhotoFramesPromise(p);
    })
    .then(function () {
      cb();
    })
    .catch(cb);
}

function bootstrapVendorUserPromise(p) {
  var user = process.env.VENDOR_PORTAL_USER || "nammu";
  var pass = process.env.VENDOR_PORTAL_PASSWORD || "nammu";
  var hash = bcrypt.hashSync(pass, 10);
  return p.query(
    "INSERT INTO vendor_users (username, password_hash) VALUES ($1, $2) " +
      "ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash",
    [user, hash]
  );
}

function bootstrapCategoriesPromise(p) {
  var cats;
  try {
    cats = catalogFromData.getCategoriesList();
  } catch (_) {
    return Promise.resolve();
  }
  if (!cats.length) return Promise.resolve();
  return Promise.all(
    cats.map(function (c) {
      if (!c.id) return Promise.resolve();
      return p.query(
        "INSERT INTO categories (id, label, folder, subcategories, vendor_owned, nav_image) VALUES ($1, $2, $3, $4::jsonb, false, '') " +
          "ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, folder = EXCLUDED.folder, " +
          "subcategories = EXCLUDED.subcategories, updated_at = now() " +
          "WHERE NOT COALESCE(categories.vendor_owned, false)",
        [c.id.slice(0, 80), String(c.label || c.id).slice(0, 200), String(c.folder || "").slice(0, 200), JSON.stringify(c.subcategories || [])]
      );
    })
  );
}

/** @param {(err?: Error) => void} cb */
function bootstrapVendorUser(cb) {
  var p = poolMod.getPool();
  if (!p) return process.nextTick(cb);
  bootstrapVendorUserPromise(p).then(function () {
    cb();
  }).catch(cb);
}

module.exports = { migrate, bootstrapVendorUser };
