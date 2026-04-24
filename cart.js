/**
 * Cart persisted in localStorage — shared across pages.
 * Dispatches window "resinCartChanged" after mutations (same-tab updates).
 */
(function (global) {
  "use strict";

  /** Browser-only cart when not signed in (per device / profile). */
  var ANON_CART_KEY = "resin_craftguru_cart_inr_v1";
  var ANON_SAVE_LATER_KEY = "craftguru_save_later_v1";

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
    var anonLater = loadSaveLaterFromKey(ANON_SAVE_LATER_KEY);
    var userLaterKey = saveLaterStorageKey();
    var mergedLater = mergeLineLists(loadSaveLaterFromKey(userLaterKey), anonLater);
    try {
      global.localStorage.setItem(userLaterKey, JSON.stringify(mergedLater));
    } catch (_) {}
    try {
      global.localStorage.setItem(ANON_SAVE_LATER_KEY, JSON.stringify([]));
    } catch (_) {}
    notify();
  }

  function onAccountLogout() {
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
      hit.qty = Math.max(1, Math.floor(safeNumber(hit.qty, 1) + safeNumber(n.qty, 1)));
    } else {
      lines.push(n);
    }
    save(lines);
    return lines;
  }

  function removeLine(id, size, leKey) {
    var sid = String(id || "");
    var ss = String(size || "");
    var ex = leKey == null || leKey === "" ? "" : String(leKey);
    var lines = load().filter(function (l) {
      if (l.id !== sid || l.size !== ss) return true;
      return lineExtraKey(l.lineExtra) !== ex;
    });
    save(lines);
    return lines;
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
        if (q <= 0) return null;
        var n = normalizeLine(Object.assign({}, l, { qty: q }));
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
    lineExtraKey: lineExtraKey,
    load: load,
    save: save,
    addItem: addItem,
    removeLine: removeLine,
    setLineQty: setLineQty,
    incrementLine: incrementLine,
    clear: clearCart,
    clearCart: clearCart,
    countItems: countItems,
    subtotal: subtotal,
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
