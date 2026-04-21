(function () {
  "use strict";

  var M = window.CraftguruCatalogMerge;
  var D = window.RESIN_DATA;

  function catalogApiBase() {
    var b = M && typeof M.getApiBase === "function" ? String(M.getApiBase() || "").trim().replace(/\/+$/, "") : "";
    if (b) return b;
    try {
      if (window.location && window.location.protocol !== "file:") {
        return String(window.location.origin || "").replace(/\/+$/, "");
      }
    } catch (_) {}
    return "";
  }

  function humanizeSlug(s) {
    return String(s || "")
      .replace(/[-_]+/g, " ")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\b\w/g, function (ch) {
        return ch.toUpperCase();
      });
  }

  function qsParams() {
    try {
      var u = new URL(window.location.href);
      return {
        base: (u.searchParams.get("base") || "").trim(),
        sub: (u.searchParams.get("sub") || "").trim(),
      };
    } catch (_) {
      return { base: "", sub: "" };
    }
  }

  function esc(s) {
    var el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  }

  function escAttr(s) {
    return String(s == null ? "").replace(/"/g, "&quot;");
  }

  function imgSrc(rel) {
    if (!rel) return "";
    if (String(rel).indexOf("http") === 0 || String(rel).indexOf("//") === 0) return rel;
    return D && D.imageUrl ? D.imageUrl(rel) : rel;
  }

  function fmtPrice(n) {
    try {
      if (window.RESIN_CART && typeof window.RESIN_CART.formatMoney === "function") {
        return window.RESIN_CART.formatMoney(n);
      }
    } catch (_) {}
    return "₹" + Math.round(Number(n) || 0);
  }

  function findOpt(list, id) {
    if (!id || !list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function finN(n) {
    var x = Number(n);
    return Number.isFinite(x) ? x : null;
  }

  function effectivePriceInr(m, sel) {
    var base = finN(m.priceInr) != null ? Number(m.priceInr) : 0;
    if (!Number.isFinite(base) || base < 0) base = 0;
    var opt = m.options || {};
    var s = opt.useSize && sel.sid ? findOpt(opt.sizes, sel.sid) : null;
    var q = opt.useQty && sel.qid ? findOpt(opt.qtyOptions, sel.qid) : null;
    var ps = s ? finN(s.priceInr) : null;
    var pq = q ? finN(q.priceInr) : null;
    if (opt.useSize && opt.useQty) {
      return (ps != null ? ps : base) + (pq != null ? pq : 0);
    }
    if (opt.useSize && s) return ps != null ? ps : base;
    if (opt.useQty && q) return pq != null ? pq : base;
    return base;
  }

  function minOfferMeta(m) {
    var opt = m.options || {};
    if (!opt.useSize && !opt.useQty) {
      return { min: Number(m.priceInr) || 0, sel: { sid: "", qid: "" } };
    }
    var sizes = opt.useSize && opt.sizes && opt.sizes.length ? opt.sizes : [{ id: "" }];
    var qtys = opt.useQty && opt.qtyOptions && opt.qtyOptions.length ? opt.qtyOptions : [{ id: "" }];
    if (!opt.useSize) sizes = [{ id: "" }];
    if (!opt.useQty) qtys = [{ id: "" }];
    var bestP = Infinity;
    var bestSid = "";
    var bestQid = "";
    sizes.forEach(function (s) {
      qtys.forEach(function (q) {
        var sid = opt.useSize ? String(s.id || "") : "";
        var qid = opt.useQty ? String(q.id || "") : "";
        var p = effectivePriceInr(m, { sid: sid, qid: qid });
        if (p < bestP) {
          bestP = p;
          bestSid = sid;
          bestQid = qid;
        }
      });
    });
    return { min: bestP === Infinity ? Number(m.priceInr) || 0 : bestP, sel: { sid: bestSid, qid: bestQid } };
  }

  function syncNavPhotoFramesLink() {
    var navPf = document.getElementById("navDockPhotoFrames");
    if (!navPf) return;
    try {
      var page = (window.location.pathname || "").split("/").pop() || "";
      if (/^photo-frames\.html/i.test(page)) {
        navPf.setAttribute("href", "photo-frames.html" + (window.location.search || ""));
      }
    } catch (_) {}
  }

  function pdpUrlForProductId(id) {
    var sid = String(id == null ? "" : id).trim();
    if (!sid) return "";
    /* Same-directory relative URL — works on static hosts and avoids pathname/base bugs. */
    return "photo-frame-product.html?id=" + encodeURIComponent(sid);
  }

  function pdpAbsUrlFromHref(href) {
    try {
      return new URL(href, window.location.href).href;
    } catch (_) {
      return href;
    }
  }

  /** Ensures product cards navigate even if another handler interferes with default <a> behavior. */
  function wirePfBrowsePdpClicksOnce() {
    var g = document.getElementById("pfBrowseGrid");
    if (!g || g.dataset.pfBrowsePdpWire === "1") return;
    g.dataset.pfBrowsePdpWire = "1";
    g.addEventListener(
      "click",
      function (e) {
        var a = e.target && e.target.closest && e.target.closest("a[data-pf-pdp]");
        if (!a || !g.contains(a)) return;
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var href = a.getAttribute("href") || "";
        if (!href || href.indexOf("photo-frame-product") < 0) return;
        var dest = pdpAbsUrlFromHref(href);
        e.preventDefault();
        e.stopPropagation();
        window.location.assign(dest);
      },
      true
    );
  }

  function productsUrl(par) {
    var root = catalogApiBase();
    var path = "/api/catalog/photo-frame-products";
    var q = [];
    if (par.base) q.push("base=" + encodeURIComponent(par.base));
    if (par.sub) q.push("sub=" + encodeURIComponent(par.sub));
    if (q.length) path += "?" + q.join("&");
    return root ? root + path : path;
  }

  function setBrowseVisible(on, titleText) {
    var sec = document.getElementById("pfBrowseSection");
    var heroBlock = document.querySelector(".pf-home-hero");
    var below = document.querySelector(".pf-home-below");
    var grid = document.getElementById("photoFrameNavGrid");
    if (!sec) return;
    sec.hidden = !on;
    if (heroBlock) heroBlock.toggleAttribute("hidden", !!on);
    if (below) below.toggleAttribute("hidden", !!on);
    if (grid) grid.toggleAttribute("hidden", !!on);
    var h = document.getElementById("pfBrowseHeading");
    if (h && titleText) h.textContent = titleText;
    /* Avoid smooth scrollIntoView: it can overlap with taps and feels like “stuck” navigation. */
  }

  function renderProducts(list) {
    var g = document.getElementById("pfBrowseGrid");
    if (!g) return;
    g.innerHTML = "";
    if (!list || !list.length) {
      g.innerHTML =
        '<p class="pf-browse__empty">No frames listed for this line yet. Add products in Vendor → Photo frames.</p>';
      return;
    }
    list.forEach(function (m) {
      var meta = minOfferMeta(m);
      var showFrom = !!(m.options && (m.options.useSize || m.options.useQty));
      var href = pdpUrlForProductId(m && m.id != null ? m.id : "");
      if (!href) return;
      var img = m.image ? imgSrc(m.image) : "";
      var card = document.createElement("article");
      card.className = "rm-card-shop";
      card.innerHTML =
        '<a href="' +
        escAttr(href) +
        '" data-pf-pdp="1">' +
        '<div class="rm-card-shop__img">' +
        (img ? '<img src="' + escAttr(img) + '" alt="" loading="lazy" width="400" height="300" />' : "") +
        "</div>" +
        '<div class="rm-card-shop__body">' +
        '<span class="rm-card-shop__brand">Craft Guru</span>' +
        "<h3 class=\"rm-card-shop__title\">" +
        esc(m.name || "Photo frame") +
        "</h3>" +
        (m.description ? '<p class="rm-card-shop__desc">' + esc(m.description) + "</p>" : "") +
        '<div class="rm-card-shop__row">' +
        '<span class="rm-card-shop__price">' +
        esc((showFrom ? "From " : "") + fmtPrice(meta.min)) +
        "</span></div></div></a>";
      g.appendChild(card);
    });
    wirePfBrowsePdpClicksOnce();
  }

  function run() {
    syncNavPhotoFramesLink();
    var par = qsParams();
    var has = !!(par.base || par.sub);
    if (!has) {
      setBrowseVisible(false, "");
      var navReset = document.getElementById("navDockPhotoFrames");
      if (navReset) navReset.setAttribute("href", "photo-frames.html");
      return;
    }
    var titleParts = [];
    if (par.base) titleParts.push(humanizeSlug(par.base));
    if (par.sub) titleParts.push(humanizeSlug(par.sub));
    setBrowseVisible(true, titleParts.join(" · ") || "Photo frames");
    var root = catalogApiBase();
    if (!root) {
      renderProducts([]);
      return;
    }
    fetch(productsUrl(par), { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.ok) {
          renderProducts([]);
          return;
        }
        renderProducts(j.materials || []);
      })
      .catch(function () {
        renderProducts([]);
      })
      .then(function () {
        syncNavPhotoFramesLink();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
  window.addEventListener("popstate", run);
})();
