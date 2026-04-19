(function () {
  "use strict";

  var GUEST_TOKEN_KEY = "craftguruGuestToken";
  var SESSION_EMAIL_KEY = "cg_session_email";
  var pendingHighlightOrderId = "";
  var ordersCache = [];
  var activeOrderTab = "current";
  var activeAcctSection = "orders";

  function billIsStaticDevPage() {
    try {
      var loc = window.location;
      if (!loc || loc.protocol === "file:") return true;
      var port = String(loc.port || (loc.protocol === "https:" ? "443" : "80"));
      var dev = { 5500: 1, 5501: 1, 5173: 1, 5174: 1, 3000: 1, 3001: 1, 8080: 1, 8888: 1, 4173: 1 };
      if (dev[port]) return true;
      var h = String(loc.hostname || "").toLowerCase();
      if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
    } catch (_) {}
    return false;
  }

  function billApiPortOverride() {
    try {
      var v = document.documentElement.getAttribute("data-bill-api-port");
      if (v != null && String(v).trim()) {
        var n = parseInt(String(v).trim(), 10);
        if (Number.isFinite(n) && n > 0 && n < 65536) return String(n);
      }
    } catch (_) {}
    try {
      var ls = localStorage.getItem("craftguruBillApiPort");
      if (ls != null && String(ls).trim()) {
        var n2 = parseInt(String(ls).trim(), 10);
        if (Number.isFinite(n2) && n2 > 0 && n2 < 65536) return String(n2);
      }
    } catch (_) {}
    return "";
  }

  function billIsPrivateLanHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(h)) return false;
    var p = h.split(".").map(function (x) {
      return Number(x);
    });
    if (p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    return false;
  }

  function billApiBase() {
    try {
      var v = document.documentElement.getAttribute("data-bill-api-base");
      if (v != null) {
        var t = String(v).trim().replace(/\/+$/, "");
        /* Empty = same origin when deployed (HTTPS / real host). On Live Server / Vite, fall through to :3847. */
        if (t.length === 0 && window.location && window.location.protocol !== "file:" && !billIsStaticDevPage()) {
          return String(window.location.origin).replace(/\/+$/, "");
        }
        if (t.length) {
          try {
            if (window.location && window.location.protocol !== "file:") {
              var ph = String(window.location.hostname || "").toLowerCase();
              var tl = t.toLowerCase();
              var cfgLocal = tl.indexOf("127.0.0.1") >= 0 || tl.indexOf("localhost") >= 0;
              var loop = ph === "localhost" || ph === "127.0.0.1" || ph === "[::1]";
              if (cfgLocal && !loop && !billIsPrivateLanHost(ph)) {
                t = "";
              }
            }
          } catch (_) {}
          if (t.length) return t;
        }
      }
    } catch (_) {}
    var po = billApiPortOverride() || "3847";
    try {
      if (window.location && window.location.protocol !== "file:") {
        var loc = window.location;
        var port = String(loc.port || (loc.protocol === "https:" ? "443" : "80"));
        if (port !== po && (loc.hostname === "localhost" || loc.hostname === "127.0.0.1")) {
          return "http://127.0.0.1:" + po;
        }
        return String(loc.origin).replace(/\/+$/, "");
      }
    } catch (_) {}
    return "http://127.0.0.1:" + (billApiPortOverride() || "3847");
  }

  function billApiSecret() {
    try {
      var v = document.documentElement.getAttribute("data-bill-api-secret");
      return v ? String(v).trim() : "";
    } catch (_) {
      return "";
    }
  }

  function guestAuthHeaders() {
    var h = { "Content-Type": "application/json" };
    var sec = billApiSecret();
    if (sec) {
      h["x-bill-api-secret"] = sec;
    }
    try {
      var t = localStorage.getItem(GUEST_TOKEN_KEY);
      if (t) {
        h.Authorization = "Bearer " + t;
      }
    } catch (_) {}
    return h;
  }

  function parseApiJson(res) {
    return res.text().then(function (text) {
      var trimmed = String(text || "").trim();
      if (trimmed.charAt(0) === "<") {
        throw new Error("Server returned HTML instead of JSON. Set data-bill-api-base on this page to your API URL.");
      }
      var j = {};
      if (trimmed) {
        try {
          j = JSON.parse(trimmed);
        } catch (e) {
          throw new Error("Invalid JSON from server");
        }
      }
      return { okHttp: res.ok, json: j };
    });
  }

  function normalizeEmail(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase();
  }

  function setSessionEmail(em) {
    try {
      if (em) localStorage.setItem(SESSION_EMAIL_KEY, em);
      else localStorage.removeItem(SESSION_EMAIL_KEY);
    } catch (_) {}
  }

  function postJson(url, body, cb) {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var json = null;
          if (text) {
            try {
              json = JSON.parse(text);
            } catch (_) {}
          }
          if (!res.ok) {
            var errMsg = (json && (json.error || json.message)) || res.statusText || "Request failed";
            var err = new Error(errMsg);
            if (json && json.code) err.code = json.code;
            err.status = res.status;
            cb(err, null);
            return;
          }
          cb(null, json);
        });
      })
      .catch(function (err) {
        cb(err && err.message ? err : new Error("Network error"), null);
      });
  }

  function setMsg(el, text, tone) {
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.classList.toggle("auth-msg--ok", tone === "ok");
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  function fmtMoney(n) {
    var x = Number(n) || 0;
    if (window.RESIN_CART && typeof window.RESIN_CART.formatMoney === "function") {
      return window.RESIN_CART.formatMoney(x);
    }
    return "₹" + String(Math.round(x));
  }

  /** Resolve thumbnail: stored line image, else catalog by productId. */
  function lineImageSrc(it) {
    var raw = String((it && it.image) || "").trim();
    if (raw) {
      if (/^https?:\/\//i.test(raw) || raw.charAt(0) === "/") return raw;
      var D0 = window.RESIN_DATA;
      if (D0 && typeof D0.imageUrl === "function") return D0.imageUrl(raw);
      return raw;
    }
    var pid = String((it && it.productId) || "").trim();
    var D = window.RESIN_DATA;
    if (D && typeof D.getProduct === "function" && pid) {
      var p = D.getProduct(pid);
      if (p && p.image && D.imageUrl) return D.imageUrl(p.image);
      if (p && p.image) return p.image;
    }
    return "";
  }

  function buildOrderBillHtml(o) {
    function totalRow(label, val) {
      return (
        '<div class="account-order-bill__totalrow"><span>' +
        escapeHtml(label) +
        '</span><span>' +
        escapeHtml(fmtMoney(val)) +
        "</span></div>"
      );
    }

    var canCancel = o.paymentStatus === "pending_payment" && o.fulfillmentStatus === "new";
    var stLabel = fulfillmentDisplay(o.fulfillmentStatus);
    var stClass = fulfillmentStatusClass(o.fulfillmentStatus);
    var g = o.guest && typeof o.guest === "object" ? o.guest : {};
    var T = o.totals && typeof o.totals === "object" ? o.totals : {};
    var items = Array.isArray(o.items) ? o.items : [];
    var shipLines = [];
    if (g.name) shipLines.push(escapeHtml(String(g.name).trim()));
    var addrMid = [g.addrLine1, g.addrLine2]
      .map(function (x) {
        return String(x || "").trim();
      })
      .filter(Boolean)
      .join(", ");
    if (addrMid) shipLines.push(escapeHtml(addrMid));
    var cityLine = [g.city, g.state, g.zip]
      .map(function (x) {
        return String(x || "").trim();
      })
      .filter(Boolean)
      .join(", ");
    if (cityLine) shipLines.push(escapeHtml(cityLine));
    if (g.country && String(g.country).trim()) shipLines.push(escapeHtml(String(g.country).trim()));

    var shipToBlock = shipLines.length
      ? shipLines.join('<span class="account-order-card__ship-sep"> · </span>')
      : "—";

    var fs = String(o.fulfillmentStatus || "").toLowerCase();
    var deliveryLine =
      fs === "delivered"
        ? formatLongDate(o.createdAt)
        : fs === "cancelled"
          ? "—"
          : "Not delivered yet";

    var linesHtml = "";
    if (!items.length) {
      linesHtml = '<p class="account-order-bill__empty">No line items on file for this order.</p>';
    } else {
      items.forEach(function (it) {
        var src = lineImageSrc(it);
        var lineTot = (Number(it.unitPrice) || 0) * (Number(it.qty) || 0);
        var meta = [];
        if (it.sizeLabel) meta.push(String(it.sizeLabel));
        meta.push(String(Number(it.qty) || 0) + "× @ " + fmtMoney(it.unitPrice));
        if (it.sku) meta.push("SKU " + String(it.sku));
        var imgCell = src
          ? '<div class="account-order-line__img"><img src="' +
            escapeAttr(src) +
            '" alt="" loading="lazy" decoding="async" /></div>'
          : '<div class="account-order-line__img account-order-line__img--empty" aria-hidden="true"></div>';
        linesHtml +=
          '<div class="account-order-line">' +
          imgCell +
          '<div class="account-order-line__main">' +
          '<div class="account-order-line__name">' +
          escapeHtml(String(it.name || "Item")) +
          "</div>" +
          '<div class="account-order-line__sub">' +
          escapeHtml(meta.join(" · ")) +
          "</div>" +
          "</div>" +
          '<div class="account-order-line__amt">' +
          escapeHtml(fmtMoney(lineTot)) +
          "</div>" +
          "</div>";
      });
    }

    var typeBit =
      o.orderType && String(o.orderType).trim()
        ? '<span class="account-order-bill__type">' + escapeHtml(String(o.orderType).trim()) + "</span>"
        : "";

    var grand =
      T.total != null && Number.isFinite(Number(T.total))
        ? Number(T.total)
        : Number(o.total) || 0;

    var summaryBits = [];
    summaryBits.push(items.length + " product" + (items.length === 1 ? "" : "s"));
    if (g.name && String(g.name).trim()) summaryBits.push(String(g.name).trim());
    summaryBits.push(formatLongDate(o.createdAt));

    var showDl = o.paymentStatus === "paid" && items.length > 0;
    var actionsHtml = "";
    if (showDl) {
      actionsHtml +=
        '<button type="button" class="account-order-card__dl checkout-submit account-order-dl-bill" data-dl-bill-order="' +
        escapeAttr(String(o.orderId)) +
        '"><span class="account-order-card__dl-icon" aria-hidden="true">↓</span> Download invoice</button>';
    }
    if (canCancel) {
      actionsHtml +=
        '<button type="button" class="account-order-card__cancel checkout-pay-secondary account-order-cancel" data-cancel-id="' +
        escapeAttr(String(o.orderId)) +
        '">Cancel order</button>';
    }

    return (
      '<div class="account-order-card">' +
      '<div class="account-order-card__header">' +
      '<div class="account-order-card__header-left">' +
      '<strong class="account-order-card__order-no">Order #: ' +
      escapeHtml(String(o.orderId)) +
      "</strong>" +
      (o.tagRef ? '<span class="account-order-card__tag">' + escapeHtml(String(o.tagRef)) + "</span>" : "") +
      (typeBit ? " " + typeBit : "") +
      "</div>" +
      '<div class="account-order-card__actions">' +
      actionsHtml +
      "</div>" +
      "</div>" +
      '<p class="account-order-card__summary">' +
      escapeHtml(summaryBits.join(" · ")) +
      "</p>" +
      '<div class="account-order-card__grid">' +
      '<div class="account-order-card__cell"><span class="account-order-card__cell-label">Status</span><span class="account-order-card__status ' +
      escapeAttr(stClass) +
      '">' +
      escapeHtml(stLabel) +
      "</span></div>" +
      '<div class="account-order-card__cell"><span class="account-order-card__cell-label">Delivery</span><span class="account-order-card__cell-value">' +
      escapeHtml(deliveryLine) +
      "</span></div>" +
      '<div class="account-order-card__cell account-order-card__cell--wide"><span class="account-order-card__cell-label">Delivered to</span><span class="account-order-card__cell-value">' +
      shipToBlock +
      "</span></div>" +
      '<div class="account-order-card__cell"><span class="account-order-card__cell-label">Payment</span><span class="account-order-card__cell-value">' +
      escapeHtml(paymentLabel(o.paymentStatus)) +
      (o.paymentMethod && String(o.paymentMethod).trim()
        ? '<span class="account-order-card__pay-sub">' + escapeHtml(String(o.paymentMethod).trim()) + "</span>"
        : "") +
      "</span></div>" +
      "</div>" +
      '<div class="account-order-bill">' +
      '<div class="account-order-bill__lines">' +
      linesHtml +
      "</div>" +
      '<div class="account-order-bill__totals">' +
      totalRow("Subtotal", T.subtotal) +
      totalRow("Shipping", T.shipping) +
      totalRow("Tax (GST)", T.tax) +
      '<div class="account-order-bill__totalrow account-order-bill__totalrow--grand"><span>' +
      escapeHtml("Total") +
      "</span><span>" +
      escapeHtml(fmtMoney(grand)) +
      "</span></div>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function downloadGuestOrderBillPdf(orderId) {
    var base = billApiBase();
    if (!base) {
      window.alert("API URL missing. Set data-bill-api-base on this page.");
      return;
    }
    var oid = String(orderId || "").trim();
    if (!oid) return;
    var url = base + "/api/guest/order/" + encodeURIComponent(oid) + "/bill-pdf";
    fetch(url, { method: "GET", headers: guestAuthHeaders() })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw new Error((t && t.slice(0, 200)) || res.statusText || "Download failed");
          });
        }
        return res.blob();
      })
      .then(function (blob) {
        if (!blob || blob.size < 100) {
          throw new Error("Empty PDF from server.");
        }
        var a = document.createElement("a");
        var u = URL.createObjectURL(blob);
        a.href = u;
        a.download = "Craftguru-order-" + oid + "-bill.pdf";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          try {
            document.body.removeChild(a);
          } catch (_) {}
          URL.revokeObjectURL(u);
        }, 2000);
      })
      .catch(function (err) {
        window.alert(String((err && err.message) || err || "Could not download bill."));
      });
  }

  /** Read ?paid=1&orderId=&tag= from checkout redirect; show banner and return order id to highlight. */
  function consumePaidQueryBanner() {
    var ban = document.getElementById("accountPaidBanner");
    var highlight = "";
    try {
      var u = new URL(window.location.href);
      if (u.searchParams.get("paid") !== "1") {
        return "";
      }
      highlight = String(u.searchParams.get("orderId") || "").trim();
      var tag = String(u.searchParams.get("tag") || "").trim();
      if (ban) {
        ban.hidden = false;
        var oid = highlight || "—";
        ban.textContent =
          "Payment confirmed — order #" +
          oid +
          (tag ? " · Tag " + tag : "") +
          ". Status below updates when the studio marks packed, out for delivery, shipped, or delivered.";
      }
      u.searchParams.delete("paid");
      u.searchParams.delete("orderId");
      u.searchParams.delete("tag");
      window.history.replaceState({}, "", u.pathname + (u.search || "") + u.hash);
    } catch (_) {}
    return highlight;
  }

  function fulfillmentDisplay(st) {
    var s = String(st || "new").toLowerCase();
    var map = {
      new: "Preparing",
      packed: "Packed",
      shipping: "On the way",
      shipped: "Shipped to customer",
      delivered: "Delivered",
      cancelled: "Cancelled",
    };
    return map[s] || s;
  }

  function fulfillmentStatusClass(st) {
    var s = String(st || "new").toLowerCase();
    if (s === "delivered" || s === "shipped") return "account-order-card__status--ok";
    if (s === "shipping" || s === "packed") return "account-order-card__status--progress";
    if (s === "cancelled") return "account-order-card__status--muted";
    return "";
  }

  function formatLongDate(iso) {
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    } catch (_) {
      return "—";
    }
  }

  function paymentLabel(ps) {
    var s = String(ps || "").toLowerCase();
    if (s === "paid") return "Paid";
    if (s === "pending_payment") return "Unpaid";
    return ps || "—";
  }

  function orderMatchesTab(tab, o) {
    var fs = String(o.fulfillmentStatus || "").toLowerCase();
    var ps = String(o.paymentStatus || "").toLowerCase();
    if (tab === "all") return true;
    if (fs === "cancelled") return false;
    if (tab === "unpaid") return ps === "pending_payment";
    /* current — open orders (awaiting pay or in flight, not delivered) */
    if (ps === "pending_payment") return true;
    if (ps === "paid" && fs !== "delivered") return true;
    return false;
  }

  function filteredOrdersForTab(tab, list) {
    return (list || []).filter(function (o) {
      return orderMatchesTab(tab, o);
    });
  }

  function setOrderTab(tab) {
    activeOrderTab = tab || "current";
    var host = document.getElementById("accountOrderTabs");
    if (host) {
      host.querySelectorAll(".account-order-tab").forEach(function (b) {
        var t = b.getAttribute("data-order-tab") || "";
        var on = t === activeOrderTab;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
    }
  }

  function refreshAccountHeroName(emailNorm, immediateName) {
    var nameEl = document.getElementById("accountHeroName");
    if (!nameEl) return;
    var im = String(immediateName || "").trim();
    if (im) {
      nameEl.textContent = im;
      return;
    }
    nameEl.textContent = "";
    if (!window.CRAFT_AUTH_DB || !window.CRAFT_AUTH_DB.getUser) return;
    try {
      window.CRAFT_AUTH_DB.getUser(emailNorm, function (_e, user) {
        var nm = user && String(user.name || "").trim();
        if (nm) nameEl.textContent = nm;
      });
    } catch (_) {}
  }

  function showOrdersCard(show) {
    var card = document.getElementById("accountOrdersCard");
    if (!card) return;
    if (show) {
      if (activeAcctSection === "orders") {
        card.removeAttribute("hidden");
      }
    } else {
      card.setAttribute("hidden", "hidden");
    }
  }

  /** After OTP sign-in, always land on My orders so the panel can open (showOrdersCard respects active section). */
  function focusAccountOrdersSection() {
    activeAcctSection = "orders";
    setAcctNavActive("orders");
    setAccountSection("orders");
  }

  function setAcctNavActive(section) {
    var nav = document.getElementById("accountSideNav");
    if (!nav) return;
    nav.querySelectorAll("[data-acct-section]").forEach(function (b) {
      var on = (b.getAttribute("data-acct-section") || "") === section;
      b.classList.toggle("account-side-nav__link--active", on);
    });
  }

  function formatAddrTypeLabel(t) {
    var x = String(t || "").toLowerCase();
    if (x === "home") return "Home";
    if (x === "work") return "Work";
    if (x === "other") return "Other";
    return "";
  }

  function renderAccountAddrRows(addresses) {
    var list = document.getElementById("accountAddrList");
    if (!list) return;
    list.innerHTML = "";
    if (!addresses || !addresses.length) {
      list.innerHTML =
        '<li class="account-orders-empty"><p class="account-orders-empty__text">No saved addresses yet. Save one from checkout.</p></li>';
      return;
    }
    addresses.forEach(function (a) {
      var li = document.createElement("li");
      li.className = "account-addr-card";
      var typeL = formatAddrTypeLabel(a.addressType);
      var head = typeL ? typeL + " · " : "";
      li.innerHTML =
        "<p><strong>" +
        escapeHtml(head + [a.addrLine1, a.addrLine2].filter(Boolean).join(", ")) +
        "</strong></p>" +
        "<p>" +
        escapeHtml([a.city, a.state, a.zip, a.country].filter(Boolean).join(", ")) +
        "</p>";
      list.appendChild(li);
    });
  }

  function refreshAccountAddresses() {
    var list = document.getElementById("accountAddrList");
    var hint = document.getElementById("accountAddrSignInHint");
    if (!list) return;
    list.innerHTML = "";
    var token = null;
    try {
      token = localStorage.getItem(GUEST_TOKEN_KEY);
    } catch (_) {}
    if (!token) {
      if (hint) hint.hidden = false;
      list.innerHTML =
        '<li class="account-orders-empty"><p class="account-orders-empty__text">Sign in to load saved addresses.</p></li>';
      return;
    }
    if (hint) hint.hidden = true;
    fetch(billApiBase() + "/api/guest/me", { headers: guestAuthHeaders() })
      .then(function (res) {
        return parseApiJson(res).then(function (x) {
          return { status: res.status, x: x };
        });
      })
      .then(function (o) {
        var j = o.x.json || {};
        if (!o.x.okHttp || !j.ok) {
          renderAccountAddrRows([]);
          return;
        }
        renderAccountAddrRows(j.addresses || []);
      })
      .catch(function () {
        renderAccountAddrRows([]);
      });
  }

  function renderAccountSaveLater() {
    var list = document.getElementById("accountLaterList");
    if (!list || !window.RESIN_CART || typeof window.RESIN_CART.loadSaveLater !== "function") return;
    var lines = window.RESIN_CART.loadSaveLater();
    list.innerHTML = "";
    if (!lines.length) {
      list.innerHTML =
        '<li class="account-orders-empty"><p class="account-orders-empty__text">Nothing saved yet. Use Save for later on checkout.</p></li>';
      return;
    }
    lines.forEach(function (line) {
      var li = document.createElement("li");
      li.className = "account-later-line";
      var sz =
        (line.variantLabel && String(line.variantLabel).trim()) ||
        (window.RESIN_DATA && window.RESIN_DATA.lineSizeLabel
          ? window.RESIN_DATA.lineSizeLabel(line.id, line.size)
          : line.size);
      var imgSrc = lineImageSrc(line);
      var thumb =
        imgSrc && String(imgSrc).length
          ? '<span class="account-later-line__img"><img src="' + escapeAttr(imgSrc) + '" alt="" width="48" height="48" loading="lazy" /></span>'
          : '<span class="account-later-line__img account-later-line__img--empty" aria-hidden="true"></span>';
      li.innerHTML =
        thumb +
        '<div class="account-later-line__body">' +
        "<strong>" +
        escapeHtml(line.name || "") +
        "</strong>" +
        "<span>" +
        escapeHtml(sz || "") +
        " · Qty " +
        (line.qty || 1) +
        "</span></div>" +
        '<div class="account-later-line__actions">' +
        '<button type="button" class="checkout-pay-secondary account-later-line__tocart" data-later-to-cart-id="' +
        escapeAttr(line.id) +
        '" data-later-to-cart-size="' +
        escapeAttr(line.size) +
        '">Move to cart</button>' +
        '<button type="button" class="account-later-line__rm" data-later-rm-id="' +
        escapeAttr(line.id) +
        '" data-later-rm-size="' +
        escapeAttr(line.size) +
        '" aria-label="Remove">×</button></div>';
      list.appendChild(li);
    });
  }

  function setAccountSection(section) {
    activeAcctSection = section || "orders";
    var ordersC = document.getElementById("accountOrdersCard");
    var addrC = document.getElementById("accountAddressesCard");
    var laterC = document.getElementById("accountSaveLaterCard");
    setAcctNavActive(activeAcctSection);
    if (activeAcctSection === "orders") {
      if (ordersC) ordersC.removeAttribute("hidden");
      if (addrC) addrC.setAttribute("hidden", "hidden");
      if (laterC) laterC.setAttribute("hidden", "hidden");
    } else if (activeAcctSection === "addresses") {
      if (ordersC) ordersC.setAttribute("hidden", "hidden");
      if (addrC) addrC.removeAttribute("hidden");
      if (laterC) laterC.setAttribute("hidden", "hidden");
      refreshAccountAddresses();
    } else if (activeAcctSection === "later") {
      if (ordersC) ordersC.setAttribute("hidden", "hidden");
      if (addrC) addrC.setAttribute("hidden", "hidden");
      if (laterC) laterC.removeAttribute("hidden");
      renderAccountSaveLater();
    }
  }

  function showAccountStoreChrome(show, emailText) {
    var side = document.getElementById("accountSidebar");
    var hero = document.getElementById("accountHero");
    var emH = document.getElementById("accountHeroEmail");
    if (side) {
      if (show) side.removeAttribute("hidden");
      else side.setAttribute("hidden", "hidden");
    }
    if (hero) {
      if (show) hero.removeAttribute("hidden");
      else hero.setAttribute("hidden", "hidden");
    }
    if (emH) emH.textContent = emailText != null ? String(emailText) : "";
    if (show && emailText) refreshAccountHeroName(String(emailText).trim().toLowerCase(), "");
  }

  function showAccountAuth(show) {
    var auth = document.getElementById("accountAuthCard");
    if (!auth) return;
    if (show) {
      auth.removeAttribute("hidden");
    } else {
      auth.setAttribute("hidden", "hidden");
    }
  }

  function showSessionBar(show, emailText) {
    var bar = document.getElementById("accountSessionBar");
    var em = document.getElementById("acctSessionEmail");
    if (!bar) return;
    if (show) {
      bar.removeAttribute("hidden");
      if (em) em.textContent = emailText != null ? String(emailText) : "";
    } else {
      bar.setAttribute("hidden", "hidden");
    }
  }

  function sessionEmailDisplay() {
    try {
      return String(localStorage.getItem(SESSION_EMAIL_KEY) || "").trim();
    } catch (_) {
      return "";
    }
  }

  function renderOrdersFromCache() {
    var list = document.getElementById("accountOrdersList");
    if (!list) return;
    var slice = filteredOrdersForTab(activeOrderTab, ordersCache);
    list.innerHTML = "";
    if (!slice.length) {
      var emptyMsg =
        activeOrderTab === "unpaid"
          ? "No unpaid orders right now."
          : activeOrderTab === "current"
            ? "No open orders in this tab."
            : "No orders yet.";
      list.innerHTML =
        '<li class="account-orders-empty"><p class="account-orders-empty__text">' + escapeHtml(emptyMsg) + "</p></li>";
      return;
    }
    slice.forEach(function (o) {
      var li = document.createElement("li");
      li.className = "account-orders-list__card-wrap";
      li.setAttribute("data-order-id", String(o.orderId));
      li.innerHTML = buildOrderBillHtml(o);
      list.appendChild(li);
    });
    if (pendingHighlightOrderId) {
      var sel = '[data-order-id="' + String(pendingHighlightOrderId).replace(/"/g, "") + '"]';
      var hi = list.querySelector(sel);
      if (hi) {
        hi.classList.add("account-order-li--hi");
        try {
          hi.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (_) {
          hi.scrollIntoView();
        }
      }
      pendingHighlightOrderId = "";
    }
  }

  function loadOrders() {
    var base = billApiBase();
    var list = document.getElementById("accountOrdersList");
    if (!base || !list) return;
    fetch(base + "/api/guest/orders", { headers: guestAuthHeaders(), cache: "no-store" })
      .then(function (res) {
        return parseApiJson(res).then(function (x) {
          return { status: res.status, x: x };
        });
      })
      .then(function (o) {
        var x = o.x;
        var j = x.json || {};
        if (!x.okHttp || !j.ok) {
          var needReauth = o.status === 401 || j.code === "NO_SESSION" || String(j.error || "").toLowerCase().indexOf("sign in") >= 0;
          if (needReauth) {
            try {
              localStorage.removeItem(GUEST_TOKEN_KEY);
            } catch (_) {}
            setSessionEmail("");
            if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogout === "function") {
              window.RESIN_CART.onAccountLogout();
            }
            showAccountAuth(true);
            showSessionBar(false);
            showAccountStoreChrome(false);
            showOrdersCard(false);
            ordersCache = [];
            list.innerHTML = "";
            return;
          }
          /* Network / 5xx: keep session; show inline error */
          showOrdersCard(true);
          list.innerHTML =
            '<li class="account-orders-empty"><p class="account-orders-empty__text">' +
            escapeHtml((j && j.error) || "Could not load orders. Check your connection and try Refresh.") +
            "</p></li>";
          return;
        }
        showAccountAuth(false);
        var disp = sessionEmailDisplay();
        if (disp) {
          showSessionBar(true, disp);
          showAccountStoreChrome(true, disp);
        }
        showOrdersCard(true);
        ordersCache = j.orders || [];
        setOrderTab(activeOrderTab);
        renderOrdersFromCache();
      })
      .catch(function (e) {
        showOrdersCard(false);
        ordersCache = [];
        list.innerHTML = "";
        try {
          console.error("loadOrders", e);
        } catch (_) {}
      });
  }

  function afterAuthSuccess(emailNorm, json, nameHint) {
    try {
      if (json && json.token) localStorage.setItem(GUEST_TOKEN_KEY, json.token);
    } catch (_) {}
    setSessionEmail(emailNorm);
    focusAccountOrdersSection();
    if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogin === "function") {
      window.RESIN_CART.onAccountLogin();
    }
    var nm = String(nameHint != null ? nameHint : "").trim();
    if (window.CRAFT_AUTH_DB && window.CRAFT_AUTH_DB.putUser) {
      window.CRAFT_AUTH_DB.putUser({ email: emailNorm, name: nm, createdAt: Date.now() }, function () {
        refreshAccountHeroName(emailNorm, nm);
      });
    } else {
      refreshAccountHeroName(emailNorm, nm);
    }
    showAccountAuth(false);
    showSessionBar(true, emailNorm);
    showAccountStoreChrome(true, emailNorm);
    loadOrders();
  }

  /** If a guest token exists, hide sign-in and show orders after /api/guest/me succeeds. */
  function hydrateSessionFromToken() {
    var token = null;
    try {
      token = localStorage.getItem(GUEST_TOKEN_KEY);
    } catch (_) {}
    if (!token) {
      showAccountAuth(true);
      showSessionBar(false);
      showAccountStoreChrome(false);
      showOrdersCard(false);
      return Promise.resolve();
    }
    showAccountAuth(false);
    showSessionBar(true, sessionEmailDisplay() || "…");
    showAccountStoreChrome(true, sessionEmailDisplay() || "");
    var base = billApiBase();
    return fetch(base + "/api/guest/me", { headers: guestAuthHeaders(), cache: "no-store" })
      .then(function (res) {
        return parseApiJson(res).then(function (x) {
          return { status: res.status, x: x };
        });
      })
      .then(function (o) {
        var x = o.x;
        var j = x.json || {};
        if (x.okHttp && j.ok) {
          if (j.email) setSessionEmail(j.email);
          var em2 = j.email || sessionEmailDisplay() || "";
          showSessionBar(true, em2);
          showAccountStoreChrome(true, em2);
          showAccountAuth(false);
          focusAccountOrdersSection();
          loadOrders();
          return;
        }
        var needReauth =
          o.status === 401 ||
          (j && j.code === "NO_SESSION") ||
          String((j && j.error) || "").toLowerCase().indexOf("sign in") >= 0;
        if (needReauth) {
          try {
            localStorage.removeItem(GUEST_TOKEN_KEY);
          } catch (_) {}
          setSessionEmail("");
          showAccountAuth(true);
          showSessionBar(false);
          showAccountStoreChrome(false);
          showOrdersCard(false);
          return;
        }
        showAccountAuth(false);
        showSessionBar(true, sessionEmailDisplay() || "…");
        showAccountStoreChrome(true, sessionEmailDisplay() || "");
        focusAccountOrdersSection();
        loadOrders();
      })
      .catch(function () {
        showAccountAuth(false);
        showSessionBar(true, sessionEmailDisplay() || "…");
        showAccountStoreChrome(true, sessionEmailDisplay() || "");
        focusAccountOrdersSection();
        loadOrders();
      });
  }

  function boot() {
    pendingHighlightOrderId = consumePaidQueryBanner();

    var base = billApiBase();
    var tabSu = document.getElementById("acctTabSu");
    var tabLo = document.getElementById("acctTabLo");
    var panelSu = document.getElementById("acctPanelSu");
    var panelLo = document.getElementById("acctPanelLo");
    if (tabSu && tabLo && panelSu && panelLo) {
      tabSu.addEventListener("click", function () {
        tabSu.classList.add("is-active");
        tabLo.classList.remove("is-active");
        panelSu.classList.remove("is-hidden");
        panelLo.classList.add("is-hidden");
      });
      tabLo.addEventListener("click", function () {
        tabLo.classList.add("is-active");
        tabSu.classList.remove("is-active");
        panelLo.classList.remove("is-hidden");
        panelSu.classList.add("is-hidden");
      });
    }

    var sendSu = document.getElementById("acctSendSu");
    if (sendSu) {
      sendSu.addEventListener("click", function () {
        var msgEl = document.getElementById("acctMsgSu");
        setMsg(msgEl, "");
        var em = normalizeEmail(document.getElementById("acctEmailSu") && document.getElementById("acctEmailSu").value);
        if (!em || em.indexOf("@") < 1) {
          setMsg(msgEl, "Enter a valid email.");
          return;
        }
        sendSu.disabled = true;
        postJson(
          base + "/api/guest-auth/signup/request-otp",
          { email: em, name: (document.getElementById("acctNameSu") && document.getElementById("acctNameSu").value) || "" },
          function (err, json) {
            sendSu.disabled = false;
            if (err) {
              if (err.status === 409 || err.code === "USE_LOGIN") {
                setMsg(msgEl, err.message || "This email exists — use Log in.");
                return;
              }
              setMsg(msgEl, err.message || "Could not send code.");
              return;
            }
            setMsg(
              msgEl,
              (json && json.devMailSkipped ? "Code in server console. " : "") + "Enter the 6-digit code (5 minutes).",
              "ok"
            );
          }
        );
      });
    }

    var verSu = document.getElementById("acctVerifySu");
    if (verSu) {
      verSu.addEventListener("click", function () {
        var msgEl = document.getElementById("acctMsgSu");
        setMsg(msgEl, "");
        var em = normalizeEmail(document.getElementById("acctEmailSu") && document.getElementById("acctEmailSu").value);
        var otp = String((document.getElementById("acctOtpSu") && document.getElementById("acctOtpSu").value) || "")
          .replace(/\D/g, "")
          .slice(0, 6);
        if (!em || otp.length !== 6) {
          setMsg(msgEl, "Enter email and 6-digit code.");
          return;
        }
        verSu.disabled = true;
        var nm0 = (document.getElementById("acctNameSu") && document.getElementById("acctNameSu").value) || "";
        postJson(base + "/api/guest-auth/signup/verify", { email: em, code: otp, name: nm0 }, function (err, json) {
          verSu.disabled = false;
          if (err) {
            if (err.status === 409 || err.code === "USE_LOGIN") {
              setMsg(msgEl, err.message || "Use Log in.");
              return;
            }
            setMsg(msgEl, err.message || "Verification failed.");
            return;
          }
          afterAuthSuccess(em, json, nm0);
          setMsg(msgEl, "Signed in.", "ok");
        });
      });
    }

    var sendLo = document.getElementById("acctSendLo");
    if (sendLo) {
      sendLo.addEventListener("click", function () {
        var msgEl = document.getElementById("acctMsgLo");
        setMsg(msgEl, "");
        var em = normalizeEmail(document.getElementById("acctEmailLo") && document.getElementById("acctEmailLo").value);
        if (!em || em.indexOf("@") < 1) {
          setMsg(msgEl, "Enter a valid email.");
          return;
        }
        sendLo.disabled = true;
        postJson(base + "/api/guest-auth/login/request-otp", { email: em }, function (err) {
          sendLo.disabled = false;
          if (err) {
            setMsg(msgEl, err.message || "Could not send code.");
            return;
          }
          setMsg(msgEl, "Check your email (5 minutes).", "ok");
        });
      });
    }

    var verLo = document.getElementById("acctVerifyLo");
    if (verLo) {
      verLo.addEventListener("click", function () {
        var msgEl = document.getElementById("acctMsgLo");
        setMsg(msgEl, "");
        var em = normalizeEmail(document.getElementById("acctEmailLo") && document.getElementById("acctEmailLo").value);
        var otp = String((document.getElementById("acctOtpLo") && document.getElementById("acctOtpLo").value) || "")
          .replace(/\D/g, "")
          .slice(0, 6);
        if (!em || otp.length !== 6) {
          setMsg(msgEl, "Enter email and 6-digit code.");
          return;
        }
        verLo.disabled = true;
        postJson(base + "/api/guest-auth/login/verify", { email: em, code: otp }, function (err, json) {
          verLo.disabled = false;
          if (err) {
            setMsg(msgEl, err.message || "Verification failed.");
            return;
          }
          afterAuthSuccess(em, json, "");
          setMsg(msgEl, "Signed in.", "ok");
          if (window.CRAFT_AUTH_DB && window.CRAFT_AUTH_DB.getUser && window.CRAFT_AUTH_DB.putUser) {
            window.CRAFT_AUTH_DB.getUser(em, function (e2, user) {
              var name = (user && user.name) || "";
              var createdAt = (user && user.createdAt) || Date.now();
              window.CRAFT_AUTH_DB.putUser({ email: em, name: name, createdAt: createdAt }, function () {});
            });
          }
        });
      });
    }

    var gSu = document.getElementById("acctGoogleSignInSu");
    var gLo = document.getElementById("acctGoogleSignInLo");
    if ((gSu || gLo) && window.CRAFT_GOOGLE_SIGNIN && CRAFT_GOOGLE_SIGNIN.isConfigured()) {
      CRAFT_GOOGLE_SIGNIN.bootstrap(function (cred) {
        postJson(base + "/api/guest-auth/google/session", { credential: cred }, function (err, json) {
          var msgSu = document.getElementById("acctMsgSu");
          var msgLo = document.getElementById("acctMsgLo");
          if (err) {
            if (msgSu) setMsg(msgSu, err.message || "Google sign-in failed.");
            if (msgLo) setMsg(msgLo, err.message || "Google sign-in failed.");
            return;
          }
          var em = json && json.email ? normalizeEmail(json.email) : "";
          afterAuthSuccess(em, json, "");
          if (msgSu) setMsg(msgSu, "Signed in with Google.", "ok");
          if (msgLo) setMsg(msgLo, "Signed in with Google.", "ok");
        });
      });
      var googleIconOpts = { type: "icon", shape: "circle", theme: "outline", size: "large" };
      if (gSu) CRAFT_GOOGLE_SIGNIN.renderButton(gSu, googleIconOpts);
      if (gLo) CRAFT_GOOGLE_SIGNIN.renderButton(gLo, googleIconOpts);
    }

    var outBtn = document.getElementById("acctSignOut");
    if (outBtn) {
      outBtn.addEventListener("click", function () {
        try {
          localStorage.removeItem(GUEST_TOKEN_KEY);
        } catch (_) {}
        setSessionEmail("");
        if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogout === "function") {
          window.RESIN_CART.onAccountLogout();
        }
        showOrdersCard(false);
        showAccountAuth(true);
        showSessionBar(false);
        showAccountStoreChrome(false);
        activeAcctSection = "orders";
        setAcctNavActive("orders");
        var addrC = document.getElementById("accountAddressesCard");
        var laterC = document.getElementById("accountSaveLaterCard");
        if (addrC) addrC.setAttribute("hidden", "hidden");
        if (laterC) laterC.setAttribute("hidden", "hidden");
        var list = document.getElementById("accountOrdersList");
        if (list) list.innerHTML = "";
        var ban = document.getElementById("accountPaidBanner");
        if (ban) {
          ban.textContent = "";
          ban.setAttribute("hidden", "hidden");
        }
      });
    }

    var tabs = document.getElementById("accountOrderTabs");
    if (tabs) {
      tabs.addEventListener("click", function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest(".account-order-tab") : null;
        if (!b || !tabs.contains(b)) return;
        var t = b.getAttribute("data-order-tab");
        if (!t) return;
        activeOrderTab = t;
        setOrderTab(t);
        renderOrdersFromCache();
      });
    }

    var outSide = document.getElementById("acctSignOutSidebar");
    if (outSide) {
      outSide.addEventListener("click", function () {
        var top = document.getElementById("acctSignOut");
        if (top) top.click();
      });
    }

    var sideNav = document.getElementById("accountSideNav");
    if (sideNav) {
      sideNav.addEventListener("click", function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest("[data-acct-section]") : null;
        if (!b || !sideNav.contains(b)) return;
        ev.preventDefault();
        var s = b.getAttribute("data-acct-section");
        if (s) setAccountSection(s);
      });
    }

    var laterList = document.getElementById("accountLaterList");
    if (laterList) {
      laterList.addEventListener("click", function (ev) {
        var toCart = ev.target && ev.target.closest ? ev.target.closest("[data-later-to-cart-id]") : null;
        if (toCart) {
          var id = toCart.getAttribute("data-later-to-cart-id");
          var size = toCart.getAttribute("data-later-to-cart-size");
          if (window.RESIN_CART && typeof window.RESIN_CART.moveSaveLaterToCart === "function") {
            if (window.RESIN_CART.moveSaveLaterToCart(id, size)) {
              renderAccountSaveLater();
              if (window.RESIN_SHELL) {
                if (window.RESIN_SHELL.updateBadge) window.RESIN_SHELL.updateBadge();
                if (window.RESIN_SHELL.renderDrawer) window.RESIN_SHELL.renderDrawer();
              }
            }
          }
          return;
        }
        var rm = ev.target && ev.target.closest ? ev.target.closest("[data-later-rm-id]") : null;
        if (rm && window.RESIN_CART && typeof window.RESIN_CART.removeSaveLaterLine === "function") {
          window.RESIN_CART.removeSaveLaterLine(rm.getAttribute("data-later-rm-id"), rm.getAttribute("data-later-rm-size"));
          renderAccountSaveLater();
        }
      });
    }

    var list = document.getElementById("accountOrdersList");
    if (list) {
      list.addEventListener("click", function (ev) {
        var dlBtn = ev.target && ev.target.closest ? ev.target.closest("[data-dl-bill-order]") : null;
        if (dlBtn) {
          ev.preventDefault();
          downloadGuestOrderBillPdf(dlBtn.getAttribute("data-dl-bill-order"));
          return;
        }
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-cancel-id]") : null;
        if (!btn) return;
        var id = btn.getAttribute("data-cancel-id");
        if (!window.confirm("Cancel order #" + id + "? This only works before payment.")) return;
        fetch(billApiBase() + "/api/guest/order/cancel", {
          method: "POST",
          headers: guestAuthHeaders(),
          body: JSON.stringify({ orderId: id }),
        })
          .then(function (res) {
            return parseApiJson(res);
          })
          .then(function (x) {
            if (!x.okHttp || !x.json.ok) {
              throw new Error((x.json && x.json.error) || "Cancel failed");
            }
            loadOrders();
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
      });
    }

    hydrateSessionFromToken();
  }

  boot();
})();
