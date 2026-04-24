/**
 * One-off: update data.js CATEGORIES + PRODUCTS for resin taxonomy + remove craftguru-details.
 * Run: node scripts/apply-resin-taxonomy.cjs
 */
"use strict";

var fs = require("fs");
var path = require("path");
var p = path.join(__dirname, "..", "data.js");
var t = fs.readFileSync(p, "utf8");

var cStart = t.indexOf("var CATEGORIES = [");
var cEnd = t.indexOf("];\n\n  var SIZE_LABELS");
var CATEGORIES = JSON.parse(t.slice(cStart + "var CATEGORIES = ".length, cEnd + 1));

var pStart = t.indexOf("var PRODUCTS = [");
var pEnd = t.indexOf("\n  var BY_ID = {};");
var PRODUCTS = JSON.parse(t.slice(pStart + "var PRODUCTS = ".length, pEnd).trim().replace(/;\s*$/, ""));

CATEGORIES = CATEGORIES.filter(function (c) {
  return c && c.id !== "craftguru-details";
});

var vermala = {
  id: "vermala-preservation",
  label: "Vermala Preservation",
  folder: "Vermala Preservation",
  subcategories: [{ id: "all", label: "All" }],
};
if (!CATEGORIES.some(function (c) { return c.id === "vermala-preservation"; })) {
  CATEGORIES.push(vermala);
}

function setSubs(catId, subs) {
  var c = CATEGORIES.find(function (x) { return x.id === catId; });
  if (c) {
    c.subcategories = subs;
  }
}

setSubs("resin-clocks", [
  { id: "standard-resin-clock", label: "Standard Resin Clock" },
  { id: "photo-custom-clock", label: "Photo Custom Clock" },
  { id: "ocean-clock", label: "Ocean Clock" },
  { id: "geode-clock", label: "Geode Clock" },
  { id: "wood-resin-clock", label: "Wood Resin Clock" },
]);

setSubs("resin-guruji-products", [
  { id: "guruji-frames", label: "Guruji Frames" },
  { id: "guruji-fridge-magnets", label: "Guruji Fridge Magnets" },
  { id: "guruji-keychains", label: "Guruji Keychains" },
]);

setSubs("resin-keychains", [
  { id: "alphabet-keychain", label: "Alphabet keychain" },
  { id: "shape-keychain", label: "Shape keychain" },
  { id: "photo-or-logo-keychain", label: "Photo or logo Keychain" },
  { id: "name-keychain", label: "Name keychain" },
]);

function clockSub(name) {
  var n = String(name || "").toLowerCase();
  if (n.indexOf("geode") >= 0) return "geode-clock";
  if (n.indexOf("ocean") >= 0 || n.indexOf("ocian") >= 0 || n.indexOf("océan") >= 0) return "ocean-clock";
  if (n.indexOf("baby") >= 0 || n.indexOf("12 month") >= 0) return "photo-custom-clock";
  if (n.indexOf("wood") >= 0 || n.indexOf("sea shell") >= 0) return "wood-resin-clock";
  return "standard-resin-clock";
}

var CLOCK_ALLOWED = {
  "standard-resin-clock": 1,
  "photo-custom-clock": 1,
  "ocean-clock": 1,
  "geode-clock": 1,
  "wood-resin-clock": 1,
};

function normalizeResinClockSub(sub, name) {
  var s = String(sub || "").trim();
  if (CLOCK_ALLOWED[s]) return s;
  return clockSub(name);
}

function gurujiSub(name) {
  var n = String(name || "").toLowerCase();
  if (n.indexOf("fridge") >= 0 || n.indexOf("megnet") >= 0 || n.indexOf("magnet") >= 0) return "guruji-fridge-magnets";
  if (n.indexOf("keychain") >= 0) return "guruji-keychains";
  return "guruji-frames";
}

var GURUJI_ALLOWED = {
  "guruji-frames": 1,
  "guruji-fridge-magnets": 1,
  "guruji-keychains": 1,
};

function normalizeGurujiSub(sub, name) {
  var s = String(sub || "").trim();
  if (GURUJI_ALLOWED[s]) return s;
  return gurujiSub(name);
}

var KEYCHAIN_ALLOWED = {
  "alphabet-keychain": 1,
  "shape-keychain": 1,
  "photo-or-logo-keychain": 1,
  "name-keychain": 1,
};

function keychainSub(name) {
  var n = String(name || "").toLowerCase();
  if (n.indexOf("photo") >= 0 || n.indexOf("logo") >= 0) return "photo-or-logo-keychain";
  if (
    n.indexOf("letter") >= 0 ||
    n.indexOf("alphab") >= 0 ||
    n.indexOf("alphabet") >= 0 ||
    /(^|[^a-z])(a|b|c|g|k|p|r|s|v) letter/.test(n)
  ) {
    return "alphabet-keychain";
  }
  if (n.indexOf("shape") >= 0 || n.indexOf("heart") >= 0 || n.indexOf("round") >= 0 || n.indexOf("swastik") >= 0) {
    return "shape-keychain";
  }
  if (n.indexOf("maa") >= 0 || n.indexOf("name") >= 0) return "name-keychain";
  return "shape-keychain";
}

PRODUCTS = PRODUCTS.filter(function (pr) {
  return pr.category !== "craftguru-details";
});

PRODUCTS.forEach(function (pr) {
  if (pr.id && pr.id.indexOf("vermala-preservation") >= 0 && pr.category === "resin-customised-frames") {
    pr.category = "vermala-preservation";
    pr.subcategory = "all";
  }
  if (pr.category === "resin-clocks") {
    pr.subcategory = normalizeResinClockSub(pr.subcategory, pr.name);
  }
  if (pr.category === "resin-guruji-products") {
    pr.subcategory = normalizeGurujiSub(pr.subcategory, pr.name);
  }
  if (pr.category === "resin-keychains") {
    var ks = String(pr.subcategory || "").trim();
    pr.subcategory = KEYCHAIN_ALLOWED[ks] ? ks : keychainSub(pr.name);
  }
});

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

var catLine = "  var CATEGORIES = " + JSON.stringify(CATEGORIES) + ";\n";
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
  "  });\n";

var before = t.slice(0, cStart);
var afterStart = t.indexOf("  var SIZE_DEFAULT =");
if (afterStart < 0) throw new Error("SIZE_DEFAULT not found");
var after = t.slice(afterStart);

var out = before + catLine + "\n" + prodLine + byIdBlock + byCatLine + subBlock + "\n" + after;
fs.writeFileSync(p, out, "utf8");
console.log("Wrote", p, "products:", PRODUCTS.length, "categories:", CATEGORIES.length);
