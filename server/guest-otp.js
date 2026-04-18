"use strict";

var crypto = require("crypto");
var poolMod = require("./db/pool.js");
var guestDb = require("./guest-db.js");

/** Email OTP validity (signup + login). */
var OTP_EXPIRY_MS = 5 * 60 * 1000;

function sha256hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function otpPepper() {
  return String(process.env.GUEST_OTP_PEPPER || "craftguru-guest-otp-v1").trim() || "craftguru-guest-otp-v1";
}

function normalizeEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

function mailFromAddress() {
  var f = String(process.env.MAIL_FROM || process.env.SMTP_FROM || "").trim();
  if (f) return f;
  var u = String(process.env.SMTP_USER || process.env.GMAIL_USER || "").trim();
  if (u) return u;
  return '"Craftguru" <noreply@localhost>';
}

function hashOtp(emailLower, code) {
  return sha256hex(otpPepper() + ":" + emailLower + ":" + String(code));
}

function syntheticPhoneNormForEmailSignup(emailLower) {
  return guestDb.phoneNormKey("cg-email-only:" + emailLower);
}

/**
 * @param {string} emailRaw
 * @param {{ sendMail: function (opts: object) => Promise<unknown> } | null} transporter — nodemailer transport or null
 * @param {(err: Error|null, out?: { ok: boolean, devMailSkipped?: boolean }) => void} cb
 */
function requestGuestEmailOtp(emailRaw, transporter, cb) {
  var email = normalizeEmail(emailRaw);
  if (email.indexOf("@") < 1) {
    return process.nextTick(function () {
      cb(new Error("Invalid email"));
    });
  }
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var code = String(100000 + Math.floor(Math.random() * 900000));
  var hash = hashOtp(email, code);
  var exp = new Date(Date.now() + OTP_EXPIRY_MS);

  pool
    .query("SELECT id FROM guest_customers WHERE LOWER(TRIM(email)) = $1 LIMIT 1", [email])
    .then(function (r) {
      if (!r.rows.length) {
        throw new Error(
          "No account for this email yet. Sign up on the homepage, or complete checkout once with this email."
        );
      }
      return pool.query(
        "INSERT INTO guest_email_otps (email_lower, code_hash, expires_at) VALUES ($1, $2, $3)",
        [email, hash, exp.toISOString()]
      );
    })
    .then(function () {
      var toAddr = String(emailRaw || "").trim();
      if (transporter && typeof transporter.sendMail === "function") {
        return transporter
          .sendMail({
            from: mailFromAddress(),
            to: toAddr,
            subject: "Your Craftguru sign-in code",
            text:
              "Your one-time code is: " +
              code +
              "\n\nIt expires in 5 minutes. If you did not request this, ignore this email.\n",
          })
          .then(function () {
            cb(null, { ok: true });
          });
      }
      console.warn("[guest-otp] SMTP not configured — sign-in code for " + email + ": " + code);
      cb(null, { ok: true, devMailSkipped: true });
    })
    .catch(cb);
}

/**
 * Sign-up: send OTP only if this email is not already a guest.
 * @param {{ email?: string, name?: string }} body
 * @param {{ sendMail: function (opts: object) => Promise<unknown> } | null} transporter
 * @param {(err: Error|null, out?: { ok: boolean, devMailSkipped?: boolean }) => void} cb
 */
function requestSignupGuestEmailOtp(body, transporter, cb) {
  var emailRaw = body && body.email;
  var email = normalizeEmail(emailRaw);
  if (email.indexOf("@") < 1) {
    return process.nextTick(function () {
      cb(new Error("Invalid email"));
    });
  }
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var code = String(100000 + Math.floor(Math.random() * 900000));
  var hash = hashOtp(email, code);
  var exp = new Date(Date.now() + OTP_EXPIRY_MS);

  pool
    .query("SELECT id FROM guest_customers WHERE LOWER(TRIM(email)) = $1 LIMIT 1", [email])
    .then(function (r) {
      if (r.rows.length) {
        var dup = new Error("An account with this email already exists. Please use Log in.");
        dup.code = "USE_LOGIN";
        throw dup;
      }
      return pool.query(
        "INSERT INTO guest_email_otps (email_lower, code_hash, expires_at) VALUES ($1, $2, $3)",
        [email, hash, exp.toISOString()]
      );
    })
    .then(function () {
      var toAddr = String(emailRaw || "").trim();
      if (transporter && typeof transporter.sendMail === "function") {
        return transporter
          .sendMail({
            from: mailFromAddress(),
            to: toAddr,
            subject: "Your Craftguru sign-up code",
            text:
              "Your one-time code is: " +
              code +
              "\n\nIt expires in 5 minutes. If you did not request this, ignore this email.\n",
          })
          .then(function () {
            cb(null, { ok: true });
          });
      }
      console.warn("[guest-otp] SMTP not configured — sign-up code for " + email + ": " + code);
      cb(null, { ok: true, devMailSkipped: true });
    })
    .catch(cb);
}

/**
 * @param {(err: Error|null, out?: { guestId: number }) => void} cb
 */
function verifyGuestEmailOtp(emailRaw, codeRaw, cb) {
  var email = normalizeEmail(emailRaw);
  var code = String(codeRaw || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (email.indexOf("@") < 1 || code.length !== 6) {
    return process.nextTick(function () {
      cb(new Error("Invalid email or code"));
    });
  }
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var hash = hashOtp(email, code);
  pool
    .query(
      "SELECT id FROM guest_email_otps WHERE email_lower = $1 AND code_hash = $2 AND expires_at > now() AND consumed_at IS NULL ORDER BY id DESC LIMIT 1",
      [email, hash]
    )
    .then(function (r) {
      if (!r.rows.length) {
        throw new Error("Wrong or expired code. Request a new code (codes expire after 5 minutes).");
      }
      var otpId = r.rows[0].id;
      return pool.query("UPDATE guest_email_otps SET consumed_at = now() WHERE id = $1", [otpId]).then(function () {
        return pool.query(
          "SELECT id FROM guest_customers WHERE LOWER(TRIM(email)) = $1 ORDER BY id DESC LIMIT 1",
          [email]
        );
      });
    })
    .then(function (r2) {
      if (!r2.rows.length) {
        throw new Error("Guest not found");
      }
      cb(null, { guestId: Number(r2.rows[0].id) });
    })
    .catch(cb);
}

/**
 * Verify sign-up OTP and create guest row (email-unique; phone_norm is a stable synthetic key until checkout adds a real number).
 * @param {{ email?: string, code?: string, name?: string }} body
 * @param {(err: Error|null, out?: { guestId: number }) => void} cb
 */
function verifySignupGuestEmailOtp(body, cb) {
  var emailRaw = body && body.email;
  var email = normalizeEmail(emailRaw);
  var code = String((body && body.code) || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  var displayName = String((body && body.name) || "")
    .trim()
    .slice(0, 200);
  if (email.indexOf("@") < 1 || code.length !== 6) {
    return process.nextTick(function () {
      cb(new Error("Invalid email or code"));
    });
  }
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var hash = hashOtp(email, code);
  var emailStored = String(emailRaw || "").trim().slice(0, 200);
  var phoneKey = syntheticPhoneNormForEmailSignup(email);

  pool
    .query(
      "SELECT id FROM guest_email_otps WHERE email_lower = $1 AND code_hash = $2 AND expires_at > now() AND consumed_at IS NULL ORDER BY id DESC LIMIT 1",
      [email, hash]
    )
    .then(function (r) {
      if (!r.rows.length) {
        throw new Error("Wrong or expired code. Request a new code (codes expire after 5 minutes).");
      }
      var otpId = r.rows[0].id;
      return pool
        .query("SELECT id FROM guest_customers WHERE LOWER(TRIM(email)) = $1 LIMIT 1", [email])
        .then(function (r2) {
          if (r2.rows.length) {
            var dup = new Error("An account with this email already exists. Please use Log in.");
            dup.code = "USE_LOGIN";
            throw dup;
          }
          return pool
            .query(
              "INSERT INTO guest_customers (phone_norm, email, display_name) VALUES ($1, $2, $3) RETURNING id",
              [phoneKey, emailStored, displayName || "Guest"]
            )
            .then(function (ins) {
              return pool.query("UPDATE guest_email_otps SET consumed_at = now() WHERE id = $1", [otpId]).then(function () {
                return ins;
              });
            });
        });
    })
    .then(function (ins) {
      cb(null, { guestId: Number(ins.rows[0].id) });
    })
    .catch(function (err) {
      if (err && err.code === "23505") {
        var e = new Error("An account with this email already exists. Please use Log in.");
        e.code = "USE_LOGIN";
        return cb(e);
      }
      cb(err);
    });
}

module.exports = {
  OTP_EXPIRY_MS: OTP_EXPIRY_MS,
  requestGuestEmailOtp: requestGuestEmailOtp,
  verifyGuestEmailOtp: verifyGuestEmailOtp,
  requestSignupGuestEmailOtp: requestSignupGuestEmailOtp,
  verifySignupGuestEmailOtp: verifySignupGuestEmailOtp,
};
