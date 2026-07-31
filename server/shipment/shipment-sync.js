"use strict";

var shipmentDb = require("./shipment-db.js");
var courierRegistry = require("./courier-registry.js");
var delhiveryCourier = require("./courier-delhivery.js");
var shipmentStatus = require("./shipment-status.js");
var ordersDb = require("../orders-db.js");
var shipmentNotifications = require("./shipment-notifications.js");

/** In-memory cache: key = courier|awb → { at, data } */
var trackCache = {};
var CACHE_TTL_MS = Math.max(60_000, Number(process.env.SHIPMENT_TRACK_CACHE_MS) || 5 * 60 * 1000);

function cacheKey(courier, awb) {
  return courierRegistry.normalizeCourierId(courier) + "|" + String(awb || "").trim().toLowerCase();
}

function getCached(courier, awb) {
  var k = cacheKey(courier, awb);
  var hit = trackCache[k];
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    delete trackCache[k];
    return null;
  }
  return hit.data;
}

function setCached(courier, awb, data) {
  trackCache[cacheKey(courier, awb)] = { at: Date.now(), data: data };
}

/**
 * Fetch courier tracking (cached).
 * @param {string} courierName
 * @param {string} trackingNumber
 * @param {{ skipCache?: boolean }} opts
 */
function fetchCourierTracking(courierName, trackingNumber, opts) {
  var skip = opts && opts.skipCache;
  if (!skip) {
    var cached = getCached(courierName, trackingNumber);
    if (cached) return Promise.resolve(Object.assign({}, cached, { fromCache: true }));
  }
  return courierRegistry.fetchTracking(courierName, trackingNumber).then(function (data) {
    if (data && data.ok) setCached(courierName, trackingNumber, data);
    return data;
  });
}

/**
 * Apply courier sync payload to DB; update fulfillment on delivered.
 * @param {number} orderId
 * @param {object} trackData - normalized courier response
 * @param {(err: Error|null, out?: object) => void} cb
 */
function applyTrackingToOrder(orderId, trackData, cb) {
  if (!trackData || !trackData.found) {
    return process.nextTick(function () {
      cb(new Error(trackData && trackData.error ? trackData.error : "Tracking not found"));
    });
  }

  getShipmentContext(orderId, function (err, ctx) {
    if (err) return cb(err);
    var prevCode = ctx && ctx.shipment && ctx.shipment.shipmentStatusCode;

    shipmentDb.upsertShipment(
      orderId,
      {
        trackingNumber: trackData.trackingNumber,
        courierName: trackData.courierName || "Delhivery",
        shipmentStatus: trackData.shipmentStatus,
        shipmentStatusCode: trackData.shipmentStatusCode,
        trackingUrl: trackData.trackingUrl,
        dispatchDate: trackData.dispatchDate,
        estimatedDeliveryDate: trackData.estimatedDeliveryDate,
        actualDeliveryDate: trackData.actualDeliveryDate,
        shipmentHistory: trackData.history,
        lastTrackingSync: trackData.syncedAt || new Date().toISOString(),
      },
      function (e2, shipment) {
        if (e2) return cb(e2);

        function finish(out) {
          if (prevCode !== trackData.shipmentStatusCode) {
            shipmentNotifications.onShipmentStatusChange({
              orderId: orderId,
              previousStatusCode: prevCode,
              shipment: shipment,
            });
          }
          cb(null, out);
        }

        if (trackData.shipmentStatusCode === shipmentStatus.STATUS.DELIVERED) {
          ordersDb.updateOrderFulfillment(orderId, "delivered", function (e3) {
            finish({ shipment: shipment, fulfillmentUpdated: !e3 });
          });
        } else if (
          trackData.shipmentStatusCode === shipmentStatus.STATUS.OUT_FOR_DELIVERY &&
          ctx &&
          ctx.fulfillmentStatus !== "delivered"
        ) {
          ordersDb.updateOrderFulfillment(orderId, "shipping", function () {
            finish({ shipment: shipment });
          });
        } else if (
          (trackData.shipmentStatusCode === shipmentStatus.STATUS.IN_TRANSIT ||
            trackData.shipmentStatusCode === shipmentStatus.STATUS.PICKED_UP) &&
          ctx &&
          (ctx.fulfillmentStatus === "new" || ctx.fulfillmentStatus === "packed")
        ) {
          ordersDb.updateOrderFulfillment(orderId, "shipped", function () {
            finish({ shipment: shipment });
          });
        } else {
          finish({ shipment: shipment });
        }
      }
    );
  });
}

function getShipmentContext(orderId, cb) {
  ordersDb.getOrderById(orderId, function (err, order) {
    if (err) return cb(err);
    if (!order) return cb(new Error("Order not found"));
    shipmentDb.getShipmentByOrderId(orderId, function (e2, shipment) {
      if (e2) return cb(e2);
      cb(null, { order: order, shipment: shipment, fulfillmentStatus: order.fulfillmentStatus });
    });
  });
}

/**
 * Sync one order from courier API.
 * @param {number} orderId
 * @param {{ skipCache?: boolean }} opts
 */
function syncOrderShipment(orderId, opts, cb) {
  if (typeof opts === "function") {
    cb = opts;
    opts = {};
  }
  shipmentDb.getShipmentByOrderId(orderId, function (err, shipment) {
    if (err) return cb(err);
    if (!shipment || !String(shipment.trackingNumber || "").trim()) {
      return cb(new Error("No tracking number on this order"));
    }
    fetchCourierTracking(shipment.courierName, shipment.trackingNumber, opts)
      .then(function (data) {
        applyTrackingToOrder(orderId, data, cb);
      })
      .catch(function (e) {
        cb(e instanceof Error ? e : new Error(String(e)));
      });
  });
}

/**
 * Admin save: validate AWB, optional courier fetch, upsert.
 * @param {number} orderId
 * @param {object} body
 * @param {(err: Error|null, out?: object) => void} cb
 */
function saveAdminShipment(orderId, body, cb) {
  var courierName = String((body && body.courierName) || "Delhivery").trim() || "Delhivery";
  var val = courierRegistry.validateTracking(courierName, body && body.trackingNumber);
  if (!val.ok) return process.nextTick(function () { cb(new Error(val.error)); });

  var awb = val.trackingNumber;
  var validateWithCourier = body && body.validateWithCourier !== false;

  shipmentDb.findOrderIdByTrackingNumber(awb, orderId, function (err, dupId) {
    if (err) return cb(err);
    if (dupId) return cb(new Error("Tracking ID already used on order #" + dupId));

    var manual = {
      trackingNumber: awb,
      courierName: courierName,
      trackingUrl:
        (body && body.trackingUrl && String(body.trackingUrl).trim()) ||
        shipmentStatus.defaultTrackingUrl(courierName, awb),
      dispatchDate: body && body.dispatchDate,
      estimatedDeliveryDate: body && body.estimatedDeliveryDate,
      shipmentNotes: body && body.shipmentNotes,
    };

    if (manual.trackingUrl && manual.trackingUrl.length > 2000) {
      return cb(new Error("Tracking URL is too long"));
    }

    if (!validateWithCourier || !courierRegistry.getCourier(courierName).isConfigured()) {
      var delhiverySt = delhiveryCourier.describeDelhiveryConfig();
      var skipMsg = "Shipment saved (courier validation skipped).";
      if (validateWithCourier && delhiverySt.blockedInProduction) {
        skipMsg =
          "Shipment saved without live validation — Delhivery staging is blocked in production. Use a production token on track.delhivery.com.";
      } else if (validateWithCourier && !delhiverySt.tokenSet) {
        skipMsg =
          "Shipment saved without live validation. Set DELHIVERY_API_TOKEN in server environment to validate AWB with Delhivery automatically.";
      } else if (!courierRegistry.getCourier(courierName).isConfigured()) {
        skipMsg = "Shipment saved. Set DELHIVERY_API_TOKEN to validate AWB automatically.";
      }
      return shipmentDb.upsertShipment(orderId, manual, function (e2, shipment) {
        if (e2) return cb(e2);
        cb(null, {
          shipment: shipment,
          courierValidated: false,
          message: skipMsg,
        });
      });
    }

    fetchCourierTracking(courierName, awb, { skipCache: true })
      .then(function (data) {
        if (!data.found) {
          return cb(new Error(data.error || "AWB not found on Delhivery"));
        }
        manual.shipmentStatus = data.shipmentStatus;
        manual.shipmentStatusCode = data.shipmentStatusCode;
        manual.dispatchDate = manual.dispatchDate || data.dispatchDate;
        manual.estimatedDeliveryDate = manual.estimatedDeliveryDate || data.estimatedDeliveryDate;
        manual.actualDeliveryDate = data.actualDeliveryDate;
        manual.shipmentHistory = data.history;
        manual.lastTrackingSync = data.syncedAt;

        applyTrackingToOrder(orderId, Object.assign({ found: true }, data, manual), function (e3, out) {
          if (e3) return cb(e3);
          cb(null, {
            shipment: out.shipment,
            courierValidated: true,
            message: "Shipment saved and validated with Delhivery.",
            fulfillmentUpdated: out.fulfillmentUpdated,
          });
        });
      })
      .catch(function (e) {
        cb(e instanceof Error ? e : new Error(String(e)));
      });
  });
}

var syncRunning = false;

function runBackgroundSync(cb) {
  if (typeof cb !== "function") cb = function () {};
  if (syncRunning) return cb(null, { skipped: true, reason: "already running" });
  syncRunning = true;

  shipmentDb.listActiveShipmentsForSync(Number(process.env.SHIPMENT_SYNC_BATCH_SIZE) || 40, function (err, rows) {
    if (err) {
      syncRunning = false;
      return cb(err);
    }
    var idx = 0;
    var stats = { total: rows.length, synced: 0, failed: 0, errors: [] };

    function next() {
      if (idx >= rows.length) {
        syncRunning = false;
        return cb(null, stats);
      }
      var row = rows[idx++];
      syncOrderShipment(row.orderId, { skipCache: true }, function (e2) {
        if (e2) {
          stats.failed += 1;
          if (stats.errors.length < 8) stats.errors.push({ orderId: row.orderId, error: String(e2.message || e2) });
        } else {
          stats.synced += 1;
        }
        setImmediate(next);
      });
    }
    next();
  });
}

function startBackgroundSyncTimer() {
  if (String(process.env.SHIPMENT_SYNC_DISABLED || "").toLowerCase() === "1") return null;
  if (!delhiveryCourier.describeDelhiveryConfig().configured) return null;
  var intervalMin = Math.max(10, Number(process.env.SHIPMENT_SYNC_INTERVAL_MINUTES) || 30);
  var ms = intervalMin * 60 * 1000;
  var t = setInterval(function () {
    runBackgroundSync(function (err, stats) {
      if (err) console.warn("[shipment-sync]", err.message || err);
      else if (stats && stats.total) console.log("[shipment-sync] batch:", stats.synced + "/" + stats.total, "ok");
    });
  }, ms);
  if (typeof t.unref === "function") t.unref();
  setTimeout(function () {
    runBackgroundSync(function () {});
  }, 15_000);
  return t;
}

module.exports = {
  fetchCourierTracking: fetchCourierTracking,
  applyTrackingToOrder: applyTrackingToOrder,
  syncOrderShipment: syncOrderShipment,
  saveAdminShipment: saveAdminShipment,
  runBackgroundSync: runBackgroundSync,
  startBackgroundSyncTimer: startBackgroundSyncTimer,
  getCached: getCached,
  setCached: setCached,
};
