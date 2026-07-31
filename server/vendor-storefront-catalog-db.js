"use strict";

var catalogFromData = require("./catalog-from-data.js");
var vendorCatalogDb = require("./vendor-catalog-db.js");
var vendorProductsDb = require("./vendor-products-db.js");
var vendorExtrasDb = require("./vendor-extras-db.js");
var rawMaterialsDb = require("./raw-materials-db.js");
var photoFramesDb = require("./photo-frames-db.js");
var variantInventory = require("./variant-inventory.js");

var CAT_RAW_MATERIALS = "__raw_materials__";
var CAT_PHOTO_FRAMES = "__photo_frames__";
var CAT_CORPORATE_GIFTING = "__corporate_gifting__";

var SIZE_LETTERS = ["s", "m", "l"];
var SIZE_IDS = ["sz-s", "sz-m", "sz-l"];
var SIZE_LABELS = ["Compact", "Classic", "Grand"];

function detectProductKind(productId) {
  var id = String(productId || "").trim();
  if (id.indexOf("raw-mat--") === 0) return "raw_material";
  if (id.indexOf("pf-prod--") === 0) return "photo_frame";
  return "catalog";
}

function virtualCategoryLabel(catId) {
  if (catId === CAT_RAW_MATERIALS) return "Raw Materials";
  if (catId === CAT_PHOTO_FRAMES) return "Photo Frames";
  if (catId === CAT_CORPORATE_GIFTING) return "Corporate Gifting";
  return "";
}

function finMoney(v) {
  if (v == null || v === "") return null;
  var n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function tierIndex(letter) {
  if (letter === "s") return 0;
  if (letter === "m") return 1;
  if (letter === "l") return 2;
  return -1;
}

function tierPriceFromMaterial(m, letter) {
  var base = Number(m.priceInr) || 0;
  var opt = m.options || {};
  var sizes = opt.useSize && Array.isArray(opt.sizes) ? opt.sizes : [];
  var idx = tierIndex(letter);
  if (idx < 0) return base;
  if (sizes[idx] && sizes[idx].priceInr != null) return Number(sizes[idx].priceInr) || 0;
  if (sizes.length === 1 && sizes[0] && sizes[0].priceInr != null) return Number(sizes[0].priceInr) || base;
  return base;
}

function tierCostFromMaterial(m, letter, ov) {
  ov = ov || {};
  var opt = m.options || {};
  var sizes = opt.useSize && Array.isArray(opt.sizes) ? opt.sizes : [];
  var idx = tierIndex(letter);
  if (idx >= 0 && sizes[idx] && sizes[idx].costInr != null) {
    return finMoney(sizes[idx].costInr);
  }
  var ck = letter === "s" ? "costS" : letter === "m" ? "costM" : "costL";
  if (ov[ck] != null) return finMoney(ov[ck]);
  return null;
}

function qtyOnHandFromMaterial(m) {
  var vi = m.options && m.options.vendorInventory;
  if (!vi || vi.qtyOnHand == null) return null;
  var n = Number(vi.qtyOnHand);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function productOptionsFromSources(m, ov) {
  var opt = (m && m.options && typeof m.options === "object" ? m.options : null) || (ov && ov.options) || {};
  return JSON.parse(JSON.stringify(opt || {}));
}

function attachOptionFlags(item, opt) {
  var flags = variantInventory.optionFlags(opt);
  item.useColor = flags.useColor;
  item.useQty = flags.useQty;
  item.useSize = flags.useSize;
  item.hasVariants = flags.hasVariants;
  item.hasExtendedOptions = flags.hasExtendedOptions;
  return item;
}

function mapMaterialToCatalogItem(m, kind, omap) {
  var ov = (omap && omap[m.id]) || {};
  var catId = kind === "raw_material" ? CAT_RAW_MATERIALS : CAT_PHOTO_FRAMES;
  var catLabel = virtualCategoryLabel(catId);
  var qty = qtyOnHandFromMaterial(m);
  var ovHasStock = ov.stockS != null || ov.stockM != null || ov.stockL != null;
  var st = {
    s: ov.stockS != null ? Number(ov.stockS) : null,
    m: qty != null ? qty : ov.stockM != null ? Number(ov.stockM) : null,
    l: ov.stockL != null ? Number(ov.stockL) : null,
  };
  var eff = {
    s: tierPriceFromMaterial(m, "s"),
    m: tierPriceFromMaterial(m, "m"),
    l: tierPriceFromMaterial(m, "l"),
  };
  var effCost = {
    s: tierCostFromMaterial(m, "s", ov),
    m: tierCostFromMaterial(m, "m", ov),
    l: tierCostFromMaterial(m, "l", ov),
  };
  var hasPriceOverride =
    (m.options &&
      m.options.useSize &&
      Array.isArray(m.options.sizes) &&
      m.options.sizes.some(function (sz) {
        return sz && sz.priceInr != null;
      })) ||
    ov.s != null ||
    ov.m != null ||
    ov.l != null;
  return attachOptionFlags(
    {
      id: m.id,
      name: m.name,
      category: catId,
      categoryLabel: catLabel,
      subcategory: m.subcategorySlug || m.baseCategorySlug || "",
      image: m.image || "",
      basePrices: { s: eff.s, m: eff.m, l: eff.l },
      effectivePrices: eff,
      effectiveCosts: effCost,
      effectiveStock: st,
      hasOverride: !!hasPriceOverride,
      hasStockOverride: !!(qty != null || ovHasStock),
      productKind: kind,
      sku: m.sku || "",
      isActive: m.isActive !== false,
    },
    productOptionsFromSources(m, ov)
  );
}

function mapResinCatalogItem(p, omap, aggMap, skuMap) {
  var ov = (omap && omap[p.id]) || {};
  var eff = {
    s: ov.s != null ? Number(ov.s) : p.prices.s,
    m: ov.m != null ? Number(ov.m) : p.prices.m,
    l: ov.l != null ? Number(ov.l) : p.prices.l,
  };
  var effCost = {
    s: ov.costS != null ? Number(ov.costS) : null,
    m: ov.costM != null ? Number(ov.costM) : null,
    l: ov.costL != null ? Number(ov.costL) : null,
  };
  var ovHasStock = ov.stockS != null || ov.stockM != null || ov.stockL != null;
  var agg = aggMap && aggMap[p.id];
  var st = ovHasStock
    ? {
        s: ov.stockS != null ? Number(ov.stockS) : null,
        m: ov.stockM != null ? Number(ov.stockM) : null,
        l: ov.stockL != null ? Number(ov.stockL) : null,
      }
    : agg
      ? { s: agg.s, m: agg.m, l: agg.l }
      : { s: null, m: null, l: null };
  var hasAggStock = !!(agg && (agg.s != null || agg.m != null || agg.l != null));
  var isCorp = !!(ov && ov.returnGift);
  return attachOptionFlags(
    {
      id: p.id,
      name: p.name,
      category: p.category,
      categoryLabel: isCorp ? "Corporate Gifting" : "",
      subcategory: p.subcategory,
      image: p.image,
      basePrices: p.prices,
      effectivePrices: eff,
      effectiveCosts: effCost,
      effectiveStock: st,
      hasOverride: !!(ov && (ov.s != null || ov.m != null || ov.l != null || ov.listed === false)),
      hasStockOverride: !!(ovHasStock || hasAggStock),
      productKind: "catalog",
      returnGift: isCorp,
      sku: (skuMap && skuMap[p.id]) || "",
      isActive: ov.listed !== false,
    },
    ov.options || {}
  );
}

function catalogProductHay(p) {
  return (
    String(p.id || "") +
    " " +
    String(p.name || "") +
    " " +
    String(p.category || "") +
    " " +
    String(p.subcategory || "") +
    " " +
    String(p.categoryLabel || "") +
    " " +
    String(p.sku || "")
  ).toLowerCase();
}

function buildResinCatalogList(omap, supSet, extras) {
  var list;
  try {
    list = catalogFromData.getProductsSummary();
  } catch (e) {
    throw e;
  }
  if (extras && extras.length) {
    extras.forEach(function (p) {
      list.push({
        id: p.id,
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
        image: p.image,
        prices: p.prices,
      });
    });
  }
  return list.filter(function (p) {
    if (supSet[p.id]) return false;
    var ov = omap[p.id] || {};
    return ov.listed !== false;
  });
}

function filterByCategory(list, catId, omap) {
  omap = omap || {};
  if (!catId) return list;
  if (catId === CAT_RAW_MATERIALS) {
    return list.filter(function (p) {
      return p.productKind === "raw_material";
    });
  }
  if (catId === CAT_PHOTO_FRAMES) {
    return list.filter(function (p) {
      return p.productKind === "photo_frame";
    });
  }
  if (catId === CAT_CORPORATE_GIFTING) {
    return list.filter(function (p) {
      if (p.productKind !== "catalog") return false;
      var ov = omap[p.id] || {};
      return ov.returnGift === true || p.returnGift === true;
    });
  }
  return list.filter(function (p) {
    return p.productKind === "catalog" && p.category === catId;
  });
}

/**
 * @param {{ q?: string, categoryId?: string, limit?: number, offset?: number }} opts
 * @param {(err: Error|null, payload?: object) => void} cb
 */
function listStorefrontCatalog(opts, cb) {
  opts = opts || {};
  var q = String(opts.q || "")
    .toLowerCase()
    .trim();
  var catId = String(opts.categoryId || "").trim();
  var lim = Math.min(200, Math.max(1, parseInt(String(opts.limit || "80"), 10) || 80));
  var off = Math.max(0, parseInt(String(opts.offset || "0"), 10) || 0);

  vendorCatalogDb.listOverridesMap(function (e2, omap) {
    if (e2) return cb(e2);
    omap = omap || {};
    vendorCatalogDb.listSuppressedProductIds(function (eSup, suppressed) {
      if (eSup) return cb(eSup);
      var supSet = Object.create(null);
      (suppressed || []).forEach(function (sid) {
        supSet[sid] = 1;
      });
      vendorProductsDb.listExtraProductsForStorefront(function (eV, extras) {
        if (eV) return cb(eV);
        var resinList;
        try {
          resinList = buildResinCatalogList(omap, supSet, extras);
        } catch (e3) {
          return cb(e3);
        }

        rawMaterialsDb.listAll("", function (eRm, rmRows) {
          if (eRm) return cb(eRm);
          photoFramesDb.listAll("", function (ePf, pfRows) {
            if (ePf) return cb(ePf);

            function finishUnified(allItems) {
              allItems = filterByCategory(allItems, catId, omap);
              if (q) {
                allItems = allItems.filter(function (p) {
                  return catalogProductHay(p).indexOf(q) !== -1;
                });
              }
              var total = allItems.length;
              var slice = allItems.slice(off, off + lim);
              var sliceIds = slice.map(function (p) {
                return p.id;
              });
              vendorExtrasDb.aggregateSellableStockByProductIds(sliceIds, function (eAgg, aggMap) {
                if (eAgg) return cb(eAgg);
                aggMap = aggMap || {};
                vendorExtrasDb.getSkuMapForProductIds(sliceIds, function (eSku, skuMap) {
                  if (eSku) return cb(eSku);
                  skuMap = skuMap || {};
                  slice = slice.map(function (p) {
                    if (p.productKind !== "catalog") return p;
                    return mapResinCatalogItem(
                      {
                        id: p.id,
                        name: p.name,
                        category: p.category,
                        subcategory: p.subcategory,
                        image: p.image,
                        prices: p.basePrices || p.effectivePrices,
                        returnGift: p.returnGift,
                      },
                      omap,
                      aggMap,
                      skuMap
                    );
                  });
                  vendorExtrasDb.countInventoryRows(function (eMat, matCount) {
                    if (eMat) return cb(eMat);
                    cb(null, {
                      productCount: allItems.length,
                      overrideCount: Object.keys(omap).length,
                      materialSkuCount: matCount,
                      total: total,
                      offset: off,
                      limit: lim,
                      items: slice,
                    });
                  });
                });
              });
            }

            var resinItems = resinList.map(function (p) {
              var ov = omap[p.id] || {};
              return mapResinCatalogItem(p, omap, {}, {});
            });
            var rmItems = (rmRows || []).map(function (m) {
              return mapMaterialToCatalogItem(m, "raw_material", omap);
            });
            var pfItems = (pfRows || []).map(function (m) {
              return mapMaterialToCatalogItem(m, "photo_frame", omap);
            });
            var merged = resinItems.concat(rmItems, pfItems);
            merged.sort(function (a, b) {
              return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
            });

            if (!q) {
              return finishUnified(merged);
            }

            var resinIds = resinList.map(function (p) {
              return p.id;
            });
            vendorExtrasDb.searchProductIdsBySku(q, function (eSku2, skuIds) {
              if (eSku2) return cb(eSku2);
              var seen = Object.create(null);
              var filtered = merged.filter(function (p) {
                if (catalogProductHay(p).indexOf(q) !== -1) {
                  seen[p.id] = 1;
                  return true;
                }
                return false;
              });
              (skuIds || []).forEach(function (pid) {
                if (seen[pid]) return;
                if (resinIds.indexOf(pid) >= 0) {
                  seen[pid] = 1;
                  var hit = resinItems.filter(function (x) {
                    return x.id === pid;
                  })[0];
                  if (hit) filtered.push(hit);
                }
              });
              finishUnified(filtered);
            });
          });
        });
      });
    });
  });
}

function ensureThreeSizeTiers(opt, basePrice) {
  opt.useSize = true;
  if (!Array.isArray(opt.sizes)) opt.sizes = [];
  for (var i = 0; i < 3; i++) {
    if (!opt.sizes[i] || typeof opt.sizes[i] !== "object") {
      opt.sizes[i] = {
        id: SIZE_IDS[i],
        label: SIZE_LABELS[i],
        image: "",
        priceInr: basePrice,
      };
    } else {
      if (!opt.sizes[i].id) opt.sizes[i].id = SIZE_IDS[i];
      if (!opt.sizes[i].label) opt.sizes[i].label = SIZE_LABELS[i];
      if (opt.sizes[i].priceInr == null) opt.sizes[i].priceInr = basePrice;
    }
  }
  opt.sizes = opt.sizes.slice(0, 3);
}

function applyTierPatchToOptions(opt, body, basePrice) {
  ensureThreeSizeTiers(opt, basePrice);
  var pairs = [
    ["priceS", "s"],
    ["priceM", "m"],
    ["priceL", "l"],
  ];
  pairs.forEach(function (pr) {
    var pk = pr[0];
    var letter = pr[1];
    var idx = tierIndex(letter);
    if (!Object.prototype.hasOwnProperty.call(body, pk)) return;
    var v = finMoney(body[pk]);
    if (v != null) opt.sizes[idx].priceInr = v;
  });
  var costPairs = [
    ["costS", "s"],
    ["costM", "m"],
    ["costL", "l"],
  ];
  costPairs.forEach(function (pr) {
    var pk = pr[0];
    var letter = pr[1];
    var idx = tierIndex(letter);
    if (!Object.prototype.hasOwnProperty.call(body, pk)) return;
    var raw = body[pk];
    if (raw === null || raw === "" || (typeof raw === "string" && !String(raw).trim())) {
      delete opt.sizes[idx].costInr;
      return;
    }
    var v = finMoney(raw);
    if (v != null) opt.sizes[idx].costInr = v;
  });
  return opt.sizes[0].priceInr != null ? Number(opt.sizes[0].priceInr) : basePrice;
}

function qtyFromStockBody(body) {
  var keys = ["stockM", "stockS", "stockL"];
  for (var i = 0; i < keys.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(body, keys[i])) continue;
    var raw = body[keys[i]];
    if (raw === null || raw === "" || (typeof raw === "string" && !String(raw).trim())) continue;
    var n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return null;
}

function saveMaterialCatalogPrices(kind, productId, body, cb) {
  var db = kind === "raw_material" ? rawMaterialsDb : photoFramesDb;
  db.getByIdForVendor(productId, function (e0, m) {
    if (e0) return cb(e0);
    if (!m) return cb(new Error("Unknown product id"));

    var opt = JSON.parse(JSON.stringify(m.options || {}));
    var note = (opt.vendorInventory && opt.vendorInventory.note) || "";
    var base = Number(m.priceInr) || 0;
    var nextBase = applyTierPatchToOptions(opt, body, base);
    var qty = qtyFromStockBody(body);
    opt.vendorInventory = {
      qtyOnHand: qty,
      note: String(note || "").slice(0, 500),
    };

    var payload = {
      name: m.name,
      description: m.description || "",
      note: m.note || "",
      sku: m.sku,
      priceInr: nextBase,
      mrpInr: m.mrpInr,
      options: opt,
      baseCategorySlug: m.baseCategorySlug || "",
      subcategorySlug: m.subcategorySlug || "",
    };
    if (m.image && (m.image.indexOf("http") === 0 || m.image.indexOf("//") === 0)) {
      payload.imageUrl = m.image;
    }

    db.updateRow(productId, payload, function (e1, row) {
      if (e1) return cb(e1);
      cb(null, { productId: productId, productKind: kind, material: row });
    });
  });
}

/**
 * @param {string} productId
 * @param {object} body — priceS/M/L, costS/M/L, stockS/M/L (+ resin-only fields)
 * @param {(err: Error|null, row?: object) => void} cb
 */
function saveStorefrontCatalogPrices(productId, body, cb) {
  var kind = detectProductKind(productId);
  if (kind === "raw_material" || kind === "photo_frame") {
    return saveMaterialCatalogPrices(kind, productId, body, cb);
  }
  vendorCatalogDb.upsertOverride(
    productId,
    {
      name: body.name !== undefined ? body.name : body.nameOverride !== undefined ? body.nameOverride : undefined,
      s: body.priceS != null ? Number(body.priceS) : body.s != null ? Number(body.s) : undefined,
      m: body.priceM != null ? Number(body.priceM) : body.m != null ? Number(body.m) : undefined,
      l: body.priceL != null ? Number(body.priceL) : body.l != null ? Number(body.l) : undefined,
      costS: body.costS !== undefined ? body.costS : body.cost_s !== undefined ? body.cost_s : undefined,
      costM: body.costM !== undefined ? body.costM : body.cost_m !== undefined ? body.cost_m : undefined,
      costL: body.costL !== undefined ? body.costL : body.cost_l !== undefined ? body.cost_l : undefined,
      stockS: body.stockS !== undefined ? body.stockS : body.stock_s !== undefined ? body.stock_s : undefined,
      stockM: body.stockM !== undefined ? body.stockM : body.stock_m !== undefined ? body.stock_m : undefined,
      stockL: body.stockL !== undefined ? body.stockL : body.stock_l !== undefined ? body.stock_l : undefined,
      listed: body.listed !== undefined ? !!body.listed : undefined,
      returnGift:
        body.returnGift !== undefined
          ? !!body.returnGift
          : body.return_gift !== undefined
            ? !!body.return_gift
            : undefined,
      sizeLabelS: body.sizeLabelS !== undefined ? body.sizeLabelS : body.size_label_s !== undefined ? body.size_label_s : undefined,
      sizeLabelM: body.sizeLabelM !== undefined ? body.sizeLabelM : body.size_label_m !== undefined ? body.size_label_m : undefined,
      sizeLabelL: body.sizeLabelL !== undefined ? body.sizeLabelL : body.size_label_l !== undefined ? body.size_label_l : undefined,
      sizeLabels: body.sizeLabels !== undefined ? body.sizeLabels : undefined,
      options:
        body.options !== undefined && body.options !== null && typeof body.options === "object"
          ? Object.assign({}, body.options)
          : undefined,
    },
    cb
  );
}

function saveMaterialCatalogVariants(kind, productId, body, cb) {
  var db = kind === "raw_material" ? rawMaterialsDb : photoFramesDb;
  db.getByIdForVendor(productId, function (e0, m) {
    if (e0) return cb(e0);
    if (!m) return cb(new Error("Unknown product id"));

    var opt = variantInventory.ensureVendorInventory(JSON.parse(JSON.stringify(m.options || {})));
    var vi = opt.vendorInventory;
    if (body && body.variants && typeof body.variants === "object") {
      vi.variants = variantInventory.mergeVariantPatch(vi.variants, body.variants);
    }
    if (body && Array.isArray(body.sizes)) {
      opt.sizes = variantInventory.mergeOptionPriceRows(opt.sizes, body.sizes);
    }
    if (body && Array.isArray(body.qtyOptions)) {
      opt.qtyOptions = variantInventory.mergeOptionPriceRows(opt.qtyOptions, body.qtyOptions);
    }
    if (body && Array.isArray(body.colors)) {
      opt.colors = variantInventory.mergeOptionPriceRows(opt.colors, body.colors);
    }

    var payload = {
      name: m.name,
      description: m.description || "",
      note: m.note || "",
      sku: m.sku,
      priceInr: Number(m.priceInr) || 0,
      mrpInr: m.mrpInr,
      options: opt,
      baseCategorySlug: m.baseCategorySlug || "",
      subcategorySlug: m.subcategorySlug || "",
    };
    if (m.image && (m.image.indexOf("http") === 0 || m.image.indexOf("//") === 0)) {
      payload.imageUrl = m.image;
    }

    db.updateRow(productId, payload, function (e1, row) {
      if (e1) return cb(e1);
      cb(null, { productId: productId, productKind: kind, material: row, options: opt });
    });
  });
}

/**
 * @param {string} productId
 * @param {{ variants?: object, sizes?: object[], qtyOptions?: object[], colors?: object[] }} body
 * @param {(err: Error|null, row?: object) => void} cb
 */
function saveStorefrontCatalogVariants(productId, body, cb) {
  var kind = detectProductKind(productId);
  if (kind === "raw_material" || kind === "photo_frame") {
    return saveMaterialCatalogVariants(kind, productId, body, cb);
  }

  vendorCatalogDb.listOverridesMap(function (e0, omap) {
    if (e0) return cb(e0);
    omap = omap || {};
    var ov = omap[productId] || {};
    var curOpt = ov.options && typeof ov.options === "object" ? JSON.parse(JSON.stringify(ov.options)) : {};
    var opt = variantInventory.ensureVendorInventory(curOpt);
    var vi = opt.vendorInventory;
    if (body && body.variants && typeof body.variants === "object") {
      vi.variants = variantInventory.mergeVariantPatch(vi.variants, body.variants);
    }
    if (body && Array.isArray(body.sizes)) {
      opt.sizes = variantInventory.mergeOptionPriceRows(opt.sizes, body.sizes);
      opt.useSize = true;
    }
    if (body && Array.isArray(body.qtyOptions)) {
      opt.qtyOptions = variantInventory.mergeOptionPriceRows(opt.qtyOptions, body.qtyOptions);
      opt.useQty = true;
    }
    if (body && Array.isArray(body.colors)) {
      opt.colors = variantInventory.mergeOptionPriceRows(opt.colors, body.colors);
      opt.useColor = true;
    }

    vendorCatalogDb.upsertOverride(productId, { options: opt }, function (e1, row) {
      if (e1) return cb(e1);
      cb(null, { productId: productId, productKind: "catalog", row: row, options: opt });
    });
  });
}

function buildDefaultOptionsFromTiers(p, ov, opt) {
  opt = opt && typeof opt === "object" ? Object.assign({}, opt) : {};
  var eff = {
    s: ov.s != null ? Number(ov.s) : p.prices.s,
    m: ov.m != null ? Number(ov.m) : p.prices.m,
    l: ov.l != null ? Number(ov.l) : p.prices.l,
  };
  var sl = ov.sizeLabels && typeof ov.sizeLabels === "object" ? ov.sizeLabels : {};
  opt.useSize = true;
  opt.sizes = [
    { id: "sz-s", label: (sl.s && sl.s.name) || "Compact", priceInr: eff.s },
    { id: "sz-m", label: (sl.m && sl.m.name) || "Classic", priceInr: eff.m },
    { id: "sz-l", label: (sl.l && sl.l.name) || "Grand", priceInr: eff.l },
  ];
  return variantInventory.ensureVendorInventory(opt);
}

function findResinProductSummary(productId, cb) {
  var id = String(productId || "").trim();
  try {
    var list = catalogFromData.getProductsSummary();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        return process.nextTick(function () {
          cb(null, list[i]);
        });
      }
    }
  } catch (e0) {
    return process.nextTick(function () {
      cb(e0);
    });
  }
  vendorProductsDb.listExtraProductsForStorefront(function (e1, extras) {
    if (e1) return cb(e1);
    var hit = (extras || []).filter(function (p) {
      return p.id === id;
    })[0];
    cb(null, hit || null);
  });
}

/**
 * @param {string} productId
 * @param {(err: Error|null, product?: object) => void} cb
 */
function getStorefrontCatalogProduct(productId, cb) {
  var kind = detectProductKind(productId);
  if (kind === "raw_material" || kind === "photo_frame") {
    var db = kind === "raw_material" ? rawMaterialsDb : photoFramesDb;
    return db.getByIdForVendor(productId, function (e0, m) {
      if (e0) return cb(e0);
      if (!m) return cb(new Error("Unknown product id"));
      vendorCatalogDb.listOverridesMap(function (e1, omap) {
        if (e1) return cb(e1);
        var item = mapMaterialToCatalogItem(m, kind, omap || {});
        var opt = productOptionsFromSources(m, (omap && omap[productId]) || {});
        cb(null, {
          id: m.id,
          name: m.name,
          image: m.image || "",
          category: item.category,
          categoryLabel: item.categoryLabel,
          subcategory: item.subcategory,
          productKind: kind,
          sku: m.sku || "",
          options: variantInventory.ensureVendorInventory(opt),
          effectivePrices: item.effectivePrices,
          effectiveCosts: item.effectiveCosts,
          effectiveStock: item.effectiveStock,
          useColor: item.useColor,
          useQty: item.useQty,
          useSize: item.useSize,
          hasVariants: item.hasVariants,
          hasExtendedOptions: item.hasExtendedOptions,
        });
      });
    });
  }

  vendorCatalogDb.listOverridesMap(function (e0, omap) {
    if (e0) return cb(e0);
    omap = omap || {};
    var ov = omap[productId] || {};
    findResinProductSummary(productId, function (e1, p) {
      if (e1) return cb(e1);
      if (!p) return cb(new Error("Unknown product id"));

      vendorExtrasDb.aggregateSellableStockByProductIds([productId], function (e2, aggMap) {
        if (e2) return cb(e2);
        vendorExtrasDb.getSkuMapForProductIds([productId], function (e3, skuMap) {
          if (e3) return cb(e3);
          var item = mapResinCatalogItem(p, omap, aggMap || {}, skuMap || {});
          var opt = ov.options && typeof ov.options === "object" ? JSON.parse(JSON.stringify(ov.options)) : {};
          if (!opt.useSize && !opt.useColor && !opt.useQty && !(opt.sizes && opt.sizes.length)) {
            opt = buildDefaultOptionsFromTiers(p, ov, opt);
          } else {
            opt = variantInventory.ensureVendorInventory(opt);
          }
          cb(null, {
            id: p.id,
            name: (ov.name && String(ov.name).trim()) || p.name,
            image: p.image || "",
            category: p.category,
            categoryLabel: item.categoryLabel || "",
            subcategory: p.subcategory,
            productKind: "catalog",
            sku: (skuMap && skuMap[productId]) || "",
            returnGift: item.returnGift,
            options: opt,
            effectivePrices: item.effectivePrices,
            effectiveCosts: item.effectiveCosts,
            effectiveStock: item.effectiveStock,
            useColor: item.useColor || !!opt.useColor,
            useQty: item.useQty || !!opt.useQty,
            useSize: item.useSize || !!opt.useSize,
            hasVariants: variantInventory.hasVariantInventory(opt),
            hasExtendedOptions: !!(opt.useColor || opt.useQty || variantInventory.hasVariantInventory(opt)),
          });
        });
      });
    });
  });
}

module.exports = {
  CAT_RAW_MATERIALS: CAT_RAW_MATERIALS,
  CAT_PHOTO_FRAMES: CAT_PHOTO_FRAMES,
  CAT_CORPORATE_GIFTING: CAT_CORPORATE_GIFTING,
  detectProductKind: detectProductKind,
  listStorefrontCatalog: listStorefrontCatalog,
  saveStorefrontCatalogPrices: saveStorefrontCatalogPrices,
  getStorefrontCatalogProduct: getStorefrontCatalogProduct,
  saveStorefrontCatalogVariants: saveStorefrontCatalogVariants,
};
