"use strict";

/**
 * Resin Clocks: exactly five subcategories everywhere (storefront merge, vendor UI, DB writes).
 */
var CANONICAL = [
  { id: "standard-resin-clock", label: "Standard Resin Clock" },
  { id: "photo-custom-clock", label: "Photo Custom Clock" },
  { id: "ocean-clock", label: "Ocean Clock" },
  { id: "geode-clock", label: "Geode Clock" },
  { id: "wood-resin-clock", label: "Wood Resin Clock" },
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
function normalizeResinClocksSubcategoryId(categoryId, subId) {
  if (String(categoryId || "").trim() !== "resin-clocks") {
    return String(subId || "").trim() || "all";
  }
  var s = String(subId || "")
    .trim()
    .slice(0, 80);
  if (ALLOWED[s]) return s;
  var lower = s.toLowerCase();
  if (lower === "all" || !s) return "standard-resin-clock";
  if (lower.indexOf("geode") >= 0) return "geode-clock";
  if (lower.indexOf("ocean") >= 0 || lower.indexOf("ocian") >= 0) return "ocean-clock";
  if (lower.indexOf("photo") >= 0 || lower.indexOf("custom") >= 0 || lower.indexOf("baby") >= 0 || lower.indexOf("12-month") >= 0) {
    return "photo-custom-clock";
  }
  if (lower.indexOf("wood") >= 0 || lower.indexOf("sea-shell") >= 0 || lower.indexOf("shell") >= 0) return "wood-resin-clock";
  if (lower.indexOf("brand") >= 0) return "standard-resin-clock";
  return "standard-resin-clock";
}

/**
 * @param {Array<{ id?: string, label?: string, subcategories?: unknown }>|null|undefined} rows
 */
function enforceResinClocksSubcategoriesOnCategoryList(rows) {
  if (!rows || !rows.length) return rows;
  rows.forEach(function (row) {
    if (!row || String(row.id || "").trim() !== "resin-clocks") return;
    row.subcategories = listCanonicalSubcategories();
  });
  return rows;
}

module.exports = {
  CANONICAL: CANONICAL,
  listCanonicalSubcategories: listCanonicalSubcategories,
  isAllowedSubcategoryId: isAllowedSubcategoryId,
  normalizeResinClocksSubcategoryId: normalizeResinClocksSubcategoryId,
  enforceResinClocksSubcategoriesOnCategoryList: enforceResinClocksSubcategoriesOnCategoryList,
};
