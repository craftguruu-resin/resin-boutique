"use strict";

var shipmentStatus = require("./shipment-status.js");
var courierHttp = require("./courier-http.js");

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
      { maxRetries: 2 }
    )
    .then(function (res) {
      return courierHttp.readJsonResponse(res).then(function (body) {
        if (!body || !body.success || !body.data || !body.data.token) {
          clearToken();
          throw new Error((body && body.message) || "BigShip login failed");
        }
        tokenCache.token = body.data.token;
        tokenCache.expiry = Date.now() + cfg.tokenTtlMs;
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
    return courierHttp.fetchWithRetry(cfg.baseUrl + path + qs, {
      method: "GET",
      headers: { accept: "application/json", Authorization: "Bearer " + token },
    });
  });
}

function parseIso(val) {
  if (!val) return null;
  var d = new Date(val);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
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

  var history = events
    .map(function (ev) {
      if (!ev) return null;
      var scanStatus = ev.scan_status || ev.scan_remarks || "";
      var code = shipmentStatus.mapCourierStatusToCode(scanStatus);
      return {
        statusCode: code,
        statusLabel: shipmentStatus.statusLabel(code),
        rawStatus: String(scanStatus || rawStatus).trim(),
        at: parseIso(ev.scan_datetime),
        location: String(ev.scan_location || "").trim(),
        source: "bigship",
      };
    })
    .filter(Boolean);

  if (!history.length && rawStatus) {
    history.push({
      statusCode: statusCode,
      statusLabel: statusLabel,
      rawStatus: rawStatus,
      at: null,
      source: "bigship",
    });
  }

  history.sort(function (a, b) {
    return new Date(a.at || 0) - new Date(b.at || 0);
  });

  var estimatedDeliveryDate = null;
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
    trackingNumber: String(data.tracking_id || awb).trim(),
    shipmentStatus: statusLabel,
    shipmentStatusCode: statusCode,
    trackingUrl: shipmentStatus.defaultTrackingUrl("BigShip", awb),
    dispatchDate: history.length ? history[0].at : null,
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

  return apiGet("/api/tracking", { tracking_id: awb, tracking_type: trackingType })
    .then(function (res) {
      return courierHttp.readJsonResponse(res);
    })
    .then(function (payload) {
      return parseBigShipPayload(awb, payload);
    })
    .catch(function (err) {
      if (err && /401|403|auth/i.test(String(err.message || err))) {
        clearToken();
      }
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
