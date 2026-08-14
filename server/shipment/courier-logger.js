"use strict";

/**
 * Structured logging for courier adapters (no secrets).
 */

function enabled() {
  return String(process.env.SHIPMENT_LOG_DISABLED || "").toLowerCase() !== "1";
}

function safeMeta(meta) {
  if (!meta || typeof meta !== "object") return meta;
  var out = {};
  Object.keys(meta).forEach(function (k) {
    var v = meta[k];
    if (/password|token|access_key|authorization/i.test(k)) return;
    out[k] = v;
  });
  return out;
}

function log(level, courierId, action, meta) {
  if (!enabled()) return;
  var prefix = "[shipment:" + String(courierId || "courier") + "] " + action;
  var payload = meta ? safeMeta(meta) : undefined;
  if (level === "warn") {
    if (payload) console.warn(prefix, payload);
    else console.warn(prefix);
    return;
  }
  if (level === "error") {
    if (payload) console.error(prefix, payload);
    else console.error(prefix);
    return;
  }
  if (payload) console.log(prefix, payload);
  else console.log(prefix);
}

module.exports = {
  debug: function (courierId, action, meta) {
    if (String(process.env.SHIPMENT_LOG_VERBOSE || "").toLowerCase() === "1") {
      log("debug", courierId, action, meta);
    }
  },
  info: function (courierId, action, meta) {
    log("info", courierId, action, meta);
  },
  warn: function (courierId, action, meta) {
    log("warn", courierId, action, meta);
  },
  error: function (courierId, action, meta) {
    log("error", courierId, action, meta);
  },
};
