#!/usr/bin/env node
/**
 * Cloudflare Pages / Firebase / any static CI: inject production API origin into root *.html
 * so checkout / account / vendor pages call Cloud Run (or legacy Render) instead of 127.0.0.1:3847.
 *
 * Env (build-time):
 *   PUBLIC_BILL_API_BASE   required — e.g. https://api.yourdomain.com or https://xxx.run.app (no trailing slash)
 *
 * Customer pages must never receive a server secret. Vendor authentication
 * uses its own bearer-token flow, while public checkout verifies payment
 * signatures server-side.
 */
"use strict";

var fs = require("fs");
var path = require("path");

var base = String(process.env.PUBLIC_BILL_API_BASE || "")
  .trim()
  .replace(/\/+$/, "");
if (!base) {
  console.warn("[set-bill-api-base] PUBLIC_BILL_API_BASE unset — leaving HTML unchanged.");
  process.exit(0);
}

var root = process.cwd();
var files = fs.readdirSync(root).filter(function (f) {
  if (!f.endsWith(".html")) return false;
  try {
    return fs.statSync(path.join(root, f)).isFile();
  } catch (_) {
    return false;
  }
});

var devBase = 'data-bill-api-base="http://127.0.0.1:3847"';
var newBase = 'data-bill-api-base="' + base.replace(/"/g, "&quot;") + '"';
var devPort = 'data-bill-api-port="3847"';
var emptyPort = 'data-bill-api-port=""';

var changed = 0;
files.forEach(function (f) {
  var p = path.join(root, f);
  var s = fs.readFileSync(p, "utf8");
  var orig = s;
  if (s.indexOf(devBase) !== -1) {
    s = s.split(devBase).join(newBase);
  }
  if (f === "about.html" && s.indexOf('data-bill-api-base=""') !== -1) {
    s = s.split('data-bill-api-base=""').join('data-bill-api-base="' + base.replace(/"/g, "&quot;") + '"');
  }
  if (s.indexOf(devPort) !== -1) {
    s = s.split(devPort).join(emptyPort);
  }
  if (s !== orig) {
    fs.writeFileSync(p, s, "utf8");
    changed += 1;
    console.log("[set-bill-api-base] patched", f);
  }
});

if (!changed) {
  console.warn("[set-bill-api-base] no files matched dev markers — check HTML still uses http://127.0.0.1:3847");
}
process.exit(0);
