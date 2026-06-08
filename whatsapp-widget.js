(function () {
  "use strict";

  var PHONE = "918824350056";
  var WA_ICON =
    '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
    '<path d="M16.01 2.67c-7.36 0-13.34 5.98-13.34 13.34 0 2.35.62 4.64 1.8 6.66L2.67 29.33l6.84-1.79a13.28 13.28 0 0 0 6.5 1.67h.01c7.36 0 13.34-5.98 13.34-13.34S23.37 2.67 16.01 2.67zm0 24.35h-.01a11.02 11.02 0 0 1-5.6-1.53l-.4-.24-4.06 1.06 1.08-3.96-.26-.41a11.02 11.02 0 0 1-1.69-5.83c0-6.09 4.95-11.04 11.04-11.04 2.95 0 5.72 1.15 7.8 3.23a10.96 10.96 0 0 1 3.23 7.8c0 6.09-4.95 11.03-11.03 11.03zm6.07-8.25c-.33-.17-1.96-.97-2.26-1.08-.3-.11-.52-.17-.74.17-.22.33-.85 1.08-1.04 1.3-.19.22-.39.24-.72.08-.33-.17-1.39-.51-2.65-1.62-.98-.87-1.64-1.95-1.83-2.28-.19-.33-.02-.51.14-.68.15-.15.33-.39.5-.58.17-.19.22-.33.33-.55.11-.22.06-.41-.03-.58-.08-.17-.74-1.78-1.01-2.44-.27-.64-.54-.55-.74-.56h-.63c-.22 0-.58.08-.88.41-.3.33-1.15 1.12-1.15 2.73 0 1.61 1.18 3.17 1.34 3.39.17.22 2.32 3.54 5.62 4.97.79.34 1.4.54 1.88.69.79.25 1.51.21 2.08.13.63-.09 1.96-.8 2.24-1.57.28-.77.28-1.43.19-1.57-.08-.14-.3-.22-.63-.39z"/>' +
    "</svg>";

  function waUrl(text) {
    var q = text ? "?text=" + encodeURIComponent(text) : "";
    return "https://wa.me/" + PHONE + q;
  }

  function pageContextMessage() {
    try {
      var path = (window.location.pathname || "").split("/").pop() || "index.html";
      if (path === "product.html" || path === "category.html") {
        return "Hi Craftguru, I have a question about a resin product on your site: " + window.location.href;
      }
      if (path.indexOf("raw-material") >= 0) {
        return "Hi Craftguru, I need help choosing a resin raw material.";
      }
      if (path.indexOf("photo-frame") >= 0 || path === "photo-frames.html") {
        return "Hi Craftguru, I have a question about photo frames.";
      }
      if (path === "checkout.html") {
        return "Hi Craftguru, I need help with my checkout.";
      }
    } catch (_) {}
    return "Hi Craftguru, I would like to know more about your resin products.";
  }

  function mountWidget() {
    if (document.getElementById("cgWhatsAppWidget")) return;

    var root = document.createElement("div");
    root.id = "cgWhatsAppWidget";
    root.className = "cg-wa-widget";
    root.setAttribute("aria-live", "polite");
    root.innerHTML =
      '<div class="cg-wa-widget__backdrop" data-wa-close aria-hidden="true"></div>' +
      '<div class="cg-wa-widget__panel" id="cgWhatsAppPanel" role="dialog" aria-modal="true" aria-labelledby="cgWhatsAppTitle" hidden>' +
      '<div class="cg-wa-widget__head">' +
      '<div><h3 id="cgWhatsAppTitle">Chat on WhatsApp</h3><p>Craftguru · +91-8824350056</p></div>' +
      '<button type="button" class="cg-wa-widget__close" data-wa-close aria-label="Close chat panel">✕</button>' +
      "</div>" +
      '<div class="cg-wa-widget__body">' +
      '<p class="cg-wa-widget__msg">Ask about resin pieces, bulk orders, raw materials, or delivery — we usually reply quickly.</p>' +
      '<div class="cg-wa-widget__actions">' +
      '<a class="cg-wa-widget__chip" href="' +
      waUrl("Hi Craftguru, I would like a catalog recommendation.") +
      '" target="_blank" rel="noopener noreferrer">Recommend a product line</a>' +
      '<a class="cg-wa-widget__chip" href="' +
      waUrl("Hi Craftguru, I need help with a bulk / corporate order.") +
      '" target="_blank" rel="noopener noreferrer">Bulk / corporate order</a>' +
      '<a class="cg-wa-widget__cta" id="cgWhatsAppOpenChat" href="' +
      waUrl(pageContextMessage()) +
      '" target="_blank" rel="noopener noreferrer">Open WhatsApp chat</a>' +
      "</div></div></div>" +
      '<button type="button" class="cg-wa-widget__fab cg-wa-widget__bounce" id="cgWhatsAppFab" aria-label="Open WhatsApp chat" aria-expanded="false" aria-controls="cgWhatsAppPanel">' +
      '<span class="cg-wa-widget__pulse" aria-hidden="true"></span>' +
      WA_ICON +
      "</button>";

    document.body.appendChild(root);

    var fab = document.getElementById("cgWhatsAppFab");
    var panel = document.getElementById("cgWhatsAppPanel");
    var openChat = document.getElementById("cgWhatsAppOpenChat");

    function setOpen(on) {
      root.classList.toggle("is-open", on);
      if (fab) fab.setAttribute("aria-expanded", on ? "true" : "false");
      if (panel) {
        panel.hidden = !on;
      }
    }

    function toggleOpen() {
      setOpen(!root.classList.contains("is-open"));
    }

    if (fab) fab.addEventListener("click", toggleOpen);
    root.querySelectorAll("[data-wa-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        setOpen(false);
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("is-open")) setOpen(false);
    });

    if (openChat) {
      openChat.addEventListener("click", function () {
        setOpen(false);
      });
    }
  }

  function ensureStyles() {
    if (document.querySelector('link[href*="whatsapp-widget.css"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "whatsapp-widget.css";
    document.head.appendChild(link);
  }

  function boot() {
    ensureStyles();
    mountWidget();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
