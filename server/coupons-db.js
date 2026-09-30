"use strict";

/* Store coupons are server-owned. Browser totals are only a preview. */
var poolMod = require("./db/pool.js");

function round2(n) { return Math.round(Number(n) * 100) / 100; }
function normalizeCode(raw) { return String(raw == null ? "" : raw).trim().toUpperCase().replace(/\s+/g, ""); }

function validateCouponInput(input) {
  input = input || {};
  var code = normalizeCode(input.code);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) return { error: "Use 3–40 letters, numbers, hyphens, or underscores for the coupon code." };
  var discountType = String(input.discountType || input.discount_type || "").trim().toLowerCase();
  if (discountType !== "percentage" && discountType !== "flat") return { error: "Choose Percentage or Flat discount." };
  var discountValue = round2(input.discountValue != null ? input.discountValue : input.discount_value);
  if (!Number.isFinite(discountValue) || discountValue <= 0) return { error: "Enter a discount value greater than zero." };
  if (discountType === "percentage" && discountValue > 100) return { error: "Percentage discount cannot exceed 100%." };
  if (discountType === "flat" && discountValue > 999999) return { error: "Flat discount is too large." };
  var minSubtotal = round2(input.minSubtotal != null ? input.minSubtotal : input.min_subtotal);
  if (!Number.isFinite(minSubtotal) || minSubtotal < 0) return { error: "Minimum order value cannot be negative." };
  var maxRedemptionsRaw = input.maxRedemptions != null ? input.maxRedemptions : input.max_redemptions;
  var maxRedemptions = maxRedemptionsRaw === "" || maxRedemptionsRaw == null ? null : Math.floor(Number(maxRedemptionsRaw));
  if (maxRedemptions != null && (!Number.isFinite(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1000000)) return { error: "Maximum redemptions must be between 1 and 1,000,000." };
  var startsAt = input.startsAt || input.starts_at || null;
  var endsAt = input.endsAt || input.ends_at || null;
  startsAt = startsAt ? new Date(startsAt) : null;
  endsAt = endsAt ? new Date(endsAt) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) return { error: "Start date is invalid." };
  if (endsAt && Number.isNaN(endsAt.getTime())) return { error: "End date is invalid." };
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) return { error: "End date must be after start date." };
  return { code: code, discountType: discountType, discountValue: discountValue, minSubtotal: minSubtotal, maxRedemptions: maxRedemptions, startsAt: startsAt ? startsAt.toISOString() : null, endsAt: endsAt ? endsAt.toISOString() : null };
}

function mapRow(row) {
  if (!row) return null;
  return { id: Number(row.id), code: String(row.code || ""), discountType: String(row.discount_type || "percentage"), discountValue: Number(row.discount_value) || 0, minSubtotal: Number(row.min_subtotal) || 0, maxRedemptions: row.max_redemptions == null ? null : Number(row.max_redemptions), startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null, endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null, redemptionCount: Number(row.redemption_count) || 0, isActive: row.is_active !== false, createdAt: row.created_at ? new Date(row.created_at).toISOString() : null, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null };
}

function calculateDiscount(coupon, subtotal) {
  var base = round2(Math.max(0, Number(subtotal) || 0));
  if (!coupon || !base) return 0;
  var raw = coupon.discountType === "percentage" ? base * (Number(coupon.discountValue) || 0) / 100 : Number(coupon.discountValue) || 0;
  return round2(Math.min(base, Math.max(0, raw)));
}

function poolOrError(cb) {
  var pool = poolMod.getPool();
  if (pool) return pool;
  process.nextTick(function () { cb(new Error("Database not configured")); });
  return null;
}

var COUPON_SELECT = "c.id, c.code, c.discount_type, c.discount_value, c.min_subtotal, c.starts_at, c.ends_at, c.max_redemptions, c.is_active, c.created_at, c.updated_at, COALESCE((SELECT COUNT(*) FROM orders o WHERE o.coupon_code = c.code AND o.payment_status IN ('paid', 'cod_advance_paid')), 0)::int AS redemption_count";

function listCoupons(cb) {
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("SELECT " + COUPON_SELECT + " FROM store_coupons c ORDER BY c.is_active DESC, c.code ASC").then(function (r) { cb(null, (r.rows || []).map(mapRow)); }).catch(cb);
}

function createCoupon(input, cb) {
  var clean = validateCouponInput(input);
  if (clean.error) return process.nextTick(function () { cb(new Error(clean.error)); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("INSERT INTO store_coupons (code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, true, now()) RETURNING id, code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active, created_at, updated_at", [clean.code, clean.discountType, clean.discountValue, clean.minSubtotal, clean.startsAt, clean.endsAt, clean.maxRedemptions])
    .then(function (r) { cb(null, mapRow(r.rows[0])); })
    .catch(function (err) { cb(err && err.code === "23505" ? new Error("That coupon code already exists.") : err); });
}

function setCouponActive(id, active, cb) {
  var n = Number(id);
  if (!Number.isInteger(n) || n < 1) return process.nextTick(function () { cb(new Error("Invalid coupon.")); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("UPDATE store_coupons SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING id, code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active, created_at, updated_at", [n, !!active]).then(function (r) { if (!r.rows.length) return cb(new Error("Coupon not found.")); cb(null, mapRow(r.rows[0])); }).catch(cb);
}

function updateCoupon(id, input, cb) {
  var n = Number(id);
  if (!Number.isInteger(n) || n < 1) return process.nextTick(function () { cb(new Error("Invalid coupon.")); });
  var clean = validateCouponInput(input);
  if (clean.error) return process.nextTick(function () { cb(new Error(clean.error)); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("UPDATE store_coupons SET code = $2, discount_type = $3, discount_value = $4, min_subtotal = $5, starts_at = $6, ends_at = $7, max_redemptions = $8, updated_at = now() WHERE id = $1 RETURNING id, code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active, created_at, updated_at", [n, clean.code, clean.discountType, clean.discountValue, clean.minSubtotal, clean.startsAt, clean.endsAt, clean.maxRedemptions]).then(function (r) { if (!r.rows.length) return cb(new Error("Coupon not found.")); cb(null, mapRow(r.rows[0])); }).catch(function (err) { cb(err && err.code === "23505" ? new Error("That coupon code already exists.") : err); });
}

function resolveCoupon(codeRaw, subtotal, cb) {
  var code = normalizeCode(codeRaw);
  if (!code) return process.nextTick(function () { cb(null, null); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("SELECT " + COUPON_SELECT + " FROM store_coupons c WHERE c.code = $1 AND c.is_active = true LIMIT 1", [code]).then(function (r) {
    var coupon = mapRow(r.rows[0]);
    if (!coupon) return cb(null, null);
    var now = Date.now();
    if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return cb(null, null);
    if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= now) return cb(null, null);
    if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) return cb(null, null);
    if (round2(subtotal) < coupon.minSubtotal) return cb(null, null);
    coupon.discount = calculateDiscount(coupon, subtotal); cb(null, coupon);
  }).catch(cb);
}

function createPaymentContext(razorpayOrderId, paymentMethod, coupon, cb) {
  var orderId = String(razorpayOrderId || "").trim().slice(0, 120);
  if (!orderId) return process.nextTick(function () { cb(new Error("Missing payment order reference.")); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("INSERT INTO checkout_payment_contexts (razorpay_order_id, payment_method, coupon_code, coupon_type, coupon_value, coupon_discount, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now()) ON CONFLICT (razorpay_order_id) DO UPDATE SET payment_method = EXCLUDED.payment_method, coupon_code = EXCLUDED.coupon_code, coupon_type = EXCLUDED.coupon_type, coupon_value = EXCLUDED.coupon_value, coupon_discount = EXCLUDED.coupon_discount, updated_at = now()", [orderId, paymentMethod === "cod" ? "cod" : "razorpay", coupon ? coupon.code : "", coupon ? coupon.discountType : "", coupon ? coupon.discountValue : 0, coupon ? coupon.discount : 0]).then(function () { cb(null); }).catch(cb);
}

function getPaymentContext(razorpayOrderId, paymentMethod, subtotal, cb) {
  var orderId = String(razorpayOrderId || "").trim().slice(0, 120);
  if (!orderId) return process.nextTick(function () { cb(null, null); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("SELECT coupon_code, coupon_type, coupon_value, coupon_discount FROM checkout_payment_contexts WHERE razorpay_order_id = $1 AND payment_method = $2 LIMIT 1", [orderId, paymentMethod === "cod" ? "cod" : "razorpay"]).then(function (r) {
    var row = r.rows[0];
    if (!row || !String(row.coupon_code || "").trim()) return cb(null, null);
    var coupon = { code: String(row.coupon_code), discountType: String(row.coupon_type || "percentage"), discountValue: Number(row.coupon_value) || 0, isActive: true };
    /* The payment context is the quote that created the gateway order. Do not
       let a Vendor Panel coupon edit alter that quote while checkout is open. */
    coupon.discount = round2(Math.min(Math.max(0, Number(subtotal) || 0), Math.max(0, Number(row.coupon_discount) || 0)));
    cb(null, coupon);
  }).catch(cb);
}

module.exports = { normalizeCode: normalizeCode, validateCouponInput: validateCouponInput, calculateDiscount: calculateDiscount, listCoupons: listCoupons, createCoupon: createCoupon, updateCoupon: updateCoupon, setCouponActive: setCouponActive, resolveCoupon: resolveCoupon, createPaymentContext: createPaymentContext, getPaymentContext: getPaymentContext };
