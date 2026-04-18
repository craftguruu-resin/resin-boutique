"use strict";

/**
 * One-time (or occasional) copy: default repo media/ trees → UPLOADED_MEDIA_ROOT.
 * Skips a destination file if it already exists (does not overwrite vendor uploads).
 *
 * Usage (from server/):
 *   export UPLOADED_MEDIA_ROOT=/var/data/craftguru-media   # or set in .env
 *   npm run media:copy-to-disk
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
var fs = require("fs");
var path = require("path");
var mediaPath = require("../media-path.js");

var REPO_ROOT = mediaPath.REPO_ROOT;
var destBase = mediaPath.uploadedMediaBase();

function copyTreeSkipExisting(relFromRepo, destSub) {
  var src = path.join(REPO_ROOT, relFromRepo);
  var dst = path.join(destBase, destSub);
  if (!fs.existsSync(src)) {
    console.log("[skip] no source:", src);
    return { copied: 0, skipped: 0 };
  }
  var stats = { copied: 0, skipped: 0 };
  function walk(s, d) {
    fs.mkdirSync(d, { recursive: true });
    var entries = fs.readdirSync(s, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var ent = entries[i];
      var sp = path.join(s, ent.name);
      var dp = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(sp, dp);
        continue;
      }
      if (fs.existsSync(dp)) {
        stats.skipped++;
        continue;
      }
      fs.copyFileSync(sp, dp);
      stats.copied++;
    }
  }
  walk(src, dst);
  return stats;
}

if (!destBase) {
  console.error("Set UPLOADED_MEDIA_ROOT in server/.env (or environment), then run again.");
  process.exit(1);
}

fs.mkdirSync(destBase, { recursive: true });
console.log("Destination base:", destBase);

var c = copyTreeSkipExisting(path.join("media", "catalog"), "catalog");
console.log("catalog: copied", c.copied, "skipped (already there)", c.skipped);

var h = copyTreeSkipExisting(path.join("media", "hero"), "hero");
console.log("hero: copied", h.copied, "skipped", h.skipped);

var r = copyTreeSkipExisting(path.join("media", "raw-materials"), "raw-materials");
console.log("raw-materials: copied", r.copied, "skipped", r.skipped);

console.log("Done.");
