(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    var rounded = Math.round(x * 100) / 100;
    return rounded.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function fullAddr(g) {
    if (!g) return "";
    var line2 = [g.city, g.state].filter(Boolean).join(", ");
    return [g.addrLine1, g.addrLine2, line2, g.zip, g.country]
      .filter(function (x) {
        return x && String(x).trim();
      })
      .join(", ");
  }

  function lineAmt(it) {
    var q = Math.max(1, Math.floor(Number(it.qty) || 1));
    var u = Number(it.unitPrice) || 0;
    return q * u;
  }

  function formatLineExtraBits(le) {
    if (!le || typeof le !== "object") return [];
    var out = [];
    if (String(le.namePlateText || "").trim()) {
      out.push("Name plate text: " + String(le.namePlateText).trim());
    }
    if (String(le.keychainAlphabet || "").trim()) {
      out.push("Keychain letter: " + String(le.keychainAlphabet).trim());
    }
    if (String(le.keychainName || "").trim()) {
      out.push("Keychain name: " + String(le.keychainName).trim());
    }
    return out;
  }

  function buildPersonalisationBlockHtml(order) {
    var items = order.items || [];
    var parts = [];
    items.forEach(function (it, ix) {
      var le = it.lineExtra && typeof it.lineExtra === "object" ? it.lineExtra : null;
      var bits = formatLineExtraBits(le);
      if (!bits.length) return;
      parts.push(
        "<li><strong>Line " +
        (ix + 1) +
        " — " +
          esc(it.name || "Item") +
          "</strong><ul class='vendor-pe__sub'>" +
          bits
            .map(function (b) {
              return "<li>" + esc(b) + "</li>";
            })
            .join("") +
          "</ul></li>"
      );
    });
    if (!parts.length) return "";
    return (
      "<div class='vendor-pe vendor-pe--order'><h3>Personalisation (name plates &amp; keychains)</h3><ol class='vendor-pe__list'>" +
      parts.join("") +
      "</ol></div>"
    );
  }

  function buildInlineTagBillHtml(order) {
    var g = order.guest || {};
    var items = order.items || [];
    var totals = order.totals || { subtotal: 0, shipping: 0, tax: 0, total: 0 };
    var rows = items
      .map(function (it) {
        return (
          "<tr><td>" +
          esc(it.name) +
          "</td><td>" +
          esc(it.sizeLabel || "") +
          "</td><td style='text-align:center'>" +
          esc(String(it.qty || 1)) +
          "</td><td style='text-align:right'>" +
          money(lineAmt(it)) +
          "</td></tr>"
        );
      })
      .join("");
    return (
      "<div class='vendor-inline-tag'>" +
      "<p class='vendor-inline-tag__k'>VENDOR PARCEL TAG · ORDER #" +
      esc(order.orderId) +
      " · " +
      esc(order.tagRef) +
      "</p>" +
      "<p><strong>Name</strong></p><p class='vendor-inline-tag__name'>" +
      esc(g.name) +
      "</p>" +
      "<p><strong>Phone</strong></p><p>" +
      esc(g.phone || "—") +
      "</p>" +
      "<p><strong>Address</strong></p><p>" +
      esc(fullAddr(g) || "—") +
      "</p>" +
      "<p><strong>Pincode</strong></p><p>" +
      esc(g.zip || "—") +
      "</p>" +
      "<p><strong>Note</strong> — Make unboxing video for claim.</p>" +
      "</div>" +
      "<div class='vendor-inline-bill'>" +
      "<h3>Bill summary (no images)</h3>" +
      "<p><strong>Order type:</strong> " +
      esc(order.orderType || "—") +
      "</p>" +
      "<table class='vendor-inline-bill__table'><thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Amt</th></tr></thead><tbody>" +
      rows +
      "</tbody></table>" +
      "<div class='vendor-inline-bill__sum'>" +
      "<div>Subtotal " +
      money(totals.subtotal) +
      "</div>" +
      "<div>Shipping " +
      money(totals.shipping) +
      "</div>" +
      "<div>Tax (8%) " +
      money(totals.tax) +
      "</div>" +
      "<div><strong>Total " +
      money(totals.total) +
      "</strong></div></div></div>" +
      buildPersonalisationBlockHtml(order)
    );
  }

  function buildPrintHtml(order) {
    var g = order.guest || {};
    var items = order.items || [];
    var totals = order.totals || { subtotal: 0, shipping: 0, tax: 0, total: 0 };
    var rows = items
      .map(function (it) {
        return (
          "<tr><td>" +
          esc(it.name) +
          "</td><td>" +
          esc(it.sizeLabel || "") +
          "</td><td style='text-align:center'>" +
          esc(String(it.qty || 1)) +
          "</td><td style='text-align:right'>" +
          money(lineAmt(it)) +
          "</td></tr>"
        );
      })
      .join("");
    return (
      "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Order #" +
      esc(order.orderId) +
      "</title><style>" +
      "body{font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#111;}" +
      ".tag{max-width:520px;border:2px solid #111;padding:20px;margin-bottom:28px;}" +
      ".tag .k{font-size:11px;letter-spacing:0.12em;color:#555;margin:0 0 12px;}" +
      ".tag h2{margin:0 0 6px;font-size:18px;}" +
      ".tag p{margin:0 0 10px;line-height:1.45;}" +
      ".bill{margin-top:8px;}" +
      ".bill h3{margin:0 0 10px;font-size:15px;}" +
      "table.bill-t{width:100%;border-collapse:collapse;max-width:560px;}" +
      "table.bill-t th,table.bill-t td{border:1px solid #ccc;padding:8px;font-size:13px;}" +
      "table.bill-t th{background:#f5f5f5;text-align:left;}" +
      ".sum{max-width:280px;margin-top:12px;font-size:14px;line-height:1.6;}" +
      "@media print{body{padding:12px;}}" +
      "</style></head><body>" +
      "<section class='tag'><p class='k'>VENDOR PARCEL TAG · ORDER #" +
      esc(order.orderId) +
      " · " +
      esc(order.tagRef) +
      "</p>" +
      "<p><strong>Name</strong></p><h2>" +
      esc(g.name) +
      "</h2>" +
      "<p><strong>Phone</strong></p><p>" +
      esc(g.phone || "—") +
      "</p>" +
      "<p><strong>Address</strong></p><p>" +
      esc(fullAddr(g) || "—") +
      "</p>" +
      "<p><strong>Pincode</strong></p><p>" +
      esc(g.zip || "—") +
      "</p>" +
      "<p><strong>Note</strong> — Make unboxing video for claim. Thank you.</p>" +
      "<p style='margin-top:16px;font-size:12px;color:#444;'><strong>FROM</strong> CRAFTGURU · Jaipur</p></section>" +
      "<section class='bill'><h3>Bill summary (no images)</h3>" +
      "<p style='font-size:13px;margin:0 0 8px;'><strong>Order type:</strong> " +
      esc(order.orderType || "—") +
      "</p>" +
      "<table class='bill-t'><thead><tr><th>Item</th><th>Size</th><th>Qty</th><th style='text-align:right'>Amount</th></tr></thead><tbody>" +
      rows +
      "</tbody></table>" +
      "<div class='sum'>" +
      "<div><strong>Subtotal</strong> " +
      money(totals.subtotal) +
      "</div>" +
      "<div><strong>Shipping</strong> " +
      money(totals.shipping) +
      "</div>" +
      "<div><strong>Tax (8%)</strong> " +
      money(totals.tax) +
      "</div>" +
      "<div><strong>Total</strong> " +
      money(totals.total) +
      "</div></div>" +
      buildPersonalisationBlockHtml(order) +
      "</section></body></html>"
    );
  }

  window.VendorTagBuilders = {
    esc: esc,
    money: money,
    fullAddr: fullAddr,
    lineAmt: lineAmt,
    buildInlineTagBillHtml: buildInlineTagBillHtml,
    buildPrintHtml: buildPrintHtml,
  };
})();
