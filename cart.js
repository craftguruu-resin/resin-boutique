/**
 * Cart persisted in localStorage — shared across pages.
 * Dispatches window "resinCartChanged" after mutations (same-tab updates).
 */
(function (global) {
  "use strict";

  /** Browser-only cart when not signed in (per device / profile). */
  var ANON_CART_KEY = "resin_craftguru_cart_inr_v1";

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

  function safeNumber(n, fallback) {
    var x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }

  function lineKey(line) {
    return String(line.id || "") + "::" + String(line.size || "");
  }

  function normalizeLine(line) {
    if (!line) return null;
    var id = String(line.id || "");
    var size = String(line.size || "");
    if (!id || !size) return null;
    return {
      id: id,
      size: size,
      name: String(line.name || ""),
      price: safeNumber(line.price, 0),
      image: String(line.image || ""),
      qty: Math.max(1, Math.floor(safeNumber(line.qty, 1))),
    };
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
    var anon = loadFromKey(ANON_CART_KEY);
    var userKey = "resin_craftguru_cart_inr_v1__acct__" + em;
    var existing = loadFromKey(userKey);
    var merged = mergeLineLists(existing, anon);
    saveRaw(userKey, merged);
    saveRaw(ANON_CART_KEY, []);
    notify();
  }

  function onAccountLogout() {
    notify();
  }

  function addItem(item) {
    var n = normalizeLine(item);
    if (!n) return load();
    var D = global.RESIN_DATA;
    if (D && typeof D.getProduct === "function") {
      var p = D.getProduct(n.id);
      if (p && p.outOfStock) {
        try {
          window.alert("This piece is out of stock — contact the seller to order.");
        } catch (_) {}
        return load();
      }
    }
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
      hit.qty = Math.max(1, Math.floor(safeNumber(hit.qty, 1) + safeNumber(n.qty, 1)));
    } else {
      lines.push(n);
    }
    save(lines);
    return lines;
  }

  function removeLine(id, size) {
    var sid = String(id || "");
    var ss = String(size || "");
    var lines = load().filter(function (l) {
      return !(l.id === sid && l.size === ss);
    });
    save(lines);
    return lines;
  }

  function clearCart() {
    save([]);
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

  global.RESIN_CART = {
    ANON_CART_KEY: ANON_CART_KEY,
    storageKey: storageKey,
    load: load,
    save: save,
    addItem: addItem,
    removeLine: removeLine,
    clear: clearCart,
    clearCart: clearCart,
    countItems: countItems,
    subtotal: subtotal,
    formatMoney: formatMoney,
    onAccountLogin: onAccountLogin,
    onAccountLogout: onAccountLogout,
  };
})(typeof window !== "undefined" ? window : this);
