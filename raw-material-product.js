(function () {
  "use strict";

  var M = window.CraftguruCatalogMerge;
  var D = window.RESIN_DATA;
  var CART = window.RESIN_CART;

  function apiBase() {
    return M && typeof M.getApiBase === "function" ? M.getApiBase() : "";
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

  function heroImagesFor(material, o) {
    var opt = material.options || {};
    var imgs = [];
    function push(u) {
      u = String(u || "").trim();
      if (!u) return;
      if (imgs.indexOf(u) < 0) imgs.push(u);
    }
    if (o.cid) {
      var c = findOpt(opt.colors, o.cid);
      if (c && c.image) push(c.image);
    }
    if (o.sid) {
      var s = findOpt(opt.sizes, o.sid);
      if (s && s.image) push(s.image);
    }
    if (o.qid) {
      var q = findOpt(opt.qtyOptions, o.qid);
      if (q && q.image) push(q.image);
    }
    push(opt.heroImage);
    push(material.image);
    return imgs.length ? imgs : [""];
  }

  function lineImageFor(material, o) {
    var imgs = heroImagesFor(material, o);
    return imgs[0] || "";
  }

  var state = {
    material: null,
    sel: { sid: "", qid: "", cid: "" },
    imgIndex: 0,
    lineQty: 1,
  };

  function syncDefaults(m) {
    var opt = m.options || {};
    state.sel.sid = opt.useSize && opt.sizes && opt.sizes[0] ? opt.sizes[0].id : "";
    state.sel.qid = opt.useQty && opt.qtyOptions && opt.qtyOptions[0] ? opt.qtyOptions[0].id : "";
    state.sel.cid = opt.useColor && opt.colors && opt.colors[0] ? opt.colors[0].id : "";
    state.imgIndex = 0;
    state.lineQty = 1;
  }

  function discountPct(m) {
    if (m.mrpInr == null || !Number.isFinite(Number(m.mrpInr))) return null;
    var mrp = Number(m.mrpInr);
    var p = Number(m.priceInr) || 0;
    if (mrp <= p) return null;
    return Math.round(((mrp - p) / mrp) * 100);
  }

  function render() {
    var m = state.material;
    var root = document.getElementById("rmPdpRoot");
    if (!root) return;
    if (!m) {
      root.innerHTML = '<p class="band-empty">Product not found.</p>';
      return;
    }
    var opt = m.options || {};
    var imgs = heroImagesFor(m, state.sel);
    var idx = Math.min(state.imgIndex, Math.max(0, imgs.length - 1));
    var mainImg = imgs[idx] || "";
    var pct = discountPct(m);

    var thumbs = imgs
      .map(function (u, i) {
        return (
          "<button type=\"button\" class=\"rm-pdp__thumb" +
          (i === idx ? " is-active" : "") +
          "\" data-img-idx=\"" +
          i +
          "\"><img src=\"" +
          escAttr(imgSrc(u)) +
          "\" alt=\"\" width=\"72\" height=\"72\" loading=\"lazy\" /></button>"
        );
      })
      .join("");

    var sizeHtml = "";
    if (opt.useSize && opt.sizes && opt.sizes.length) {
      sizeHtml =
        '<div class="rm-opt-block"><span class="rm-opt-block__label">Size</span><div class="rm-opt-pills" data-rm-opt="size">' +
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
        '<div class="rm-opt-block"><span class="rm-opt-block__label">Pack / quantity</span><div class="rm-opt-pills" data-rm-opt="qty">' +
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
        '<div class="rm-opt-block"><span class="rm-opt-block__label">Colour</span><div class="rm-color-row" data-rm-opt="color">' +
        opt.colors
          .map(function (s) {
            var on = s.id === state.sel.cid ? " is-on" : "";
            var hx = s.hex || "#888";
            return (
              "<button type=\"button\" class=\"rm-color-swatch" +
              on +
              "\" data-cid=\"" +
              escAttr(s.id) +
              "\" style=\"background:" +
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

    root.innerHTML =
      '<div class="rm-pdp">' +
      '<div class="rm-pdp__thumbs">' +
      thumbs +
      "</div>" +
      '<div class="rm-pdp__hero-wrap">' +
      (opt.badge ? '<span class="rm-pdp__badge">' + esc(opt.badge) + "</span>" : "") +
      (imgs.length > 1
        ? '<button type="button" class="rm-pdp__nav rm-pdp__nav--prev" id="rmPdpPrev" aria-label="Previous image">‹</button>' +
          '<button type="button" class="rm-pdp__nav rm-pdp__nav--next" id="rmPdpNext" aria-label="Next image">›</button>'
        : "") +
      (mainImg
        ? '<img id="rmPdpHeroImg" src="' + escAttr(imgSrc(mainImg)) + '" alt="' + escAttr(m.name) + '" />'
        : '<div class="band-empty">No image</div>') +
      "</div>" +
      '<div class="rm-pdp__detail">' +
      '<p class="rm-pdp__brand">Craft Guru · Raw material</p>' +
      "<h1 class=\"rm-pdp__title\">" +
      esc(m.name) +
      "</h1>" +
      '<div class="rm-pdp__stars" aria-hidden="true">★★★★★ <span style="color:rgba(15,23,42,0.35)">4.6</span></div>' +
      '<div class="rm-pdp__price-row">' +
      '<span class="rm-pdp__price">' +
      (CART ? CART.formatMoney(m.priceInr || 0) : "₹" + (m.priceInr || 0)) +
      "</span>" +
      (m.mrpInr != null && Number(m.mrpInr) > Number(m.priceInr)
        ? '<span class="rm-pdp__mrp">' + (CART ? CART.formatMoney(m.mrpInr) : m.mrpInr) + "</span>"
        : "") +
      (pct != null ? '<span class="rm-pdp__save">' + pct + "% off</span>" : "") +
      "</div>" +
      (m.description ? '<p class="rm-pdp__desc">' + esc(m.description) + "</p>" : "") +
      sizeHtml +
      qtyHtml +
      colHtml +
      '<div class="rm-pdp__qty-row">' +
      '<div class="rm-pdp__qty">' +
      '<button type="button" id="rmLineQtyMinus">−</button>' +
      "<span>" +
      state.lineQty +
      "</span>" +
      '<button type="button" id="rmLineQtyPlus">+</button>' +
      "</div>" +
      '<button type="button" class="rm-pdp__add" id="rmAddCart">Add to cart</button>' +
      "</div>" +
      (m.note ? '<p class="rm-pdp__ship">' + esc(m.note) + "</p>" : "") +
      (trust ? '<div class="rm-trust">' + trust + "</div>" : "") +
      "</div></div>";

    root.querySelectorAll(".rm-pdp__thumb").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.imgIndex = Number(btn.getAttribute("data-img-idx")) || 0;
        render();
      });
    });
    var prev = document.getElementById("rmPdpPrev");
    var next = document.getElementById("rmPdpNext");
    if (prev) {
      prev.addEventListener("click", function () {
        state.imgIndex = (idx - 1 + imgs.length) % imgs.length;
        render();
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        state.imgIndex = (idx + 1) % imgs.length;
        render();
      });
    }
    root.querySelectorAll("[data-sid]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.sel.sid = btn.getAttribute("data-sid") || "";
        state.imgIndex = 0;
        render();
      });
    });
    root.querySelectorAll("[data-qid]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.sel.qid = btn.getAttribute("data-qid") || "";
        state.imgIndex = 0;
        render();
      });
    });
    root.querySelectorAll("[data-cid]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.sel.cid = btn.getAttribute("data-cid") || "";
        state.imgIndex = 0;
        render();
      });
    });
    var minus = document.getElementById("rmLineQtyMinus");
    var plus = document.getElementById("rmLineQtyPlus");
    if (minus) {
      minus.addEventListener("click", function () {
        state.lineQty = Math.max(1, state.lineQty - 1);
        render();
      });
    }
    if (plus) {
      plus.addEventListener("click", function () {
        state.lineQty = Math.min(99, state.lineQty + 1);
        render();
      });
    }
    var add = document.getElementById("rmAddCart");
    if (add && CART) {
      add.addEventListener("click", function () {
        var slot = variantSlot(state.sel);
        var vlabel = variantLabelFrom(m, state.sel);
        CART.addItem({
          id: m.id,
          size: slot,
          variantLabel: vlabel,
          name: m.name,
          price: Number(m.priceInr) || 0,
          image: lineImageFor(m, state.sel),
          qty: state.lineQty,
        });
        try {
          if (window.RESIN_SHELL && window.RESIN_SHELL.openDrawer) window.RESIN_SHELL.openDrawer();
        } catch (_) {}
      });
    }
  }

  function load() {
    var id = qs().trim();
    var b = apiBase();
    if (!id) {
      state.material = null;
      document.title = "Product — Craft guru";
      render();
      return;
    }
    if (!b) {
      state.material = null;
      render();
      return;
    }
    fetch(b + "/api/catalog/raw-materials/" + encodeURIComponent(id), { cache: "no-store" })
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
          syncDefaults(state.material);
          document.title = (state.material.name || "Product") + " — Craft guru";
        }
        render();
      })
      .catch(function () {
        state.material = null;
        render();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
