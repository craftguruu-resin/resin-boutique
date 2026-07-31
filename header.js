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
      if (!v) return;
      window.alert("Thank you! Our team will follow up from sales@craftguru.co.in.");
      if (input) input.value = "";
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
/**
 * Scroll-reactive header + optional nav sparkle (respects reduced motion).
 */
(function () {
  "use strict";

  var header = document.querySelector(".site-top--fx");
  if (!header) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function onScroll() {
    if (reduce) return;
    var y = window.scrollY || document.documentElement.scrollTop;
    header.classList.toggle("is-scrolled", y > 16);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
