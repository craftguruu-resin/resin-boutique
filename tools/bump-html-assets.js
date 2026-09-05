"use strict";

var fs = require("fs");
var NEW_V = String(process.env.ASSET_V || "").trim();

if (!NEW_V) {
  // Cloud Build always provides BUILD_ID. This fallback keeps local builds fresh too.
  NEW_V = String(Date.now());
}

var files = fs.readdirSync(".").filter(function (f) {
  return f.endsWith(".html");
});

files.forEach(function (f) {
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

console.log("updated", files.length, "html files to v=" + NEW_V);
