"use strict";

var crypto = require("crypto");
var path = require("path");
var fs = require("fs");
var poolMod = require("./db/pool.js");
var sharp = require("sharp");
var catalogFromData = require("./catalog-from-data.js");
var mediaPath = require("./media-path.js");

function sanitizeRmCategorySlug(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

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
  var viSrc = src.vendorInventory && typeof src.vendorInventory === "object" ? src.vendorInventory : {};
  var qtyHand = Number(viSrc.qtyOnHand);
  var vendorInventory = {
    qtyOnHand: Number.isFinite(qtyHand) && qtyHand >= 0 ? Math.min(99999999, Math.round(qtyHand)) : null,
    note: String(viSrc.note || "").trim().slice(0, 500),
  };
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
    vendorInventory: vendorInventory,
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
      vendorInventory: { qtyOnHand: null, note: "" },
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
    baseCategorySlug: String(row.base_category_slug || "").trim(),
    subcategorySlug: String(row.subcategory_slug || "").trim(),
    options: opts,
  };
}

function listActive(filter, cb) {
  if (typeof filter === "function") {
    cb = filter;
    filter = {};
  }
  var f = filter && typeof filter === "object" ? filter : {};
  var base = String(f.base || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
  var sub = String(f.sub || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  var sql =
    "SELECT id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, base_category_slug, subcategory_slug FROM raw_materials WHERE is_active = true";
  var params = [];
  if (base) {
    params.push(base);
    sql += " AND base_category_slug = $" + params.length;
  }
  if (sub) {
    params.push(sub);
    sql += " AND subcategory_slug = $" + params.length;
  }
  sql += " ORDER BY updated_at DESC";
  pool
    .query(sql, params)
    .then(function (r) {
      cb(null, (r.rows || []).map(mapRow));
    })
    .catch(cb);
}

function listAll(search, cb) {
  var opts = {};
  if (typeof search === "function") {
    cb = search;
    search = "";
  } else if (search && typeof search === "object" && typeof cb === "function") {
    opts = search;
    search = String(opts.q || opts.search || "").trim();
  } else {
    search = String(search || "").trim();
  }
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  var needle = String(search || "").trim().slice(0, 200);
  var base = String(opts.base || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
  var sub = String(opts.sub || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
  var sql =
    "SELECT id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, updated_at, base_category_slug, subcategory_slug FROM raw_materials";
  var params = [];
  var wh = [];
  var pat = iLikeContainsPattern(needle);
  if (pat) {
    params.push(pat);
    wh.push("(name ILIKE $" + params.length + " OR sku ILIKE $" + params.length + " OR id ILIKE $" + params.length + " OR description ILIKE $" + params.length + ")");
  }
  if (base) {
    params.push(base);
    wh.push("base_category_slug = $" + params.length);
  }
  if (sub) {
    params.push(sub);
    wh.push("subcategory_slug = $" + params.length);
  }
  if (wh.length) {
    sql += " WHERE " + wh.join(" AND ");
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
      "SELECT id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, base_category_slug, subcategory_slug FROM raw_materials WHERE id = $1 AND is_active = true",
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
      "SELECT id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, base_category_slug, subcategory_slug FROM raw_materials WHERE id = $1",
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

  var baseSlugIns = sanitizeRmCategorySlug(opts && opts.baseCategorySlug);
  var subSlugIns = sanitizeRmCategorySlug(opts && opts.subcategorySlug);

  var buf = opts && opts.imageBuffer;
  var url = opts && opts.imageUrl ? String(opts.imageUrl).trim() : "";
  var heroFromOpts = resolveHeroImagePath(normOpts);

  function insertWithImage(imagePath) {
    resolveSkuForInsert(pool, opts, function (skuErr, skuFinal) {
      if (skuErr) return cb(skuErr);
      var newId = "raw-mat--" + crypto.randomBytes(6).toString("hex");
      pool
        .query(
          "INSERT INTO raw_materials (id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, sku, base_category_slug, subcategory_slug) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8::jsonb, $9, $10, $11) RETURNING id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, base_category_slug, subcategory_slug",
          [newId, name, desc, imagePath, note, priceInr, mrpInr, JSON.stringify(normOpts), skuFinal, baseSlugIns, subSlugIns]
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

  var baseSlugUp = sanitizeRmCategorySlug(opts && opts.baseCategorySlug);
  var subSlugUp = sanitizeRmCategorySlug(opts && opts.subcategorySlug);

  assertSkuUniqueForUpdate(pool, rid, skuUpd, function (errU) {
    if (errU) return cb(errU);

    function doUpdate(imagePath) {
      var params;
      var sql;
      if (imagePath != null) {
        sql =
          "UPDATE raw_materials SET name = $1, description = $2, note = $3, price_inr = $4, mrp_inr = $5, options_json = $6::jsonb, sku = $7, base_category_slug = $10, subcategory_slug = $11, image_path = $9, updated_at = now() WHERE id = $8 RETURNING id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, base_category_slug, subcategory_slug";
        params = [name, desc, note, priceInr, mrpInr, JSON.stringify(normOpts), skuUpd, rid, imagePath, baseSlugUp, subSlugUp];
      } else {
        sql =
          "UPDATE raw_materials SET name = $1, description = $2, note = $3, price_inr = $4, mrp_inr = $5, options_json = $6::jsonb, sku = $7, base_category_slug = $9, subcategory_slug = $10, updated_at = now() WHERE id = $8 RETURNING id, sku, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, base_category_slug, subcategory_slug";
        params = [name, desc, note, priceInr, mrpInr, JSON.stringify(normOpts), skuUpd, rid, baseSlugUp, subSlugUp];
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

function seedMinimalOptions(badge) {
  return {
    useSize: true,
    useQty: false,
    useColor: false,
    badge: String(badge || "").trim().slice(0, 80),
    heroImage: "",
    trustBullets: [],
    sizes: [{ id: "pk-std", label: "Standard pack", image: "" }],
    qtyOptions: [],
    colors: [],
    brandLine: "CRAFT GURU",
    ratingScore: "",
    reviewCount: null,
    detailBody:
      "Craftguru studio listing — open the product page for sizes, colours, and checkout. Mix and store per batch instructions.",
    galleryImages: [],
    vendorInventory: { qtyOnHand: null, note: "" },
  };
}

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
      baseCategorySlug: "resin-and-pigments",
      subcategorySlug: "",
      name: "Oh My Pour! Crystal Clear Resin",
      description:
        "Your daily pour, bottled like a favourite lotion: a featherlight, high-clarity Craft Guru resin for river tables, deep casts, coasters, and bezels. Mixes smooth, cures glossy, and loves pigments. Choose your studio size and label colour — the swatches below are the exact studio picks, and your cart line follows the colour you tap.",
      note: "Ships free the week you pay on orders over ₹1500 · WhatsApp +91-8824350056 to confirm batch timing.",
      image: hero,
      price: 1200,
      mrp: 2049,
      options: showcaseLuminaOptions(),
    },
    {
      id: "raw-mat--seed-pearl-powder",
      sku: "RM-SEED-PEARL",
      baseCategorySlug: "resin-and-pigments",
      subcategorySlug: "powder-pigments",
      name: "Pearl powder pigment",
      description: "High-sheen pearl powder for resin pours and geode lines. Mix sparingly into clear resin for depth.",
      note: "Store sealed away from moisture.",
      image: "media/raw-materials/rm-seed-pearl-powder.jpg",
      price: 349,
      mrp: 499,
      options: seedMinimalOptions("POPULAR PICK"),
    },
    {
      id: "raw-mat--seed-uv-resin",
      sku: "RM-SEED-UV50",
      baseCategorySlug: "resin-and-pigments",
      subcategorySlug: "uv-resin",
      name: "UV resin · 50 g",
      description: "Fast-cure UV resin for bezels, thin coats, and small doming projects. Cure with a quality UV lamp.",
      note: "Use nitrile gloves and eye protection.",
      image: "media/raw-materials/rm-seed-uv-resin-50g.png",
      price: 449,
      mrp: 599,
      options: seedMinimalOptions("POPULAR PICK"),
    },
    {
      id: "raw-mat--seed-2-1-art",
      sku: "RM-SEED-21ART",
      baseCategorySlug: "resin-and-pigments",
      subcategorySlug: "2-1-resin",
      name: "2:1 ratio art resin",
      description: "Deep-pour friendly 2:1 epoxy for river tables and thick castings when your workflow prefers ratio by weight.",
      note: "Always mix complete kits; do not short the hardener.",
      image: "media/raw-materials/rm-seed-2-1-art-resin.jpg",
      price: 1899,
      mrp: 2499,
      options: seedMinimalOptions("BEST SELLER"),
    },
    {
      id: "raw-mat--seed-gold-deco",
      sku: "RM-SEED-GOLDMK",
      baseCategorySlug: "basic-resin-material",
      subcategorySlug: "",
      name: "Gold deco marker",
      description: "Metallic paint marker for resin edge highlights, lettering, and fine studio details.",
      note: "Cap firmly after each session.",
      image: "media/raw-materials/rm-seed-gold-deco-marker.jpg",
      price: 199,
      mrp: 249,
      options: seedMinimalOptions("NEW"),
    },
    {
      id: "raw-mat--seed-tray-handle",
      sku: "RM-SEED-HANDLE",
      baseCategorySlug: "handles",
      subcategorySlug: "",
      name: "Tray handle set",
      description: "Hardware handles sized for resin trays, charcuterie boards, and serving pieces.",
      note: "Includes mounting screws where applicable.",
      image: "media/raw-materials/rm-seed-tray-handle.jpg",
      price: 279,
      mrp: 349,
      options: seedMinimalOptions("POPULAR PICK"),
    },
    {
      id: "raw-mat--seed-coaster-mold",
      sku: "RM-SEED-MOLD4",
      baseCategorySlug: "silicon-molds",
      subcategorySlug: "",
      name: "4 inch coaster silicone mold",
      description: "Reusable silicone coaster mould with clean release for crystal pours.",
      note: "Wash with mild soap; avoid sharp tools inside the cavity.",
      image: "media/raw-materials/rm-seed-coaster-mold.png",
      price: 329,
      mrp: 399,
      options: seedMinimalOptions(""),
    },
    {
      id: "raw-mat--seed-mixing-stick",
      sku: "RM-SEED-MIX",
      baseCategorySlug: "pouring-and-mixing",
      subcategorySlug: "",
      name: "Resin mixing sticks",
      description: "Sturdy reusable sticks for A/B blending before pour — keeps bubbles down when used with slow folding.",
      note: "Wipe clean between colours.",
      image: "media/raw-materials/rm-seed-mixing-stick.jpg",
      price: 89,
      mrp: 129,
      options: seedMinimalOptions(""),
    },
    {
      id: "raw-mat--seed-keychain-hook",
      sku: "RM-SEED-KHOOK",
      baseCategorySlug: "jewellery-and-keychain-material",
      subcategorySlug: "keychains-and-hooks",
      name: "Keychain hardware hook",
      description: "Metal findings for resin keychains — pair with tassels or jump rings from the same aisle.",
      note: "Check loop size against your mould eyelet.",
      image: "media/raw-materials/rm-seed-keychain-hook.jpg",
      price: 149,
      mrp: 199,
      options: seedMinimalOptions("POPULAR PICK"),
    },
  ];
  return Promise.all(
    demos.map(function (d) {
      return pool.query(
        "INSERT INTO raw_materials (id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, sku, base_category_slug, subcategory_slug) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8::jsonb, $9, $10, $11) ON CONFLICT (id) DO NOTHING",
        [
          d.id,
          d.name,
          d.description,
          d.image,
          d.note,
          d.price,
          d.mrp,
          JSON.stringify(d.options),
          d.sku,
          d.baseCategorySlug || "resin-and-pigments",
          d.subcategorySlug || "",
        ]
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
