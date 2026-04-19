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
    };
  }
  var price = row.price_inr != null ? Number(row.price_inr) : 0;
  var mrp = row.mrp_inr != null ? Number(row.mrp_inr) : null;
  return {
    id: row.id,
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
      "SELECT id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json FROM raw_materials WHERE is_active = true ORDER BY updated_at DESC"
    )
    .then(function (r) {
      cb(null, (r.rows || []).map(mapRow));
    })
    .catch(cb);
}

function listAll(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  pool
    .query(
      "SELECT id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json, updated_at FROM raw_materials ORDER BY updated_at DESC"
    )
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
      "SELECT id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json FROM raw_materials WHERE id = $1 AND is_active = true",
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
      "SELECT id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json FROM raw_materials WHERE id = $1",
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
    var id = "raw-mat--" + crypto.randomBytes(6).toString("hex");
    pool
      .query(
        "INSERT INTO raw_materials (id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8::jsonb) RETURNING id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json",
        [id, name, desc, imagePath, note, priceInr, mrpInr, JSON.stringify(normOpts)]
      )
      .then(function (r) {
        try {
          catalogFromData.invalidateCache();
        } catch (_) {}
        cb(null, mapRow(r.rows[0]));
      })
      .catch(cb);
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

  function doUpdate(imagePath) {
    var params = [name, desc, note, priceInr, mrpInr, JSON.stringify(normOpts), rid];
    var sql =
      "UPDATE raw_materials SET name = $1, description = $2, note = $3, price_inr = $4, mrp_inr = $5, options_json = $6::jsonb, updated_at = now() WHERE id = $7 RETURNING id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json";
    if (imagePath != null) {
      sql =
        "UPDATE raw_materials SET name = $1, description = $2, note = $3, price_inr = $4, mrp_inr = $5, options_json = $6::jsonb, image_path = $8, updated_at = now() WHERE id = $7 RETURNING id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json";
      params = [name, desc, note, priceInr, mrpInr, JSON.stringify(normOpts), rid, imagePath];
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
      { id: "sz400", label: "400 ML", image: "" },
      { id: "sz600", label: "600 ML", image: "" },
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
      name: "Oh My Pour! Crystal Clear Resin",
      description:
        "Your daily pour, bottled like a favourite lotion: a featherlight, high-clarity Craft Guru resin for river tables, deep casts, coasters, and bezels. Mixes smooth, cures glossy, and loves pigments. Choose your studio size and label colour — the swatches below are the exact studio picks, and your cart line follows the colour you tap.",
      note: "Ships free the week you pay on orders over ₹1500 · WhatsApp +91-8824350056 to confirm batch timing.",
      image: hero,
      price: 1649,
      mrp: 2049,
      options: showcaseLuminaOptions(),
    },
  ];
  return Promise.all(
    demos.map(function (d) {
      return pool.query(
        "INSERT INTO raw_materials (id, name, description, image_path, note, is_active, price_inr, mrp_inr, options_json) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8::jsonb) ON CONFLICT (id) DO NOTHING",
        [d.id, d.name, d.description, d.image, d.note, d.price, d.mrp, JSON.stringify(d.options)]
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
  setActive: setActive,
  seedDemoMaterialsPromise: seedDemoMaterialsPromise,
  DEMO_IDS: DEMO_IDS,
};
