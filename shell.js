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

  function patchCartSubtotal() {
    var sub = document.getElementById("cartSubtotal");
    if (sub) sub.textContent = CART.formatMoney(CART.subtotal());
  }

  function findCartLine(id, size, ex) {
    var lines = CART.load();
    var sid = String(id || "");
    var ss = String(size || "");
    var xk = ex == null || ex === "" ? "" : String(ex);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (
        l.id === sid &&
        l.size === ss &&
        (CART.lineExtraKey ? CART.lineExtraKey(l.lineExtra) : "") === xk
      ) {
        return l;
      }
    }
    return null;
  }

  function patchCartLineFromButton(qBtn) {
    var id = qBtn.getAttribute("data-line-id");
    var size = qBtn.getAttribute("data-line-size");
    var xk = qBtn.getAttribute("data-line-extrak");
    var line = findCartLine(id, size, xk);
    var li = qBtn.closest ? qBtn.closest(".cart-item") : null;
    if (!line || !li) return false;
    var num = li.querySelector(".cart-item-qty-num");
    if (num) num.textContent = String(line.qty);
    var span = li.querySelector(".cart-item-info span");
    if (span) {
      var sz =
        (line.variantLabel && String(line.variantLabel).trim()) ||
        (D && D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size);
      span.textContent =
        String(sz || "") +
        " · Qty " +
        line.qty +
        " · " +
        CART.formatMoney(line.price) +
        " each";
    }
    patchCartSubtotal();
    return true;
  }

  function renderDrawer() {
    var list = document.getElementById("cartList");
    patchCartSubtotal();
    if (!list) return;
    var lines = CART.load();
    if (lines.length === 0) {
      list.innerHTML = '<li class="cart-empty">Your cart is empty.</li>';
      return;
    }
    list.innerHTML = "";
    lines.forEach(function (line) {
      var sz =
        (line.variantLabel && String(line.variantLabel).trim()) ||
        (D && D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size);
      var imgRel = getLineImage(line);
      var li = document.createElement("li");
      li.className = "cart-item";
      li.setAttribute(
        "data-cart-key",
        String(line.id || "") +
          "::" +
          String(line.size || "") +
          "::" +
          (CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "")
      );
      var imgBlock = imgRel
        ? '<img src="' + escapeAttr(imgUrl(imgRel)) + '" alt="" width="56" height="56" />'
        : '<span class="cart-item__ph" aria-hidden="true"></span>';
      li.innerHTML =
        imgBlock +
        '<div class="cart-item-info"><strong>' +
        escapeHtml(line.name) +
        "</strong><span>" +
        escapeHtml(String(sz || "")) +
        " · Qty " +
        line.qty +
        " · " +
        CART.formatMoney(line.price) +
        " each</span></div>" +
        '<div class="cart-item__side">' +
        '<div class="cart-item-qty-wrap">' +
        '<button type="button" class="cart-item__qty cart-item__qty--minus" data-qty-delta="-1" data-line-id="' +
        escapeAttr(line.id) +
        '" data-line-size="' +
        escapeAttr(line.size) +
        '" data-line-extrak="' +
        escapeAttr(CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "") +
        '" aria-label="Decrease quantity">−</button>' +
        '<span class="cart-item-qty-num">' +
        line.qty +
        "</span>" +
        '<button type="button" class="cart-item__qty cart-item__qty--plus" data-qty-delta="1" data-line-id="' +
        escapeAttr(line.id) +
        '" data-line-size="' +
        escapeAttr(line.size) +
        '" data-line-extrak="' +
        escapeAttr(CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "") +
        '" aria-label="Increase quantity">+</button>' +
        "</div>" +
        '<button type="button" class="cart-item__remove" data-remove-id="' +
        escapeAttr(line.id) +
        '" data-remove-size="' +
        escapeAttr(line.size) +
        '" data-remove-extrak="' +
        escapeAttr(CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "") +
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
          CART.removeLine(
            rm.getAttribute("data-remove-id"),
            rm.getAttribute("data-remove-size"),
            rm.getAttribute("data-remove-extrak")
          );
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
        var xk = q.getAttribute("data-line-extrak");
        var d = parseInt(q.getAttribute("data-qty-delta") || "0", 10) || 0;
        CART.incrementLine(id, size, d, xk);
        updateBadge();
        if (!patchCartLineFromButton(q)) renderDrawer();
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

  function onCartChanged() {
    updateBadge();
    var drawer = document.getElementById("cartDrawer");
    if (!drawer || !drawer.classList.contains("is-open")) return;
    var list = document.getElementById("cartList");
    var lines = CART.load();
    if (!list) return;
    if (!lines.length) {
      renderDrawer();
      return;
    }
    var items = list.querySelectorAll(".cart-item");
    if (items.length !== lines.length) {
      renderDrawer();
      return;
    }
    var ok = true;
    lines.forEach(function (line) {
      var key =
        String(line.id || "") +
        "::" +
        String(line.size || "") +
        "::" +
        (CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "");
      var li = null;
      items.forEach(function (el) {
        if (el.getAttribute("data-cart-key") === key) li = el;
      });
      if (!li) {
        ok = false;
        return;
      }
      var num = li.querySelector(".cart-item-qty-num");
      if (num) num.textContent = String(line.qty);
    });
    if (!ok) renderDrawer();
    else patchCartSubtotal();
  }

  window.addEventListener("resinCartChanged", onCartChanged);

  window.RESIN_SHELL = {
    updateBadge: updateBadge,
    renderDrawer: renderDrawer,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
  };
})();
