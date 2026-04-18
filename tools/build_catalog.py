#!/usr/bin/env python3
"""Scan media/catalog and emit data.js for the static storefront."""
from __future__ import annotations

import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "media", "catalog")

IMG_EXT = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".JPG",
    ".JPEG",
    ".PNG",
}
SKIP_FILES = {".ds_store", ".ds_store?"}
SKIP_DIR_NAMES = {".ds_store", "key words"}  # case-insensitive match below


def slugify(text: str) -> str:
    s = text.strip().lower()
    s = re.sub(r"[''`]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "item"


def is_image(name: str) -> bool:
    return os.path.splitext(name)[1] in IMG_EXT


def should_skip_dir(name: str) -> bool:
    if name.startswith("."):
        return True
    return name.lower() in SKIP_DIR_NAMES


def rel_web(*parts: str) -> str:
    return "/".join(parts).replace("//", "/")


def main() -> int:
    if not os.path.isdir(ROOT):
        print("Missing catalog folder:", ROOT, file=sys.stderr)
        return 1

    categories: list[dict] = []
    products: list[dict] = []
    by_cat: dict[str, list] = {}
    by_cat_sub: dict[str, list] = {}

    # Price tiers per category index (s, m, l) — keeps variety
    base_tiers = [
        (24, 36, 52),
        (32, 48, 68),
        (18, 28, 42),
        (45, 68, 94),
        (28, 42, 58),
        (55, 82, 118),
        (38, 56, 76),
        (22, 34, 48),
        (42, 62, 88),
        (30, 44, 60),
        (35, 52, 72),
        (26, 38, 54),
        (48, 72, 98),
    ]

    top_dirs = sorted(
        [d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d)) and not d.startswith(".")]
    )

    for ci, folder_name in enumerate(top_dirs):
        cat_path = os.path.join(ROOT, folder_name)
        cat_id = slugify(folder_name)
        base = base_tiers[ci % len(base_tiers)]

        # List immediate children
        children = [x for x in os.listdir(cat_path) if not x.startswith(".")]
        subdirs = sorted([x for x in children if os.path.isdir(os.path.join(cat_path, x)) and not should_skip_dir(x)])
        root_files = sorted(
            [x for x in children if os.path.isfile(os.path.join(cat_path, x)) and is_image(x)]
        )

        subs_meta: list[dict] = []

        if subdirs:
            # Root-level product images become their own subcategory first (Craftguru branding)
            if root_files:
                subs_meta.append(
                    {
                        "id": "branding",
                        "label": "Brand & office",
                        "folder": ".",
                        "rootImages": True,
                    }
                )
            for sd in subdirs:
                if should_skip_dir(sd):
                    continue
                sp = os.path.join(cat_path, sd)
                imgs = sorted([f for f in os.listdir(sp) if os.path.isfile(os.path.join(sp, f)) and is_image(f)])
                if not imgs:
                    continue
                subs_meta.append(
                    {
                        "id": slugify(sd),
                        "label": sd,
                        "folder": sd,
                        "rootImages": False,
                    }
                )
        else:
            # Flat category: single logical subcategory
            imgs = root_files
            if not imgs:
                continue
            subs_meta.append({"id": "all", "label": "All", "folder": ".", "rootImages": False})

        if not subs_meta:
            continue

        cat_entry = {
            "id": cat_id,
            "label": folder_name,
            "folder": folder_name,
            "subcategories": [{"id": s["id"], "label": s["label"]} for s in subs_meta],
        }
        categories.append(cat_entry)
        by_cat[cat_id] = []
        by_cat_sub.setdefault(cat_id, {})

        pi = 0
        for sm in subs_meta:
            sid = sm["id"]
            by_cat_sub[cat_id].setdefault(sid, [])

            if sm.get("rootImages"):
                file_list = sorted(
                    [x for x in os.listdir(cat_path) if os.path.isfile(os.path.join(cat_path, x)) and is_image(x)]
                )
                folder_rel = folder_name
            elif sm["folder"] == ".":
                file_list = sorted(
                    [x for x in os.listdir(cat_path) if os.path.isfile(os.path.join(cat_path, x)) and is_image(x)]
                )
                folder_rel = folder_name
            else:
                sp = os.path.join(cat_path, sm["folder"])
                file_list = sorted([f for f in os.listdir(sp) if os.path.isfile(os.path.join(sp, f)) and is_image(f)])
                folder_rel = rel_web(folder_name, sm["folder"])

            for fname in file_list:
                stem = os.path.splitext(fname)[0]
                file_slug = slugify(stem)
                if not file_slug:
                    file_slug = f"item-{pi}"
                pid = f"{cat_id}--{sid}--{file_slug}"
                if any(p["id"] == pid for p in products):
                    pid = f"{pid}-{pi}"
                bump = (pi % 7) * 2
                name = stem.replace("_", " ").strip() or file_slug.replace("-", " ").title()
                img_rel = rel_web("media", "catalog", folder_rel, fname) if sm["folder"] != "." else rel_web("media", "catalog", folder_name, fname)
                if sm.get("rootImages"):
                    img_rel = rel_web("media", "catalog", folder_name, fname)

                p = {
                    "id": pid,
                    "name": name[:120],
                    "category": cat_id,
                    "subcategory": sid,
                    "image": img_rel,
                    "prices": {
                        "s": base[0] + bump,
                        "m": base[1] + bump,
                        "l": base[2] + bump,
                    },
                }
                products.append(p)
                by_cat[cat_id].append(p)
                by_cat_sub[cat_id][sid].append(p)
                pi += 1

    # JS encoder
    def js_str(s: str) -> str:
        return json.dumps(s, ensure_ascii=True)

    lines = []
    lines.append("/** Auto-generated by tools/build_catalog.py — catalog from media/catalog */")
    lines.append("(function (global) {")
    lines.append('  "use strict";')
    lines.append("")
    lines.append("  var CATEGORIES = " + json.dumps(categories, ensure_ascii=False) + ";")
    lines.append("")
    lines.append("  var SIZE_LABELS = {")
    lines.append('    s: { key: "s", name: "Compact", hint: "Smallest pour" },')
    lines.append('    m: { key: "m", name: "Classic", hint: "Most popular" },')
    lines.append('    l: { key: "l", name: "Grand", hint: "Largest format" },')
    lines.append("  };")
    lines.append("")
    lines.append("  var PRODUCTS = " + json.dumps(products, ensure_ascii=False) + ";")
    lines.append("")
    lines.append("  var BY_ID = {};")
    lines.append("  PRODUCTS.forEach(function (p) { BY_ID[p.id] = p; });")
    lines.append("")
    lines.append("  var BY_CAT = " + json.dumps({k: [x["id"] for x in v] for k, v in by_cat.items()}, ensure_ascii=False) + ";")
    lines.append("  var BY_CAT_SUB = {};")
    lines.append("  CATEGORIES.forEach(function (c) {")
    lines.append("    BY_CAT_SUB[c.id] = {};")
    lines.append("    (c.subcategories || []).forEach(function (s) {")
    lines.append("      BY_CAT_SUB[c.id][s.id] = [];")
    lines.append("    });")
    lines.append("  });")
    lines.append("  PRODUCTS.forEach(function (p) {")
    lines.append("    if (!BY_CAT_SUB[p.category]) BY_CAT_SUB[p.category] = {};")
    lines.append("    if (!BY_CAT_SUB[p.category][p.subcategory]) BY_CAT_SUB[p.category][p.subcategory] = [];")
    lines.append("    BY_CAT_SUB[p.category][p.subcategory].push(p.id);")
    lines.append("  });")
    lines.append("")
    lines.append("  var SIZE_DEFAULT = {")
    lines.append('    s: { dim: "", pour: "", viz: 0.78 },')
    lines.append('    m: { dim: "", pour: "", viz: 1 },')
    lines.append('    l: { dim: "", pour: "", viz: 1.26 },')
    lines.append("  };")
    lines.append("")
    lines.append("  var SIZE_BY_CAT = {};")
    lines.append("")
    lines.append("  function getSizeProfile(catId, sizeKey) {")
    lines.append("    var b = SIZE_DEFAULT[sizeKey];")
    lines.append("    if (!b) return { dim: '', pour: '', viz: 1 };")
    lines.append("    var o = SIZE_BY_CAT[catId] && SIZE_BY_CAT[catId][sizeKey];")
    lines.append("    if (!o) return b;")
    lines.append("    return {")
    lines.append("      dim: o.dim || b.dim,")
    lines.append("      pour: o.pour || b.pour,")
    lines.append("      viz: o.viz != null ? o.viz : b.viz,")
    lines.append("    };")
    lines.append("  }")
    lines.append("")
    lines.append("  function getProduct(id) {")
    lines.append("    return BY_ID[id] || null;")
    lines.append("  }")
    lines.append("")
    lines.append("  function getCategoryLabel(catId) {")
    lines.append("    var f = CATEGORIES.find(function (c) { return c.id === catId; });")
    lines.append("    return f ? f.label : catId;")
    lines.append("  }")
    lines.append("")
    lines.append("  function getSubcategoryLabel(catId, subId) {")
    lines.append("    var c = CATEGORIES.find(function (x) { return x.id === catId; });")
    lines.append("    if (!c || !c.subcategories) return subId;")
    lines.append("    var s = c.subcategories.find(function (x) { return x.id === subId; });")
    lines.append("    return s ? s.label : subId;")
    lines.append("  }")
    lines.append("")
    lines.append("  function normalizeCategoryId(catId) {")
    lines.append("    var id = catId || (CATEGORIES[0] && CATEGORIES[0].id) || 'resin-coasters';")
    lines.append("    return CATEGORIES.some(function (c) { return c.id === id; }) ? id : CATEGORIES[0].id;")
    lines.append("  }")
    lines.append("")
    lines.append("  function getSubcategories(catId) {")
    lines.append("    var c = CATEGORIES.find(function (x) { return x.id === catId; });")
    lines.append("    return c && c.subcategories ? c.subcategories : [];")
    lines.append("  }")
    lines.append("")
    lines.append("  function countProductsInSub(catId, subId) {")
    lines.append("    var m = BY_CAT_SUB[catId];")
    lines.append("    if (!m || !m[subId]) return 0;")
    lines.append("    return m[subId].length;")
    lines.append("  }")
    lines.append("")
    lines.append("  var PAGE_SIZE = 48;")
    lines.append("")
    lines.append("  function listCategorySubcategories(catId) {")
    lines.append("    var cid = normalizeCategoryId(catId);")
    lines.append("    var subs = getSubcategories(cid);")
    lines.append("    return subs.map(function (s) {")
    lines.append("      var count = countProductsInSub(cid, s.id);")
    lines.append("      var firstId = (BY_CAT_SUB[cid] && BY_CAT_SUB[cid][s.id] && BY_CAT_SUB[cid][s.id][0]) || null;")
    lines.append("      var preview = firstId && BY_ID[firstId] ? BY_ID[firstId].image : '';")
    lines.append("      return { id: s.id, label: s.label, count: count, previewImage: preview };")
    lines.append("    }).filter(function (x) { return x.count > 0; });")
    lines.append("  }")
    lines.append("")
    lines.append("  function listProductPage(catId, subId, page) {")
    lines.append("    var cid = normalizeCategoryId(catId);")
    lines.append("    var ids = [];")
    lines.append("    if (subId) {")
    lines.append("      ids = (BY_CAT_SUB[cid] && BY_CAT_SUB[cid][subId]) || [];")
    lines.append("    } else {")
    lines.append("      ids = BY_CAT[cid] || [];")
    lines.append("    }")
    lines.append("    var list = ids.map(function (id) { return BY_ID[id]; }).filter(Boolean);")
    lines.append("    var total = list.length;")
    lines.append("    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));")
    lines.append("    var p = Math.min(Math.max(1, page || 1), pages);")
    lines.append("    var start = (p - 1) * PAGE_SIZE;")
    lines.append("    var slice = list.slice(start, start + PAGE_SIZE);")
    lines.append("    return { items: slice, page: p, pages: pages, total: total, pageSize: PAGE_SIZE };")
    lines.append("  }")
    lines.append("")
    lines.append("  function getFeatured(limit) {")
    lines.append("    var n = limit || 12;")
    lines.append("    var out = [];")
    lines.append("    var step = Math.max(1, Math.floor(PRODUCTS.length / Math.max(n, 1)));")
    lines.append("    for (var i = 0; i < PRODUCTS.length && out.length < n; i += step) {")
    lines.append("      out.push(PRODUCTS[i]);")
    lines.append("    }")
    lines.append("    var j = 0;")
    lines.append("    while (out.length < n && j < PRODUCTS.length) {")
    lines.append("      var pj = PRODUCTS[j];")
    lines.append("      var dup = out.some(function (x) { return x.id === pj.id; });")
    lines.append("      if (!dup) out.push(pj);")
    lines.append("      j++;")
    lines.append("    }")
    lines.append("    return out.slice(0, n);")
    lines.append("  }")
    lines.append("")
    lines.append("  function imageUrl(relPath) {")
    lines.append("    if (!relPath) return '';")
    lines.append("    return relPath.split('/').map(function (seg) { return encodeURIComponent(seg); }).join('/');")
    lines.append("  }")
    lines.append("")
    lines.append("  global.RESIN_DATA = {")
    lines.append("    categories: CATEGORIES,")
    lines.append("    sizeLabels: SIZE_LABELS,")
    lines.append("    pageSize: PAGE_SIZE,")
    lines.append("    allProducts: PRODUCTS,")
    lines.append("    byCategory: BY_CAT,")
    lines.append("    getProduct: getProduct,")
    lines.append("    getCategoryLabel: getCategoryLabel,")
    lines.append("    getSubcategoryLabel: getSubcategoryLabel,")
    lines.append("    getSizeProfile: getSizeProfile,")
    lines.append("    normalizeCategoryId: normalizeCategoryId,")
    lines.append("    getSubcategories: getSubcategories,")
    lines.append("    listCategorySubcategories: listCategorySubcategories,")
    lines.append("    listCategoryPage: listProductPage,")
    lines.append("    listProductPage: listProductPage,")
    lines.append("    getFeatured: getFeatured,")
    lines.append("    imageUrl: imageUrl,")
    lines.append("  };")
    lines.append("})(typeof window !== 'undefined' ? window : this);")
    lines.append("")

    out_path = os.path.join(os.path.dirname(__file__), "..", "data.js")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("Wrote", out_path, "categories:", len(categories), "products:", len(products))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
