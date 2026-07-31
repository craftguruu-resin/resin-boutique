(function () {
  "use strict";

  var CART = window.RESIN_CART;
  var D = window.RESIN_DATA;
  if (!CART || !D) return;

  /** MRP / line prices include 18% GST; shipping is added without further GST in this flow. */
  var GST_INCLUSIVE_RATE = 0.18;
  var SHIP_FLAT = 10;
  var FREE_SHIP_MIN = 150;
  var PREPAID_DISCOUNT_RATE = 0.05;

  function splitGstFromInclusive(inclTotal) {
    var t = Math.round(Number(inclTotal) * 100) / 100;
    var base = Math.round((t / (1 + GST_INCLUSIVE_RATE)) * 100) / 100;
    var gst = Math.round((t - base) * 100) / 100;
    return { inclusive: t, taxable: base, gst: gst };
  }

  var removeDelegationDone = false;
  var formBound = false;
  var checkoutPhase = "shipping"; /* shipping | payment */
  var googlePlacesReady = false;

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
    stepFill: document.getElementById("checkoutStepFill"),
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
    btnCodCheckout: document.getElementById("btnCodCheckout"),
    valDiscount: document.getElementById("valDiscount"),
    modalDiscount: document.getElementById("checkoutModalDiscount"),
    paymentMethodRadios: document.querySelectorAll('input[name="checkoutPaymentMethod"]'),
    paymentCancelBtn: document.getElementById("checkoutPaymentCancelBtn"),
    guestPhone: document.getElementById("guestPhone"),
    summaryCta: document.getElementById("checkoutSummaryCtaText"),
    summaryHint: document.getElementById("checkoutSummaryHint"),
    savingsBanner: document.getElementById("checkoutSavingsBanner"),
    subtotalLabel: document.getElementById("valSubtotalLabel"),
    sectionPayment: document.getElementById("ckSectionPayment"),
    addrFormFields: document.getElementById("checkoutAddrFormFields"),
    addNewAddrBox: document.getElementById("checkoutAddNewAddrBox"),
    savedAddrCards: document.getElementById("checkoutSavedAddrCards"),
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
      cache: "no-store",
    })
      .then(function (res) {
        var st = res.status;
        return parseApiJson(res).then(function (x) {
          return { status: st, x: x };
        });
      })
      .then(function (o) {
        var j = o.x.json;
        if (o.x.okHttp && j.ok) return j;
        if (o.status === 401 || (j && j.code === "NO_SESSION")) {
          try {
            localStorage.removeItem(GUEST_TOKEN_KEY);
          } catch (_) {}
        }
        return null;
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
    var at = String((addr && addr.addressType) || "").toLowerCase();
    document.querySelectorAll('input[name="addrType"]').forEach(function (inp) {
      inp.checked = inp.value === at;
    });
    if (!document.querySelector('input[name="addrType"]:checked')) {
      var h = document.querySelector('input[name="addrType"][value="home"]');
      if (h) h.checked = true;
    }
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

  function addrTypeLabel(addr) {
    var at = String((addr && addr.addressType) || "home").toLowerCase();
    if (at === "work") return "Work";
    return "Home";
  }

  function formatAddrCardBody(addr) {
    return [addr.addrLine1, addr.addrLine2, addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
  }

  function getSavedAddressesList() {
    var fsEl = document.getElementById("checkoutSavedAddrFieldset");
    var raw = fsEl && fsEl.dataset.addressesJson;
    if (!raw) return [];
    try {
      return JSON.parse(raw) || [];
    } catch (_) {
      return [];
    }
  }

  function renderSavedAddressCards(addresses) {
    var container = els.savedAddrCards;
    if (!container) return;
    var list = addresses || [];
    container.innerHTML = "";
    if (!list.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    list.forEach(function (a, i) {
      var label = document.createElement("label");
      label.className = "ck-addr-card";
      var tag = addrTypeLabel(a);
      label.innerHTML =
        '<input type="radio" name="checkoutSavedAddrPick" value="' +
        i +
        '" />' +
        '<span class="ck-addr-card__tag">' +
        (tag === "Work" ? "💼" : "🏠") +
        " " +
        escapeHtml(tag) +
        "</span>" +
        '<div class="ck-addr-card__body">' +
        escapeHtml(formatAddrCardBody(a)) +
        "</div>" +
        '<button type="button" class="ck-addr-card__edit" data-addr-edit="' +
        i +
        '">Edit</button>';
      container.appendChild(label);
    });
    var first = container.querySelector('input[name="checkoutSavedAddrPick"]');
    if (first) first.checked = true;
    syncAddrPickUi();
  }

  function syncAddrPickUi() {
    var useNew = !document.querySelector('input[name="checkoutSavedAddrPick"]:checked');
    var modeNew = document.getElementById("checkoutAddrModeNew");
    var modeSaved = document.getElementById("checkoutAddrModeSaved");
    if (modeNew) modeNew.checked = useNew;
    if (modeSaved) modeSaved.checked = !useNew;
    if (els.addNewAddrBox) {
      els.addNewAddrBox.classList.toggle("is-selected", useNew);
    }
    if (els.addrFormFields) {
      if (useNew) {
        els.addrFormFields.removeAttribute("hidden");
      } else {
        els.addrFormFields.setAttribute("hidden", "hidden");
        var picked = document.querySelector('input[name="checkoutSavedAddrPick"]:checked');
        if (picked) {
          var list = getSavedAddressesList();
          var idx = parseInt(picked.value, 10);
          if (list[idx]) applySavedAddress(list[idx]);
        }
      }
    }
    document.querySelectorAll(".ck-addr-card").forEach(function (card) {
      var inp = card.querySelector('input[name="checkoutSavedAddrPick"]');
      card.classList.toggle("is-selected", !!(inp && inp.checked));
    });
  }

  function selectNewAddressMode() {
    document.querySelectorAll('input[name="checkoutSavedAddrPick"]').forEach(function (inp) {
      inp.checked = false;
    });
    syncAddrPickUi();
  }

  function updateCheckoutStepper() {
    var stepper = document.getElementById("checkoutStepper");
    if (!stepper) return;
    var steps = stepper.querySelectorAll(".ck-step[data-step]");
    steps.forEach(function (step) {
      var key = step.getAttribute("data-step");
      step.classList.remove("is-active", "is-done");
      if (checkoutPhase === "shipping") {
        if (key === "cart") step.classList.add("is-done");
        if (key === "shipping") step.classList.add("is-active");
      } else if (checkoutPhase === "payment") {
        if (key === "cart" || key === "shipping") step.classList.add("is-done");
        if (key === "payment") step.classList.add("is-active");
      }
    });
    var linePay = document.getElementById("ckStepLinePayment");
    var lineReview = document.getElementById("ckStepLineReview");
    if (linePay) linePay.classList.toggle("is-done", checkoutPhase === "payment");
    if (lineReview) lineReview.classList.toggle("is-done", false);
  }

  function unlockPaymentSection() {
    checkoutPhase = "payment";
    if (els.sectionPayment) {
      els.sectionPayment.removeAttribute("hidden");
      els.sectionPayment.classList.remove("is-locked");
    }
    document.querySelectorAll('#checkoutInlinePayment input[name="checkoutPaymentMethod"]').forEach(function (inp) {
      inp.disabled = false;
    });
    if (els.summaryCta) els.summaryCta.textContent = "Pay now";
    if (els.summaryHint) {
      els.summaryHint.textContent = "Choose Razorpay or Cash on Delivery above, then pay securely.";
    }
    updateCheckoutStepper();
    refreshCheckout();
    try {
      els.sectionPayment && els.sectionPayment.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {}
  }

  function validateShippingStep() {
    if (!els.form) return false;
    var useSaved = document.getElementById("checkoutAddrModeSaved") && document.getElementById("checkoutAddrModeSaved").checked;
    if (useSaved) {
      var list = getSavedAddressesList();
      var picked = document.querySelector('input[name="checkoutSavedAddrPick"]:checked');
      var idx = picked ? parseInt(picked.value, 10) : -1;
      if (!list.length || !Number.isFinite(idx) || idx < 0 || idx >= list.length) {
        window.alert("Choose a saved address or add a new one.");
        return false;
      }
      applySavedAddress(list[idx]);
    }
    if (!els.form.checkValidity()) {
      try {
        els.form.reportValidity();
      } catch (_) {}
      return false;
    }
    if (!buildBillItemsForApi().length) {
      window.alert("Your cart is empty.");
      return false;
    }
    return true;
  }

  function continueToPayment() {
    if (checkoutPhase !== "shipping") {
      openPayModal();
      return;
    }
    if (!validateShippingStep()) return;
    var cta = els.openUpiModal;
    if (cta) cta.disabled = true;
    postSaveGuestAddress()
      .then(function () {
        unlockPaymentSection();
      })
      .catch(function (err) {
        var msg = String((err && err.message) || "Could not save address.");
        if (err && err.code === "SIGN_IN_REQUIRED") {
          window.alert(msg || "Your sign-in session expired. Sign in again.");
          return;
        }
        if (err && err.code === "EMAIL_MISMATCH") {
          window.alert(msg || "Use the same email as your sign-in.");
          return;
        }
        if (err && err.code === "USE_LOGIN") {
          window.alert("This phone or email is linked to another account. Sign in with your email code.");
          return;
        }
        window.alert(msg);
      })
      .then(function () {
        if (cta) cta.disabled = false;
      });
  }

  function loadGoogleMapsScript(apiKey) {
    return new Promise(function (resolve, reject) {
      if (window.google && window.google.maps && window.google.maps.places) {
        resolve();
        return;
      }
      var existing = document.getElementById("craftguruGoogleMaps");
      if (existing) {
        existing.addEventListener("load", function () {
          resolve();
        });
        existing.addEventListener("error", reject);
        return;
      }
      var s = document.createElement("script");
      s.id = "craftguruGoogleMaps";
      s.async = true;
      s.defer = true;
      s.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(apiKey) +
        "&libraries=places&loading=async&callback=__craftguruMapsReady";
      window.__craftguruMapsReady = function () {
        resolve();
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function parseGooglePlace(place) {
    var out = { line1: "", line2: "", city: "", state: "", zip: "", country: "IN" };
    var comps = (place && place.address_components) || [];
    var route = "";
    var streetNum = "";
    var sublocality = "";
    comps.forEach(function (c) {
      var t = c.types || [];
      if (t.indexOf("street_number") >= 0) streetNum = c.long_name;
      if (t.indexOf("route") >= 0) route = c.long_name;
      if (t.indexOf("sublocality_level_1") >= 0 || t.indexOf("sublocality") >= 0) sublocality = c.long_name;
      if (t.indexOf("locality") >= 0) out.city = c.long_name;
      if (!out.city && t.indexOf("administrative_area_level_2") >= 0) out.city = c.long_name;
      if (t.indexOf("administrative_area_level_1") >= 0) out.state = c.long_name;
      if (t.indexOf("postal_code") >= 0) out.zip = c.long_name;
      if (t.indexOf("country") >= 0) out.country = (c.short_name || "IN").toUpperCase();
    });
    out.line1 = [streetNum, route].filter(Boolean).join(" ").trim();
    if (!out.line1 && sublocality) out.line1 = sublocality;
    if (!out.line1 && place && place.formatted_address) {
      out.line1 = String(place.formatted_address).split(",")[0] || "";
    }
    if (sublocality && out.line1.indexOf(sublocality) === -1) {
      out.line2 = sublocality;
    }
    return out;
  }

  function applyParsedAddress(parsed) {
    function set(id, v) {
      var el = document.getElementById(id);
      if (el && v != null && String(v).length) el.value = String(v);
    }
    set("addrLine1", parsed.line1);
    if (parsed.line2) set("addrLine2", parsed.line2);
    set("city", parsed.city);
    set("state", parsed.state);
    set("zip", parsed.zip);
    set("country", parsed.country || "IN");
  }

  function initGooglePlacesAutocomplete() {
    if (googlePlacesReady) return;
    var line1 = document.getElementById("addrLine1");
    if (!line1) return;
    var base = billApiBase();
    if (!base) return;
    fetch(base + "/api/maps-config", { cache: "no-store" })
      .then(function (res) {
        return res.json();
      })
      .then(function (cfg) {
        if (!cfg || !cfg.configured || !cfg.apiKey) return;
        return loadGoogleMapsScript(cfg.apiKey).then(function () {
          if (!window.google || !google.maps || !google.maps.places) return;
          var ac = new google.maps.places.Autocomplete(line1, {
            componentRestrictions: { country: ["in"] },
            fields: ["address_components", "formatted_address"],
            types: ["address"],
          });
          ac.addListener("place_changed", function () {
            var place = ac.getPlace();
            if (!place || !place.address_components) return;
            applyParsedAddress(parseGooglePlace(place));
            selectNewAddressMode();
          });
          googlePlacesReady = true;
        });
      })
      .catch(function () {});
  }

  function bindSavedAddressCards() {
    if (els.savedAddrCards) {
      els.savedAddrCards.addEventListener("change", function (e) {
        if (e.target && e.target.name === "checkoutSavedAddrPick") syncAddrPickUi();
      });
      els.savedAddrCards.addEventListener("click", function (e) {
        var editBtn = e.target && e.target.closest ? e.target.closest("[data-addr-edit]") : null;
        if (!editBtn) return;
        e.preventDefault();
        var idx = parseInt(editBtn.getAttribute("data-addr-edit"), 10);
        var list = getSavedAddressesList();
        if (list[idx]) {
          applySavedAddress(list[idx]);
          selectNewAddressMode();
        }
      });
    }
    if (els.addNewAddrBox) {
      els.addNewAddrBox.addEventListener("click", function () {
        selectNewAddressMode();
        var a1 = document.getElementById("addrLine1");
        if (a1) {
          try {
            a1.focus();
          } catch (_) {}
        }
      });
    }
    var addLink = document.getElementById("checkoutAddNewAddrLink");
    if (addLink) {
      addLink.addEventListener("click", function () {
        selectNewAddressMode();
      });
    }
    var signInLink = document.getElementById("checkoutSignInLink");
    if (signInLink) {
      signInLink.addEventListener("click", function () {
        var det = document.getElementById("checkoutAuthOptional");
        if (det) {
          try {
            det.open = true;
          } catch (_) {}
          det && det.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
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
          renderSavedAddressCards(me.addresses);
          var addLink = document.getElementById("checkoutAddNewAddrLink");
          if (addLink) addLink.hidden = false;
        } else if (fs) {
          fs.hidden = true;
          renderSavedAddressCards([]);
          var addLink2 = document.getElementById("checkoutAddNewAddrLink");
          if (addLink2) addLink2.hidden = true;
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
          renderSavedAddressCards([]);
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
          checkoutAfterVerifySuccess(em, json, "");
          checkoutAuthSetMsg(msgEl, "Signed in.", "ok");
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

    var chG = document.getElementById("checkoutGoogleSignIn");
    if (chG && window.CRAFT_GOOGLE_SIGNIN && CRAFT_GOOGLE_SIGNIN.isConfigured()) {
      CRAFT_GOOGLE_SIGNIN.bootstrap(function (cred) {
        checkoutPostJson(base + "/api/guest-auth/google/session", { credential: cred }, function (err, json) {
          var msgSu = document.getElementById("checkoutAuthMsgSu");
          var msgLo = document.getElementById("checkoutAuthMsgLo");
          if (err) {
            if (msgSu) checkoutAuthSetMsg(msgSu, err.message || "Google sign-in failed.");
            if (msgLo) checkoutAuthSetMsg(msgLo, err.message || "Google sign-in failed.");
            return;
          }
          var em = json && json.email ? normalizeCheckoutEmail(json.email) : "";
          checkoutAfterVerifySuccess(em, json, "");
          if (msgLo) checkoutAuthSetMsg(msgLo, "Signed in with Google.", "ok");
        });
      });
      CRAFT_GOOGLE_SIGNIN.renderButton(chG, { width: 280 });
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
    "3000": 1,
    "3001": 1,
    "5173": 1,
    "5174": 1,
    "4173": 1,
  };

  function billIsStaticDevPageForEmptyBase() {
    try {
      var loc = window.location;
      if (!loc || loc.protocol === "file:") return true;
      var port = String(loc.port || (loc.protocol === "https:" ? "443" : "80"));
      if (BILL_STATIC_SERVER_PORTS[port]) return true;
      if (billIsLoopbackHost(loc.hostname)) return true;
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
        if (
          t.length === 0 &&
          window.location &&
          window.location.protocol !== "file:" &&
          !billIsStaticDevPageForEmptyBase()
        ) {
          return String(window.location.origin).replace(/\/+$/, "");
        }
        if (t.length) {
          try {
            if (window.location && window.location.protocol !== "file:") {
              var ph = String(window.location.hostname || "").toLowerCase();
              var tl = t.toLowerCase();
              var cfgLocal = tl.indexOf("127.0.0.1") >= 0 || tl.indexOf("localhost") >= 0;
              if (cfgLocal && !billIsLoopbackHost(ph) && !billIsPrivateLanHost(ph)) {
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
      var disp =
        (line.variantLabel && String(line.variantLabel).trim()) || String(sz || line.size || "");
      var lineSize = String(line.size || "")
        .trim()
        .toLowerCase();
      var stock = String(line.stockSlot != null ? line.stockSlot : "")
        .trim()
        .toLowerCase()
        .slice(0, 1);
      if (stock !== "s" && stock !== "m" && stock !== "l") {
        var m0 = lineSize.match(/^s:([sml])\b/);
        if (m0) stock = m0[1].toLowerCase();
        else {
          var c0 = lineSize.slice(0, 1);
          if (c0 === "s" || c0 === "m" || c0 === "l") stock = c0;
        }
        if (stock !== "s" && stock !== "m" && stock !== "l") stock = "m";
      }
      var sizeKey = lineSize.length ? lineSize : stock;
      return {
        productId: String(line.id || ""),
        sizeKey: String(sizeKey).slice(0, 200),
        name: String(lineDisplayName(line) || "Item"),
        sizeLabel: String(disp).slice(0, 500),
        qty: Math.max(1, Math.floor(Number(line.qty) || 1)),
        unitPrice: Number(line.price) || 0,
        image: String(getLineImage(line) || "").slice(0, 500),
        lineExtra: line.lineExtra && typeof line.lineExtra === "object" ? line.lineExtra : undefined,
        stockSlot: stock,
      };
    });
  }

  function addressTypeFromForm() {
    var r = document.querySelector('input[name="addrType"]:checked');
    var v = r && r.value ? String(r.value).trim().toLowerCase() : "home";
    if (v !== "home" && v !== "work" && v !== "other") v = "home";
    return v;
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
      addressType: addressTypeFromForm(),
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
          : "Payment did not complete. Tap Pay now to try Razorpay again, or WhatsApp +91-8824350056 for help.";
    }
    pop.removeAttribute("hidden");
  }

  /** After successful checkout: persist guest session from server, clear cart, open My orders. */
  function afterPaidCheckoutNavigate(j, opts) {
    opts = opts || {};
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
    var q = opts.cod ? "?cod=1" : "?paid=1";
    q += oid ? "&orderId=" + encodeURIComponent(oid) : "";
    q += tag ? "&tag=" + encodeURIComponent(tag) : "";
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

  function getCheckoutPaymentMethod() {
    var r = document.querySelector('#checkoutInlinePayment input[name="checkoutPaymentMethod"]:checked') ||
      document.querySelector('input[name="checkoutPaymentMethod"]:checked');
    return r && String(r.value).toLowerCase() === "cod" ? "cod" : "razorpay";
  }

  function computeCheckoutTotals(subtotalVal, paymentMethod) {
    var productValue = Math.round(Number(subtotalVal) * 100) / 100;
    var shipping = productValue >= FREE_SHIP_MIN ? 0 : SHIP_FLAT;
    var prepaidDiscount =
      paymentMethod === "razorpay" ? Math.round(productValue * PREPAID_DISCOUNT_RATE * 100) / 100 : 0;
    var afterDiscount = Math.round(Math.max(0, productValue - prepaidDiscount) * 100) / 100;
    var split = splitGstFromInclusive(afterDiscount);
    var grand = Math.round((afterDiscount + shipping) * 100) / 100;
    return {
      productValue: productValue,
      prepaidDiscount: prepaidDiscount,
      afterDiscount: afterDiscount,
      shipping: shipping,
      taxable: split.taxable,
      gst: split.gst,
      grand: grand,
    };
  }

  function postCheckoutCod(guest, items) {
    var base = billApiBase();
    if (!base) return Promise.reject(new Error("missing bill API base"));
    return fetch(base + "/api/checkout-cod", {
      method: "POST",
      headers: guestAuthHeaders(),
      body: JSON.stringify({ guest: guest, items: items }),
    }).then(function (res) {
      return parseApiJson(res).then(function (x) {
        var j = x.json;
        if (!x.okHttp || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Could not place COD order");
        }
        return j;
      });
    });
  }

  function updatePaymentPanelVisibility() {
    var method = getCheckoutPaymentMethod();
    var razorPanel = document.getElementById("checkoutRazorPanel");
    var codPanel = document.getElementById("checkoutCodPanel");
    var modalTitle = document.getElementById("checkoutPayModalTitle");
    var razorFine = document.getElementById("checkoutRazorpayFine");
    if (razorPanel) razorPanel.hidden = method === "cod";
    if (codPanel) codPanel.hidden = method !== "cod";
    if (razorFine) razorFine.hidden = method === "cod";
    if (modalTitle) {
      modalTitle.textContent = method === "cod" ? "Cash on delivery" : "Pay with Razorpay";
    }
    var hint = document.querySelector(".checkout-summary-pay-hint");
    if (hint && checkoutPhase === "payment") {
      hint.textContent =
        method === "cod"
          ? "Place your COD order after you fill shipping above. Pay when your parcel arrives."
          : "Open Pay now to complete Razorpay checkout — 5% instant discount applied.";
    }
  }

  function fmt(n) {
    return CART.formatMoney(n);
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

  function lineDisplayName(line) {
    if (CART && typeof CART.liveDisplayName === "function") return CART.liveDisplayName(line);
    return String((line && line.name) || "");
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
    /* Legacy no-op — single-page checkout always shows fill step */
    if (on && els.stepFill) {
      els.stepFill.classList.remove("checkout-hidden");
      els.stepFill.removeAttribute("hidden");
    }
  }

  function goToDetailsStep() {
    setStepFillVisible(true);
    if (window.RESIN_SHELL && window.RESIN_SHELL.closeDrawer) {
      window.RESIN_SHELL.closeDrawer();
    }
    updateCheckoutStepper();
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
    initGooglePlacesAutocomplete();
  }

  function goToReviewStep() {
    checkoutPhase = "shipping";
    if (els.sectionPayment) {
      els.sectionPayment.setAttribute("hidden", "hidden");
      els.sectionPayment.classList.add("is-locked");
    }
    document.querySelectorAll('#checkoutInlinePayment input[name="checkoutPaymentMethod"]').forEach(function (inp) {
      inp.disabled = true;
    });
    if (els.summaryCta) els.summaryCta.textContent = "Continue to Payment";
    if (els.summaryHint) els.summaryHint.textContent = "Complete contact & shipping, then choose how to pay.";
    updateCheckoutStepper();
    refreshCheckout();
  }

  function renderSnips(lines) {
    if (!els.snipsGrid) return;
    els.snipsGrid.innerHTML = "";
    (lines || []).forEach(function (line) {
      var imgRel = getLineImage(line);
      var wrap = document.createElement("div");
      wrap.className = "checkout-snip-wrap";
      var href =
        String(line.id || "").indexOf("pf-prod--") === 0
          ? "photo-frame-product.html?id=" + encodeURIComponent(line.id)
          : String(line.id || "").indexOf("raw-mat--") === 0
          ? "raw-material-product.html?id=" + encodeURIComponent(line.id)
          : "product.html?id=" + encodeURIComponent(line.id);
      var imgHtml = imgRel
        ? '<img src="' + escapeAttr(imgUrl(imgRel)) + '" alt="" loading="lazy" width="92" height="92" />'
        : '<div class="checkout-snip__ph" aria-hidden="true"></div>';
      wrap.innerHTML =
        '<a class="checkout-snip" href="' +
        escapeAttr(href) +
        '" aria-label="Open ' +
        escapeAttr(lineDisplayName(line) || "product") +
        '">' +
        imgHtml +
        '<span class="checkout-snip__badge" aria-hidden="true">' +
        escapeHtml(String(line.qty || 1)) +
        "</span>" +
        '<span class="checkout-snip__meta">' +
        escapeHtml(lineDisplayName(line)) +
        "</span></a>" +
        '<div class="checkout-snip__actions">' +
        '<button type="button" class="checkout-snip__later" data-later-id="' +
        escapeAttr(line.id) +
        '" data-later-size="' +
        escapeAttr(line.size) +
        '" data-later-extrak="' +
        escapeAttr(CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "") +
        '" title="Save for later">♡</button>' +
        '<button type="button" class="checkout-snip__remove" data-remove-id="' +
        escapeAttr(line.id) +
        '" data-remove-size="' +
        escapeAttr(line.size) +
        '" data-remove-extrak="' +
        escapeAttr(CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "") +
        '" aria-label="Remove ' +
        escapeAttr(lineDisplayName(line) || "item") +
        ' from cart">×</button></div>';
      var szMeta =
        (line.variantLabel && String(line.variantLabel).trim()) ||
        (D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size);
      var amt = lineTotalAmt(line);
      var hay =
        (lineDisplayName(line) || "") +
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
      var sz =
        (line.variantLabel && String(line.variantLabel).trim()) ||
        (D.lineSizeLabel ? D.lineSizeLabel(line.id, line.size) : line.size);
      var lineAmt = (line.price || 0) * (line.qty || 1);
      var imgRel = getLineImage(line);
      var href =
        String(line.id || "").indexOf("pf-prod--") === 0
          ? "photo-frame-product.html?id=" + encodeURIComponent(line.id)
          : String(line.id || "").indexOf("raw-mat--") === 0
          ? "raw-material-product.html?id=" + encodeURIComponent(line.id)
          : "product.html?id=" + encodeURIComponent(line.id);
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
        escapeHtml(lineDisplayName(line)) +
        "</strong>" +
        "<span>" +
        escapeHtml(sz) +
        " · Qty " +
        (line.qty || 1) +
        " · " +
        fmt(line.price) +
        " each</span>" +
        "</div>" +
        "</a>" +
        '<div class="checkout-line__tail">' +
        '<span class="checkout-line__price">' +
        fmt(lineAmt) +
        "</span>" +
        '<div class="checkout-line__actions">' +
        '<button type="button" class="checkout-line__later" data-later-id="' +
        escapeAttr(line.id) +
        '" data-later-size="' +
        escapeAttr(line.size) +
        '" data-later-extrak="' +
        escapeAttr(CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "") +
        '" title="Save for later">Later</button>' +
        '<button type="button" class="checkout-line__remove" data-remove-id="' +
        escapeAttr(line.id) +
        '" data-remove-size="' +
        escapeAttr(line.size) +
        '" data-remove-extrak="' +
        escapeAttr(CART.lineExtraKey ? CART.lineExtraKey(line.lineExtra) : "") +
        '" title="Remove" aria-label="Remove ' +
        escapeAttr(lineDisplayName(line) || "item") +
        '">×</button></div></div>';
      var hay =
        (lineDisplayName(line) || "") +
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
    var itemCount = lines.reduce(function (n, line) {
      return n + Math.max(1, Math.floor(Number(line.qty) || 1));
    }, 0);
    var paymentMethod =
      checkoutPhase === "payment" ? getCheckoutPaymentMethod() : "razorpay";
    var totals = computeCheckoutTotals(subtotalVal, paymentMethod);

    var sEl = gfSort();
    var sortKey = (sEl && sEl.value) || "default";
    var displayLines = sortLinesForDisplay(lines, sortKey);
    renderLines(displayLines);
    renderSnips(displayLines);
    applyCheckoutLineFilter();

    if (els.sub) els.sub.textContent = fmt(totals.productValue);
    if (els.subtotalLabel) {
      els.subtotalLabel.textContent = "Items Total (" + itemCount + ")";
    }
    var discRow = document.querySelector(".checkout-total-row--discount");
    if (discRow) discRow.hidden = totals.prepaidDiscount <= 0;
    if (els.valDiscount) els.valDiscount.textContent = totals.prepaidDiscount > 0 ? "− " + fmt(totals.prepaidDiscount) : fmt(0);
    if (els.savingsBanner) {
      if (totals.prepaidDiscount > 0 && checkoutPhase === "payment" && paymentMethod === "razorpay") {
        els.savingsBanner.textContent = "Yay! You saved " + fmt(totals.prepaidDiscount) + " on this order.";
        els.savingsBanner.removeAttribute("hidden");
      } else {
        els.savingsBanner.setAttribute("hidden", "hidden");
      }
    }
    if (els.taxable) els.taxable.textContent = fmt(totals.taxable);
    if (els.ship) els.ship.textContent = totals.shipping === 0 ? "Free" : fmt(totals.shipping);
    if (els.tax) els.tax.textContent = fmt(totals.gst);
    if (els.total) els.total.textContent = fmt(totals.grand);
    if (els.modalSub) els.modalSub.textContent = fmt(totals.productValue);
    if (els.modalDiscount && els.modalDiscount.closest("li")) {
      els.modalDiscount.closest("li").hidden = totals.prepaidDiscount <= 0;
    }
    if (els.modalDiscount) {
      els.modalDiscount.textContent = totals.prepaidDiscount > 0 ? "− " + fmt(totals.prepaidDiscount) : fmt(0);
    }
    if (els.modalTaxable) els.modalTaxable.textContent = fmt(totals.taxable);
    if (els.modalShip) els.modalShip.textContent = totals.shipping === 0 ? "Free" : fmt(totals.shipping);
    if (els.modalTax) els.modalTax.textContent = fmt(totals.gst);
    if (els.modalGrand) els.modalGrand.textContent = fmt(totals.grand);
    updatePaymentPanelVisibility();
    if (CART.syncShippingNotice) CART.syncShippingNotice();
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
        getCheckoutPaymentMethod() === "cod"
          ? "Tap Pay now, choose Cash on delivery, then place your order. Payment is collected when your parcel arrives."
          : "Tap Pay now to see your total here, then use Pay securely now — 5% instant discount on online payment.";
      return;
    }
    if (mode === "ready") {
      st.setAttribute("data-state", "scan");
      label.textContent = "Checkout";
      if (getCheckoutPaymentMethod() === "cod") {
        msg.innerHTML =
          "Review the amount on the left, then tap <strong>Place order · Cash on Delivery</strong>. Pay cash when your parcel is delivered.";
      } else {
        msg.innerHTML =
          "Review the amount on the left, then use <strong>Pay securely now</strong> — the charge matches your cart on the server (includes 5% prepaid discount).";
      }
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
    if (checkoutPhase !== "payment") {
      continueToPayment();
      return;
    }
    if (!validateShippingStep()) return;
    if (!els.payModal) return;
    refreshCheckout();
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
    var ex = btn.getAttribute("data-remove-extrak");
    if (CART.removeLine) CART.removeLine(id, size, ex);
    refreshCheckout();
    if (window.RESIN_SHELL) {
      window.RESIN_SHELL.updateBadge();
      window.RESIN_SHELL.renderDrawer();
    }
  }

  function onSaveLaterClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest(".checkout-line__later, .checkout-snip__later") : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var id = btn.getAttribute("data-later-id");
    var size = btn.getAttribute("data-later-size");
    var ex = btn.getAttribute("data-later-extrak");
    if (!CART.moveLineToSaveLater) return;
    var ok = CART.moveLineToSaveLater(id, size, ex);
    if (ok) refreshCheckout();
    if (window.RESIN_SHELL) {
      window.RESIN_SHELL.updateBadge();
      window.RESIN_SHELL.renderDrawer();
    }
  }

  function bindRemoveDelegation() {
    if (removeDelegationDone) return;
    if (els.lines) {
      els.lines.addEventListener("click", onRemoveClick);
      els.lines.addEventListener("click", onSaveLaterClick);
    }
    if (els.snipsGrid) {
      els.snipsGrid.addEventListener("click", onRemoveClick);
      els.snipsGrid.addEventListener("click", onSaveLaterClick);
    }
    removeDelegationDone = true;
  }

  function boot() {
    if (CART.countItems() === 0) {
      window.location.href = "index.html";
      return;
    }

    bindRemoveDelegation();
    bindSavedAddressCards();

    goToDetailsStep();

    if (els.openUpiModal) {
      els.openUpiModal.addEventListener("click", function () {
        if (checkoutPhase === "shipping") {
          continueToPayment();
        } else {
          openPayModal();
        }
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
              theme: { color: "#26a69a" },
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
    if (els.btnCodCheckout) {
      els.btnCodCheckout.addEventListener("click", function () {
        if (!els.form || !els.form.checkValidity()) {
          window.alert("Please fill guest name, email, phone, and full shipping address before placing your order.");
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
        var guest = buildGuestPayloadFromForm();
        els.btnCodCheckout.disabled = true;
        postCheckoutCod(guest, items)
          .then(function (j) {
            if (!j || !j.orderCreated) {
              throw new Error("Order was not saved. Check DATABASE_URL on the server.");
            }
            afterPaidCheckoutNavigate(j, { cod: true });
          })
          .catch(function (err) {
            window.alert(String((err && err.message) || "Could not place COD order."));
          })
          .then(function () {
            els.btnCodCheckout.disabled = false;
          });
      });
    }
    document.querySelectorAll('#checkoutInlinePayment input[name="checkoutPaymentMethod"]').forEach(function (inp) {
      inp.addEventListener("change", function () {
        refreshCheckout();
        if (checkoutPhase === "payment") setPaymentUi("ready");
      });
    });
    if (els.paymentCancelBtn) {
      els.paymentCancelBtn.addEventListener("click", function () {
        closePayModal();
      });
    }
    var codCancel = document.getElementById("checkoutPaymentCancelBtnCod");
    if (codCancel) {
      codCancel.addEventListener("click", function () {
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
      els.form.addEventListener("submit", function (e) {
        e.preventDefault();
        continueToPayment();
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
    refreshGuestCheckoutUi();
    initGooglePlacesAutocomplete();

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

  function onCatalogNamesMerged() {
    if (els.success && !els.success.classList.contains("checkout-hidden")) return;
    refreshCheckout();
    if (window.RESIN_SHELL && window.RESIN_SHELL.renderDrawer) {
      window.RESIN_SHELL.renderDrawer();
    }
  }
  window.addEventListener("craftguruCatalogCategoriesMerged", onCatalogNamesMerged);
  window.addEventListener("craftguruCatalogVendorProductsMerged", onCatalogNamesMerged);
  window.addEventListener("craftguruCatalogPricesMerged", onCatalogNamesMerged);

  boot();
})();
