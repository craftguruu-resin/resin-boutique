"use strict";

var poolMod = require("./db/pool.js");

var ALLOWED_KINDS = { catalog: true, raw_material: true, photo_frame: true };

function normKind(raw) {
  var k = String(raw || "catalog")
    .trim()
    .toLowerCase();
  return ALLOWED_KINDS[k] ? k : "catalog";
}

function normProductId(raw) {
  return String(raw || "").trim().slice(0, 220);
}

/**
 * @param {number} guestId
 * @param {(err: Error|null, rows?: object[]) => void} cb
 */
function listByGuestId(guestId, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  pool
    .query(
      "SELECT product_id AS \"productId\", product_kind AS \"kind\", created_at AS \"createdAt\" " +
        "FROM guest_wishlist_items WHERE guest_id = $1 ORDER BY created_at DESC LIMIT 500",
      [guestId]
    )
    .then(function (r) {
      cb(null, r.rows || []);
    })
    .catch(cb);
}

/**
 * @param {number} guestId
 * @param {string} productId
 * @param {string} kind
 * @param {(err: Error|null, out?: { on: boolean }) => void} cb
 */
function toggle(guestId, productId, kind, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var pid = normProductId(productId);
  var pk = normKind(kind);
  if (!pid) {
    return process.nextTick(function () {
      cb(new Error("productId required"));
    });
  }
  pool
    .query(
      "SELECT id FROM guest_wishlist_items WHERE guest_id = $1 AND product_id = $2 AND product_kind = $3 LIMIT 1",
      [guestId, pid, pk]
    )
    .then(function (r) {
      if (r.rows && r.rows.length) {
        return pool
          .query("DELETE FROM guest_wishlist_items WHERE guest_id = $1 AND product_id = $2 AND product_kind = $3", [
            guestId,
            pid,
            pk,
          ])
          .then(function () {
            cb(null, { on: false });
          });
      }
      return pool
        .query(
          "INSERT INTO guest_wishlist_items (guest_id, product_id, product_kind) VALUES ($1, $2, $3)",
          [guestId, pid, pk]
        )
        .then(function () {
          cb(null, { on: true });
        });
    })
    .catch(cb);
}

/**
 * Merge anonymous/local favourites into account (idempotent).
 * @param {number} guestId
 * @param {Array<{ productId?: string, id?: string, kind?: string }>} items
 * @param {(err: Error|null, rows?: object[]) => void} cb
 */
function mergeItems(guestId, items, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return listByGuestId(guestId, cb);
  }
  var tasks = list
    .map(function (it) {
      var pid = normProductId((it && (it.productId || it.id)) || "");
      var pk = normKind(it && it.kind);
      if (!pid) return null;
      return pool.query(
        "INSERT INTO guest_wishlist_items (guest_id, product_id, product_kind) VALUES ($1, $2, $3) " +
          "ON CONFLICT (guest_id, product_id, product_kind) DO NOTHING",
        [guestId, pid, pk]
      );
    })
    .filter(Boolean);
  if (!tasks.length) {
    return listByGuestId(guestId, cb);
  }
  Promise.all(tasks)
    .then(function () {
      listByGuestId(guestId, cb);
    })
    .catch(cb);
}

module.exports = {
  listByGuestId: listByGuestId,
  toggle: toggle,
  mergeItems: mergeItems,
  normKind: normKind,
  normProductId: normProductId,
};
