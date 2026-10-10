"use strict";

/* Store coupons are server-owned. Browser totals are only a preview. */
var poolMod = require("./db/pool.js");
var fs = require("fs");
var path = require("path");
var SYSTEM_CODES = ["WELCOME100", "FLAT150", "FLAT200", "FLAT300"];

function ensureSchema() {
  var pool = poolMod.getPool();
  if (!pool) return Promise.resolve();
  return pool.query(fs.readFileSync(path.join(__dirname, "db/coupon-flow.sql"), "utf8"));
}

function normalizeIdentity(guest) {
  guest = guest || {};
  var email = String(guest.email || "").trim().toLowerCase();
  var phone = String(guest.phone || "").replace(/\D/g, "");
  if (phone.length === 12 && phone.slice(0, 2) === "91") phone = phone.slice(2);
  if (phone.length === 11 && phone.charAt(0) === "0") phone = phone.slice(1);
  return { email: email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "", phone: /^[6-9]\d{9}$/.test(phone) ? phone : "" };
}

function lockIdentity(client, identity) {
  return ["email:" + identity.email, "phone:" + identity.phone].sort().reduce(function (p, key) {
    return p.then(function () { return client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["checkout:" + key]); });
  }, Promise.resolve());
}

function hasPreviousOrder(client, identity) {
  return client.query("SELECT 1 FROM customer_order_identities WHERE (identity_kind = 'email' AND identity_value = $1) OR (identity_kind = 'phone' AND identity_value = $2) LIMIT 1", [identity.email, identity.phone])
    .then(function (r) { return r.rows.length > 0; });
}

function splitCodes(raw) {
  return (Array.isArray(raw) ? raw : String(raw || "").split("+")).map(normalizeCode).filter(Boolean);
}

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
  var minSubtotalRaw = input.minSubtotal != null ? input.minSubtotal : input.min_subtotal;
  var minSubtotal = round2(minSubtotalRaw == null || minSubtotalRaw === "" ? 0 : minSubtotalRaw);
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
  return { id: Number(row.id), code: String(row.code || ""), isSystem: SYSTEM_CODES.indexOf(row.code) >= 0, firstOrderOnly: row.code === "WELCOME100", discountType: String(row.discount_type || "percentage"), discountValue: Number(row.discount_value) || 0, minSubtotal: Number(row.min_subtotal) || 0, maxRedemptions: row.max_redemptions == null ? null : Number(row.max_redemptions), startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null, endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null, redemptionCount: Number(row.redemption_count) || 0, isActive: row.is_active !== false, createdAt: row.created_at ? new Date(row.created_at).toISOString() : null, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null };
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

var COUPON_SELECT = "c.id, c.code, c.discount_type, c.discount_value, c.min_subtotal, c.starts_at, c.ends_at, c.max_redemptions, c.is_active, c.created_at, c.updated_at, COALESCE((SELECT COUNT(*) FROM orders o WHERE c.code = ANY(string_to_array(o.coupon_code, '+')) AND o.payment_status IN ('paid', 'cod_advance_paid')), 0)::int AS redemption_count";

function listCoupons(cb) {
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("SELECT " + COUPON_SELECT + " FROM store_coupons c ORDER BY c.is_active DESC, c.code ASC").then(function (r) { cb(null, (r.rows || []).map(mapRow)); }).catch(cb);
}

function createCoupon(input, cb) {
  var clean = validateCouponInput(input);
  if (clean.error) return process.nextTick(function () { cb(new Error(clean.error)); });
  if (SYSTEM_CODES.indexOf(clean.code) >= 0) return process.nextTick(function () { cb(new Error("This permanent checkout coupon is managed automatically.")); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("INSERT INTO store_coupons (code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, true, now()) RETURNING id, code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active, created_at, updated_at", [clean.code, clean.discountType, clean.discountValue, clean.minSubtotal, clean.startsAt, clean.endsAt, clean.maxRedemptions])
    .then(function (r) { cb(null, mapRow(r.rows[0])); })
    .catch(function (err) { cb(err && err.code === "23505" ? new Error("That coupon code already exists.") : err); });
}

function setCouponActive(id, active, cb) {
  var n = Number(id);
  if (!Number.isInteger(n) || n < 1) return process.nextTick(function () { cb(new Error("Invalid coupon.")); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("UPDATE store_coupons SET is_active = $2, updated_at = now() WHERE id = $1 AND code <> ALL($3::varchar[]) RETURNING id, code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active, created_at, updated_at", [n, !!active, SYSTEM_CODES]).then(function (r) { if (!r.rows.length) return cb(new Error("Coupon not found or is a permanent checkout offer.")); cb(null, mapRow(r.rows[0])); }).catch(cb);
}

function updateCoupon(id, input, cb) {
  var n = Number(id);
  if (!Number.isInteger(n) || n < 1) return process.nextTick(function () { cb(new Error("Invalid coupon.")); });
  var clean = validateCouponInput(input);
  if (clean.error) return process.nextTick(function () { cb(new Error(clean.error)); });
  if (SYSTEM_CODES.indexOf(clean.code) >= 0) return process.nextTick(function () { cb(new Error("This permanent checkout coupon is managed automatically.")); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("UPDATE store_coupons SET code = $2, discount_type = $3, discount_value = $4, min_subtotal = $5, starts_at = $6, ends_at = $7, max_redemptions = $8, updated_at = now() WHERE id = $1 AND code <> ALL($9::varchar[]) RETURNING id, code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active, created_at, updated_at", [n, clean.code, clean.discountType, clean.discountValue, clean.minSubtotal, clean.startsAt, clean.endsAt, clean.maxRedemptions, SYSTEM_CODES]).then(function (r) { if (!r.rows.length) return cb(new Error("Coupon not found or is a permanent checkout offer.")); cb(null, mapRow(r.rows[0])); }).catch(function (err) { cb(err && err.code === "23505" ? new Error("That coupon code already exists.") : err); });
}

function resolveCoupon(codeRaw, subtotal, cb) {
  var code = normalizeCode(codeRaw);
  if (!code) return process.nextTick(function () { cb(null, null); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("SELECT " + COUPON_SELECT + " FROM store_coupons c WHERE c.code = $1 LIMIT 1", [code]).then(function (r) {
    var coupon = mapRow(r.rows[0]);
    if (!coupon) return cb(null, null);
    if (!coupon.isActive) return cb(new Error("This coupon is inactive."));
    var now = Date.now();
    if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return cb(new Error("This coupon has not started yet."));
    if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= now) return cb(new Error("This coupon has expired."));
    if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) return cb(new Error("This coupon has reached its redemption limit."));
    if (round2(subtotal) < coupon.minSubtotal || (coupon.isSystem && round2(subtotal) === coupon.minSubtotal)) return cb(new Error("This coupon requires " + (coupon.isSystem ? "a cart value above ₹" : "a minimum cart value of ₹") + coupon.minSubtotal.toLocaleString("en-IN") + "."));
    coupon.discount = calculateDiscount(coupon, subtotal); cb(null, coupon);
  }).catch(cb);
}

function bundleCoupons(coupons) {
  if (!coupons.length) return null;
  return { code: coupons.map(function (c) { return c.code; }).join("+"), discountType: coupons.length === 1 ? coupons[0].discountType : "flat", discountValue: coupons.length === 1 ? coupons[0].discountValue : round2(coupons.reduce(function (n, c) { return n + c.discount; }, 0)), discount: round2(coupons.reduce(function (n, c) { return n + c.discount; }, 0)), coupons: coupons };
}

/** At most one selected coupon. WELCOME100 can pair only with a built-in flat offer. */
function resolveCheckoutCoupons(raw, subtotal, guest, cb, options) {
  var codes = splitCodes(raw);
  if (codes.length > 2 || new Set(codes).size !== codes.length) return process.nextTick(function () { cb(new Error("Choose one flat coupon; only WELCOME100 can be paired with it.")); });
  var selected = codes.filter(function (code) { return code !== "WELCOME100"; });
  if (selected.length > 1 || (codes.length === 2 && SYSTEM_CODES.slice(1).indexOf(selected[0]) < 0)) return process.nextTick(function () { cb(new Error("Only WELCOME100 plus one of FLAT150, FLAT200 or FLAT300 can be combined.")); });
  var identity = normalizeIdentity(guest);
  var explicitWelcome = codes.indexOf("WELCOME100") >= 0;
  var pool = poolOrError(cb); if (!pool) return;
  var identityComplete = !!(identity.email && identity.phone);
  // Email-only signup can preview its gift after the server verifies the session.
  // Payment quotes never enable this option and still require both identifiers.
  var knownCustomer = identityComplete || !!(options && options.allowEmailOnlyWelcome && identity.email);
  var canWelcome = knownCustomer && round2(subtotal) > 500 && (!selected.length || SYSTEM_CODES.slice(1).indexOf(selected[0]) >= 0);
  if (explicitWelcome && !canWelcome) {
    var welcomeError = "WELCOME100 requires your email and a valid mobile number to check first-order eligibility.";
    if (round2(subtotal) <= 500) welcomeError = knownCustomer ? "WELCOME100 requires a cart value above ₹500." : "WELCOME100 requires your email, a valid mobile number and a cart value above ₹500.";
    return process.nextTick(function () { cb(new Error(welcomeError)); });
  }
  // Purchase history controls visibility even below the minimum or before both
  // contact fields are filled. Either previously used identifier blocks welcome.
  var history = Promise.resolve(identity.email || identity.phone ? hasPreviousOrder(pool, identity) : false);
  var accountIdentity = options && normalizeIdentity({ email: identity.email, phone: options.accountPhone });
  if (accountIdentity && accountIdentity.phone && accountIdentity.phone !== identity.phone) history = history.then(function (previous) { return previous || hasPreviousOrder(pool, accountIdentity); });
  history.then(function (previous) {
    if (explicitWelcome && previous) throw new Error("WELCOME100 is only for your first transaction. This email or mobile has already placed an order.");
    var wanted = canWelcome && !previous ? ["WELCOME100"].concat(selected) : selected;
    return Promise.all(wanted.map(function (code) {
      return new Promise(function (resolve, reject) { resolveCoupon(code, subtotal, function (err, coupon) { if (err) reject(err); else if (!coupon) reject(new Error("This coupon is not available.")); else resolve(coupon); }); });
    })).then(function (coupons) {
      var bundle = bundleCoupons(coupons);
      if (bundle) bundle.identity = identity;
      cb(null, bundle, { eligible: !!(canWelcome && !previous), identityComplete: identityComplete, firstOrder: previous ? false : knownCustomer ? true : null, pendingMobileVerification: !!(canWelcome && !previous && !identityComplete) });
    });
  }).catch(cb);
}

function createPaymentContext(razorpayOrderId, paymentMethod, coupon, guest, cb) {
  if (typeof guest === "function") { cb = guest; guest = null; }
  var orderId = String(razorpayOrderId || "").trim().slice(0, 120);
  if (!orderId) return process.nextTick(function () { cb(new Error("Missing payment order reference.")); });
  var pool = poolOrError(cb); if (!pool) return;
  var identity = normalizeIdentity(guest || (coupon && coupon.identity));
  var welcomes = coupon && splitCodes(coupon.code).indexOf("WELCOME100") >= 0;
  if (welcomes && (!identity.email || !identity.phone)) return process.nextTick(function () { cb(new Error("WELCOME100 requires your email and a valid mobile number before payment.")); });
  var args = [orderId, paymentMethod === "cod" ? "cod" : "razorpay", coupon ? coupon.code : "", coupon ? coupon.discountType : "", coupon ? coupon.discountValue : 0, coupon ? coupon.discount : 0, JSON.stringify(coupon ? coupon.coupons || [coupon] : []), identity.email, identity.phone];
  var sql = "INSERT INTO checkout_payment_contexts (razorpay_order_id, payment_method, coupon_code, coupon_type, coupon_value, coupon_discount, coupons, email_norm, phone_norm, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now())";
  if (!welcomes) return pool.query(sql, args).then(function () { cb(null); }).catch(cb);
  var client;
  pool.connect().then(function (c) { client = c; return c.query("BEGIN"); })
    .then(function () { return lockIdentity(client, identity); })
    .then(function () { return hasPreviousOrder(client, identity); })
    .then(function (previous) {
      if (previous) throw new Error("WELCOME100 coupon is only for your first transaction. Refresh your checkout.");
      return client.query("SELECT 1 FROM checkout_payment_contexts WHERE cancelled_at IS NULL AND 'WELCOME100' = ANY(string_to_array(coupon_code, '+')) AND (email_norm = $1 OR phone_norm = $2) AND created_at > now() - interval '30 minutes' LIMIT 1", [identity.email, identity.phone]);
    })
    .then(function (r) { if (r.rows.length) throw new Error("A WELCOME100 payment is already open for this email or mobile. Complete it or retry after 30 minutes."); return client.query(sql, args); })
    .then(function () { return client.query("COMMIT"); })
    .then(function () { client.release(); client = null; cb(null); })
    .catch(function (err) { if (!client) return cb(err); client.query("ROLLBACK").catch(function () {}).then(function () { client.release(); cb(err); }); });
}

function findReusablePaymentContext(paymentMethod, coupon, guest, cb) {
  if (!coupon || splitCodes(coupon.code).indexOf("WELCOME100") < 0) return process.nextTick(function () { cb(null, null); });
  var pool = poolOrError(cb); if (!pool) return;
  var identity = normalizeIdentity(guest);
  pool.query("SELECT razorpay_order_id FROM checkout_payment_contexts WHERE cancelled_at IS NULL AND payment_method = $1 AND coupon_code = $2 AND coupon_discount = $3 AND email_norm = $4 AND phone_norm = $5 AND created_at > now() - interval '30 minutes' ORDER BY created_at DESC LIMIT 1", [paymentMethod, coupon.code, coupon.discount, identity.email, identity.phone])
    .then(function (r) { cb(null, r.rows.length ? r.rows[0].razorpay_order_id : null); }).catch(cb);
}

function findCustomerPaymentContext(orderId, paymentMethod, guest, cb) {
  var pool = poolOrError(cb); if (!pool) return;
  var identity = normalizeIdentity(guest);
  if (!identity.email || !identity.phone) return process.nextTick(function () { cb(new Error("Use the original email and mobile to check this payment.")); });
  pool.query("SELECT razorpay_order_id, cancelled_at FROM checkout_payment_contexts WHERE razorpay_order_id = $1 AND payment_method = $2 AND email_norm = $3 AND phone_norm = $4 LIMIT 1", [orderId, paymentMethod, identity.email, identity.phone])
    .then(function (r) { if (!r.rows.length) return cb(new Error("The payment reference does not match this customer.")); cb(null, r.rows[0]); }).catch(cb);
}

function cancelPaymentContext(orderId, paymentMethod, guest, cb) {
  var pool = poolOrError(cb); if (!pool) return;
  var identity = normalizeIdentity(guest);
  // Release only the unused quote's reservation. Keep its original prices for
  // verification if the gateway reports a late successful payment.
  pool.query("UPDATE checkout_payment_contexts SET cancelled_at = COALESCE(cancelled_at, now()), updated_at = now() WHERE razorpay_order_id = $1 AND payment_method = $2 AND email_norm = $3 AND phone_norm = $4 RETURNING razorpay_order_id", [orderId, paymentMethod, identity.email, identity.phone])
    .then(function (r) { if (!r.rows.length) return cb(new Error("The payment reference does not match this customer.")); cb(null); }).catch(cb);
}

function getPaymentContext(razorpayOrderId, paymentMethod, subtotal, guest, cb) {
  if (typeof guest === "function") { cb = guest; guest = null; }
  var orderId = String(razorpayOrderId || "").trim().slice(0, 120);
  if (!orderId) return process.nextTick(function () { cb(null, null); });
  var pool = poolOrError(cb); if (!pool) return;
  pool.query("SELECT coupon_code, coupon_type, coupon_value, coupon_discount, coupons, email_norm, phone_norm FROM checkout_payment_contexts WHERE razorpay_order_id = $1 AND payment_method = $2 LIMIT 1", [orderId, paymentMethod === "cod" ? "cod" : "razorpay"]).then(function (r) {
    var row = r.rows[0];
    if (!row) return cb(new Error("Missing protected checkout quote."));
    var identity = normalizeIdentity(guest);
    if (guest && ((row.email_norm && row.email_norm !== identity.email) || (row.phone_norm && row.phone_norm !== identity.phone))) return cb(new Error("The payment quote belongs to a different email or mobile. Use the original customer details."));
    if (!row || !String(row.coupon_code || "").trim()) return cb(null, null);
    var coupon = { code: String(row.coupon_code), discountType: String(row.coupon_type || "percentage"), discountValue: Number(row.coupon_value) || 0, coupons: row.coupons || [], isActive: true };
    /* The payment context is the quote that created the gateway order. Do not
       let a Vendor Panel coupon edit alter that quote while checkout is open. */
    coupon.discount = round2(Math.min(Math.max(0, Number(subtotal) || 0), Math.max(0, Number(row.coupon_discount) || 0)));
    cb(null, coupon);
  }).catch(cb);
}

module.exports = { ensureSchema: ensureSchema, normalizeIdentity: normalizeIdentity, lockIdentity: lockIdentity, hasPreviousOrder: hasPreviousOrder, splitCodes: splitCodes, normalizeCode: normalizeCode, validateCouponInput: validateCouponInput, calculateDiscount: calculateDiscount, listCoupons: listCoupons, createCoupon: createCoupon, updateCoupon: updateCoupon, setCouponActive: setCouponActive, resolveCoupon: resolveCoupon, resolveCheckoutCoupons: resolveCheckoutCoupons, createPaymentContext: createPaymentContext, findReusablePaymentContext: findReusablePaymentContext, findCustomerPaymentContext: findCustomerPaymentContext, cancelPaymentContext: cancelPaymentContext, getPaymentContext: getPaymentContext };
