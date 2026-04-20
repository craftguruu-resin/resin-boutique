"use strict";

var path = require("path");
var fs = require("fs");
var poolMod = require("./db/pool.js");

var RM_TAXONOMY_KEY = "raw_material_taxonomy";

function taxonomyFilePath() {
  return path.join(__dirname, "..", "raw-material-taxonomy.json");
}

function readDefaultRawMaterialTaxonomySync() {
  try {
    var raw = fs.readFileSync(taxonomyFilePath(), "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return { version: 1, categories: [] };
  }
}

/**
 * @param {(err: Error|null, doc: object) => void} cb
 */
function getRawMaterialTaxonomyMerged(cb) {
  var def = readDefaultRawMaterialTaxonomySync();
  if (!poolMod.isEnabled()) {
    return process.nextTick(function () {
      cb(null, def);
    });
  }
  poolMod
    .getPool()
    .query("SELECT doc FROM vendor_site_docs WHERE doc_key = $1 LIMIT 1", [RM_TAXONOMY_KEY])
    .then(function (r) {
      var row = r.rows[0];
      var d = row && row.doc;
      if (d && typeof d === "object" && Array.isArray(d.categories) && d.categories.length) {
        return cb(null, d);
      }
      cb(null, def);
    })
    .catch(function () {
      cb(null, def);
    });
}

/**
 * @param {object} doc
 * @param {(err?: Error) => void} cb
 */
function saveRawMaterialTaxonomy(doc, cb) {
  if (!poolMod.isEnabled()) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.categories)) {
    return process.nextTick(function () {
      cb(new Error("Invalid taxonomy: need { categories: [...] }"));
    });
  }
  poolMod
    .getPool()
    .query(
      "INSERT INTO vendor_site_docs (doc_key, doc, updated_at) VALUES ($1, $2::jsonb, now()) " +
        "ON CONFLICT (doc_key) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()",
      [RM_TAXONOMY_KEY, JSON.stringify(doc)]
    )
    .then(function () {
      cb();
    })
    .catch(cb);
}

module.exports = {
  RM_TAXONOMY_KEY: RM_TAXONOMY_KEY,
  readDefaultRawMaterialTaxonomySync: readDefaultRawMaterialTaxonomySync,
  getRawMaterialTaxonomyMerged: getRawMaterialTaxonomyMerged,
  saveRawMaterialTaxonomy: saveRawMaterialTaxonomy,
};
