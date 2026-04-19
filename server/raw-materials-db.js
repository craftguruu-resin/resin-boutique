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
        if (kind === "color") {
          var hex = String(row.hex || "").trim();
          if (!/^#?[0-9a-fA-F]{3,8}$/.test(hex)) hex = "#888888";
          if (hex.charAt(0) !== "#") hex = "#" + hex;
          out.hex = hex.slice(0, 9);
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
    throw new Error("Colour option: add between 1 and 5 colours (label + hex from studio).");
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
  };
}

function mapRow(row) {
  var opts = parseOptionsCell(row.options_json);
  try {
    opts = normalizeOptions(opts);
  } catch (_) {
    opts = { useSize: true, useQty: false, useColor: false, sizes: [{ id: "std", label: "Standard", image: "" }], qtyOptions: [], colors: [], badge: "", heroImage: "", trustBullets: [] };
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

var DEMO_IDS = ["raw-mat--demo-crystal-epoxy", "raw-mat--demo-pigment-set", "raw-mat--demo-hardener"];

function demoOptionsVariant(kind) {
  if (kind === "pigment") {
    return {
      useSize: false,
      useQty: true,
      useColor: true,
      badge: "Studio pick",
      heroImage: "https://placehold.co/900x1100/7c3aed/ffffff/png?text=Craft+Guru%0APigment+Kit",
      trustBullets: ["Non-toxic pigments", "UV-stable", "Mixes with Craft Guru epoxy", "Vegan"],
      sizes: [],
      qtyOptions: [
        { id: "q1", label: "3 jars", image: "" },
        { id: "q2", label: "6 jars", image: "" },
        { id: "q3", label: "12 jars", image: "" },
      ],
      colors: [
        { id: "c1", label: "Sunrise", hex: "#f59e0b", image: "https://placehold.co/800x1000/f59e0b/1f2937/png?text=Craft+Guru" },
        { id: "c2", label: "Lagoon", hex: "#06b6d4", image: "https://placehold.co/800x1000/06b6d4/ffffff/png?text=Craft+Guru" },
        { id: "c3", label: "Berry", hex: "#db2777", image: "https://placehold.co/800x1000/db2777/ffffff/png?text=Craft+Guru" },
      ],
    };
  }
  if (kind === "hardener") {
    return {
      useSize: true,
      useQty: false,
      useColor: false,
      badge: "BEST SELLER",
      heroImage: "https://placehold.co/900x1100/15803d/ffffff/png?text=Craft+Guru%0AHardener",
      trustBullets: ["Measured ratio", "Low yellowing", "Room-temp cure", "Craft Guru lab tested"],
      sizes: [
        { id: "s1", label: "250 ml", image: "" },
        { id: "s2", label: "500 ml", image: "" },
        { id: "s3", label: "1 L", image: "" },
      ],
      qtyOptions: [],
      colors: [],
    };
  }
  return {
    useSize: true,
    useQty: false,
    useColor: true,
    badge: "New",
    heroImage: "https://placehold.co/900x1100/4c1d95/ffffff/png?text=Craft+Guru%0ACrystal+Clear",
    trustBullets: ["High-clarity pour", "Low bubble formula", "Made for deep casts", "Craft Guru supply"],
    sizes: [
      { id: "s1", label: "750 ml", image: "" },
      { id: "s2", label: "1.5 L", image: "" },
    ],
    qtyOptions: [],
    colors: [
      { id: "c1", label: "Part A clear", hex: "#e5e7eb", image: "https://placehold.co/800x1000/e5e7eb/111827/png?text=Craft+Guru+A" },
      { id: "c2", label: "Part B clear", hex: "#d1d5db", image: "https://placehold.co/800x1000/d1d5db/111827/png?text=Craft+Guru+B" },
    ],
  };
}

/**
 * Inserts three demo rows for QA (ON CONFLICT DO NOTHING). Safe to call on every migrate.
 * @param {import('pg').Pool} pool
 * @returns {Promise<void>}
 */
function seedDemoMaterialsPromise(pool) {
  var demos = [
    {
      id: DEMO_IDS[0],
      name: "Craft Guru Crystal Clear Epoxy",
      description:
        "High-clarity epoxy for river tables, coasters, and deep pours. Pair with Craft Guru hardener for a dependable studio workflow.",
      note: "Ships from Jaipur · confirm lead time on WhatsApp",
      image: "https://placehold.co/900x1100/4c1d95/ffffff/png?text=Craft+Guru%0ACrystal+Clear",
      price: 1899,
      mrp: 2299,
      options: demoOptionsVariant("epoxy"),
    },
    {
      id: DEMO_IDS[1],
      name: "Craft Guru Pigment Discovery Set",
      description: "Concentrated resin pigments in curated hues. Pick your palette and pack size — colours are studio-controlled swatches.",
      note: "Starter-friendly",
      image: "https://placehold.co/900x1100/7c3aed/ffffff/png?text=Craft+Guru%0APigments",
      price: 649,
      mrp: 799,
      options: demoOptionsVariant("pigment"),
    },
    {
      id: DEMO_IDS[2],
      name: "Craft Guru Hardener (Part B)",
      description: "Matched hardener for Craft Guru crystal line. Choose the bottle size that fits your pour plan.",
      note: "Store cool & dry",
      image: "https://placehold.co/900x1100/15803d/ffffff/png?text=Craft+Guru%0AHardener",
      price: 799,
      mrp: 899,
      options: demoOptionsVariant("hardener"),
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
