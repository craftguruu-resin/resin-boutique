(function () {
  "use strict";

  var body = document.body;
  if (!body || !body.classList.contains("vendor-saas")) return;
  var nav = body.getAttribute("data-vendor-nav") || "";
  if (nav !== "dashboard" && nav !== "tags") return;

  function syncStates() {
    if (nav === "dashboard") {
      document.querySelectorAll("[data-vd-period]").forEach(function (button) {
        var active = button.classList.contains("vd-ledger__tab--active");
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
    }
    if (nav === "tags") {
      document.querySelectorAll(".vt-filter, .vt-ful-filter, .vt-ship-filter").forEach(function (button) {
        button.setAttribute("aria-pressed", button.classList.contains("vs-pill--active") ? "true" : "false");
      });
      document.querySelectorAll(".vt-sort").forEach(function (button) {
        if (!button.hasAttribute("aria-sort")) button.setAttribute("aria-sort", "none");
      });
      var detail = document.getElementById("vtDetail");
      if (detail) detail.setAttribute("aria-live", "polite");
    }
  }

  function addBreadcrumb(label) {
    if (document.getElementById("cgVendorBreadcrumb")) return;
    var content = document.querySelector(".vs-content");
    if (!content) return;
    var nav = document.createElement("nav");
    nav.id = "cgVendorBreadcrumb";
    nav.className = "cg-vendor-breadcrumb";
    nav.setAttribute("aria-label", "Vendor location");
    nav.innerHTML = "<a href='vendor-dashboard.html'>Vendor desk</a><span aria-hidden='true'>/</span><strong>" + label + "</strong>";
    content.insertBefore(nav, content.firstChild);
  }

  function addDashboardCommandCenter() {
    if (nav !== "dashboard" || document.getElementById("cgVendorAttention")) return;
    addBreadcrumb("Dashboard");
    var content = document.querySelector("body[data-vendor-nav='dashboard'] .vs-content");
    var desk = document.getElementById("vdDeskSection");
    if (!content || !desk) return;
    var command = document.createElement("section");
    command.className = "cg-vendor-command-strip";
    command.setAttribute("aria-label", "Dashboard actions");
    command.innerHTML =
      "<div><strong>Studio command centre</strong><span>Monitor orders, revenue, and today’s fulfilment work.</span></div>" +
      "<div class='cg-vendor-command-strip__actions'><span class='cg-vendor-last-updated' id='cgVendorLastUpdated'>Ready</span><a class='vs-btn vs-btn--ghost' href='vendor-tags.html?range=today'>Open today’s orders</a></div>";
    content.insertBefore(command, desk);

    var attention = document.createElement("section");
    attention.id = "cgVendorAttention";
    attention.className = "cg-vendor-attention";
    attention.setAttribute("aria-labelledby", "cgVendorAttentionTitle");
    attention.innerHTML =
      "<div class='cg-vendor-attention__head'><div><p class='cg-vendor-eyebrow'>Priority queue</p><h2 id='cgVendorAttentionTitle'>Needs attention</h2></div><a href='vendor-tags.html'>View all orders</a></div>" +
      "<div class='cg-vendor-attention__grid'>" +
      "<a class='cg-vendor-attention__item' href='vendor-tags.html'><span class='cg-vendor-attention__icon'>₹</span><span><strong>Payment review</strong><small>Open pending or COD orders</small></span><span aria-hidden='true'>→</span></a>" +
      "<a class='cg-vendor-attention__item' href='vendor-tags.html?range=today'><span class='cg-vendor-attention__icon'>↗</span><span><strong>Dispatch board</strong><small>Prepare today’s fulfilment queue</small></span><span aria-hidden='true'>→</span></a>" +
      "<a class='cg-vendor-attention__item' href='vendor-tags.html#returns'><span class='cg-vendor-attention__icon'>↩</span><span><strong>Returns</strong><small>Review customer return requests</small></span><span aria-hidden='true'>→</span></a>" +
      "</div>";
    desk.insertBefore(attention, desk.firstChild);
    var stamp = document.getElementById("cgVendorLastUpdated");
    if (stamp) stamp.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function addOrdersCommandCenter() {
    if (nav !== "tags" || document.getElementById("cgVendorOrderSummary")) return;
    addBreadcrumb("Orders");
    var desk = document.getElementById("vtDeskSection");
    var toolbar = desk && desk.querySelector(".vs-card--toolbar");
    if (!desk || !toolbar) return;
    var summary = document.createElement("section");
    summary.id = "cgVendorOrderSummary";
    summary.className = "cg-vendor-order-summary";
    summary.setAttribute("aria-label", "Order views");
    summary.innerHTML =
      "<div class='cg-vendor-order-summary__head'><div><p class='cg-vendor-eyebrow'>Order command centre</p><h2>Work queue</h2></div><span id='cgVendorOrderSummaryCount' class='cg-vendor-last-updated'>Loading orders…</span></div>" +
      "<div class='cg-vendor-order-summary__views'>" +
      "<button type='button' class='cg-vendor-view' data-cg-filter='all'><strong>All orders</strong><small>Every order</small></button>" +
      "<button type='button' class='cg-vendor-view' data-cg-filter='paid'><strong>Paid</strong><small>Ready to fulfil</small></button>" +
      "<button type='button' class='cg-vendor-view' data-cg-filter='pending'><strong>Payment pending</strong><small>Needs review</small></button>" +
      "<button type='button' class='cg-vendor-view' data-cg-ful='open'><strong>Open fulfilment</strong><small>Not delivered</small></button>" +
      "<button type='button' class='cg-vendor-view' data-cg-ship='none'><strong>No AWB</strong><small>Shipment setup</small></button>" +
      "</div>";
    toolbar.parentNode.insertBefore(summary, toolbar);
    summary.querySelectorAll("[data-cg-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = document.querySelector(".vt-filter[data-filter='" + button.getAttribute("data-cg-filter") + "']");
        if (target) target.click();
      });
    });
    summary.querySelectorAll("[data-cg-ful]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = document.querySelector(".vt-ful-filter[data-ff='" + button.getAttribute("data-cg-ful") + "']");
        if (target) target.click();
      });
    });
    summary.querySelectorAll("[data-cg-ship]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = document.querySelector(".vt-ship-filter[data-ship='" + button.getAttribute("data-cg-ship") + "']");
        if (target) target.click();
      });
    });
  }

  function annotateStatus() {
    ["vdErr", "vtErr", "vtMsg", "vrMsg"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) {
        node.setAttribute("role", "status");
        node.setAttribute("aria-live", "polite");
      }
    });
  }

  function enhanceOrders() {
    if (nav !== "tags") return;
    var detail = document.getElementById("vtDetail");
    var head = detail && detail.querySelector(".vt-detail__head");
    if (head && !document.getElementById("cgVendorDetailClose")) {
      var close = document.createElement("button");
      close.type = "button";
      close.id = "cgVendorDetailClose";
      close.className = "vs-btn vt-detail__close";
      close.textContent = "Close";
      close.setAttribute("aria-label", "Close order details");
      close.addEventListener("click", function () {
        detail.hidden = true;
        var first = document.querySelector("#vtTbody .vt-open");
        if (first) first.focus();
      });
      head.appendChild(close);
    }
    var tbody = document.getElementById("vtTbody");
    var table = tbody && tbody.closest(".vs-table-wrap");
    if (tbody && table) {
      var count = document.getElementById("cgVendorOrderCount");
      if (!count) {
        count = document.createElement("p");
        count.id = "cgVendorOrderCount";
        count.className = "vs-muted cg-vendor-result-count";
        table.parentNode.insertBefore(count, table);
      }
      var rows = Array.prototype.filter.call(tbody.querySelectorAll("tr"), function (row) {
        return !row.querySelector(".vs-err, .vs-muted") || row.querySelector(".vt-open");
      });
      count.textContent = rows.length + (rows.length === 1 ? " order shown" : " orders shown");
      var summaryCount = document.getElementById("cgVendorOrderSummaryCount");
      if (summaryCount) summaryCount.textContent = rows.length + (rows.length === 1 ? " order in view" : " orders in view");
    }
    if (tbody && !tbody.dataset.cgRowOpen) {
      tbody.dataset.cgRowOpen = "1";
      tbody.addEventListener("click", function (event) {
        if (event.target && event.target.closest && event.target.closest("button, a, input, select, textarea")) return;
        var row = event.target && event.target.closest ? event.target.closest("tr") : null;
        var open = row && row.querySelector(".vt-open");
        if (open) open.click();
      });
    }
  }

  function boot() {
    if (nav === "dashboard") addDashboardCommandCenter();
    if (nav === "tags") addOrdersCommandCenter();
    syncStates();
    annotateStatus();
    enhanceOrders();
    var host = nav === "dashboard" ? document.getElementById("vdDeskSection") : document.getElementById("vtDeskSection");
    if (host && window.MutationObserver) {
      new MutationObserver(function () {
        syncStates();
        annotateStatus();
        enhanceOrders();
      }).observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden", "aria-sort"] });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
