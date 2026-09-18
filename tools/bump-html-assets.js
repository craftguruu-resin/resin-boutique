"use strict";

var fs = require("fs");
var NEW_V = String(process.env.ASSET_V || "").trim();

if (!NEW_V) {
  // Cloud Build always provides BUILD_ID. This fallback keeps local builds fresh too.
  NEW_V = String(Date.now());
}

var htmlFiles = fs.readdirSync(".").filter(function (f) {
  return f.endsWith(".html");
});

htmlFiles.forEach(function (f) {
  var s = fs.readFileSync(f, "utf8");

  // Never bake the Cloud Run URL into the storefront. The browser should use the
  // current origin so the custom domain / load balancer remains the source of truth.
  s = s.replace(
    /data-bill-api-base="https:\/\/craftguru-api-3cvik3dvwq-el\.a\.run\.app"/g,
    "data-bill-api-base=\"\""
  );

  // IMPORTANT: every deployment gets a new asset version, including old numeric
  // versions such as ?v=1785349343 and older date versions such as ?v=20260815b.
  // Those old URLs were the reason browsers/CDN could keep serving stale CSS/JS.
  // Only query-string version tokens are changed; filenames and remote URLs stay intact.
  s = s.replace(/([?&]v=)[^\s"'&<>#]+/g, "$1" + NEW_V);
  s = s.replace(/([?&]ver=)[^\s"'&<>#]+/g, "$1" + NEW_V);

  // Keep the Cloudinary delivery helper available on pages that use data.js.
  if (s.includes("data.js") && !s.includes("cloudinary-delivery.js")) {
    s = s.replace(
      /<script([^>]*src="craftguru-api-base\.js")/,
      "<script defer src=\"cloudinary-delivery.js?v=" + NEW_V + "\"></script>\n  <script$1"
    );
  }

  fs.writeFileSync(f, s);
});

// CSS @import statements are a separate, easy-to-miss cache-busting gap: a file
// only ever pulled in via @import (never a direct HTML <link>) is invisible to
// the HTML-rewriting pass above, so it can stay cached across every future
// deploy once any browser/CDN has fetched its un-versioned or stale-versioned
// URL even once. Bump every @import's own ?v= too, every deploy, automatically.
var cssFiles = fs.readdirSync(".").filter(function (f) {
  return f.endsWith(".css");
});

var cssBumped = 0;
cssFiles.forEach(function (f) {
  var s = fs.readFileSync(f, "utf8");
  var next = s.replace(
    /(@import\s+url\(["'][^"')]+?)(\?[^"')]*)?(["']\))/g,
    function (whole, prefix, existingQuery, suffix) {
      return prefix + "?v=" + NEW_V + suffix;
    }
  );
  if (next !== s) {
    fs.writeFileSync(f, next);
    cssBumped++;
  }
});

console.log("updated", htmlFiles.length, "html files and", cssBumped, "css files (with @import) to v=" + NEW_V);

// Service worker cache name: bump automatically so a fresh deploy always
// forces returning visitors' service workers to purge whatever they had
// cached under the previous name, instead of relying on remembering to
// bump this by hand.
var SW_FILE = "sw-storefront.js";
if (fs.existsSync(SW_FILE)) {
  var swSrc = fs.readFileSync(SW_FILE, "utf8");
  var swNext = swSrc.replace(
    /var CACHE_NAME = "cg-storefront-static-[^"]*";/,
    'var CACHE_NAME = "cg-storefront-static-' + NEW_V + '";'
  );
  if (swNext !== swSrc) {
    fs.writeFileSync(SW_FILE, swNext);
    console.log("updated sw-storefront.js CACHE_NAME to cg-storefront-static-" + NEW_V);
  }
}
