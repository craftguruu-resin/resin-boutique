"use strict";

require("dotenv").config();
var path = require("path");
var poolMod = require("../db/pool.js");

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
  return pool
    .connect()
    .then(function (client) {
      return client
        .query("BEGIN")
        .then(function () {
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
          return q.then(function () {
            var q2 = Promise.resolve();
            RD.allProducts.forEach(function (p) {
              q2 = q2.then(function () {
                return client.query(
                  "INSERT INTO products (id, name, category_id, subcategory_id, image_path, prices) " +
                    "VALUES ($1, $2, $3, $4, $5, $6::jsonb) " +
                    "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category_id = EXCLUDED.category_id, " +
                    "subcategory_id = EXCLUDED.subcategory_id, image_path = EXCLUDED.image_path, " +
                    "prices = EXCLUDED.prices, updated_at = now()",
                  [
                    String(p.id),
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
          });
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
