"use strict";

var crypto = require("crypto");
var path = require("path");
var fs = require("fs");
var poolMod = require("./db/pool.js");
var sharp = require("sharp");
var catalogFromData = require("./catalog-from-data.js");

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function mapRow(row) {
  return {
    id: row.id,
    name: String(row.name || ""),
    description: String(row.description || ""),
    image: String(row.image_path || ""),
    note: String(row.note || ""),
    isActive: row.is_active !== false,
  };
}

/** Public storefront list */
function listActive(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  pool
    .query(
      "SELECT id, name, description, image_path, note, is_active FROM raw_materials WHERE is_active = true ORDER BY updated_at DESC"
    )
    .then(function (r) {
      cb(null, (r.rows || []).map(mapRow));
    })
    .catch(cb);
}

/** Vendor: all rows */
function listAll(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  pool
    .query("SELECT id, name, description, image_path, note, is_active, updated_at FROM raw_materials ORDER BY updated_at DESC")
    .then(function (r) {
      cb(null, (r.rows || []).map(mapRow));
    })
    .catch(cb);
}

/**
 * @param {{ name: string, description?: string, note?: string, imageBuffer: Buffer, mime: string }} opts
 * @param {(err: Error|null, row?: object) => void} cb
 */
function createRow(opts, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var name = String((opts && opts.name) || "").trim().slice(0, 500);
  var desc = String((opts && opts.description) || "").trim().slice(0, 4000);
  var note = String((opts && opts.note) || "").trim().slice(0, 300);
  var buf = opts && opts.imageBuffer;
  if (!name) {
    return process.nextTick(function () {
      cb(new Error("Name is required"));
    });
  }
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 32) {
    return process.nextTick(function () {
      cb(new Error("Image file is required"));
    });
  }
  var id = "raw-mat--" + crypto.randomBytes(6).toString("hex");
  var siteRoot = path.join(__dirname, "..");
  var heroDir = path.join(siteRoot, "media", "raw-materials");
  var baseSlug = slugify(name) || "material";
  var fileStem = (baseSlug + "-" + crypto.randomBytes(3).toString("hex")).slice(0, 100);
  var mime = String((opts && opts.mime) || "").toLowerCase();
  var usePng = mime.indexOf("png") !== -1;
  var ext = usePng ? "png" : "jpg";
  var fileName = fileStem + "." + ext;
  var relImage = "media/raw-materials/" + fileName;
  var absImage = path.join(heroDir, fileName);

  fs.mkdir(heroDir, { recursive: true }, function (mkErr) {
    if (mkErr) return cb(mkErr);
    var img = sharp(buf).rotate();
    var chain = usePng ? img.png({ compressionLevel: 9 }) : img.jpeg({ quality: 88, mozjpeg: true });
    chain
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .toFile(absImage, function (wErr) {
        if (wErr) return cb(wErr);
        pool
          .query(
            "INSERT INTO raw_materials (id, name, description, image_path, note, is_active) VALUES ($1, $2, $3, $4, $5, true) RETURNING id, name, description, image_path, note, is_active",
            [id, name, desc, relImage, note]
          )
          .then(function (r) {
            try {
              catalogFromData.invalidateCache();
            } catch (_) {}
            cb(null, mapRow(r.rows[0]));
          })
          .catch(cb);
      });
  });
}

function setActive(id, isActive, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var rid = String(id || "").trim().slice(0, 120);
  pool
    .query("UPDATE raw_materials SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING id", [rid, !!isActive])
    .then(function (r) {
      if (!r.rowCount) {
        throw new Error("Not found");
      }
      try {
        catalogFromData.invalidateCache();
      } catch (_) {}
      cb(null);
    })
    .catch(cb);
}

module.exports = {
  listActive: listActive,
  listAll: listAll,
  createRow: createRow,
  setActive: setActive,
};
