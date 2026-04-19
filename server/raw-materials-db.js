"use strict";

var crypto = require("crypto");
var path = require("path");
var fs = require("fs");
var poolMod = require("./db/pool.js");
var sharp = require("sharp");
var catalogFromData = require("./catalog-from-data.js");
var mediaPath = require("./media-path.js");

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

function shortId() {
  return crypto.randomBytes(4).toString("hex");
}

function normalizeHexString(raw) {
  var h = String(raw == null ? "" : raw)
    .trim()
    .replace(/^#/, "");
  if (!h) return "#888888";
  if (/^[0-9a-fA-F]{6}$/.test(h)) return "#" + h.toLowerCase();
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return (
      "#" +
      h[0].toLowerCase() +
      h[0].toLowerCase() +
      h[1].toLowerCase() +
      h[1].toLowerCase() +
      h[2].toLowerCase() +
      h[2].toLowerCase()
    );
  }
  if (/^[0-9a-fA-F]{8}$/.test(h)) return "#" + h.slice(0, 6).toLowerCase();
  return "#888888";
}

function parseOptionsCell(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      var j = JSON.parse(raw);
      return j && typeof j === "object" && !Array.isArray(j) ? j : {};
    } catch (_) {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return {};
}

function normalizeSkuInput(raw) {
  var t = String(raw == null ? "" : raw)
    .trim()
    .slice(0, 120);
  if (!t) return "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._\s-]*$/.test(t)) {
    throw new Error("SKU may only use letters, numbers, spaces, dot, underscore, and hyphen (max 120 characters).");
  }
  return t.toUpperCase().replace(/\s+/g, "-");
}

/** Safe ILIKE pattern: strips % and _ so user input cannot widen the match. */
function iLikeContainsPattern(needle) {
  var t = String(needle || "")
    .trim()
    .slice(0, 200)
    .replace(/%/g, "")
    .replace(/_/g, "");
  if (!t) return null;
  return "%" + t + "%";
}

function resolveSkuForInsert(pool, opts, cb) {
  var raw = opts && opts.sku != null ? String(opts.sku).trim() : "";
  var norm = "";
  try {
    norm = raw ? normalizeSkuInput(raw) : "";
  } catch (e) {
    return process.nextTick(function () {
      cb(e);
    });
  }
  function tryAuto(skuTry, attempt) {
    if (attempt > 12) return cb(new Error("Could not allocate a unique SKU; try again."));
    pool
      .query("SELECT 1 FROM raw_materials WHERE lower(trim(sku)) = lower(trim($1)) LIMIT 1", [skuTry])
      .then(function (r) {
        if (r.rows.length) {
          var next = "RM-" + crypto.randomBytes(4).toString("hex").toUpperCase();
          return tryAuto(next, attempt + 1);
        }
        cb(null, skuTry);
      })
      .catch(cb);
  }
  if (norm) {
    return pool
      .query("SELECT 1 FROM raw_materials WHERE lower(trim(sku)) = lower(trim($1)) LIMIT 1", [norm])
      .then(function (r) {
        if (r.rows.length) {
          return cb(new Error("That SKU is already in use."));
        }
        cb(null, norm);
      })
      .catch(cb);
  }
  tryAuto("RM-" + crypto.randomBytes(4).toString("hex").toUpperCase(), 0);
}

function assertSkuUniqueForUpdate(pool, rid, skuNorm, cb) {
  pool
    .query(
      "SELECT 1 FROM raw_materials WHERE lower(trim(sku)) = lower(trim($1)) AND id <> $2 LIMIT 1",
      [skuNorm, rid]
    )
    .then(function (r) {
      if (r.rows.length) {
        return cb(new Error("That SKU is already used by another product."));
      }
      cb(null);
    })
    .catch(cb);
}

function parseOptionalMoney(v) {
  if (v == null || v === "") return null;
  var n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function normalizeOptions(o) {
  var src = o && typeof o === "object" ? o : {};
  var useSize = !!src.useSize;
  var useQty = !!src.useQty;
  var useColor = !!src.useColor;
  var badge = String(src.badge || "").trim().slice(0, 80);
  var heroImage = String(src.heroImage || "").trim().slice(0, 2000);
  var trust = Array.isArray(src.trustBullets) ? src.trustBullets : [];
  var trustBullets = trust
    .map(function (t) {
      return String(t || "")
        .trim()
        .slice(0, 120);
    })
    .filter(Boolean)
    .slice(0, 8);

  var brandLine = String(src.brandLine || "").trim().slice(0, 100);
  var ratingScore = String(src.ratingScore || "").trim().slice(0, 20);
  var rcRaw = Number(src.reviewCount);
  var reviewCount =
    Number.isFinite(rcRaw) && rcRaw > 0 ? Math.min(999999, Math.round(rcRaw)) : null;
  var detailBody = String(src.detailBody || "").trim().slice(0, 4000);
  var galSrc = Array.isArray(src.galleryImages) ? src.galleryImages : [];
  var galleryImages = galSrc
    .map(function (u) {
      return String(u || "")
        .trim()
        .slice(0, 2000);
    })
    .filter(Boolean)
    .slice(0, 12);

  function normList(arr, kind) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map(function (row, idx) {
        if (!row || typeof row !== "object") return null;
        var id = String(row.id || "").trim().slice(0, 40) || kind + "-" + shortId();
        var label = String(row.label || "").trim().slice(0, 120);
        if (!label) return null;
        var image = String(row.image || "").trim().slice(0, 2000);
        var out = { id: id, label: label, image: image };
        if (kind === "co" || kind === "color") {
          out.hex = normalizeHexString(row.hex != null ? row.hex : row.Hex);
        }
        if (kind === "sz" || kind === "qt") {
          out.priceInr = parseOptionalMoney(row.priceInr);
          out.mrpInr = parseOptionalMoney(row.mrpInr);
        }
        return out;
      })
      .filter(Boolean);
  }

  var sizes = normList(src.sizes, "sz");
  var qtyOptions = normList(src.qtyOptions, "qt");
  var colors = normList(src.colors, "co");

  if (!useSize && !useQty && !useColor) {
    useSize = true;
    sizes = [{ id: "std", label: "Standard", image: "" }];
  }
  if (useSize && !sizes.length) {
    sizes = [{ id: "std", label: "Standard", image: "" }];
  }
  if (useQty && qtyOptions.length < 3) {
    throw new Error("Quantity option is enabled: add at least 3 pack / quantity choices.");
  }
  if (useColor && (colors.length < 1 || colors.length > 5)) {
    throw new Error("Colour option: add between 1 and 5 colours (label + swatch colour from studio).");
  }

  return {
    useSize: useSize,
    useQty: useQty,
    useColor: useColor,
    badge: badge,
    heroImage: heroImage,
    trustBullets: trustBullets,
    sizes: sizes,
    qtyOptions: qtyOptions,
    colors: colors,
    brandLine: brandLine,
    ratingScore: ratingScore,
    reviewCount: reviewCount,
    detailBody: detailBody,
    galleryImages: galleryImages,
  };
}

function mapRow(row) {
  var opts = parseOptionsCell(row.options_json);
  try {
    opts = normalizeOptions(opts);
  } catch (_) {
    opts = {
      useSize: true,
      useQty: false,
      useColor: false,
      sizes: [{ id: "std", label: "Standard", image: "" }],
      qtyOptions: [],
      colors: [],
      badge: "",
      heroImage: "",
      trustBullets: [],
      brandLine: "",
      ratingScore: "",
      reviewCount: null,
      detailBody: "",
      galleryImages: [],
    };
  }
  var price = row.price_inr != null ? Number(row.price_inr) : 0;
  var mrp = row.mrp_inr != null ? Number(row.mrp_inr) : null;
  return {
    id: row.id,
    sku: String(row.sku || "").trim(),
    name: String(row.name || ""),
    description: String(row.description || ""),
    image: String(row.image_path || ""),
    note: String(row.note || ""),
    isActive: row.is_active !== false,
    priceInr: Number.isFinite(price) ? Math.round(price * 100) / 100 : 0,
    mrpInr: mrp != null && Number.isFinite(mrp) ? Math.round(mrp * 100) / 100 : null,
    options: opts,
  };
}

function listActive(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  pool
    .query(
      "SELECT id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json FROM raw_materials WHERE is_active = true ORDER BY updated_at DESC"
    )
    .then(function (r) {
      cb(null, (r.rows || []).map(mapRow));
    })
    .catch(cb);
}

function listAll(search, cb) {
  if (typeof search === "function") {
    cb = search;
    search = "";
  }
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  var needle = String(search || "").trim().slice(0, 200);
  var sql =
    "SELECT id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, updated_at FROM raw_materials";
  var params = [];
  var pat = iLikeContainsPattern(needle);
  if (pat) {
    sql += " WHERE (name ILIKE $1 OR sku ILIKE $1 OR id ILIKE $1 OR description ILIKE $1)";
    params.push(pat);
  }
  sql += " ORDER BY updated_at DESC";
  pool
    .query(sql, params)
    .then(function (r) {
      cb(null, (r.rows || []).map(mapRow));
    })
    .catch(cb);
}

function getActiveById(id, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, null);
    });
  }
  var rid = String(id || "").trim().slice(0, 120);
  pool
    .query(
      "SELECT id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json FROM raw_materials WHERE id = $1 AND is_active = true",
      [rid]
    )
    .then(function (r) {
      if (!r.rows.length) return cb(null, null);
      cb(null, mapRow(r.rows[0]));
    })
    .catch(cb);
}

function getByIdForVendor(id, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, null);
    });
  }
  var rid = String(id || "").trim().slice(0, 120);
  pool
    .query(
      "SELECT id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json FROM raw_materials WHERE id = $1",
      [rid]
    )
    .then(function (r) {
      if (!r.rows.length) return cb(null, null);
      cb(null, mapRow(r.rows[0]));
    })
    .catch(cb);
}

function persistImageBuffer(buf, mime, nameHint, cb) {
  var heroDir = mediaPath.rawMaterialsMediaFsRoot();
  var baseSlug = slugify(nameHint) || "material";
  var fileStem = (baseSlug + "-" + crypto.randomBytes(3).toString("hex")).slice(0, 100);
  var m = String(mime || "").toLowerCase();
  var usePng = m.indexOf("png") !== -1;
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
        cb(null, relImage);
      });
  });
}

function resolveHeroImagePath(opts) {
  var hi = opts && opts.heroImage ? String(opts.heroImage).trim() : "";
  if (hi.indexOf("http") === 0 || hi.indexOf("//") === 0) return hi;
  return "";
}

/**
 * @param {{ name: string, description?: string, note?: string, priceInr?: number, mrpInr?: number|null, options?: object, imageBuffer?: Buffer, mime?: string, imageUrl?: string }} opts
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
  var priceInr = opts && opts.priceInr != null ? Number(opts.priceInr) : 0;
  if (!Number.isFinite(priceInr) || priceInr < 0) priceInr = 0;
  var mrpInr = opts && opts.mrpInr != null ? Number(opts.mrpInr) : null;
  if (mrpInr != null && !Number.isFinite(mrpInr)) mrpInr = null;

  var normOpts;
  try {
    normOpts = normalizeOptions((opts && opts.options) || {});
  } catch (e) {
    return process.nextTick(function () {
      cb(e);
    });
  }

  if (!name) {
    return process.nextTick(function () {
      cb(new Error("Name is required"));
    });
  }

  var buf = opts && opts.imageBuffer;
  var url = opts && opts.imageUrl ? String(opts.imageUrl).trim() : "";
  var heroFromOpts = resolveHeroImagePath(normOpts);

  function insertWithImage(imagePath) {
    resolveSkuForInsert(pool, opts, function (skuErr, skuFinal) {
      if (skuErr) return cb(skuErr);
      var newId = "raw-mat--" + crypto.randomBytes(6).toString("hex");
      pool
        .query(
          "INSERT INTO raw_materials (id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, sku) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8::jsonb, $9) RETURNING id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json",
          [newId, name, desc, imagePath, note, priceInr, mrpInr, JSON.stringify(normOpts), skuFinal]
        )
        .then(function (r) {
          try {
            catalogFromData.invalidateCache();
          } catch (_) {}
          cb(null, mapRow(r.rows[0]));
        })
        .catch(cb);
    });
  }

  if (buf && Buffer.isBuffer(buf) && buf.length >= 32) {
    persistImageBuffer(buf, opts.mime, name, function (err, rel) {
      if (err) return cb(err);
      insertWithImage(rel);
    });
    return;
  }
  if (url.indexOf("http") === 0 || url.indexOf("//") === 0) {
    insertWithImage(url.slice(0, 2000));
    return;
  }
  if (heroFromOpts) {
    insertWithImage(heroFromOpts.slice(0, 2000));
    return;
  }
  var firstColImg = "";
  if (normOpts.useColor && normOpts.colors.length) {
    firstColImg = String(normOpts.colors[0].image || "").trim();
  }
  if (!firstColImg && normOpts.useSize && normOpts.sizes.length) {
    firstColImg = String(normOpts.sizes[0].image || "").trim();
  }
  if (!firstColImg && normOpts.useQty && normOpts.qtyOptions.length) {
    firstColImg = String(normOpts.qtyOptions[0].image || "").trim();
  }
  if (firstColImg.indexOf("http") === 0 || firstColImg.indexOf("//") === 0) {
    insertWithImage(firstColImg.slice(0, 2000));
    return;
  }

  return process.nextTick(function () {
    cb(new Error("Add a main image: upload a file, paste an HTTPS image URL, or set a hero image / swatch image on an option."));
  });
}

/**
 * @param {string} id
 * @param {{ name: string, description?: string, note?: string, priceInr?: number, mrpInr?: number|null, options?: object, imageBuffer?: Buffer, mime?: string, imageUrl?: string|null }} opts
 */
function updateRow(id, opts, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var rid = String(id || "").trim().slice(0, 120);
  var name = String((opts && opts.name) || "").trim().slice(0, 500);
  var desc = String((opts && opts.description) || "").trim().slice(0, 4000);
  var note = String((opts && opts.note) || "").trim().slice(0, 300);
  var priceInr = opts && opts.priceInr != null ? Number(opts.priceInr) : 0;
  if (!Number.isFinite(priceInr) || priceInr < 0) priceInr = 0;
  var mrpInr = opts && opts.mrpInr != null ? Number(opts.mrpInr) : null;
  if (mrpInr != null && !Number.isFinite(mrpInr)) mrpInr = null;

  var normOpts;
  try {
    normOpts = normalizeOptions((opts && opts.options) || {});
  } catch (e) {
    return process.nextTick(function () {
      cb(e);
    });
  }

  if (!name) {
    return process.nextTick(function () {
      cb(new Error("Name is required"));
    });
  }

  var skuUpd;
  try {
    skuUpd = normalizeSkuInput(String((opts && opts.sku) || ""));
  } catch (eSk) {
    return process.nextTick(function () {
      cb(eSk);
    });
  }
  if (!skuUpd) {
    return process.nextTick(function () {
      cb(new Error("SKU is required."));
    });
  }

  assertSkuUniqueForUpdate(pool, rid, skuUpd, function (errU) {
    if (errU) return cb(errU);

    function doUpdate(imagePath) {
      var params;
      var sql;
      if (imagePath != null) {
        sql =
          "UPDATE raw_materials SET name = $1, description = $2, note = $3, price_inr = $4, mrp_inr = $5, options_json = $6::jsonb, sku = $7, image_path = $9, updated_at = now() WHERE id = $8 RETURNING id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json";
        params = [name, desc, note, priceInr, mrpInr, JSON.stringify(normOpts), skuUpd, rid, imagePath];
      } else {
        sql =
          "UPDATE raw_materials SET name = $1, description = $2, note = $3, price_inr = $4, mrp_inr = $5, options_json = $6::jsonb, sku = $7, updated_at = now() WHERE id = $8 RETURNING id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json";
        params = [name, desc, note, priceInr, mrpInr, JSON.stringify(normOpts), skuUpd, rid];
      }
      pool
        .query(sql, params)
        .then(function (r) {
          if (!r.rowCount) throw new Error("Not found");
          try {
            catalogFromData.invalidateCache();
          } catch (_) {}
          cb(null, mapRow(r.rows[0]));
        })
        .catch(cb);
    }

    var buf = opts && opts.imageBuffer;
    var url = opts && opts.imageUrl != null ? String(opts.imageUrl).trim() : null;

    if (buf && Buffer.isBuffer(buf) && buf.length >= 32) {
      persistImageBuffer(buf, opts.mime, name, function (err, rel) {
        if (err) return cb(err);
        doUpdate(rel);
      });
      return;
    }
    if (url && (url.indexOf("http") === 0 || url.indexOf("//") === 0)) {
      doUpdate(url.slice(0, 2000));
      return;
    }
    doUpdate(null);
  });
}

function deleteRow(id, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var rid = String(id || "").trim().slice(0, 120);
  pool
    .query("DELETE FROM raw_materials WHERE id = $1 RETURNING id", [rid])
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

var DEMO_IDS = ["raw-mat--craftguru-showcase-pour"];

function showcaseLuminaOptions() {
  var hero = "media/raw-material-shop-hero-craftguru.png";
  return {
    brandLine: "CRAFT GURU",
    ratingScore: "4.8",
    reviewCount: 214,
    detailBody:
      "How to use: cap bottles tightly between sessions and store upright out of direct sun. Mix Part A + Part B exactly as your batch card describes (by weight is most consistent). Pour in controlled layers for deep moulds so heat can escape. Cure times move with room temperature — 24–28°C is the sweet spot. This is a workshop resin, not a skin product; use gloves and ventilation. Questions? WhatsApp the studio from your order confirmation.",
    useSize: true,
    useQty: false,
    useColor: true,
    badge: "BEST SELLER",
    heroImage: hero,
    trustBullets: [
      "Safe & non-toxic when cured",
      "Lab-formulated in Jaipur",
      "Low-yellowing crystal line",
      "Vegan & cruelty-free supply chain",
    ],
    sizes: [
      { id: "sz400", label: "400 ML", image: "", priceInr: 1200, mrpInr: 1500 },
      { id: "sz600", label: "600 ML", image: "", priceInr: 1800, mrpInr: 2200 },
    ],
    qtyOptions: [],
    colors: [
      {
        id: "co-indigo",
        label: "Indigo label",
        hex: "#312e81",
        image: hero,
      },
      {
        id: "co-forest",
        label: "Forest label",
        hex: "#15803d",
        image: hero,
      },
      {
        id: "co-amber",
        label: "Amber label",
        hex: "#d97706",
        image: hero,
      },
    ],
  };
}

/**
 * Inserts one showcase raw material row for QA (ON CONFLICT DO NOTHING).
 * @param {import('pg').Pool} pool
 * @returns {Promise<void>}
 */
function seedDemoMaterialsPromise(pool) {
  var hero = "media/raw-material-shop-hero-craftguru.png";
  var demos = [
    {
      id: DEMO_IDS[0],
      sku: "RM-DEMO-POUR",
      name: "Oh My Pour! Crystal Clear Resin",
      description:
        "Your daily pour, bottled like a favourite lotion: a featherlight, high-clarity Craft Guru resin for river tables, deep casts, coasters, and bezels. Mixes smooth, cures glossy, and loves pigments. Choose your studio size and label colour — the swatches below are the exact studio picks, and your cart line follows the colour you tap.",
      note: "Ships free the week you pay on orders over ₹1500 · WhatsApp +91-8824350056 to confirm batch timing.",
      image: hero,
      price: 1200,
      mrp: 2049,
      options: showcaseLuminaOptions(),
    },
  ];
  return Promise.all(
    demos.map(function (d) {
      return pool.query(
        "INSERT INTO raw_materials (id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, sku) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8::jsonb, $9) ON CONFLICT (id) DO NOTHING",
        [d.id, d.name, d.description, d.image, d.note, d.price, d.mrp, JSON.stringify(d.options), d.sku]
      );
    })
  ).then(function () {});
}

module.exports = {
  listActive: listActive,
  listAll: listAll,
  getActiveById: getActiveById,
  getByIdForVendor: getByIdForVendor,
  createRow: createRow,
  updateRow: updateRow,
  deleteRow: deleteRow,
  setActive: setActive,
  seedDemoMaterialsPromise: seedDemoMaterialsPromise,
  DEMO_IDS: DEMO_IDS,
};
