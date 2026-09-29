(function () {
  "use strict";

  function showCopyFeedback(msg, anchorEl) {
    var t = String(msg != null && msg !== "" ? msg : "Link copied");
    var el = document.getElementById("cgCopyToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "cgCopyToast";
      el.className = "cg-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = t;
    if (anchorEl && anchorEl.getBoundingClientRect) {
      var r = anchorEl.getBoundingClientRect();
      el.setAttribute("data-cg-toast-anchored", "1");
      el.style.left = Math.round(r.left + r.width / 2) + "px";
      el.style.top = Math.round(r.top - 8) + "px";
      el.style.bottom = "auto";
      el.style.transform = "translate(-50%, calc(-100% + 6px))";
    } else {
      el.removeAttribute("data-cg-toast-anchored");
      el.style.left = "50%";
      el.style.top = "auto";
      el.style.bottom = "1.25rem";
      el.style.transform = "translateX(-50%) translateY(20px)";
    }
    el.classList.add("is-visible");
    var prev = el._cgToastTimer;
    if (prev) clearTimeout(prev);
    el._cgToastTimer = setTimeout(function () {
      el.classList.remove("is-visible");
    }, 2500);
  }

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

  function copyLink(url, anchorEl) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard
        .writeText(url)
        .then(function () {
          showCopyFeedback("Link copied", anchorEl);
        })
        .catch(function () {
          if (window.CraftguruGuestFeedback) window.CraftguruGuestFeedback.notify("Could not open sharing. The link is ready to copy from your browser address bar.");
          showCopyFeedback("Copy the link from the box", anchorEl);
        });
    }
    if (window.CraftguruGuestFeedback) {
      window.CraftguruGuestFeedback.notify("Copy the link from your browser address bar.");
    }
    showCopyFeedback("Link copied", anchorEl);
    return Promise.resolve();
  }

  function shareLink(name, url, anchorEl) {
    if (navigator.share) {
      return navigator
        .share({ title: name, text: name, url: url })
        .then(function () {
          showCopyFeedback("Share sheet opened", anchorEl);
        })
        .catch(function (err) {
          /* Closing the system share sheet is intentional, not an error. */
          if (err && err.name === "AbortError") return;
          return copyLink(url, anchorEl);
        });
    }
    return copyLink(url, anchorEl);
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
      '<button type="button" class="cg-share-native" data-url="' +
      String(url).replace(/"/g, "&quot;") +
      '" data-title="' +
      String(name).replace(/"/g, "&quot;") +
      '">Share…</button>' +
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
      var nativeShare = e.target && e.target.closest ? e.target.closest(".cg-share-native") : null;
      if (nativeShare) {
        e.preventDefault();
        e.stopPropagation();
        shareLink(nativeShare.getAttribute("data-title") || name, nativeShare.getAttribute("data-url") || url, nativeShare);
        return;
      }
      var c = e.target && e.target.closest ? e.target.closest(".cg-share-copy") : null;
      if (!c) return;
      e.preventDefault();
      e.stopPropagation();
      copyLink(c.getAttribute("data-url") || url, c);
    });
  }

  function mountProductShare(host, opts) {
    if (!host || !opts) return;
    var id = opts.id;
    var name = String(opts.name || "Craftguru piece");
    var overrideUrl = opts.productUrl != null ? String(opts.productUrl).trim() : "";
    var url = overrideUrl ? overrideUrl : absProductUrl(id);
    var text = encodeURIComponent(name + "\n" + url);
    var ddId = "productShareMenu-" + String(id || "x").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    var keepRmPdp = host.classList && host.classList.contains("product-share-bar--rm-pdp");
    host.className = "product-share-bar" + (keepRmPdp ? " product-share-bar--rm-pdp" : "");
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
      '<button type="button" role="menuitem" class="cg-share-native" data-url="' +
      String(url).replace(/"/g, "&quot;") +
      '" data-title="' +
      String(name).replace(/"/g, "&quot;") +
      '">Share…</button>' +
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
        copyLink(b.getAttribute("data-url") || url, b);
      });
    });
    host.querySelectorAll(".cg-share-native").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        shareLink(b.getAttribute("data-title") || name, b.getAttribute("data-url") || url, b);
      });
    });
  }

  window.CRAFTGURU_SHARE = {
    productUrl: absProductUrl,
    mountCardShare: mountCardShare,
    mountProductShare: mountProductShare,
    showCopyToast: showCopyFeedback,
  };
})();
