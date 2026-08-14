"use strict";

/**
 * Shared HTTP helpers for courier adapters (retry with backoff).
 */

var DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504];

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function jitterDelay(baseMs, attempt) {
  var cap = Math.min(baseMs * Math.pow(2, attempt), 30000);
  return Math.floor(Math.random() * cap);
}

/**
 * @param {string} url
 * @param {object} init
 * @param {{ maxRetries?: number, retryDelayMs?: number, retryOnStatus?: number[] }} opts
 * @returns {Promise<Response>}
 */
function fetchWithRetry(url, init, opts) {
  var maxRetries = Math.max(0, Number(opts && opts.maxRetries != null ? opts.maxRetries : process.env.SHIPMENT_HTTP_MAX_RETRIES || 3));
  var retryDelayMs = Math.max(200, Number(opts && opts.retryDelayMs != null ? opts.retryDelayMs : process.env.SHIPMENT_HTTP_RETRY_MS || 1000));
  var retryOn = (opts && opts.retryOnStatus) || DEFAULT_RETRY_STATUSES;

  function attempt(n) {
    return fetch(url, init).then(function (res) {
      if (n < maxRetries && retryOn.indexOf(res.status) >= 0) {
        return sleep(jitterDelay(retryDelayMs, n)).then(function () {
          return attempt(n + 1);
        });
      }
      return res;
    }).catch(function (err) {
      if (n < maxRetries) {
        return sleep(jitterDelay(retryDelayMs, n)).then(function () {
          return attempt(n + 1);
        });
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
};
