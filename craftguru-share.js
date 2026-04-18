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
  }

  document.addEventListener("click", function (ev) {
    if (!ev.target.closest || !ev.target.closest(".product-card-share")) {
      closeAllSharePops();
    }
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
      '<a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">Instagram app</a>' +
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
      var u = c.getAttribute("data-url") || url;
      function ok() {
        try {
          window.alert("Link copied.");
        } catch (_) {}
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(u).then(ok).catch(function () {
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
    host.innerHTML =
      '<span class="product-share-bar__label">Share</span>' +
      '<div class="product-card-share__pop" style="position:relative;display:inline-flex;flex-wrap:wrap;gap:0.35rem;border:0;background:transparent;box-shadow:none;padding:0" role="group">' +
      '<a class="add-btn add-btn--mini" href="https://wa.me/?text=' +
      text +
      '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' +
      '<a class="add-btn add-btn--mini" href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">Instagram</a>' +
      '<a class="add-btn add-btn--mini" href="https://www.youtube.com/" target="_blank" rel="noopener noreferrer">YouTube</a>' +
      '<button type="button" class="add-btn add-btn--mini cg-share-copy" data-url="' +
      String(url).replace(/"/g, "&quot;") +
      '">Copy link</button>' +
      "</div>";

    host.querySelectorAll(".cg-share-copy").forEach(function (b) {
      b.addEventListener("click", function () {
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
