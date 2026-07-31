#!/usr/bin/env node
"use strict";

/**
 * Cron-friendly shipment sync (active AWBs only).
 * Example crontab every 30 minutes:
 *   0,30 * * * * cd /path/to/server && node scripts/sync-shipments.js >> /var/log/craftguru-shipment-sync.log 2>&1
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

var poolMod = require("../db/pool.js");
var schemaHotfix = require("../db/schema-hotfix.js");
var shipmentSync = require("../shipment/shipment-sync.js");

function done(code, msg) {
  if (msg) console.log(msg);
  process.exit(code);
}

if (!poolMod.isEnabled()) {
  done(1, "DATABASE_URL not configured — shipment sync requires Postgres.");
}

schemaHotfix
  .ensureVendorInventoryColumns()
  .then(function () {
    return new Promise(function (resolve, reject) {
      shipmentSync.runBackgroundSync(function (err, stats) {
        if (err) reject(err);
        else resolve(stats);
      });
    });
  })
  .then(function (stats) {
    done(0, "[sync-shipments] " + JSON.stringify(stats || {}));
  })
  .catch(function (err) {
    console.error("[sync-shipments]", err && err.message ? err.message : err);
    done(1);
  });
