(function () {
  "use strict";

  var LS_KEY = "craftguruRmNavExpanded";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readExpanded() {
    try {
      var j = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      return Array.isArray(j) ? j : [];
    } catch (_) {
      return [];
    }
  }

  function writeExpanded(ids) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(ids.slice(0, 80)));
    } catch (_) {}
  }

  function toggleExpanded(baseId, on) {
    var cur = readExpanded();
    var i = cur.indexOf(baseId);
    if (on && i < 0) cur.push(baseId);
    if (!on && i >= 0) cur.splice(i, 1);
    writeExpanded(cur);
  }

  function shopHref(base, sub) {
    var u = "raw-material-shop.html";
    var q = [];
    if (base) q.push("base=" + encodeURIComponent(base));
    if (sub) q.push("sub=" + encodeURIComponent(sub));
    if (q.length) u += "?" + q.join("&");
    return u;
  }

  /**
   * For bases with multiple subfolders, pick the first taxonomy sub that has at least one listing;
   * otherwise the first sub id (so Cutouts lands on MDF when only MDF has products).
   */
  function preferredListingSub(baseId, category, materials) {
    var subs = (category && category.subcategories) || [];
    if (!subs.length) return "";
    if (subs.length === 1) return String(subs[0].id || "").trim();
    var bid = String(baseId || "").trim();
    var mats = materials || [];
    for (var i = 0; i < subs.length; i++) {
      var sid = String(subs[i].id || "").trim();
      if (!sid) continue;
      for (var j = 0; j < mats.length; j++) {
        var m = mats[j];
        if (
          String(m.baseCategorySlug || "")
            .trim()
            .toLowerCase() === bid.toLowerCase() &&
          String(m.subcategorySlug || "")
            .trim()
            .toLowerCase() === sid.toLowerCase()
        ) {
          return sid;
        }
      }
    }
    return String(subs[0].id || "").trim();
  }

  function catalogApiBase() {
    var M = window.CraftguruCatalogMerge;
    if (M && typeof M.getApiBase === "function") {
      var b = String(M.getApiBase() || "")
        .trim()
        .replace(/\/+$/, "");
      if (b) return b;
    }
    return "";
  }

  function fetchTaxonomy() {
    var base = catalogApiBase();
    if (base) {
      return fetch(base + "/api/catalog/raw-material-taxonomy", { cache: "no-store" })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          if (j && j.ok && j.taxonomy) return j.taxonomy;
          throw new Error("taxonomy api");
        })
        .catch(function () {
          return fetch("raw-material-taxonomy.json", { cache: "no-store" }).then(function (r2) {
            if (!r2.ok) throw new Error("taxonomy");
            return r2.json();
          });
        });
    }
    return fetch("raw-material-taxonomy.json", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("taxonomy");
      return r.json();
    });
  }

  function hrefParams(href) {
    try {
      var u = new URL(href, window.location.href);
      return {
        base: (u.searchParams.get("base") || "").trim(),
        sub: (u.searchParams.get("sub") || "").trim(),
      };
    } catch (_) {
      return { base: "", sub: "" };
    }
  }

  /**
   * Update active link styles without replacing the tree (keeps scroll + avoids flicker).
   * @param {HTMLElement} el
   * @param {{ activeBase?: string, activeSub?: string }} ctx
   */
  function updateActive(el, ctx) {
    if (!el) return;
    ctx = ctx || {};
    var activeBase = String(ctx.activeBase || "").trim();
    var activeSub = String(ctx.activeSub || "").trim();
    el.querySelectorAll(".rm-nav-tree__link.is-active").forEach(function (a) {
      a.classList.remove("is-active");
    });
    el.querySelectorAll("a.rm-nav-tree__link").forEach(function (a) {
      var p = hrefParams(a.getAttribute("href") || "");
      if (p.base === activeBase && p.sub === activeSub) {
        a.classList.add("is-active");
      }
    });
  }

  function wireNavDelegationOnce(el) {
    if (!el || el.dataset.rmNavChevDelegation === "1") return;
    el.dataset.rmNavChevDelegation = "1";
    el.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".rm-nav-tree__chev");
      if (!btn || !el.contains(btn)) return;
      e.preventDefault();
      var bid = btn.getAttribute("data-base");
      var ul = el.querySelector('[data-subs-for="' + bid + '"]');
      var open = !btn.classList.contains("is-open");
      btn.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (ul) ul.classList.toggle("is-open", open);
      toggleExpanded(bid, open);
    });
  }

  /**
   * @param {HTMLElement} el
   * @param {{ activeBase?: string, activeSub?: string, materials?: unknown[], forceRebuild?: boolean }} ctx
   */
  function mount(el, ctx) {
    ctx = ctx || {};
    var activeBase = String(ctx.activeBase || "").trim();
    var activeSub = String(ctx.activeSub || "").trim();
    var materials = Array.isArray(ctx.materials) ? ctx.materials : [];
    if (!el) return Promise.resolve(null);
    if (el.dataset.rmNavBuilt === "1" && !ctx.forceRebuild) {
      updateActive(el, { activeBase: activeBase, activeSub: activeSub });
      return Promise.resolve(null);
    }
    return fetchTaxonomy().then(function (doc) {
      var cats = (doc && doc.categories) || [];
      var expanded = readExpanded();
      var html = '<ul class="rm-nav-tree__root">';
      cats.forEach(function (c) {
        var subs = c.subcategories || [];
        var hasSubs = subs.length > 0;
        var isOpen = expanded.indexOf(c.id) >= 0 || (activeBase === c.id && hasSubs);
        var baseActive = activeBase === c.id && !activeSub;
        var baseHref = hasSubs ? shopHref(c.id, preferredListingSub(c.id, c, materials)) : shopHref(c.id, "");
        if (!hasSubs) {
          html +=
            '<li class="rm-nav-tree__item">' +
            '<a class="rm-nav-tree__link' +
            (baseActive ? " is-active" : "") +
            '" href="' +
            esc(baseHref) +
            '">' +
            (c.image
              ? '<span class="rm-nav-tree__ico"><img src="' + esc(c.image) + '" alt="" width="36" height="36" loading="lazy" /></span>'
              : '<span class="rm-nav-tree__ico rm-nav-tree__ico--ph" aria-hidden="true"></span>') +
            "<span>" +
            esc(c.name) +
            "</span></a></li>";
          return;
        }
        html +=
          '<li class="rm-nav-tree__item rm-nav-tree__item--branch">' +
          '<div class="rm-nav-tree__row">' +
          '<button type="button" class="rm-nav-tree__chev' +
          (isOpen ? " is-open" : "") +
          '" data-base="' +
          esc(c.id) +
          '" aria-expanded="' +
          (isOpen ? "true" : "false") +
          '" aria-label="Toggle ' +
          esc(c.name) +
          '"></button>' +
          '<a class="rm-nav-tree__link rm-nav-tree__link--base' +
          (baseActive ? " is-active" : "") +
          '" href="' +
          esc(baseHref) +
          '">' +
          (c.image
            ? '<span class="rm-nav-tree__ico"><img src="' + esc(c.image) + '" alt="" width="36" height="36" loading="lazy" /></span>'
            : '<span class="rm-nav-tree__ico rm-nav-tree__ico--ph" aria-hidden="true"></span>') +
          "<span>" +
          esc(c.name) +
          "</span></a></div>" +
          '<ul class="rm-nav-tree__subs' +
          (isOpen ? " is-open" : "") +
          '" data-subs-for="' +
          esc(c.id) +
          '">';
        subs.forEach(function (s) {
          var subAct = activeBase === c.id && activeSub === s.id;
          html +=
            '<li><a class="rm-nav-tree__link rm-nav-tree__link--sub' +
            (subAct ? " is-active" : "") +
            '" href="' +
            esc(shopHref(c.id, s.id)) +
            '">' +
            esc(s.name) +
            "</a></li>";
        });
        html += "</ul></li>";
      });
      html += "</ul>";
      el.innerHTML = html;
      el.dataset.rmNavBuilt = "1";
      wireNavDelegationOnce(el);
      updateActive(el, { activeBase: activeBase, activeSub: activeSub });
      return doc;
    });
  }

  window.RmShopNav = {
    fetchTaxonomy: fetchTaxonomy,
    mount: mount,
    updateActive: updateActive,
    shopHref: shopHref,
    preferredListingSub: preferredListingSub,
  };
})();
