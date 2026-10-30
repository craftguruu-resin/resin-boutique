(function () {
  "use strict";

  var CART = window.RESIN_CART;
  var D = window.RESIN_DATA;
  if (!CART || !D) return;

  /** Product prices include GST; shipping is free within India and no extra charge is added here. */
  var GST_INCLUSIVE_RATE = 0.18;
  var PREPAID_DISCOUNT_RATE = 0.10;
  var COD_MIN_PRODUCT_VALUE = 500;

  function splitGstFromInclusive(inclTotal) {
    var t = Math.round(Number(inclTotal) * 100) / 100;
    var base = Math.round((t / (1 + GST_INCLUSIVE_RATE)) * 100) / 100;
    var gst = Math.round((t - base) * 100) / 100;
    return { inclusive: t, taxable: base, gst: gst };
  }

  var removeDelegationDone = false;
  var formBound = false;
  var checkoutPhase = "shipping"; /* shipping | payment */
  var checkoutActiveStep = "shipping";
  var checkoutNavigationId = 0;
  var googlePlacesReady = false;
  var paymentsAvailable = true;
  var paymentAvailabilityMessage = "";
  var shippingSavePending = false;
  var appliedCoupon = null;
  var couponProductValue = null;
  var couponChecking = false;
  var pendingCouponRetry = false;
  var couponCartKey = "";
  var couponRequestId = 0;
  var CHECKOUT_COUPON_STORAGE_KEY = "cg_checkout_coupon_code";
  var selectedCouponCode = "";
  var couponIdentityKey = "";
  var welcomeStatus = null;
  var couponRefreshTimer = null;
  var couponScheduledIdentityKey = "";
  var couponQuoteInFlight = null;
  var couponQuoteCache = null;
  var couponOffers = [
    { code: "FLAT150", discountValue: 150, minSubtotal: 2000, isActive: true },
    { code: "FLAT200", discountValue: 200, minSubtotal: 2500, isActive: true },
    { code: "FLAT300", discountValue: 300, minSubtotal: 3000, isActive: true },
  ];

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
    couponCode: document.getElementById("checkoutCouponCode"),
    couponOffers: document.getElementById("checkoutCouponOffers"),
    welcomeOffer: document.getElementById("checkoutWelcomeOffer"),
    couponApply: document.getElementById("checkoutCouponApply"),
    couponRemove: document.getElementById("checkoutCouponRemove"),
    couponMessage: document.getElementById("checkoutCouponMessage"),
    couponDiscount: document.getElementById("valCouponDiscount"),
    couponLabel: document.getElementById("valCouponLabel"),
    modalCouponRow: document.getElementById("checkoutModalCouponRow"),
    modalCouponLabel: document.getElementById("checkoutModalCouponLabel"),
    modalCouponDiscount: document.getElementById("checkoutModalCouponDiscount"),
  };

  var GUEST_TOKEN_KEY = "craftguruGuestToken";
  var GUEST_SESSION_NAME_KEY = "cg_session_name";
  var checkoutSessionRefreshId = 0;
  var checkoutSessionLoading = false;
  var checkoutProfileEmail = "";
  var guestSessionRequest = null;
  var checkoutSessionAuthorization = null;
  var checkoutSessionUiPromise = null;
  var checkoutSessionNeedsRetry = false;
  var editingSavedAddressId = "";
  var PAYMENT_RECOVERY_KEY = "cgPaymentRecoveryV1";
  var PAYMENT_RECOVERY_MAX_AGE_MS = 48 * 60 * 60 * 1000;
  var paymentAttemptId = 0;
  var paymentNoticeVersion = 0;
  var paymentRestartCheck = null;
  var paymentAttemptBusy = false;
  var dismissedPaymentAttemptId = -1;
  var paymentRecoveryMemory = null;

  /* Keep only a Razorpay order reference and state — never address, email,
     cart lines or payment credentials. This gives the buyer a safe answer if
     the checkout window closes after a payment attempt. */
  function readPaymentRecovery() {
    try {
      var value = paymentRecoveryMemory || JSON.parse(sessionStorage.getItem(PAYMENT_RECOVERY_KEY) || "null");
      if (!value || !value.createdAt || Date.now() - Number(value.createdAt) > PAYMENT_RECOVERY_MAX_AGE_MS) {
        sessionStorage.removeItem(PAYMENT_RECOVERY_KEY);
        paymentRecoveryMemory = null;
        return null;
      }
      return value;
    } catch (_) {
      return paymentRecoveryMemory;
    }
  }

  function savePaymentRecovery(method, processorOrderId, state) {
    paymentRecoveryMemory = {
      method: method === "cod" ? "cod" : "razorpay",
      processorOrderId: String(processorOrderId || "").slice(0, 120),
      state: String(state || "opened").slice(0, 40),
      createdAt: Date.now(),
    };
    try {
      sessionStorage.setItem(
        PAYMENT_RECOVERY_KEY,
        JSON.stringify(paymentRecoveryMemory)
      );
    } catch (_) {}
  }

  function clearPaymentRecovery() {
    paymentRecoveryMemory = null;
    try { sessionStorage.removeItem(PAYMENT_RECOVERY_KEY); } catch (_) {}
    var banner = document.getElementById("checkoutPaymentRecovery");
    if (banner) banner.remove();
  }

  function clearCancelledPaymentNotice() {
    // Confirmed cancellation notices belong to the current visit only.
    // Keep unresolved payment references so retries still check their status.
    var recovery = readPaymentRecovery();
    if (recovery && recovery.state === "cancelled") clearPaymentRecovery();
  }

  function paymentRecoveryMessage(recovery) {
    var ref = recovery && recovery.processorOrderId ? " Reference: " + recovery.processorOrderId + "." : "";
    if (recovery && recovery.state === "cancelled") {
      return "Payment was cancelled. Your cart is still saved; you can start again.";
    }
    if (recovery && recovery.state === "checking") {
      return "Checking the cancelled payment. You can continue browsing your cart and address.";
    }
    return "We could not confirm the final payment result." + ref + " If money was debited, do not pay again—share this reference with our studio so we can check it safely.";
  }

  function paymentSupportUrl(recovery) {
    var ref = recovery && recovery.processorOrderId ? " Razorpay reference: " + recovery.processorOrderId + "." : "";
    return "https://wa.me/918824350056?text=" + encodeURIComponent("Hi Craftguru, I need help confirming a checkout payment." + ref);
  }

  function renderPaymentRecoveryBanner() {
    var recovery = readPaymentRecovery();
    var old = document.getElementById("checkoutPaymentRecovery");
    if (!recovery) {
      if (old) old.remove();
      return;
    }
    if (!old) {
      old = document.createElement("section");
      old.id = "checkoutPaymentRecovery";
      old.className = "checkout-payment-recovery";
      old.setAttribute("role", "status");
      var anchor = els.summaryHint || els.main;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(old, anchor);
    }
    if (!old) return;
    old.innerHTML = "";
    var strong = document.createElement("strong");
    strong.textContent = recovery.state === "cancelled" ? "Payment cancelled" : recovery.state === "checking" ? "Checking payment" : "Payment needs confirmation";
    var msg = document.createElement("p");
    msg.textContent = paymentRecoveryMessage(recovery);
    var actions = document.createElement("div");
    actions.className = "checkout-payment-recovery__actions";
    if (recovery.state === "cancelled") {
      var retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Start a new payment";
      retry.addEventListener("click", function () {
        openPayModal();
      });
      actions.appendChild(retry);
    }
    var support = document.createElement("a");
    support.href = paymentSupportUrl(recovery);
    support.target = "_blank";
    support.rel = "noopener noreferrer";
    support.textContent = "Contact payment support";
    actions.appendChild(support);
    old.appendChild(strong);
    old.appendChild(msg);
    old.appendChild(actions);
  }

  function checkoutSessionName() {
    try {
      if (window.CRAFT_AUTH_DB && typeof window.CRAFT_AUTH_DB.getSessionName === "function") {
        return String(window.CRAFT_AUTH_DB.getSessionName() || "").trim();
      }
      return String(localStorage.getItem(GUEST_SESSION_NAME_KEY) || "").trim();
    } catch (_) {
      return "";
    }
  }

  function setCheckoutSessionName(name) {
    var value = String(name || "").trim().slice(0, 200);
    // The auth helper emits craftguruAuthChanged; unchanged names must not
    // restart session loading and coupon validation indefinitely.
    if (checkoutSessionName() === value) return;
    try {
      if (window.CRAFT_AUTH_DB && typeof window.CRAFT_AUTH_DB.setSessionName === "function") {
        window.CRAFT_AUTH_DB.setSessionName(value);
        return;
      }
      if (value) localStorage.setItem(GUEST_SESSION_NAME_KEY, value);
      else localStorage.removeItem(GUEST_SESSION_NAME_KEY);
    } catch (_) {}
  }

  function guestAuthHeaders(tokenOverride) {
    var h = { "Content-Type": "application/json" };
    try {
      var t = tokenOverride != null ? tokenOverride : localStorage.getItem(GUEST_TOKEN_KEY);
      if (t) {
        h.Authorization = "Bearer " + t;
      }
    } catch (_) {}
    return h;
  }

  function loadGuestSession(force) {
    var base = billApiBase();
    if (!base) {
      return Promise.resolve(null);
    }
    var token = "";
    try { token = String(localStorage.getItem(GUEST_TOKEN_KEY) || "").trim(); } catch (_) {}
    if (!token) return Promise.resolve(null);
    if (!force && guestSessionRequest && guestSessionRequest.token === token) return guestSessionRequest.promise;
    var sessionRequest = { token: token, promise: null };
    guestSessionRequest = sessionRequest;
    sessionRequest.promise = fetch(base + "/api/guest/me", {
      method: "GET",
      headers: guestAuthHeaders(token),
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
        var stillSameToken = false;
        try { stillSameToken = String(localStorage.getItem(GUEST_TOKEN_KEY) || "").trim() === token; } catch (_) {}
        if (!stillSameToken) return null;
        if (o.x.okHttp && j.ok) return j;
        if (o.status === 401 || (j && j.code === "NO_SESSION")) {
          try {
            localStorage.removeItem(GUEST_TOKEN_KEY);
            localStorage.removeItem(GUEST_SESSION_EMAIL_KEY);
            localStorage.removeItem(GUEST_SESSION_NAME_KEY);
          } catch (_) {}
          try {
            window.dispatchEvent(new CustomEvent("craftguruAuthChanged"));
          } catch (_) {}
        }
        return null;
      })
      .catch(function () {
        return null;
      })
      .then(function (me) {
        if (guestSessionRequest === sessionRequest) guestSessionRequest = null;
        return me;
      });
    return sessionRequest.promise;
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
    var cardEl = document.getElementById("checkoutSavedAddrCards");
    var raw = (cardEl && cardEl.dataset.addressesJson) || (fsEl && fsEl.dataset.addressesJson);
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
    container.dataset.addressesJson = JSON.stringify(list);
    if (!list.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    list.forEach(function (a, i) {
      var card = document.createElement("article");
      card.className = "ck-addr-card";
      var tag = addrTypeLabel(a);
      var radioId = "checkoutSavedAddrPick-" + i;
      card.innerHTML =
        '<input type="radio" id="' +
        radioId +
        '" name="checkoutSavedAddrPick" value="' +
        i +
        '" />' +
        '<label class="ck-addr-card__select" for="' +
        radioId +
        '"><span class="ck-addr-card__tag">' +
        (tag === "Work" ? "💼" : "🏠") +
        " " +
        escapeHtml(tag) +
        "</span>" +
        '<div class="ck-addr-card__body">' +
        escapeHtml(formatAddrCardBody(a)) +
        "</div></label>" +
        '<div class="ck-addr-card__actions">' +
        '<button type="button" class="ck-addr-card__use" data-addr-use="' +
        i +
        '">Use this address</button>' +
        '<button type="button" class="ck-addr-card__edit" data-addr-edit="' +
        i +
        '">Edit address</button></div>';
      container.appendChild(card);
    });
    var first = container.querySelector('input[name="checkoutSavedAddrPick"]');
    var preferred = Array.prototype.slice.call(container.querySelectorAll('input[name="checkoutSavedAddrPick"]')).find(function (input, index) {
      return !!(list[index] && list[index].isDefault);
    });
    if (preferred || first) (preferred || first).checked = true;
    syncAddrPickUi();
  }

  function syncAddrPickUi() {
    var useNew = !document.querySelector('input[name="checkoutSavedAddrPick"]:checked');
    if (!useNew) editingSavedAddressId = "";
    var modeNew = document.getElementById("checkoutAddrModeNew");
    var modeSaved = document.getElementById("checkoutAddrModeSaved");
    if (modeNew) modeNew.checked = useNew;
    if (modeSaved) modeSaved.checked = !useNew;
    if (els.addNewAddrBox) {
      els.addNewAddrBox.classList.toggle("is-selected", useNew);
      var addTitle = els.addNewAddrBox.querySelector(".ck-add-addr-dash__title");
      var addSub = els.addNewAddrBox.querySelector(".ck-add-addr-dash__sub");
      if (editingSavedAddressId) {
        if (addTitle) addTitle.textContent = "Editing saved address";
        if (addSub) addSub.textContent = "Update the fields below, then continue to payment";
      } else {
        if (addTitle) addTitle.textContent = "+ Add New Address";
        if (addSub) addSub.textContent = "Enter address manually";
      }
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

  function selectNewAddressMode(addressIdBeingEdited) {
    editingSavedAddressId = String(addressIdBeingEdited || "").trim();
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
      step.removeAttribute("aria-current");
      if (key === checkoutActiveStep) {
        step.classList.add("is-active");
        step.setAttribute("aria-current", "step");
      } else if (key === "cart" || (checkoutPhase === "payment" && (key === "shipping" || key === "payment"))) step.classList.add("is-done");
    });
    var linePay = document.getElementById("ckStepLinePayment");
    var lineReview = document.getElementById("ckStepLineReview");
    if (linePay) linePay.classList.toggle("is-done", checkoutPhase === "payment");
    if (lineReview) lineReview.classList.toggle("is-done", checkoutActiveStep === "review" && checkoutPhase === "payment");
  }

  function focusCheckoutSection(section) {
    if (!section) return;
    try {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      section.setAttribute("tabindex", "-1");
      section.focus({ preventScroll: true });
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {}
  }

  function navigateCheckoutStep(key) {
    // Repeated payment clicks must not cancel the address save in progress.
    if (key === "payment" && checkoutPhase === "shipping" && shippingSavePending) return;
    checkoutNavigationId++;
    closePayModal();
    if (key === "payment") {
      if (checkoutPhase !== "payment") { continueToPayment(); return; }
      if (!validateShippingStep()) return;
      checkoutActiveStep = "payment";
      updateCheckoutStepper();
      focusCheckoutSection(els.sectionPayment);
      return;
    }
    if (key === "shipping") {
      goToReviewStep();
      focusCheckoutSection(els.stepFill);
      return;
    }
    if (key !== "cart" && key !== "review") return;
    checkoutActiveStep = key;
    updateCheckoutStepper();
    focusCheckoutSection(key === "cart" ? document.getElementById("checkoutCartSection") : document.querySelector(".checkout-totals"));
  }

  function unlockPaymentSection() {
    checkoutPhase = "payment";
    checkoutActiveStep = "payment";
    if (els.sectionPayment) {
      els.sectionPayment.removeAttribute("hidden");
      els.sectionPayment.classList.remove("is-locked");
    }
    document.querySelectorAll('#checkoutInlinePayment input[name="checkoutPaymentMethod"]').forEach(function (inp) {
      inp.disabled = false;
    });
    if (els.summaryCta) els.summaryCta.textContent = "Pay now";
    if (els.summaryHint) {
      els.summaryHint.textContent = "Choose UPI / Card / Net banking or Cash on Delivery above, then pay securely.";
    }
    updateCheckoutStepper();
    refreshCheckout();
    syncSummaryPaymentAvailability();
    focusCheckoutSection(els.sectionPayment);
  }

  /* Inline, announced errors keep checkout context intact. Browser alert
     dialogs interrupted payment recovery and made mobile checkout feel broken. */
  function showCheckoutProblem(message) {
    var text = String(message || "Please review the checkout details and try again.");
    ["checkoutAddressMsg", "checkoutSummaryMsg"].forEach(function (id) {
      var address = document.getElementById(id);
      if (!address) return;
      address.textContent = text;
      address.hidden = false;
      address.classList.add("is-error");
    });
    var status = document.getElementById("checkoutPaymentStatusMsg");
    if (status && checkoutPhase === "payment") status.textContent = text;
  }

  function clearCheckoutProblem() {
    ["checkoutAddressMsg", "checkoutSummaryMsg"].forEach(function (id) {
      var message = document.getElementById(id);
      if (!message) return;
      message.hidden = true;
      message.textContent = "";
      message.classList.remove("is-error");
    });
  }

  function validateShippingStep() {
    if (!els.form) return false;
    var useSaved = document.getElementById("checkoutAddrModeSaved") && document.getElementById("checkoutAddrModeSaved").checked;
    if (useSaved) {
      var list = getSavedAddressesList();
      var picked = document.querySelector('input[name="checkoutSavedAddrPick"]:checked');
      var idx = picked ? parseInt(picked.value, 10) : -1;
      if (!list.length || !Number.isFinite(idx) || idx < 0 || idx >= list.length) {
        showCheckoutProblem("Choose a saved address or add a new one.");
        return false;
      }
      applySavedAddress(list[idx]);
    }
    if (!els.form.checkValidity()) {
      var firstInvalid = els.form.querySelector(":invalid");
      showCheckoutProblem("Please complete your contact and shipping details before continuing to payment.");
      if (firstInvalid) {
        firstInvalid.setAttribute("aria-invalid", "true");
        firstInvalid.addEventListener("input", function clearInvalid() {
          this.removeAttribute("aria-invalid");
          this.removeEventListener("input", clearInvalid);
        });
        try { firstInvalid.focus(); } catch (_) {}
      }
      try {
        els.form.reportValidity();
      } catch (_) {}
      return false;
    }
    var zip = document.getElementById("zip");
    if (zip && !/^\d{6}$/.test(String(zip.value || "").trim())) {
      zip.setAttribute("aria-invalid", "true");
      showCheckoutProblem("Enter a valid 6-digit Indian pincode to continue.");
      try { zip.focus(); } catch (_) {}
      return false;
    }
    if (!buildBillItemsForApi().length) {
      showCheckoutProblem("Your cart is empty.");
      return false;
    }
    clearCheckoutProblem();
    return true;
  }

  function continueToPayment() {
    if (checkoutPhase !== "shipping") {
      openPayModal();
      return;
    }
    if (shippingSavePending) return;
    if (!validateShippingStep()) return;
    var navigationId = checkoutNavigationId;
    shippingSavePending = true;
    if (els.summaryCta) els.summaryCta.textContent = "Saving address…";
    syncSummaryPaymentAvailability();
    return saveOrUpdateCheckoutAddress()
      .then(function () {
        /* Re-fetch so the saved-address cards reflect an edit before the
           customer returns to checkout. */
        refreshGuestCheckoutUi(true);
        if (navigationId === checkoutNavigationId) unlockPaymentSection();
      })
      .catch(function (err) {
        var msg = String((err && err.message) || "Could not save address.");
        if (err && err.code === "SIGN_IN_REQUIRED") {
          showCheckoutProblem(msg || "Your sign-in session expired. Sign in again.");
          return;
        }
        if (err && err.code === "EMAIL_MISMATCH") {
          showCheckoutProblem(msg || "Use the same email as your sign-in.");
          return;
        }
        if (err && err.code === "USE_LOGIN") {
          showCheckoutProblem("This phone or email is linked to another account. Sign in with your email code.");
          return;
        }
        showCheckoutProblem(msg);
      })
      .then(function () {
        shippingSavePending = false;
        if (els.summaryCta) els.summaryCta.textContent = checkoutPhase === "payment" ? "Pay now" : "Continue to Payment";
        syncSummaryPaymentAvailability();
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
        var useBtn = e.target && e.target.closest ? e.target.closest("[data-addr-use]") : null;
        if (!editBtn && !useBtn) return;
        e.preventDefault();
        var actionBtn = editBtn || useBtn;
        var idx = parseInt(actionBtn.getAttribute(editBtn ? "data-addr-edit" : "data-addr-use"), 10);
        var list = getSavedAddressesList();
        if (list[idx]) {
          if (useBtn) {
            var pick = els.savedAddrCards.querySelector('input[name="checkoutSavedAddrPick"][value="' + idx + '"]');
            if (pick) pick.checked = true;
            syncAddrPickUi();
            return;
          }
          applySavedAddress(list[idx]);
          selectNewAddressMode(list[idx].id);
          var firstField = document.getElementById("addrLine1");
          if (firstField) {
            try { firstField.focus(); } catch (_) {}
          }
        }
      });
    }
    if (els.addNewAddrBox) {
      els.addNewAddrBox.addEventListener("click", function () {
        selectNewAddressMode("");
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
        selectNewAddressMode("");
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

  function refreshGuestCheckoutUi(forceProfile, refreshHistory) {
    var sessionAuthorization = guestAuthHeaders().Authorization || "";
    var sessionChanged = checkoutSessionAuthorization !== sessionAuthorization;
    // Name/header updates reuse the current session. Only a real session
    // change, saved-address refresh or page restoration needs another lookup.
    if (!sessionChanged && checkoutSessionUiPromise && !forceProfile && !refreshHistory) return checkoutSessionUiPromise;
    if (!sessionChanged && !forceProfile) {
      var currentText = document.getElementById("checkoutGuestSessionText");
      if (currentText) currentText.textContent = "Signed in as " + (checkoutSessionName() || "My account") + ".";
      return Promise.resolve();
    }
    var refreshId = ++checkoutSessionRefreshId;
    checkoutSessionAuthorization = sessionAuthorization;
    checkoutSessionLoading = true;
    checkoutSessionNeedsRetry = false;
    if (sessionChanged || refreshHistory) {
      couponRequestId++;
      couponQuoteCache = null;
      welcomeStatus = null;
      appliedCoupon = null;
      couponProductValue = null;
      couponChecking = true;
    }
    refreshCheckout();
    var bar = document.getElementById("checkoutGuestSessionBar");
    var txt = document.getElementById("checkoutGuestSessionText");
    var fs = document.getElementById("checkoutSavedAddrFieldset");
    var guestEmail = document.getElementById("guestEmail");
    var guestPhone = document.getElementById("guestPhone");
    checkoutSessionUiPromise = loadGuestSession(forceProfile).then(function (me) {
      /* Ignore a response for an earlier anonymous/expired session. A later
         sign-in must own the checkout UI instead of being overwritten by it. */
      if (refreshId !== checkoutSessionRefreshId) return;
      if (sessionAuthorization !== (guestAuthHeaders().Authorization || "")) return refreshGuestCheckoutUi();
      checkoutSessionNeedsRetry = !!(sessionAuthorization && !me);
      if (me && me.email) {
        if (bar) {
          bar.hidden = false;
        }
        var authDetails = document.getElementById("checkoutAuthOptional");
        if (authDetails) authDetails.hidden = true;
        var signInLink = document.getElementById("checkoutSignInLink");
        if (signInLink) signInLink.hidden = true;
        if (txt) {
          if (me.displayName && String(me.displayName).trim() !== "Guest") {
            setCheckoutSessionName(me.displayName);
          }
          txt.textContent = "Signed in as " + (checkoutSessionName() || "My account") + ".";
        }
        if (guestEmail) {
          guestEmail.value = me.email;
          guestEmail.readOnly = true;
        }
        var pn = normalizeIndiaMobile10(me.phoneNorm);
        if (guestPhone) {
          if (checkoutProfileEmail && checkoutProfileEmail !== normalizeCheckoutEmail(me.email)) guestPhone.value = "";
          var disp = /^[6-9]\d{9}$/.test(pn) ? formatIndiaPhoneDisplay10(pn) : "";
          if (disp) {
            guestPhone.value = disp;
            guestPhone.readOnly = true;
          } else {
            guestPhone.readOnly = false;
          }
        }
        checkoutProfileEmail = normalizeCheckoutEmail(me.email);
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
        var authDetailsOut = document.getElementById("checkoutAuthOptional");
        if (authDetailsOut) authDetailsOut.hidden = false;
        var signInLinkOut = document.getElementById("checkoutSignInLink");
        if (signInLinkOut) signInLinkOut.hidden = false;
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
      if (refreshId !== checkoutSessionRefreshId) return;
      checkoutSessionLoading = false;
      refreshCheckout();
      return refreshCustomerCoupons(sessionChanged || refreshHistory);
    }).then(function () {
      if (refreshId === checkoutSessionRefreshId) checkoutSessionUiPromise = null;
    });
    return checkoutSessionUiPromise;
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
    try { window.dispatchEvent(new CustomEvent("craftguruAuthChanged")); } catch (_) {}
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
      var persistCheckoutProfile = function (existing) {
        var savedName = nm || (existing && existing.name) || checkoutSessionName();
        if (savedName && savedName !== "Guest") setCheckoutSessionName(savedName);
        window.CRAFT_AUTH_DB.putUser(
          { email: emailNorm, name: savedName, createdAt: (existing && existing.createdAt) || Date.now() },
          function () {}
        );
      };
      if (window.CRAFT_AUTH_DB.getUser) {
        window.CRAFT_AUTH_DB.getUser(emailNorm, function (_e, existing) { persistCheckoutProfile(existing); });
      } else {
        persistCheckoutProfile(null);
      }
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
    /* Checkout also has the global header auth modal. Close it when its
       Google button routed through this page-specific callback. */
    if (window.CRAFT_AUTH_HOME && typeof window.CRAFT_AUTH_HOME.closeAuth === "function") {
      window.CRAFT_AUTH_HOME.closeAuth();
    }
  }

  function bindCheckoutAuthStateSync() {
    if (window.__cgCheckoutAuthSyncBound) return;
    window.__cgCheckoutAuthSyncBound = true;
    window.addEventListener("craftguruAuthChanged", function () {
      refreshGuestCheckoutUi();
    });
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
            startOtpCooldown(sendSu, msgEl);
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
          startOtpCooldown(sendLo, msgEl);
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
          var storedName = json && json.displayName && String(json.displayName).trim() !== "Guest"
            ? String(json.displayName).trim()
            : "";
          checkoutAfterVerifySuccess(em, json, storedName);
          checkoutAuthSetMsg(msgEl, "Signed in.", "ok");
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
          var googleName = json && (json.displayName || json.name) ? String(json.displayName || json.name).trim() : "";
          checkoutAfterVerifySuccess(em, json, googleName);
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
    /* The checkout UI already renders a non-editable +91 prefix beside this
       input. Keep the field itself to ten digits so a restored signed-in
       phone never displays as “+91 +91 …”. */
    return d;
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
      if (window.CraftguruApiBase && typeof window.CraftguruApiBase.get === "function") {
        return String(window.CraftguruApiBase.get() || "").replace(/\/+$/, "");
      }
    } catch (_) {}
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

  function syncSummaryPaymentAvailability() {
    if (!els.openUpiModal) return;
    var unavailable = checkoutPhase === "payment" && !paymentsAvailable;
    els.openUpiModal.disabled = shippingSavePending || unavailable;
    els.openUpiModal.setAttribute("aria-disabled", els.openUpiModal.disabled ? "true" : "false");
    els.openUpiModal.title = unavailable ? paymentAvailabilityMessage : "";
  }

  function setPaymentAvailability(available, message) {
    paymentsAvailable = available;
    paymentAvailabilityMessage = message || "";
    syncSummaryPaymentAvailability();
    [els.btnRazorpayCheckout, els.btnCodCheckout].forEach(function (button) {
      if (!button) return;
      button.disabled = !available || paymentAttemptBusy || (button === els.btnCodCheckout && Number(CART.subtotal()) < COD_MIN_PRODUCT_VALUE);
      button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
      button.title = available ? "" : message;
    });
    var inline = document.getElementById("checkoutInlinePaymentAvailability");
    if (inline) {
      inline.hidden = available;
      inline.textContent = available ? "" : message;
    }
    var host = document.getElementById("checkoutRazorPanel");
    if (!host) return;
    var status = document.getElementById("checkoutPaymentAvailability");
    if (!status) {
      status = document.createElement("p");
      status.id = "checkoutPaymentAvailability";
      status.className = "checkout-payment-availability";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      host.appendChild(status);
    }
    status.textContent = available ? "" : message;
  }

  function checkPaymentReadiness() {
    var base = billApiBase();
    if (!base) {
      setPaymentAvailability(false, "Online payments are temporarily unavailable. Please try again later or contact Craftguru.");
      return;
    }
    fetch(base + "/api/razorpay-status", { cache: "no-store" })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok || !body.configured) {
            throw new Error("Online payments are temporarily unavailable. Please try again later or contact Craftguru.");
          }
          setPaymentAvailability(true, "");
        });
      })
      .catch(function (err) {
        setPaymentAvailability(false, (err && err.message) || "Online payments are temporarily unavailable. Please try again later or contact Craftguru.");
      });
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
      return { okHttp: res.ok, status: res.status, json: j };
    });
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
      phone: normalizeIndiaMobile10(val("guestPhone")),
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

  function saveOrUpdateCheckoutAddress() {
    var addressId = String(editingSavedAddressId || "").trim();
    if (!addressId) return postSaveGuestAddress();
    var base = billApiBase();
    if (!base) return Promise.reject(new Error("Bill API URL missing. Please try again."));
    return fetch(base + "/api/guest/addresses/" + encodeURIComponent(addressId), {
      method: "PATCH",
      headers: guestAuthHeaders(),
      body: JSON.stringify({ address: buildGuestPayloadFromForm() }),
    }).then(function (res) {
      return parseApiJson(res).then(function (x) {
        var j = x.json || {};
        if (!x.okHttp || !j.ok) {
          var er = new Error(j.error || res.statusText || "Could not update address");
          er.code = j.code || "";
          throw er;
        }
        editingSavedAddressId = "";
        return j;
      });
    });
  }

  function closeResultPopup() {
    paymentNoticeVersion++;
    var pop = document.getElementById("checkoutResultPopup");
    if (pop) pop.setAttribute("hidden", "hidden");
  }

  function showResultPopup(outcome, opts) {
    opts = opts || {};
    var pop = document.getElementById("checkoutResultPopup");
    if (!pop) return;
    var icon = document.getElementById("checkoutResultIcon");
    var title = document.getElementById("checkoutResultTitle");
    var msg = document.getElementById("checkoutResultMsg");
    var retry = document.getElementById("checkoutResultRetry");
    var support = document.getElementById("checkoutResultSupport");
    pop.classList.toggle("checkout-result-popup--fail", outcome !== "success");
    if (icon) icon.textContent = outcome === "success" ? "✓" : "!";
    if (title) title.textContent = outcome === "success" ? "Your payment is successful" : opts.allowRetry ? "Payment cancelled" : outcome === "recovery" ? "Payment needs confirmation" : "Payment not completed";
    if (msg) {
      msg.textContent = opts.message ||
        (outcome === "success"
          ? "Your payment was verified with Razorpay. We will confirm your order on WhatsApp +91-8824350056."
          : "Payment did not complete. Tap Pay now to try Razorpay again, or WhatsApp +91-8824350056 for help.");
    }
    if (retry) retry.hidden = outcome !== "recovery" || !opts.allowRetry;
    if (support) {
      support.hidden = outcome !== "recovery";
      support.href = paymentSupportUrl(opts.recovery);
    }
    pop.removeAttribute("hidden");
    var ok = document.getElementById("checkoutResultOk");
    try { if (ok) ok.focus({ preventScroll: true }); } catch (_) {}
  }

  function showPaymentRecovery(state, method, processorOrderId) {
    closePayModal();
    savePaymentRecovery(method, processorOrderId, state);
    var recovery = readPaymentRecovery();
    renderPaymentRecoveryBanner();
    setPaymentUi(state === "cancelled" ? "idle" : "recovery");
    showResultPopup("recovery", {
      recovery: recovery,
      allowRetry: state === "cancelled",
      message: paymentRecoveryMessage(recovery),
    });
  }

  function checkPaymentCancellation(recovery, guest) {
    if (!recovery) return Promise.resolve(false);
    if (paymentRestartCheck && paymentRestartCheck.orderId === recovery.processorOrderId) return paymentRestartCheck.promise;
    var base = billApiBase();
    if (!base) return Promise.resolve(false);
    var controller = typeof window.AbortController === "function" ? new window.AbortController() : null;
    var timer;
    var request = fetch(base + "/api/checkout/payment-cancel", {
      method: "POST",
      headers: guestAuthHeaders(),
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({ razorpay_order_id: recovery.processorOrderId, paymentMethod: recovery.method, guest: guest }),
    }).then(function (res) {
      return parseApiJson(res).then(function (x) { return !!(x.okHttp && x.json.ok && x.json.canRetry); });
    });
    var check = { orderId: recovery.processorOrderId };
    check.promise = Promise.race([request, new Promise(function (resolve) {
      timer = window.setTimeout(function () { if (controller) controller.abort(); resolve(false); }, 10000);
    })]).catch(function () { return false; }).then(function (canRetry) {
      window.clearTimeout(timer);
      if (paymentRestartCheck === check) paymentRestartCheck = null;
      return canRetry;
    });
    paymentRestartCheck = check;
    return check.promise;
  }

  function handlePaymentDismissal(method, processorOrderId, guest, attemptId, background) {
    if (attemptId !== paymentAttemptId || dismissedPaymentAttemptId === attemptId) return Promise.resolve();
    dismissedPaymentAttemptId = attemptId;
    if (!background) closePayModal();
    var noticeVersion = background ? -1 : paymentNoticeVersion;
    savePaymentRecovery(method, processorOrderId, "checking");
    renderPaymentRecoveryBanner();
    var recovery = readPaymentRecovery();
    return checkPaymentCancellation(recovery, guest).then(function (canRetry) {
      var current = readPaymentRecovery();
      if (attemptId !== paymentAttemptId || !current || current.processorOrderId !== processorOrderId || current.state === "verifying") return;
      var state = canRetry ? "cancelled" : "unconfirmed";
      savePaymentRecovery(method, processorOrderId, state);
      // A delayed cancellation response must not cover a reopened sheet or a
      // section the buyer has already moved to.
      if (noticeVersion !== paymentNoticeVersion) {
        if (canRetry && els.payModal && !els.payModal.hasAttribute("hidden")) clearPaymentRecovery();
        else renderPaymentRecoveryBanner();
        return;
      }
      showPaymentRecovery(state, method, processorOrderId);
    });
  }

  function preparePaymentAttempt() {
    closeResultPopup();
    var recovery = readPaymentRecovery();
    var check = !recovery || recovery.state === "cancelled" ? Promise.resolve(true) : checkPaymentCancellation(recovery, buildGuestPayloadFromForm());
    return check.then(function (canRetry) {
      if (!canRetry) throw new Error("This payment still needs confirmation. If money was debited, contact payment support with your saved reference before paying again.");
      clearPaymentRecovery();
      setPaymentUi("ready");
      var addressMsg = document.getElementById("checkoutAddressMsg");
      if (addressMsg) { addressMsg.hidden = true; addressMsg.textContent = ""; addressMsg.classList.remove("is-error"); }
      paymentAttemptId++;
      return paymentAttemptId;
    });
  }

  function paymentDetailsStillCurrent(items, guest) {
    var current = buildGuestPayloadFromForm();
    return checkoutPhase === "payment" && els.payModal && !els.payModal.hasAttribute("hidden") &&
      cartKeyForCoupon(items) === cartKeyForCoupon(buildBillItemsForApi()) &&
      normalizeCheckoutEmail(guest.email) === normalizeCheckoutEmail(current.email) && guest.phone === current.phone;
  }

  /** After successful checkout: persist guest session from server, clear cart, open My orders. */
  function afterPaidCheckoutNavigate(j, opts) {
    opts = opts || {};
    clearPaymentRecovery();
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
    window.location.href = "/account.html" + q;
  }

  function escapeHtml(s) {
    var el = document.createElement("div");
    el.textContent = s;
    return el.innerHTML;
  }

  function escapeAttr(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function getCheckoutPaymentMethod() {
    var r = document.querySelector('#checkoutInlinePayment input[name="checkoutPaymentMethod"]:checked') ||
      document.querySelector('input[name="checkoutPaymentMethod"]:checked');
    return r && String(r.value).toLowerCase() === "cod" ? "cod" : "razorpay";
  }

  function couponPreviewDiscount(productValue) {
    if (!appliedCoupon) return 0;
    if (Array.isArray(appliedCoupon.coupons) && appliedCoupon.coupons.length) {
      return Math.round(Math.min(productValue, appliedCoupon.coupons.reduce(function (sum, coupon) {
        return sum + (coupon.discountType === "percentage" ? productValue * Number(coupon.discountValue) / 100 : Number(coupon.discountValue));
      }, 0)) * 100) / 100;
    }
    var value = Math.max(0, Number(appliedCoupon.discountValue) || 0);
    var raw = appliedCoupon.discountType === "percentage" ? productValue * value / 100 : value;
    return Math.round(Math.min(productValue, raw) * 100) / 100;
  }

  function cartKeyForCoupon(items) {
    /* Name, image and inventory refreshes must not remove a valid discount. */
    return JSON.stringify(items.map(function (item) {
      return JSON.stringify([item.productId, item.sizeKey, item.stockSlot, item.qty, item.unitPrice]);
    }).sort());
  }

  function computeCheckoutTotals(subtotalVal, paymentMethod) {
    var productValue = Math.round(Number(appliedCoupon && couponProductValue != null ? couponProductValue : subtotalVal) * 100) / 100;
    var shipping = 0;
    var couponDiscount = couponPreviewDiscount(productValue);
    var discountableValue = Math.round(Math.max(0, productValue - couponDiscount) * 100) / 100;
    var prepaidDiscount =
      paymentMethod === "razorpay" ? Math.round(discountableValue * PREPAID_DISCOUNT_RATE * 100) / 100 : 0;
    var afterDiscount = Math.round(Math.max(0, discountableValue - prepaidDiscount) * 100) / 100;
    var split = splitGstFromInclusive(afterDiscount);
    var grand = Math.round((afterDiscount + shipping) * 100) / 100;
    return {
      productValue: productValue,
      couponDiscount: couponDiscount,
      prepaidDiscount: prepaidDiscount,
      afterDiscount: afterDiscount,
      shipping: shipping,
      taxable: split.taxable,
      gst: split.gst,
      grand: grand,
    };
  }

  function couponMessage(text, isError) {
    if (!els.couponMessage) return;
    els.couponMessage.textContent = text || "";
    els.couponMessage.hidden = !text;
    els.couponMessage.classList.toggle("is-error", !!isError);
  }

  function customerCouponIdentityKey() {
    var guest = buildGuestPayloadFromForm();
    return String(guest.email || "").trim().toLowerCase() + ":" + guest.phone;
  }

  function renderCouponOffers() {
    var value = couponProductValue != null ? couponProductValue : CART.subtotal();
    if (els.couponOffers) els.couponOffers.innerHTML = couponOffers.filter(function (offer) { return offer.code !== "WELCOME100"; }).sort(function (a, b) { return a.minSubtotal - b.minSubtotal; }).map(function (offer) {
      var eligible = offer.isActive && value > offer.minSubtotal;
      var selected = selectedCouponCode === offer.code && !!appliedCoupon;
      var remaining = Math.round(Math.max(0, offer.minSubtotal + 0.01 - value) * 100) / 100;
      return '<button type="button" class="checkout-offer' + (selected ? ' is-selected' : '') + '" data-coupon-offer="' + escapeAttr(offer.code) + '" aria-pressed="' + selected + '"' + (!eligible || couponChecking ? ' disabled' : '') + '><span class="checkout-offer__amount">' + fmt(offer.discountValue) + ' OFF</span><strong>' + escapeAttr(offer.code) + '</strong><span>On shopping above ' + fmt(offer.minSubtotal) + '</span><span class="checkout-offer__action">' + (selected ? '✓ Applied' : eligible ? 'Apply coupon →' : 'Add ' + fmt(remaining) + ' to unlock') + '</span></button>';
    }).join("");
    if (els.welcomeOffer) {
      var showWelcome = CART.countItems() > 0 && !checkoutSessionLoading && !couponChecking && couponIdentityKey === customerCouponIdentityKey() && welcomeStatus && welcomeStatus.firstOrder === true;
      els.welcomeOffer.hidden = !showWelcome;
      if (!showWelcome) {
        els.welcomeOffer.innerHTML = "";
        els.welcomeOffer.classList.toggle("is-applied", false);
        return;
      }
      var hasWelcome = appliedCoupon && appliedCoupon.code.split("+").indexOf("WELCOME100") >= 0;
      var message = hasWelcome ? '✓ Automatically applied · You save ₹100' : value <= 500 ? 'Shop above ₹500 to unlock your first-order gift.' : '₹100 off your first transaction, automatically.';
      if (hasWelcome && welcomeStatus.pendingMobileVerification) message = '✓ Automatically applied · Mobile eligibility is confirmed before payment.';
      if (selectedCouponCode && couponOffers.every(function (offer) { return offer.code !== selectedCouponCode; })) message = 'WELCOME100 pairs with FLAT150, FLAT200 or FLAT300. Choose one to keep your first-order gift.';
      els.welcomeOffer.classList.toggle("is-applied", !!hasWelcome);
      els.welcomeOffer.innerHTML = '<span class="checkout-welcome__icon" aria-hidden="true">✦</span><div><strong>WELCOME100 <span class="checkout-welcome__badge">First order gift</span></strong><p>' + escapeAttr(message) + '</p></div><span class="checkout-welcome__amount">₹100 OFF</span>';
    }
  }

  function refreshCustomerCoupons(force) {
    if (checkoutSessionLoading) return Promise.resolve();
    if (!force && couponIdentityKey === customerCouponIdentityKey() && couponCartKey === cartKeyForCoupon(buildBillItemsForApi())) return couponQuoteInFlight && couponQuoteInFlight.requestId === couponRequestId ? couponQuoteInFlight.promise : Promise.resolve();
    return requestCouponQuote(selectedCouponCode, true, force);
  }

  function scheduleCustomerCouponRefresh() {
    var identityKey = customerCouponIdentityKey();
    if (identityKey === couponIdentityKey || (couponRefreshTimer && identityKey === couponScheduledIdentityKey)) return;
    window.clearTimeout(couponRefreshTimer);
    couponScheduledIdentityKey = identityKey;
    // Clear the previous customer's discount immediately, before the debounce.
    couponRequestId++;
    couponIdentityKey = "";
    appliedCoupon = null;
    couponProductValue = null;
    welcomeStatus = null;
    couponChecking = true;
    refreshCheckout();
    couponRefreshTimer = window.setTimeout(function () { couponRefreshTimer = null; refreshCustomerCoupons(); }, 350);
  }

  function startOtpCooldown(button, msgEl) {
    if (!button) return;
    var seconds = 30;
    button.disabled = true;
    var original = button.dataset.cgOtpLabel || button.textContent;
    button.dataset.cgOtpLabel = original;
    var timer = window.setInterval(function () {
      seconds -= 1;
      button.textContent = seconds > 0 ? "Resend in " + seconds + "s" : original;
      if (seconds > 0) return;
      window.clearInterval(timer);
      button.disabled = false;
      if (msgEl) checkoutAuthSetMsg(msgEl, "You can request another code now.", "ok");
    }, 1000);
    button.textContent = "Resend in " + seconds + "s";
  }

  function applyCoupon() {
    var code = els.couponCode ? String(els.couponCode.value || "").trim().toUpperCase().replace(/\s+/g, "") : "";
    if (!code) { couponMessage("Enter a coupon code first.", true); return; }
    return requestCouponQuote(code, false);
  }

  function applyCouponQuoteResult(body) {
    appliedCoupon = body.coupon || null;
    welcomeStatus = body.welcome || null;
    if (Array.isArray(body.offers)) couponOffers = body.offers;
    var productValue = Number(body.productValue);
    couponProductValue = Number.isFinite(productValue) && productValue >= 0 ? productValue : null;
    try { if (selectedCouponCode) sessionStorage.setItem(CHECKOUT_COUPON_STORAGE_KEY, selectedCouponCode); else sessionStorage.removeItem(CHECKOUT_COUPON_STORAGE_KEY); } catch (_) {}
    if (els.couponCode) els.couponCode.value = selectedCouponCode;
    if (els.couponRemove) els.couponRemove.hidden = !selectedCouponCode;
    couponMessage(appliedCoupon ? appliedCoupon.code.replace(/\+/g, " + ") + " applied — you save " + fmt(couponPreviewDiscount(couponProductValue != null ? couponProductValue : CART.subtotal())) + "." : "Choose an eligible offer above.", false);
    refreshCheckout();
  }

  function finishCouponQuote() {
    couponChecking = false;
    if (els.couponCode) els.couponCode.disabled = false;
    if (els.couponApply) els.couponApply.disabled = false;
    renderCouponOffers();
  }

  function requestCouponQuote(code, automatic, force) {
    window.clearTimeout(couponRefreshTimer);
    couponRefreshTimer = null;
    code = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    if (checkoutSessionLoading) return Promise.resolve();
    var items = buildBillItemsForApi();
    if (!items.length) { couponChecking = false; renderCouponOffers(); couponMessage("Your cart is empty.", true); return; }
    var base = billApiBase();
    if (!base) { couponChecking = false; renderCouponOffers(); couponMessage("Coupon service is temporarily unavailable.", true); return; }
    var cartKey = cartKeyForCoupon(items);
    var identityKey = customerCouponIdentityKey();
    var quoteKey = JSON.stringify([cartKey, identityKey, guestAuthHeaders().Authorization || "", code]);
    // These are the only inputs that affect coupon eligibility. Shipping,
    // display names and repeated UI events must not produce more requests.
    if (couponQuoteInFlight && couponQuoteInFlight.key === quoteKey && couponQuoteInFlight.requestId === couponRequestId) return couponQuoteInFlight.promise;
    var requestId = ++couponRequestId;
    couponCartKey = cartKey;
    couponIdentityKey = identityKey;
    selectedCouponCode = code.split("+").filter(function (part) { return part !== "WELCOME100"; }).join("+");
    pendingCouponRetry = false;
    if (!force && couponQuoteCache && couponQuoteCache.key === quoteKey) {
      couponChecking = false;
      applyCouponQuoteResult(couponQuoteCache.body);
      finishCouponQuote();
      return Promise.resolve();
    }
    if (force) couponQuoteCache = null;
    couponChecking = true;
    appliedCoupon = null;
    couponProductValue = null;
    welcomeStatus = null;
    if (els.couponCode) { els.couponCode.value = selectedCouponCode; els.couponCode.disabled = true; }
    if (els.couponRemove) els.couponRemove.hidden = !selectedCouponCode;
    if (els.couponApply) els.couponApply.disabled = true;
    couponMessage("Checking offers…", false);
    refreshCheckout();
    var flight = { key: quoteKey, requestId: requestId, promise: null };
    couponQuoteInFlight = flight;
    flight.promise = fetch(base + (automatic ? "/api/coupons/offers" : "/api/coupons/validate"), { method: "POST", headers: guestAuthHeaders(), cache: "no-store", body: JSON.stringify({ code: code, items: items, guest: buildGuestPayloadFromForm() }) })
      .then(function (res) { return parseApiJson(res); })
      .then(function (x) {
        if (requestId !== couponRequestId) return;
        if (couponCartKey !== cartKeyForCoupon(buildBillItemsForApi()) || couponIdentityKey !== customerCouponIdentityKey()) return refreshCustomerCoupons();
        if (!x.okHttp || !x.json.ok || (code && !x.json.coupon)) {
          var quoteError = new Error((x.json && x.json.error) || "This coupon is not available.");
          quoteError.serviceUnavailable = x.status === 429 || x.status >= 500;
          throw quoteError;
        }
        couponQuoteCache = { key: quoteKey, body: x.json };
        applyCouponQuoteResult(x.json);
      })
      .catch(function (err) {
        if (requestId !== couponRequestId) return;
        if (els.couponCode) els.couponCode.disabled = false;
        if (navigator.onLine === false || (err && err.name === "TypeError")) {
          pendingCouponRetry = true;
          couponMessage("We could not check this coupon offline. It will retry when you reconnect.", true);
          return;
        }
        // Server failures must not trigger a fallback request or turn every
        // subsequent render/catalog event into another automatic retry.
        if (err && err.serviceUnavailable) {
          couponMessage(String(err.message || "Could not check offers. Please try again."), true);
          return;
        }
        selectedCouponCode = "";
        try { sessionStorage.removeItem(CHECKOUT_COUPON_STORAGE_KEY); } catch (_) {}
        if (els.couponRemove) els.couponRemove.hidden = true;
        var message = String((err && err.message) || "This coupon is not available.");
        if (code) {
          var fallbackRequestId = couponRequestId + 1;
          return requestCouponQuote("", true).then(function () { if (couponRequestId === fallbackRequestId) couponMessage(message, true); });
        }
        couponMessage(message, true);
      })
      .then(function () {
        if (couponQuoteInFlight === flight) couponQuoteInFlight = null;
        if (requestId !== couponRequestId) return;
        finishCouponQuote();
      });
    return flight.promise;
  }

  function removeCoupon() {
    if (!selectedCouponCode) return els.welcomeOffer ? refreshCustomerCoupons() : Promise.resolve();
    couponRequestId++;
    couponChecking = false;
    couponCartKey = "";
    pendingCouponRetry = false;
    selectedCouponCode = "";
    appliedCoupon = null;
    couponProductValue = null;
    try { sessionStorage.removeItem(CHECKOUT_COUPON_STORAGE_KEY); } catch (_) {}
    if (els.couponCode) { els.couponCode.value = ""; els.couponCode.disabled = false; els.couponCode.focus(); }
    if (els.couponRemove) els.couponRemove.hidden = true;
    if (els.couponApply) els.couponApply.disabled = false;
    couponMessage("Coupon removed.", false);
    refreshCheckout();
    // The first-order gift stays automatic when the chosen flat code is removed.
    if (els.welcomeOffer) return requestCouponQuote("", true);
  }

  function restoreCouponAfterReload(deferQuote) {
    var saved = "";
    try { saved = String(sessionStorage.getItem(CHECKOUT_COUPON_STORAGE_KEY) || "").trim(); } catch (_) {}
    if (saved && els.couponCode) { selectedCouponCode = saved.split("+").filter(function (part) { return part !== "WELCOME100"; }).join("+"); els.couponCode.value = selectedCouponCode; }
    if (deferQuote) return;
    if (saved && els.couponCode) return requestCouponQuote(selectedCouponCode, true);
    if (els.welcomeOffer) return requestCouponQuote("", true);
  }

  function clearCouponForCartChange(deferQuote) {
    if (!couponCartKey) { if (!deferQuote && els.welcomeOffer) return refreshCustomerCoupons(); return; }
    if (couponCartKey === cartKeyForCoupon(buildBillItemsForApi())) return;
    couponRequestId++;
    couponChecking = false;
    couponCartKey = "";
    pendingCouponRetry = false;
    selectedCouponCode = "";
    appliedCoupon = null;
    couponProductValue = null;
    try { sessionStorage.removeItem(CHECKOUT_COUPON_STORAGE_KEY); } catch (_) {}
    if (els.couponCode) { els.couponCode.value = ""; els.couponCode.disabled = false; }
    if (els.couponRemove) els.couponRemove.hidden = true;
    if (els.couponApply) els.couponApply.disabled = false;
    couponMessage("Cart updated. Choose a coupon for your new total.", false);
    refreshCheckout();
    if (!deferQuote && els.welcomeOffer && CART.countItems() > 0) return requestCouponQuote("", true);
    couponMessage("", false);
  }

  function postCodAdvanceOrder(items) {
    if (couponChecking) return Promise.reject(new Error("Please wait for your coupon to be checked before paying."));
    var base = billApiBase();
    if (!base) return Promise.reject(new Error("missing bill API base"));
    var headers = guestAuthHeaders();
    return fetch(base + "/api/cod-advance-order", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ items: items, couponCode: appliedCoupon ? appliedCoupon.code : "", guest: buildGuestPayloadFromForm() }),
    }).then(function (res) {
      return parseApiJson(res).then(function (x) {
        var j = x.json;
        if (!x.okHttp || !j.ok) {
          var err = new Error((j && j.error) || res.statusText || "Could not start COD advance payment");
          if (j && j.code) err.code = j.code;
          throw err;
        }
        return j;
      });
    });
  }

  function postCodAdvanceVerify(paymentResponse, guest, items) {
    var base = billApiBase();
    if (!base) return Promise.reject(new Error("missing bill API base"));
    var headers = guestAuthHeaders();
    return fetch(base + "/api/cod-advance-verify", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_signature: paymentResponse.razorpay_signature,
        guest: guest,
        items: items,
      }),
    }).then(function (res) {
      return parseApiJson(res).then(function (x) {
        var j = x.json;
        if (!x.okHttp || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "COD advance verification failed");
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
      modalTitle.textContent = method === "cod" ? "Cash on delivery" : "UPI / Card / Net banking";
    }
    var hint = document.querySelector(".checkout-summary-pay-hint");
    if (hint && checkoutPhase === "payment") {
      hint.textContent =
        method === "cod"
          ? "COD is available on orders of ₹500 or more. Pay ₹200 advance using UPI, card or net banking; pay the remaining balance on delivery."
          : "Open Pay now to pay by UPI, card or net banking — 10% instant online discount applied.";
    }
    /* Eligibility is independent of the currently selected payment method.
       Razorpay is selected by default, but eligible carts must still be able to choose COD. */
    var codEligible = Number(CART.subtotal()) >= COD_MIN_PRODUCT_VALUE;
    document.querySelectorAll('input[name="checkoutPaymentMethod"]').forEach(function (inp) {
      var isCod = String(inp.value || "").toLowerCase() === "cod";
      inp.disabled = checkoutPhase !== "payment" || (isCod && !codEligible);
      var card = inp.closest ? inp.closest(".checkout-payment-option, label, .ck-payment-option") : null;
      if (card) {
        card.classList.toggle("is-disabled", isCod && !codEligible);
        card.setAttribute("aria-disabled", isCod && !codEligible ? "true" : "false");
      }
    });
    if (els.btnCodCheckout) {
      els.btnCodCheckout.disabled = !paymentsAvailable || paymentAttemptBusy || !codEligible;
      els.btnCodCheckout.setAttribute("aria-disabled", els.btnCodCheckout.disabled ? "true" : "false");
      els.btnCodCheckout.title = !paymentsAvailable ? paymentAvailabilityMessage : codEligible
        ? "Pay ₹200 advance to confirm COD"
        : "COD requires a minimum product value of ₹500";
    }
    if (!codEligible && method === "cod") {
      var online = document.querySelector('input[name="checkoutPaymentMethod"][value="razorpay"]');
      if (online) {
        online.checked = true;
        updatePaymentPanelVisibility();
      }
    }
  }

  function fmt(n) {
    return CART.formatMoney(n);
  }

  function postRazorpayOrder(items) {
    if (couponChecking) return Promise.reject(new Error("Please wait for your coupon to be checked before paying."));
    var base = billApiBase();
    if (!base) return Promise.reject(new Error("missing bill API base"));
    var headers = guestAuthHeaders();
    return fetch(base + "/api/razorpay-order", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ items: items, couponCode: appliedCoupon ? appliedCoupon.code : "", guest: buildGuestPayloadFromForm() }),
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
    if (!line) return "";
    var p = D && D.getProduct && line.id ? D.getProduct(line.id) : null;
    var cover = p && D.getProductCoverImage ? D.getProductCoverImage(p) : p && p.image;
    return cover || line.image || "";
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
      if (els.guestName && !(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) {
        setTimeout(function () {
          if (checkoutActiveStep !== "shipping" || (document.activeElement && document.activeElement !== document.body)) return;
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
    checkoutActiveStep = "shipping";
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
    syncSummaryPaymentAvailability();
  }

  function productHrefForLine(line) {
    var extra = line && line.lineExtra && typeof line.lineExtra === "object" ? line.lineExtra : {};
    var kind = String(extra.productKind || extra.catalogKind || extra.shopKind || "").trim().toLowerCase();
    var id = String((line && line.id) || "");
    if (kind === "photo_frame" || (!kind && id.indexOf("pf-prod--") === 0)) return "photo-frame-product.html?id=" + encodeURIComponent(id);
    if (kind === "raw_material" || (!kind && id.indexOf("raw-mat--") === 0)) return "raw-material-product.html?id=" + encodeURIComponent(id);
    return "product.html?id=" + encodeURIComponent(id);
  }

  function renderSnips(lines) {
    if (!els.snipsGrid) return;
    els.snipsGrid.innerHTML = "";
    (lines || []).forEach(function (line) {
      var imgRel = getLineImage(line);
      var wrap = document.createElement("div");
      wrap.className = "checkout-snip-wrap";
      var href = productHrefForLine(line);
      var imgHtml = imgRel
        ? '<img src="' + escapeAttr(imgUrl(imgRel)) + '" alt="" loading="lazy" width="92" height="92" />'
        : '<div class="checkout-snip__ph" aria-hidden="true"></div>';
      var customNote =
        line.lineExtra && String(line.lineExtra.frameInstructions || "").trim()
          ? '<small class="checkout-line__custom-note">Custom details added</small>'
          : "";
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
        customNote +
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
      var href = productHrefForLine(line);
      var li = document.createElement("li");
      li.className = "checkout-line";
      var customNote =
        line.lineExtra && String(line.lineExtra.frameInstructions || "").trim()
          ? '<small class="checkout-line__custom-note">Custom details added</small>'
          : "";
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
        customNote +
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
      window.location.href = "/index.html";
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
    var couponRow = document.querySelector(".checkout-total-row--coupon");
    if (couponRow) couponRow.hidden = totals.couponDiscount <= 0;
    if (els.couponDiscount) els.couponDiscount.textContent = totals.couponDiscount > 0 ? "− " + fmt(totals.couponDiscount) : fmt(0);
    if (els.couponLabel) els.couponLabel.textContent = appliedCoupon ? "Coupon " + appliedCoupon.code : "Coupon discount";
    var discRow = document.querySelector(".checkout-total-row--discount");
    if (discRow) discRow.hidden = totals.prepaidDiscount <= 0;
    if (els.valDiscount) els.valDiscount.textContent = totals.prepaidDiscount > 0 ? "− " + fmt(totals.prepaidDiscount) : fmt(0);
    if (els.savingsBanner) {
      var allSavings = totals.couponDiscount + totals.prepaidDiscount;
      if (allSavings > 0 && checkoutPhase === "payment") {
        els.savingsBanner.textContent = "Yay! You saved " + fmt(allSavings) + " on this order.";
        els.savingsBanner.removeAttribute("hidden");
      } else {
        els.savingsBanner.setAttribute("hidden", "hidden");
      }
    }
    if (els.taxable) els.taxable.textContent = fmt(totals.taxable);
    if (els.ship) els.ship.textContent = "Free";
    if (els.tax) els.tax.textContent = fmt(totals.gst);
    if (els.total) els.total.textContent = fmt(totals.grand);
    if (els.modalSub) els.modalSub.textContent = fmt(totals.productValue);
    if (els.modalCouponRow) els.modalCouponRow.hidden = totals.couponDiscount <= 0;
    if (els.modalCouponDiscount) els.modalCouponDiscount.textContent = totals.couponDiscount > 0 ? "− " + fmt(totals.couponDiscount) : fmt(0);
    if (els.modalCouponLabel) els.modalCouponLabel.textContent = appliedCoupon ? "Coupon " + appliedCoupon.code : "Coupon discount";
    if (els.modalDiscount && els.modalDiscount.closest("li")) {
      els.modalDiscount.closest("li").hidden = totals.prepaidDiscount <= 0;
    }
    if (els.modalDiscount) {
      els.modalDiscount.textContent = totals.prepaidDiscount > 0 ? "− " + fmt(totals.prepaidDiscount) : fmt(0);
    }
    if (els.modalTaxable) els.modalTaxable.textContent = fmt(totals.taxable);
    if (els.modalShip) els.modalShip.textContent = "Free";
    if (els.modalTax) els.modalTax.textContent = fmt(totals.gst);
    if (els.modalGrand) els.modalGrand.textContent = fmt(totals.grand);
    renderCouponOffers();
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
          ? "Tap Pay now, choose Cash on delivery, pay the ₹200 advance using UPI, card or net banking, then pay the remaining balance when your parcel arrives."
          : "Tap Pay now to see your total here, then use Pay securely now — 10% instant discount on online payment.";
      return;
    }
    if (mode === "ready") {
      st.setAttribute("data-state", "scan");
      label.textContent = "Checkout";
      if (getCheckoutPaymentMethod() === "cod") {
        msg.innerHTML =
          "COD is available on orders of ₹500 or more. Pay <strong>₹200 advance using UPI, card or net banking</strong> to confirm the order; pay the remaining balance on delivery.";
      } else {
        msg.innerHTML =
          "Review your total, then use <strong>Pay securely now</strong> to pay by UPI, card or net banking. Your total includes the 10% prepaid discount.";
      }
      return;
    }
    if (mode === "fail") {
      st.setAttribute("data-state", "fail");
      label.textContent = "Payment";
      msg.textContent =
        "Razorpay reported a problem or the window was closed before paying. Try again or WhatsApp +91-8824350056.";
      return;
    }
    if (mode === "recovery") {
      st.setAttribute("data-state", "fail");
      label.textContent = "Payment check";
      msg.textContent = "Keep this page open. If money was debited, do not retry until our studio confirms the payment reference.";
    }
  }

  function openPayModal() {
    if (checkoutPhase !== "payment") {
      continueToPayment();
      return;
    }
    if (!paymentsAvailable) { showCheckoutProblem(paymentAvailabilityMessage); return; }
    if (!validateShippingStep()) return;
    if (!els.payModal) return;
    closeResultPopup();
    var recovery = readPaymentRecovery();
    if (recovery && recovery.state === "cancelled") clearPaymentRecovery();
    refreshCheckout();
    els.payModal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    if (window.CraftguruOverlayLock) window.CraftguruOverlayLock.acquire("payment");
    setPaymentUi("ready");
    try {
      if (els.payModalClose) els.payModalClose.focus();
    } catch (_) {}
  }

  function closePayModal() {
    closeResultPopup();
    if (els.payModal) els.payModal.setAttribute("hidden", "hidden");
    document.body.style.overflow = "";
    if (window.CraftguruOverlayLock) window.CraftguruOverlayLock.release("payment");
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
    clearCancelledPaymentNotice();
    if (CART.countItems() === 0) {
      window.location.href = "/index.html";
      return;
    }
    try { if (window.CraftguruMetaPixel) window.CraftguruMetaPixel.initiateCheckout(CART.load()); } catch (_) {}

    bindRemoveDelegation();
    bindSavedAddressCards();
    if (els.couponApply) els.couponApply.addEventListener("click", applyCoupon);
    if (els.couponRemove) els.couponRemove.addEventListener("click", removeCoupon);
    if (els.couponOffers) els.couponOffers.addEventListener("click", function (event) {
      var button = event.target.closest("[data-coupon-offer]");
      if (!button || button.disabled) return;
      if (els.couponCode) els.couponCode.value = button.getAttribute("data-coupon-offer");
      applyCoupon();
    });
    [document.getElementById("guestEmail"), els.guestPhone].forEach(function (input) {
      if (input) { input.addEventListener("input", scheduleCustomerCouponRefresh); input.addEventListener("change", scheduleCustomerCouponRefresh); }
    });
    if (els.couponCode) {
      els.couponCode.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); applyCoupon(); }
      });
      els.couponCode.addEventListener("input", function () { this.value = String(this.value || "").toUpperCase(); });
    }
    window.addEventListener("resinCartChanged", function () {
      clearCouponForCartChange();
      refreshCheckout();
    });
    document.querySelectorAll("#checkoutStepper .ck-step[data-step]").forEach(function (step) {
      step.addEventListener("click", function () { navigateCheckoutStep(step.getAttribute("data-step")); });
    });
    window.addEventListener("pagehide", function () { closePayModal(); });
    window.addEventListener("pageshow", function (event) {
      if (!event.persisted) return;
      closePayModal();
      clearCancelledPaymentNotice();
      clearCouponForCartChange(true);
      refreshCheckout();
      renderPaymentRecoveryBanner();
      refreshGuestCheckoutUi(true, true);
    });
    window.addEventListener("online", function () {
      if (!pendingCouponRetry && !checkoutSessionNeedsRetry) return;
      pendingCouponRetry = false;
      if (checkoutSessionNeedsRetry) { refreshGuestCheckoutUi(true, true); return; }
      couponMessage("Back online. Checking your coupon again…", false);
      requestCouponQuote(selectedCouponCode, true, true);
    });

    var phoneInput = document.getElementById("guestPhone");
    if (phoneInput && !phoneInput.dataset.cgPhoneSanitized) {
      phoneInput.dataset.cgPhoneSanitized = "1";
      phoneInput.inputMode = "numeric";
      phoneInput.addEventListener("input", function () {
        var d = digitsOnly(this.value);
        if (d.length === 12 && d.indexOf("91") === 0) d = d.slice(2);
        if (d.length === 11 && d.charAt(0) === "0") d = d.slice(1);
        this.value = d.slice(0, 10);
      });
    }

    var zipInput = document.getElementById("zip");
    if (zipInput && !zipInput.dataset.cgZipStatus) {
      zipInput.dataset.cgZipStatus = "1";
      var zipStatus = document.createElement("small");
      zipStatus.className = "checkout-field-help";
      zipStatus.id = "checkoutZipStatus";
      zipStatus.setAttribute("role", "status");
      zipInput.insertAdjacentElement("afterend", zipStatus);
      zipInput.addEventListener("input", function () {
        var valid = /^\d{6}$/.test(String(this.value || "").trim());
        try {
          if (valid) localStorage.setItem("cgCheckoutPincode", String(this.value || "").trim());
          else localStorage.removeItem("cgCheckoutPincode");
        } catch (_) {}
        this.toggleAttribute("aria-invalid", !!this.value && !valid);
        zipStatus.textContent = !this.value ? "" : valid ? "Pincode format accepted. Delivery availability and timing are confirmed after order review." : "Enter the 6-digit Indian pincode.";
      });
    }

    // Restore the selection first, then quote once after account hydration.
    restoreCouponAfterReload(true);
    refreshGuestCheckoutUi();
    goToDetailsStep();
    checkPaymentReadiness();
    renderPaymentRecoveryBanner();

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
        if (paymentAttemptBusy) return;
        var base = billApiBase();
        if (!base) {
          showCheckoutProblem("Checkout service is unavailable. Please try again shortly.");
          return;
        }
        if (!paymentsAvailable || !validateShippingStep()) return;
        var items = buildBillItemsForApi();
        if (!items.length) {
          showCheckoutProblem("Your cart is empty.");
          return;
        }
        if (typeof window.Razorpay !== "function") {
          showCheckoutProblem("Razorpay Checkout did not load. Check your network or disable script blocking.");
          return;
        }
        els.btnRazorpayCheckout.disabled = true;
        paymentAttemptBusy = true;
        var attemptId;
        var quoteUiVersion;
        var paymentGuest = buildGuestPayloadFromForm();
        preparePaymentAttempt().then(function (id) {
          attemptId = id;
          if (!paymentDetailsStillCurrent(items, paymentGuest)) throw new Error("Checkout changed. Review your current cart and details before paying.");
          quoteUiVersion = paymentNoticeVersion;
          return postRazorpayOrder(items);
        })
          .then(function (order) {
            if (quoteUiVersion !== paymentNoticeVersion || !paymentDetailsStillCurrent(items, paymentGuest)) {
              return handlePaymentDismissal("razorpay", order.orderId, paymentGuest, attemptId, true).then(function () { throw new Error("Checkout changed. Review your current cart and details before paying."); });
            }
            savePaymentRecovery("razorpay", order.orderId, "opened");
            var paymentHandled = false;
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
                paymentHandled = true;
                savePaymentRecovery("razorpay", order.orderId, "verifying");
                var guest = buildGuestPayloadFromForm();
                var items = buildBillItemsForApi();
                postRazorpayVerify(response, guest, items)
                  .then(function (j) {
                    if (!j || !j.orderCreated) {
                      throw new Error(
                        "Payment verified but no order was saved. Use the full checkout address form and ensure the server has DATABASE_URL."
                      );
                    }
                    try { if (window.CraftguruMetaPixel) window.CraftguruMetaPixel.recordPurchase(j, items, /^rzp_live_/.test(order.keyId || "")); } catch (_) {}
                    afterPaidCheckoutNavigate(j);
                  })
                  .catch(function (err) {
                    showPaymentRecovery("verifying", "razorpay", order.orderId);
                    showCheckoutProblem("We could not confirm this payment yet. Do not pay again if money was debited. " + String((err && err.message) || "Contact Craftguru with the payment reference."));
                  });
              },
              modal: {
                ondismiss: function () {
                  window.setTimeout(function () {
                    if (!paymentHandled) handlePaymentDismissal("razorpay", order.orderId, paymentGuest, attemptId);
                  }, 0);
                },
              },
            };
            var rzp = new window.Razorpay(options);
            rzp.on("payment.failed", function () {
              if (!paymentHandled && attemptId === paymentAttemptId) savePaymentRecovery("razorpay", order.orderId, "failed");
            });
            rzp.open();
          })
          .catch(function (err) {
            showCheckoutProblem(String((err && err.message) || "Could not start Razorpay."));
          })
          .then(function () {
            paymentAttemptBusy = false;
            setPaymentAvailability(paymentsAvailable, paymentAvailabilityMessage);
            updatePaymentPanelVisibility();
          });
      });
    }
    if (els.btnCodCheckout) {
      els.btnCodCheckout.addEventListener("click", function () {
        if (paymentAttemptBusy) return;
        if (!paymentsAvailable || !validateShippingStep()) return;
        var items = buildBillItemsForApi();
        if (!items.length) {
          showCheckoutProblem("Your cart is empty.");
          return;
        }
        var subtotal = CART.subtotal();
        if (Number(subtotal) < COD_MIN_PRODUCT_VALUE) {
          showCheckoutProblem("Cash on Delivery is available only when your product total is ₹500 or more.");
          return;
        }
        if (typeof window.Razorpay !== "function") {
          showCheckoutProblem("Razorpay Checkout did not load. Check your network or disable script blocking.");
          return;
        }
        var guest = buildGuestPayloadFromForm();
        els.btnCodCheckout.disabled = true;
        paymentAttemptBusy = true;
        var attemptId;
        var quoteUiVersion;
        preparePaymentAttempt().then(function (id) {
          attemptId = id;
          if (!paymentDetailsStillCurrent(items, guest)) throw new Error("Checkout changed. Review your current cart and details before paying.");
          quoteUiVersion = paymentNoticeVersion;
          return postCodAdvanceOrder(items);
        })
          .then(function (order) {
            if (quoteUiVersion !== paymentNoticeVersion || !paymentDetailsStillCurrent(items, guest)) {
              return handlePaymentDismissal("cod", order.orderId, guest, attemptId, true).then(function () { throw new Error("Checkout changed. Review your current cart and details before paying."); });
            }
            savePaymentRecovery("cod", order.orderId, "opened");
            var paymentHandled = false;
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
              description: "COD courier & packing advance",
              theme: { color: "#26a69a" },
              prefill: {
                email: email,
                contact: phoneDigits ? "+91" + phoneDigits : "",
              },
              handler: function (response) {
                paymentHandled = true;
                savePaymentRecovery("cod", order.orderId, "verifying");
                var freshGuest = buildGuestPayloadFromForm();
                var freshItems = buildBillItemsForApi();
                postCodAdvanceVerify(response, freshGuest, freshItems)
                  .then(function (j) {
                    if (!j || !j.orderCreated) {
                      throw new Error("COD advance was paid but the order was not saved. Please contact Craftguru support.");
                    }
                    try { if (window.CraftguruMetaPixel) window.CraftguruMetaPixel.recordPurchase(j, freshItems, /^rzp_live_/.test(order.keyId || "")); } catch (_) {}
                    afterPaidCheckoutNavigate(j, { cod: true });
                  })
                  .catch(function (err) {
                    showPaymentRecovery("verifying", "cod", order.orderId);
                    showCheckoutProblem("We could not confirm this COD advance yet. Do not pay again if money was debited. " + String((err && err.message) || "Contact Craftguru with the payment reference."));
                  });
              },
              modal: {
                ondismiss: function () {
                  window.setTimeout(function () {
                    if (!paymentHandled) handlePaymentDismissal("cod", order.orderId, guest, attemptId);
                  }, 0);
                },
              },
            };
            var rzp = new window.Razorpay(options);
            rzp.on("payment.failed", function () {
              if (!paymentHandled && attemptId === paymentAttemptId) savePaymentRecovery("cod", order.orderId, "failed");
            });
            rzp.open();
          })
          .catch(function (err) {
            showCheckoutProblem(String((err && err.message) || "Could not start COD advance payment."));
          })
          .then(function () {
            paymentAttemptBusy = false;
            setPaymentAvailability(paymentsAvailable, paymentAvailabilityMessage);
            updatePaymentPanelVisibility();
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
    var resRetry = document.getElementById("checkoutResultRetry");
    var resBd = document.getElementById("checkoutResultBackdrop");
    if (resOk) {
      resOk.addEventListener("click", function () {
        closeResultPopup();
      });
    }
    if (resRetry) {
      resRetry.addEventListener("click", function () {
        var recovery = readPaymentRecovery();
        if (!recovery || recovery.state !== "cancelled") return;
        closeResultPopup();
        clearPaymentRecovery();
        openPayModal();
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
    bindCheckoutAuthStateSync();

    var signOutBtn = document.getElementById("checkoutGuestSignOutBtn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        try {
          localStorage.removeItem(GUEST_TOKEN_KEY);
          localStorage.removeItem(GUEST_SESSION_NAME_KEY);
        } catch (_) {}
        setCheckoutSessionName("");
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
        scheduleCustomerCouponRefresh();
        if (window.RESIN_SHELL) {
          if (window.RESIN_SHELL.updateBadge) window.RESIN_SHELL.updateBadge();
          if (window.RESIN_SHELL.renderDrawer) window.RESIN_SHELL.renderDrawer();
        }
        refreshCheckout();
      });
    }
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
    clearCouponForCartChange();
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
