"use strict";

var poolMod = require("./db/pool.js");

/**
 * @param {(err: Error|null, rows?: { id: number, image: string, animation: string, sortOrder: number }[]) => void} cb
 */
function listSlides(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  pool
    .query(
      "SELECT id, image_path AS image, animation, sort_order AS \"sortOrder\" FROM storefront_hero_slides ORDER BY sort_order ASC, id ASC"
    )
    .then(function (r) {
      cb(
        null,
        (r.rows || []).map(function (row) {
          return {
            id: row.id,
            image: String(row.image || "").trim(),
            animation: String(row.animation || "orbit").trim().slice(0, 40),
            sortOrder: row.sortOrder != null ? Number(row.sortOrder) : 0,
          };
        })
      );
    })
    .catch(cb);
}

/**
 * @param {{ imagePath: string, animation?: string, sortOrder?: number }} opts
 * @param {(err: Error|null, row?: object) => void} cb
 */
function insertSlide(opts, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var img = String((opts && opts.imagePath) || "").trim();
  if (!img) {
    return process.nextTick(function () {
      cb(new Error("imagePath required"));
    });
  }
  var anim = String((opts && opts.animation) || "orbit")
    .trim()
    .slice(0, 40);
  var ord = Math.max(0, Math.floor(Number((opts && opts.sortOrder) || 0)));
  pool
    .query(
      "INSERT INTO storefront_hero_slides (image_path, animation, sort_order) VALUES ($1, $2, $3) RETURNING id, image_path AS image, animation, sort_order AS \"sortOrder\"",
      [img, anim, ord]
    )
    .then(function (r) {
      cb(null, r.rows[0]);
    })
    .catch(cb);
}

function deleteSlide(id, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var nid = Number(id);
  if (!Number.isFinite(nid) || nid < 1) {
    return process.nextTick(function () {
      cb(new Error("Invalid id"));
    });
  }
  pool
    .query("DELETE FROM storefront_hero_slides WHERE id = $1 RETURNING id", [nid])
    .then(function (r) {
      if (!r.rowCount) {
        return cb(new Error("Not found"));
      }
      cb(null);
    })
    .catch(cb);
}

module.exports = {
  listSlides: listSlides,
  insertSlide: insertSlide,
  deleteSlide: deleteSlide,
};
