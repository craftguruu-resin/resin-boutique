(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;

  var rawProducts = [];
  var editingId = "";
  var editingSource = "";
  var searchQ = "";
  var statusFilter = "all";

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

  function imgSrc(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (u.indexOf("http") === 0 || u.indexOf("//") === 0) return u;
    if (u.charAt(0) === "/") return V.vendorPageHref(u.slice(1));
    return V.vendorPageHref(u);
  }

  function showMsg(text, isErr) {
    var el = document.getElementById("vpmMsg");
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.style.color = isErr ? "#b42318" : "";
  }

  function refreshGuestCatalogMerge() {
    try {
      if (window.CraftguruCatalogMerge && typeof window.CraftguruCatalogMerge.refresh === "function") {
        window.CraftguruCatalogMerge.refresh();
      }
    } catch (_) {}
  }

  function filteredProducts() {
    return rawProducts.filter(function (p) {
      var active = p.isActive !== false;
      if (statusFilter === "active") return active;
      if (statusFilter === "disc") return !active;
      if (statusFilter === "return_gift") return !!p.returnGift;
      return true;
    });
  }

  function findProductById(id) {
    for (var i = 0; i < rawProducts.length; i++) {
      if (rawProducts[i].id === id) return rawProducts[i];
    }
    return null;
  }

  function returnGiftRadioGroupName(productId) {
    return "vpmrg_" + String(productId || "x").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function renderTable() {
    var tb = document.getElementById("vpmTbody");
    var empty = document.getElementById("vpmEmpty");
    if (!tb) return;
    if (!rawProducts.length) {
      tb.innerHTML = "";
      if (empty) {
        empty.style.display = "block";
        empty.textContent = searchQ
          ? "No products match your search."
          : "No products loaded.";
      }
      return;
    }
    var rows = filteredProducts();
    if (!rows.length) {
      tb.innerHTML =
        "<tr><td colspan=\"5\" class=\"vs-muted\">No products match this status filter.</td></tr>";
      if (empty) empty.style.display = "none";
      return;
    }
    if (empty) empty.style.display = "none";
    tb.innerHTML = rows
      .map(function (p) {
        var src = p.source === "catalog" ? "catalog" : "vendor";
        var active = p.isActive !== false;
        var rg = !!p.returnGift;
        var rgNm = returnGiftRadioGroupName(p.id);
        var pills = "";
        if (!active) {
          pills += "<span class=\"vs-pill vs-pill--inactive\">Discontinued</span>";
        } else {
          pills += "<span class=\"vs-pill vs-pill--active\">Active</span>";
        }
        var img = p.image
          ? "<img src=\"" + esc(imgSrc(p.image)) + "\" alt=\"\" width=\"56\" height=\"56\" style=\"object-fit:cover;border-radius:6px\" />"
          : "—";
        var skuCell = p.sku ? esc(p.sku) : "<span class=\"vs-muted\">—</span>";
        var rgCell =
          "<div class=\"vpm-rg-inline\" role=\"radiogroup\" aria-label=\"Return gift listing\" title=\"" +
          esc(src === "catalog" ? "Catalog row — edit to change" : "Vendor row — edit to change") +
          "\">" +
          "<label class=\"vpm-rg-inline__lab" +
          (rg ? "" : " vpm-rg-inline__lab--on") +
          "\"><input type=\"radio\" tabindex=\"-1\" disabled name=\"" +
          esc(rgNm) +
          "\" value=\"0\"" +
          (rg ? "" : " checked") +
          " /><span>Shop</span></label>" +
          "<label class=\"vpm-rg-inline__lab" +
          (rg ? " vpm-rg-inline__lab--on" : "") +
          "\"><input type=\"radio\" tabindex=\"-1\" disabled name=\"" +
          esc(rgNm) +
          "\" value=\"1\"" +
          (rg ? " checked" : "") +
          " /><span>Return gift</span></label>" +
          "</div>";
        var actions =
          "<div class=\"vpm-actions vpm-actions--inline\"><button type=\"button\" class=\"vs-btn vs-btn--ghost vpm-edit\" data-id=\"" +
          esc(p.id) +
          "\">Edit</button>" +
          pills;
        if (active) {
          actions +=
            "<button type=\"button\" class=\"vs-btn vs-btn--ghost vs-btn--danger vpm-disc\" data-id=\"" +
            esc(p.id) +
            "\">Discontinue</button>";
        } else {
          actions +=
            "<button type=\"button\" class=\"vs-btn vs-btn--primary vpm-react\" data-id=\"" +
            esc(p.id) +
            "\">Set active</button>";
        }
        actions +=
          "<button type=\"button\" class=\"vs-btn vs-btn--ghost vs-btn--danger vpm-del\" data-id=\"" +
          esc(p.id) +
          "\" data-source=\"" +
          esc(src) +
          "\">Delete</button>";
        actions += "</div>";
        return (
          "<tr data-id=\"" +
          esc(p.id) +
          "\"><td>" +
          img +
          "</td><td><strong>" +
          esc(p.name) +
          "</strong><br /><small class=\"vs-muted\">" +
          esc(p.id) +
          "</small></td><td>" +
          skuCell +
          "</td><td class=\"vpm-rg-cell\">" +
          rgCell +
          "</td><td>" +
          actions +
          "</td></tr>"
        );
      })
      .join("");
  }

  /** Bundled catalog rows: name & images stay on data.js; prices, return gift, and size labels are editable here. */
  function setCatalogFormDisabled(on) {
    ["vpmName", "vpmImage", "vpmImageUrl", "vpmGallery"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !!on;
    });
  }

  function syncReturnGiftVisual() {
    document.querySelectorAll(".vpm-return-gift-row__opt").forEach(function (lab) {
      var inp = lab.querySelector("input");
      lab.classList.toggle("is-selected", !!(inp && inp.checked));
    });
  }

  function openEdit(p) {
    editingId = p.id;
    editingSource = p.source === "catalog" ? "catalog" : "vendor";
    var card = document.getElementById("vpmEditCard");
    if (card) card.hidden = false;
    document.getElementById("vpmEditId").textContent = p.id;
    document.getElementById("vpmName").value = p.name || "";
    var pr = p.prices || {};
    document.getElementById("vpmPriceS").value = pr.s != null ? pr.s : "";
    document.getElementById("vpmPriceM").value = pr.m != null ? pr.m : "";
    document.getElementById("vpmPriceL").value = pr.l != null ? pr.l : "";
    var sl = p.sizeLabels || {};
    document.getElementById("vpmLblS").value = (sl.s && sl.s.name) || "";
    document.getElementById("vpmLblM").value = (sl.m && sl.m.name) || "";
    document.getElementById("vpmLblL").value = (sl.l && sl.l.name) || "";
    var fi = document.getElementById("vpmImage");
    if (fi) fi.value = "";
    var iu = document.getElementById("vpmImageUrl");
    if (iu) {
      var im = String((p && p.image) || "").trim();
      iu.value = /^https:\/\//i.test(im) ? im : "";
    }
    var gal = document.getElementById("vpmGallery");
    if (gal) {
      var g = p && p.gallery;
      gal.value = Array.isArray(g) && g.length ? g.join("\n") : "";
    }
    var rgY = document.getElementById("vpmReturnGiftYes");
    var rgN = document.getElementById("vpmReturnGiftNo");
    if (rgY && rgN) {
      if (p.returnGift) {
        rgY.checked = true;
      } else {
        rgN.checked = true;
      }
    }
    syncReturnGiftVisual();
    var note = document.getElementById("vpmCatalogNote");
    if (note) note.style.display = editingSource === "catalog" ? "block" : "none";
    setCatalogFormDisabled(editingSource === "catalog");
    if (window.VendorCatalogPdpOptions) {
      window.VendorCatalogPdpOptions.fillEditorsFromOptions(p.options || null);
    }
    showMsg("", false);
    try {
      card && card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (_) {}
  }

  function closeEdit() {
    editingId = "";
    editingSource = "";
    var card = document.getElementById("vpmEditCard");
    if (card) card.hidden = true;
    setCatalogFormDisabled(false);
    var note = document.getElementById("vpmCatalogNote");
    if (note) note.style.display = "none";
    if (window.VendorCatalogPdpOptions) window.VendorCatalogPdpOptions.clearEditors();
    showMsg("", false);
  }

  function manageListUrl() {
    var u = base() + "/api/vendor/products/manage";
    if (searchQ) u += "?q=" + encodeURIComponent(searchQ);
    return u;
  }

  function loadList() {
    showMsg("", false);
    return fetch(manageListUrl(), { headers: V.authHeaders(), cache: "no-store" })
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
          rawProducts = j.products || [];
          renderTable();
          refreshGuestCatalogMerge();
        });
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
      });
  }

  function deleteProduct(id) {
    return fetch(base() + "/api/vendor/products/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: V.authHeaders(),
      cache: "no-store",
    }).then(function (res) {
      return res.text().then(function (text) {
        var j = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch (_) {}
        if (!res.ok || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Delete failed");
        }
      });
    });
  }

  /** Bundled catalog: removes catalog_price_overrides row only (product stays in site catalog). */
  function deleteCatalogOverride(id) {
    return fetch(base() + "/api/vendor/catalog-products/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: V.authHeaders(),
      cache: "no-store",
    }).then(function (res) {
      return res.text().then(function (text) {
        var j = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch (_) {}
        if (!res.ok || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Delete failed");
        }
        return j;
      });
    });
  }

  function setActive(id, active) {
    return fetch(base() + "/api/vendor/products/" + encodeURIComponent(id) + "/active", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      cache: "no-store",
      body: JSON.stringify({ active: !!active }),
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

  function putCatalogPrices(id, body) {
    return fetch(base() + "/api/vendor/catalog-products/" + encodeURIComponent(id) + "/prices", {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify(body),
      cache: "no-store",
    }).then(function (res) {
      return res.text().then(function (text) {
        var j = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch (_) {}
        if (!res.ok || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Catalog update failed");
        }
      });
    });
  }

  function saveEdit() {
    if (!editingId) return;
    showMsg("", false);
    var ps = Number(document.getElementById("vpmPriceS").value);
    var pm = Number(document.getElementById("vpmPriceM").value);
    var pl = Number(document.getElementById("vpmPriceL").value);

    var returnGift = !!(document.getElementById("vpmReturnGiftYes") && document.getElementById("vpmReturnGiftYes").checked);

    if (editingSource === "catalog") {
      var advOpt =
        window.VendorCatalogPdpOptions && typeof window.VendorCatalogPdpOptions.readOptionsFromForm === "function"
          ? window.VendorCatalogPdpOptions.readOptionsFromForm()
          : undefined;
      var catBody = {
        priceS: Number.isFinite(ps) ? ps : 0,
        priceM: Number.isFinite(pm) ? pm : 0,
        priceL: Number.isFinite(pl) ? pl : 0,
        returnGift: returnGift,
        sizeLabelS: String((document.getElementById("vpmLblS") && document.getElementById("vpmLblS").value) || "").trim(),
        sizeLabelM: String((document.getElementById("vpmLblM") && document.getElementById("vpmLblM").value) || "").trim(),
        sizeLabelL: String((document.getElementById("vpmLblL") && document.getElementById("vpmLblL").value) || "").trim(),
      };
      if (advOpt !== undefined) catBody.options = advOpt;
      putCatalogPrices(editingId, catBody)
        .then(function () {
          showMsg("Saved.", false);
          refreshGuestCatalogMerge();
          return loadList();
        })
        .then(function () {
          closeEdit();
        })
        .catch(function (e) {
          showMsg(String((e && e.message) || e), true);
        });
      return;
    }

    var fd = new FormData();
    fd.set("name", document.getElementById("vpmName").value.trim());
    fd.set("priceS", document.getElementById("vpmPriceS").value);
    fd.set("priceM", document.getElementById("vpmPriceM").value);
    fd.set("priceL", document.getElementById("vpmPriceL").value);
    fd.set("sizeLabelS", document.getElementById("vpmLblS").value.trim());
    fd.set("sizeLabelM", document.getElementById("vpmLblM").value.trim());
    fd.set("sizeLabelL", document.getElementById("vpmLblL").value.trim());
    fd.set("returnGift", returnGift ? "true" : "false");
    var imageUrl = String((document.getElementById("vpmImageUrl") && document.getElementById("vpmImageUrl").value) || "").trim();
    if (imageUrl) {
      if (!/^https:\/\//i.test(imageUrl)) {
        showMsg("Image URL must start with https://", true);
        return;
      }
      fd.set("imageUrl", imageUrl);
    }
    var galleryTxt = String((document.getElementById("vpmGallery") && document.getElementById("vpmGallery").value) || "");
    fd.set("gallery", galleryTxt);
    var file = document.getElementById("vpmImage").files && document.getElementById("vpmImage").files[0];
    if (file) fd.set("image", file, file.name);

    var headers = V.authHeaders();
    delete headers["Content-Type"];

    fetch(base() + "/api/vendor/products/" + encodeURIComponent(editingId), {
      method: "PUT",
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
        var advOpt2 =
          window.VendorCatalogPdpOptions && typeof window.VendorCatalogPdpOptions.readOptionsFromForm === "function"
            ? window.VendorCatalogPdpOptions.readOptionsFromForm()
            : undefined;
        var pb = { returnGift: returnGift };
        if (advOpt2 !== undefined) pb.options = advOpt2;
        return putCatalogPrices(editingId, pb);
      })
      .then(function () {
        showMsg("Saved.", false);
        refreshGuestCatalogMerge();
        return loadList();
      })
      .then(function () {
        closeEdit();
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
      });
  }

  var searchDebounceTimer = null;

  function runSearch() {
    var el = document.getElementById("vpmSearch");
    searchQ = el ? String(el.value || "").trim() : "";
    loadList().catch(function () {});
  }

  function scheduleSearch() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(function () {
      searchDebounceTimer = null;
      runSearch();
    }, 220);
  }

  function boot() {
    if (V.injectSidebar) V.injectSidebar();
    if (window.VendorCatalogPdpOptions && typeof window.VendorCatalogPdpOptions.boot === "function") {
      window.VendorCatalogPdpOptions.boot();
    }

    document.getElementById("vpmRefresh").addEventListener("click", function () {
      loadList();
    });
    document.getElementById("vpmSearchBtn").addEventListener("click", runSearch);
    document.getElementById("vpmSearchClear").addEventListener("click", function () {
      var el = document.getElementById("vpmSearch");
      if (el) el.value = "";
      searchQ = "";
      loadList().catch(function () {});
    });
    var stEl = document.getElementById("vpmStatus");
    if (stEl) {
      stEl.addEventListener("change", function () {
        statusFilter = String(stEl.value || "all");
        renderTable();
      });
    }
    var searchInp = document.getElementById("vpmSearch");
    if (searchInp) {
      searchInp.addEventListener("input", scheduleSearch);
      searchInp.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
          runSearch();
        }
      });
    }

    document.querySelectorAll('input[name="vpmReturnGift"]').forEach(function (inp) {
      inp.addEventListener("change", syncReturnGiftVisual);
    });

    document.getElementById("vpmTbody").addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || typeof t.closest !== "function") return;
      var btn = t.closest("button[data-id]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      if (!id) return;
      var p = findProductById(id);
      if (btn.classList.contains("vpm-edit") && p) {
        openEdit(p);
        return;
      }
      if (btn.classList.contains("vpm-disc")) {
        if (!window.confirm("Discontinue this product? It will disappear from the guest storefront and from the main Inventory screen until you set it active again.")) {
          return;
        }
        setActive(id, false)
          .then(function () {
            return loadList();
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
        return;
      }
      if (btn.classList.contains("vpm-react")) {
        setActive(id, true)
          .then(function () {
            return loadList();
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
        return;
      }
      if (btn.classList.contains("vpm-del")) {
        var src = String(btn.getAttribute("data-source") || "vendor");
        if (src === "catalog") {
          if (
            !window.confirm(
              "Remove all saved database settings for this catalog product (custom prices, size labels, return-gift flag, discontinued state)? The product stays in the bundled site catalog with its default prices and listing."
            )
          ) {
            return;
          }
          deleteCatalogOverride(id)
            .then(function (j) {
              if (editingId === id) closeEdit();
              if (j && j.removed === false) {
                showMsg("No saved overrides were stored for this product.", false);
              } else {
                showMsg("Catalog overrides removed.", false);
              }
              refreshGuestCatalogMerge();
              return loadList();
            })
            .catch(function (e) {
              window.alert(String((e && e.message) || e));
            });
          return;
        }
        if (!window.confirm("Permanently delete this vendor-added product from the database? This cannot be undone.")) {
          return;
        }
        deleteProduct(id)
          .then(function () {
            if (editingId === id) closeEdit();
            return loadList();
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
      }
    });
    document.getElementById("vpmSave").addEventListener("click", saveEdit);
    document.getElementById("vpmCancelEdit").addEventListener("click", closeEdit);

    loadList().catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
