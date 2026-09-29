/**
 * Cart persisted in localStorage — shared across pages.
 * Dispatches window "resinCartChanged" after mutations (same-tab updates).
 */
(function (global) {
  "use strict";

  /** Browser-only cart when not signed in (per device / profile). */
  var ANON_CART_KEY = "resin_craftguru_cart_inr_v1";
  var ANON_SAVE_LATER_KEY = "craftguru_save_later_v1";
  var WISH_ANON_KEY = "craftguru_wishlist_v1";

  function sessionEmailLower() {
    try {
      var em = String(global.localStorage.getItem("cg_session_email") || "")
        .trim()
        .toLowerCase();
      return em && em.indexOf("@") > 0 ? em : "";
    } catch (_) {
      return "";
    }
  }

  function storageKey() {
    var em = sessionEmailLower();
    if (em) return "resin_craftguru_cart_inr_v1__acct__" + em;
    return ANON_CART_KEY;
  }

  function saveLaterStorageKey() {
    var em = sessionEmailLower();
    if (em) return ANON_SAVE_LATER_KEY + "__acct__" + em;
    return ANON_SAVE_LATER_KEY;
  }

  function safeNumber(n, fallback) {
    var x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }

  function lineExtraKey(le) {
    if (!le || typeof le !== "object") return "";
    var keys = Object.keys(le).sort();
    if (!keys.length) return "";
    return keys
      .map(function (k) {
        return k + "=" + String(le[k] == null ? "" : le[k]).trim();
      })
      .join("&")
      .slice(0, 2000);
  }

  /** Prefer live catalog name so vendor renames show in cart / checkout without re-adding. */
  function liveDisplayName(line) {
    try {
      var D = global.RESIN_DATA;
      if (D && typeof D.getProduct === "function" && line && line.id) {
        var p = D.getProduct(line.id);
        if (p && String(p.name || "").trim()) return String(p.name).trim();
      }
    } catch (_) {}
    return String((line && line.name) || "").trim();
  }

  function lineKey(line) {
    return (
      String(line.id || "") +
      "::" +
      String(line.size || "") +
      "::" +
      lineExtraKey(line && line.lineExtra)
    );
  }

  function normalizeLine(line) {
    if (!line) return null;
    var id = String(line.id || "");
    var size = String(line.size || "");
    if (!id || !size) return null;
    var vl = String(line.variantLabel || "").trim().slice(0, 400);
    var le = null;
    if (line.lineExtra && typeof line.lineExtra === "object" && Object.keys(line.lineExtra).length) {
      le = line.lineExtra;
    }
    var stockSlot = String(line.stockSlot != null ? line.stockSlot : "")
      .trim()
      .toLowerCase()
      .slice(0, 1);
    if (stockSlot !== "s" && stockSlot !== "m" && stockSlot !== "l") stockSlot = "";
    var stockMax = Number(line.stockMax);
    if (!Number.isFinite(stockMax) || stockMax < 0) stockMax = null;
    return {
      id: id,
      size: size,
      variantLabel: vl,
      name: String(line.name || ""),
      price: safeNumber(line.price, 0),
      image: String(line.image || ""),
      qty: Math.max(1, Math.floor(safeNumber(line.qty, 1))),
      lineExtra: le || undefined,
      stockSlot: stockSlot || undefined,
      /* Store the inventory snapshot for this exact option. Product ids are
         shared by all size/colour choices, so the cart must never use a
         product-wide value to cap a selected variant. */
      stockMax: stockMax == null ? undefined : Math.floor(stockMax),
    };
  }

  function lineStockLimit(line) {
    if (!line) return null;
    var saved = Number(line.stockMax);
    if (Number.isFinite(saved) && saved >= 0) return Math.floor(saved);
    try {
      var D = global.RESIN_DATA;
      var p = D && typeof D.getProduct === "function" ? D.getProduct(line.id) : null;
      if (!p) return null;
      var opt = productOptions(p);
      var variants = opt && opt.vendorInventory && opt.vendorInventory.variants;
      if (variants && typeof variants === "object") {
        var row = variants[String(line.size || "")];
        var variantStock = row && Number(row.stock);
        if (Number.isFinite(variantStock) && variantStock >= 0) return Math.floor(variantStock);
      }
      var slot = String(line.stockSlot || line.size || "").toLowerCase();
      var legacyStock = p.stock && Number(p.stock[slot]);
      if (Number.isFinite(legacyStock) && legacyStock >= 0) return Math.floor(legacyStock);
    } catch (_) {}
    return null;
  }

  function clampLineQty(line, qty) {
    var q = Math.max(0, Math.floor(safeNumber(qty, 0)));
    var max = lineStockLimit(line);
    if (max != null) q = Math.min(q, max);
    return q;
  }

  function notify() {
    try {
      global.dispatchEvent(new CustomEvent("resinCartChanged"));
    } catch (_) {}
  }

  function loadFromKey(key) {
    try {
      var raw = global.localStorage.getItem(key);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var out = [];
      parsed.forEach(function (l) {
        var n = normalizeLine(l);
        if (n) out.push(n);
      });
      return out;
    } catch (_) {
      return [];
    }
  }

  function load() {
    return loadFromKey(storageKey());
  }

  function saveRaw(key, lines) {
    try {
      global.localStorage.setItem(key, JSON.stringify(lines || []));
    } catch (_) {}
  }

  function save(lines) {
    saveRaw(storageKey(), lines);
    notify();
  }

  function mergeLineLists(intoLines, fromLines) {
    var map = Object.create(null);
    (intoLines || []).forEach(function (l) {
      var n = normalizeLine(l);
      if (n) map[lineKey(n)] = Object.assign({}, n);
    });
    (fromLines || []).forEach(function (l) {
      var n = normalizeLine(l);
      if (!n) return;
      var k = lineKey(n);
      if (map[k]) {
        map[k].qty = Math.max(
          1,
          Math.floor(Number(map[k].qty) || 0) + Math.floor(Number(n.qty) || 0)
        );
      } else {
        map[k] = Object.assign({}, n);
      }
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  /**
   * After email OTP sign-in: merge this browser's anonymous cart into the account cart, then clear the anonymous cart.
   */
  function onAccountLogin() {
    var em = sessionEmailLower();
    if (!em) return;
    wishHydrated = false;
    var anon = loadFromKey(ANON_CART_KEY);
    var userKey = "resin_craftguru_cart_inr_v1__acct__" + em;
    var existing = loadFromKey(userKey);
    var merged = mergeLineLists(existing, anon);
    saveRaw(userKey, merged);
    saveRaw(ANON_CART_KEY, []);
    var anonLater = loadSaveLaterFromKey(ANON_SAVE_LATER_KEY);
    var userLaterKey = saveLaterStorageKey();
    var mergedLater = mergeLineLists(loadSaveLaterFromKey(userLaterKey), anonLater);
    try {
      global.localStorage.setItem(userLaterKey, JSON.stringify(mergedLater));
    } catch (_) {}
    try {
      global.localStorage.setItem(ANON_SAVE_LATER_KEY, JSON.stringify([]));
    } catch (_) {}
    if (global.RESIN_WISHLIST && global.RESIN_WISHLIST.mergeOnLogin) {
      global.RESIN_WISHLIST.mergeOnLogin();
    }
    notify();
  }

  function onAccountLogout() {
    wishHydrated = false;
    wishCache = Object.create(null);
    applyWishCache(loadWishlistLocal());
    notifyWishlist();
    notify();
  }

  function addItem(item) {
    var n = normalizeLine(item);
    if (!n) return load();
    var lines = load();
    var k = lineKey(n);
    var hit = null;
    for (var i = 0; i < lines.length; i++) {
      if (lineKey(lines[i]) === k) {
        hit = lines[i];
        break;
      }
    }
    if (hit) {
      if (n.stockMax != null) hit.stockMax = n.stockMax;
      var mergedQty = clampLineQty(hit, safeNumber(hit.qty, 1) + safeNumber(n.qty, 1));
      if (mergedQty > 0) hit.qty = mergedQty;
    } else {
      n.qty = clampLineQty(n, n.qty);
      if (n.qty > 0) lines.push(n);
    }
    save(lines);
    return lines;
  }

  function removeLine(id, size, leKey) {
    var sid = String(id || "");
    var ss = String(size || "");
    var ex = leKey == null || leKey === "" ? "" : String(leKey);
    var removed = null;
    var lines = load().filter(function (l) {
      if (l.id !== sid || l.size !== ss) return true;
      if (lineExtraKey(l.lineExtra) !== ex) return true;
      removed = normalizeLine(l);
      return false;
    });
    save(lines);
    if (removed) {
      try { global.dispatchEvent(new CustomEvent("resinCartLineRemoved", { detail: { line: removed } })); } catch (_) {}
    }
    return lines;
  }

  function restoreLine(line) {
    if (!line) return load();
    return addItem(line);
  }

  function setLineQty(id, size, qty, leKey) {
    var sid = String(id || "");
    var ss = String(size || "");
    var ex = leKey == null || leKey === "" ? "" : String(leKey);
    var q = Math.max(0, Math.floor(safeNumber(qty, 0)));
    var lines = load();
    var changed = false;
    lines = lines
      .map(function (l) {
        if (l.id !== sid || l.size !== ss) return l;
        if (lineExtraKey(l.lineExtra) !== ex) return l;
        changed = true;
        var cappedQty = clampLineQty(l, q);
        if (cappedQty <= 0) return null;
        var n = normalizeLine(Object.assign({}, l, { qty: cappedQty }));
        return n;
      })
      .filter(Boolean);
    if (changed) save(lines);
    return lines;
  }

  function incrementLine(id, size, delta, leKey) {
    var d = Math.floor(safeNumber(delta, 1));
    var lines = load();
    var ex = leKey == null || leKey === "" ? "" : String(leKey);
    var hit = null;
    lines.forEach(function (l) {
      if (l.id === String(id || "") && l.size === String(size || "") && lineExtraKey(l.lineExtra) === ex) hit = l;
    });
    if (!hit) return lines;
    return setLineQty(id, size, Math.max(0, Math.floor(safeNumber(hit.qty, 1)) + d), ex);
  }

  function clearCart() {
    save([]);
  }

  function loadSaveLaterFromKey(key) {
    try {
      var raw = global.localStorage.getItem(key);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var out = [];
      parsed.forEach(function (l) {
        var n = normalizeLine(l);
        if (n) out.push(n);
      });
      return out;
    } catch (_) {
      return [];
    }
  }

  function loadSaveLater() {
    return loadSaveLaterFromKey(saveLaterStorageKey());
  }

  function saveSaveLater(lines) {
    try {
      global.localStorage.setItem(saveLaterStorageKey(), JSON.stringify(lines || []));
    } catch (_) {}
    try {
      global.dispatchEvent(new CustomEvent("resinSaveLaterChanged"));
    } catch (_) {}
  }

  function removeSaveLaterLine(id, size, leKey) {
    var sid = String(id || "");
    var ss = String(size || "");
    var ex = leKey == null || leKey === "" ? "" : String(leKey);
    var next = loadSaveLater().filter(function (l) {
      if (l.id !== sid || l.size !== ss) return true;
      return lineExtraKey(l.lineExtra) !== ex;
    });
    saveSaveLater(next);
    return next;
  }

  /**
   * Move one cart line to Save for later (same qty). Removes from cart.
   * @returns {boolean} whether a line was moved
   */
  function moveLineToSaveLater(id, size, leKey) {
    var sid = String(id || "");
    var ss = String(size || "");
    var ex = leKey == null || leKey === "" ? "" : String(leKey);
    var lines = load();
    var hit = null;
    for (var i = 0; i < lines.length; i++) {
      if (
        lines[i].id === sid &&
        lines[i].size === ss &&
        lineExtraKey(lines[i].lineExtra) === ex
      ) {
        hit = lines[i];
        break;
      }
    }
    if (!hit) return false;
    var later = loadSaveLater();
    var k = lineKey(hit);
    var map = Object.create(null);
    later.forEach(function (l) {
      var n = normalizeLine(l);
      if (n) map[lineKey(n)] = Object.assign({}, n);
    });
    if (map[k]) {
      map[k].qty = Math.max(1, Math.floor(safeNumber(map[k].qty, 1) + safeNumber(hit.qty, 1)));
    } else {
      map[k] = Object.assign({}, hit);
    }
    var merged = Object.keys(map).map(function (x) {
      return map[x];
    });
    saveSaveLater(merged);
    removeLine(sid, ss, ex);
    return true;
  }

  function moveSaveLaterToCart(id, size, leKey) {
    var sid = String(id || "");
    var ss = String(size || "");
    var ex = leKey == null || leKey === "" ? "" : String(leKey);
    var later = loadSaveLater();
    var hit = null;
    for (var i = 0; i < later.length; i++) {
      if (
        later[i].id === sid &&
        later[i].size === ss &&
        lineExtraKey(later[i].lineExtra) === ex
      ) {
        hit = later[i];
        break;
      }
    }
    if (!hit) return false;
    addItem(hit);
    removeSaveLaterLine(sid, ss, ex);
    notify();
    return true;
  }

  function countItems() {
    return load().reduce(function (acc, l) {
      return acc + Math.max(0, safeNumber(l.qty, 0));
    }, 0);
  }

  function subtotal() {
    var sum = load().reduce(function (acc, l) {
      return acc + safeNumber(l.price, 0) * Math.max(0, safeNumber(l.qty, 0));
    }, 0);
    return Math.round(sum * 100) / 100;
  }

  /**
   * Cart / checkout UI copy. Shipping is free and remains a zero-value line.
   * @returns {{ free: boolean, text: string, empty: boolean }}
   */
  function shippingNotice(subOpt) {
    var lines = load();
    if (!lines.length) {
      return { free: false, text: "", empty: true };
    }
    return {
      free: true,
      empty: false,
      text: "Free Shipping on this order.",
    };
  }

  /** Update #cartShippingNote (and optional #checkoutShippingHint) from current cart. */
  function syncShippingNotice(root) {
    var scope = root && root.querySelector ? root : document;
    var notice = shippingNotice();
    var nodes = [];
    var a = scope.getElementById ? scope.getElementById("cartShippingNote") : null;
    var b = scope.getElementById ? scope.getElementById("checkoutShippingHint") : null;
    if (!a && scope.querySelectorAll) {
      scope.querySelectorAll("#cartShippingNote, #checkoutShippingHint").forEach(function (el) {
        nodes.push(el);
      });
    } else {
      if (a) nodes.push(a);
      if (b) nodes.push(b);
    }
    nodes.forEach(function (el) {
      if (!el) return;
      if (notice.empty || !notice.text) {
        el.hidden = true;
        el.textContent = "";
        el.classList.remove("is-free", "is-paid");
        return;
      }
      el.hidden = false;
      el.textContent = notice.text;
      el.classList.toggle("is-free", notice.free);
      el.classList.toggle("is-paid", !notice.free);
    });
    return notice;
  }

  function formatMoney(n) {
    var x = safeNumber(n, 0);
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }).format(x);
    } catch (_) {
      return "₹" + Math.round(x).toLocaleString("en-IN");
    }
  }

  function liveLinePrice(line) {
    if (!line || !line.id) return safeNumber(line.price, 0);
    try {
      var D = global.RESIN_DATA;
      if (!D || typeof D.getProduct !== "function") return safeNumber(line.price, 0);
      var p = D.getProduct(line.id);
      if (!p || !p.prices) return safeNumber(line.price, 0);
      var rawSize = String(line.size || "m").trim();
      var sizeKey = rawSize.toLowerCase();
      var customPrice = liveVariantPrice(p, rawSize);
      if (customPrice != null) return customPrice;
      /* Custom option ids such as s:8-inch are not S/M/L. Their stored unit
         price is authoritative when a catalog snapshot does not expose the
         option metadata; never silently replace it with the M price. */
      if (sizeKey !== "s" && sizeKey !== "m" && sizeKey !== "l") return safeNumber(line.price, 0);
      var slotPrice = Number(p.prices[sizeKey]);
      if (Number.isFinite(slotPrice) && slotPrice > 0) return slotPrice;
      var keys = ["s", "m", "l"];
      for (var i = 0; i < keys.length; i++) {
        var pr = Number(p.prices[keys[i]]);
        if (Number.isFinite(pr) && pr > 0) return pr;
      }
      if (typeof D.getStartingPriceInr === "function") {
        var start = D.getStartingPriceInr(p);
        if (Number.isFinite(start) && start > 0) return start;
      }
    } catch (_) {}
    return safeNumber(line.price, 0);
  }

  function optionById(rows, id) {
    if (!Array.isArray(rows) || !id) return null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i] && rows[i].id || "") === String(id)) return rows[i];
    }
    return null;
  }

  function productOptions(product) {
    if (product && product.options && typeof product.options === "object") return product.options;
    try {
      var adapter = global.RESIN_CATALOG_PDP;
      if (adapter && typeof adapter.getOptionsForProduct === "function") {
        var opt = adapter.getOptionsForProduct(product);
        if (opt && typeof opt === "object") return opt;
      }
    } catch (_) {}
    return null;
  }

  function moneyValue(value) {
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function liveVariantPrice(product, rawSlot) {
    var opt = productOptions(product);
    if (!opt) return null;
    var sid = "";
    var qid = "";
    String(rawSlot || "").split("|").forEach(function (part) {
      if (part.indexOf("s:") === 0) sid = part.slice(2);
      if (part.indexOf("q:") === 0) qid = part.slice(2);
    });
    if (!sid && !qid) return null;
    var base = moneyValue(product.priceInr);
    if (base == null && product.prices) base = moneyValue(product.prices.m);
    if (base == null) base = 0;
    var size = opt.useSize && sid ? optionById(opt.sizes, sid) : null;
    var qty = opt.useQty && qid ? optionById(opt.qtyOptions, qid) : null;
    var sizePrice = size ? moneyValue(size.priceInr) : null;
    var qtyPrice = qty ? moneyValue(qty.priceInr) : null;
    if (opt.useSize && opt.useQty && (size || qty)) return (sizePrice != null ? sizePrice : base) + (qtyPrice != null ? qtyPrice : 0);
    if (opt.useSize && size) return sizePrice != null ? sizePrice : base;
    if (opt.useQty && qty) return qtyPrice != null ? qtyPrice : base;
    return null;
  }

  function syncCartPricesFromCatalog() {
    var lines = load();
    if (!lines.length) return false;
    var changed = false;
    lines.forEach(function (line) {
      var next = liveLinePrice(line);
      var prev = safeNumber(line.price, 0);
      if (next > 0 && Math.abs(next - prev) > 0.009) {
        line.price = next;
        changed = true;
      }
    });
    if (changed) {
      save(lines);
    }
    return changed;
  }

  function onCatalogPricesMergedForCart() {
    syncCartPricesFromCatalog();
    syncSaveLaterPricesFromCatalog();
  }

  function syncSaveLaterPricesFromCatalog() {
    var lines = loadSaveLater();
    if (!lines.length) return;
    var changed = false;
    lines.forEach(function (line) {
      var next = liveLinePrice(line);
      var prev = safeNumber(line.price, 0);
      if (next > 0 && Math.abs(next - prev) > 0.009) {
        line.price = next;
        changed = true;
      }
    });
    if (changed) {
      saveSaveLater(lines);
    }
  }

  try {
    global.addEventListener("craftguruCatalogPricesMerged", onCatalogPricesMergedForCart);
    global.addEventListener("craftguruCatalogVendorProductsMerged", onCatalogPricesMergedForCart);
  } catch (_) {}

  var GUEST_TOKEN_KEY = "craftguruGuestToken";
  var wishCache = Object.create(null);
  var wishHydrated = false;

  function wishStorageKey() {
    var em = sessionEmailLower();
    return em ? WISH_ANON_KEY + "__acct__" + em : WISH_ANON_KEY;
  }

  function parseWishlistLocal(raw) {
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var out = [];
      parsed.forEach(function (row) {
        var pid = typeof row === "string" ? String(row || "").trim() : String((row && (row.productId || row.id)) || "").trim();
        if (!pid) return;
        out.push({ productId: pid, kind: typeof row === "string" ? "catalog" : normWishKind(row.kind) });
      });
      return out;
    } catch (_) { return []; }
  }

  function loadWishlistLocalFromKey(key) {
    try { return parseWishlistLocal(global.localStorage.getItem(key)); } catch (_) { return []; }
  }

  function wishApiBase() {
    var M = global.CraftguruCatalogMerge;
    if (M && typeof M.getApiBase === "function") {
      var b = String(M.getApiBase() || "")
        .trim()
        .replace(/\/+$/, "");
      if (b) return b;
    }
    try {
      if (global.location && global.location.protocol !== "file:") {
        return String(global.location.origin || "").replace(/\/+$/, "");
      }
    } catch (_) {}
    return "";
  }

  function guestBearer() {
    try {
      return String(global.localStorage.getItem(GUEST_TOKEN_KEY) || "").trim();
    } catch (_) {
      return "";
    }
  }

  function normWishKind(kind) {
    var k = String(kind || "catalog")
      .trim()
      .toLowerCase();
    if (k === "raw_material" || k === "photo_frame" || k === "catalog") return k;
    return "catalog";
  }

  function wishEntryKey(id, kind) {
    return normWishKind(kind) + ":" + String(id || "").trim();
  }

  function notifyWishlist() {
    try {
      global.dispatchEvent(new CustomEvent("resinWishlistChanged"));
    } catch (_) {}
  }

  function loadWishlistLocal() {
    return loadWishlistLocalFromKey(wishStorageKey());
  }

  function saveWishlistLocal(items) {
    try {
      global.localStorage.setItem(wishStorageKey(), JSON.stringify(items || []));
    } catch (_) {}
    notifyWishlist();
  }

  function applyWishCache(items) {
    wishCache = Object.create(null);
    (items || []).forEach(function (it) {
      var pid = String((it && (it.productId || it.id)) || "").trim();
      if (!pid) return;
      wishCache[wishEntryKey(pid, it.kind)] = true;
    });
    wishHydrated = true;
  }

  function listWishlistItems() {
    return loadWishlistLocal();
  }

  function hasWishlist(id, kind) {
    var pid = String(id || "").trim();
    if (!pid) return false;
    if (!wishHydrated) applyWishCache(loadWishlistLocal());
    return !!wishCache[wishEntryKey(pid, kind)];
  }

  function setLocalWishlistFromCache() {
    var items = [];
    Object.keys(wishCache).forEach(function (k) {
      if (!wishCache[k]) return;
      var ix = k.indexOf(":");
      if (ix < 0) return;
      items.push({ productId: k.slice(ix + 1), kind: k.slice(0, ix) });
    });
    saveWishlistLocal(items);
  }

  function refreshWishlistFromServer(done) {
    var tok = guestBearer();
    var base = wishApiBase();
    if (!tok || !base) {
      applyWishCache(loadWishlistLocal());
      if (done) done(null, listWishlistItems());
      return;
    }
    fetch(base + "/api/guest/wishlist", {
      method: "GET",
      headers: { Authorization: "Bearer " + tok },
      cache: "no-store",
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (j) {
        if (j && j.ok && Array.isArray(j.items)) {
          applyWishCache(j.items);
          saveWishlistLocal(j.items);
        } else {
          applyWishCache(loadWishlistLocal());
        }
        if (done) done(null, listWishlistItems());
      })
      .catch(function (err) {
        applyWishCache(loadWishlistLocal());
        if (done) done(err, listWishlistItems());
      });
  }

  function mergeWishlistOnLogin() {
    var tok = guestBearer();
    var base = wishApiBase();
    var local = loadWishlistLocalFromKey(WISH_ANON_KEY);
    wishHydrated = false;
    if (!tok || !base || !local.length) {
      refreshWishlistFromServer();
      return;
    }
    fetch(base + "/api/guest/wishlist/merge", {
      method: "POST",
      headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
      body: JSON.stringify({ items: local }),
      cache: "no-store",
    })
      .then(function (res) { return res.json(); })
      .then(function (j) {
        if (j && j.ok && Array.isArray(j.items)) {
          applyWishCache(j.items);
          saveWishlistLocal(j.items);
          try { global.localStorage.removeItem(WISH_ANON_KEY); } catch (_) {}
          notifyWishlist();
        } else {
          refreshWishlistFromServer();
        }
      })
      .catch(function () { refreshWishlistFromServer(); });
  }

  function toggleWishlist(id, kind, done) {
    var pid = String(id || "").trim();
    var pk = normWishKind(kind);
    if (!pid) {
      if (done) done(new Error("id required"));
      return false;
    }

    var tok = guestBearer();
    if (!tok) {
      if (!wishHydrated) applyWishCache(loadWishlistLocal());
      var guestKey = wishEntryKey(pid, pk);
      var guestOn = !wishCache[guestKey];
      if (guestOn) wishCache[guestKey] = true; else delete wishCache[guestKey];
      setLocalWishlistFromCache();
      notifyWishlist();
      try { if (window.CRAFT_AUTH_HOME && typeof window.CRAFT_AUTH_HOME.openAuth === "function") window.CRAFT_AUTH_HOME.openAuth("login"); } catch (_) {}
      if (done) done(null, guestOn);
      return guestOn;
    }

    if (!wishHydrated) applyWishCache(loadWishlistLocal());
    var key = wishEntryKey(pid, pk);
    var nextOn = !wishCache[key];
    if (nextOn) wishCache[key] = true;
    else delete wishCache[key];
    notifyWishlist();

    var base = wishApiBase();
    if (tok && base) {
      fetch(base + "/api/guest/wishlist/toggle", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + tok,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productId: pid, kind: pk }),
        cache: "no-store",
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (!res.ok || !body.ok || typeof body.on !== "boolean") {
              throw new Error((body && body.error) || "Could not update your saved item.");
            }
            return body;
          });
        })
        .then(function (j) {
          if (j.on) wishCache[key] = true;
          else delete wishCache[key];
          setLocalWishlistFromCache();
          notifyWishlist();
          if (done) done(null, !!wishCache[key]);
        })
        .catch(function (err) {
          /* Optimistic UI must not claim a signed-in wishlist change that the
             server rejected or failed to save. */
          if (nextOn) delete wishCache[key];
          else wishCache[key] = true;
          setLocalWishlistFromCache();
          notifyWishlist();
          if (done) done(err, !!wishCache[key]);
        });
      return nextOn;
    }

    setLocalWishlistFromCache();
    if (done) done(null, nextOn);
    return nextOn;
  }

  function syncWishlistButton(btn, id, kind) {
    if (!btn) return;
    var on = hasWishlist(id, kind);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Remove from wishlist" : "Save to wishlist");
    btn.setAttribute("aria-busy", "false");
  }

  applyWishCache(loadWishlistLocal());
  if (guestBearer()) {
    refreshWishlistFromServer();
  }

  global.RESIN_WISHLIST = {
    load: listWishlistItems,
    has: hasWishlist,
    toggle: toggleWishlist,
    syncButton: syncWishlistButton,
    refresh: refreshWishlistFromServer,
    mergeOnLogin: mergeWishlistOnLogin,
  };

  global.RESIN_CART = {
    ANON_CART_KEY: ANON_CART_KEY,
    storageKey: storageKey,
    lineExtraKey: lineExtraKey,
    liveDisplayName: liveDisplayName,
    liveLinePrice: liveLinePrice,
    syncPricesFromCatalog: syncCartPricesFromCatalog,
    load: load,
    save: save,
    addItem: addItem,
    removeLine: removeLine,
    restoreLine: restoreLine,
    setLineQty: setLineQty,
    incrementLine: incrementLine,
    lineStockLimit: lineStockLimit,
    clear: clearCart,
    clearCart: clearCart,
    countItems: countItems,
    subtotal: subtotal,
    shippingNotice: shippingNotice,
    syncShippingNotice: syncShippingNotice,
    formatMoney: formatMoney,
    onAccountLogin: onAccountLogin,
    onAccountLogout: onAccountLogout,
    loadSaveLater: loadSaveLater,
    saveSaveLater: saveSaveLater,
    removeSaveLaterLine: removeSaveLaterLine,
    moveLineToSaveLater: moveLineToSaveLater,
    moveSaveLaterToCart: moveSaveLaterToCart,
  };
})(typeof window !== "undefined" ? window : this);
