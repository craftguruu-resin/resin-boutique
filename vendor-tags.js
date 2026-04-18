(function () {
  "use strict";

  var V = window.CraftguruVendor;
  var B = window.VendorTagBuilders;
  if (!V || !B) return;
  var vf = V.vendorFetch || fetch;

  function on(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  }

  var allOrders = [];
  var filter = "all";
  var ffFilter = "all";
  var searchQ = "";
  var lastOrder = null;
  /** Set from URL ?range=today|week|month|revenue — filters table + drives product rollup. */
  var rangeFilter = null;
  var rollupDebounce = null;

  function parseRangeFromUrl() {
    try {
      var v = String(new URLSearchParams(window.location.search).get("range") || "").toLowerCase();
      if (v === "today" || v === "week" || v === "month" || v === "revenue") return v;
    } catch (_) {}
    return null;
  }

  function istYmdNow() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }

  function istYmdFromIso(iso) {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }

  function istYmNow() {
    return istYmdNow().slice(0, 7);
  }

  function istYmFromIso(iso) {
    return istYmdFromIso(iso).slice(0, 7);
  }

  function applyRangeDefaults() {
    rangeFilter = parseRangeFromUrl();
    if (!rangeFilter) return;
    if (rangeFilter === "week" || rangeFilter === "month" || rangeFilter === "revenue") {
      filter = "paid";
    }
  }

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    var rounded = Math.round(x * 100) / 100;
    return rounded.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return B.esc(s);
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

  function showDesk(on) {
    var desk = document.getElementById("vtDeskSection");
    if (desk) desk.hidden = !on;
  }

  function payBadge(st) {
    if (st === "paid") return "<span class='vs-badge vs-badge--paid'>Paid</span>";
    return "<span class='vs-badge vs-badge--pending'>" + esc(st || "—") + "</span>";
  }

  function filtered() {
    return allOrders.filter(function (o) {
      if (rangeFilter === "today") {
        if (istYmdFromIso(o.createdAt) !== istYmdNow()) return false;
      } else if (rangeFilter === "week") {
        if (o.paymentStatus !== "paid") return false;
        if (new Date(o.createdAt).getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000) return false;
      } else if (rangeFilter === "month" || rangeFilter === "revenue") {
        if (o.paymentStatus !== "paid") return false;
        if (istYmFromIso(o.createdAt) !== istYmNow()) return false;
      }
      if (filter === "paid" && o.paymentStatus !== "paid") return false;
      if (filter === "pending" && o.paymentStatus !== "pending_payment") return false;
      var fs = o.fulfillmentStatus || "new";
      if (ffFilter === "open") {
        if (fs === "delivered" || fs === "cancelled") return false;
      } else if (ffFilter !== "all" && fs !== ffFilter) {
        return false;
      }
      if (searchQ) {
        var hay = (o.orderId + " " + (o.tagRef || "") + " " + (o.guestName || "") + " " + (o.guestPhone || "")).toLowerCase();
        if (hay.indexOf(searchQ) === -1) return false;
      }
      return true;
    });
  }

  function fulLabel(s) {
    var m = {
      new: "New",
      packed: "Packed",
      shipping: "Out for delivery",
      shipped: "Shipped",
      delivered: "Delivered",
      cancelled: "Cancelled",
    };
    return m[s] || s || "New";
  }

  function syncToolbar() {
    document.querySelectorAll(".vt-filter").forEach(function (b) {
      b.classList.toggle("vs-pill--active", (b.getAttribute("data-filter") || "") === filter);
    });
    document.querySelectorAll(".vt-ful-filter").forEach(function (b) {
      b.classList.toggle("vs-pill--active", (b.getAttribute("data-ff") || "") === ffFilter);
    });
  }

  function renderFulEditor(o) {
    var cur = o.fulfillmentStatus || "new";
    var opts = ["new", "packed", "shipping", "shipped", "delivered", "cancelled"];
    return (
      "<div class='vs-ful-cell'>" +
      "<div class='vs-ful-badge vs-ful-badge--" +
      esc(cur) +
      "'>" +
      esc(fulLabel(cur)) +
      "</div><div class='vs-ful-pills' data-oid='" +
      esc(String(o.orderId)) +
      "'>" +
      opts
        .map(function (x) {
          var on = x === cur ? " vs-ful-pill--active" : "";
          return (
            "<button type='button' class='vs-ful-pill" +
            on +
            "' data-val='" +
            esc(x) +
            "'>" +
            esc(fulLabel(x)) +
            "</button>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  function renderTable() {
    var tb = document.getElementById("vtTbody");
    if (!tb) return;
    var rows = filtered();
    tb.innerHTML = rows
      .map(function (o) {
        return (
          "<tr data-oid='" +
          esc(String(o.orderId)) +
          "'><td><strong>#" +
          esc(String(o.orderId)) +
          "</strong><br/><span class='vs-muted'>" +
          esc(o.tagRef || "") +
          "</span></td><td>" +
          esc(o.guestName || "") +
          "<br/><span class='vs-muted'>" +
          esc(o.guestPhone || "") +
          "</span></td><td>" +
          esc(money(o.total != null ? o.total : o.totals && o.totals.total)) +
          "</td><td>" +
          payBadge(o.paymentStatus) +
          "</td><td>" +
          renderFulEditor(o) +
          "</td><td><button type='button' class='vs-btn vs-btn--primary vt-open' data-oid='" +
          esc(String(o.orderId)) +
          "'>Tag</button></td></tr>"
        );
      })
      .join("");

    tb.querySelectorAll(".vt-open").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openDetail(btn.getAttribute("data-oid"));
      });
    });
    tb.querySelectorAll(".vs-ful-pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var wrap = btn.closest(".vs-ful-pills");
        if (!wrap) return;
        patchFulfillment(wrap.getAttribute("data-oid"), btn.getAttribute("data-val"));
      });
    });
    syncToolbar();
    scheduleRangeRollup();
  }

  function scheduleRangeRollup() {
    if (!rangeFilter) return;
    updateRangeBannerOnly();
    var rollup = document.getElementById("vtProductRollup");
    if (!rollup) return;
    if (rollupDebounce) clearTimeout(rollupDebounce);
    rollupDebounce = setTimeout(function () {
      rollupDebounce = null;
      refreshRangeRollupFetch();
    }, 480);
  }

  function refreshRangeRollupFetch() {
    var rollup = document.getElementById("vtProductRollup");
    if (!rollup || !rangeFilter) return;
    rollup.innerHTML = "<p class='vs-muted'>Loading line-item totals…</p>";
    var ids = filtered()
      .map(function (o) {
        return o.orderId;
      })
      .slice(0, 40);
    if (!ids.length) {
      rollup.innerHTML = "<p class='vs-muted'>No orders in this range.</p>";
      return;
    }
    fetchOrderItemsAggregate(ids)
      .then(function (acc) {
        renderProductRollup(rollup, acc);
      })
      .catch(function () {
        rollup.innerHTML = "<p class='vs-err'>Could not load line items for rollup.</p>";
      });
  }

  function patchFulfillment(orderId, status) {
    var base = V.apiBase();
    vf(V.vendorApiUrl("/api/vendor/order/" + encodeURIComponent(orderId) + "/fulfillment"), {
      method: "PATCH",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify({ fulfillmentStatus: status }),
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Update failed");
        });
      })
      .then(function () {
        allOrders.forEach(function (o) {
          if (String(o.orderId) === String(orderId)) o.fulfillmentStatus = status;
        });
        renderTable();
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
        loadOrders();
      });
  }

  function openDetail(orderId) {
    var base = V.apiBase();
    var panel = document.getElementById("vtDetail");
    var body = document.getElementById("vtDetailBody");
    var meta = document.getElementById("vtDetailMeta");
    panel.removeAttribute("hidden");
    body.innerHTML = "<p class='vs-muted'>Loading…</p>";
    vf(V.vendorApiUrl("/api/vendor/order/" + encodeURIComponent(orderId)), { headers: V.authHeaders() })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Not found");
          return x.json.order;
        });
      })
      .then(function (order) {
        lastOrder = order;
        if (meta) {
          meta.innerHTML =
            esc(order.tagRef || "") +
            " · " +
            esc(order.paymentStatus || "") +
            " · <strong>" +
            esc(B.money(order.totals && order.totals.total)) +
            "</strong>";
        }
        body.innerHTML = B.buildInlineTagBillHtml(order);
      })
      .catch(function (e) {
        body.innerHTML = "<p class='vs-err'>" + esc(String((e && e.message) || e)) + "</p>";
        lastOrder = null;
      });
  }

  on("vtPrintBtn", "click", function () {
    if (!lastOrder) return;
    var html = B.buildPrintHtml(lastOrder);
    var w = window.open("", "_blank");
    if (!w) {
      window.alert("Allow pop-ups to print.");
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
  });

  function loadOrders() {
    var base = V.apiBase();
    var lim = rangeFilter ? 200 : 80;
    return vf(V.vendorApiUrl("/api/vendor/orders/recent?limit=" + lim), { headers: V.authHeaders() })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) {
            return V.explainVendor401(base);
          }
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Load failed");
          return x.json.orders || [];
        });
      })
      .then(function (list) {
        allOrders = list;
        renderTable();
      });
  }

  function updateRangeBannerOnly() {
    var ctx = document.getElementById("vtRangeContext");
    var title = document.getElementById("vtRangeTitle");
    var sub = document.getElementById("vtRangeSub");
    if (!ctx) return;
    if (!rangeFilter) {
      ctx.hidden = true;
      return;
    }
    ctx.hidden = false;
    if (rangeFilter === "today") {
      if (title) title.textContent = "Dashboard · today (IST)";
      if (sub) sub.textContent = "Every order placed today, any payment status. Adjust pills above to narrow further.";
    } else if (rangeFilter === "week") {
      if (title) title.textContent = "Dashboard · last 7 days (paid)";
      if (sub) sub.textContent = "Paid orders in the rolling week. Matches the “Last 7 days” KPI.";
    } else if (rangeFilter === "month") {
      if (title) title.textContent = "Dashboard · this month (paid, IST)";
      if (sub) sub.textContent = "Paid orders in the current calendar month in Asia/Kolkata.";
    } else {
      if (title) title.textContent = "Dashboard · amount received (this month)";
      if (sub) sub.textContent = "Same paid-month slice as the revenue KPI — product mix below.";
    }
  }

  function fetchOrderItemsAggregate(orderIds) {
    var acc = {};
    function mergeItems(items) {
      (items || []).forEach(function (it) {
        var k = (it.productId && String(it.productId).trim()) || String(it.name || "").trim() || "item";
        var label = it.name || k;
        if (!acc[k]) acc[k] = { label: label, qty: 0, revenue: 0 };
        var q = Number(it.qty) || 0;
        acc[k].qty += q;
        acc[k].revenue += (Number(it.unitPrice) || 0) * q;
      });
    }
    var idx = 0;
    var chunk = 5;
    function runChunk() {
      var batch = orderIds.slice(idx, idx + chunk);
      idx += chunk;
      if (!batch.length) return Promise.resolve(acc);
      return Promise.all(
        batch.map(function (id) {
          return vf(V.vendorApiUrl("/api/vendor/order/" + encodeURIComponent(id)), { headers: V.authHeaders() }).then(
            function (res) {
              return V.parseApiJson(res).then(function (x) {
                if (!x.okHttp || !x.json.ok || !x.json.order) return;
                mergeItems(x.json.order.items);
              });
            }
          );
        })
      ).then(runChunk);
    }
    return runChunk();
  }

  function renderProductRollup(el, acc) {
    var rows = Object.keys(acc)
      .map(function (k) {
        return acc[k];
      })
      .sort(function (a, b) {
        return b.qty - a.qty;
      });
    if (!rows.length) {
      el.innerHTML = "<p class='vs-muted'>No line items in fetched orders.</p>";
      return;
    }
    var maxQ = rows.reduce(function (m, r) {
      return Math.max(m, r.qty || 0);
    }, 1);
    el.innerHTML = rows
      .map(function (r) {
        var pct = Math.round(((Number(r.qty) || 0) / maxQ) * 100);
        return (
          "<div class='vd-bar-row'><span class='vd-bar-row__label'>" +
          esc(r.label) +
          "</span><span class='vd-bar-row__val'>Qty " +
          esc(String(r.qty)) +
          " · ₹" +
          esc(money(r.revenue)) +
          "</span><div class='vd-bar-row__track'><div class='vd-bar-row__fill vd-bar-row__fill--green' style='width:" +
          pct +
          "%'></div></div></div>"
        );
      })
      .join("");
  }

  function showOrdersLoadErr(e) {
    var tb = document.getElementById("vtTbody");
    if (tb) {
      tb.innerHTML =
        "<tr><td colspan='6' class='vs-err'>" + esc(String((e && e.message) || e)) + "</td></tr>";
    }
  }

  function boot() {
    applyRangeDefaults();
    showDesk(true);
    loadOrders().catch(showOrdersLoadErr);
    if (rangeFilter) {
      try {
        var ctx = document.getElementById("vtRangeContext");
        if (ctx) {
          setTimeout(function () {
            ctx.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 400);
        }
      } catch (_) {}
    }
  }

  on("vtRefreshBtn", "click", function () {
    loadOrders().catch(showOrdersLoadErr);
  });

  document.querySelectorAll(".vt-filter").forEach(function (btn) {
    btn.addEventListener("click", function () {
      filter = btn.getAttribute("data-filter") || "all";
      renderTable();
    });
  });

  document.querySelectorAll(".vt-ful-filter").forEach(function (btn) {
    btn.addEventListener("click", function () {
      ffFilter = btn.getAttribute("data-ff") || "all";
      renderTable();
    });
  });

  on("vtSearch", "input", function () {
    searchQ = String(this.value || "")
      .toLowerCase()
      .trim();
    renderTable();
  });

  boot();
})();
