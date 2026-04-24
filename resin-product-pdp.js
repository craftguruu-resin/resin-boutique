/**
 * Resin catalog PDP — same layout/CSS tokens as raw-material-product.js (rm-pdp--modern).
 * Expects: RESIN_DATA, RESIN_CART, optional CRAFTGURU_SHARE.
 */
(function () {
  "use strict";

  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;
  if (!D || !CART) return;

  var state = {
    product: null,
    material: null,
    sel: { sid: "", qid: "", cid: "" },
    lineQty: 1,
    imgIndex: 0,
    heroZoom: 1,
    _zoomUrl: "",
    namePlateText: "",
    keychainAlpha: "",
    keychainName: "",
  };

  function esc(s) {
    var el = document.createElement("div");
    el.textContent = s;
    return el.innerHTML;
  }
  function escAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }
  function imgSrc(rel) {
    if (!rel) return "";
    if (String(rel).indexOf("http") === 0 || String(rel).indexOf("//") === 0) return rel;
    return D.imageUrl ? D.imageUrl(rel) : rel;
  }

  function findOpt(list, id) {
    if (!id || !list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }
  function finMoney(n) {
    var x = Number(n);
    return Number.isFinite(x) ? x : null;
  }
  function effectivePriceInr(m, sel) {
    var base = finMoney(m.priceInr) != null ? Number(m.priceInr) : 0;
    if (!Number.isFinite(base) || base < 0) base = 0;
    var opt = m.options || {};
    var s = opt.useSize && sel.sid ? findOpt(opt.sizes, sel.sid) : null;
    var q = opt.useQty && sel.qid ? findOpt(opt.qtyOptions, sel.qid) : null;
    var ps = s ? finMoney(s.priceInr) : null;
    var pq = q ? finMoney(q.priceInr) : null;
    if (opt.useSize && opt.useQty) return (ps != null ? ps : base) + (pq != null ? pq : 0);
    if (opt.useSize && s) return ps != null ? ps : base;
    if (opt.useQty && q) return pq != null ? pq : base;
    return base;
  }
  function effectiveMrpInr(m, sel) {
    var baseM = finMoney(m.mrpInr);
    var opt = m.options || {};
    var s = opt.useSize && sel.sid ? findOpt(opt.sizes, sel.sid) : null;
    var q = opt.useQty && sel.qid ? findOpt(opt.qtyOptions, sel.qid) : null;
    var ms = s ? finMoney(s.mrpInr) : null;
    var mq = q ? finMoney(q.mrpInr) : null;
    if (opt.useSize && opt.useQty) {
      var sm = ms != null ? ms : baseM;
      var qm = mq != null ? mq : 0;
      if (sm == null && (!qm || qm === 0)) return null;
      if (sm == null) return null;
      return sm + qm;
    }
    if (opt.useSize && s) return ms != null ? ms : baseM;
    if (opt.useQty && q) return mq != null ? mq : baseM;
    return baseM;
  }
  function discountPctFor(m, sel) {
    var mrp = effectiveMrpInr(m, sel);
    var p = effectivePriceInr(m, sel);
    if (mrp == null || !Number.isFinite(mrp)) return null;
    if (mrp <= p) return null;
    return Math.round(((mrp - p) / mrp) * 100);
  }
  function variantSlot(o) {
    var parts = [];
    if (o.sid) parts.push("s:" + o.sid);
    if (o.qid) parts.push("q:" + o.qid);
    if (o.cid) parts.push("c:" + o.cid);
    return parts.join("|") || (o.sid || "std");
  }
  function variantLabelFrom(m, o) {
    var opt = m.options || {};
    var bits = [];
    if (o.sid) {
      var s = findOpt(opt.sizes, o.sid);
      if (s) bits.push(s.label);
    }
    if (o.qid) {
      var q = findOpt(opt.qtyOptions, o.qid);
      if (q) bits.push(q.label);
    }
    if (o.cid) {
      var c = findOpt(opt.colors, o.cid);
      if (c) bits.push(c.label);
    }
    return bits.join(" · ") || "Standard";
  }

  function galleryEntries(material, sel) {
    var m = material;
    var opt = m.options || {};
    var entries = [];
    var colorUrls = Object.create(null);
    if (opt.useColor && opt.colors && opt.colors.length) {
      opt.colors.forEach(function (c) {
        var u = String(c.image || "").trim();
        if (!u) return;
        entries.push({ url: u, kind: "color", cid: String(c.id || "") });
        colorUrls[u] = 1;
      });
    }
    var seenExtra = Object.create(null);
    function pushExtra(url, meta) {
      url = String(url || "").trim();
      if (!url) return;
      if (colorUrls[url]) return;
      if (seenExtra[url]) return;
      seenExtra[url] = 1;
      entries.push({ url: url, kind: meta.kind, sid: meta.sid, qid: meta.qid });
    }
    if (opt.sizes && opt.sizes.length) {
      opt.sizes.forEach(function (s) {
        var u = String(s.image || "").trim();
        if (u) pushExtra(u, { kind: "size", sid: String(s.id || "") });
      });
    }
    if (opt.qtyOptions && opt.qtyOptions.length) {
      opt.qtyOptions.forEach(function (q) {
        var u = String(q.image || "").trim();
        if (u) pushExtra(u, { kind: "qty", qid: String(q.id || "") });
      });
    }
    (opt.galleryImages || []).forEach(function (u) {
      pushExtra(String(u || "").trim(), { kind: "gallery" });
    });
    pushExtra(String(opt.heroImage || "").trim(), { kind: "hero" });
    pushExtra(String(m.image || "").trim(), { kind: "main" });
    if (!entries.length) entries.push({ url: "", kind: "empty" });
    return entries;
  }
  function indexForCid(entries, cid) {
    if (!cid) return -1;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].kind === "color" && entries[i].cid === cid) return i;
    }
    return -1;
  }
  function galleryUrlCountFrom(entries) {
    var n = 0;
    for (var i = 0; i < entries.length; i++) {
      if (String(entries[i].url || "").trim()) n++;
    }
    return n;
  }
  function lineImageFor(material, o) {
    var entries = galleryEntries(material, o);
    var ix = Math.min(state.imgIndex, Math.max(0, entries.length - 1));
    var u = entries[ix] && entries[ix].url;
    return String(u || "").trim();
  }

  function buildDefaultOptions(p) {
    var keys = D.getOfferedSizeKeysForProduct
      ? D.getOfferedSizeKeysForProduct(p)
      : ["s", "m", "l"];
    var sizes = keys.map(function (k) {
      return {
        id: k,
        label: D.getSizeLabelNameForProduct ? D.getSizeLabelNameForProduct(p, k) : k,
        priceInr: p.prices && p.prices[k] != null ? Number(p.prices[k]) : 0,
        image: p.image,
      };
    });
    return {
      useSize: true,
      useQty: false,
      useColor: false,
      sizes: sizes,
      colors: [],
      brandLine: (D.getCategoryLabel ? D.getCategoryLabel(p.category) : "") + " · Resin",
      trustBullets: ["Hand-finished in Jaipur", "MRP includes GST", "Secure checkout"],
    };
  }

  function productToMaterial(p) {
    var opt = p.options && typeof p.options === "object" && (p.options.useSize || p.options.useColor || p.options.useQty)
      ? p.options
      : buildDefaultOptions(p);
    var minP = Infinity;
    (opt.sizes || []).forEach(function (s) {
      var n = finMoney(s.priceInr);
      if (n != null && n < minP) minP = n;
    });
    if (!Number.isFinite(minP) || minP === Infinity) minP = Number((p.prices && p.prices.m) || 0) || 0;
    return {
      id: p.id,
      name: p.name,
      image: p.image,
      priceInr: minP,
      mrpInr: null,
      description: "",
      options: opt,
      galleryImages: Array.isArray(p.gallery) ? p.gallery.slice() : [],
    };
  }

  function stockSlotFromSel(sel) {
    var s = String(sel.sid || "").toLowerCase();
    if (s === "s" || s === "m" || s === "l") return s;
    return "m";
  }

  function customLineExtra() {
    var o = {};
    if (state.namePlateText) o.namePlateText = state.namePlateText;
    if (state.keychainAlpha) o.keychainAlphabet = state.keychainAlpha;
    if (state.keychainName) o.keychainName = state.keychainName;
    return Object.keys(o).length ? o : null;
  }

  function showNeedBulkUrl(name) {
    var text = "Need in bulk: " + String(name || "product") + " — " + String(window.location.href);
    var u = "https://wa.me/918824350056?text=" + encodeURIComponent(text);
    try {
      window.open(u, "_blank", "noopener");
    } catch (_) {}
  }

  function normalizeHexClient(raw) {
    var h = String(raw == null ? "" : raw)
      .trim()
      .replace(/^#/, "");
    if (!h) return "#888888";
    if (/^[0-9a-fA-F]{6}$/.test(h)) return "#" + h.toLowerCase();
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
      return (
        "#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
      ).toLowerCase();
    }
    if (/^[0-9a-fA-F]{8}$/.test(h)) return "#" + h.slice(0, 6).toLowerCase();
    return "#888888";
  }

  function syncDefaults(m) {
    var opt = m.options || {};
    var sizes = opt.useSize && opt.sizes && opt.sizes.length ? opt.sizes.slice() : [{ id: "" }];
    var qtys = opt.useQty && opt.qtyOptions && opt.qtyOptions.length ? opt.qtyOptions.slice() : [{ id: "" }];
    if (!opt.useSize) sizes = [{ id: "" }];
    if (!opt.useQty) qtys = [{ id: "" }];
    var bestSid = sizes[0] && sizes[0].id != null ? String(sizes[0].id) : "";
    var bestQid = qtys[0] && qtys[0].id != null ? String(qtys[0].id) : "";
    var bestP = Infinity;
    sizes.forEach(function (s) {
      qtys.forEach(function (q) {
        var sid = opt.useSize ? String(s.id || "") : "";
        var qid = opt.useQty ? String(q.id || "") : "";
        var p0 = effectivePriceInr(m, { sid: sid, qid: qid, cid: "" });
        if (p0 < bestP) {
          bestP = p0;
          bestSid = sid;
          bestQid = qid;
        }
      });
    });
    state.sel.sid = bestSid;
    state.sel.qid = bestQid;
    state.sel.cid = opt.useColor && opt.colors && opt.colors[0] ? opt.colors[0].id : "";
    var g = galleryEntries(m, state.sel);
    var ix = state.sel.cid ? indexForCid(g, state.sel.cid) : 0;
    state.imgIndex = ix >= 0 ? ix : 0;
    state.lineQty = 1;
    state.heroZoom = 1;
  }

  function renderPdp(root) {
    var m = state.material;
    if (!m || !root) return;
    var opt = m.options || {};
    var entries = galleryEntries(m, state.sel);
    var idx = Math.min(state.imgIndex, Math.max(0, entries.length - 1));
    state.imgIndex = idx;
    var mainImg = (entries[idx] && entries[idx].url) || "";
    if (!String(mainImg).trim() && entries.length) {
      for (var fi = 0; fi < entries.length; fi++) {
        if (String(entries[fi].url || "").trim()) {
          idx = fi;
          state.imgIndex = fi;
          mainImg = entries[fi].url;
          break;
        }
      }
    }
    var gcount = galleryUrlCountFrom(entries);

    var thumbs = "";
    for (var ti = 0; ti < entries.length; ti++) {
      var ent = entries[ti];
      var u = ent.url || "";
      if (!String(u).trim()) continue;
      var syncAttr = "";
      if (ent.kind === "color" && ent.cid) {
        syncAttr = ' data-gallery-sync="color" data-gallery-cid="' + escAttr(ent.cid) + '"';
      } else if (ent.kind === "size" && ent.sid) {
        syncAttr = ' data-gallery-sync="size" data-gallery-sid="' + escAttr(ent.sid) + '"';
      }
      thumbs +=
        '<button type="button" class="rm-pdp__thumb' +
        (ti === idx ? " is-active" : "") +
        '" data-img-idx="' +
        ti +
        '"' +
        syncAttr +
        '><img src="' +
        escAttr(imgSrc(u)) +
        '" alt="" width="72" height="72" loading="lazy" /></button>';
    }

    var sizeHtml = "";
    if (opt.useSize && opt.sizes && opt.sizes.length) {
      sizeHtml =
        '<div class="rm-opt-block rm-opt-block--modern"><span class="rm-opt-block__label">Size</span><div class="rm-opt-pills" data-rm-opt="size">' +
        opt.sizes
          .map(function (s) {
            var on = s.id === state.sel.sid ? " is-on" : "";
            return (
              "<button type=\"button\" class=\"rm-opt-pill" +
              on +
              "\" data-sid=\"" +
              escAttr(s.id) +
              "\">" +
              esc(s.label) +
              "</button>"
            );
          })
          .join("") +
        "</div></div>";
    }
    var qtyHtml = "";
    if (opt.useQty && opt.qtyOptions && opt.qtyOptions.length) {
      qtyHtml =
        '<div class="rm-opt-block rm-opt-block--modern"><span class="rm-opt-block__label">Pack / quantity</span><div class="rm-opt-pills" data-rm-opt="qty">' +
        opt.qtyOptions
          .map(function (s) {
            var on2 = s.id === state.sel.qid ? " is-on" : "";
            return (
              "<button type=\"button\" class=\"rm-opt-pill" +
              on2 +
              "\" data-qid=\"" +
              escAttr(s.id) +
              "\">" +
              esc(s.label) +
              "</button>"
            );
          })
          .join("") +
        "</div></div>";
    }
    var colHtml = "";
    if (opt.useColor && opt.colors && opt.colors.length) {
      colHtml =
        '<div class="rm-opt-block rm-opt-block--modern rm-opt-block--color"><span class="rm-opt-block__label">Colour</span><div class="rm-color-row" data-rm-opt="color">' +
        opt.colors
          .map(function (s) {
            var on3 = s.id === state.sel.cid ? " is-on" : "";
            var hx = normalizeHexClient(s.hex != null ? s.hex : s.Hex);
            return (
              "<button type=\"button\" class=\"rm-color-swatch" +
              on3 +
              "\" data-cid=\"" +
              escAttr(s.id) +
              "\" style=\"background-color:" +
              escAttr(hx) +
              "\" title=\"" +
              escAttr(s.label) +
              "\"><span class=\"visually-hidden\">" +
              esc(s.label) +
              "</span></button>"
            );
          })
          .join("") +
        "</div></div>";
    }

    var eff = effectivePriceInr(m, state.sel);
    var effM = effectiveMrpInr(m, state.sel);
    var pct = discountPctFor(m, state.sel);
    var p = state.product;
    var customHtml = "";
    if (p && p.category === "resin-name-plates") {
      customHtml +=
        '<div class="rm-opt-block rm-opt-block--modern"><label class="rm-opt-block__label" for="resinPdpNameplateText">Text for name plate</label>' +
        '<textarea id="resinPdpNameplateText" class="rm-pdp__custom-input" rows="3" placeholder="What should we write on the plate?">' +
        esc(state.namePlateText) +
        "</textarea></div>";
    }
    if (p && p.subcategory === "alphabet-keychain" && p.category === "resin-keychains") {
      customHtml +=
        '<div class="rm-opt-block rm-opt-block--modern"><label class="rm-opt-block__label" for="resinPdpKeyAlpha">Your letter</label>' +
        '<input id="resinPdpKeyAlpha" class="rm-pdp__custom-input" type="text" maxlength="8" value="' +
        escAttr(state.keychainAlpha) +
        '" placeholder="e.g. A" /></div>';
    }
    if (p && p.subcategory === "name-keychain" && p.category === "resin-keychains") {
      customHtml +=
        '<div class="rm-opt-block rm-opt-block--modern"><label class="rm-opt-block__label" for="resinPdpKeyName">Your name</label>' +
        '<input id="resinPdpKeyName" class="rm-pdp__custom-input" type="text" maxlength="80" value="' +
        escAttr(state.keychainName) +
        '" placeholder="Name to cast" /></div>';
    }

    var brandKicker = String(opt.brandLine || "").trim() || (D.getCategoryLabel ? D.getCategoryLabel(p.category) : "Resin");
    var trust = (opt.trustBullets || [])
      .map(function (t) {
        return "<span>✓ " + esc(t) + "</span>";
      })
      .join("");

    var html =
      '<div class="resin-pdp-padded">' +
      '<nav class="crumb product-crumb" aria-label="Breadcrumb" style="margin-bottom:0.75rem"><a href="index.html">Home</a> <span class="crumb-sep">/</span> ' +
      '<a href="category.html?cat=' +
      escAttr(encodeURIComponent(p.category)) +
      '">' +
      esc(D.getCategoryLabel(p.category)) +
      "</a> <span class=\"crumb-sep\">/</span> <span class=\"crumb-current\">" +
      esc(p.name) +
      "</span></nav>" +
      '<div class="rm-pdp rm-pdp--modern" data-resin-pdp="1">' +
      '<div class="rm-pdp-gallery rm-pdp-gallery--shell">' +
      '<div class="rm-pdp-thumb-col">' +
      '<button type="button" class="rm-pdp-thumb-nav rm-pdp-thumb-nav--up" aria-label="Scroll thumbnails up">▲</button>' +
      '<div class="rm-pdp-thumb-track">' +
      thumbs +
      "</div>" +
      '<button type="button" class="rm-pdp-thumb-nav rm-pdp-thumb-nav--down" aria-label="Scroll thumbnails down">▼</button>' +
      "</div>" +
      '<div class="rm-pdp__hero-wrap">' +
      (gcount > 1
        ? '<button type="button" class="rm-pdp__nav rm-pdp__nav--prev" data-rm-gallery-nav="-1" aria-label="Previous image">‹</button>' +
          '<button type="button" class="rm-pdp__nav rm-pdp__nav--next" data-rm-gallery-nav="1" aria-label="Next image">›</button>'
        : "") +
      (mainImg
        ? '<div class="rm-pdp__hero-zoom" data-rm-hero-zoom="1"><img id="resinPdpHero" src="' +
          escAttr(imgSrc(mainImg)) +
          '" alt="' +
          escAttr(m.name) +
          '" style="transform:scale(' +
          (state.heroZoom || 1) +
          ')"/></div>'
        : '<div class="band-empty">No image</div>') +
      "</div></div>" +
      '<div class="rm-pdp__detail rm-pdp__detail-card">' +
      "<p class=\"rm-pdp__brand\">" +
      esc(brandKicker) +
      "</p>" +
      "<h1 class=\"rm-pdp__title\">" +
      esc(m.name) +
      "</h1>" +
      '<div class="rm-pdp__meta-rating-row">' +
      '<div class="rm-pdp__stars-wrap"><div class="rm-pdp__stars" aria-hidden="true">★★★★★ <span class="rm-pdp__rating-num">4.8</span></div></div>' +
      '<div class="product-share-bar product-share-bar--rm-pdp" id="resinPdpShare" aria-label="Share"></div>' +
      '<button type="button" class="rm-pdp__bulk" id="resinPdpBulk">Need in bulk</button>' +
      "</div>" +
      '<div class="rm-pdp__price-row">' +
      '<span class="rm-pdp__price" id="resinPdpPrice">' +
      CART.formatMoney(eff) +
      "</span>" +
      (effM != null && Number(effM) > Number(eff)
        ? '<span class="rm-pdp__mrp" id="resinPdpMrp">' + CART.formatMoney(effM) + "</span>"
        : "") +
      (pct != null
        ? '<span class="rm-pdp__save" id="resinPdpSave">' + pct + "% off</span>"
        : "") +
      "</div>" +
      sizeHtml +
      qtyHtml +
      colHtml +
      customHtml +
      '<div class="rm-pdp__cart-row rm-pdp__cart-row--modern">' +
      '<div class="rm-pdp__qty">' +
      '<button type="button" data-rm-line-qty="-1">−</button>' +
      "<span data-rm-line-qty-val>" +
      state.lineQty +
      "</span>" +
      '<button type="button" data-rm-line-qty="1">+</button></div>' +
      '<button type="button" class="rm-pdp__add" id="resinPdpAdd">Add to cart</button></div>' +
      (trust ? '<div class="rm-trust rm-trust--modern">' + trust + "</div>" : "") +
      "</div></div></div>";

    root.innerHTML = html;
    if (window.CRAFTGURU_SHARE && window.CRAFTGURU_SHARE.mountProductShare) {
      var sh = document.getElementById("resinPdpShare");
      if (sh) {
        var pageUrl;
        try {
          pageUrl = new URL("product.html?id=" + encodeURIComponent(p.id), window.location.href).href;
        } catch (_) {
          pageUrl = "product.html?id=" + encodeURIComponent(p.id);
        }
        window.CRAFTGURU_SHARE.mountProductShare(sh, { id: p.id, name: p.name, productUrl: pageUrl });
      }
    }
    var bBulk = document.getElementById("resinPdpBulk");
    if (bBulk) bBulk.addEventListener("click", function () { showNeedBulkUrl(p.name); });
    var ta = document.getElementById("resinPdpNameplateText");
    if (ta) {
      ta.addEventListener("input", function () {
        state.namePlateText = String(ta.value).slice(0, 2000);
      });
    }
    var ia = document.getElementById("resinPdpKeyAlpha");
    if (ia) ia.addEventListener("input", function () { state.keychainAlpha = String(ia.value).slice(0, 8); });
    var ina = document.getElementById("resinPdpKeyName");
    if (ina) ina.addEventListener("input", function () { state.keychainName = String(ina.value).slice(0, 200); });
  }

  function wirePdpClicks(root) {
    if (!root || root.dataset.resinPdpWired === "1") return;
    root.dataset.resinPdpWired = "1";
    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !state.material) return;
      var m = state.material;
      if (t.closest && t.closest(".rm-pdp__thumb")) {
        var b = t.closest(".rm-pdp__thumb");
        var ix = Number(b.getAttribute("data-img-idx")) || 0;
        state.imgIndex = ix;
        renderPdp(document.getElementById("productRoot"));
        return;
      }
      if (t.getAttribute("data-sid") != null) {
        var sid = t.getAttribute("data-sid");
        var opt = m.options || {};
        state.sel.sid = sid;
        if (opt.useColor && opt.colors && opt.colors.length) {
          var g = galleryEntries(m, state.sel);
          var hx = 0;
          for (var gi = 0; gi < g.length; gi++) {
            if (g[gi].kind === "size" && g[gi].sid === sid) {
              hx = gi;
              break;
            }
          }
          state.imgIndex = hx;
        } else {
          for (var si = 0; si < (opt.sizes || []).length; si++) {
            if (String(opt.sizes[si].id) === String(sid) && opt.sizes[si].image) {
              var ent2 = galleryEntries(m, state.sel);
              for (var ej = 0; ej < ent2.length; ej++) {
                if (String(ent2[ej].url) === String(opt.sizes[si].image)) {
                  state.imgIndex = ej;
                  break;
                }
              }
            }
          }
        }
        renderPdp(document.getElementById("productRoot"));
        return;
      }
      if (t.getAttribute("data-qid") != null) {
        state.sel.qid = t.getAttribute("data-qid");
        renderPdp(document.getElementById("productRoot"));
        return;
      }
      if (t.getAttribute("data-cid") != null) {
        state.sel.cid = t.getAttribute("data-cid");
        var g0 = galleryEntries(m, state.sel);
        var ci = indexForCid(g0, state.sel.cid);
        if (ci >= 0) state.imgIndex = ci;
        renderPdp(document.getElementById("productRoot"));
        return;
      }
      if (t.getAttribute("data-rm-gallery-nav") != null) {
        var dir = Number(t.getAttribute("data-rm-gallery-nav")) || 0;
        var g1 = galleryEntries(m, state.sel);
        var idx = [];
        for (var u = 0; u < g1.length; u++) {
          if (String(g1[u].url || "").trim()) idx.push(u);
        }
        if (!idx.length) return;
        var pos = idx.indexOf(state.imgIndex);
        if (pos < 0) pos = 0;
        var np = (pos + dir + idx.length) % idx.length;
        state.imgIndex = idx[np];
        renderPdp(document.getElementById("productRoot"));
        return;
      }
      if (t.getAttribute("data-rm-line-qty") != null) {
        var d = Number(t.getAttribute("data-rm-line-qty")) || 0;
        state.lineQty = Math.max(1, Math.min(99, state.lineQty + d));
        renderPdp(document.getElementById("productRoot"));
        return;
      }
      if (t.id === "resinPdpAdd" || (t.closest && t.closest("#resinPdpAdd"))) {
        var slot = variantSlot(state.sel);
        var vlabel = variantLabelFrom(m, state.sel);
        var ex = customLineExtra();
        var prod = state.product || {};
        CART.addItem({
          id: m.id,
          size: slot,
          stockSlot: stockSlotFromSel(state.sel) || "m",
          variantLabel: vlabel,
          name: m.name,
          price: effectivePriceInr(m, state.sel),
          image: lineImageFor(m, state.sel) || prod.image,
          qty: state.lineQty,
          lineExtra: ex || undefined,
        });
        if (window.RESIN_SHELL && window.RESIN_SHELL.openDrawer) window.RESIN_SHELL.openDrawer();
        return;
      }
    });
  }

  var pRef = null;
  function mount(product) {
    pRef = product;
    var root = document.getElementById("productRoot");
    if (!root || !product) return;
    state.product = product;
    state.material = productToMaterial(product);
    state.namePlateText = "";
    state.keychainAlpha = "";
    state.keychainName = "";
    syncDefaults(state.material);
    document.body.classList.add("page-product--resin-rm", "rm-page-wide");
    document.title = product.name + " — Craft guru";
    renderPdp(root);
    var root2 = document.getElementById("productRoot");
    if (root2) wirePdpClicks(root2);
  }

  function refresh() {
    if (pRef && D.getProduct) {
      var np = D.getProduct(pRef.id);
      if (np) {
        pRef = np;
        state.product = np;
        state.material = productToMaterial(np);
        syncDefaults(state.material);
        renderPdp(document.getElementById("productRoot"));
      }
    }
  }

  window.RESIN_CATALOG_PDP = { mount: mount, refresh: refresh, productToMaterial: productToMaterial };
})();
