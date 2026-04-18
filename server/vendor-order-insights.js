"use strict";

var poolMod = require("./db/pool.js");

/**
 * @param {string} period — daily | weekly | monthly (chart preset)
 * @param {(err: Error|null, data?: object) => void} cb
 */
function getVendorOrderInsights(period, cb) {
  var p = String(period || "monthly").toLowerCase();
  if (p !== "daily" && p !== "weekly" && p !== "monthly" && p !== "yearly") p = "monthly";
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
  var istWeek =
    "(timezone('Asia/Kolkata', o.created_at))::date >= (timezone('Asia/Kolkata', now()))::date - interval '6 days'";

  var qTodayPaid =
    "SELECT COUNT(*)::int AS c, COALESCE(SUM(o.total), 0)::numeric AS s FROM orders o WHERE o.payment_status = 'paid' AND " +
    istToday;
  var qTodayAll = "SELECT COUNT(*)::int AS c FROM orders o WHERE " + istToday;
  var qWeekPaid =
    "SELECT COUNT(*)::int AS c, COALESCE(SUM(o.total), 0)::numeric AS s FROM orders o WHERE o.payment_status = 'paid' AND " +
    istWeek;
  var qMonthPaid =
    "SELECT COUNT(*)::int AS c, COALESCE(SUM(o.total), 0)::numeric AS s FROM orders o WHERE o.payment_status = 'paid' AND " +
    istMonth;
  var istYear =
    "date_trunc('year', timezone('Asia/Kolkata', o.created_at)) = date_trunc('year', timezone('Asia/Kolkata', now()))";
  var qYearPaid =
    "SELECT COUNT(*)::int AS c, COALESCE(SUM(o.total), 0)::numeric AS s FROM orders o WHERE o.payment_status = 'paid' AND " +
    istYear;
  var qPending = "SELECT COUNT(*)::int AS c FROM orders o WHERE o.payment_status = 'pending_payment'";

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

  var qMonthLabel =
    "SELECT to_char(timezone('Asia/Kolkata', now()), 'FMMonth YYYY') AS ml";

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

  Promise.all([
    pool.query(qTodayPaid),
    pool.query(qTodayAll),
    pool.query(qWeekPaid),
    pool.query(qMonthPaid),
    pool.query(qYearPaid),
    pool.query(qPending),
    pool.query(qCat),
    pool.query(qMonthLabel),
    pool.query(qChartDaily),
    pool.query(qChartMonthDays),
    pool.query(qChartWeekly),
    pool.query(qChartYearly),
  ])
    .then(function (rows) {
      var tp = rows[0].rows[0] || {};
      var ta = rows[1].rows[0] || {};
      var wp = rows[2].rows[0] || {};
      var mp = rows[3].rows[0] || {};
      var yp = rows[4].rows[0] || {};
      var pend = rows[5].rows[0] || {};
      var cats = rows[6].rows;
      var ml = rows[7].rows[0] || {};
      var chD = rows[8].rows;
      var chM = rows[9].rows;
      var chW = rows[10].rows;
      var chY = rows[11].rows;

      var paidToday = Number(tp.c) || 0;
      var allToday = Number(ta.c) || 0;
      var unpaidToday = Math.max(0, allToday - paidToday);

      cb(null, {
        period: p,
        monthLabelIST: String(ml.ml || "").trim(),
        paidOrdersToday: paidToday,
        ordersTodayAll: allToday,
        unpaidOrdersToday: unpaidToday,
        paidAmountToday: Number(tp.s) || 0,
        paidOrdersWeek: Number(wp.c) || 0,
        paidAmountWeek: Number(wp.s) || 0,
        paidOrdersMonth: Number(mp.c) || 0,
        paidAmountMonth: Number(mp.s) || 0,
        paidOrdersYear: Number(yp.c) || 0,
        paidAmountYear: Number(yp.s) || 0,
        pendingPaymentOrders: Number(pend.c) || 0,
        topCategories: (cats || []).map(function (r) {
          return {
            categoryId: r.cid || "",
            label: r.lbl || "Uncategorized",
            orderCount: Number(r.oc) || 0,
            amount: Number(r.amt) || 0,
          };
        }),
        charts: {
          daily: {
            labels: chD.map(function (r) {
              return String(r.d_key || "").slice(-2);
            }),
            orderCounts: chD.map(function (r) {
              return Number(r.oc) || 0;
            }),
            amounts: chD.map(function (r) {
              return Number(r.amt) || 0;
            }),
          },
          monthly: {
            labels: chM.map(function (r) {
              return String(r.d_key || "");
            }),
            orderCounts: chM.map(function (r) {
              return Number(r.oc) || 0;
            }),
            amounts: chM.map(function (r) {
              return Number(r.amt) || 0;
            }),
          },
          weekly: {
            labels: chW.map(function (r) {
              return String(r.wk || "").slice(5);
            }),
            orderCounts: chW.map(function (r) {
              return Number(r.oc) || 0;
            }),
            amounts: chW.map(function (r) {
              return Number(r.amt) || 0;
            }),
          },
          yearly: {
            labels: chY.map(function (r) {
              return String(r.d_key || "").trim();
            }),
            orderCounts: chY.map(function (r) {
              return Number(r.oc) || 0;
            }),
            amounts: chY.map(function (r) {
              return Number(r.amt) || 0;
            }),
          },
        },
      });
    })
    .catch(cb);
}

module.exports = { getVendorOrderInsights };
