"use strict";

/**
 * One-off cleanup: remove four test name-plate vendor products by id.
 * Run from server/: node scripts/delete-four-test-nameplates.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
var poolMod = require("../db/pool.js");

var IDS = [
  "resin-name-plates--all--new-test-name-plate-nammu-79f4eddc",
  "resin-name-plates--all--resin-test-devesh-e2acdf36",
  "resin-name-plates--all--resin-name-plate-test-6bb06b77",
  "resin-name-plates--all--test-name-plate-ce45b7ed",
];

var pool = poolMod.getPool();
if (!pool) {
  console.error("DATABASE_URL not set; skipping delete.");
  process.exit(1);
}

pool
  .connect()
  .then(function (client) {
    return client.query("BEGIN").then(function () {
      return IDS.reduce(function (chain, id) {
        return chain.then(function () {
          return client.query("DELETE FROM catalog_price_overrides WHERE product_id = $1", [id]);
        }).then(function () {
          return client.query("UPDATE vendor_inventory_items SET product_id = '' WHERE product_id = $1", [id]);
        }).then(function () {
          return client.query("DELETE FROM products WHERE id = $1", [id]);
        });
      }, Promise.resolve());
    }).then(function () {
      return client.query("COMMIT");
    }).then(function () {
      client.release();
      console.log("Deleted (or no row) for ids:", IDS.join(", "));
      process.exit(0);
    }).catch(function (err) {
      return client
        .query("ROLLBACK")
        .catch(function () {})
        .then(function () {
          client.release();
          console.error(err);
          process.exit(1);
        });
    });
  })
  .catch(function (e) {
    console.error(e);
    process.exit(1);
  });
