/**
 * PDP options editor for bundled + vendor resin catalog (same JSON schema as raw materials).
 * Used on vendor-products-manage.html — element ids prefixed with vpm*.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeHexVendor(raw) {
    var h = String(raw == null ? "" : raw)
      .trim()
      .replace(/^#/, "");
    if (!h) return "#6366f1";
    if (/^[0-9a-fA-F]{6}$/.test(h)) return "#" + h.toLowerCase();
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
      return (
        "#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
      ).toLowerCase();
    }
    return "#6366f1";
  }

  function rowInput(label, val, ph, cls) {
    return (
      "<label class=\"vs-field\" style=\"margin:0\"><span class=\"vs-muted\" style=\"font-size:0.78rem\">" +
      esc(label) +
      '</span><input type="text" class="vs-input ' +
      (cls || "vpm-opt-inp") +
      '" value="' +
      esc(val) +
      '" placeholder="' +
      esc(ph || "") +
      '" /></label>'
    );
  }

  function rowUrl(label, val) {
    return (
      "<label class=\"vs-field\" style=\"margin:0;grid-column:1/-1\"><span class=\"vs-muted\" style=\"font-size:0.78rem\">" +
      esc(label) +
      '</span><input type="url" class="vs-input vpm-opt-url" value="' +
      esc(val) +
      '" placeholder="https://…" maxlength="2000" /></label>'
    );
  }

  function rowMoney(label, val, cls) {
    return (
      "<label class=\"vs-field\" style=\"margin:0\"><span class=\"vs-muted\" style=\"font-size:0.78rem\">" +
      esc(label) +
      '</span><input type="number" min="0" step="0.01" class="vs-input ' +
      cls +
      '" value="' +
      (val != null && Number.isFinite(Number(val)) ? esc(String(val)) : "") +
      '" /></label>'
    );
  }

  function wrapRow(inner) {
    var d = document.createElement("div");
    d.className = "vrm-opt-row";
    d.style.cssText =
      "display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;padding:0.5rem;border:1px solid rgba(15,23,42,0.08);border-radius:8px";
    d.innerHTML =
      inner + '<div style="grid-column:1/-1"><button type="button" class="vs-btn vs-btn--ghost vpm-rm-row">Remove</button></div>';
    d.querySelector(".vpm-rm-row").addEventListener("click", function () {
      d.remove();
    });
    return d;
  }

  function addSizeRow(o) {
    var host = document.getElementById("vpmSizeRows");
    if (!host) return;
    host.appendChild(
      wrapRow(
        '<div style="grid-column:1/-1">' +
          rowInput("Label", (o && o.label) || "", "Compact · 6 inch") +
          "</div>" +
          '<div style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">' +
          rowMoney("Price (INR)", o && o.priceInr, "vpm-sz-price") +
          rowMoney("MRP (optional)", o && o.mrpInr, "vpm-sz-mrp") +
          "</div>" +
          '<div style="grid-column:1/-1">' +
          rowUrl("Image URL (optional)", (o && o.image) || "") +
          "</div>"
      )
    );
  }

  function addQtyRow(o) {
    var host = document.getElementById("vpmQtyRows");
    if (!host) return;
    host.appendChild(
      wrapRow(
        '<div style="grid-column:1/-1">' +
          rowInput("Pack label", (o && o.label) || "", "Pack of 3") +
          "</div>" +
          '<div style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">' +
          rowMoney("Price add-on (INR)", o && o.priceInr, "vpm-qty-price") +
          rowMoney("MRP add-on (optional)", o && o.mrpInr, "vpm-qty-mrp") +
          "</div>" +
          '<div style="grid-column:1/-1">' +
          rowUrl("Image URL (optional)", (o && o.image) || "") +
          "</div>"
      )
    );
  }

  function addColorRow(o) {
    var host = document.getElementById("vpmColorRows");
    if (!host) return;
    var hx = normalizeHexVendor((o && o.hex) || "#22c55e");
    var inner =
      '<div style="grid-column:1/-1">' +
      rowInput("Colour name", (o && o.label) || "", "Forest green") +
      "</div>" +
      '<div style="grid-column:1/-1" class="vrm-color-swatch-row">' +
      '<span class="vs-muted vrm-color-swatch-label">Swatch</span>' +
      '<div class="vrm-color-swatch-controls">' +
      '<input type="color" class="vrm-color-pick vpm-color-pick" value="' +
      esc(hx) +
      '" aria-label="Swatch colour" />' +
      '<code class="vrm-color-readout vpm-color-readout"></code></div></div>' +
      '<div style="grid-column:1/-1">' +
      rowUrl("Image URL (optional)", (o && o.image) || "") +
      "</div>";
    var row = wrapRow(inner);
    host.appendChild(row);
    var pick = row.querySelector(".vpm-color-pick");
    var read = row.querySelector(".vpm-color-readout");
    if (pick && read) {
      function sync() {
        read.textContent = String(pick.value || "").toUpperCase();
      }
      pick.addEventListener("input", sync);
      pick.addEventListener("change", sync);
      sync();
    }
  }

  function readRows(containerSel, kind) {
    var host = document.querySelector(containerSel);
    if (!host) return [];
    var rows = host.querySelectorAll(".vrm-opt-row");
    var out = [];
    rows.forEach(function (row) {
      if (kind === "color") {
        var labInp = row.querySelector("input.vpm-opt-inp");
        var pick = row.querySelector("input.vpm-color-pick");
        var urlInp = row.querySelector("input.vpm-opt-url");
        var lab = labInp && labInp.value.trim();
        if (!lab) return;
        out.push({
          id: "c" + (out.length + 1),
          label: lab.slice(0, 120),
          hex: normalizeHexVendor((pick && pick.value) || "#888888"),
          image: urlInp ? urlInp.value.trim() : "",
        });
      } else if (kind === "size") {
        var labS = row.querySelector("input.vpm-opt-inp");
        var urlS = row.querySelector("input.vpm-opt-url");
        var prS = row.querySelector(".vpm-sz-price");
        var mrS = row.querySelector(".vpm-sz-mrp");
        var lab = labS && labS.value.trim();
        if (!lab) return;
        var pr = prS && prS.value.trim() !== "" ? Number(prS.value) : null;
        var mr = mrS && mrS.value.trim() !== "" ? Number(mrS.value) : null;
        out.push({
          id: "s" + (out.length + 1),
          label: lab.slice(0, 120),
          image: urlS ? urlS.value.trim() : "",
          priceInr: Number.isFinite(pr) && pr >= 0 ? pr : null,
          mrpInr: Number.isFinite(mr) && mr >= 0 ? mr : null,
        });
      } else if (kind === "qty") {
        var labQ = row.querySelector("input.vpm-opt-inp");
        var urlQ = row.querySelector("input.vpm-opt-url");
        var prQ = row.querySelector(".vpm-qty-price");
        var mrQ = row.querySelector(".vpm-qty-mrp");
        var labq = labQ && labQ.value.trim();
        if (!labq) return;
        var prq = prQ && prQ.value.trim() !== "" ? Number(prQ.value) : null;
        var mrq = mrQ && mrQ.value.trim() !== "" ? Number(mrQ.value) : null;
        out.push({
          id: "q" + (out.length + 1),
          label: labq.slice(0, 120),
          image: urlQ ? urlQ.value.trim() : "",
          priceInr: Number.isFinite(prq) && prq >= 0 ? prq : null,
          mrpInr: Number.isFinite(mrq) && mrq >= 0 ? mrq : null,
        });
      }
    });
    return out;
  }

  function renderOptionBlocks() {
    var sz = document.getElementById("vpmSizesBlock");
    var qt = document.getElementById("vpmQtyBlock");
    var cl = document.getElementById("vpmColorsBlock");
    var uS = document.getElementById("vpmUseSize") && document.getElementById("vpmUseSize").checked;
    var uQ = document.getElementById("vpmUseQty") && document.getElementById("vpmUseQty").checked;
    var uC = document.getElementById("vpmUseColor") && document.getElementById("vpmUseColor").checked;
    if (sz) {
      sz.innerHTML = uS
        ? "<h3 class=\"vs-card__title\" style=\"font-size:1rem;margin:0\">Size options</h3>" +
          "<p class=\"vs-muted\" style=\"margin:0.25rem 0 0.5rem\">Label, optional INR price/MRP, optional image per size (guest PDP matches raw materials).</p>" +
          '<div id="vpmSizeRows"></div><button type="button" class="vs-btn vs-btn--ghost" id="vpmAddSize">+ Add size</button>'
        : "";
    }
    if (qt) {
      qt.innerHTML = uQ
        ? "<h3 class=\"vs-card__title\" style=\"font-size:1rem;margin:0\">Pack / quantity</h3>" +
          "<p class=\"vs-muted\" style=\"margin:0.25rem 0 0.5rem\">Optional add-on price per pack row. With sizes on, guest price = size + pack when both have prices.</p>" +
          '<div id="vpmQtyRows"></div><button type="button" class="vs-btn vs-btn--ghost" id="vpmAddQty">+ Add pack</button>'
        : "";
    }
    if (cl) {
      cl.innerHTML = uC
        ? "<h3 class=\"vs-card__title\" style=\"font-size:1rem;margin:0\">Colours</h3>" +
          "<p class=\"vs-muted\" style=\"margin:0.25rem 0 0.5rem\">Swatch + optional image URL per colour (hero switches when guest picks a colour).</p>" +
          '<div id="vpmColorRows"></div><button type="button" class="vs-btn vs-btn--ghost" id="vpmAddColor">+ Add colour</button>'
        : "";
    }
    if (uS && document.getElementById("vpmSizeRows") && !document.getElementById("vpmSizeRows").children.length) {
      addSizeRow({});
      addSizeRow({});
    }
    if (uQ && document.getElementById("vpmQtyRows") && !document.getElementById("vpmQtyRows").children.length) {
      addQtyRow({});
      addQtyRow({});
      addQtyRow({});
    }
    if (uC && document.getElementById("vpmColorRows") && !document.getElementById("vpmColorRows").children.length) {
      addColorRow({ hex: "#6366f1" });
      addColorRow({ hex: "#22c55e" });
    }
    var as = document.getElementById("vpmAddSize");
    if (as) as.onclick = function () { addSizeRow({}); };
    var aq = document.getElementById("vpmAddQty");
    if (aq) aq.onclick = function () { addQtyRow({}); };
    var ac = document.getElementById("vpmAddColor");
    if (ac) ac.onclick = function () { addColorRow({ hex: "#888888" }); };
  }

  function readOptionsFromForm() {
    var uS = document.getElementById("vpmUseSize") && document.getElementById("vpmUseSize").checked;
    var uQ = document.getElementById("vpmUseQty") && document.getElementById("vpmUseQty").checked;
    var uC = document.getElementById("vpmUseColor") && document.getElementById("vpmUseColor").checked;
    var trust = (document.getElementById("vpmTrust") && document.getElementById("vpmTrust").value) || "";
    var trustLines = trust
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var galEl = document.getElementById("vpmOptGallery");
    var galleryImages = galEl
      ? galEl.value
          .split("\n")
          .map(function (l) {
            return l.trim();
          })
          .filter(Boolean)
          .slice(0, 12)
      : [];
    var o = {
      useSize: uS,
      useQty: uQ,
      useColor: uC,
      badge: (document.getElementById("vpmBadge") && document.getElementById("vpmBadge").value.trim()) || "",
      heroImage: (document.getElementById("vpmHero") && document.getElementById("vpmHero").value.trim()) || "",
      trustBullets: trustLines,
      sizes: uS ? readRows("#vpmSizeRows", "size") : [],
      qtyOptions: uQ ? readRows("#vpmQtyRows", "qty") : [],
      colors: uC ? readRows("#vpmColorRows", "color") : [],
      galleryImages: galleryImages,
    };
    if (!uS && !uQ && !uC && !o.heroImage && !o.badge && !o.trustBullets.length && !o.galleryImages.length) {
      return undefined;
    }
    return o;
  }

  function fillEditorsFromOptions(opt) {
    opt = opt || {};
    if (!opt.useSize && !opt.useQty && !opt.useColor && !(opt.galleryImages && opt.galleryImages.length) && !opt.heroImage && !opt.badge && !(opt.trustBullets && opt.trustBullets.length)) {
      var zS = document.getElementById("vpmUseSize");
      var zQ = document.getElementById("vpmUseQty");
      var zC = document.getElementById("vpmUseColor");
      if (zS) zS.checked = false;
      if (zQ) zQ.checked = false;
      if (zC) zC.checked = false;
      ["vpmHero", "vpmBadge", "vpmTrust", "vpmOptGallery"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = "";
      });
      renderOptionBlocks();
      return;
    }
    var uS = document.getElementById("vpmUseSize");
    var uQ = document.getElementById("vpmUseQty");
    var uC = document.getElementById("vpmUseColor");
    if (uS) uS.checked = !!opt.useSize;
    if (uQ) uQ.checked = !!opt.useQty;
    if (uC) uC.checked = !!opt.useColor;
    var hero = document.getElementById("vpmHero");
    if (hero) hero.value = opt.heroImage || "";
    var bd = document.getElementById("vpmBadge");
    if (bd) bd.value = opt.badge || "";
    var tr = document.getElementById("vpmTrust");
    if (tr) tr.value = (opt.trustBullets || []).join("\n");
    var gg = document.getElementById("vpmOptGallery");
    if (gg) gg.value = (opt.galleryImages || []).join("\n");
    renderOptionBlocks();
    var sr = document.getElementById("vpmSizeRows");
    if (sr) sr.innerHTML = "";
    var qr = document.getElementById("vpmQtyRows");
    if (qr) qr.innerHTML = "";
    var cr = document.getElementById("vpmColorRows");
    if (cr) cr.innerHTML = "";
    if (opt.useSize && opt.sizes && opt.sizes.length) {
      opt.sizes.forEach(function (s) {
        addSizeRow(s);
      });
    }
    if (opt.useQty && opt.qtyOptions && opt.qtyOptions.length) {
      opt.qtyOptions.forEach(function (s) {
        addQtyRow(s);
      });
    }
    if (opt.useColor && opt.colors && opt.colors.length) {
      opt.colors.forEach(function (s) {
        addColorRow(s);
      });
    }
  }

  function clearEditors() {
    var uS = document.getElementById("vpmUseSize");
    var uQ = document.getElementById("vpmUseQty");
    var uC = document.getElementById("vpmUseColor");
    if (uS) uS.checked = false;
    if (uQ) uQ.checked = false;
    if (uC) uC.checked = false;
    ["vpmHero", "vpmBadge", "vpmTrust", "vpmOptGallery"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    renderOptionBlocks();
  }

  function boot() {
    ["vpmUseSize", "vpmUseQty", "vpmUseColor"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", renderOptionBlocks);
    });
  }

  window.VendorCatalogPdpOptions = {
    boot: boot,
    readOptionsFromForm: readOptionsFromForm,
    fillEditorsFromOptions: fillEditorsFromOptions,
    clearEditors: clearEditors,
    renderOptionBlocks: renderOptionBlocks,
  };
})();
