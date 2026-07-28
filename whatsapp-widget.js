(function () {
  "use strict";

  var WA = window.CRAFTGURU_WA;
  var PHONE = (WA && WA.PHONE) || "918824350056";

  var WA_ICON =
    '<svg class="cg-wa-widget__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>' +
    "</svg>";

  var ACTIONS = [
    {
      label: "Recommended Products",
      message: "Hi Craftguru, I would like recommendations for resin products from your catalog.",
    },
    {
      label: "Bulk Order Inquiry",
      message: "Hi Craftguru, I need help with a bulk / corporate order.",
    },
  ];

  function waUrl(text) {
    if (WA && typeof WA.buildUrl === "function") return WA.buildUrl(text);
    return "https://wa.me/" + PHONE + "?text=" + encodeURIComponent(text);
  }

  function buildPanelActions() {
    return ACTIONS.map(function (action, i) {
      return (
        '<a class="cg-wa-widget__action" href="' +
        waUrl(action.message) +
        '" target="_blank" rel="noopener noreferrer" style="--action-i:' +
        i +
        '">' +
        '<span class="cg-wa-widget__action-label">' +
        action.label +
        "</span>" +
        '<span class="cg-wa-widget__action-arrow" aria-hidden="true">→</span>' +
        "</a>"
      );
    }).join("");
  }

  function mountWidget() {
    if (document.getElementById("cgWhatsAppWidget")) return;

    var root = document.createElement("div");
    root.id = "cgWhatsAppWidget";
    root.className = "cg-wa-widget";
    root.innerHTML =
      '<div class="cg-wa-widget__backdrop" data-wa-close tabindex="-1" aria-hidden="true"></div>' +
      '<div class="cg-wa-widget__panel" id="cgWhatsAppPanel" role="menu" aria-label="WhatsApp options" hidden>' +
      '<div class="cg-wa-widget__panel-glow" aria-hidden="true"></div>' +
      '<div class="cg-wa-widget__actions">' +
      buildPanelActions() +
      "</div></div>" +
      '<button type="button" class="cg-wa-widget__fab" id="cgWhatsAppFab" aria-label="WhatsApp" aria-expanded="false" aria-controls="cgWhatsAppPanel" aria-haspopup="menu">' +
      '<span class="cg-wa-widget__ring cg-wa-widget__ring--1" aria-hidden="true"></span>' +
      '<span class="cg-wa-widget__ring cg-wa-widget__ring--2" aria-hidden="true"></span>' +
      '<span class="cg-wa-widget__glow" aria-hidden="true"></span>' +
      '<span class="cg-wa-widget__fab-core">' +
      WA_ICON +
      "</span>" +
      "</button>";

    document.body.appendChild(root);

    var fab = document.getElementById("cgWhatsAppFab");
    var panel = document.getElementById("cgWhatsAppPanel");

    function setOpen(on) {
      root.classList.toggle("is-open", on);
      if (fab) {
        fab.setAttribute("aria-expanded", on ? "true" : "false");
        fab.setAttribute("aria-label", on ? "Close WhatsApp menu" : "WhatsApp");
      }
      if (panel) panel.hidden = !on;
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

    root.querySelectorAll(".cg-wa-widget__action").forEach(function (link) {
      link.addEventListener("click", function () {
        setOpen(false);
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("is-open")) setOpen(false);
    });
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
