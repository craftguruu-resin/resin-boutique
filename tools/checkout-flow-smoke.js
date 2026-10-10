"use strict";

/* Run the actual checkout event handlers offline. No payments or store data change. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = file => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const response = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });

function checkout(options = {}) {
  const elements = {};
  let document;
  function element(id = "", value = "") {
    const attrs = new Map();
    const classes = new Set();
    const listeners = new Map();
    const el = {
      id, value, style: {}, dataset: {}, children: [], textContent: "", disabled: false,
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle(name, on = !classes.has(name)) { if (on) classes.add(name); else classes.delete(name); },
      },
      setAttribute: (key, value) => attrs.set(key, String(value)),
      getAttribute: key => attrs.has(key) ? attrs.get(key) : null,
      removeAttribute: key => attrs.delete(key),
      hasAttribute: key => attrs.has(key),
      toggleAttribute(key, on) { if (on) attrs.set(key, ""); else attrs.delete(key); },
      addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); },
      removeEventListener(name, callback) { listeners.set(name, (listeners.get(name) || []).filter(fn => fn !== callback)); },
      emit(name, data = {}) { for (const callback of listeners.get(name) || []) callback.call(el, { target: el, preventDefault() {}, stopPropagation() {}, ...data }); },
      click() { if (!el.disabled) el.emit("click"); },
      appendChild(child) { child.parentNode = el; el.children.push(child); if (child.id) elements[child.id] = child; return child; },
      insertBefore(child) { return el.appendChild(child); },
      insertAdjacentElement(position, child) { if (child.id) elements[child.id] = child; },
      remove() { if (el.id) delete elements[el.id]; if (el.parentNode) el.parentNode.children = el.parentNode.children.filter(child => child !== el); },
      focus() { document.activeElement = el; el.focused = true; },
      blur() { document.activeElement = document.body; },
      scrollIntoView() { el.scrolled = true; },
      querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    };
    Object.defineProperty(el, "hidden", { get: () => attrs.has("hidden"), set: value => { if (value) attrs.set("hidden", ""); else attrs.delete("hidden"); } });
    if (id) elements[id] = el;
    return el;
  }
  const events = element();
  const radios = [element("onlineRadio", "razorpay"), element("codRadio", "cod")];
  radios[0].checked = options.method !== "cod";
  radios[1].checked = options.method === "cod";
  const totals = element("totals");
  const steps = Object.fromEntries(["cart", "shipping", "payment", "review"].map(key => {
    const el = element("step-" + key); el.setAttribute("data-step", key); return [key, el];
  }));
  document = {
    body: element("body"), documentElement: element("html"),
    getElementById: id => elements[id] || null,
    createElement: () => element(),
    addEventListener: events.addEventListener,
    querySelectorAll(selector) {
      if (selector === "#checkoutStepper .ck-step[data-step]") return Object.values(steps);
      if (selector.includes('input[name="checkoutPaymentMethod"]')) return radios;
      return [];
    },
    querySelector(selector) {
      if (selector.includes('input[name="checkoutPaymentMethod"]:checked')) return radios.find(radio => radio.checked);
      if (selector === ".checkout-totals") return totals;
      return null;
    },
  };
  document.activeElement = document.body;
  for (const id of [
    "checkoutMain", "checkoutForm", "checkoutStepFill", "checkoutCartSection", "ckSectionPayment", "checkoutStepper", "ckStepLinePayment", "ckStepLineReview",
    "checkoutPayModal", "checkoutPayModalBackdrop", "checkoutPayModalClose", "checkoutOpenUpiModal", "checkoutSummaryCtaText", "checkoutSummaryHint",
    "btnRazorpayCheckout", "btnCodCheckout", "checkoutPaymentCancelBtn", "checkoutPaymentCancelBtnCod", "checkoutAddressMsg",
    "checkoutPaymentStatus", "checkoutPaymentStatusLabel", "checkoutPaymentStatusMsg", "checkoutResultPopup", "checkoutResultTitle", "checkoutResultMsg",
    "checkoutResultRetry", "checkoutResultSupport", "checkoutResultOk", "checkoutResultBackdrop",
  ]) element(id);
  elements.checkoutStepper.querySelectorAll = () => Object.values(steps);
  elements.checkoutForm.checkValidity = () => options.valid !== false;
  elements.checkoutForm.reportValidity = () => { elements.checkoutForm.reported = true; };
  elements.checkoutMain.parentNode = document.body;
  elements.checkoutSummaryHint.parentNode = document.body;
  for (const id of ["checkoutPayModal", "checkoutResultPopup", "ckSectionPayment"]) elements[id].hidden = true;
  element("guestName", "First Customer");
  element("guestEmail", "first@example.test");
  element("guestPhone", "9876543210");
  element("zip", "302001");
  const windowEvents = element();
  const locks = new Set();
  const sdk = [];
  const requests = [];
  const lines = [{ id: "resin-test", size: "m", name: "Test", price: 3200, qty: 1 }];
  const values = new Map();
  const sessionStorage = {
    getItem(key) { if (options.storageBlocked) throw new Error("Storage blocked"); return values.get(key) || null; },
    setItem(key, value) { if (options.storageBlocked || options.storageWriteBlocked) throw new Error("Storage blocked"); values.set(key, value); },
    removeItem(key) { if (options.storageBlocked) throw new Error("Storage blocked"); values.delete(key); },
  };
  let nextOrder = 0;
  const fetch = async (url, init = {}) => {
    const route = new URL(url).pathname;
    requests.push({ route, body: init.body ? JSON.parse(init.body) : null });
    if (route === "/api/razorpay-status") return response({ configured: true });
    if (route === "/api/coupons/offers") return response({ ok: true, coupon: null, totals: { productValue: 3200 } });
    if (route === "/api/save-guest-address") return options.saveAddress ? options.saveAddress() : response({ ok: true });
    if (route === "/api/razorpay-order" || route === "/api/cod-advance-order") {
      const order = { ok: true, orderId: "order_" + ++nextOrder, keyId: "test", amount: 20000, currency: "INR" };
      return options.quote ? options.quote(order) : response(order);
    }
    if (route === "/api/checkout/payment-cancel") return options.cancel ? options.cancel() : response({ ok: true, canRetry: true });
    if (route.endsWith("-verify")) return options.verify ? options.verify() : response({ ok: true, orderCreated: true, orderId: 101 });
    return response({ ok: false });
  };
  const window = {
    addEventListener: windowEvents.addEventListener, dispatchEvent: event => windowEvents.emit(event.type, event),
    setTimeout, clearTimeout, matchMedia: () => ({ matches: options.coarse !== false }),
    location: { origin: "http://checkout.test", protocol: "http:", hostname: "checkout.test", port: "" },
    CraftguruApiBase: { get: () => "http://checkout.test" }, RESIN_DATA: {},
    CraftguruOverlayLock: { acquire: name => locks.add(name), release: name => locks.delete(name) },
    RESIN_CART: { load: () => lines, countItems: () => lines.length, subtotal: () => lines.reduce((sum, row) => sum + row.qty * row.price, 0), formatMoney: n => "₹" + n, clear: () => { lines.length = 0; } },
    Razorpay: function (config) {
      this.options = config; this.callbacks = {};
      this.on = (name, cb) => { this.callbacks[name] = cb; };
      this.open = () => { sdk.push(this); };
    },
  };
  const source = read("checkout.js").replace("  boot();\n})();", "  boot();\n  window.test = { readPaymentRecovery, preparePaymentAttempt };\n})();");
  vm.runInNewContext(source, { window, document, fetch, sessionStorage, localStorage: sessionStorage, setTimeout, navigator: { onLine: true } });
  return { window, document, elements, steps, locks, sdk, requests, totals, lines, events, windowEvents, options, api: window.test };
}

async function startPayment(page) {
  await tick();
  page.steps.payment.click();
  await tick();
  page.elements.checkoutOpenUpiModal.click();
  (page.options.method === "cod" ? page.elements.btnCodCheckout : page.elements.btnRazorpayCheckout).click();
  await tick();
  assert.equal(page.sdk.length, 1);
}

for (const coarse of [true, false]) for (const method of ["razorpay", "cod"]) {
  test(`${coarse ? "touch" : "desktop"} ${method}: cancellation unlocks navigation and retry clears old UI`, async () => {
    const page = checkout({ coarse, method });
    await startPayment(page);
    assert.equal(page.locks.has("payment"), true);
    page.sdk[0].options.modal.ondismiss();
    await tick();
    assert.equal(page.locks.size, 0);
    assert.equal(page.document.body.style.overflow, "");
    assert.equal(page.elements.checkoutPayModal.hidden, true);
    assert.equal(page.elements.checkoutResultTitle.textContent, "Payment cancelled");
    assert.equal(page.elements.checkoutResultRetry.hidden, false);
    page.elements.checkoutResultOk.click();
    page.steps.cart.click();
    assert.equal(page.steps.cart.getAttribute("aria-current"), "step");
    assert.equal(page.elements.checkoutCartSection.scrolled, true);
    page.steps.payment.click();
    page.elements.checkoutOpenUpiModal.click();
    assert.equal(page.elements.checkoutResultPopup.hidden, true);
    assert.equal(page.elements.checkoutPaymentStatusLabel.textContent, "Checkout");
    assert.equal(page.api.readPaymentRecovery(), null);
    assert.equal(page.elements.checkoutPaymentRecovery, undefined);
    (method === "cod" ? page.elements.btnCodCheckout : page.elements.btnRazorpayCheckout).click();
    await tick();
    assert.equal(page.sdk.length, 2);
    assert.equal(page.api.readPaymentRecovery().state, "opened");
    page.sdk[0].options.modal.ondismiss(); // old SDK callback cannot resurrect its notice
    await tick();
    assert.equal(page.elements.checkoutResultPopup.hidden, true);
    assert.equal(page.api.readPaymentRecovery().processorOrderId, "order_2");
  });
}

test("delayed cancellation does not cover a reopened sheet or steal step navigation", async () => {
  let resolveCancel;
  const page = checkout({ cancel: () => new Promise(resolve => { resolveCancel = resolve; }) });
  await startPayment(page);
  page.sdk[0].options.modal.ondismiss();
  await tick();
  assert.equal(page.locks.size, 0);
  page.steps.cart.click();
  page.steps.payment.click();
  page.elements.checkoutOpenUpiModal.click();
  resolveCancel(response({ ok: true, canRetry: true }));
  await tick();
  assert.equal(page.elements.checkoutPayModal.hidden, false);
  assert.equal(page.elements.checkoutResultPopup.hidden, true);
  assert.equal(page.elements.checkoutPaymentRecovery, undefined);
  assert.equal(page.locks.has("payment"), true);
  page.elements.checkoutPayModalClose.click();
  assert.equal(page.locks.size, 0);
});

test("uncertain or offline payment stays navigable and cannot start a duplicate charge", async () => {
  for (const cancel of [() => response({ ok: true, canRetry: false }), () => Promise.reject(new Error("Offline"))]) {
    const page = checkout({ cancel });
    await startPayment(page);
    page.sdk[0].options.modal.ondismiss();
    await tick();
    assert.equal(page.locks.size, 0);
    assert.equal(page.elements.checkoutResultRetry.hidden, true);
    assert.equal(page.api.readPaymentRecovery().processorOrderId, "order_1");
    page.elements.checkoutResultOk.click();
    page.elements.checkoutOpenUpiModal.click();
    page.elements.btnRazorpayCheckout.click();
    await tick();
    assert.equal(page.sdk.length, 1);
    assert.match(page.elements.checkoutAddressMsg.textContent, /confirmation/);
    page.steps.shipping.click();
    assert.equal(page.locks.size, 0);
    assert.equal(page.steps.shipping.getAttribute("aria-current"), "step");
    assert.equal(page.elements.ckSectionPayment.hidden, true);
  }
});

test("payment failure followed by dismissal is checked before showing a retry", async () => {
  const page = checkout();
  await startPayment(page);
  page.sdk[0].callbacks["payment.failed"]();
  assert.equal(page.elements.checkoutResultPopup.hidden, true); // gateway owns its failure screen
  page.sdk[0].options.modal.ondismiss();
  await tick();
  assert.equal(page.api.readPaymentRecovery().state, "cancelled");
  assert.equal(page.locks.size, 0);
});

test("guest can visit cart, address and review, with payment still requiring valid details", async () => {
  const page = checkout({ valid: false });
  await tick();
  page.elements.guestPhone.focus();
  page.steps.cart.click();
  assert.equal(page.document.activeElement, page.elements.checkoutCartSection);
  page.steps.review.click();
  assert.equal(page.totals.scrolled, true);
  assert.equal(page.steps.review.getAttribute("aria-current"), "step");
  page.steps.shipping.click();
  assert.equal(page.elements.checkoutStepFill.scrolled, true);
  page.steps.payment.click();
  await tick();
  assert.equal(page.elements.ckSectionPayment.hidden, true);
  assert.equal(page.elements.checkoutForm.reported, true);
  assert.equal(page.requests.some(req => req.route.endsWith("-order")), false);
});

test("an address save finishing after navigation does not move the buyer back to payment", async () => {
  let finishSave;
  const page = checkout({ saveAddress: () => new Promise(resolve => { finishSave = resolve; }) });
  await tick();
  page.steps.payment.click();
  page.steps.cart.click();
  finishSave(response({ ok: true }));
  await tick();
  assert.equal(page.steps.cart.getAttribute("aria-current"), "step");
  assert.equal(page.elements.ckSectionPayment.hidden, true);
  assert.equal(page.elements.checkoutOpenUpiModal.disabled, false);
});

test("cart changes or navigation during payment creation cannot open an outdated payment", async () => {
  for (const method of ["razorpay", "cod"]) for (const change of ["cart", "navigation", "reopen"]) {
    let finishQuote;
    const page = checkout({ method, quote: order => new Promise(resolve => { finishQuote = () => resolve(response(order)); }) });
    await tick();
    page.steps.payment.click();
    await tick();
    page.elements.checkoutOpenUpiModal.click();
    (method === "cod" ? page.elements.btnCodCheckout : page.elements.btnRazorpayCheckout).click();
    await tick();
    if (change === "cart") {
      page.lines[0].qty = 2;
      page.windowEvents.emit("resinCartChanged");
    } else {
      page.steps.cart.click();
      if (change === "reopen") { page.steps.payment.click(); page.elements.checkoutOpenUpiModal.click(); }
    }
    finishQuote();
    await tick();
    assert.equal(page.sdk.length, 0);
    assert.match(page.elements.checkoutAddressMsg.textContent, /Checkout changed/);
    assert.equal(page.requests.some(req => req.route.endsWith("payment-cancel")), true);
    assert.equal(page.elements.checkoutResultPopup.hidden, true);
  }
});

test("Safari page restoration closes stale overlays and keeps an unresolved payment reference", async () => {
  const page = checkout();
  await startPayment(page);
  page.windowEvents.emit("pagehide");
  assert.equal(page.locks.size, 0);
  page.windowEvents.emit("pageshow", { persisted: true });
  assert.equal(page.elements.checkoutPayModal.hidden, true);
  assert.equal(page.elements.checkoutResultPopup.hidden, true);
  assert.equal(page.api.readPaymentRecovery().processorOrderId, "order_1");
});

test("cancellation recovery also works when browser storage is blocked", async () => {
  for (const storageBlocked of [true, false]) {
    const page = checkout({ storageBlocked });
    await startPayment(page);
    // Also cover writes failing after the original reference was saved.
    page.options.storageWriteBlocked = true;
    page.sdk[0].options.modal.ondismiss();
    await tick();
    assert.equal(page.locks.size, 0);
    assert.equal(page.api.readPaymentRecovery().state, "cancelled");
    page.elements.checkoutResultRetry.click();
    assert.equal(page.api.readPaymentRecovery(), null);
    assert.equal(page.elements.checkoutPayModal.hidden, false);
  }
});

test("successful online and COD payments still clear cart and open the saved order", async () => {
  for (const method of ["razorpay", "cod"]) {
    const page = checkout({ method });
    await startPayment(page);
    page.sdk[0].options.handler({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "test" });
    page.sdk[0].options.modal.ondismiss();
    await tick();
    assert.match(page.window.location.href, method === "cod" ? /account.html\?cod=1&orderId=101/ : /account.html\?paid=1&orderId=101/);
    assert.equal(page.lines.length, 0);
    assert.equal(page.api.readPaymentRecovery(), null);
    assert.equal(page.locks.size, 0);
    assert.equal(page.requests.some(req => req.route.endsWith("payment-cancel")), false);
  }
});

test("checkout labels and hidden overlays have scoped layout safeguards", () => {
  const html = read("checkout.html");
  const css = read("checkout.css");
  for (const key of ["cart", "shipping", "payment", "review"]) assert.match(html, new RegExp('<button type="button" class="ck-step[^"\\n]*" data-step="' + key + '"'));
  assert.match(css, /body\.page-checkout \.checkout-addr-type__opt span\s*\{[^}]*white-space: nowrap/);
  assert.match(css, /body\.page-checkout \.checkout-addr-type__opt input\[type="radio"\]\s*\{[^}]*flex: 0 0/);
  assert.match(css, /#checkoutResultSupport\[hidden\]\s*\{\s*display: none/);
  assert.match(css, /max-height: calc\(100dvh/);
});
