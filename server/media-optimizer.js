"use strict";

/**
 * On-the-fly image resize + WebP for /media/* when ?w= or ?f=webp is present.
 * Keeps originals on disk; caches transformed output in memory for warm instances.
 */

var fs = require("fs");
var path = require("path");
var sharp = require("sharp");

var IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|tiff?)$/i;
var MAX_CACHE = 180;
var cache = new Map();

function cacheGet(key) {
  var hit = cache.get(key);
  if (!hit) return null;
  hit.at = Date.now();
  return hit;
}

function cacheSet(key, entry) {
  if (cache.size >= MAX_CACHE) {
    var oldestKey = null;
    var oldestAt = Infinity;
    cache.forEach(function (v, k) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    });
    if (oldestKey) cache.delete(oldestKey);
  }
  entry.at = Date.now();
  cache.set(key, entry);
}

/**
 * @param {{
 *   siteRoot: string,
 *   catalogMediaFsRoot: string,
 *   heroMediaFsRoot: string,
 *   rawMaterialsMediaFsRoot: string,
 *   photoFrameProductsMediaFsRoot: string,
 * }} roots
 */
function createMediaOptimizer(roots) {
  function absForUrlPath(urlPath) {
    var raw = String(urlPath || "").split("?")[0];
    var dec = decodeURIComponent(raw).replace(/\\/g, "/");
    if (!dec.startsWith("/media/")) return null;

    if (dec.startsWith("/media/catalog/")) {
      return path.join(roots.catalogMediaFsRoot, dec.slice("/media/catalog/".length));
    }
    if (dec.startsWith("/media/hero/")) {
      return path.join(roots.heroMediaFsRoot, dec.slice("/media/hero/".length));
    }
    if (dec.startsWith("/media/raw-materials/")) {
      return path.join(roots.rawMaterialsMediaFsRoot, dec.slice("/media/raw-materials/".length));
    }
    if (dec.startsWith("/media/photo-frame-products/")) {
      return path.join(
        roots.photoFrameProductsMediaFsRoot,
        dec.slice("/media/photo-frame-products/".length)
      );
    }
    if (dec.startsWith("/media/")) {
      return path.join(roots.siteRoot, dec.replace(/^\//, ""));
    }
    return null;
  }

  return function mediaOptimizer(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    var w = parseInt(String(req.query.w || ""), 10);
    var fmt = String(req.query.f || req.query.format || "").toLowerCase();
    var wantWebp = fmt === "webp" || fmt === "auto";
    if (!Number.isFinite(w) || w <= 0 || w > 4000) w = 0;
    if (!w && !wantWebp) return next();

    var abs = absForUrlPath(req.path);
    if (!abs || !IMAGE_EXT_RE.test(abs)) return next();

    fs.stat(abs, function (stErr, st) {
      if (stErr || !st || !st.isFile()) return next();

      var cacheKey = abs + "|w=" + w + "|f=" + (wantWebp ? "webp" : "orig");
      var cached = cacheGet(cacheKey);
      if (cached) {
        res.setHeader("Content-Type", cached.type);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("Vary", "Accept");
        if (req.method === "HEAD") return res.end();
        return res.end(cached.buf);
      }

      fs.readFile(abs, function (readErr, buf) {
        if (readErr) return next();

        var pipeline = sharp(buf).rotate();
        if (w) {
          pipeline = pipeline.resize({
            width: w,
            fit: "inside",
            withoutEnlargement: true,
          });
        }

        var outFmt = wantWebp ? "webp" : null;
        if (outFmt === "webp") {
          pipeline = pipeline.webp({ quality: 82 });
        } else if (/\.png$/i.test(abs)) {
          pipeline = pipeline.png({ compressionLevel: 9 });
        } else {
          pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
        }

        pipeline.toBuffer(function (procErr, outBuf, info) {
          if (procErr) return next();

          var contentType =
            outFmt === "webp" || (info && info.format === "webp")
              ? "image/webp"
              : info && info.format === "png"
                ? "image/png"
                : "image/jpeg";

          cacheSet(cacheKey, { buf: outBuf, type: contentType });
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          res.setHeader("Vary", "Accept");
          if (req.method === "HEAD") return res.end();
          res.end(outBuf);
        });
      });
    });
  };
}

module.exports = {
  createMediaOptimizer: createMediaOptimizer,
};
