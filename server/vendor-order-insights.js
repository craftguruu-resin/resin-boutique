"use strict";

var poolMod = require("./db/pool.js");

/* Vendor graphs are aggregate, read-only reporting data. A short process
   cache prevents a tab click or dashboard refresh from re-running the same
   expensive report against a cold serverless Postgres connection. */
var INSIGHTS_CACHE_MS = Math.max(5_000, Number(process.env.VENDOR_INSIGHTS_CACHE_MS) || 30_000);
var insightCache = Object.create(null);
var insightPending = Object.create(null);

function cloneReport(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {string} period — daily | weekly | monthly (chart preset)
 * @param {(err: Error|null, data?: object) => void} cb
 */
function getVendorOrderInsights(period, cb) {
  var p = String(period || "monthly").toLowerCase();
  if (p !== "daily" && p !== "weekly" && p !== "monthly" && p !== "yearly") p = "monthly";
  var cached = insightCache[p];
  if (cached && cached.expiresAt > Date.now()) {
    return process.nextTick(function () {
      cb(null, cloneReport(cached.data));
    });
  }
  /* The server warms the monthly graph after boot. Without coalescing, a
     vendor arriving during that warm-up opened a second expensive Neon query
     and both requests made the Dashboard look stalled. Share the same report
     work and give every caller its own cloned result. */
  if (insightPending[p]) {
    insightPending[p].push(cb);
    return;
  }
  insightPending[p] = [cb];
  function finish(err, value) {
    var waiters = insightPending[p] || [];
    delete insightPending[p];
    if (!err && value) {
      insightCache[p] = { expiresAt: Date.now() + INSIGHTS_CACHE_MS, data: cloneReport(value) };
    }
    waiters.forEach(function (waiter) {
      waiter(err || null, err ? null : cloneReport(value));
    });
  }
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      finish(new Error("Database not configured"));
    });
  }

  var istToday =
    "(timezone('Asia/Kolkata', o.created_at))::date = (timezone('Asia/Kolkata', now()))::date";
  var istMonth =
    "date_trunc('month', timezone('Asia/Kolkata', o.created_at)) = date_trunc('month', timezone('Asia/Kolkata', now()))";
  var istWeek =
    "(timezone('Asia/Kolkata', o.created_at))::date >= (timezone('Asia/Kolkata', now()))::date - interval '6 days'";

  var istYear =
    "date_trunc('year', timezone('Asia/Kolkata', o.created_at)) = date_trunc('year', timezone('Asia/Kolkata', now()))";
  /* Dashboard used to fan out into twelve separate pool queries on every
     period change. On a waking serverless Postgres connection that made the
     whole tab look frozen. One aggregate query provides every KPI. */
  var qSummary =
    "SELECT " +
    "COUNT(*) FILTER (WHERE o.payment_status = 'paid' AND " + istToday + ") AS paid_today_count, " +
    "COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid' AND " + istToday + "), 0)::numeric AS paid_today_sum, " +
    "COUNT(*) FILTER (WHERE " + istToday + ") AS orders_today_count, " +
    "COUNT(*) FILTER (WHERE o.payment_status = 'paid' AND " + istWeek + ") AS paid_week_count, " +
    "COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid' AND " + istWeek + "), 0)::numeric AS paid_week_sum, " +
    "COUNT(*) FILTER (WHERE o.payment_status = 'paid' AND " + istMonth + ") AS paid_month_count, " +
    "COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid' AND " + istMonth + "), 0)::numeric AS paid_month_sum, " +
    "COUNT(*) FILTER (WHERE o.payment_status = 'paid' AND " + istYear + ") AS paid_year_count, " +
    "COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid' AND " + istYear + "), 0)::numeric AS paid_year_sum, " +
    "COUNT(*) FILTER (WHERE o.payment_status IN ('pending_payment', 'cod_advance_paid')) AS pending_count, " +
    "to_char(timezone('Asia/Kolkata', now()), 'FMMonth YYYY') AS month_label " +
    "FROM orders o";

  var qCat =
    "SELECT COALESCE(NULLIF(TRIM(p.category_id), ''), '') AS cid, " +
    "COALESCE(NULLIF(TRIM(c.label), ''), CASE WHEN COALESCE(p.category_id, '') = '' THEN 'Uncategorized' ELSE p.category_id END) AS lbl, " +
    "COUNT(DISTINCT o.id)::int AS oc, COALESCE(SUM(oi.qty * oi.unit_price), 0)::numeric AS amt " +
    "FROM orders o " +
    "JOIN order_items oi ON oi.order_id = o.id " +
    "LEFT JOIN products p ON p.id = oi.product_id AND oi.product_id <> '' " +
    "LEFT JOIN categories c ON c.id = p.category_id " +
    "WHERE o.payment_status = 'paid' AND " +
    istMonth +
    " GROUP BY 1, 2 ORDER BY amt DESC NULLS LAST LIMIT 10";

  var qChartDaily =
    "SELECT to_char(g.d, 'YYYY-MM-DD') AS d_key, COUNT(DISTINCT o.id)::int AS oc, COALESCE(SUM(o.total), 0)::numeric AS amt " +
    "FROM generate_series( " +
    "(timezone('Asia/Kolkata', now()))::date - interval '13 days', " +
    "(timezone('Asia/Kolkata', now()))::date, interval '1 day' " +
    ") AS g(d) " +
    "LEFT JOIN orders o ON (timezone('Asia/Kolkata', o.created_at))::date = g.d AND o.payment_status = 'paid' " +
    "GROUP BY 1 ORDER BY 1";

  var qChartMonthDays =
    "SELECT to_char(g.d, 'FMFMDD') AS d_key, COUNT(DISTINCT o.id)::int AS oc, COALESCE(SUM(o.total), 0)::numeric AS amt " +
    "FROM generate_series( " +
    "date_trunc('month', timezone('Asia/Kolkata', now()))::date, " +
    "(date_trunc('month', timezone('Asia/Kolkata', now())) + interval '1 month - 1 day')::date, " +
    "interval '1 day' " +
    ") AS g(d) " +
    "LEFT JOIN orders o ON (timezone('Asia/Kolkata', o.created_at))::date = g.d AND o.payment_status = 'paid' " +
    "GROUP BY g.d ORDER BY g.d";

  var qChartWeekly =
    "SELECT to_char(date_trunc('week', timezone('Asia/Kolkata', o.created_at)), 'YYYY-MM-DD') AS wk, " +
    "COUNT(DISTINCT o.id)::int AS oc, COALESCE(SUM(o.total), 0)::numeric AS amt " +
    "FROM orders o WHERE o.payment_status = 'paid' " +
    "AND o.created_at >= now() - interval '56 days' " +
    "GROUP BY 1 ORDER BY 1";

  var qChartYearly =
    "SELECT to_char(g.m, 'Mon') AS d_key, COUNT(DISTINCT o.id)::int AS oc, COALESCE(SUM(o.total), 0)::numeric AS amt " +
    "FROM generate_series( " +
    "date_trunc('year', timezone('Asia/Kolkata', now())), " +
    "date_trunc('month', timezone('Asia/Kolkata', now())), " +
    "interval '1 month' " +
    ") AS g(m) " +
    "LEFT JOIN orders o ON date_trunc('month', timezone('Asia/Kolkata', o.created_at)) = g.m AND o.payment_status = 'paid' " +
    "GROUP BY g.m ORDER BY g.m";

  var qChart = p === "daily" ? qChartDaily : p === "weekly" ? qChartWeekly : p === "yearly" ? qChartYearly : qChartMonthDays;
  var client = null;
  pool
    .connect()
    .then(function (connected) {
      client = connected;
      /* One checked-out connection avoids a thundering herd of cold Neon
         connections. Keep these requests explicitly sequential: newer
         node-postgres versions reject concurrent client.query calls. */
      return client.query(qSummary).then(function (summaryRows) {
        return client.query(qCat).then(function (categoryRows) {
          return client.query(qChart).then(function (chartRows) {
            return [summaryRows, categoryRows, chartRows];
          });
        });
      });
    })
    .then(function (rows) {
      if (client) {
        client.release();
        client = null;
      }
      var summary = rows[0].rows[0] || {};
      var cats = rows[1].rows;
      var chartRows = rows[2].rows;
      var paidToday = Number(summary.paid_today_count) || 0;
      var allToday = Number(summary.orders_today_count) || 0;
      var unpaidToday = Math.max(0, allToday - paidToday);
      var chartLabels = chartRows.map(function (r) {
        if (p === "weekly") return String(r.wk || "").slice(5);
        if (p === "yearly") return String(r.d_key || "").trim();
        if (p === "daily") return String(r.d_key || "").slice(-2);
        return String(r.d_key || "");
      });
      var selectedChart = {
        labels: chartLabels,
        orderCounts: chartRows.map(function (r) { return Number(r.oc) || 0; }),
        amounts: chartRows.map(function (r) { return Number(r.amt) || 0; }),
      };
      var charts = {};
      charts[p] = selectedChart;

      var data = {
        period: p,
        monthLabelIST: String(summary.month_label || "").trim(),
        paidOrdersToday: paidToday,
        ordersTodayAll: allToday,
        unpaidOrdersToday: unpaidToday,
        paidAmountToday: Number(summary.paid_today_sum) || 0,
        paidOrdersWeek: Number(summary.paid_week_count) || 0,
        paidAmountWeek: Number(summary.paid_week_sum) || 0,
        paidOrdersMonth: Number(summary.paid_month_count) || 0,
        paidAmountMonth: Number(summary.paid_month_sum) || 0,
        paidOrdersYear: Number(summary.paid_year_count) || 0,
        paidAmountYear: Number(summary.paid_year_sum) || 0,
        pendingPaymentOrders: Number(summary.pending_count) || 0,
        topCategories: (cats || []).map(function (r) {
          return {
            categoryId: r.cid || "",
            label: r.lbl || "Uncategorized",
            orderCount: Number(r.oc) || 0,
            amount: Number(r.amt) || 0,
          };
        }),
        charts: charts,
      };
      finish(null, data);
    })
    .catch(function (err) {
      if (client) {
        try { client.release(); } catch (_) {}
      }
      finish(err);
    });
}

module.exports = { getVendorOrderInsights };
