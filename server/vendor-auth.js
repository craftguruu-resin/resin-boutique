"use strict";

var crypto = require("crypto");
var bcrypt = require("bcryptjs");
var poolMod = require("./db/pool.js");

var VENDOR_PORTAL_USER = process.env.VENDOR_PORTAL_USER || "nammu";
var VENDOR_PORTAL_PASSWORD = process.env.VENDOR_PORTAL_PASSWORD || "nammu";
var VENDOR_SESSION_MS = 12 * 60 * 60 * 1000;

/** Set to "1" to require Bearer token on /api/vendor/* again. Default: open (no login). */
function vendorRequireAuth() {
  return String(process.env.VENDOR_REQUIRE_AUTH || "").trim() === "1";
}

var vendorSessionsMemory = Object.create(null);

function sha256hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function vendorAuthToken(req) {
  var auth = req.get("authorization") || "";
  var m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : (req.get("x-vendor-token") || "").trim();
}

/** @param {(err: Error|null, ok: boolean) => void} cb */
function tokenValid(req, cb) {
  if (!vendorRequireAuth()) {
    return process.nextTick(function () {
      cb(null, true);
    });
  }
  var tok = vendorAuthToken(req);
  if (!tok) {
    return process.nextTick(function () {
      cb(null, false);
    });
  }

  if (poolMod.isEnabled()) {
    var h = sha256hex(tok);
    poolMod
      .getPool()
      .query(
        "SELECT 1 FROM vendor_sessions vs " +
          "WHERE vs.token_hash = $1 AND vs.expires_at > now()",
        [h]
      )
      .then(function (r) {
        cb(null, r.rows.length > 0);
      })
      .catch(function (e) {
        cb(e, false);
      });
    return;
  }

  var exp = vendorSessionsMemory[tok];
  process.nextTick(function () {
    cb(null, typeof exp === "number" && exp > Date.now());
  });
}

/** @param {(err: Error|null, token?: string, expiresInMs?: number) => void} cb */
function login(username, password, cb) {
  var u = String(username || "").trim();
  var p = String(password || "").trim();

  if (poolMod.isEnabled()) {
    poolMod
      .getPool()
      .query("SELECT id, password_hash FROM vendor_users WHERE username = $1", [u])
      .then(function (r) {
        if (!r.rows.length || !bcrypt.compareSync(p, r.rows[0].password_hash)) {
          return cb(new Error("Invalid username or password"));
        }
        var row = r.rows[0];
        var token = crypto.randomBytes(32).toString("hex");
        var exp = new Date(Date.now() + VENDOR_SESSION_MS);
        var h = sha256hex(token);
        return poolMod
          .getPool()
          .query(
            "INSERT INTO vendor_sessions (vendor_user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
            [row.id, h, exp.toISOString()]
          )
          .then(function () {
            cb(null, token, VENDOR_SESSION_MS);
          });
      })
      .catch(function (err) {
        cb(err);
      });
    return;
  }

  if (u !== VENDOR_PORTAL_USER || p !== VENDOR_PORTAL_PASSWORD) {
    return process.nextTick(function () {
      cb(new Error("Invalid username or password"));
    });
  }
  var token = crypto.randomBytes(32).toString("hex");
  vendorSessionsMemory[token] = Date.now() + VENDOR_SESSION_MS;
  process.nextTick(function () {
    cb(null, token, VENDOR_SESSION_MS);
  });
}

module.exports = {
  vendorAuthToken,
  tokenValid,
  login,
  vendorRequireAuth: vendorRequireAuth,
};
