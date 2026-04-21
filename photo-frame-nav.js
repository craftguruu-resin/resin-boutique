(function () {
  "use strict";

  function apiBase() {
    var M = window.CraftguruCatalogMerge;
    if (M && typeof M.getApiBase === "function") {
      var b = String(M.getApiBase() || "")
        .trim()
        .replace(/\/+$/, "");
      if (b) return b;
    }
    try {
      if (window.location && window.location.protocol !== "file:") {
        return String(window.location.origin || "").replace(/\/+$/, "");
      }
    } catch (_) {}
    return "";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function imgUrl(rel) {
    var D = window.RESIN_DATA;
    if (!rel) return "";
    var r = String(rel).trim();
    if (!r) return "";
    if (r.indexOf("http") === 0 || r.indexOf("//") === 0) return r;
    return D && typeof D.imageUrl === "function" ? D.imageUrl(r) : r;
  }

  /** Legacy vendor links pointed at the standalone shop; browsing stays on the Photo frames landing page. */
  function normalizeLineHref(href) {
    var h = String(href || "").trim();
    var legacy = "photo-frame-shop.html";
    if (h === legacy || h.indexOf(legacy + "?") === 0 || h.indexOf("./" + legacy) === 0) {
      var rest = h.replace(/^\.\//, "");
      var q = rest.indexOf("?");
      var qs = q >= 0 ? rest.slice(q) : "";
      return "photo-frames.html" + qs;
    }
    return h;
  }

  function shopLineHref(baseId, subId) {
    var b = String(baseId || "").trim();
    var s = String(subId || "").trim();
    if (!b) return "";
    if (s) {
      return (
        "photo-frames.html?base=" +
        encodeURIComponent(b) +
        "&sub=" +
        encodeURIComponent(s)
      );
    }
    return "photo-frames.html?base=" + encodeURIComponent(b);
  }

  function lineImage(c, s) {
    if (s) {
      var si = String((s && s.image) || "").trim();
      var ci = String((c && c.image) || "").trim();
      return si || ci;
    }
    return String((c && c.image) || "").trim();
  }

  function qsLine() {
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

  function hrefMatchesLine(href, cur) {
    try {
      var u = new URL(href, window.location.href);
      var b = (u.searchParams.get("base") || "").trim();
      var s = (u.searchParams.get("sub") || "").trim();
      return b === cur.base && s === cur.sub;
    } catch (_) {
      return false;
    }
  }

  /**
   * Guest left rail on photo-frames.html: list every vendor line (even one) above Shop by category.
   */
  function mountPfCategoryRail(doc) {
    var aside = document.getElementById("guestPageCategoryRail");
    if (!aside) return;
    var old = aside.querySelector("#pfRailLines");
    if (old) old.remove();
    var links = flattenNav(doc);
    if (!links.length) return;
    var cur = qsLine();
    var block = document.createElement("div");
    block.id = "pfRailLines";
    block.className = "pf-rail-lines";
    var lab = document.createElement("p");
    lab.className = "home-category-rail__label pf-rail-lines__label";
    lab.textContent = "Photo frame lines";
    var nav = document.createElement("div");
    nav.className = "pf-rail-lines__grid category-grid category-grid--rail";
    nav.setAttribute("role", "navigation");
    nav.setAttribute("aria-label", "Photo frame catalogue lines");
    links.forEach(function (x) {
      var a = document.createElement("a");
      a.className = "category-pill category-pill--rail pf-rail-lines__pill";
      a.href = x.href;
      var imgRel = String(x.image || "").trim();
      if (imgRel) {
        var im = document.createElement("img");
        im.src = imgUrl(imgRel);
        im.alt = "";
        im.width = 28;
        im.height = 28;
        im.loading = "lazy";
        im.className = "pf-rail-lines__pill-img";
        a.appendChild(im);
      }
      a.appendChild(document.createTextNode(x.name));
      if (hrefMatchesLine(x.href, cur)) a.classList.add("is-active");
      nav.appendChild(a);
    });
    block.appendChild(lab);
    block.appendChild(nav);
    aside.insertBefore(block, aside.firstChild);
  }

  var lastPfNavDoc = null;

  function lineNavAbsUrl(href) {
    try {
      return new URL(href, window.location.href).href;
    } catch (_) {
      return href;
    }
  }

  /** Browse-by-line cards: force navigation so ?base=&sub= always loads (rail overlap / same-doc quirks). */
  function wirePfHomeLineGridOnce() {
    var grid = document.getElementById("photoFrameNavGrid");
    if (!grid || grid.dataset.pfLineNavWire === "1") return;
    grid.dataset.pfLineNavWire = "1";
    grid.addEventListener(
      "click",
      function (e) {
        var a = e.target && e.target.closest && e.target.closest("a.pf-home-link-card");
        if (!a || !grid.contains(a)) return;
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var href = a.getAttribute("href") || "";
        if (!href) return;
        if (href.indexOf("photo-frames.html") < 0 && href.indexOf("photo-frame-shop.html") < 0) return;
        e.preventDefault();
        e.stopPropagation();
        window.location.assign(lineNavAbsUrl(href));
      },
      true
    );
  }

  function flattenNav(doc) {
    var out = [];
    var cats = (doc && doc.categories) || [];
    cats.forEach(function (c) {
      if (!c || !c.id) return;
      var subs = (c && c.subcategories) || [];
      if (!subs.length && c.name) {
        out.push({
          name: String(c.name || "").trim(),
          href: shopLineHref(c.id, ""),
          image: lineImage(c, null),
        });
        return;
      }
      subs.forEach(function (s) {
        if (!s || !s.name) return;
        var href = String((s.href != null && s.href) || "").trim();
        if (!href && s.id) {
          href = shopLineHref(c.id, s.id);
        } else if (href.indexOf("category.html?cat=") === 0) {
          href = shopLineHref(c.id, s.id);
        }
        if (!href) return;
        href = normalizeLineHref(href);
        out.push({
          name: String(s.name || "").trim(),
          href: href,
          image: lineImage(c, s),
        });
      });
    });
    return out;
  }

  function render(listEl, doc) {
    if (!listEl) return;
    var links = flattenNav(doc);
    if (!links.length) {
      listEl.innerHTML = "<li>No links configured.</li>";
      return;
    }
    var isGrid = listEl.id === "photoFrameNavGrid";
    if (isGrid) {
      listEl.innerHTML = links
        .map(function (x) {
          var hasImg = !!String(x.image || "").trim();
          var media = hasImg
            ? '<span class="pf-home-link-card__media"><img src="' +
              esc(imgUrl(x.image)) +
              '" alt="" loading="lazy" width="480" height="320" /></span>'
            : '<span class="pf-home-link-card__media pf-home-link-card__media--empty" aria-hidden="true"></span>';
          return (
            '<li><a class="pf-home-link-card" data-pf-line-card="1" href="' +
            esc(x.href) +
            '">' +
            media +
            '<span class="pf-home-link-card__txt">' +
            esc(x.name) +
            "</span></a></li>"
          );
        })
        .join("");
      wirePfHomeLineGridOnce();
      return;
    }
    listEl.innerHTML = links
      .map(function (x) {
        return '<li><a href="' + esc(x.href) + '">' + esc(x.name) + "</a></li>";
      })
      .join("");
  }

  function run() {
    var listEls = [document.getElementById("photoFrameNavList"), document.getElementById("photoFrameNavGrid")].filter(
      Boolean
    );
    if (!listEls.length) return;
    var base = apiBase();
    if (!base) {
      listEls.forEach(function (el) {
        el.innerHTML = "<li>Configure API (data-bill-api-base) to load links.</li>";
      });
      return;
    }
    fetch(base + "/api/catalog/photo-frame-nav", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.ok || !j.nav) {
          lastPfNavDoc = null;
          listEls.forEach(function (el) {
            el.innerHTML = "<li>Links unavailable.</li>";
          });
          return;
        }
        lastPfNavDoc = j.nav;
        listEls.forEach(function (el) {
          render(el, j.nav);
        });
        try {
          mountPfCategoryRail(j.nav);
        } catch (_) {}
        setTimeout(function () {
          if (lastPfNavDoc && document.getElementById("guestPageCategoryRail") && !document.getElementById("pfRailLines")) {
            try {
              mountPfCategoryRail(lastPfNavDoc);
            } catch (_) {}
          }
        }, 50);
      })
      .catch(function () {
        lastPfNavDoc = null;
        listEls.forEach(function (el) {
          el.innerHTML = "<li>Links unavailable.</li>";
        });
      });
  }

  window.addEventListener("popstate", function () {
    if (lastPfNavDoc) {
      try {
        mountPfCategoryRail(lastPfNavDoc);
      } catch (_) {}
    }
  });

  window.addEventListener("craftguruCatalogCategoriesMerged", function () {
    if (!lastPfNavDoc) return;
    try {
      requestAnimationFrame(function () {
        mountPfCategoryRail(lastPfNavDoc);
      });
    } catch (_) {}
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
