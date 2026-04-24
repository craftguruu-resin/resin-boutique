"use strict";

/**
 * Resin Guruji Products: exactly three subcategories (storefront merge, vendor UI, DB writes).
 */
var CANONICAL = [
  { id: "guruji-frames", label: "Guruji Frames" },
  { id: "guruji-fridge-magnets", label: "Guruji Fridge Magnets" },
  { id: "guruji-keychains", label: "Guruji Keychains" },
];

var ALLOWED = Object.create(null);
CANONICAL.forEach(function (s) {
  ALLOWED[s.id] = s.label;
});

function listCanonicalSubcategories() {
  return CANONICAL.map(function (s) {
    return { id: s.id, label: s.label };
  });
}

function isAllowedSubcategoryId(subId) {
  var s = String(subId || "")
    .trim()
    .slice(0, 80);
  return !!ALLOWED[s];
}

/**
 * @param {string} categoryId
 * @param {string} subId
 * @returns {string}
 */
function normalizeResinGurujiProductsSubcategoryId(categoryId, subId) {
  if (String(categoryId || "").trim() !== "resin-guruji-products") {
    return String(subId || "").trim() || "all";
  }
  var s = String(subId || "")
    .trim()
    .slice(0, 80);
  if (ALLOWED[s]) return s;
  var lower = s.toLowerCase();
  if (lower === "all" || !s) return "guruji-frames";
  if (lower.indexOf("fridge") >= 0 || lower.indexOf("magnet") >= 0 || lower.indexOf("megnet") >= 0) {
    return "guruji-fridge-magnets";
  }
  if (lower.indexOf("keychain") >= 0) return "guruji-keychains";
  if (lower.indexOf("frame") >= 0 || lower.indexOf("swaroop") >= 0) return "guruji-frames";
  return "guruji-frames";
}

/**
 * @param {Array<{ id?: string, label?: string, subcategories?: unknown }>|null|undefined} rows
 */
function enforceResinGurujiProductsSubcategoriesOnCategoryList(rows) {
  if (!rows || !rows.length) return rows;
  rows.forEach(function (row) {
    if (!row || String(row.id || "").trim() !== "resin-guruji-products") return;
    row.subcategories = listCanonicalSubcategories();
  });
  return rows;
}

module.exports = {
  CANONICAL: CANONICAL,
  listCanonicalSubcategories: listCanonicalSubcategories,
  isAllowedSubcategoryId: isAllowedSubcategoryId,
  normalizeResinGurujiProductsSubcategoryId: normalizeResinGurujiProductsSubcategoryId,
  enforceResinGurujiProductsSubcategoriesOnCategoryList: enforceResinGurujiProductsSubcategoriesOnCategoryList,
};
