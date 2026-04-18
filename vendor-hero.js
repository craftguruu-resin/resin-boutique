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

  function setPreviewAnim(raw) {
    var ring = document.getElementById("vhPreviewRing");
    if (!ring) return;
    var a = String(raw || "orbit")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    if (!a) a = "orbit";
    if (a === "none" || a === "static") {
      ring.removeAttribute("data-hero-anim");
    } else {
      ring.setAttribute("data-hero-anim", a);
    }
  }

  function wireHeroPreview() {
    var sel = document.getElementById("vhAnim");
    var img = document.getElementById("vhPreviewImg");
    var fileIn = document.getElementById("vhImage");
    if (sel) {
      sel.addEventListener("change", function () {
        setPreviewAnim(sel.value);
      });
      setPreviewAnim(sel.value);
    }
    if (fileIn && img) {
      fileIn.addEventListener("change", function () {
        var f = fileIn.files && fileIn.files[0];
        if (!f || String(f.type || "").indexOf("image") !== 0) return;
        try {
          var prev = img.getAttribute("data-cg-preview-url");
          if (prev) URL.revokeObjectURL(prev);
          var u = URL.createObjectURL(f);
          img.setAttribute("data-cg-preview-url", u);
          img.src = u;
        } catch (_) {}
      });
    }
  }

  function resetHeroPreviewPlaceholder() {
    var img = document.getElementById("vhPreviewImg");
    if (!img) return;
    var prev = img.getAttribute("data-cg-preview-url");
    if (prev) {
      try {
        URL.revokeObjectURL(prev);
      } catch (_) {}
      img.removeAttribute("data-cg-preview-url");
    }
    img.src = V.vendorPageHref("media/brand-craftguru.png");
    setPreviewAnim("orbit");
  }

  function syncPreviewFromFirstSlide(slides) {
    var img = document.getElementById("vhPreviewImg");
    if (!img || !slides || !slides.length) {
      resetHeroPreviewPlaceholder();
      return;
    }
    var prev = img.getAttribute("data-cg-preview-url");
    if (prev) {
      try {
        URL.revokeObjectURL(prev);
      } catch (_) {}
      img.removeAttribute("data-cg-preview-url");
    }
    var s0 = slides[0];
    img.src = imgHref(s0.image);
    setPreviewAnim(s0.animation || "orbit");
  }

  function renderList(slides) {
    var ul = document.getElementById("vhList");
    var empty = document.getElementById("vhEmpty");
    if (!ul || !empty) return;
    ul.innerHTML = "";
    if (!slides || !slides.length) {
      empty.style.display = "block";
      empty.textContent = "No custom slides — storefront uses the default hero.";
      resetHeroPreviewPlaceholder();
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
    syncPreviewFromFirstSlide(slides);
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
    wireHeroPreview();

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
