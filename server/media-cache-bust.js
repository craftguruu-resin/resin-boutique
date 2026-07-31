"use strict";

/** Bust browser/CDN caches when the same media path or Cloudinary URL is reused after an upload. */
function appendMediaCacheBust(url, updatedAt) {
  var u = String(url == null ? "" : url).trim();
  if (!u) return u;
  if (/[?&]v=\d+/i.test(u)) return u;
  var t = 0;
  if (updatedAt) {
    t = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(String(updatedAt));
  }
  if (!Number.isFinite(t) || t <= 0) return u;
  return u + (u.indexOf("?") >= 0 ? "&" : "?") + "v=" + Math.floor(t / 1000);
}

/** Apply cache-bust query params to category nav + subcategory preview images. */
function bustCategoryImages(cat, updatedAt) {
  if (!cat || typeof cat !== "object") return cat;
  var out = Object.assign({}, cat);
  if (out.nav_image) {
    out.nav_image = appendMediaCacheBust(out.nav_image, updatedAt);
  }
  if (Array.isArray(out.subcategories)) {
    out.subcategories = out.subcategories.map(function (s) {
      if (!s || typeof s !== "object") return s;
      if (!s.image) return s;
      return Object.assign({}, s, { image: appendMediaCacheBust(s.image, updatedAt) });
    });
  }
  return out;
}

/** Apply cache-bust to RM/PF taxonomy category + subcategory image fields. */
function bustTaxonomyDocImages(doc, updatedAt) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.categories)) return doc;
  var out = Object.assign({}, doc);
  out.categories = doc.categories.map(function (c) {
    if (!c || typeof c !== "object") return c;
    var row = Object.assign({}, c);
    if (row.image) row.image = appendMediaCacheBust(row.image, updatedAt);
    if (row.nav_image) row.nav_image = appendMediaCacheBust(row.nav_image, updatedAt);
    if (Array.isArray(row.subcategories)) {
      row.subcategories = row.subcategories.map(function (s) {
        if (!s || typeof s !== "object") return s;
        if (!s.image) return s;
        return Object.assign({}, s, { image: appendMediaCacheBust(s.image, updatedAt) });
      });
    }
    return row;
  });
  return out;
}

module.exports = {
  appendMediaCacheBust: appendMediaCacheBust,
  bustCategoryImages: bustCategoryImages,
  bustTaxonomyDocImages: bustTaxonomyDocImages,
};
