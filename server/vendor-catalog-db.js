"use strict";

var poolMod = require("./db/pool.js");
var catalogFromData = require("./catalog-from-data.js");

/** @param {(err: Error|null, map?: object) => void} cb — map[productId] = { s, m, l, stockS, stockM, stockL, outOfStock, listed, returnGift } */
function listOverridesMap(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, {});
    });
  }
  pool
    .query(
      "SELECT product_id, price_s, price_m, price_l, stock_s, stock_m, stock_l, out_of_stock, listed, return_gift FROM catalog_price_overrides ORDER BY product_id"
    )
    .then(function (r) {
      var m = {};
      r.rows.forEach(function (row) {
        var pid = String(row.product_id != null ? row.product_id : "").trim();
        if (!pid) return;
        m[pid] = {
          s: row.price_s != null ? Number(row.price_s) : null,
          m: row.price_m != null ? Number(row.price_m) : null,
          l: row.price_l != null ? Number(row.price_l) : null,
          stockS: row.stock_s != null ? Number(row.stock_s) : null,
          stockM: row.stock_m != null ? Number(row.stock_m) : null,
          stockL: row.stock_l != null ? Number(row.stock_l) : null,
          outOfStock: row.out_of_stock === true,
          listed: row.listed !== false,
          returnGift: row.return_gift === true,
        };
      });
      cb(null, m);
    })
    .catch(cb);
}

function resolveBasePrices(productId, cb) {
  var id = String(productId || "").trim().slice(0, 220);
  if (!id) {
    return process.nextTick(function () {
      cb(new Error("productId required"));
    });
  }
  try {
    var list = catalogFromData.getProductsSummary();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        var p = list[i].prices || {};
        return process.nextTick(function () {
          cb(null, {
            s: Number(p.s) || 0,
            m: Number(p.m) || 0,
            l: Number(p.l) || 0,
          });
        });
      }
    }
  } catch (e0) {
    return process.nextTick(function () {
      cb(e0);
    });
  }
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  pool
    .query("SELECT prices FROM products WHERE id = $1 AND is_active = true LIMIT 1", [id])
    .then(function (r) {
      if (!r.rows.length) return cb(new Error("Unknown product id"));
      var prices = r.rows[0].prices;
      if (typeof prices === "string") {
        try {
          prices = JSON.parse(prices);
        } catch (_) {
          prices = {};
        }
      }
      prices = prices || {};
      cb(null, {
        s: Number(prices.s) || 0,
        m: Number(prices.m) || 0,
        l: Number(prices.l) || 0,
      });
    })
    .catch(cb);
}

function mergeStockPatch(cur, patch) {
  var st = {
    s: cur.stockS != null && Number.isFinite(Number(cur.stockS)) ? Number(cur.stockS) : null,
    m: cur.stockM != null && Number.isFinite(Number(cur.stockM)) ? Number(cur.stockM) : null,
    l: cur.stockL != null && Number.isFinite(Number(cur.stockL)) ? Number(cur.stockL) : null,
  };
  if (!patch) return st;
  ["stockS", "stockM", "stockL"].forEach(function (k, i) {
    var letter = k === "stockS" ? "s" : k === "stockM" ? "m" : "l";
    if (!Object.prototype.hasOwnProperty.call(patch, k)) return;
    var v = patch[k];
    if (v === null || v === "" || (typeof v === "string" && !String(v).trim())) {
      st[letter] = null;
      return;
    }
    var n = Number(v);
    if (Number.isFinite(n) && n >= 0) st[letter] = n;
  });
  return st;
}

/**
 * @param {string} productId
 * @param {{ s?: number, m?: number, l?: number, stockS?: number|null|string, stockM?: number|null|string, stockL?: number|null|string, outOfStock?: boolean, listed?: boolean, returnGift?: boolean }} patch
 * @param {(err: Error|null, row?: object) => void} cb
 */
function upsertOverride(productId, patch, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var id = String(productId || "").trim().slice(0, 220);
  if (!id) {
    return process.nextTick(function () {
      cb(new Error("productId required"));
    });
  }
  resolveBasePrices(id, function (e0, base) {
    if (e0) return cb(e0);
    listOverridesMap(function (e1, map) {
      if (e1) return cb(e1);
      var cur = map[id] || {};
      var eff = {
        s: cur.s != null ? Number(cur.s) : Number(base.s) || 0,
        m: cur.m != null ? Number(cur.m) : Number(base.m) || 0,
        l: cur.l != null ? Number(cur.l) : Number(base.l) || 0,
      };
      if (patch) {
        if (patch.s != null && Number.isFinite(Number(patch.s))) eff.s = Number(patch.s);
        if (patch.m != null && Number.isFinite(Number(patch.m))) eff.m = Number(patch.m);
        if (patch.l != null && Number.isFinite(Number(patch.l))) eff.l = Number(patch.l);
      }
      var st = mergeStockPatch(cur, patch);
      var oos = cur.outOfStock === true;
      if (patch && Object.prototype.hasOwnProperty.call(patch, "outOfStock")) {
        oos = !!patch.outOfStock;
      }
      var patchListed = !!(patch && Object.prototype.hasOwnProperty.call(patch, "listed"));
      var listedInsert = patchListed ? !!patch.listed : cur.listed !== false;
      var listedUpdateParam = patchListed ? !!patch.listed : null;
      var rg = cur.returnGift === true;
      if (patch && Object.prototype.hasOwnProperty.call(patch, "returnGift")) {
        rg = !!patch.returnGift;
      }
      pool
        .query(
          "INSERT INTO catalog_price_overrides (product_id, price_s, price_m, price_l, stock_s, stock_m, stock_l, out_of_stock, listed, return_gift) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) " +
            "ON CONFLICT (product_id) DO UPDATE SET price_s = EXCLUDED.price_s, price_m = EXCLUDED.price_m, " +
            "price_l = EXCLUDED.price_l, stock_s = EXCLUDED.stock_s, stock_m = EXCLUDED.stock_m, stock_l = EXCLUDED.stock_l, " +
            "out_of_stock = EXCLUDED.out_of_stock, " +
            "listed = COALESCE($11::boolean, catalog_price_overrides.listed), " +
            "return_gift = EXCLUDED.return_gift, " +
            "updated_at = now() RETURNING product_id, price_s, price_m, price_l, stock_s, stock_m, stock_l, out_of_stock, listed, return_gift, updated_at",
          [id, eff.s, eff.m, eff.l, st.s, st.m, st.l, oos, listedInsert, rg, listedUpdateParam]
        )
        .then(function (r) {
          var row = r.rows[0];
          cb(null, {
            productId: row.product_id,
            prices: {
              s: row.price_s != null ? Number(row.price_s) : null,
              m: row.price_m != null ? Number(row.price_m) : null,
              l: row.price_l != null ? Number(row.price_l) : null,
            },
            stock: {
              s: row.stock_s != null ? Number(row.stock_s) : null,
              m: row.stock_m != null ? Number(row.stock_m) : null,
              l: row.stock_l != null ? Number(row.stock_l) : null,
            },
            outOfStock: row.out_of_stock === true,
            listed: row.listed !== false,
            returnGift: row.return_gift === true,
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
          });
        })
        .catch(cb);
    });
  });
}

module.exports = {
  listOverridesMap: listOverridesMap,
  upsertOverride: upsertOverride,
};
