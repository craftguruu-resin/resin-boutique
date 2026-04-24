"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var cache = null;

function getResinData() {
  if (cache) return cache;
  var file = path.join(__dirname, "..", "data.js");
  var code = fs.readFileSync(file, "utf8");
  var ctx = vm.createContext({});
  vm.runInContext(code, ctx, { timeout: 120000 });
  cache = ctx.RESIN_DATA;
  if (!cache || !Array.isArray(cache.allProducts)) {
    throw new Error("Catalog load failed: RESIN_DATA.allProducts missing");
  }
  return cache;
}

/** @returns {{ id: string, name: string, category: string, subcategory: string, image: string, prices: { s: number, m: number, l: number }, sizeLabels?: object }[]} */
function getProductsSummary() {
  return getResinData().allProducts.map(function (p) {
    var row = {
      id: p.id,
      name: p.name,
      category: p.category,
      subcategory: p.subcategory,
      image: p.image || "",
      prices: {
        s: Number(p.prices && p.prices.s) || 0,
        m: Number(p.prices && p.prices.m) || 0,
        l: Number(p.prices && p.prices.l) || 0,
      },
    };
    var sl = p.sizeLabels;
    if (sl && typeof sl === "object" && (sl.s || sl.m || sl.l)) {
      row.sizeLabels = sl;
    }
    var g = p.gallery;
    if (Array.isArray(g) && g.length) {
      row.gallery = g
        .map(function (x) {
          return String(x || "").trim();
        })
        .filter(Boolean)
        .slice(0, 24);
    }
    return row;
  });
}

function invalidateCache() {
  cache = null;
}

/** @returns {{ id: string, label: string, folder: string, subcategories: object[] }[]} */
function getCategoriesList() {
  var cats = getResinData().categories;
  if (!Array.isArray(cats)) return [];
  return cats.map(function (c) {
    return {
      id: String(c.id || ""),
      label: String(c.label || c.id || ""),
      folder: String((c.folder != null && c.folder) || ""),
      subcategories: Array.isArray(c.subcategories) ? c.subcategories : [],
    };
  });
}

module.exports = {
  getResinData: getResinData,
  getProductsSummary: getProductsSummary,
  getCategoriesList: getCategoriesList,
  invalidateCache: invalidateCache,
};
