"use strict";

/** Shared checkout pricing — keep in sync with checkout.js refreshCheckout(). */
var GST = 0.18;
var SHIP_FLAT = 10;
var FREE_SHIP_MIN = 150;
var PREPAID_DISCOUNT_RATE = 0.05;
var RAZORPAY_FEE_RATE = 0.025;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function normalizePaymentMethod(raw) {
  var m = String(raw || "razorpay")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (m === "cod" || m === "cash_on_delivery") return "cod";
  return "razorpay";
}

/**
 * @param {object[]} items — sanitized bill lines
 * @param {{ paymentMethod?: string }} [opts]
 */
function computeTotals(items, opts) {
  opts = opts || {};
  var paymentMethod = normalizePaymentMethod(opts.paymentMethod);
  var sub = 0;
  (items || []).forEach(function (x) {
    var q = Math.max(1, Math.min(999, Math.floor(Number(x.qty) || 1)));
    var u = Math.max(0, Math.min(999999, Number(x.unitPrice) || 0));
    sub += u * q;
  });
  var productValue = round2(sub);
  var ship = productValue >= FREE_SHIP_MIN ? 0 : SHIP_FLAT;
  var prepaidDiscount = paymentMethod === "razorpay" ? round2(productValue * PREPAID_DISCOUNT_RATE) : 0;
  var afterDiscount = round2(Math.max(0, productValue - prepaidDiscount));
  var taxable = round2(afterDiscount / (1 + GST));
  var gst = round2(afterDiscount - taxable);
  var grand = round2(afterDiscount + ship);
  var gatewayFee = paymentMethod === "razorpay" ? round2(grand * RAZORPAY_FEE_RATE) : 0;
  return {
    productValue: productValue,
    subtotal: productValue,
    prepaidDiscount: prepaidDiscount,
    afterDiscount: afterDiscount,
    taxableValue: taxable,
    gstAmount: gst,
    shipping: ship,
    tax: gst,
    total: grand,
    gatewayFee: gatewayFee,
    paymentMethod: paymentMethod,
  };
}

module.exports = {
  GST: GST,
  SHIP_FLAT: SHIP_FLAT,
  FREE_SHIP_MIN: FREE_SHIP_MIN,
  PREPAID_DISCOUNT_RATE: PREPAID_DISCOUNT_RATE,
  RAZORPAY_FEE_RATE: RAZORPAY_FEE_RATE,
  normalizePaymentMethod: normalizePaymentMethod,
  computeTotals: computeTotals,
  round2: round2,
};
