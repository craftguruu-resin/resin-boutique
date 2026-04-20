(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;

  var rawList = [];
  var vpfNav = null;

  function pfNavCategories() {
    return (vpfNav && vpfNav.categories) || [];
  }

  function fetchPfNavVendor() {
    if (vpfNav) return Promise.resolve(vpfNav);
    return V.vendorFetch(V.vendorApiUrl("/api/vendor/photo-frame-nav"), {
      headers: V.authHeaders(),
      cache: "no-store",
    })
      .then(V.parseApiJson)
      .then(function (x) {
        if (!x.okHttp || !x.json || !x.json.ok || !x.json.nav) {
          throw new Error("photo frame nav vendor");
        }
        vpfNav = x.json.nav;
        return vpfNav;
      })
      .catch(function () {
        return fetch(V.vendorPageHref("photo-frame-nav-default.json"), { cache: "no-store" })
          .then(function (r) {
            return r.json();
          })
          .then(function (doc) {
            vpfNav = doc;
            return doc;
          });
      });
  }

  function populateBaseSelect(sel, selectedVal) {
    if (!sel) return;
    var cats = pfNavCategories();
    var cur = selectedVal || sel.value || "";
    sel.innerHTML = '<option value="">Select…</option>';
    cats.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      if (c.id === cur) o.selected = true;
      sel.appendChild(o);
    });
  }

  function refillSubSelect(baseSel, subSel, selectedSub) {
    if (!baseSel || !subSel) return;
    var bid = baseSel.value;
    var sid = subSel.id;
    var isFormSub = sid === "vpfSubCat";
    subSel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    if (!bid) {
      ph.textContent = "None / N.A.";
      subSel.appendChild(ph);
      subSel.disabled = true;
      return;
    }
    var cat = null;
    var cats = pfNavCategories();
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].id === bid) {
        cat = cats[i];
        break;
      }
    }
    var subs = (cat && cat.subcategories) || [];
    if (isFormSub) {
      ph.textContent = "None / N.A.";
    } else if (subs.length) {
      ph.textContent = "All subfolders";
    } else {
      ph.textContent = "Whole category (no sub-folders)";
    }
    subSel.appendChild(ph);
    subSel.disabled = false;
    subs.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name;
      subSel.appendChild(o);
    });
    if (selectedSub) {
      for (var j = 0; j < subSel.options.length; j++) {
        subSel.options[j].selected = subSel.options[j].value === selectedSub;
      }
    } else {
      subSel.selectedIndex = 0;
    }
  }

  function setVendorFormCategories(baseVal, subVal) {
    var bc = document.getElementById("vpfBaseCat");
    var sc = document.getElementById("vpfSubCat");
    populateBaseSelect(bc, baseVal);
    refillSubSelect(bc, sc, subVal);
  }

  function wireFilterToolbarFromTaxonomy() {
    var fb = document.getElementById("vpfFilterBase");
    var fs = document.getElementById("vpfFilterSub");
    if (!fb || !fs) return;
    var cats = pfNavCategories();
    fb.innerHTML = '<option value="">All</option>';
    cats.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      fb.appendChild(o);
    });
    if (!fb.dataset.rmWired) {
      fb.dataset.rmWired = "1";
      fb.addEventListener("change", function () {
        refillSubSelect(fb, fs, "");
        loadList().catch(function () {});
      });
      fs.addEventListener("change", function () {
        loadList().catch(function () {});
      });
    }
    refillSubSelect(fb, fs, "");
  }

  function wireInventoryTab() {
    var ib = document.getElementById("vpfInvBase");
    var isu = document.getElementById("vpfInvSub");
    var ip = document.getElementById("vpfInvProduct");
    if (!ib || !isu || !ip) return;
    populateBaseSelect(ib, "");
    if (!ib.dataset.rmWired) {
      ib.dataset.rmWired = "1";
      ib.addEventListener("change", function () {
        refillSubSelect(ib, isu, "");
        refillInvProductSelect();
      });
      isu.addEventListener("change", refillInvProductSelect);
    }
    function refillInvProductSelect() {
      var bid = ib.value;
      var sid = isu.disabled ? "" : isu.value;
      ip.innerHTML = '<option value="">Select product…</option>';
      if (!bid) {
        ip.disabled = true;
        return;
      }
      ip.disabled = false;
      rawList.forEach(function (m) {
        if (String(m.baseCategorySlug || "") !== bid) return;
        if (sid && String(m.subcategorySlug || "") !== sid) return;
        var o = document.createElement("option");
        o.value = m.id;
        o.textContent = (m.sku ? m.sku + " · " : "") + (m.name || m.id);
        ip.appendChild(o);
      });
    }
    var saveBtn = document.getElementById("vpfInvSave");
    if (saveBtn && !saveBtn.dataset.rmWired) {
      saveBtn.dataset.rmWired = "1";
      saveBtn.addEventListener("click", function () {
        var id = ip.value;
        var msg = document.getElementById("vpfInvMsg");
        if (!id) {
          if (msg) {
            msg.style.display = "block";
            msg.style.color = "#b42318";
            msg.textContent = "Select a product.";
          }
          return;
        }
        var m = null;
        for (var i = 0; i < rawList.length; i++) {
          if (rawList[i].id === id) m = rawList[i];
        }
        if (!m) return;
        var opt = JSON.parse(JSON.stringify(m.options || {}));
        var qEl = document.getElementById("vpfInvQty");
        var nEl = document.getElementById("vpfInvNote");
        var qv = qEl && qEl.value.trim() !== "" ? Number(qEl.value) : null;
        opt.vendorInventory = {
          qtyOnHand: Number.isFinite(qv) && qv >= 0 ? Math.floor(qv) : null,
          note: nEl ? nEl.value.trim().slice(0, 500) : "",
        };
        var ibv = ib.value.trim();
        var isv = isu.disabled ? "" : isu.value.trim();
        var payload = {
          name: m.name,
          description: m.description || "",
          note: m.note || "",
          sku: m.sku,
          priceInr: m.priceInr,
          mrpInr: m.mrpInr,
          options: opt,
          baseCategorySlug: ibv || m.baseCategorySlug || "",
          subcategorySlug: isv || m.subcategorySlug || "",
        };
        if (m.image && (m.image.indexOf("http") === 0 || m.image.indexOf("//") === 0)) {
          payload.imageUrl = m.image;
        }
        postJson("PUT", base() + "/api/vendor/photo-frame-products/" + encodeURIComponent(id), payload)
          .then(function () {
            if (msg) {
              msg.style.display = "block";
              msg.style.color = "";
              msg.textContent = "Saved.";
            }
            return loadList();
          })
          .catch(function (e) {
            if (msg) {
              msg.style.display = "block";
              msg.style.color = "#b42318";
              msg.textContent = String((e && e.message) || e);
            }
          });
      });
    }
    refillInvProductSelect();
  }

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
    var manage = document.getElementById("vpfPanelManage");
    var inv = document.getElementById("vpfPanelInventory");
    var form = document.getElementById("vpfPanelForm");
    document.querySelectorAll(".vpf-tab").forEach(function (btn) {
      var on = btn.getAttribute("data-vpf-tab") === which;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (manage) {
      manage.classList.toggle("is-active", which === "manage");
      manage.hidden = which !== "manage";
    }
    if (inv) {
      inv.classList.toggle("is-active", which === "inventory");
      inv.hidden = which !== "inventory";
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
    var el = document.getElementById("vpfMsg");
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.style.color = isErr ? "#b42318" : "";
  }

  function rowInput(label, val, ph, extraClass, extraAttrs) {
    var cls = "vpf-opt-inp" + (extraClass ? " " + String(extraClass) : "");
    var x = extraAttrs ? " " + String(extraAttrs) : "";
    return (
      '<label class="vs-muted" style="display:block;font-size:0.78rem;margin-bottom:0.2rem">' +
      esc(label) +
      '</label><input type="text" class="' +
      esc(cls) +
      '" value="' +
      esc(val) +
      "\" placeholder=\"" +
      esc(ph || "") +
      '"' +
      x +
      " />"
    );
  }

  function rowUrl(label, val) {
    return (
      '<label class="vs-muted" style="display:block;font-size:0.78rem;margin-bottom:0.2rem">' +
      esc(label) +
      '</label><input type="url" class="vpf-opt-url" value="' +
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

  /** English colour names → hex for vendor swatches (keys lowercased, single spaces). */
  var NAMED_COLORS = {
    white: "#ffffff",
    ivory: "#fffff0",
    cream: "#fffdd0",
    beige: "#f5f5dc",
    linen: "#faf0e6",
    tan: "#d2b48c",
    sand: "#c2b280",
    black: "#000000",
    charcoal: "#1e293b",
    slate: "#64748b",
    silver: "#94a3b8",
    gray: "#9ca3af",
    grey: "#9ca3af",
    "dark gray": "#4b5563",
    "dark grey": "#4b5563",
    red: "#ef4444",
    crimson: "#dc2626",
    scarlet: "#e11d48",
    cherry: "#b91c1c",
    rose: "#fb7185",
    pink: "#ec4899",
    magenta: "#d946ef",
    fuchsia: "#c026d3",
    purple: "#9333ea",
    violet: "#7c3aed",
    indigo: "#4f46e5",
    blue: "#3b82f6",
    navy: "#1e3a8a",
    "royal blue": "#2563eb",
    "sky blue": "#0ea5e9",
    cyan: "#06b6d4",
    teal: "#14b8a6",
    turquoise: "#2dd4bf",
    aqua: "#22d3ee",
    mint: "#6ee7b7",
    green: "#22c55e",
    "lime green": "#84cc16",
    "forest green": "#15803d",
    "dark green": "#166534",
    olive: "#6b7c3f",
    yellow: "#eab308",
    gold: "#ca8a04",
    amber: "#f59e0b",
    orange: "#f97316",
    peach: "#fdba74",
    coral: "#fb7185",
    brown: "#92400e",
    chocolate: "#78350f",
    coffee: "#6b4423",
    copper: "#b45309",
    bronze: "#a16207",
    rust: "#c2410c",
    maroon: "#881337",
    burgundy: "#9f1239",
    plum: "#86198f",
    lavender: "#c4b5fd",
    lilac: "#ddd6fe",
    periwinkle: "#a5b4fc",
    "light blue": "#93c5fd",
    "light green": "#86efac",
    "light pink": "#fbcfe8",
    "light yellow": "#fef08a",
    "dark blue": "#1e40af",
    "dark red": "#991b1b",
    "hot pink": "#db2777",
    "deep purple": "#6b21a8",
    "electric blue": "#2563eb",
    "sea green": "#0d9488",
    "spring green": "#4ade80",
    "emerald green": "#059669",
    emerald: "#10b981",
    jade: "#00a36c",
    sapphire: "#1d4ed8",
    ruby: "#e11d48",
    pearl: "#e2e8f0",
    champagne: "#f7e7ce",
    "rose gold": "#e8b4b8",
    "antique white": "#faebd7",
    "off white": "#f8fafc",
    "midnight blue": "#0f172a",
    "steel blue": "#4682b4",
    "powder blue": "#b0e0e6",
    "pale green": "#98fb98",
    "golden yellow": "#facc15",
    "neon green": "#39ff14",
    "neon pink": "#ff10f0",
    "neon orange": "#ff6600",
    "wine red": "#722f37",
    "forest blue": "#1e3a5f",
    "ice blue": "#d9f1ff",
    "dusty rose": "#d4a5a5",
    "sage green": "#9caf88",
    "mint green": "#98ff98",
    "royal purple": "#6b21a8",
    "sunflower yellow": "#ffc512",
    "burnt orange": "#cc5500",
    "burnt sienna": "#e97451",
    "raw umber": "#826644",
    "payne gray": "#536878",
    "payne grey": "#536878",
  };

  var SORTED_COLOR_KEYS = Object.keys(NAMED_COLORS).sort(function (a, b) {
    return b.length - a.length;
  });

  var COLOR_QUICK_PICKS = [
    { name: "Emerald", hex: "#10b981" },
    { name: "Gold", hex: "#ca8a04" },
    { name: "Rose", hex: "#fb7185" },
    { name: "Navy", hex: "#1e3a8a" },
    { name: "Black", hex: "#000000" },
    { name: "White", hex: "#ffffff" },
    { name: "Copper", hex: "#b45309" },
    { name: "Purple", hex: "#9333ea" },
    { name: "Sky blue", hex: "#0ea5e9" },
    { name: "Forest green", hex: "#15803d" },
    { name: "Burgundy", hex: "#9f1239" },
    { name: "Coral", hex: "#fb7185" },
  ];

  function titleCaseWords(key) {
    return String(key || "")
      .split(" ")
      .map(function (w) {
        return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "";
      })
      .join(" ");
  }

  function ensureColorDatalist() {
    if (document.getElementById("vpfColorNameList")) return;
    var dl = document.createElement("datalist");
    dl.id = "vpfColorNameList";
    Object.keys(NAMED_COLORS)
      .sort(function (a, b) {
        return a.localeCompare(b);
      })
      .forEach(function (k) {
        var opt = document.createElement("option");
        opt.value = titleCaseWords(k);
        dl.appendChild(opt);
      });
    document.body.appendChild(dl);
  }

  function findNamedColorMatches(raw, limit) {
    var q = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    var lim = limit != null ? limit : 8;
    if (!q) return [];
    var out = [];
    var seen = Object.create(null);
    function addKey(k) {
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push({ key: k, name: titleCaseWords(k), hex: NAMED_COLORS[k] });
    }
    if (NAMED_COLORS[q]) addKey(q);
    SORTED_COLOR_KEYS.forEach(function (k) {
      if (out.length >= lim) return;
      if (k.startsWith(q)) addKey(k);
    });
    SORTED_COLOR_KEYS.forEach(function (k) {
      if (out.length >= lim) return;
      if (seen[k]) return;
      if (k.indexOf(q) >= 0) addKey(k);
    });
    return out.slice(0, lim);
  }

  function wireColorRow(row) {
    ensureColorDatalist();
    var nameInp = row.querySelector("input.vpf-color-name");
    var pick = row.querySelector("input.vpf-color-pick");
    var read = row.querySelector(".vpf-color-readout");
    var sug = row.querySelector(".vpf-color-suggestions");
    if (!nameInp || !pick || !read) return;

    function syncReadout() {
      read.textContent = String(pick.value || "").toUpperCase();
    }

    function applyHex(hex) {
      pick.value = normalizeHexVendor(hex);
      syncReadout();
    }

    function hideSug() {
      if (!sug) return;
      sug.hidden = true;
      sug.innerHTML = "";
    }

    function renderSuggestions(matches) {
      if (!sug) return;
      if (!matches.length) {
        hideSug();
        return;
      }
      sug.innerHTML = matches
        .map(function (m) {
          return (
            '<button type="button" class="vpf-color-suggest-btn" data-hex="' +
            esc(m.hex) +
            "\"><span class=\"vpf-color-swatch-dot\" style=\"background:" +
            esc(m.hex) +
            '\"></span><span class="vpf-color-suggest-text">' +
            esc(m.name) +
            ' <span class="vs-muted">' +
            esc(String(m.hex).toUpperCase()) +
            "</span></span></button>"
          );
        })
        .join("");
      sug.hidden = false;
      sug.querySelectorAll(".vpf-color-suggest-btn").forEach(function (b) {
        b.addEventListener("mousedown", function (ev) {
          ev.preventDefault();
        });
        b.addEventListener("click", function () {
          applyHex(b.getAttribute("data-hex"));
          hideSug();
        });
      });
    }

    function syncFromName() {
      var raw = nameInp.value.trim();
      var q = raw.toLowerCase().replace(/\s+/g, " ");
      if (q && NAMED_COLORS[q]) {
        applyHex(NAMED_COLORS[q]);
        hideSug();
        return;
      }
      var matches = findNamedColorMatches(raw, 8);
      renderSuggestions(matches);
    }

    var tmr;
    nameInp.addEventListener("input", function () {
      window.clearTimeout(tmr);
      tmr = window.setTimeout(syncFromName, 140);
    });
    nameInp.addEventListener("change", syncFromName);
    nameInp.addEventListener("blur", function () {
      window.clearTimeout(tmr);
      syncFromName();
    });

    row.querySelectorAll(".vpf-color-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var hx = chip.getAttribute("data-hex");
        var lab = chip.getAttribute("data-label");
        if (lab) nameInp.value = lab;
        if (hx) applyHex(hx);
        hideSug();
      });
    });

    pick.addEventListener("input", syncReadout);
    pick.addEventListener("change", syncReadout);
    syncReadout();
  }

  function renderOptionBlocks() {
    var sz = document.getElementById("vpfSizesBlock");
    var qt = document.getElementById("vpfQtyBlock");
    var cl = document.getElementById("vpfColorsBlock");
    var uS = document.getElementById("vpfUseSize").checked;
    var uQ = document.getElementById("vpfUseQty").checked;
    var uC = document.getElementById("vpfUseColor").checked;
    if (sz) {
      sz.innerHTML = uS
        ? "<h3 class=\"vs-card__title\" style=\"font-size:1rem\">Size options</h3>" +
          "<p class=\"vs-muted\" style=\"margin:0.25rem 0 0.5rem\">Label + optional price/MRP per row (blank price uses default above) + optional image URL.</p>" +
          '<div id="vpfSizeRows"></div><button type="button" class="vs-btn vs-btn--ghost" id="vpfAddSize">+ Add size</button>'
        : "";
    }
    if (qt) {
      qt.innerHTML = uQ
        ? "<h3 class=\"vs-card__title\" style=\"font-size:1rem\">Pack / quantity options (min 3)</h3>" +
          "<p class=\"vs-muted\" style=\"margin:0.25rem 0 0.5rem\">Each pack can have its own price. With sizes enabled, guest price = size price + pack price (each part falls back to default when blank).</p>" +
          '<div id="vpfQtyRows"></div><button type="button" class="vs-btn vs-btn--ghost" id="vpfAddQty">+ Add pack</button>'
        : "";
    }
    if (cl) {
      cl.innerHTML = uC
        ? "<h3 class=\"vs-card__title\" style=\"font-size:1rem\">Colours (max 5)</h3>" +
          "<p class=\"vs-muted\" style=\"margin:0.25rem 0 0.5rem\">Type an <strong>English colour name</strong> (e.g. <em>forest green</em>, <em>gold</em>) — the swatch updates when there is a clear match, or pick from the suggestions. Use quick chips or the native colour control to fine-tune. Optional image URL overrides the hero for that swatch on the guest PDP.</p>" +
          '<div id="vpfColorRows"></div><button type="button" class="vs-btn vs-btn--ghost" id="vpfAddColor">+ Add colour</button>'
        : "";
    }
    if (uS && document.getElementById("vpfSizeRows") && !document.getElementById("vpfSizeRows").children.length) {
      addSizeRow({ id: "", label: "", image: "" });
      addSizeRow({ id: "", label: "", image: "" });
    }
    if (uQ && document.getElementById("vpfQtyRows") && !document.getElementById("vpfQtyRows").children.length) {
      addQtyRow({ id: "", label: "", image: "" });
      addQtyRow({ id: "", label: "", image: "" });
      addQtyRow({ id: "", label: "", image: "" });
    }
    if (uC && document.getElementById("vpfColorRows") && !document.getElementById("vpfColorRows").children.length) {
      addColorRow({ id: "", label: "", hex: "#6366f1", image: "" });
      addColorRow({ id: "", label: "", hex: "#22c55e", image: "" });
    }
    var as = document.getElementById("vpfAddSize");
    if (as) as.addEventListener("click", function () { addSizeRow({ id: "", label: "", image: "" }); });
    var aq = document.getElementById("vpfAddQty");
    if (aq) aq.addEventListener("click", function () { addQtyRow({ id: "", label: "", image: "" }); });
    var ac = document.getElementById("vpfAddColor");
    if (ac) ac.addEventListener("click", function () { addColorRow({ id: "", label: "", hex: "#888888", image: "" }); });
  }

  function wrapRow(inner) {
    var d = document.createElement("div");
    d.className = "vpf-opt-row";
    d.style.cssText =
      "display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;padding:0.5rem;border:1px solid rgba(15,23,42,0.08);border-radius:8px";
    d.innerHTML = inner + '<div style="grid-column:1/-1"><button type="button" class="vs-btn vs-btn--ghost vpf-rm-row">Remove</button></div>';
    d.querySelector(".vpf-rm-row").addEventListener("click", function () {
      d.remove();
    });
    return d;
  }

  function addSizeRow(o) {
    var host = document.getElementById("vpfSizeRows");
    if (!host) return;
    host.appendChild(
      wrapRow(
        '<div style="grid-column:1/-1">' +
          rowInput("Label", o.label || "", "500 ml") +
          "</div>" +
          '<div style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">' +
          rowMoneyNum("Price (INR)", o.priceInr, "vpf-sz-price") +
          rowMoneyNum("MRP (optional)", o.mrpInr, "vpf-sz-mrp") +
          "</div>" +
          '<div style="grid-column:1/-1">' +
          rowUrl("Image URL (optional)", o.image || "") +
          "</div>"
      )
    );
  }

  function addQtyRow(o) {
    var host = document.getElementById("vpfQtyRows");
    if (!host) return;
    host.appendChild(
      wrapRow(
        '<div style="grid-column:1/-1">' +
          rowInput("Pack label", o.label || "", "3 × 400 ml") +
          "</div>" +
          '<div style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">' +
          rowMoneyNum("Price (INR)", o.priceInr, "vpf-qty-price") +
          rowMoneyNum("MRP (optional)", o.mrpInr, "vpf-qty-mrp") +
          "</div>" +
          '<div style="grid-column:1/-1">' +
          rowUrl("Image URL (optional)", o.image || "") +
          "</div>"
      )
    );
  }

  function addColorRow(o) {
    var host = document.getElementById("vpfColorRows");
    if (!host) return;
    ensureColorDatalist();
    var hx = normalizeHexVendor(o.hex || "#6366f1");
    var chips = COLOR_QUICK_PICKS.map(function (p) {
      return (
        '<button type="button" class="vpf-color-chip" data-hex="' +
        esc(p.hex) +
        '" data-label="' +
        esc(p.name) +
        "\"><span class=\"vpf-color-chip-dot\" style=\"background:" +
        esc(p.hex) +
        '\"></span>' +
        esc(p.name) +
        "</button>"
      );
    }).join("");
    var inner =
      '<div style="grid-column:1/-1">' +
      rowInput(
        "Colour name",
        o.label || "",
        "e.g. Green, Navy, Rose gold…",
        "vpf-color-name",
        'list="vpfColorNameList" autocomplete="off" spellcheck="true"'
      ) +
      "</div>" +
      '<div class="vpf-color-quick" style="grid-column:1/-1" aria-label="Quick colour picks">' +
      chips +
      "</div>" +
      '<div class="vpf-color-suggestions" style="grid-column:1/-1" hidden aria-live="polite"></div>' +
      '<div style="grid-column:1/-1" class="vpf-color-swatch-row">' +
      '<span class="vs-muted vpf-color-swatch-label">Swatch</span>' +
      '<div class="vpf-color-swatch-controls">' +
      '<input type="color" class="vpf-color-pick" value="' +
      esc(hx) +
      "\" aria-label=\"Fine-tune swatch colour\" />" +
      '<code class="vpf-color-readout"></code>' +
      "</div></div>" +
      '<div style="grid-column:1/-1">' +
      rowUrl("Image URL (optional)", o.image || "") +
      "</div>";
    var row = wrapRow(inner);
    host.appendChild(row);
    wireColorRow(row);
  }

  function readRows(containerSel, kind) {
    var host = document.querySelector(containerSel);
    if (!host) return [];
    var rows = host.querySelectorAll(".vpf-opt-row");
    var out = [];
    rows.forEach(function (row, idx) {
      if (kind === "color") {
        var labInp = row.querySelector("input.vpf-color-name") || row.querySelector("input.vpf-opt-inp");
        var pick = row.querySelector("input.vpf-color-pick");
        var urlInp = row.querySelector("input.vpf-opt-url");
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
        var labS = row.querySelector("input.vpf-opt-inp");
        var urlS = row.querySelector("input.vpf-opt-url");
        var prS = row.querySelector("input.vpf-sz-price");
        var mrS = row.querySelector("input.vpf-sz-mrp");
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
        var labQ = row.querySelector("input.vpf-opt-inp");
        var urlQ = row.querySelector("input.vpf-opt-url");
        var prQ = row.querySelector("input.vpf-qty-price");
        var mrQ = row.querySelector("input.vpf-qty-mrp");
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
    document.getElementById("vpfUseSize").checked = !!opt.useSize;
    document.getElementById("vpfUseQty").checked = !!opt.useQty;
    document.getElementById("vpfUseColor").checked = !!opt.useColor;
    document.getElementById("vpfHero").value = opt.heroImage || "";
    document.getElementById("vpfBadge").value = opt.badge || "";
    document.getElementById("vpfTrust").value = (opt.trustBullets || []).join("\n");
    var gg = document.getElementById("vpfGalleryImages");
    if (gg) gg.value = (opt.galleryImages || []).join("\n");
    var vi = opt.vendorInventory || {};
    var sq = document.getElementById("vpfStockQty");
    var sn = document.getElementById("vpfStockNote");
    if (sq) sq.value = vi.qtyOnHand != null && Number.isFinite(Number(vi.qtyOnHand)) ? String(vi.qtyOnHand) : "";
    if (sn) sn.value = vi.note || "";
    renderOptionBlocks();
    var sr = document.getElementById("vpfSizeRows");
    if (sr) sr.innerHTML = "";
    var qr = document.getElementById("vpfQtyRows");
    if (qr) qr.innerHTML = "";
    var cr = document.getElementById("vpfColorRows");
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
    var uS = document.getElementById("vpfUseSize").checked;
    var uQ = document.getElementById("vpfUseQty").checked;
    var uC = document.getElementById("vpfUseColor").checked;
    var sn = document.getElementById("vpfStockNote");
    var sq = document.getElementById("vpfStockQty");
    var qv = sq && sq.value.trim() !== "" ? Number(sq.value) : null;
    var trust = document
      .getElementById("vpfTrust")
      .value.split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var galEl = document.getElementById("vpfGalleryImages");
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
      badge: document.getElementById("vpfBadge").value.trim(),
      heroImage: document.getElementById("vpfHero").value.trim(),
      trustBullets: trust,
      sizes: uS ? readRows("#vpfSizeRows", "size") : [],
      qtyOptions: uQ ? readRows("#vpfQtyRows", "qty") : [],
      colors: uC ? readRows("#vpfColorRows", "color") : [],
      galleryImages: galleryImages,
      vendorInventory: {
        qtyOnHand: Number.isFinite(qv) && qv >= 0 ? Math.floor(qv) : null,
        note: sn ? sn.value.trim().slice(0, 500) : "",
      },
    };
    return o;
  }

  function resetForm() {
    document.getElementById("vpfEditingId").value = "";
    document.getElementById("vpfFormTitle").textContent = "Add photo frame product";
    document.getElementById("vpfSubmit").textContent = "Save product";
    document.getElementById("vpfCancelEdit").style.display = "none";
    document.getElementById("vpfForm").reset();
    var skuEl = document.getElementById("vpfSku");
    if (skuEl) skuEl.value = "";
    document.getElementById("vpfUseSize").checked = true;
    document.getElementById("vpfUseQty").checked = false;
    document.getElementById("vpfUseColor").checked = true;
    document.getElementById("vpfSizesBlock").innerHTML = "";
    document.getElementById("vpfQtyBlock").innerHTML = "";
    document.getElementById("vpfColorsBlock").innerHTML = "";
    renderOptionBlocks();
    setVendorFormCategories("", "");
    var sq0 = document.getElementById("vpfStockQty");
    var sn0 = document.getElementById("vpfStockNote");
    if (sq0) sq0.value = "";
    if (sn0) sn0.value = "";
  }

  function startEdit(id) {
    var m = null;
    for (var i = 0; i < rawList.length; i++) {
      if (rawList[i].id === id) m = rawList[i];
    }
    if (!m) return;
    document.getElementById("vpfEditingId").value = m.id;
    document.getElementById("vpfFormTitle").textContent = "Edit photo frame";
    document.getElementById("vpfSubmit").textContent = "Update product";
    document.getElementById("vpfCancelEdit").style.display = "inline-flex";
    document.getElementById("vpfName").value = m.name || "";
    var skuF = document.getElementById("vpfSku");
    if (skuF) skuF.value = m.sku != null ? String(m.sku) : "";
    document.getElementById("vpfDesc").value = m.description || "";
    document.getElementById("vpfNote").value = m.note || "";
    document.getElementById("vpfPrice").value = m.priceInr != null ? String(m.priceInr) : "0";
    document.getElementById("vpfMrp").value = m.mrpInr != null ? String(m.mrpInr) : "";
    document.getElementById("vpfImageUrl").value =
      m.image && (m.image.indexOf("http") === 0 || m.image.indexOf("//") === 0) ? m.image : "";
    fillEditorsFromOptions(m.options || {});
    setVendorFormCategories(m.baseCategorySlug || "", m.subcategorySlug || "");
    setVrmTab("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderRows(rows, searchQuery) {
    var tb = document.getElementById("vpfTbody");
    var empty = document.getElementById("vpfEmpty");
    var table = document.getElementById("vpfTable");
    if (!tb || !empty || !table) return;
    tb.innerHTML = "";
    rawList = rows || [];
    if (!rows || !rows.length) {
      empty.style.display = "block";
      empty.textContent = searchQuery ? "No products match your search." : "No products yet.";
      table.style.display = "none";
      return;
    }
    empty.style.display = "none";
    table.style.display = "";
    rows.forEach(function (r) {
      var active = r.isActive !== false;
      var tr = document.createElement("tr");
      tr.title = "Internal id: " + (r.id || "");
      tr.innerHTML =
        "<td>" +
        (r.image
          ? "<img src=\"" +
            esc(imgHref(r.image)) +
            "\" alt=\"\" width=\"56\" height=\"56\" style=\"object-fit:cover;border-radius:6px\" />"
          : "—") +
        "</td><td><strong>" +
        esc(r.name) +
        "</strong></td><td><span class=\"vs-muted\" style=\"font-size:0.82rem;font-weight:600\">" +
        esc(r.sku || "—") +
        "</span></td><td>" +
        esc(String(minOfferPrice(r))) +
        "</td><td>" +
        (active ? "<span class=\"vs-pill vs-pill--active\">Live</span>" : "<span class=\"vs-pill vs-pill--inactive\">Hidden</span>") +
        "</td><td><button type=\"button\" class=\"vs-btn vs-btn--ghost vpf-edit\" data-id=\"" +
        esc(r.id) +
        "\">Edit</button> " +
        "<button type=\"button\" class=\"vs-btn vs-btn--ghost vpf-toggle\" data-id=\"" +
        esc(r.id) +
        "\" data-next=\"" +
        (active ? "0" : "1") +
        "\">" +
        (active ? "Hide" : "Show") +
        "</button> " +
        "<button type=\"button\" class=\"vs-btn vs-btn--ghost vpf-delete\" data-id=\"" +
        esc(r.id) +
        "\" data-name=\"" +
        esc(r.name || "") +
        "\">Delete</button></td>";
      tb.appendChild(tr);
    });
  }

  function loadList() {
    showMsg("", false);
    var qEl = document.getElementById("vpfSearch");
    var q = qEl ? qEl.value.trim() : "";
    var fb = document.getElementById("vpfFilterBase");
    var fs = document.getElementById("vpfFilterSub");
    var ub = fb ? fb.value.trim() : "";
    var us = fs && !fs.disabled ? fs.value.trim() : "";
    var params = new URLSearchParams();
    if (q) params.set("q", q);
    if (ub) params.set("base", ub);
    if (us) params.set("sub", us);
    var qs = params.toString();
    var url = base() + "/api/vendor/photo-frame-products" + (qs ? "?" + qs : "");
    return fetch(url, { headers: V.authHeaders(), cache: "no-store" })
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
          renderRows(j.materials || [], q);
        });
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
      });
  }

  function setActive(id, on) {
    return fetch(base() + "/api/vendor/photo-frame-products/" + encodeURIComponent(id) + "/active", {
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
    return fetch(base() + "/api/vendor/photo-frame-products/" + encodeURIComponent(id), {
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
    ["vpfUseSize", "vpfUseQty", "vpfUseColor"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", renderOptionBlocks);
    });

    document.querySelectorAll(".vpf-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var w = btn.getAttribute("data-vpf-tab");
        if (w) setVrmTab(w);
      });
    });

    var addNew = document.getElementById("vpfAddNew");
    if (addNew) {
      addNew.addEventListener("click", function () {
        resetForm();
        setVrmTab("form");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    document.getElementById("vpfRefresh").addEventListener("click", function () {
      loadList().catch(function () {});
    });

    var vpfSearchTimer = null;
    function scheduleVrmSearchReload() {
      if (vpfSearchTimer) window.clearTimeout(vpfSearchTimer);
      vpfSearchTimer = window.setTimeout(function () {
        loadList().catch(function () {});
      }, 300);
    }
    var vpfSearchEl = document.getElementById("vpfSearch");
    if (vpfSearchEl) {
      vpfSearchEl.addEventListener("input", scheduleVrmSearchReload);
      vpfSearchEl.addEventListener("change", function () {
        loadList().catch(function () {});
      });
    }

    document.getElementById("vpfCancelEdit").addEventListener("click", function () {
      resetForm();
    });

    document.getElementById("vpfForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var editId = document.getElementById("vpfEditingId").value.trim();
      var skuVal = document.getElementById("vpfSku") ? document.getElementById("vpfSku").value.trim() : "";
      if (editId && !skuVal) {
        showMsg("SKU is required when editing an existing product.", true);
        return;
      }
      var bc = document.getElementById("vpfBaseCat");
      if (!editId && !(bc && bc.value)) {
        showMsg("Choose a base category (from Resin photo frame nav in Categories).", true);
        return;
      }
      var options = readOptionsFromForm();
      var file = document.getElementById("vpfImage").files && document.getElementById("vpfImage").files[0];
      var imageUrl = document.getElementById("vpfImageUrl").value.trim();
      showMsg("Saving…", false);

      if (file) {
        var fd = new FormData();
        fd.set("name", document.getElementById("vpfName").value.trim());
        fd.set("sku", skuVal);
        fd.set("description", document.getElementById("vpfDesc").value.trim());
        fd.set("note", document.getElementById("vpfNote").value.trim());
        fd.set("priceInr", document.getElementById("vpfPrice").value.trim());
        var mrpV = document.getElementById("vpfMrp").value.trim();
        if (mrpV) fd.set("mrpInr", mrpV);
        fd.set("options", JSON.stringify(options));
        if (imageUrl) fd.set("imageUrl", imageUrl);
        fd.set("baseCategorySlug", (bc && bc.value.trim()) || "");
        fd.set(
          "subcategorySlug",
          (document.getElementById("vpfSubCat") && document.getElementById("vpfSubCat").value) || ""
        );
        fd.set("image", file, file.name);
        var mu = editId
          ? base() + "/api/vendor/photo-frame-products/" + encodeURIComponent(editId)
          : base() + "/api/vendor/photo-frame-products";
        var mm = editId ? "PUT" : "POST";
        postMultipart(mm, mu, fd)
          .then(function () {
            document.getElementById("vpfImage").value = "";
            showMsg("Saved.", false);
            resetForm();
            return loadList();
          })
          .catch(function (e) {
            showMsg(String((e && e.message) || e), true);
          });
        return;
      }

      var sc = document.getElementById("vpfSubCat");
      var payload = {
        name: document.getElementById("vpfName").value.trim(),
        sku: skuVal,
        description: document.getElementById("vpfDesc").value.trim(),
        note: document.getElementById("vpfNote").value.trim(),
        priceInr: Number(document.getElementById("vpfPrice").value) || 0,
        mrpInr: document.getElementById("vpfMrp").value.trim() ? Number(document.getElementById("vpfMrp").value) : null,
        options: options,
        baseCategorySlug: (bc && bc.value.trim()) || "",
        subcategorySlug: sc && sc.value ? sc.value.trim() : "",
      };
      if (imageUrl) payload.imageUrl = imageUrl;

      var reqUrl = editId ? base() + "/api/vendor/photo-frame-products/" + encodeURIComponent(editId) : base() + "/api/vendor/photo-frame-products";
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

    document.getElementById("vpfTbody").addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest(".vpf-toggle") : null;
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
      var del = ev.target && ev.target.closest ? ev.target.closest(".vpf-delete") : null;
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
      var ed = ev.target && ev.target.closest ? ev.target.closest(".vpf-edit") : null;
      if (ed) {
        startEdit(ed.getAttribute("data-id"));
      }
    });

    fetchPfNavVendor()
      .then(function () {
        wireFilterToolbarFromTaxonomy();
        wireInventoryTab();
        var bc = document.getElementById("vpfBaseCat");
        var sc = document.getElementById("vpfSubCat");
        if (bc && sc) {
          populateBaseSelect(bc, "");
          if (!bc.dataset.rmFormCat) {
            bc.dataset.rmFormCat = "1";
            bc.addEventListener("change", function () {
              refillSubSelect(bc, sc, "");
            });
          }
          refillSubSelect(bc, sc, "");
        }
      })
      .catch(function () {})
      .then(function () {
        return loadList();
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
