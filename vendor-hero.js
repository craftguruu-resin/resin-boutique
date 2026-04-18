(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;

  function base() {
    return String(V.apiBase() || "").replace(/\/+$/, "");
  }

  function showMsg(text, isErr) {
    var el = document.getElementById("vhMsg");
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.style.color = isErr ? "#b42318" : "";
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

  function renderList(slides) {
    var ul = document.getElementById("vhList");
    var empty = document.getElementById("vhEmpty");
    if (!ul || !empty) return;
    ul.innerHTML = "";
    if (!slides || !slides.length) {
      empty.style.display = "block";
      empty.textContent = "No custom slides — storefront uses the default hero.";
      return;
    }
    empty.style.display = "none";
    slides.forEach(function (s) {
      var li = document.createElement("li");
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.gap = "0.75rem";
      li.style.flexWrap = "wrap";
      li.innerHTML =
        '<img src="' +
        esc(imgHref(s.image)) +
        '" alt="" width="120" height="120" style="object-fit:cover;border-radius:8px;border:1px solid rgba(15,23,42,.1)" />' +
        "<div style=\"flex:1;min-width:8rem\"><strong>#" +
        esc(String(s.id)) +
        "</strong><br /><span class=\"vs-muted\">" +
        esc(s.animation || "orbit") +
        "</span></div>" +
        '<button type="button" class="vs-btn vs-btn--ghost vs-btn--danger vh-del" data-id="' +
        esc(String(s.id)) +
        '">Remove</button>';
      ul.appendChild(li);
    });
  }

  function loadSlides() {
    showMsg("", false);
    return fetch(base() + "/api/catalog/hero-slides", { cache: "no-store" })
      .then(function (res) {
        return res.json();
      })
      .then(function (j) {
        if (!j || !j.ok) {
          throw new Error((j && j.error) || "Load failed");
        }
        renderList(j.slides || []);
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
      });
  }

  function boot() {
    document.getElementById("vhAddForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fi = document.getElementById("vhImage");
      var file = fi && fi.files && fi.files[0];
      if (!file) {
        showMsg("Choose an image file.", true);
        return;
      }
      var fd = new FormData();
      fd.set("image", file, file.name);
      fd.set("animation", document.getElementById("vhAnim").value || "orbit");
      var headers = V.authHeaders();
      delete headers["Content-Type"];
      showMsg("Uploading…", false);
      fetch(base() + "/api/vendor/hero-slides", {
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
              throw new Error((j && j.error) || res.statusText || "Upload failed");
            }
          });
        })
        .then(function () {
          if (fi) fi.value = "";
          showMsg("Saved.", false);
          return loadSlides();
        })
        .catch(function (e) {
          showMsg(String((e && e.message) || e), true);
        });
    });

    document.getElementById("vhList").addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest(".vh-del") : null;
      if (!b) return;
      var id = b.getAttribute("data-id");
      if (!id || !window.confirm("Remove this hero slide?")) return;
      fetch(base() + "/api/vendor/hero-slides/" + encodeURIComponent(id), {
        method: "DELETE",
        headers: V.authHeaders(),
        cache: "no-store",
      })
        .then(function (res) {
          return res.text().then(function (text) {
            var j = {};
            try {
              j = text ? JSON.parse(text) : {};
            } catch (_) {}
            if (!res.ok || !j.ok) {
              throw new Error((j && j.error) || res.statusText || "Delete failed");
            }
          });
        })
        .then(function () {
          return loadSlides();
        })
        .catch(function (e) {
          window.alert(String((e && e.message) || e));
        });
    });

    loadSlides().catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
