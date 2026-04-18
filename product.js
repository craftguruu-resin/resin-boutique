(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART) return;

  var params = new URLSearchParams(window.location.search);
  var id = params.get("id");
  var product = id ? D.getProduct(id) : null;

  function refreshProductRef() {
    product = id ? D.getProduct(id) : null;
  }

  /** Size tiles render prices once; server overrides merge async (catalog-merge.js). */
  function offeredSizeKeys() {
    if (!product || !D.getOfferedSizeKeysForProduct) return ["s", "m", "l"];
    return D.getOfferedSizeKeysForProduct(product);
  }

  function refreshSizePickPrices() {
    if (!product || !els.sizes) return;
    offeredSizeKeys().forEach(function (key) {
      var btn = els.sizes.querySelector('.size-pick[data-size="' + key + '"]');
      if (!btn) return;
      var pr = btn.querySelector(".size-pick__price");
      if (!pr) return;
      var v = product.prices && product.prices[key];
      if (v == null || !Number.isFinite(Number(v))) return;
      pr.innerHTML = fmt(Number(v)) + ' <span class="currency-tag">MRP</span>';
    });
  }

  var els = {
    root: document.getElementById("productRoot"),
    addLabel: null,
    title: document.getElementById("productTitle"),
    catBadge: document.getElementById("productCategoryBadge"),
    crumbName: document.getElementById("crumbProductName"),
    flowStep: document.getElementById("flowStep"),
    img: document.getElementById("productImage"),
    price: document.getElementById("productPrice"),
    priceSizeLabel: document.getElementById("priceSizeLabel"),
    priceBreakdown: document.getElementById("priceBreakdown"),
    sizes: document.getElementById("sizeOptions"),
    qtyOptions: document.getElementById("qtyOptions"),
    qtyTierHint: document.getElementById("qtyTierHint"),
    hint: document.getElementById("sizeHint"),
    addBtn: document.getElementById("addToCartBtn"),
    addBtnTop: document.getElementById("addToCartTopBtn"),
    back: document.getElementById("backLink"),
    crumbSub: document.getElementById("productCrumbSub"),
    crumbSubBack: document.getElementById("crumbSubBack"),
    sizeDock: document.getElementById("sizeDock"),
    qtyDock: document.getElementById("qtyDock"),
    sizeScale: document.getElementById("sizeScale"),
    introText: document.getElementById("productIntroText"),
  };

  /** Snapshot before first paint: vendor pieces are merged async (catalog-merge.js). */
  var pendingLayoutHtml = id && !product && els.root ? els.root.innerHTML : "";
  var catalogWaitTimer = null;

  function clearCatalogWaitTimer() {
    if (catalogWaitTimer) {
      clearTimeout(catalogWaitTimer);
      catalogWaitTimer = null;
    }
  }

  function rewireProductEls() {
    els.addLabel = null;
    els.title = document.getElementById("productTitle");
    els.catBadge = document.getElementById("productCategoryBadge");
    els.crumbName = document.getElementById("crumbProductName");
    els.flowStep = document.getElementById("flowStep");
    els.img = document.getElementById("productImage");
    els.price = document.getElementById("productPrice");
    els.priceSizeLabel = document.getElementById("priceSizeLabel");
    els.priceBreakdown = document.getElementById("priceBreakdown");
    els.sizes = document.getElementById("sizeOptions");
    els.qtyOptions = document.getElementById("qtyOptions");
    els.qtyTierHint = document.getElementById("qtyTierHint");
    els.hint = document.getElementById("sizeHint");
    els.addBtn = document.getElementById("addToCartBtn");
    els.addBtnTop = document.getElementById("addToCartTopBtn");
    els.back = document.getElementById("backLink");
    els.crumbSub = document.getElementById("productCrumbSub");
    els.crumbSubBack = document.getElementById("crumbSubBack");
    els.sizeDock = document.getElementById("sizeDock");
    els.qtyDock = document.getElementById("qtyDock");
    els.sizeScale = document.getElementById("sizeScale");
    els.introText = document.getElementById("productIntroText");
  }

  function restoreProductLayout() {
    if (!pendingLayoutHtml || !els.root) return false;
    els.root.innerHTML = pendingLayoutHtml;
    rewireProductEls();
    return true;
  }

  function renderLoadingForCatalog() {
    if (!els.root) return;
    els.root.innerHTML =
      '<div class="product-missing product-page-awaiting-catalog">' +
      "<h1>Loading</h1>" +
      "<p>Fetching this piece from the catalog…</p>" +
      "</div>";
    clearCatalogWaitTimer();
    catalogWaitTimer = setTimeout(function () {
      catalogWaitTimer = null;
      refreshProductRef();
      if (!product && pendingLayoutHtml) {
        render404();
      }
    }, 12000);
  }

  function productLayoutInDocument() {
    return !!(els.sizes && document.body.contains(els.sizes));
  }

  function applyOutOfStockUi() {
    var oos = !!(product && product.outOfStock);
    var ban = document.getElementById("productOosBanner");
    if (ban) ban.hidden = !oos;
    document.body.classList.toggle("product-page--oos", oos);
    if (els.addBtn) {
      els.addBtn.disabled = oos;
      els.addBtn.setAttribute("aria-disabled", oos ? "true" : "false");
    }
    if (els.addBtnTop) {
      els.addBtnTop.disabled = oos;
      els.addBtnTop.setAttribute("aria-disabled", oos ? "true" : "false");
    }
    var qtyRoot = document.getElementById("qtyOptions");
    if (qtyRoot) {
      qtyRoot.querySelectorAll("button").forEach(function (b) {
        b.disabled = oos;
        b.setAttribute("aria-disabled", oos ? "true" : "false");
      });
    }
    if (els.sizes) {
      els.sizes.querySelectorAll(".size-pick").forEach(function (b) {
        b.disabled = oos;
        b.setAttribute("aria-disabled", oos ? "true" : "false");
      });
    }
  }

  function onCatalogPricesMerged() {
    refreshProductRef();
    clearCatalogWaitTimer();
    if (!product) {
      if (pendingLayoutHtml && els.root && els.root.querySelector(".product-page-awaiting-catalog")) {
        render404();
      }
      return;
    }
    if (!productLayoutInDocument()) {
      if (restoreProductLayout()) {
        render();
      }
      return;
    }
    refreshSizePickPrices();
    updatePrice();
    applyOutOfStockUi();
  }

  var selected = "m";
  var selectedQty = 1;

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  function fmt(n) {
    return CART.formatMoney(n);
  }

  function safeId(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function qtyDiscountMeta(q) {
    if (q <= 1) {
      return { mult: 1, hint: "1 piece — list price" };
    }
    if (q === 2) {
      return { mult: 0.9, hint: "2 pieces — 10% off each" };
    }
    return { mult: 0.8, hint: "3 pieces — 20% off each" };
  }

  function effectiveUnitPrice(base, q) {
    var m = qtyDiscountMeta(q).mult;
    return Math.round(base * m * 100) / 100;
  }

  /** Isometric resin “slab” — unique SVG defs per option (no gradient collisions). */
  function resinFigureHtml(uid) {
    return (
      '<div class="size-pick__figure">' +
      '<svg viewBox="0 0 100 78" class="size-pick__svg" aria-hidden="true">' +
      "<defs>" +
      '<linearGradient id="' +
      uid +
      '-T" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="#f6fbff"/>' +
      '<stop offset="40%" stop-color="#cfe6ff"/>' +
      '<stop offset="100%" stop-color="#6a9ef0"/>' +
      "</linearGradient>" +
      '<linearGradient id="' +
      uid +
      '-L" x1="0%" y1="0%" x2="0%" y2="100%">' +
      '<stop offset="0%" stop-color="#9bb8ec"/>' +
      '<stop offset="100%" stop-color="#3d5fa3"/>' +
      "</linearGradient>" +
      '<linearGradient id="' +
      uid +
      '-R" x1="0%" y1="0%" x2="100%" y2="0%">' +
      '<stop offset="0%" stop-color="#c9ddfb"/>' +
      '<stop offset="100%" stop-color="#7597e8"/>' +
      "</linearGradient>" +
      "</defs>" +
      '<g class="size-pick__iso">' +
      '<path fill="url(#' +
      uid +
      '-T)" d="M50 12 L88 32 L50 52 L12 32 Z"/>' +
      '<path fill="url(#' +
      uid +
      '-L)" d="M12 32 L50 52 L50 66 L12 46 Z"/>' +
      '<path fill="url(#' +
      uid +
      '-R)" d="M50 52 L88 32 L88 46 L50 66 Z"/>' +
      '<ellipse cx="50" cy="32" rx="20" ry="9" fill="rgba(255,255,255,0.42)"/>' +
      '<path d="M28 38 Q50 46 72 38" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>' +
      "</g>" +
      "</svg>" +
      "</div>"
    );
  }

  function render404() {
    document.body.classList.remove("product-page--oos");
    if (!els.root) return;
    els.root.innerHTML =
      '<div class="product-missing"><h1>Not found</h1><p>This piece is not in the catalog.</p><a class="btn-glass-dome" href="index.html">Back home</a></div>';
  }

  function renderQtyOptions() {
    if (!els.qtyOptions) return;
    els.qtyOptions.innerHTML = "";
    [1, 2, 3].forEach(function (q) {
      var meta = qtyDiscountMeta(q);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qty-pick" + (q === selectedQty ? " is-selected" : "");
      btn.dataset.qty = String(q);
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", q === selectedQty ? "true" : "false");
      var sub = q === 1 ? "List price" : q === 2 ? "10% off" : "20% off";
      btn.innerHTML =
        '<span class="qty-pick__n">' +
        String(q) +
        "</span>" +
        '<span class="qty-pick__lbl">' +
        escapeHtml(sub) +
        "</span>";
      btn.addEventListener("click", function () {
        selectedQty = q;
        els.qtyOptions.querySelectorAll(".qty-pick").forEach(function (b) {
          var n = parseInt(b.dataset.qty, 10) || 1;
          var on = n === selectedQty;
          b.classList.toggle("is-selected", on);
          b.setAttribute("aria-checked", on ? "true" : "false");
        });
        var m = qtyDiscountMeta(selectedQty);
        if (els.qtyTierHint) els.qtyTierHint.textContent = m.hint;
        updatePrice();
        if (els.qtyDock) {
          els.qtyDock.classList.remove("qty-dock--pulse");
          void els.qtyDock.offsetWidth;
          els.qtyDock.classList.add("qty-dock--pulse");
        }
      });
      els.qtyOptions.appendChild(btn);
    });
    var init = qtyDiscountMeta(selectedQty);
    if (els.qtyTierHint) els.qtyTierHint.textContent = init.hint;
  }

  function updatePrice() {
    if (!product || !els.price) return;
    var base = product.prices[selected];
    var q = selectedQty;
    var meta = qtyDiscountMeta(q);
    var eff = effectiveUnitPrice(base, q);
    var total = Math.round(eff * q * 100) / 100;
    var listTotal = Math.round(base * q * 100) / 100;

    els.price.textContent = fmt(total);
    if (els.priceBreakdown) {
      if (q === 1) {
        els.priceBreakdown.textContent = "1 × " + fmt(base) + " · list price";
      } else {
        els.priceBreakdown.innerHTML =
          String(q) +
          " × " +
          fmt(eff) +
          " ea · <span class=\"price-block__save\">" +
          (q === 2 ? "10% off" : "20% off") +
          "</span> · list would be " +
          fmt(listTotal);
      }
    }
    if (els.priceSizeLabel) {
      els.priceSizeLabel.textContent = D.getSizeLabelNameForProduct
        ? D.getSizeLabelNameForProduct(product, selected)
        : D.sizeLabels[selected]
          ? D.sizeLabels[selected].name
          : selected;
    }
    if (els.hint) {
      var pr = D.getSizeProfileForProduct
        ? D.getSizeProfileForProduct(product, product.category, selected)
        : D.getSizeProfile
          ? D.getSizeProfile(product.category, selected)
          : { dim: "", pour: "", viz: 1 };
      var labNm = D.getSizeLabelNameForProduct ? D.getSizeLabelNameForProduct(product, selected) : String(selected || "");
      var pourT = pr.pour ? String(pr.pour).trim() : "";
      if (pr.dim || pourT) {
        var sep = pr.dim && pourT ? '<span class="size-dock__hint-sep"> · </span>' : "";
        els.hint.innerHTML =
          (pr.dim ? "<strong>" + escapeHtml(pr.dim) + "</strong>" : "") +
          sep +
          (pourT ? escapeHtml(pourT) : "") +
          " — tap another tile to compare.";
      } else if (labNm) {
        els.hint.textContent = labNm + " — tap another tile to compare.";
      } else {
        els.hint.textContent = "Tap another tile to compare.";
      }
    }
    if (els.sizeScale) {
      els.sizeScale.setAttribute("data-sel", selected);
    }
    if (els.qtyTierHint) {
      els.qtyTierHint.textContent = meta.hint;
    }
  }

  function render() {
    if (!product) {
      render404();
      return;
    }

    document.title = product.name + " — Craft guru";

    var catLabel = D.getCategoryLabel(product.category);
    var baseUid = safeId(product.id);

    if (els.title) els.title.textContent = product.name;
    if (els.catBadge) els.catBadge.textContent = catLabel;
    if (els.crumbName) els.crumbName.textContent = product.name;
    if (els.flowStep) {
      els.flowStep.textContent = "Piece overview · " + catLabel;
    }
    if (els.introText) {
      els.introText.textContent =
        product.name +
        " sits in our " +
        catLabel +
        " line from the Jaipur bench. Choose quantity (bundles save 10–20%), pick a size, then add to cart. For four or more of the same piece, use Contact us for bulk pricing.";
    }

    if (els.img) {
      els.img.src = D.imageUrl ? D.imageUrl(product.image) : product.image;
      els.img.alt = product.name;
    }
    if (els.back) {
      els.back.href = "category.html?cat=" + encodeURIComponent(product.category);
      els.back.textContent = catLabel;
    }
    if (els.crumbSub && els.crumbSubBack) {
      els.crumbSub.hidden = true;
    }

    renderQtyOptions();

    var offered = offeredSizeKeys();
    if (offered.indexOf(selected) < 0) {
      selected = offered[0] || "m";
    }

    if (els.sizes) {
      els.sizes.innerHTML = "";
      offered.forEach(function (key) {
        var labName = D.getSizeLabelNameForProduct
          ? D.getSizeLabelNameForProduct(product, key)
          : D.sizeLabels[key]
            ? D.sizeLabels[key].name
            : key;
        var profile = D.getSizeProfileForProduct
          ? D.getSizeProfileForProduct(product, product.category, key)
          : D.getSizeProfile
            ? D.getSizeProfile(product.category, key)
            : { dim: "", pour: "", viz: 1 };
        var uid = baseUid + "-" + key;
        var pourLine = profile.pour ? String(profile.pour).trim() : "";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "size-pick" + (key === selected ? " is-selected" : "");
        btn.dataset.size = key;
        btn.style.setProperty("--viz", String(profile.viz != null ? profile.viz : 1));
        btn.setAttribute("role", "radio");
        btn.setAttribute("aria-checked", key === selected ? "true" : "false");
        btn.innerHTML =
          resinFigureHtml(uid) +
          '<span class="size-pick__badge">' +
          escapeHtml(labName) +
          "</span>" +
          '<span class="size-pick__dim">' +
          escapeHtml(profile.dim) +
          "</span>" +
          (pourLine ? '<span class="size-pick__pour">' + escapeHtml(pourLine) + "</span>" : "") +
          '<span class="size-pick__price">' +
          fmt(product.prices[key]) +
          ' <span class="currency-tag">MRP</span></span>';
        btn.addEventListener("click", function () {
          selected = key;
          els.sizes.querySelectorAll(".size-pick").forEach(function (b) {
            var on = b.dataset.size === selected;
            b.classList.toggle("is-selected", on);
            b.setAttribute("aria-checked", on ? "true" : "false");
          });
          updatePrice();
          if (els.sizeDock) {
            els.sizeDock.classList.remove("size-dock--pulse");
            void els.sizeDock.offsetWidth;
            els.sizeDock.classList.add("size-dock--pulse");
          }
        });
        els.sizes.appendChild(btn);
      });
    }

    if (els.sizeScale) {
      els.sizeScale.hidden = offered.length <= 1;
      els.sizeScale.querySelectorAll("[data-k]").forEach(function (sp) {
        var k = sp.getAttribute("data-k");
        if (k !== "s" && k !== "m" && k !== "l") return;
        if (offered.indexOf(k) < 0) {
          sp.style.display = "none";
          return;
        }
        sp.style.display = "";
        sp.textContent = D.getSizeLabelNameForProduct ? D.getSizeLabelNameForProduct(product, k) : sp.textContent;
      });
    }

    updatePrice();

    function pulseAddButtons() {
      [els.addBtn, els.addBtnTop].forEach(function (b) {
        if (!b) return;
        b.classList.remove("btn-add-lg--burst");
        void b.offsetWidth;
        b.classList.add("btn-add-lg--burst");
      });
    }

    function wireAddToCart(btn) {
      if (!btn || btn.dataset.cgAddBound) return;
      btn.dataset.cgAddBound = "1";
      btn.addEventListener("click", function () {
        if (product.outOfStock) return;
        var stk = product.stock && product.stock[selected];
        if (stk != null && Number.isFinite(Number(stk)) && Number(stk) < selectedQty) {
          window.alert("Only " + stk + " left in stock for this size. Lower the quantity or pick another size.");
          return;
        }
        var base = product.prices[selected];
        var q = selectedQty;
        var eff = effectiveUnitPrice(base, q);
        CART.addItem({
          id: product.id,
          size: selected,
          name: product.name,
          price: eff,
          image: product.image,
          qty: q,
        });
        if (window.RESIN_SHELL) {
          window.RESIN_SHELL.updateBadge();
          window.RESIN_SHELL.renderDrawer();
        }
        if (window.RESIN_SHELL && window.RESIN_SHELL.openDrawer) {
          window.RESIN_SHELL.openDrawer();
        } else {
          var t = document.getElementById("cartToggle");
          if (t) t.click();
        }
        [els.addBtn, els.addBtnTop].forEach(function (b) {
          if (!b) return;
          var lab = b.querySelector(".btn-add-premium__text");
          if (lab) lab.textContent = "Added ✓";
          b.classList.add("btn-add-lg--success");
          b.classList.remove("btn-add-lg--burst");
        });
        pulseAddButtons();
        setTimeout(function () {
          [els.addBtn, els.addBtnTop].forEach(function (b) {
            if (!b) return;
            var lab = b.querySelector(".btn-add-premium__text");
            if (lab) lab.textContent = "Add to cart";
            b.classList.remove("btn-add-lg--success");
          });
        }, 1600);
      });
    }

    if (els.addBtn) {
      els.addLabel = els.addBtn.querySelector(".btn-add-premium__text");
    }
    wireAddToCart(els.addBtn);
    wireAddToCart(els.addBtnTop);

    applyOutOfStockUi();
  }

  var gfIn = document.getElementById("globalFindQuery");
  if (gfIn) {
    gfIn.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || !product) return;
      var v = gfIn.value.trim();
      if (!v) return;
      e.preventDefault();
      window.location.href =
        "category.html?cat=" +
        encodeURIComponent(product.category) +
        "&q=" +
        encodeURIComponent(v);
    });
  }

  function initialRender() {
    if (!id) {
      render404();
      return;
    }
    if (product) {
      render();
      return;
    }
    if (pendingLayoutHtml) {
      renderLoadingForCatalog();
      return;
    }
    render404();
  }

  window.addEventListener("craftguruCatalogPricesMerged", onCatalogPricesMerged);

  /** BFCache restore: URL id can change while JS state was frozen — reload to avoid wrong product. */
  window.addEventListener("pageshow", function (ev) {
    if (!ev.persisted) return;
    try {
      var nextId = new URLSearchParams(window.location.search).get("id");
      if (nextId !== id) {
        window.location.reload();
      }
    } catch (_) {
      window.location.reload();
    }
  });

  initialRender();
})();
