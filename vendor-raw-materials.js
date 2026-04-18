(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;

  function base() {
    return String(V.apiBase() || "").replace(/\/+$/, "");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function imgHref(rel) {
    var u = String(rel || "").trim();
    if (!u) return "";
    if (u.indexOf("http") === 0 || u.indexOf("//") === 0) return u;
    if (u.charAt(0) === "/") return V.vendorPageHref(u.slice(1));
    return V.vendorPageHref(u);
  }

  function showMsg(text, isErr) {
    var el = document.getElementById("vrmMsg");
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.style.color = isErr ? "#b42318" : "";
  }

  function renderRows(rows) {
    var tb = document.getElementById("vrmTbody");
    var empty = document.getElementById("vrmEmpty");
    var table = document.getElementById("vrmTable");
    if (!tb || !empty || !table) return;
    tb.innerHTML = "";
    if (!rows || !rows.length) {
      empty.style.display = "block";
      empty.textContent = "No materials yet.";
      table.style.display = "none";
      return;
    }
    empty.style.display = "none";
    table.style.display = "";
    rows.forEach(function (r) {
      var active = r.isActive !== false;
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        (r.image
          ? "<img src=\"" +
            esc(imgHref(r.image)) +
            "\" alt=\"\" width=\"56\" height=\"56\" style=\"object-fit:cover;border-radius:6px\" />"
          : "—") +
        "</td><td><strong>" +
        esc(r.name) +
        "</strong><br /><small class=\"vs-muted\">" +
        esc(r.id || "") +
        "</small></td><td>" +
        (active ? "<span class=\"vs-pill vs-pill--active\">Live</span>" : "<span class=\"vs-pill vs-pill--inactive\">Hidden</span>") +
        "</td><td><button type=\"button\" class=\"vs-btn vs-btn--ghost vrm-toggle\" data-id=\"" +
        esc(r.id) +
        "\" data-next=\"" +
        (active ? "0" : "1") +
        "\">" +
        (active ? "Hide from shop" : "Show on shop") +
        "</button></td>";
      tb.appendChild(tr);
    });
  }

  function loadList() {
    showMsg("", false);
    return fetch(base() + "/api/vendor/raw-materials", { headers: V.authHeaders(), cache: "no-store" })
      .then(function (res) {
        return res.text().then(function (text) {
          if (res.status === 401) {
            return V.explainVendor401(V.apiBase());
          }
          var j = {};
          try {
            j = text ? JSON.parse(text) : {};
          } catch (_) {}
          if (!res.ok || !j.ok) {
            throw new Error((j && j.error) || res.statusText || "Load failed");
          }
          renderRows(j.materials || []);
        });
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
      });
  }

  function setActive(id, on) {
    return fetch(base() + "/api/vendor/raw-materials/" + encodeURIComponent(id) + "/active", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify({ active: !!on }),
      cache: "no-store",
    }).then(function (res) {
      return res.text().then(function (text) {
        var j = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch (_) {}
        if (!res.ok || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Update failed");
        }
      });
    });
  }

  function boot() {
    document.getElementById("vrmRefresh").addEventListener("click", function () {
      loadList().catch(function () {});
    });

    document.getElementById("vrmAddForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData();
      fd.set("name", document.getElementById("vrmName").value.trim());
      fd.set("description", document.getElementById("vrmDesc").value.trim());
      fd.set("note", document.getElementById("vrmNote").value.trim());
      var file = document.getElementById("vrmImage").files && document.getElementById("vrmImage").files[0];
      if (!file) {
        showMsg("Image is required.", true);
        return;
      }
      fd.set("image", file, file.name);
      var headers = V.authHeaders();
      delete headers["Content-Type"];
      showMsg("Saving…", false);
      fetch(base() + "/api/vendor/raw-materials", {
        method: "POST",
        headers: headers,
        body: fd,
        cache: "no-store",
      })
        .then(function (res) {
          return res.text().then(function (text) {
            var j = {};
            try {
              j = text ? JSON.parse(text) : {};
            } catch (_) {}
            if (!res.ok || !j.ok) {
              throw new Error((j && j.error) || res.statusText || "Save failed");
            }
          });
        })
        .then(function () {
          document.getElementById("vrmAddForm").reset();
          showMsg("Saved.", false);
          return loadList();
        })
        .catch(function (e) {
          showMsg(String((e && e.message) || e), true);
        });
    });

    document.getElementById("vrmTbody").addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest(".vrm-toggle") : null;
      if (!b) return;
      var id = b.getAttribute("data-id");
      var next = b.getAttribute("data-next") === "1";
      setActive(id, next)
        .then(function () {
          return loadList();
        })
        .catch(function (e) {
          window.alert(String((e && e.message) || e));
        });
    });

    loadList().catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
