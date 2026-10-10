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

function couponStore() {
  const rows = [];
  const contexts = new Map();
  const pool = {
    async query(sql, args = []) {
      if (sql.startsWith("INSERT INTO store_coupons")) {
        const [code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions] = args;
        const row = { id: rows.length + 1, code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active: true, redemption_count: 0 };
        rows.push(row);
        return { rows: [row] };
      }
      if (sql.startsWith("INSERT INTO checkout_payment_contexts")) {
        const [id, method, coupon_code, coupon_type, coupon_value, coupon_discount] = args;
        contexts.set(id + method, { coupon_code, coupon_type, coupon_value, coupon_discount });
        return { rows: [] };
      }
      if (sql.includes("FROM checkout_payment_contexts")) return { rows: [contexts.get(args[0] + args[1])].filter(Boolean) };
      if (sql.includes("FROM store_coupons c")) return { rows: rows.filter(row => !args.length || row.code === args[0]) };
      throw new Error("Unexpected coupon query: " + sql);
    },
  };
  const sandbox = { module: { exports: {} }, process, require: () => ({ getPool: () => pool }) };
  vm.runInNewContext(read("server/coupons-db.js"), sandbox);
  return { db: sandbox.module.exports, rows };
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

function checkout(fetchImpl, price = 1000, id = "resin-test") {
  const elements = Object.fromEntries(["checkoutCouponCode", "checkoutCouponApply", "checkoutCouponRemove", "checkoutCouponMessage", "valCouponDiscount", "valCouponLabel", "valTotal", "valDiscount", "checkoutModalCouponDiscount", "checkoutModalCouponLabel", "checkoutModalGrand", "checkoutModalCouponRow"].map(id => [id, element()]));
  const rows = { ".checkout-total-row--coupon": element(), ".checkout-total-row--discount": element() };
  const lines = [{ id, size: "m", name: "Test item", price, qty: 1 }];
  const sessionStorage = storage();
  const window = {
    addEventListener() {}, location: { origin: "http://coupon.test", protocol: "http:", hostname: "coupon.test", port: "" },
    CraftguruApiBase: { get: () => "http://coupon.test" }, RESIN_DATA: {},
    RESIN_CART: { load: () => lines, countItems: () => lines.length, subtotal: () => lines.reduce((sum, row) => sum + row.price * row.qty, 0), formatMoney: n => "₹" + n },
  };
  const document = { getElementById: id => elements[id] || null, querySelectorAll: () => [], querySelector: selector => rows[selector] || null };
  const source = read("checkout.js").replace("  boot();\n})();", "  window.test = { applyCoupon, removeCoupon, clearCouponForCartChange, restoreCouponAfterReload, computeCheckoutTotals, buildBillItemsForApi, postRazorpayOrder, postCodAdvanceOrder, refreshCheckout };\n})();");
  vm.runInNewContext(source, { window, document, fetch: fetchImpl, navigator: { onLine: true }, sessionStorage, localStorage: storage() });
  return { api: window.test, elements, lines, rows, sessionStorage };
}

function response(body, ok = true) {
  return { ok, text: async () => JSON.stringify(body), json: async () => body };
}

function couponApi(db) {
  /* Exercise the real preview and gateway-order handlers with isolated catalog/payment adapters. */
  const handlers = {};
  const source = read("server/index.js");
  const sandbox = {
    couponsDb: db, orderPricing: pricing,
    app: { post: (route, handler) => { handlers[route] = handler; } },
    rateOk: () => true, validateItems: () => null,
    resolveAuthoritativeCheckoutItems: (items, cb) => cb(null, items.map(item => ({ ...item, unitPrice: 1000 }))),
    checkInventoryBeforePayment: (items, cb) => cb(null),
    getRazorpayClient: () => ({ orders: { create: async order => ({ ...order, id: "order_test" }) } }),
    RAZORPAY_KEY_ID: "test", Date,
  };
  vm.runInNewContext(source.slice(source.indexOf("function computeTotals("), source.indexOf("function makeTagRef(")), sandbox);
  for (const [start, end] of [
    ["/** Preview a coupon", "/** Vendor coupon controls"],
    ["/** Create Razorpay order from cart lines", "/** Verify payment signature"],
    ["/** Create the Razorpay payment order for the COD", "/** Verify the COD"],
  ]) vm.runInNewContext(source.slice(source.indexOf(start), source.indexOf(end)), sandbox);
  return (url, options) => new Promise(resolve => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve(response(body, this.statusCode < 400)); } };
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

test("coupon survives metadata refresh and revalidates when quantity changes", async () => {
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
  assert.equal(page.elements.valTotal.textContent, "₹1440");
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹400");
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
