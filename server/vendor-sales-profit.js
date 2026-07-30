"use strict";

var poolMod = require("./db/pool.js");
var vendorCatalogDb = require("./vendor-catalog-db.js");

var RAZORPAY_FEE_RATE = 0.025;

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

function parseLineExtra(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }
  return typeof raw === "object" ? raw : {};
}

function findOptionCost(list, id) {
  if (!id || !Array.isArray(list)) return null;
  var sid = String(id);
  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    if (!row || String(row.id) !== sid) continue;
    if (row.costInr != null && Number.isFinite(Number(row.costInr))) return Number(row.costInr);
  }
  return null;
}

function resolveUnitCost(productId, sizeKey, sizeLabel, lineExtra, ov) {
  ov = ov || {};
  var le = lineExtra && typeof lineExtra === "object" ? lineExtra : {};
  var opt = ov.options && typeof ov.options === "object" ? ov.options : {};

  var sizeId = le.vendorSid || le.vendorSizeId || le.sizeId || sizeKey;
  if (opt.useSize) {
    var szCost = findOptionCost(opt.sizes, sizeId);
    if (szCost != null) return szCost;
  }

  var qtyId = le.qtyOptionId || le.packId || le.qtyId;
  if (qtyId) {
    var qtyCost = findOptionCost(opt.qtyOptions, qtyId);
    if (qtyCost != null) return qtyCost;
  }

  var colorId = le.colorId || le.colourId;
  if (colorId) {
    var colCost = findOptionCost(opt.colors, colorId);
    if (colCost != null) return colCost;
  }

  var slot = normalizeSizeKey({ sizeKey: sizeKey, sizeLabel: sizeLabel, stockSlot: le.stockSlot });
  if (slot === "s" && ov.costS != null && Number.isFinite(Number(ov.costS))) return Number(ov.costS);
  if (slot === "m" && ov.costM != null && Number.isFinite(Number(ov.costM))) return Number(ov.costM);
  if (slot === "l" && ov.costL != null && Number.isFinite(Number(ov.costL))) return Number(ov.costL);

  if (ov.costM != null && Number.isFinite(Number(ov.costM))) return Number(ov.costM);
  if (ov.costS != null && Number.isFinite(Number(ov.costS))) return Number(ov.costS);
  if (ov.costL != null && Number.isFinite(Number(ov.costL))) return Number(ov.costL);
  return 0;
}

function periodSqlFilter(period) {
  var p = String(period || "monthly").toLowerCase();
  if (p === "daily") {
    return "(timezone('Asia/Kolkata', o.created_at))::date = (timezone('Asia/Kolkata', now()))::date";
  }
  if (p === "weekly") {
    return "(timezone('Asia/Kolkata', o.created_at))::date >= (timezone('Asia/Kolkata', now()))::date - interval '6 days'";
  }
  if (p === "yearly") {
    return "date_trunc('year', timezone('Asia/Kolkata', o.created_at)) = date_trunc('year', timezone('Asia/Kolkata', now()))";
  }
  return "date_trunc('month', timezone('Asia/Kolkata', o.created_at)) = date_trunc('month', timezone('Asia/Kolkata', now()))";
}

function chartQueries() {
  return {
    daily:
      "SELECT to_char(g.d, 'YYYY-MM-DD') AS d_key, COUNT(DISTINCT o.id)::int AS oc, COALESCE(SUM(oi.qty * oi.unit_price), 0)::numeric AS amt " +
      "FROM generate_series((timezone('Asia/Kolkata', now()))::date - interval '13 days', (timezone('Asia/Kolkata', now()))::date, interval '1 day') AS g(d) " +
      "LEFT JOIN orders o ON (timezone('Asia/Kolkata', o.created_at))::date = g.d AND o.payment_status = 'paid' " +
      "LEFT JOIN order_items oi ON oi.order_id = o.id " +
      "GROUP BY 1 ORDER BY 1",
    monthly:
      "SELECT to_char(g.d, 'FMFMDD') AS d_key, COUNT(DISTINCT o.id)::int AS oc, COALESCE(SUM(oi.qty * oi.unit_price), 0)::numeric AS amt " +
      "FROM generate_series(date_trunc('month', timezone('Asia/Kolkata', now()))::date, (date_trunc('month', timezone('Asia/Kolkata', now())) + interval '1 month - 1 day')::date, interval '1 day') AS g(d) " +
      "LEFT JOIN orders o ON (timezone('Asia/Kolkata', o.created_at))::date = g.d AND o.payment_status = 'paid' " +
      "LEFT JOIN order_items oi ON oi.order_id = o.id " +
      "GROUP BY g.d ORDER BY g.d",
    weekly:
      "SELECT to_char(date_trunc('week', timezone('Asia/Kolkata', o.created_at)), 'YYYY-MM-DD') AS d_key, COUNT(DISTINCT o.id)::int AS oc, COALESCE(SUM(oi.qty * oi.unit_price), 0)::numeric AS amt " +
      "FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.payment_status = 'paid' AND o.created_at >= now() - interval '56 days' GROUP BY 1 ORDER BY 1",
    yearly:
      "SELECT to_char(g.m, 'Mon') AS d_key, COUNT(DISTINCT o.id)::int AS oc, COALESCE(SUM(oi.qty * oi.unit_price), 0)::numeric AS amt " +
      "FROM generate_series(date_trunc('year', timezone('Asia/Kolkata', now())), date_trunc('month', timezone('Asia/Kolkata', now())), interval '1 month') AS g(m) " +
      "LEFT JOIN orders o ON date_trunc('month', timezone('Asia/Kolkata', o.created_at)) = g.m AND o.payment_status = 'paid' " +
      "LEFT JOIN order_items oi ON oi.order_id = o.id GROUP BY g.m ORDER BY g.m",
  };
}

function buildLineMetrics(row, ovMap) {
  var qty = Number(row.qty) || 0;
  var unitPrice = Number(row.unit_price) || 0;
  var revenue = Math.round(unitPrice * qty * 100) / 100;
  var razorpayFee = Math.round(revenue * RAZORPAY_FEE_RATE * 100) / 100;
  var le = parseLineExtra(row.line_extra);
  var unitCost = resolveUnitCost(row.product_id, row.size_key, row.size_label, le, ovMap[row.product_id]);
  var totalCost = Math.round(unitCost * qty * 100) / 100;
  var profit = Math.round((revenue - razorpayFee - totalCost) * 100) / 100;
  return {
    orderId: row.order_id,
    tagRef: row.tag_ref,
    soldAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    productId: row.product_id || "",
    name: row.name || "",
    sizeLabel: row.size_label || "",
    qty: qty,
    unitPrice: unitPrice,
    revenue: revenue,
    razorpayFee: razorpayFee,
    unitCost: unitCost,
    totalCost: totalCost,
    profit: profit,
  };
}

/**
 * @param {string} period — daily | weekly | monthly | yearly
 * @param {(err: Error|null, data?: object) => void} cb
 */
function getSalesProfitInsights(period, cb) {
  var p = String(period || "monthly").toLowerCase();
  if (p !== "daily" && p !== "weekly" && p !== "monthly" && p !== "yearly") p = "monthly";
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }

  var where = periodSqlFilter(p);
  var qLines =
    "SELECT oi.product_id, oi.name, oi.size_key, oi.size_label, oi.qty, oi.unit_price, oi.line_extra, " +
    "o.id AS order_id, o.tag_ref, o.created_at " +
    "FROM order_items oi JOIN orders o ON o.id = oi.order_id " +
    "WHERE o.payment_status = 'paid' AND " +
    where +
    " ORDER BY o.created_at DESC LIMIT 5000";

  vendorCatalogDb.listOverridesMap(function (eMap, ovMap) {
    if (eMap) return cb(eMap);
    ovMap = ovMap || {};

    var charts = chartQueries();
    Promise.all([pool.query(qLines), pool.query(charts[p] || charts.monthly)])
      .then(function (res) {
        var lines = res[0].rows || [];
        var metrics = lines.map(function (row) {
          return buildLineMetrics(row, ovMap);
        });

        var totals = metrics.reduce(
          function (acc, m) {
            acc.revenue += m.revenue;
            acc.razorpayFee += m.razorpayFee;
            acc.totalCost += m.totalCost;
            acc.profit += m.profit;
            acc.qty += m.qty;
            return acc;
          },
          { revenue: 0, razorpayFee: 0, totalCost: 0, profit: 0, qty: 0 }
        );
        totals.revenue = Math.round(totals.revenue * 100) / 100;
        totals.razorpayFee = Math.round(totals.razorpayFee * 100) / 100;
        totals.totalCost = Math.round(totals.totalCost * 100) / 100;
        totals.profit = Math.round(totals.profit * 100) / 100;

        var byProduct = Object.create(null);
        metrics.forEach(function (m) {
          var key = m.productId || m.name;
          if (!byProduct[key]) {
            byProduct[key] = {
              productId: m.productId,
              name: m.name,
              qty: 0,
              revenue: 0,
              razorpayFee: 0,
              totalCost: 0,
              profit: 0,
            };
          }
          var bp = byProduct[key];
          bp.qty += m.qty;
          bp.revenue += m.revenue;
          bp.razorpayFee += m.razorpayFee;
          bp.totalCost += m.totalCost;
          bp.profit += m.profit;
        });
        var productRows = Object.keys(byProduct)
          .map(function (k) {
            var r = byProduct[k];
            r.revenue = Math.round(r.revenue * 100) / 100;
            r.razorpayFee = Math.round(r.razorpayFee * 100) / 100;
            r.totalCost = Math.round(r.totalCost * 100) / 100;
            r.profit = Math.round(r.profit * 100) / 100;
            return r;
          })
          .sort(function (a, b) {
            return b.profit - a.profit;
          });

        var chartRows = res[1].rows || [];
        var chartLabels = chartRows.map(function (r) {
          return String(r.d_key || "");
        });
        var chartRevenue = chartRows.map(function (r) {
          return Math.round((Number(r.amt) || 0) * 100) / 100;
        });
        var chartProfit = chartLabels.map(function () {
          return 0;
        });
        if (p === "daily" || p === "monthly") {
          var bucket = Object.create(null);
          metrics.forEach(function (m) {
            if (!m.soldAt) return;
            var d = new Date(m.soldAt);
            var key =
              p === "daily"
                ? d.toISOString().slice(0, 10)
                : String(d.getDate());
            if (!bucket[key]) bucket[key] = { revenue: 0, profit: 0 };
            bucket[key].revenue += m.revenue;
            bucket[key].profit += m.profit;
          });
          chartProfit = chartLabels.map(function (lbl, idx) {
            var k = p === "daily" ? lbl : lbl.replace(/^0?/, "");
            var b = bucket[lbl] || bucket[k];
            return b ? Math.round(b.profit * 100) / 100 : 0;
          });
        } else {
          chartProfit = chartRevenue.map(function (rev) {
            return Math.round((rev - rev * RAZORPAY_FEE_RATE) * 100) / 100;
          });
        }

        cb(null, {
          period: p,
          razorpayFeeRate: RAZORPAY_FEE_RATE,
          totals: totals,
          productRows: productRows,
          lineRows: metrics.slice(0, 200),
          charts: {
            labels: chartLabels,
            revenue: chartRevenue,
            profitEstimate: chartProfit,
          },
        });
      })
      .catch(cb);
  });
}

module.exports = {
  getSalesProfitInsights: getSalesProfitInsights,
  RAZORPAY_FEE_RATE: RAZORPAY_FEE_RATE,
};
