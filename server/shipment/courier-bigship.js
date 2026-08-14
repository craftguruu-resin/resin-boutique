"use strict";

var shipmentStatus = require("./shipment-status.js");
var courierHttp = require("./courier-http.js");
var courierLogger = require("./courier-logger.js");

var COURIER_ID = "bigship";
var DEFAULT_BASE = "https://api.bigship.in";

var tokenCache = {
  token: null,
  expiry: 0,
  inflight: null,
};

function getConfig() {
  var base = String(process.env.BIGSHIP_API_BASE || process.env.BIGSHIP_BASE_URL || "").trim();
  if (!base) base = DEFAULT_BASE;
  return {
    baseUrl: base.replace(/\/+$/, ""),
    userName: String(process.env.BIGSHIP_USERNAME || process.env.BIGSHIP_USER_NAME || "").trim(),
    password: String(process.env.BIGSHIP_PASSWORD || "").trim(),
    accessKey: String(process.env.BIGSHIP_ACCESS_KEY || process.env.BIGSHIP_API_KEY || "").trim(),
    tokenTtlMs: Math.max(60_000, Number(process.env.BIGSHIP_TOKEN_TTL_MS) || 55 * 60 * 1000),
  };
}

function describeBigShipConfig() {
  var cfg = getConfig();
  var creds = Boolean(cfg.userName && cfg.password && cfg.accessKey);
  return {
    configured: creds,
    credentialsSet: creds,
    sandbox: /sandbox/i.test(cfg.baseUrl),
    baseUrl: cfg.baseUrl,
  };
}

function isConfigured() {
  return describeBigShipConfig().configured;
}

function clearToken() {
  tokenCache.token = null;
  tokenCache.expiry = 0;
}

function login() {
  var st = describeBigShipConfig();
  if (!st.configured) {
    return Promise.reject(
      new Error(
        "BigShip is not configured. Set BIGSHIP_USERNAME, BIGSHIP_PASSWORD, and BIGSHIP_ACCESS_KEY in server environment (see server/.env.example)."
      )
    );
  }
  if (tokenCache.token && Date.now() < tokenCache.expiry) {
    return Promise.resolve(tokenCache.token);
  }
  if (tokenCache.inflight) return tokenCache.inflight;

  var cfg = getConfig();
  courierLogger.info(COURIER_ID, "login start", { baseUrl: cfg.baseUrl });

  tokenCache.inflight = courierHttp
    .fetchWithRetry(
      cfg.baseUrl + "/api/login/user",
      {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          user_name: cfg.userName,
          password: cfg.password,
          access_key: cfg.accessKey,
        }),
      },
      { maxRetries: 2, courierId: COURIER_ID, label: "POST /api/login/user" }
    )
    .then(function (res) {
      return courierHttp.readJsonResponse(res).then(function (body) {
        if (!body || !body.success || !body.data || !body.data.token) {
          clearToken();
          var msg = (body && body.message) || "BigShip login failed";
          courierLogger.error(COURIER_ID, "login failed", { message: msg });
          throw new Error(msg);
        }
        tokenCache.token = body.data.token;
        tokenCache.expiry = Date.now() + cfg.tokenTtlMs;
        courierLogger.info(COURIER_ID, "login ok");
        return tokenCache.token;
      });
    })
    .catch(function (err) {
      clearToken();
      throw err;
    })
    .finally(function () {
      tokenCache.inflight = null;
    });

  return tokenCache.inflight;
}

function apiGet(path, query) {
  var cfg = getConfig();
  var qs = "";
  if (query && typeof query === "object") {
    var parts = [];
    Object.keys(query).forEach(function (k) {
      if (query[k] != null && query[k] !== "") {
        parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(query[k])));
      }
    });
    if (parts.length) qs = "?" + parts.join("&");
  }
  return login().then(function (token) {
    return courierHttp.fetchWithRetry(
      cfg.baseUrl + path + qs,
      {
        method: "GET",
        headers: { accept: "application/json", Authorization: "Bearer " + token },
      },
      { courierId: COURIER_ID, label: "GET " + path }
    );
  });
}

function parseIso(val) {
  if (!val) return null;
  var d = new Date(val);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function firstNonEmpty(obj, keys) {
  if (!obj) return "";
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

/** Extract ETA from known fields or scan remarks (e.g. "EDD: 2026-08-20"). */
function extractEstimatedDelivery(data, events) {
  var direct = parseIso(
    firstNonEmpty(data, [
      "estimated_delivery_date",
      "expected_delivery_date",
      "edd",
      "promised_delivery_date",
      "delivery_date_expected",
    ])
  );
  if (direct) return direct;

  var list = Array.isArray(events) ? events : [];
  for (var i = list.length - 1; i >= 0; i--) {
    var ev = list[i];
    if (!ev) continue;
    var remarks = String(ev.scan_remarks || ev.scan_status || "").trim();
    var m = remarks.match(/(?:edd|est\.?\s*delivery|expected\s*delivery)[:\s-]*(\d{4}-\d{2}-\d{2})/i);
    if (m) return parseIso(m[1]);
    var m2 = remarks.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
    if (m2 && /delivery|edd/i.test(remarks)) return parseIso(m2[1]);
  }
  return null;
}

/** Underlying carrier assigned by BigShip (e.g. Delhivery, DTDC). */
function extractCourierPartner(data) {
  return firstNonEmpty(data, [
    "courier_name",
    "transporter_name",
    "partner_courier_name",
    "carrier_name",
    "logistics_partner",
    "courier_partner",
  ]);
}

/**
 * @param {string} awb
 * @param {object} payload - BigShip tracking API body
 */
function parseBigShipPayload(awb, payload) {
  if (!payload || !payload.success || !payload.data) {
    return {
      ok: false,
      found: false,
      trackingNumber: awb,
      error: (payload && payload.message) || "AWB not found",
    };
  }

  var data = payload.data;
  var rawStatus = String(data.current_status || "").trim();
  var statusCode = shipmentStatus.mapCourierStatusToCode(rawStatus);
  var statusLabel = shipmentStatus.statusLabel(statusCode);
  var events = Array.isArray(data.tracking_events) ? data.tracking_events : [];
  var courierPartner = extractCourierPartner(data);

  var history = events
    .map(function (ev) {
      if (!ev) return null;
      var scanStatus = ev.scan_status || ev.scan_remarks || "";
      var code = shipmentStatus.mapCourierStatusToCode(scanStatus);
      var entry = {
        statusCode: code,
        statusLabel: shipmentStatus.statusLabel(code),
        rawStatus: String(scanStatus || rawStatus).trim(),
        at: parseIso(ev.scan_datetime),
        location: String(ev.scan_location || "").trim(),
        source: "bigship",
      };
      if (courierPartner) entry.courierPartner = courierPartner;
      return entry;
    })
    .filter(Boolean);

  if (!history.length && rawStatus) {
    var fallback = {
      statusCode: statusCode,
      statusLabel: statusLabel,
      rawStatus: rawStatus,
      at: null,
      source: "bigship",
    };
    if (courierPartner) fallback.courierPartner = courierPartner;
    history.push(fallback);
  }

  history.sort(function (a, b) {
    return new Date(a.at || 0) - new Date(b.at || 0);
  });

  var estimatedDeliveryDate = extractEstimatedDelivery(data, events);
  var dispatchDate = history.length && history[0].at ? history[0].at : null;
  var actualDeliveryDate =
    statusCode === shipmentStatus.STATUS.DELIVERED
      ? history.length
        ? history[history.length - 1].at
        : new Date().toISOString()
      : null;

  return {
    ok: true,
    found: true,
    courierName: "BigShip",
    courierPartner: courierPartner || null,
    trackingNumber: String(data.tracking_id || awb).trim(),
    shipmentStatus: statusLabel,
    shipmentStatusCode: statusCode,
    trackingUrl: shipmentStatus.defaultTrackingUrl("BigShip", awb),
    dispatchDate: dispatchDate,
    estimatedDeliveryDate: estimatedDeliveryDate,
    actualDeliveryDate: actualDeliveryDate,
    history: history,
    rawStatus: rawStatus,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * @param {string} waybill
 * @param {{ trackingType?: string }} opts
 * @returns {Promise<object>}
 */
function fetchTracking(waybill, opts) {
  var awb = String(waybill || "").trim();
  if (!awb) return Promise.reject(new Error("Waybill required"));
  var trackingType = String((opts && opts.trackingType) || "awb").toLowerCase();

  courierLogger.info(COURIER_ID, "fetch tracking", { awb: awb, trackingType: trackingType });

  return apiGet("/api/tracking", { tracking_id: awb, tracking_type: trackingType })
    .then(function (res) {
      return courierHttp.readJsonResponse(res);
    })
    .then(function (payload) {
      var parsed = parseBigShipPayload(awb, payload);
      if (parsed.found) {
        courierLogger.info(COURIER_ID, "tracking ok", {
          awb: parsed.trackingNumber,
          status: parsed.shipmentStatusCode,
          courierPartner: parsed.courierPartner || undefined,
        });
      } else {
        courierLogger.warn(COURIER_ID, "tracking not found", { awb: awb, error: parsed.error });
      }
      return parsed;
    })
    .catch(function (err) {
      if (err && /401|403|auth|blocked|non-active/i.test(String(err.message || err))) {
        clearToken();
      }
      courierLogger.error(COURIER_ID, "tracking failed", { awb: awb, error: String(err.message || err) });
      throw err;
    });
}

function validateAwb(waybill) {
  return shipmentStatus.validateTrackingNumber(waybill, "BigShip");
}

module.exports = {
  id: "bigship",
  displayName: "BigShip",
  isConfigured: isConfigured,
  describeBigShipConfig: describeBigShipConfig,
  fetchTracking: fetchTracking,
  validateAwb: validateAwb,
  parseBigShipPayload: parseBigShipPayload,
  clearToken: clearToken,
};
