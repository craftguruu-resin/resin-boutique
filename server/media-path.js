"use strict";

var path = require("path");

var REPO_ROOT = path.join(__dirname, "..");

function envResolved(name) {
  var v = process.env[name] && String(process.env[name]).trim();
  return v ? path.resolve(v) : "";
}

/** When set, catalog/hero/raw-materials uploads all live under this tree (see subdirs below). */
function uploadedMediaBase() {
  return envResolved("UPLOADED_MEDIA_ROOT");
}

/**
 * Vendor + catalog product photos. URL path remains /media/catalog/...
 * Priority: CATALOG_MEDIA_ROOT, else UPLOADED_MEDIA_ROOT/catalog, else default folder under the repo.
 */
function catalogMediaFsRoot() {
  var only = envResolved("CATALOG_MEDIA_ROOT");
  if (only) return only;
  var base = uploadedMediaBase();
  if (base) return path.join(base, "catalog");
  return path.join(REPO_ROOT, "media", "catalog");
}

/** Homepage hero JPEGs: /media/hero/... Priority: HERO_MEDIA_ROOT → UPLOADED_MEDIA_ROOT/hero → repo. */
function heroMediaFsRoot() {
  var only = envResolved("HERO_MEDIA_ROOT");
  if (only) return only;
  var base = uploadedMediaBase();
  if (base) return path.join(base, "hero");
  return path.join(REPO_ROOT, "media", "hero");
}

/** Raw materials images: /media/raw-materials/... */
function rawMaterialsMediaFsRoot() {
  var only = envResolved("RAW_MATERIALS_MEDIA_ROOT");
  if (only) return only;
  var base = uploadedMediaBase();
  if (base) return path.join(base, "raw-materials");
  return path.join(REPO_ROOT, "media", "raw-materials");
}

/** Vendor-managed photo frame product images: /media/photo-frame-products/... */
function photoFrameProductsMediaFsRoot() {
  var only = envResolved("PHOTO_FRAME_PRODUCTS_MEDIA_ROOT");
  if (only) return only;
  var base = uploadedMediaBase();
  if (base) return path.join(base, "photo-frame-products");
  return path.join(REPO_ROOT, "media", "photo-frame-products");
}

/**
 * Resolve repo-relative media paths to absolute paths for sharp/fs reads.
 * Catalog, hero, and raw-materials honor UPLOADED_MEDIA_ROOT / per-type *_ROOT env vars.
 */
function absoluteMediaPath(rel) {
  if (!rel || typeof rel !== "string") return null;
  var n = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (n.indexOf("..") >= 0) return null;
  if (n.indexOf("media/") !== 0) return null;
  if (n.indexOf("media/catalog/") === 0) {
    var csub = n.slice("media/catalog/".length);
    return path.join(catalogMediaFsRoot(), csub);
  }
  if (n.indexOf("media/hero/") === 0) {
    var hsub = n.slice("media/hero/".length);
    return path.join(heroMediaFsRoot(), hsub);
  }
  if (n.indexOf("media/raw-materials/") === 0) {
    var rsub = n.slice("media/raw-materials/".length);
    return path.join(rawMaterialsMediaFsRoot(), rsub);
  }
  if (n.indexOf("media/photo-frame-products/") === 0) {
    var pfsub = n.slice("media/photo-frame-products/".length);
    return path.join(photoFrameProductsMediaFsRoot(), pfsub);
  }
  return path.join(REPO_ROOT, n);
}

/** True if any upload root is outside the repo (production persistence). */
function hasExternalUploadRoot() {
  return !!(
    envResolved("CATALOG_MEDIA_ROOT") ||
    envResolved("UPLOADED_MEDIA_ROOT") ||
    envResolved("HERO_MEDIA_ROOT") ||
    envResolved("RAW_MATERIALS_MEDIA_ROOT") ||
    envResolved("PHOTO_FRAME_PRODUCTS_MEDIA_ROOT")
  );
}

module.exports = {
  REPO_ROOT: REPO_ROOT,
  uploadedMediaBase: uploadedMediaBase,
  catalogMediaFsRoot: catalogMediaFsRoot,
  heroMediaFsRoot: heroMediaFsRoot,
  rawMaterialsMediaFsRoot: rawMaterialsMediaFsRoot,
  photoFrameProductsMediaFsRoot: photoFrameProductsMediaFsRoot,
  absoluteMediaPath: absoluteMediaPath,
  hasExternalUploadRoot: hasExternalUploadRoot,
};
