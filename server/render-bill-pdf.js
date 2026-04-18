"use strict";

var PDFDocument = require("pdfkit");
var sharp = require("sharp");
var fs = require("fs");
var pathMod = require("path");

var mediaPathMod = require("./media-path.js");

var INK = "#12141a";
var MUTED = "#5c6578";
var MUTED_LIGHT = "#949aa5";
var LINE = "#e8eef6";
var ACCENT = "#3b6fd9";
var PLACEHOLDER = "#e9eef8";

/** Plain amount (no currency symbol) — PDF fonts often fail on ₹ in some print paths. */
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

function trunc(s, max) {
  var t = String(s || "");
  return t.length <= max ? t : t.slice(0, max - 1) + "\u2026";
}

function billItemTitle(it) {
  var n = String((it && it.name) || "").trim();
  var sz = String((it && it.sizeLabel) || "").trim();
  if (!n) n = "Item";
  if (!sz) return n;
  return n + " — " + sz;
}

/**
 * Square PNG buffer for bill thumbnails (gallery + line list).
 * @param {string} rel media/... path from cart
 * @param {number} px edge length in pixels (sharp output)
 * @returns {Promise<Buffer|null>}
 */
function loadThumbPng(rel, px) {
  var s = safeMediaRel(rel);
  if (!s) return Promise.resolve(null);
  var abs = mediaPathMod.absoluteMediaPath(s);
  if (!abs) return Promise.resolve(null);
  if (!fs.existsSync(abs)) return Promise.resolve(null);
  return sharp(abs)
    .rotate()
    .resize(px, px, { fit: "cover", position: "attention" })
    .png()
    .toBuffer()
    .catch(function () {
      return null;
    });
}

function metaLine(it) {
  var sku = String(it.sku || "").trim();
  var q = Math.max(1, Math.floor(Number(it.qty) || 1));
  var u = Number(it.unitPrice) || 0;
  var parts = [];
  if (sku) parts.push("SKU " + sku);
  parts.push("Qty " + q);
  parts.push(fmtInr(u) + " each");
  return parts.join(" · ");
}

/**
 * Order-summary style PDF (matches checkout panel: thumbnails, lines, totals).
 * @param {object} p
 * @param {Array<{name:string,sizeLabel:string,qty:number,unitPrice:number,image?:string}>} p.items
 * @param {number} p.subtotal
 * @param {number} p.shipping
 * @param {number} p.tax
 * @param {number} p.total
 * @returns {Promise<Buffer>}
 */
function renderOrderBillPdf(p) {
  var items = p.items || [];
  var pxGallery = 160;
  var pxLine = 112;

  return Promise.all(
    items.map(function (it) {
      return Promise.all([loadThumbPng(it.image, pxGallery), loadThumbPng(it.image, pxLine)]).then(function (pair) {
        return { gallery: pair[0], line: pair[1] };
      });
    })
  ).then(function (buffers) {
    return new Promise(function (resolve, reject) {
      var chunks = [];
      var margin = 44;
      var pageW = 595.28;
      var pageH = 841.89;
      var contentW = pageW - margin * 2;
      var doc = new PDFDocument({ size: [pageW, pageH], margin: 0, autoFirstPage: true });
      doc.on("data", function (c) {
        chunks.push(c);
      });
      doc.on("end", function () {
        resolve(Buffer.concat(chunks));
      });
      doc.on("error", reject);

      var y = 0;

      function ensureSpace(need) {
        if (y + need > pageH - 48) {
          doc.addPage({ size: [pageW, pageH], margin: 0 });
          y = margin;
        }
      }

      doc.save();
      doc.rect(0, 0, pageW, 5).fill(ACCENT);
      doc.restore();

      y = 36;
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(22).text("Order summary", margin, y, {
        width: contentW,
        align: "left",
      });
      y += 34;

      doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED_LIGHT);
      doc.text("SELECTED ITEMS", margin, y);
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED_LIGHT);
      doc.text("Tap any thumbnail for details", margin, y, { width: contentW, align: "right" });
      y += 16;

      var thumbPt = 76;
      var gap = 12;
      var x0 = margin;
      var gx = x0;
      var gy = y;
      var galleryBottom = gy;

      items.forEach(function (it, i) {
        if (gx + thumbPt > margin + contentW) {
          gx = x0;
          gy += thumbPt + gap + 18;
        }
        galleryBottom = Math.max(galleryBottom, gy);
        ensureSpace(thumbPt + gap + 100);
        var buf = buffers[i] && buffers[i].gallery;
        var rx = 14;
        if (buf) {
          doc.save();
          doc.roundedRect(gx, gy, thumbPt, thumbPt, rx).clip();
          doc.image(buf, gx, gy, { width: thumbPt, height: thumbPt });
          doc.restore();
          doc.roundedRect(gx, gy, thumbPt, thumbPt, rx).strokeColor("rgba(20,35,55,0.12)").lineWidth(0.6).stroke();
        } else {
          doc.roundedRect(gx, gy, thumbPt, thumbPt, rx).fill(PLACEHOLDER);
          doc.roundedRect(gx, gy, thumbPt, thumbPt, rx).strokeColor(LINE).lineWidth(0.6).stroke();
        }
        var cap = trunc(it.name, 16);
        doc.font("Helvetica").fontSize(7).fillColor(MUTED);
        doc.text(cap, gx, gy + thumbPt + 3, { width: thumbPt, align: "center", lineBreak: false });
        gx += thumbPt + gap;
      });

      y = galleryBottom + thumbPt + gap + 22;
      ensureSpace(80);

      var lineThumbR = 26;
      var lineThumbD = lineThumbR * 2;
      var rowH = 72;
      var textLeft = margin + lineThumbD + 14;

      items.forEach(function (it, i) {
        ensureSpace(rowH + 8);
        if (i > 0) {
          doc.moveTo(margin, y - 4).lineTo(margin + contentW, y - 4).strokeColor(LINE).lineWidth(0.5).stroke();
        }
        var buf = buffers[i] && buffers[i].line;
        var cx = margin + lineThumbR;
        var cy = y + lineThumbR + 2;
        if (buf) {
          doc.save();
          doc.circle(cx, cy, lineThumbR).clip();
          doc.image(buf, margin, y + 2, { width: lineThumbD, height: lineThumbD });
          doc.restore();
          doc.circle(cx, cy, lineThumbR).strokeColor("rgba(20,35,55,0.12)").lineWidth(0.75).stroke();
        } else {
          doc.circle(cx, cy, lineThumbR).fill(PLACEHOLDER);
          doc.circle(cx, cy, lineThumbR).strokeColor(LINE).lineWidth(0.75).stroke();
        }

        var lineAmt = (Number(it.unitPrice) || 0) * (Math.max(1, Math.floor(Number(it.qty) || 1)) || 1);
        var priceColW = 72;
        var titleW = margin + contentW - priceColW - 8 - textLeft;
        doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(trunc(billItemTitle(it), 52), textLeft, y + 8, {
          width: Math.max(80, titleW),
        });
        doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(metaLine(it), textLeft, y + 26, {
          width: Math.max(80, titleW),
        });
        doc.fillColor(INK).font("Helvetica-Bold").fontSize(13).text(fmtInr(lineAmt), margin + contentW - priceColW, y + 10, {
          width: priceColW,
          align: "right",
        });
        y += rowH;
      });

      y += 6;
      doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor(LINE).lineWidth(0.5).stroke();
      y += 14;

      var taxable =
        p.taxableValue != null && Number.isFinite(Number(p.taxableValue))
          ? Number(p.taxableValue)
          : Math.round((Number(p.subtotal) || 0) / 1.18 * 100) / 100;
      var ty = y;
      doc.font("Helvetica").fontSize(11).fillColor(MUTED);
      doc.text("Items total (incl. 18% GST)", margin, ty);
      doc.fillColor(INK).text(fmtInr(p.subtotal), margin, ty, { width: contentW, align: "right" });
      ty += 22;
      doc.fillColor(MUTED).text("Taxable value (excl. GST)", margin, ty);
      doc.fillColor(INK).text(fmtInr(taxable), margin, ty, { width: contentW, align: "right" });
      ty += 22;
      doc.fillColor(MUTED).text("GST 18%", margin, ty);
      doc.fillColor(INK).text(fmtInr(p.tax), margin, ty, { width: contentW, align: "right" });
      ty += 22;
      doc.fillColor(MUTED).text("Shipping", margin, ty);
      doc.fillColor(INK).text(p.shipping === 0 ? "Free" : fmtInr(p.shipping), margin, ty, { width: contentW, align: "right" });
      ty += 24;

      doc.save();
      doc.moveTo(margin, ty).lineTo(margin + contentW, ty);
      doc.dash(6, { space: 5 }).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.undash();
      doc.restore();
      ty += 16;

      doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("Total due", margin, ty);
      doc.font("Helvetica-Bold").fontSize(20).fillColor(ACCENT).text(fmtInr(p.total), margin, ty - 2, {
        width: contentW,
        align: "right",
      });

      doc.end();
    });
  });
}

module.exports = { renderOrderBillPdf };
