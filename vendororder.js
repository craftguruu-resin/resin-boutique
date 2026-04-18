(function () {
  "use strict";

  var TOKEN_KEY = "craftguruVendorToken";
  var lastDetailOrder = null;

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

  function apiBase() {
    try {
      var v = document.documentElement.getAttribute("data-bill-api-base");
      if (v != null) {
        var t = String(v).trim().replace(/\/+$/, "");
        if (t.length) return t;
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

  function payPill(o) {
    var st = (o && o.paymentStatus) || "";
    var paid = st === "paid";
    return (
      "<span class='" +
      (paid ? "vendor-order-pay-pill" : "vendor-order-pay-pill vendor-order-pay-pill--pending") +
      "'>" +
      esc(paid ? "Paid" : st || "pending") +
      (o.paymentMethod ? " · " + esc(o.paymentMethod) : "") +
      "</span>"
    );
  }

  function renderCharts(months) {
    var wrap = document.getElementById("voCharts");
    if (!wrap) return;
    if (!months || !months.length) {
      wrap.innerHTML = "<p class='vendor-portal-muted'>No monthly data yet.</p>";
      return;
    }
    var maxPaid = Math.max.apply(
      null,
      months.map(function (m) {
        return Number(m.paidTotal) || 0;
      })
    );
    if (!Number.isFinite(maxPaid) || maxPaid < 1) maxPaid = 1;

    var last = months[months.length - 1];
    var prev = months.length > 1 ? months[months.length - 2] : null;

    var bars = months
      .map(function (m) {
        var raw = Math.max(0, Number(m.paidTotal) || 0);
        var h = (raw / maxPaid) * 100;
        return (
          "<div class='vendor-order-bar' style='height:" +
          h.toFixed(1) +
          "%' title='" +
          esc(m.monthKey) +
          " " +
          money(raw) +
          "'><span class='vendor-order-bar__tip'>" +
          esc(m.monthKey) +
          "</span></div>"
        );
      })
      .join("");

    wrap.innerHTML =
      "<div class='vendor-order-chart'><p class='vendor-order-chart__label'>Latest month (paid, IST)</p>" +
      "<p class='vendor-order-chart__val'>" +
      money(last.paidTotal) +
      "</p>" +
      "<p class='vendor-order-list-meta'>" +
      (last.paidOrderCount || 0) +
      " paid orders · " +
      (last.allOrderCount || 0) +
      " orders total</p></div>" +
      (prev
        ? "<div class='vendor-order-chart'><p class='vendor-order-chart__label'>Previous month</p>" +
          "<p class='vendor-order-chart__val'>" +
          money(prev.paidTotal) +
          "</p><p class='vendor-order-list-meta'>" +
          (prev.paidOrderCount || 0) +
          " paid · " +
          (prev.allOrderCount || 0) +
          " total</p></div>"
        : "") +
      "<div class='vendor-order-chart' style='grid-column: 1 / -1'><p class='vendor-order-chart__label'>Paid revenue by month</p>" +
      "<div class='vendor-order-bars'>" +
      bars +
      "</div><p class='vendor-order-list-meta' style='margin-top:0.5rem'>Bars = paid totals only (INR). Hover a bar for the month key.</p></div>";
  }

  function renderOrderList(orders) {
    var ul = document.getElementById("voOrderList");
    var empty = document.getElementById("voEmpty");
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
        payPill(o) +
        "</p>" +
        "<p class='vendor-portal-row__meta'>" +
        esc(o.orderType || "") +
        "</p>" +
        "<p class='vendor-portal-row__who'>" +
        esc(o.guestName || "") +
        " · " +
        esc(o.guestPhone || "") +
        " · Paid total " +
        esc(money(o.total)) +
        "</p></div>" +
        "<div class='vendor-portal-row__actions'>" +
        "<button type='button' class='checkout-submit vendor-portal-print' data-order-id='" +
        esc(String(o.orderId)) +
        "'>Details &amp; tag</button></div>";
      ul.appendChild(li);
    });
    ul.querySelectorAll(".vendor-portal-print").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openOrderDetail(btn.getAttribute("data-order-id"));
      });
    });
  }

  function hideDetail() {
    var box = document.getElementById("voDetailPanel");
    if (box) box.setAttribute("hidden", "hidden");
    lastDetailOrder = null;
  }

  function openOrderDetail(orderId) {
    var box = document.getElementById("voDetailPanel");
    var title = document.getElementById("voDetailTitle");
    var meta = document.getElementById("voDetailMeta");
    var tag = document.getElementById("voDetailTag");
    if (!box || !tag) return;
    tag.innerHTML = "<p class='vendor-portal-muted'>Loading…</p>";
    box.removeAttribute("hidden");
    if (title) title.textContent = "Order #" + String(orderId);
    var base = apiBase();
    fetch(base + "/api/vendor/order/" + encodeURIComponent(orderId), { headers: authHeaders() })
      .then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok || !j.ok) throw new Error((j && j.error) || "Could not load order");
          return j.order;
        });
      })
      .then(function (order) {
        lastDetailOrder = order;
        if (title) title.textContent = "Order #" + esc(String(order.orderId));
        if (meta) {
          meta.innerHTML =
            esc(order.tagRef || "") +
            " · " +
            esc(order.paymentStatus || "") +
            (order.paymentMethod ? " · " + esc(order.paymentMethod) : "") +
            " · <strong>Total " +
            esc(money(order.totals && order.totals.total)) +
            "</strong>";
        }
        tag.innerHTML = buildInlineTagBillHtml(order);
        try {
          box.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (_) {}
      })
      .catch(function (e) {
        tag.innerHTML = "<p class='vendor-gate-modal__err'>" + esc(String((e && e.message) || e)) + "</p>";
        lastDetailOrder = null;
      });
  }

  function printDetail() {
    if (!lastDetailOrder) return;
    var html = buildPrintHtml(lastDetailOrder);
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
  }

  function loadAll() {
    var base = apiBase();
    var deskErr = document.getElementById("voDeskErr");
    var sum = document.getElementById("voSummaryLine");
    showErr(deskErr, "");
    return Promise.all([
      fetch(base + "/api/vendor/analytics/monthly", { headers: authHeaders() }).then(function (res) {
        return res.json().then(function (j) {
          if (res.status === 401) throw new Error("UNAUTH");
          if (!res.ok || !j.ok) throw new Error((j && j.error) || "analytics");
          return j;
        });
      }),
      fetch(base + "/api/vendor/orders/recent?limit=50", { headers: authHeaders() }).then(function (res) {
        return res.json().then(function (j) {
          if (res.status === 401) throw new Error("UNAUTH");
          if (!res.ok || !j.ok) throw new Error((j && j.error) || "recent");
          return j;
        });
      }),
    ])
      .then(function (pair) {
        var a = pair[0];
        var r = pair[1];
        renderCharts(a.months || []);
        renderOrderList(r.orders || []);
        if (sum) {
          sum.textContent =
            (r.count || 0) +
            " recent order(s) loaded. Charts use up to six months (paid vs all orders per month).";
        }
      })
      .catch(function (e) {
        if (String((e && e.message) || "") === "UNAUTH") {
          showDesk(false);
          clearToken();
          showErr(document.getElementById("voLoginErr"), "Session expired — sign in again.");
          return;
        }
        showErr(deskErr, String((e && e.message) || "Load failed"));
      });
  }

  function showDesk(on) {
    var loginSec = document.getElementById("voLoginSection");
    var desk = document.getElementById("voDeskSection");
    if (loginSec) loginSec.hidden = !!on;
    if (desk) desk.hidden = !on;
  }

  function afterLogin(token) {
    setToken(token);
    showErr(document.getElementById("voLoginErr"), "");
    showDesk(true);
    hideDetail();
    loadAll();
  }

  function tryBootWithToken() {
    if (!getToken()) {
      showDesk(false);
      return;
    }
    showDesk(true);
    loadAll();
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

  var voLoginBtn = document.getElementById("voLoginBtn");
  if (voLoginBtn) {
    voLoginBtn.addEventListener("click", function () {
      var u = document.getElementById("voUser");
      var p = document.getElementById("voPass");
      showErr(document.getElementById("voLoginErr"), "");
      doLogin((u && u.value) || "", (p && p.value) || "")
        .then(afterLogin)
        .catch(function (e) {
          showErr(document.getElementById("voLoginErr"), String((e && e.message) || "Sign-in failed"));
        });
    });
  }

  var voLogoutBtn = document.getElementById("voLogoutBtn");
  if (voLogoutBtn) {
    voLogoutBtn.addEventListener("click", function () {
      clearToken();
      hideDetail();
      showDesk(false);
    });
  }

  var voRefreshBtn = document.getElementById("voRefreshBtn");
  if (voRefreshBtn) {
    voRefreshBtn.addEventListener("click", function () {
      loadAll();
    });
  }

  var voDetailClose = document.getElementById("voDetailClose");
  if (voDetailClose) {
    voDetailClose.addEventListener("click", hideDetail);
  }

  var voPrintBtn = document.getElementById("voPrintBtn");
  if (voPrintBtn) {
    voPrintBtn.addEventListener("click", printDetail);
  }

  tryBootWithToken();
})();
