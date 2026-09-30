(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;

  var rawProducts = [];
  var editingId = "";
  var editingSource = "";
  var searchQ = "";
  var statusFilter = "all";
  var couponType = "percentage";
  var editingCouponId = "";
  var loadedCoupons = [];

  function base() {
    return String(V.apiBase() || "").replace(/\/+$/, "");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function imgSrc(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (u.indexOf("http") === 0 || u.indexOf("//") === 0) return u;
    if (u.charAt(0) === "/") return V.vendorPageHref(u.slice(1));
    return V.vendorPageHref(u);
  }

  function showMsg(text, isErr) {
    var el = document.getElementById("vpmMsg");
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.style.color = isErr ? "#b42318" : "";
  }

  function showCouponMsg(text, isErr) {
    var el = document.getElementById("vpmCouponMsg");
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
    el.style.color = isErr ? "#b42318" : "";
  }

  function renderCoupons(coupons) {
    var body = document.getElementById("vpmCouponTbody");
    var empty = document.getElementById("vpmCouponEmpty");
    if (!body) return;
    if (!coupons || !coupons.length) {
      body.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    loadedCoupons = coupons || [];
    body.innerHTML = loadedCoupons.map(function (coupon) {
      var amount = coupon.discountType === "percentage" ? esc(coupon.discountValue) + "%" : "₹" + esc(coupon.discountValue);
      var status = coupon.isActive ? "<span class=\"vs-pill vs-pill--active\">Active</span>" : "<span class=\"vs-pill vs-pill--inactive\">Inactive</span>";
      var rules = (coupon.minSubtotal > 0 ? "Min ₹" + esc(coupon.minSubtotal) : "No minimum") + (coupon.endsAt ? " · ends " + esc(new Date(coupon.endsAt).toLocaleDateString("en-IN")) : "") + (coupon.maxRedemptions != null ? " · max " + esc(coupon.maxRedemptions) : "");
      var usage = esc(coupon.redemptionCount || 0) + (coupon.maxRedemptions != null ? " / " + esc(coupon.maxRedemptions) : " used");
      return "<tr><td><strong>" + esc(coupon.code) + "</strong></td><td>" + amount + " off<br><small>" + rules + "</small></td><td>" + usage + "</td><td>" + status + "</td><td><button type=\"button\" class=\"vs-btn vs-btn--ghost vpm-coupon-edit\" data-coupon-id=\"" + esc(coupon.id) + "\">Edit</button> <button type=\"button\" class=\"vs-btn vs-btn--ghost vpm-coupon-toggle\" data-coupon-id=\"" + esc(coupon.id) + "\" data-coupon-active=\"" + (coupon.isActive ? "1" : "0") + "\">" + (coupon.isActive ? "Deactivate" : "Activate") + "</button></td></tr>";
    }).join("");
  }

  function loadCoupons() {
    return fetch(base() + "/api/vendor/coupons", { headers: V.authHeaders(), cache: "no-store" }).then(function (res) {
      return V.parseApiJson(res).then(function (x) {
        if (x.status === 401) return V.explainVendor401(base());
        if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Could not load coupons.");
        renderCoupons(x.json.coupons || []);
      });
    }).catch(function (err) { showCouponMsg(String((err && err.message) || err), true); });
  }

  function setCouponType(next) {
    couponType = next === "flat" ? "flat" : "percentage";
    document.querySelectorAll(".vpm-coupon-tab").forEach(function (button) {
      var on = button.getAttribute("data-coupon-type") === couponType;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    });
    var label = document.getElementById("vpmCouponValueLabel");
    var input = document.getElementById("vpmCouponValue");
    if (label) label.textContent = couponType === "flat" ? "Flat discount (₹)" : "Percentage value";
    if (input) { input.max = couponType === "flat" ? "999999" : "100"; input.placeholder = couponType === "flat" ? "100" : "10"; }
  }

  function saveCoupon() {
    var code = document.getElementById("vpmCouponCode");
    var value = document.getElementById("vpmCouponValue");
    var minSubtotal = document.getElementById("vpmCouponMinSubtotal");
    var maxRedemptions = document.getElementById("vpmCouponMaxRedemptions");
    var startsAt = document.getElementById("vpmCouponStartsAt");
    var endsAt = document.getElementById("vpmCouponEndsAt");
    var save = document.getElementById("vpmCouponSave");
    var payload = { code: code ? code.value : "", discountType: couponType, discountValue: value ? value.value : "", minSubtotal: minSubtotal ? minSubtotal.value : "", maxRedemptions: maxRedemptions ? maxRedemptions.value : "", startsAt: startsAt ? startsAt.value : "", endsAt: endsAt ? endsAt.value : "" };
    showCouponMsg("", false);
    if (save) save.disabled = true;
    return fetch(base() + "/api/vendor/coupons" + (editingCouponId ? "/" + encodeURIComponent(editingCouponId) : ""), { method: editingCouponId ? "PUT" : "POST", headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()), body: JSON.stringify(payload) }).then(function (res) {
      return V.parseApiJson(res).then(function (x) {
        if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Could not save coupon.");
        clearCouponForm();
        showCouponMsg("Coupon saved. Customers see the final discount only on checkout.", false);
        return loadCoupons();
      });
    }).catch(function (err) { showCouponMsg(String((err && err.message) || err), true); }).then(function (out) { if (save) save.disabled = false; return out; });
  }

  function localDateValue(iso) {
    if (!iso) return "";
    var d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function clearCouponForm() {
    editingCouponId = "";
    ["vpmCouponCode", "vpmCouponValue", "vpmCouponMinSubtotal", "vpmCouponMaxRedemptions", "vpmCouponStartsAt", "vpmCouponEndsAt"].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ""; });
    var save = document.getElementById("vpmCouponSave"); if (save) save.textContent = "Add coupon";
    var cancel = document.getElementById("vpmCouponCancelEdit"); if (cancel) cancel.hidden = true;
    setCouponType("percentage");
  }
  function editCoupon(id) {
    var coupon = loadedCoupons.find(function (x) { return String(x.id) === String(id); });
    if (!coupon) return;
    editingCouponId = String(coupon.id);
    var set = function (id2, value2) { var el = document.getElementById(id2); if (el) el.value = value2 == null ? "" : String(value2); };
    set("vpmCouponCode", coupon.code); set("vpmCouponValue", coupon.discountValue); set("vpmCouponMinSubtotal", coupon.minSubtotal || ""); set("vpmCouponMaxRedemptions", coupon.maxRedemptions == null ? "" : coupon.maxRedemptions); set("vpmCouponStartsAt", localDateValue(coupon.startsAt)); set("vpmCouponEndsAt", localDateValue(coupon.endsAt));
    setCouponType(coupon.discountType);
    var save = document.getElementById("vpmCouponSave"); if (save) save.textContent = "Save changes";
    var cancel = document.getElementById("vpmCouponCancelEdit"); if (cancel) cancel.hidden = false;
  }

  function refreshGuestCatalogMerge() {
    /* Tell any open guest storefront tab that the vendor catalog may have
       changed. The storefront listens for this key and bypasses its cache. */
    try {
      localStorage.setItem("craftguruCatalogChangedAt", Date.now() + ":" + Math.random());
    } catch (_) {}
    try {
      if (window.CraftguruCatalogMerge && typeof window.CraftguruCatalogMerge.refresh === "function") {
        window.CraftguruCatalogMerge.refresh();
      }
    } catch (_) {}
  }

  function filteredProducts() {
    return rawProducts.filter(function (p) {
      var active = p.isActive !== false;
      if (statusFilter === "active") return active;
      if (statusFilter === "disc") return !active;
      if (statusFilter === "return_gift") return !!p.returnGift;
      return true;
    });
  }

  function findProductById(id) {
    for (var i = 0; i < rawProducts.length; i++) {
      if (rawProducts[i].id === id) return rawProducts[i];
    }
    return null;
  }

  function returnGiftRadioGroupName(productId) {
    return "vpmrg_" + String(productId || "x").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function renderTable() {
    var tb = document.getElementById("vpmTbody");
    var empty = document.getElementById("vpmEmpty");
    if (!tb) return;
    if (!rawProducts.length) {
      tb.innerHTML = "";
      if (empty) {
        empty.style.display = "block";
        empty.textContent = searchQ
          ? "No products match your search."
          : "No products loaded.";
      }
      return;
    }
    var rows = filteredProducts();
    if (!rows.length) {
      tb.innerHTML =
        "<tr><td colspan=\"5\" class=\"vs-muted\">No products match this status filter.</td></tr>";
      if (empty) empty.style.display = "none";
      return;
    }
    if (empty) empty.style.display = "none";
    tb.innerHTML = rows
      .map(function (p) {
        var src = p.source === "catalog" ? "catalog" : "vendor";
        var active = p.isActive !== false;
        var rg = !!p.returnGift;
        var rgNm = returnGiftRadioGroupName(p.id);
        var pills = "";
        if (!active) {
          pills += "<span class=\"vs-pill vs-pill--inactive\">Discontinued</span>";
        } else {
          pills += "<span class=\"vs-pill vs-pill--active\">Active</span>";
        }
        var img = p.image
          ? "<img src=\"" + esc(imgSrc(p.image)) + "\" alt=\"\" width=\"56\" height=\"56\" style=\"object-fit:cover;border-radius:6px\" />"
          : "—";
        var skuCell = p.sku ? esc(p.sku) : "<span class=\"vs-muted\">—</span>";
        var rgCell =
          "<div class=\"vpm-rg-inline\" role=\"radiogroup\" aria-label=\"Corporate gifting listing\" title=\"" +
          esc(src === "catalog" ? "Catalog row — edit to change" : "Vendor row — edit to change") +
          "\">" +
          "<label class=\"vpm-rg-inline__lab" +
          (rg ? "" : " vpm-rg-inline__lab--on") +
          "\"><input type=\"radio\" tabindex=\"-1\" disabled name=\"" +
          esc(rgNm) +
          "\" value=\"0\"" +
          (rg ? "" : " checked") +
          " /><span>Shop</span></label>" +
          "<label class=\"vpm-rg-inline__lab" +
          (rg ? " vpm-rg-inline__lab--on" : "") +
          "\"><input type=\"radio\" tabindex=\"-1\" disabled name=\"" +
          esc(rgNm) +
          "\" value=\"1\"" +
          (rg ? " checked" : "") +
          " /><span>Corporate Gifting</span></label>" +
          "</div>";
        var actions =
          "<div class=\"vpm-actions vpm-actions--inline\"><button type=\"button\" class=\"vs-btn vs-btn--ghost vpm-edit\" data-id=\"" +
          esc(p.id) +
          "\">Edit</button>" +
          pills;
        if (active) {
          actions +=
            "<button type=\"button\" class=\"vs-btn vs-btn--ghost vs-btn--danger vpm-disc\" data-id=\"" +
            esc(p.id) +
            "\">Discontinue</button>";
        } else {
          actions +=
            "<button type=\"button\" class=\"vs-btn vs-btn--primary vpm-react\" data-id=\"" +
            esc(p.id) +
            "\">Set active</button>";
        }
        actions +=
          "<button type=\"button\" class=\"vs-btn vs-btn--ghost vs-btn--danger vpm-del\" data-id=\"" +
          esc(p.id) +
          "\" data-source=\"" +
          esc(src) +
          "\">Archive</button>";
        actions += "</div>";
        return (
          "<tr data-id=\"" +
          esc(p.id) +
          "\"><td>" +
          img +
          "</td><td><strong>" +
          esc(p.name) +
          "</strong><br /><small class=\"vs-muted\">" +
          esc(p.id) +
          "</small></td><td>" +
          skuCell +
          "</td><td class=\"vpm-rg-cell\">" +
          rgCell +
          "</td><td>" +
          actions +
          "</td></tr>"
        );
      })
      .join("");
  }

  var editingCoverFallback = "";
  var editingHadOptionsPayload = false;
  var editingProductOptions = null;

  function stripMediaCacheBust(u) {
    return String(u == null ? "" : u)
      .trim()
      .replace(/[?&]v=\d+/gi, "")
      .replace(/\?&/, "?")
      .replace(/[?&]$/, "");
  }

  function parseGalleryLines(txt) {
    return String(txt == null ? "" : txt)
      .split("\n")
      .map(function (l) {
        return stripMediaCacheBust(l);
      })
      .filter(Boolean)
      .slice(0, 24);
  }

  function uniqueUrls(list) {
    var seen = Object.create(null);
    var out = [];
    (list || []).forEach(function (u) {
      var k = stripMediaCacheBust(u).toLowerCase();
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push(stripMediaCacheBust(u));
    });
    return out;
  }

  function withoutCoverUrl(list, cover) {
    var coverKey = stripMediaCacheBust(cover).toLowerCase();
    return uniqueUrls(list).filter(function (url) {
      return !coverKey || stripMediaCacheBust(url).toLowerCase() !== coverKey;
    });
  }

  function getGalleryUrls() {
    return withoutCoverUrl(
      parseGalleryLines((document.getElementById("vpmGallery") && document.getElementById("vpmGallery").value) || ""),
      getCoverUrlInput()
    );
  }

  function setGalleryUrls(urls) {
    var list = withoutCoverUrl(urls, getCoverUrlInput());
    var gal = document.getElementById("vpmGallery");
    if (gal) gal.value = list.join("\n");
    var optGal = document.getElementById("vpmOptGallery");
    if (optGal) optGal.value = list.join("\n");
    renderMediaManager();
  }

  function getCoverUrlInput() {
    return stripMediaCacheBust((document.getElementById("vpmImageUrl") && document.getElementById("vpmImageUrl").value) || "");
  }

  function setCoverUrlInput(url) {
    var iu = document.getElementById("vpmImageUrl");
    if (iu) iu.value = stripMediaCacheBust(url);
    var hero = document.getElementById("vpmHero");
    if (hero && stripMediaCacheBust(url)) hero.value = stripMediaCacheBust(url);
    var cleaned = withoutCoverUrl(getGalleryUrls(), url);
    var gal = document.getElementById("vpmGallery");
    if (gal) gal.value = cleaned.join("\n");
    var optGal = document.getElementById("vpmOptGallery");
    if (optGal) optGal.value = cleaned.join("\n");
    renderMediaManager();
  }

  function getImageFitApi() {
    return window.CraftguruImageFit || null;
  }

  function currentEditingOptions() {
    if (!editingProductOptions || typeof editingProductOptions !== "object") {
      editingProductOptions = {};
    }
    return editingProductOptions;
  }

  function getHeroImageFitValue() {
    var IF = getImageFitApi();
    var opt = currentEditingOptions();
    return IF && IF.getHeroImageFit ? IF.getHeroImageFit(opt) : "";
  }

  function getGalleryImageFitValue(url) {
    var IF = getImageFitApi();
    var opt = currentEditingOptions();
    return IF && IF.getGalleryImageFit ? IF.getGalleryImageFit(opt, url) : "";
  }

  function setHeroImageFitValue(fit) {
    var IF = getImageFitApi();
    var opt = currentEditingOptions();
    if (IF && IF.setHeroImageFit) IF.setHeroImageFit(opt, fit);
    if (IF && IF.syncCoverColorImageFit) IF.syncCoverColorImageFit(opt);
  }

  function setGalleryImageFitValue(url, fit) {
    var IF = getImageFitApi();
    var opt = currentEditingOptions();
    if (IF && IF.setGalleryImageFit) IF.setGalleryImageFit(opt, url, fit);
  }

  function applyCoverPreviewFit() {
    var preview = document.getElementById("vpmCoverPreview");
    var IF = getImageFitApi();
    if (preview && IF && IF.applyImageFit) IF.applyImageFit(preview, getHeroImageFitValue());
    var fitBtn = document.getElementById("vpmCoverFitBtn");
    if (fitBtn && IF && IF.fitButtonLabel) {
      fitBtn.textContent = IF.fitButtonLabel(getHeroImageFitValue());
      fitBtn.classList.toggle("vpm-img-fit-btn--on", getHeroImageFitValue() === "contain");
    }
  }

  function saveImageFitQuick() {
    if (!editingId) return Promise.resolve();
    var ps = Number(document.getElementById("vpmPriceS").value);
    var pm = Number(document.getElementById("vpmPriceM").value);
    var pl = Number(document.getElementById("vpmPriceL").value);
    var returnGift = !!(document.getElementById("vpmReturnGiftYes") && document.getElementById("vpmReturnGiftYes").checked);
    var descTxt = String((document.getElementById("vpmDescription") && document.getElementById("vpmDescription").value) || "").trim();
    var coverUrl = getCoverUrlInput() || editingCoverFallback;
    var migrated = buildMigratedOptionsForSave(coverUrl);
    migrated.detailBody = descTxt;
    var IF = getImageFitApi();
    if (IF && IF.syncCoverColorImageFit) IF.syncCoverColorImageFit(migrated);
    var nameVal = String((document.getElementById("vpmName") && document.getElementById("vpmName").value) || "").trim();
    return putCatalogPrices(editingId, {
      name: nameVal || undefined,
      priceS: Number.isFinite(ps) ? ps : 0,
      priceM: Number.isFinite(pm) ? pm : 0,
      priceL: Number.isFinite(pl) ? pl : 0,
      returnGift: returnGift,
      description: descTxt,
      options: migrated,
    }).then(function () {
      editingProductOptions = Object.assign({}, migrated);
      refreshGuestCatalogMerge();
      showMsg("Image fit saved — guest storefront updated.", false);
    });
  }

  function renderMediaManager() {
    var cover = getCoverUrlInput() || stripMediaCacheBust(editingCoverFallback);
    var preview = document.getElementById("vpmCoverPreview");
    var empty = document.getElementById("vpmCoverPreviewEmpty");
    if (preview) {
      if (cover) {
        preview.src = imgSrc(cover);
        preview.hidden = false;
      } else {
        preview.removeAttribute("src");
        preview.hidden = true;
      }
    }
    if (empty) empty.hidden = !!cover;
    applyCoverPreviewFit();

    var list = document.getElementById("vpmGalleryList");
    if (!list) return;
    var urls = getGalleryUrls();
    if (!urls.length) {
      list.innerHTML = '<li class="vpm-media__gallery-empty vs-muted">No gallery images yet.</li>';
      return;
    }
    list.innerHTML = urls
      .map(function (u, idx) {
        var galFit = getGalleryImageFitValue(u);
        var IF = getImageFitApi();
        var fitLabel = IF && IF.fitButtonLabel ? IF.fitButtonLabel(galFit) : galFit === "contain" ? "Fit: contain ✓" : "Fit image";
        return (
          '<li class="vpm-media__gallery-item" data-idx="' +
          idx +
          '">' +
          '<img src="' +
          esc(imgSrc(u)) +
          '" alt="" width="56" height="56"' +
          (galFit ? ' data-image-fit="' + esc(galFit) + '"' : "") +
          " />" +
          '<span class="vpm-media__gallery-url" title="' +
          esc(u) +
          '">' +
          esc(u.length > 48 ? u.slice(0, 45) + "…" : u) +
          "</span>" +
          '<span class="vpm-media__gallery-actions">' +
          '<button type="button" class="vs-btn vs-btn--ghost vpm-media__btn vpm-img-fit-btn' +
          (galFit === "contain" ? " vpm-img-fit-btn--on" : "") +
          '" data-act="fit" data-idx="' +
          idx +
          '" title="Show full image (contain) when cropped">' +
          esc(fitLabel) +
          "</button>" +
          '<button type="button" class="vs-btn vs-btn--ghost vpm-media__btn" data-act="up" data-idx="' +
          idx +
          '" title="Move up"' +
          (idx === 0 ? " disabled" : "") +
          ">↑</button>" +
          '<button type="button" class="vs-btn vs-btn--ghost vpm-media__btn" data-act="down" data-idx="' +
          idx +
          '" title="Move down"' +
          (idx === urls.length - 1 ? " disabled" : "") +
          ">↓</button>" +
          '<button type="button" class="vs-btn vs-btn--ghost vpm-media__btn" data-act="cover" data-idx="' +
          idx +
          '" title="Set as cover">Cover</button>' +
          '<button type="button" class="vs-btn vs-btn--ghost vpm-media__btn" data-act="del" data-idx="' +
          idx +
          '" title="Remove">✕</button>' +
          "</span></li>"
        );
      })
      .join("");
  }

  function wireMediaManagerOnce() {
    if (wireMediaManagerOnce.done) return;
    wireMediaManagerOnce.done = true;
    var list = document.getElementById("vpmGalleryList");
    if (list) {
      list.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest && e.target.closest("button[data-act]");
        if (!btn) return;
        var act = btn.getAttribute("data-act");
        var idx = Number(btn.getAttribute("data-idx"));
        var urls = getGalleryUrls();
        if (!Number.isFinite(idx) || idx < 0 || idx >= urls.length) return;
        if (act === "del") {
          urls.splice(idx, 1);
          setGalleryUrls(urls);
          return;
        }
        if (act === "fit") {
          var IF = getImageFitApi();
          var curGalFit = getGalleryImageFitValue(urls[idx]);
          var nextGalFit = IF && IF.toggleImageFit ? IF.toggleImageFit(curGalFit) : curGalFit === "contain" ? "" : "contain";
          setGalleryImageFitValue(urls[idx], nextGalFit);
          renderMediaManager();
          saveImageFitQuick().catch(function (e) {
            showMsg(String((e && e.message) || e), true);
          });
          return;
        }
        if (act === "cover") {
          setCoverUrlInput(urls[idx]);
          return;
        }
        if (act === "up" && idx > 0) {
          var t = urls[idx - 1];
          urls[idx - 1] = urls[idx];
          urls[idx] = t;
          setGalleryUrls(urls);
          return;
        }
        if (act === "down" && idx < urls.length - 1) {
          var t2 = urls[idx + 1];
          urls[idx + 1] = urls[idx];
          urls[idx] = t2;
          setGalleryUrls(urls);
        }
      });
    }
    var addBtn = document.getElementById("vpmGalleryAddBtn");
    var addUrl = document.getElementById("vpmGalleryAddUrl");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        var u = stripMediaCacheBust(addUrl && addUrl.value);
        if (!u) {
          showMsg("Enter an image URL to add.", true);
          return;
        }
        if (!/^https:\/\//i.test(u) && u.indexOf("media/") !== 0 && u.charAt(0) !== "/") {
          showMsg("Gallery images should be https:// URLs (e.g. Cloudinary) or existing media paths.", true);
          return;
        }
        var urls = getGalleryUrls();
        urls.push(u);
        setGalleryUrls(urls);
        if (addUrl) addUrl.value = "";
        showMsg("", false);
      });
    }
    var iu = document.getElementById("vpmImageUrl");
    if (iu) {
      iu.addEventListener("input", function () {
        var hero = document.getElementById("vpmHero");
        if (hero) hero.value = getCoverUrlInput();
        renderMediaManager();
      });
    }
    var coverHex = document.getElementById("vpmCoverColorHex");
    if (coverHex) {
      coverHex.addEventListener("input", syncCoverColorReadout);
      coverHex.addEventListener("change", syncCoverColorReadout);
      syncCoverColorReadout();
    }
    var file = document.getElementById("vpmImage");
    if (file) {
      file.addEventListener("change", function () {
        renderMediaManager();
      });
    }
    var coverFitBtn = document.getElementById("vpmCoverFitBtn");
    if (coverFitBtn) {
      coverFitBtn.addEventListener("click", function () {
        if (!getCoverUrlInput() && !editingCoverFallback) {
          showMsg("Add a cover image first.", true);
          return;
        }
        var IF = getImageFitApi();
        var cur = getHeroImageFitValue();
        var next = IF && IF.toggleImageFit ? IF.toggleImageFit(cur) : cur === "contain" ? "" : "contain";
        setHeroImageFitValue(next);
        applyCoverPreviewFit();
        saveImageFitQuick().catch(function (e) {
          showMsg(String((e && e.message) || e), true);
        });
      });
    }
  }

  function classicSizesFromForm() {
    var sizes = [];
    var rows = [
      { key: "s", priceId: "vpmPriceS", lblId: "vpmLblS", fallback: "Compact" },
      { key: "m", priceId: "vpmPriceM", lblId: "vpmLblM", fallback: "Classic" },
      { key: "l", priceId: "vpmPriceL", lblId: "vpmLblL", fallback: "Grand" },
    ];
    rows.forEach(function (r) {
      var priceEl = document.getElementById(r.priceId);
      var lblEl = document.getElementById(r.lblId);
      var price = Number(priceEl && priceEl.value);
      if (!Number.isFinite(price) || price <= 0) return;
      var label = String((lblEl && lblEl.value) || "").trim() || r.fallback;
      sizes.push({
        id: "sz-" + r.key,
        label: label.slice(0, 120),
        priceInr: price,
        sort: sizes.length,
      });
    });
    return sizes;
  }

  /**
   * Always produce options_json that activates the modern guest PDP, while preserving
   * any Advanced size/colour/qty configuration the vendor already set.
   * Cover image is always promoted to a colour variant (c-cover) with its own swatch.
   */
  function buildMigratedOptionsForSave(coverOverride) {
    var adv =
      window.VendorCatalogPdpOptions && typeof window.VendorCatalogPdpOptions.readOptionsFromForm === "function"
        ? window.VendorCatalogPdpOptions.readOptionsFromForm()
        : undefined;
    var opt = {};
    if (adv && typeof adv === "object") {
      opt = Object.assign({}, adv);
    } else if (editingProductOptions && typeof editingProductOptions === "object") {
      opt = Object.assign({}, editingProductOptions);
    }

    var cover = stripMediaCacheBust(coverOverride || getCoverUrlInput() || editingCoverFallback);
    var heroField = stripMediaCacheBust((document.getElementById("vpmHero") && document.getElementById("vpmHero").value) || "");
    if (cover) opt.heroImage = cover;
    else if (heroField) opt.heroImage = heroField;

    var gallery = getGalleryUrls();
    if (gallery.length) {
      opt.galleryImages = gallery.filter(function (u) {
        return stripMediaCacheBust(u).toLowerCase() !== stripMediaCacheBust(opt.heroImage || "").toLowerCase();
      });
    } else if (!Array.isArray(opt.galleryImages)) {
      opt.galleryImages = [];
    }

    var descTxt = String((document.getElementById("vpmDescription") && document.getElementById("vpmDescription").value) || "").trim();
    opt.detailBody = descTxt;

    /* First-time migration: seed modern size rows only from S/M/L tiers the vendor actually priced. */
    if (!editingHadOptionsPayload && !opt.useSize && !opt.useQty && !opt.useColor) {
      var migratedSizes = classicSizesFromForm();
      if (migratedSizes.length) {
        opt.useSize = true;
        opt.sizes = migratedSizes;
      }
      opt.useQty = false;
      opt.qtyOptions = [];
    }

    if (
      !String(opt.heroImage || "").trim() &&
      !(opt.galleryImages && opt.galleryImages.length) &&
      !opt.useSize &&
      !opt.useQty &&
      !opt.useColor
    ) {
      var fallbackSizes = classicSizesFromForm();
      if (fallbackSizes.length) {
        opt.useSize = true;
        opt.sizes = fallbackSizes;
      }
    }

    var coverLabel = String((document.getElementById("vpmCoverColorLabel") && document.getElementById("vpmCoverColorLabel").value) || "").trim();
    var coverHex = (document.getElementById("vpmCoverColorHex") && document.getElementById("vpmCoverColorHex").value) || "#f8fafc";
    if (!coverLabel) coverLabel = "Default";
    if (window.VendorCatalogPdpOptions && typeof window.VendorCatalogPdpOptions.ensureCoverColorVariant === "function") {
      opt = window.VendorCatalogPdpOptions.ensureCoverColorVariant(opt, opt.heroImage || cover, {
        label: coverLabel,
        hex: coverHex,
        imageFit: getHeroImageFitValue(),
      });
    }

    var IF = getImageFitApi();
    if (IF) {
      if (getHeroImageFitValue()) opt.heroImageFit = getHeroImageFitValue();
      else delete opt.heroImageFit;
      if (editingProductOptions && editingProductOptions.galleryImageFits) {
        opt.galleryImageFits = Object.assign({}, editingProductOptions.galleryImageFits);
      } else {
        delete opt.galleryImageFits;
      }
      if (IF.syncCoverColorImageFit) IF.syncCoverColorImageFit(opt);
    }

    var uC = document.getElementById("vpmUseColor");
    if (uC) uC.checked = true;

    var heroEl = document.getElementById("vpmHero");
    if (heroEl && opt.heroImage) heroEl.value = opt.heroImage;
    var optGal = document.getElementById("vpmOptGallery");
    if (optGal && Array.isArray(opt.galleryImages)) optGal.value = opt.galleryImages.join("\n");

    return opt;
  }

  function syncCoverColorReadout() {
    var pick = document.getElementById("vpmCoverColorHex");
    var read = document.getElementById("vpmCoverColorReadout");
    if (pick && read) read.textContent = String(pick.value || "").toUpperCase();
  }

  function setCoverColorFields(meta) {
    var lab = document.getElementById("vpmCoverColorLabel");
    var hex = document.getElementById("vpmCoverColorHex");
    var label = (meta && meta.label) || "Default";
    var hx =
      window.VendorCatalogPdpOptions && typeof window.VendorCatalogPdpOptions.normalizeHex === "function"
        ? window.VendorCatalogPdpOptions.normalizeHex((meta && meta.hex) || "#f8fafc")
        : "#f8fafc";
    if (lab) lab.value = label;
    if (hex) hex.value = hx;
    syncCoverColorReadout();
  }

  /** Bundled catalog rows: cover file upload stays hidden; name is editable via name_override. */
  function setCatalogFormDisabled(on) {
    var nameEl = document.getElementById("vpmName");
    if (nameEl) nameEl.disabled = false;
    var fileWrap = document.getElementById("vpmImageFileWrap");
    if (fileWrap) fileWrap.style.display = on ? "none" : "";
    var fi = document.getElementById("vpmImage");
    if (fi) fi.disabled = !!on;
    ["vpmImageUrl", "vpmGallery", "vpmGalleryAddUrl", "vpmGalleryAddBtn"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = false;
    });
  }

  function syncReturnGiftVisual() {
    document.querySelectorAll(".vpm-return-gift-row__opt").forEach(function (lab) {
      var inp = lab.querySelector("input");
      lab.classList.toggle("is-selected", !!(inp && inp.checked));
    });
  }

  function openEdit(p) {
    saveListViewState();
    editingId = p.id;
    editingSource = p.source === "catalog" ? "catalog" : "vendor";
    editingProductOptions = p.options && typeof p.options === "object" ? Object.assign({}, p.options) : null;
    editingHadOptionsPayload = !!(
      window.RESIN_DATA &&
      typeof window.RESIN_DATA.catalogOptionsHasPayload === "function"
        ? window.RESIN_DATA.catalogOptionsHasPayload(p.options)
        : p.options &&
          (p.options.useSize ||
            p.options.useColor ||
            p.options.useQty ||
            (p.options.galleryImages && p.options.galleryImages.length) ||
            String(p.options.heroImage || "").trim())
    );
    editingCoverFallback = stripMediaCacheBust(
      (p.options && p.options.heroImage) || p.image || ""
    );

    var card = document.getElementById("vpmEditCard");
    if (card) card.hidden = false;
    document.getElementById("vpmEditId").textContent = p.id;
    document.getElementById("vpmName").value = p.name || "";
    var pr = p.prices || {};
    document.getElementById("vpmPriceS").value = pr.s != null ? pr.s : "";
    document.getElementById("vpmPriceM").value = pr.m != null ? pr.m : "";
    document.getElementById("vpmPriceL").value = pr.l != null ? pr.l : "";
    var co = p.costs || {};
    var costS = document.getElementById("vpmCostS");
    var costM = document.getElementById("vpmCostM");
    var costL = document.getElementById("vpmCostL");
    if (costS) costS.value = co.s != null ? co.s : "";
    if (costM) costM.value = co.m != null ? co.m : "";
    if (costL) costL.value = co.l != null ? co.l : "";
    var sl = p.sizeLabels || {};
    document.getElementById("vpmLblS").value = (sl.s && sl.s.name) || "";
    document.getElementById("vpmLblM").value = (sl.m && sl.m.name) || "";
    document.getElementById("vpmLblL").value = (sl.l && sl.l.name) || "";
    var fi = document.getElementById("vpmImage");
    if (fi) fi.value = "";

    var cover =
      stripMediaCacheBust((p.options && p.options.heroImage) || "") ||
      stripMediaCacheBust(p.image || "");
    var iu = document.getElementById("vpmImageUrl");
    if (iu) iu.value = cover;

    var galleryFromOpt = p.options && Array.isArray(p.options.galleryImages) ? p.options.galleryImages : [];
    var galleryFromProduct = Array.isArray(p.gallery) ? p.gallery : [];
    var mergedGal = withoutCoverUrl(galleryFromOpt.concat(galleryFromProduct).map(stripMediaCacheBust), cover);
    var gal = document.getElementById("vpmGallery");
    if (gal) gal.value = mergedGal.join("\n");

    var descEl = document.getElementById("vpmDescription");
    if (descEl) {
      var fromOpt =
        p && p.options && String(p.options.detailBody || "").trim()
          ? String(p.options.detailBody).trim()
          : "";
      descEl.value = String((p && p.description) || fromOpt || "");
    }
    var rgY = document.getElementById("vpmReturnGiftYes");
    var rgN = document.getElementById("vpmReturnGiftNo");
    if (rgY && rgN) {
      if (p.returnGift) {
        rgY.checked = true;
      } else {
        rgN.checked = true;
      }
    }
    syncReturnGiftVisual();
    var note = document.getElementById("vpmCatalogNote");
    if (note) note.style.display = editingSource === "catalog" ? "block" : "none";
    setCatalogFormDisabled(editingSource === "catalog");
    if (window.VendorCatalogPdpOptions) {
      var seeded = p.options || null;
      if (cover && window.VendorCatalogPdpOptions.ensureCoverColorVariant) {
        seeded = window.VendorCatalogPdpOptions.ensureCoverColorVariant(
          seeded ? Object.assign({}, seeded) : {},
          cover,
          window.VendorCatalogPdpOptions.findCoverColorMeta(seeded, cover) || { label: "Default", hex: "#f8fafc" }
        );
      }
      window.VendorCatalogPdpOptions.fillEditorsFromOptions(seeded);
      var uC = document.getElementById("vpmUseColor");
      if (uC) uC.checked = true;
      var hero = document.getElementById("vpmHero");
      if (hero && cover && !String(hero.value || "").trim()) hero.value = cover;
      var optGal = document.getElementById("vpmOptGallery");
      if (optGal && mergedGal.length && !String(optGal.value || "").trim()) optGal.value = mergedGal.join("\n");
      var coverMeta =
        (window.VendorCatalogPdpOptions.findCoverColorMeta &&
          window.VendorCatalogPdpOptions.findCoverColorMeta(seeded, cover)) ||
        null;
      setCoverColorFields(coverMeta || { label: "Default", hex: "#f8fafc" });
    } else {
      setCoverColorFields({ label: "Default", hex: "#f8fafc" });
    }
    wireMediaManagerOnce();
    renderMediaManager();
    showMsg("", false);
    try {
      card && card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (_) {}
  }

  function closeEdit() {
    editingId = "";
    editingSource = "";
    editingCoverFallback = "";
    editingHadOptionsPayload = false;
    editingProductOptions = null;
    var card = document.getElementById("vpmEditCard");
    if (card) card.hidden = true;
    setCatalogFormDisabled(false);
    var note = document.getElementById("vpmCatalogNote");
    if (note) note.style.display = "none";
    if (window.VendorCatalogPdpOptions) window.VendorCatalogPdpOptions.clearEditors();
    showMsg("", false);
    restoreListViewState();
  }

  function manageListUrl() {
    var u = base() + "/api/vendor/products/manage";
    if (searchQ) u += "?q=" + encodeURIComponent(searchQ);
    return u;
  }

  function loadList() {
    showMsg("", false);
    return fetch(manageListUrl(), { headers: V.authHeaders(), cache: "no-store" })
      .then(function (res) {
        return res.text().then(function (text) {
          if (res.status === 401) {
            return V.explainVendor401(V.apiBase());
          }
          var j = {};
          try {
            j = text ? JSON.parse(text) : {};
          } catch (_) {}
          if (!res.ok || !j.ok) {
            throw new Error((j && j.error) || res.statusText || "Load failed");
          }
          rawProducts = j.products || [];
          renderTable();
          if (!editingId) restoreListViewState();
          refreshGuestCatalogMerge();
        });
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
      });
  }

  function deleteProduct(id) {
    return fetch(base() + "/api/vendor/products/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: V.authHeaders(),
      cache: "no-store",
    }).then(function (res) {
      return res.text().then(function (text) {
        var j = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch (_) {}
        if (!res.ok || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Delete failed");
        }
      });
    });
  }

  function setActive(id, active) {
    return fetch(base() + "/api/vendor/products/" + encodeURIComponent(id) + "/active", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      cache: "no-store",
      body: JSON.stringify({ active: !!active }),
    }).then(function (res) {
      return res.text().then(function (text) {
        var j = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch (_) {}
        if (!res.ok || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Update failed");
        }
        refreshGuestCatalogMerge();
      });
    });
  }

  function putCatalogPrices(id, body) {
    return fetch(base() + "/api/vendor/catalog-products/" + encodeURIComponent(id) + "/prices", {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify(body),
      cache: "no-store",
    }).then(function (res) {
      return res.text().then(function (text) {
        var j = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch (_) {}
        if (!res.ok || !j.ok) {
          throw new Error((j && j.error) || res.statusText || "Catalog update failed");
        }
      });
    });
  }

  function saveEdit() {
    if (!editingId) return;
    showMsg("", false);
    var ps = Number(document.getElementById("vpmPriceS").value);
    var pm = Number(document.getElementById("vpmPriceM").value);
    var pl = Number(document.getElementById("vpmPriceL").value);
    function readCost(id) {
      var el = document.getElementById(id);
      if (!el) return null;
      var t = String(el.value || "").trim();
      if (!t) return null;
      var n = Number(t);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
    }
    var cs = readCost("vpmCostS");
    var cm = readCost("vpmCostM");
    var cl = readCost("vpmCostL");

    var returnGift = !!(document.getElementById("vpmReturnGiftYes") && document.getElementById("vpmReturnGiftYes").checked);
    var descTxt = String((document.getElementById("vpmDescription") && document.getElementById("vpmDescription").value) || "").trim();
    var coverUrl = getCoverUrlInput();
    if (coverUrl && !/^https:\/\//i.test(coverUrl) && coverUrl.indexOf("media/") !== 0 && coverUrl.charAt(0) !== "/") {
      showMsg("Cover image URL must be https:// (e.g. Cloudinary) or an existing media path.", true);
      return;
    }

    if (editingSource === "catalog") {
      var nameVal = String((document.getElementById("vpmName") && document.getElementById("vpmName").value) || "").trim();
      if (!nameVal) {
        showMsg("Product name is required.", true);
        return;
      }
      var migrated = buildMigratedOptionsForSave(coverUrl || editingCoverFallback);
      migrated.detailBody = descTxt;
      var catBody = {
        name: nameVal,
        priceS: Number.isFinite(ps) ? ps : 0,
        priceM: Number.isFinite(pm) ? pm : 0,
        priceL: Number.isFinite(pl) ? pl : 0,
        costS: cs,
        costM: cm,
        costL: cl,
        returnGift: returnGift,
        sizeLabelS: String((document.getElementById("vpmLblS") && document.getElementById("vpmLblS").value) || "").trim(),
        sizeLabelM: String((document.getElementById("vpmLblM") && document.getElementById("vpmLblM").value) || "").trim(),
        sizeLabelL: String((document.getElementById("vpmLblL") && document.getElementById("vpmLblL").value) || "").trim(),
        description: descTxt,
        options: migrated,
      };
      putCatalogPrices(editingId, catBody)
        .then(function () {
          showMsg("Saved. Product name and details updated on the guest storefront.", false);
          refreshGuestCatalogMerge();
          return loadList();
        })
        .then(function () {
          closeEdit();
        })
        .catch(function (e) {
          showMsg(String((e && e.message) || e), true);
        });
      return;
    }

    var vendorName = String((document.getElementById("vpmName") && document.getElementById("vpmName").value) || "").trim();
    if (!vendorName) {
      showMsg("Product name is required.", true);
      return;
    }

    var fd = new FormData();
    fd.set("name", vendorName);
    fd.set("priceS", document.getElementById("vpmPriceS").value);
    fd.set("priceM", document.getElementById("vpmPriceM").value);
    fd.set("priceL", document.getElementById("vpmPriceL").value);
    fd.set("sizeLabelS", document.getElementById("vpmLblS").value.trim());
    fd.set("sizeLabelM", document.getElementById("vpmLblM").value.trim());
    fd.set("sizeLabelL", document.getElementById("vpmLblL").value.trim());
    fd.set("returnGift", returnGift ? "true" : "false");
    if (coverUrl && /^https:\/\//i.test(coverUrl)) {
      fd.set("imageUrl", coverUrl);
    }
    fd.set("gallery", getGalleryUrls().join("\n"));
    fd.set("description", descTxt);
    var file = document.getElementById("vpmImage").files && document.getElementById("vpmImage").files[0];
    if (file) fd.set("image", file, file.name);

    var headers = V.authHeaders();
    delete headers["Content-Type"];

    fetch(base() + "/api/vendor/products/" + encodeURIComponent(editingId), {
      method: "PUT",
      headers: headers,
      body: fd,
      cache: "no-store",
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var j = {};
          try {
            j = text ? JSON.parse(text) : {};
          } catch (_) {}
          if (!res.ok || !j.ok) {
            throw new Error((j && j.error) || res.statusText || "Save failed");
          }
          return j;
        });
      })
      .then(function (j) {
        var savedCover = stripMediaCacheBust((j.product && j.product.image) || coverUrl || editingCoverFallback);
        var migrated2 = buildMigratedOptionsForSave(savedCover);
        migrated2.detailBody = descTxt;
        return putCatalogPrices(editingId, {
          name: vendorName,
          priceS: Number.isFinite(ps) ? ps : 0,
          priceM: Number.isFinite(pm) ? pm : 0,
          priceL: Number.isFinite(pl) ? pl : 0,
          costS: cs,
          costM: cm,
          costL: cl,
          returnGift: returnGift,
          description: descTxt,
          options: migrated2,
        });
      })
      .then(function () {
        showMsg("Saved. Product name and details updated on the guest storefront.", false);
        refreshGuestCatalogMerge();
        return loadList();
      })
      .then(function () {
        closeEdit();
      })
      .catch(function (e) {
        showMsg(String((e && e.message) || e), true);
      });
  }

  var searchDebounceTimer = null;
  var VPM_STATE_KEY = "craftguruVpmListState";

  function saveListViewState() {
    try {
      sessionStorage.setItem(
        VPM_STATE_KEY,
        JSON.stringify({ searchQ: searchQ, scrollY: window.scrollY || 0 })
      );
    } catch (_) {}
  }

  function restoreListViewState() {
    try {
      var raw = sessionStorage.getItem(VPM_STATE_KEY);
      if (!raw) return;
      var st = JSON.parse(raw);
      if (st.searchQ) {
        searchQ = String(st.searchQ);
        var inp = document.getElementById("vpmSearch");
        if (inp) inp.value = searchQ;
      }
      var sy = Number(st.scrollY);
      if (Number.isFinite(sy) && sy > 0) {
        requestAnimationFrame(function () {
          window.scrollTo(0, sy);
        });
      }
    } catch (_) {}
  }

  function runSearch() {
    var el = document.getElementById("vpmSearch");
    searchQ = el ? String(el.value || "").trim() : "";
    loadList().catch(function () {});
  }

  function scheduleSearch() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(function () {
      searchDebounceTimer = null;
      runSearch();
    }, 220);
  }

  function showAddPanel(show) {
    var add = document.getElementById("vpmAddProductPanel");
    var list = document.getElementById("vpmListSection");
    if (add) add.hidden = !show;
    if (list) list.hidden = !!show;
    if (show) {
      closeEdit();
      if (window.CraftguruVendorStorefrontAddProduct) {
        window.CraftguruVendorStorefrontAddProduct.refillCategoryDropdowns();
      }
    }
  }

  function loadCategoriesForAdd() {
    return fetch(base() + "/api/vendor/categories", {
      headers: V.authHeaders(),
      cache: "no-store",
    })
      .then(function (res) {
        return V.parseApiJson(res).then(function (x) {
          if (x.status === 401) return V.explainVendor401(base());
          if (!x.okHttp || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Categories failed");
          }
          return x.json.categories || [];
        });
      })
      .then(function (cats) {
        if (window.CraftguruVendorStorefrontAddProduct) {
          window.CraftguruVendorStorefrontAddProduct.init({
            V: V,
            categories: cats,
            onCreated: function () {
              loadList().catch(function () {});
            },
            successMessage:
              "Created. The product is on the guest storefront list — use Refresh if needed, then Edit for advanced options.",
          });
        }
      });
  }

  function boot() {
    if (V.injectSidebar) V.injectSidebar();
    if (window.VendorCatalogPdpOptions && typeof window.VendorCatalogPdpOptions.boot === "function") {
      window.VendorCatalogPdpOptions.boot();
    }

    document.getElementById("vpmRefresh").addEventListener("click", function () {
      loadList();
    });
    var addBtn = document.getElementById("vpmAddNew");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        showAddPanel(true);
      });
    }
    var couponsBtn = document.getElementById("vpmCoupons");
    if (couponsBtn) {
      couponsBtn.addEventListener("click", function () {
        var panel = document.getElementById("vpmCouponPanel");
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) { setCouponType(couponType); loadCoupons(); }
      });
    }
    var couponsClose = document.getElementById("vpmCouponsClose");
    if (couponsClose) couponsClose.addEventListener("click", function () { document.getElementById("vpmCouponPanel").hidden = true; });
    document.querySelectorAll(".vpm-coupon-tab").forEach(function (button) {
      button.addEventListener("click", function () { setCouponType(button.getAttribute("data-coupon-type")); });
    });
    var couponSave = document.getElementById("vpmCouponSave");
    if (couponSave) couponSave.addEventListener("click", saveCoupon);
    var couponBody = document.getElementById("vpmCouponTbody");
    if (couponBody) couponBody.addEventListener("click", function (event) {
      var edit = event.target && event.target.closest ? event.target.closest(".vpm-coupon-edit") : null;
      if (edit) { editCoupon(edit.getAttribute("data-coupon-id")); return; }
      var button = event.target && event.target.closest ? event.target.closest(".vpm-coupon-toggle") : null;
      if (!button) return;
      var id = button.getAttribute("data-coupon-id");
      var active = button.getAttribute("data-coupon-active") !== "1";
      fetch(base() + "/api/vendor/coupons/" + encodeURIComponent(id) + "/active", { method: "PATCH", headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()), body: JSON.stringify({ active: active }) })
        .then(function (res) { return V.parseApiJson(res); })
        .then(function (x) { if (!x.okHttp || !x.json.ok) throw new Error((x.json && x.json.error) || "Could not update coupon."); showCouponMsg(active ? "Coupon activated." : "Coupon deactivated.", false); return loadCoupons(); })
        .catch(function (err) { showCouponMsg(String((err && err.message) || err), true); });
    });
    var couponCancelEdit = document.getElementById("vpmCouponCancelEdit");
    if (couponCancelEdit) couponCancelEdit.addEventListener("click", clearCouponForm);
    var addCancel = document.getElementById("vpmAddCancel");
    if (addCancel) {
      addCancel.addEventListener("click", function () {
        showAddPanel(false);
      });
    }
    document.getElementById("vpmSearchBtn").addEventListener("click", runSearch);
    document.getElementById("vpmSearchClear").addEventListener("click", function () {
      var el = document.getElementById("vpmSearch");
      if (el) el.value = "";
      searchQ = "";
      loadList().catch(function () {});
    });
    var stEl = document.getElementById("vpmStatus");
    if (stEl) {
      stEl.addEventListener("change", function () {
        statusFilter = String(stEl.value || "all");
        renderTable();
      });
    }
    var searchInp = document.getElementById("vpmSearch");
    if (searchInp) {
      searchInp.addEventListener("input", scheduleSearch);
      searchInp.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
          runSearch();
        }
      });
    }

    document.querySelectorAll('input[name="vpmReturnGift"]').forEach(function (inp) {
      inp.addEventListener("change", syncReturnGiftVisual);
    });

    document.getElementById("vpmTbody").addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || typeof t.closest !== "function") return;
      var btn = t.closest("button[data-id]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      if (!id) return;
      var p = findProductById(id);
      if (btn.classList.contains("vpm-edit") && p) {
        openEdit(p);
        return;
      }
      if (btn.classList.contains("vpm-disc")) {
        if (!window.confirm("Discontinue this product? It will disappear from the guest storefront and from the main Inventory screen until you set it active again.")) {
          return;
        }
        setActive(id, false)
          .then(function () {
            return loadList();
          })
          .then(function () {
            showMsg("Product discontinued. It is hidden from the storefront and available under the Discontinued filter.", false);
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
        return;
      }
      if (btn.classList.contains("vpm-react")) {
        setActive(id, true)
          .then(function () {
            return loadList();
          })
          .then(function () {
            showMsg("Product is active again and will return to the storefront.", false);
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
        return;
      }
      if (btn.classList.contains("vpm-del")) {
        if (!window.confirm("Archive this product? It will be hidden from the storefront and can be set active again later.")) {
          return;
        }
        setActive(id, false)
          .then(function () {
            if (editingId === id) closeEdit();
            refreshGuestCatalogMerge();
            return loadList();
          })
          .catch(function (e) {
            window.alert(String((e && e.message) || e));
          });
      }
    });
    document.getElementById("vpmSave").addEventListener("click", saveEdit);
    document.getElementById("vpmCancelEdit").addEventListener("click", closeEdit);

    loadCategoriesForAdd()
      .catch(function () {})
      .then(function () {
        if (window.location.hash === "#add-product") {
          showAddPanel(true);
        }
        return loadList();
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
