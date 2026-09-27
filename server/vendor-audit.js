"use strict";

var poolMod = require("./db/pool.js");

function safeDetail(body) {
  var b = body && typeof body === "object" ? body : {};
  var out = {};
  Object.keys(b).forEach(function (key) {
    if (/password|token|secret|image|file/i.test(key)) return;
    var value = b[key];
    if (typeof value === "string") out[key] = value.slice(0, 240);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
  });
  return out;
}

function record(entry) {
  var p = poolMod.getPool();
  if (!p) return;
  var e = entry || {};
  p.query(
    "INSERT INTO vendor_audit_log (actor, action, entity_type, entity_id, detail) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [
      String(e.actor || "vendor").slice(0, 80),
      String(e.action || "update").slice(0, 80),
      String(e.entityType || "vendor").slice(0, 80),
      String(e.entityId || "").slice(0, 220),
      JSON.stringify(e.detail || {}),
    ]
  ).catch(function (err) {
    console.warn("[vendor-audit] write failed:", err && err.message ? err.message : err);
  });
}

function list(limit, cb) {
  var p = poolMod.getPool();
  if (!p) return process.nextTick(function () { cb(new Error("Database not configured")); });
  var n = Math.max(1, Math.min(100, Number(limit) || 20));
  p.query(
    "SELECT id, actor, action, entity_type, entity_id, detail, created_at FROM vendor_audit_log ORDER BY id DESC LIMIT $1",
    [n]
  )
    .then(function (result) {
      cb(null, result.rows.map(function (row) {
        return {
          id: String(row.id), actor: row.actor, action: row.action, entityType: row.entity_type,
          entityId: row.entity_id, detail: row.detail || {}, createdAt: new Date(row.created_at).toISOString(),
        };
      }));
    })
    .catch(cb);
}

module.exports = { record: record, list: list, safeDetail: safeDetail };
