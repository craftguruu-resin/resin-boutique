"use strict";

var crypto = require("crypto");
var poolMod = require("./db/pool.js");
var guestDb = require("./guest-db.js");

var GUEST_SESSION_DAYS = Number(process.env.GUEST_SESSION_DAYS) || 30;

function sha256hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

/**
 * Upsert guest by phone and create a long-lived session token (OTP/SMS can be added later).
 * @param {{ phone: string, email: string, displayName?: string }} body
 * @param {(err: Error|null, out?: { token: string, guestId: number, expiresInMs: number }) => void} cb
 */
function issueGuestSession(body, cb) {
  if (!poolMod.isEnabled()) {
    return process.nextTick(function () {
      cb(new Error("DATABASE_URL not set — guest sessions require Postgres"));
    });
  }
  var phone = String(body.phone || "").trim();
  var email = String(body.email || "").trim();
  var displayName = String(body.displayName || "").trim().slice(0, 200);
  if (phone.length < 5 || email.indexOf("@") < 1) {
    return process.nextTick(function () {
      cb(new Error("Valid phone and email required"));
    });
  }
  if (guestDb.normalizeIndia10(phone).length !== 10) {
    return process.nextTick(function () {
      cb(new Error("Enter a valid 10-digit Indian mobile (with or without +91)"));
    });
  }

  var guestLike = {
    phone: phone,
    email: email,
    name: displayName || "Guest",
  };

  var pool = poolMod.getPool();
  var client;
  var token = crypto.randomBytes(24).toString("hex");
  var exp = new Date(Date.now() + GUEST_SESSION_DAYS * 24 * 60 * 60 * 1000);
  var th = sha256hex(token);
  var gid;

  pool
    .connect()
    .then(function (c) {
      client = c;
      return guestDb.upsertGuestCore(client, guestLike);
    })
    .then(function (guestId) {
      gid = guestId;
      return client.query("INSERT INTO guest_sessions (guest_id, token_hash, expires_at) VALUES ($1, $2, $3)", [
        guestId,
        th,
        exp.toISOString(),
      ]);
    })
    .then(function () {
      client.release();
      client = null;
      cb(null, {
        token: token,
        guestId: gid,
        expiresInMs: GUEST_SESSION_DAYS * 24 * 60 * 60 * 1000,
      });
    })
    .catch(function (err) {
      if (client) {
        try {
          client.release();
        } catch (_) {}
      }
      cb(err);
    });
}

/**
 * @param {number} guestId
 * @param {(err: Error|null, out?: { token: string, guestId: number, expiresInMs: number }) => void} cb
 */
function issueGuestTokenForGuestId(guestId, cb) {
  if (!poolMod.isEnabled()) {
    return process.nextTick(function () {
      cb(new Error("DATABASE_URL not set — guest sessions require Postgres"));
    });
  }
  var gid = Number(guestId);
  if (!Number.isFinite(gid) || gid < 1) {
    return process.nextTick(function () {
      cb(new Error("Invalid guest"));
    });
  }
  var pool = poolMod.getPool();
  var token = crypto.randomBytes(24).toString("hex");
  var exp = new Date(Date.now() + GUEST_SESSION_DAYS * 24 * 60 * 60 * 1000);
  var th = sha256hex(token);
  pool
    .query("INSERT INTO guest_sessions (guest_id, token_hash, expires_at) VALUES ($1, $2, $3)", [gid, th, exp.toISOString()])
    .then(function () {
      cb(null, {
        token: token,
        guestId: gid,
        expiresInMs: GUEST_SESSION_DAYS * 24 * 60 * 60 * 1000,
      });
    })
    .catch(cb);
}

/**
 * @param {string} token
 * @param {(err: Error|null, row?: { guestId: number, email: string, displayName: string, phoneNorm: string } | null) => void} cb
 */
function verifyGuestToken(token, cb) {
  var raw = String(token || "").trim();
  if (!raw) {
    return process.nextTick(function () {
      cb(null, null);
    });
  }
  if (!poolMod.isEnabled()) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var pool = poolMod.getPool();
  var th = sha256hex(raw);
  pool
    .query(
      "SELECT g.id AS guest_id, g.email, g.display_name, g.phone_norm " +
        "FROM guest_sessions s JOIN guest_customers g ON g.id = s.guest_id " +
        "WHERE s.token_hash = $1 AND s.expires_at > now() LIMIT 1",
      [th]
    )
    .then(function (r) {
      if (!r.rows.length) {
        return cb(null, null);
      }
      var row = r.rows[0];
      cb(null, {
        guestId: Number(row.guest_id),
        email: row.email != null ? String(row.email) : "",
        displayName: row.display_name != null ? String(row.display_name) : "",
        phoneNorm: row.phone_norm != null ? String(row.phone_norm) : "",
      });
    })
    .catch(cb);
}

module.exports = {
  issueGuestSession: issueGuestSession,
  issueGuestTokenForGuestId: issueGuestTokenForGuestId,
  verifyGuestToken: verifyGuestToken,
};
