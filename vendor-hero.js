(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;

  var lastHeroSettings = null;
  var cachedSlidesForPreview = [];
  var livePreviewTimer = null;
  var livePreviewBusy = false;
  var livePreviewIdx = 0;

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

  function showUrlMsg(text, isErr) {
    var el = document.getElementById("vhUrlMsg");
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

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function readIntervalMsFromForm(settings) {
    var inp = document.getElementById("vhIntervalSec");
    var sec = inp ? parseFloat(String(inp.value || ""), 10) : NaN;
    if (!Number.isFinite(sec) || sec < 1.5) {
      sec = (Number(settings && settings.carouselIntervalMs) || 5000) / 1000;
    }
    if (!Number.isFinite(sec) || sec < 1.5) sec = 5;
    return Math.round(Math.min(60, Math.max(1.5, sec)) * 1000);
  }

  function stopLivePreview() {
    if (livePreviewTimer) {
      clearInterval(livePreviewTimer);
      livePreviewTimer = null;
    }
    livePreviewBusy = false;
  }

  function stripLivePreviewClasses(img) {
    if (!img) return;
    img.classList.remove(
      "vh-live-preview__img--leave",
      "vh-live-preview__img--enter-start",
      "vh-live-preview__img--enter-run"
    );
  }

  function revokePreviewBlobIfAny(img) {
    if (!img) return;
    var prevBlob = img.getAttribute("data-cg-preview-url");
    if (!prevBlob) return;
    try {
      URL.revokeObjectURL(prevBlob);
    } catch (_) {}
    img.removeAttribute("data-cg-preview-url");
  }

  function startLivePreview(slides, settings) {
    stopLivePreview();
    cachedSlidesForPreview = (slides || []).slice();
    var root = document.getElementById("vhLivePreviewRoot");
    var img = document.getElementById("vhLivePreviewImg");
    var cap = document.getElementById("vhLivePreviewCaption");
    if (!root || !img) return;
    var list = cachedSlidesForPreview.slice();
    var mode = settings && String(settings.displayMode || "").toLowerCase() === "single" ? "single" : "carousel";
    var pinId = settings && settings.singleSlideId != null ? Number(settings.singleSlideId) : NaN;
    if (mode === "single" && Number.isFinite(pinId)) {
      list = list.filter(function (s) {
        return Number(s.id) === pinId;
      });
    }
    if (!list.length) {
      root.classList.remove("vh-live-preview--slide");
      stripLivePreviewClasses(img);
      revokePreviewBlobIfAny(img);
      img.removeAttribute("src");
      if (cap) {
        cap.textContent =
          "Add slides to preview motion here. Use “Use built-in hero (default)” to show the original guest homepage hero — slides stay saved for later.";
      }
      return;
    }
    revokePreviewBlobIfAny(img);
    var useSlide = list.length > 1 && mode !== "single";
    root.classList.toggle("vh-live-preview--slide", !!useSlide);
    livePreviewIdx = 0;
    stripLivePreviewClasses(img);
    img.src = imgHref(list[0].image);
    img.alt = "Hero preview";
    var ms = readIntervalMsFromForm(settings);
    if (cap) {
      cap.textContent =
        (useSlide ? "Carousel preview · " : "Fixed slide · ") +
        list.length +
        " image(s) · " +
        ms / 1000 +
        "s between slides (matches field when saved)";
    }
    if (!useSlide || prefersReducedMotion()) return;

    var firstGo = true;

    function sameSrc(a, b) {
      try {
        if (!a || !b) return false;
        if (a === b) return true;
        var da = a.split("?")[0];
        var db = b.split("?")[0];
        return da === db;
      } catch (_) {
        return false;
      }
    }

    function tick() {
      if (livePreviewBusy) return;
      var cur = list[livePreviewIdx % list.length];
      var nextSrc = imgHref(cur && cur.image);
      livePreviewIdx += 1;
      if (firstGo) {
        firstGo = false;
        stripLivePreviewClasses(img);
        img.src = nextSrc;
        return;
      }
      if (prefersReducedMotion() || sameSrc(img.getAttribute("src") || "", nextSrc)) {
        stripLivePreviewClasses(img);
        img.src = nextSrc;
        return;
      }
      livePreviewBusy = true;
      var leaveConsumed = false;
      var leaveSafety = window.setTimeout(function () {
        img.removeEventListener("transitionend", onLeaveEnd);
        afterPre();
      }, 1200);
      function afterPre() {
        if (leaveConsumed) return;
        leaveConsumed = true;
        window.clearTimeout(leaveSafety);
        img.removeEventListener("transitionend", onLeaveEnd);
        stripLivePreviewClasses(img);
        img.src = nextSrc;
        img.classList.add("vh-live-preview__img--enter-start");
        void img.offsetWidth;
        img.classList.remove("vh-live-preview__img--enter-start");
        img.classList.add("vh-live-preview__img--enter-run");
        var enterDone = false;
        var enterSafety = window.setTimeout(function () {
          img.removeEventListener("transitionend", onEnterEnd);
          if (!enterDone) {
            enterDone = true;
            img.classList.remove("vh-live-preview__img--enter-run");
            livePreviewBusy = false;
          }
        }, 1200);
        function onEnterEnd(ev) {
          if (ev.target !== img) return;
          if (enterDone) return;
          enterDone = true;
          window.clearTimeout(enterSafety);
          img.removeEventListener("transitionend", onEnterEnd);
          img.classList.remove("vh-live-preview__img--enter-run");
          livePreviewBusy = false;
        }
        img.addEventListener("transitionend", onEnterEnd, { once: true });
      }
      function onLeaveEnd(ev) {
        if (ev.target !== img) return;
        window.clearTimeout(leaveSafety);
        img.removeEventListener("transitionend", onLeaveEnd);
        var pre = new Image();
        pre.onload = function () {
          afterPre();
        };
        pre.onerror = function () {
          afterPre();
        };
        pre.src = nextSrc;
      }
      img.addEventListener("transitionend", onLeaveEnd, { once: true });
      img.classList.add("vh-live-preview__img--leave");
    }

    tick();
    livePreviewTimer = window.setInterval(tick, ms);
  }

  function wireUnsavedFilePeek() {
    var fileIn = document.getElementById("vhImage");
    var img = document.getElementById("vhLivePreviewImg");
    if (!fileIn || !img) return;
    fileIn.addEventListener("change", function () {
      if (cachedSlidesForPreview && cachedSlidesForPreview.length) return;
      var f = fileIn.files && fileIn.files[0];
      if (!f || String(f.type || "").indexOf("image") !== 0) return;
      try {
        var prev = img.getAttribute("data-cg-preview-url");
        if (prev) URL.revokeObjectURL(prev);
        var u = URL.createObjectURL(f);
        img.setAttribute("data-cg-preview-url", u);
        img.src = u;
        var cap = document.getElementById("vhLivePreviewCaption");
        if (cap) cap.textContent = "Unsaved file — upload to add to the carousel.";
      } catch (_) {}
    });
  }

  function applyPlaybackForm(settings) {
    var inp = document.getElementById("vhIntervalSec");
    if (!inp || !settings) return;
    var sec = (Number(settings.carouselIntervalMs) || 5000) / 1000;
    if (!Number.isFinite(sec) || sec < 1.5) sec = 5;
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
      startLivePreview([], settings);
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
        "</span>" +
        (String(s.image || "").indexOf("http") === 0
          ? "<br /><span class=\"vs-muted\" style=\"word-break:break-all;font-size:0.78rem;opacity:0.9\">" +
            esc(String(s.image).slice(0, 140)) +
            (String(s.image).length > 140 ? "…" : "") +
            "</span>"
          : "") +
        "</div>" +
        '<button type="button" class="vs-btn vs-btn--ghost vh-pin" data-id="' +
        esc(String(s.id)) +
        '">Set fixed hero</button>' +
        '<button type="button" class="vs-btn vs-btn--ghost vs-btn--danger vh-del" data-id="' +
        esc(String(s.id)) +
        '">Remove</button>';
      ul.appendChild(li);
    });
    startLivePreview(slides, settings);
  }

  function loadSlides(opts) {
    if (!opts || !opts.quiet) {
      showMsg("", false);
      showUrlMsg("", false);
    }
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
    wireUnsavedFilePeek();
    var intervalInp = document.getElementById("vhIntervalSec");
    if (intervalInp) {
      intervalInp.addEventListener("change", function () {
        startLivePreview(cachedSlidesForPreview, lastHeroSettings);
      });
    }

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
        putHeroSettings({
          customHeroEnabled: false,
          displayMode: "carousel",
          carouselIntervalMs: 5000,
        })
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

    var urlForm = document.getElementById("vhUrlForm");
    if (urlForm) {
      urlForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var ta = document.getElementById("vhUrlBulk");
        var raw = String((ta && ta.value) || "");
        var lines = raw
          .split(/[\n\r,]+/)
          .map(function (x) {
            return x.trim();
          })
          .filter(Boolean);
        if (!lines.length) {
          showUrlMsg("Paste at least one full image URL (https://…).", true);
          return;
        }
        if (lines.length > 25) {
          showUrlMsg("Maximum 25 URLs per save. Remove extras and try again.", true);
          return;
        }
        var animU = (document.getElementById("vhUrlAnim") && document.getElementById("vhUrlAnim").value) || "slide";
        showUrlMsg("Saving…", false);
        fetch(base() + "/api/vendor/hero-slides", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
          body: JSON.stringify({ imageUrls: lines, animation: animU }),
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
              return j;
            });
          })
          .then(function () {
            if (ta) ta.value = "";
            showUrlMsg("Added " + lines.length + " slide(s) from URL(s).", false);
            return loadSlides();
          })
          .catch(function (e) {
            showUrlMsg(String((e && e.message) || e), true);
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
        var sec = inp ? parseFloat(String(inp.value || "5"), 10) : 5;
        if (!Number.isFinite(sec) || sec < 1.5) sec = 5;
        sec = Math.min(60, sec);
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
