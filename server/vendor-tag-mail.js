"use strict";

/**
 * HTML email body styled like a printed shipping / vendor parcel tag.
 * @param {object} p
 * @param {string} p.tagRef
 * @param {object} p.guest
 * @param {Array<{name:string,sizeLabel:string,qty:number,unitPrice:number,sku?:string}>} p.items
 * @param {{subtotal:number,shipping:number,tax:number,total:number}} p.totals
 */
function buildVendorTagHtml(p) {
  var g = p.guest || {};
  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };
  var fullAddr =
    [g.addrLine1, g.addrLine2, [g.city, g.state].filter(Boolean).join(", "), g.zip, g.country]
      .filter(function (x) {
        return x && String(x).trim();
      })
      .join(", ");

  var rows = (p.items || []).map(function (it) {
    var amt = (Number(it.unitPrice) || 0) * (Math.max(1, Math.floor(Number(it.qty) || 1)) || 1);
    return (
      "<tr><td style='padding:6px 8px;border:1px solid #ccc;font-size:13px;'>" +
      esc(it.name) +
      "</td><td style='padding:6px 8px;border:1px solid #ccc;font-size:13px;'>" +
      esc(String(it.sku || "").trim() || "—") +
      "</td><td style='padding:6px 8px;border:1px solid #ccc;font-size:13px;'>" +
      esc(it.sizeLabel || "") +
      "</td><td style='padding:6px 8px;border:1px solid #ccc;font-size:13px;text-align:center;'>" +
      esc(String(it.qty || 1)) +
      "</td><td style='padding:6px 8px;border:1px solid #ccc;font-size:13px;text-align:right;'>" +
      Math.round(amt) +
      "</td></tr>"
    );
  });

  return (
    "<!DOCTYPE html><html><head><meta charset='utf-8'></head><body style='margin:0;padding:24px;background:#e8e8e8;font-family:Arial,Helvetica,sans-serif;'>" +
    "<table role='presentation' cellpadding='0' cellspacing='0' width='100%' style='max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #bbb;'>" +
    "<tr><td style='padding:20px 22px 16px;'>" +
    "<p style='margin:0 0 14px;font-size:11px;letter-spacing:0.12em;color:#666;'>VENDOR PARCEL TAG · ORDER #" +
    esc(p.orderId != null ? String(p.orderId) : "—") +
    " · " +
    esc(p.tagRef) +
    "</p>" +
    "<p style='margin:0 0 6px;font-size:20px;font-weight:bold;color:#111;'>Name</p>" +
    "<p style='margin:0 0 14px;font-size:18px;font-weight:bold;color:#111;'>" +
    esc(g.name) +
    "</p>" +
    "<p style='margin:0 0 4px;font-size:14px;font-weight:bold;color:#111;'>Contact no.</p>" +
    "<p style='margin:0 0 14px;font-size:17px;font-weight:bold;color:#111;'>" +
    esc(g.phone || "—") +
    "</p>" +
    "<p style='margin:0 0 4px;font-size:13px;color:#333;'>Address</p>" +
    "<p style='margin:0 0 14px;font-size:14px;line-height:1.45;color:#111;'>" +
    esc(fullAddr || "—") +
    "</p>" +
    "<p style='margin:0 0 4px;font-size:13px;color:#333;'>Pincode</p>" +
    "<p style='margin:0 0 18px;font-size:15px;font-weight:bold;color:#111;'>" +
    esc(g.zip || "—") +
    "</p>" +
    "<p style='margin:0 0 6px;font-size:13px;font-weight:bold;color:#111;'>Note- Make Unboxing Video For Claim</p>" +
    "<p style='margin:0 0 20px;font-size:13px;color:#111;'>Thank You !</p>" +
    "<hr style='border:none;border-top:1px solid #ddd;margin:0 0 16px;' />" +
    "<p style='margin:0 0 8px;font-size:12px;font-weight:bold;color:#333;'>Order lines</p>" +
    "<table cellpadding='0' cellspacing='0' width='100%' style='border-collapse:collapse;margin-bottom:18px;'>" +
    "<tr style='background:#f5f5f5;'>" +
    "<th style='padding:6px 8px;border:1px solid #ccc;font-size:11px;text-align:left;'>Item</th>" +
    "<th style='padding:6px 8px;border:1px solid #ccc;font-size:11px;text-align:left;'>SKU</th>" +
    "<th style='padding:6px 8px;border:1px solid #ccc;font-size:11px;text-align:left;'>Size</th>" +
    "<th style='padding:6px 8px;border:1px solid #ccc;font-size:11px;'>Qty</th>" +
    "<th style='padding:6px 8px;border:1px solid #ccc;font-size:11px;text-align:right;'>Amt</th>" +
    "</tr>" +
    rows.join("") +
    "</table>" +
    "<p style='margin:4px 0;font-size:13px;color:#222;'><strong>Items (incl. 18% GST):</strong> " +
    Math.round(p.totals.subtotal) +
    " &nbsp; <strong>Taxable (ex GST):</strong> " +
    Math.round(
      p.totals.taxableValue != null && Number.isFinite(Number(p.totals.taxableValue))
        ? Number(p.totals.taxableValue)
        : (Number(p.totals.subtotal) || 0) / 1.18
    ) +
    " &nbsp; <strong>GST 18%:</strong> " +
    Math.round(p.totals.tax) +
    " &nbsp; <strong>Shipping:</strong> " +
    (p.totals.shipping === 0 ? "Free" : String(Math.round(p.totals.shipping))) +
    "</p>" +
    "<p style='margin:8px 0 0;font-size:16px;font-weight:bold;color:#111;'><strong>Total:</strong> " +
    Math.round(p.totals.total) +
    "</p>" +
    "<p style='margin:12px 0 0;font-size:12px;color:#555;'>Guest email: " +
    esc(g.email || "—") +
    "</p>" +
    "</td></tr>" +
    "<tr><td style='padding:16px 22px 20px;border-top:1px solid #ddd;background:#fafafa;'>" +
    "<p style='margin:0 0 6px;font-size:11px;font-weight:bold;color:#444;'>FROM</p>" +
    "<p style='margin:0 0 4px;font-size:15px;font-weight:bold;color:#111;'>CRAFTGURU</p>" +
    "<p style='margin:0;font-size:12px;line-height:1.5;color:#333;'>35, Shree Laxmi Jagdish Temple Goner, Jaipur, Rajasthan</p>" +
    "<p style='margin:8px 0 0;font-size:12px;color:#333;'><strong>Pin-Code:</strong> 303905</p>" +
    "<p style='margin:4px 0 0;font-size:12px;color:#333;'><strong>Mob:</strong> 8824350056</p>" +
    "<p style='margin:4px 0 0;font-size:12px;color:#333;'><strong>Email:</strong> Craftguruu@gmail.com</p>" +
    "<p style='margin:4px 0 0;font-size:12px;color:#333;'><strong>Follow Us On Instagram</strong> – @Craftguruindia</p>" +
    "<p style='margin:4px 0 0;font-size:12px;color:#333;'><strong>Website:</strong> www.craftguru.co.in</p>" +
    "</td></tr></table></body></html>"
  );
}

/**
 * @param {import('nodemailer').Transporter} transporter
 * @param {object} opts
 */
function sendVendorTagMail(transporter, opts) {
  var from = opts.from;
  var to = opts.to;
  var html = buildVendorTagHtml(opts.payload);
  var oid = opts.payload.orderId != null ? "#" + opts.payload.orderId + " · " : "";
  var subject = "[Craftguru] Vendor parcel tag " + oid + opts.payload.tagRef;
  return transporter.sendMail({
    from: from,
    to: to,
    subject: subject,
    html: html,
    replyTo: opts.replyTo || undefined,
  });
}

module.exports = { buildVendorTagHtml, sendVendorTagMail };
