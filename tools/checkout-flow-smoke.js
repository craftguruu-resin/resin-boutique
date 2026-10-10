"use strict";

/* Run the actual checkout event handlers offline. No payments or store data change. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = file => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const response = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });

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
  const signedIn = !!(options.profile || options.me);
  if (signedIn) {
    for (const id of ["checkoutGuestSessionBar", "checkoutGuestSessionText", "checkoutAuthOptional", "checkoutSignInLink", "checkoutWelcomeOffer", "checkoutCouponOffers", "checkoutCouponMessage", "checkoutCouponCode", "checkoutCouponApply", "checkoutCouponRemove", "valCouponDiscount", "valCouponLabel"]) element(id);
    elements.checkoutWelcomeOffer.hidden = true;
  }
  element("guestName", signedIn ? "" : "First Customer");
  element("guestEmail", signedIn ? "" : "first@example.test");
  element("guestPhone", signedIn ? "" : "9876543210");
  element("zip", "302001");
  const windowEvents = element();
  const locks = new Set();
  const sdk = [];
  const requests = [];
  const lines = [{ id: "resin-test", size: "m", name: "Test", price: 3200, qty: 1 }];
  const values = new Map();
  if (signedIn) values.set("craftguruGuestToken", "signed-in-token");
  if (options.savedCoupon) values.set("cg_checkout_coupon_code", options.savedCoupon);
  const sessionStorage = {
    getItem(key) { if (options.storageBlocked) throw new Error("Storage blocked"); return values.get(key) || null; },
    setItem(key, value) { if (options.storageBlocked || options.storageWriteBlocked) throw new Error("Storage blocked"); values.set(key, value); },
    removeItem(key) { if (options.storageBlocked) throw new Error("Storage blocked"); values.delete(key); },
  };
  let nextOrder = 0;
  const fetch = async (url, init = {}) => {
    const route = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ route, body, headers: init.headers });
    if (route === "/api/guest/me") return options.me ? options.me(init) : response(options.profile);
    if (route === "/api/razorpay-status") return response({ configured: true });
    if (route === "/api/coupons/offers" || route === "/api/coupons/validate") return options.offers ? options.offers(body) : response({ ok: true, coupon: null, totals: { productValue: 3200 } });
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
  const nameUpdates = [];
  if (signedIn) window.CRAFT_AUTH_DB = {
    getSessionName: () => values.get("cg_session_name") || "",
    setSessionName(value) {
      nameUpdates.push(value);
      assert.ok(nameUpdates.length < 8, "session-name updates must not cause an auth refresh loop");
      values.set("cg_session_name", value);
      window.dispatchEvent({ type: "craftguruAuthChanged" });
    },
  };
  const source = read("checkout.js").replace("  boot();\n})();", "  boot();\n  window.test = { readPaymentRecovery, preparePaymentAttempt, refreshGuestCheckoutUi, requestCouponQuote, refreshCustomerCoupons, removeCoupon };\n})();");
  vm.runInNewContext(source, { window, document, fetch, sessionStorage, localStorage: sessionStorage, setTimeout, navigator: { onLine: true } });
  return { window, document, elements, steps, locks, sdk, requests, totals, lines, events, windowEvents, options, values, nameUpdates, api: window.test };
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

const signedProfile = { ok: true, email: "first@example.test", phoneNorm: "+91 98765 43210", displayName: "First Customer", addresses: [] };
function welcomePreview(body, returning = false) {
  const complete = !!body.guest.email && /^[6-9]\d{9}$/.test(body.guest.phone);
  const codes = complete && !returning ? ["WELCOME100"] : [];
  const flatAmount = { FLAT150: 150, FLAT200: 200, FLAT300: 300 }[body.code] || 0;
  if (flatAmount) codes.push(body.code);
  const discount = (complete && !returning ? 100 : 0) + flatAmount;
  return response({
    ok: true, productValue: 3200,
    coupon: codes.length ? { code: codes.join("+"), discountType: "flat", discountValue: discount, discount } : null,
    welcome: { firstOrder: returning ? false : complete ? true : null, identityComplete: complete, eligible: complete && !returning },
  });
}

test("signed-in first buyer loads both account contacts and auto-applies welcome without an auth loop", async () => {
  for (const coarse of [true, false]) {
    const page = checkout({ profile: signedProfile, coarse, offers: welcomePreview });
    assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
    await tick();
    await tick();
    assert.equal(page.elements.guestEmail.value, signedProfile.email);
    assert.equal(page.elements.guestPhone.value, "9876543210");
    assert.equal(page.elements.guestEmail.readOnly, true);
    assert.equal(page.elements.guestPhone.readOnly, true);
    assert.equal(page.elements.checkoutAuthOptional.hidden, true);
    assert.equal(page.elements.checkoutSignInLink.hidden, true);
    assert.equal(page.elements.checkoutWelcomeOffer.hidden, false);
    assert.match(page.elements.checkoutWelcomeOffer.innerHTML, /Automatically applied/);
    assert.doesNotMatch(page.elements.checkoutWelcomeOffer.innerHTML, /Enter your email|check your first-order gift/);
    assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
    assert.equal(page.nameUpdates.length, 1);
    assert.equal(page.requests.filter(request => request.route === "/api/guest/me").length, 1);
    assert.equal(page.requests.filter(request => request.route === "/api/coupons/offers").length, 1);
    const quote = page.requests.filter(request => request.route === "/api/coupons/offers").at(-1);
    assert.equal(quote.body.guest.email, signedProfile.email);
    assert.equal(quote.body.guest.phone, "9876543210");
    assert.equal(quote.headers.Authorization, "Bearer signed-in-token");
  }
});

test("signed-in returning buyer sees flat offers without any welcome block or welcome message", async () => {
  const page = checkout({ profile: signedProfile, offers: body => welcomePreview(body, true) });
  await tick();
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  assert.equal(page.elements.checkoutWelcomeOffer.innerHTML, "");
  assert.doesNotMatch(page.elements.checkoutCouponMessage.textContent, /WELCOME100|first-order gift/);
  assert.match(page.elements.checkoutCouponOffers.innerHTML, /FLAT150.*FLAT200.*FLAT300/);
  assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
});

test("saved-page restoration rechecks a completed purchase with the same account and cart", async () => {
  let purchased = false;
  const page = checkout({ profile: signedProfile, offers: body => welcomePreview(body, purchased) });
  await tick();
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, false);
  const before = page.requests.filter(request => request.route === "/api/coupons/offers").length;
  purchased = true;
  page.windowEvents.emit("pageshow", { persisted: true });
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  await tick();
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  assert.equal(page.elements.checkoutWelcomeOffer.innerHTML, "");
  assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
  assert.ok(page.requests.filter(request => request.route === "/api/coupons/offers").length > before);
});

test("late profile responses from an old login cannot replace the current account or reveal welcome", async () => {
  const oldResponses = [];
  const returningProfile = { ...signedProfile, email: "returning@example.test", phoneNorm: "9988776655", displayName: "Returning Customer" };
  const page = checkout({
    me: init => init.headers.Authorization === "Bearer signed-in-token" ? new Promise(resolve => oldResponses.push(resolve)) : response(returningProfile),
    offers: body => welcomePreview(body, body.guest.email === returningProfile.email),
  });
  await tick();
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  page.values.set("craftguruGuestToken", "new-account-token");
  page.windowEvents.emit("craftguruAuthChanged");
  await tick();
  for (const resolve of oldResponses) resolve(response(signedProfile));
  await tick();
  assert.equal(page.elements.guestEmail.value, returningProfile.email);
  assert.equal(page.elements.guestPhone.value, returningProfile.phoneNorm);
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
});

test("email-only accounts remain signed in and welcome applies when checkout receives a real mobile", async () => {
  const page = checkout({ profile: { ...signedProfile, phoneNorm: "h_email_only" }, offers: welcomePreview });
  await tick();
  assert.equal(page.elements.checkoutAuthOptional.hidden, true);
  assert.equal(page.elements.guestEmail.readOnly, true);
  assert.equal(page.elements.guestPhone.readOnly, false);
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  page.elements.guestPhone.value = "9876543210";
  page.elements.guestPhone.emit("input");
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, false);
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
});

test("switching to an account without a saved mobile clears the previous account's mobile", async () => {
  const options = { profile: signedProfile, offers: welcomePreview };
  const page = checkout(options);
  await tick();
  assert.equal(page.elements.guestPhone.value, "9876543210");
  options.profile = { ...signedProfile, email: "other@example.test", displayName: "Other Customer", phoneNorm: "h_email_only" };
  page.values.set("craftguruGuestToken", "other-account-token");
  page.windowEvents.emit("craftguruAuthChanged");
  await tick();
  assert.equal(page.elements.guestEmail.value, "other@example.test");
  assert.equal(page.elements.guestPhone.value, "");
  assert.equal(page.elements.guestPhone.readOnly, false);
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
});

const offerRequests = page => page.requests.filter(request => request.route.startsWith("/api/coupons/"));
function repeatCheckoutEvents(page, count = 30) {
  for (let i = 0; i < count; i++) {
    for (const event of ["craftguruAuthChanged", "resinCartChanged", "craftguruCatalogCategoriesMerged", "craftguruCatalogVendorProductsMerged", "craftguruCatalogPricesMerged"]) page.windowEvents.emit(event);
    page.elements.guestEmail.emit("input");
    page.elements.guestEmail.emit("change");
    page.elements.guestPhone.emit("input");
    page.elements.guestPhone.emit("change");
    page.windowEvents.emit("pageshow", { persisted: false });
  }
}

test("email-only checkout makes one offer request despite repeated auth, contact and catalog events", async () => {
  const page = checkout({ profile: { ...signedProfile, phoneNorm: "h_email_only" }, offers: welcomePreview });
  await tick();
  assert.equal(offerRequests(page).length, 1);
  assert.equal(offerRequests(page)[0].body.guest.phone, "");
  repeatCheckoutEvents(page);
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(offerRequests(page).length, 1);
  assert.equal(page.requests.filter(request => request.route === "/api/guest/me").length, 1);
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
});

test("initial offers wait for one shared account lookup and include the restored flat code", async () => {
  let resolveProfile;
  const page = checkout({ me: () => new Promise(resolve => { resolveProfile = resolve; }), savedCoupon: "FLAT300", offers: welcomePreview });
  repeatCheckoutEvents(page);
  assert.equal(page.requests.filter(request => request.route === "/api/guest/me").length, 1);
  assert.equal(offerRequests(page).length, 0);
  resolveProfile(response(signedProfile));
  await tick();
  assert.equal(offerRequests(page).length, 1);
  assert.equal(offerRequests(page)[0].body.code, "FLAT300");
  assert.equal(offerRequests(page)[0].body.guest.email, signedProfile.email);
  assert.equal(offerRequests(page)[0].body.guest.phone, "9876543210");
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹400");
});

test("identical in-flight checks share one request and completed checks reuse the result", async () => {
  let resolveOffer;
  let payload;
  const page = checkout({ profile: signedProfile, offers: body => { payload = body; return new Promise(resolve => { resolveOffer = resolve; }); } });
  await tick();
  const pending = Array.from({ length: 30 }, () => page.api.requestCouponQuote("", true));
  repeatCheckoutEvents(page);
  assert.equal(offerRequests(page).length, 1);
  resolveOffer(welcomePreview(payload));
  await Promise.all(pending);
  await tick();
  for (let i = 0; i < 30; i++) {
    await page.api.requestCouponQuote("", true);
    await page.api.removeCoupon(); // an automatic gift cannot be removed
  }
  assert.equal(offerRequests(page).length, 1);
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, false);
});

test("coupon changes request once and repeated Apply clicks reuse the selected coupon", async () => {
  const page = checkout({ profile: signedProfile, offers: welcomePreview });
  await tick();
  for (const [code, amount] of [["FLAT150", 250], ["FLAT300", 400]]) {
    const before = offerRequests(page).length;
    page.elements.checkoutCouponCode.value = code;
    page.elements.checkoutCouponApply.click();
    await tick();
    for (let i = 0; i < 30; i++) page.elements.checkoutCouponApply.click();
    await tick();
    assert.equal(offerRequests(page).length, before + 1);
    assert.equal(page.elements.valCouponDiscount.textContent, "− ₹" + amount);
  }
  await page.api.removeCoupon();
  assert.equal(offerRequests(page).length, 4);
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
});

test("a real cart change requests once and late old responses cannot restore its old coupon", async () => {
  const pending = [];
  const page = checkout({ profile: signedProfile, offers: body => new Promise(resolve => pending.push({ body, resolve })) });
  await tick();
  page.lines[0].qty = 2;
  page.windowEvents.emit("resinCartChanged");
  repeatCheckoutEvents(page);
  assert.equal(offerRequests(page).length, 2);
  assert.equal(pending[1].body.items[0].qty, 2);
  pending[1].resolve(welcomePreview(pending[1].body, true));
  await tick();
  pending[0].resolve(welcomePreview(pending[0].body));
  await tick();
  assert.equal(offerRequests(page).length, 2);
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
});

test("429 and server failures never fall back or retry on unrelated checkout events", async () => {
  for (const status of [429, 503]) {
    const page = checkout({ profile: signedProfile, savedCoupon: "FLAT300", offers: () => response({ ok: false, error: "Offers temporarily unavailable" }, status) });
    await tick();
    repeatCheckoutEvents(page);
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(offerRequests(page).length, 1);
    assert.equal(page.elements.checkoutCouponApply.disabled, false);
    assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
    assert.match(page.elements.checkoutCouponMessage.textContent, /temporarily unavailable/);
  }
});

test("saving an address refreshes addresses without requesting unchanged coupon offers", async () => {
  const page = checkout({ profile: signedProfile, offers: welcomePreview });
  await tick();
  page.steps.payment.click();
  await tick();
  assert.equal(page.requests.filter(request => request.route === "/api/guest/me").length, 2);
  assert.equal(offerRequests(page).length, 1);
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
  assert.equal(page.elements.ckSectionPayment.hidden, false);
});

test("contact edits debounce to one check and repeated input/change events do not restart it", async () => {
  const page = checkout({ profile: { ...signedProfile, phoneNorm: "h_email_only" }, offers: welcomePreview });
  await tick();
  for (const phone of ["9", "98", "987", "9876", "98765", "987654", "9876543", "98765432", "987654321"]) {
    page.elements.guestPhone.value = phone;
    page.elements.guestPhone.emit("input");
    page.elements.guestPhone.emit("change");
  }
  assert.equal(offerRequests(page).length, 1);
  page.elements.guestPhone.value = "9876543210";
  for (let i = 0; i < 30; i++) {
    page.elements.guestPhone.emit("input");
    page.elements.guestPhone.emit("change");
  }
  await new Promise(resolve => setTimeout(resolve, 400));
  repeatCheckoutEvents(page);
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(offerRequests(page).length, 2);
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
});

test("offline offer failures wait for reconnect and repeated online events share one retry", async () => {
  let online = false;
  let resolveRetry;
  let payload;
  const page = checkout({ profile: signedProfile, offers: body => {
    if (!online) return Promise.reject(new TypeError("Offline"));
    payload = body;
    return new Promise(resolve => { resolveRetry = resolve; });
  } });
  await tick();
  repeatCheckoutEvents(page);
  assert.equal(offerRequests(page).length, 1);
  online = true;
  for (let i = 0; i < 30; i++) page.windowEvents.emit("online");
  assert.equal(offerRequests(page).length, 2);
  resolveRetry(welcomePreview(payload));
  await tick();
  for (let i = 0; i < 30; i++) page.windowEvents.emit("online");
  assert.equal(offerRequests(page).length, 2);
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
});

test("an invalid manual coupon reuses the checked automatic gift instead of another offers call", async () => {
  const page = checkout({ profile: signedProfile, offers: body => body.code === "INVALID" ? response({ ok: false, error: "This coupon is not available." }, 400) : welcomePreview(body) });
  await tick();
  page.elements.checkoutCouponCode.value = "INVALID";
  page.elements.checkoutCouponApply.click();
  await tick();
  assert.equal(offerRequests(page).length, 2);
  assert.equal(page.requests.filter(request => request.route === "/api/coupons/offers").length, 1);
  assert.equal(page.elements.valCouponDiscount.textContent, "− ₹100");
  assert.match(page.elements.checkoutCouponMessage.textContent, /not available/);
});

test("restoring a changed cart checks fresh purchase history once and clears the previous flat", async () => {
  let purchased = false;
  const page = checkout({ profile: signedProfile, savedCoupon: "FLAT300", offers: body => welcomePreview(body, purchased) });
  await tick();
  purchased = true;
  page.lines[0].qty = 2;
  page.windowEvents.emit("pageshow", { persisted: true });
  await tick();
  repeatCheckoutEvents(page);
  assert.equal(offerRequests(page).length, 2);
  assert.equal(offerRequests(page)[1].body.code, "");
  assert.equal(offerRequests(page)[1].body.items[0].qty, 2);
  assert.equal(page.elements.checkoutCouponCode.value, "");
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
});

test("page restoration replaces an old pending offer with one fresh history check", async () => {
  const pending = [];
  const page = checkout({ profile: signedProfile, offers: body => new Promise(resolve => pending.push({ body, resolve })) });
  await tick();
  assert.equal(offerRequests(page).length, 1);
  page.windowEvents.emit("pageshow", { persisted: true });
  await tick();
  repeatCheckoutEvents(page);
  assert.equal(offerRequests(page).length, 2);
  pending[1].resolve(welcomePreview(pending[1].body, true));
  await tick();
  pending[0].resolve(welcomePreview(pending[0].body));
  await tick();
  assert.equal(offerRequests(page).length, 2);
  assert.equal(page.elements.checkoutWelcomeOffer.hidden, true);
  assert.equal(page.elements.valCouponDiscount.textContent, "₹0");
});

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
