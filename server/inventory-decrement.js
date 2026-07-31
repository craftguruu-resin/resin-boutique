"use strict";

function normalizeSizeKey(it) {
  var st = it && it.stockSlot != null ? String(it.stockSlot).trim().toLowerCase().slice(0, 1) : "";
  if (st === "s" || st === "m" || st === "l") return st;
  var raw = it && it.sizeKey != null ? String(it.sizeKey) : "";
  raw = raw.trim().toLowerCase();
  if (raw === "s" || raw === "m" || raw === "l") return raw;
  var lab = String((it && it.sizeLabel) || "")
    .trim()
    .toLowerCase();
  if (lab.indexOf("compact") === 0) return "s";
  if (lab.indexOf("classic") === 0) return "m";
  if (lab.indexOf("grand") === 0) return "l";
  return "";
}

function lineKind(it) {
  var le = it && it.lineExtra && typeof it.lineExtra === "object" ? it.lineExtra : {};
  var k = String(le.shopKind || le.catalogKind || le.productKind || "")
    .trim()
    .toLowerCase();
  if (k === "raw_material" || k === "photo_frame" || k === "catalog") return k;
  return "";
}

function decrementCatalogSlot(client, pid, sk, qty, name) {
  if (!pid || (sk !== "s" && sk !== "m" && sk !== "l")) return Promise.resolve(false);
  var col = sk === "s" ? "stock_s" : sk === "m" ? "stock_m" : "stock_l";
  return client
    .query("SELECT stock_s, stock_m, stock_l FROM catalog_price_overrides WHERE product_id = $1", [pid])
    .then(function (r) {
      if (!r.rows.length) return false;
      var v = r.rows[0][col];
      if (v == null) return false;
      var num = Number(v);
      if (!Number.isFinite(num)) return false;
      if (num < qty) {
        throw new Error(
          "Insufficient stock for " + String(name || pid) + " (" + sk.toUpperCase() + "). Available: " + num + ", ordered: " + qty
        );
      }
      return client
        .query(
          "UPDATE catalog_price_overrides SET " +
            col +
            " = " +
            col +
            " - $2, updated_at = now() WHERE product_id = $1 AND " +
            col +
            " IS NOT NULL",
          [pid, qty]
        )
        .then(function () {
          return true;
        });
    });
}

function parseOptionsCell(raw) {
  if (raw == null) return null;
  var opt = raw;
  if (typeof opt === "string") {
    try {
      opt = JSON.parse(opt);
    } catch (_) {
      return null;
    }
  }
  return opt && typeof opt === "object" ? opt : null;
}

function decrementVariantStock(client, table, pid, sizeKey, qty, name) {
  var key = String(sizeKey || "").trim();
  if (!key || key === "s" || key === "m" || key === "l") return Promise.resolve(false);
  return client.query("SELECT options_json FROM " + table + " WHERE id = $1", [pid]).then(function (r) {
    if (!r.rows.length) return false;
    var opt = parseOptionsCell(r.rows[0].options_json);
    if (!opt) return false;
    var vi = opt.vendorInventory && typeof opt.vendorInventory === "object" ? opt.vendorInventory : {};
    var variants = vi.variants && typeof vi.variants === "object" ? vi.variants : null;
    if (!variants || !Object.prototype.hasOwnProperty.call(variants, key)) return false;
    var row = variants[key];
    if (!row || typeof row !== "object" || row.stock == null) return false;
    var num = Number(row.stock);
    if (!Number.isFinite(num)) return false;
    if (num < qty) {
      throw new Error(
        "Insufficient stock for " + String(name || pid) + " (" + key + "). Available: " + num + ", ordered: " + qty
      );
    }
    row.stock = Math.max(0, Math.round((num - qty) * 100) / 100);
    variants[key] = row;
    vi.variants = variants;
    opt.vendorInventory = vi;
    return client
      .query("UPDATE " + table + " SET options_json = $2::jsonb, updated_at = now() WHERE id = $1", [
        pid,
        JSON.stringify(opt),
      ])
      .then(function () {
        return true;
      });
  });
}

function decrementCatalogVariantStock(client, pid, sizeKey, qty, name) {
  var key = String(sizeKey || "").trim();
  if (!key || key === "s" || key === "m" || key === "l") return Promise.resolve(false);
  return client
    .query("SELECT options_json FROM catalog_price_overrides WHERE product_id = $1", [pid])
    .then(function (r) {
      if (!r.rows.length) return false;
      var opt = parseOptionsCell(r.rows[0].options_json);
      if (!opt) return false;
      var vi = opt.vendorInventory && typeof opt.vendorInventory === "object" ? opt.vendorInventory : {};
      var variants = vi.variants && typeof vi.variants === "object" ? vi.variants : null;
      if (!variants || !Object.prototype.hasOwnProperty.call(variants, key)) return false;
      var row = variants[key];
      if (!row || typeof row !== "object" || row.stock == null) return false;
      var num = Number(row.stock);
      if (!Number.isFinite(num)) return false;
      if (num < qty) {
        throw new Error(
          "Insufficient stock for " + String(name || pid) + " (" + key + "). Available: " + num + ", ordered: " + qty
        );
      }
      row.stock = Math.max(0, Math.round((num - qty) * 100) / 100);
      variants[key] = row;
      vi.variants = variants;
      opt.vendorInventory = vi;
      return client
        .query("UPDATE catalog_price_overrides SET options_json = $2::jsonb, updated_at = now() WHERE product_id = $1", [
          pid,
          JSON.stringify(opt),
        ])
        .then(function () {
          return true;
        });
    });
}

function decrementJsonQtyOnHand(client, table, pid, qty, name) {
  return client.query("SELECT options_json FROM " + table + " WHERE id = $1", [pid]).then(function (r) {
    if (!r.rows.length) return false;
    var opt = r.rows[0].options_json;
    if (opt == null) return false;
    if (typeof opt === "string") {
      try {
        opt = JSON.parse(opt);
      } catch (_) {
        return false;
      }
    }
    if (!opt || typeof opt !== "object") return false;
    var vi = opt.vendorInventory && typeof opt.vendorInventory === "object" ? opt.vendorInventory : {};
    if (vi.qtyOnHand == null) return false;
    var num = Number(vi.qtyOnHand);
    if (!Number.isFinite(num)) return false;
    if (num < qty) {
      throw new Error(
        "Insufficient stock for " + String(name || pid) + ". Available: " + num + ", ordered: " + qty
      );
    }
    vi.qtyOnHand = Math.max(0, Math.round(num - qty));
    opt.vendorInventory = vi;
    return client
      .query("UPDATE " + table + " SET options_json = $2::jsonb, updated_at = now() WHERE id = $1", [
        pid,
        JSON.stringify(opt),
      ])
      .then(function () {
        return true;
      });
  });
}

function decrementOneLine(client, it) {
  var pid = String((it && it.productId) || "").trim().slice(0, 220);
  if (!pid) return Promise.resolve();
  var qty = Math.max(1, Math.min(999, Math.floor(Number(it.qty) || 1)));
  var name = String((it && it.name) || pid);
  var kind = lineKind(it);
  var sk = normalizeSizeKey(it || {});
  var sizeKey = String((it && it.sizeKey) || "").trim();

  if (kind === "raw_material") {
    return decrementVariantStock(client, "raw_materials", pid, sizeKey, qty, name).then(function (ok) {
      if (ok) return;
      return decrementJsonQtyOnHand(client, "raw_materials", pid, qty, name).then(function (ok2) {
        if (ok2) return;
        return decrementCatalogSlot(client, pid, sk || "m", qty, name);
      });
    });
  }
  if (kind === "photo_frame") {
    return decrementVariantStock(client, "photo_frame_products", pid, sizeKey, qty, name).then(function (ok) {
      if (ok) return;
      return decrementJsonQtyOnHand(client, "photo_frame_products", pid, qty, name).then(function (ok2) {
        if (ok2) return;
        return decrementCatalogSlot(client, pid, sk || "m", qty, name);
      });
    });
  }

  return client.query("SELECT 1 FROM raw_materials WHERE id = $1 LIMIT 1", [pid]).then(function (rm) {
    if (rm.rows.length) {
      return decrementVariantStock(client, "raw_materials", pid, sizeKey, qty, name).then(function (ok) {
        if (ok) return;
        return decrementJsonQtyOnHand(client, "raw_materials", pid, qty, name);
      });
    }
    return client.query("SELECT 1 FROM photo_frame_products WHERE id = $1 LIMIT 1", [pid]).then(function (pf) {
      if (pf.rows.length) {
        return decrementVariantStock(client, "photo_frame_products", pid, sizeKey, qty, name).then(function (ok) {
          if (ok) return;
          return decrementJsonQtyOnHand(client, "photo_frame_products", pid, qty, name);
        });
      }
      return decrementCatalogVariantStock(client, pid, sizeKey, qty, name).then(function (ok) {
        if (ok) return;
        return decrementCatalogSlot(client, pid, sk, qty, name);
      });
    });
  });
}

/**
 * Decrement sellable stock for every line (catalog S/M/L, raw materials, photo frames).
 * @param {import('pg').PoolClient} client
 * @param {object[]} items
 */
function decrementOrderItems(client, items) {
  var seq = Promise.resolve();
  (items || []).forEach(function (it) {
    seq = seq.then(function () {
      return decrementOneLine(client, it);
    });
  });
  return seq;
}

module.exports = {
  normalizeSizeKey: normalizeSizeKey,
  decrementOrderItems: decrementOrderItems,
};
