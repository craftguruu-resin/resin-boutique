"use strict";

/**
 * Shared HTTP helpers for courier adapters (retry with backoff + timeout).
 */

var courierLogger = require("./courier-logger.js");

var DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504];
var DEFAULT_TIMEOUT_MS = Math.max(5000, Number(process.env.SHIPMENT_HTTP_TIMEOUT_MS) || 15000);

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function jitterDelay(baseMs, attempt) {
  var cap = Math.min(baseMs * Math.pow(2, attempt), 30000);
  return Math.floor(Math.random() * cap);
}

function mergeAbortSignals(userSignal, timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    var timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (!userSignal) return timeoutSignal;
    if (typeof AbortSignal.any === "function") return AbortSignal.any([userSignal, timeoutSignal]);
  }
  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort(new Error("Courier request timed out after " + timeoutMs + "ms"));
  }, timeoutMs);
  if (userSignal) {
    if (userSignal.aborted) controller.abort(userSignal.reason);
    else userSignal.addEventListener("abort", function () {
      controller.abort(userSignal.reason);
    });
  }
  return { signal: controller.signal, clear: function () { clearTimeout(timer); } };
}

/**
 * @param {string} url
 * @param {object} init
 * @param {{ maxRetries?: number, retryDelayMs?: number, retryOnStatus?: number[], timeoutMs?: number, courierId?: string, label?: string }} opts
 * @returns {Promise<Response>}
 */
function fetchWithRetry(url, init, opts) {
  var maxRetries = Math.max(0, Number(opts && opts.maxRetries != null ? opts.maxRetries : process.env.SHIPMENT_HTTP_MAX_RETRIES || 3));
  var retryDelayMs = Math.max(200, Number(opts && opts.retryDelayMs != null ? opts.retryDelayMs : process.env.SHIPMENT_HTTP_RETRY_MS || 1000));
  var retryOn = (opts && opts.retryOnStatus) || DEFAULT_RETRY_STATUSES;
  var timeoutMs = Math.max(1000, Number(opts && opts.timeoutMs != null ? opts.timeoutMs : DEFAULT_TIMEOUT_MS));
  var courierId = (opts && opts.courierId) || "courier";
  var label = (opts && opts.label) || url;

  function attempt(n) {
    var abortWrap = mergeAbortSignals(init && init.signal, timeoutMs);
    var reqInit = Object.assign({}, init || {}, { signal: abortWrap.signal });
    var started = Date.now();
    courierLogger.debug(courierId, "http request", { label: label, attempt: n + 1 });

    return fetch(url, reqInit)
      .then(function (res) {
        abortWrap.clear();
        courierLogger.debug(courierId, "http response", {
          label: label,
          status: res.status,
          ms: Date.now() - started,
        });
        if (n < maxRetries && retryOn.indexOf(res.status) >= 0) {
          courierLogger.warn(courierId, "http retry", { label: label, status: res.status, attempt: n + 1 });
          return sleep(jitterDelay(retryDelayMs, n)).then(function () {
            return attempt(n + 1);
          });
        }
        return res;
      })
      .catch(function (err) {
        abortWrap.clear();
        var isAbort = err && (err.name === "AbortError" || err.name === "TimeoutError");
        if (n < maxRetries && !isAbort) {
          courierLogger.warn(courierId, "http retry after error", {
            label: label,
            error: String(err.message || err),
            attempt: n + 1,
          });
          return sleep(jitterDelay(retryDelayMs, n)).then(function () {
            return attempt(n + 1);
          });
        }
        if (isAbort) {
          throw new Error("Courier request timed out (" + timeoutMs + "ms): " + label);
        }
        throw err;
      });
  }

  return attempt(0);
}

/**
 * @param {Response} res
 * @returns {Promise<object>}
 */
function readJsonResponse(res) {
  return res.text().then(function (text) {
    var body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch (_) {
        throw new Error("Courier returned invalid JSON (" + res.status + ")");
      }
    }
    if (!res.ok) {
      var msg =
        (body && (body.message || body.error || body.Error)) ||
        res.statusText ||
        "Courier API error (" + res.status + ")";
      throw new Error(String(msg));
    }
    return body;
  });
}

module.exports = {
  fetchWithRetry: fetchWithRetry,
  readJsonResponse: readJsonResponse,
  DEFAULT_RETRY_STATUSES: DEFAULT_RETRY_STATUSES,
  DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
};
