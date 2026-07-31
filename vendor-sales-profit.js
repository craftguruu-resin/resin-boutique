(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;
  var vf = V.vendorFetch || fetch;

  var chartMain = null;
  var chartJsLoading = false;
  var chartJsWaiters = [];
  var chartPeriod = "monthly";

  function ensureChartJs(cb) {
    if (typeof Chart !== "undefined") {
      if (cb) cb();
      return;
    }
    if (chartJsLoading) {
      chartJsWaiters.push(cb);
      return;
    }
    chartJsLoading = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
    function done() {
      chartJsLoading = false;
      if (cb) cb();
      var w = chartJsWaiters.slice();
      chartJsWaiters.length = 0;
      w.forEach(function (fn) {
        if (fn) fn();
      });
    }
    s.onload = done;
    s.onerror = done;
    document.head.appendChild(s);
  }

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    var rounded = Math.round(x * 100) / 100;
    return "₹" + rounded.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function moneyPrecise(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    var rounded = Math.round(x * 100) / 100;
    return "₹" + rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function destroyMain() {
    try {
      if (chartMain && typeof chartMain.destroy === "function") chartMain.destroy();
    } catch (_) {}
    chartMain = null;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return String(iso).slice(0, 16);
    }
  }

  function periodLabel(period) {
    var now = new Date();
    var ist = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric", day: "numeric" });
    if (period === "daily") return "Today (IST) · " + ist.split(",")[0];
    if (period === "weekly") return "Last 7 days (IST)";
    if (period === "yearly") return "This calendar year (IST)";
    return "This calendar month (IST)";
  }

  function setPeriodUi() {
    document.querySelectorAll("[data-vsp-period]").forEach(function (b) {
      var on = b.getAttribute("data-vsp-period") === chartPeriod;
      b.classList.toggle("vd-ledger__tab--active", on);
    });
    var pl = document.getElementById("vspPeriodLabel");
    if (pl) pl.textContent = periodLabel(chartPeriod);
    var title = document.getElementById("vspChartTitle");
    var hint = document.getElementById("vspChartHint");
    if (chartPeriod === "daily") {
      if (title) title.textContent = "Last 14 days — revenue & profit";
      if (hint) hint.textContent = "Chart spans 14 IST days · table filters to today only.";
    } else if (chartPeriod === "weekly") {
      if (title) title.textContent = "Weekly buckets — revenue & profit";
      if (hint) hint.textContent = "Chart shows ~8 weeks · table filters to last 7 IST days.";
    } else if (chartPeriod === "yearly") {
      if (title) title.textContent = "This year — revenue & profit by month";
      if (hint) hint.textContent = "January through current month · profit uses cost where set.";
    } else {
      if (title) title.textContent = "This month — revenue & profit by day";
      if (hint) hint.textContent = "Each bar is an IST calendar day in the current month.";
    }
  }

  function fillKpis(ins) {
    var t = (ins && ins.totals) || {};
    var rev = document.getElementById("vspKpiRevenue");
    if (rev) rev.textContent = money(t.revenue);
    var revSub = document.getElementById("vspKpiRevenueSub");
    if (revSub) revSub.textContent = String(t.qty || 0) + " units sold in period";
    var rz = document.getElementById("vspKpiRazorpay");
    if (rz) rz.textContent = money(t.razorpayFee);
    var cost = document.getElementById("vspKpiCost");
    if (cost) cost.textContent = money(t.totalCost);
    var profitEl = document.getElementById("vspKpiProfit");
    if (profitEl) {
      profitEl.textContent = money(t.profit);
      profitEl.classList.toggle("vsp-kpi-value--neg", Number(t.profit) < 0);
    }
    var profitSub = document.getElementById("vspKpiProfitSub");
    if (profitSub) {
      var margin = t.revenue > 0 ? Math.round((t.profit / t.revenue) * 1000) / 10 : 0;
      profitSub.textContent = "Margin " + margin + "% after fees & cost";
    }
  }

  function renderMainChart(ins) {
    if (typeof Chart === "undefined") return;
    var ch = (ins && ins.charts) || {};
    var labels = ch.labels || [];
    var revenue = ch.revenue || [];
    var profit = ch.profitEstimate || [];
    var el = document.getElementById("vspMainChart");
    if (!el) return;
    destroyMain();
    chartMain = new Chart(el.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            type: "bar",
            label: "Revenue (₹)",
            data: revenue,
            backgroundColor: "rgba(37, 99, 235, 0.55)",
            borderRadius: 4,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Profit (₹)",
            data: profit,
            borderColor: "#16a34a",
            backgroundColor: "rgba(22, 163, 74, 0.08)",
            tension: 0.35,
            fill: false,
            yAxisID: "y1",
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          y: {
            type: "linear",
            position: "left",
            beginAtZero: true,
            title: { display: true, text: "Revenue ₹" },
            ticks: { font: { size: 10 } },
          },
          y1: {
            type: "linear",
            position: "right",
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            title: { display: true, text: "Profit ₹" },
            ticks: { font: { size: 10 } },
          },
          x: { ticks: { font: { size: 9 }, maxRotation: 45 } },
        },
      },
    });
  }

  function renderProductRows(rows) {
    var el = document.getElementById("vspProductRows");
    if (!el) return;
    if (!rows || !rows.length) {
      el.innerHTML = "<tr><td colspan='6' class='vs-muted'>No paid sales in this period. Set unit costs in Inventory → Storefront catalog.</td></tr>";
      return;
    }
    el.innerHTML = rows
      .map(function (r) {
        var profitCls = Number(r.profit) < 0 ? " vsp-cell--neg" : "";
        return (
          "<tr>" +
          "<td><strong>" +
          esc(r.name || r.productId || "—") +
          "</strong>" +
          (r.productId ? "<br /><span class='vs-muted vsp-id'>" + esc(r.productId) + "</span>" : "") +
          "</td>" +
          "<td>" +
          esc(String(r.qty || 0)) +
          "</td>" +
          "<td>" +
          esc(money(r.revenue)) +
          "</td>" +
          "<td>" +
          esc(money(r.razorpayFee)) +
          "</td>" +
          "<td>" +
          esc(money(r.totalCost)) +
          "</td>" +
          "<td class='vsp-cell--profit" +
          profitCls +
          "'>" +
          esc(money(r.profit)) +
          "</td></tr>"
        );
      })
      .join("");
  }

  function renderLineRows(rows) {
    var el = document.getElementById("vspLineRows");
    if (!el) return;
    if (!rows || !rows.length) {
      el.innerHTML = "<tr><td colspan='9' class='vs-muted'>No line items in this period.</td></tr>";
      return;
    }
    el.innerHTML = rows
      .map(function (r) {
        var profitCls = Number(r.profit) < 0 ? " vsp-cell--neg" : "";
        var tag = r.tagRef || r.orderId || "—";
        var pay = r.paymentMethod === "cod" ? "COD" : r.paymentMethod === "razorpay" ? "Razorpay" : r.paymentMethod || "—";
        return (
          "<tr>" +
          "<td>" +
          esc(fmtDate(r.soldAt)) +
          "</td>" +
          "<td><span class='vsp-id'>" +
          esc(String(tag)) +
          "</span></td>" +
          "<td>" +
          esc(r.name || r.productId || "—") +
          "<br /><span class='vs-muted'>" +
          esc(r.sizeLabel || "") +
          " · qty " +
          esc(String(r.qty || 0)) +
          "</span></td>" +
          "<td>" +
          esc(pay) +
          "<br /><span class='vs-muted'>" +
          esc(r.paymentStatus || "paid") +
          "</span></td>" +
          "<td>" +
          esc(moneyPrecise(r.productValue != null ? r.productValue : r.revenue)) +
          "</td>" +
          "<td>" +
          esc(moneyPrecise(r.prepaidDiscount || 0)) +
          "</td>" +
          "<td>" +
          esc(moneyPrecise(r.gatewayFee != null ? r.gatewayFee : r.razorpayFee || 0)) +
          "</td>" +
          "<td>" +
          esc(moneyPrecise(r.netRevenue != null ? r.netRevenue : r.revenue)) +
          "</td>" +
          "<td class='vsp-cell--profit" +
          profitCls +
          "'>" +
          esc(moneyPrecise(r.profit)) +
          "</td></tr>"
        );
      })
      .join("");
  }

  function loadProfit() {
    var base = V.apiBase();
    var errEl = document.getElementById("vspErr");
    showErr(errEl, "");
    setPeriodUi();
    return vf(V.vendorApiUrl("/api/vendor/analytics/sales-profit?period=" + encodeURIComponent(chartPeriod)), {
      headers: V.authHeaders(),
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) return V.explainVendor401(base);
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Sales profit failed");
          return x.json.insights;
        });
      })
      .then(function (ins) {
        fillKpis(ins);
        renderProductRows(ins.productRows || []);
        renderLineRows(ins.lineRows || []);
        ensureChartJs(function () {
          renderMainChart(ins);
        });
      })
      .catch(function (e) {
        showErr(errEl, String((e && e.message) || e));
      });
  }

  document.querySelectorAll("[data-vsp-period]").forEach(function (b) {
    b.addEventListener("click", function () {
      chartPeriod = b.getAttribute("data-vsp-period") || "monthly";
      loadProfit();
    });
  });

  var rb = document.getElementById("vspRefreshBtn");
  if (rb) {
    rb.addEventListener("click", function () {
      loadProfit();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadProfit);
  } else {
    loadProfit();
  }
})();
