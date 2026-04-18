(function () {
  "use strict";

  var GUEST_TOKEN_KEY = "craftguruGuestToken";
  var SESSION_EMAIL_KEY = "cg_session_email";
  var pendingHighlightOrderId = "";

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
    var g = o.guest && typeof o.guest === "object" ? o.guest : {};
    var T = o.totals && typeof o.totals === "object" ? o.totals : {};
    var items = Array.isArray(o.items) ? o.items : [];
    var shipRows = [];
    if (g.name) shipRows.push(escapeHtml(String(g.name).trim()));
    var addrMid = [g.addrLine1, g.addrLine2]
      .map(function (x) {
        return String(x || "").trim();
      })
      .filter(Boolean)
      .join(", ");
    if (addrMid) shipRows.push(escapeHtml(addrMid));
    var cityLine = [g.city, g.state, g.zip]
      .map(function (x) {
        return String(x || "").trim();
      })
      .filter(Boolean)
      .join(", ");
    if (cityLine) shipRows.push(escapeHtml(cityLine));
    if (g.country && String(g.country).trim()) shipRows.push(escapeHtml(String(g.country).trim()));
    if (g.phone && String(g.phone).trim()) shipRows.push(escapeHtml(String(g.phone).trim()));
    if (g.email && String(g.email).trim()) shipRows.push(escapeHtml(String(g.email).trim()));

    var linesHtml = "";
    if (!items.length) {
      linesHtml = '<p class="account-order-bill__empty">No line items on file for this order.</p>';
    } else {
      items.forEach(function (it) {
        var src = lineImageSrc(it);
        var lineTot = (Number(it.unitPrice) || 0) * (Number(it.qty) || 0);
        var meta = [];
        if (it.sizeLabel) meta.push(String(it.sizeLabel));
        meta.push("Qty " + String(Number(it.qty) || 0));
        meta.push(fmtMoney(it.unitPrice) + " each");
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

    var shipBlock =
      shipRows.length > 0
        ? '<div class="account-order-bill__ship"><div class="account-order-bill__label">Ship to</div>' +
          shipRows
            .map(function (row) {
              return '<div class="account-order-bill__ship-line">' + row + "</div>";
            })
            .join("") +
          "</div>"
        : "";

    var typeBit =
      o.orderType && String(o.orderType).trim()
        ? ' <span class="account-order-bill__type">' + escapeHtml(String(o.orderType).trim()) + "</span>"
        : "";

    var grand =
      T.total != null && Number.isFinite(Number(T.total))
        ? Number(T.total)
        : Number(o.total) || 0;

    var billInner =
      '<div class="account-order-bill__head">' +
      "<div><strong>" +
      escapeHtml("#" + String(o.orderId)) +
      "</strong> · " +
      escapeHtml(String(o.tagRef || "")) +
      typeBit +
      "</div>" +
      '<div class="account-order-bill__meta">' +
      escapeHtml(String(o.createdAt || "").slice(0, 19)) +
      " · " +
      escapeHtml(String(o.paymentStatus || "")) +
      (o.paymentMethod && String(o.paymentMethod).trim()
        ? " · " + escapeHtml(String(o.paymentMethod).trim())
        : "") +
      "</div>" +
      '<span class="account-order-status">' +
      escapeHtml(stLabel) +
      "</span>" +
      "</div>" +
      shipBlock +
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
      "</div>";

    var showDl = o.paymentStatus === "paid" && items.length > 0;
    var asideHtml = "";
    if (showDl) {
      asideHtml +=
        '<button type="button" class="checkout-submit account-order-dl-bill" data-dl-bill-order="' +
        escapeAttr(String(o.orderId)) +
        '">Download PDF bill</button>';
    }
    if (canCancel) {
      asideHtml +=
        '<button type="button" class="checkout-pay-secondary account-order-cancel" data-cancel-id="' +
        escapeAttr(String(o.orderId)) +
        '">Cancel order</button>';
    }

    var rowClass = asideHtml ? "account-order-row" : "account-order-row account-order-row--single";
    return (
      '<div class="' +
      rowClass +
      '">' +
      '<div class="account-order-row__main">' +
      '<div class="account-order-bill">' +
      billInner +
      "</div></div>" +
      (asideHtml ? '<div class="account-order-row__aside">' + asideHtml + "</div>" : "") +
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
      shipping: "Out for delivery",
      shipped: "Shipped",
      delivered: "Delivered",
      cancelled: "Cancelled",
    };
    return map[s] || s;
  }

  function showOrdersCard(show) {
    var card = document.getElementById("accountOrdersCard");
    if (!card) return;
    if (show) {
      card.removeAttribute("hidden");
    } else {
      card.setAttribute("hidden", "hidden");
    }
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

  function loadOrders() {
    var base = billApiBase();
    var list = document.getElementById("accountOrdersList");
    if (!base || !list) return;
    fetch(base + "/api/guest/orders", { headers: guestAuthHeaders() })
      .then(function (res) {
        return parseApiJson(res).then(function (x) {
          return { status: res.status, x: x };
        });
      })
      .then(function (o) {
        var x = o.x;
        var j = x.json || {};
        if (!x.okHttp || !j.ok) {
          if (o.status === 401 || j.code === "NO_SESSION") {
            try {
              localStorage.removeItem(GUEST_TOKEN_KEY);
            } catch (_) {}
            setSessionEmail("");
            if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogout === "function") {
              window.RESIN_CART.onAccountLogout();
            }
            showAccountAuth(true);
            showSessionBar(false);
          }
          showOrdersCard(false);
          list.innerHTML = "";
          return;
        }
        showAccountAuth(false);
        var disp = sessionEmailDisplay();
        if (disp) showSessionBar(true, disp);
        showOrdersCard(true);
        list.innerHTML = "";
        (j.orders || []).forEach(function (o) {
          var li = document.createElement("li");
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
      })
      .catch(function (e) {
        showOrdersCard(false);
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
    if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogin === "function") {
      window.RESIN_CART.onAccountLogin();
    }
    var nm = String(nameHint != null ? nameHint : "").trim();
    if (window.CRAFT_AUTH_DB && window.CRAFT_AUTH_DB.putUser) {
      window.CRAFT_AUTH_DB.putUser({ email: emailNorm, name: nm, createdAt: Date.now() }, function () {});
    }
    showAccountAuth(false);
    showSessionBar(true, emailNorm);
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
      showOrdersCard(false);
      return Promise.resolve();
    }
    showAccountAuth(false);
    showSessionBar(true, sessionEmailDisplay() || "…");
    var base = billApiBase();
    return fetch(base + "/api/guest/me", { headers: guestAuthHeaders() })
      .then(function (res) {
        return parseApiJson(res).then(function (x) {
          return { status: res.status, x: x };
        });
      })
      .then(function (o) {
        var x = o.x;
        var j = x.json || {};
        if (!x.okHttp || !j.ok) {
          try {
            localStorage.removeItem(GUEST_TOKEN_KEY);
          } catch (_) {}
          setSessionEmail("");
          showAccountAuth(true);
          showSessionBar(false);
          showOrdersCard(false);
          return;
        }
        if (j.email) setSessionEmail(j.email);
        showSessionBar(true, j.email || sessionEmailDisplay() || "");
        loadOrders();
      })
      .catch(function () {
        try {
          localStorage.removeItem(GUEST_TOKEN_KEY);
        } catch (_) {}
        showAccountAuth(true);
        showSessionBar(false);
        showOrdersCard(false);
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
          if (window.CRAFT_AUTH_DB && window.CRAFT_AUTH_DB.getUser && window.CRAFT_AUTH_DB.putUser) {
            window.CRAFT_AUTH_DB.getUser(em, function (e2, user) {
              var name = (user && user.name) || "";
              var createdAt = (user && user.createdAt) || Date.now();
              window.CRAFT_AUTH_DB.putUser({ email: em, name: name, createdAt: createdAt }, function () {
                afterAuthSuccess(em, json, name);
                setMsg(msgEl, "Signed in.", "ok");
              });
            });
          } else {
            afterAuthSuccess(em, json, "");
            setMsg(msgEl, "Signed in.", "ok");
          }
        });
      });
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
        var list = document.getElementById("accountOrdersList");
        if (list) list.innerHTML = "";
        var ban = document.getElementById("accountPaidBanner");
        if (ban) {
          ban.textContent = "";
          ban.setAttribute("hidden", "hidden");
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

    setInterval(function () {
      var card = document.getElementById("accountOrdersCard");
      try {
        if (!card || card.hasAttribute("hidden")) return;
        if (!localStorage.getItem(GUEST_TOKEN_KEY)) return;
        loadOrders();
      } catch (_) {}
    }, 45000);
  }

  boot();
})();
