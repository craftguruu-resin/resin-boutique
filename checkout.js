(function () {
  "use strict";

  var CART = window.RESIN_CART;
  var D = window.RESIN_DATA;
  if (!CART || !D) return;

  /** MRP / line prices include 18% GST; shipping is added without further GST in this flow. */
  var GST_INCLUSIVE_RATE = 0.18;
  var SHIP_FLAT = 10;
  var FREE_SHIP_MIN = 150;

  function splitGstFromInclusive(inclTotal) {
    var t = Math.round(Number(inclTotal) * 100) / 100;
    var base = Math.round((t / (1 + GST_INCLUSIVE_RATE)) * 100) / 100;
    var gst = Math.round((t - base) * 100) / 100;
    return { inclusive: t, taxable: base, gst: gst };
  }

  var removeDelegationDone = false;
  var formBound = false;

  var els = {
    lines: document.getElementById("checkoutLines"),
    sub: document.getElementById("valSubtotal"),
    taxable: document.getElementById("valTaxable"),
    ship: document.getElementById("valShipping"),
    tax: document.getElementById("valTax"),
    total: document.getElementById("valTotal"),
    form: document.getElementById("checkoutForm"),
    main: document.getElementById("checkoutMain"),
    success: document.getElementById("checkoutSuccess"),
    orderId: document.getElementById("orderIdDisplay"),
    guestName: document.getElementById("guestName"),
    snipsGrid: document.getElementById("checkoutSnipsGrid"),
    stepReview: document.getElementById("checkoutStepReview"),
    stepFill: document.getElementById("checkoutStepFill"),
    goDetails: document.getElementById("checkoutGoDetails"),
    backReview: document.getElementById("checkoutBackReview"),
    stepLabel: document.getElementById("checkoutStepLabel"),
    payModal: document.getElementById("checkoutPayModal"),
    payModalBackdrop: document.getElementById("checkoutPayModalBackdrop"),
    payModalClose: document.getElementById("checkoutPayModalClose"),
    openUpiModal: document.getElementById("checkoutOpenUpiModal"),
    modalSub: document.getElementById("checkoutModalSub"),
    modalTaxable: document.getElementById("checkoutModalTaxable"),
    modalShip: document.getElementById("checkoutModalShip"),
    modalTax: document.getElementById("checkoutModalTax"),
    modalGrand: document.getElementById("checkoutModalGrand"),
    btnRazorpayCheckout: document.getElementById("btnRazorpayCheckout"),
    btnCheckoutTestPay: document.getElementById("btnCheckoutTestPay"),
    paymentCancelBtn: document.getElementById("checkoutPaymentCancelBtn"),
    guestPhone: document.getElementById("guestPhone"),
    guestName: document.getElementById("guestName"),
    btnDownloadBillPdf: document.getElementById("btnDownloadBillPdf"),
  };

  var GUEST_TOKEN_KEY = "craftguruGuestToken";

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

  function loadGuestSession() {
    var base = billApiBase();
    if (!base) {
      return Promise.resolve(null);
    }
    return fetch(base + "/api/guest/me", {
      method: "GET",
      headers: guestAuthHeaders(),
    })
      .then(function (res) {
        return parseApiJson(res);
      })
      .then(function (x) {
        var j = x.json;
        if (!x.okHttp || !j.ok) {
          try {
            localStorage.removeItem(GUEST_TOKEN_KEY);
          } catch (_) {}
          return null;
        }
        return j;
      })
      .catch(function () {
        return null;
      });
  }

  function applySavedAddress(addr) {
    function set(id, v) {
      var el = document.getElementById(id);
      if (el) {
        el.value = v != null ? String(v) : "";
      }
    }
    if (!addr) return;
    set("addrLine1", addr.addrLine1);
    set("addrLine2", addr.addrLine2);
    set("city", addr.city);
    set("state", addr.state);
    set("zip", addr.zip);
    set("country", addr.country);
  }

  function fillSavedAddrSelect(addresses) {
    var sel = document.getElementById("checkoutSavedAddrSelect");
    if (!sel) return;
    sel.innerHTML = "";
    (addresses || []).forEach(function (a, i) {
      var opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = [a.addrLine1, a.city, a.zip].filter(Boolean).join(", ");
      sel.appendChild(opt);
    });
  }

  function refreshGuestCheckoutUi() {
    var bar = document.getElementById("checkoutGuestSessionBar");
    var txt = document.getElementById("checkoutGuestSessionText");
    var fs = document.getElementById("checkoutSavedAddrFieldset");
    var guestEmail = document.getElementById("guestEmail");
    var guestPhone = document.getElementById("guestPhone");
    loadGuestSession().then(function (me) {
      if (me && me.email) {
        if (bar) {
          bar.hidden = false;
        }
        if (txt) {
          txt.textContent = "Signed in as " + me.email + ".";
        }
        if (guestEmail) {
          guestEmail.value = me.email;
          guestEmail.readOnly = true;
        }
        var pn = me.phoneNorm != null ? String(me.phoneNorm).trim() : "";
        if (guestPhone) {
          var disp = formatIndiaPhoneDisplay10(pn);
          if (disp) {
            guestPhone.value = disp;
            guestPhone.readOnly = true;
          } else {
            guestPhone.readOnly = false;
          }
        }
        if (me.displayName && els.guestName) {
          els.guestName.value = me.displayName;
        }
        if (fs && me.addresses && me.addresses.length) {
          fs.hidden = false;
          fillSavedAddrSelect(me.addresses);
          fs.dataset.addressesJson = JSON.stringify(me.addresses);
        } else if (fs) {
          fs.hidden = true;
        }
      } else {
        if (bar) {
          bar.hidden = true;
        }
        if (guestEmail) {
          guestEmail.readOnly = false;
        }
        if (guestPhone) {
          guestPhone.readOnly = false;
        }
        if (fs) {
          fs.hidden = true;
        }
      }
    });
  }

  var GUEST_SESSION_EMAIL_KEY = "cg_session_email";

  function normalizeCheckoutEmail(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase();
  }

  function setCheckoutSessionEmail(emailNorm) {
    try {
      if (emailNorm) localStorage.setItem(GUEST_SESSION_EMAIL_KEY, emailNorm);
      else localStorage.removeItem(GUEST_SESSION_EMAIL_KEY);
    } catch (_) {}
  }

  function checkoutPostJson(url, body, cb) {
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

  function checkoutAuthSetMsg(el, text, tone) {
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.classList.toggle("auth-msg--ok", tone === "ok");
  }

  function checkoutAfterVerifySuccess(emailNorm, json, nameHint) {
    try {
      if (json && json.token) localStorage.setItem(GUEST_TOKEN_KEY, json.token);
    } catch (_) {}
    setCheckoutSessionEmail(emailNorm);
    if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogin === "function") {
      window.RESIN_CART.onAccountLogin();
    }
    var nm =
      String(nameHint != null ? nameHint : "").trim() ||
      (document.getElementById("guestName") && document.getElementById("guestName").value) ||
      "";
    if (window.CRAFT_AUTH_DB && window.CRAFT_AUTH_DB.putUser) {
      window.CRAFT_AUTH_DB.putUser({ email: emailNorm, name: nm, createdAt: Date.now() }, function () {});
    }
    refreshGuestCheckoutUi();
    if (window.RESIN_SHELL) {
      if (window.RESIN_SHELL.updateBadge) window.RESIN_SHELL.updateBadge();
      if (window.RESIN_SHELL.renderDrawer) window.RESIN_SHELL.renderDrawer();
    }
    refreshCheckout();
    var authDet = document.getElementById("checkoutAuthOptional");
    if (authDet) {
      try {
        authDet.open = false;
      } catch (_) {}
    }
  }

  function bindCheckoutAuth() {
    var base = billApiBase();
    var tabSu = document.getElementById("checkoutAuthTabSu");
    var tabLo = document.getElementById("checkoutAuthTabLo");
    var panelSu = document.getElementById("checkoutAuthPanelSu");
    var panelLo = document.getElementById("checkoutAuthPanelLo");
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

    var sendSu = document.getElementById("checkoutAuthSendOtpSu");
    if (sendSu) {
      sendSu.addEventListener("click", function () {
        var msgEl = document.getElementById("checkoutAuthMsgSu");
        checkoutAuthSetMsg(msgEl, "");
        var em = normalizeCheckoutEmail(
          document.getElementById("checkoutAuthEmailSu") && document.getElementById("checkoutAuthEmailSu").value
        );
        if (!em || em.indexOf("@") < 1) {
          checkoutAuthSetMsg(msgEl, "Enter a valid email.");
          return;
        }
        sendSu.disabled = true;
        checkoutPostJson(
          base + "/api/guest-auth/signup/request-otp",
          {
            email: em,
            name: (document.getElementById("checkoutAuthNameSu") && document.getElementById("checkoutAuthNameSu").value) || "",
          },
          function (err, json) {
            sendSu.disabled = false;
            if (err) {
              if (err.status === 409 || err.code === "USE_LOGIN") {
                checkoutAuthSetMsg(msgEl, err.message || "This email is already registered. Switch to Log in.");
                return;
              }
              checkoutAuthSetMsg(msgEl, err.message || "Could not send code.");
              return;
            }
            checkoutAuthSetMsg(
              msgEl,
              (json && json.devMailSkipped ? "Code is in the API server console. " : "") + "Enter the 6-digit code (5 minutes).",
              "ok"
            );
          }
        );
      });
    }

    var verSu = document.getElementById("checkoutAuthVerifySu");
    if (verSu) {
      verSu.addEventListener("click", function () {
        var msgEl = document.getElementById("checkoutAuthMsgSu");
        checkoutAuthSetMsg(msgEl, "");
        var em = normalizeCheckoutEmail(
          document.getElementById("checkoutAuthEmailSu") && document.getElementById("checkoutAuthEmailSu").value
        );
        var otp = String((document.getElementById("checkoutAuthOtpSu") && document.getElementById("checkoutAuthOtpSu").value) || "")
          .replace(/\D/g, "")
          .slice(0, 6);
        if (!em || otp.length !== 6) {
          checkoutAuthSetMsg(msgEl, "Enter email and 6-digit code.");
          return;
        }
        verSu.disabled = true;
        var nm0 = (document.getElementById("checkoutAuthNameSu") && document.getElementById("checkoutAuthNameSu").value) || "";
        checkoutPostJson(base + "/api/guest-auth/signup/verify", { email: em, code: otp, name: nm0 }, function (err, json) {
          verSu.disabled = false;
          if (err) {
            if (err.status === 409 || err.code === "USE_LOGIN") {
              checkoutAuthSetMsg(msgEl, err.message || "Use Log in.");
              return;
            }
            checkoutAuthSetMsg(msgEl, err.message || "Verification failed.");
            return;
          }
          checkoutAfterVerifySuccess(em, json, nm0);
          checkoutAuthSetMsg(msgEl, "Signed in. Your browser cart is merged into this account on this device.", "ok");
        });
      });
    }

    var sendLo = document.getElementById("checkoutAuthSendOtpLo");
    if (sendLo) {
      sendLo.addEventListener("click", function () {
        var msgEl = document.getElementById("checkoutAuthMsgLo");
        checkoutAuthSetMsg(msgEl, "");
        var em = normalizeCheckoutEmail(
          document.getElementById("checkoutAuthEmailLo") && document.getElementById("checkoutAuthEmailLo").value
        );
        if (!em || em.indexOf("@") < 1) {
          checkoutAuthSetMsg(msgEl, "Enter a valid email.");
          return;
        }
        sendLo.disabled = true;
        checkoutPostJson(base + "/api/guest-auth/login/request-otp", { email: em }, function (err) {
          sendLo.disabled = false;
          if (err) {
            checkoutAuthSetMsg(msgEl, err.message || "Could not send code.");
            return;
          }
          checkoutAuthSetMsg(msgEl, "Check your email for the code (5 minutes).", "ok");
        });
      });
    }

    var verLo = document.getElementById("checkoutAuthVerifyLo");
    if (verLo) {
      verLo.addEventListener("click", function () {
        var msgEl = document.getElementById("checkoutAuthMsgLo");
        checkoutAuthSetMsg(msgEl, "");
        var em = normalizeCheckoutEmail(
          document.getElementById("checkoutAuthEmailLo") && document.getElementById("checkoutAuthEmailLo").value
        );
        var otp = String((document.getElementById("checkoutAuthOtpLo") && document.getElementById("checkoutAuthOtpLo").value) || "")
          .replace(/\D/g, "")
          .slice(0, 6);
        if (!em || otp.length !== 6) {
          checkoutAuthSetMsg(msgEl, "Enter email and 6-digit code.");
          return;
        }
        verLo.disabled = true;
        checkoutPostJson(base + "/api/guest-auth/login/verify", { email: em, code: otp }, function (err, json) {
          verLo.disabled = false;
          if (err) {
            checkoutAuthSetMsg(msgEl, err.message || "Verification failed.");
            return;
          }
          if (window.CRAFT_AUTH_DB && window.CRAFT_AUTH_DB.getUser && window.CRAFT_AUTH_DB.putUser) {
            window.CRAFT_AUTH_DB.getUser(em, function (e2, user) {
              var name = (user && user.name) || "";
              var createdAt = (user && user.createdAt) || Date.now();
              window.CRAFT_AUTH_DB.putUser({ email: em, name: name, createdAt: createdAt }, function () {
                checkoutAfterVerifySuccess(em, json, name);
                checkoutAuthSetMsg(msgEl, "Signed in.", "ok");
              });
            });
          } else {
            checkoutAfterVerifySuccess(em, json, "");
            checkoutAuthSetMsg(msgEl, "Signed in.", "ok");
          }
        });
      });
    }
  }

  function gfQuery() {
    return document.getElementById("globalFindQuery");
  }
  function gfSort() {
    return document.getElementById("globalFindSort");
  }
  function gfHint() {
    return document.getElementById("globalFindHint");
  }

  function digitsOnly(s) {
    return String(s || "").replace(/\D/g, "");
  }

  function normalizeIndiaMobile10(raw) {
    var x = digitsOnly(raw);
    if (x.length === 12 && x.indexOf("91") === 0) x = x.slice(2);
    if (x.length === 11 && x.charAt(0) === "0") x = x.slice(1);
    return x.length === 10 ? x : "";
  }

  function formatIndiaPhoneDisplay10(ten) {
    var d = String(ten || "");
    if (d.length !== 10 || !/^\d{10}$/.test(d)) return "";
    return "+91 " + d.slice(0, 5) + " " + d.slice(5);
  }

  function partialHayMatch(hay, queryRaw) {
    var h = String(hay || "")
      .toLowerCase()
      .replace(/\s+/g, " ");
    var q = String(queryRaw || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!q) return true;
    var parts = q.split(" ").filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      if (h.indexOf(parts[i]) === -1) return false;
    }
    return true;
  }

  /** Live Server / static hosts: checkout HTML is not the Express API — point to Node port. */
  var BILL_STATIC_SERVER_PORTS = {
    "5500": 1,
    "5501": 1,
    "8080": 1,
    "8888": 1,
    "3001": 1,
    "5173": 1,
    "5174": 1,
    "4173": 1,
  };

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

  function billIsLoopbackHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
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
        if (t.length) return t;
      }
    } catch (_) {}
    var po = billApiPortOverride() || "3847";
    try {
      if (window.location && window.location.protocol !== "file:") {
        var loc = window.location;
        var port = String(loc.port || (loc.protocol === "https:" ? "443" : "80"));
        if (port !== po) {
          if (billIsLoopbackHost(loc.hostname)) {
            return "http://127.0.0.1:" + po;
          }
          if (billIsPrivateLanHost(loc.hostname)) {
            return "http://" + loc.hostname + ":" + po;
          }
        }
        if (BILL_STATIC_SERVER_PORTS[port]) {
          return "http://127.0.0.1:" + po;
        }
        return String(loc.origin).replace(/\/+$/, "");
      }
    } catch (_) {}
    var pFile = billApiPortOverride();
    if (pFile) return "http://127.0.0.1:" + pFile;
    return "http://127.0.0.1:3847";
  }

  /** Avoid res.json() on HTML error pages (Unexpected token '<'). */
  function parseApiJson(res) {
    return res.text().then(function (text) {
      var trimmed = String(text || "").trim();
      if (trimmed.charAt(0) === "<") {
        throw new Error(
          "The server returned a web page instead of JSON. Your checkout page is probably not talking to the Node API " +
            "(e.g. Live Server on :5500 while the API runs on another port). Fix: on the <html> tag set " +
            'data-bill-api-base="http://127.0.0.1:YOUR_PORT" or data-bill-api-port="YOUR_PORT", then run npm start in server/.'
        );
      }
      var j = {};
      if (trimmed) {
        try {
          j = JSON.parse(trimmed);
        } catch (e) {
          throw new Error("Server did not return valid JSON. Is the bill API running?");
        }
      }
      return { okHttp: res.ok, json: j };
    });
  }

  function billApiSecret() {
    try {
      var v = document.documentElement.getAttribute("data-bill-api-secret");
      return v ? String(v).trim() : "";
    } catch (_) {
      return "";
    }
  }

  function buildBillItemsForApi() {
    return CART.load().map(function (line) {
      var sz = D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size;
      var sizeKey = String(line.size || "")
        .trim()
        .toLowerCase()
        .slice(0, 1);
      if (sizeKey !== "s" && sizeKey !== "m" && sizeKey !== "l") sizeKey = "";
      return {
        productId: String(line.id || ""),
        sizeKey: sizeKey,
        name: String(line.name || "Item"),
        sizeLabel: String(sz || line.size || ""),
        qty: Math.max(1, Math.floor(Number(line.qty) || 1)),
        unitPrice: Number(line.price) || 0,
        image: String(getLineImage(line) || "").slice(0, 500),
      };
    });
  }

  function buildGuestPayloadFromForm() {
    function val(id) {
      var el = document.getElementById(id);
      return el && el.value != null ? String(el.value).trim() : "";
    }
    return {
      name: val("guestName"),
      email: val("guestEmail"),
      phone: val("guestPhone"),
      addrLine1: val("addrLine1"),
      addrLine2: val("addrLine2"),
      city: val("city"),
      state: val("state"),
      zip: val("zip"),
      country: val("country"),
    };
  }

  function postSaveGuestAddress() {
    var base = billApiBase();
    if (!base) return Promise.reject(new Error("Bill API URL missing. Use http:// (not file://) and run the server, or set data-bill-api-base on <html>."));
    var headers = guestAuthHeaders();
    return fetch(base + "/api/save-guest-address", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        guest: buildGuestPayloadFromForm(),
      }),
    })
      .then(function (res) {
        return parseApiJson(res).then(function (x) {
          var j = x.json;
          if (!x.okHttp || !j.ok) {
            var er = new Error((j && j.error) || res.statusText || "Could not save guest address");
            if (j && j.code) {
              er.code = j.code;
            }
            throw er;
          }
          return j;
        });
      })
      .catch(function (err) {
        var msg = String((err && err.message) || err || "");
        if (msg.indexOf("Failed to fetch") !== -1) {
          throw new Error(
            "Could not reach the bill API at " +
              base +
              ". Start the server (npm start in server/). If checkout is on a different port than the API, set data-bill-api-port on <html> to your API port, or run once in the console: localStorage.setItem(\"craftguruBillApiPort\",\"YOUR_PORT\")."
          );
        }
        throw err;
      });
  }

  function postCheckoutTestComplete() {
    var base = billApiBase();
    if (!base) return Promise.reject(new Error("Bill API URL missing."));
    var headers = guestAuthHeaders();
    var sec = billApiSecret();
    if (sec) headers["x-bill-api-secret"] = sec;
    return fetch(base + "/api/checkout-test-complete", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        guest: buildGuestPayloadFromForm(),
        items: buildBillItemsForApi(),
      }),
    }).then(function (res) {
      return parseApiJson(res).then(function (x) {
        var j = x.json;
        if (!x.okHttp || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Test checkout failed");
        }
        return j;
      });
    });
  }

  function triggerFileDownload(blob, filename) {
    filename = filename || "Craftguru-order-bill.pdf";
    if (!blob || blob.size < 1) {
      window.alert("Could not create the file. Try another browser or disable strict download blocking.");
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.msSaveOrOpenBlob) {
        navigator.msSaveOrOpenBlob(blob, filename);
        return;
      }
    } catch (_) {}

    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;";
    document.body.appendChild(a);
    requestAnimationFrame(function () {
      try {
        a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      } catch (_) {
        a.click();
      }
      setTimeout(function () {
        try {
          document.body.removeChild(a);
        } catch (_) {}
        URL.revokeObjectURL(url);
      }, 4500);
    });
  }

  function closeResultPopup() {
    var pop = document.getElementById("checkoutResultPopup");
    if (pop) pop.setAttribute("hidden", "hidden");
  }

  function showResultPopup(outcome) {
    var pop = document.getElementById("checkoutResultPopup");
    if (!pop) return;
    var icon = document.getElementById("checkoutResultIcon");
    var title = document.getElementById("checkoutResultTitle");
    var msg = document.getElementById("checkoutResultMsg");
    pop.classList.toggle("checkout-result-popup--fail", outcome !== "success");
    if (icon) icon.textContent = outcome === "success" ? "✓" : "!";
    if (title) {
      title.textContent =
        outcome === "success" ? "Your payment is successful" : "Payment not completed";
    }
    if (msg) {
      msg.textContent =
        outcome === "success"
          ? "Your payment was verified with Razorpay. We will confirm your order on WhatsApp +91-8824350056."
          : "Payment did not complete. You can try Pay now again or confirm your order and pay later.";
    }
    pop.removeAttribute("hidden");
  }

  /** Paid test or Razorpay: persist guest session from server, clear cart, open My orders. */
  function afterPaidCheckoutNavigate(j) {
    var ge = document.getElementById("guestEmail");
    var emailNorm = normalizeCheckoutEmail(ge && ge.value);
    try {
      if (j && j.token) localStorage.setItem(GUEST_TOKEN_KEY, j.token);
    } catch (_) {}
    setCheckoutSessionEmail(emailNorm);
    if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogin === "function") {
      window.RESIN_CART.onAccountLogin();
    }
    var nm = (els.guestName && els.guestName.value) || "";
    if (window.CRAFT_AUTH_DB && window.CRAFT_AUTH_DB.putUser) {
      window.CRAFT_AUTH_DB.putUser(
        { email: emailNorm, name: String(nm).trim(), createdAt: Date.now() },
        function () {}
      );
    }
    if (CART && typeof CART.clear === "function") {
      CART.clear();
    }
    try {
      window.dispatchEvent(new CustomEvent("resinCartChanged"));
    } catch (_) {}
    if (window.RESIN_SHELL) {
      if (window.RESIN_SHELL.updateBadge) window.RESIN_SHELL.updateBadge();
      if (window.RESIN_SHELL.renderDrawer) window.RESIN_SHELL.renderDrawer();
    }
    closePayModal();
    closeResultPopup();
    var oid = j && j.orderId != null ? String(j.orderId) : "";
    var tag = j && j.tagRef ? String(j.tagRef) : "";
    var q =
      "?paid=1" + (oid ? "&orderId=" + encodeURIComponent(oid) : "") + (tag ? "&tag=" + encodeURIComponent(tag) : "");
    window.location.href = "account.html" + q;
  }

  function escapeHtml(s) {
    var el = document.createElement("div");
    el.textContent = s;
    return el.innerHTML;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  function fmt(n) {
    return CART.formatMoney(n);
  }

  function postPreviewPdfBlob(url, body) {
    var headers = { "Content-Type": "application/json" };
    var sec = billApiSecret();
    if (sec) headers["x-bill-api-secret"] = sec;
    return fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var s = String(t || "").trim();
          if (s.charAt(0) === "<") {
            throw new Error(
              "PDF API returned a web page, not a file. Set data-bill-api-base or data-bill-api-port on <html> so checkout hits your Node server."
            );
          }
          throw new Error(s ? s.slice(0, 240) : res.statusText || "PDF preview failed");
        });
      }
      return res.blob().then(function (blob) {
        if (blob && blob.size > 400) return blob;
        throw new Error("Server returned an empty PDF.");
      });
    });
  }

  function postRazorpayOrder(items) {
    var base = billApiBase();
    if (!base) return Promise.reject(new Error("missing bill API base"));
    var headers = { "Content-Type": "application/json" };
    var sec = billApiSecret();
    if (sec) headers["x-bill-api-secret"] = sec;
    return fetch(base + "/api/razorpay-order", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ items: items }),
    }).then(function (res) {
      return parseApiJson(res).then(function (x) {
        var j = x.json;
        if (!x.okHttp || !j.ok) {
          var err = new Error((j && j.error) || res.statusText || "Could not start Razorpay order");
          throw err;
        }
        return j;
      });
    });
  }

  function postRazorpayVerify(paymentResponse, guest, items) {
    var base = billApiBase();
    if (!base) return Promise.reject(new Error("missing bill API base"));
    var headers = guestAuthHeaders();
    var sec = billApiSecret();
    if (sec) headers["x-bill-api-secret"] = sec;
    var body = {
      razorpay_order_id: paymentResponse.razorpay_order_id,
      razorpay_payment_id: paymentResponse.razorpay_payment_id,
      razorpay_signature: paymentResponse.razorpay_signature,
    };
    if (guest && items && items.length) {
      body.guest = guest;
      body.items = items;
    }
    return fetch(base + "/api/razorpay-verify", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    }).then(function (res) {
      return parseApiJson(res).then(function (x) {
        var j = x.json;
        if (!x.okHttp || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Payment verification failed");
        }
        return j;
      });
    });
  }

  function downloadBillPdfNow() {
    var items = buildBillItemsForApi();
    if (!items.length) {
      window.alert("Your cart is empty.");
      return;
    }
    var base = billApiBase();
    if (!base) {
      window.alert(
        "Bill server URL is missing. Run npm start in server/ and open checkout over http:// (same host and port as the API), or set data-bill-api-base on <html>."
      );
      return;
    }
    var ten = normalizeIndiaMobile10(els.guestPhone && els.guestPhone.value);
    var payload = { items: items };
    if (ten) payload.phone = ten;
    postPreviewPdfBlob(base + "/api/preview-bill-pdf", payload)
      .then(function (blob) {
        triggerFileDownload(blob, "Craftguru-order-bill.pdf");
      })
      .catch(function (err) {
        var m = String((err && err.message) || "PDF download failed.");
        window.alert(
          m +
            "\n\nTip: keep npm start running in server/, open checkout over http:// (not file://), and use the same machine if the API is 127.0.0.1."
        );
      });
  }

  function imgUrl(rel) {
    return D.imageUrl ? D.imageUrl(rel) : rel;
  }

  function getLineImage(line) {
    if (line && line.image) return line.image;
    if (!D || !D.getProduct || !line || !line.id) return "";
    var p = D.getProduct(line.id);
    return p && p.image ? p.image : "";
  }

  function lineTotalAmt(line) {
    return (line.price || 0) * (line.qty || 1);
  }

  function sortLinesForDisplay(lines, sortKey) {
    var arr = (lines || []).slice();
    if (sortKey === "name-asc") {
      arr.sort(function (a, b) {
        return (a.name || "").localeCompare(b.name || "");
      });
    } else if (sortKey === "name-desc") {
      arr.sort(function (a, b) {
        return (b.name || "").localeCompare(a.name || "");
      });
    } else if (sortKey === "line-low") {
      arr.sort(function (a, b) {
        return lineTotalAmt(a) - lineTotalAmt(b);
      });
    } else if (sortKey === "line-high") {
      arr.sort(function (a, b) {
        return lineTotalAmt(b) - lineTotalAmt(a);
      });
    }
    return arr;
  }

  function applyCheckoutLineFilter() {
    var inp = gfQuery();
    var q = (inp && inp.value) || "";
    q = q.trim();
    var total = 0;
    var n = 0;
    if (els.lines) {
      els.lines.querySelectorAll(".checkout-line").forEach(function (li) {
        total++;
        var hay = li.getAttribute("data-checkout-hay") || "";
        var match = partialHayMatch(hay, q);
        li.classList.toggle("checkout-line--dimmed", !!(q && !match));
        if (match) n++;
      });
    }
    if (els.snipsGrid) {
      els.snipsGrid.querySelectorAll(".checkout-snip-wrap").forEach(function (w) {
        var hay = w.getAttribute("data-checkout-hay") || "";
        var match = partialHayMatch(hay, q);
        w.classList.toggle("checkout-line--dimmed", !!(q && !match));
      });
    }
    var h = gfHint();
    if (h) {
      h.textContent =
        q && total > 0 && n < total
          ? n + " of " + total + " lines match. Totals include your full cart."
          : "";
    }
  }

  function setStepFillVisible(on) {
    if (!els.stepFill || !els.stepReview) return;
    if (on) {
      els.stepReview.classList.add("checkout-hidden");
      els.stepReview.setAttribute("hidden", "hidden");
      els.stepFill.classList.remove("checkout-hidden");
      els.stepFill.removeAttribute("hidden");
      if (els.stepLabel) els.stepLabel.textContent = "Step 2 of 2";
    } else {
      els.stepFill.classList.add("checkout-hidden");
      els.stepFill.setAttribute("hidden", "hidden");
      els.stepReview.classList.remove("checkout-hidden");
      els.stepReview.removeAttribute("hidden");
      if (els.stepLabel) els.stepLabel.textContent = "Step 1 of 2";
    }
  }

  function goToDetailsStep() {
    setStepFillVisible(true);
    if (window.RESIN_SHELL && window.RESIN_SHELL.closeDrawer) {
      window.RESIN_SHELL.closeDrawer();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    loadGuestSession().then(function (me) {
      if (me && me.email) {
        var ge = document.getElementById("guestEmail");
        if (ge && !String(ge.value || "").trim()) {
          ge.value = me.email;
        }
      }
      if (els.guestName) {
        setTimeout(function () {
          try {
            els.guestName.focus({ preventScroll: false });
          } catch (_) {
            els.guestName.focus();
          }
        }, 320);
      }
    });
  }

  function goToReviewStep() {
    setStepFillVisible(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderSnips(lines) {
    if (!els.snipsGrid) return;
    els.snipsGrid.innerHTML = "";
    (lines || []).forEach(function (line) {
      var imgRel = getLineImage(line);
      var wrap = document.createElement("div");
      wrap.className = "checkout-snip-wrap";
      var href = "product.html?id=" + encodeURIComponent(line.id);
      var imgHtml = imgRel
        ? '<img src="' + escapeAttr(imgUrl(imgRel)) + '" alt="" loading="lazy" width="92" height="92" />'
        : '<div class="checkout-snip__ph" aria-hidden="true"></div>';
      wrap.innerHTML =
        '<a class="checkout-snip" href="' +
        escapeAttr(href) +
        '" aria-label="Open ' +
        escapeAttr(line.name || "product") +
        '">' +
        imgHtml +
        '<span class="checkout-snip__meta">' +
        escapeHtml(line.name || "") +
        "</span></a>" +
        '<button type="button" class="checkout-snip__remove" data-remove-id="' +
        escapeAttr(line.id) +
        '" data-remove-size="' +
        escapeAttr(line.size) +
        '" aria-label="Remove ' +
        escapeAttr(line.name || "item") +
        ' from cart">×</button>';
      var szMeta = D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size;
      var amt = lineTotalAmt(line);
      var hay =
        (line.name || "") +
        " " +
        szMeta +
        " " +
        String(line.qty || 1) +
        " " +
        String(line.price || 0) +
        " " +
        fmt(amt) +
        " " +
        fmt(line.price || 0);
      wrap.setAttribute("data-checkout-hay", hay.toLowerCase());
      els.snipsGrid.appendChild(wrap);
    });
  }

  function renderLines(lines) {
    if (!els.lines) return;
    els.lines.innerHTML = "";
    lines.forEach(function (line) {
      var sz = D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size;
      var lineAmt = (line.price || 0) * (line.qty || 1);
      var imgRel = getLineImage(line);
      var href = "product.html?id=" + encodeURIComponent(line.id);
      var li = document.createElement("li");
      li.className = "checkout-line";
      li.innerHTML =
        '<a class="checkout-line__link" href="' +
        escapeAttr(href) +
        '">' +
        (imgRel
          ? '<img src="' + escapeAttr(imgUrl(imgRel)) + '" alt="" width="56" height="56" />'
          : '<span class="checkout-line__ph" aria-hidden="true"></span>') +
        '<div class="checkout-line__body">' +
        "<strong>" +
        escapeHtml(line.name) +
        "</strong>" +
        "<span>" +
        escapeHtml(sz) +
        " · Qty " +
        (line.qty || 1) +
        " · " +
        fmt(line.price) +
        " ea</span>" +
        "</div>" +
        "</a>" +
        '<button type="button" class="checkout-line__remove" data-remove-id="' +
        escapeAttr(line.id) +
        '" data-remove-size="' +
        escapeAttr(line.size) +
        '" title="Remove" aria-label="Remove ' +
        escapeAttr(line.name || "item") +
        '">×</button>' +
        '<span class="checkout-line__price">' +
        fmt(lineAmt) +
        "</span>";
      var hay =
        (line.name || "") +
        " " +
        sz +
        " " +
        String(line.qty || 1) +
        " " +
        String(line.price || 0) +
        " " +
        fmt(lineAmt) +
        " " +
        fmt(line.price || 0);
      li.setAttribute("data-checkout-hay", hay.toLowerCase());
      els.lines.appendChild(li);
    });
  }

  function refreshCheckout() {
    if (els.success && !els.success.classList.contains("checkout-hidden")) {
      return;
    }

    var lines = CART.load();
    if (lines.length === 0) {
      window.location.href = "index.html";
      return;
    }

    var subtotalVal = CART.subtotal();
    var split = splitGstFromInclusive(subtotalVal);
    var shipping = subtotalVal >= FREE_SHIP_MIN ? 0 : SHIP_FLAT;
    var grand = Math.round((subtotalVal + shipping) * 100) / 100;

    var sEl = gfSort();
    var sortKey = (sEl && sEl.value) || "default";
    var displayLines = sortLinesForDisplay(lines, sortKey);
    renderLines(displayLines);
    renderSnips(displayLines);
    applyCheckoutLineFilter();

    if (els.sub) els.sub.textContent = fmt(subtotalVal);
    if (els.taxable) els.taxable.textContent = fmt(split.taxable);
    if (els.ship) els.ship.textContent = shipping === 0 ? "Free" : fmt(shipping);
    if (els.tax) els.tax.textContent = fmt(split.gst);
    if (els.total) els.total.textContent = fmt(grand);
    if (els.modalSub) els.modalSub.textContent = fmt(subtotalVal);
    if (els.modalTaxable) els.modalTaxable.textContent = fmt(split.taxable);
    if (els.modalShip) els.modalShip.textContent = shipping === 0 ? "Free" : fmt(shipping);
    if (els.modalTax) els.modalTax.textContent = fmt(split.gst);
    if (els.modalGrand) els.modalGrand.textContent = fmt(grand);
  }

  function setPaymentUi(mode) {
    var label = document.getElementById("checkoutPaymentStatusLabel");
    var msg = document.getElementById("checkoutPaymentStatusMsg");
    var st = document.getElementById("checkoutPaymentStatus");
    if (!label || !msg || !st) return;

    if (mode === "idle") {
      st.setAttribute("data-state", "idle");
      label.textContent = "Ready";
      msg.textContent =
        "When you tap Pay now, your total is shown here. Razorpay keys must be set in server .env for the Pay button to work.";
      return;
    }
    if (mode === "ready") {
      st.setAttribute("data-state", "scan");
      label.textContent = "Checkout";
      msg.innerHTML =
        "Review the amount on the left, then use <strong>Pay securely now</strong> — the charge matches your cart on the server.";
      return;
    }
    if (mode === "fail") {
      st.setAttribute("data-state", "fail");
      label.textContent = "Payment";
      msg.textContent =
        "Razorpay reported a problem or the window was closed before paying. Try again or WhatsApp +91-8824350056.";
    }
  }

  function openPayModal() {
    if (!els.payModal) return;
    els.payModal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    setPaymentUi("ready");
    try {
      if (els.payModalClose) els.payModalClose.focus();
    } catch (_) {}
  }

  function closePayModal() {
    closeResultPopup();
    if (!els.payModal) return;
    els.payModal.setAttribute("hidden", "hidden");
    document.body.style.overflow = "";
    setPaymentUi("idle");
  }

  function onRemoveClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest(".checkout-line__remove, .checkout-snip__remove") : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var id = btn.getAttribute("data-remove-id");
    var size = btn.getAttribute("data-remove-size");
    if (CART.removeLine) CART.removeLine(id, size);
    refreshCheckout();
    if (window.RESIN_SHELL) {
      window.RESIN_SHELL.updateBadge();
      window.RESIN_SHELL.renderDrawer();
    }
  }

  function bindRemoveDelegation() {
    if (removeDelegationDone) return;
    if (els.lines) els.lines.addEventListener("click", onRemoveClick);
    if (els.snipsGrid) els.snipsGrid.addEventListener("click", onRemoveClick);
    removeDelegationDone = true;
  }

  function boot() {
    if (CART.countItems() === 0) {
      window.location.href = "index.html";
      return;
    }

    bindRemoveDelegation();

    goToDetailsStep();

    if (els.goDetails) {
      els.goDetails.addEventListener("click", function () {
        goToDetailsStep();
      });
    }

    if (els.backReview) {
      els.backReview.addEventListener("click", function () {
        goToReviewStep();
      });
    }

    if (els.openUpiModal) {
      els.openUpiModal.addEventListener("click", function () {
        openPayModal();
      });
    }
    if (els.payModalBackdrop) {
      els.payModalBackdrop.addEventListener("click", function () {
        closePayModal();
      });
    }
    if (els.payModalClose) {
      els.payModalClose.addEventListener("click", function () {
        closePayModal();
      });
    }
    if (els.btnCheckoutTestPay) {
      els.btnCheckoutTestPay.addEventListener("click", function () {
        if (!els.form || !els.form.checkValidity()) {
          window.alert("Please fill guest name, email, phone, and full shipping address on the checkout form first.");
          return;
        }
        var items = buildBillItemsForApi();
        if (!items.length) {
          window.alert("Your cart is empty.");
          return;
        }
        els.btnCheckoutTestPay.disabled = true;
        postCheckoutTestComplete()
          .then(function (j) {
            if (!j || !j.orderId) {
              throw new Error("Test checkout did not return an order.");
            }
            afterPaidCheckoutNavigate(j);
          })
          .catch(function (err) {
            window.alert(String((err && err.message) || "Test checkout failed."));
          })
          .then(function () {
            els.btnCheckoutTestPay.disabled = false;
          });
      });
    }
    if (els.btnRazorpayCheckout) {
      els.btnRazorpayCheckout.addEventListener("click", function () {
        var base = billApiBase();
        if (!base) {
          window.alert("Bill server URL missing. Set data-bill-api-base on <html> (see checkout page default).");
          return;
        }
        if (!els.form || !els.form.checkValidity()) {
          window.alert("Please fill guest name, email, phone, and full shipping address before paying.");
          try {
            els.form.reportValidity();
          } catch (_) {}
          return;
        }
        var items = buildBillItemsForApi();
        if (!items.length) {
          window.alert("Your cart is empty.");
          return;
        }
        if (typeof window.Razorpay !== "function") {
          window.alert("Razorpay Checkout did not load. Check your network or disable script blocking.");
          return;
        }
        els.btnRazorpayCheckout.disabled = true;
        postRazorpayOrder(items)
          .then(function (order) {
            var guestEmail = document.getElementById("guestEmail");
            var guestPhone = document.getElementById("guestPhone");
            var email = guestEmail && guestEmail.value ? guestEmail.value.trim() : "";
            var phoneDigits = guestPhone ? normalizeIndiaMobile10(guestPhone.value) : "";
            var options = {
              key: order.keyId,
              amount: order.amount,
              currency: order.currency || "INR",
              order_id: order.orderId,
              name: "Craftguru",
              description: "Order payment",
              theme: { color: "#3b6fd9" },
              prefill: {
                email: email,
                contact: phoneDigits ? "+91" + phoneDigits : "",
              },
              handler: function (response) {
                var guest = buildGuestPayloadFromForm();
                var items = buildBillItemsForApi();
                postRazorpayVerify(response, guest, items)
                  .then(function (j) {
                    if (!j || !j.orderCreated) {
                      throw new Error(
                        "Payment verified but no order was saved. Use the full checkout address form, ensure the server has DATABASE_URL, and if BILL_API_SECRET is set add data-bill-api-secret on this page's <html>."
                      );
                    }
                    afterPaidCheckoutNavigate(j);
                  })
                  .catch(function (err) {
                    window.alert(String((err && err.message) || "Could not verify payment on the server."));
                  });
              },
            };
            var rzp = new window.Razorpay(options);
            rzp.on("payment.failed", function () {
              setPaymentUi("fail");
            });
            rzp.open();
          })
          .catch(function (err) {
            window.alert(String((err && err.message) || "Could not start Razorpay."));
          })
          .then(function () {
            els.btnRazorpayCheckout.disabled = false;
          });
      });
    }
    if (els.paymentCancelBtn) {
      els.paymentCancelBtn.addEventListener("click", function () {
        closePayModal();
      });
    }

    var resPop = document.getElementById("checkoutResultPopup");
    var resOk = document.getElementById("checkoutResultOk");
    var resBd = document.getElementById("checkoutResultBackdrop");
    if (resOk) {
      resOk.addEventListener("click", function () {
        closeResultPopup();
      });
    }
    if (resBd) {
      resBd.addEventListener("click", function () {
        closeResultPopup();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (resPop && !resPop.hasAttribute("hidden")) {
        closeResultPopup();
        return;
      }
      if (!els.payModal || els.payModal.hasAttribute("hidden")) return;
      closePayModal();
    });

    if (els.form && !formBound) {
      formBound = true;
      var addrMsg = document.getElementById("checkoutAddressMsg");
      var addBtn = document.getElementById("checkoutAddAddressBtn");
      els.form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!els.form.checkValidity()) {
          els.form.reportValidity();
          return;
        }
        if (!buildBillItemsForApi().length) {
          window.alert("Your cart is empty.");
          return;
        }
        var modeSaved = document.getElementById("checkoutAddrModeSaved") && document.getElementById("checkoutAddrModeSaved").checked;
        if (modeSaved) {
          var fsEl = document.getElementById("checkoutSavedAddrFieldset");
          var raw = fsEl && fsEl.dataset.addressesJson;
          var list = [];
          try {
            list = raw ? JSON.parse(raw) : [];
          } catch (_) {
            list = [];
          }
          var sel = document.getElementById("checkoutSavedAddrSelect");
          var idx = sel ? parseInt(sel.value, 10) : 0;
          if (!list.length || !Number.isFinite(idx) || idx < 0 || idx >= list.length) {
            window.alert("Choose a saved address or switch to entering a new address.");
            return;
          }
          applySavedAddress(list[idx]);
        }
        if (addBtn) addBtn.disabled = true;
        if (addrMsg) {
          addrMsg.setAttribute("hidden", "hidden");
          addrMsg.textContent = "";
        }
        postSaveGuestAddress()
          .then(function (j) {
            if (addrMsg) {
              var gid = j.guestId != null ? "Guest id " + j.guestId + ". " : j.fileMode ? "File mode (no DB). " : "";
              addrMsg.textContent =
                "Shipping address saved. " +
                gid +
                "Complete payment with Pay now to create an order (use “Pay without Razorpay” while testing).";
              addrMsg.removeAttribute("hidden");
            }
            window.scrollTo({ top: addrMsg ? addrMsg.offsetTop : 0, behavior: "smooth" });
          })
          .catch(function (err) {
            var msg = String((err && err.message) || "Could not save address.");
            if (err && err.code === "SIGN_IN_REQUIRED") {
              window.alert(
                msg ||
                  "Your sign-in session expired. Open “Optional: sign in…” and verify your email again, or sign out and save as guest."
              );
              return;
            }
            if (err && err.code === "EMAIL_MISMATCH") {
              window.alert(msg || "Use the same email in the form as the one you signed in with.");
              return;
            }
            if (err && err.code === "USE_LOGIN") {
              window.alert(
                "This phone or email is already linked to another account. Use Sign in with email code above, or use the exact same phone and email you used before."
              );
              return;
            }
            window.alert(
              msg +
                " Run npm start in server/. If the page is not served from that same host/port, set data-bill-api-port on <html> to your API port."
            );
          })
          .then(function () {
            if (addBtn) addBtn.disabled = false;
          });
      });
    }

    var gq = gfQuery();
    var gs = gfSort();
    if (gs && gs.options && gs.options.length === 0) {
      [
        ["default", "Cart order"],
        ["name-asc", "Name · A → Z"],
        ["name-desc", "Name · Z → A"],
        ["line-low", "Line total · low → high"],
        ["line-high", "Line total · high → low"],
      ].forEach(function (o) {
        var op = document.createElement("option");
        op.value = o[0];
        op.textContent = o[1];
        gs.appendChild(op);
      });
    }
    if (gq) {
      gq.addEventListener("input", applyCheckoutLineFilter);
    }
    if (gs) {
      gs.addEventListener("change", refreshCheckout);
    }

    if (els.btnDownloadBillPdf) {
      els.btnDownloadBillPdf.addEventListener("click", function () {
        downloadBillPdfNow();
      });
    }

    refreshCheckout();

    bindCheckoutAuth();

    var signOutBtn = document.getElementById("checkoutGuestSignOutBtn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        try {
          localStorage.removeItem(GUEST_TOKEN_KEY);
        } catch (_) {}
        setCheckoutSessionEmail("");
        if (window.RESIN_CART && typeof window.RESIN_CART.onAccountLogout === "function") {
          window.RESIN_CART.onAccountLogout();
        }
        refreshGuestCheckoutUi();
        var ge = document.getElementById("guestEmail");
        if (ge) {
          ge.readOnly = false;
          ge.value = "";
        }
        var gp = document.getElementById("guestPhone");
        if (gp) {
          gp.readOnly = false;
        }
        if (window.RESIN_SHELL) {
          if (window.RESIN_SHELL.updateBadge) window.RESIN_SHELL.updateBadge();
          if (window.RESIN_SHELL.renderDrawer) window.RESIN_SHELL.renderDrawer();
        }
        refreshCheckout();
      });
    }
    var modeNew = document.getElementById("checkoutAddrModeNew");
    var modeSaved = document.getElementById("checkoutAddrModeSaved");
    var picker = document.getElementById("checkoutSavedAddrPicker");
    var selSaved = document.getElementById("checkoutSavedAddrSelect");
    function syncAddrModeUi() {
      var useSaved = modeSaved && modeSaved.checked;
      if (picker) {
        picker.hidden = !useSaved;
      }
      if (useSaved && selSaved) {
        var fsEl = document.getElementById("checkoutSavedAddrFieldset");
        var raw = fsEl && fsEl.dataset.addressesJson;
        var list = [];
        try {
          list = raw ? JSON.parse(raw) : [];
        } catch (_) {
          list = [];
        }
        var idx = parseInt(selSaved.value, 10) || 0;
        if (list[idx]) {
          applySavedAddress(list[idx]);
        }
      }
    }
    if (modeNew) {
      modeNew.addEventListener("change", syncAddrModeUi);
    }
    if (modeSaved) {
      modeSaved.addEventListener("change", syncAddrModeUi);
    }
    if (selSaved) {
      selSaved.addEventListener("change", syncAddrModeUi);
    }

    refreshGuestCheckoutUi();

    var exit = document.getElementById("checkoutPageExit");
    if (exit) {
      exit.addEventListener("click", function () {
        if (window.RESIN_SHELL && window.RESIN_SHELL.closeDrawer) {
          window.RESIN_SHELL.closeDrawer();
        }
      });
    }
  }

  window.addEventListener("resinCartChanged", function () {
    if (els.success && !els.success.classList.contains("checkout-hidden")) return;
    refreshCheckout();
  });

  boot();
})();
