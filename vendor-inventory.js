(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;
  var vf = V.vendorFetch || fetch;

  var activeTab = "studio";
  var catalogOffset = 0;
  var catalogQ = "";
  var catalogLimit = 60;
  var catalogTotal = 0;
  var viPollTimer = null;
  var studioCategoryFilter = "";
  var studioProductFilter = "";
  var studioSearchQ = "";
  var catalogCategoryFilter = "";
  var viCategoriesCache = [];

  /** API / DB may send subcategories as a JSON string or non-array; string forEach would iterate characters. */
  function coerceSubcategoriesList(raw) {
    var subs = raw;
    if (subs == null) subs = [];
    if (typeof subs === "string") {
      try {
        subs = JSON.parse(subs);
      } catch (_) {
        subs = [];
      }
    }
    if (subs && typeof subs === "object" && !Array.isArray(subs)) {
      subs = Object.keys(subs)
        .filter(function (k) {
          return /^(?:0|[1-9]\d*)$/.test(k);
        })
        .sort(function (a, b) {
          return Number(a) - Number(b);
        })
        .map(function (k) {
          return subs[k];
        });
    }
    if (!Array.isArray(subs)) subs = [];
    return subs
      .map(function (s) {
        if (s == null) return null;
        if (typeof s === "string") {
          var ts = String(s).trim();
          return ts ? { id: ts.slice(0, 80), label: ts.slice(0, 200) } : null;
        }
        if (typeof s !== "object") return null;
        var id =
          (s.id != null && String(s.id).trim()) ||
          (s.subcategory_id != null && String(s.subcategory_id).trim()) ||
          (s.subcategoryId != null && String(s.subcategoryId).trim()) ||
          (s.slug != null && String(s.slug).trim()) ||
          (s.key != null && String(s.key).trim()) ||
          (s.value != null && String(s.value).trim()) ||
          "";
        id = id.slice(0, 80);
        if (!id) return null;
        var label =
          (s.label != null && String(s.label).trim()) ||
          (s.name != null && String(s.name).trim()) ||
          id;
        return { id: id, label: label.slice(0, 200) };
      })
      .filter(Boolean);
  }

  function normalizeVendorCategories(cats) {
    return (cats || [])
      .map(function (c) {
        if (!c) return null;
        var id = String(c.id != null ? c.id : "").trim();
        if (!id) return null;
        return {
          id: id,
          label: c.label || id,
          folder: c.folder || "",
          subcategories: coerceSubcategoriesList(c.subcategories),
        };
      })
      .filter(Boolean);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function on(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
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
    var desk = document.getElementById("viDeskSection");
    if (desk) desk.hidden = !on;
  }

  function stockCellVal(v) {
    if (v == null || !Number.isFinite(Number(v))) return "";
    var n = Math.round(Number(v) * 100) / 100;
    return String(n);
  }

  function catalogStockFieldValue(v) {
    if (v != null && Number.isFinite(Number(v))) {
      return stockCellVal(v);
    }
    return "0";
  }

  function setTab(tab) {
    activeTab = tab;
    var studio = document.getElementById("viStudioPanel");
    var cat = document.getElementById("viCatalogPanel");
    var addP = document.getElementById("viAddProductPanel");
    if (studio) studio.hidden = tab !== "studio";
    if (cat) cat.hidden = tab !== "catalog";
    if (addP) addP.hidden = tab !== "addproduct";
    document.querySelectorAll(".vi-tab").forEach(function (b) {
      var t = b.getAttribute("data-tab");
      var isAct = t === tab;
      b.classList.toggle("vs-btn--primary", isAct);
      b.classList.toggle("vs-btn--ghost", !isAct);
    });
    if (tab === "catalog") {
      catalogOffset = 0;
      loadCatalogPage(true);
    }
    if (tab === "addproduct") {
      refillApCategoryDropdowns();
    }
    if (viPollTimer) {
      clearInterval(viPollTimer);
      viPollTimer = null;
    }
  }

  function refillApCategoryDropdowns() {
    var sel = document.getElementById("viApCategory");
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Choose —";
    sel.appendChild(o0);
    viCategoriesCache.forEach(function (c) {
      var o = document.createElement("option");
      o.value = String(c.id != null ? c.id : "");
      o.textContent = c.label || String(c.id != null ? c.id : "");
      sel.appendChild(o);
    });
    if (prev && Array.prototype.some.call(sel.options, function (op) { return op.value === prev; })) {
      sel.value = prev;
    }
  }

  function loadCategories() {
    var base = V.apiBase();
    return vf(V.vendorApiUrl("/api/vendor/categories"), { headers: V.authHeaders() })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) {
            return V.explainVendor401(base);
          }
          if (!x.okHttp || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Categories failed");
          }
          return x.json.categories || [];
        });
      })
      .then(function (cats) {
        viCategoriesCache = normalizeVendorCategories(cats);
        function refill(id, firstLabel) {
          var sel = document.getElementById(id);
          if (!sel) return;
          var prev = sel.value;
          sel.innerHTML = "";
          var o0 = document.createElement("option");
          o0.value = "";
          o0.textContent = firstLabel;
          sel.appendChild(o0);
          viCategoriesCache.forEach(function (c) {
            var o = document.createElement("option");
            o.value = String(c.id != null ? c.id : "");
            o.textContent = c.label || String(c.id != null ? c.id : "");
            sel.appendChild(o);
          });
          if (prev && Array.prototype.some.call(sel.options, function (op) { return op.value === prev; })) {
            sel.value = prev;
          }
        }
        refill("viCatalogCategoryFilter", "All");
        refill("viCategory", "— Unsorted —");
      });
  }

  function syncListFiltersFromForm() {
    var catEl = document.getElementById("viCategory");
    var prodEl = document.getElementById("viProduct");
    var searchEl = document.getElementById("viStudioSearch");
    studioCategoryFilter = catEl ? String(catEl.value || "").trim() : "";
    studioProductFilter =
      prodEl && !prodEl.disabled && prodEl.options && prodEl.options.length ? String(prodEl.value || "").trim() : "";
    studioSearchQ = searchEl ? String(searchEl.value || "").trim().slice(0, 200) : "";
  }

  function resolveMediaUrl(raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    try {
      return new URL(s, window.location.href).href;
    } catch (_) {
      return s;
    }
  }

  function updateStudioSubcategoryVisibility() {
    var prodSel = document.getElementById("viProduct");
    var subWrap = document.getElementById("viSubcatWrap");
    var subLab = document.getElementById("viSubcatLabel");
    if (!prodSel || !subWrap || !subLab) return;
    var opt = prodSel.selectedOptions && prodSel.selectedOptions[0];
    var pid = prodSel ? String(prodSel.value || "").trim() : "";
    if (!pid || !opt) {
      subWrap.hidden = true;
      subLab.textContent = "—";
      return;
    }
    subLab.textContent = opt.getAttribute("data-sub-label") || opt.getAttribute("data-sub") || "—";
    subWrap.hidden = false;
  }

  function updateProductPreviewFromForm() {
    var prodSel = document.getElementById("viProduct");
    var wrap = document.getElementById("viProductPreviewWrap");
    var img = document.getElementById("viProductPreviewImg");
    if (!wrap || !img) return;
    if (!prodSel || !String(prodSel.value || "").trim()) {
      wrap.hidden = true;
      img.removeAttribute("src");
      updateStudioSubcategoryVisibility();
      return;
    }
    var opt = prodSel.selectedOptions && prodSel.selectedOptions[0];
    var raw = opt && opt.getAttribute("data-img");
    var u = resolveMediaUrl(raw);
    if (!u) {
      wrap.hidden = true;
      img.removeAttribute("src");
      updateStudioSubcategoryVisibility();
      return;
    }
    img.src = u;
    img.alt = (opt && opt.textContent) || "";
    wrap.hidden = false;
    updateStudioSubcategoryVisibility();
  }

  function ensureProductsForCategory(catId) {
    var c = String(catId || "").trim();
    if (!c) return Promise.resolve([]);
    var base = V.apiBase();
    return vf(V.vendorApiUrl("/api/vendor/db-products?categoryId=" + encodeURIComponent(c)), { headers: V.authHeaders() })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) {
            return V.explainVendor401(base);
          }
          if (!x.okHttp || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Products failed");
          }
          return x.json.items || [];
        });
      });
  }

  function subLabelFromCategory(catId, subId) {
    var cid = String(catId || "").trim();
    var sid = String(subId || "all").trim();
    var c = viCategoriesCache.find(function (x) {
      return String(x.id) === cid;
    });
    if (!c || !c.subcategories || !c.subcategories.length) return sid || "—";
    var s = c.subcategories.find(function (x) {
      return String(x.id) === sid;
    });
    return s ? s.label : sid || "—";
  }

  function fillProductSelect(sel, items, selectedId, categoryIdForSubs) {
    if (!sel) return;
    var catHint = categoryIdForSubs;
    if (catHint == null || catHint === "") {
      var cs = document.getElementById("viCategory");
      catHint = cs ? String(cs.value || "").trim() : "";
    }
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Select product —";
    sel.appendChild(o0);
    (items || []).forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.id;
      var img = String((p && p.image) || "").trim();
      if (img) o.setAttribute("data-img", img);
      var subId = String((p && p.subcategoryId) || "all").trim();
      o.setAttribute("data-sub", subId);
      o.setAttribute("data-sub-label", subLabelFromCategory(catHint, subId));
      o.textContent = p.name || p.id;
      sel.appendChild(o);
    });
    var want = String(selectedId || "");
    if (want && Array.prototype.some.call(sel.options, function (op) { return op.value === want; })) {
      sel.value = want;
    }
  }

  function syncFormProductDropdown() {
    var catSel = document.getElementById("viCategory");
    var prodSel = document.getElementById("viProduct");
    if (!catSel || !prodSel) return Promise.resolve();
    var cat = String(catSel.value || "").trim();
    if (!cat) {
      prodSel.disabled = true;
      prodSel.innerHTML = "<option value=''>— Pick a category first —</option>";
      return Promise.resolve();
    }
    prodSel.disabled = false;
    return ensureProductsForCategory(cat).then(function (items) {
      fillProductSelect(prodSel, items, "", cat);
      updateProductPreviewFromForm();
    });
  }

  function updateRowSubcategoryHint(tb, rowId) {
    if (!tb || !rowId) return;
    var pr = tb.querySelector(".vi-item-prod[data-id='" + rowId + "']");
    var subEl = tb.querySelector(".vi-item-sub[data-id='" + rowId + "']");
    if (!subEl) return;
    if (!pr || pr.disabled) {
      subEl.textContent = "—";
      return;
    }
    var opt = pr.selectedOptions && pr.selectedOptions[0];
    var pid = String(pr.value || "").trim();
    subEl.textContent =
      pid && opt ? opt.getAttribute("data-sub-label") || opt.getAttribute("data-sub") || "—" : "—";
  }

  function wireInventoryTableDelegation(tb) {
    if (!tb || tb.getAttribute("data-vi-delegated")) return;
    tb.setAttribute("data-vi-delegated", "1");
    tb.addEventListener("change", function (ev) {
      var t = ev.target;
      if (!t || !t.classList) return;
      if (t.classList.contains("vi-item-prod")) {
        updateRowSubcategoryHint(tb, t.getAttribute("data-id"));
        return;
      }
      if (!t.classList.contains("vi-item-cat")) return;
      var id = t.getAttribute("data-id");
      var cat = String(t.value || "").trim();
      var pr = tb.querySelector(".vi-item-prod[data-id='" + id + "']");
      if (pr) {
        pr.disabled = !cat;
        pr.innerHTML = "<option value=''>—</option>";
      }
      updateRowSubcategoryHint(tb, id);
      if (!cat) return;
      ensureProductsForCategory(cat).then(function (list) {
        fillProductSelect(pr, list, "", cat);
        updateRowSubcategoryHint(tb, id);
      });
    });
  }

  function categorySelectHtml(selectedId) {
    var s = String(selectedId || "");
    var html = "<option value=''" + (!s ? " selected" : "") + ">—</option>";
    viCategoriesCache.forEach(function (c) {
      var id = esc(c.id);
      var on = s === String(c.id) ? " selected" : "";
      html += "<option value='" + id + "'" + on + ">" + esc(c.label || c.id) + "</option>";
    });
    return html;
  }

  /** Qty + save for unlinked rows; save catalog link only for linked rows (prices/OOS live under Storefront / Products). */
  function studioSaveCell(it, pid) {
    var hasProd = String(it.productId || "").trim();
    if (!hasProd) {
      return (
        "<input type='number' class='vi-qty' data-id='" +
        pid +
        "' min='0' step='0.01' value='" +
        esc(String(it.quantity)) +
        "' style='width:5rem'/> <button type='button' class='vs-btn vs-btn--primary vi-save' data-id='" +
        pid +
        "'>Save</button>"
      );
    }
    return "<button type='button' class='vs-btn vs-btn--secondary vi-save' data-id='" + pid + "'>Save link</button>";
  }

  function renderRows(items) {
    var tb = document.getElementById("viTbody");
    if (!tb) return;
    wireInventoryTableDelegation(tb);
    if (!items || !items.length) {
      tb.innerHTML =
        "<tr><td colspan='9' class='vs-muted'>No inventory rows yet. Add materials you buy for the studio.</td></tr>";
      return;
    }
    tb.innerHTML = items
      .map(function (it) {
        var low = Number(it.quantity) <= Number(it.reorderPoint) && Number(it.reorderPoint) > 0;
        var pid = esc(it.id);
        var hasProd = String(it.productId || "").trim();
        var qtyCell = hasProd
          ? "<span class='vs-muted' title='Sum of S+M+L when all sizes are tracked'>" + esc(String(it.quantity)) + "</span>"
          : esc(String(it.quantity));
        var us = it.unitCostS != null && it.unitCostS > 0 ? it.unitCostS : it.unitCost || 0;
        var um = it.unitCostM != null && it.unitCostM > 0 ? it.unitCostM : it.unitCost || 0;
        var ul = it.unitCostL != null && it.unitCostL > 0 ? it.unitCostL : it.unitCost || 0;
        var costCell =
          "<span class=\"vi-unit-costs\" title=\"Per-size unit cost (₹)\"><span class=\"vs-muted\">S</span> " +
          esc(String(us)) +
          " <span class=\"vs-muted\">·</span> <span class=\"vs-muted\">M</span> " +
          esc(String(um)) +
          " <span class=\"vs-muted\">·</span> <span class=\"vs-muted\">L</span> " +
          esc(String(ul)) +
          "</span>";
        return (
          "<tr><td>" +
          esc(it.name) +
          (low ? " <span class='vs-badge vs-badge--low'>Low</span>" : "") +
          "</td><td><select class='vi-item-cat' data-id='" +
          pid +
          "'>" +
          categorySelectHtml(it.categoryId) +
          "</select></td><td><select class='vi-item-prod' data-id='" +
          pid +
          "'" +
          (!String(it.categoryId || "").trim() ? " disabled" : "") +
          "><option value=''>—</option></select><div class='vi-item-sub vs-muted' data-id='" +
          pid +
          "' style='font-size:0.72rem;margin-top:0.2rem;line-height:1.25'>Subcategory: —</div></td><td>" +
          esc(it.sku) +
          "</td><td>" +
          qtyCell +
          "</td><td>" +
          esc(String(it.reorderPoint)) +
          "</td><td>" +
          costCell +
          "</td><td>" +
          esc(it.supplier) +
          "</td><td>" +
          studioSaveCell(it, pid) +
          "</td></tr>"
        );
      })
      .join("");

    tb.querySelectorAll(".vi-save").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        var tr = btn.closest("tr");
        var inp = tb.querySelector(".vi-qty[data-id='" + id + "']");
        var catSel = tb.querySelector(".vi-item-cat[data-id='" + id + "']");
        var prodSel = tb.querySelector(".vi-item-prod[data-id='" + id + "']");
        var cat = catSel ? String(catSel.value || "").trim() : "";
        var prod = prodSel ? String(prodSel.value || "").trim() : "";
        if (cat && !prod) {
          window.alert("Pick a product for this category before saving.");
          return;
        }
        var body = { categoryId: cat };
        if (prod) body.productId = prod;
        if (inp) {
          var q = Number(inp.value);
          if (!Number.isFinite(q) || q < 0) {
            window.alert("Invalid quantity");
            return;
          }
          body.quantity = q;
        }
        var base = V.apiBase();
        vf(V.vendorApiUrl("/api/vendor/inventory/" + encodeURIComponent(id)), {
          method: "PATCH",
          headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
          body: JSON.stringify(body),
        })
          .then(function (res) {
            return V.parseApiJson(res).then(function (x) {
              if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Save failed");
            });
          })
          .then(function () {
            return loadList();
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
      });
    });

    var waits = [];
    items.forEach(function (it) {
      var id = String(it.id);
      var pr = tb.querySelector(".vi-item-prod[data-id='" + id + "']");
      if (!pr) return;
      var cat = String(it.categoryId || "").trim();
      if (!cat) {
        pr.disabled = true;
        pr.innerHTML = "<option value=''>—</option>";
        return;
      }
      pr.disabled = false;
      waits.push(
        ensureProductsForCategory(cat).then(function (list) {
          fillProductSelect(pr, list, it.productId, cat);
          updateRowSubcategoryHint(tb, id);
        })
      );
    });
    if (waits.length) {
      Promise.all(waits)
        .then(function () {
          items.forEach(function (it) {
            updateRowSubcategoryHint(tb, String(it.id));
          });
        })
        .catch(function (e) {
          window.alert(String((e && e.message) || e));
        });
    }
  }

  function applyInventoryMatchToForm(items) {
    if (!items || !items.length) {
      window.alert("No studio inventory line matched that search. Try another SKU or pick category and product.");
      return Promise.resolve(false);
    }
    var skuEl = document.getElementById("viSku");
    var want = skuEl ? String(skuEl.value || "").trim().toLowerCase() : "";
    var picked = items[0];
    if (items.length > 1 && want) {
      var exact = items.filter(function (it) {
        return String(it.sku || "").trim().toLowerCase() === want;
      });
      if (exact.length >= 1) picked = exact[0];
    }
    var cid = String(picked.categoryId || "").trim();
    var pid = String(picked.productId || "").trim();
    if (!cid || !pid) {
      window.alert("That line is not linked to a catalog product. Pick category and product manually.");
      return Promise.resolve(false);
    }
    var catSel = document.getElementById("viCategory");
    if (!catSel || !Array.prototype.some.call(catSel.options, function (o) { return o.value === cid; })) {
      window.alert("Category for that item is not available in the list.");
      return Promise.resolve(false);
    }
    catSel.value = cid;
    return syncFormProductDropdown().then(function () {
      var prodSel = document.getElementById("viProduct");
      if (!prodSel || !Array.prototype.some.call(prodSel.options, function (o) { return o.value === pid; })) {
        window.alert("Product was not found under that category.");
        return false;
      }
      prodSel.value = pid;
      updateProductPreviewFromForm();
      syncListFiltersFromForm();
      loadList().catch(function () {});
      return true;
    });
  }

  function resolveSkuFromInventoryEnter() {
    var skuEl = document.getElementById("viSku");
    var q = skuEl ? String(skuEl.value || "").trim() : "";
    if (!q) return Promise.resolve();
    var base = V.apiBase();
    return vf(V.vendorApiUrl("/api/vendor/inventory?search=" + encodeURIComponent(q)), {
      headers: V.authHeaders(),
      cache: "no-store",
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) {
            return V.explainVendor401(base);
          }
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Lookup failed");
          return x.json.items || [];
        });
      })
      .then(function (items) {
        if (!items || !Array.isArray(items)) return;
        return applyInventoryMatchToForm(items);
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
  }

  function loadList() {
    var base = V.apiBase();
    var url = V.vendorApiUrl("/api/vendor/inventory");
    var qs = [];
    if (studioCategoryFilter) {
      qs.push("categoryId=" + encodeURIComponent(studioCategoryFilter));
    }
    if (studioProductFilter) {
      qs.push("productId=" + encodeURIComponent(studioProductFilter));
    }
    if (studioSearchQ) {
      qs.push("search=" + encodeURIComponent(studioSearchQ));
    }
    if (qs.length) {
      url += "?" + qs.join("&");
    }
    return vf(url, { headers: V.authHeaders() })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) {
            return V.explainVendor401(base);
          }
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Load failed");
          return x.json.items || [];
        });
      })
      .then(renderRows);
  }

  function loadCatalogPage(reset) {
    if (reset) catalogOffset = 0;
    var base = V.apiBase();
    var q = catalogQ;
    var url = V.vendorApiUrl(
      "/api/vendor/catalog-products?q=" +
        encodeURIComponent(q) +
        "&limit=" +
        catalogLimit +
        "&offset=" +
        catalogOffset
    );
    if (catalogCategoryFilter) {
      url += "&categoryId=" + encodeURIComponent(catalogCategoryFilter);
    }
    return vf(url, { headers: V.authHeaders() })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) {
            return V.explainVendor401(base);
          }
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Load failed");
          return x.json;
        });
      })
      .then(function (j) {
        catalogTotal = j.total || 0;
        var st = document.getElementById("viCatalogStats");
        if (st) {
          st.removeAttribute("hidden");
          st.textContent =
            "Catalog products: " +
            (j.productCount || 0) +
            " · Price overrides: " +
            (j.overrideCount || 0) +
            " · Studio SKUs: " +
            (j.materialSkuCount || 0);
        }
        var tb = document.getElementById("viCatalogTbody");
        if (!tb) return;
        var rows = j.items || [];
        if (reset) {
          tb.innerHTML = "";
        }
        if (reset && !rows.length) {
          tb.innerHTML = "<tr><td colspan='10' class='vs-muted'>No matches.</td></tr>";
        } else if (rows.length) {
          if (reset && tb.querySelector(".vs-muted")) tb.innerHTML = "";
          tb.innerHTML += rows
            .map(function (it) {
              var e = it.effectivePrices || {};
              var st = it.effectiveStock || {};
              var bid = esc(it.id);
              var imgUrl = resolveMediaUrl(it.image || "");
              var imgTag = imgUrl
                ? "<img class=\"vi-cat-row-thumb\" src=\"" +
                  esc(imgUrl) +
                  "\" alt=\"\" width=\"40\" height=\"40\" loading=\"lazy\" />"
                : "<span class=\"vi-cat-row-thumb vi-cat-row-thumb--empty\" aria-hidden=\"true\"></span>";
              return (
                "<tr data-pid='" +
                bid +
                "'><td><div class=\"vi-cat-product-cell\">" +
                imgTag +
                "<div class=\"vi-cat-product-cell__txt\"><strong>" +
                esc(it.name) +
                "</strong><br/><span class='vs-muted'>" +
                bid +
                "</span>" +
                (it.hasOverride || it.hasStockOverride ? " <span class='vs-badge vs-badge--paid'>Live</span>" : "") +
                "</div></div></td><td>" +
                esc(it.category) +
                "</td><td><input class='vi-cat-price' data-k='s' data-pid='" +
                bid +
                "' type='number' min='0' step='1' value='" +
                esc(String(e.s)) +
                "' style='width:4.5rem'/></td><td><input class='vi-cat-price' data-k='m' data-pid='" +
                bid +
                "' type='number' min='0' step='1' value='" +
                esc(String(e.m)) +
                "' style='width:4.5rem'/></td><td><input class='vi-cat-price' data-k='l' data-pid='" +
                bid +
                "' type='number' min='0' step='1' value='" +
                esc(String(e.l)) +
                "' style='width:4.5rem'/></td><td><input class='vi-cat-stock' data-k='s' data-pid='" +
                bid +
                "' type='number' min='0' step='0.01' value='" +
                esc(catalogStockFieldValue(st.s)) +
                "' style='width:4.5rem'/></td><td><input class='vi-cat-stock' data-k='m' data-pid='" +
                bid +
                "' type='number' min='0' step='0.01' value='" +
                esc(catalogStockFieldValue(st.m)) +
                "' style='width:4.5rem'/></td><td><input class='vi-cat-stock' data-k='l' data-pid='" +
                bid +
                "' type='number' min='0' step='0.01' value='" +
                esc(catalogStockFieldValue(st.l)) +
                "' style='width:4.5rem'/></td><td><button type='button' class='vs-btn vs-btn--primary vi-cat-save' data-pid='" +
                bid +
                "'>Save</button></td></tr>"
              );
            })
            .join("");
        }
        catalogOffset += rows.length;
        var pg = document.getElementById("viCatalogPaging");
        if (pg) {
          pg.textContent = "Showing " + Math.min(catalogOffset, catalogTotal) + " of " + catalogTotal + " (filter: “" + (q || "all") + "”).";
        }
        var more = document.getElementById("viCatalogMoreBtn");
        if (more) {
          more.hidden = catalogOffset >= catalogTotal;
        }
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
  }

  function boot() {
    showDesk(true);
    var startTab = window.location.hash === "#add-product" ? "addproduct" : "studio";
    loadCategories()
      .catch(function () {
        viCategoriesCache = [];
      })
      .then(function () {
        refillApCategoryDropdowns();
        syncListFiltersFromForm();
        return loadList();
      })
      .then(function () {
        setTab(startTab);
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
  }

  on("viCategory", "change", function () {
    studioProductFilter = "";
    syncFormProductDropdown()
      .then(function () {
        syncListFiltersFromForm();
        return loadList();
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
  });

  on("viProduct", "change", function () {
    syncListFiltersFromForm();
    updateProductPreviewFromForm();
    loadList().catch(function (e) {
      window.alert(String((e && e.message) || e));
    });
  });

  on("viCatalogCategoryFilter", "change", function () {
    catalogCategoryFilter = String(this.value || "").trim();
    if (activeTab === "catalog") {
      loadCatalogPage(true);
    }
  });

  on("viRefreshBtn", "click", function () {
    window.location.reload();
  });

  on("viStudioSearchBtn", "click", function () {
    syncListFiltersFromForm();
    loadList().catch(function (e) {
      window.alert(String((e && e.message) || e));
    });
  });

  on("viStudioSearchClear", "click", function () {
    var s = document.getElementById("viStudioSearch");
    if (s) s.value = "";
    syncListFiltersFromForm();
    loadList().catch(function (e) {
      window.alert(String((e && e.message) || e));
    });
  });

  var viStudioSearchEl = document.getElementById("viStudioSearch");
  if (viStudioSearchEl) {
    viStudioSearchEl.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      syncListFiltersFromForm();
      loadList().catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
    });
  }

  var viSkuField = document.getElementById("viSku");
  if (viSkuField) {
    viSkuField.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      resolveSkuFromInventoryEnter();
    });
  }

  on("viApSubmit", "click", function () {
    var msg = document.getElementById("viApMsg");
    if (msg) {
      msg.textContent = "";
      msg.setAttribute("hidden", "hidden");
    }
    var catId = document.getElementById("viApCategory") && document.getElementById("viApCategory").value.trim();
    var name = document.getElementById("viApName") && document.getElementById("viApName").value.trim();
    var fileInp = document.getElementById("viApImage");
    var file = fileInp && fileInp.files && fileInp.files[0];
    var urlEl = document.getElementById("viApImageUrl");
    var imageUrl = urlEl ? String(urlEl.value || "").trim() : "";
    if (!catId || !name) {
      window.alert("Category and name are required.");
      return;
    }
    if (!file && !imageUrl) {
      window.alert("Choose a product photo file or paste an HTTPS image URL.");
      return;
    }
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
      window.alert("Image URL must start with https://");
      return;
    }
    var fd = new FormData();
    fd.append("name", name);
    fd.append("categoryId", catId);
    fd.append("priceS", String(document.getElementById("viApPriceS").value || "0"));
    fd.append("priceM", String(document.getElementById("viApPriceM").value || "0"));
    fd.append("priceL", String(document.getElementById("viApPriceL").value || "0"));
    fd.append("sizeLabelS", String((document.getElementById("viApSizeS") && document.getElementById("viApSizeS").value) || "").trim());
    fd.append("sizeLabelM", String((document.getElementById("viApSizeM") && document.getElementById("viApSizeM").value) || "").trim());
    fd.append("sizeLabelL", String((document.getElementById("viApSizeL") && document.getElementById("viApSizeL").value) || "").trim());
    if (imageUrl) fd.append("imageUrl", imageUrl);
    if (file) fd.append("image", file, file.name);
    var galEl = document.getElementById("viApGallery");
    if (galEl) fd.append("gallery", String(galEl.value || ""));
    var base = V.apiBase();
    vf(V.vendorApiUrl("/api/vendor/products"), {
      method: "POST",
      headers: V.authHeaders(),
      body: fd,
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) return V.explainVendor401(base);
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Create failed");
          return x.json.product;
        });
      })
      .then(function (p) {
        if (msg) {
          msg.textContent =
            "Created · id " +
            (p && p.id ? p.id : "") +
            " — image " +
            (p && p.image ? p.image : "") +
            ". Customers see it after a page refresh.";
          msg.removeAttribute("hidden");
        }
        if (document.getElementById("viApName")) document.getElementById("viApName").value = "";
        ["viApSizeS", "viApSizeM", "viApSizeL"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.value = "";
        });
        if (fileInp) fileInp.value = "";
        if (urlEl) urlEl.value = "";
        var gal = document.getElementById("viApGallery");
        if (gal) gal.value = "";
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
  });

  document.querySelectorAll(".vi-tab").forEach(function (b) {
    b.addEventListener("click", function () {
      setTab(b.getAttribute("data-tab") || "studio");
    });
  });

  on("viCatalogSearchBtn", "click", function () {
    var inp = document.getElementById("viCatalogSearch");
    catalogQ = inp && inp.value ? String(inp.value).trim() : "";
    loadCatalogPage(true);
  });

  on("viCatalogMoreBtn", "click", function () {
    loadCatalogPage(false);
  });

  var catTb = document.getElementById("viCatalogTbody");
  if (catTb) {
    catTb.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest(".vi-cat-save") : null;
      if (!btn || !catTb.contains(btn)) return;
      var pid = btn.getAttribute("data-pid");
      var tr = btn.closest("tr");
      if (!tr || !pid) return;
      var body = {};
      tr.querySelectorAll(".vi-cat-price").forEach(function (inp) {
        var k = inp.getAttribute("data-k");
        if (k === "s") body.priceS = Number(inp.value);
        if (k === "m") body.priceM = Number(inp.value);
        if (k === "l") body.priceL = Number(inp.value);
      });
      tr.querySelectorAll(".vi-cat-stock").forEach(function (inp) {
        var k = inp.getAttribute("data-k");
        var n = Number(inp.value);
        var v = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
        if (k === "s") body.stockS = v;
        if (k === "m") body.stockM = v;
        if (k === "l") body.stockL = v;
      });
      vf(V.vendorApiUrl("/api/vendor/catalog-products/" + encodeURIComponent(pid) + "/prices"), {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
        body: JSON.stringify(body),
      })
        .then(function (res) {
          return V.parseApiJson(res).then(function (x) {
            if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Save failed");
          });
        })
        .then(function () {
          btn.textContent = "Saved";
          setTimeout(function () {
            btn.textContent = "Save";
          }, 1400);
          loadCatalogPage(true);
        })
        .catch(function (e) {
          window.alert(String((e && e.message) || e));
        });
    });
  }

  on("viAddBtn", "click", function () {
    var catEl = document.getElementById("viCategory");
    var prodEl = document.getElementById("viProduct");
    var categoryId = catEl ? String(catEl.value || "").trim() : "";
    var productId = prodEl ? String(prodEl.value || "").trim() : "";
    var nameFromProduct = "";
    if (prodEl && prodEl.selectedOptions && prodEl.selectedOptions[0]) {
      nameFromProduct = String(prodEl.selectedOptions[0].textContent || "").trim();
    }
    if (categoryId && !productId) {
      window.alert("Select a product under the chosen base category.");
      return;
    }
    if (!productId) {
      var skuEarly = document.getElementById("viSku") ? String(document.getElementById("viSku").value || "").trim() : "";
      if (!skuEarly) {
        window.alert("Link a catalog product, or enter a SKU for an unsorted supply line.");
        return;
      }
    }
    function readQtySlot(id) {
      var el = document.getElementById(id);
      if (!el) return null;
      var t = String(el.value || "").trim();
      if (t === "") return null;
      var n = Number(t);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    var body = {
      name: nameFromProduct,
      sku: document.getElementById("viSku").value.trim(),
      categoryId: categoryId,
      productId: productId,
      quantityS: readQtySlot("viQtyS"),
      quantityM: readQtySlot("viQtyM"),
      quantityL: readQtySlot("viQtyL"),
      reorderPoint: Number(document.getElementById("viReorder").value),
      unitCostS: Number(document.getElementById("viCostS").value || 0),
      unitCostM: Number(document.getElementById("viCostM").value || 0),
      unitCostL: Number(document.getElementById("viCostL").value || 0),
      supplier: document.getElementById("viSupplier").value.trim(),
      notes: document.getElementById("viNotes").value.trim(),
    };
    var base = V.apiBase();
    vf(V.vendorApiUrl("/api/vendor/inventory"), {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Add failed");
        });
      })
      .then(function () {
        document.getElementById("viSku").value = "";
        ["viQtyS", "viQtyM", "viQtyL", "viCostS", "viCostM", "viCostL"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.value = "";
        });
        document.getElementById("viNotes").value = "";
        return syncFormProductDropdown();
      })
      .then(function () {
        syncListFiltersFromForm();
        updateProductPreviewFromForm();
        return loadList();
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
  });

  boot();
})();
