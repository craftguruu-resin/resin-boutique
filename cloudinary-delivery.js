/**
 * Unified image delivery URLs — Cloudinary transforms + responsive widths.
 * Loaded in browser before data.js; also required from server/.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CraftguruCloudinaryDelivery = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RESPONSIVE_WIDTHS = [320, 480, 640, 960, 1280];
  var RASTER_RE = /\.(png|jpe?g|webp|gif|tiff?)$/i;

  function isCloudinaryUrl(s) {
    return /res\.cloudinary\.com/i.test(String(s || ""));
  }

  function hasCloudinaryTransforms(s) {
    return /[?&]f_auto|[,/]f_auto/.test(String(s || ""));
  }

  /**
   * Apply f_auto,q_auto,dpr_auto and optional width cap to Cloudinary URLs.
   */
  function cloudinaryTransform(url, displayWidth, crop) {
    var s = String(url || "").trim();
    if (!isCloudinaryUrl(s) || s.indexOf("/image/upload/") < 0) return s;
    if (hasCloudinaryTransforms(s)) return s;
    var transforms = ["f_auto", "q_auto", "dpr_auto"];
    var w = Number(displayWidth);
    if (Number.isFinite(w) && w > 0 && w < 4000) {
      transforms.push("w_" + Math.round(w));
      transforms.push(crop === "fill" ? "c_fill" : "c_limit");
    } else {
      transforms.push("w_auto");
    }
    return s.replace("/image/upload/", "/image/upload/" + transforms.join(",") + "/");
  }

  function encodeMediaPath(rel) {
    return String(rel || "")
      .split("?")[0]
      .split("/")
      .map(function (seg) {
        return encodeURIComponent(seg);
      })
      .join("/");
  }

  /**
   * Build delivery URL for catalog / hero paths and absolute URLs.
   * @param {string} relPath
   * @param {number} [displayWidth]
   * @param {{ apiBase?: string, cloudName?: string, crop?: string }} [opts]
   */
  function deliveryUrl(relPath, displayWidth, opts) {
    opts = opts || {};
    if (!relPath) return "";
    var s = String(relPath).trim();
    if (/^https?:\/\//i.test(s) || s.indexOf("//") === 0) {
      if (isCloudinaryUrl(s)) return cloudinaryTransform(s, displayWidth, opts.crop);
      return s;
    }
    var qIx = s.indexOf("?");
    var q = "";
    if (qIx >= 0) {
      q = s.slice(qIx);
      s = s.slice(0, qIx);
    }
    var params = [];
    if (q && q.indexOf("?") === 0) {
      q.slice(1)
        .split("&")
        .forEach(function (pair) {
          if (pair) params.push(pair);
        });
    }
    var w = Number(displayWidth);
    if (Number.isFinite(w) && w > 0 && w < 4000) {
      params.push("w=" + Math.round(w));
    }
    if (RASTER_RE.test(s)) {
      params.push("f=webp");
    }
    var enc = encodeMediaPath(s);
    var qs = params.length ? "?" + params.join("&") : "";
    var cloudName = String(opts.cloudName || "").trim();
    var apiBase = String(opts.apiBase || "").trim().replace(/\/+$/, "");
    if (cloudName && apiBase && s.indexOf("media/") === 0) {
      var abs = apiBase + "/" + enc;
      var fetchTransforms = ["f_auto", "q_auto", "dpr_auto"];
      if (Number.isFinite(w) && w > 0 && w < 4000) {
        fetchTransforms.push("w_" + Math.round(w), opts.crop === "fill" ? "c_fill" : "c_limit");
      }
      return (
        "https://res.cloudinary.com/" +
        cloudName +
        "/image/fetch/" +
        fetchTransforms.join(",") +
        "/" +
        encodeURIComponent(abs)
      );
    }
    if (apiBase && s.indexOf("media/") === 0) {
      return apiBase + "/" + enc + qs;
    }
    return enc + qs;
  }

  function srcSet(relPath, widths, opts) {
    widths = widths || RESPONSIVE_WIDTHS;
    opts = opts || {};
    var parts = [];
    widths.forEach(function (w) {
      var u = deliveryUrl(relPath, w, opts);
      if (u) parts.push(u + " " + w + "w");
    });
    return parts.join(", ");
  }

  function sizesAttr(kind) {
    if (kind === "hero") return "(max-width: 599px) 100vw, (max-width: 1199px) 90vw, 1280px";
    if (kind === "card") return "(max-width: 599px) 50vw, (max-width: 899px) 33vw, 320px";
    if (kind === "thumb") return "80px";
    if (kind === "pdp") return "(max-width: 899px) 100vw, 640px";
    return "100vw";
  }

  return {
    RESPONSIVE_WIDTHS: RESPONSIVE_WIDTHS,
    cloudinaryTransform: cloudinaryTransform,
    deliveryUrl: deliveryUrl,
    srcSet: srcSet,
    sizesAttr: sizesAttr,
    isCloudinaryUrl: isCloudinaryUrl,
  };
});
