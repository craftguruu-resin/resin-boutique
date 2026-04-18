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

  function filteredProducts() {
    return rawProducts.filter(function (p) {
      var src = p.source === "catalog" ? "catalog" : "vendor";
      var active = p.isActive !== false;
      var oos = !!p.listingOutOfStock;
      if (statusFilter === "active") return active && !oos;
      if (statusFilter === "oos") return oos;
      if (statusFilter === "disc") return !active;
      return true;
    });
  }

  function findProductById(id) {
    for (var i = 0; i < rawProducts.length; i++) {
      if (rawProducts[i].id === id) return rawProducts[i];
    }
    return null;
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
        "<tr><td colspan=\"4\" class=\"vs-muted\">No products match this status filter.</td></tr>";
      if (empty) empty.style.display = "none";
      return;
    }
    if (empty) empty.style.display = "none";
    tb.innerHTML = rows
      .map(function (p) {
        var src = p.source === "catalog" ? "catalog" : "vendor";
        var active = p.isActive !== false;
        var oos = !!p.listingOutOfStock;
        var statePills = "";
        if (oos) {
          statePills += "<span class=\"vs-pill vs-pill--oos\">OOS</span>";
        }
        if (active) {
          statePills +=
            "<span class=\"vs-pill vs-pill--active\" title=\"" +
            esc(src === "catalog" ? "Listed on the guest site" : "Vendor product is live") +
            "\">Active</span>";
        } else {
          statePills += "<span class=\"vs-pill vs-pill--inactive\">Discontinued</span>";
        }
        var img = p.image
          ? "<img src=\"" + esc(imgSrc(p.image)) + "\" alt=\"\" width=\"56\" height=\"56\" style=\"object-fit:cover;border-radius:6px\" />"
          : "—";
        var skuCell = p.sku ? esc(p.sku) : "<span class=\"vs-muted\">—</span>";
        var actions =
          "<div class=\"vpm-actions\"><button type=\"button\" class=\"vs-btn vs-btn--ghost vpm-edit\" data-id=\"" +
          esc(p.id) +
          "\">Edit</button>" +
          statePills;
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
          "</td><td>" +
          actions +
          "</td></tr>"
        );
      })
      .join("");
  }

  function setCatalogFormDisabled(on) {
    ["vpmName", "vpmLblS", "vpmLblM", "vpmLblL", "vpmImage"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !!on;
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
    var oos = document.getElementById("vpmOos");
    if (oos) oos.checked = !!p.listingOutOfStock;
    var note = document.getElementById("vpmCatalogNote");
    if (note) note.style.display = editingSource === "catalog" ? "block" : "none";
    setCatalogFormDisabled(editingSource === "catalog");
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
        });
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
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
    var oosEl = document.getElementById("vpmOos");
    var oos = !!(oosEl && oosEl.checked);
    var ps = Number(document.getElementById("vpmPriceS").value);
    var pm = Number(document.getElementById("vpmPriceM").value);
    var pl = Number(document.getElementById("vpmPriceL").value);

    if (editingSource === "catalog") {
      putCatalogPrices(editingId, {
        priceS: Number.isFinite(ps) ? ps : 0,
        priceM: Number.isFinite(pm) ? pm : 0,
        priceL: Number.isFinite(pl) ? pl : 0,
        outOfStock: oos,
      })
        .then(function () {
          showMsg("Saved.", false);
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
        return putCatalogPrices(editingId, { outOfStock: oos });
      })
      .then(function () {
        showMsg("Saved.", false);
        return loadList();
      })
      .then(function () {
        closeEdit();
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
      });
  }

  function runSearch() {
    var el = document.getElementById("vpmSearch");
    searchQ = el ? String(el.value || "").trim() : "";
    loadList().catch(function () {});
  }

  function boot() {
    if (V.injectSidebar) V.injectSidebar();

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
    document.getElementById("vpmSearch").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        runSearch();
      }
    });

    document.getElementById("vpmTbody").addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var id = t.getAttribute("data-id");
      if (!id) return;
      var p = findProductById(id);
      if (t.classList.contains("vpm-edit") && p) {
        openEdit(p);
      }
      if (t.classList.contains("vpm-disc")) {
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
      }
      if (t.classList.contains("vpm-react")) {
        setActive(id, true)
          .then(function () {
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
