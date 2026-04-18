"use strict";

var sharp = require("sharp");
var fs = require("fs");
var pathMod = require("path");

var mediaPathMod = require("./media-path.js");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain amount (no currency symbol) — avoids ₹ glyph issues in raster output. */
function fmtInr(n) {
  var x = Number(n);
  if (!Number.isFinite(x)) x = 0;
  var rounded = Math.round(x * 100) / 100;
  return rounded.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function safeMediaRel(rel) {
  if (!rel || typeof rel !== "string") return null;
  var n = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (n.indexOf("..") >= 0) return null;
  if (n.indexOf("media/") !== 0) return null;
  return n;
}

/**
 * Square cropped snippet (catalog photo → bill thumb). Always JPEG for SVG embed.
 * @returns {Promise<string|null>} data URI
 */
function thumbJpegCropDataUri(it) {
  var s = safeMediaRel(it && it.image);
  if (!s) return Promise.resolve(null);
  var abs = mediaPathMod.absoluteMediaPath(s);
  if (!abs) return Promise.resolve(null);
  if (!fs.existsSync(abs)) return Promise.resolve(null);
  return sharp(abs)
    .rotate()
    .resize(96, 96, { fit: "cover", position: "attention" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
    .then(function (buf) {
      return "data:image/jpeg;base64," + buf.toString("base64");
    })
    .catch(function () {
      return null;
    });
}

/**
 * Site-aligned receipt: white background, Syne / Plus Jakarta stack, accent blue,
 * product thumbnails (when paths resolve under media/).
 */
function buildBillSvg(p) {
  var W = 900;
  var pad = 40;
  var rowH = 96;
  var thumb = 72;
  var items = p.items || [];
  var thumbUris = p.itemThumbUris || [];
  var n = items.length;
  var headerEnd = 132;
  var bodyH = n * rowH + 16;
  var totalsH = 176;
  var qrSection = 272;
  var H = headerEnd + bodyH + totalsH + qrSection + 44;

  var white = "#ffffff";
  var ink = "#12141a";
  var muted = "#5c6578";
  var mist = "#f4f7fb";
  var lineCol = "#e8eef6";
  var accent = "#3b6fd9";

  var defs = [];
  var body = [];

  defs.push(
    '<linearGradient id="phg" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="rgba(59,111,217,0.14)"/>' +
      '<stop offset="100%" stop-color="rgba(255,255,255,0.95)"/>' +
      "</linearGradient>"
  );

  body.push('<rect width="100%" height="100%" fill="' + white + '"/>');
  body.push('<rect x="0" y="0" width="' + W + '" height="5" fill="' + accent + '"/>');

  body.push(
    '<text x="' +
      pad +
      '" y="46" fill="' +
      ink +
      '" font-size="28" font-weight="600" font-family="Syne, Plus Jakarta Sans, system-ui, sans-serif">Craftguru</text>'
  );
  body.push(
    '<text x="' +
      pad +
      '" y="78" fill="' +
      muted +
      '" font-size="15" font-weight="500" font-family="Plus Jakarta Sans, Inter, system-ui, sans-serif">Order summary</text>'
  );
  body.push(
    '<text x="' +
      pad +
      '" y="100" fill="' +
      muted +
      '" font-size="12" font-family="Plus Jakarta Sans, system-ui, sans-serif">' +
      esc(p.generatedAt) +
      " · " +
      esc(p.customerPhone) +
      "</text>"
  );
  body.push(
    '<text x="' +
      pad +
      '" y="118" fill="' +
      muted +
      '" font-size="12" font-family="Plus Jakarta Sans, system-ui, sans-serif">UPI: SANDEEP JANGID · WhatsApp +91-8824350056</text>'
  );

  var startY = headerEnd + 8;
  for (var i = 0; i < n; i++) {
    var it = items[i];
    var y0 = startY + i * rowH;
    var lineAmt = (it.unitPrice || 0) * (it.qty || 1);
    var szRaw = String(it.sizeLabel || "").trim();
    var nameRaw = String(it.name || "").trim() || "Item";
    var rawTitle = szRaw ? nameRaw + " — " + szRaw : nameRaw;
    var title = esc(rawTitle);
    if (title.length > 46) title = title.slice(0, 43) + "…";
    var skuPart = String(it.sku || "").trim() ? esc(String(it.sku || "").trim()) + " · " : "";
    var sub = skuPart + "Qty " + (it.qty || 1) + " · " + fmtInr(it.unitPrice || 0) + " each";
    var tUri = thumbUris[i] || null;

    if (i > 0) {
      body.push(
        '<line x1="' +
          pad +
          '" y1="' +
          (y0 - 4) +
          '" x2="' +
          (W - pad) +
          '" y2="' +
          (y0 - 4) +
          '" stroke="' +
          lineCol +
          '" stroke-width="1"/>'
      );
    }

    var tyThumb = y0 + 12;
    var rxThumb = 16;
    if (tUri) {
      body.push(
        '<image x="' +
          pad +
          '" y="' +
          tyThumb +
          '" width="' +
          thumb +
          '" height="' +
          thumb +
          '" href="' +
          tUri +
          '"/>'
      );
      body.push(
        '<rect x="' +
          pad +
          '" y="' +
          tyThumb +
          '" width="' +
          thumb +
          '" height="' +
          thumb +
          '" rx="' +
          rxThumb +
          '" ry="' +
          rxThumb +
          '" fill="none" stroke="rgba(20,35,55,0.12)" stroke-width="1"/>'
      );
    } else {
      body.push(
        '<rect x="' +
          pad +
          '" y="' +
          tyThumb +
          '" width="' +
          thumb +
          '" height="' +
          thumb +
          '" rx="' +
          rxThumb +
          '" ry="' +
          rxThumb +
          '" fill="url(#phg)" stroke="rgba(59,111,217,0.2)" stroke-width="1"/>'
      );
    }

    body.push(
      '<text x="' +
        (pad + thumb + 20) +
        '" y="' +
        (y0 + 42) +
        '" fill="' +
        ink +
        '" font-size="15" font-weight="600" font-family="Plus Jakarta Sans, system-ui, sans-serif">' +
        title +
        "</text>"
    );
    body.push(
      '<text x="' +
        (pad + thumb + 20) +
        '" y="' +
        (y0 + 64) +
        '" fill="' +
        muted +
        '" font-size="12" font-family="Plus Jakarta Sans, system-ui, sans-serif">' +
        sub +
        "</text>"
    );
    body.push(
      '<text x="' +
        (W - pad) +
        '" y="' +
        (y0 + 48) +
        '" fill="' +
        ink +
        '" font-size="16" font-weight="700" text-anchor="end" font-family="Plus Jakarta Sans, system-ui, sans-serif">' +
        fmtInr(lineAmt) +
        "</text>"
    );
    body.push(
      '<text x="' +
        (W - pad) +
        '" y="' +
        (y0 + 70) +
        '" fill="' +
        muted +
        '" font-size="11" text-anchor="end" font-family="Plus Jakarta Sans, system-ui, sans-serif">' +
        fmtInr(it.unitPrice) +
        " each</text>"
    );
  }

  var ty = startY + bodyH + 4;
  body.push(
    '<line x1="' +
      pad +
      '" y1="' +
      (ty - 6) +
      '" x2="' +
      (W - pad) +
      '" y2="' +
      (ty - 6) +
      '" stroke="' +
      lineCol +
      '" stroke-width="1"/>'
  );

  var taxableJ =
    p.taxableValue != null && Number.isFinite(Number(p.taxableValue))
      ? Number(p.taxableValue)
      : Math.round((Number(p.subtotal) || 0) / 1.18 * 100) / 100;
  body.push(
    '<text x="' +
      pad +
      '" y="' +
      ty +
      '" fill="' +
      muted +
      '" font-size="14" font-family="Plus Jakarta Sans, system-ui, sans-serif">Items (incl. 18% GST)</text>' +
      '<text x="' +
      (W - pad) +
      '" y="' +
      ty +
      '" fill="' +
      ink +
      '" font-size="14" text-anchor="end">' +
      fmtInr(p.subtotal) +
      "</text>"
  );
  body.push(
    '<text x="' +
      pad +
      '" y="' +
      (ty + 26) +
      '" fill="' +
      muted +
      '" font-size="14">Taxable value (excl. GST)</text>' +
      '<text x="' +
      (W - pad) +
      '" y="' +
      (ty + 26) +
      '" fill="' +
      ink +
      '" font-size="14" text-anchor="end">' +
      fmtInr(taxableJ) +
      "</text>"
  );
  body.push(
    '<text x="' +
      pad +
      '" y="' +
      (ty + 52) +
      '" fill="' +
      muted +
      '" font-size="14">GST 18%</text>' +
      '<text x="' +
      (W - pad) +
      '" y="' +
      (ty + 52) +
      '" fill="' +
      ink +
      '" font-size="14" text-anchor="end">' +
      fmtInr(p.tax) +
      "</text>"
  );
  body.push(
    '<text x="' +
      pad +
      '" y="' +
      (ty + 78) +
      '" fill="' +
      muted +
      '" font-size="14">Shipping</text>' +
      '<text x="' +
      (W - pad) +
      '" y="' +
      (ty + 78) +
      '" fill="' +
      ink +
      '" font-size="14" text-anchor="end">' +
      (p.shipping === 0 ? "Free" : fmtInr(p.shipping)) +
      "</text>"
  );

  body.push(
    '<line x1="' +
      pad +
      '" y1="' +
      (ty + 98) +
      '" x2="' +
      (W - pad) +
      '" y2="' +
      (ty + 98) +
      '" stroke="' +
      lineCol +
      '" stroke-width="1" stroke-dasharray="6 5"/>'
  );
  body.push(
    '<text x="' +
      pad +
      '" y="' +
      (ty + 128) +
      '" fill="' +
      ink +
      '" font-size="17" font-weight="700" font-family="Plus Jakarta Sans, system-ui, sans-serif">Total due</text>' +
      '<text x="' +
      (W - pad) +
      '" y="' +
      (ty + 128) +
      '" fill="' +
      accent +
      '" font-size="24" font-weight="700" text-anchor="end" font-family="Inter, system-ui, sans-serif" letter-spacing="-0.03em">' +
      fmtInr(p.total) +
      "</text>"
  );

  var qrY = ty + 152;
  var qrSize = 220;
  body.push(
    '<rect x="' +
      (pad - 8) +
      '" y="' +
      (qrY - 12) +
      '" width="' +
      (qrSize + (W - pad - qrSize) + 8) +
      '" height="' +
      (qrSize + 24) +
      '" rx="22" ry="22" fill="' +
      mist +
      '" stroke="' +
      lineCol +
      '" stroke-width="1"/>'
  );
  body.push(
    '<image x="' +
      pad +
      '" y="' +
      qrY +
      '" width="' +
      qrSize +
      '" height="' +
      qrSize +
      '" preserveAspectRatio="xMidYMid slice" href="' +
      p.qrDataUri +
      '"/>'
  );
  body.push(
    '<rect x="' +
      pad +
      '" y="' +
      qrY +
      '" width="' +
      qrSize +
      '" height="' +
      qrSize +
      '" rx="16" ry="16" fill="none" stroke="rgba(20,35,55,0.08)" stroke-width="1"/>'
  );
  body.push(
    '<text x="' +
      (pad + qrSize + 24) +
      '" y="' +
      (qrY + 48) +
      '" fill="' +
      ink +
      '" font-size="16" font-weight="600" font-family="Plus Jakarta Sans, system-ui, sans-serif">Pay with UPI</text>'
  );
  body.push(
    '<text x="' +
      (pad + qrSize + 24) +
      '" y="' +
      (qrY + 74) +
      '" fill="' +
      muted +
      '" font-size="13" font-family="Plus Jakarta Sans, system-ui, sans-serif">Same QR as checkout Pay now</text>'
  );
  body.push(
    '<text x="' +
      (pad + qrSize + 24) +
      '" y="' +
      (qrY + 98) +
      '" fill="' +
      muted +
      '" font-size="12">Google Pay · PhonePe · Paytm</text>'
  );

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' +
      W +
      '" height="' +
      H +
      '">' +
      "<defs>" +
      defs.join("") +
      "</defs>" +
      body.join("") +
      "</svg>"
  );
}

function renderOrderBillJpeg(opts) {
  var items = opts.items || [];
  return Promise.all(items.map(thumbJpegCropDataUri)).then(function (itemThumbUris) {
    var svg = buildBillSvg(
      Object.assign({}, opts, {
        itemThumbUris: itemThumbUris,
      })
    );
    return sharp(Buffer.from(svg, "utf8"), {
      limitInputPixels: 268402689,
    })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  });
}

module.exports = {
  renderOrderBillJpeg,
  buildBillSvg,
};
