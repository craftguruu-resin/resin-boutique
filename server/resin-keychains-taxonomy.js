"use strict";

/**
 * Resin keychains (resin-keychains): exactly four subcategories (storefront merge, vendor UI, DB writes).
 */
var CANONICAL = [
  { id: "alphabet-keychain", label: "Alphabet keychain" },
  { id: "shape-keychain", label: "Shape keychain" },
  { id: "photo-or-logo-keychain", label: "Photo or logo Keychain" },
  { id: "name-keychain", label: "Name keychain" },
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
function normalizeResinKeychainsSubcategoryId(categoryId, subId) {
  if (String(categoryId || "").trim() !== "resin-keychains") {
    return String(subId || "").trim() || "all";
  }
  var s = String(subId || "")
    .trim()
    .slice(0, 80);
  if (ALLOWED[s]) return s;
  var lower = s.toLowerCase();
  if (lower === "all" || !s) return "shape-keychain";
  if (lower.indexOf("photo") >= 0 || lower.indexOf("logo") >= 0) return "photo-or-logo-keychain";
  if (
    lower.indexOf("letter") >= 0 ||
    lower.indexOf("alphab") >= 0 ||
    lower.indexOf("alphabet") >= 0 ||
    /(^|[^a-z])(a|b|c|g|k|p|r|s|v) letter/.test(lower)
  ) {
    return "alphabet-keychain";
  }
  if (lower.indexOf("shape") >= 0 || lower.indexOf("heart") >= 0 || lower.indexOf("round") >= 0 || lower.indexOf("swastik") >= 0) {
    return "shape-keychain";
  }
  if (lower.indexOf("maa") >= 0 || lower.indexOf("name") >= 0) return "name-keychain";
  return "shape-keychain";
}

/**
 * @param {Array<{ id?: string, label?: string, subcategories?: unknown }>|null|undefined} rows
 */
function enforceResinKeychainsSubcategoriesOnCategoryList(rows) {
  if (!rows || !rows.length) return rows;
  rows.forEach(function (row) {
    if (!row || String(row.id || "").trim() !== "resin-keychains") return;
    row.subcategories = listCanonicalSubcategories();
  });
  return rows;
}

module.exports = {
  CANONICAL: CANONICAL,
  listCanonicalSubcategories: listCanonicalSubcategories,
  isAllowedSubcategoryId: isAllowedSubcategoryId,
  normalizeResinKeychainsSubcategoryId: normalizeResinKeychainsSubcategoryId,
  enforceResinKeychainsSubcategoriesOnCategoryList: enforceResinKeychainsSubcategoriesOnCategoryList,
};
