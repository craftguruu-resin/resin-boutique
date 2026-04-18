/**
 * Shared cart drawer + badge — include after data.js + cart.js on subpages.
 */
(function () {
  "use strict";
  var CART = window.RESIN_CART;
  var D = window.RESIN_DATA;
  if (!CART) return;

  var drawerBindingsDone = false;

  function escapeHtml(s) {
    var el = document.createElement("div");
    el.textContent = s;
    return el.innerHTML;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  function imgUrl(rel) {
    return D && D.imageUrl ? D.imageUrl(rel) : rel;
  }

  function getLineImage(line) {
    if (line && line.image) return line.image;
    if (!D || !D.getProduct || !line || !line.id) return "";
    var p = D.getProduct(line.id);
    return p && p.image ? p.image : "";
  }

  function updateBadge() {
    var c = document.getElementById("cartCount");
    if (c) c.textContent = String(CART.countItems());
  }

  function renderDrawer() {
    var list = document.getElementById("cartList");
    var sub = document.getElementById("cartSubtotal");
    if (sub) sub.textContent = CART.formatMoney(CART.subtotal());
    if (!list) return;
    var lines = CART.load();
    if (lines.length === 0) {
      list.innerHTML = '<li class="cart-empty">Your cart is empty.</li>';
      return;
    }
    list.innerHTML = "";
    lines.forEach(function (line) {
      var sz = D && D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size;
      var imgRel = getLineImage(line);
      var li = document.createElement("li");
      li.className = "cart-item";
      var imgBlock = imgRel
        ? '<img src="' + escapeAttr(imgUrl(imgRel)) + '" alt="" width="56" height="56" />'
        : '<span class="cart-item__ph" aria-hidden="true"></span>';
      li.innerHTML =
        imgBlock +
        '<div class="cart-item-info"><strong>' +
        escapeHtml(line.name) +
        "</strong><span>" +
        escapeHtml(sz) +
        " · " +
        CART.formatMoney(line.price) +
        " ea</span></div>" +
        '<div class="cart-item__side">' +
        '<div class="cart-item-qty-wrap">' +
        '<button type="button" class="cart-item__qty cart-item__qty--minus" data-qty-delta="-1" data-line-id="' +
        escapeAttr(line.id) +
        '" data-line-size="' +
        escapeAttr(line.size) +
        '" aria-label="Decrease quantity">−</button>' +
        '<span class="cart-item-qty-num">' +
        line.qty +
        "</span>" +
        '<button type="button" class="cart-item__qty cart-item__qty--plus" data-qty-delta="1" data-line-id="' +
        escapeAttr(line.id) +
        '" data-line-size="' +
        escapeAttr(line.size) +
        '" aria-label="Increase quantity">+</button>' +
        "</div>" +
        '<button type="button" class="cart-item__remove" data-remove-id="' +
        escapeAttr(line.id) +
        '" data-remove-size="' +
        escapeAttr(line.size) +
        '" aria-label="Remove ' +
        escapeAttr(line.name || "item") +
        '">×</button>' +
        "</div>";
      list.appendChild(li);
    });
  }

  function closeDrawer() {
    var drawer = document.getElementById("cartDrawer");
    var backdrop = document.getElementById("cartBackdrop");
    if (!drawer || !backdrop) return;
    backdrop.classList.remove("is-open");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setTimeout(function () {
      if (!drawer.classList.contains("is-open")) backdrop.hidden = true;
    }, 300);
  }

  function openDrawer() {
    var drawer = document.getElementById("cartDrawer");
    var backdrop = document.getElementById("cartBackdrop");
    if (!drawer || !backdrop) return;
    renderDrawer();
    drawer.classList.add("is-open");
    backdrop.hidden = false;
    requestAnimationFrame(function () {
      backdrop.classList.add("is-open");
    });
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function bindDrawer() {
    if (drawerBindingsDone) return;
    var drawer = document.getElementById("cartDrawer");
    var backdrop = document.getElementById("cartBackdrop");
    var toggle = document.getElementById("cartToggle");
    var close = document.getElementById("cartClose");
    var checkout = document.getElementById("checkoutBtn");
    var list = document.getElementById("cartList");
    if (!drawer || !backdrop || !toggle) return;

    drawerBindingsDone = true;

    if (list && !list.dataset.removeBound) {
      list.dataset.removeBound = "1";
      list.addEventListener("click", function (e) {
        var rm = e.target && e.target.closest ? e.target.closest(".cart-item__remove") : null;
        if (rm) {
          e.preventDefault();
          e.stopPropagation();
          CART.removeLine(rm.getAttribute("data-remove-id"), rm.getAttribute("data-remove-size"));
          updateBadge();
          renderDrawer();
          return;
        }
        var q = e.target && e.target.closest ? e.target.closest(".cart-item__qty") : null;
        if (!q) return;
        e.preventDefault();
        e.stopPropagation();
        var id = q.getAttribute("data-line-id");
        var size = q.getAttribute("data-line-size");
        var d = parseInt(q.getAttribute("data-qty-delta") || "0", 10) || 0;
        CART.incrementLine(id, size, d);
        updateBadge();
        renderDrawer();
      });
    }

    toggle.addEventListener("click", function () {
      if (drawer.classList.contains("is-open")) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    if (close) {
      close.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          closeDrawer();
        },
        true
      );
    }

    backdrop.addEventListener("click", function () {
      closeDrawer();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.classList.contains("is-open")) closeDrawer();
    });

    if (checkout) {
      checkout.addEventListener("click", function () {
        if (CART.countItems() === 0) {
          alert("Your cart is empty.");
          return;
        }
        if (String(window.location.pathname || "").indexOf("checkout.html") !== -1) {
          closeDrawer();
          return;
        }
        closeDrawer();
        window.location.href = "checkout.html";
      });
    }
  }

  updateBadge();
  renderDrawer();
  bindDrawer();

  window.addEventListener("storage", function (e) {
    if (e.key === "resin_atelier_cart_v1") {
      updateBadge();
      renderDrawer();
    }
  });

  window.addEventListener("resinCartChanged", function () {
    updateBadge();
    renderDrawer();
  });

  window.RESIN_SHELL = {
    updateBadge: updateBadge,
    renderDrawer: renderDrawer,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
  };
})();
