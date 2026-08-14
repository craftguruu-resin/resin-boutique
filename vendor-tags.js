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
  var shipFilter = "all";
  var tableSort = { key: "createdAt", dir: "desc" };
  var lastOrder = null;
  /** Set from URL ?range=today|week|month|revenue — filters table + drives product rollup. */
  var rangeFilter = null;
  var rollupDebounce = null;
  /** Cached from GET /api/shipping/providers */
  var shippingProviders = null;

  function loadShippingProviders() {
    return vf(V.vendorApiUrl("/api/shipping/providers"))
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (!x.okHttp || !x.json || !x.json.ok) return null;
          return x.json;
        });
      })
      .then(function (j) {
        if (j && Array.isArray(j.providers)) shippingProviders = j.providers;
        return j;
      })
      .catch(function () {
        return null;
      });
  }

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
    var s = String(st || "").toLowerCase();
    if (s === "paid") return "<span class='vs-badge vs-badge--paid'>Paid</span>";
    if (s === "pending_payment") return "<span class='vs-badge vs-badge--pending'>Pending</span>";
    if (s === "failed") return "<span class='vs-badge vs-badge--err'>Failed</span>";
    if (s === "refunded") return "<span class='vs-badge'>Refunded</span>";
    return "<span class='vs-badge vs-badge--pending'>" + esc(st || "—") + "</span>";
  }

  function payMethodLabel(m) {
    var s = String(m || "")
      .trim()
      .toLowerCase();
    if (s === "cod") return "COD";
    if (s === "razorpay") return "Razorpay";
    return m || "—";
  }

  function fmtShortDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    } catch (_) {
      return "—";
    }
  }

  function shipmentBadge(o) {
    var st = String(o.shipmentStatus || "").trim();
    var code = String(o.shipmentStatusCode || "").toLowerCase();
    if (!st && !code) return "<span class='vs-muted'>—</span>";
    var cls = "vs-badge";
    if (code === "delivered") cls += " vs-badge--paid";
    else if (code === "out_for_delivery" || code === "in_transit") cls += " vs-badge--pending";
    else if (code === "returned" || code === "cancelled" || code === "lost" || code === "undelivered") cls += " vs-badge--err";
    return "<span class='" + cls + "'>" + esc(st || code) + "</span>";
  }

  function isActiveShipment(o) {
    var code = String(o.shipmentStatusCode || "").toLowerCase();
    if (!String(o.trackingNumber || "").trim()) return false;
    return code && code !== "delivered" && code !== "returned" && code !== "cancelled" && code !== "lost" && code !== "undelivered";
  }

  function renderShipmentTimeline(timeline) {
    if (!timeline || !timeline.steps || !timeline.steps.length) return "";
    var steps = timeline.steps
      .map(function (s) {
        return (
          "<li class='cg-ship-timeline__step cg-ship-timeline__step--" +
          esc(s.state) +
          "'><span class='cg-ship-timeline__dot'></span><div class='cg-ship-timeline__body'><strong>" +
          esc(s.label) +
          "</strong>" +
          (s.timestamp ? "<span class='vs-muted'>" + esc(fmtShortDate(s.timestamp)) + "</span>" : "") +
          "</div></li>"
        );
      })
      .join("");
    var alert =
      timeline.alert && timeline.alert.label
        ? "<p class='vs-err cg-ship-timeline__alert'>" + esc(timeline.alert.label) + "</p>"
        : "";
    return "<ol class='cg-ship-timeline cg-ship-timeline--admin'>" + steps + "</ol>" + alert;
  }

  function buildCourierSelectOptions(selected) {
    var sel = String(selected || "BigShip").trim();
    var providers = shippingProviders
      ? shippingProviders.map(function (p) {
          return {
            value: p.displayName || p.id,
            label: p.displayName || p.id,
            configured: p.configured,
          };
        })
      : [
          { value: "BigShip", label: "BigShip", configured: false },
          { value: "Delhivery", label: "Delhivery", configured: false },
        ];
    return providers
      .map(function (p) {
        var cfgHint = p.configured ? "" : " (API not configured)";
        return (
          "<option value='" +
          esc(p.value) +
          "'" +
          (sel === p.value ? " selected" : "") +
          ">" +
          esc(p.label + cfgHint) +
          "</option>"
        );
      })
      .join("");
  }

  function syncButtonLabelForCourier(courierName) {
    var n = String(courierName || "")
      .trim()
      .toLowerCase();
    if (n === "bigship") return "Sync with BigShip";
    if (n === "delhivery") return "Sync with Delhivery";
    return "Sync tracking";
  }

  function wireShipmentCourierSelect() {
    var sel = document.getElementById("vtShipCourier");
    var syncBtn = document.getElementById("vtSyncShipmentBtn");
    if (!sel || !syncBtn) return;
    function refreshSyncLabel() {
      syncBtn.textContent = syncButtonLabelForCourier(sel.value);
    }
    refreshSyncLabel();
    if (sel.dataset.cgCourierWired === "1") return;
    sel.dataset.cgCourierWired = "1";
    sel.addEventListener("change", refreshSyncLabel);
  }

  function buildShipmentForm(order) {
    var s = (order && order.shipment) || {};
    var ship = order || {};
    var courierSel = ship.courierName || s.courierName || "BigShip";
    var courierPartner =
      (s.courierPartner || ship.courierPartner || "").trim() ||
      (function () {
        var hist = s.shipmentHistory || ship.shipmentHistory;
        if (!Array.isArray(hist)) return "";
        for (var hi = hist.length - 1; hi >= 0; hi--) {
          if (hist[hi] && hist[hi].courierPartner) return String(hist[hi].courierPartner).trim();
        }
        return "";
      })();
    var partnerRow = courierPartner
      ? "<div class='vs-field'><label>Carrier partner</label><p class='cg-ship-readonly'>" + esc(courierPartner) + "</p></div>"
      : "";
    return (
      "<div class='vs-card cg-ship-panel' id='vtShipmentPanel'>" +
      "<p class='vs-section-title' style='margin-top:0'>Shipment information</p>" +
      "<p class='vs-muted cg-ship-panel__hint'>Select shipping provider and AWB. Live validation runs when API credentials are configured on the server.</p>" +
      "<div id='vtShipmentMsg' class='vs-err' hidden></div>" +
      "<div class='vs-form-grid cg-ship-form-grid'>" +
      "<div class='vs-field'><label for='vtShipCourier'>Courier partner</label>" +
      "<select id='vtShipCourier'>" +
      buildCourierSelectOptions(courierSel) +
      "</select></div>" +
      "<div class='vs-field'><label for='vtShipAwb'>Tracking ID / AWB</label>" +
      "<input id='vtShipAwb' type='text' autocomplete='off' value='" +
      esc(ship.trackingNumber || s.trackingNumber || "") +
      "' placeholder='Tracking / AWB number' /></div>" +
      "<div class='vs-field'><label>Shipment status</label><p class='cg-ship-readonly'>" +
      esc(ship.shipmentStatus || s.shipmentStatus || "—") +
      (s.lastTrackingSync ? " <span class='vs-muted'>(synced " + esc(fmtShortDate(s.lastTrackingSync)) + ")</span>" : "") +
      "</p></div>" +
      partnerRow +
      "<div class='vs-field'><label for='vtShipDispatch'>Dispatch date</label>" +
      "<input id='vtShipDispatch' type='date' value='" +
      esc((ship.dispatchDate || s.dispatchDate || "").slice(0, 10)) +
      "' /></div>" +
      "<div class='vs-field'><label for='vtShipEta'>Est. delivery</label>" +
      "<input id='vtShipEta' type='date' value='" +
      esc((ship.estimatedDeliveryDate || s.estimatedDeliveryDate || "").slice(0, 10)) +
      "' /></div>" +
      "<div class='vs-field'><label>Delivered date</label><p class='cg-ship-readonly'>" +
      esc(fmtShortDate(ship.actualDeliveryDate || s.actualDeliveryDate)) +
      "</p></div>" +
      "<div class='vs-field vs-field--wide'><label for='vtShipTrackUrl'>Tracking URL (optional)</label>" +
      "<input id='vtShipTrackUrl' type='url' value='" +
      esc(ship.trackingUrl || s.trackingUrl || "") +
      "' placeholder='Optional carrier tracking page URL' /></div>" +
      "<div class='vs-field vs-field--wide'><label for='vtShipNotes'>Shipment notes</label>" +
      "<textarea id='vtShipNotes' rows='1' placeholder='Internal notes for studio'>" +
      esc(ship.shipmentNotes || s.shipmentNotes || "") +
      "</textarea></div>" +
      "</div>" +
      (s.timeline ? renderShipmentTimeline(s.timeline) : "") +
      "<div class='vs-row-actions' style='margin-top:0.75rem'>" +
      "<button type='button' class='vs-btn vs-btn--primary' id='vtSaveShipmentBtn' data-oid='" +
      esc(String(order.orderId)) +
      "'>Save shipment details</button> " +
      "<button type='button' class='vs-btn' id='vtSyncShipmentBtn' data-oid='" +
      esc(String(order.orderId)) +
      "'>" +
      esc(syncButtonLabelForCourier(courierSel)) +
      "</button>" +
      "</div></div>"
    );
  }

  function saveShipment(orderId) {
    var msgEl = document.getElementById("vtShipmentMsg");
    showErr(msgEl, "");
    var body = {
      courierName: (document.getElementById("vtShipCourier") && document.getElementById("vtShipCourier").value) || "BigShip",
      trackingNumber: document.getElementById("vtShipAwb") && document.getElementById("vtShipAwb").value,
      trackingUrl: document.getElementById("vtShipTrackUrl") && document.getElementById("vtShipTrackUrl").value,
      dispatchDate: document.getElementById("vtShipDispatch") && document.getElementById("vtShipDispatch").value,
      estimatedDeliveryDate: document.getElementById("vtShipEta") && document.getElementById("vtShipEta").value,
      shipmentNotes: document.getElementById("vtShipNotes") && document.getElementById("vtShipNotes").value,
      validateWithCourier: true,
    };
    vf(V.vendorApiUrl("/api/vendor/order/" + encodeURIComponent(orderId) + "/shipment"), {
      method: "PATCH",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Save failed");
          return x.json;
        });
      })
      .then(function (j) {
        if (msgEl) {
          msgEl.className = "vs-muted";
          showErr(msgEl, j.message || "Shipment saved.");
        }
        allOrders.forEach(function (o) {
          if (String(o.orderId) !== String(orderId)) return;
          if (j.shipment) {
            o.shipment = j.shipment;
            o.trackingNumber = j.shipment.trackingNumber;
            o.courierName = j.shipment.courierName;
            o.shipmentStatus = j.shipment.shipmentStatus;
            o.shipmentStatusCode = j.shipment.shipmentStatusCode;
            o.dispatchDate = j.shipment.dispatchDate;
            o.estimatedDeliveryDate = j.shipment.estimatedDeliveryDate;
          }
        });
        renderTable();
        openDetail(orderId);
      })
      .catch(function (e) {
        if (msgEl) {
          msgEl.className = "vs-err";
          showErr(msgEl, String((e && e.message) || e));
        }
      });
  }

  function syncShipment(orderId) {
    vf(V.vendorApiUrl("/api/vendor/order/" + encodeURIComponent(orderId) + "/shipment/sync"), {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: "{}",
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Sync failed");
          return x.json;
        });
      })
      .then(function (j) {
        openDetail(orderId);
        loadOrders().catch(function () {});
        var syncMsg = (j && j.message) || "Shipment synced with shipping provider.";
        window.alert(syncMsg);
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
  }

  function patchPaymentReceived(orderId) {
    vf(V.vendorApiUrl("/api/vendor/order/" + encodeURIComponent(orderId) + "/payment-received"), {
      method: "PATCH",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: "{}",
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Update failed");
          return x.json;
        });
      })
      .then(function (j) {
        allOrders.forEach(function (o) {
          if (String(o.orderId) === String(orderId)) o.paymentStatus = j.paymentStatus || "paid";
        });
        if (lastOrder && String(lastOrder.orderId) === String(orderId)) {
          lastOrder.paymentStatus = j.paymentStatus || "paid";
        }
        renderTable();
        if (lastOrder) openDetail(orderId);
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
        loadOrders();
      });
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
      } else       if (ffFilter !== "all" && fs !== ffFilter) {
        return false;
      }
      if (shipFilter === "none") {
        if (String(o.trackingNumber || "").trim()) return false;
      } else if (shipFilter === "delivered") {
        if (String(o.shipmentStatusCode || "").toLowerCase() !== "delivered") return false;
      } else if (shipFilter === "active") {
        if (!isActiveShipment(o)) return false;
      }
      if (searchQ) {
        var hay = (
          o.orderId +
          " " +
          (o.tagRef || "") +
          " " +
          (o.guestName || "") +
          " " +
          (o.guestPhone || "") +
          " " +
          (o.trackingNumber || "") +
          " " +
          (o.shipmentStatus || "")
        ).toLowerCase();
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
    document.querySelectorAll(".vt-ship-filter").forEach(function (b) {
      b.classList.toggle("vs-pill--active", (b.getAttribute("data-ship") || "") === shipFilter);
    });
    document.querySelectorAll(".vt-sort").forEach(function (b) {
      var k = b.getAttribute("data-sort") || "";
      var on = k === tableSort.key;
      b.classList.toggle("vt-sort--active", on);
      b.setAttribute("aria-sort", on ? (tableSort.dir === "asc" ? "ascending" : "descending") : "none");
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

  function sortRows(rows) {
    var key = tableSort.key;
    var dir = tableSort.dir === "asc" ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (key === "orderId") {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
      } else if (key === "dispatchDate" || key === "estimatedDeliveryDate" || key === "createdAt") {
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      } else {
        av = String(av || "").toLowerCase();
        bv = String(bv || "").toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function renderTable() {
    var tb = document.getElementById("vtTbody");
    if (!tb) return;
    var rows = sortRows(filtered());
    tb.innerHTML = rows
      .map(function (o) {
        return (
          "<tr data-oid='" +
          esc(String(o.orderId)) +
          "'><td><strong>#" +
          esc(String(o.orderId)) +
          "</strong><br/><span class='vs-muted'>" +
          esc(o.tagRef || "") +
          "</span><br/><span class='vs-muted'>₹" +
          esc(money(o.total != null ? o.total : o.totals && o.totals.total)) +
          "</span></td><td>" +
          esc(o.guestName || "") +
          "<br/><span class='vs-muted'>" +
          esc(o.guestPhone || "") +
          "</span></td><td>" +
          esc(o.trackingNumber || "—") +
          "</td><td>" +
          esc(o.courierName || "—") +
          "</td><td>" +
          shipmentBadge(o) +
          "</td><td>" +
          payBadge(o.paymentStatus) +
          "<br/><span class='vs-muted'>" +
          esc(payMethodLabel(o.paymentMethod)) +
          "</span></td><td>" +
          esc(fmtShortDate(o.dispatchDate)) +
          "</td><td>" +
          esc(fmtShortDate(o.estimatedDeliveryDate)) +
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
            " · " +
            esc(payMethodLabel(order.paymentMethod)) +
            " · <strong>" +
            esc(B.money(order.totals && order.totals.total)) +
            "</strong>";
        }
        var markHtml = "";
        if (
          String(order.paymentMethod || "")
            .trim()
            .toLowerCase() === "cod" &&
          String(order.paymentStatus || "").toLowerCase() === "pending_payment"
        ) {
          markHtml =
            '<p style="margin:0 0 0.75rem"><button type="button" class="vs-btn vs-btn--primary" id="vtMarkPaidBtn" data-oid="' +
            esc(String(order.orderId)) +
            '">Mark payment received</button></p>';
        }
        body.innerHTML =
          markHtml +
          "<div class='vt-detail-layout'>" +
          "<div class='vt-detail-layout__tag'>" +
          B.buildInlineTagBillHtml(order) +
          "</div>" +
          "<div class='vt-detail-layout__ship'>" +
          buildShipmentForm(order) +
          "</div>" +
          "</div>";
        var saveBtn = document.getElementById("vtSaveShipmentBtn");
        if (saveBtn) {
          saveBtn.addEventListener("click", function () {
            saveShipment(saveBtn.getAttribute("data-oid"));
          });
        }
        var syncBtn = document.getElementById("vtSyncShipmentBtn");
        if (syncBtn) {
          syncBtn.addEventListener("click", function () {
            syncShipment(syncBtn.getAttribute("data-oid"));
          });
        }
        wireShipmentCourierSelect();
        var markBtn = document.getElementById("vtMarkPaidBtn");
        if (markBtn) {
          markBtn.addEventListener("click", function () {
            patchPaymentReceived(markBtn.getAttribute("data-oid"));
          });
        }
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
        "<tr><td colspan='10' class='vs-err'>" + esc(String((e && e.message) || e)) + "</td></tr>";
    }
  }

  function boot() {
    applyRangeDefaults();
    showDesk(true);
    loadShippingProviders().catch(function () {});
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

  document.querySelectorAll(".vt-ship-filter").forEach(function (btn) {
    btn.addEventListener("click", function () {
      shipFilter = btn.getAttribute("data-ship") || "all";
      renderTable();
    });
  });

  document.querySelectorAll(".vt-sort").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var k = btn.getAttribute("data-sort") || "orderId";
      if (tableSort.key === k) tableSort.dir = tableSort.dir === "asc" ? "desc" : "asc";
      else {
        tableSort.key = k;
        tableSort.dir = "desc";
      }
      renderTable();
    });
  });

  function downloadOrdersExport(format) {
    var params = new URLSearchParams();
    params.set("format", format);
    params.set("payment", filter);
    params.set("fulfillment", ffFilter);
    params.set("ship", shipFilter);
    if (searchQ) params.set("q", searchQ);
    var fromEl = document.getElementById("vtExportFrom");
    var toEl = document.getElementById("vtExportTo");
    var custEl = document.getElementById("vtExportCustomer");
    if (fromEl && fromEl.value) params.set("from", fromEl.value);
    if (toEl && toEl.value) params.set("to", toEl.value);
    if (custEl && custEl.value.trim()) params.set("customer", custEl.value.trim());
    var url = V.vendorApiUrl("/api/vendor/orders/export?" + params.toString());
    return vf(url, { headers: V.authHeaders() })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw new Error(t || res.statusText || "Export failed");
          });
        }
        return res.blob();
      })
      .then(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = format === "xlsx" ? "craftguru-orders.xlsx" : "craftguru-orders.pdf";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 1200);
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
  }

  on("vtExportPdf", "click", function () {
    downloadOrdersExport("pdf");
  });
  on("vtExportXlsx", "click", function () {
    downloadOrdersExport("xlsx");
  });

  on("vtSearch", "input", function () {
    searchQ = String(this.value || "")
      .toLowerCase()
      .trim();
    renderTable();
  });

  boot();
})();
