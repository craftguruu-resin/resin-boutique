"use strict";

var { Pool } = require("pg");

var pool = null;

function isEnabled() {
  return Boolean(process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim());
}

/**
 * Neon + Cloud Run: use pooled connection string when available.
 * SSL is required for Neon; local Docker Postgres may omit sslmode.
 */
function buildPoolConfig() {
  var connectionString = String(process.env.DATABASE_URL || "").trim();
  var max = Number(process.env.PG_POOL_MAX);
  if (!Number.isFinite(max) || max < 1) {
    // Cloud Run concurrency often 80; keep pool small per instance.
    max = process.env.K_SERVICE ? 5 : 10;
  }

  var cfg = {
    connectionString: connectionString,
    max: max,
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 30_000,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS) || 10_000,
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: Number(process.env.PG_KEEPALIVE_DELAY_MS) || 10_000,
  };

  var forceSsl = String(process.env.PG_SSL || "").toLowerCase();
  var looksNeon = /neon\.tech/i.test(connectionString) || /sslmode=require/i.test(connectionString);
  if (forceSsl === "0" || forceSsl === "false" || forceSsl === "off") {
    // local docker
  } else if (forceSsl === "1" || forceSsl === "true" || looksNeon || process.env.K_SERVICE) {
    cfg.ssl = { rejectUnauthorized: String(process.env.PG_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false" };
  }

  return cfg;
}

function getPool() {
  if (!isEnabled()) return null;
  if (!pool) {
    pool = new Pool(buildPoolConfig());
    pool.on("error", function (err) {
      console.error("[pg] idle client error:", err && err.message ? err.message : err);
    });
  }
  return pool;
}

/** @param {(err: Error|null, ok?: boolean) => void} cb */
function ping(cb) {
  var p = getPool();
  if (!p) {
    return process.nextTick(function () {
      cb(null, false);
    });
  }
  p.query("SELECT 1 AS x")
    .then(function () {
      cb(null, true);
    })
    .catch(function (e) {
      cb(e, false);
    });
}

module.exports = { isEnabled: isEnabled, getPool: getPool, ping: ping };
