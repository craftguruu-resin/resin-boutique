(function () {
  "use strict";

  var M = window.CraftguruCatalogMerge;
  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;

  function apiBase() {
    return M && typeof M.getApiBase === "function" ? M.getApiBase() : "";
  }

  function catalogApiBase() {
    var b = String(apiBase() || "")
      .trim()
      .replace(/\/+$/, "");
    if (b) return b;
    try {
      if (window.location && window.location.protocol !== "file:") {
        return String(window.location.origin || "").replace(/\/+$/, "");
      }
    } catch (_) {}
    return "";
  }

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
    return D && D.imageUrl ? D.imageUrl(rel) : rel;
  }

  function qs() {
    try {
      var u = new URL(window.location.href);
      return u.searchParams.get("id") || "";
    } catch (_) {
      return "";
    }
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

  /** Size row + qty row: sum when both; else row price or product default. */
  function effectivePriceInr(m, sel) {
    var base = finMoney(m.priceInr) != null ? Number(m.priceInr) : 0;
    if (!Number.isFinite(base) || base < 0) base = 0;
    var opt = m.options || {};
    var s = opt.useSize && sel.sid ? findOpt(opt.sizes, sel.sid) : null;
    var q = opt.useQty && sel.qid ? findOpt(opt.qtyOptions, sel.qid) : null;
    var ps = s ? finMoney(s.priceInr) : null;
    var pq = q ? finMoney(q.priceInr) : null;
    if (opt.useSize && opt.useQty) {
      return (ps != null ? ps : base) + (pq != null ? pq : 0);
    }
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
    return parts.join("|") || "std";
  }

  function variantLabelFrom(material, o) {
    var opt = material.options || {};
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

  /**
   * Ordered gallery: every colour image (each row), then unique size/qty/gallery/hero/main URLs.
   * Thumbnail index syncs with colour when the entry is tied to a colour.
   */
  function galleryEntries(material, sel) {
    var m = material;
    var opt = m.options || {};
    var entries = [];
    var colorUrls = Object.create(null);

    if (opt.useColor && opt.colors && opt.colors.length) {
      opt.colors.forEach(function (c) {
        var u = String(c.image || "").trim();
        if (!u) return;
        entries.push({
          url: u,
          kind: "color",
          cid: String(c.id || ""),
        });
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
      var o = { url: url, kind: meta.kind };
      if (meta.sid) o.sid = meta.sid;
      if (meta.qid) o.qid = meta.qid;
      entries.push(o);
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

    if (!entries.length) {
      entries.push({ url: "", kind: "empty" });
    }
    return entries;
  }

  function indexForCid(entries, cid) {
    if (!cid) return -1;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].kind === "color" && entries[i].cid === cid) return i;
    }
    return -1;
  }

  function lineImageFor(material, o) {
    var entries = galleryEntries(material, o);
    var ix = Math.min(state.imgIndex, Math.max(0, entries.length - 1));
    var u = entries[ix] && entries[ix].url;
    return String(u || "").trim();
  }

  var state = {
    material: null,
    sel: { sid: "", qid: "", cid: "" },
    imgIndex: 0,
    lineQty: 1,
    heroZoom: 1,
    _zoomUrl: "",
    _lastHeroResolvedSrc: "",
  };

  /** Full PDP shell replace only — never use document-level view transitions here (they feel like a page refresh when picking colour/size). */
  function applyPdpHtml(root, html) {
    root.innerHTML = html;
  }

  function nextGalleryIndexFrom(entries, cur, dir) {
    var urlsIdx = [];
    for (var j = 0; j < entries.length; j++) {
      if (String(entries[j].url || "").trim()) urlsIdx.push(j);
    }
    if (!urlsIdx.length) return 0;
    var pos = urlsIdx.indexOf(cur);
    if (pos < 0) pos = 0;
    var np = (pos + dir + urlsIdx.length) % urlsIdx.length;
    return urlsIdx[np];
  }

  function galleryUrlCountFrom(entries) {
    var n = 0;
    for (var i = 0; i < entries.length; i++) {
      if (String(entries[i].url || "").trim()) n++;
    }
    return n;
  }

  function shellNeedsRebuild(root, m, entries, galleryUrlCount) {
    if (!root || !m) return true;
    var shell = root.querySelector(".rm-pdp--modern");
    if (!shell) return true;
    if (String(shell.getAttribute("data-rm-material-id") || "") !== String(m.id)) return true;
    var track = root.querySelector(".rm-pdp-thumb-track");
    var thumbN = track ? track.querySelectorAll(".rm-pdp__thumb").length : 0;
    if (thumbN !== galleryUrlCount) return true;
    var needNav = galleryUrlCount > 1;
    if (!!root.querySelector("#rmPdpPrev") !== needNav) return true;
    if (!root.querySelector("#rmPdpHeroImg") && galleryUrlCount > 0) return true;
    if (!root.querySelector("#rmPdpShareHost")) return true;
    return false;
  }

  function patchPdpView(root, m, entries, idx, mainImg, effPrice, effMrp, pct) {
    var resolved = mainImg ? imgSrc(mainImg) : "";
    var hi = root.querySelector("#rmPdpHeroImg");
    var wrap = root.querySelector("#rmPdpHeroZoom");
    if (hi && resolved) {
      hi.src = resolved;
      hi.setAttribute("alt", m.name || "");
      hi.style.transform = "scale(" + (state.heroZoom || 1) + ")";
      if (wrap) wrap.style.cursor = (state.heroZoom > 1) ? "grab" : "zoom-in";
    }
    var pr = root.querySelector("#rmPdpPrice");
    if (pr) pr.textContent = CART ? CART.formatMoney(effPrice) : "₹" + effPrice;
    var mrpEl = root.querySelector("#rmPdpMrp");
    var saveEl = root.querySelector("#rmPdpSave");
    var showMrp = effMrp != null && Number(effMrp) > Number(effPrice);
    if (mrpEl) {
      if (showMrp) {
        mrpEl.textContent = CART ? CART.formatMoney(effMrp) : String(effMrp);
        mrpEl.removeAttribute("hidden");
      } else {
        mrpEl.textContent = "";
        mrpEl.setAttribute("hidden", "");
      }
    }
    if (saveEl) {
      if (pct != null) {
        saveEl.textContent = pct + "% off";
        saveEl.removeAttribute("hidden");
      } else {
        saveEl.textContent = "";
        saveEl.setAttribute("hidden", "");
      }
    }
    root.querySelectorAll(".rm-pdp__thumb").forEach(function (btn) {
      btn.classList.toggle("is-active", Number(btn.getAttribute("data-img-idx")) === idx);
    });
    root.querySelectorAll(".rm-color-swatch[data-cid]").forEach(function (btn) {
      btn.classList.toggle("is-on", String(btn.getAttribute("data-cid")) === String(state.sel.cid));
    });
    root.querySelectorAll('.rm-opt-pills[data-rm-opt="size"] .rm-opt-pill[data-sid]').forEach(function (btn) {
      btn.classList.toggle("is-on", String(btn.getAttribute("data-sid")) === String(state.sel.sid));
    });
    root.querySelectorAll('.rm-opt-pills[data-rm-opt="qty"] .rm-opt-pill[data-qid]').forEach(function (btn) {
      btn.classList.toggle("is-on", String(btn.getAttribute("data-qid")) === String(state.sel.qid));
    });
    var lqv = root.querySelector("#rmLineQtyVal");
    if (lqv) lqv.textContent = String(state.lineQty);
    if (window.RESIN_WISHLIST && m) {
      var w = root.querySelector("#rmPdpWish");
      if (w) window.RESIN_WISHLIST.syncButton(w, m.id, "raw_material");
    }
  }

  function wirePdpRootOnce(root) {
    if (!root || root._rmPdpDelegated) return;
    root._rmPdpDelegated = true;

    function scrollThumbStrip(dir) {
      var track = root.querySelector(".rm-pdp-thumb-track");
      if (!track) return;
      var st = window.getComputedStyle(track);
      var row = st.flexDirection === "row" || st.flexDirection === "row-reverse";
      if (row) track.scrollBy({ left: dir * 88, behavior: "smooth" });
      else track.scrollBy({ top: dir * 88, behavior: "smooth" });
    }

    root.addEventListener("click", function (ev) {
      var m = state.material;
      if (!m) return;
      var t = ev.target;
      if (!t || !t.closest) return;

      if (t.closest(".rm-pdp-thumb-nav--up")) {
        scrollThumbStrip(-1);
        return;
      }
      if (t.closest(".rm-pdp-thumb-nav--down")) {
        scrollThumbStrip(1);
        return;
      }

      var thumb = t.closest(".rm-pdp__thumb");
      if (thumb) {
        state.imgIndex = Number(thumb.getAttribute("data-img-idx")) || 0;
        var sync = thumb.getAttribute("data-gallery-sync");
        if (sync === "color") {
          state.sel.cid = thumb.getAttribute("data-gallery-cid") || "";
        } else if (sync === "size") {
          state.sel.sid = thumb.getAttribute("data-gallery-sid") || "";
        } else if (sync === "qty") {
          state.sel.qid = thumb.getAttribute("data-gallery-qid") || "";
        }
        state.heroZoom = 1;
        render();
        return;
      }

      if (t.closest("#rmPdpPrev")) {
        var entP = galleryEntries(m, state.sel);
        var ixP = Math.min(state.imgIndex, Math.max(0, entP.length - 1));
        state.imgIndex = nextGalleryIndexFrom(entP, ixP, -1);
        state.heroZoom = 1;
        render();
        return;
      }
      if (t.closest("#rmPdpNext")) {
        var entN = galleryEntries(m, state.sel);
        var ixN = Math.min(state.imgIndex, Math.max(0, entN.length - 1));
        state.imgIndex = nextGalleryIndexFrom(entN, ixN, 1);
        state.heroZoom = 1;
        render();
        return;
      }

      var sw = t.closest(".rm-color-swatch[data-cid]");
      if (sw) {
        state.sel.cid = sw.getAttribute("data-cid") || "";
        var g4 = galleryEntries(m, state.sel);
        var ix4 = indexForCid(g4, state.sel.cid);
        state.imgIndex = ix4 >= 0 ? ix4 : 0;
        state.heroZoom = 1;
        render();
        return;
      }

      var sizePill = t.closest('.rm-opt-pills[data-rm-opt="size"] .rm-opt-pill[data-sid]');
      if (sizePill) {
        state.sel.sid = sizePill.getAttribute("data-sid") || "";
        var g2 = galleryEntries(m, state.sel);
        var ix2 = state.sel.cid ? indexForCid(g2, state.sel.cid) : 0;
        state.imgIndex = ix2 >= 0 ? ix2 : 0;
        state.heroZoom = 1;
        render();
        return;
      }

      var qtyPill = t.closest('.rm-opt-pills[data-rm-opt="qty"] .rm-opt-pill[data-qid]');
      if (qtyPill) {
        state.sel.qid = qtyPill.getAttribute("data-qid") || "";
        var g3 = galleryEntries(m, state.sel);
        var ix3 = state.sel.cid ? indexForCid(g3, state.sel.cid) : 0;
        state.imgIndex = ix3 >= 0 ? ix3 : 0;
        state.heroZoom = 1;
        render();
        return;
      }

      if (t.closest("#rmLineQtyMinus")) {
        state.lineQty = Math.max(1, state.lineQty - 1);
        render();
        return;
      }
      if (t.closest("#rmLineQtyPlus")) {
        state.lineQty = Math.min(99, state.lineQty + 1);
        render();
        return;
      }

      var accBtn = t.closest("#rmPdpAccBtn");
      if (accBtn) {
        var accBody = root.querySelector("#rmPdpAccBody");
        var accIcon = root.querySelector("#rmPdpAccIcon");
        if (accBody) {
          var collapsed = accBody.classList.toggle("is-collapsed");
          accBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
          if (accIcon) accIcon.textContent = collapsed ? "+" : "−";
        }
        return;
      }

      var wish = t.closest("#rmPdpWish");
      if (wish) {
        if (window.RESIN_WISHLIST && state.material) {
          wish.setAttribute("aria-busy", "true");
          window.RESIN_WISHLIST.toggle(state.material.id, "raw_material", function () {
            window.RESIN_WISHLIST.syncButton(wish, state.material.id, "raw_material");
          });
        }
        return;
      }

      var add = t.closest("#rmAddCart");
      if (add && CART) {
        var slot = variantSlot(state.sel);
        var vlabel = variantLabelFrom(m, state.sel);
        CART.addItem({
          id: m.id,
          size: slot,
          variantLabel: vlabel,
          name: m.name,
          price: effectivePriceInr(m, state.sel),
          image: lineImageFor(m, state.sel),
          qty: state.lineQty,
        });
        try {
          if (window.RESIN_SHELL && window.RESIN_SHELL.openDrawer) window.RESIN_SHELL.openDrawer();
        } catch (_) {}
      }
    });

    root.addEventListener(
      "wheel",
      function (ev) {
        var zoomEl = ev.target && ev.target.closest && ev.target.closest("#rmPdpHeroZoom");
        if (!zoomEl || !state.material) return;
        var heroImg = root.querySelector("#rmPdpHeroImg");
        if (!heroImg) return;
        ev.preventDefault();
        var z = state.heroZoom || 1;
        var d = ev.deltaY > 0 ? -0.1 : 0.1;
        z = Math.min(3, Math.max(1, z + d));
        state.heroZoom = z;
        heroImg.style.transform = "scale(" + z + ")";
        zoomEl.style.cursor = z > 1 ? "grab" : "zoom-in";
      },
      { passive: false }
    );
  }

  /** Soft fade when hero URL changes (colour / thumb), without dual-image stack. */
  function fadeHeroImageIn(root) {
    var hi = root.querySelector("#rmPdpHeroImg");
    if (!hi) return;
    var src = hi.getAttribute("src") || "";
    var prev = state._lastHeroResolvedSrc;
    state._lastHeroResolvedSrc = src;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      hi.style.opacity = "1";
      hi.style.transition = "";
      return;
    }
    hi.style.transition = "opacity 0.28s ease";
    if (!prev || prev === src) {
      hi.style.opacity = "1";
      return;
    }
    hi.style.opacity = "0";
    function reveal() {
      hi.style.opacity = "1";
    }
    if (hi.complete && hi.naturalWidth > 0) {
      requestAnimationFrame(function () {
        requestAnimationFrame(reveal);
      });
    } else {
      hi.addEventListener("load", reveal, { once: true });
      hi.addEventListener("error", reveal, { once: true });
    }
  }

  function syncDefaults(m) {
    var opt = m.options || {};
    var sizes =
      opt.useSize && opt.sizes && opt.sizes.length ? opt.sizes.slice() : [{ id: "" }];
    var qtys =
      opt.useQty && opt.qtyOptions && opt.qtyOptions.length ? opt.qtyOptions.slice() : [{ id: "" }];
    if (!opt.useSize) sizes = [{ id: "" }];
    if (!opt.useQty) qtys = [{ id: "" }];
    var bestSid = sizes[0] && sizes[0].id != null ? String(sizes[0].id) : "";
    var bestQid = qtys[0] && qtys[0].id != null ? String(qtys[0].id) : "";
    var bestP = Infinity;
    sizes.forEach(function (s) {
      qtys.forEach(function (q) {
        var sid = opt.useSize ? String(s.id || "") : "";
        var qid = opt.useQty ? String(q.id || "") : "";
        var p = effectivePriceInr(m, { sid: sid, qid: qid, cid: "" });
        if (p < bestP) {
          bestP = p;
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
    state._zoomUrl = "";
  }

  /** Split vendor description on blank lines for readable multi-paragraph layout. */
  function mountRmPdpShare(root) {
    if (!root || !state.material) return;
    var host = root.querySelector("#rmPdpShareHost");
    if (!host || !window.CRAFTGURU_SHARE || !window.CRAFTGURU_SHARE.mountProductShare) return;
    var mid = String(state.material.id || "");
    var pageUrl;
    try {
      pageUrl = new URL("raw-material-product.html?id=" + encodeURIComponent(mid), window.location.href).href;
    } catch (_) {
      pageUrl = "raw-material-product.html?id=" + encodeURIComponent(mid);
    }
    window.CRAFTGURU_SHARE.mountProductShare(host, {
      id: mid,
      name: state.material.name || "Material",
      productUrl: pageUrl,
    });
  }

  function formatDescParagraphs(raw) {
    var s = String(raw == null ? "" : raw)
      .replace(/\r\n/g, "\n")
      .trim();
    if (!s) return "";
    var paras = s
      .split(/\n{2,}/)
      .map(function (p) {
        return p
          .split(/\n/)
          .map(function (line) {
            return line.trim();
          })
          .filter(Boolean)
          .join(" ");
      })
      .filter(Boolean);
    if (!paras.length) return "";
    return paras
      .map(function (p) {
        return "<p>" + esc(p) + "</p>";
      })
      .join("");
  }

  function normalizeHexClient(raw) {
    var h = String(raw == null ? "" : raw)
      .trim()
      .replace(/^#/, "");
    if (!h) return "#888888";
    if (/^[0-9a-fA-F]{6}$/.test(h)) return "#" + h.toLowerCase();
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
      return (
        "#" +
        h[0].toLowerCase() +
        h[0].toLowerCase() +
        h[1].toLowerCase() +
        h[1].toLowerCase() +
        h[2].toLowerCase() +
        h[2].toLowerCase()
      );
    }
    if (/^[0-9a-fA-F]{8}$/.test(h)) return "#" + h.slice(0, 6).toLowerCase();
    return "#888888";
  }

  function render() {
    var m = state.material;
    var root = document.getElementById("rmPdpRoot");
    if (!root) return;
    if (!m) {
      state._lastHeroResolvedSrc = "";
      root.innerHTML = '<p class="band-empty">Product not found.</p>';
      return;
    }
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
          mainImg = entries[fi].url || "";
          break;
        }
      }
    }
    if (state._zoomUrl !== mainImg) {
      state.heroZoom = 1;
      state._zoomUrl = mainImg;
    }

    var effPrice = effectivePriceInr(m, state.sel);
    var effMrp = effectiveMrpInr(m, state.sel);
    var pct = discountPctFor(m, state.sel);

    var thumbs = "";
    for (var ti = 0; ti < entries.length; ti++) {
      var ent = entries[ti];
      var u = ent.url || "";
      if (!String(u).trim()) continue;
      var syncAttr = "";
      if (ent.kind === "color" && ent.cid) {
        syncAttr = " data-gallery-sync=\"color\" data-gallery-cid=\"" + escAttr(ent.cid) + "\"";
      } else if (ent.kind === "size" && ent.sid) {
        syncAttr = " data-gallery-sync=\"size\" data-gallery-sid=\"" + escAttr(ent.sid) + "\"";
      } else if (ent.kind === "qty" && ent.qid) {
        syncAttr = " data-gallery-sync=\"qty\" data-gallery-qid=\"" + escAttr(ent.qid) + "\"";
      }
      thumbs +=
        "<button type=\"button\" class=\"rm-pdp__thumb" +
        (ti === idx ? " is-active" : "") +
        "\" data-img-idx=\"" +
        ti +
        "\"" +
        syncAttr +
        "><img src=\"" +
        escAttr(imgSrc(u)) +
        "\" alt=\"\" width=\"72\" height=\"72\" loading=\"lazy\" /></button>";
    }
    var galleryUrlCount = galleryUrlCountFrom(entries);

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
            var on = s.id === state.sel.qid ? " is-on" : "";
            return (
              "<button type=\"button\" class=\"rm-opt-pill" +
              on +
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
            var on = s.id === state.sel.cid ? " is-on" : "";
            var hx = normalizeHexClient(s.hex != null ? s.hex : s.Hex);
            return (
              "<button type=\"button\" class=\"rm-color-swatch" +
              on +
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

    var trust = (opt.trustBullets || [])
      .map(function (t) {
        return "<span>✓ " + esc(t) + "</span>";
      })
      .join("");

    var brandKicker = String(opt.brandLine || "").trim();
    if (!brandKicker) brandKicker = "Craft Guru · Raw material";
    var ratingNum = String(opt.ratingScore || "4.8").trim() || "4.8";
    var revN =
      opt.reviewCount != null && Number.isFinite(Number(opt.reviewCount))
        ? Math.round(Number(opt.reviewCount))
        : 214;
    var detailText = String(opt.detailBody || "").trim() || String(m.description || "").trim();

    var html =
      '<div class="rm-pdp rm-pdp--modern" data-rm-material-id="' +
      escAttr(String(m.id)) +
      '">' +
      '<div class="rm-pdp-gallery rm-pdp-gallery--shell">' +
      '<div class="rm-pdp-thumb-col">' +
      '<button type="button" class="rm-pdp-thumb-nav rm-pdp-thumb-nav--up" aria-label="Scroll thumbnails up">▲</button>' +
      '<div class="rm-pdp-thumb-track">' +
      thumbs +
      "</div>" +
      '<button type="button" class="rm-pdp-thumb-nav rm-pdp-thumb-nav--down" aria-label="Scroll thumbnails down">▼</button>' +
      "</div>" +
      '<div class="rm-pdp__hero-wrap">' +
      (opt.badge ? '<span class="rm-pdp__badge">' + esc(opt.badge) + "</span>" : "") +
      (galleryUrlCount > 1
        ? '<button type="button" class="rm-pdp__nav rm-pdp__nav--prev" id="rmPdpPrev" aria-label="Previous image">‹</button>' +
          '<button type="button" class="rm-pdp__nav rm-pdp__nav--next" id="rmPdpNext" aria-label="Next image">›</button>'
        : "") +
      (mainImg
        ? '<div class="rm-pdp__hero-zoom" id="rmPdpHeroZoom">' +
          '<img id="rmPdpHeroImg" src="' +
          escAttr(imgSrc(mainImg)) +
          '" alt="' +
          escAttr(m.name) +
          "\" style=\"transform:scale(" +
          (state.heroZoom || 1) +
          ')"/></div>'
        : '<div class="band-empty">No image</div>') +
      "</div></div>" +
      '<div class="rm-pdp__detail rm-pdp__detail-card">' +
      '<p class="rm-pdp__brand">' +
      esc(brandKicker) +
      "</p>" +
      "<h1 class=\"rm-pdp__title\">" +
      esc(m.name) +
      "</h1>" +
      '<div class="rm-pdp__meta-rating-row">' +
      '<div class="rm-pdp__stars-wrap">' +
      '<div class="rm-pdp__stars" aria-label="Customer rating">' +
      "★★★★★ " +
      '<span class="rm-pdp__rating-num">' +
      esc(ratingNum) +
      "</span>" +
      ' <span class="rm-pdp__reviews">(' +
      esc(String(revN)) +
      " reviews)</span></div></div>" +
      '<div class="product-share-bar product-share-bar--rm-pdp" id="rmPdpShareHost" aria-label="Share this material"></div>' +
      "</div>" +
      '<div class="rm-pdp__price-row">' +
      '<span class="rm-pdp__price" id="rmPdpPrice">' +
      (CART ? CART.formatMoney(effPrice) : "₹" + effPrice) +
      "</span>" +
      (effMrp != null && Number(effMrp) > Number(effPrice)
        ? '<span class="rm-pdp__mrp" id="rmPdpMrp">' + (CART ? CART.formatMoney(effMrp) : effMrp) + "</span>"
        : '<span class="rm-pdp__mrp" id="rmPdpMrp" hidden></span>') +
      (pct != null
        ? '<span class="rm-pdp__save" id="rmPdpSave">' + pct + "% off</span>"
        : '<span class="rm-pdp__save" id="rmPdpSave" hidden></span>') +
      "</div>" +
      (m.description
        ? '<div class="rm-pdp__desc-wrap"><div class="rm-pdp__desc-prose">' +
          formatDescParagraphs(m.description) +
          "</div></div>"
        : "") +
      sizeHtml +
      qtyHtml +
      colHtml +
      '<div class="rm-pdp__cart-row rm-pdp__cart-row--modern">' +
      '<div class="rm-pdp__qty">' +
      '<button type="button" id="rmLineQtyMinus">−</button>' +
      '<span id="rmLineQtyVal">' +
      state.lineQty +
      "</span>" +
      '<button type="button" id="rmLineQtyPlus">+</button>' +
      "</div>" +
      '<button type="button" class="rm-pdp__add" id="rmAddCart">Add to cart</button>' +
      '<button type="button" class="rm-pdp__wish" id="rmPdpWish" aria-label="Save to wishlist">♡</button>' +
      "</div>" +
      (m.note ? '<p class="rm-pdp__ship">' + esc(m.note) + "</p>" : "") +
      (trust ? '<div class="rm-trust rm-trust--modern">' + trust + "</div>" : "") +
      (detailText
        ? '<div class="rm-pdp-accordion rm-pdp-accordion--modern">' +
          '<button type="button" class="rm-pdp-acc-head" id="rmPdpAccBtn" aria-expanded="true">' +
          "<span>Detail</span>" +
          '<span class="rm-pdp-acc-icon" id="rmPdpAccIcon" aria-hidden="true">−</span>' +
          "</button>" +
          '<div class="rm-pdp-acc-body" id="rmPdpAccBody">' +
          esc(detailText) +
          "</div></div>"
        : "") +
      "</div></div>";

    if (shellNeedsRebuild(root, m, entries, galleryUrlCount)) {
      applyPdpHtml(root, html);
    } else {
      patchPdpView(root, m, entries, idx, mainImg, effPrice, effMrp, pct);
    }
    wirePdpRootOnce(root);
    mountRmPdpShare(root);
    fadeHeroImageIn(root);
  }

  function load() {
    var id = qs().trim();
    var b = catalogApiBase();
    if (!id) {
      state.material = null;
      document.title = "Product — Craft guru";
      render();
      var nav0 = document.getElementById("rmNavTree");
      if (nav0 && window.RmShopNav) {
        window.RmShopNav.mount(nav0, { activeBase: "", activeSub: "" });
      }
      return;
    }
    var path = "/api/catalog/raw-materials/" + encodeURIComponent(id);
    var url = b ? b + path : path;
    fetch(url, { cache: "no-store" })
      .then(function (res) {
        return res.json().then(function (j) {
          return { okHttp: res.ok, j: j };
        });
      })
      .then(function (o) {
        if (!o.okHttp || !o.j || !o.j.ok || !o.j.material) {
          state.material = null;
        } else {
          state.material = o.j.material;
          state._lastHeroResolvedSrc = "";
          syncDefaults(state.material);
          document.title = (state.material.name || "Product") + " — Craft guru";
        }
        render();
        var navEl = document.getElementById("rmNavTree");
        if (state.material && navEl && window.RmShopNav) {
          window.RmShopNav.mount(navEl, {
            activeBase: state.material.baseCategorySlug || "",
            activeSub: state.material.subcategorySlug || "",
          });
        } else if (navEl && window.RmShopNav) {
          window.RmShopNav.mount(navEl, { activeBase: "", activeSub: "" });
        }
      })
      .catch(function () {
        state.material = null;
        render();
        var navEl2 = document.getElementById("rmNavTree");
        if (navEl2 && window.RmShopNav) {
          window.RmShopNav.mount(navEl2, { activeBase: "", activeSub: "" });
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
