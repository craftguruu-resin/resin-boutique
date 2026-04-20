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
      .replace(/"/g, "&quot;");
  }

  function shopLineHref(baseId, subId) {
    var b = String(baseId || "").trim();
    var s = String(subId || "").trim();
    if (!b) return "";
    if (s) {
      return (
        "photo-frame-shop.html?base=" +
        encodeURIComponent(b) +
        "&sub=" +
        encodeURIComponent(s)
      );
    }
    return "photo-frame-shop.html?base=" + encodeURIComponent(b);
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
        out.push({ name: String(s.name || "").trim(), href: href });
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
          listEls.forEach(function (el) {
            el.innerHTML = "<li>Links unavailable.</li>";
          });
          return;
        }
        listEls.forEach(function (el) {
          render(el, j.nav);
        });
      })
      .catch(function () {
        listEls.forEach(function (el) {
          el.innerHTML = "<li>Links unavailable.</li>";
        });
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
