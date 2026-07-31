"use strict";

var nodemailer = require("nodemailer");
var shipmentStatus = require("./shipment-status.js");

var NOTIFY_CODES = {
  dispatch: ["picked_up", "in_transit"],
  in_transit: ["in_transit", "reached_hub"],
  out_for_delivery: ["out_for_delivery"],
  delivered: ["delivered"],
};

function shouldNotify(previousCode, nextCode) {
  var prev = String(previousCode || "").toLowerCase();
  var next = String(nextCode || "").toLowerCase();
  if (!next || prev === next) return null;
  var keys = Object.keys(NOTIFY_CODES);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (NOTIFY_CODES[k].indexOf(next) >= 0 && NOTIFY_CODES[k].indexOf(prev) < 0) return k;
  }
  if (next === shipmentStatus.STATUS.DELIVERED && prev !== shipmentStatus.STATUS.DELIVERED) return "delivered";
  return null;
}

function mailTransport() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" },
    });
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return null;
}

function buildEmailHtml(orderId, shipment, eventKind) {
  var label = shipmentStatus.statusLabel(shipment.shipmentStatusCode);
  var trackUrl = shipment.trackingUrl || shipmentStatus.defaultTrackingUrl(shipment.courierName, shipment.trackingNumber);
  var titles = {
    dispatch: "Your Craftguru order is on the way",
    in_transit: "Shipment update — in transit",
    out_for_delivery: "Out for delivery today",
    delivered: "Delivered — thank you!",
  };
  return (
    "<p>Order #" +
    orderId +
    "</p>" +
    "<p><strong>" +
    (titles[eventKind] || "Shipment update") +
    "</strong></p>" +
    "<p>Status: " +
    label +
    "</p>" +
    "<p>Courier: " +
    (shipment.courierName || "Delhivery") +
    "<br/>Tracking: " +
    (shipment.trackingNumber || "—") +
    "</p>" +
    (trackUrl ? '<p><a href="' + trackUrl + '">Track shipment</a></p>' : "") +
    "<p>— Craftguru</p>"
  );
}

/**
 * Future-ready notification hook (email stub + console + WhatsApp hook point).
 * @param {{ orderId: number, previousStatusCode?: string, shipment: object, guest?: object }} evt
 */
function onShipmentStatusChange(evt) {
  var orderId = evt && evt.orderId;
  var shipment = evt && evt.shipment;
  if (!orderId || !shipment) return;

  var kind = shouldNotify(evt.previousStatusCode, shipment.shipmentStatusCode);
  if (!kind) return;

  var payload = {
    orderId: orderId,
    kind: kind,
    statusCode: shipment.shipmentStatusCode,
    statusLabel: shipment.shipmentStatus || shipmentStatus.statusLabel(shipment.shipmentStatusCode),
    trackingNumber: shipment.trackingNumber,
    courierName: shipment.courierName,
    trackingUrl: shipment.trackingUrl,
  };

  console.log("[shipment-notify]", JSON.stringify(payload));

  if (String(process.env.SHIPMENT_NOTIFY_EMAIL || "").toLowerCase() === "1" && evt.guest && evt.guest.email) {
    var transport = mailTransport();
    if (transport) {
      transport
        .sendMail({
          from: process.env.MAIL_FROM || "Craftguru <orders@craftguru.com>",
          to: evt.guest.email,
          subject: "Craftguru order #" + orderId + " — " + payload.statusLabel,
          html: buildEmailHtml(orderId, shipment, kind),
        })
        .catch(function (e) {
          console.warn("[shipment-notify] email failed:", e && e.message ? e.message : e);
        });
    }
  }

  /* WhatsApp: wire when SHIPMENT_NOTIFY_WHATSAPP=1 — reuse whatsapp-meta.js from caller if needed */
  if (String(process.env.SHIPMENT_NOTIFY_WHATSAPP || "").toLowerCase() === "1") {
    console.log("[shipment-notify] WhatsApp hook (stub) order", orderId, kind);
  }
}

module.exports = {
  onShipmentStatusChange: onShipmentStatusChange,
  shouldNotify: shouldNotify,
};
