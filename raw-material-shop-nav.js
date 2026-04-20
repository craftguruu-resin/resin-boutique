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

  function fetchTaxonomy() {
    return fetch("raw-material-taxonomy.json", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("taxonomy");
      return r.json();
    });
  }

  /**
   * @param {HTMLElement} el
   * @param {{ activeBase?: string, activeSub?: string }} ctx
   */
  function mount(el, ctx) {
    ctx = ctx || {};
    var activeBase = String(ctx.activeBase || "").trim();
    var activeSub = String(ctx.activeSub || "").trim();
    if (!el) return Promise.resolve(null);
    return fetchTaxonomy().then(function (doc) {
      var cats = (doc && doc.categories) || [];
      var expanded = readExpanded();
      var html = '<ul class="rm-nav-tree__root">';
      cats.forEach(function (c) {
        var subs = c.subcategories || [];
        var hasSubs = subs.length > 0;
        var isOpen = expanded.indexOf(c.id) >= 0 || (activeBase === c.id && hasSubs);
        var baseActive = activeBase === c.id && !activeSub;
        if (!hasSubs) {
          html +=
            '<li class="rm-nav-tree__item">' +
            '<a class="rm-nav-tree__link' +
            (baseActive ? " is-active" : "") +
            '" href="' +
            esc(shopHref(c.id, "")) +
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
          esc(shopHref(c.id, "")) +
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

      el.querySelectorAll(".rm-nav-tree__chev").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          var bid = btn.getAttribute("data-base");
          var ul = el.querySelector('[data-subs-for="' + bid + '"]');
          var open = !btn.classList.contains("is-open");
          btn.classList.toggle("is-open", open);
          btn.setAttribute("aria-expanded", open ? "true" : "false");
          if (ul) ul.classList.toggle("is-open", open);
          toggleExpanded(bid, open);
        });
      });

      return doc;
    });
  }

  window.RmShopNav = {
    fetchTaxonomy: fetchTaxonomy,
    mount: mount,
    shopHref: shopHref,
  };
})();
