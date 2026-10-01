(function () {
  "use strict";

  var body = document.body;
  if (!body || !body.classList.contains("guest-site")) return;

  function labelIconButtons() {
    document.querySelectorAll("button, a[role='button']").forEach(function (control) {
      if (control.getAttribute("aria-label") || String(control.textContent || "").trim()) return;
      var label = control.getAttribute("title") || control.getAttribute("data-label") || "Action";
      control.setAttribute("aria-label", label);
    });
  }

  function wireImages() {
    document.querySelectorAll("main img, .cart-drawer img, .checkout-page img").forEach(function (img) {
      if (!img.getAttribute("decoding")) img.setAttribute("decoding", "async");
      var hero = img.closest(".product-hero-img, .rm-pdp__hero-zoom, .home-resin-hero, .rm-landing-hero");
      if (hero) {
        img.loading = "eager";
        img.setAttribute("fetchpriority", "high");
      } else if (!img.getAttribute("loading")) {
        img.loading = "lazy";
      }
      if (!img.getAttribute("alt")) {
        var card = img.closest(".cart-item, .plp-card, .product-card, .rm-card-shop");
        var name = card && card.querySelector("strong, .plp-card__name, .rm-card-shop__title, h3");
        if (name && String(name.textContent || "").trim()) img.alt = String(name.textContent).trim();
      }
      if (img.dataset.cgUiFinish === "1") return;
      img.dataset.cgUiFinish = "1";
      img.addEventListener("error", function () {
        img.classList.add("cg-ui-media-failed");
      });
      img.addEventListener("load", function () {
        img.classList.remove("cg-ui-media-failed");
      });
    });
  }

  function wireInvalidFeedback() {
    document.querySelectorAll("form").forEach(function (form) {
      if (form.dataset.cgInvalidWired === "1") return;
      form.dataset.cgInvalidWired = "1";
      form.addEventListener("invalid", function (event) {
        var field = event.target;
        if (!field || field.dataset.cgInvalidFocused === "1") return;
        field.dataset.cgInvalidFocused = "1";
        field.setAttribute("aria-invalid", "true");
        requestAnimationFrame(function () {
          try { field.focus({ preventScroll: true }); } catch (_) { field.focus(); }
          try { field.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (_) {}
        });
      }, true);
      form.addEventListener("input", function (event) {
        if (event.target && event.target.dataset) {
          delete event.target.dataset.cgInvalidFocused;
          event.target.removeAttribute("aria-invalid");
        }
      });
    });
  }

  function removeEmptyEventBlocks() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll("body *"));
    nodes.forEach(function (node) {
      if (!node || node.children.length || node.hidden) return;
      var text = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (!/^no events to display\.?$/i.test(text)) return;
      var block = node.closest("section, aside, article, .card, .panel, .widget") || node;
      block.remove();
    });
  }

  function boot() {
    body.dataset.cgUiReady = "1";
    document.documentElement.classList.add("cg-ui-finish-ready");
    labelIconButtons();
    wireImages();
    wireInvalidFeedback();
    removeEmptyEventBlocks();
    if (window.MutationObserver) {
      var scheduled = false;
      var refresh = function () {
        if (scheduled) return;
        scheduled = true;
        var run = function () {
          scheduled = false;
          labelIconButtons();
          wireImages();
          wireInvalidFeedback();
          removeEmptyEventBlocks();
        };
        if (window.requestAnimationFrame) window.requestAnimationFrame(run);
        else window.setTimeout(run, 0);
      };
      new MutationObserver(refresh).observe(body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
