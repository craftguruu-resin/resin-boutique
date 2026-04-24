"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");
var { URL } = require("url");
var poolMod = require("./db/pool.js");
var sharp = require("sharp");
var catalogFromData = require("./catalog-from-data.js");
var vendorCatalogDb = require("./vendor-catalog-db.js");
var vendorExtrasDb = require("./vendor-extras-db.js");
var catalogMediaPath = require("./media-path.js");
var hiddenResinCatalog = require("./hidden-resin-catalog.js");
var resinClocksTaxonomy = require("./resin-clocks-taxonomy.js");
var resinGurujiProductsTaxonomy = require("./resin-guruji-products-taxonomy.js");
var resinKeychainsTaxonomy = require("./resin-keychains-taxonomy.js");

/** Ensures older Postgres DBs have products.size_labels before any SELECT/INSERT that uses it. */
var productsSizeLabelsPromise = null;
function ensureProductsSizeLabelsColumn(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null);
    });
  }
  if (!productsSizeLabelsPromise) {
    productsSizeLabelsPromise = pool
      .query("ALTER TABLE products ADD COLUMN IF NOT EXISTS size_labels JSONB NOT NULL DEFAULT '{}'::jsonb")
      .catch(function (err) {
        productsSizeLabelsPromise = null;
        return Promise.reject(err);
      });
  }
  productsSizeLabelsPromise
    .then(function () {
      cb(null);
    })
    .catch(function (e) {
      cb(e);
    });
}

var productsGalleryPromise = null;
function ensureProductsGalleryColumn(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null);
    });
  }
  if (!productsGalleryPromise) {
    productsGalleryPromise = pool
      .query("ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery_paths JSONB NOT NULL DEFAULT '[]'::jsonb")
      .catch(function (err) {
        productsGalleryPromise = null;
        return Promise.reject(err);
      });
  }
  productsGalleryPromise
    .then(function () {
      cb(null);
    })
    .catch(function (e) {
      cb(e);
    });
}

function ensureProductSchema(cb) {
  ensureProductsSizeLabelsColumn(function (e1) {
    if (e1) return cb(e1);
    ensureProductsGalleryColumn(cb);
  });
}

/** Accepts CDN URLs (Cloudinary, R2, etc.). Rejects non-HTTPS and obvious SSRF targets. */
function normalizeHttpsImageUrl(raw) {
  var u = String(raw || "").trim().slice(0, 2000);
  if (!/^https:\/\//i.test(u)) return "";
  try {
    var parsed = new URL(u);
    if (parsed.username || parsed.password) return "";
    var h = String(parsed.hostname || "").toLowerCase();
    if (!h || h === "localhost" || h === "127.0.0.1" || h === "[::1]") return "";
    return u;
  } catch (_) {
    return "";
  }
}

function parseGalleryPaths(row) {
  var g = row && (row.gallery_paths != null ? row.gallery_paths : row.galleryPaths);
  if (g == null) return [];
  if (typeof g === "string") {
    try {
      g = JSON.parse(g);
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(g)) return [];
  return g
    .map(function (x) {
      return String(x || "").trim();
    })
    .filter(Boolean)
    .slice(0, 24);
}

function normalizeGalleryLines(text) {
  var lines = String(text || "")
    .split(/\r?\n/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  var out = [];
  var seen = Object.create(null);
  for (var i = 0; i < lines.length && out.length < 24; i++) {
    var u = normalizeHttpsImageUrl(lines[i]);
    if (u && !seen[u]) {
      seen[u] = 1;
      out.push(u);
      continue;
    }
    var p = String(lines[i] || "").trim();
    if (p.indexOf("media/") === 0 && p.length < 500 && !seen[p]) {
      seen[p] = 1;
      out.push(p);
    }
  }
  return JSON.stringify(out);
}

function galleryJsonFromOpts(opts) {
  if (opts && Array.isArray(opts.gallery)) {
    return normalizeGalleryLines(opts.gallery.map(String).join("\n"));
  }
  return normalizeGalleryLines(String((opts && opts.galleryText) != null ? opts.galleryText : ""));
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

function normalizeSubObj(s) {
  if (s == null) return null;
  if (typeof s === "string") {
    var ts = String(s).trim();
    return ts ? { id: ts.slice(0, 80), label: ts.slice(0, 200) } : null;
  }
  if (typeof s !== "object") return null;
  var id = String(
    s.id != null && String(s.id).trim() !== ""
      ? s.id
      : s.subcategory_id != null && String(s.subcategory_id).trim() !== ""
        ? s.subcategory_id
        : s.subcategoryId != null && String(s.subcategoryId).trim() !== ""
          ? s.subcategoryId
          : s.slug != null && String(s.slug).trim() !== ""
            ? s.slug
            : s.key != null && String(s.key).trim() !== ""
              ? s.key
              : s.value != null && String(s.value).trim() !== ""
                ? s.value
                : ""
  ).trim();
  id = id.slice(0, 80);
  if (!id) return null;
  var label = String(s.label != null ? s.label : s.name != null ? s.name : id)
    .trim()
    .slice(0, 200);
  return { id: id, label: label || id };
}

function normalizeSubcategoriesRaw(sub) {
  if (typeof sub === "string") {
    try {
      sub = JSON.parse(sub);
    } catch (_) {
      sub = [];
    }
  }
  if (!Array.isArray(sub)) return [];
  return sub.map(normalizeSubObj).filter(Boolean);
}

function mergeSubcategoryLists(a, b) {
  var m = Object.create(null);
  normalizeSubcategoriesRaw(a).forEach(function (x) {
    m[x.id] = x;
  });
  normalizeSubcategoriesRaw(b).forEach(function (x) {
    m[x.id] = x;
  });
  return Object.keys(m).map(function (k) {
    return m[k];
  });
}

/**
 * Same idea as GET /api/vendor/categories: merge data.js + Postgres so vendor UI and create stay aligned.
 * @param {string} categoryId
 * @param {(err: Error|null, cat?: { id: string, label: string, folder: string, subcategories: { id: string, label: string }[] }) => void} cb
 */
function resolveCategoryForProduct(categoryId, cb) {
  var id = String(categoryId || "").trim().slice(0, 80);
  if (!id) {
    return process.nextTick(function () {
      cb(new Error("Unknown category"));
    });
  }
  var fromData = null;
  try {
    fromData = catalogFromData.getCategoriesList().find(function (c) {
      return String((c && c.id) || "").trim() === id;
    });
  } catch (e) {
    return process.nextTick(function () {
      cb(e);
    });
  }
  var pool = poolMod.getPool();
  if (!pool) {
    if (!fromData) {
      return process.nextTick(function () {
        cb(new Error("Unknown category"));
      });
    }
    return process.nextTick(function () {
      var subs0 = normalizeSubcategoriesRaw(mergeSubcategoryLists(fromData.subcategories, []));
      if (!subs0.length) subs0 = [{ id: "all", label: "All" }];
      cb(null, {
        id: String(fromData.id || "").trim() || id,
        label: fromData.label || fromData.id,
        folder: fromData.folder || "",
        subcategories: subs0,
      });
    });
  }
  pool
    .query("SELECT id, label, folder, subcategories FROM categories WHERE id = $1", [id])
    .then(function (r) {
      var row = r.rows[0];
      if (!fromData && !row) throw new Error("Unknown category");
      var label = (fromData && fromData.label) || (row && row.label) || id;
      var folder = (fromData && fromData.folder) || (row && row.folder) || "";
      var subs = mergeSubcategoryLists(fromData && fromData.subcategories, row && row.subcategories);
      subs = normalizeSubcategoriesRaw(subs);
      if (!subs.length) subs = [{ id: "all", label: "All" }];
      cb(null, { id: id, label: label, folder: folder, subcategories: subs });
    })
    .catch(cb);
}

function normalizeSizeLabelField(raw) {
  var t = String(raw == null ? "" : raw)
    .trim()
    .slice(0, 120);
  if (!t) return null;
  return { name: t };
}

function buildSizeLabelsObject(opts) {
  var o = {};
  var a = normalizeSizeLabelField(opts && opts.sizeLabelS);
  var b = normalizeSizeLabelField(opts && opts.sizeLabelM);
  var c = normalizeSizeLabelField(opts && opts.sizeLabelL);
  if (a) o.s = a;
  if (b) o.m = b;
  if (c) o.l = c;
  return o;
}

function mapRowToClient(row) {
  var prices = row.prices;
  if (typeof prices === "string") {
    try {
      prices = JSON.parse(prices);
    } catch (_) {
      prices = {};
    }
  }
  prices = prices || {};
  var sizeLabels = row.size_labels;
  if (typeof sizeLabels === "string") {
    try {
      sizeLabels = JSON.parse(sizeLabels);
    } catch (_) {
      sizeLabels = {};
    }
  }
  sizeLabels = sizeLabels && typeof sizeLabels === "object" ? sizeLabels : {};
  var subRaw =
    row.subcategory_id != null && String(row.subcategory_id).trim() !== "" ? String(row.subcategory_id) : "all";
  if (String(row.category_id || "").trim() === "resin-clocks") {
    subRaw = resinClocksTaxonomy.normalizeResinClocksSubcategoryId(row.category_id, subRaw);
  }
  if (String(row.category_id || "").trim() === "resin-guruji-products") {
    subRaw = resinGurujiProductsTaxonomy.normalizeResinGurujiProductsSubcategoryId(row.category_id, subRaw);
  }
  if (String(row.category_id || "").trim() === "resin-keychains") {
    subRaw = resinKeychainsTaxonomy.normalizeResinKeychainsSubcategoryId(row.category_id, subRaw);
  }
  var out = {
    id: row.id,
    name: row.name,
    category: row.category_id,
    subcategory: subRaw,
    image: row.image_path || "",
    prices: {
      s: Number(prices.s) || 0,
      m: Number(prices.m) || 0,
      l: Number(prices.l) || 0,
    },
  };
  if (sizeLabels.s || sizeLabels.m || sizeLabels.l) {
    out.sizeLabels = sizeLabels;
  }
  out.isActive = row.is_active !== false;
  if (row.listing_return_gift === true || row.listingReturnGift === true || row.returnGift === true) {
    out.returnGift = true;
  }
  var gallery = parseGalleryPaths(row);
  if (gallery.length) {
    out.gallery = gallery;
  }
  return out;
}

/** Products in Postgres that are not present in the static data.js catalog (vendor-added). */
function listExtraProductsForStorefront(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  ensureProductSchema(function (e0) {
    if (e0) return cb(e0);
    var staticIds;
    try {
      staticIds = new Set(catalogFromData.getProductsSummary().map(function (p) {
        return p.id;
      }));
    } catch (e) {
      return process.nextTick(function () {
        cb(e, []);
      });
    }
    pool
      .query(
        "SELECT p.id, p.name, p.category_id, p.subcategory_id, p.image_path, p.gallery_paths, p.prices, p.size_labels, p.is_active, " +
          "COALESCE(co.return_gift, false) AS listing_return_gift " +
          "FROM products p " +
          "LEFT JOIN catalog_price_overrides co ON co.product_id = p.id " +
          "WHERE p.is_active = true ORDER BY p.updated_at DESC"
      )
      .then(function (r) {
        var out = [];
        r.rows.forEach(function (row) {
          if (hiddenResinCatalog.isHiddenResinCategoryId(row.category_id)) return;
          if (!staticIds.has(row.id)) out.push(mapRowToClient(row));
        });
        cb(null, out);
      })
      .catch(cb);
  });
}

/**
 * @param {{ name: string, categoryId: string, priceS: number, priceM: number, priceL: number, sizeLabelS?: string, sizeLabelM?: string, sizeLabelL?: string, imageBuffer?: Buffer, mime?: string, imageUrl?: string }} opts
 * @param {(err: Error|null, row?: object) => void} cb
 */
function createVendorProduct(opts, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  ensureProductSchema(function (e0) {
    if (e0) return cb(e0);
    createVendorProductAfterSchema(opts, cb);
  });
}

function createVendorProductAfterSchema(opts, cb) {
  var pool = poolMod.getPool();
  var name = String((opts && opts.name) || "").trim().slice(0, 500);
  var categoryId = String((opts && opts.categoryId) || "").trim().slice(0, 80);
  var priceS = Math.max(0, Number(opts && opts.priceS) || 0);
  var priceM = Math.max(0, Number(opts && opts.priceM) || 0);
  var priceL = Math.max(0, Number(opts && opts.priceL) || 0);
  var buf = opts && opts.imageBuffer;
  var extUrl = normalizeHttpsImageUrl(opts && opts.imageUrl);
  if (!name || !categoryId) {
    return process.nextTick(function () {
      cb(new Error("Name and category are required"));
    });
  }
  if (hiddenResinCatalog.isHiddenResinCategoryId(categoryId)) {
    return process.nextTick(function () {
      cb(new Error("That category is not available for products"));
    });
  }
  var hasFile = buf && Buffer.isBuffer(buf) && buf.length >= 32;
  if (hasFile && buf.length > 12 * 1024 * 1024) {
    return process.nextTick(function () {
      cb(new Error("Image too large (max 12 MB)"));
    });
  }
  var urlTry = opts && opts.imageUrl != null ? String(opts.imageUrl).trim() : "";
  if (!hasFile && urlTry && !extUrl) {
    return process.nextTick(function () {
      cb(new Error("Invalid image URL. Use a full https:// link (e.g. from Cloudinary)."));
    });
  }
  if (!hasFile && !extUrl) {
    return process.nextTick(function () {
      cb(new Error("Provide a product image file or an HTTPS image URL (e.g. from Cloudinary)."));
    });
  }

  resolveCategoryForProduct(categoryId, function (err, cat) {
    if (err) return cb(err);
    var subDb = "all";
    if (String(categoryId) === "resin-clocks") {
      var subOpt = (opts && (opts.subcategoryId != null ? opts.subcategoryId : opts.subcategory)) || "";
      subDb = resinClocksTaxonomy.normalizeResinClocksSubcategoryId(categoryId, subOpt);
    }
    if (String(categoryId) === "resin-guruji-products") {
      var subOptG = (opts && (opts.subcategoryId != null ? opts.subcategoryId : opts.subcategory)) || "";
      subDb = resinGurujiProductsTaxonomy.normalizeResinGurujiProductsSubcategoryId(categoryId, subOptG);
    }
    if (String(categoryId) === "resin-keychains") {
      var subOptK = (opts && (opts.subcategoryId != null ? opts.subcategoryId : opts.subcategory)) || "";
      subDb = resinKeychainsTaxonomy.normalizeResinKeychainsSubcategoryId(categoryId, subOptK);
    }

    var folderLabel = String((cat && cat.folder) || cat.label || categoryId)
      .replace(/[/\\]/g, "")
      .trim();
    if (!folderLabel) folderLabel = categoryId;

    var baseSlug = slugify(name) || "product";
    var suffix = crypto.randomBytes(4).toString("hex");
    var fileStem = (baseSlug + "-" + suffix).slice(0, 120);
    var productId = categoryId + "--" + subDb + "--" + fileStem;

    var pricesJson = JSON.stringify({ s: priceS, m: priceM, l: priceL });
    var sizeLabelsJson = JSON.stringify(buildSizeLabelsObject(opts));
    var galleryPathsJson = galleryJsonFromOpts(opts);

    function commitInsert(imagePathVal, absImageForRollback, cbOut) {
      pool
        .connect()
        .then(function (client) {
          return client
            .query("BEGIN")
            .then(function () {
              return client.query(
                "INSERT INTO products (id, name, category_id, subcategory_id, image_path, gallery_paths, prices, size_labels, is_active) " +
                  "VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, true) " +
                  "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category_id = EXCLUDED.category_id, " +
                  "subcategory_id = EXCLUDED.subcategory_id, image_path = EXCLUDED.image_path, gallery_paths = EXCLUDED.gallery_paths, prices = EXCLUDED.prices, " +
                  "size_labels = EXCLUDED.size_labels, " +
                  "is_active = true, updated_at = now() RETURNING id, name, category_id, subcategory_id, image_path, gallery_paths, prices, size_labels",
                [productId, name, categoryId, subDb, imagePathVal, galleryPathsJson, pricesJson, sizeLabelsJson]
              );
            })
            .then(function (insRes) {
              return client
                .query(
                  "INSERT INTO catalog_price_overrides (product_id, price_s, price_m, price_l, out_of_stock) VALUES ($1, $2, $3, $4, false) " +
                    "ON CONFLICT (product_id) DO UPDATE SET price_s = EXCLUDED.price_s, price_m = EXCLUDED.price_m, " +
                    "price_l = EXCLUDED.price_l, updated_at = now()",
                  [productId, priceS, priceM, priceL]
                )
                .then(function () {
                  return insRes;
                });
            })
            .then(function (insRes) {
              return client.query("COMMIT").then(function () {
                return insRes;
              });
            })
            .then(function (insRes) {
              client.release();
              catalogFromData.invalidateCache();
              var row0 = insRes && insRes.rows && insRes.rows[0];
              var mapped = row0 ? mapRowToClient(row0) : null;
              var outCreate = {
                id: productId,
                name: name,
                category: categoryId,
                subcategory: subDb,
                image: imagePathVal,
                prices: { s: priceS, m: priceM, l: priceL },
                sizeLabels: (mapped && mapped.sizeLabels) || buildSizeLabelsObject(opts),
              };
              if (mapped && mapped.gallery && mapped.gallery.length) {
                outCreate.gallery = mapped.gallery;
              }
              cbOut(null, outCreate);
            })
            .catch(function (err) {
              return client
                .query("ROLLBACK")
                .catch(function () {})
                .then(function () {
                  client.release();
                  if (absImageForRollback) {
                    try {
                      fs.unlinkSync(absImageForRollback);
                    } catch (_) {}
                  }
                  cbOut(err);
                });
            });
        })
        .catch(cbOut);
    }

    if (hasFile) {
      var catalogDir = path.join(catalogMediaPath.catalogMediaFsRoot(), folderLabel);
      var mime = String((opts && opts.mime) || "").toLowerCase();
      var usePng = mime.indexOf("png") !== -1;
      var ext = usePng ? "png" : "jpg";
      var fileName = fileStem + "." + ext;
      var relImage = "media/catalog/" + folderLabel + "/" + fileName;
      var absImage = path.join(catalogDir, fileName);
      fs.mkdir(catalogDir, { recursive: true }, function (mkErr) {
        if (mkErr) return cb(mkErr);
        var img = sharp(buf).rotate();
        var chain = usePng ? img.png({ compressionLevel: 9 }) : img.jpeg({ quality: 88, mozjpeg: true });
        chain
          .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
          .toFile(absImage, function (wErr) {
            if (wErr) return cb(wErr);
            commitInsert(relImage, absImage, cb);
          });
      });
      return;
    }

    commitInsert(extUrl, null, cb);
  });
}

function staticCatalogProductIds() {
  return new Set(
    catalogFromData.getProductsSummary().map(function (p) {
      return p.id;
    })
  );
}

function assertVendorManagedProductId(productId, cb) {
  var id = String(productId || "").trim().slice(0, 220);
  if (!id) {
    return process.nextTick(function () {
      cb(new Error("Product id required"));
    });
  }
  var staticIds;
  try {
    staticIds = staticCatalogProductIds();
  } catch (e) {
    return process.nextTick(function () {
      cb(e);
    });
  }
  if (staticIds.has(id)) {
    return process.nextTick(function () {
      cb(new Error("Built-in catalog products cannot be changed here"));
    });
  }
  process.nextTick(function () {
    cb(null, id);
  });
}

/**
 * Full storefront list for the Products admin page: data.js catalog + vendor-only DB rows,
 * merged with effective prices from overrides and optional inventory SKU hints.
 * @param {{ q?: string }|null} opts
 * @param {(err: Error|null, list?: object[]) => void} cb
 */
function listAllProductsForManage(opts, cb) {
  if (typeof opts === "function") {
    cb = opts;
    opts = {};
  }
  var qRaw = String((opts && opts.q) || "").trim();
  var ql = qRaw.toLowerCase();

  vendorCatalogDb.listOverridesMap(function (e1, omap) {
    if (e1) return cb(e1);
    omap = omap || {};
    var staticList;
    try {
      staticList = catalogFromData.getProductsSummary();
    } catch (e2) {
      return cb(e2);
    }
    listVendorManagedProducts(function (e3, vendorList) {
      if (e3) return cb(e3);
      vendorList = vendorList || [];
      var allIds = [];
      staticList.forEach(function (p) {
        allIds.push(p.id);
      });
      vendorList.forEach(function (p) {
        allIds.push(p.id);
      });
      vendorExtrasDb.getSkuMapForProductIds(allIds, function (e4, skuMap) {
        if (e4) return cb(e4);
        skuMap = skuMap || {};
        var out = [];

        staticList.forEach(function (p) {
          var ov = omap[p.id] || {};
          var listed = ov.listed !== false;
          var ovSl = ov.sizeLabels && typeof ov.sizeLabels === "object" ? ov.sizeLabels : {};
          var stSl = p.sizeLabels && typeof p.sizeLabels === "object" ? p.sizeLabels : {};
          var comb = {};
          ["s", "m", "l"].forEach(function (letter) {
            var a = ovSl[letter];
            var b = stSl[letter];
            var slot = a && a.name ? a : b && b.name ? b : null;
            if (slot && slot.name) {
              comb[letter] = { name: String(slot.name).trim().slice(0, 120) };
            }
          });
          var row = {
            id: p.id,
            name: p.name,
            category: p.category,
            subcategory: p.subcategory,
            image: p.image,
            prices: {
              s: ov.s != null ? Number(ov.s) : p.prices.s,
              m: ov.m != null ? Number(ov.m) : p.prices.m,
              l: ov.l != null ? Number(ov.l) : p.prices.l,
            },
            sku: skuMap[p.id] || "",
            returnGift: !!(ov && ov.returnGift),
            source: "catalog",
            isActive: listed,
          };
          if (Object.keys(comb).length) {
            row.sizeLabels = comb;
          }
          if (p.gallery && Array.isArray(p.gallery) && p.gallery.length) {
            row.gallery = p.gallery.slice();
          }
          if (ov.options && typeof ov.options === "object" && Object.keys(ov.options).length) {
            row.options = ov.options;
          }
          if (row.category === "resin-clocks") {
            row.subcategory = resinClocksTaxonomy.normalizeResinClocksSubcategoryId("resin-clocks", row.subcategory);
          }
          if (row.category === "resin-guruji-products") {
            row.subcategory = resinGurujiProductsTaxonomy.normalizeResinGurujiProductsSubcategoryId(
              "resin-guruji-products",
              row.subcategory
            );
          }
          if (row.category === "resin-keychains") {
            row.subcategory = resinKeychainsTaxonomy.normalizeResinKeychainsSubcategoryId("resin-keychains", row.subcategory);
          }
          out.push(row);
        });

        vendorList.forEach(function (row) {
          var ov = omap[row.id] || {};
          var listed = ov.listed !== false;
          var ovSl = ov.sizeLabels && typeof ov.sizeLabels === "object" ? ov.sizeLabels : {};
          var stSl = row.sizeLabels && typeof row.sizeLabels === "object" ? row.sizeLabels : {};
          var comb = {};
          ["s", "m", "l"].forEach(function (letter) {
            var a = ovSl[letter];
            var b = stSl[letter];
            var slot = a && a.name ? a : b && b.name ? b : null;
            if (slot && slot.name) {
              comb[letter] = { name: String(slot.name).trim().slice(0, 120) };
            }
          });
          var merged = Object.assign({}, row, {
            prices: {
              s: ov.s != null ? Number(ov.s) : row.prices.s,
              m: ov.m != null ? Number(ov.m) : row.prices.m,
              l: ov.l != null ? Number(ov.l) : row.prices.l,
            },
            sku: skuMap[row.id] || "",
            returnGift: !!(ov && ov.returnGift),
            source: "vendor",
            isActive: row.is_active !== false && listed,
          });
          if (Object.keys(comb).length) {
            merged.sizeLabels = comb;
          }
          if (ov.options && typeof ov.options === "object" && Object.keys(ov.options).length) {
            merged.options = ov.options;
          }
          if (merged.category === "resin-clocks") {
            merged.subcategory = resinClocksTaxonomy.normalizeResinClocksSubcategoryId("resin-clocks", merged.subcategory);
          }
          if (merged.category === "resin-guruji-products") {
            merged.subcategory = resinGurujiProductsTaxonomy.normalizeResinGurujiProductsSubcategoryId(
              "resin-guruji-products",
              merged.subcategory
            );
          }
          if (merged.category === "resin-keychains") {
            merged.subcategory = resinKeychainsTaxonomy.normalizeResinKeychainsSubcategoryId(
              "resin-keychains",
              merged.subcategory
            );
          }
          out.push(merged);
        });

        if (!ql) return cb(null, out);
        var filtered = out.filter(function (p) {
          var hay =
            p.id +
            " " +
            (p.name || "") +
            " " +
            (p.category || "") +
            " " +
            (p.subcategory || "") +
            " " +
            (p.sku || "");
          return hay.toLowerCase().indexOf(ql) !== -1;
        });
        cb(null, filtered);
      });
    });
  });
}

/** All vendor-managed rows in Postgres (includes discontinued), excluding static data.js ids. */
function listVendorManagedProducts(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  ensureProductSchema(function (e0) {
    if (e0) return cb(e0);
    var staticIds;
    try {
      staticIds = staticCatalogProductIds();
    } catch (e) {
      return process.nextTick(function () {
        cb(e, []);
      });
    }
    pool
      .query(
        "SELECT id, name, category_id, subcategory_id, image_path, gallery_paths, prices, size_labels, is_active FROM products ORDER BY updated_at DESC"
      )
      .then(function (r) {
        var out = [];
        r.rows.forEach(function (row) {
          if (hiddenResinCatalog.isHiddenResinCategoryId(row.category_id)) return;
          if (!staticIds.has(row.id)) out.push(mapRowToClient(row));
        });
        cb(null, out);
      })
      .catch(cb);
  });
}

/**
 * @param {string} productId
 * @param {boolean} isActive
 * @param {(err: Error|null) => void} cb
 */
/**
 * Permanently remove a vendor-created product (not in bundled data.js catalog).
 * Clears storefront overrides and unlinks studio inventory rows.
 * @param {string} productId
 * @param {(err: Error|null) => void} cb
 */
function deleteVendorManagedProduct(productId, cb) {
  assertVendorManagedProductId(productId, function (e0, id) {
    if (e0) return cb(e0);
    var pool = poolMod.getPool();
    if (!pool) {
      return process.nextTick(function () {
        cb(new Error("Database not configured"));
      });
    }
    pool
      .connect()
      .then(function (client) {
        return client
          .query("BEGIN")
          .then(function () {
            return client.query("DELETE FROM catalog_price_overrides WHERE product_id = $1", [id]);
          })
          .then(function () {
            return client.query("UPDATE vendor_inventory_items SET product_id = '' WHERE product_id = $1", [id]);
          })
          .then(function () {
            return client.query("DELETE FROM products WHERE id = $1", [id]);
          })
          .then(function (r) {
            if (!r.rowCount) {
              throw new Error("Product not found");
            }
            return client.query("COMMIT");
          })
          .then(function () {
            client.release();
            try {
              catalogFromData.invalidateCache();
            } catch (_) {}
            cb(null);
          })
          .catch(function (err) {
            return client
              .query("ROLLBACK")
              .catch(function () {})
              .then(function () {
                client.release();
                cb(err);
              });
          });
      })
      .catch(cb);
  });
}

function setVendorProductActive(productId, isActive, cb) {
  var id = String(productId || "").trim().slice(0, 220);
  if (!id) {
    return process.nextTick(function () {
      cb(new Error("Product id required"));
    });
  }
  var staticIds;
  try {
    staticIds = staticCatalogProductIds();
  } catch (e) {
    return process.nextTick(function () {
      cb(e);
    });
  }
  if (staticIds.has(id)) {
    return vendorCatalogDb.upsertOverride(id, { listed: !!isActive }, function (e2) {
      if (e2) return cb(e2);
      try {
        catalogFromData.invalidateCache();
      } catch (_) {}
      cb(null);
    });
  }
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  pool
    .query("UPDATE products SET is_active = $2, updated_at = now() WHERE id = $1", [id, !!isActive])
    .then(function (r) {
      if (!r.rowCount) {
        throw new Error("Product not found");
      }
      if (!isActive) {
        try {
          catalogFromData.invalidateCache();
        } catch (_) {}
        return cb(null);
      }
      vendorCatalogDb.upsertOverride(id, { listed: true }, function (e3) {
        if (e3) return cb(e3);
        try {
          catalogFromData.invalidateCache();
        } catch (_) {}
        cb(null);
      });
    })
    .catch(cb);
}

/**
 * @param {string} productId
 * @param {{ name?: string, priceS?: number, priceM?: number, priceL?: number, sizeLabelS?: string, sizeLabelM?: string, sizeLabelL?: string, imageBuffer?: Buffer, mime?: string, imageUrl?: string, returnGift?: boolean }} opts
 * @param {(err: Error|null, row?: object) => void} cb
 */
function updateVendorProductById(productId, opts, cb) {
  assertVendorManagedProductId(productId, function (e0, id) {
    if (e0) return cb(e0);
    var pool = poolMod.getPool();
    if (!pool) {
      return process.nextTick(function () {
        cb(new Error("Database not configured"));
      });
    }
    ensureProductSchema(function (e00) {
      if (e00) return cb(e00);
      pool
        .query(
          "SELECT id, name, category_id, subcategory_id, image_path, gallery_paths, prices, size_labels, is_active FROM products WHERE id = $1 LIMIT 1",
          [id]
        )
        .then(function (r) {
        if (!r.rows.length) {
          throw new Error("Product not found");
        }
        var row = r.rows[0];
        var name = opts && opts.name != null ? String(opts.name).trim().slice(0, 500) : String(row.name || "").trim();
        if (!name) {
          throw new Error("Name is required");
        }
        var priceS = opts && opts.priceS != null ? Math.max(0, Number(opts.priceS) || 0) : null;
        var priceM = opts && opts.priceM != null ? Math.max(0, Number(opts.priceM) || 0) : null;
        var priceL = opts && opts.priceL != null ? Math.max(0, Number(opts.priceL) || 0) : null;
        var prices = row.prices;
        if (typeof prices === "string") {
          try {
            prices = JSON.parse(prices);
          } catch (_) {
            prices = {};
          }
        }
        prices = prices || {};
        if (priceS == null) priceS = Number(prices.s) || 0;
        if (priceM == null) priceM = Number(prices.m) || 0;
        if (priceL == null) priceL = Number(prices.l) || 0;
        var sizeLabelsJson = JSON.stringify(
          opts && (opts.sizeLabelS != null || opts.sizeLabelM != null || opts.sizeLabelL != null)
            ? buildSizeLabelsObject(opts)
            : typeof row.size_labels === "string"
              ? (function () {
                  try {
                    return JSON.parse(row.size_labels);
                  } catch (_) {
                    return {};
                  }
                })()
              : row.size_labels || {}
        );
        var pricesJson = JSON.stringify({ s: priceS, m: priceM, l: priceL });
        var galleryPathsJson = JSON.stringify(parseGalleryPaths(row));
        if (opts && Object.prototype.hasOwnProperty.call(opts, "gallery")) {
          galleryPathsJson = normalizeGalleryLines(String(opts.gallery || ""));
        }
        var buf = opts && opts.imageBuffer;
        var extUrl = normalizeHttpsImageUrl(opts && opts.imageUrl);
        var imageUrlRaw = opts && opts.imageUrl != null ? String(opts.imageUrl).trim() : "";
        if (imageUrlRaw && !extUrl && !(buf && Buffer.isBuffer(buf) && buf.length >= 32)) {
          throw new Error("Invalid image URL. Use a full https:// link (e.g. from Cloudinary).");
        }
        if (buf && Buffer.isBuffer(buf) && buf.length >= 32) {
          if (buf.length > 12 * 1024 * 1024) {
            throw new Error("Image too large (max 12 MB)");
          }
          return resolveCategoryForProduct(String(row.category_id || "").trim(), function (err, cat) {
            if (err) return cb(err);
            var folderLabel = String((cat && cat.folder) || (cat && cat.label) || row.category_id || "")
              .replace(/[/\\]/g, "")
              .trim();
            if (!folderLabel) folderLabel = String(row.category_id || "misc");
            var catalogDir = path.join(catalogMediaPath.catalogMediaFsRoot(), folderLabel);
            var baseSlug = slugify(name) || "product";
            var suffix = crypto.randomBytes(4).toString("hex");
            var fileStem = (baseSlug + "-" + suffix).slice(0, 120);
            var mime = String((opts && opts.mime) || "").toLowerCase();
            var usePng = mime.indexOf("png") !== -1;
            var ext = usePng ? "png" : "jpg";
            var fileName = fileStem + "." + ext;
            var relImage = "media/catalog/" + folderLabel + "/" + fileName;
            var absImage = path.join(catalogDir, fileName);
            fs.mkdir(catalogDir, { recursive: true }, function (mkErr) {
              if (mkErr) return cb(mkErr);
              var img = sharp(buf).rotate();
              var chain = usePng ? img.png({ compressionLevel: 9 }) : img.jpeg({ quality: 88, mozjpeg: true });
              chain
                .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
                .toFile(absImage, function (wErr) {
                  if (wErr) return cb(wErr);
                  finishUpdate(relImage);
                });
            });
          });
        }
        if (extUrl) {
          return finishUpdate(extUrl);
        }
        finishUpdate(String(row.image_path || "").trim());

        function finishUpdate(relImage) {
          pool
            .connect()
            .then(function (client) {
              return client
                .query("BEGIN")
                .then(function () {
                  return client
                    .query(
                      "UPDATE products SET name = $2, image_path = $3, prices = $4::jsonb, size_labels = $5::jsonb, gallery_paths = $6::jsonb, updated_at = now() WHERE id = $1 " +
                        "RETURNING id, name, category_id, subcategory_id, image_path, gallery_paths, prices, size_labels, is_active",
                      [
                        id,
                        name,
                        relImage || String(row.image_path || "").trim(),
                        pricesJson,
                        sizeLabelsJson,
                        galleryPathsJson,
                      ]
                    )
                    .then(function (upd) {
                      return client
                        .query(
                          "INSERT INTO catalog_price_overrides (product_id, price_s, price_m, price_l, out_of_stock) VALUES ($1, $2, $3, $4, false) " +
                            "ON CONFLICT (product_id) DO UPDATE SET price_s = EXCLUDED.price_s, price_m = EXCLUDED.price_m, " +
                            "price_l = EXCLUDED.price_l, updated_at = now()",
                          [id, priceS, priceM, priceL]
                        )
                        .then(function () {
                          return upd;
                        });
                    });
                })
                .then(function (upd) {
                  return client.query("COMMIT").then(function () {
                    return upd;
                  });
                })
                .then(function (upd) {
                  client.release();
                  catalogFromData.invalidateCache();
                  var row0 = upd && upd.rows && upd.rows[0];
                  var outRow = row0 ? mapRowToClient(row0) : null;
                  if (opts && Object.prototype.hasOwnProperty.call(opts, "returnGift")) {
                    vendorCatalogDb.upsertOverride(id, { returnGift: !!opts.returnGift }, function (eR) {
                      if (eR) return cb(eR);
                      cb(null, outRow);
                    });
                    return;
                  }
                  cb(null, outRow);
                })
                .catch(function (err) {
                  return client
                    .query("ROLLBACK")
                    .catch(function () {})
                    .then(function () {
                      client.release();
                      cb(err);
                    });
                });
            })
            .catch(cb);
        }
      })
      .catch(cb);
    });
  });
}

module.exports = {
  listExtraProductsForStorefront: listExtraProductsForStorefront,
  createVendorProduct: createVendorProduct,
  listVendorManagedProducts: listVendorManagedProducts,
  listAllProductsForManage: listAllProductsForManage,
  updateVendorProductById: updateVendorProductById,
  setVendorProductActive: setVendorProductActive,
  deleteVendorManagedProduct: deleteVendorManagedProduct,
};
