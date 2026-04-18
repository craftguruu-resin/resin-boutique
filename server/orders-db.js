"use strict";

var poolMod = require("./db/pool.js");
var guestDb = require("./guest-db.js");

function parseGuestSnapshot(raw) {
  var g = raw;
  if (g == null) return {};
  if (typeof g === "string") {
    try {
      g = JSON.parse(g);
    } catch (_) {
      return {};
    }
  }
  if (typeof g !== "object") return {};
  return g;
}

function normalizeSizeKey(it) {
  var raw = it.sizeKey != null ? String(it.sizeKey) : "";
  raw = raw.trim().toLowerCase();
  if (raw === "s" || raw === "m" || raw === "l") return raw;
  var lab = String(it.sizeLabel || "")
    .trim()
    .toLowerCase();
  if (lab.indexOf("compact") === 0) return "s";
  if (lab.indexOf("classic") === 0) return "m";
  if (lab.indexOf("grand") === 0) return "l";
  return "";
}

/**
 * Paid orders only: decrement catalog_price_overrides stock when tracked (non-null).
 * @param {import('pg').PoolClient} client
 * @param {object[]} items — each may have productId, sizeKey, sizeLabel, qty, name
 */
function decrementCatalogStocks(client, items) {
  var seq = Promise.resolve();
  (items || []).forEach(function (it) {
    seq = seq.then(function () {
      var pid = String((it && it.productId) || "").trim().slice(0, 220);
      var sk = normalizeSizeKey(it || {});
      if (!pid || (sk !== "s" && sk !== "m" && sk !== "l")) return Promise.resolve();
      var col = sk === "s" ? "stock_s" : sk === "m" ? "stock_m" : "stock_l";
      var qty = Math.max(1, Math.min(999, Math.floor(Number(it.qty) || 1)));
      return client
        .query(
          "SELECT stock_s, stock_m, stock_l FROM catalog_price_overrides WHERE product_id = $1",
          [pid]
        )
        .then(function (r) {
          if (!r.rows.length) return;
          var v = r.rows[0][col];
          if (v == null) return;
          var num = Number(v);
          if (!Number.isFinite(num)) return;
          if (num < qty) {
            throw new Error(
              "Insufficient stock for " + String((it && it.name) || pid) + " (" + sk.toUpperCase() + "). Available: " + num + ", ordered: " + qty
            );
          }
          return client.query(
            "UPDATE catalog_price_overrides SET " +
              col +
              " = " +
              col +
              " - $2, updated_at = now() WHERE product_id = $1 AND " +
              col +
              " IS NOT NULL",
            [pid, qty]
          );
        });
    });
  });
  return seq;
}

function guestSnapshotObj(guest) {
  return {
    name: guest.name,
    email: guest.email,
    phone: guest.phone,
    addrLine1: guest.addrLine1,
    addrLine2: guest.addrLine2,
    city: guest.city,
    state: guest.state,
    zip: guest.zip,
    country: guest.country,
  };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {object[]} items
 * @returns {Promise<Record<string, string>>}
 */
function resolveSkuMapWithClient(client, items) {
  var ids = [];
  (items || []).forEach(function (it) {
    var id = String((it && it.productId) || "").trim();
    if (id && ids.indexOf(id) < 0) ids.push(id);
  });
  if (!ids.length) return Promise.resolve({});
  return client
    .query(
      "SELECT product_id, MAX(NULLIF(TRIM(sku), '')) AS sku FROM vendor_inventory_items WHERE product_id = ANY($1::varchar[]) GROUP BY product_id",
      [ids]
    )
    .then(function (r) {
      var map = {};
      (r.rows || []).forEach(function (row) {
        if (row.product_id && row.sku) map[String(row.product_id)] = String(row.sku).trim().slice(0, 120);
      });
      return map;
    });
}

/** Resolve SKUs for bill preview (read-only, no transaction). */
function resolveSkuMapPool(items, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, {});
    });
  }
  var ids = [];
  (items || []).forEach(function (it) {
    var id = String((it && it.productId) || "").trim();
    if (id && ids.indexOf(id) < 0) ids.push(id);
  });
  if (!ids.length) {
    return process.nextTick(function () {
      cb(null, {});
    });
  }
  pool.query(
    "SELECT product_id, MAX(NULLIF(TRIM(sku), '')) AS sku FROM vendor_inventory_items WHERE product_id = ANY($1::varchar[]) GROUP BY product_id",
    [ids],
    function (err, r) {
      if (err) return cb(err);
      var map = {};
      (r.rows || []).forEach(function (row) {
        if (row.product_id && row.sku) map[String(row.product_id)] = String(row.sku).trim().slice(0, 120);
      });
      cb(null, map);
    }
  );
}

/**
 * @param {{ guest: object, items: object[], totals: object, orderType: string, tagRef: string }} opts
 * @param {(err: Error|null, order?: object) => void} cb
 */
function createCheckoutParcelOrder(opts, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var guest = opts.guest;
  var items = opts.items;
  var totals = opts.totals;
  var orderType = opts.orderType;
  var tagRef = opts.tagRef;
  var paymentStatus = opts.paymentStatus != null ? String(opts.paymentStatus).slice(0, 40) : "pending_payment";
  var paymentMethod = opts.paymentMethod != null ? String(opts.paymentMethod).slice(0, 40) : "";
  var snap = guestSnapshotObj(guest);

  var client;
  pool
    .connect()
    .then(function (c) {
      client = c;
      return client.query("BEGIN");
    })
    .then(function () {
      return guestDb.insertGuestStrictOrAttachAddress(client, guest);
    })
    .then(function (guestId) {
      return resolveSkuMapWithClient(client, items).then(function (skuMap) {
        return client
          .query(
            "INSERT INTO orders (tag_ref, guest_id, order_type, subtotal, shipping, tax, total, guest_snapshot, payment_status, payment_method) " +
              "VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) RETURNING id, created_at",
            [
              tagRef,
              guestId,
              orderType,
              totals.subtotal,
              totals.shipping,
              totals.tax,
              totals.total,
              JSON.stringify(snap),
              paymentStatus,
              paymentMethod,
            ]
          )
          .then(function (ins) {
            var orderId = ins.rows[0].id;
            var createdAt = ins.rows[0].created_at;
            var lineQs = [];
            for (var i = 0; i < items.length; i++) {
              var it = items[i];
              var pid = String((it && it.productId) || "").trim().slice(0, 220);
              var sk = normalizeSizeKey(it || {});
              var sku = String((skuMap && skuMap[pid]) || (it && it.sku) || "").trim().slice(0, 120);
              lineQs.push(
                client.query(
                  "INSERT INTO order_items (order_id, line_index, name, size_label, qty, unit_price, image_url, product_id, size_key, sku) " +
                    "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                  [orderId, i, it.name, it.sizeLabel || "", it.qty, it.unitPrice, it.image || "", pid, sk, sku]
                )
              );
            }
            return Promise.all(lineQs).then(function () {
              var metaBase = { orderId: orderId, createdAt: createdAt, guestId: guestId };
              if (paymentStatus === "paid") {
                return decrementCatalogStocks(client, items).then(function () {
                  return metaBase;
                });
              }
              return metaBase;
            });
          });
      });
    })
    .then(function (meta) {
      return client.query("COMMIT").then(function () {
        return meta;
      });
    })
    .then(function (meta) {
      client.release();
      client = null;
      cb(null, {
        orderId: meta.orderId,
        tagRef: tagRef,
        guestId: meta.guestId != null ? Number(meta.guestId) : null,
        createdAt: new Date(meta.createdAt).toISOString(),
        guest: snap,
        items: items.map(function (it) {
          var pid = String((it && it.productId) || "").trim();
          return {
            name: it.name,
            sizeLabel: it.sizeLabel,
            qty: it.qty,
            unitPrice: it.unitPrice,
            productId: pid,
            sku: String((it && it.sku) || "").trim(),
          };
        }),
        totals: totals,
        orderType: orderType,
        paymentStatus: paymentStatus,
        paymentMethod: paymentMethod,
      });
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

/** @param {(err: Error|null, rows?: object[]) => void} cb */
function getOrdersToday(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var sql =
    "SELECT o.id AS order_id, o.tag_ref, o.created_at, o.order_type, o.subtotal, o.shipping, o.tax, o.total, o.guest_snapshot, " +
    "o.payment_status, o.payment_method, o.fulfillment_status " +
    "FROM orders o " +
    "WHERE (timezone('Asia/Kolkata', o.created_at))::date = (timezone('Asia/Kolkata', now()))::date " +
    "ORDER BY o.created_at DESC";
  pool
    .query(sql)
    .then(function (r) {
      var list = r.rows.map(function (row) {
        var g = parseGuestSnapshot(row.guest_snapshot);
        return {
          orderId: row.order_id,
          tagRef: row.tag_ref,
          createdAt: new Date(row.created_at).toISOString(),
          orderType: row.order_type,
          paymentStatus: row.payment_status,
          paymentMethod: row.payment_method,
          fulfillmentStatus: row.fulfillment_status != null ? row.fulfillment_status : "new",
          guest: { name: g.name, phone: g.phone, email: g.email },
          totals: {
            subtotal: Number(row.subtotal),
            shipping: Number(row.shipping),
            tax: Number(row.tax),
            total: Number(row.total),
          },
        };
      });
      cb(null, list);
    })
    .catch(cb);
}

/** @param {(err: Error|null, order?: object|null) => void} cb */
function getOrderById(orderId, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var want = Number(orderId);
  if (!Number.isFinite(want)) {
    return process.nextTick(function () {
      cb(null, null);
    });
  }
  pool
    .query("SELECT * FROM orders WHERE id = $1", [want])
    .then(function (r) {
      if (!r.rows.length) {
        cb(null, null);
        return Promise.resolve();
      }
      var o = r.rows[0];
      return pool
        .query(
          "SELECT name, size_label AS \"sizeLabel\", qty, unit_price AS \"unitPrice\", image_url AS image, " +
            "product_id AS \"productId\", size_key AS \"sizeKey\", sku " +
            "FROM order_items WHERE order_id = $1 ORDER BY line_index",
          [want]
        )
        .then(function (ir) {
          var guest = parseGuestSnapshot(o.guest_snapshot);
          var items = ir.rows.map(function (x) {
            return {
              name: x.name,
              sizeLabel: x.sizeLabel,
              qty: x.qty,
              unitPrice: Number(x.unitPrice),
              image: x.image,
              productId: x.productId != null ? String(x.productId) : "",
              sizeKey: x.sizeKey != null ? String(x.sizeKey) : "",
              sku: x.sku != null ? String(x.sku) : "",
            };
          });
          cb(null, {
            orderId: o.id,
            tagRef: o.tag_ref,
            createdAt: new Date(o.created_at).toISOString(),
            orderType: o.order_type,
            paymentStatus: o.payment_status != null ? o.payment_status : "pending_payment",
            paymentMethod: o.payment_method != null ? o.payment_method : "",
            fulfillmentStatus: o.fulfillment_status != null ? o.fulfillment_status : "new",
            guest: {
              name: guest.name,
              email: guest.email,
              phone: guest.phone,
              addrLine1: guest.addrLine1,
              addrLine2: guest.addrLine2,
              city: guest.city,
              state: guest.state,
              zip: guest.zip,
              country: guest.country,
            },
            items: items,
            totals: {
              subtotal: Number(o.subtotal),
              shipping: Number(o.shipping),
              tax: Number(o.tax),
              total: Number(o.total),
            },
          });
        });
    })
    .catch(cb);
}

/** @param {(err: Error|null, rows?: object[]) => void} cb */
function getOrdersRecent(limit, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var lim = Math.max(1, Math.min(200, Math.floor(Number(limit) || 40)));
  var sql =
    "SELECT o.id AS order_id, o.tag_ref, o.created_at, o.order_type, o.subtotal, o.shipping, o.tax, o.total, o.guest_snapshot, " +
    "o.payment_status, o.payment_method, o.fulfillment_status " +
    "FROM orders o ORDER BY o.created_at DESC LIMIT $1";
  pool
    .query(sql, [lim])
    .then(function (r) {
      var list = r.rows.map(function (row) {
        var g = parseGuestSnapshot(row.guest_snapshot);
        return {
          orderId: row.order_id,
          tagRef: row.tag_ref,
          createdAt: new Date(row.created_at).toISOString(),
          orderType: row.order_type,
          paymentStatus: row.payment_status,
          paymentMethod: row.payment_method,
          fulfillmentStatus: row.fulfillment_status != null ? row.fulfillment_status : "new",
          guest: { name: g.name, phone: g.phone, email: g.email },
          totals: {
            subtotal: Number(row.subtotal),
            shipping: Number(row.shipping),
            tax: Number(row.tax),
            total: Number(row.total),
          },
        };
      });
      cb(null, list);
    })
    .catch(cb);
}

/** Last 6 calendar months in Asia/Kolkata: paid revenue (payment_status = paid) and order counts (all orders). */
function getVendorMonthlySummary(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var sqlPaid =
    "SELECT to_char(timezone('Asia/Kolkata', created_at), 'YYYY-MM') AS month_key, " +
    "COALESCE(SUM(total), 0)::numeric AS paid_total, COUNT(*)::int AS paid_count " +
    "FROM orders WHERE payment_status = 'paid' " +
    "AND created_at >= now() - interval '8 months' " +
    "GROUP BY 1 ORDER BY 1";
  var sqlAll =
    "SELECT to_char(timezone('Asia/Kolkata', created_at), 'YYYY-MM') AS month_key, " +
    "COUNT(*)::int AS order_count " +
    "FROM orders WHERE created_at >= now() - interval '8 months' " +
    "GROUP BY 1 ORDER BY 1";
  Promise.all([pool.query(sqlPaid), pool.query(sqlAll)])
    .then(function (pair) {
      var paidRows = pair[0].rows;
      var allRows = pair[1].rows;
      var allMap = {};
      allRows.forEach(function (r) {
        allMap[r.month_key] = Number(r.order_count) || 0;
      });
      var paidMap = {};
      paidRows.forEach(function (r) {
        paidMap[r.month_key] = { total: Number(r.paid_total) || 0, count: Number(r.paid_count) || 0 };
      });
      var keys = Object.keys(allMap).concat(Object.keys(paidMap));
      var monthSet = {};
      keys.forEach(function (k) {
        monthSet[k] = true;
      });
      var sorted = Object.keys(monthSet).sort();
      var last6 = sorted.slice(-6);
      var months = last6.map(function (mk) {
        var p = paidMap[mk] || { total: 0, count: 0 };
        return {
          monthKey: mk,
          paidTotal: p.total,
          paidOrderCount: p.count,
          allOrderCount: allMap[mk] || 0,
        };
      });
      cb(null, { months: months });
    })
    .catch(cb);
}

var FULFILLMENT_OK = { new: 1, packed: 1, shipping: 1, shipped: 1, delivered: 1, cancelled: 1 };

/** @param {(err: Error|null, out?: object) => void} cb */
function updateOrderFulfillment(orderId, status, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var id = Number(orderId);
  var s = String(status || "").trim();
  if (!Number.isFinite(id) || !FULFILLMENT_OK[s]) {
    return process.nextTick(function () {
      cb(new Error("Invalid order or fulfillment status"));
    });
  }
  pool
    .query("UPDATE orders SET fulfillment_status = $1 WHERE id = $2 RETURNING id", [s, id])
    .then(function (r) {
      if (!r.rows.length) return cb(new Error("Order not found"));
      cb(null, { orderId: id, fulfillmentStatus: s });
    })
    .catch(cb);
}

/**
 * Dashboard KPIs (IST) + 7-day paid sparkline + recent paid orders.
 * @param {(err: Error|null, out?: object) => void} cb
 */
function getVendorDashboardSummary(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var istToday =
    "(timezone('Asia/Kolkata', o.created_at))::date = (timezone('Asia/Kolkata', now()))::date";
  var istMonth =
    "date_trunc('month', timezone('Asia/Kolkata', o.created_at)) = date_trunc('month', timezone('Asia/Kolkata', now()))";
  var qPaidToday =
    "SELECT COALESCE(SUM(o.total), 0)::numeric AS s, COUNT(*)::int AS c FROM orders o WHERE o.payment_status = 'paid' AND " +
    istToday;
  var qOrdersToday = "SELECT COUNT(*)::int AS c FROM orders o WHERE " + istToday;
  var qPaidMonth =
    "SELECT COALESCE(SUM(o.total), 0)::numeric AS s, COUNT(*)::int AS c FROM orders o WHERE o.payment_status = 'paid' AND " +
    istMonth;
  var qPending = "SELECT COUNT(*)::int AS c FROM orders o WHERE o.payment_status = 'pending_payment'";
  var qSpark =
    "WITH days AS ( " +
    "SELECT to_char(d, 'YYYY-MM-DD') AS d_key FROM generate_series( " +
    "(timezone('Asia/Kolkata', now()))::date - interval '6 days', " +
    "(timezone('Asia/Kolkata', now()))::date, " +
    "interval '1 day' " +
    ") AS g(d) " +
    ") " +
    "SELECT d.d_key, COALESCE(SUM(o.total), 0)::numeric AS t " +
    "FROM days d " +
    "LEFT JOIN orders o ON to_char((timezone('Asia/Kolkata', o.created_at))::date, 'YYYY-MM-DD') = d.d_key " +
    "AND o.payment_status = 'paid' " +
    "GROUP BY d.d_key ORDER BY d.d_key";
  var qRecent =
    "SELECT id, tag_ref, total, created_at, fulfillment_status FROM orders WHERE payment_status = 'paid' " +
    "ORDER BY created_at DESC LIMIT 8";
  var qFulfill =
    "SELECT o.fulfillment_status, COUNT(*)::int AS c FROM orders o WHERE o.payment_status = 'paid' " +
    "AND o.created_at >= now() - interval '30 days' GROUP BY o.fulfillment_status";

  Promise.all([
    pool.query(qPaidToday),
    pool.query(qOrdersToday),
    pool.query(qPaidMonth),
    pool.query(qPending),
    pool.query(qSpark),
    pool.query(qRecent),
    pool.query(qFulfill),
  ])
    .then(function (rows) {
      var paidT = rows[0].rows[0] || {};
      var allToday = rows[1].rows[0] || {};
      var paidM = rows[2].rows[0] || {};
      var pend = rows[3].rows[0] || {};
      var sparkRows = rows[4].rows;
      var recent = rows[5].rows;
      var fulRows = rows[6].rows;

      var sparkline7dPaid = sparkRows.map(function (r) {
        return Number(r.t) || 0;
      });

      var fulfill = {};
      fulRows.forEach(function (r) {
        fulfill[r.fulfillment_status || "new"] = Number(r.c) || 0;
      });

      var notifications = recent.map(function (r) {
        return {
          kind: "success",
          title: "Paid order #" + r.id,
          message: "Tag " + (r.tag_ref || "") + " · Total " + (Number(r.total) || 0).toFixed(2),
          orderId: r.id,
          createdAt: new Date(r.created_at).toISOString(),
        };
      });

      cb(null, {
        paidRevenueToday: Number(paidT.s) || 0,
        paidOrdersToday: Number(paidT.c) || 0,
        ordersTodayAll: Number(allToday.c) || 0,
        paidRevenueThisMonth: Number(paidM.s) || 0,
        paidOrdersThisMonth: Number(paidM.c) || 0,
        pendingPaymentOrders: Number(pend.c) || 0,
        sparkline7dPaid: sparkline7dPaid,
        fulfillmentLast30d: fulfill,
        recentPaidOrders: recent.map(function (r) {
          return {
            orderId: r.id,
            tagRef: r.tag_ref,
            total: Number(r.total),
            createdAt: new Date(r.created_at).toISOString(),
            fulfillmentStatus: r.fulfillment_status || "new",
          };
        }),
        notifications: notifications,
      });
    })
    .catch(cb);
}

/** @param {number} guestId */
function listOrdersByGuestId(guestId, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var gid = Number(guestId);
  if (!Number.isFinite(gid) || gid < 1) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  pool
    .query(
      "SELECT o.id AS \"orderId\", o.tag_ref AS \"tagRef\", o.created_at AS \"createdAt\", o.order_type AS \"orderType\", " +
        "o.subtotal, o.shipping, o.tax, o.total, o.payment_status AS \"paymentStatus\", o.payment_method AS \"paymentMethod\", " +
        "o.fulfillment_status AS \"fulfillmentStatus\", o.guest_snapshot, " +
        "COALESCE(" +
        "json_agg(" +
        "json_build_object(" +
        "'name', i.name, 'sizeLabel', i.size_label, 'qty', i.qty, 'unitPrice', i.unit_price, " +
        "'image', i.image_url, 'productId', i.product_id, 'sizeKey', i.size_key, 'sku', i.sku" +
        ") ORDER BY i.line_index NULLS LAST" +
        ") FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items " +
        "FROM orders o " +
        "LEFT JOIN order_items i ON i.order_id = o.id " +
        "WHERE o.guest_id = $1 " +
        "GROUP BY o.id " +
        "ORDER BY o.created_at DESC LIMIT 80",
      [gid]
    )
    .then(function (r) {
      var list = (r.rows || []).map(function (row) {
        var guest = parseGuestSnapshot(row.guest_snapshot);
        var rawItems = row.items;
        if (typeof rawItems === "string") {
          try {
            rawItems = JSON.parse(rawItems);
          } catch (_) {
            rawItems = [];
          }
        }
        if (!Array.isArray(rawItems)) rawItems = [];
        var items = rawItems.map(function (it) {
          return {
            name: it.name != null ? String(it.name) : "",
            sizeLabel: it.sizeLabel != null ? String(it.sizeLabel) : "",
            qty: Number(it.qty) || 0,
            unitPrice: Number(it.unitPrice) || 0,
            image: it.image != null ? String(it.image) : "",
            productId: it.productId != null ? String(it.productId) : "",
            sizeKey: it.sizeKey != null ? String(it.sizeKey) : "",
            sku: it.sku != null ? String(it.sku) : "",
          };
        });
        return {
          orderId: row.orderId,
          tagRef: row.tagRef,
          createdAt: new Date(row.createdAt).toISOString(),
          orderType: row.orderType != null ? String(row.orderType) : "",
          paymentStatus: row.paymentStatus,
          paymentMethod: row.paymentMethod != null ? String(row.paymentMethod) : "",
          fulfillmentStatus: row.fulfillmentStatus != null ? row.fulfillmentStatus : "new",
          guest: {
            name: guest.name,
            email: guest.email,
            phone: guest.phone,
            addrLine1: guest.addrLine1,
            addrLine2: guest.addrLine2,
            city: guest.city,
            state: guest.state,
            zip: guest.zip,
            country: guest.country,
          },
          totals: {
            subtotal: Number(row.subtotal),
            shipping: Number(row.shipping),
            tax: Number(row.tax),
            total: Number(row.total),
          },
          items: items,
        };
      });
      cb(null, list);
    })
    .catch(cb);
}

/** Guest may cancel only unpaid orders still in "new" fulfillment. */
function cancelGuestOrder(guestId, orderId, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var gid = Number(guestId);
  var oid = Number(orderId);
  if (!Number.isFinite(gid) || !Number.isFinite(oid)) {
    return process.nextTick(function () {
      cb(new Error("Invalid order"));
    });
  }
  pool
    .query(
      "UPDATE orders SET fulfillment_status = 'cancelled' " +
        "WHERE id = $1 AND guest_id = $2 AND payment_status = 'pending_payment' AND fulfillment_status = 'new' " +
        "RETURNING id",
      [oid, gid]
    )
    .then(function (r) {
      if (!r.rows.length) {
        return cb(new Error("Order cannot be cancelled (already paid, shipped, or cancelled)."));
      }
      cb(null, { orderId: oid, fulfillmentStatus: "cancelled" });
    })
    .catch(cb);
}

module.exports = {
  createCheckoutParcelOrder,
  getOrdersToday,
  getOrderById,
  getOrdersRecent,
  getVendorMonthlySummary,
  getVendorDashboardSummary,
  updateOrderFulfillment,
  listOrdersByGuestId,
  cancelGuestOrder,
  resolveSkuMapPool: resolveSkuMapPool,
};
