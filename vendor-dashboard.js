(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;
  var vf = V.vendorFetch || fetch;

  var chartMain = null;
  var donutCharts = [];
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

  function destroyDonuts() {
    donutCharts.forEach(function (ch) {
      try {
        if (ch && typeof ch.destroy === "function") ch.destroy();
      } catch (_) {}
    });
    donutCharts = [];
  }

  function destroyMain() {
    try {
      if (chartMain && typeof chartMain.destroy === "function") chartMain.destroy();
    } catch (_) {}
    chartMain = null;
  }

  function donutOpts(data, colors) {
    return {
      type: "doughnut",
      data: {
        datasets: [
          {
            data: data,
            backgroundColor: colors,
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "68%",
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        animation: { animateRotate: true, duration: 600 },
      },
    };
  }

  function renderDonuts(ins) {
    if (typeof Chart === "undefined") return;
    destroyDonuts();
    var paidT = Number(ins.paidOrdersToday) || 0;
    var otherT = Math.max(0, Number(ins.ordersTodayAll) - paidT);
    var d1 = document.getElementById("vdDon1");
    if (d1) {
      donutCharts.push(
        new Chart(
          d1.getContext("2d"),
          donutOpts(
            [paidT, otherT],
            ["#22c55e", "#e2e8f0"]
          )
        )
      );
    }
    var wk = Number(ins.paidOrdersWeek) || 0;
    var d2 = document.getElementById("vdDon2");
    if (d2) {
      donutCharts.push(
        new Chart(
          d2.getContext("2d"),
          donutOpts([wk, Math.max(1, wk) * 0.001], ["#2563eb", "#e0e7ff"])
        )
      );
    }
    var mo = Number(ins.paidOrdersMonth) || 0;
    var d3 = document.getElementById("vdDon3");
    if (d3) {
      donutCharts.push(
        new Chart(
          d3.getContext("2d"),
          donutOpts([mo, Math.max(1, mo) * 0.001], ["#7c3aed", "#ede9fe"])
        )
      );
    }
    var periodAmt =
      chartPeriod === "daily"
        ? Number(ins.paidAmountToday) || 0
        : chartPeriod === "weekly"
          ? Number(ins.paidAmountWeek) || 0
          : chartPeriod === "yearly"
            ? Number(ins.paidAmountYear) || 0
            : Number(ins.paidAmountMonth) || 0;
    var d4 = document.getElementById("vdDon4");
    if (d4) {
      donutCharts.push(
        new Chart(
          d4.getContext("2d"),
          donutOpts([Math.max(periodAmt, 0.01), 1], ["#ea580c", "#fed7aa"])
        )
      );
    }
  }

  function renderMainChart(ins) {
    if (typeof Chart === "undefined") return;
    var ch = (ins && ins.charts) || {};
    var pack =
      chartPeriod === "daily"
        ? ch.daily
        : chartPeriod === "weekly"
          ? ch.weekly
          : chartPeriod === "yearly"
            ? ch.yearly
            : ch.monthly;
    if (!pack || !pack.labels) pack = { labels: [], orderCounts: [], amounts: [] };

    var el = document.getElementById("vdMainChart");
    if (!el) return;
    destroyMain();
    chartMain = new Chart(el.getContext("2d"), {
      type: "bar",
      data: {
        labels: pack.labels,
        datasets: [
          {
            type: "bar",
            label: "Orders",
            data: pack.orderCounts,
            backgroundColor: "rgba(37, 99, 235, 0.55)",
            borderRadius: 4,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Amount (₹)",
            data: pack.amounts,
            borderColor: "#ea580c",
            backgroundColor: "rgba(234, 88, 12, 0.08)",
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
            title: { display: true, text: "Orders" },
            ticks: { font: { size: 10 } },
          },
          y1: {
            type: "linear",
            position: "right",
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            title: { display: true, text: "₹" },
            ticks: { font: { size: 10 } },
          },
          x: { ticks: { font: { size: 9 }, maxRotation: 0 } },
        },
      },
    });
  }

  function renderCategoryBars(ins) {
    var list = (ins && ins.topCategories) || [];
    var maxAmt = 1;
    var maxCt = 1;
    list.forEach(function (r) {
      maxAmt = Math.max(maxAmt, Number(r.amount) || 0);
      maxCt = Math.max(maxCt, Number(r.orderCount) || 0);
    });
    var elA = document.getElementById("vdCatAmount");
    var elC = document.getElementById("vdCatCount");
    if (elA) {
      if (!list.length) {
        elA.innerHTML = "<p class='vs-muted'>No paid lines with catalog link this month.</p>";
      } else {
        elA.innerHTML = list
          .map(function (r) {
            var pct = Math.round(((Number(r.amount) || 0) / maxAmt) * 100);
            return (
              "<div class='vd-bar-row'><span class='vd-bar-row__label'>" +
              esc(r.label) +
              "</span><span class='vd-bar-row__val'>" +
              esc(money(r.amount)) +
              "</span><div class='vd-bar-row__track'><div class='vd-bar-row__fill vd-bar-row__fill--green' style='width:" +
              pct +
              "%'></div></div></div>"
            );
          })
          .join("");
      }
    }
    if (elC) {
      if (!list.length) {
        elC.innerHTML = "<p class='vs-muted'>—</p>";
      } else {
        elC.innerHTML = list
          .map(function (r) {
            var pct = Math.round(((Number(r.orderCount) || 0) / maxCt) * 100);
            return (
              "<div class='vd-bar-row'><span class='vd-bar-row__label'>" +
              esc(r.label) +
              "</span><span class='vd-bar-row__val'>" +
              esc(String(r.orderCount)) +
              "</span><div class='vd-bar-row__track'><div class='vd-bar-row__fill vd-bar-row__fill--blue' style='width:" +
              pct +
              "%'></div></div></div>"
            );
          })
          .join("");
      }
    }
  }

  function renderNotify(list) {
    var el = document.getElementById("vdNotify");
    if (!el) return;
    if (!list || !list.length) {
      el.innerHTML = "<p class='vs-muted'>No recent paid orders yet.</p>";
      return;
    }
    el.innerHTML = list
      .map(function (n) {
        var cls = n.kind === "danger" ? "danger" : n.kind === "warn" ? "warn" : "success";
        return (
          "<div class='vs-notify__item vs-notify__item--" +
          cls +
          "'><div><p class='vs-notify__title'>" +
          esc(n.title) +
          "</p><p class='vs-notify__msg'>" +
          esc(n.message) +
          "</p></div><a class='vs-btn vs-btn--primary' href='" +
          esc(V.vendorPageHref("vendor-tags.html") + "?range=month") +
          "'>Open orders</a></div>"
        );
      })
      .join("");
  }

  function setPeriodUi() {
    document.querySelectorAll("[data-vd-period]").forEach(function (b) {
      var on = b.getAttribute("data-vd-period") === chartPeriod;
      b.classList.toggle("vd-ledger__tab--active", on);
    });
    var title = document.getElementById("vdMainChartTitle");
    var hint = document.getElementById("vdMainChartHint");
    if (chartPeriod === "daily") {
      if (title) title.textContent = "Last 14 days — orders & revenue";
      if (hint) hint.textContent = "IST calendar days · paid orders only.";
    } else if (chartPeriod === "weekly") {
      if (title) title.textContent = "Rolling 7 days — orders & revenue";
      if (hint) hint.textContent = "One bucket per IST day in the last week.";
    } else if (chartPeriod === "yearly") {
      if (title) title.textContent = "This year — paid revenue by month (IST)";
      if (hint) hint.textContent = "January through current month · paid orders only.";
    } else {
      if (title) title.textContent = "This month — orders & revenue by day";
      if (hint) hint.textContent = "Bars = paid order count · orange line = amount (₹) · IST month.";
    }
  }

  function fillKpis(ins) {
    var el = document.getElementById("vdPeriodLabel");
    if (el) el.textContent = ins.monthLabelIST || "—";
    var k1 = document.getElementById("vdKpiOrdersToday");
    if (k1) k1.textContent = String(ins.paidOrdersToday != null ? ins.paidOrdersToday : 0);
    var s1 = document.getElementById("vdKpiOrdersTodaySub");
    if (s1) {
      s1.textContent =
        "Paid " +
        (ins.paidOrdersToday || 0) +
        " · Other today " +
        Math.max(0, (ins.ordersTodayAll || 0) - (ins.paidOrdersToday || 0));
    }
    var k2 = document.getElementById("vdKpiOrdersWeek");
    if (k2) k2.textContent = String(ins.paidOrdersWeek != null ? ins.paidOrdersWeek : 0);
    var k3 = document.getElementById("vdKpiOrdersMonth");
    if (k3) k3.textContent = String(ins.paidOrdersMonth != null ? ins.paidOrdersMonth : 0);
    var periodAmt =
      chartPeriod === "daily"
        ? Number(ins.paidAmountToday) || 0
        : chartPeriod === "weekly"
          ? Number(ins.paidAmountWeek) || 0
          : chartPeriod === "yearly"
            ? Number(ins.paidAmountYear) || 0
            : Number(ins.paidAmountMonth) || 0;
    var at = document.getElementById("vdKpiAmtToday");
    if (at) at.textContent = money(periodAmt);
    var subLine = document.getElementById("vdKpiAmtSubLine");
    if (subLine) {
      if (chartPeriod === "daily") {
        subLine.textContent =
          "Revenue today (IST). Month total " + money(ins.paidAmountMonth || 0) + " · Year " + money(ins.paidAmountYear || 0) + ".";
      } else if (chartPeriod === "weekly") {
        subLine.textContent =
          "Rolling 8-week chart window. Month " + money(ins.paidAmountMonth || 0) + " · Today " + money(ins.paidAmountToday || 0) + ".";
      } else if (chartPeriod === "yearly") {
        subLine.textContent =
          "Paid revenue this calendar year. Month " + money(ins.paidAmountMonth || 0) + " · Today " + money(ins.paidAmountToday || 0) + ".";
      } else {
        subLine.textContent =
          "Paid revenue this calendar month. Today " + money(ins.paidAmountToday || 0) + " · Year " + money(ins.paidAmountYear || 0) + ".";
      }
    }
  }

  function loadDash() {
    var base = V.apiBase();
    var errEl = document.getElementById("vdErr");
    showErr(errEl, "");
    setPeriodUi();
    return Promise.all([
      vf(V.vendorApiUrl("/api/vendor/analytics/order-insights?period=" + encodeURIComponent(chartPeriod)), {
        headers: V.authHeaders(),
      }).then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) return V.explainVendor401(base);
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Insights failed");
          return x.json.insights;
        });
      }),
      vf(V.vendorApiUrl("/api/vendor/dashboard-summary"), { headers: V.authHeaders() }).then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (!x.okHttp || !x.json.ok) return { notifications: [] };
          return x.json.summary || {};
        });
      }),
    ])
      .then(function (pair) {
        var ins = pair[0];
        var sum = pair[1];
        fillKpis(ins);
        renderCategoryBars(ins);
        renderNotify(sum.notifications || []);
        ensureChartJs(function () {
          renderDonuts(ins);
          renderMainChart(ins);
        });
      })
      .catch(function (e) {
        showErr(errEl, String((e && e.message) || e));
      });
  }

  function tryApplyVendorNextRedirect() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var raw = q.get("vendorNext");
      if (!raw) return;
      var dec = decodeURIComponent(String(raw).trim());
      if (!dec) return;
      var name = dec.split("/").pop() || dec;
      name = String(name).split("?")[0];
      if (name.indexOf("vendor-") !== 0) return;
      if (!/\.html$/i.test(name)) return;
      if (name === "vendor-dashboard.html") return;
      window.location.replace(V.vendorPageHref(name));
    } catch (_) {}
  }

  function runBoot() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      if (q.get("vendorNext")) {
        tryApplyVendorNextRedirect();
        return;
      }
    } catch (_) {}
    var desk = document.getElementById("vdDeskSection");
    if (desk) desk.hidden = false;
    loadDash();
  }

  document.querySelectorAll("[data-vd-period]").forEach(function (b) {
    b.addEventListener("click", function () {
      chartPeriod = b.getAttribute("data-vd-period") || "monthly";
      loadDash();
    });
  });

  var rb = document.getElementById("vdRefreshBtn");
  if (rb) {
    rb.addEventListener("click", function () {
      window.location.reload();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runBoot);
  } else {
    runBoot();
  }
})();
