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

  // Best-effort active state (some pages already set is-active in markup).
  var path = (window.location.pathname || "").split("/").pop() || "index.html";
  var links = Array.prototype.slice.call(document.querySelectorAll(".nav-dock-link"));
  if (links.length) {
    links.forEach(function (l) {
      l.classList.remove("is-active");
    });
    links.forEach(function (l) {
      var href = l.getAttribute("href") || "";
      if (!href) return;
      if (href === path) l.classList.add("is-active");
      if (path === "index.html" && (href === "#categories" || href === "index.html#categories")) l.classList.add("is-active");
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
