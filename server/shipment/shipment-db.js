"use strict";

var poolMod = require("../db/pool.js");
var shipmentStatus = require("./shipment-status.js");

function mapRow(row) {
  if (!row) return null;
  var hist = row.shipment_history;
  if (hist != null && typeof hist === "string") {
    try {
      hist = JSON.parse(hist);
    } catch (_) {
      hist = [];
    }
  }
  if (!Array.isArray(hist)) hist = [];

  return {
    trackingNumber: row.tracking_number != null ? String(row.tracking_number) : "",
    courierName: row.courier_name != null ? String(row.courier_name) : "Delhivery",
    shipmentStatus: row.shipment_status != null ? String(row.shipment_status) : "",
    shipmentStatusCode: row.shipment_status_code != null ? String(row.shipment_status_code) : "",
    trackingUrl: row.tracking_url != null ? String(row.tracking_url) : "",
    dispatchDate: row.dispatch_date ? new Date(row.dispatch_date).toISOString() : null,
    estimatedDeliveryDate: row.estimated_delivery_date ? new Date(row.estimated_delivery_date).toISOString() : null,
    actualDeliveryDate: row.actual_delivery_date ? new Date(row.actual_delivery_date).toISOString() : null,
    shipmentNotes: row.shipment_notes != null ? String(row.shipment_notes) : "",
    shipmentHistory: hist,
    lastTrackingSync: row.last_tracking_sync ? new Date(row.last_tracking_sync).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function publicShipmentView(shipment, opts) {
  if (!shipment) return null;
  var includeNotes = opts && opts.includeNotes;
  var timeline = shipmentStatus.buildTimeline(shipment.shipmentStatusCode, shipment.shipmentHistory);
  var courierPartner = extractCourierPartner(shipment);
  var out = {
    trackingNumber: shipment.trackingNumber,
    courierName: shipment.courierName,
    courierPartner: courierPartner,
    shipmentStatus: shipment.shipmentStatus || timeline.currentLabel,
    shipmentStatusCode: shipment.shipmentStatusCode || timeline.currentCode,
    trackingUrl:
      shipment.trackingUrl ||
      shipmentStatus.defaultTrackingUrl(shipment.courierName, shipment.trackingNumber),
    dispatchDate: shipment.dispatchDate,
    estimatedDeliveryDate: shipment.estimatedDeliveryDate,
    actualDeliveryDate: shipment.actualDeliveryDate,
    lastTrackingSync: shipment.lastTrackingSync,
    timeline: timeline,
    delivered: shipment.shipmentStatusCode === shipmentStatus.STATUS.DELIVERED,
    stale:
      shipment.lastTrackingSync &&
      Date.now() - new Date(shipment.lastTrackingSync).getTime() > Number(process.env.SHIPMENT_STALE_MS || 6 * 60 * 60 * 1000),
  };
  if (includeNotes) out.shipmentNotes = shipment.shipmentNotes;
  return out;
}

/** Guest storefront view — no courier branding or external carrier URLs. */
function guestPublicShipmentView(shipment, opts) {
  var view = publicShipmentView(shipment, opts);
  if (!view) return null;
  delete view.courierName;
  delete view.courierPartner;
  delete view.trackingUrl;
  if (view.timeline && view.timeline.steps) {
    view.timeline.steps.forEach(function (step) {
      if (step && step.source) delete step.source;
    });
  }
  if (view.shipmentHistory && Array.isArray(view.shipmentHistory)) {
    view.shipmentHistory.forEach(function (h) {
      if (h && h.source) delete h.source;
    });
  }
  return view;
}

function mergeHistory(existing, incoming) {
  var list = Array.isArray(existing) ? existing.slice() : [];
  var seen = {};
  list.forEach(function (h) {
    var key = [h.statusCode, h.at, h.rawStatus].join("|");
    seen[key] = true;
  });
  (incoming || []).forEach(function (h) {
    if (!h) return;
    var key = [h.statusCode, h.at, h.rawStatus].join("|");
    if (seen[key]) return;
    seen[key] = true;
    list.push(h);
  });
  list.sort(function (a, b) {
    return new Date(a.at || 0) - new Date(b.at || 0);
  });
  return list.slice(-120);
}

function parseOptionalDate(val) {
  if (val == null || val === "") return null;
  var d = new Date(val);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Latest carrier partner from sync history (e.g. Delhivery under BigShip). */
function extractCourierPartner(shipment) {
  if (!shipment) return null;
  var hist = shipment.shipmentHistory;
  if (!Array.isArray(hist)) return null;
  for (var i = hist.length - 1; i >= 0; i--) {
    var h = hist[i];
    if (h && h.courierPartner && String(h.courierPartner).trim()) {
      return String(h.courierPartner).trim();
    }
  }
  return null;
}

/** @param {number} orderId */
function getShipmentByOrderId(orderId, cb) {
  var pool = poolMod.getPool();
  if (!pool) return process.nextTick(function () { cb(new Error("Database not configured")); });
  var id = Number(orderId);
  if (!Number.isFinite(id)) return process.nextTick(function () { cb(null, null); });
  pool
    .query("SELECT * FROM order_shipments WHERE order_id = $1 LIMIT 1", [id])
    .then(function (r) {
      cb(null, r.rows.length ? mapRow(r.rows[0]) : null);
    })
    .catch(cb);
}

function findOrderIdByTrackingNumber(trackingNumber, excludeOrderId, cb) {
  var pool = poolMod.getPool();
  if (!pool) return process.nextTick(function () { cb(new Error("Database not configured")); });
  var awb = String(trackingNumber || "").trim();
  if (!awb) return process.nextTick(function () { cb(null, null); });
  var ex = Number(excludeOrderId);
  var sql =
    "SELECT order_id FROM order_shipments WHERE lower(trim(tracking_number)) = lower(trim($1)) AND trim(tracking_number) <> ''";
  var params = [awb];
  if (Number.isFinite(ex)) {
    sql += " AND order_id <> $2";
    params.push(ex);
  }
  sql += " LIMIT 1";
  pool
    .query(sql, params)
    .then(function (r) {
      cb(null, r.rows.length ? Number(r.rows[0].order_id) : null);
    })
    .catch(cb);
}

/**
 * Upsert shipment row from admin save or courier sync.
 * @param {number} orderId
 * @param {object} data
 * @param {(err: Error|null, out?: object) => void} cb
 */
function upsertShipment(orderId, data, cb) {
  var pool = poolMod.getPool();
  if (!pool) return process.nextTick(function () { cb(new Error("Database not configured")); });
  var id = Number(orderId);
  if (!Number.isFinite(id)) return process.nextTick(function () { cb(new Error("Invalid order id")); });

  getShipmentByOrderId(id, function (err, existing) {
    if (err) return cb(err);

    var trackingNumber = data.trackingNumber != null ? String(data.trackingNumber).trim() : existing && existing.trackingNumber;
    var courierName = data.courierName != null ? String(data.courierName).trim().slice(0, 80) : (existing && existing.courierName) || "Delhivery";
    var shipmentStatusText = data.shipmentStatus != null ? String(data.shipmentStatus).trim().slice(0, 80) : existing && existing.shipmentStatus;
    var shipmentStatusCode =
      data.shipmentStatusCode != null
        ? String(data.shipmentStatusCode).trim().slice(0, 80)
        : existing && existing.shipmentStatusCode;
    var trackingUrl = data.trackingUrl != null ? String(data.trackingUrl).trim() : existing && existing.trackingUrl;
    if (!trackingUrl && trackingNumber) {
      trackingUrl = shipmentStatus.defaultTrackingUrl(courierName, trackingNumber);
    }
    var dispatchDate = data.dispatchDate !== undefined ? parseOptionalDate(data.dispatchDate) : existing && existing.dispatchDate;
    var estimatedDeliveryDate =
      data.estimatedDeliveryDate !== undefined ? parseOptionalDate(data.estimatedDeliveryDate) : existing && existing.estimatedDeliveryDate;
    var actualDeliveryDate =
      data.actualDeliveryDate !== undefined ? parseOptionalDate(data.actualDeliveryDate) : existing && existing.actualDeliveryDate;
    var shipmentNotes = data.shipmentNotes != null ? String(data.shipmentNotes).slice(0, 4000) : existing && existing.shipmentNotes;
    var history =
      data.shipmentHistory != null ? mergeHistory(existing && existing.shipmentHistory, data.shipmentHistory) : existing && existing.shipmentHistory;
    if (!Array.isArray(history)) history = [];
    if (data.courierPartner && history.length) {
      var last = history[history.length - 1];
      if (last && !last.courierPartner) last.courierPartner = String(data.courierPartner).trim();
    }
    var lastTrackingSync =
      data.lastTrackingSync !== undefined ? parseOptionalDate(data.lastTrackingSync) : existing && existing.lastTrackingSync;

    if (data.historyAppend) {
      history = mergeHistory(history, [data.historyAppend]);
    }

    var sql =
      "INSERT INTO order_shipments (order_id, tracking_number, courier_name, shipment_status, shipment_status_code, tracking_url, dispatch_date, estimated_delivery_date, actual_delivery_date, shipment_notes, shipment_history, last_tracking_sync, updated_at) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12, now()) " +
      "ON CONFLICT (order_id) DO UPDATE SET " +
      "tracking_number = EXCLUDED.tracking_number, courier_name = EXCLUDED.courier_name, shipment_status = EXCLUDED.shipment_status, " +
      "shipment_status_code = EXCLUDED.shipment_status_code, tracking_url = EXCLUDED.tracking_url, dispatch_date = EXCLUDED.dispatch_date, " +
      "estimated_delivery_date = EXCLUDED.estimated_delivery_date, actual_delivery_date = EXCLUDED.actual_delivery_date, " +
      "shipment_notes = EXCLUDED.shipment_notes, shipment_history = EXCLUDED.shipment_history, last_tracking_sync = EXCLUDED.last_tracking_sync, updated_at = now() " +
      "RETURNING *";

    pool
      .query(sql, [
        id,
        trackingNumber || "",
        courierName || "Delhivery",
        shipmentStatusText || "",
        shipmentStatusCode || "",
        trackingUrl || "",
        dispatchDate,
        estimatedDeliveryDate,
        actualDeliveryDate,
        shipmentNotes || "",
        JSON.stringify(history),
        lastTrackingSync,
      ])
      .then(function (r) {
        cb(null, mapRow(r.rows[0]));
      })
      .catch(cb);
  });
}

/** Active shipments: has AWB, not terminal, sync due. */
function listActiveShipmentsForSync(limit, cb) {
  var pool = poolMod.getPool();
  if (!pool) return process.nextTick(function () { cb(new Error("Database not configured")); });
  var lim = Math.max(1, Math.min(200, Math.floor(Number(limit) || 50)));
  var minIntervalMin = Math.max(5, Number(process.env.SHIPMENT_SYNC_MIN_INTERVAL_MINUTES) || 15);
  pool
    .query(
      "SELECT s.*, o.fulfillment_status FROM order_shipments s " +
        "JOIN orders o ON o.id = s.order_id " +
        "WHERE trim(s.tracking_number) <> '' " +
        "AND (s.shipment_status_code IS NULL OR s.shipment_status_code NOT IN ('delivered','returned','cancelled','lost','undelivered')) " +
        "AND (s.last_tracking_sync IS NULL OR s.last_tracking_sync < now() - ($2 || ' minutes')::interval) " +
        "ORDER BY s.last_tracking_sync NULLS FIRST, s.updated_at ASC LIMIT $1",
      [lim, String(minIntervalMin)]
    )
    .then(function (r) {
      cb(
        null,
        (r.rows || []).map(function (row) {
          return { orderId: row.order_id, shipment: mapRow(row), fulfillmentStatus: row.fulfillment_status };
        })
      );
    })
    .catch(cb);
}

function appendHistoryEntry(orderId, entry, cb) {
  getShipmentByOrderId(orderId, function (err, existing) {
    if (err) return cb(err);
    if (!existing) return cb(new Error("Shipment not found"));
    upsertShipment(
      orderId,
      {
        shipmentHistory: mergeHistory(existing.shipmentHistory, [entry]),
      },
      cb
    );
  });
}

module.exports = {
  mapRow: mapRow,
  publicShipmentView: publicShipmentView,
  guestPublicShipmentView: guestPublicShipmentView,
  mergeHistory: mergeHistory,
  extractCourierPartner: extractCourierPartner,
  getShipmentByOrderId: getShipmentByOrderId,
  findOrderIdByTrackingNumber: findOrderIdByTrackingNumber,
  upsertShipment: upsertShipment,
  listActiveShipmentsForSync: listActiveShipmentsForSync,
  appendHistoryEntry: appendHistoryEntry,
};
