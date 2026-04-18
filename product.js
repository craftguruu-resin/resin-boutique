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

  /** Default cart size: lowest MRP among offered keys; ties prefer s → m → l. */
  function pickDefaultSizeKey(p, keys) {
    if (!keys || !keys.length) return "m";
    if (!p || !p.prices) return keys[0];
    var order = { s: 0, m: 1, l: 2 };
    var best = keys[0];
    var bestP = Number(p.prices[best]);
    for (var i = 1; i < keys.length; i++) {
      var k = keys[i];
      var pr = Number(p.prices[k]);
      if (!Number.isFinite(pr)) continue;
      if (!Number.isFinite(bestP) || pr < bestP) {
        best = k;
        bestP = pr;
      } else if (pr === bestP) {
        var ok = order[k] != null ? order[k] : 99;
        var ob = order[best] != null ? order[best] : 99;
        if (ok < ob) best = k;
      }
    }
    return best;
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
    qtyTierHint: document.getElementById("qtyTierHint"),
    addBtn: document.getElementById("addToCartBtn"),
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
    els.qtyTierHint = document.getElementById("qtyTierHint");
    els.addBtn = document.getElementById("addToCartBtn");
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
    var ban = document.getElementById("productOosBanner");
    if (ban) ban.hidden = true;
    document.body.classList.remove("product-page--oos");
    if (els.addBtn) {
      els.addBtn.disabled = false;
      els.addBtn.setAttribute("aria-disabled", "false");
    }
    if (els.sizes) {
      els.sizes.querySelectorAll(".size-pick").forEach(function (b) {
        b.disabled = false;
        b.setAttribute("aria-disabled", "false");
      });
    }
    var qm = document.getElementById("productQtyMinus");
    var qp = document.getElementById("productQtyPlus");
    if (qm) {
      qm.disabled = selectedQty <= 1;
    }
    if (qp) {
      qp.disabled = selectedQty >= maxSelectableQty();
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
    render();
  }

  var selected = "";
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

  function maxSelectableQty() {
    if (!product || !selected) return 99;
    var stk = product.stock && product.stock[selected];
    if (stk != null && Number.isFinite(Number(stk))) {
      return Math.max(1, Math.min(99, Math.floor(Number(stk))));
    }
    return 99;
  }

  function refreshQtyUi() {
    if (!product) return;
    var mx = maxSelectableQty();
    selectedQty = Math.max(1, Math.min(mx, Math.floor(Number(selectedQty) || 1)));
    var v = document.getElementById("productQtyStepperVal");
    var m = document.getElementById("productQtyMinus");
    var p = document.getElementById("productQtyPlus");
    if (v) v.textContent = String(selectedQty);
    if (m) m.disabled = selectedQty <= 1;
    if (p) p.disabled = selectedQty >= mx;
    updatePrice();
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

  function updatePrice() {
    if (!product || !els.price) return;
    var base = product.prices[selected];
    var q = selectedQty;
    var unit = Math.round(Number(base) * 100) / 100;
    var total = Math.round(unit * q * 100) / 100;

    els.price.textContent = fmt(total);
    if (els.priceBreakdown) {
      if (q === 1) {
        els.priceBreakdown.textContent = "1 × " + fmt(unit) + " · MRP per piece";
      } else {
        els.priceBreakdown.textContent = String(q) + " × " + fmt(unit) + " each · same MRP per piece";
      }
    }
    if (els.priceSizeLabel) {
      els.priceSizeLabel.textContent = D.getSizeLabelNameForProduct
        ? D.getSizeLabelNameForProduct(product, selected)
        : D.sizeLabels[selected]
          ? D.sizeLabels[selected].name
          : selected;
    }
    if (els.sizeScale) {
      els.sizeScale.setAttribute("data-sel", selected);
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
        " line from the Jaipur bench. We start with the smallest-priced format; change size below, set quantity, then add to cart — same MRP per unit for each format.";
    }

    var rgb = document.getElementById("productReturnGiftBadge");
    if (rgb) {
      rgb.hidden = !product.returnGift;
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

    var offered = offeredSizeKeys();
    if (!selected || offered.indexOf(selected) < 0) {
      selected = pickDefaultSizeKey(product, offered);
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
          refreshQtyUi();
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

    refreshQtyUi();

    function pulseAddButtons() {
      if (!els.addBtn) return;
      els.addBtn.classList.remove("btn-add-lg--burst");
      void els.addBtn.offsetWidth;
      els.addBtn.classList.add("btn-add-lg--burst");
    }

    function wireAddToCart(btn) {
      if (!btn || btn.dataset.cgAddBound) return;
      btn.dataset.cgAddBound = "1";
      btn.addEventListener("click", function () {
        var stk = product.stock && product.stock[selected];
        if (stk != null && Number.isFinite(Number(stk)) && Number(stk) < selectedQty) {
          window.alert("Only " + stk + " left in stock for this size. Lower the quantity or pick another size.");
          return;
        }
        var base = product.prices[selected];
        var q = selectedQty;
        var unit = Math.round(Number(base) * 100) / 100;
        CART.addItem({
          id: product.id,
          size: selected,
          name: product.name,
          price: unit,
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
        if (els.addBtn) {
          var lab = els.addBtn.querySelector(".btn-add-premium__text");
          if (lab) lab.textContent = "Added ✓";
          els.addBtn.classList.add("btn-add-lg--success");
          els.addBtn.classList.remove("btn-add-lg--burst");
        }
        pulseAddButtons();
        setTimeout(function () {
          if (!els.addBtn) return;
          var lab2 = els.addBtn.querySelector(".btn-add-premium__text");
          if (lab2) lab2.textContent = "Add to cart";
          els.addBtn.classList.remove("btn-add-lg--success");
        }, 1600);
      });
    }

    if (els.addBtn) {
      els.addLabel = els.addBtn.querySelector(".btn-add-premium__text");
    }
    wireAddToCart(els.addBtn);

    applyOutOfStockUi();

    var sh = document.getElementById("productShareHost");
    if (sh && window.CRAFTGURU_SHARE && window.CRAFTGURU_SHARE.mountProductShare) {
      window.CRAFTGURU_SHARE.mountProductShare(sh, { id: product.id, name: product.name });
    }

    bindProductImageZoom();
  }

  function productPagePrefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  function bindProductImageZoom() {
    var host = document.getElementById("productZoomHost");
    var img = document.getElementById("productImage");
    if (!host || !img) return;
    if (host.dataset.cgZoomBound === "1") return;
    host.dataset.cgZoomBound = "1";

    if (productPagePrefersReducedMotion()) {
      return;
    }

    var scale = 1;
    var panX = 0;
    var panY = 0;
    var minScale = 1;
    var maxScale = 3.5;
    var drag = null;

    function applyTransform() {
      img.style.transformOrigin = "center center";
      img.style.transform = "translate3d(" + panX + "px," + panY + "px,0) scale(" + scale + ")";
    }

    function clampPan() {
      var r = host.getBoundingClientRect();
      var w = r.width;
      var h = r.height;
      if (w < 1 || h < 1) return;
      var margin = Math.max(w, h) * 0.35 * (scale - 1);
      var maxX = margin + w * 0.15;
      var maxY = margin + h * 0.15;
      panX = Math.max(-maxX, Math.min(maxX, panX));
      panY = Math.max(-maxY, Math.min(maxY, panY));
    }

    function resetView() {
      scale = 1;
      panX = 0;
      panY = 0;
      host.classList.remove("product-hero-img--is-zoomed", "product-hero-img--is-panning");
      applyTransform();
    }

    function onWheel(e) {
      if (!img.naturalWidth) return;
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 14;
      else if (e.deltaMode === 2) dy *= host.clientHeight || 480;
      var factor = 1 - dy * 0.00135;
      if (factor < 0.88) factor = 0.88;
      if (factor > 1.12) factor = 1.12;
      var next = scale * factor;
      if (next < minScale + 0.02) {
        resetView();
        e.preventDefault();
        return;
      }
      next = Math.min(maxScale, Math.max(minScale, next));
      e.preventDefault();
      scale = next;
      if (scale <= minScale + 0.001) {
        resetView();
        return;
      }
      clampPan();
      host.classList.add("product-hero-img--is-zoomed");
      applyTransform();
    }

    function onDown(e) {
      if (scale <= 1.02) return;
      if (e.button !== 0) return;
      drag = { sx: e.clientX, sy: e.clientY, ox: panX, oy: panY };
      host.classList.add("product-hero-img--is-panning");
    }

    function onUp() {
      if (drag) {
        drag = null;
        host.classList.remove("product-hero-img--is-panning");
      }
    }

    function onMove(e) {
      if (!drag) return;
      panX = drag.ox + (e.clientX - drag.sx);
      panY = drag.oy + (e.clientY - drag.sy);
      clampPan();
      applyTransform();
    }

    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    host.addEventListener("dblclick", function (ev) {
      if (ev.target === img || host.contains(ev.target)) resetView();
    });
    img.addEventListener("load", function () {
      resetView();
    });

    applyTransform();
  }

  var productRootEl = document.getElementById("productRoot");
  if (productRootEl && !productRootEl.dataset.cgQtyStep) {
    productRootEl.dataset.cgQtyStep = "1";
    productRootEl.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !product) return;
      if (t.id === "productQtyMinus") {
        e.preventDefault();
        selectedQty -= 1;
        refreshQtyUi();
      } else if (t.id === "productQtyPlus") {
        e.preventDefault();
        selectedQty += 1;
        refreshQtyUi();
      }
    });
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
