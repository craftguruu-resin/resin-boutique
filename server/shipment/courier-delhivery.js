"use strict";

var shipmentStatus = require("./shipment-status.js");

var DEFAULT_BASE = "https://track.delhivery.com";
var STAGING_BASE = "https://staging-express.delhivery.com";

function getConfig() {
  var token = String(process.env.DELHIVERY_API_TOKEN || process.env.DELHIVERY_TOKEN || "").trim();
  var base = String(process.env.DELHIVERY_API_BASE || "").trim();
  if (!base) {
    base = String(process.env.DELHIVERY_STAGING || "").toLowerCase() === "1" ? STAGING_BASE : DEFAULT_BASE;
  }
  return { token: token, baseUrl: base.replace(/\/+$/, "") };
}

function isStagingBase(baseUrl) {
  return /staging-express\.delhivery\.com/i.test(String(baseUrl || ""));
}

/**
 * Public readiness probe (no secrets). Mirrors describeRazorpayConfig in server/index.js.
 */
function describeDelhiveryConfig() {
  var cfg = getConfig();
  var staging = isStagingBase(cfg.baseUrl);
  var tokenSet = Boolean(cfg.token);
  var blockedInProduction =
    String(process.env.NODE_ENV || "").toLowerCase() === "production" && staging;
  return {
    configured: tokenSet && !blockedInProduction,
    tokenSet: tokenSet,
    staging: staging,
    baseUrl: cfg.baseUrl,
    blockedInProduction: blockedInProduction,
  };
}

function isConfigured() {
  return describeDelhiveryConfig().configured;
}

/**
 * @param {string} waybill
 * @returns {Promise<object>}
 */
function fetchTracking(waybill) {
  var st = describeDelhiveryConfig();
  if (st.blockedInProduction) {
    return Promise.reject(
      new Error(
        "Delhivery staging API is blocked in production. Unset DELHIVERY_STAGING, use DELHIVERY_API_BASE=https://track.delhivery.com, and set your live API token."
      )
    );
  }
  if (!st.tokenSet) {
    return Promise.reject(
      new Error("Delhivery is not configured. Set DELHIVERY_API_TOKEN in server environment (see server/.env.example).")
    );
  }
  var cfg = getConfig();
  var awb = String(waybill || "").trim();
  if (!awb) return Promise.reject(new Error("Waybill required"));

  var url =
    cfg.baseUrl +
    "/api/v1/packages/json/?token=" +
    encodeURIComponent(cfg.token) +
    "&waybill=" +
    encodeURIComponent(awb) +
    "&verbose=2";

  return fetch(url, {
    method: "GET",
    headers: { accept: "application/json", Authorization: "Token " + cfg.token },
  })
    .then(function (res) {
      return res.text().then(function (text) {
        var body = {};
        if (text) {
          try {
            body = JSON.parse(text);
          } catch (_) {
            throw new Error("Delhivery returned invalid JSON");
          }
        }
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error(
              "Invalid Delhivery API token. Ensure DELHIVERY_API_TOKEN matches the environment (" +
                (st.staging ? "staging" : "production") +
                ") and Authorization header format Token <key>."
            );
          }
          var msg =
            (body && (body.error || body.message || body.Error)) ||
            res.statusText ||
            "Delhivery API error (" + res.status + ")";
          throw new Error(String(msg));
        }
        return body;
      });
    })
    .then(function (payload) {
      return parseDelhiveryPayload(awb, payload);
    });
}

function parseIso(val) {
  if (!val) return null;
  var d = new Date(val);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * Normalize Delhivery tracking response.
 * @param {string} awb
 * @param {object} payload
 */
function parseDelhiveryPayload(awb, payload) {
  var list = payload && payload.ShipmentData;
  if (!Array.isArray(list) || !list.length) {
    return {
      ok: false,
      found: false,
      trackingNumber: awb,
      error: "AWB not found on Delhivery",
    };
  }
  var shipWrap = list[0] && list[0].Shipment;
  if (!shipWrap) {
    return { ok: false, found: false, trackingNumber: awb, error: "Invalid Delhivery response" };
  }

  var statusObj = shipWrap.Status || {};
  var rawStatus = statusObj.Status || statusObj.status || "";
  var statusCode = shipmentStatus.mapCourierStatusToCode(rawStatus);
  var statusLabel = shipmentStatus.statusLabel(statusCode);

  var scans = Array.isArray(shipWrap.Scans) ? shipWrap.Scans : [];
  var history = scans
    .map(function (scan) {
      var sd = scan && scan.ScanDetail ? scan.ScanDetail : scan;
      if (!sd) return null;
      var scanStatus = sd.Scan || sd.Status || sd.Instructions || "";
      var code = shipmentStatus.mapCourierStatusToCode(scanStatus);
      return {
        statusCode: code,
        statusLabel: shipmentStatus.statusLabel(code),
        rawStatus: String(scanStatus || rawStatus).trim(),
        at: parseIso(sd.ScanDateTime || sd.StatusDateTime || sd.StatusDate),
        location: String(sd.ScannedLocation || sd.CityLocation || "").trim(),
        source: "delhivery",
      };
    })
    .filter(Boolean);

  if (!history.length && rawStatus) {
    history.push({
      statusCode: statusCode,
      statusLabel: statusLabel,
      rawStatus: String(rawStatus).trim(),
      at: parseIso(statusObj.StatusDateTime || statusObj.StatusDate),
      source: "delhivery",
    });
  }

  history.sort(function (a, b) {
    return new Date(a.at || 0) - new Date(b.at || 0);
  });

  var dispatchDate = parseIso(shipWrap.PickedupDate || shipWrap.OriginRecieveDate);
  var estimatedDeliveryDate = parseIso(
    shipWrap.ExpectedDeliveryDate || shipWrap.PromisedDeliveryDate || shipWrap.EstimatedDeliveryDate
  );
  var actualDeliveryDate =
    statusCode === shipmentStatus.STATUS.DELIVERED ? parseIso(shipWrap.DeliveryDate || statusObj.StatusDateTime) : null;

  return {
    ok: true,
    found: true,
    courierName: "Delhivery",
    trackingNumber: awb,
    shipmentStatus: statusLabel,
    shipmentStatusCode: statusCode,
    trackingUrl: shipmentStatus.defaultTrackingUrl("Delhivery", awb),
    dispatchDate: dispatchDate,
    estimatedDeliveryDate: estimatedDeliveryDate,
    actualDeliveryDate: actualDeliveryDate,
    history: history,
    rawStatus: String(rawStatus).trim(),
    syncedAt: new Date().toISOString(),
  };
}

function validateAwb(waybill) {
  return shipmentStatus.validateTrackingNumber(waybill, "Delhivery");
}

module.exports = {
  id: "delhivery",
  displayName: "Delhivery",
  isConfigured: isConfigured,
  describeDelhiveryConfig: describeDelhiveryConfig,
  fetchTracking: fetchTracking,
  validateAwb: validateAwb,
  parseDelhiveryPayload: parseDelhiveryPayload,
};
