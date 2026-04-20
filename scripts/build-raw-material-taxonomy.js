#!/usr/bin/env node
/**
 * One-off: scan ~/Downloads/Craftguruindia → raw-material-taxonomy.json + media/raw-material-categories/
 * Run: node scripts/build-raw-material-taxonomy.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var SRC = process.env.CRAFTGURU_RM_SOURCE || path.join(process.env.HOME || "", "Downloads/Craftguruindia");
var ROOT = path.join(__dirname, "..");
var DEST_IMG = path.join(ROOT, "media", "raw-material-categories");
var OUT_JSON = path.join(ROOT, "raw-material-taxonomy.json");

var IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;

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

function listDir(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true });
  } catch (_) {
    return [];
  }
}

function firstImageUnder(dir, maxDepth) {
  maxDepth = maxDepth == null ? 3 : maxDepth;
  if (maxDepth < 0) return null;
  var entries = listDir(dir);
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var full = path.join(dir, e.name);
    if (e.isFile() && IMG_EXT.test(e.name)) return full;
  }
  for (var j = 0; j < entries.length; j++) {
    var e2 = entries[j];
    if (e2.isDirectory()) {
      var sub = firstImageUnder(path.join(dir, e2.name), maxDepth - 1);
      if (sub) return sub;
    }
  }
  return null;
}

function copyImage(srcAbs, destName) {
  fs.mkdirSync(DEST_IMG, { recursive: true });
  var ext = path.extname(srcAbs).toLowerCase() || ".jpg";
  if (ext === ".jpeg") ext = ".jpg";
  var dest = path.join(DEST_IMG, destName + ext);
  fs.copyFileSync(srcAbs, dest);
  return "media/raw-material-categories/" + path.basename(dest);
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error("Missing source folder:", SRC);
    process.exit(1);
  }
  var categories = [];
  var tops = listDir(SRC).filter(function (d) {
    return d.isDirectory() && d.name !== ".DS_Store";
  });
  tops.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  tops.forEach(function (d) {
    var basePath = path.join(SRC, d.name);
    var baseSlug = slugify(d.name);
    var baseImgFile = firstImageUnder(basePath, 1);
    var baseImgRel = "";
    if (baseImgFile) {
      baseImgRel = copyImage(baseImgFile, "base-" + baseSlug);
    }
    var subs = [];
    listDir(basePath).forEach(function (sub) {
      if (!sub.isDirectory()) return;
      if (sub.name === ".DS_Store") return;
      var subPath = path.join(basePath, sub.name);
      var subSlug = slugify(sub.name);
      var subImg = firstImageUnder(subPath, 2);
      var subImgRel = "";
      if (subImg) {
        subImgRel = copyImage(subImg, "sub-" + baseSlug + "-" + subSlug);
      }
      subs.push({
        id: subSlug,
        name: sub.name,
        image: subImgRel,
      });
    });
    subs.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    categories.push({
      id: baseSlug,
      name: d.name,
      image: baseImgRel,
      subcategories: subs,
    });
  });
  var doc = { version: 1, generatedFrom: SRC, categories: categories };
  fs.writeFileSync(OUT_JSON, JSON.stringify(doc, null, 2), "utf8");
  console.log("Wrote", OUT_JSON);
  console.log("Images →", DEST_IMG);
}

main();
