"use strict";

/**
 * Resin storefront + vendor UI: categories removed from navigation/search but may
 * still exist in older Postgres rows.
 */
var HIDDEN_CATEGORY_IDS = { "craftguru-details": true };

function isHiddenResinCategoryId(catId) {
  var s = String(catId || "")
    .trim()
    .slice(0, 80);
  return !!HIDDEN_CATEGORY_IDS[s];
}

module.exports = {
  isHiddenResinCategoryId: isHiddenResinCategoryId,
};
