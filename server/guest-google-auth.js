"use strict";

var { OAuth2Client } = require("google-auth-library");
var poolMod = require("./db/pool.js");
var guestDb = require("./guest-db.js");

function googleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || "").trim();
}

function googleSignInConfigured() {
  return googleClientId().length > 0;
}

/**
 * Verify GIS JWT, find or create guest row, return guest id + normalized email.
 * @param {string} idToken — credential from Google Identity Services
 * @param {(err: Error|null, out?: { guestId: number, email: string }) => void} cb
 */
function verifyAndEnsureGuest(idToken, cb) {
  var audience = googleClientId();
  if (!audience) {
    return process.nextTick(function () {
      cb(new Error("Google sign-in is not configured (set GOOGLE_CLIENT_ID on the server)."));
    });
  }
  var raw = String(idToken || "").trim();
  if (!raw) {
    return process.nextTick(function () {
      cb(new Error("Missing Google credential"));
    });
  }

  var client = new OAuth2Client(audience);
  client
    .verifyIdToken({ idToken: raw, audience: audience })
    .then(function (ticket) {
      var p = ticket.getPayload();
      if (!p) throw new Error("Invalid Google token");
      if (!p.email_verified) throw new Error("Google email must be verified");
      var emailLower = String(p.email || "")
        .trim()
        .toLowerCase();
      if (emailLower.indexOf("@") < 1) throw new Error("Invalid email from Google");
      var emailStored = String(p.email || "")
        .trim()
        .slice(0, 200);
      var name = String(p.name || "")
        .trim()
        .slice(0, 200);
      var sub = String(p.sub || "").trim();
      if (!sub) throw new Error("Invalid Google account id");
      return { emailLower: emailLower, emailStored: emailStored, name: name, sub: sub };
    })
    .then(function (profile) {
      var pool = poolMod.getPool();
      if (!pool) throw new Error("Database not configured");
      return pool
        .query("SELECT id, display_name FROM guest_customers WHERE LOWER(TRIM(email)) = $1 LIMIT 1", [profile.emailLower])
        .then(function (r) {
          if (r.rows && r.rows.length) {
            var id = Number(r.rows[0].id);
            var dn = r.rows[0].display_name;
            if ((!dn || !String(dn).trim()) && profile.name) {
              return pool
                .query("UPDATE guest_customers SET display_name = $1, updated_at = now() WHERE id = $2", [profile.name, id])
                .then(function () {
                  return { guestId: id, email: profile.emailLower };
                });
            }
            return { guestId: id, email: profile.emailLower };
          }
          var phoneKey = guestDb.phoneNormKey("cg-google:" + profile.sub);
          return pool
            .query(
              "INSERT INTO guest_customers (phone_norm, email, display_name) VALUES ($1, $2, $3) RETURNING id",
              [phoneKey, profile.emailStored, profile.name || "Guest"]
            )
            .then(function (ins) {
              return { guestId: Number(ins.rows[0].id), email: profile.emailLower };
            })
            .catch(function (err) {
              if (err && err.code === "23505") {
                return pool
                  .query("SELECT id FROM guest_customers WHERE LOWER(TRIM(email)) = $1 LIMIT 1", [profile.emailLower])
                  .then(function (r2) {
                    if (!r2.rows.length) throw err;
                    return { guestId: Number(r2.rows[0].id), email: profile.emailLower };
                  });
              }
              throw err;
            });
        });
    })
    .then(function (out) {
      cb(null, out);
    })
    .catch(function (e) {
      cb(e && e.message ? e : new Error("Google verification failed"));
    });
}

module.exports = {
  googleSignInConfigured: googleSignInConfigured,
  verifyAndEnsureGuest: verifyAndEnsureGuest,
};
