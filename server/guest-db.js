"use strict";

var crypto = require("crypto");
var poolMod = require("./db/pool.js");

function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

function normalizeIndia10(raw) {
  var x = digitsOnly(raw);
  if (x.length === 12 && x.indexOf("91") === 0) x = x.slice(2);
  if (x.length === 11 && x.charAt(0) === "0") x = x.slice(1);
  return x.length === 10 ? x : "";
}

/** Stable key for guest_customers.phone_norm (10-digit India or hash fallback). */
function phoneNormKey(raw) {
  var ten = normalizeIndia10(raw);
  if (ten.length === 10) return ten;
  var h = crypto.createHash("sha256").update(String(raw || ""), "utf8").digest("hex");
  return ("h" + h).slice(0, 79);
}

/**
 * Upsert guest row only (no address row).
 * @param {import('pg').PoolClient} client
 * @param {{ phone: string, email: string, name?: string }} guest
 * @returns {Promise<number>}
 */
function upsertGuestCore(client, guest) {
  var phoneKey = phoneNormKey(guest.phone);
  var email = String(guest.email || "").trim().slice(0, 200);
  var displayName = String(guest.name || "").trim().slice(0, 200);
  var q1 =
    "INSERT INTO guest_customers (phone_norm, email, display_name) VALUES ($1, $2, $3) " +
    "ON CONFLICT (phone_norm) DO UPDATE SET " +
    "email = EXCLUDED.email, " +
    "display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), guest_customers.display_name), " +
    "updated_at = now() " +
    "RETURNING id";
  return client.query(q1, [phoneKey, email, displayName]).then(function (r) {
    return r.rows[0].id;
  });
}

/**
 * Upsert guest by phone; insert shipping address row.
 * @param {import('pg').PoolClient} client
 * @param {object} guest normalized guest parcel
 * @returns {Promise<number>} guest_id
 */
function upsertGuestAndAddress(client, guest) {
  return upsertGuestCore(client, guest).then(function (gid) {
    return insertGuestAddressRow(client, gid, guest).then(function () {
      return gid;
    });
  });
}

function insertGuestAddressRow(client, guestId, guest) {
  return client.query(
    "INSERT INTO guest_addresses (guest_id, addr_line1, addr_line2, city, state, zip, country) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [guestId, guest.addrLine1, guest.addrLine2 || "", guest.city, guest.state, guest.zip, guest.country]
  );
}

/**
 * Address-only save: never overwrites an existing guest's phone/email.
 * Same phone + same email → add another address row for that guest.
 * Phone taken with different email, or email taken with different phone → error.
 * @param {import('pg').PoolClient} client
 * @param {object} guest normalized guest parcel
 */
function insertGuestStrictOrAttachAddress(client, guest) {
  var phoneKey = phoneNormKey(guest.phone);
  var email = String(guest.email || "").trim().slice(0, 200);
  var emailLower = email.toLowerCase();
  var displayName = String(guest.name || "").trim().slice(0, 200);
  return client
    .query(
      "SELECT id, phone_norm, email FROM guest_customers " +
        "WHERE phone_norm = $1 OR LOWER(TRIM(email)) = LOWER(TRIM($2::text))",
      [phoneKey, email]
    )
    .then(function (r) {
      if (!r.rows.length) {
        return client
          .query(
            "INSERT INTO guest_customers (phone_norm, email, display_name) VALUES ($1, $2, $3) RETURNING id",
            [phoneKey, email, displayName]
          )
          .then(function (ins) {
            var gid = ins.rows[0].id;
            return insertGuestAddressRow(client, gid, guest).then(function () {
              return gid;
            });
          });
      }
      if (r.rows.length > 1) {
        throw new Error(
          "The phone number and email you entered match two different accounts. Use one phone and email pair that belongs to a single account, or contact support."
        );
      }
      var row = r.rows[0];
      var rowEmail = String(row.email || "").trim().toLowerCase();
      var samePhone = row.phone_norm === phoneKey;
      var sameEmail = rowEmail === emailLower;
      if (samePhone && sameEmail) {
        return insertGuestAddressRow(client, row.id, guest).then(function () {
          return row.id;
        });
      }
      if (samePhone && !sameEmail) {
        throw new Error(
          "This phone number is already registered with a different email address. Please use a different phone number or sign in with the email on file."
        );
      }
      if (sameEmail && !samePhone) {
        var existingPn = String(row.phone_norm || "");
        var looksLikeIndiaMobile = /^\d{10}$/.test(existingPn);
        var ten = normalizeIndia10(guest.phone);
        if (!looksLikeIndiaMobile && ten.length === 10) {
          return client
            .query("SELECT id FROM guest_customers WHERE phone_norm = $1 AND id <> $2 LIMIT 1", [phoneKey, row.id])
            .then(function (rPhone) {
              if (rPhone.rows.length) {
                throw new Error(
                  "This phone number is already on another account. Sign in with that number or email, or contact support."
                );
              }
              return client.query(
                "UPDATE guest_customers SET phone_norm = $1, display_name = COALESCE(NULLIF($2, ''), display_name), updated_at = now() WHERE id = $3",
                [phoneKey, displayName, row.id]
              );
            })
            .then(function () {
              return insertGuestAddressRow(client, row.id, guest).then(function () {
                return row.id;
              });
            });
        }
      }
      throw new Error(
        "This email address is already registered to another phone number. Please use a different email or the phone number linked to that account."
      );
    });
}

/**
 * Persist guest + shipping address only (no order).
 * @param {object} guest normalized guest parcel (same shape as upsertGuestAndAddress)
 * @param {(err: Error|null, out?: { guestId: number }) => void} cb
 */
function saveGuestAddressOnly(guest, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var client;
  pool
    .connect()
    .then(function (c) {
      client = c;
      return client.query("BEGIN");
    })
    .then(function () {
      return insertGuestStrictOrAttachAddress(client, guest);
    })
    .then(function (guestId) {
      return client.query("COMMIT").then(function () {
        return guestId;
      });
    })
    .then(function (guestId) {
      if (client) {
        try {
          client.release();
        } catch (_) {}
        client = null;
      }
      cb(null, { guestId: guestId });
    })
    .catch(function (err) {
      var finish = function () {
        if (client) {
          try {
            client.release();
          } catch (_) {}
          client = null;
        }
        cb(err);
      };
      if (client) {
        client.query("ROLLBACK").then(finish).catch(finish);
      } else {
        finish();
      }
    });
}

/**
 * @param {number} guestId
 * @param {(err: Error|null, rows?: object[]) => void} cb
 */
function listGuestAddressesByGuestId(guestId, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  pool
    .query(
      "SELECT id, addr_line1 AS \"addrLine1\", addr_line2 AS \"addrLine2\", city, state, zip, country, created_at AS \"createdAt\" " +
        "FROM guest_addresses WHERE guest_id = $1 ORDER BY created_at DESC LIMIT 30",
      [guestId]
    )
    .then(function (r) {
      cb(null, r.rows || []);
    })
    .catch(cb);
}

module.exports = {
  upsertGuestAndAddress,
  upsertGuestCore,
  insertGuestStrictOrAttachAddress: insertGuestStrictOrAttachAddress,
  normalizeIndia10,
  phoneNormKey,
  saveGuestAddressOnly,
  listGuestAddressesByGuestId: listGuestAddressesByGuestId,
};
