(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;
  var vf = V.vendorFetch || fetch;

  function on(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
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

  function showDesk(on) {
    var desk = document.getElementById("vrDeskSection");
    if (desk) desk.hidden = !on;
  }

  function statusBadge(st) {
    var c = "vs-badge--pending";
    if (st === "approved" || st === "refunded") c = "vs-badge--paid";
    if (st === "rejected") c = "vs-badge--return";
    return "<span class='vs-badge " + c + "'>" + esc(st || "") + "</span>";
  }

  function renderRows(list) {
    var tb = document.getElementById("vrTbody");
    if (!tb) return;
    if (!list || !list.length) {
      tb.innerHTML = "<tr><td colspan='7' class='vs-muted'>No returns logged yet.</td></tr>";
      return;
    }
    var opts = ["pending", "approved", "rejected", "received", "refunded"];
    tb.innerHTML = list
      .map(function (r) {
        var sel = opts
          .map(function (o) {
            return (
              "<option value='" +
              o +
              "'" +
              (o === r.status ? " selected" : "") +
              ">" +
              o +
              "</option>"
            );
          })
          .join("");
        return (
          "<tr><td>" +
          esc(r.id) +
          "</td><td>#" +
          esc(String(r.orderId)) +
          "</td><td>" +
          statusBadge(r.status) +
          "</td><td>" +
          esc((r.reason || "").slice(0, 80)) +
          "</td><td>" +
          (r.refundAmount != null ? esc(String(r.refundAmount)) : "—") +
          "</td><td class='vs-muted'>" +
          esc((r.updatedAt || r.createdAt || "").slice(0, 16)) +
          "</td><td><select class='vr-st' data-id='" +
          esc(r.id) +
          "'>" +
          sel +
          "</select> <button type='button' class='vs-btn vr-apply' data-id='" +
          esc(r.id) +
          "'>Apply</button></td></tr>"
        );
      })
      .join("");

    tb.querySelectorAll(".vr-apply").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        var sel = tb.querySelector(".vr-st[data-id='" + id + "']");
        var st = sel ? sel.value : "";
        var base = V.apiBase();
        vf(V.vendorApiUrl("/api/vendor/returns/" + encodeURIComponent(id)), {
          method: "PATCH",
          headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
          body: JSON.stringify({ status: st }),
        })
          .then(function (res) {
            return V.parseApiJson(res).then(function (x) {
              if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Update failed");
            });
          })
          .then(loadList)
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
      });
    });
  }

  function loadList() {
    var base = V.apiBase();
    return vf(V.vendorApiUrl("/api/vendor/returns"), { headers: V.authHeaders() })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) {
            return V.explainVendor401(base);
          }
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Load failed");
          return x.json.returns || [];
        });
      })
      .then(renderRows);
  }

  function boot() {
    showDesk(true);
    loadList().catch(function (e) {
      window.alert(String((e && e.message) || e));
    });
  }

  on("vrRefreshBtn", "click", function () {
    loadList().catch(function (e) {
      window.alert(String((e && e.message) || e));
    });
  });

  on("vrCreateBtn", "click", function () {
    var oid = Number(document.getElementById("vrOrderId").value);
    var reason = document.getElementById("vrReason").value.trim();
    if (!Number.isFinite(oid) || !reason) {
      window.alert("Order # and reason are required");
      return;
    }
    var ref = document.getElementById("vrRefund").value.trim();
    var body = { orderId: oid, reason: reason };
    if (ref) body.refundAmount = Number(ref);
    var base = V.apiBase();
    vf(V.vendorApiUrl("/api/vendor/returns"), {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Create failed");
        });
      })
      .then(function () {
        document.getElementById("vrOrderId").value = "";
        document.getElementById("vrReason").value = "";
        document.getElementById("vrRefund").value = "";
        return loadList();
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
  });

  boot();
})();
