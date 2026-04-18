"use strict";

var fs = require("fs");
var path = require("path");

var DATA_DIR = path.join(__dirname, "data");
var ORDERS_FILE = path.join(DATA_DIR, "orders.json");
var MIN_ORDER_ID = 10001;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadOrdersArray() {
  ensureDir();
  if (!fs.existsSync(ORDERS_FILE)) {
    return [];
  }
  try {
    var j = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    return Array.isArray(j.orders) ? j.orders : [];
  } catch (_) {
    return [];
  }
}

function saveOrdersArray(arr) {
  ensureDir();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify({ orders: arr }, null, 2), "utf8");
}

/** Next sequential order id (starts at 10001). */
function nextOrderId() {
  var arr = loadOrdersArray();
  var max = MIN_ORDER_ID - 1;
  arr.forEach(function (o) {
    var id = Number(o && o.orderId);
    if (Number.isFinite(id) && id > max) max = id;
  });
  var n = max + 1;
  return n >= MIN_ORDER_ID ? n : MIN_ORDER_ID;
}

function appendOrder(order) {
  var arr = loadOrdersArray();
  arr.push(order);
  saveOrdersArray(arr);
}

function getOrdersToday() {
  var arr = loadOrdersArray();
  var start = new Date();
  start.setHours(0, 0, 0, 0);
  return arr.filter(function (o) {
    return o && o.createdAt && new Date(o.createdAt) >= start;
  });
}

function getOrderById(orderId) {
  var want = Number(orderId);
  if (!Number.isFinite(want)) return null;
  var arr = loadOrdersArray();
  for (var i = 0; i < arr.length; i++) {
    if (Number(arr[i].orderId) === want) {
      return arr[i];
    }
  }
  return null;
}

/** Full order rows (including line items) for analytics — newest first. */
function getOrdersRecentFull(limit) {
  var arr = loadOrdersArray();
  var lim = Math.max(1, Math.min(5000, Math.floor(Number(limit) || 500)));
  return arr
    .filter(Boolean)
    .sort(function (a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })
    .slice(0, lim);
}

function getOrdersRecent(limit) {
  var arr = loadOrdersArray();
  var lim = Math.max(1, Math.min(5000, Math.floor(Number(limit) || 40)));
  return arr
    .filter(Boolean)
    .sort(function (a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })
    .slice(0, lim)
    .map(function (o) {
      var g = o.guest || {};
      return {
        orderId: o.orderId,
        tagRef: o.tagRef,
        createdAt: o.createdAt,
        orderType: o.orderType,
        paymentStatus: o.paymentStatus || "pending_payment",
        paymentMethod: o.paymentMethod || "",
        fulfillmentStatus: o.fulfillmentStatus || "new",
        guest: { name: g.name, phone: g.phone, email: g.email },
        totals: o.totals || { subtotal: 0, shipping: 0, tax: 0, total: 0 },
      };
    });
}

var FULFILLMENT_OK = { new: 1, packed: 1, shipping: 1, shipped: 1, delivered: 1, cancelled: 1 };

function updateOrderFulfillment(orderId, status, cb) {
  var id = Number(orderId);
  var s = String(status || "").trim();
  if (!Number.isFinite(id) || !FULFILLMENT_OK[s]) {
    return process.nextTick(function () {
      cb(new Error("Invalid order or fulfillment status"));
    });
  }
  var arr = loadOrdersArray();
  var found = false;
  var next = arr.map(function (o) {
    if (!o || Number(o.orderId) !== id) return o;
    found = true;
    var c = JSON.parse(JSON.stringify(o));
    c.fulfillmentStatus = s;
    return c;
  });
  if (!found) {
    return process.nextTick(function () {
      cb(new Error("Order not found"));
    });
  }
  saveOrdersArray(next);
  process.nextTick(function () {
    cb(null, { orderId: id, fulfillmentStatus: s });
  });
}

module.exports = {
  appendOrder,
  nextOrderId,
  getOrdersToday,
  getOrderById,
  getOrdersRecent,
  getOrdersRecentFull,
  updateOrderFulfillment: updateOrderFulfillment,
};
