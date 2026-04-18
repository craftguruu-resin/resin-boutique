"use strict";

var poolMod = require("./db/pool.js");
var ordersDb = require("./orders-db.js");
var ordersStore = require("./orders-store.js");
var guestDb = require("./guest-db.js");
var vendorOrderInsightsPg = require("./vendor-order-insights.js");

/**
 * @param {{ guest: object, items: object[], totals: object, orderType: string, tagRef: string }} opts
 * @param {(err: Error|null, order?: object) => void} cb
 */
function createCheckoutParcelOrder(opts, cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.createCheckoutParcelOrder(opts, cb);
  }
  var orderId = ordersStore.nextOrderId();
  var orderRecord = {
    orderId: orderId,
    tagRef: opts.tagRef,
    guestId: null,
    createdAt: new Date().toISOString(),
    guest: opts.guest,
    items: opts.items.map(function (it) {
      return {
        name: it.name,
        sizeLabel: it.sizeLabel,
        qty: it.qty,
        unitPrice: it.unitPrice,
        productId: String((it && it.productId) || ""),
      };
    }),
    totals: opts.totals,
    orderType: opts.orderType,
    paymentStatus: opts.paymentStatus != null ? String(opts.paymentStatus) : "pending_payment",
    paymentMethod: opts.paymentMethod != null ? String(opts.paymentMethod) : "",
    fulfillmentStatus: "new",
  };
  ordersStore.appendOrder(orderRecord);
  process.nextTick(function () {
    cb(null, orderRecord);
  });
}

/** @param {(err: Error|null, list?: object[]) => void} cb */
function getOrdersToday(cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.getOrdersToday(cb);
  }
  process.nextTick(function () {
    cb(null, ordersStore.getOrdersToday());
  });
}

/** @param {(err: Error|null, order?: object|null) => void} cb */
function getOrderById(orderId, cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.getOrderById(orderId, cb);
  }
  process.nextTick(function () {
    var o = ordersStore.getOrderById(orderId);
    if (o && (o.paymentStatus == null || o.paymentMethod == null || o.fulfillmentStatus == null)) {
      o = JSON.parse(JSON.stringify(o));
      o.paymentStatus = o.paymentStatus || "pending_payment";
      o.paymentMethod = o.paymentMethod || "";
      o.fulfillmentStatus = o.fulfillmentStatus || "new";
    }
    cb(null, o);
  });
}

function saveGuestAddressOnly(guest, cb) {
  if (poolMod.isEnabled()) {
    return guestDb.saveGuestAddressOnly(guest, cb);
  }
  process.nextTick(function () {
    cb(null, { guestId: null });
  });
}

function isoToMonthKeyIST(iso) {
  var d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  var ms = d.getTime() + 330 * 60 * 1000;
  var u = new Date(ms);
  var y = u.getUTCFullYear();
  var m = u.getUTCMonth() + 1;
  return y + "-" + (m < 10 ? "0" : "") + m;
}

function getVendorMonthlySummary(cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.getVendorMonthlySummary(cb);
  }
  process.nextTick(function () {
    var arr = ordersStore.getOrdersRecent(5000);
    var paidByMonth = {};
    var allByMonth = {};
    arr.forEach(function (row) {
      var mk = isoToMonthKeyIST(row.createdAt);
      if (!mk) return;
      allByMonth[mk] = (allByMonth[mk] || 0) + 1;
      if (row.paymentStatus === "paid") {
        var t = row.totals && Number(row.totals.total);
        if (!Number.isFinite(t)) t = 0;
        if (!paidByMonth[mk]) paidByMonth[mk] = { total: 0, count: 0 };
        paidByMonth[mk].total += t;
        paidByMonth[mk].count += 1;
      }
    });
    var keys = Object.keys(allByMonth).concat(Object.keys(paidByMonth));
    var monthSet = {};
    keys.forEach(function (k) {
      monthSet[k] = true;
    });
    var sorted = Object.keys(monthSet).sort();
    var last6 = sorted.slice(-6);
    cb(null, {
      months: last6.map(function (mk) {
        var p = paidByMonth[mk] || { total: 0, count: 0 };
        return {
          monthKey: mk,
          paidTotal: p.total,
          paidOrderCount: p.count,
          allOrderCount: allByMonth[mk] || 0,
        };
      }),
    });
  });
}

function getOrdersRecent(limit, cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.getOrdersRecent(limit, cb);
  }
  process.nextTick(function () {
    cb(null, ordersStore.getOrdersRecent(limit));
  });
}

function istYmdKeyFromIso(iso) {
  var d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  var ms = d.getTime() + 330 * 60 * 1000;
  var u = new Date(ms);
  var y = u.getUTCFullYear();
  var m = u.getUTCMonth() + 1;
  var day = u.getUTCDate();
  return y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}

function istLast7DayKeys() {
  var k = istYmdKeyFromIso(new Date().toISOString());
  if (!k) return [];
  var parts = k.split("-");
  var y = Number(parts[0]);
  var mo = Number(parts[1]) - 1;
  var da = Number(parts[2]);
  var keys = [];
  for (var i = 6; i >= 0; i--) {
    var dt = new Date(Date.UTC(y, mo, da - i));
    var yy = dt.getUTCFullYear();
    var mm = dt.getUTCMonth() + 1;
    var dd = dt.getUTCDate();
    keys.push(yy + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd);
  }
  return keys;
}

function orderRowTotal(o) {
  var t = o && o.totals && Number(o.totals.total);
  return Number.isFinite(t) ? t : 0;
}

function monthLabelIST() {
  try {
    return new Date().toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  } catch (_) {
    return "";
  }
}

function buildVendorOrderInsightsFromFile(period, rows, prodMap, catLabel) {
  var p = String(period || "monthly").toLowerCase();
  if (p !== "daily" && p !== "weekly" && p !== "monthly") p = "monthly";
  var dash = buildVendorDashboardSummaryFromFileRows(rows);
  var todayIst = istYmdKeyFromIso(new Date().toISOString());
  var monthNow = isoToMonthKeyIST(new Date().toISOString());
  var weekKeys = istLast7DayKeys();
  var weekSet = {};
  weekKeys.forEach(function (k) {
    weekSet[k] = true;
  });

  var paidOrdersWeek = 0;
  var paidAmountWeek = 0;
  (rows || []).forEach(function (o) {
    if (!o || o.paymentStatus !== "paid") return;
    var dk = istYmdKeyFromIso(o.createdAt);
    if (dk && weekSet[dk]) {
      paidOrdersWeek += 1;
      paidAmountWeek += orderRowTotal(o);
    }
  });

  var catAgg = {};
  (rows || []).forEach(function (o) {
    if (!o || o.paymentStatus !== "paid") return;
    if (isoToMonthKeyIST(o.createdAt) !== monthNow) return;
    var items = Array.isArray(o.items) ? o.items : [];
    items.forEach(function (it) {
      var pid = String((it && it.productId) || "").trim();
      var cid = pid && prodMap[pid] != null ? String(prodMap[pid]) : "";
      var lbl = cid ? String(catLabel[cid] || cid) : "Uncategorized";
      if (!catAgg[lbl]) {
        catAgg[lbl] = { categoryId: cid, label: lbl, orderCount: 0, amount: 0, _seen: {} };
      }
      var line = Math.max(0, Number(it.qty) || 0) * Math.max(0, Number(it.unitPrice) || 0);
      catAgg[lbl].amount += line;
      var oid = o.orderId;
      if (!catAgg[lbl]._seen[oid]) {
        catAgg[lbl]._seen[oid] = true;
        catAgg[lbl].orderCount += 1;
      }
    });
  });
  var topCategories = Object.keys(catAgg)
    .map(function (lbl) {
      var x = catAgg[lbl];
      return { categoryId: x.categoryId, label: x.label, orderCount: x.orderCount, amount: x.amount };
    })
    .sort(function (a, b) {
      return b.amount - a.amount;
    })
    .slice(0, 10);

  function daySeries(startKey, nDays, paidOnly) {
    var labels = [];
    var orderCounts = [];
    var amounts = [];
    var parts = startKey.split("-");
    var y = Number(parts[0]);
    var mo = Number(parts[1]) - 1;
    var da = Number(parts[2]);
    for (var i = 0; i < nDays; i++) {
      var dt = new Date(Date.UTC(y, mo, da + i));
      var yy = dt.getUTCFullYear();
      var mm = dt.getUTCMonth() + 1;
      var dd = dt.getUTCDate();
      var key = yy + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd;
      labels.push(String(dd));
      var oc = 0;
      var am = 0;
      (rows || []).forEach(function (o) {
        if (!o) return;
        if (istYmdKeyFromIso(o.createdAt) !== key) return;
        if (paidOnly) {
          if (o.paymentStatus !== "paid") return;
          oc += 1;
          am += orderRowTotal(o);
        } else {
          oc += 1;
        }
      });
      orderCounts.push(oc);
      amounts.push(am);
    }
    return { labels: labels, orderCounts: orderCounts, amounts: amounts };
  }

  var k0 = todayIst;
  var dailyStartParts = k0.split("-");
  var y0 = Number(dailyStartParts[0]);
  var m0 = Number(dailyStartParts[1]) - 1;
  var d0 = Number(dailyStartParts[2]);
  var dailyStart = new Date(Date.UTC(y0, m0, d0 - 13));
  var dsKey = istYmdKeyFromIso(dailyStart.toISOString()) || k0;
  var chartsDaily = daySeries(dsKey, 14, true);

  var monthParts = monthNow.split("-");
  var my = Number(monthParts[0]);
  var mm = Number(monthParts[1]) - 1;
  var dim = new Date(Date.UTC(my, mm + 1, 0)).getUTCDate();
  var monthStartKey = monthNow + "-01";
  var chartsMonthly = daySeries(monthStartKey, dim, true);

  var chartsWeekly = { labels: [], orderCounts: [], amounts: [] };
  weekKeys.forEach(function (wk, idx) {
    chartsWeekly.labels.push(String(idx + 1));
    var oc = 0;
    var am = 0;
    (rows || []).forEach(function (o) {
      if (!o || o.paymentStatus !== "paid") return;
      if (istYmdKeyFromIso(o.createdAt) === wk) {
        oc += 1;
        am += orderRowTotal(o);
      }
    });
    chartsWeekly.orderCounts.push(oc);
    chartsWeekly.amounts.push(am);
  });

  return {
    period: p,
    monthLabelIST: monthLabelIST(),
    paidOrdersToday: dash.paidOrdersToday,
    ordersTodayAll: dash.ordersTodayAll,
    unpaidOrdersToday: Math.max(0, dash.ordersTodayAll - dash.paidOrdersToday),
    paidAmountToday: dash.paidRevenueToday,
    paidOrdersWeek: paidOrdersWeek,
    paidAmountWeek: paidAmountWeek,
    paidOrdersMonth: dash.paidOrdersThisMonth,
    paidAmountMonth: dash.paidRevenueThisMonth,
    pendingPaymentOrders: dash.pendingPaymentOrders,
    topCategories: topCategories,
    charts: {
      daily: chartsDaily,
      monthly: chartsMonthly,
      weekly: chartsWeekly,
    },
  };
}

function getVendorOrderInsights(period, cb) {
  if (poolMod.isEnabled()) {
    return vendorOrderInsightsPg.getVendorOrderInsights(period, cb);
  }
  process.nextTick(function () {
    try {
      var catalogFromData = require("./catalog-from-data.js");
      var prods = catalogFromData.getProductsSummary();
      var prodMap = {};
      prods.forEach(function (p) {
        prodMap[p.id] = p.category;
      });
      var cats = catalogFromData.getCategoriesList();
      var catLabel = {};
      cats.forEach(function (c) {
        catLabel[c.id] = c.label || c.id;
      });
      var full = ordersStore.getOrdersRecentFull(5000);
      cb(null, buildVendorOrderInsightsFromFile(period, full, prodMap, catLabel));
    } catch (e) {
      cb(e);
    }
  });
}

function buildVendorDashboardSummaryFromFileRows(rows) {
  var todayIst = istYmdKeyFromIso(new Date().toISOString());
  var monthNow = isoToMonthKeyIST(new Date().toISOString());
  var keys7 = istLast7DayKeys();
  var paidByDay = {};
  keys7.forEach(function (key) {
    paidByDay[key] = 0;
  });

  var paidRevenueToday = 0;
  var paidOrdersToday = 0;
  var ordersTodayAll = 0;
  var paidRevenueThisMonth = 0;
  var paidOrdersThisMonth = 0;
  var pendingPaymentOrders = 0;
  var fulfill30 = {};
  var now = Date.now();
  var thirtyMs = 30 * 24 * 60 * 60 * 1000;

  (rows || []).forEach(function (o) {
    if (!o) return;
    var ps = o.paymentStatus || "pending_payment";
    if (ps === "pending_payment") pendingPaymentOrders += 1;

    var dKey = istYmdKeyFromIso(o.createdAt);
    if (dKey && dKey === todayIst) {
      ordersTodayAll += 1;
      if (ps === "paid") {
        paidOrdersToday += 1;
        paidRevenueToday += orderRowTotal(o);
      }
    }
    if (isoToMonthKeyIST(o.createdAt) === monthNow && ps === "paid") {
      paidOrdersThisMonth += 1;
      paidRevenueThisMonth += orderRowTotal(o);
    }
    if (ps === "paid") {
      var tot = orderRowTotal(o);
      if (dKey && Object.prototype.hasOwnProperty.call(paidByDay, dKey)) {
        paidByDay[dKey] += tot;
      }
      var ts = new Date(o.createdAt).getTime();
      if (Number.isFinite(ts) && now - ts <= thirtyMs) {
        var fs = o.fulfillmentStatus || "new";
        fulfill30[fs] = (fulfill30[fs] || 0) + 1;
      }
    }
  });

  var sparkline7dPaid = keys7.map(function (key) {
    return paidByDay[key] || 0;
  });

  var paidRows = (rows || []).filter(function (o) {
    return o && o.paymentStatus === "paid";
  });
  paidRows.sort(function (a, b) {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
  var recent = paidRows.slice(0, 8);
  var notifications = recent.map(function (r) {
    return {
      kind: "success",
      title: "Paid order #" + r.orderId,
      message: "Tag " + (r.tagRef || "") + " · Total " + orderRowTotal(r).toFixed(2),
      orderId: r.orderId,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
    };
  });
  var recentPaidOrders = recent.map(function (r) {
    return {
      orderId: r.orderId,
      tagRef: r.tagRef,
      total: orderRowTotal(r),
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
      fulfillmentStatus: r.fulfillmentStatus || "new",
    };
  });

  return {
    paidRevenueToday: paidRevenueToday,
    paidOrdersToday: paidOrdersToday,
    ordersTodayAll: ordersTodayAll,
    paidRevenueThisMonth: paidRevenueThisMonth,
    paidOrdersThisMonth: paidOrdersThisMonth,
    pendingPaymentOrders: pendingPaymentOrders,
    sparkline7dPaid: sparkline7dPaid,
    fulfillmentLast30d: fulfill30,
    recentPaidOrders: recentPaidOrders,
    notifications: notifications,
  };
}

function getVendorDashboardSummary(cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.getVendorDashboardSummary(cb);
  }
  process.nextTick(function () {
    var rows = ordersStore.getOrdersRecent(5000);
    cb(null, buildVendorDashboardSummaryFromFileRows(rows));
  });
}

function updateOrderFulfillment(orderId, status, cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.updateOrderFulfillment(orderId, status, cb);
  }
  ordersStore.updateOrderFulfillment(orderId, status, cb);
}

function listOrdersByGuestId(guestId, cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.listOrdersByGuestId(guestId, cb);
  }
  process.nextTick(function () {
    cb(null, []);
  });
}

function loadPaidOrderForGuestBill(guestId, orderId, cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.loadPaidOrderForGuestBill(guestId, orderId, cb);
  }
  process.nextTick(function () {
    cb(null, null);
  });
}

function cancelGuestOrder(guestId, orderId, cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.cancelGuestOrder(guestId, orderId, cb);
  }
  process.nextTick(function () {
    cb(new Error("Order cancellation requires Postgres."));
  });
}

function resolveSkuMapPool(items, cb) {
  if (poolMod.isEnabled()) {
    return ordersDb.resolveSkuMapPool(items, cb);
  }
  process.nextTick(function () {
    cb(null, {});
  });
}

module.exports = {
  createCheckoutParcelOrder,
  getOrdersToday,
  getOrderById,
  saveGuestAddressOnly,
  getOrdersRecent,
  getVendorMonthlySummary,
  getVendorDashboardSummary,
  getVendorOrderInsights,
  updateOrderFulfillment,
  listOrdersByGuestId,
  loadPaidOrderForGuestBill,
  cancelGuestOrder,
  resolveSkuMapPool: resolveSkuMapPool,
};
