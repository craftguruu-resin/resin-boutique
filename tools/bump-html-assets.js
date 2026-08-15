"use strict";

var fs = require("fs");
var NEW_V = process.env.ASSET_V || "20260815b";

var files = fs.readdirSync(".").filter(function (f) {
  return f.endsWith(".html");
});

files.forEach(function (f) {
  var s = fs.readFileSync(f, "utf8");
  s = s.replace(
    /data-bill-api-base="https:\/\/craftguru-api-3cvik3dvwq-el\.a\.run\.app"/g,
    "data-bill-api-base=\"\""
  );
  s = s.replace(/20260813b/g, NEW_V);
  s = s.replace(/20260816/g, NEW_V);
  s = s.replace(/20260817/g, NEW_V);
  if (s.includes("data.js") && !s.includes("cloudinary-delivery.js")) {
    s = s.replace(
      /<script([^>]*src="craftguru-api-base\.js")/,
      "<script defer src=\"cloudinary-delivery.js?v=" + NEW_V + "\"></script>\n  <script$1"
    );
  }
  fs.writeFileSync(f, s);
});

console.log("updated", files.length, "html files to v=" + NEW_V);
