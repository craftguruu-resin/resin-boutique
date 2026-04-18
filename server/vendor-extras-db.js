"use strict";

var poolMod = require("./db/pool.js");
var schemaHotfix = require("./db/schema-hotfix.js");
var vendorCatalogDb = require("./vendor-catalog-db.js");

var INVENTORY_JOINED_FROM =
  "FROM vendor_inventory_items v " +
  "LEFT JOIN categories c ON c.id = v.category_id " +
  "LEFT JOIN products p ON p.id = v.product_id " +
  "LEFT JOIN catalog_price_overrides co ON co.product_id = v.product_id AND v.product_id IS NOT NULL AND v.product_id <> '' ";

var INVENTORY_SELECT =
  "SELECT v.id, v.name, v.sku, v.category_id, v.product_id, v.quantity, v.qty_s, v.qty_m, v.qty_l, v.reorder_point, v.unit_cost, v.supplier, v.notes, v.updated_at, " +
  "c.label AS category_label, p.name AS product_name, " +
  "co.price_s AS catalog_price_s, co.price_m AS catalog_price_m, co.price_l AS catalog_price_l, " +
  "co.stock_s AS catalog_stock_s, co.stock_m AS catalog_stock_m, co.stock_l AS catalog_stock_l " +
  INVENTORY_JOINED_FROM;

function withVendorInventorySchema(cb) {
  schemaHotfix.ensureVendorInventoryColumns().then(function () {
    cb(null);
  }, cb);
}

/**
 * Sum per-size qty columns on studio rows; if all zero, fall back to legacy quantity total (same value on S/M/L for display).
 * @param {string[]} ids product_id values
 * @param {(err: Error|null, map?: Record<string, { s: number|null, m: number|null, l: number|null }>) => void} cb
 */
function aggregateSellableStockByProductIds(ids, cb) {
  var pool = poolMod.getPool();
  if (!pool || !ids || !ids.length) {
    return process.nextTick(function () {
      cb(null, {});
    });
  }
  var uniq = [];
  ids.forEach(function (id) {
    var s = String(id || "").trim();
    if (s && uniq.indexOf(s) === -1) uniq.push(s);
  });
  if (!uniq.length) {
    return process.nextTick(function () {
      cb(null, {});
    });
  }
  pool
    .query(
      "SELECT product_id, " +
        "SUM(COALESCE(qty_s, 0))::numeric AS qs, " +
        "SUM(COALESCE(qty_m, 0))::numeric AS qm, " +
        "SUM(COALESCE(qty_l, 0))::numeric AS ql, " +
        "SUM(COALESCE(quantity, 0))::numeric AS qtot " +
        "FROM vendor_inventory_items " +
        "WHERE product_id <> '' AND product_id = ANY($1::varchar[]) " +
        "GROUP BY product_id",
      [uniq]
    )
    .then(function (r) {
      var out = {};
      r.rows.forEach(function (row) {
        var pid = String(row.product_id || "").trim();
        if (!pid) return;
        var qs = Number(row.qs) || 0;
        var qm = Number(row.qm) || 0;
        var ql = Number(row.ql) || 0;
        var qt = Number(row.qtot) || 0;
        if (qs + qm + ql > 0) {
          out[pid] = { s: qs, m: qm, l: ql };
        } else if (qt > 0) {
          out[pid] = { s: qt, m: qt, l: qt };
        }
      });
      cb(null, out);
    })
    .catch(cb);
}

/**
 * One representative SKU per product_id from studio inventory rows (vendor search UIs).
 * @param {string[]} ids
 * @param {(err: Error|null, map?: Record<string, string>) => void} cb
 */
function getSkuMapForProductIds(ids, cb) {
  var pool = poolMod.getPool();
  if (!pool || !ids || !ids.length) {
    return process.nextTick(function () {
      cb(null, {});
    });
  }
  var uniq = [];
  ids.forEach(function (id) {
    var s = String(id || "").trim();
    if (s && uniq.indexOf(s) === -1) uniq.push(s);
  });
  if (!uniq.length) {
    return process.nextTick(function () {
      cb(null, {});
    });
  }
  pool
    .query(
      "SELECT product_id, MAX(NULLIF(TRIM(sku), '')) AS sku FROM vendor_inventory_items " +
        "WHERE COALESCE(TRIM(product_id), '') <> '' AND product_id = ANY($1::varchar[]) GROUP BY product_id",
      [uniq]
    )
    .then(function (r) {
      var out = {};
      r.rows.forEach(function (row) {
        var pid = String(row.product_id || "").trim();
        if (pid && row.sku) out[pid] = String(row.sku).trim().slice(0, 120);
      });
      cb(null, out);
    })
    .catch(cb);
}

function rowInventory(r) {
  var out = {
    id: String(r.id),
    name: r.name,
    sku: r.sku || "",
    categoryId: r.category_id != null ? String(r.category_id) : "",
    productId: r.product_id != null ? String(r.product_id) : "",
    categoryLabel: r.category_label != null ? String(r.category_label) : "",
    productName: r.product_name != null ? String(r.product_name) : "",
    quantity: Number(r.quantity),
    qtyS: r.qty_s != null && Number.isFinite(Number(r.qty_s)) ? Number(r.qty_s) : null,
    qtyM: r.qty_m != null && Number.isFinite(Number(r.qty_m)) ? Number(r.qty_m) : null,
    qtyL: r.qty_l != null && Number.isFinite(Number(r.qty_l)) ? Number(r.qty_l) : null,
    reorderPoint: Number(r.reorder_point),
    unitCost: Number(r.unit_cost),
    supplier: r.supplier || "",
    notes: r.notes || "",
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
  if (r.catalog_price_s != null || r.catalog_price_m != null || r.catalog_price_l != null) {
    out.catalogPrices = {
      s: r.catalog_price_s != null ? Number(r.catalog_price_s) : null,
      m: r.catalog_price_m != null ? Number(r.catalog_price_m) : null,
      l: r.catalog_price_l != null ? Number(r.catalog_price_l) : null,
    };
  }
  if (r.catalog_stock_s != null || r.catalog_stock_m != null || r.catalog_stock_l != null) {
    out.catalogStock = {
      s: r.catalog_stock_s != null ? Number(r.catalog_stock_s) : null,
      m: r.catalog_stock_m != null ? Number(r.catalog_stock_m) : null,
      l: r.catalog_stock_l != null ? Number(r.catalog_stock_l) : null,
    };
  }
  return out;
}

/**
 * Build upsertOverride patch from PATCH body + current joined row.
 * Body keys: catalogPriceS/M/L, catalogStockS/M/L (absolute), catalogStockAddS/M/L (delta).
 */
function catalogPatchFromBody(body, row) {
  var b = body || {};
  var patch = {};
  if (b.catalogPriceS !== undefined && b.catalogPriceS !== null && String(b.catalogPriceS).trim() !== "") {
    patch.s = Math.max(0, Number(b.catalogPriceS) || 0);
  }
  if (b.catalogPriceM !== undefined && b.catalogPriceM !== null && String(b.catalogPriceM).trim() !== "") {
    patch.m = Math.max(0, Number(b.catalogPriceM) || 0);
  }
  if (b.catalogPriceL !== undefined && b.catalogPriceL !== null && String(b.catalogPriceL).trim() !== "") {
    patch.l = Math.max(0, Number(b.catalogPriceL) || 0);
  }
  function curStock(letter) {
    var k = letter === "s" ? "catalog_stock_s" : letter === "m" ? "catalog_stock_m" : "catalog_stock_l";
    var v = row[k];
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  }
  function applyStock(letter, addKey, setKey, outK) {
    var addRaw = b[addKey];
    var hasAdd = addRaw !== undefined && addRaw !== null && String(addRaw).trim() !== "" && Number(addRaw) !== 0;
    if (hasAdd) {
      var base = curStock(letter);
      if (base == null) base = 0;
      patch[outK] = Math.max(0, base + Number(addRaw));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(b, setKey)) {
      var raw = b[setKey];
      if (raw === null || raw === "" || (typeof raw === "string" && !String(raw).trim())) {
        patch[outK] = null;
      } else {
        patch[outK] = Math.max(0, Number(raw));
      }
    }
  }
  applyStock("s", "catalogStockAddS", "catalogStockS", "stockS");
  applyStock("m", "catalogStockAddM", "catalogStockM", "stockM");
  applyStock("l", "catalogStockAddL", "catalogStockL", "stockL");
  return patch;
}

function fetchInventoryRow(pool, wid, cb) {
  pool
    .query(INVENTORY_SELECT + " WHERE v.id = $1 LIMIT 1", [wid])
    .then(function (r) {
      if (!r.rows.length) return cb(new Error("Not found"));
      cb(null, rowInventory(r.rows[0]));
    })
    .catch(cb);
}

function rowReturn(r) {
  return {
    id: String(r.id),
    orderId: r.order_id,
    status: r.status,
    reason: r.reason || "",
    refundAmount: r.refund_amount != null ? Number(r.refund_amount) : null,
    notes: r.notes || "",
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

/** @param {(err: Error|null, out?: { returnsByStatus: object, lowStockCount: number }) => void} cb */
function getDashboardExtras(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, { returnsByStatus: {}, lowStockCount: 0 });
    });
  }
  Promise.all([
    pool.query("SELECT status, COUNT(*)::int AS n FROM vendor_order_returns GROUP BY status"),
    pool.query(
      "SELECT COUNT(*)::int AS n FROM vendor_inventory_items WHERE reorder_point > 0 AND quantity <= reorder_point"
    ),
  ])
    .then(function (pair) {
      var by = {};
      pair[0].rows.forEach(function (r) {
        by[r.status] = Number(r.n) || 0;
      });
      cb(null, {
        returnsByStatus: by,
        lowStockCount: Number(pair[1].rows[0] && pair[1].rows[0].n) || 0,
      });
    })
    .catch(cb);
}

/** @param {(err: Error|null, list?: object[]) => void} cb */
function countInventoryRows(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, 0);
    });
  }
  pool
    .query("SELECT COUNT(*)::int AS n FROM vendor_inventory_items")
    .then(function (r) {
      cb(null, Number((r.rows[0] && r.rows[0].n) || 0));
    })
    .catch(cb);
}

function listInventory(optsOrCb, maybeCb) {
  var cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb;
  var categoryId =
    typeof optsOrCb === "function" ? "" : String((optsOrCb && optsOrCb.categoryId) || "").trim().slice(0, 80);
  var productId =
    typeof optsOrCb === "function" ? "" : String((optsOrCb && optsOrCb.productId) || "").trim().slice(0, 220);
  var skuQ =
    typeof optsOrCb === "function" ? "" : String((optsOrCb && optsOrCb.sku) || "").trim().slice(0, 120).toLowerCase();
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var sql = INVENTORY_SELECT;
  var wh = [];
  var params = [];
  if (categoryId) {
    wh.push("v.category_id = $" + (params.length + 1));
    params.push(categoryId);
  }
  if (productId) {
    wh.push("v.product_id = $" + (params.length + 1));
    params.push(productId);
  }
  if (skuQ) {
    wh.push("POSITION($" + (params.length + 1) + " IN LOWER(COALESCE(v.sku, ''))) > 0");
    params.push(skuQ);
  }
  wh.push(
    "(COALESCE(TRIM(v.product_id), '') = '' OR p.id IS NULL OR COALESCE(p.is_active, true) = true)"
  );
  if (wh.length) sql += " WHERE " + wh.join(" AND ");
  sql += " ORDER BY v.name ASC";
  withVendorInventorySchema(function (e0) {
    if (e0) return cb(e0);
    pool
      .query(sql, params)
      .then(function (r) {
        cb(null, r.rows.map(rowInventory));
      })
      .catch(cb);
  });
}

/** @param {(err: Error|null, row?: object) => void} cb */
function createInventory(body, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var name = String((body && body.name) || "").trim().slice(0, 300);
  if (!name) return process.nextTick(function () {
    cb(new Error("Name required"));
  });
  var sku = String((body && body.sku) || "").trim().slice(0, 120);
  function parseQtySlot(v) {
    if (v === undefined || v === null || String(v).trim() === "") return null;
    var n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  var qs = parseQtySlot(body && body.quantityS);
  var qm = parseQtySlot(body && body.quantityM);
  var ql = parseQtySlot(body && body.quantityL);
  var hasPerSize = qs !== null || qm !== null || ql !== null;
  var legacyQty = Math.max(0, Number(body && body.quantity) || 0);
  var qty = hasPerSize ? (qs || 0) + (qm || 0) + (ql || 0) : legacyQty;
  var reorder = Math.max(0, Number(body && body.reorderPoint) || 0);
  var cost = Math.max(0, Number(body && body.unitCost) || 0);
  var supplier = String((body && body.supplier) || "").trim().slice(0, 200);
  var notes = body && body.notes != null ? String(body.notes).slice(0, 2000) : "";
  var categoryId = String((body && body.categoryId) || "").trim().slice(0, 80);
  var productId = String((body && body.productId) || "").trim().slice(0, 220);

  function insertRow(finalCategoryId, pid) {
    pool
      .query(
        "INSERT INTO vendor_inventory_items (name, sku, category_id, product_id, quantity, qty_s, qty_m, qty_l, reorder_point, unit_cost, supplier, notes) " +
          "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) " +
          "RETURNING id, name, sku, category_id, product_id, quantity, qty_s, qty_m, qty_l, reorder_point, unit_cost, supplier, notes, updated_at",
        [name, sku, finalCategoryId, pid, qty, qs, qm, ql, reorder, cost, supplier, notes]
      )
      .then(function (r) {
        var ins = r.rows[0];
        var pidStr = String(pid || "").trim();
        if (!pidStr) {
          return cb(null, rowInventory(ins));
        }
        aggregateSellableStockByProductIds([pidStr], function (eAgg, aggMap) {
          if (eAgg) return cb(eAgg);
          var st = (aggMap || {})[pidStr];
          function finishRow() {
            pool
              .query(INVENTORY_SELECT + " WHERE v.id = $1 LIMIT 1", [ins.id])
              .then(function (r2) {
                cb(null, rowInventory(r2.rows[0]));
              })
              .catch(cb);
          }
          if (!st) {
            return finishRow();
          }
          var patch = {
            stockS: st.s,
            stockM: st.m,
            stockL: st.l,
          };
          vendorCatalogDb.upsertOverride(pidStr, patch, function (e2) {
            if (e2) return cb(e2);
            finishRow();
          });
        });
      })
      .catch(cb);
  }

  withVendorInventorySchema(function (e0) {
    if (e0) return cb(e0);
    if (productId) {
      pool
        .query("SELECT id, category_id FROM products WHERE id = $1 AND is_active = true", [productId])
        .then(function (r) {
          if (!r.rows.length) throw new Error("Unknown or inactive product");
          var cid = String(r.rows[0].category_id || "").trim().slice(0, 80);
          if (categoryId && categoryId !== cid) {
            throw new Error("Selected product does not belong to the selected category");
          }
          insertRow(cid || categoryId, productId);
        })
        .catch(cb);
    } else {
      insertRow(categoryId, "");
    }
  });
}

/** @param {(err: Error|null, row?: object) => void} cb */
function updateInventory(id, body, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var wid = Number(id);
  if (!Number.isFinite(wid)) {
    return process.nextTick(function () {
      cb(new Error("Invalid id"));
    });
  }
  var b = body || {};

  function runCatalogThenFinish(finalProductId, existingRow) {
    var catalogPatch = catalogPatchFromBody(b, existingRow || {});
    var hasCatalogPatch = Object.keys(catalogPatch).length > 0;
    if (!hasCatalogPatch) {
      return fetchInventoryRow(pool, wid, cb);
    }
    var pid = String(finalProductId || "").trim();
    if (!pid) {
      return cb(new Error("Link a catalog product before saving storefront prices or per-size stock"));
    }
    vendorCatalogDb.upsertOverride(pid, catalogPatch, function (e2) {
      if (e2) return cb(e2);
      var hasStockPatch = ["stockS", "stockM", "stockL"].some(function (k) {
        return Object.prototype.hasOwnProperty.call(catalogPatch, k);
      });
      function syncRowQtyThenFinish() {
        if (!hasStockPatch) {
          return vendorCatalogDb.listOverridesMap(function (e3, map) {
            if (e3) return cb(e3);
            var st = map[pid] || {};
            var ss = st.stockS != null ? Number(st.stockS) : null;
            var sm = st.stockM != null ? Number(st.stockM) : null;
            var sl = st.stockL != null ? Number(st.stockL) : null;
            if (ss != null && sm != null && sl != null && Number.isFinite(ss) && Number.isFinite(sm) && Number.isFinite(sl)) {
              var sumQ = ss + sm + sl;
              pool
                .query("UPDATE vendor_inventory_items SET quantity = $1, updated_at = now() WHERE id = $2", [sumQ, wid])
                .then(function () {
                  fetchInventoryRow(pool, wid, cb);
                })
                .catch(cb);
            } else {
              fetchInventoryRow(pool, wid, cb);
            }
          });
        }
        var uqs = catalogPatch.stockS;
        var uqm = catalogPatch.stockM;
        var uql = catalogPatch.stockL;
        var sumQ =
          (uqs != null && Number.isFinite(Number(uqs)) ? Number(uqs) : 0) +
          (uqm != null && Number.isFinite(Number(uqm)) ? Number(uqm) : 0) +
          (uql != null && Number.isFinite(Number(uql)) ? Number(uql) : 0);
        pool
          .query(
            "UPDATE vendor_inventory_items SET qty_s = $1, qty_m = $2, qty_l = $3, quantity = $4, updated_at = now() WHERE id = $5",
            [uqs, uqm, uql, sumQ, wid]
          )
          .then(function () {
            fetchInventoryRow(pool, wid, cb);
          })
          .catch(cb);
      }
      syncRowQtyThenFinish();
    });
  }

  function doSqlUpdate(effectiveBody, existingRow, finalProductIdAfter) {
    var fields = [];
    var vals = [];
    var i = 1;
    var eb = effectiveBody || {};
    if (eb.name != null) {
      fields.push("name = $" + i++);
      vals.push(String(eb.name).trim().slice(0, 300));
    }
    if (eb.quantity != null) {
      fields.push("quantity = $" + i++);
      vals.push(Math.max(0, Number(eb.quantity)));
    }
    if (eb.reorderPoint != null) {
      fields.push("reorder_point = $" + i++);
      vals.push(Math.max(0, Number(eb.reorderPoint)));
    }
    if (eb.unitCost != null) {
      fields.push("unit_cost = $" + i++);
      vals.push(Math.max(0, Number(eb.unitCost)));
    }
    if (eb.supplier != null) {
      fields.push("supplier = $" + i++);
      vals.push(String(eb.supplier).trim().slice(0, 200));
    }
    if (eb.notes != null) {
      fields.push("notes = $" + i++);
      vals.push(String(eb.notes).slice(0, 2000));
    }
    if (eb.categoryId != null) {
      fields.push("category_id = $" + i++);
      vals.push(String(eb.categoryId).trim().slice(0, 80));
    }
    if (Object.prototype.hasOwnProperty.call(eb, "productId")) {
      fields.push("product_id = $" + i++);
      vals.push(String(eb.productId || "").trim().slice(0, 220));
    }
    var hasCatalogPatch = Object.keys(catalogPatchFromBody(b, existingRow)).length > 0;
    if (!fields.length) {
      if (!hasCatalogPatch) {
        return process.nextTick(function () {
          cb(new Error("No fields to update"));
        });
      }
      return pool
        .query("UPDATE vendor_inventory_items SET updated_at = now() WHERE id = $1", [wid])
        .then(function () {
          runCatalogThenFinish(finalProductIdAfter, existingRow);
        })
        .catch(cb);
    }
    fields.push("updated_at = now()");
    vals.push(wid);
    var sql =
      "UPDATE vendor_inventory_items SET " +
      fields.join(", ") +
      " WHERE id = $" +
      i +
      " RETURNING id, name, sku, category_id, product_id, quantity, reorder_point, unit_cost, supplier, notes, updated_at";
    pool
      .query(sql, vals)
      .then(function (r) {
        if (!r.rows.length) return cb(new Error("Not found"));
        var retPid = String((r.rows[0].product_id != null && r.rows[0].product_id) || "").trim();
        var usePid = retPid || String(finalProductIdAfter || "").trim();
        runCatalogThenFinish(usePid, existingRow);
      })
      .catch(cb);
  }

  withVendorInventorySchema(function (e0) {
    if (e0) return cb(e0);
    pool
      .query(INVENTORY_SELECT + " WHERE v.id = $1 LIMIT 1", [wid])
      .then(function (r0) {
        if (!r0.rows.length) throw new Error("Not found");
        var existing = r0.rows[0];
        var existingPid = String(existing.product_id || "").trim();
        var bodyHasProductKey = Object.prototype.hasOwnProperty.call(b, "productId");
        var newPid = bodyHasProductKey ? String(b.productId != null ? b.productId : "").trim().slice(0, 220) : null;
        var finalPid = newPid !== null ? newPid : existingPid;
        var catPatch = catalogPatchFromBody(b, existing);
        if (Object.keys(catPatch).length && bodyHasProductKey && !newPid) {
          throw new Error("Cannot save storefront prices/stock while clearing the catalog product link");
        }
        if (!newPid && !existingPid && Object.keys(catPatch).length) {
          throw new Error("Link a catalog product before saving storefront prices or per-size stock");
        }
        if (bodyHasProductKey && !newPid) {
          return doSqlUpdate(Object.assign({}, b, { productId: "" }), existing, "");
        }
        if (finalPid) {
          return pool
            .query("SELECT category_id FROM products WHERE id = $1 AND is_active = true", [finalPid])
            .then(function (pr) {
              if (!pr.rows.length) throw new Error("Unknown or inactive product");
              var cid = String(pr.rows[0].category_id || "").trim().slice(0, 80);
              var wantCat = b.categoryId != null ? String(b.categoryId).trim().slice(0, 80) : "";
              if (wantCat && wantCat !== cid) {
                throw new Error("Selected product does not belong to the selected category");
              }
              var merged = Object.assign({}, b, { categoryId: cid });
              if (bodyHasProductKey) merged.productId = finalPid;
              doSqlUpdate(merged, existing, finalPid);
            });
        }
        doSqlUpdate(b, existing, existingPid);
      })
      .catch(cb);
  });
}

/** @param {(err: Error|null, list?: object[]) => void} cb */
function listReturns(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  pool
    .query(
      "SELECT r.id, r.order_id, r.status, r.reason, r.refund_amount, r.notes, r.created_at, r.updated_at " +
        "FROM vendor_order_returns r ORDER BY r.created_at DESC LIMIT 200"
    )
    .then(function (r) {
      cb(null, r.rows.map(rowReturn));
    })
    .catch(cb);
}

/** @param {(err: Error|null, row?: object) => void} cb */
function createReturn(body, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var oid = Number(body && body.orderId);
  if (!Number.isFinite(oid)) {
    return process.nextTick(function () {
      cb(new Error("orderId required"));
    });
  }
  var reason = String((body && body.reason) || "").trim().slice(0, 800);
  if (!reason) {
    return process.nextTick(function () {
      cb(new Error("reason required"));
    });
  }
  var notes = body && body.notes != null ? String(body.notes).slice(0, 2000) : "";
  var refund = body && body.refundAmount != null && body.refundAmount !== "" ? Number(body.refundAmount) : null;
  pool
    .query("SELECT id FROM orders WHERE id = $1", [oid])
    .then(function (chk) {
      if (!chk.rows.length) throw new Error("Order not found");
      return pool.query(
        "INSERT INTO vendor_order_returns (order_id, status, reason, refund_amount, notes) VALUES ($1, 'pending', $2, $3, $4) RETURNING id, order_id, status, reason, refund_amount, notes, created_at, updated_at",
        [oid, reason, refund != null && Number.isFinite(refund) ? refund : null, notes]
      );
    })
    .then(function (r) {
      cb(null, rowReturn(r.rows[0]));
    })
    .catch(cb);
}

/** @param {(err: Error|null, row?: object) => void} cb */
function updateReturnStatus(id, body, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var rid = Number(id);
  if (!Number.isFinite(rid)) {
    return process.nextTick(function () {
      cb(new Error("Invalid id"));
    });
  }
  var st = String((body && body.status) || "").trim().toLowerCase();
  var allowed = { pending: 1, approved: 1, rejected: 1, received: 1, refunded: 1 };
  if (!allowed[st]) {
    return process.nextTick(function () {
      cb(new Error("Invalid status"));
    });
  }
  var notes = body && body.notes != null ? String(body.notes).slice(0, 2000) : null;
  var q =
    notes != null
      ? "UPDATE vendor_order_returns SET status = $1, notes = COALESCE($2, notes), updated_at = now() WHERE id = $3 RETURNING id, order_id, status, reason, refund_amount, notes, created_at, updated_at"
      : "UPDATE vendor_order_returns SET status = $1, updated_at = now() WHERE id = $2 RETURNING id, order_id, status, reason, refund_amount, notes, created_at, updated_at";
  var params = notes != null ? [st, notes, rid] : [st, rid];
  pool
    .query(q, params)
    .then(function (r) {
      if (!r.rows.length) return cb(new Error("Not found"));
      cb(null, rowReturn(r.rows[0]));
    })
    .catch(cb);
}

module.exports = {
  getDashboardExtras,
  countInventoryRows: countInventoryRows,
  listInventory,
  createInventory,
  updateInventory,
  listReturns,
  createReturn,
  updateReturnStatus,
  aggregateSellableStockByProductIds: aggregateSellableStockByProductIds,
  getSkuMapForProductIds: getSkuMapForProductIds,
};
