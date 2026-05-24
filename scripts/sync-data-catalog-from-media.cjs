/**
 * Regenerate static catalog slices in data.js from media/catalog (via tools/build_catalog.py).
 * Preserves runtime merge helpers (vendor products, suppressions, price overrides).
 *
 * Usage: node scripts/sync-data-catalog-from-media.cjs
 */
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var { execFileSync } = require("child_process");

var root = path.join(__dirname, "..");
var dataPath = path.join(root, "data.js");
var py = path.join(root, "tools", "build_catalog.py");
var tmpPath = path.join(os.tmpdir(), "craftguru-data-generated-" + process.pid + ".js");

var cur = fs.readFileSync(dataPath, "utf8");
if (!cur.includes("applyVendorProductsMerge")) {
  console.error("data.js missing merge helpers — restore from git before syncing.");
  process.exit(1);
}

execFileSync("python3", [py], { cwd: root, stdio: "inherit" });
var gen = fs.readFileSync(dataPath, "utf8");
fs.writeFileSync(tmpPath, gen);

function sliceBetween(src, startMark, endMark) {
  var a = src.indexOf(startMark);
  if (a < 0) throw new Error("Missing marker: " + startMark);
  var b = src.indexOf(endMark, a + startMark.length);
  if (b < 0) throw new Error("Missing marker after: " + startMark);
  return src.slice(a, b);
}

var catBlock = sliceBetween(gen, "var CATEGORIES =", "var SIZE_LABELS =");
var prodBlock = sliceBetween(gen, "var PRODUCTS =", "var SIZE_DEFAULT =");

var catStart = cur.indexOf("var CATEGORIES =");
var sizeLabelsStart = cur.indexOf("var SIZE_LABELS =");
var prodStart = cur.indexOf("var PRODUCTS =");
var sizeDefaultStart = cur.indexOf("var SIZE_DEFAULT =");
if (catStart < 0 || sizeLabelsStart < 0 || prodStart < 0 || sizeDefaultStart < 0) {
  throw new Error("data.js structure not recognized");
}

var out =
  cur.slice(0, catStart) +
  catBlock +
  "\n\n" +
  cur.slice(sizeLabelsStart, prodStart) +
  prodBlock +
  "\n\n" +
  cur.slice(sizeDefaultStart);

fs.writeFileSync(dataPath, out, "utf8");
try {
  fs.unlinkSync(tmpPath);
} catch (_) {}

var vm = require("vm");
var ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(dataPath, "utf8"), ctx);
var D = ctx.window.RESIN_DATA;
var missing = 0;
(D.allProducts || []).forEach(function (p) {
  var img = String(p.image || "");
  if (!img || img.indexOf("media/catalog/") !== 0) return;
  if (!fs.existsSync(path.join(root, img))) missing++;
});
console.log(
  "Synced data.js — categories:",
  (D.categories || []).length,
  "products:",
  (D.allProducts || []).length,
  "missing images:",
  missing
);
if (missing) process.exit(1);
