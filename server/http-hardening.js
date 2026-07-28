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

/**
 * Cache headers for static assets served by Express.
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 * @param {() => void} next
 */
function staticCacheHeaders(req, res, next) {
  var p = String((req && req.path) || "").toLowerCase();
  if (
    p.indexOf("/media/catalog/") === 0 ||
    p.indexOf("/media/hero/") === 0 ||
    p.indexOf("/media/raw-materials/") === 0 ||
    p.indexOf("/media/photo-frame-products/") === 0
  ) {
    res.setHeader("Cache-Control", "public, max-age=60, must-revalidate");
  } else {
    res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
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
  res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
  next();
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
  staticCacheHeaders: staticCacheHeaders,
  htmlCacheHeaders: htmlCacheHeaders,
  wireGracefulShutdown: wireGracefulShutdown,
};
