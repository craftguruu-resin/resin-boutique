/**
 * Small header helpers used on all pages.
 * Keeps nav state consistent and updates the footer year if present.
 */
(function () {
  "use strict";

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  var newsletterForm = document.getElementById("footerNewsletterForm");
  if (newsletterForm) {
    newsletterForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("footerNewsletterEmail");
      var v = input && input.value ? String(input.value).trim() : "";
      var submit = newsletterForm.querySelector('button[type="submit"]');
      var status = document.getElementById("footerNewsletterStatus");
      if (!status) {
        status = document.createElement("p");
        status.id = "footerNewsletterStatus";
        status.className = "footer-newsletter__status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        newsletterForm.appendChild(status);
      }
      if (!v) {
        status.textContent = "Enter your email address to subscribe.";
        return;
      }
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Subscribing…";
      }
      status.textContent = "";
      var base = "";
      try {
        base =
          (window.CraftguruApiBase && typeof window.CraftguruApiBase.get === "function" && window.CraftguruApiBase.get()) ||
          window.CRAFTGURU_API_BASE ||
          "";
      } catch (_) {}
      fetch(base + "/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: v }),
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (!res.ok || !body.ok) throw new Error(body.error || "Newsletter signup is temporarily unavailable.");
            return body;
          });
        })
        .then(function (body) {
          status.textContent = body.alreadySubscribed ? "This email is already subscribed." : "You’re subscribed to Craftguru updates.";
          if (input) input.value = "";
        })
        .catch(function (err) {
          status.textContent = (err && err.message) || "Newsletter signup is temporarily unavailable. Please try again.";
        })
        .finally(function () {
          if (submit) {
            submit.disabled = false;
            submit.textContent = "Subscribe";
          }
        });
    });
  }

  function navHrefFile(href) {
    return String(href || "")
      .split("#")[0]
      .split("?")[0]
      .trim();
  }

  /** Map child storefront pages to their parent nav item href file. */
  var NAV_PARENT_BY_PAGE = {
    "category.html": "index.html",
    "product.html": "index.html",
    "checkout.html": "index.html",
    "raw-material.html": "raw-material-shop.html",
    "raw-material-product.html": "raw-material-shop.html",
    "photo-frame-shop.html": "photo-frames.html",
    "photo-frame-product.html": "photo-frames.html",
    "photo-frames.html": "photo-frames.html",
  };

  // Best-effort active state (some pages already set is-active in markup).
  var path = (window.location.pathname || "").split("/").pop() || "index.html";
  var activeNavFile = NAV_PARENT_BY_PAGE[path] || path;
  var links = Array.prototype.slice.call(document.querySelectorAll(".nav-dock-link"));
  if (links.length) {
    links.forEach(function (l) {
      l.classList.remove("is-active", "nav-dock-link--active");
    });
    links.forEach(function (l) {
      var href = l.getAttribute("href") || "";
      if (!href) return;
      var hrefFile = navHrefFile(href) || href;
      if (hrefFile === activeNavFile || hrefFile === path) l.classList.add("is-active");
      if (
        activeNavFile === "index.html" &&
        (href === "#categories" || href === "index.html#categories")
      ) {
        l.classList.add("is-active");
      }
    });
    links.forEach(function (l) {
      l.addEventListener("click", function () {
        var href = l.getAttribute("href") || "";
        if (!href || href.charAt(0) === "#") return;
        var dest = navHrefFile(href);
        if (!dest || dest === path) return;
        try {
          sessionStorage.setItem("craftguruNavScrollTop", "1");
        } catch (_) {}
      });
    });
  }

  var cartToggle = document.getElementById("cartToggle");
  var cartDrawer = document.getElementById("cartDrawer");
  if (cartToggle && cartDrawer) {
    function syncCartToggleActive() {
      cartToggle.classList.toggle("is-active", cartDrawer.classList.contains("is-open"));
      cartToggle.setAttribute("aria-expanded", cartDrawer.classList.contains("is-open") ? "true" : "false");
    }
    syncCartToggleActive();
    new MutationObserver(syncCartToggleActive).observe(cartDrawer, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
})();
