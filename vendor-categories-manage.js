(function () {
  "use strict";

  var V = window.CraftguruVendor;
  if (!V) return;

  var resinCategories = [];
  var rmTaxonomy = { version: 1, categories: [] };
  var pfNav = { version: 1, categories: [] };
  var CAT_ONLY = "__category_only__";
  var IF = window.CraftguruImageFit;
  var editImageFit = "";
  var createCatImageFit = "";

  function normalizeFit(v) {
    return IF && IF.normalizeImageFit ? IF.normalizeImageFit(v) : String(v || "").trim().toLowerCase() === "contain" ? "contain" : "";
  }

  function syncFitButton(btn, fit) {
    if (!btn) return;
    var f = normalizeFit(fit);
    btn.setAttribute("data-image-fit", f || "");
    btn.textContent = IF && IF.fitButtonLabel ? IF.fitButtonLabel(f) : f === "contain" ? "Fit: contain ✓" : "Fit image";
    btn.classList.toggle("vpm-img-fit-btn--on", f === "contain");
  }

  function applyPreviewFit(img, fit) {
    if (!img) return;
    if (IF && IF.applyImageFit) IF.applyImageFit(img, fit);
    else if (normalizeFit(fit) === "contain") img.setAttribute("data-image-fit", "contain");
    else img.removeAttribute("data-image-fit");
  }

  function resolvePreviewUrl(rel) {
    rel = String(rel || "").trim();
    if (!rel) return "";
    if (/^https?:\/\//i.test(rel)) return rel;
    try {
      return new URL(rel.replace(/^\//, ""), window.location.origin + "/").href;
    } catch (_) {
      return rel;
    }
  }

  function syncCoverPreview(imgEl, emptyEl, url, fit) {
    var u = resolvePreviewUrl(url);
    if (!imgEl) return;
    if (!u) {
      imgEl.hidden = true;
      imgEl.removeAttribute("src");
      if (emptyEl) emptyEl.hidden = false;
      applyPreviewFit(imgEl, "");
      return;
    }
    imgEl.hidden = false;
    imgEl.src = u;
    if (emptyEl) emptyEl.hidden = true;
    applyPreviewFit(imgEl, fit);
  }

  function syncEditCoverPreview() {
    syncCoverPreview(
      document.getElementById("vcmEditPreview"),
      document.getElementById("vcmEditPreviewEmpty"),
      document.getElementById("vcmEditImg") && document.getElementById("vcmEditImg").value,
      editImageFit
    );
    syncFitButton(document.getElementById("vcmEditFitBtn"), editImageFit);
  }

  function syncCreateCoverPreview() {
    syncCoverPreview(
      document.getElementById("vcmCreateCatPreview"),
      document.getElementById("vcmCreateCatPreviewEmpty"),
      document.getElementById("vcmCreateCatImg") && document.getElementById("vcmCreateCatImg").value,
      createCatImageFit
    );
    syncFitButton(document.getElementById("vcmCreateCatFitBtn"), createCatImageFit);
  }

  function readStoredImageFit(obj) {
    if (!obj) return "";
    return normalizeFit(obj.imageFit || obj.nav_image_fit || obj.navImageFit || "");
  }

  function catNameInput() {
    return document.getElementById("vcmEditCatName");
  }

  function subNameInput() {
    return document.getElementById("vcmEditSubName");
  }

  function setMsg(t, isErr) {
    var el = document.getElementById("vcmMsg");
    if (!el) return;
    el.textContent = t || "";
    el.style.color = isErr ? "#b42318" : "";
  }

  function slugify(s) {
    var t = String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72);
    return t || "item";
  }

  function clone(o) {
    try {
      return JSON.parse(JSON.stringify(o || {}));
    } catch (_) {
      return {};
    }
  }

  function loadResin() {
    return V.vendorFetch(V.vendorApiUrl("/api/vendor/categories"), {
      headers: V.authHeaders(),
      cache: "no-store",
    })
      .then(V.parseApiJson)
      .then(function (x) {
        if (!x.okHttp || !x.json || !x.json.ok) {
          throw new Error((x.json && x.json.error) || "Categories failed");
        }
        resinCategories = x.json.categories || [];
      });
  }

  function loadRm() {
    return V.vendorFetch(V.vendorApiUrl("/api/vendor/raw-material-taxonomy"), {
      headers: V.authHeaders(),
      cache: "no-store",
    })
      .then(V.parseApiJson)
      .then(function (x) {
        if (!x.okHttp || !x.json || !x.json.ok || !x.json.taxonomy) {
          throw new Error((x.json && x.json.error) || "Raw taxonomy failed");
        }
        rmTaxonomy = x.json.taxonomy;
      });
  }

  function loadPf() {
    return V.vendorFetch(V.vendorApiUrl("/api/vendor/photo-frame-nav"), {
      headers: V.authHeaders(),
      cache: "no-store",
    })
      .then(V.parseApiJson)
      .then(function (x) {
        if (!x.okHttp || !x.json || !x.json.ok || !x.json.nav) {
          throw new Error((x.json && x.json.error) || "Photo frame nav failed");
        }
        pfNav = x.json.nav;
      });
  }

  function putRm(doc) {
    return V.vendorFetch(V.vendorApiUrl("/api/vendor/raw-material-taxonomy"), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify({ taxonomy: doc }),
    }).then(V.parseApiJson);
  }

  function putPf(doc) {
    return V.vendorFetch(V.vendorApiUrl("/api/vendor/photo-frame-nav"), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
      body: JSON.stringify({ nav: doc }),
    }).then(V.parseApiJson);
  }

  function deleteRmMaterials(base, sub) {
    var q = "?base=" + encodeURIComponent(base) + (sub ? "&sub=" + encodeURIComponent(sub) : "");
    return V.vendorFetch(V.vendorApiUrl("/api/vendor/raw-material-taxonomy/materials" + q), {
      method: "DELETE",
      headers: V.authHeaders(),
    }).then(V.parseApiJson);
  }

  function deletePfMaterials(base, sub) {
    var q = "?base=" + encodeURIComponent(base) + (sub ? "&sub=" + encodeURIComponent(sub) : "");
    return V.vendorFetch(V.vendorApiUrl("/api/vendor/photo-frame-nav/materials" + q), {
      method: "DELETE",
      headers: V.authHeaders(),
    }).then(V.parseApiJson);
  }

  function notifyGuestCatalogRefresh() {
    try {
      if (window.CraftguruCatalogMerge && typeof window.CraftguruCatalogMerge.refresh === "function") {
        window.CraftguruCatalogMerge.refresh();
      }
      if (window.RmShopNav && typeof window.RmShopNav.refresh === "function") {
        window.RmShopNav.refresh();
      }
      if (window.PfShopNav && typeof window.PfShopNav.refresh === "function") {
        window.PfShopNav.refresh();
      }
    } catch (_) {}
  }

  function refreshAll() {
    setMsg("Loading…");
    return loadResin()
      .then(function () {
        return loadRm();
      })
      .then(function () {
        return loadPf();
      })
      .then(function () {
        setMsg("");
        fillPfUnderSelect();
        onEditDomainChange();
      })
      .catch(function (e) {
        setMsg(String((e && e.message) || e), true);
      });
  }

  function fillPfUnderSelect() {
    var sel = document.getElementById("vcmPfUnder");
    if (!sel) return;
    sel.innerHTML = "";
    (pfNav.categories || []).forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name || c.id;
      sel.appendChild(o);
    });
  }

  function onCreateDomainChange() {
    var d = String(document.getElementById("vcmCreateDomain").value || "");
    var hrefWrap = document.getElementById("vcmCreateHrefWrap");
    var pfUnder = document.getElementById("vcmPfUnderWrap");
    if (hrefWrap) hrefWrap.hidden = d !== "resin-photo-frame";
    if (pfUnder) pfUnder.hidden = d !== "resin-photo-frame";
  }

  function appendCategoryPlaceholder(catSel) {
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "— Select category —";
    catSel.appendChild(ph);
  }

  function onEditDomainChange() {
    var d = String(document.getElementById("vcmEditDomain").value || "");
    var hrefWrap = document.getElementById("vcmEditHrefWrap");
    if (hrefWrap) hrefWrap.hidden = d !== "resin-photo-frame";
    var catSel = document.getElementById("vcmEditCat");
    var subSel = document.getElementById("vcmEditSub");
    if (!catSel || !subSel) return;
    catSel.innerHTML = "";
    subSel.innerHTML = "";
    appendCategoryPlaceholder(catSel);
    if (d === "resin-products") {
      resinCategories.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id;
        o.textContent = (c.label || c.id) + (c.vendor_owned ? " (vendor)" : "");
        catSel.appendChild(o);
      });
    } else if (d === "resin-raw-material") {
      (rmTaxonomy.categories || []).forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.name || c.id;
        catSel.appendChild(o);
      });
    } else {
      (pfNav.categories || []).forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.name || c.id;
        catSel.appendChild(o);
      });
    }
    catSel.value = "";
    onEditCatChange();
  }

  /** Keep category + line name fields in sync with dropdowns (no server round-trip). */
  function hydrateEditFieldsFromSelection() {
    var cn = catNameInput();
    var sn = subNameInput();
    if (!cn || !sn) return;
    var d = String(document.getElementById("vcmEditDomain").value || "");
    var catId = String(document.getElementById("vcmEditCat").value || "");
    var subVal = String(document.getElementById("vcmEditSub").value || "");
    if (!catId) {
      cn.value = "";
      sn.value = "";
      sn.disabled = true;
      sn.placeholder = "Select a category first";
      document.getElementById("vcmEditImg").value = "";
      editImageFit = "";
      syncEditCoverPreview();
      return;
    }
    var imgInput = document.getElementById("vcmEditImg");
    var hrefInput = document.getElementById("vcmEditHref");
    if (d === "resin-products") {
      var c = resinCategories.find(function (x) {
        return String(x.id) === catId;
      });
      cn.value = (c && c.label) || "";
      if (subVal === CAT_ONLY) {
        sn.value = "";
        sn.disabled = true;
        sn.placeholder = "Entire category — pick a line to edit its name";
        if (imgInput) imgInput.value = (c && c.nav_image) || "";
        editImageFit = readStoredImageFit(c);
        if (hrefInput) hrefInput.value = "";
      } else {
        var s = (c && c.subcategories && c.subcategories.find(function (y) {
          return String(y.id) === subVal;
        })) || {};
        sn.disabled = false;
        sn.placeholder = "Subcategory / line name";
        sn.value = s.label || "";
        if (imgInput) imgInput.value = s.image || "";
        editImageFit = readStoredImageFit(s);
        if (hrefInput) hrefInput.value = "";
      }
      syncEditCoverPreview();
      return;
    }
    if (d === "resin-raw-material") {
      var c2 = (rmTaxonomy.categories || []).find(function (x) {
        return String(x.id) === catId;
      });
      cn.value = (c2 && c2.name) || "";
      if (subVal === CAT_ONLY) {
        sn.value = "";
        sn.disabled = true;
        sn.placeholder = "Entire category — pick a line to edit its name";
        if (imgInput) imgInput.value = (c2 && c2.image) || "";
        editImageFit = readStoredImageFit(c2);
        if (hrefInput) hrefInput.value = "";
      } else {
        var s2 = (c2 && c2.subcategories && c2.subcategories.find(function (y) {
          return String(y.id) === subVal;
        })) || {};
        sn.disabled = false;
        sn.placeholder = "Subcategory / line name";
        sn.value = s2.name || "";
        if (imgInput) imgInput.value = s2.image || "";
        editImageFit = readStoredImageFit(s2);
        if (hrefInput) hrefInput.value = "";
      }
      syncEditCoverPreview();
      return;
    }
    if (d === "resin-photo-frame") {
      var c3 = (pfNav.categories || []).find(function (x) {
        return String(x.id) === catId;
      });
      cn.value = (c3 && c3.name) || "";
      if (subVal === CAT_ONLY) {
        sn.value = "";
        sn.disabled = true;
        sn.placeholder = "Entire group — pick a line to edit its name";
        if (imgInput) imgInput.value = (c3 && c3.image) || "";
        editImageFit = readStoredImageFit(c3);
        if (hrefInput) hrefInput.value = "";
      } else {
        var s3 = (c3 && c3.subcategories && c3.subcategories.find(function (y) {
          return String(y.id) === subVal;
        })) || {};
        sn.disabled = false;
        sn.placeholder = "Line name";
        sn.value = s3.name || "";
        if (imgInput) imgInput.value = s3.image || "";
        editImageFit = readStoredImageFit(s3);
        if (hrefInput) hrefInput.value = (s3.href != null && String(s3.href)) || "";
      }
      syncEditCoverPreview();
      return;
    }
    cn.value = "";
    sn.value = "";
    sn.disabled = true;
  }

  function onEditCatChange() {
    var d = String(document.getElementById("vcmEditDomain").value || "");
    var catId = String(document.getElementById("vcmEditCat").value || "");
    var subSel = document.getElementById("vcmEditSub");
    if (!subSel) return;
    subSel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = CAT_ONLY;
    ph.textContent = "— Entire category / group —";
    subSel.appendChild(ph);
    if (!catId) return;
    if (d === "resin-products") {
      var c = resinCategories.find(function (x) {
        return String(x.id) === catId;
      });
      (c && c.subcategories ? c.subcategories : []).forEach(function (s) {
        if (!s || !s.id) return;
        var o = document.createElement("option");
        o.value = String(s.id);
        if (String(s.id) === "all") {
          o.textContent = (s.label || "All") + " (storefront default)";
        } else {
          o.textContent = s.label || s.id;
        }
        subSel.appendChild(o);
      });
    } else if (d === "resin-raw-material") {
      var c2 = (rmTaxonomy.categories || []).find(function (x) {
        return String(x.id) === catId;
      });
      (c2 && c2.subcategories ? c2.subcategories : []).forEach(function (s) {
        if (!s) return;
        var o = document.createElement("option");
        o.value = String(s.id);
        o.textContent = s.name || s.id;
        subSel.appendChild(o);
      });
    } else if (d === "resin-photo-frame") {
      var c3 = (pfNav.categories || []).find(function (x) {
        return String(x.id) === catId;
      });
      (c3 && c3.subcategories ? c3.subcategories : []).forEach(function (s) {
        if (!s) return;
        var o = document.createElement("option");
        o.value = String(s.id);
        var base = (s.name || s.id) + " (photo frame line)";
        var href = (s.href != null && String(s.href).trim()) || "";
        o.textContent = href ? base + " → " + href : base;
        subSel.appendChild(o);
      });
    }
    hydrateEditFieldsFromSelection();
  }

  function clearCreateForm() {
    document.getElementById("vcmCreateCatName").value = "";
    document.getElementById("vcmCreateSubName").value = "";
    document.getElementById("vcmCreateCatImg").value = "";
    document.getElementById("vcmCreateSubImg").value = "";
    createCatImageFit = "";
    syncCreateCoverPreview();
    var h = document.getElementById("vcmCreateHref");
    if (h) h.value = "";
  }

  document.getElementById("vcmCreateDomain").addEventListener("change", onCreateDomainChange);
  document.getElementById("vcmEditDomain").addEventListener("change", onEditDomainChange);
  document.getElementById("vcmEditCat").addEventListener("change", onEditCatChange);
  document.getElementById("vcmEditSub").addEventListener("change", hydrateEditFieldsFromSelection);

  var createCatImgEl = document.getElementById("vcmCreateCatImg");
  if (createCatImgEl) {
    createCatImgEl.addEventListener("input", syncCreateCoverPreview);
  }
  var editImgEl = document.getElementById("vcmEditImg");
  if (editImgEl) {
    editImgEl.addEventListener("input", syncEditCoverPreview);
  }
  var createFitBtn = document.getElementById("vcmCreateCatFitBtn");
  if (createFitBtn) {
    createFitBtn.addEventListener("click", function () {
      createCatImageFit = IF && IF.toggleImageFit ? IF.toggleImageFit(createCatImageFit) : createCatImageFit === "contain" ? "" : "contain";
      syncCreateCoverPreview();
    });
  }
  var editFitBtn = document.getElementById("vcmEditFitBtn");
  if (editFitBtn) {
    editFitBtn.addEventListener("click", function () {
      editImageFit = IF && IF.toggleImageFit ? IF.toggleImageFit(editImageFit) : editImageFit === "contain" ? "" : "contain";
      syncEditCoverPreview();
    });
  }

  document.getElementById("vcmCreateSubmit").addEventListener("click", function () {
    var domain = String(document.getElementById("vcmCreateDomain").value || "");
    var catName = String(document.getElementById("vcmCreateCatName").value || "").trim();
    var subName = String(document.getElementById("vcmCreateSubName").value || "").trim();
    var catImg = String(document.getElementById("vcmCreateCatImg").value || "").trim();
    var subImg = String(document.getElementById("vcmCreateSubImg").value || "").trim();
    if (!catName) {
      setMsg("Enter a category or group name.", true);
      return;
    }
    setMsg("Saving…");
    if (domain === "resin-products") {
      var subs = [{ id: "all", label: "All" }];
      if (subName) {
        var sid = slugify(subName);
        var o = { id: sid, label: subName };
        if (subImg) o.image = subImg;
        subs.push(o);
      }
      V.vendorFetch(V.vendorApiUrl("/api/vendor/categories"), {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
        body: JSON.stringify({
          label: catName,
          folder: catName,
          navImage: catImg,
          navImageFit: createCatImageFit || undefined,
          subcategories: subs,
        }),
      })
        .then(V.parseApiJson)
        .then(function (x) {
          if (!x.okHttp || !x.json || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Create failed");
          }
          setMsg("Resin product category created.");
          clearCreateForm();
          return loadResin().then(onEditDomainChange);
        })
        .catch(function (e) {
          setMsg(String((e && e.message) || e), true);
        });
      return;
    }
    if (domain === "resin-raw-material") {
      var doc = clone(rmTaxonomy);
      doc.categories = doc.categories || [];
      var bid = slugify(catName);
      var grp = doc.categories.find(function (c) {
        return c.id === bid;
      });
      if (!grp) {
        grp = { id: bid, name: catName, image: catImg || "", imageFit: createCatImageFit || undefined, subcategories: [] };
        doc.categories.push(grp);
      } else {
        if (catImg) grp.image = catImg;
        grp.name = catName;
        if (createCatImageFit) grp.imageFit = createCatImageFit;
        else delete grp.imageFit;
      }
      if (subName) {
        var sid2 = slugify(subName);
        grp.subcategories = grp.subcategories || [];
        if (!grp.subcategories.some(function (s) {
          return s.id === sid2;
        })) {
          var row = { id: sid2, name: subName, image: subImg || "" };
          grp.subcategories.push(row);
        }
      }
      putRm(doc)
        .then(function (x) {
          if (!x.okHttp || !x.json || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Save failed");
          }
          setMsg("Raw material taxonomy updated.");
          rmTaxonomy = doc;
          clearCreateForm();
          return loadRm().then(onEditDomainChange);
        })
        .catch(function (e) {
          setMsg(String((e && e.message) || e), true);
        });
      return;
    }
    var hrefInput0 = document.getElementById("vcmCreateHref");
    var hrefFromUser = hrefInput0 ? String(hrefInput0.value || "").trim() : "";
    var doc2 = clone(pfNav);
    doc2.categories = doc2.categories || [];
    var underSel = document.getElementById("vcmPfUnder");
    var underId = underSel && underSel.value ? underSel.value : (doc2.categories[0] && doc2.categories[0].id);
    var grp2 = doc2.categories.find(function (c) {
      return c.id === underId;
    });
    if (!grp2) {
      grp2 = {
        id: slugify(catName),
        name: catName,
        image: catImg || "",
        subcategories: [],
      };
      doc2.categories.push(grp2);
    }
    grp2.subcategories = grp2.subcategories || [];
    var lineLabel = subName || catName;
    var catSlug = slugify(subName || catName);
    var lid = slugify(lineLabel + "-" + (hrefFromUser || catSlug || "line")).slice(0, 72);
    var hrefVal = hrefFromUser;
    if (!hrefVal) {
      hrefVal =
        "photo-frames.html?base=" +
        encodeURIComponent(String(grp2.id || "").trim()) +
        "&sub=" +
        encodeURIComponent(lid);
      if (hrefInput0) hrefInput0.value = hrefVal;
    }
    grp2.subcategories.push({
      id: lid,
      name: lineLabel,
      image: subImg || catImg || "",
      href: hrefVal,
    });
    putPf(doc2)
      .then(function (x) {
        if (!x.okHttp || !x.json || !x.json.ok) {
          throw new Error((x.json && x.json.error) || "Save failed");
        }
        setMsg("Photo frame links updated.");
        pfNav = doc2;
        clearCreateForm();
        fillPfUnderSelect();
        return loadPf().then(onEditDomainChange);
      })
      .catch(function (e) {
        setMsg(String((e && e.message) || e), true);
      });
  });

  document.getElementById("vcmEditLoad").addEventListener("click", function () {
    var d = String(document.getElementById("vcmEditDomain").value || "");
    var catId = String(document.getElementById("vcmEditCat").value || "");
    var subVal = String(document.getElementById("vcmEditSub").value || "");
    if (!catId) {
      setMsg("Pick a category.", true);
      return;
    }
    if (d === "resin-products") {
      var c = resinCategories.find(function (x) {
        return String(x.id) === catId;
      });
      hydrateEditFieldsFromSelection();
      if (subVal === CAT_ONLY) {
        document.getElementById("vcmEditImg").value = (c && c.nav_image) || "";
        editImageFit = readStoredImageFit(c);
      } else {
        var s = (c && c.subcategories && c.subcategories.find(function (y) {
          return String(y.id) === subVal;
        })) || {};
        document.getElementById("vcmEditImg").value = s.image || "";
        editImageFit = readStoredImageFit(s);
      }
      document.getElementById("vcmEditHref").value = "";
      syncEditCoverPreview();
      setMsg("Loaded.");
      return;
    }
    if (d === "resin-raw-material") {
      var c2 = (rmTaxonomy.categories || []).find(function (x) {
        return String(x.id) === catId;
      });
      hydrateEditFieldsFromSelection();
      if (subVal === CAT_ONLY) {
        document.getElementById("vcmEditImg").value = (c2 && c2.image) || "";
        editImageFit = readStoredImageFit(c2);
      } else {
        var s2 = (c2 && c2.subcategories && c2.subcategories.find(function (y) {
          return String(y.id) === subVal;
        })) || {};
        document.getElementById("vcmEditImg").value = s2.image || "";
        editImageFit = readStoredImageFit(s2);
      }
      document.getElementById("vcmEditHref").value = "";
      syncEditCoverPreview();
      setMsg("Loaded.");
      return;
    }
    if (d === "resin-photo-frame") {
      var c3 = (pfNav.categories || []).find(function (x) {
        return String(x.id) === catId;
      });
      hydrateEditFieldsFromSelection();
      if (subVal === CAT_ONLY) {
        document.getElementById("vcmEditImg").value = (c3 && c3.image) || "";
        editImageFit = readStoredImageFit(c3);
        document.getElementById("vcmEditHref").value = "";
      } else {
        var s3 = (c3 && c3.subcategories && c3.subcategories.find(function (y) {
          return String(y.id) === subVal;
        })) || {};
        document.getElementById("vcmEditImg").value = s3.image || "";
        editImageFit = readStoredImageFit(s3);
        document.getElementById("vcmEditHref").value = (s3.href != null && String(s3.href)) || "";
      }
      syncEditCoverPreview();
      setMsg("Loaded.");
      return;
    }
    setMsg("Unknown domain.", true);
  });

  document.getElementById("vcmEditSave").addEventListener("click", function () {
    var d = String(document.getElementById("vcmEditDomain").value || "");
    var catId = String(document.getElementById("vcmEditCat").value || "");
    var subVal = String(document.getElementById("vcmEditSub").value || "");
    var catName = String(catNameInput() && catNameInput().value || "").trim();
    var subName = String(subNameInput() && subNameInput().value || "").trim();
    var img = String(document.getElementById("vcmEditImg").value || "").trim();
    var hrefE = String(document.getElementById("vcmEditHref").value || "").trim();
    if (!catId) {
      setMsg("Pick a category.", true);
      return;
    }
    if (!catName) {
      setMsg("Category / group name is required.", true);
      return;
    }
    if (subVal !== CAT_ONLY && !subName) {
      setMsg("Subcategory / line name is required when a line is selected.", true);
      return;
    }
    setMsg("Saving…");
    if (d === "resin-products") {
      if (subVal === CAT_ONLY) {
        V.vendorFetch(V.vendorApiUrl("/api/vendor/categories/" + encodeURIComponent(catId)), {
          method: "PATCH",
          headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
          body: JSON.stringify({ label: catName, navImage: img, navImageFit: editImageFit || "" }),
        })
          .then(V.parseApiJson)
          .then(function (x) {
            if (!x.okHttp || !x.json || !x.json.ok) {
              throw new Error((x.json && x.json.error) || "Save failed");
            }
            setMsg("Saved.");
            notifyGuestCatalogRefresh();
            return loadResin().then(onEditDomainChange);
          })
          .catch(function (e) {
            setMsg(String((e && e.message) || e), true);
          });
        return;
      }
      var c = resinCategories.find(function (x) {
        return String(x.id) === catId;
      });
      var subs = clone(c && c.subcategories) || [];
      var ix = subs.findIndex(function (s) {
        return String(s.id) === subVal;
      });
      if (ix < 0) {
        setMsg("Subcategory not found.", true);
        return;
      }
      subs[ix].label = subName;
      if (img) subs[ix].image = img;
      else delete subs[ix].image;
      if (editImageFit) subs[ix].imageFit = editImageFit;
      else delete subs[ix].imageFit;
      V.vendorFetch(V.vendorApiUrl("/api/vendor/categories/" + encodeURIComponent(catId)), {
        method: "PATCH",
        headers: Object.assign({ "Content-Type": "application/json" }, V.authHeaders()),
        body: JSON.stringify({ label: catName, subcategories: subs }),
      })
        .then(V.parseApiJson)
        .then(function (x) {
          if (!x.okHttp || !x.json || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Save failed");
          }
          setMsg("Saved.");
          notifyGuestCatalogRefresh();
          return loadResin().then(onEditDomainChange);
        })
        .catch(function (e) {
          setMsg(String((e && e.message) || e), true);
        });
      return;
    }
    if (d === "resin-raw-material") {
      var doc = clone(rmTaxonomy);
      var grp = (doc.categories || []).find(function (x) {
        return String(x.id) === catId;
      });
      if (!grp) {
        setMsg("Category not found.", true);
        return;
      }
      grp.name = catName;
      if (subVal === CAT_ONLY) {
        grp.image = img;
        if (editImageFit) grp.imageFit = editImageFit;
        else delete grp.imageFit;
      } else {
        var sx = (grp.subcategories || []).find(function (y) {
          return String(y.id) === subVal;
        });
        if (!sx) {
          setMsg("Subcategory not found.", true);
          return;
        }
        sx.name = subName;
        sx.image = img;
        if (editImageFit) sx.imageFit = editImageFit;
        else delete sx.imageFit;
      }
      putRm(doc)
        .then(function (x) {
          if (!x.okHttp || !x.json || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Save failed");
          }
          rmTaxonomy = doc;
          setMsg("Saved.");
          notifyGuestCatalogRefresh();
          return loadRm().then(onEditDomainChange);
        })
        .catch(function (e) {
          setMsg(String((e && e.message) || e), true);
        });
      return;
    }
    if (d !== "resin-photo-frame") {
      setMsg("Unknown domain.", true);
      return;
    }
    var doc2 = clone(pfNav);
    var grp2 = (doc2.categories || []).find(function (x) {
      return String(x.id) === catId;
    });
    if (!grp2) {
      setMsg("Group not found.", true);
      return;
    }
    grp2.name = catName;
    if (subVal === CAT_ONLY) {
      grp2.image = img;
      if (editImageFit) grp2.imageFit = editImageFit;
      else delete grp2.imageFit;
    } else {
      var sx2 = (grp2.subcategories || []).find(function (y) {
        return String(y.id) === subVal;
      });
      if (!sx2) {
        setMsg("Line not found.", true);
        return;
      }
      sx2.name = subName;
      sx2.image = img;
      if (editImageFit) sx2.imageFit = editImageFit;
      else delete sx2.imageFit;
      if (hrefE) {
        sx2.href = hrefE;
      } else if (!String(sx2.href || "").trim()) {
        sx2.href =
          "photo-frames.html?base=" +
          encodeURIComponent(String(catId || "").trim()) +
          "&sub=" +
          encodeURIComponent(String(subVal || "").trim());
      }
    }
    putPf(doc2)
      .then(function (x) {
        if (!x.okHttp || !x.json || !x.json.ok) {
          throw new Error((x.json && x.json.error) || "Save failed");
        }
        pfNav = doc2;
        setMsg("Saved.");
        notifyGuestCatalogRefresh();
        return loadPf().then(onEditDomainChange);
      })
      .catch(function (e) {
        setMsg(String((e && e.message) || e), true);
      });
  });

  document.getElementById("vcmEditDelete").addEventListener("click", function () {
    var d = String(document.getElementById("vcmEditDomain").value || "");
    var catId = String(document.getElementById("vcmEditCat").value || "");
    var subVal = String(document.getElementById("vcmEditSub").value || "");
    if (!catId) {
      setMsg("Pick a category.", true);
      return;
    }
    if (!window.confirm("Delete this from the live site? This cannot be undone.")) return;
    setMsg("Deleting…");
    if (d === "resin-products") {
      if (subVal === CAT_ONLY) {
        V.vendorFetch(V.vendorApiUrl("/api/vendor/categories/" + encodeURIComponent(catId)), {
          method: "DELETE",
          headers: V.authHeaders(),
        })
          .then(V.parseApiJson)
          .then(function (x) {
            if (!x.okHttp || !x.json || !x.json.ok) {
              throw new Error((x.json && x.json.error) || "Delete failed");
            }
            setMsg("Deleted.");
            return loadResin().then(onEditDomainChange);
          })
          .catch(function (e) {
            setMsg(String((e && e.message) || e), true);
          });
        return;
      }
      V.vendorFetch(
        V.vendorApiUrl("/api/vendor/categories/" + encodeURIComponent(catId) + "/subcategories/" + encodeURIComponent(subVal)),
        { method: "DELETE", headers: V.authHeaders() }
      )
        .then(V.parseApiJson)
        .then(function (x) {
          if (!x.okHttp || !x.json || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Delete failed");
          }
          setMsg("Subcategory removed.");
          return loadResin().then(onEditDomainChange);
        })
        .catch(function (e) {
          setMsg(String((e && e.message) || e), true);
        });
      return;
    }
    if (d === "resin-raw-material") {
      var docRm = clone(rmTaxonomy);
      if (subVal === CAT_ONLY) {
        deleteRmMaterials(catId, "")
          .then(function (x) {
            if (!x.okHttp || !x.json || !x.json.ok) {
              throw new Error((x.json && x.json.error) || "Delete materials failed");
            }
            docRm.categories = (docRm.categories || []).filter(function (c) {
              return String(c.id) !== catId;
            });
            return putRm(docRm);
          })
          .then(function (x2) {
            if (!x2.okHttp || !x2.json || !x2.json.ok) {
              throw new Error((x2.json && x2.json.error) || "Save taxonomy failed");
            }
            rmTaxonomy = docRm;
            setMsg("Base category and linked materials removed.");
            return loadRm().then(onEditDomainChange);
          })
          .catch(function (e) {
            setMsg(String((e && e.message) || e), true);
          });
        return;
      }
      deleteRmMaterials(catId, subVal)
        .then(function (x) {
          if (!x.okHttp || !x.json || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Delete materials failed");
          }
          var grp = (docRm.categories || []).find(function (c) {
            return String(c.id) === catId;
          });
          if (grp && grp.subcategories) {
            grp.subcategories = grp.subcategories.filter(function (s) {
              return String(s.id) !== subVal;
            });
          }
          return putRm(docRm);
        })
        .then(function (x2) {
          if (!x2.okHttp || !x2.json || !x2.json.ok) {
            throw new Error((x2.json && x2.json.error) || "Save taxonomy failed");
          }
          rmTaxonomy = docRm;
          setMsg("Subcategory and linked materials removed.");
          return loadRm().then(onEditDomainChange);
        })
        .catch(function (e) {
          setMsg(String((e && e.message) || e), true);
        });
      return;
    }
    if (d !== "resin-photo-frame") {
      setMsg("Unknown domain.", true);
      return;
    }
    var doc2 = clone(pfNav);
    var grp2 = (doc2.categories || []).find(function (x) {
      return String(x.id) === catId;
    });
    if (!grp2) {
      setMsg("Group not found.", true);
      return;
    }
    if (subVal === CAT_ONLY) {
      deletePfMaterials(catId, "")
        .then(function (x) {
          if (!x.okHttp || !x.json || !x.json.ok) {
            throw new Error((x.json && x.json.error) || "Delete photo frame products failed");
          }
          doc2.categories = (doc2.categories || []).filter(function (c) {
            return String(c.id) !== catId;
          });
          return putPf(doc2);
        })
        .then(function (x2) {
          if (!x2.okHttp || !x2.json || !x2.json.ok) {
            throw new Error((x2.json && x2.json.error) || "Save failed");
          }
          pfNav = doc2;
          setMsg("Base group and linked photo frame products removed.");
          fillPfUnderSelect();
          return loadPf().then(onEditDomainChange);
        })
        .catch(function (e) {
          setMsg(String((e && e.message) || e), true);
        });
      return;
    }
    deletePfMaterials(catId, subVal)
      .then(function (x) {
        if (!x.okHttp || !x.json || !x.json.ok) {
          throw new Error((x.json && x.json.error) || "Delete photo frame products failed");
        }
        grp2.subcategories = (grp2.subcategories || []).filter(function (s) {
          return String(s.id) !== subVal;
        });
        return putPf(doc2);
      })
      .then(function (x2) {
        if (!x2.okHttp || !x2.json || !x2.json.ok) {
          throw new Error((x2.json && x2.json.error) || "Save failed");
        }
        pfNav = doc2;
        setMsg("Line and linked photo frame products removed.");
        fillPfUnderSelect();
        return loadPf().then(onEditDomainChange);
      })
      .catch(function (e) {
        setMsg(String((e && e.message) || e), true);
      });
  });

  document.getElementById("vcmRefresh").addEventListener("click", refreshAll);

  document.addEventListener("DOMContentLoaded", function () {
    onCreateDomainChange();
    syncCreateCoverPreview();
    refreshAll();
  });
})();
