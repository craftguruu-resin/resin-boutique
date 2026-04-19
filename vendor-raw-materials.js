(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;

  var rawList = [];

  function findOpt(list, id) {
    if (!id || !list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function fin(n) {
    var x = Number(n);
    return Number.isFinite(x) ? x : null;
  }

  /** Same rules as guest PDP: size-only / qty-only / both (price = sizePart + qtyPart). */
  function effectivePriceInr(m, sel) {
    var base = fin(m.priceInr) != null ? Number(m.priceInr) : 0;
    if (!Number.isFinite(base) || base < 0) base = 0;
    var opt = m.options || {};
    var s = opt.useSize && sel.sid ? findOpt(opt.sizes, sel.sid) : null;
    var q = opt.useQty && sel.qid ? findOpt(opt.qtyOptions, sel.qid) : null;
    var ps = s ? fin(s.priceInr) : null;
    var pq = q ? fin(q.priceInr) : null;
    if (opt.useSize && opt.useQty) {
      return (ps != null ? ps : base) + (pq != null ? pq : 0);
    }
    if (opt.useSize && s) return ps != null ? ps : base;
    if (opt.useQty && q) return pq != null ? pq : base;
    return base;
  }

  function minOfferPrice(m) {
    var opt = m.options || {};
    if (!opt.useSize && !opt.useQty) return Number(m.priceInr) || 0;
    var sizes = opt.useSize && opt.sizes && opt.sizes.length ? opt.sizes : [{ id: "" }];
    var qtys = opt.useQty && opt.qtyOptions && opt.qtyOptions.length ? opt.qtyOptions : [{ id: "" }];
    if (!opt.useSize) sizes = [{ id: "" }];
    if (!opt.useQty) qtys = [{ id: "" }];
    var best = Infinity;
    sizes.forEach(function (s) {
      qtys.forEach(function (q) {
        var p = effectivePriceInr(m, {
          sid: opt.useSize ? s.id : "",
          qid: opt.useQty ? q.id : "",
        });
        if (p < best) best = p;
      });
    });
    return best === Infinity ? Number(m.priceInr) || 0 : best;
  }

  function setVrmTab(which) {
    var manage = document.getElementById("vrmPanelManage");
    var form = document.getElementById("vrmPanelForm");
    document.querySelectorAll(".vrm-tab").forEach(function (btn) {
      var on = btn.getAttribute("data-vrm-tab") === which;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (manage) {
      manage.classList.toggle("is-active", which === "manage");
      manage.hidden = which !== "manage";
    }
    if (form) {
      form.classList.toggle("is-active", which === "form");
      form.hidden = which !== "form";
    }
  }

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

  function imgHref(rel) {
    var u = String(rel || "").trim();
    if (!u) return "";
    if (u.indexOf("http") === 0 || u.indexOf("//") === 0) return u;
    if (u.charAt(0) === "/") return V.vendorPageHref(u.slice(1));
    return V.vendorPageHref(u);
  }

  function showMsg(text, isErr) {
    var el = document.getElementById("vrmMsg");
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.style.color = isErr ? "#b42318" : "";
  }

  function rowInput(label, val, ph) {
    return (
      '<label class="vs-muted" style="display:block;font-size:0.78rem;margin-bottom:0.2rem">' +
      esc(label) +
      '</label><input type="text" class="vrm-opt-inp" value="' +
      esc(val) +
      "\" placeholder=\"" +
      esc(ph || "") +
      '" />'
    );
  }

  function rowUrl(label, val) {
    return (
      '<label class="vs-muted" style="display:block;font-size:0.78rem;margin-bottom:0.2rem">' +
      esc(label) +
      '</label><input type="url" class="vrm-opt-url" value="' +
      esc(val) +
      '" placeholder="https://…" />'
    );
  }

  function rowMoneyNum(label, val, cls) {
    var v = val != null && String(val) !== "" ? String(val) : "";
    return (
      '<div><label class="vs-muted" style="display:block;font-size:0.78rem;margin-bottom:0.2rem">' +
      esc(label) +
      '</label><input type="number" class="' +
      esc(cls) +
      '" min="0" step="0.01" value="' +
      esc(v) +
      '" placeholder="Optional" /></div>'
    );
  }

  function normalizeHexVendor(h) {
    var s = String(h == null ? "" : h)
      .trim()
      .replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(s)) return "#" + s.toLowerCase();
    if (/^[0-9a-fA-F]{3}$/.test(s)) {
      return (
        "#" +
        s[0].toLowerCase() +
        s[0].toLowerCase() +
        s[1].toLowerCase() +
        s[1].toLowerCase() +
        s[2].toLowerCase() +
        s[2].toLowerCase()
      );
    }
    return "#888888";
  }

  function renderOptionBlocks() {
    var sz = document.getElementById("vrmSizesBlock");
    var qt = document.getElementById("vrmQtyBlock");
    var cl = document.getElementById("vrmColorsBlock");
    var uS = document.getElementById("vrmUseSize").checked;
    var uQ = document.getElementById("vrmUseQty").checked;
    var uC = document.getElementById("vrmUseColor").checked;
    if (sz) {
      sz.innerHTML = uS
        ? "<h3 class=\"vs-card__title\" style=\"font-size:1rem\">Size options</h3>" +
          "<p class=\"vs-muted\" style=\"margin:0.25rem 0 0.5rem\">Label + optional price/MRP per row (blank price uses default above) + optional image URL.</p>" +
          '<div id="vrmSizeRows"></div><button type="button" class="vs-btn vs-btn--ghost" id="vrmAddSize">+ Add size</button>'
        : "";
    }
    if (qt) {
      qt.innerHTML = uQ
        ? "<h3 class=\"vs-card__title\" style=\"font-size:1rem\">Pack / quantity options (min 3)</h3>" +
          "<p class=\"vs-muted\" style=\"margin:0.25rem 0 0.5rem\">Each pack can have its own price. With sizes enabled, guest price = size price + pack price (each part falls back to default when blank).</p>" +
          '<div id="vrmQtyRows"></div><button type="button" class="vs-btn vs-btn--ghost" id="vrmAddQty">+ Add pack</button>'
        : "";
    }
    if (cl) {
      cl.innerHTML = uC
        ? "<h3 class=\"vs-card__title\" style=\"font-size:1rem\">Colours (max 5)</h3>" +
          "<p class=\"vs-muted\" style=\"margin:0.25rem 0 0.5rem\">Use the colour picker for each swatch (guest PDP uses it exactly). Optional image URL overrides the hero for that swatch.</p>" +
          '<div id="vrmColorRows"></div><button type="button" class="vs-btn vs-btn--ghost" id="vrmAddColor">+ Add colour</button>'
        : "";
    }
    if (uS && document.getElementById("vrmSizeRows") && !document.getElementById("vrmSizeRows").children.length) {
      addSizeRow({ id: "", label: "", image: "" });
      addSizeRow({ id: "", label: "", image: "" });
    }
    if (uQ && document.getElementById("vrmQtyRows") && !document.getElementById("vrmQtyRows").children.length) {
      addQtyRow({ id: "", label: "", image: "" });
      addQtyRow({ id: "", label: "", image: "" });
      addQtyRow({ id: "", label: "", image: "" });
    }
    if (uC && document.getElementById("vrmColorRows") && !document.getElementById("vrmColorRows").children.length) {
      addColorRow({ id: "", label: "", hex: "#6366f1", image: "" });
      addColorRow({ id: "", label: "", hex: "#22c55e", image: "" });
    }
    var as = document.getElementById("vrmAddSize");
    if (as) as.addEventListener("click", function () { addSizeRow({ id: "", label: "", image: "" }); });
    var aq = document.getElementById("vrmAddQty");
    if (aq) aq.addEventListener("click", function () { addQtyRow({ id: "", label: "", image: "" }); });
    var ac = document.getElementById("vrmAddColor");
    if (ac) ac.addEventListener("click", function () { addColorRow({ id: "", label: "", hex: "#888888", image: "" }); });
  }

  function wrapRow(inner) {
    var d = document.createElement("div");
    d.className = "vrm-opt-row";
    d.style.cssText =
      "display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;padding:0.5rem;border:1px solid rgba(15,23,42,0.08);border-radius:8px";
    d.innerHTML = inner + '<div style="grid-column:1/-1"><button type="button" class="vs-btn vs-btn--ghost vrm-rm-row">Remove</button></div>';
    d.querySelector(".vrm-rm-row").addEventListener("click", function () {
      d.remove();
    });
    return d;
  }

  function addSizeRow(o) {
    var host = document.getElementById("vrmSizeRows");
    if (!host) return;
    host.appendChild(
      wrapRow(
        '<div style="grid-column:1/-1">' +
          rowInput("Label", o.label || "", "500 ml") +
          "</div>" +
          '<div style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">' +
          rowMoneyNum("Price (INR)", o.priceInr, "vrm-sz-price") +
          rowMoneyNum("MRP (optional)", o.mrpInr, "vrm-sz-mrp") +
          "</div>" +
          '<div style="grid-column:1/-1">' +
          rowUrl("Image URL (optional)", o.image || "") +
          "</div>"
      )
    );
  }

  function addQtyRow(o) {
    var host = document.getElementById("vrmQtyRows");
    if (!host) return;
    host.appendChild(
      wrapRow(
        '<div style="grid-column:1/-1">' +
          rowInput("Pack label", o.label || "", "3 × 400 ml") +
          "</div>" +
          '<div style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">' +
          rowMoneyNum("Price (INR)", o.priceInr, "vrm-qty-price") +
          rowMoneyNum("MRP (optional)", o.mrpInr, "vrm-qty-mrp") +
          "</div>" +
          '<div style="grid-column:1/-1">' +
          rowUrl("Image URL (optional)", o.image || "") +
          "</div>"
      )
    );
  }

  function addColorRow(o) {
    var host = document.getElementById("vrmColorRows");
    if (!host) return;
    var hx = normalizeHexVendor(o.hex || "#6366f1");
    var inner =
      '<div style="grid-column:1/-1">' +
      rowInput("Colour name", o.label || "", "Indigo label") +
      "</div>" +
      '<div style="grid-column:1/-1">' +
      '<label class="vs-muted" style="display:block;font-size:0.78rem;margin-bottom:0.25rem">Swatch colour</label>' +
      '<div style="display:flex;align-items:center;gap:0.65rem;flex-wrap:wrap">' +
      '<input type="color" class="vrm-color-pick" value="' +
      esc(hx) +
      "\" aria-label=\"Choose swatch colour\" style=\"width:48px;height:48px;padding:0;border:1px solid rgba(15,23,42,0.12);border-radius:10px;cursor:pointer;background:#fff\" />" +
      '<code class="vrm-color-readout" style="font-size:0.82rem;color:#334155"></code></div></div>' +
      '<div style="grid-column:1/-1">' +
      rowUrl("Image URL (optional)", o.image || "") +
      "</div>";
    var row = wrapRow(inner);
    host.appendChild(row);
    var pick = row.querySelector("input.vrm-color-pick");
    var read = row.querySelector(".vrm-color-readout");
    function syncReadout() {
      if (read && pick) read.textContent = String(pick.value || "").toUpperCase();
    }
    if (pick) {
      pick.addEventListener("input", syncReadout);
      pick.addEventListener("change", syncReadout);
      syncReadout();
    }
  }

  function readRows(containerSel, kind) {
    var host = document.querySelector(containerSel);
    if (!host) return [];
    var rows = host.querySelectorAll(".vrm-opt-row");
    var out = [];
    rows.forEach(function (row, idx) {
      if (kind === "color") {
        var labInp = row.querySelector("input.vrm-opt-inp");
        var pick = row.querySelector("input.vrm-color-pick");
        var urlInp = row.querySelector("input.vrm-opt-url");
        var lab = labInp && labInp.value.trim();
        var hex = pick && pick.value.trim();
        var img = urlInp && urlInp.value.trim();
        if (!lab) return;
        out.push({
          id: "c" + (idx + 1),
          label: lab.slice(0, 120),
          hex: normalizeHexVendor(hex || "#888888"),
          image: img || "",
        });
      } else if (kind === "size") {
        var labS = row.querySelector("input.vrm-opt-inp");
        var urlS = row.querySelector("input.vrm-opt-url");
        var prS = row.querySelector("input.vrm-sz-price");
        var mrS = row.querySelector("input.vrm-sz-mrp");
        var lab = labS && labS.value.trim();
        if (!lab) return;
        var pr = prS && prS.value.trim() !== "" ? Number(prS.value) : null;
        var mr = mrS && mrS.value.trim() !== "" ? Number(mrS.value) : null;
        out.push({
          id: "s" + (idx + 1),
          label: lab.slice(0, 120),
          image: urlS ? urlS.value.trim() : "",
          priceInr: Number.isFinite(pr) && pr >= 0 ? pr : null,
          mrpInr: Number.isFinite(mr) && mr >= 0 ? mr : null,
        });
      } else if (kind === "qty") {
        var labQ = row.querySelector("input.vrm-opt-inp");
        var urlQ = row.querySelector("input.vrm-opt-url");
        var prQ = row.querySelector("input.vrm-qty-price");
        var mrQ = row.querySelector("input.vrm-qty-mrp");
        var labq = labQ && labQ.value.trim();
        if (!labq) return;
        var prq = prQ && prQ.value.trim() !== "" ? Number(prQ.value) : null;
        var mrq = mrQ && mrQ.value.trim() !== "" ? Number(mrQ.value) : null;
        out.push({
          id: "q" + (idx + 1),
          label: labq.slice(0, 120),
          image: urlQ ? urlQ.value.trim() : "",
          priceInr: Number.isFinite(prq) && prq >= 0 ? prq : null,
          mrpInr: Number.isFinite(mrq) && mrq >= 0 ? mrq : null,
        });
      }
    });
    return out;
  }

  function fillEditorsFromOptions(opt) {
    document.getElementById("vrmUseSize").checked = !!opt.useSize;
    document.getElementById("vrmUseQty").checked = !!opt.useQty;
    document.getElementById("vrmUseColor").checked = !!opt.useColor;
    document.getElementById("vrmHero").value = opt.heroImage || "";
    document.getElementById("vrmBadge").value = opt.badge || "";
    document.getElementById("vrmTrust").value = (opt.trustBullets || []).join("\n");
    renderOptionBlocks();
    var sr = document.getElementById("vrmSizeRows");
    if (sr) sr.innerHTML = "";
    var qr = document.getElementById("vrmQtyRows");
    if (qr) qr.innerHTML = "";
    var cr = document.getElementById("vrmColorRows");
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

  function readOptionsFromForm() {
    var uS = document.getElementById("vrmUseSize").checked;
    var uQ = document.getElementById("vrmUseQty").checked;
    var uC = document.getElementById("vrmUseColor").checked;
    var trust = document
      .getElementById("vrmTrust")
      .value.split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var o = {
      useSize: uS,
      useQty: uQ,
      useColor: uC,
      badge: document.getElementById("vrmBadge").value.trim(),
      heroImage: document.getElementById("vrmHero").value.trim(),
      trustBullets: trust,
      sizes: uS ? readRows("#vrmSizeRows", "size") : [],
      qtyOptions: uQ ? readRows("#vrmQtyRows", "qty") : [],
      colors: uC ? readRows("#vrmColorRows", "color") : [],
    };
    return o;
  }

  function resetForm() {
    document.getElementById("vrmEditingId").value = "";
    document.getElementById("vrmFormTitle").textContent = "Add raw material product";
    document.getElementById("vrmSubmit").textContent = "Save product";
    document.getElementById("vrmCancelEdit").style.display = "none";
    document.getElementById("vrmForm").reset();
    document.getElementById("vrmUseSize").checked = true;
    document.getElementById("vrmUseQty").checked = false;
    document.getElementById("vrmUseColor").checked = true;
    document.getElementById("vrmSizesBlock").innerHTML = "";
    document.getElementById("vrmQtyBlock").innerHTML = "";
    document.getElementById("vrmColorsBlock").innerHTML = "";
    renderOptionBlocks();
  }

  function startEdit(id) {
    var m = null;
    for (var i = 0; i < rawList.length; i++) {
      if (rawList[i].id === id) m = rawList[i];
    }
    if (!m) return;
    document.getElementById("vrmEditingId").value = m.id;
    document.getElementById("vrmFormTitle").textContent = "Edit raw material";
    document.getElementById("vrmSubmit").textContent = "Update product";
    document.getElementById("vrmCancelEdit").style.display = "inline-flex";
    document.getElementById("vrmName").value = m.name || "";
    document.getElementById("vrmDesc").value = m.description || "";
    document.getElementById("vrmNote").value = m.note || "";
    document.getElementById("vrmPrice").value = m.priceInr != null ? String(m.priceInr) : "0";
    document.getElementById("vrmMrp").value = m.mrpInr != null ? String(m.mrpInr) : "";
    document.getElementById("vrmImageUrl").value =
      m.image && (m.image.indexOf("http") === 0 || m.image.indexOf("//") === 0) ? m.image : "";
    fillEditorsFromOptions(m.options || {});
    setVrmTab("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderRows(rows) {
    var tb = document.getElementById("vrmTbody");
    var empty = document.getElementById("vrmEmpty");
    var table = document.getElementById("vrmTable");
    if (!tb || !empty || !table) return;
    tb.innerHTML = "";
    rawList = rows || [];
    if (!rows || !rows.length) {
      empty.style.display = "block";
      empty.textContent = "No materials yet.";
      table.style.display = "none";
      return;
    }
    empty.style.display = "none";
    table.style.display = "";
    rows.forEach(function (r) {
      var active = r.isActive !== false;
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        (r.image
          ? "<img src=\"" +
            esc(imgHref(r.image)) +
            "\" alt=\"\" width=\"56\" height=\"56\" style=\"object-fit:cover;border-radius:6px\" />"
          : "—") +
        "</td><td><strong>" +
        esc(r.name) +
        "</strong><br /><small class=\"vs-muted\">" +
        esc(r.id || "") +
        "</small></td><td>" +
        esc(String(minOfferPrice(r))) +
        "</td><td>" +
        (active ? "<span class=\"vs-pill vs-pill--active\">Live</span>" : "<span class=\"vs-pill vs-pill--inactive\">Hidden</span>") +
        "</td><td><button type=\"button\" class=\"vs-btn vs-btn--ghost vrm-edit\" data-id=\"" +
        esc(r.id) +
        "\">Edit</button> " +
        "<button type=\"button\" class=\"vs-btn vs-btn--ghost vrm-toggle\" data-id=\"" +
        esc(r.id) +
        "\" data-next=\"" +
        (active ? "0" : "1") +
        "\">" +
        (active ? "Hide" : "Show") +
        "</button> " +
        "<button type=\"button\" class=\"vs-btn vs-btn--ghost vrm-delete\" data-id=\"" +
        esc(r.id) +
        "\" data-name=\"" +
        esc(r.name || "") +
        "\">Delete</button></td>";
      tb.appendChild(tr);
    });
  }

  function loadList() {
    showMsg("", false);
    return fetch(base() + "/api/vendor/raw-materials", { headers: V.authHeaders(), cache: "no-store" })
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
          renderRows(j.materials || []);
        });
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
      });
  }

  function setActive(id, on) {
    return fetch(base() + "/api/vendor/raw-materials/" + encodeURIComponent(id) + "/active", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify({ active: !!on }),
      cache: "no-store",
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

  function postJson(method, url, body) {
    return fetch(url, {
      method: method,
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
          throw new Error((j && j.error) || res.statusText || "Save failed");
        }
        return j;
      });
    });
  }

  function postMultipart(method, url, fd) {
    var headers = V.authHeaders();
    delete headers["Content-Type"];
    return fetch(url, {
      method: method,
      headers: headers,
      body: fd,
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
        return j;
      });
    });
  }

  function deleteMaterial(id, name) {
    var label = name || id || "this product";
    if (!window.confirm('Permanently delete "' + label + '"? This cannot be undone.')) return;
    return fetch(base() + "/api/vendor/raw-materials/" + encodeURIComponent(id), {
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

  function boot() {
    renderOptionBlocks();
    ["vrmUseSize", "vrmUseQty", "vrmUseColor"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", renderOptionBlocks);
    });

    document.querySelectorAll(".vrm-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var w = btn.getAttribute("data-vrm-tab");
        if (w) setVrmTab(w);
      });
    });

    var addNew = document.getElementById("vrmAddNew");
    if (addNew) {
      addNew.addEventListener("click", function () {
        resetForm();
        setVrmTab("form");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    document.getElementById("vrmRefresh").addEventListener("click", function () {
      loadList().catch(function () {});
    });

    document.getElementById("vrmCancelEdit").addEventListener("click", function () {
      resetForm();
    });

    document.getElementById("vrmForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var editId = document.getElementById("vrmEditingId").value.trim();
      var options = readOptionsFromForm();
      var file = document.getElementById("vrmImage").files && document.getElementById("vrmImage").files[0];
      var imageUrl = document.getElementById("vrmImageUrl").value.trim();
      showMsg("Saving…", false);

      if (file) {
        var fd = new FormData();
        fd.set("name", document.getElementById("vrmName").value.trim());
        fd.set("description", document.getElementById("vrmDesc").value.trim());
        fd.set("note", document.getElementById("vrmNote").value.trim());
        fd.set("priceInr", document.getElementById("vrmPrice").value.trim());
        var mrpV = document.getElementById("vrmMrp").value.trim();
        if (mrpV) fd.set("mrpInr", mrpV);
        fd.set("options", JSON.stringify(options));
        if (imageUrl) fd.set("imageUrl", imageUrl);
        fd.set("image", file, file.name);
        var mu = editId
          ? base() + "/api/vendor/raw-materials/" + encodeURIComponent(editId)
          : base() + "/api/vendor/raw-materials";
        var mm = editId ? "PUT" : "POST";
        postMultipart(mm, mu, fd)
          .then(function () {
            document.getElementById("vrmImage").value = "";
            showMsg("Saved.", false);
            resetForm();
            return loadList();
          })
          .catch(function (e) {
            showMsg(String((e && e.message) || e), true);
          });
        return;
      }

      var payload = {
        name: document.getElementById("vrmName").value.trim(),
        description: document.getElementById("vrmDesc").value.trim(),
        note: document.getElementById("vrmNote").value.trim(),
        priceInr: Number(document.getElementById("vrmPrice").value) || 0,
        mrpInr: document.getElementById("vrmMrp").value.trim() ? Number(document.getElementById("vrmMrp").value) : null,
        options: options,
      };
      if (imageUrl) payload.imageUrl = imageUrl;

      var reqUrl = editId ? base() + "/api/vendor/raw-materials/" + encodeURIComponent(editId) : base() + "/api/vendor/raw-materials";
      var method = editId ? "PUT" : "POST";
      postJson(method, reqUrl, payload)
        .then(function () {
          showMsg("Saved.", false);
          resetForm();
          return loadList();
        })
        .catch(function (e) {
          showMsg(String((e && e.message) || e), true);
        });
    });

    document.getElementById("vrmTbody").addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest(".vrm-toggle") : null;
      if (b) {
        var id = b.getAttribute("data-id");
        var next = b.getAttribute("data-next") === "1";
        setActive(id, next)
          .then(function () {
            return loadList();
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
        return;
      }
      var del = ev.target && ev.target.closest ? ev.target.closest(".vrm-delete") : null;
      if (del) {
        var did = del.getAttribute("data-id");
        var dname = del.getAttribute("data-name");
        deleteMaterial(did, dname)
          .then(function () {
            return loadList();
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
        return;
      }
      var ed = ev.target && ev.target.closest ? ev.target.closest(".vrm-edit") : null;
      if (ed) {
        startEdit(ed.getAttribute("data-id"));
      }
    });

    loadList().catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
