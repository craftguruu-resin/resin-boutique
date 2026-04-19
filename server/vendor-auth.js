"use strict";

var crypto = require("crypto");
var bcrypt = require("bcryptjs");
var poolMod = require("./db/pool.js");

var VENDOR_PORTAL_USER = process.env.VENDOR_PORTAL_USER || "nammu";
var VENDOR_PORTAL_PASSWORD = process.env.VENDOR_PORTAL_PASSWORD || "nammu";

/** Sliding inactivity window (ms). After this long without an authenticated API call, re-login. Default 1 hour. */
var IDLE_MS = Number(process.env.VENDOR_SESSION_IDLE_MS);
if (!Number.isFinite(IDLE_MS) || IDLE_MS < 60000) {
  IDLE_MS = 60 * 60 * 1000;
}

/** Require Bearer on /api/vendor/*. Explicit VENDOR_REQUIRE_AUTH=0 disables. On Render (RENDER=true), defaults to locked unless disabled. */
function vendorRequireAuth() {
  var ex = String(process.env.VENDOR_REQUIRE_AUTH || "").trim().toLowerCase();
  if (ex === "0" || ex === "false" || ex === "off") return false;
  if (ex === "1" || ex === "true" || ex === "on") return true;
  return String(process.env.RENDER || "").toLowerCase() === "true";
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

/**
 * @param {import("express").Request} req
 * @param {(err: Error|null, ok: boolean) => void} cb
 * @param {{ bump?: boolean }|undefined} opts bump=false: read-only check (e.g. /api/vendor/session) so page loads do not extend idle.
 */
function tokenValid(req, cb, opts) {
  var bump = !opts || opts.bump !== false;
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
        if (!r.rows.length) return cb(null, false);
        if (!bump) return cb(null, true);
        return poolMod
          .getPool()
          .query(
            "UPDATE vendor_sessions SET expires_at = NOW() + (($2::double precision / 1000.0) * INTERVAL '1 second') WHERE token_hash = $1",
            [h, IDLE_MS]
          )
          .then(function () {
            cb(null, true);
          });
      })
      .catch(function (e) {
        cb(e, false);
      });
    return;
  }

  var rec = vendorSessionsMemory[tok];
  process.nextTick(function () {
    if (typeof rec === "number") {
      if (rec <= Date.now()) {
        delete vendorSessionsMemory[tok];
        return cb(null, false);
      }
      if (bump) {
        vendorSessionsMemory[tok] = { lastAt: Date.now() };
      }
      return cb(null, true);
    }
    if (!rec || typeof rec.lastAt !== "number") {
      return cb(null, false);
    }
    if (Date.now() - rec.lastAt > IDLE_MS) {
      delete vendorSessionsMemory[tok];
      return cb(null, false);
    }
    if (bump) {
      rec.lastAt = Date.now();
    }
    cb(null, true);
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
        var h = sha256hex(token);
        var exp = new Date(Date.now() + IDLE_MS);
        return poolMod
          .getPool()
          .query(
            "INSERT INTO vendor_sessions (vendor_user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
            [row.id, h, exp.toISOString()]
          )
          .then(function () {
            cb(null, token, IDLE_MS);
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
  vendorSessionsMemory[token] = { lastAt: Date.now() };
  process.nextTick(function () {
    cb(null, token, IDLE_MS);
  });
}

function getSessionIdleMs() {
  return IDLE_MS;
}

module.exports = {
  vendorAuthToken,
  tokenValid,
  login,
  vendorRequireAuth: vendorRequireAuth,
  getSessionIdleMs: getSessionIdleMs,
};
