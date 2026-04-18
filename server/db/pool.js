"use strict";

var { Pool } = require("pg");

var pool = null;

function isEnabled() {
  return Boolean(process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim());
}

function getPool() {
  if (!isEnabled()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

/** @param {(err: Error|null, ok?: boolean) => void} cb */
function ping(cb) {
  var p = getPool();
  if (!p) return process.nextTick(function () {
    cb(null, false);
  });
  p.query("SELECT 1 AS x")
    .then(function () {
      cb(null, true);
    })
    .catch(function (e) {
      cb(e, false);
    });
}

module.exports = { isEnabled, getPool, ping };
