(function () {
  "use strict";

  var TOKEN_KEY = "craftguruVendorToken";
  var STATIC_DEV_PORTS = { "5500": 1, "5501": 1, "8080": 1, "8888": 1, "3001": 1, "5173": 1, "5174": 1, "4173": 1 };

  function apiPortOverride() {
    try {
      var v = document.documentElement.getAttribute("data-bill-api-port");
      if (v != null && String(v).trim()) {
        var n = parseInt(String(v).trim(), 10);
        if (Number.isFinite(n) && n > 0 && n < 65536) return String(n);
      }
    } catch (_) {}
    try {
      var ls = localStorage.getItem("craftguruBillApiPort");
      if (ls != null && String(ls).trim()) {
        var n2 = parseInt(String(ls).trim(), 10);
        if (Number.isFinite(n2) && n2 > 0 && n2 < 65536) return String(n2);
      }
    } catch (_) {}
    return "";
  }

  function isPrivateLanHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(h)) return false;
    var p = h.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    return false;
  }

  function apiBase() {
    try {
      var v = document.documentElement.getAttribute("data-bill-api-base");
      if (v != null) {
        var t = String(v).trim().replace(/\/+$/, "");
        if (t.length) {
          try {
            if (window.location && window.location.protocol !== "file:") {
              var ph = String(window.location.hostname || "").toLowerCase();
              var tl = t.toLowerCase();
              var cfgLocal = tl.indexOf("127.0.0.1") >= 0 || tl.indexOf("localhost") >= 0;
              var loop = ph === "localhost" || ph === "127.0.0.1" || ph === "[::1]";
              if (cfgLocal && !loop && !isPrivateLanHost(ph)) {
                t = "";
              }
            }
          } catch (_) {}
          if (t.length) return t;
        }
      }
    } catch (_) {}
    try {
      if (window.location && window.location.protocol !== "file:") {
        var loc = window.location;
        var port = loc.port || (loc.protocol === "https:" ? "443" : "80");
        if (STATIC_DEV_PORTS[port]) {
          var po = apiPortOverride();
          return "http://127.0.0.1:" + (po || "3847");
        }
        return String(loc.origin).replace(/\/+$/, "");
      }
    } catch (_) {}
    var p = apiPortOverride();
    if (p) return "http://127.0.0.1:" + p;
    return "http://127.0.0.1:3847";
  }

  function getToken() {
    try {
      var t = localStorage.getItem(TOKEN_KEY);
      if (t) return t;
      var s = sessionStorage.getItem(TOKEN_KEY);
      if (s) {
        localStorage.setItem(TOKEN_KEY, s);
        sessionStorage.removeItem(TOKEN_KEY);
        return s;
      }
      return "";
    } catch (_) {
      return "";
    }
  }

  function setToken(t) {
    try {
      localStorage.setItem(TOKEN_KEY, t || "");
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    var rounded = Math.round(x * 100) / 100;
    return rounded.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function fullAddr(g) {
    if (!g) return "";
    var line2 = [g.city, g.state].filter(Boolean).join(", ");
    return [g.addrLine1, g.addrLine2, line2, g.zip, g.country]
      .filter(function (x) {
        return x && String(x).trim();
      })
      .join(", ");
  }

  function lineAmt(it) {
    var q = Math.max(1, Math.floor(Number(it.qty) || 1));
    var u = Number(it.unitPrice) || 0;
    return q * u;
  }

  function authHeaders() {
    var t = getToken();
    return {
      Authorization: "Bearer " + t,
      "x-vendor-token": t,
    };
  }

  /** Same content as print sheet, for on-page preview (escaped). */
  function buildInlineTagBillHtml(order) {
    var g = order.guest || {};
    var items = order.items || [];
    var totals = order.totals || { subtotal: 0, shipping: 0, tax: 0, total: 0 };
    var rows = items
      .map(function (it) {
        return (
          "<tr><td>" +
          esc(it.name) +
          "</td><td>" +
          esc(it.sizeLabel || "") +
          "</td><td style='text-align:center'>" +
          esc(String(it.qty || 1)) +
          "</td><td style='text-align:right'>" +
          money(lineAmt(it)) +
          "</td></tr>"
        );
      })
      .join("");
    return (
      "<div class='vendor-inline-tag'>" +
      "<p class='vendor-inline-tag__k'>VENDOR PARCEL TAG · ORDER #" +
      esc(order.orderId) +
      " · " +
      esc(order.tagRef) +
      "</p>" +
      "<p><strong>Name</strong></p><p class='vendor-inline-tag__name'>" +
      esc(g.name) +
      "</p>" +
      "<p><strong>Phone</strong></p><p>" +
      esc(g.phone || "—") +
      "</p>" +
      "<p><strong>Address</strong></p><p>" +
      esc(fullAddr(g) || "—") +
      "</p>" +
      "<p><strong>Pincode</strong></p><p>" +
      esc(g.zip || "—") +
      "</p>" +
      "<p><strong>Note</strong> — Make unboxing video for claim.</p>" +
      "</div>" +
      "<div class='vendor-inline-bill'>" +
      "<h3>Bill summary (no images)</h3>" +
      "<p><strong>Order type:</strong> " +
      esc(order.orderType || "—") +
      "</p>" +
      "<table class='vendor-inline-bill__table'><thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Amt</th></tr></thead><tbody>" +
      rows +
      "</tbody></table>" +
      "<div class='vendor-inline-bill__sum'>" +
      "<div>Subtotal " +
      money(totals.subtotal) +
      "</div>" +
      "<div>Shipping " +
      money(totals.shipping) +
      "</div>" +
      "<div>Tax (8%) " +
      money(totals.tax) +
      "</div>" +
      "<div><strong>Total " +
      money(totals.total) +
      "</strong></div></div></div>"
    );
  }

  function buildPrintHtml(order) {
    var g = order.guest || {};
    var items = order.items || [];
    var totals = order.totals || { subtotal: 0, shipping: 0, tax: 0, total: 0 };
    var rows = items
      .map(function (it) {
        return (
          "<tr><td>" +
          esc(it.name) +
          "</td><td>" +
          esc(it.sizeLabel || "") +
          "</td><td style='text-align:center'>" +
          esc(String(it.qty || 1)) +
          "</td><td style='text-align:right'>" +
          money(lineAmt(it)) +
          "</td></tr>"
        );
      })
      .join("");
    return (
      "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Order #" +
      esc(order.orderId) +
      "</title><style>" +
      "body{font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#111;}" +
      ".tag{max-width:520px;border:2px solid #111;padding:20px;margin-bottom:28px;}" +
      ".tag .k{font-size:11px;letter-spacing:0.12em;color:#555;margin:0 0 12px;}" +
      ".tag h2{margin:0 0 6px;font-size:18px;}" +
      ".tag p{margin:0 0 10px;line-height:1.45;}" +
      ".bill{margin-top:8px;}" +
      ".bill h3{margin:0 0 10px;font-size:15px;}" +
      "table.bill-t{width:100%;border-collapse:collapse;max-width:560px;}" +
      "table.bill-t th,table.bill-t td{border:1px solid #ccc;padding:8px;font-size:13px;}" +
      "table.bill-t th{background:#f5f5f5;text-align:left;}" +
      ".sum{max-width:280px;margin-top:12px;font-size:14px;line-height:1.6;}" +
      "@media print{body{padding:12px;}}" +
      "</style></head><body>" +
      "<section class='tag'><p class='k'>VENDOR PARCEL TAG · ORDER #" +
      esc(order.orderId) +
      " · " +
      esc(order.tagRef) +
      "</p>" +
      "<p><strong>Name</strong></p><h2>" +
      esc(g.name) +
      "</h2>" +
      "<p><strong>Phone</strong></p><p>" +
      esc(g.phone || "—") +
      "</p>" +
      "<p><strong>Address</strong></p><p>" +
      esc(fullAddr(g) || "—") +
      "</p>" +
      "<p><strong>Pincode</strong></p><p>" +
      esc(g.zip || "—") +
      "</p>" +
      "<p><strong>Note</strong> — Make unboxing video for claim. Thank you.</p>" +
      "<p style='margin-top:16px;font-size:12px;color:#444;'><strong>FROM</strong> CRAFTGURU · Jaipur</p></section>" +
      "<section class='bill'><h3>Bill summary (no images)</h3>" +
      "<p style='font-size:13px;margin:0 0 8px;'><strong>Order type:</strong> " +
      esc(order.orderType || "—") +
      "</p>" +
      "<table class='bill-t'><thead><tr><th>Item</th><th>Size</th><th>Qty</th><th style='text-align:right'>Amount</th></tr></thead><tbody>" +
      rows +
      "</tbody></table>" +
      "<div class='sum'>" +
      "<div><strong>Subtotal</strong> " +
      money(totals.subtotal) +
      "</div>" +
      "<div><strong>Shipping</strong> " +
      money(totals.shipping) +
      "</div>" +
      "<div><strong>Tax (8%)</strong> " +
      money(totals.tax) +
      "</div>" +
      "<div><strong>Total</strong> " +
      money(totals.total) +
      "</div></div></section></body></html>"
    );
  }

  function printOrder(orderId) {
    var base = apiBase();
    fetch(base + "/api/vendor/order/" + encodeURIComponent(orderId), { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok || !j.ok) throw new Error((j && j.error) || "Could not load order");
          return j.order;
        });
      })
      .then(function (order) {
        var html = buildPrintHtml(order);
        var w = window.open("", "_blank");
        if (!w) {
          window.alert("Pop-up blocked — allow pop-ups to print the tag.");
          return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
        setTimeout(function () {
          try {
            w.focus();
            w.print();
          } catch (_) {}
        }, 300);
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || "Print failed"));
      });
  }

  function showErr(el, msg) {
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.removeAttribute("hidden");
    } else {
      el.textContent = "";
      el.setAttribute("hidden", "hidden");
    }
  }

  function renderList(orders) {
    var ul = document.getElementById("vpOrderList");
    var empty = document.getElementById("vpEmpty");
    if (!ul) return;
    ul.innerHTML = "";
    if (!orders || !orders.length) {
      if (empty) empty.removeAttribute("hidden");
      return;
    }
    if (empty) empty.setAttribute("hidden", "hidden");
    orders.forEach(function (o) {
      var li = document.createElement("li");
      li.className = "vendor-portal-row";
      li.innerHTML =
        "<div class='vendor-portal-row__main'>" +
        "<p class='vendor-portal-row__id'>Order #" +
        esc(o.orderId) +
        " · " +
        esc(o.tagRef || "") +
        "</p>" +
        "<p class='vendor-portal-row__meta'>" +
        esc(o.orderType || "") +
        "</p>" +
        "<p class='vendor-portal-row__who'>" +
        esc(o.guestName || "") +
        " · " +
        esc(o.guestPhone || "") +
        " · Total " +
        esc(money(o.total)) +
        "</p></div>" +
        "<div class='vendor-portal-row__actions'>" +
        "<button type='button' class='vendor-portal-ghost vendor-portal-preview' data-order-id='" +
        esc(String(o.orderId)) +
        "'>Show on page</button>" +
        "<button type='button' class='checkout-submit vendor-portal-print' data-order-id='" +
        esc(String(o.orderId)) +
        "'>Print tag + bill</button></div>";
      ul.appendChild(li);
    });
    ul.querySelectorAll(".vendor-portal-print").forEach(function (btn) {
      btn.addEventListener("click", function () {
        printOrder(btn.getAttribute("data-order-id"));
      });
    });
    ul.querySelectorAll(".vendor-portal-preview").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showInlinePreview(btn.getAttribute("data-order-id"));
      });
    });
  }

  function showInlinePreview(orderId) {
    var box = document.getElementById("vpInlinePreview");
    var body = document.getElementById("vpInlineBody");
    if (!box || !body) return;
    body.innerHTML = "<p class='vendor-portal-muted'>Loading…</p>";
    box.removeAttribute("hidden");
    var base = apiBase();
    fetch(base + "/api/vendor/order/" + encodeURIComponent(orderId), { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok || !j.ok) throw new Error((j && j.error) || "Could not load order");
          return j.order;
        });
      })
      .then(function (order) {
        body.innerHTML = buildInlineTagBillHtml(order);
        try {
          box.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (_) {}
      })
      .catch(function (e) {
        body.innerHTML = "<p class='vendor-gate-modal__err'>" + esc(String((e && e.message) || e)) + "</p>";
      });
  }

  function hideInlinePreview() {
    var box = document.getElementById("vpInlinePreview");
    var body = document.getElementById("vpInlineBody");
    if (box) box.setAttribute("hidden", "hidden");
    if (body) body.innerHTML = "";
  }

  function loadCatalogStats() {
    var base = apiBase();
    var line = document.getElementById("vpCatalogLine");
    if (!line) return;
    fetch(base + "/api/vendor/catalog-stats", { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok || !j.ok) throw new Error((j && j.error) || "stats");
          return j;
        });
      })
      .then(function (j) {
        if (!j.database) {
          line.textContent = "Catalog DB: not linked (set DATABASE_URL + npm run db:seed).";
        } else {
          line.textContent =
            "Catalog in Postgres: " + j.categories + " categories · " + j.products + " products.";
        }
        line.removeAttribute("hidden");
      })
      .catch(function () {
        line.setAttribute("hidden", "hidden");
      });
  }

  function loadToday() {
    var base = apiBase();
    var deskErr = document.getElementById("vpDeskErr");
    var countLine = document.getElementById("vpCountLine");
    showErr(deskErr, "");
    return fetch(base + "/api/vendor/orders/today", { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (j) {
          if (res.status === 401) {
            clearToken();
            throw new Error("UNAUTH");
          }
          if (!res.ok || !j.ok) throw new Error((j && j.error) || "Could not load orders");
          return j;
        });
      })
      .then(function (j) {
        if (countLine) countLine.textContent = j.count ? j.count + " order(s) today." : "No orders yet today.";
        renderList(j.orders || []);
        loadCatalogStats();
      })
      .catch(function (e) {
        if (String((e && e.message) || "") === "UNAUTH") {
          showDesk(false);
          showErr(document.getElementById("vpLoginErr"), "Session expired — sign in again.");
          return;
        }
        showErr(deskErr, String((e && e.message) || "Load failed"));
      });
  }

  function showDesk(on) {
    var loginSec = document.getElementById("vendorLoginSection");
    var desk = document.getElementById("vendorDeskSection");
    if (loginSec) loginSec.hidden = !!on;
    if (desk) desk.hidden = !on;
  }

  function afterLogin(token) {
    setToken(token);
    showErr(document.getElementById("vpLoginErr"), "");
    showDesk(true);
    loadToday();
  }

  function tryBootWithToken() {
    if (!getToken()) {
      showDesk(false);
      return;
    }
    showDesk(true);
    loadToday();
  }

  function doLogin(username, password) {
    var base = apiBase();
    return fetch(base + "/api/vendor/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password }),
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok || !j.ok) throw new Error((j && j.error) || "Sign-in failed");
        return j.token;
      });
    });
  }

  var vpLoginBtn = document.getElementById("vpLoginBtn");
  if (vpLoginBtn) {
    vpLoginBtn.addEventListener("click", function () {
      var u = document.getElementById("vpUser");
      var p = document.getElementById("vpPass");
      showErr(document.getElementById("vpLoginErr"), "");
      doLogin((u && u.value) || "", (p && p.value) || "")
        .then(afterLogin)
        .catch(function (e) {
          showErr(document.getElementById("vpLoginErr"), String((e && e.message) || "Sign-in failed"));
        });
    });
  }

  var vpLogoutBtn = document.getElementById("vpLogoutBtn");
  if (vpLogoutBtn) {
    vpLogoutBtn.addEventListener("click", function () {
      clearToken();
      showDesk(false);
    });
  }

  var vpRefreshBtn = document.getElementById("vpRefreshBtn");
  if (vpRefreshBtn) {
    vpRefreshBtn.addEventListener("click", function () {
      loadToday();
    });
  }

  var vpInlineClose = document.getElementById("vpInlineClose");
  if (vpInlineClose) {
    vpInlineClose.addEventListener("click", hideInlinePreview);
  }

  tryBootWithToken();
})();
