"use strict";

var path = require("path");

var REPO_ROOT = path.join(__dirname, "..");

/**
 * Filesystem root for vendor + catalog product photos (URL path still /media/catalog/...).
 * Set CATALOG_MEDIA_ROOT on hosts with ephemeral app disks (e.g. Render) to a persistent mount.
 */
function catalogMediaFsRoot() {
  var e = process.env.CATALOG_MEDIA_ROOT && String(process.env.CATALOG_MEDIA_ROOT).trim();
  return e ? path.resolve(e) : path.join(REPO_ROOT, "media", "catalog");
}

/**
 * Resolve repo-relative media paths to absolute paths for sharp/fs reads.
 * Paths under media/catalog/ use CATALOG_MEDIA_ROOT when set; other media/ paths stay under the repo.
 */
function absoluteMediaPath(rel) {
  if (!rel || typeof rel !== "string") return null;
  var n = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (n.indexOf("..") >= 0) return null;
  if (n.indexOf("media/") !== 0) return null;
  if (n.indexOf("media/catalog/") === 0) {
    var sub = n.slice("media/catalog/".length);
    return path.join(catalogMediaFsRoot(), sub);
  }
  return path.join(REPO_ROOT, n);
}

module.exports = {
  REPO_ROOT: REPO_ROOT,
  catalogMediaFsRoot: catalogMediaFsRoot,
  absoluteMediaPath: absoluteMediaPath,
};
