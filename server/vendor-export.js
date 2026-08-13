"use strict";

var PDFDocument = require("pdfkit");
var fs = require("fs");
var pathMod = require("path");
var XLSX = require("xlsx");

var mediaPathMod = require("./media-path.js");

var INK = "#12141a";
var MUTED = "#5c6578";
var LINE = "#e8eef6";
var ACCENT = "#26a69a";

function fmtInr(n) {
  var x = Number(n);
  if (!Number.isFinite(x)) x = 0;
  return (Math.round(x * 100) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function istYmd(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  } catch (_) {
    return "";
  }
}

function loadLogoBuffer() {
  var candidates = [
    mediaPathMod.absoluteMediaPath("media/brand-craftguru.png"),
    pathMod.join(__dirname, "..", "media", "brand-craftguru.png"),
  ];
  for (var i = 0; i < candidates.length; i++) {
    var p = candidates[i];
    if (p && fs.existsSync(p)) {
      try {
        return fs.readFileSync(p);
      } catch (_) {}
    }
  }
  return null;
}

function drawPdfHeader(doc, margin, contentW, title, subtitle) {
  var y = margin;
  var logo = loadLogoBuffer();
  if (logo) {
    try {
      doc.image(logo, margin, y, { width: 72 });
    } catch (_) {}
  }
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text("Craftguru", margin + 84, y + 4);
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Resin boutique · Jaipur", margin + 84, y + 24);
  y += 52;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(14).text(title, margin, y, { width: contentW });
  y += 20;
  if (subtitle) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(subtitle, margin, y, { width: contentW });
    y += 16;
  }
  doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor(LINE).stroke();
  return y + 14;
}

function drawPdfTable(doc, margin, contentW, startY, headers, rows, pageH) {
  var y = startY;
  var colWidths = headers.map(function () {
    return contentW / headers.length;
  });
  var rowH = 18;

  function ensureSpace() {
    if (y + rowH > pageH - 40) {
      doc.addPage();
      y = margin;
    }
  }

  ensureSpace();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
  headers.forEach(function (h, i) {
    var x = margin + colWidths.slice(0, i).reduce(function (a, b) {
      return a + b;
    }, 0);
    doc.text(h, x + 2, y, { width: colWidths[i] - 4, ellipsis: true });
  });
  y += rowH;
  doc.moveTo(margin, y - 4).lineTo(margin + contentW, y - 4).strokeColor(LINE).stroke();

  doc.font("Helvetica").fontSize(8).fillColor(INK);
  rows.forEach(function (row) {
    ensureSpace();
    row.forEach(function (cell, i) {
      var x = margin + colWidths.slice(0, i).reduce(function (a, b) {
        return a + b;
      }, 0);
      doc.text(String(cell == null ? "" : cell), x + 2, y, { width: colWidths[i] - 4, ellipsis: true });
    });
    y += rowH;
  });
  return y;
}

function renderOrdersPdf(meta, rows) {
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

    var y = drawPdfHeader(doc, margin, contentW, meta.title || "Orders export", meta.subtitle || "");
    var headers = [
      "Order",
      "Date",
      "Customer",
      "Phone",
      "Payment",
      "Fulfillment",
      "Total (INR)",
      "Tracking",
    ];
    var body = rows.map(function (o) {
      return [
        "#" + String(o.orderId || ""),
        istYmd(o.createdAt),
        String(o.guestName || ""),
        String(o.guestPhone || ""),
        String(o.paymentStatus || ""),
        String(o.fulfillmentStatus || ""),
        fmtInr(o.total != null ? o.total : (o.totals && o.totals.total) || 0),
        String(o.trackingNumber || ""),
      ];
    });
    y = drawPdfTable(doc, margin, contentW, y, headers, body, pageH);

    var totalAmt = rows.reduce(function (sum, o) {
      var t = Number(o.total != null ? o.total : (o.totals && o.totals.total) || 0);
      return sum + (Number.isFinite(t) ? t : 0);
    }, 0);
    y += 10;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("Total orders: " + rows.length + " · Sum: " + fmtInr(totalAmt), margin, y);

    var pages = doc.bufferedPageRange();
    for (var p = 0; p < pages.count; p++) {
      doc.switchToPage(p);
      doc.font("Helvetica").fontSize(8).fillColor(MUTED);
      doc.text("Page " + (p + 1) + " of " + pages.count, margin, pageH - 28, {
        width: contentW,
        align: "right",
      });
    }

    doc.end();
  });
}

function renderBillingPdf(meta, rows, totals) {
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

    var y = drawPdfHeader(doc, margin, contentW, meta.title || "Billing export", meta.subtitle || "");
    var headers = ["Order", "Date", "Product", "Qty", "Revenue", "Cost", "Profit"];
    var body = rows.map(function (r) {
      return [
        "#" + String(r.orderId || ""),
        istYmd(r.createdAt),
        String(r.productName || r.name || ""),
        String(r.qty || 0),
        fmtInr(r.revenue),
        fmtInr(r.cost),
        fmtInr(r.profit),
      ];
    });
    y = drawPdfTable(doc, margin, contentW, y, headers, body, pageH);
    y += 12;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
    doc.text(
      "Revenue: " +
        fmtInr(totals.revenue) +
        " · Cost: " +
        fmtInr(totals.totalCost) +
        " · Profit: " +
        fmtInr(totals.profit),
      margin,
      y
    );

    var pages = doc.bufferedPageRange();
    for (var p = 0; p < pages.count; p++) {
      doc.switchToPage(p);
      doc.font("Helvetica").fontSize(8).fillColor(MUTED);
      doc.text("Page " + (p + 1) + " of " + pages.count, margin, pageH - 28, {
        width: contentW,
        align: "right",
      });
    }

    doc.end();
  });
}

function sheetFromAoA(aoa) {
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  var colCount = aoa[0] ? aoa[0].length : 0;
  ws["!cols"] = [];
  for (var c = 0; c < colCount; c++) {
    var maxLen = 10;
    for (var r = 0; r < aoa.length; r++) {
      var cell = aoa[r][c];
      var len = String(cell == null ? "" : cell).length;
      if (len > maxLen) maxLen = len;
    }
    ws["!cols"].push({ wch: Math.min(42, maxLen + 2) });
  }
  return ws;
}

function ordersToXlsx(rows) {
  var aoa = [
    [
      "Order ID",
      "Tag Ref",
      "Created (IST)",
      "Customer",
      "Phone",
      "Payment Status",
      "Payment Method",
      "Fulfillment",
      "Shipment",
      "Total (INR)",
      "Tracking",
      "Courier",
    ],
  ];
  rows.forEach(function (o) {
    aoa.push([
      o.orderId,
      o.tagRef || "",
      istYmd(o.createdAt),
      o.guestName || "",
      o.guestPhone || "",
      o.paymentStatus || "",
      o.paymentMethod || "",
      o.fulfillmentStatus || "",
      o.shipmentStatus || "",
      Number(o.total != null ? o.total : (o.totals && o.totals.total) || 0),
      o.trackingNumber || "",
      o.courierName || "",
    ]);
  });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromAoA(aoa), "Orders");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function billingToXlsx(rows, totals) {
  var aoa = [
    ["Order ID", "Date (IST)", "Product", "Qty", "Revenue (INR)", "Cost (INR)", "Profit (INR)", "Payment Method"],
  ];
  rows.forEach(function (r) {
    aoa.push([
      r.orderId,
      istYmd(r.createdAt),
      r.productName || r.name || "",
      Number(r.qty) || 0,
      Number(r.revenue) || 0,
      Number(r.cost) || 0,
      Number(r.profit) || 0,
      r.paymentMethod || "",
    ]);
  });
  aoa.push([]);
  aoa.push(["Totals", "", "", "", Number(totals.revenue) || 0, Number(totals.totalCost) || 0, Number(totals.profit) || 0, ""]);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromAoA(aoa), "Billing");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function filterOrders(all, opts) {
  opts = opts || {};
  var q = String(opts.q || "")
    .trim()
    .toLowerCase();
  var from = String(opts.from || "").trim();
  var to = String(opts.to || "").trim();
  var customer = String(opts.customer || "")
    .trim()
    .toLowerCase();
  var payment = String(opts.payment || "all").toLowerCase();
  var fulfillment = String(opts.fulfillment || "all").toLowerCase();
  var ship = String(opts.ship || "all").toLowerCase();

  return (all || []).filter(function (o) {
    if (from && istYmd(o.createdAt) < from) return false;
    if (to && istYmd(o.createdAt) > to) return false;
    if (payment === "paid" && o.paymentStatus !== "paid") return false;
    if (payment === "pending" && o.paymentStatus !== "pending_payment") return false;
    var fs = String(o.fulfillmentStatus || "new").toLowerCase();
    if (fulfillment === "open") {
      if (fs === "delivered" || fs === "cancelled") return false;
    } else if (fulfillment !== "all" && fs !== fulfillment) return false;
    if (ship === "active" && !isActiveShipment(o)) return false;
    if (ship === "delivered") {
      var code = String(o.shipmentStatusCode || "").toLowerCase();
      if (code !== "delivered") return false;
    }
    if (ship === "none" && String(o.trackingNumber || "").trim()) return false;
    if (customer) {
      var hay = (String(o.guestName || "") + " " + String(o.guestPhone || "")).toLowerCase();
      if (hay.indexOf(customer) < 0) return false;
    }
    if (q) {
      var blob =
        String(o.orderId || "") +
        " " +
        String(o.tagRef || "") +
        " " +
        String(o.trackingNumber || "") +
        " " +
        String(o.guestName || "") +
        " " +
        String(o.guestPhone || "");
      if (blob.toLowerCase().indexOf(q) < 0) return false;
    }
    return true;
  });
}

function isActiveShipment(o) {
  var code = String(o.shipmentStatusCode || "").toLowerCase();
  if (!String(o.trackingNumber || "").trim()) return false;
  return code && code !== "delivered" && code !== "returned" && code !== "cancelled" && code !== "lost" && code !== "undelivered";
}

function flattenBillingRows(insights) {
  var lines = (insights && insights.lineRows) || [];
  return lines.map(function (r) {
    return {
      orderId: r.orderId,
      tagRef: r.tagRef,
      createdAt: r.soldAt,
      productName: r.name || r.productId,
      qty: r.qty,
      revenue: r.productValue != null ? r.productValue : r.revenue,
      cost: r.totalCost,
      profit: r.profit,
      paymentMethod: r.paymentMethod,
    };
  });
}

module.exports = {
  filterOrders: filterOrders,
  renderOrdersPdf: renderOrdersPdf,
  renderBillingPdf: renderBillingPdf,
  ordersToXlsx: ordersToXlsx,
  billingToXlsx: billingToXlsx,
  flattenBillingRows: flattenBillingRows,
  istYmd: istYmd,
};
