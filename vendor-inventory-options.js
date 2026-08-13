(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;
  var vf = V.vendorFetch || fetch;

  var productId = "";
  var product = null;
  var editorView = "color";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function qsParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (_) {
      return "";
    }
  }

  function variantSlot(o) {
    var parts = [];
    if (o.sid) parts.push("s:" + o.sid);
    if (o.qid) parts.push("q:" + o.qid);
    if (o.cid) parts.push("c:" + o.cid);
    return parts.join("|") || (o.sid || "std");
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

  function showMsg(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.removeAttribute("hidden");
    } else {
      el.textContent = "";
      el.setAttribute("hidden", "hidden");
    }
  }

  function setView(view) {
    editorView = view === "size" ? "size" : "color";
    document.querySelectorAll(".vio-view-btn").forEach(function (btn) {
      var on = btn.getAttribute("data-vio-view") === editorView;
      btn.classList.toggle("vs-btn--primary", on);
      btn.classList.toggle("vs-btn--ghost", !on);
    });
    renderEditor();
  }

  function getImageFitApi() {
    return window.CraftguruImageFit || null;
  }

  function fitButtonHtml(kind, id, fit) {
    var IF = getImageFitApi();
    var fitVal = IF && IF.normalizeImageFit ? IF.normalizeImageFit(fit) : "";
    var label = IF && IF.fitButtonLabel ? IF.fitButtonLabel(fitVal) : fitVal === "contain" ? "Fit: contain ✓" : "Fit image";
    return (
      "<button type='button' class='vs-btn vs-btn--ghost vpm-img-fit-btn vio-img-fit-btn" +
      (fitVal === "contain" ? " vpm-img-fit-btn--on" : "") +
      "' data-vio-fit-kind='" +
      esc(kind) +
      "' data-vio-fit-id='" +
      esc(id) +
      "'" +
      (fitVal ? " data-image-fit='" + esc(fitVal) + "'" : "") +
      " title='Show full image (contain) when cropped'>" +
      esc(label) +
      "</button>"
    );
  }

  function syncFitButton(btn) {
    if (!btn) return;
    var IF = getImageFitApi();
    var fit = btn.getAttribute("data-image-fit") || "";
    btn.textContent = IF && IF.fitButtonLabel ? IF.fitButtonLabel(fit) : fit === "contain" ? "Fit: contain ✓" : "Fit image";
    btn.classList.toggle("vpm-img-fit-btn--on", fit === "contain");
  }

  function wireImageFitButtonsOnce() {
    var host = document.getElementById("vioEditor");
    if (!host || wireImageFitButtonsOnce.done) return;
    wireImageFitButtonsOnce.done = true;
    host.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".vio-img-fit-btn");
      if (!btn) return;
      var IF = getImageFitApi();
      var cur = btn.getAttribute("data-image-fit") || "";
      var next = IF && IF.toggleImageFit ? IF.toggleImageFit(cur) : cur === "contain" ? "" : "contain";
      if (next) btn.setAttribute("data-image-fit", next);
      else btn.removeAttribute("data-image-fit");
      syncFitButton(btn);
      var cardImg =
        btn.closest(".vio-color-card__head") &&
        btn.closest(".vio-color-card__head").querySelector(".vio-color-card__img");
      if (cardImg && IF && IF.applyImageFit) IF.applyImageFit(cardImg, next);
      var sizeImg =
        btn.closest(".vio-size-card__media") &&
        btn.closest(".vio-size-card__media").querySelector(".vio-size-card__img");
      if (sizeImg && IF && IF.applyImageFit) IF.applyImageFit(sizeImg, next);
    });
  }

  function readImageFitPatches() {
    var colors = [];
    var sizes = [];
    document.querySelectorAll(".vio-img-fit-btn").forEach(function (btn) {
      var kind = btn.getAttribute("data-vio-fit-kind");
      var id = btn.getAttribute("data-vio-fit-id");
      if (!id) return;
      var patch = { id: id, imageFit: btn.getAttribute("data-image-fit") || "" };
      if (kind === "size") sizes.push(patch);
      else colors.push(patch);
    });
    return { colors: colors, sizes: sizes };
  }

  function variantRow(opt, sel) {
    var key = variantSlot(sel);
    var vi = (opt.vendorInventory && opt.vendorInventory.variants) || {};
    var row = vi[key] || {};
    var sz = (opt.sizes || []).find(function (s) {
      return String(s.id) === String(sel.sid);
    });
    var price = row.priceInr != null ? row.priceInr : sz && sz.priceInr != null ? sz.priceInr : "";
    var cost = row.costInr != null ? row.costInr : sz && sz.costInr != null ? sz.costInr : "";
    var stock = row.stock != null ? row.stock : "";
    var labelParts = [];
    if (sel.sizeLabel) labelParts.push(sel.sizeLabel);
    if (sel.packLabel) labelParts.push(sel.packLabel);
    return (
      "<tr data-vio-key='" +
      esc(key) +
      "'><td>" +
      esc(labelParts.join(" · ") || sel.sid || "Standard") +
      "</td><td><input type='number' class='vs-input vio-price' min='0' step='1' value='" +
      esc(price !== "" ? String(price) : "") +
      "' /></td><td><input type='number' class='vs-input vio-cost' min='0' step='0.01' value='" +
      esc(cost !== "" ? String(cost) : "") +
      "' /></td><td><input type='number' class='vs-input vio-stock' min='0' step='0.01' value='" +
      esc(stock !== "" ? String(stock) : "") +
      "' /></td></tr>"
    );
  }

  function colorCard(opt, color, sizes, packs) {
    var img = resolveMediaUrl(color.image || "");
    var IF = getImageFitApi();
    var fitVal = IF && IF.normalizeImageFit ? IF.normalizeImageFit(color.imageFit) : "";
    var imgHtml = img
      ? "<img class='vio-color-card__img' src='" +
        esc(img) +
        "' alt='' width='72' height='72' loading='lazy'" +
        (fitVal ? " data-image-fit='" + esc(fitVal) + "'" : "") +
        " />"
      : "<span class='vio-color-card__swatch' style='background:" + esc(color.hex || "#e2e8f0") + "'></span>";
    var fitBtn = color.id != null && String(color.id) !== "" ? fitButtonHtml("color", color.id, color.imageFit) : "";
    var rows = "";
    sizes.forEach(function (sz) {
      if (packs.length) {
        packs.forEach(function (pk) {
          rows += variantRow(opt, {
            sid: sz.id,
            cid: color.id,
            qid: pk.id,
            sizeLabel: sz.label,
            packLabel: pk.label,
          });
        });
      } else {
        rows += variantRow(opt, { sid: sz.id, cid: color.id, sizeLabel: sz.label });
      }
    });
    return (
      "<div class='vio-color-card vs-card'><div class='vio-color-card__head'>" +
      imgHtml +
      "<div><strong>" +
      esc(color.label || color.id) +
      "</strong><br/><span class='vs-muted'>" +
      esc(color.id) +
      "</span>" +
      (fitBtn ? "<div class='vio-color-card__fit'>" + fitBtn + "</div>" : "") +
      "</div></div>" +
      "<div class='vs-table-wrap'><table class='vs-table vio-variant-table'><thead><tr><th>Size / pack</th><th>Sell ₹</th><th>Cost ₹</th><th>Stock</th></tr></thead><tbody>" +
      rows +
      "</tbody></table></div></div>"
    );
  }

  function sizeCard(opt, size, colors, packs) {
    var img = resolveMediaUrl(size.image || "");
    var IF = getImageFitApi();
    var sizeFit = IF && IF.normalizeImageFit ? IF.normalizeImageFit(size.imageFit) : "";
    var imgBlock = img
      ? "<div class='vio-size-card__media'><img class='vio-size-card__img' src='" +
        esc(img) +
        "' alt='' width='72' height='72' loading='lazy'" +
        (sizeFit ? " data-image-fit='" + esc(sizeFit) + "'" : "") +
        " />" +
        fitButtonHtml("size", size.id, size.imageFit) +
        "</div>"
      : "";
    var rows = "";
    colors.forEach(function (cl) {
      if (packs.length) {
        packs.forEach(function (pk) {
          rows += variantRow(opt, {
            sid: size.id,
            cid: cl.id,
            qid: pk.id,
            sizeLabel: size.label,
            packLabel: pk.label,
          });
        });
      } else {
        rows += variantRow(opt, { sid: size.id, cid: cl.id, sizeLabel: size.label });
      }
    });
    return (
      "<div class='vio-size-card vs-card'>" +
      imgBlock +
      "<h3 class='vs-login__title' style='margin-top:0'>" +
      esc(size.label || size.id) +
      "</h3>" +
      "<div class='vs-table-wrap'><table class='vs-table vio-variant-table'><thead><tr><th>Colour / pack</th><th>Sell ₹</th><th>Cost ₹</th><th>Stock</th></tr></thead><tbody>" +
      rows +
      "</tbody></table></div></div>"
    );
  }

  function renderPackSection(opt) {
    var host = document.getElementById("vioPackSection");
    if (!host) return;
    if (!opt.useQty || !(opt.qtyOptions && opt.qtyOptions.length)) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    host.hidden = false;
    var rows = (opt.qtyOptions || [])
      .map(function (pk) {
        return (
          "<tr data-pack-id='" +
          esc(pk.id) +
          "'><td>" +
          esc(pk.label || pk.id) +
          "</td><td><input type='number' class='vs-input vio-pack-price' min='0' step='1' value='" +
          esc(pk.priceInr != null ? String(pk.priceInr) : "") +
          "' /></td><td><input type='number' class='vs-input vio-pack-cost' min='0' step='0.01' value='" +
          esc(pk.costInr != null ? String(pk.costInr) : "") +
          "' /></td></tr>"
        );
      })
      .join("");
    host.innerHTML =
      "<div class='vs-card'><h2 class='vs-login__title' style='margin-top:0'>Pack / quantity defaults</h2>" +
      "<p class='vs-muted'>Base price add-ons per pack row (combined with size/colour variant rows above).</p>" +
      "<div class='vs-table-wrap'><table class='vs-table'><thead><tr><th>Pack</th><th>Sell add-on ₹</th><th>Cost add-on ₹</th></tr></thead><tbody>" +
      rows +
      "</tbody></table></div></div>";
  }

  function renderEditor() {
    var host = document.getElementById("vioEditor");
    if (!host || !product) return;
    var opt = product.options || {};
    var sizes =
      opt.useSize && opt.sizes && opt.sizes.length
        ? opt.sizes
        : [{ id: "sz-m", label: "Standard" }];
    var colors =
      opt.useColor && opt.colors && opt.colors.length
        ? opt.colors
        : [{ id: "", label: "Default", image: product.image || "", hex: "#f8fafc" }];
    var packs = opt.useQty && opt.qtyOptions ? opt.qtyOptions : [];
    var html = "";
    if (editorView === "color") {
      colors.forEach(function (cl) {
        html += colorCard(opt, cl, sizes, packs);
      });
    } else {
      sizes.forEach(function (sz) {
        html += sizeCard(opt, sz, colors, packs);
      });
    }
    host.innerHTML = html;
    renderPackSection(opt);
    wireImageFitButtonsOnce();
  }

  function readVariantsFromDom() {
    var variants = {};
    document.querySelectorAll("[data-vio-key]").forEach(function (tr) {
      var key = tr.getAttribute("data-vio-key");
      if (!key) return;
      var prEl = tr.querySelector(".vio-price");
      var coEl = tr.querySelector(".vio-cost");
      var stEl = tr.querySelector(".vio-stock");
      var row = {};
      if (prEl && String(prEl.value || "").trim() !== "") {
        var pr = Number(prEl.value);
        if (Number.isFinite(pr) && pr >= 0) row.priceInr = Math.round(pr);
      }
      if (coEl && String(coEl.value || "").trim() !== "") {
        var co = Number(coEl.value);
        if (Number.isFinite(co) && co >= 0) row.costInr = Math.round(co * 100) / 100;
      }
      if (stEl && String(stEl.value || "").trim() !== "") {
        var st = Number(stEl.value);
        if (Number.isFinite(st) && st >= 0) row.stock = Math.round(st * 100) / 100;
      }
      if (Object.keys(row).length) variants[key] = row;
    });
    return variants;
  }

  function readPackPatches() {
    var out = [];
    document.querySelectorAll("[data-pack-id]").forEach(function (tr) {
      var id = tr.getAttribute("data-pack-id");
      if (!id) return;
      var prEl = tr.querySelector(".vio-pack-price");
      var coEl = tr.querySelector(".vio-pack-cost");
      var row = { id: id };
      if (prEl && String(prEl.value || "").trim() !== "") {
        var pr = Number(prEl.value);
        if (Number.isFinite(pr) && pr >= 0) row.priceInr = Math.round(pr);
      }
      if (coEl && String(coEl.value || "").trim() !== "") {
        var co = Number(coEl.value);
        if (Number.isFinite(co) && co >= 0) row.costInr = Math.round(co * 100) / 100;
      }
      if (Object.keys(row).length > 1) out.push(row);
    });
    return out;
  }

  function loadProduct() {
    showMsg("vioErr", "");
    showMsg("vioOk", "");
    var loading = document.getElementById("vioLoading");
    var editor = document.getElementById("vioEditor");
    if (loading) loading.removeAttribute("hidden");
    if (editor) editor.setAttribute("hidden", "hidden");
    var base = V.apiBase();
    return vf(V.vendorApiUrl("/api/vendor/catalog-products/" + encodeURIComponent(productId)), {
      headers: V.authHeaders(),
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) return V.explainVendor401(base);
          if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Load failed");
          return x.json.product;
        });
      })
      .then(function (p) {
        product = p;
        var meta = document.getElementById("vioProductMeta");
        if (meta) {
          meta.textContent = p && p.name ? " · " + p.name + " (" + p.id + ")" : "";
        }
        if (loading) loading.setAttribute("hidden", "hidden");
        if (editor) editor.removeAttribute("hidden");
        renderEditor();
      })
      .catch(function (e) {
        if (loading) loading.textContent = "Failed to load.";
        showMsg("vioErr", String((e && e.message) || e));
      });
  }

  function saveProduct() {
    showMsg("vioErr", "");
    showMsg("vioOk", "");
    var body = { variants: readVariantsFromDom() };
    var packs = readPackPatches();
    if (packs.length) body.qtyOptions = packs;
    var fitPatches = readImageFitPatches();
    if (fitPatches.colors.length) body.colors = fitPatches.colors;
    if (fitPatches.sizes.length) body.sizes = fitPatches.sizes;
    var btn = document.getElementById("vioSaveBtn");
    if (btn) btn.disabled = true;
    return vf(V.vendorApiUrl("/api/vendor/catalog-products/" + encodeURIComponent(productId) + "/variants"), {
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
        showMsg("vioOk", "Saved variant inventory.");
        try {
          var raw = sessionStorage.getItem("craftguruViInventoryState");
          if (raw) {
            var st = JSON.parse(raw);
            st.tab = "catalog";
            sessionStorage.setItem("craftguruViInventoryState", JSON.stringify(st));
          }
        } catch (_) {}
        return loadProduct();
      })
      .catch(function (e) {
        showMsg("vioErr", String((e && e.message) || e));
      })
      .then(function () {
        if (btn) btn.disabled = false;
      });
  }

  function boot() {
    productId = String(qsParam("productId") || "").trim();
    if (!productId) {
      showMsg("vioErr", "Missing productId in URL.");
      return;
    }
    var wantView = qsParam("view");
    setView(wantView === "size" ? "size" : "color");
    document.querySelectorAll(".vio-view-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setView(btn.getAttribute("data-vio-view") || "color");
      });
    });
    var refresh = document.getElementById("vioRefreshBtn");
    if (refresh) refresh.addEventListener("click", loadProduct);
    var save = document.getElementById("vioSaveBtn");
    if (save) save.addEventListener("click", saveProduct);
    loadProduct();
  }

  boot();
})();
