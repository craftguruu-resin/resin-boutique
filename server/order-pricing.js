"use strict";

/** Shared checkout pricing — keep in sync with checkout.js refreshCheckout(). */
var GST = 0.18;
var PREPAID_DISCOUNT_RATE = 0.10;
var RAZORPAY_FEE_RATE = 0.025;
var COD_MIN_PRODUCT_VALUE = 500;

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
  /* Product prices are already inclusive of GST and shipping. Never add a
     second shipping charge at checkout or on server-created orders. */
  var ship = 0;
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
    codAdvance: paymentMethod === "cod" ? 200 : 0,
    codBalanceDue: paymentMethod === "cod" ? round2(Math.max(0, grand - 200)) : 0,
  };
}

module.exports = {
  GST: GST,
  PREPAID_DISCOUNT_RATE: PREPAID_DISCOUNT_RATE,
  RAZORPAY_FEE_RATE: RAZORPAY_FEE_RATE,
  COD_MIN_PRODUCT_VALUE: COD_MIN_PRODUCT_VALUE,
  normalizePaymentMethod: normalizePaymentMethod,
  computeTotals: computeTotals,
  round2: round2,
};
