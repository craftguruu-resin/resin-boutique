"use strict";

/**
 * Cloud Run / production HTTP hardening helpers for Express.
 * Keep this module free of route business logic.
 */

var compression = require("compression");
var helmet = require("helmet");

function isProduction() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

/** Cloud Run / GCE inject K_SERVICE; Render injects RENDER=true. */
function isCloudHosted() {
  return Boolean(String(process.env.K_SERVICE || "").trim()) || String(process.env.RENDER || "").toLowerCase() === "true";
}

/**
 * Apply middleware early (before routes). Order matters.
 * @param {import("express").Express} app
 */
function applyHttpHardening(app) {
  // Cloud Run terminates TLS; trust X-Forwarded-* for req.ip / secure cookies.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.set("etag", "weak");

  app.use(
    helmet({
      contentSecurityPolicy: false, // storefront loads many inline scripts + third parties
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  app.use(
    compression({
      threshold: 1024,
      filter: function (req, res) {
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
      },
    })
  );

  app.use(function requestLog(req, res, next) {
    if (req.path === "/health" || req.path === "/api/health") return next();
    var start = Date.now();
    res.on("finish", function () {
      var ms = Date.now() - start;
      var line =
        "[" +
        new Date().toISOString() +
        "] " +
        req.method +
        " " +
        req.originalUrl +
        " " +
        res.statusCode +
        " " +
        ms +
        "ms";
      if (res.statusCode >= 500) console.error(line);
      else if (isProduction()) console.log(line);
      else console.log(line);
    });
    next();
  });
}

var IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg|ico)$/i;
var STYLE_SCRIPT_EXT_RE = /\.(js|css)$/i;
var FONT_EXT_RE = /\.(woff2?|ttf|otf|eot)$/i;

var BUNDLED_MEDIA_MARKERS = [
  "/media/home-showcase/",
  "/media/photo-frames-showcase/",
  "/media/raw-material-showcase/",
];

/** Browser cache: images load fast; HTML stays fresh to avoid stale-page flashes. */
var CACHE = {
  html: "no-cache, must-revalidate",
  scriptStyle: "public, max-age=300, must-revalidate",
  font: "public, max-age=604800, must-revalidate",
  mutableUploadImage: "public, max-age=86400, must-revalidate",
  bundledImage: "public, max-age=2592000, stale-while-revalidate=86400",
  defaultImage: "public, max-age=604800, stale-while-revalidate=86400",
};

function normalizeStaticFilePath(filePath) {
  var p = String(filePath || "").replace(/\\/g, "/").toLowerCase();
  var idx = p.indexOf("/media/");
  if (idx >= 0) p = p.slice(idx);
  return p;
}

/**
 * Set Cache-Control for a file served by express.static.
 * @param {import("express").Response} res
 * @param {string} filePath absolute or relative path
 * @param {"site-root"|"mutable-upload"} [profile]
 */
function setStaticFileCacheHeaders(res, filePath, profile) {
  var p = normalizeStaticFilePath(filePath);
  if (/\.html$/.test(p)) {
    res.setHeader("Cache-Control", CACHE.html);
    return;
  }
  if (STYLE_SCRIPT_EXT_RE.test(p)) {
    res.setHeader("Cache-Control", CACHE.scriptStyle);
    return;
  }
  if (FONT_EXT_RE.test(p)) {
    res.setHeader("Cache-Control", CACHE.font);
    return;
  }
  if (!IMAGE_EXT_RE.test(p)) return;

  if (profile === "mutable-upload") {
    res.setHeader("Cache-Control", CACHE.mutableUploadImage);
    return;
  }

  for (var i = 0; i < BUNDLED_MEDIA_MARKERS.length; i++) {
    if (p.indexOf(BUNDLED_MEDIA_MARKERS[i]) >= 0) {
      res.setHeader("Cache-Control", CACHE.bundledImage);
      return;
    }
  }

  res.setHeader("Cache-Control", CACHE.defaultImage);
}

/**
 * Cache headers for static assets served by Express (path-based middleware).
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {() => void} next
 */
function staticCacheHeaders(req, res, next) {
  var p = String((req && req.path) || "").toLowerCase();
  if (/\.html$/.test(p)) {
    res.setHeader("Cache-Control", CACHE.html);
  } else if (IMAGE_EXT_RE.test(p)) {
    if (
      p.indexOf("/media/catalog/") === 0 ||
      p.indexOf("/media/hero/") === 0 ||
      p.indexOf("/media/raw-materials/") === 0 ||
      p.indexOf("/media/photo-frame-products/") === 0
    ) {
      res.setHeader("Cache-Control", CACHE.mutableUploadImage);
    } else if (
      p.indexOf("/media/home-showcase/") === 0 ||
      p.indexOf("/media/photo-frames-showcase/") === 0 ||
      p.indexOf("/media/raw-material-showcase/") === 0
    ) {
      res.setHeader("Cache-Control", CACHE.bundledImage);
    } else {
      res.setHeader("Cache-Control", CACHE.defaultImage);
    }
  } else {
    res.setHeader("Cache-Control", CACHE.scriptStyle);
  }
  next();
}

/**
 * HTML / short-lived documents.
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 * @param {() => void} next
 */
function htmlCacheHeaders(_req, res, next) {
  res.setHeader("Cache-Control", CACHE.html);
  next();
}

/**
 * @param {"site-root"|"mutable-upload"} profile
 */
function makeExpressStaticOptions(profile) {
  return {
    etag: true,
    lastModified: true,
    setHeaders: function (res, filePath) {
      setStaticFileCacheHeaders(res, filePath, profile);
    },
  };
}

/**
 * Graceful shutdown for Cloud Run SIGTERM.
 * @param {import("http").Server} server
 * @param {{ getPool?: () => import("pg").Pool|null }} opts
 */
function wireGracefulShutdown(server, opts) {
  opts = opts || {};
  var shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("[shutdown] " + signal + " — closing HTTP server");
    server.close(function (err) {
      if (err) console.error("[shutdown] server close error:", err.message || err);
      var pool = typeof opts.getPool === "function" ? opts.getPool() : null;
      if (pool && typeof pool.end === "function") {
        pool
          .end()
          .then(function () {
            console.log("[shutdown] Postgres pool closed");
            process.exit(0);
          })
          .catch(function (e) {
            console.error("[shutdown] pool end error:", e && e.message ? e.message : e);
            process.exit(1);
          });
      } else {
        process.exit(0);
      }
    });
    setTimeout(function () {
      console.error("[shutdown] forced exit after timeout");
      process.exit(1);
    }, 25_000).unref();
  }

  process.on("SIGTERM", function () {
    shutdown("SIGTERM");
  });
  process.on("SIGINT", function () {
    shutdown("SIGINT");
  });
}

module.exports = {
  isProduction: isProduction,
  isCloudHosted: isCloudHosted,
  applyHttpHardening: applyHttpHardening,
  setStaticFileCacheHeaders: setStaticFileCacheHeaders,
  makeExpressStaticOptions: makeExpressStaticOptions,
  staticCacheHeaders: staticCacheHeaders,
  htmlCacheHeaders: htmlCacheHeaders,
  wireGracefulShutdown: wireGracefulShutdown,
};
