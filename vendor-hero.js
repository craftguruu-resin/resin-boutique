(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;

  var lastHeroSettings = null;

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

  function showBatchMsg(text, isErr) {
    var el = document.getElementById("vhBatchMsg");
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.style.color = isErr ? "#b42318" : "";
  }

  function syncCustomHeroUi(settings) {
    var togg = document.getElementById("vhCustomToggle");
    if (!togg || !settings) return;
    togg.checked = settings.customHeroEnabled !== false;
    var hint = document.getElementById("vhCustomHint");
    if (hint) {
      if (!togg.checked) {
        hint.hidden = false;
        hint.textContent =
          "Guests currently see the built-in Craftguru homepage hero. Turn “Custom hero on homepage” on to publish your slides again.";
      } else {
        hint.hidden = true;
        hint.textContent = "";
      }
    }
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
    var a = String(raw || "slide")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    if (!a) a = "slide";
    if (a === "none" || a === "static" || a === "slide") {
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
    setPreviewAnim("slide");
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

  function applyPlaybackForm(settings) {
    var inp = document.getElementById("vhIntervalSec");
    if (!inp || !settings) return;
    var sec = (Number(settings.carouselIntervalMs) || 2000) / 1000;
    if (!Number.isFinite(sec)) sec = 2;
    inp.value = String(Math.round(sec * 10) / 10);
    syncCustomHeroUi(settings);
  }

  function putHeroSettings(body) {
    return fetch(base() + "/api/vendor/hero-settings", {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify(body || {}),
      cache: "no-store",
    }).then(function (res) {
      return res.text().then(function (text) {
        var j = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch (_) {}
        if (!res.ok || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Save failed");
        }
        return j.heroSettings || null;
      });
    });
  }

  function renderList(slides, settings) {
    lastHeroSettings = settings || lastHeroSettings;
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
    var pinId = settings && settings.singleSlideId != null ? Number(settings.singleSlideId) : NaN;
    var mode = settings && String(settings.displayMode || "").toLowerCase() === "single" ? "single" : "carousel";
    var customOff = settings && settings.customHeroEnabled === false;
    slides.forEach(function (s) {
      var li = document.createElement("li");
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.gap = "0.75rem";
      li.style.flexWrap = "wrap";
      var isPinned = mode === "single" && Number.isFinite(pinId) && pinId === Number(s.id);
      li.innerHTML =
        '<img src="' +
        esc(imgHref(s.image)) +
        '" alt="" width="120" height="120" style="object-fit:cover;border-radius:8px;border:1px solid rgba(15,23,42,.1)" />' +
        "<div style=\"flex:1;min-width:8rem\"><strong>#" +
        esc(String(s.id)) +
        "</strong>" +
        (customOff ? ' <span class="vs-pill" style="margin-left:0.35rem;opacity:0.85">Saved (off air)</span>' : "") +
        (isPinned ? ' <span class="vs-pill" style="margin-left:0.35rem">Fixed hero</span>' : "") +
        "<br /><span class=\"vs-muted\">" +
        esc(s.animation || "orbit") +
        "</span></div>" +
        '<button type="button" class="vs-btn vs-btn--ghost vh-pin" data-id="' +
        esc(String(s.id)) +
        '">Set fixed hero</button>' +
        '<button type="button" class="vs-btn vs-btn--ghost vs-btn--danger vh-del" data-id="' +
        esc(String(s.id)) +
        '">Remove</button>';
      ul.appendChild(li);
    });
    syncPreviewFromFirstSlide(slides);
  }

  function loadSlides(opts) {
    if (!opts || !opts.quiet) showMsg("", false);
    return fetch(base() + "/api/vendor/hero-slides", {
      cache: "no-store",
      headers: Object.assign({}, V.authHeaders()),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (j) {
        if (!j || !j.ok) {
          throw new Error((j && j.error) || "Load failed");
        }
        var settings = j.heroSettings || null;
        applyPlaybackForm(settings);
        renderList(j.slides || [], settings);
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
      });
  }

  function boot() {
    wireHeroPreview();

    var customTog = document.getElementById("vhCustomToggle");
    if (customTog) {
      customTog.addEventListener("change", function () {
        showMsg("Saving…", false);
        putHeroSettings({ customHeroEnabled: customTog.checked })
          .then(function () {
            return loadSlides({ quiet: true });
          })
          .then(function () {
            showMsg(customTog.checked ? "Custom hero is live on the guest site." : "Guest site now uses the built-in hero.", false);
          })
          .catch(function (e) {
            showMsg(String((e && e.message) || e), true);
            return loadSlides({ quiet: true });
          });
      });
    }

    var builtinBtn = document.getElementById("vhBuiltinBtn");
    if (builtinBtn) {
      builtinBtn.addEventListener("click", function () {
        showMsg("Switching to built-in hero…", false);
        putHeroSettings({ customHeroEnabled: false, displayMode: "carousel" })
          .then(function () {
            return loadSlides({ quiet: true });
          })
          .then(function () {
            showMsg("Guest homepage now uses the default Craftguru hero. Your slides remain listed below.", false);
            var top = document.getElementById("vhTop");
            if (top && top.scrollIntoView) {
              top.scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
              try {
                window.scrollTo({ top: 0, behavior: "smooth" });
              } catch (_) {
                window.scrollTo(0, 0);
              }
            }
          })
          .catch(function (e) {
            showMsg(String((e && e.message) || e), true);
          });
      });
    }

    var batchForm = document.getElementById("vhBatchForm");
    if (batchForm) {
      batchForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var fi = document.getElementById("vhBatchImages");
        var files = fi && fi.files ? fi.files : null;
        if (!files || files.length < 5) {
          showBatchMsg("Choose at least 5 images (up to 20) for a batch upload.", true);
          return;
        }
        if (files.length > 20) {
          showBatchMsg("Maximum 20 images per batch.", true);
          return;
        }
        var fd = new FormData();
        for (var bi = 0; bi < files.length; bi++) {
          fd.append("images", files[bi], files[bi].name);
        }
        fd.set("animation", (document.getElementById("vhBatchAnim") && document.getElementById("vhBatchAnim").value) || "slide");
        var headers = V.authHeaders();
        delete headers["Content-Type"];
        showBatchMsg("Uploading " + files.length + " images…", false);
        fetch(base() + "/api/vendor/hero-slides/batch", {
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
                throw new Error((j && j.error) || res.statusText || "Batch upload failed");
              }
              return j;
            });
          })
          .then(function () {
            if (fi) fi.value = "";
            showBatchMsg("Uploaded successfully.", false);
            return loadSlides();
          })
          .catch(function (e) {
            showBatchMsg(String((e && e.message) || e), true);
          });
      });
    }

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

    var ivBtn = document.getElementById("vhSaveInterval");
    if (ivBtn) {
      ivBtn.addEventListener("click", function () {
        var inp = document.getElementById("vhIntervalSec");
        var sec = inp ? parseFloat(String(inp.value || "2"), 10) : 2;
        if (!Number.isFinite(sec)) sec = 2;
        showMsg("Saving…", false);
        putHeroSettings({ carouselIntervalSeconds: sec })
          .then(function (s) {
            applyPlaybackForm(s);
            return loadSlides({ quiet: true });
          })
          .then(function () {
            showMsg("Timing saved.", false);
          })
          .catch(function (e) {
            showMsg(String((e && e.message) || e), true);
          });
      });
    }

    var carBtn = document.getElementById("vhCarouselMode");
    if (carBtn) {
      carBtn.addEventListener("click", function () {
        showMsg("Saving…", false);
        putHeroSettings({ displayMode: "carousel" })
          .then(function () {
            return loadSlides({ quiet: true });
          })
          .then(function () {
            showMsg("Carousel mode — all slides rotate.", false);
          })
          .catch(function (e) {
            showMsg(String((e && e.message) || e), true);
          });
      });
    }

    document.getElementById("vhList").addEventListener("click", function (ev) {
      var pin = ev.target && ev.target.closest ? ev.target.closest(".vh-pin") : null;
      if (pin) {
        var pid = pin.getAttribute("data-id");
        if (!pid) return;
        showMsg("Saving…", false);
        putHeroSettings({ displayMode: "single", singleSlideId: Number(pid) })
          .then(function () {
            return loadSlides({ quiet: true });
          })
          .then(function () {
            showMsg("Fixed hero — guest site shows this slide only (no rotation).", false);
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
        return;
      }
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
