"use strict";

/* Coupon regressions run offline, without changing store data or making payments. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pricing = require("../server/order-pricing.js");
const call = (fn, ...args) => new Promise((resolve, reject) => fn(...args, (err, value) => err ? reject(err) : resolve(value)));
const checkoutQuote = (db, code, subtotal, guest) => new Promise((resolve, reject) => db.resolveCheckoutCoupons(code, subtotal, guest, (err, coupon, welcome) => err ? reject(err) : resolve({ coupon, welcome })));

function couponStore(withOffers = false) {
  const rows = withOffers ? [["WELCOME100", 100, 500], ["FLAT150", 150, 2000], ["FLAT200", 200, 2500], ["FLAT300", 300, 3000]].map(([code, discount_value, min_subtotal], i) => ({ id: i + 1, code, discount_type: "flat", discount_value, min_subtotal, is_active: true })) : [];
  const contexts = new Map();
  const identities = new Set();
  const pool = {
    async query(sql, args = []) {
      if (sql.startsWith("INSERT INTO store_coupons")) {
        const [code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions] = args;
        const row = { id: rows.length + 1, code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active: true, redemption_count: 0 };
        rows.push(row);
        return { rows: [row] };
      }
      if (sql.startsWith("INSERT INTO checkout_payment_contexts")) {
        const [id, method, coupon_code, coupon_type, coupon_value, coupon_discount, coupons, email_norm, phone_norm] = args;
        contexts.set(id + method, { razorpay_order_id: id, coupon_code, coupon_type, coupon_value, coupon_discount, coupons: JSON.parse(coupons), email_norm, phone_norm });
        return { rows: [] };
      }
      if (sql.includes("FROM customer_order_identities")) return { rows: args.some(value => identities.has(value)) ? [{ exists: 1 }] : [] };
      if (sql.startsWith("BEGIN") || sql.startsWith("COMMIT") || sql.startsWith("ROLLBACK") || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.startsWith("SELECT 1 FROM checkout_payment_contexts")) return { rows: [...contexts.values()].filter(row => !row.cancelled_at && row.coupon_code.includes("WELCOME100") && (row.email_norm === args[0] || row.phone_norm === args[1])) };
      if (sql.startsWith("SELECT razorpay_order_id FROM checkout_payment_contexts")) return { rows: [...contexts.entries()].filter(([key, row]) => !row.cancelled_at && key.endsWith(args[0]) && row.coupon_code === args[1] && row.coupon_discount === args[2] && row.email_norm === args[3] && row.phone_norm === args[4]).map(([key]) => ({ razorpay_order_id: key.slice(0, -args[0].length) })) };
      if (sql.startsWith("SELECT razorpay_order_id, cancelled_at") || sql.startsWith("UPDATE checkout_payment_contexts")) {
        const row = contexts.get(args[0] + args[1]);
        if (!row || row.email_norm !== args[2] || row.phone_norm !== args[3]) return { rows: [] };
        if (sql.startsWith("UPDATE")) row.cancelled_at = new Date();
        return { rows: [row] };
      }
      if (sql.includes("FROM checkout_payment_contexts")) return { rows: [contexts.get(args[0] + args[1])].filter(Boolean) };
      if (sql.includes("FROM store_coupons c")) return { rows: rows.filter(row => !args.length || row.code === args[0]) };
      throw new Error("Unexpected coupon query: " + sql);
    },
  };
  pool.connect = async () => ({ query: pool.query.bind(pool), release() {} });
  const sandbox = { module: { exports: {} }, process, require: name => name === "./db/pool.js" ? { getPool: () => pool } : require(name) };
  vm.runInNewContext(read("server/coupons-db.js"), sandbox);
  return { db: sandbox.module.exports, rows, identities };
}

function element(value = "") {
  return { value, textContent: "", hidden: false, disabled: false, style: {}, classList: { toggle() {}, contains() { return false; } }, focus() {} };
}

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

function vendor(fetchImpl) {
  const elements = Object.fromEntries(["vpmCouponCode", "vpmCouponValue", "vpmCouponMinSubtotal", "vpmCouponMaxRedemptions", "vpmCouponStartsAt", "vpmCouponEndsAt", "vpmCouponSave", "vpmCouponMsg"].map(id => [id, element()]));
  const window = { CraftguruVendor: { apiBase: () => "http://coupon.test", authHeaders: () => ({}), parseApiJson: async res => ({ okHttp: res.ok, json: await res.json() }) } };
  const source = read("vendor-products-manage.js");
  vm.runInNewContext(source.slice(0, source.indexOf("  function refreshGuestCatalogMerge()")) + "window.test = { saveCoupon, setCouponType, localDateValue };})();", {
    window, document: { getElementById: id => elements[id] || null, querySelectorAll: () => [] }, fetch: fetchImpl,
  });
  return { api: window.test, elements };
}

function checkout(fetchImpl, price = 1000, id = "resin-test", customer = null) {
  const elements = Object.fromEntries(["checkoutCouponCode", "checkoutCouponApply", "checkoutCouponRemove", "checkoutCouponMessage", "valCouponDiscount", "valCouponLabel", "valTotal", "valDiscount", "checkoutModalCouponDiscount", "checkoutModalCouponLabel", "checkoutModalGrand", "checkoutModalCouponRow"].map(id => [id, element()]));
  const rows = { ".checkout-total-row--coupon": element(), ".checkout-total-row--discount": element() };
  if (customer) {
    elements.guestEmail = element(customer.email);
    elements.guestPhone = element(customer.phone);
    elements.checkoutCouponOffers = element();
    elements.checkoutWelcomeOffer = element();
  }
  const lines = [{ id, size: "m", name: "Test item", price, qty: 1 }];
  const sessionStorage = storage();
  const window = {
    setTimeout, clearTimeout,
    addEventListener() {}, location: { origin: "http://coupon.test", protocol: "http:", hostname: "coupon.test", port: "" },
    CraftguruApiBase: { get: () => "http://coupon.test" }, RESIN_DATA: {},
    RESIN_CART: { load: () => lines, countItems: () => lines.length, subtotal: () => lines.reduce((sum, row) => sum + row.price * row.qty, 0), formatMoney: n => "₹" + n },
  };
  const document = { getElementById: id => elements[id] || null, querySelectorAll: () => [], querySelector: selector => rows[selector] || null };
  const source = read("checkout.js").replace("  boot();\n})();", "  window.test = { applyCoupon, requestCouponQuote, refreshCustomerCoupons, removeCoupon, clearCouponForCartChange, restoreCouponAfterReload, computeCheckoutTotals, buildBillItemsForApi, postRazorpayOrder, postCodAdvanceOrder, refreshCheckout };\n})();");
  vm.runInNewContext(source, { window, document, fetch: fetchImpl, navigator: { onLine: true }, sessionStorage, localStorage: storage() });
  return { api: window.test, elements, lines, rows, sessionStorage };
}

function response(body, ok = true) {
  return { ok, text: async () => JSON.stringify(body), json: async () => body };
}

function couponApi(db, unitPrice = 1000, gatewayState = {}) {
  /* Exercise the real preview and gateway-order handlers with isolated catalog/payment adapters. */
  const handlers = {};
  const source = read("server/index.js");
  const gatewayOrders = new Map();
  const sandbox = {
    couponsDb: db, orderPricing: pricing,
    app: { post: (route, handler) => { handlers[route] = handler; } },
    rateOk: () => true, validateItems: () => null,
    resolveAuthoritativeCheckoutItems: (items, cb) => cb(null, items.map(item => ({ ...item, unitPrice }))),
    checkInventoryBeforePayment: (items, cb) => cb(null),
    getRazorpayClient: () => ({ orders: {
      create: async order => { const value = { ...order, id: "order_" + gatewayOrders.size, status: "created", amount_paid: 0 }; gatewayOrders.set(value.id, value); return value; },
      fetch: async id => { if (gatewayState.error) throw new Error("Gateway offline"); return { ...gatewayOrders.get(id), ...gatewayState.order }; },
      fetchPayments: async () => ({ count: (gatewayState.payments || []).length, items: gatewayState.payments || [] }),
    } }),
    RAZORPAY_KEY_ID: "test", Date,
  };
  vm.runInNewContext(source.slice(source.indexOf("function computeTotals("), source.indexOf("function makeTagRef(")), sandbox);
  for (const [start, end] of [
    ["/** Preview a coupon", "/** Vendor coupon controls"],
    ["/** Create Razorpay order from cart lines", "/** Verify payment signature"],
    ["/** Create the Razorpay payment order for the COD", "/** Verify the COD"],
  ]) vm.runInNewContext(source.slice(source.indexOf(start), source.indexOf(end)), sandbox);
  return (url, options) => new Promise(resolve => {
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { resolve(response(body, this.statusCode < 400)); } };
    handlers[new URL(url).pathname]({ body: JSON.parse(options.body), ip: "test" }, res);
  });
}

test("vendor Happy Diwali code applies across all storefronts and reduces online/COD totals", async () => {
  const { db } = couponStore();
  const panel = vendor(async (url, options) => {
    if (!options.body) return response({ ok: true, coupons: [] });
    return response({ ok: true, coupon: await call(db.createCoupon, JSON.parse(options.body)) });
  });
  panel.elements.vpmCouponCode.value = "Happy Diwali";
  panel.elements.vpmCouponValue.value = "20";
  await panel.api.saveCoupon();
  assert.match(panel.elements.vpmCouponMsg.textContent, /Coupon saved/);
  for (const id of ["resin-test", "raw-mat--test", "pf-prod--test"]) {
    const page = checkout(couponApi(db), 1000, id);
    page.elements.checkoutCouponCode.value = " happy diwali ";
    await page.api.applyCoupon();
    assert.equal(page.elements.checkoutCouponCode.value, "HAPPYDIWALI");
    assert.equal(page.elements.valCouponDiscount.textContent, "− ₹200");
    assert.equal(page.elements.valTotal.textContent, "₹720");
    assert.equal(page.elements.checkoutModalGrand.textContent, "₹720");
    const online = await page.api.postRazorpayOrder(page.api.buildBillItemsForApi());
    const cod = await page.api.postCodAdvanceOrder(page.api.buildBillItemsForApi());
    assert.equal(online.amount, 72000);
    assert.equal(cod.totals.couponDiscount, 200);
    assert.equal(cod.totals.total, 800);
    assert.equal(cod.totals.codBalanceDue, 600);
  }
});

test("optional minimum defaults to zero and flat discount is capped at item value", async () => {
  const { db } = couponStore();
  await call(db.createCoupon, { code: "FLATDIWALI", discountType: "flat", discountValue: 1500 });
  const coupon = await call(db.resolveCoupon, "flatdiwali", 1000);
  assert.equal(coupon.discount, 1000);
  assert.equal(pricing.computeTotals([{ unitPrice: 1000, qty: 1 }], { couponDiscount: coupon.discount }).total, 0);
});

test("flat coupon survives reload, reduces the payment quote, and can be removed", async () => {
  const { db } = couponStore();
  await call(db.createCoupon, { code: "DIWALIFLAT", discountType: "flat", discountValue: 100, minSubtotal: "" });
  const page = checkout(couponApi(db));
  page.sessionStorage.setItem("cg_checkout_coupon_code", "DIWALIFLAT");
  page.api.restoreCouponAfterReload();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
  assert.equal(page.elements.checkoutModalGrand.textContent, "₹810");
  const online = await page.api.postRazorpayOrder(page.api.buildBillItemsForApi());
  assert.equal(online.amount, 81000);
  page.api.removeCoupon();
  assert.equal(page.elements.valTotal.textContent, "₹900");
  assert.equal(page.rows[".checkout-total-row--coupon"].hidden, true);
});

test("offline reload retains the coupon code so it can be retried after reconnecting", async () => {
  const page = checkout(async () => { throw new TypeError("Network request failed"); });
  page.sessionStorage.setItem("cg_checkout_coupon_code", "DIWALI20");
  page.api.restoreCouponAfterReload();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(page.elements.checkoutCouponMessage.textContent, /retry when you reconnect/);
  assert.equal(page.sessionStorage.getItem("cg_checkout_coupon_code"), "DIWALI20");
  assert.equal(page.elements.checkoutCouponCode.disabled, false);
});

test("vendor schedule retains its timezone when sent to a UTC API", async () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = "Asia/Kolkata";
  try {
    let sent;
    const panel = vendor(async (url, options) => {
      if (options.body) sent = JSON.parse(options.body);
      return response({ ok: true, coupons: [] });
    });
    panel.elements.vpmCouponCode.value = "DIWALI20";
    panel.elements.vpmCouponValue.value = "20";
    panel.elements.vpmCouponStartsAt.value = "2026-10-10T14:00";
    panel.elements.vpmCouponEndsAt.value = "2026-10-11T14:00";
    await panel.api.saveCoupon();
    assert.equal(sent.startsAt, "2026-10-10T08:30:00.000Z");
    assert.equal(sent.endsAt, "2026-10-11T08:30:00.000Z");
    assert.equal(panel.api.localDateValue(sent.startsAt), "2026-10-10T14:00");
  } finally {
    if (originalTimezone == null) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("coupon survives metadata refresh and clears when quantity changes", async () => {
  const { db } = couponStore();
  await call(db.createCoupon, { code: "DIWALI20", discountType: "percentage", discountValue: 20, minSubtotal: 0 });
  const page = checkout(couponApi(db));
  page.elements.checkoutCouponCode.value = "DIWALI20";
  await page.api.applyCoupon();
  page.lines[0].name = "Updated name";
  page.lines[0].image = "updated.jpg";
  page.lines[0].stockMax = 5;
  await page.api.clearCouponForCartChange();
  page.api.refreshCheckout();
  assert.equal(page.elements.valTotal.textContent, "₹720");
  page.lines[0].qty = 2;
  await page.api.clearCouponForCartChange();
  assert.equal(page.elements.valTotal.textContent, "₹1800");
  assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
  assert.equal(page.elements.checkoutCouponCode.value, "");
  assert.equal(page.sessionStorage.getItem("cg_checkout_coupon_code"), null);
});

test("removing an in-flight coupon ignores its late validation response", async () => {
  let finish;
  const page = checkout(() => new Promise(resolve => { finish = resolve; }));
  page.elements.checkoutCouponCode.value = "DIWALI20";
  const pending = page.api.applyCoupon();
  page.api.removeCoupon();
  finish(response({ ok: true, coupon: { code: "DIWALI20", discountType: "percentage", discountValue: 20 } }));
  await pending;
  assert.equal(page.elements.valTotal.textContent, "₹900");
  assert.equal(page.elements.checkoutCouponCode.disabled, false);
  assert.equal(page.sessionStorage.getItem("cg_checkout_coupon_code"), null);
});

test("coupon preview uses the current server price when a browser cart is stale", async () => {
  const { db } = couponStore();
  await call(db.createCoupon, { code: "DIWALI20", discountType: "percentage", discountValue: 20, minSubtotal: 0 });
  const page = checkout(couponApi(db), 750);
  page.elements.checkoutCouponCode.value = "DIWALI20";
  await page.api.applyCoupon();
  const online = await page.api.postRazorpayOrder(page.api.buildBillItemsForApi());
  assert.equal(page.elements.valTotal.textContent, "₹720");
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹200");
  assert.equal(online.amount, 72000);
});

test("checkout cannot create a full-price payment while coupon validation is pending", async () => {
  let finish;
  const page = checkout(() => new Promise(resolve => { finish = resolve; }));
  page.elements.checkoutCouponCode.value = "DIWALI20";
  const pending = page.api.applyCoupon();
  await assert.rejects(page.api.postRazorpayOrder(page.api.buildBillItemsForApi()), /wait for your coupon/);
  await assert.rejects(page.api.postCodAdvanceOrder(page.api.buildBillItemsForApi()), /wait for your coupon/);
  page.api.removeCoupon();
  finish(response({ ok: false }));
  await pending;
});

test("coupon rejection explains the rule and leaves the checkout price undiscounted", async () => {
  for (const [rule, message] of [
    [{ is_active: false }, /inactive/],
    [{ starts_at: new Date(Date.now() + 3600000).toISOString() }, /not started/],
    [{ ends_at: new Date(Date.now() - 3600000).toISOString() }, /expired/],
    [{ max_redemptions: 1, redemption_count: 1 }, /redemption limit/],
    [{ min_subtotal: 2000 }, /minimum cart value/],
  ]) {
    const { db, rows } = couponStore();
    await call(db.createCoupon, { code: "DIWALI20", discountType: "percentage", discountValue: 20, minSubtotal: 0 });
    Object.assign(rows[0], rule);
    const page = checkout(couponApi(db));
    page.elements.checkoutCouponCode.value = "DIWALI20";
    await page.api.applyCoupon();
    assert.match(page.elements.checkoutCouponMessage.textContent, message);
    assert.equal(page.elements.valTotal.textContent, "₹900");
    assert.equal(page.elements.checkoutCouponCode.disabled, false);
    assert.equal(page.sessionStorage.getItem("cg_checkout_coupon_code"), null);
  }
});

test("payment context keeps the quoted coupon amount after a vendor edit", async () => {
  const { db, rows } = couponStore();
  await call(db.createCoupon, { code: "DIWALI20", discountType: "percentage", discountValue: 20, minSubtotal: 0 });
  const coupon = await call(db.resolveCoupon, "DIWALI20", 1000);
  for (const method of ["razorpay", "cod"]) {
    await call(db.createPaymentContext, "order_test", method, coupon);
    rows[0].discount_value = 50;
    const protectedCoupon = await call(db.getPaymentContext, "order_test", method, 1000);
    assert.equal(protectedCoupon.discount, 200);
  }
});

const newCustomer = { email: "new@example.test", phone: "+91 98765 43210" };

test("first-order history stays separate from the cart threshold and coupon pairing", async () => {
  const { db } = couponStore(true);
  await call(db.createCoupon, { code: "FESTIVE10", discountType: "percentage", discountValue: 10 });
  for (const [code, subtotal, eligible] of [["", 500, false], ["", 500.01, true], ["FESTIVE10", 3200, false]]) {
    const quote = await checkoutQuote(db, code, subtotal, newCustomer);
    assert.equal(quote.welcome.firstOrder, true);
    assert.equal(quote.welcome.identityComplete, true);
    assert.equal(quote.welcome.eligible, eligible);
  }
});

test("returning buyers are identified below ₹500 and with only one known contact", async () => {
  const { db, identities } = couponStore(true);
  identities.add("new@example.test");
  identities.add("9876543210");
  for (const subtotal of [400, 500, 3200]) for (const guest of [newCustomer, { email: newCustomer.email }, { phone: newCustomer.phone }]) {
    const quote = await checkoutQuote(db, "", subtotal, guest);
    assert.equal(quote.welcome.firstOrder, false);
    assert.equal(quote.welcome.eligible, false);
    assert.equal(quote.coupon, null);
  }
  for (const guest of [{}, { email: "unknown@example.test" }, { phone: "9988776655" }]) {
    const quote = await checkoutQuote(db, "", 3200, guest);
    assert.equal(quote.welcome.firstOrder, null);
    assert.equal(quote.welcome.eligible, false);
  }
});

test("returning buyers never render welcome while flat offers remain available", async () => {
  const { db, identities } = couponStore(true);
  identities.add("new@example.test");
  for (const price of [400, 500, 3200]) {
    const page = checkout(couponApi(db, price), price, "resin-test", newCustomer);
    await page.api.restoreCouponAfterReload();
    assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
    assert.equal(page.elements.checkoutWelcomeOffer.innerHTML, "");
    assert.match(page.elements.checkoutCouponOffers.innerHTML, /FLAT150.*FLAT200.*FLAT300/);
    if (price > 3000) {
      page.elements.checkoutCouponCode.value = "FLAT300";
      await page.api.applyCoupon();
      assert.equal(page.elements.valCouponDiscount.textContent, "− ₹300");
      assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
      assert.doesNotMatch(page.elements.checkoutCouponMessage.textContent, /WELCOME100/);
    }
  }
});

test("unknown customers see no welcome prompt and complete first buyers get it automatically", async () => {
  const { db } = couponStore(true);
  const page = checkout(couponApi(db, 1000), 1000, "resin-test", { email: newCustomer.email, phone: "" });
  await page.api.restoreCouponAfterReload();
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  assert.equal(page.elements.checkoutWelcomeOffer.innerHTML, "");
  page.elements.guestPhone.value = newCustomer.phone;
  await page.api.refreshCustomerCoupons();
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, false);
  assert.match(page.elements.checkoutWelcomeOffer.innerHTML, /Automatically applied/);
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
});

test("first buyer gets a threshold message at ₹500 and welcome disappears after purchase", async () => {
  const { db, identities } = couponStore(true);
  const page = checkout(couponApi(db, 500), 500, "resin-test", newCustomer);
  await page.api.restoreCouponAfterReload();
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, false);
  assert.match(page.elements.checkoutWelcomeOffer.innerHTML, /Shop above ₹500/);
  assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
  identities.add("new@example.test");
  await page.api.refreshCustomerCoupons(true);
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  assert.equal(page.elements.checkoutWelcomeOffer.innerHTML, "");
});

test("permanent offers enforce strictly-above thresholds before discounts", async () => {
  const { db } = couponStore(true);
  for (const [code, threshold, amount] of [["WELCOME100", 500, 100], ["FLAT150", 2000, 150], ["FLAT200", 2500, 200], ["FLAT300", 3000, 300]]) {
    await assert.rejects(call(db.resolveCoupon, code, threshold), /above/);
    const quote = await call(db.resolveCheckoutCoupons, code, threshold + 0.01, newCustomer);
    assert.equal(quote.discount, amount + (code === "WELCOME100" ? 0 : 100));
    assert.equal(quote.coupons.length, code === "WELCOME100" ? 1 : 2);
  }
  assert.equal(await call(db.resolveCheckoutCoupons, "", 500, newCustomer), null);
  assert.equal((await call(db.resolveCheckoutCoupons, "", 500.01, newCustomer)).code, "WELCOME100");
});

test("welcome validation names only the missing requirements at the actual cart threshold", async () => {
  const { db } = couponStore(true);
  for (const guest of [{}, { email: newCustomer.email }, { phone: newCustomer.phone }, { email: newCustomer.email, phone: "123" }]) {
    for (const subtotal of [400, 500, 500.01, 3200]) {
      await assert.rejects(checkoutQuote(db, "WELCOME100", subtotal, guest), err => {
        assert.match(err.message, /requires your email.*valid mobile number/);
        if (subtotal <= 500) assert.match(err.message, /cart value above ₹500/);
        else assert.doesNotMatch(err.message, /cart|₹500/);
        return true;
      });
    }
  }
  await assert.rejects(checkoutQuote(db, "WELCOME100", 500, newCustomer), err => {
    assert.equal(err.message, "WELCOME100 requires a cart value above ₹500.");
    return true;
  });
});

test("checkout shows the welcome contact error using server prices without a misleading cart warning", async () => {
  const { db } = couponStore(true);
  for (const actualPrice of [400, 500, 500.01, 3200]) {
    // The cached browser price is deliberately lower than the server price.
    const page = checkout(couponApi(db, actualPrice), 300, "resin-test", { email: newCustomer.email, phone: "" });
    page.elements.checkoutCouponCode.value = "WELCOME100";
    await page.api.applyCoupon();
    assert.match(page.elements.checkoutCouponMessage.textContent, /requires your email.*valid mobile number/);
    if (actualPrice <= 500) assert.match(page.elements.checkoutCouponMessage.textContent, /cart value above ₹500/);
    else assert.doesNotMatch(page.elements.checkoutCouponMessage.textContent, /cart|₹500/);
    assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
    assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
  }
});

test("either previously used email or mobile blocks welcome independently", async () => {
  const { db, identities } = couponStore(true);
  identities.add("new@example.test");
  identities.add("9876543210");
  for (const guest of [
    { email: " NEW@EXAMPLE.TEST ", phone: "9988776655" },
    { email: "different@example.test", phone: "09876543210" },
    { email: "different@example.test", phone: "+91 98765-43210" },
  ]) {
    const quote = await call(db.resolveCheckoutCoupons, "FLAT300", 3200, guest);
    assert.equal(quote.code, "FLAT300");
    assert.equal(quote.discount, 300);
    await assert.rejects(call(db.resolveCheckoutCoupons, "WELCOME100+FLAT300", 3200, guest), /first transaction/);
  }
  const quote = await call(db.resolveCheckoutCoupons, "FLAT300", 3200, { email: "fresh@example.test", phone: "9988776655" });
  assert.equal(quote.code, "WELCOME100+FLAT300");
});

test("only welcome plus one built-in flat offer can stack", async () => {
  const { db } = couponStore(true);
  await call(db.createCoupon, { code: "FESTIVE10", discountType: "percentage", discountValue: 10 });
  for (const codes of ["FLAT150+FLAT200", "WELCOME100+FLAT150+FLAT300", "WELCOME100+FESTIVE10", ["FLAT150", "FLAT300"], "WELCOME100+WELCOME100"]) {
    await assert.rejects(call(db.resolveCheckoutCoupons, codes, 3200, newCustomer), /one|combined|paired/);
  }
  const custom = await call(db.resolveCheckoutCoupons, "FESTIVE10", 3200, newCustomer);
  assert.equal(custom.code, "FESTIVE10");
  assert.equal(custom.discount, 320);
  for (const guest of [{ email: newCustomer.email }, { phone: newCustomer.phone }, { email: "invalid", phone: "123" }]) {
    assert.equal(await call(db.resolveCheckoutCoupons, "", 3200, guest), null);
    await assert.rejects(call(db.resolveCheckoutCoupons, "WELCOME100", 3200, guest), /email/);
  }
});

test("checkout auto-applies welcome, switches one flat offer, and retains welcome on removal", async () => {
  for (const id of ["resin-test", "raw-mat--test", "pf-prod--test"]) {
    const { db } = couponStore(true);
    const page = checkout(couponApi(db, 3200), 3200, id, newCustomer);
    await page.api.restoreCouponAfterReload();
    assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
    assert.match(page.elements.checkoutCouponOffers.innerHTML, /FLAT150.*FLAT200.*FLAT300/);
    assert.equal(page.elements.checkoutWelcomeOffer.hidden, false);
    assert.match(page.elements.checkoutWelcomeOffer.innerHTML, /Automatically applied/);
    for (const [code, discount, total] of [["FLAT150", 250, 2655], ["FLAT200", 300, 2610], ["FLAT300", 400, 2520]]) {
      page.elements.checkoutCouponCode.value = code;
      await page.api.applyCoupon();
      assert.equal(page.elements.valCouponDiscount.textContent, "− ₹" + discount);
      assert.equal(page.elements.valTotal.textContent, "₹" + total);
      assert.equal(page.sessionStorage.getItem("cg_checkout_coupon_code"), code);
      assert.match(page.elements.valCouponLabel.textContent, new RegExp("WELCOME100.*" + code));
    }
    await page.api.removeCoupon();
    assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
    assert.equal(page.elements.valTotal.textContent, "₹2790");
    assert.equal(page.sessionStorage.getItem("cg_checkout_coupon_code"), null);
  }
});

test("cart reduction removes an ineligible flat offer and keeps first-order welcome", async () => {
  const { db } = couponStore(true);
  const page = checkout(couponApi(db, 1000), 1000, "resin-test", newCustomer);
  page.lines[0].qty = 3;
  page.elements.checkoutCouponCode.value = "FLAT200";
  await page.api.applyCoupon();
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹300");
  page.lines[0].qty = 2;
  await page.api.clearCouponForCartChange();
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
  assert.equal(page.elements.valTotal.textContent, "₹1710");
  assert.equal(page.sessionStorage.getItem("cg_checkout_coupon_code"), null);
  assert.equal(page.elements.checkoutCouponCode.value, "");
});

test("online and COD payment quotes preserve both coupons and bind customer identities", async () => {
  for (const method of ["razorpay", "cod"]) {
    const { db } = couponStore(true);
    const page = checkout(couponApi(db, 3200), 3200, "resin-test", newCustomer);
    page.elements.checkoutCouponCode.value = "FLAT300";
    await page.api.applyCoupon();
    const post = method === "cod" ? page.api.postCodAdvanceOrder : page.api.postRazorpayOrder;
    const quote = await post(page.api.buildBillItemsForApi());
    assert.equal(quote.totals.couponDiscount, 400);
    assert.equal(quote.amount, method === "cod" ? 20000 : 252000);
    assert.equal(quote.totals.total, method === "cod" ? 2800 : 2520);
    const reopened = await post(page.api.buildBillItemsForApi());
    assert.equal(reopened.orderId, quote.orderId);
    const protectedQuote = await call(db.getPaymentContext, quote.orderId, method, 3200, newCustomer);
    assert.equal(protectedQuote.code, "WELCOME100+FLAT300");
    assert.equal(protectedQuote.coupons.length, 2);
    await assert.rejects(call(db.getPaymentContext, quote.orderId, method, 3200, { email: "different@example.test", phone: "9876543210" }), /different email or mobile/);
    await assert.rejects(call(db.getPaymentContext, quote.orderId, method, 3200, { email: newCustomer.email, phone: "9988776655" }), /different email or mobile/);
  }
});

test("welcome cannot reserve a second payment for either identity", async () => {
  const { db, identities } = couponStore(true);
  const coupon = await call(db.resolveCheckoutCoupons, "FLAT300", 3200, newCustomer);
  await call(db.createPaymentContext, "order_first", "razorpay", coupon, newCustomer);
  for (const guest of [newCustomer, { email: newCustomer.email, phone: "9988776655" }, { email: "fresh@example.test", phone: newCustomer.phone }]) {
    const other = await call(db.resolveCheckoutCoupons, "FLAT200", 3200, guest);
    await assert.rejects(call(db.createPaymentContext, "order_second", "razorpay", other, guest), /already open/);
  }
  identities.add("9876543210");
  await assert.rejects(call(db.createPaymentContext, "order_late", "cod", coupon, newCustomer), /first transaction/);
});

test("confirmed cancellation releases welcome for immediate online/COD retry with a changed cart", async () => {
  for (const method of ["razorpay", "cod"]) {
    const { db } = couponStore(true);
    const api = couponApi(db, 3200);
    const page = checkout(api, 3200, "resin-test", newCustomer);
    page.elements.checkoutCouponCode.value = "FLAT300";
    await page.api.applyCoupon();
    const post = method === "cod" ? page.api.postCodAdvanceOrder : page.api.postRazorpayOrder;
    const first = await post(page.api.buildBillItemsForApi());
    const cancelled = await (await api("http://coupon.test/api/checkout/payment-cancel", { body: JSON.stringify({ razorpay_order_id: first.orderId, paymentMethod: method, guest: newCustomer }) })).json();
    assert.equal(cancelled.canRetry, true);
    page.lines[0].qty = 2;
    await page.api.clearCouponForCartChange();
    const next = await post(page.api.buildBillItemsForApi());
    assert.notEqual(next.orderId, first.orderId);
    assert.equal(next.totals.couponDiscount, 100);
    // The original protected quote remains available for a late verification.
    const original = await call(db.getPaymentContext, first.orderId, method, 3200, newCustomer);
    assert.equal(original.code, "WELCOME100+FLAT300");
  }
});

test("payment cancellation requires both original identities and retains uncertain reservations", async () => {
  for (const gatewayState of [
    { order: { status: "paid", amount_paid: 252000 }, payments: [{ status: "captured" }] },
    { order: { status: "attempted" }, payments: [{ status: "authorized" }] },
    { order: { status: "attempted" }, payments: [{ status: "created" }] },
    { order: { status: "attempted", attempts: 1 }, payments: [] },
    { order: { status: "attempted", attempts: 2 }, payments: [{ status: "failed" }] },
    { order: { amount_paid: null } },
    { error: true },
  ]) {
    const { db } = couponStore(true);
    const api = couponApi(db, 3200, gatewayState);
    const page = checkout(api, 3200, "resin-test", newCustomer);
    page.elements.checkoutCouponCode.value = "FLAT300";
    await page.api.applyCoupon();
    const first = await page.api.postRazorpayOrder(page.api.buildBillItemsForApi());
    for (const guest of [newCustomer, { ...newCustomer, email: "different@example.test" }, { ...newCustomer, phone: "9988776655" }]) {
      const res = await api("http://coupon.test/api/checkout/payment-cancel", { body: JSON.stringify({ razorpay_order_id: first.orderId, paymentMethod: "razorpay", guest }) });
      const body = await res.json();
      assert.notEqual(body.canRetry, true);
      if (guest !== newCustomer) assert.equal(res.ok, false);
    }
    const changed = await call(db.resolveCheckoutCoupons, "FLAT150", 3200, newCustomer);
    await assert.rejects(call(db.createPaymentContext, "order_new", "razorpay", changed, newCustomer), /already open/);
  }
});

test("a failed gateway attempt can restart after dismissal, without consuming welcome", async () => {
  const { db, identities } = couponStore(true);
  const api = couponApi(db, 3200, { order: { status: "attempted", attempts: 1 }, payments: [{ status: "failed" }] });
  const page = checkout(api, 3200, "resin-test", newCustomer);
  await page.api.requestCouponQuote("", true);
  const first = await page.api.postRazorpayOrder(page.api.buildBillItemsForApi());
  const result = await (await api("http://coupon.test/api/checkout/payment-cancel", { body: JSON.stringify({ razorpay_order_id: first.orderId, paymentMethod: "razorpay", guest: newCustomer }) })).json();
  assert.equal(result.canRetry, true);
  assert.equal(identities.size, 0);
  assert.notEqual((await page.api.postRazorpayOrder(page.api.buildBillItemsForApi())).orderId, first.orderId);
});

test("removing products clears even an eligible flat coupon and drops welcome at ₹500", async () => {
  const { db } = couponStore(true);
  const page = checkout(couponApi(db, 500), 500, "resin-test", newCustomer);
  page.lines[0].qty = 8;
  page.elements.checkoutCouponCode.value = "FLAT300";
  await page.api.applyCoupon();
  page.lines[0].qty = 7; // FLAT300 is still eligible, but cart changes clear the selection.
  await page.api.clearCouponForCartChange();
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
  page.elements.checkoutCouponCode.value = "FLAT200";
  await page.api.applyCoupon();
  page.lines[0].qty = 1;
  await page.api.clearCouponForCartChange();
  assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
  assert.equal(page.elements.valTotal.textContent, "₹450");
  assert.equal(page.elements.checkoutCouponCode.value, "");
});

test("vendor sees all permanent offers without expiry and cannot overwrite them", async () => {
  const { db } = couponStore(true);
  const offers = await call(db.listCoupons);
  assert.equal(offers.length, 4);
  for (const offer of offers) {
    assert.equal(offer.isSystem, true);
    assert.equal(offer.endsAt, null);
    await assert.rejects(call(db.createCoupon, { code: offer.code, discountType: "flat", discountValue: 999 }), /managed automatically/);
    await assert.rejects(call(db.updateCoupon, offer.id, { code: offer.code, discountType: "flat", discountValue: 999 }), /managed automatically/);
  }
});

function parcelStore() {
  const orders = [];
  const identities = new Map();
  const locks = new Map();
  let failStock = false;
  let nextId = 1;
  async function connect() {
    const unlocks = [];
    const insertedOrders = [];
    const insertedIdentities = [];
    const client = { release() {}, async query(sql, args = []) {
      if (sql === "BEGIN") return { rows: [] };
      if (sql === "ROLLBACK" || sql === "COMMIT") {
        if (sql === "ROLLBACK") {
          insertedOrders.forEach(order => orders.splice(orders.indexOf(order), 1));
          insertedIdentities.forEach(identity => identities.delete(identity));
        }
        unlocks.forEach(unlock => unlock());
        return { rows: [] };
      }
      if (sql.includes("pg_advisory_xact_lock")) {
        const prior = locks.get(args[0]) || Promise.resolve();
        let unlock;
        const wait = new Promise(resolve => { unlock = resolve; });
        locks.set(args[0], prior.then(() => wait));
        await prior;
        unlocks.push(unlock);
        return { rows: [] };
      }
      if (sql.includes("FROM customer_order_identities")) return { rows: [identities.get("email:" + args[0]), identities.get("phone:" + args[1])].filter(Boolean) };
      if (sql.includes("FROM orders WHERE payment_reference")) return { rows: orders.filter(order => order.payment_reference === args[0]) };
      if (sql.includes("FROM orders WHERE id")) return { rows: orders.filter(order => order.id === args[0]) };
      if (sql.startsWith("UPDATE orders SET payment_status")) {
        const order = orders.find(order => order.id === args[0]);
        order.payment_status = "paid"; order.paid_at = new Date();
        return { rows: [order] };
      }
      if (sql.includes("FROM store_coupons")) return { rows: args[0].map(code => ({ code, max_redemptions: null })) };
      if (sql.includes("FROM vendor_inventory_items")) return { rows: [] };
      if (sql.startsWith("INSERT INTO orders")) {
        if (orders.some(order => order.payment_reference === args[16])) return { rows: [] };
        const order = { id: nextId++, created_at: new Date(), payment_reference: args[16], tag_ref: args[0], guest_id: args[1], guest_snapshot: JSON.parse(args[12]), payment_status: args[13], payment_method: args[14], coupon_code: args[5] };
        orders.push(order); insertedOrders.push(order);
        return { rows: [order] };
      }
      if (sql.startsWith("INSERT INTO customer_order_identities")) {
        for (const key of ["email:" + args[0], "phone:" + args[1]]) if (!identities.has(key)) { identities.set(key, { orderId: args[2] }); insertedIdentities.push(key); }
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO order_items")) return { rows: [] };
      throw new Error("Unexpected parcel query: " + sql);
    } };
    return client;
  }
  const pool = { connect };
  const couponSandbox = { module: { exports: {} }, process, require: name => name === "./db/pool.js" ? { getPool: () => pool } : require(name) };
  vm.runInNewContext(read("server/coupons-db.js"), couponSandbox);
  const couponDb = couponSandbox.module.exports;
  const adapters = {
    "./db/pool.js": { getPool: () => pool },
    "./coupons-db.js": couponDb,
    "./guest-db.js": { insertGuestStrictOrAttachAddress: async () => ({ guestId: 1 }) },
    "./inventory-decrement.js": { normalizeSizeKey: () => "m", decrementOrderItems: async () => { if (failStock) throw new Error("Stock exhausted"); } },
    "./shipment/shipment-db.js": {}, "./shipment/shipment-status.js": {},
  };
  const sandbox = { module: { exports: {} }, process, require: name => adapters[name] };
  vm.runInNewContext(read("server/orders-db.js"), sandbox);
  return { db: sandbox.module.exports, orders, identities, setStockFailure: value => { failStock = value; } };
}

function parcelOptions(reference, couponCode = "WELCOME100+FLAT300", productValue = 3200, paymentStatus = "paid") {
  const couponDiscount = couponCode === "WELCOME100+FLAT300" ? 400 : couponCode === "WELCOME100" ? 100 : 0;
  return { guest: newCustomer, items: [{ name: "Test item", productId: "test", sizeKey: "m", qty: 1, unitPrice: productValue }], totals: pricing.computeTotals([{ qty: 1, unitPrice: productValue }], { couponDiscount }), tagRef: reference, orderType: "Checkout", paymentStatus, paymentMethod: "razorpay", paymentReference: reference, couponCode };
}

test("completed first purchases below the welcome minimum still consume both identities", async () => {
  const { db, identities, orders } = parcelStore();
  await call(db.createCheckoutParcelOrder, parcelOptions("small-first", "", 300));
  assert.equal(identities.size, 2);
  await assert.rejects(call(db.createCheckoutParcelOrder, parcelOptions("welcome-second")), /first transaction/);
  assert.equal(orders.length, 1);
  // Refund/deletion of the order must not grant another first transaction.
  orders.splice(0, 1);
  await assert.rejects(call(db.createCheckoutParcelOrder, parcelOptions("welcome-after-delete")), /first transaction/);
});

test("concurrent completed welcome orders serialize, and payment retries stay idempotent", async () => {
  for (const paymentStatus of ["paid", "cod_advance_paid"]) {
    const { db, orders, identities } = parcelStore();
    const results = await Promise.allSettled([
      call(db.createCheckoutParcelOrder, parcelOptions("payment-one", "WELCOME100+FLAT300", 3200, paymentStatus)),
      call(db.createCheckoutParcelOrder, parcelOptions("payment-two", "WELCOME100+FLAT300", 3200, paymentStatus)),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.match(results.find(result => result.status === "rejected").reason.message, /first transaction/);
    assert.equal(orders.length, 1);
    assert.equal(identities.size, 2);
    const retry = await call(db.createCheckoutParcelOrder, parcelOptions(orders[0].payment_reference, "WELCOME100+FLAT300", 3200, paymentStatus));
    assert.equal(retry.orderId, orders[0].id);
    assert.equal(orders.length, 1);
  }
});

test("failed or pending orders do not consume the customer's first transaction", async () => {
  const store = parcelStore();
  store.setStockFailure(true);
  await assert.rejects(call(store.db.createCheckoutParcelOrder, parcelOptions("stock-failure")), /Stock exhausted/);
  assert.equal(store.orders.length, 0);
  assert.equal(store.identities.size, 0);
  store.setStockFailure(false);
  await call(store.db.createCheckoutParcelOrder, parcelOptions("pending", "", 300, "pending_payment"));
  assert.equal(store.identities.size, 0);
  await call(store.db.createCheckoutParcelOrder, parcelOptions("successful"));
  assert.equal(store.identities.size, 2);
});

test("vendor marking a pending order paid consumes the first transaction immediately", async () => {
  const { db, identities } = parcelStore();
  const pending = await call(db.createCheckoutParcelOrder, parcelOptions("pending-manual", "", 300, "pending_payment"));
  assert.equal(identities.size, 0);
  const paid = await call(db.markOrderPaymentReceived, pending.orderId);
  assert.equal(paid.paymentStatus, "paid");
  assert.equal(identities.size, 2);
  await assert.rejects(call(db.createCheckoutParcelOrder, parcelOptions("later-welcome")), /first transaction/);
  assert.equal((await call(db.markOrderPaymentReceived, pending.orderId)).alreadyPaid, true);
});
