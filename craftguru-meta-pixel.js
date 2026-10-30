/* Explicit customer advertising events, enabled only after visitor consent. */
(function (w, d) {
  "use strict";
  if (w.CraftguruMetaPixel) return;
  var PIXEL_ID = "1081621974465294";
  var CONSENT_KEY = "cg_advertising_consent_v1";
  // Keep pending orders and deduplication specific to this dataset when IDs change.
  var PURCHASE_KEY = "cg_meta_pending_purchase_v1_" + PIXEL_ID;
  var SENT_KEY = "cg_meta_sent_orders_v1_" + PIXEL_ID;
  var allowedHost = /^(www\.)?(craftguruindia\.com|craftguru\.co\.in)$/.test(w.location.hostname);
  var active = false, sdkReady = false, product = null, checkout = null, checkoutSent = false;
  var viewed = Object.create(null);
  // Safari/private browsing can throw even when accessing a storage property.
  // Keep this page's choice in memory so shopping and consent still work.
  var local = null, session = null;
  try { local = w.localStorage; } catch (_) {}
  try { session = w.sessionStorage; } catch (_) {}
  function read(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key)) || fallback; } catch (_) { return fallback; }
  }
  function write(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  var choice = read(local, CONSENT_KEY, "");
  function consent() { return choice === "accepted"; }
  function amount(value) {
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  }
  function itemParams(lines) {
    var contents = (lines || []).filter(function (line) { return line && (line.productId || line.id); }).map(function (line) {
      return { id: String(line.productId || line.id), quantity: Math.max(1, Math.floor(Number(line.qty) || 1)), item_price: amount(line.unitPrice != null ? line.unitPrice : line.price) };
    });
    return {
      currency: "INR", content_type: "product", contents: contents,
      content_ids: contents.map(function (line) { return line.id; }),
      num_items: contents.reduce(function (sum, line) { return sum + line.quantity; }, 0),
      value: amount(contents.reduce(function (sum, line) { return sum + line.quantity * line.item_price; }, 0)),
    };
  }
  function track(name, params, options) {
    if (!active || !consent() || typeof w.fbq !== "function") return false;
    try { w.fbq("trackSingle", PIXEL_ID, name, params || {}, options || {}); return true; } catch (_) { return false; }
  }
  function trackCurrent() {
    if (product && !viewed[product.id] && track("ViewContent", { content_ids: [product.id], content_type: "product", currency: "INR" })) viewed[product.id] = true;
    if (checkout && !checkoutSent && track("InitiateCheckout", checkout)) checkoutSent = true;
  }
  function sendPendingPurchase() {
    // Checkout redirects immediately. Send on My orders once the SDK loads.
    if (!sdkReady || !/\/account\.html$/.test(w.location.pathname) || !consent()) return;
    var pending = read(session, PURCHASE_KEY, null);
    if (!pending) return;
    var sent = read(local, SENT_KEY, []);
    if (!Array.isArray(sent)) sent = [];
    if (!pending.createdAt || Date.now() - pending.createdAt > 86400000 || sent.indexOf(pending.id) !== -1) {
      try { session.removeItem(PURCHASE_KEY); } catch (_) {}
      return;
    }
    if (track("Purchase", pending.params, { eventID: "cg-order-" + pending.id })) {
      write(local, SENT_KEY, sent.concat(pending.id).slice(-100));
      try { session.removeItem(PURCHASE_KEY); } catch (_) {}
    }
  }
  function start() {
    if (!allowedHost || !consent() || active) return;
    active = true;
    if (!w.fbq) {
      var queue = w.fbq = function () { queue.callMethod ? queue.callMethod.apply(queue, arguments) : queue.queue.push(arguments); };
      if (!w._fbq) w._fbq = queue;
      queue.push = queue; queue.loaded = true; queue.version = "2.0"; queue.queue = [];
    }
    w.fbq("consent", "grant");
    // Disable automatic collection of form fields and customisation details.
    w.fbq("set", "autoConfig", false, PIXEL_ID);
    w.fbq("init", PIXEL_ID);
    track("PageView"); trackCurrent();
    var script = d.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.onload = function () { sdkReady = true; sendPendingPurchase(); };
    d.head.appendChild(script);
  }
  function closeBanner() {
    var banner = d.getElementById("cgAdvertisingChoice");
    if (banner) banner.remove();
  }
  function setConsent(accepted) {
    choice = accepted ? "accepted" : "declined";
    write(local, CONSENT_KEY, choice); closeBanner();
    if (accepted) {
      if (active && w.fbq) w.fbq("consent", "grant");
      start(); trackCurrent(); sendPendingPurchase();
    } else {
      if (active && w.fbq) w.fbq("consent", "revoke");
      try { session.removeItem(PURCHASE_KEY); } catch (_) {}
    }
  }
  function showChoice() {
    if (!allowedHost || d.getElementById("cgAdvertisingChoice")) return;
    var banner = d.createElement("section");
    banner.id = "cgAdvertisingChoice";
    banner.setAttribute("aria-label", "Advertising cookie preferences");
    banner.innerHTML = '<p>May we use advertising cookies to measure our ads and personalise ads on Facebook and Instagram? <a href="policies.html#privacy">Privacy policy</a></p><div><button type="button" data-choice="no">Decline</button><button type="button" data-choice="yes">Accept</button></div>';
    banner.addEventListener("click", function (event) {
      var button = event.target.closest && event.target.closest("[data-choice]");
      if (button) setConsent(button.getAttribute("data-choice") === "yes");
    });
    d.body.appendChild(banner);
  }
  w.CraftguruMetaPixel = {
    pixelId: PIXEL_ID, showPreferences: showChoice,
    viewProduct: function (p) {
      if (!p || !p.id) return;
      product = { id: String(p.id) }; trackCurrent();
    },
    initiateCheckout: function (lines) {
      if (!lines || !lines.length) return;
      checkout = itemParams(lines); trackCurrent();
    },
    recordPurchase: function (order, lines, livePayment) {
      if (!allowedHost || !consent() || !livePayment || !order || !order.ok || !order.orderCreated || !order.orderId || !order.totals) return;
      if (order.totals.total == null || order.totals.total === "") return;
      var total = Number(order.totals.total);
      if (!Number.isFinite(total) || total < 0) return;
      var params = itemParams(lines);
      params.value = amount(total);
      write(session, PURCHASE_KEY, { id: String(order.orderId), params: params, createdAt: Date.now() });
    },
  };
  w.addEventListener("craftguruCartItemAdded", function (event) {
    var line = event.detail;
    if (line && Number(line.qty) > 0) track("AddToCart", itemParams([line]));
  });
  w.addEventListener("storage", function (event) {
    if (event.key === CONSENT_KEY || event.key === null) {
      choice = read(local, CONSENT_KEY, "");
      setConsent(consent());
    }
  });
  if (!allowedHost) return;
  start();
  if (choice !== "accepted" && choice !== "declined") showChoice();
  var policyButton = d.getElementById("cgAdvertisingPreferences");
  if (policyButton) policyButton.addEventListener("click", showChoice);
})(window, document);
