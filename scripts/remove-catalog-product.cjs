/**
 * Remove one or more bundled catalog products from data.js (PRODUCTS, BY_ID, BY_CAT, BY_CAT_SUB).
 * Usage: node scripts/remove-catalog-product.cjs <product-id> [product-id...]
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ids = process.argv.slice(2).map(function (x) {
  return String(x || "").trim();
}).filter(Boolean);
if (!ids.length) {
  console.error("Usage: node scripts/remove-catalog-product.cjs <product-id> [...]");
  process.exit(1);
}

var drop = Object.create(null);
ids.forEach(function (id) {
  drop[id] = 1;
});

var p = path.join(__dirname, "..", "data.js");
var t = fs.readFileSync(p, "utf8");

var cStart = t.indexOf("var CATEGORIES = [");
var cEnd = t.indexOf("];\n\n  var SIZE_LABELS");
if (cEnd < 0) cEnd = t.indexOf("];\n\n  /** Product ids hidden");
if (cEnd < 0) cEnd = t.indexOf("];\n\n  var PRODUCTS");
var CATEGORIES = JSON.parse(t.slice(cStart + "var CATEGORIES = ".length, cEnd + 1));

var pStart = t.indexOf("var PRODUCTS = [");
var pEnd = t.indexOf("\n  var BY_ID = {};");
var PRODUCTS = JSON.parse(t.slice(pStart + "var PRODUCTS = ".length, pEnd).trim().replace(/;\s*$/, ""));

var before = PRODUCTS.length;
PRODUCTS = PRODUCTS.filter(function (pr) {
  return pr && !drop[pr.id];
});
var removed = before - PRODUCTS.length;

var BY_ID = {};
var BY_CAT = {};
var BY_CAT_SUB = {};
CATEGORIES.forEach(function (c) {
  if (!c || !c.id) return;
  BY_CAT[c.id] = [];
  BY_CAT_SUB[c.id] = {};
  (c.subcategories || []).forEach(function (s) {
    if (s && s.id) BY_CAT_SUB[c.id][s.id] = [];
  });
});
PRODUCTS.forEach(function (pr) {
  BY_ID[pr.id] = pr;
  if (!BY_CAT[pr.category]) BY_CAT[pr.category] = [];
  if (BY_CAT[pr.category].indexOf(pr.id) < 0) BY_CAT[pr.category].push(pr.id);
  if (!BY_CAT_SUB[pr.category]) BY_CAT_SUB[pr.category] = {};
  if (!BY_CAT_SUB[pr.category][pr.subcategory]) BY_CAT_SUB[pr.category][pr.subcategory] = [];
  if (BY_CAT_SUB[pr.category][pr.subcategory].indexOf(pr.id) < 0) {
    BY_CAT_SUB[pr.category][pr.subcategory].push(pr.id);
  }
});

var catLine = t.slice(0, cStart) + "var CATEGORIES = " + JSON.stringify(CATEGORIES) + ";\n";
var midStart = t.indexOf("  var SIZE_LABELS");
var afterStart = t.indexOf("  var SIZE_DEFAULT =");
if (midStart < 0 || afterStart < 0) throw new Error("data.js: SIZE_LABELS or SIZE_DEFAULT not found");

var mid = t.slice(midStart, pStart);
var prodLine = "  var PRODUCTS = " + JSON.stringify(PRODUCTS) + ";\n\n";
var byIdBlock = "  var BY_ID = {};\n  PRODUCTS.forEach(function (p) { BY_ID[p.id] = p; });\n\n";
var byCatLine = "  var BY_CAT = " + JSON.stringify(BY_CAT) + ";\n";
var subBlock =
  "  var BY_CAT_SUB = {};\n" +
  "  CATEGORIES.forEach(function (c) {\n" +
  "    BY_CAT_SUB[c.id] = {};\n" +
  "    (c.subcategories || []).forEach(function (s) {\n" +
  "      BY_CAT_SUB[c.id][s.id] = [];\n" +
  "    });\n" +
  "  });\n" +
  "  PRODUCTS.forEach(function (p) {\n" +
  "    if (!BY_CAT_SUB[p.category]) BY_CAT_SUB[p.category] = {};\n" +
  "    if (!BY_CAT_SUB[p.category][p.subcategory]) BY_CAT_SUB[p.category][p.subcategory] = [];\n" +
  "    BY_CAT_SUB[p.category][p.subcategory].push(p.id);\n" +
  "  });\n\n";

var out = catLine + "\n" + mid + prodLine + byIdBlock + byCatLine + "\n" + subBlock + t.slice(afterStart);
fs.writeFileSync(p, out, "utf8");
console.log("Removed", removed, "of", ids.length, "requested; products:", PRODUCTS.length);
