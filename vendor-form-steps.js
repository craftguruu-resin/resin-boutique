(function () {
  "use strict";

  /* The API fields are unchanged; this is the shared, vendor-friendly path
     used for Resin Home, Raw Materials and Photo Frames. */
  var STEPS = ["Basics", "Size & Price", "Colour", "Media", "Publish"];

  function has(el, ids) {
    return ids.some(function (id) {
      return el.id === id || Boolean(el.querySelector && el.querySelector("#" + id));
    });
  }

  function stageFor(el, prefix) {
    if (has(el, [prefix + "Name", prefix + "Sku", prefix + "BaseCat", prefix + "SubCat", prefix + "Desc", prefix + "Note", prefix + "EditingId"])) return 0;
    if (has(el, [prefix + "Price", prefix + "Mrp", prefix + "StockQty", prefix + "StockNote", prefix + "UseSize", prefix + "UseQty", prefix + "SizesBlock", prefix + "QtyBlock"])) return 1;
    if (has(el, [prefix + "UseColor", prefix + "ColorsBlock", prefix + "CoverColorLabel", prefix + "CoverColorHex", prefix + "ExtraColors", prefix + "AddColor"])) return 2;
    if (has(el, [prefix + "Hero", prefix + "ImageUrl", prefix + "Image", prefix + "GalleryImages", prefix + "Gallery", prefix + "Badge", prefix + "Trust", prefix + "OptGallery"])) return 3;
    return 4;
  }

  function build(root, children, classify, afterChange) {
    if (!root || root.dataset.vendorStepsReady) return null;
    root.dataset.vendorStepsReady = "1";
    var wrap = document.createElement("div");
    wrap.className = "vendor-form-steps";
    var nav = document.createElement("div");
    nav.className = "vendor-form-steps__nav";
    nav.setAttribute("role", "tablist");
    var panels = STEPS.map(function (name, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "vendor-form-steps__tab";
      button.textContent = (index + 1) + ". " + name;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", index === 0 ? "true" : "false");
      nav.appendChild(button);
      var panel = document.createElement("section");
      panel.className = "vendor-form-steps__panel";
      panel.hidden = index !== 0;
      panel.setAttribute("aria-label", name);
      return { button: button, panel: panel };
    });
    wrap.appendChild(nav);
    panels.forEach(function (item) { wrap.appendChild(item.panel); });

    children.forEach(function (child) {
      panels[Math.max(0, Math.min(4, classify(child)))].panel.appendChild(child);
    });
    panels.forEach(function (item, index) {
      var actions = document.createElement("div");
      actions.className = "vendor-form-steps__actions";
      if (index) {
        var back = document.createElement("button");
        back.type = "button";
        back.className = "vs-btn vs-btn--ghost";
        back.textContent = "Back";
        back.addEventListener("click", function () { activate(index - 1); });
        actions.appendChild(back);
      }
      if (index < panels.length - 1) {
        var next = document.createElement("button");
        next.type = "button";
        next.className = "vs-btn";
        next.textContent = "Continue to " + STEPS[index + 1];
        next.addEventListener("click", function () { activate(index + 1); });
        actions.appendChild(next);
      }
      if (actions.children.length) item.panel.appendChild(actions);
      item.button.addEventListener("click", function () { activate(index); });
    });
    root.appendChild(wrap);

    function activate(index) {
      panels.forEach(function (item, i) {
        var selected = i === index;
        item.button.classList.toggle("is-active", selected);
        item.button.setAttribute("aria-selected", selected ? "true" : "false");
        item.panel.hidden = !selected;
      });
      if (afterChange) afterChange(index);
    }
    return { activate: activate, panels: panels };
  }

  function stageRawOrPhoto(form, prefix) {
    if (!form) return;
    splitRawOrPhotoControls(form, prefix);
    var flow = build(form, Array.prototype.slice.call(form.children), function (el) {
      return stageFor(el, prefix);
    });
    if (!flow) return;
    form.addEventListener("invalid", function (event) {
      var panel = event.target.closest && event.target.closest(".vendor-form-steps__panel");
      if (!panel) return;
      var index = flow.panels.findIndex(function (item) { return item.panel === panel; });
      if (index >= 0) flow.activate(index);
    }, true);
  }

  function controlLabel(root, id) {
    var input = root.querySelector("#" + id);
    return input && input.closest ? input.closest("label") : null;
  }

  /* The raw/frame forms once held all three option switches in one fieldset.
     Split that visual group before staging so Colour is genuinely its own
     third step without altering any existing form IDs or save handlers. */
  function splitRawOrPhotoControls(form, prefix) {
    if (form.dataset.vendorControlsSplit) return;
    var size = controlLabel(form, prefix + "UseSize");
    var qty = controlLabel(form, prefix + "UseQty");
    var colour = controlLabel(form, prefix + "UseColor");
    if (!size && !qty && !colour) return;
    form.dataset.vendorControlsSplit = "1";
    var fieldset = (size || qty || colour).closest("fieldset");
    if (!fieldset) return;
    var sizeGroup = document.createElement("div");
    sizeGroup.className = "vendor-form-staged-group";
    var colourGroup = document.createElement("div");
    colourGroup.className = "vendor-form-staged-group";
    [size, qty].forEach(function (label) { if (label) sizeGroup.appendChild(label); });
    if (colour) colourGroup.appendChild(colour);
    form.insertBefore(sizeGroup, fieldset);
    form.insertBefore(colourGroup, fieldset.nextSibling);
    fieldset.remove();
  }

  function stageHomeAdd() {
    var grid = document.querySelector("#vpmAddProductPanel .vs-grid");
    if (!grid) return;
    var flow = build(grid, Array.prototype.slice.call(grid.children), function (el) {
      if (has(el, ["viApCategory", "viApSubcategory", "viApName", "viApDescription"])) return 0;
      if (has(el, ["viApExtraSizes", "viApAddSize"])) return 1;
      if (has(el, ["viApCoverColorLabel", "viApCoverColorHex", "viApExtraColors", "viApAddColor"])) return 2;
      if (has(el, ["viApImageUrl", "viApImage", "viApGallery", "viApGalleryFiles"])) return 3;
      return 4;
    });
    if (!flow) return;
    var publish = document.getElementById("viApSubmit");
    if (publish) flow.panels[4].panel.insertBefore(publish, flow.panels[4].panel.querySelector(".vendor-form-steps__actions"));
  }

  function takeField(root, id) {
    var el = root.querySelector("#" + id);
    return el && el.closest ? el.closest(".vs-field") : null;
  }

  function stageHomeEditSections(card) {
    if (card.dataset.vendorEditSectionsReady) return;
    var advanced = card.querySelector(".vpm-adv");
    var mediaManager = card.querySelector("#vpmMediaManager");
    if (!advanced || !mediaManager) return;
    card.dataset.vendorEditSectionsReady = "1";
    var sizeGroup = document.createElement("div");
    sizeGroup.className = "vendor-form-staged-group";
    var colourGroup = document.createElement("div");
    colourGroup.className = "vendor-form-staged-group";
    var mediaGroup = document.createElement("div");
    mediaGroup.className = "vendor-form-staged-group";
    ["vpmUseSize", "vpmUseQty"].forEach(function (id) {
      var label = controlLabel(advanced, id);
      if (label) sizeGroup.appendChild(label);
    });
    ["vpmSizesBlock", "vpmQtyBlock"].forEach(function (id) {
      var block = advanced.querySelector("#" + id);
      if (block) sizeGroup.appendChild(block);
    });
    var useColour = controlLabel(advanced, "vpmUseColor");
    if (useColour) colourGroup.appendChild(useColour);
    var coverColour = mediaManager.querySelector("#vpmCoverColorBlock");
    if (coverColour) colourGroup.appendChild(coverColour);
    var colours = advanced.querySelector("#vpmColorsBlock");
    if (colours) colourGroup.appendChild(colours);
    ["vpmHero", "vpmBadge", "vpmTrust", "vpmOptGallery"].forEach(function (id) {
      var field = takeField(advanced, id);
      if (field) mediaGroup.appendChild(field);
    });
    card.insertBefore(sizeGroup, advanced);
    card.insertBefore(colourGroup, advanced);
    card.insertBefore(mediaGroup, advanced);
    advanced.remove();
  }

  function stageHomeEdit() {
    var card = document.getElementById("vpmEditCard");
    if (!card || card.dataset.vendorStepsReady) return;
    stageHomeEditSections(card);
    var children = Array.prototype.slice.call(card.children).filter(function (child) {
      return child.tagName !== "H2" && child.id !== "vpmCatalogNote" && !child.querySelector("#vpmEditId");
    });
    var flow = build(card, children, function (el) {
      if (has(el, ["vpmName", "vpmDescription"])) return 0;
      if (has(el, ["vpmPriceS", "vpmPriceM", "vpmPriceL", "vpmCostS", "vpmCostM", "vpmCostL", "vpmLblS", "vpmLblM", "vpmLblL", "vpmUseSize", "vpmUseQty", "vpmSizesBlock", "vpmQtyBlock"])) return 1;
      if (has(el, ["vpmUseColor", "vpmColorsBlock", "vpmCoverColorBlock"])) return 2;
      if (has(el, ["vpmMediaManager", "vpmHero", "vpmBadge", "vpmTrust", "vpmOptGallery"])) return 3;
      return 4;
    });
    if (flow) flow.activate(0);
  }

  function addDraftProtection(root, key) {
    if (!root || root.dataset.vendorDraftReady) return;
    root.dataset.vendorDraftReady = "1";
    var storageKey = "craftguruVendorDraft:" + key;
    var dirty = false;
    var timer = null;
    var saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch (_) { saved = null; }
    function controls() {
      return Array.prototype.slice.call(root.querySelectorAll("input, select, textarea")).filter(function (el) {
        return el.id && el.type !== "file" && el.type !== "hidden";
      });
    }
    function snapshot() {
      var out = {};
      controls().forEach(function (el) {
        out[el.id] = el.type === "checkbox" || el.type === "radio" ? Boolean(el.checked) : el.value;
      });
      return out;
    }
    function clear() {
      try { localStorage.removeItem(storageKey); } catch (_) {}
      dirty = false;
      var note = root.querySelector(".vendor-draft-note");
      if (note) note.remove();
    }
    function restore() {
      if (!saved || !saved.values) return;
      controls().forEach(function (el) {
        if (!Object.prototype.hasOwnProperty.call(saved.values, el.id)) return;
        if (el.type === "checkbox" || el.type === "radio") el.checked = Boolean(saved.values[el.id]);
        else el.value = saved.values[el.id];
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(save, 0);
    }
    function save() {
      if (!dirty) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ values: snapshot(), savedAt: Date.now() }));
        if (window.CraftguruVendor && window.CraftguruVendor.notify) {
          window.CraftguruVendor.notify("Draft saved on this device.", "info", { timeoutMs: 1800 });
        }
      } catch (_) {}
    }
    controls().forEach(function (el) {
      el.addEventListener("input", function () {
        dirty = true;
        clearTimeout(timer);
        timer = setTimeout(save, 700);
      });
      el.addEventListener("change", function () { dirty = true; });
    });
    if (saved && saved.values && Object.keys(saved.values).length) {
      var note = document.createElement("p");
      note.className = "vendor-draft-note vs-muted";
      note.innerHTML = "Saved local draft found. ";
      var restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.className = "vs-btn vs-btn--ghost";
      restoreButton.textContent = "Restore draft";
      restoreButton.addEventListener("click", function () { restore(); note.remove(); });
      var discard = document.createElement("button");
      discard.type = "button";
      discard.className = "vs-btn vs-btn--ghost";
      discard.textContent = "Discard";
      discard.addEventListener("click", clear);
      note.appendChild(restoreButton);
      note.appendChild(discard);
      root.insertBefore(note, root.firstChild);
    }
    window.addEventListener("beforeunload", function (event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "You have an unsaved product draft.";
    });
  }

  function boot() {
    stageRawOrPhoto(document.getElementById("vrmForm"), "vrm");
    stageRawOrPhoto(document.getElementById("vpfForm"), "vpf");
    stageHomeAdd();
    stageHomeEdit();
    addDraftProtection(document.getElementById("vrmForm"), "raw-material");
    addDraftProtection(document.getElementById("vpfForm"), "photo-frame");
    addDraftProtection(document.getElementById("vpmAddProductPanel"), "resin-home-add");
    addDraftProtection(document.getElementById("vpmEditCard"), "resin-home-edit");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
