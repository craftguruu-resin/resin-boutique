"use strict";

/**
 * Short-lived in-memory cache for safe public GET /api/catalog responses.
 * Reduces Postgres round-trips on low-CPU hosts; pair with Cache-Control for CDN/browser.
 */

var DEFAULT_TTL_MS = Math.max(15_000, Number(process.env.CATALOG_API_CACHE_MS) || 60_000);

var store = Object.create(null);

var CATALOG_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=120";

function cacheKey(method, url) {
  return String(method || "GET").toUpperCase() + " " + String(url || "");
}

function get(key) {
  var hit = store[key];
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    delete store[key];
    return null;
  }
  return hit.body;
}

function set(key, body, ttlMs) {
  store[key] = {
    body: body,
    expiresAt: Date.now() + (ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS),
  };
}

function invalidatePrefix(prefix) {
  var p = String(prefix || "");
  Object.keys(store).forEach(function (k) {
    if (k.indexOf(p) >= 0) delete store[k];
  });
}

function invalidateAll() {
  store = Object.create(null);
}

/**
 * Express middleware: cache successful JSON for GET requests on mounted path.
 * @param {{ ttlMs?: number, cacheControl?: string }} [opts]
 */
function cachePublicJson(opts) {
  opts = opts || {};
  var ttlMs = opts.ttlMs != null ? Number(opts.ttlMs) : DEFAULT_TTL_MS;
  var cacheControl = opts.cacheControl || CATALOG_CACHE_CONTROL;

  return function (req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    var key = cacheKey(req.method, req.originalUrl || req.url);
    var hit = get(key);
    if (hit) {
      res.setHeader("Cache-Control", cacheControl);
      res.setHeader("X-Cache", "HIT");
      if (req.method === "HEAD") return res.status(200).end();
      return res.json(hit);
    }

    var origJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300 && body && body.ok !== false) {
        set(key, body, ttlMs);
      }
      res.setHeader("Cache-Control", cacheControl);
      res.setHeader("X-Cache", "MISS");
      return origJson(body);
    };
    next();
  };
}

module.exports = {
  CATALOG_CACHE_CONTROL: CATALOG_CACHE_CONTROL,
  cachePublicJson: cachePublicJson,
  invalidatePrefix: invalidatePrefix,
  invalidateAll: invalidateAll,
};
