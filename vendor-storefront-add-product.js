/**
 * Add storefront product flow for the vendor Products page.
 */
(function (global) {
  "use strict";

  var TAXONOMY_SUB_CATS = {
    "resin-clocks": 1,
    "resin-guruji-products": 1,
    "resin-keychains": 1,
  };

  var categoriesCache = [];
  var bound = false;

  var COLOR_HEX_BY_NAME = {
    black: "#111827",
    white: "#f8fafc",
    grey: "#6b7280",
    gray: "#6b7280",
    red: "#ef4444",
    orange: "#f97316",
    yellow: "#eab308",
    green: "#22c55e",
    blue: "#3b82f6",
    purple: "#8b5cf6",
    pink: "#ec4899",
    brown: "#92400e",
    gold: "#d4a017",
    silver: "#94a3b8",
    clear: "#f8fafc",
    transparent: "#f8fafc",
  };

  function colourHexFromName(value) {
    var name = String(value || "")
      .toLowerCase()
      .replace(/[^a-z]+/g, " ")
      .trim();
    if (!name || name === "default") return "";
    if (COLOR_HEX_BY_NAME[name]) return COLOR_HEX_BY_NAME[name];
    var words = name.split(" ");
    for (var i = 0; i < words.length; i++) {
      if (COLOR_HEX_BY_NAME[words[i]]) return COLOR_HEX_BY_NAME[words[i]];
    }
    return "";
  }

  function bindColourNameToSwatch(label, picker, readout) {
    if (!label || !picker) return;
    function syncFromName() {
      var hex = colourHexFromName(label.value);
      if (!hex) return;
      picker.value = hex;
      if (readout) readout.textContent = hex.toUpperCase();
    }
    label.addEventListener("input", syncFromName);
    label.addEventListener("change", syncFromName);
    syncFromName();
  }

  function normalizeHex(raw) {
    var h = String(raw == null ? "" : raw)
      .trim()
      .replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(h)) return "#" + h.toLowerCase();
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
      return ("#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toLowerCase();
    }
    return "#f8fafc";
  }

  function syncCoverColorReadout() {
    var pick = document.getElementById("viApCoverColorHex");
    var read = document.getElementById("viApCoverColorReadout");
    if (pick && read) read.textContent = String(pick.value || "").toUpperCase();
  }

  function refillSubcategoryDropdown(catId) {
    var wrap = document.getElementById("viApSubWrap");
    var subSel = document.getElementById("viApSubcategory");
    if (!wrap || !subSel) return;
    catId = String(catId || "").trim();
    if (!TAXONOMY_SUB_CATS[catId]) {
      wrap.hidden = true;
      subSel.innerHTML = "";
      return;
    }
    var cat = categoriesCache.filter(function (c) {
      return String(c.id) === catId;
    })[0];
    var subs = (cat && Array.isArray(cat.subcategories) ? cat.subcategories : []).filter(function (s) {
      return s && s.id && String(s.id) !== "all";
    });
    if (!subs.length) {
      wrap.hidden = true;
      subSel.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    subSel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Choose —";
    subSel.appendChild(o0);
    subs.forEach(function (s) {
      var o = document.createElement("option");
      o.value = String(s.id);
      o.textContent = s.label || s.id;
      subSel.appendChild(o);
    });
  }

  function refillCategoryDropdowns() {
    var sel = document.getElementById("viApCategory");
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Choose —";
    sel.appendChild(o0);
    categoriesCache.forEach(function (c) {
      var o = document.createElement("option");
      o.value = String(c.id != null ? c.id : "");
      o.textContent = c.label || String(c.id != null ? c.id : "");
      sel.appendChild(o);
    });
    if (prev && Array.prototype.some.call(sel.options, function (op) { return op.value === prev; })) {
      sel.value = prev;
    }
    refillSubcategoryDropdown(sel.value);
  }

  function addExtraColorRow(prefill) {
    var host = document.getElementById("viApExtraColors");
    if (!host) return;
    var row = document.createElement("div");
    row.className = "vi-ap-extra-color-row vrm-opt-row";
    var hx = normalizeHex((prefill && prefill.hex) || "#6366f1");
    row.innerHTML =
      '<div class="vs-field" style="margin:0"><label>Colour name</label>' +
      '<input type="text" class="vs-input vi-ap-color-label" maxlength="120" placeholder="e.g. Blue" value="' +
      String((prefill && prefill.label) || "").replace(/"/g, "&quot;") +
      '" /></div>' +
      '<div class="vs-field" style="margin:0"><label>Swatch</label>' +
      '<div class="vrm-color-swatch-controls" style="display:flex;align-items:center;gap:0.4rem">' +
      '<input type="color" class="vrm-color-pick vi-ap-color-hex" value="' +
      hx +
      '" />' +
      '<code class="vrm-color-readout vi-ap-color-readout">' +
      hx.toUpperCase() +
      "</code></div></div>" +
      '<div class="vs-field" style="margin:0;grid-column:1/-1"><label>Image URL (HTTPS)</label>' +
      '<input type="url" class="vs-input vi-ap-color-image" maxlength="2000" placeholder="https://…" value="' +
      String((prefill && prefill.image) || "").replace(/"/g, "&quot;") +
      '" /></div>' +
      '<div style="grid-column:1/-1"><button type="button" class="vs-btn vs-btn--ghost vi-ap-color-rm">Remove</button></div>';
    row.style.cssText =
      "display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;padding:0.5rem;border:1px solid rgba(15,23,42,0.08);border-radius:8px;background:#fff";
    host.appendChild(row);
    var pick = row.querySelector(".vi-ap-color-hex");
    var read = row.querySelector(".vi-ap-color-readout");
    var label = row.querySelector(".vi-ap-color-label");
    if (pick && read) {
      function sync() {
        read.textContent = String(pick.value || "").toUpperCase();
      }
      pick.addEventListener("input", sync);
      pick.addEventListener("change", sync);
    }
    bindColourNameToSwatch(label, pick, read);
    var rm = row.querySelector(".vi-ap-color-rm");
    if (rm) {
      rm.addEventListener("click", function () {
        row.remove();
      });
    }
  }

  function addExtraSizeRow(prefill) {
    var host = document.getElementById("viApExtraSizes");
    if (!host) return;
    var row = document.createElement("div");
    row.className = "vi-ap-extra-size-row vrm-opt-row";
    row.style.cssText =
      "display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;padding:0.5rem;border:1px solid rgba(15,23,42,0.08);border-radius:8px;background:#fff";
    row.innerHTML =
      '<div class="vs-field" style="margin:0"><label>Size label</label>' +
      '<input type="text" class="vs-input vi-ap-size-label" maxlength="120" placeholder="e.g. 12 inch" value="' +
      String((prefill && prefill.label) || "").replace(/"/g, "&quot;") +
      '" /></div>' +
      '<div class="vs-field" style="margin:0"><label>Price (₹)</label>' +
      '<input type="number" class="vs-input vi-ap-size-price" min="0" step="0.01" value="' +
      String((prefill && prefill.priceInr) != null ? prefill.priceInr : "").replace(/"/g, "&quot;") +
      '" /></div>' +
      '<div class="vs-field" style="margin:0"><label>MRP (optional)</label>' +
      '<input type="number" class="vs-input vi-ap-size-mrp" min="0" step="0.01" value="' +
      String((prefill && prefill.mrpInr) != null ? prefill.mrpInr : "").replace(/"/g, "&quot;") +
      '" /></div>' +
      '<div class="vs-field" style="margin:0;grid-column:1/-1"><label>Image URL (optional, HTTPS)</label>' +
      '<input type="url" class="vs-input vi-ap-size-image" maxlength="2000" placeholder="https://…" value="' +
      String((prefill && prefill.image) || "").replace(/"/g, "&quot;") +
      '" /></div>' +
      '<div style="grid-column:1/-1"><button type="button" class="vs-btn vs-btn--ghost vi-ap-size-rm">Remove size</button></div>';
    host.appendChild(row);
    var rm = row.querySelector(".vi-ap-size-rm");
    if (rm) rm.addEventListener("click", function () { row.remove(); });
  }

  function readExtraSizes() {
    var host = document.getElementById("viApExtraSizes");
    if (!host) return [];
    var out = [];
    host.querySelectorAll(".vi-ap-extra-size-row").forEach(function (row) {
      var label = String((row.querySelector(".vi-ap-size-label") || {}).value || "").trim();
      if (!label) return;
      var priceRaw = String((row.querySelector(".vi-ap-size-price") || {}).value || "").trim();
      var mrpRaw = String((row.querySelector(".vi-ap-size-mrp") || {}).value || "").trim();
      var image = String((row.querySelector(".vi-ap-size-image") || {}).value || "").trim();
      var price = priceRaw === "" ? null : Number(priceRaw);
      var mrp = mrpRaw === "" ? null : Number(mrpRaw);
      if (image && !/^https:\/\//i.test(image)) return;
      var item = {
        id: "sz-extra-" + (out.length + 1),
        label: label.slice(0, 120),
        priceInr: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null,
        image: image.slice(0, 2000),
      };
      if (Number.isFinite(mrp) && mrp >= 0) item.mrpInr = Math.round(mrp * 100) / 100;
      out.push(item);
    });
    return out;
  }

  function readExtraColors() {
    var host = document.getElementById("viApExtraColors");
    if (!host) return [];
    var out = [];
    host.querySelectorAll(".vi-ap-extra-color-row").forEach(function (row, idx) {
      var lab = row.querySelector(".vi-ap-color-label");
      var pick = row.querySelector(".vi-ap-color-hex");
      var img = row.querySelector(".vi-ap-color-image");
      var label = lab ? String(lab.value || "").trim() : "";
      var image = img ? String(img.value || "").trim() : "";
      if (!label || !image) return;
      if (!/^https:\/\//i.test(image)) return;
      out.push({
        id: "c" + (idx + 2),
        label: label.slice(0, 120),
        hex: normalizeHex(pick && pick.value),
        image: image,
      });
    });
    return out;
  }

  function readField(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function buildCreateProductOptions(coverUrl) {
    var cover = String(coverUrl || "").trim();
    var labelEl = document.getElementById("viApCoverColorLabel");
    var hexEl = document.getElementById("viApCoverColorHex");
    var coverLabel = labelEl ? String(labelEl.value || "").trim() || "Default" : "Default";
    var coverHex = normalizeHex(hexEl && hexEl.value);
    var colors = [];
    if (cover) {
      colors.push({
        id: "c-cover",
        label: coverLabel.slice(0, 120),
        hex: coverHex,
        image: cover,
      });
    }
    colors = colors.concat(readExtraColors());
    var galEl = document.getElementById("viApGallery");
    var galleryImages = galEl
      ? String(galEl.value || "")
          .split("\n")
          .map(function (l) {
            return l.trim();
          })
          .filter(Boolean)
          .slice(0, 12)
      : [];
    var sizes = readExtraSizes();
    sizes.forEach(function (sz) {
      if (sz.mrpInr == null) delete sz.mrpInr;
    });
    var descEl = document.getElementById("viApDescription");
    return {
      useSize: sizes.length > 0,
      useQty: false,
      useColor: colors.length > 0,
      sizes: sizes,
      qtyOptions: [],
      colors: colors,
      heroImage: cover,
      galleryImages: galleryImages,
      detailBody: descEl ? String(descEl.value || "").trim().slice(0, 8000) : "",
    };
  }

  function resetForm(fileInp, urlEl) {
    if (document.getElementById("viApName")) document.getElementById("viApName").value = "";
    if (fileInp) fileInp.value = "";
    if (urlEl) urlEl.value = "";
    var gal = document.getElementById("viApGallery");
    if (gal) gal.value = "";
    var desc = document.getElementById("viApDescription");
    if (desc) desc.value = "";
    var cLab = document.getElementById("viApCoverColorLabel");
    if (cLab) cLab.value = "Default";
    var cHex = document.getElementById("viApCoverColorHex");
    if (cHex) cHex.value = "#f8fafc";
    syncCoverColorReadout();
    var extra = document.getElementById("viApExtraColors");
    if (extra) extra.innerHTML = "";
    var extraSizes = document.getElementById("viApExtraSizes");
    if (extraSizes) extraSizes.innerHTML = "";
    var galleryFiles = document.getElementById("viApGalleryFiles");
    if (galleryFiles) galleryFiles.value = "";
  }

  /**
   * @param {{ V: object, categories?: object[], onCreated?: function, successMessage?: string }} opts
   */
  function init(opts) {
    opts = opts || {};
    var V = opts.V || global.CraftguruVendor;
    if (!V || !document.getElementById("viApSubmit")) return;
    if (Array.isArray(opts.categories)) {
      categoriesCache = opts.categories.slice();
    }

    if (!bound) {
      bound = true;
      var coverHex = document.getElementById("viApCoverColorHex");
      if (coverHex) {
        coverHex.addEventListener("input", syncCoverColorReadout);
        coverHex.addEventListener("change", syncCoverColorReadout);
        syncCoverColorReadout();
      }
      bindColourNameToSwatch(
        document.getElementById("viApCoverColorLabel"),
        coverHex,
        document.getElementById("viApCoverColorReadout")
      );
      var addColorBtn = document.getElementById("viApAddColor");
      if (addColorBtn) {
        addColorBtn.addEventListener("click", function () {
          addExtraColorRow(null);
        });
      }
      var addSizeBtn = document.getElementById("viApAddSize");
      if (addSizeBtn) {
        addSizeBtn.addEventListener("click", function () {
          addExtraSizeRow(null);
        });
      }
      var catSel = document.getElementById("viApCategory");
      if (catSel) {
        catSel.addEventListener("change", function () {
          refillSubcategoryDropdown(catSel.value);
        });
      }
      document.getElementById("viApSubmit").addEventListener("click", function () {
        submitCreate(V, opts);
      });
    }

    refillCategoryDropdowns();
  }

  function setCategories(list) {
    categoriesCache = Array.isArray(list) ? list.slice() : [];
    refillCategoryDropdowns();
  }

  function submitCreate(V, opts) {
    var vf = V.vendorFetch || fetch;
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
    var coverColorLabel = String((document.getElementById("viApCoverColorLabel") && document.getElementById("viApCoverColorLabel").value) || "").trim();
    if (!coverColorLabel) {
      window.alert("Enter a colour name for the cover image (e.g. White).");
      return;
    }
    var sizes = readExtraSizes();
    var primarySize = sizes.filter(function (size) {
      return size && size.priceInr != null && Number.isFinite(Number(size.priceInr));
    })[0];
    if (!primarySize) {
      window.alert("Add at least one size with its price before creating the product.");
      return;
    }
    var primaryPrice = Number(primarySize.priceInr);
    var fd = new FormData();
    fd.append("name", name);
    fd.append("categoryId", catId);
    fd.append("priceS", String(primaryPrice));
    fd.append("priceM", String(primaryPrice));
    fd.append("priceL", String(primaryPrice));
    fd.append("sizeLabelS", String(primarySize.label || "").trim());
    if (imageUrl) fd.append("imageUrl", imageUrl);
    if (file) fd.append("image", file, file.name);
    var galleryFiles = document.getElementById("viApGalleryFiles");
    if (galleryFiles && galleryFiles.files) {
      if (galleryFiles.files.length > 12) {
        window.alert("Choose up to 12 gallery photos.");
        return;
      }
      Array.prototype.forEach.call(galleryFiles.files, function (galleryFile) {
        fd.append("galleryImages", galleryFile, galleryFile.name);
      });
    }
    var galEl = document.getElementById("viApGallery");
    if (galEl) fd.append("gallery", String(galEl.value || ""));
    var descEl = document.getElementById("viApDescription");
    if (descEl) fd.append("description", String(descEl.value || ""));
    var subEl = document.getElementById("viApSubcategory");
    var subPick = subEl && !subEl.closest("[hidden]") ? String(subEl.value || "").trim() : "";
    if (subPick) fd.append("subcategoryId", subPick);
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
        var cover = String((p && p.image) || imageUrl || "").trim();
        var options = buildCreateProductOptions(cover);
        if (!p || !p.id) return p;
        return vf(V.vendorApiUrl("/api/vendor/catalog-products/" + encodeURIComponent(p.id) + "/prices"), {
          method: "PUT",
          headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
          body: JSON.stringify({
            /* The legacy tiers retain the first configured size's price for
               compatibility; the selectable website sizes come from options. */
            priceS: primaryPrice,
            priceM: primaryPrice,
            priceL: primaryPrice,
            /* Add Product is a publish action. A vendor can deliberately
               unlist the product later from Products management. */
            listed: true,
            description: options.detailBody || "",
            options: options,
          }),
          cache: "no-store",
        }).then(function (res2) {
          return V.parseApiJson(res2).then(function (x2) {
            if (!x2.okHttp || !(x2.json && x2.json.ok)) {
              throw new Error((x2.json && x2.json.error) || "Product created but colour options failed to save");
            }
            return p;
          });
        });
      })
      .then(function (p) {
        try {
          localStorage.setItem("craftguruCatalogChangedAt", Date.now() + ":" + Math.random());
        } catch (_) {}
        if (msg) {
          msg.textContent =
            opts.successMessage ||
            ("Created · id " +
              (p && p.id ? p.id : "") +
              " — cover colour is a selectable variant on the product page. Customers see it after a page refresh.");
          msg.removeAttribute("hidden");
        }
        resetForm(fileInp, urlEl);
        try {
          if (global.CraftguruCatalogMerge && typeof global.CraftguruCatalogMerge.refresh === "function") {
            global.CraftguruCatalogMerge.refresh();
          }
        } catch (_) {}
        if (typeof opts.onCreated === "function") {
          opts.onCreated(p);
        }
      })
      .catch(function (e) {
        window.alert(String((e && e.message) || e));
      });
  }

  global.CraftguruVendorStorefrontAddProduct = {
    init: init,
    setCategories: setCategories,
    refillCategoryDropdowns: refillCategoryDropdowns,
  };
})(typeof window !== "undefined" ? window : this);
