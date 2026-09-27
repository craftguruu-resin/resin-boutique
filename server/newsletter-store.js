"use strict";

/* Local JSON is intentionally development-only. Production subscriptions are
   persisted in Postgres so they survive restarts and scale-out. */
var fs = require("fs");
var path = require("path");
var poolMod = require("./db/pool.js");

var STORE_DIR = path.join(__dirname, "data");
var STORE_FILE = path.join(STORE_DIR, "newsletter-subscribers.json");
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function productionPersistenceRequired() {
  return (
    String(process.env.NODE_ENV || "").toLowerCase() === "production" ||
    String(process.env.RENDER || "").toLowerCase() === "true" ||
    Boolean(String(process.env.K_SERVICE || "").trim())
  );
}

function subscribePostgres(clean, cb) {
  var p = poolMod.getPool();
  p.query(
    "CREATE TABLE IF NOT EXISTS newsletter_subscribers (email TEXT PRIMARY KEY, subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
  )
    .then(function () {
      return p.query(
        "INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING RETURNING email",
        [clean]
      );
    })
    .then(function (result) {
      cb(null, { alreadySubscribed: result.rows.length === 0 });
    })
    .catch(cb);
}

function readAll(cb) {
  fs.readFile(STORE_FILE, "utf8", function (err, raw) {
    if (err && err.code === "ENOENT") return cb(null, []);
    if (err) return cb(err);
    try {
      var parsed = JSON.parse(raw);
      cb(null, Array.isArray(parsed) ? parsed : []);
    } catch (_) {
      cb(new Error("Newsletter store could not be read"));
    }
  });
}

function subscribe(email, cb) {
  var clean = normalizeEmail(email);
  if (!EMAIL_RE.test(clean) || clean.length > 254) {
    var invalid = new Error("Invalid email");
    invalid.code = "INVALID_EMAIL";
    return cb(invalid);
  }
  if (poolMod.isEnabled()) return subscribePostgres(clean, cb);
  if (productionPersistenceRequired()) {
    var persistence = new Error("Newsletter subscriptions require DATABASE_URL in production");
    persistence.code = "PERSISTENCE_REQUIRED";
    return process.nextTick(function () {
      cb(persistence);
    });
  }
  readAll(function (readErr, entries) {
    if (readErr) return cb(readErr);
    var alreadySubscribed = entries.some(function (entry) {
      return normalizeEmail(entry && entry.email) === clean;
    });
    if (alreadySubscribed) return cb(null, { alreadySubscribed: true });
    entries.push({ email: clean, subscribedAt: new Date().toISOString() });
    fs.mkdir(STORE_DIR, { recursive: true }, function (mkdirErr) {
      if (mkdirErr) return cb(mkdirErr);
      fs.writeFile(STORE_FILE, JSON.stringify(entries, null, 2) + "\n", "utf8", function (writeErr) {
        if (writeErr) return cb(writeErr);
        cb(null, { alreadySubscribed: false });
      });
    });
  });
}

module.exports = { subscribe: subscribe };
