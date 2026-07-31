"use strict";

function buildVariantSlot(sel) {
  sel = sel || {};
  var parts = [];
  if (sel.sid) parts.push("s:" + String(sel.sid));
  if (sel.qid) parts.push("q:" + String(sel.qid));
  if (sel.cid) parts.push("c:" + String(sel.cid));
  return parts.join("|") || (sel.sid ? String(sel.sid) : "std");
}

function parseVariantSlot(sizeKey) {
  var raw = String(sizeKey || "").trim();
  var out = { sid: "", cid: "", qid: "", raw: raw };
  if (!raw) return out;
  if (raw.indexOf(":") < 0 && raw.indexOf("|") < 0) {
    if (raw === "s" || raw === "m" || raw === "l") {
      out.sid = raw;
      return out;
    }
    out.sid = raw;
    return out;
  }
  raw.split("|").forEach(function (seg) {
    var i = seg.indexOf(":");
    if (i < 0) return;
    var k = seg.slice(0, i).trim().toLowerCase();
    var v = seg.slice(i + 1).trim();
    if (k === "s") out.sid = v;
    else if (k === "c") out.cid = v;
    else if (k === "q") out.qid = v;
  });
  return out;
}

function normalizeVariantStock(v) {
  if (v == null || v === "") return null;
  var n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function mergeVariantPatch(existing, patch) {
  existing = existing && typeof existing === "object" && !Array.isArray(existing) ? Object.assign({}, existing) : {};
  patch = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  Object.keys(patch).forEach(function (key) {
    var slot = String(key || "").trim();
    if (!slot) return;
    var row = patch[key];
    if (row === null) {
      delete existing[slot];
      return;
    }
    if (typeof row !== "object") return;
    var prev = existing[slot] && typeof existing[slot] === "object" ? existing[slot] : {};
    var next = Object.assign({}, prev);
    if (Object.prototype.hasOwnProperty.call(row, "stock")) {
      var st = normalizeVariantStock(row.stock);
      if (st != null) next.stock = st;
      else delete next.stock;
    }
    if (Object.prototype.hasOwnProperty.call(row, "priceInr")) {
      var pr = normalizeVariantStock(row.priceInr);
      if (pr != null) next.priceInr = pr;
      else delete next.priceInr;
    }
    if (Object.prototype.hasOwnProperty.call(row, "costInr")) {
      var co = normalizeVariantStock(row.costInr);
      if (co != null) next.costInr = co;
      else delete next.costInr;
    }
    existing[slot] = next;
  });
  return existing;
}

function hasVariantInventory(opt) {
  if (!opt || typeof opt !== "object") return false;
  var vi = opt.vendorInventory;
  if (!vi || typeof vi !== "object") return false;
  var v = vi.variants;
  return !!(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length);
}

function optionFlags(opt) {
  opt = opt || {};
  var hasVariants = hasVariantInventory(opt);
  return {
    useColor: !!opt.useColor,
    useQty: !!opt.useQty,
    useSize: !!opt.useSize,
    hasVariants: hasVariants,
    hasExtendedOptions: !!(opt.useColor || opt.useQty || hasVariants),
  };
}

function ensureVendorInventory(opt) {
  opt = opt && typeof opt === "object" && !Array.isArray(opt) ? Object.assign({}, opt) : {};
  var vi = opt.vendorInventory && typeof opt.vendorInventory === "object" ? Object.assign({}, opt.vendorInventory) : {};
  if (!vi.variants || typeof vi.variants !== "object" || Array.isArray(vi.variants)) {
    vi.variants = {};
  } else {
    vi.variants = Object.assign({}, vi.variants);
  }
  opt.vendorInventory = vi;
  return opt;
}

function mergeOptionPriceRows(existingList, patchList) {
  if (!Array.isArray(patchList) || !patchList.length) return existingList;
  var byId = Object.create(null);
  (existingList || []).forEach(function (row) {
    if (row && row.id != null) byId[String(row.id)] = Object.assign({}, row);
  });
  patchList.forEach(function (patch) {
    if (!patch || patch.id == null) return;
    var id = String(patch.id);
    var prev = byId[id] || { id: id, label: patch.label || id };
    if (patch.label != null && String(patch.label).trim()) prev.label = String(patch.label).trim().slice(0, 120);
    if (Object.prototype.hasOwnProperty.call(patch, "priceInr")) {
      var pr = normalizeVariantStock(patch.priceInr);
      if (pr != null) prev.priceInr = pr;
      else delete prev.priceInr;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "costInr")) {
      var co = normalizeVariantStock(patch.costInr);
      if (co != null) prev.costInr = co;
      else delete prev.costInr;
    }
    if (patch.image != null) prev.image = String(patch.image || "").trim().slice(0, 2000);
    if (patch.hex != null) prev.hex = String(patch.hex || "").trim().slice(0, 20);
    if (Object.prototype.hasOwnProperty.call(patch, "imageFit")) {
      var fit = String(patch.imageFit == null ? "" : patch.imageFit)
        .trim()
        .toLowerCase();
      if (fit === "contain" || fit === "cover") prev.imageFit = fit;
      else delete prev.imageFit;
    }
    byId[id] = prev;
  });
  var out = (existingList || []).map(function (row) {
    return byId[String(row.id)] || row;
  });
  Object.keys(byId).forEach(function (id) {
    var found = out.some(function (row) {
      return String(row.id) === id;
    });
    if (!found) out.push(byId[id]);
  });
  return out;
}

module.exports = {
  buildVariantSlot: buildVariantSlot,
  parseVariantSlot: parseVariantSlot,
  normalizeVariantStock: normalizeVariantStock,
  mergeVariantPatch: mergeVariantPatch,
  hasVariantInventory: hasVariantInventory,
  optionFlags: optionFlags,
  ensureVendorInventory: ensureVendorInventory,
  mergeOptionPriceRows: mergeOptionPriceRows,
};
