"use strict";

require("dotenv").config();
var path = require("path");
var poolMod = require("../db/pool.js");
var vendorCatalogDb = require("../vendor-catalog-db.js");

if (!poolMod.isEnabled()) {
  console.error("Set DATABASE_URL in server/.env first.");
  process.exit(1);
}

var dataMod = require(path.join(__dirname, "../../data.js"));
var RD = dataMod.RESIN_DATA;
if (!RD || !Array.isArray(RD.allProducts)) {
  console.error("Could not read RESIN_DATA from data.js");
  process.exit(1);
}

var pool = poolMod.getPool();

function run() {
  // Permanent deletions are stored as durable tombstones in Postgres. Never let a deploy,
  // git pull, or a manual catalog re-seed recreate a product that was explicitly deleted
  // from the Vendor Products panel.
  return new Promise(function (resolve, reject) {
    vendorCatalogDb.listSuppressedProductIds(function (err, ids) {
      if (err) return reject(err);
      resolve(
        Object.create(null, (ids || []).reduce(function (out, id) {
          out[String(id)] = { value: true, enumerable: true };
          return out;
        }, {}))
      );
    });
  })
    .then(function (suppressed) {
      return pool
        .connect()
        .then(function (client) {
          return client
            .query("BEGIN")
            .then(function () {
              return { client: client, suppressed: suppressed };
            });
        });
    })
    .then(function (state) {
      var client = state.client;
      var suppressed = state.suppressed;
      var q = Promise.resolve();

      (RD.categories || []).forEach(function (c) {
        q = q.then(function () {
          return client.query(
            "INSERT INTO categories (id, label, folder, subcategories) VALUES ($1, $2, $3, $4::jsonb) " +
              "ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, folder = EXCLUDED.folder, " +
              "subcategories = EXCLUDED.subcategories, updated_at = now()",
            [String(c.id), String(c.label || c.id), String(c.folder || ""), JSON.stringify(c.subcategories || [])]
          );
        });
      });

      return q
        .then(function () {
          var q2 = Promise.resolve();
          RD.allProducts.forEach(function (p) {
            var pid = String(p.id || "");
            if (!pid || suppressed[pid]) return;
            q2 = q2.then(function () {
              return client.query(
                "INSERT INTO products (id, name, category_id, subcategory_id, image_path, prices) " +
                  "VALUES ($1, $2, $3, $4, $5, $6::jsonb) " +
                  "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category_id = EXCLUDED.category_id, " +
                  "subcategory_id = EXCLUDED.subcategory_id, image_path = EXCLUDED.image_path, " +
                  "prices = EXCLUDED.prices, updated_at = now()",
                [
                  pid,
                  String(p.name || "").slice(0, 500),
                  String(p.category || ""),
                  String(p.subcategory || "all"),
                  String(p.image || ""),
                  JSON.stringify(p.prices || {}),
                ]
              );
            });
          });
          return q2;
        })
        .then(function () {
          return client.query("COMMIT");
        })
        .then(function () {
          client.release();
        })
        .catch(function (err) {
          return client
            .query("ROLLBACK")
            .catch(function () {})
            .then(function () {
              client.release();
              throw err;
            });
        });
    })
    .then(function () {
      console.log("Seeded categories + products:", (RD.categories || []).length, RD.allProducts.length);
    });
}

run()
  .then(function () {
    process.exit(0);
  })
  .catch(function (e) {
    console.error(e);
    process.exit(1);
  });
