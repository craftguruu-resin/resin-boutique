"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "craftguru-meta-pixel.js"), "utf8");
const consentKey = "cg_advertising_consent_v1";
const purchaseKey = "cg_meta_pending_purchase_v1_1081621974465294";
function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
function browser({ accepted = false, hostname = "craftguruindia.com", pathname = "/product.html", local = storage(), session = storage(), storageUnavailable = false, queuedSdk = false } = {}) {
  if (accepted) local.setItem(consentKey, JSON.stringify("accepted"));
  const nodes = new Map(), scripts = [], listeners = {}, calls = [];
  function node(tag) {
    return { tag, setAttribute() {}, addEventListener(name, fn) { this[name] = fn; }, remove() { nodes.delete(this.id); } };
  }
  const document = {
    createElement: node, getElementById: id => nodes.get(id),
    head: { appendChild: n => scripts.push(n) }, body: { appendChild: n => nodes.set(n.id, n) },
  };
  const window = {
    document, location: { hostname, pathname }, localStorage: local, sessionStorage: session,
    fbq: (...args) => calls.push(args),
    addEventListener: (name, fn) => { listeners[name] = fn; },
  };
  if (storageUnavailable) {
    for (const key of ["localStorage", "sessionStorage"]) Object.defineProperty(window, key, { get() { throw new Error("Storage disabled"); } });
  }
  if (queuedSdk) delete window.fbq;
  vm.runInNewContext(source, { window, document, Date });
  return { window, calls, scripts, local, session, listeners, api: window.CraftguruMetaPixel,
    choose(accepted) {
      const banner = nodes.get("cgAdvertisingChoice");
      assert.ok(banner);
      banner.click({ target: { closest: () => ({ getAttribute: () => accepted ? "yes" : "no" }) } });
    },
    events(name) { return calls.filter(call => call[0] === "trackSingle" && call[2] === name); },
  };
}
const lines = [{ productId: "resin-clock-1", qty: 2, unitPrice: 500, lineExtra: { customText: "Private inscription" } }];
const order = { ok: true, orderCreated: true, orderId: "123", totals: { total: 810 }, email: "private@example.com", phone: "9999999999" };

test("no Meta SDK or events before consent; accept sends the current product and checkout once", () => {
  const b = browser();
  b.api.viewProduct({ id: "resin-clock-1", name: "Private name" });
  b.api.initiateCheckout(lines);
  assert.equal(b.calls.length, 0); assert.equal(b.scripts.length, 0);
  b.choose(true);
  assert.equal(b.scripts.length, 1); assert.equal(b.events("PageView").length, 1);
  assert.equal(b.events("ViewContent").length, 1); assert.equal(b.events("InitiateCheckout").length, 1);
  b.api.viewProduct({ id: "resin-clock-1" }); b.api.initiateCheckout(lines);
  assert.equal(b.events("ViewContent").length, 1); assert.equal(b.events("InitiateCheckout").length, 1);
  assert.equal(b.events("InitiateCheckout")[0][3].value, 1000);
  assert.ok(!JSON.stringify(b.calls).includes("Private"));
});
test("decline suppresses tracking; preference changes and cross-tab withdrawal revoke consent", () => {
  const b = browser(); b.choose(false);
  b.api.viewProduct({ id: "a" }); assert.equal(b.calls.length, 0);
  b.api.showPreferences(); b.choose(true); assert.equal(b.events("ViewContent").length, 1);
  b.local.setItem(consentKey, JSON.stringify("declined")); b.listeners.storage({ key: consentKey });
  const before = b.calls.length;
  b.listeners.craftguruCartItemAdded({ detail: { id: "b", qty: 1, price: 50 } });
  b.api.recordPurchase(order, lines, true);
  assert.equal(b.calls.length, before); assert.equal(b.session.getItem(purchaseKey), null);
  assert.deepEqual(b.calls.at(-1), ["consent", "revoke"]);
});
test("only confirmed live orders are recorded, using the server total without personal data", () => {
  const b = browser({ accepted: true, pathname: "/checkout.html" });
  b.api.recordPurchase(order, lines, false); assert.equal(b.session.getItem(purchaseKey), null);
  b.api.recordPurchase({ ...order, orderCreated: false }, lines, true); assert.equal(b.session.getItem(purchaseKey), null);
  b.api.recordPurchase({ ...order, ok: false }, lines, true); assert.equal(b.session.getItem(purchaseKey), null);
  b.api.recordPurchase({ ...order, totals: {} }, lines, true); assert.equal(b.session.getItem(purchaseKey), null);
  b.api.recordPurchase({ ...order, totals: { total: null } }, lines, true); assert.equal(b.session.getItem(purchaseKey), null);
  b.api.recordPurchase(order, lines, true);
  const pending = JSON.parse(b.session.getItem(purchaseKey));
  assert.equal(pending.params.value, 810); assert.equal(pending.params.currency, "INR");
  assert.ok(!JSON.stringify(pending).includes("Private")); assert.ok(!JSON.stringify(pending).includes("private@example"));
  assert.equal(b.events("Purchase").length, 0);
  const account = browser({ pathname: "/account.html", local: b.local, session: b.session });
  account.scripts[0].onload();
  assert.equal(account.events("Purchase").length, 1);
  assert.equal(account.events("Purchase")[0][4].eventID, "cg-order-123");
  account.scripts[0].onload(); assert.equal(account.events("Purchase").length, 1);
  // Replayed successful verification for the same order must not double count.
  account.api.recordPurchase(order, lines, true); account.scripts[0].onload();
  assert.equal(account.events("Purchase").length, 1);
});
test("COD confirmation reports full server order value, not just the advance", () => {
  const b = browser({ accepted: true, pathname: "/checkout.html" });
  b.api.recordPurchase({ ...order, paymentStatus: "cod_advance_paid", codAdvancePaid: 200, totals: { total: 900 } }, lines, true);
  assert.equal(JSON.parse(b.session.getItem(purchaseKey)).params.value, 900);
});
test("local previews and other hosts never load the SDK or record orders", () => {
  const b = browser({ hostname: "localhost", accepted: true });
  b.api.viewProduct({ id: "a" }); b.api.recordPurchase(order, lines, true);
  assert.equal(b.calls.length, 0); assert.equal(b.scripts.length, 0); assert.equal(b.session.getItem(purchaseKey), null);
});
test("blocked storage does not break consent or customer actions", () => {
  const b = browser({ storageUnavailable: true });
  b.api.viewProduct({ id: "a" }); assert.equal(b.calls.length, 0);
  b.choose(true); assert.equal(b.events("PageView").length, 1);
  assert.equal(b.events("ViewContent").length, 1);
  assert.doesNotThrow(() => b.api.recordPurchase(order, lines, true));
  b.api.showPreferences(); b.choose(false);
  const before = b.calls.length;
  b.api.viewProduct({ id: "b" }); assert.equal(b.calls.length, before);
});
test("clearing advertising preferences in another tab stops tracking", () => {
  const b = browser({ accepted: true });
  b.local.removeItem(consentKey); b.listeners.storage({ key: null });
  const before = b.calls.length;
  b.api.viewProduct({ id: "a" }); assert.equal(b.calls.length, before);
  assert.deepEqual(b.calls.at(-1), ["consent", "revoke"]);
});
test("first visit creates the real SDK queue only after consent and initializes the correct pixel", () => {
  const b = browser({ queuedSdk: true });
  assert.equal(b.window.fbq, undefined); b.choose(true);
  const queued = b.window.fbq.queue.map(args => Array.from(args));
  assert.ok(queued.some(args => args[0] === "init" && args[1] === "1081621974465294"));
  assert.ok(queued.some(args => args[0] === "set" && args[1] === "autoConfig" && args[2] === false));
  assert.equal(queued.filter(args => args[0] === "trackSingle" && args[2] === "PageView").length, 1);
  assert.equal(b.scripts[0].src, "https://connect.facebook.net/en_US/fbevents.js");
});
test("every event uses the new dataset and pending purchases from the previous integration are ignored", () => {
  const session = storage();
  session.setItem("cg_meta_pending_purchase_v1", JSON.stringify({ id: "old-order", createdAt: Date.now(), params: { value: 999, currency: "INR" } }));
  const b = browser({ accepted: true, pathname: "/account.html", session });
  b.scripts[0].onload(); assert.equal(b.events("Purchase").length, 0);
  b.api.viewProduct({ id: "a" }); b.api.initiateCheckout(lines);
  b.listeners.craftguruCartItemAdded({ detail: { id: "a", qty: 1, price: 100 } });
  b.api.recordPurchase(order, lines, true); b.scripts[0].onload();
  assert.equal(b.events("Purchase").length, 1);
  const events = b.calls.filter(call => call[0] === "trackSingle");
  assert.equal(events.length, 5);
  assert.ok(events.every(call => call[1] === "1081621974465294"));
  assert.equal(b.api.pixelId, "1081621974465294");
});
test("cart events report actual accepted quantity and do not count sold-out additions or cart hydration", () => {
  const b = browser({ accepted: true });
  const cartSource = fs.readFileSync(path.join(root, "cart.js"), "utf8");
  b.window.dispatchEvent = event => b.listeners[event.type] && b.listeners[event.type](event);
  vm.runInNewContext(cartSource, { window: b.window, setTimeout() {}, CustomEvent: function (type, opts) { this.type = type; this.detail = opts && opts.detail; } });
  const cart = b.window.RESIN_CART;
  const item = { id: "a", size: "s", price: 100, qty: 2, stockMax: 3 };
  cart.addItem(item); cart.addItem(item); cart.addItem(item);
  assert.equal(b.events("AddToCart").length, 2);
  assert.deepEqual(b.events("AddToCart").map(call => call[3].value), [200, 100]);
  cart.addItem({ ...item, id: "soldout", stockMax: 0 });
  cart.onAccountLogin(); cart.clear();
  assert.equal(b.events("AddToCart").length, 2);
});
test("all customer pages load the pixel before product/cart/checkout scripts, vendor pages do not", () => {
  const pages = fs.readdirSync(root).filter(file => file.endsWith(".html"));
  let count = 0;
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    if (!html.includes("guest-layout.js")) { assert.ok(!html.includes("craftguru-meta-pixel.js"), page); continue; }
    count++;
    assert.equal(html.split("craftguru-meta-pixel.js").length - 1, 1, page);
    assert.ok(html.includes("craftguru-meta-pixel.css"), page);
    for (const script of ["product.js", "raw-material-product.js", "photo-frame-product.js", "checkout.js"]) {
      if (html.includes('src="' + script)) assert.ok(html.indexOf("craftguru-meta-pixel.js") < html.indexOf('src="' + script), page);
    }
  }
  assert.ok(count >= 25, "Existing and new customer pages retain consent-based tracking");
});
