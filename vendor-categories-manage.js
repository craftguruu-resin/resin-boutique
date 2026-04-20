(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;

  var resinCategories = [];

  function setMsg(t, isErr) {
    var el = document.getElementById("vcmMsg");
    if (!el) return;
    el.textContent = t || "";
    el.style.color = isErr ? "#b42318" : "";
  }

  function parseSubsField(text) {
    var raw = String(text || "").trim();
    if (!raw) return null;
    try {
      var j = JSON.parse(raw);
      return Array.isArray(j) ? j : null;
    } catch (_) {
      return false;
    }
  }

  function loadResin() {
    return V.vendorFetch(V.vendorApiUrl("/api/vendor/categories"), {
      headers: V.authHeaders(),
      cache: "no-store",
    })
      .then(V.parseApiJson)
      .then(function (x) {
        if (!x.okHttp || !x.json || !x.json.ok) {
          throw new Error((x.json && x.json.error) || "Categories failed");
        }
        resinCategories = x.json.categories || [];
        renderResin();
      });
  }

  function loadRm() {
    return V.vendorFetch(V.vendorApiUrl("/api/vendor/raw-material-taxonomy"), {
      headers: V.authHeaders(),
      cache: "no-store",
    })
      .then(V.parseApiJson)
      .then(function (x) {
        if (!x.okHttp || !x.json || !x.json.ok || !x.json.taxonomy) {
          throw new Error((x.json && x.json.error) || "Taxonomy failed");
        }
        var ta = document.getElementById("vcmRmJson");
        if (ta) {
          ta.value = JSON.stringify(x.json.taxonomy, null, 2);
        }
      });
  }

  function esc(s) {
    return String(s == null ? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function renderResin() {
    var host = document.getElementById("vcmResinList");
    if (!host) return;
    if (!resinCategories.length) {
      host.innerHTML = "<p class='vs-muted'>No categories.</p>";
      return;
    }
    var rows = resinCategories
      .map(function (c) {
        var vo = c.vendor_owned ? " <span class='vs-muted'>(vendor)</span>" : "";
        var subs = (c.subcategories || [])
          .map(function (s) {
            return (
              esc(s.id) +
              (s.id === "all" ?
                ""
              : ' <button type="button" class="vs-btn vs-btn--ghost vs-btn--sm vcm-del-sub" data-cat="' +
                  esc(c.id) +
                  '" data-sub="' +
                  esc(s.id) +
                  '">Remove sub</button>')
            );
          })
          .join("<br />");
        var del =
          c.vendor_owned ?
            '<button type="button" class="vs-btn vs-btn--ghost vcm-del-cat" data-cat="' + esc(c.id) + '">Delete category</button>'
          : '<span class="vs-muted">Built-in — delete disabled</span>';
        return (
          "<div class='vs-card vcm-cat-card' style='margin:0.5rem 0;padding:0.65rem 0.85rem' data-cat='" +
          esc(c.id) +
          "'>" +
          "<div class='vs-row-actions' style='flex-wrap:wrap;gap:0.5rem;align-items:flex-start'>" +
          "<strong>" +
          esc(c.label) +
          "</strong> <code>" +
          esc(c.id) +
          "</code>" +
          vo +
          "</div>" +
          "<div class='vs-muted' style='font-size:0.85rem;margin:0.35rem 0'>Subs: " +
          subs +
          "</div>" +
          "<div class='vs-row-actions' style='flex-wrap:wrap;gap:0.5rem;align-items:flex-end;margin-top:0.35rem'>" +
          "<div class='vs-field' style='margin:0;min-width:7rem'><label>Label<br /><input class='vs-input vcm-lbl' type='text' value='" +
          esc(c.label) +
          "' maxlength='200'/></label></div>" +
          "<div class='vs-field' style='margin:0;min-width:7rem'><label>Folder<br /><input class='vs-input vcm-fld' type='text' value='" +
          esc(c.folder || "") +
          "' maxlength='200'/></label></div>" +
          "<div class='vs-field' style='margin:0;flex:1;min-width:10rem'><label>Image URL<br /><input class='vs-input vcm-nav' type='text' value='" +
          esc(c.nav_image || "") +
          "' maxlength='500'/></label></div>" +
          "<button type='button' class='vs-btn vs-btn--primary vcm-save-cat' data-cat='" +
          esc(c.id) +
          "'>Save</button>" +
          del +
          "</div>" +
          "<div class='vs-field' style='margin:0.35rem 0 0'>" +
          "<label>Sub-folders JSON<br /><textarea class='vs-input vcm-subs' rows='2' style='font-family:ui-monospace,monospace;font-size:0.78rem'></textarea></label></div>" +
          "</div>"
        );
      })
      .join("");
    host.innerHTML = rows;
    resinCategories.forEach(function (c, idx) {
      var cards = host.querySelectorAll(".vcm-cat-card");
      var card = cards[idx];
      if (!card) return;
      var tx = card.querySelector("textarea.vcm-subs");
      if (tx) {
        tx.value = JSON.stringify(c.subcategories || [], null, 2);
      }
    });
  }

  function refreshAll() {
    setMsg("Loading…");
    return loadResin()
      .then(function () {
        return loadRm();
      })
      .then(function () {
        setMsg("");
      })
      .catch(function (e) {
        setMsg(String((e && e.message) || e), true);
      });
  }

  document.getElementById("vcmRefresh") &&
    document.getElementById("vcmRefresh").addEventListener("click", function () {
      refreshAll();
    });

  document.getElementById("vcmCreateBtn") &&
    document.getElementById("vcmCreateBtn").addEventListener("click", function () {
      var label = String(document.getElementById("vcmNewLabel").value || "").trim();
      var idOpt = String(document.getElementById("vcmNewId").value || "").trim();
      var folder = String(document.getElementById("vcmNewFolder").value || "").trim();
      var nav = String(document.getElementById("vcmNewNav").value || "").trim();
      var subsParsed = parseSubsField(document.getElementById("vcmNewSubs").value);
      if (subsParsed === false) {
        setMsg("Sub-folders must be valid JSON array.", true);
        return;
      }
      if (!label) {
        setMsg("Label is required.", true);
        return;
      }
      var body = { label: label, navImage: nav };
      if (idOpt) body.id = idOpt;
      if (folder) body.folder = folder;
      if (subsParsed) body.subcategories = subsParsed;
      setMsg("Creating…");
      V.vendorFetch(V.vendorApiUrl("/api/vendor/categories"), {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
        body: JSON.stringify(body),
      })
        .then(V.parseApiJson)
        .then(function (x) {
          if (!x.okHttp || !x.json || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Create failed");
          }
          document.getElementById("vcmNewLabel").value = "";
          document.getElementById("vcmNewId").value = "";
          document.getElementById("vcmNewFolder").value = "";
          document.getElementById("vcmNewNav").value = "";
          document.getElementById("vcmNewSubs").value = "";
          setMsg("Category created.");
          return loadResin();
        })
        .catch(function (e) {
          setMsg(String((e && e.message) || e), true);
        });
    });

  document.getElementById("vcmRmSave") &&
    document.getElementById("vcmRmSave").addEventListener("click", function () {
      var ta = document.getElementById("vcmRmJson");
      var raw = String((ta && ta.value) || "").trim();
      var doc;
      try {
        doc = JSON.parse(raw);
      } catch (_) {
        setMsg("Invalid JSON.", true);
        return;
      }
      setMsg("Saving taxonomy…");
      V.vendorFetch(V.vendorApiUrl("/api/vendor/raw-material-taxonomy"), {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
        body: JSON.stringify({ taxonomy: doc }),
      })
        .then(V.parseApiJson)
        .then(function (x) {
          if (!x.okHttp || !x.json || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Save failed");
          }
          setMsg("Raw material taxonomy saved.");
        })
        .catch(function (e) {
          setMsg(String((e && e.message) || e), true);
        });
    });

  document.getElementById("vcmResinList") &&
    document.getElementById("vcmResinList").addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      if (t.classList.contains("vcm-save-cat")) {
        var cid = t.getAttribute("data-cat");
        var card = t.closest(".vcm-cat-card");
        if (!card) return;
        var lbl = card.querySelector(".vcm-lbl");
        var fld = card.querySelector(".vcm-fld");
        var nav = card.querySelector(".vcm-nav");
        var tx = card.querySelector("textarea.vcm-subs");
        var subsParsed = tx ? parseSubsField(tx.value) : null;
        if (subsParsed === false) {
          setMsg("Sub-folders JSON invalid for " + cid, true);
          return;
        }
        var body = {
          label: String((lbl && lbl.value) || "").trim(),
          folder: String((fld && fld.value) || "").trim(),
          navImage: String((nav && nav.value) || "").trim(),
        };
        if (subsParsed) body.subcategories = subsParsed;
        setMsg("Saving " + cid + "…");
        V.vendorFetch(V.vendorApiUrl("/api/vendor/categories/" + encodeURIComponent(cid)), {
          method: "PATCH",
          headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
          body: JSON.stringify(body),
        })
          .then(V.parseApiJson)
          .then(function (x) {
            if (!x.okHttp || !x.json || !x.json.ok) {
              throw new Error((x.json && x.json.error) || "Save failed");
            }
            setMsg("Saved " + cid + ".");
            return loadResin();
          })
          .catch(function (e) {
            setMsg(String((e && e.message) || e), true);
          });
        return;
      }
      if (t.classList.contains("vcm-del-cat")) {
        var cid2 = t.getAttribute("data-cat");
        if (!window.confirm("Delete category " + cid2 + " and all its database products and overrides?")) return;
        setMsg("Deleting…");
        V.vendorFetch(V.vendorApiUrl("/api/vendor/categories/" + encodeURIComponent(cid2)), {
          method: "DELETE",
          headers: V.authHeaders(),
        })
          .then(V.parseApiJson)
          .then(function (x) {
            if (!x.okHttp || !x.json || !x.json.ok) {
              throw new Error((x.json && x.json.error) || "Delete failed");
            }
            setMsg("Deleted " + cid2 + ".");
            return loadResin();
          })
          .catch(function (e) {
            setMsg(String((e && e.message) || e), true);
          });
        return;
      }
      if (t.classList.contains("vcm-del-sub")) {
        var c3 = t.getAttribute("data-cat");
        var s3 = t.getAttribute("data-sub");
        if (!window.confirm("Remove subfolder " + s3 + " from " + c3 + "? Listings move to All.")) return;
        setMsg("Removing sub…");
        V.vendorFetch(
          V.vendorApiUrl("/api/vendor/categories/" + encodeURIComponent(c3) + "/subcategories/" + encodeURIComponent(s3)),
          { method: "DELETE", headers: V.authHeaders() }
        )
          .then(V.parseApiJson)
          .then(function (x) {
            if (!x.okHttp || !x.json || !x.json.ok) {
              throw new Error((x.json && x.json.error) || "Remove failed");
            }
            setMsg("Removed " + s3 + ".");
            return loadResin();
          })
          .catch(function (e) {
            setMsg(String((e && e.message) || e), true);
          });
      }
    });

  document.addEventListener("DOMContentLoaded", function () {
    refreshAll();
  });
})();
