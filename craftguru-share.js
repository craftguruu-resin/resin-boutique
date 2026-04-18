(function () {
  "use strict";

  function absProductUrl(id) {
    var sid = encodeURIComponent(String(id || ""));
    try {
      return new URL("product.html?id=" + sid, window.location.href).href;
    } catch (_) {
      return (
        String(window.location.origin || "") +
        String(window.location.pathname || "").replace(/[^/]+$/, "") +
        "product.html?id=" +
        sid
      );
    }
  }

  function closeAllSharePops() {
    document.querySelectorAll(".product-card-share__pop[aria-hidden='false']").forEach(function (p) {
      p.hidden = true;
      p.setAttribute("aria-hidden", "true");
    });
    document.querySelectorAll(".product-share-bar__dropdown[aria-hidden='false']").forEach(function (p) {
      p.hidden = true;
      p.setAttribute("aria-hidden", "true");
    });
    document.querySelectorAll(".product-share-bar__toggle[aria-expanded='true']").forEach(function (b) {
      b.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("click", function (ev) {
    if (!ev.target.closest) return;
    if (ev.target.closest(".product-card-share") || ev.target.closest(".product-share-bar")) return;
    closeAllSharePops();
  });

  function mountCardShare(btn, opts) {
    if (!btn || !opts) return;
    var id = opts.id;
    var name = String(opts.name || "Craftguru piece");
    var url = absProductUrl(id);
    var text = encodeURIComponent(name + "\n" + url);
    var pop = btn.parentElement && btn.parentElement.querySelector(".product-card-share__pop");
    if (!pop) return;

    pop.innerHTML =
      '<a href="https://wa.me/?text=' +
      text +
      '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' +
      '<a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">Instagram</a>' +
      '<a href="https://www.youtube.com/" target="_blank" rel="noopener noreferrer">YouTube</a>' +
      '<button type="button" class="cg-share-copy" data-url="' +
      String(url).replace(/"/g, "&quot;") +
      '">Copy link</button>';

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = !pop.hidden;
      closeAllSharePops();
      if (open) {
        pop.hidden = true;
        pop.setAttribute("aria-hidden", "true");
      } else {
        pop.hidden = false;
        pop.setAttribute("aria-hidden", "false");
      }
    });

    pop.addEventListener("click", function (e) {
      var c = e.target && e.target.closest ? e.target.closest(".cg-share-copy") : null;
      if (!c) return;
      e.preventDefault();
      e.stopPropagation();
      var u = c.getAttribute("data-url") || url;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(u).catch(function () {
          window.prompt("Copy this link", u);
        });
      } else {
        window.prompt("Copy this link", u);
      }
    });
  }

  function mountProductShare(host, opts) {
    if (!host || !opts) return;
    var id = opts.id;
    var name = String(opts.name || "Craftguru piece");
    var url = absProductUrl(id);
    var text = encodeURIComponent(name + "\n" + url);
    var ddId = "productShareMenu-" + String(id || "x").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    host.className = "product-share-bar";
    host.innerHTML =
      '<button type="button" class="product-share-bar__toggle" aria-expanded="false" aria-haspopup="true" aria-controls="' +
      ddId +
      '">Share</button>' +
      '<div class="product-share-bar__dropdown" id="' +
      ddId +
      '" role="menu" hidden aria-hidden="true">' +
      '<a role="menuitem" href="https://wa.me/?text=' +
      text +
      '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' +
      '<a role="menuitem" href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">Instagram</a>' +
      '<a role="menuitem" href="https://www.youtube.com/" target="_blank" rel="noopener noreferrer">YouTube</a>' +
      '<button type="button" role="menuitem" class="product-share-bar__copy cg-share-copy" data-url="' +
      String(url).replace(/"/g, "&quot;") +
      '">Copy link</button>' +
      "</div>";

    var toggle = host.querySelector(".product-share-bar__toggle");
    var menu = host.querySelector(".product-share-bar__dropdown");
    if (!toggle || !menu) return;

    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = toggle.getAttribute("aria-expanded") === "true";
      closeAllSharePops();
      if (open) {
        toggle.setAttribute("aria-expanded", "false");
        menu.hidden = true;
        menu.setAttribute("aria-hidden", "true");
      } else {
        toggle.setAttribute("aria-expanded", "true");
        menu.hidden = false;
        menu.setAttribute("aria-hidden", "false");
      }
    });

    menu.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    host.querySelectorAll(".cg-share-copy").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        var u = b.getAttribute("data-url") || url;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(u).catch(function () {
            window.prompt("Copy this link", u);
          });
        } else {
          window.prompt("Copy this link", u);
        }
      });
    });
  }

  window.CRAFTGURU_SHARE = {
    productUrl: absProductUrl,
    mountCardShare: mountCardShare,
    mountProductShare: mountProductShare,
  };
})();
