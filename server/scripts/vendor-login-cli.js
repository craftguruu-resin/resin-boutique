"use strict";

/**
 * Sync vendor_users row with VENDOR_PORTAL_USER / VENDOR_PORTAL_PASSWORD from .env
 * (default nammu / nammu). Fixes login when the row existed but the password hash was wrong
 * or credentials were changed in .env after the first migrate.
 *
 * Run from server/:  npm run db:vendor-login
 */

require("dotenv").config();
var bcrypt = require("bcryptjs");
var poolMod = require("../db/pool.js");

var user = process.env.VENDOR_PORTAL_USER || "nammu";
var pass = process.env.VENDOR_PORTAL_PASSWORD || "nammu";
var hash = bcrypt.hashSync(pass, 10);

var p = poolMod.getPool();
if (!p) {
  console.error("DATABASE_URL is not set in server/.env");
  process.exit(1);
}

p.query(
  "INSERT INTO vendor_users (username, password_hash) VALUES ($1, $2) " +
    "ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash",
  [user, hash]
)
  .then(function () {
    console.log("Vendor login updated for username:", user);
    console.log("Password is whatever you set as VENDOR_PORTAL_PASSWORD (default: nammu).");
    process.exit(0);
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
