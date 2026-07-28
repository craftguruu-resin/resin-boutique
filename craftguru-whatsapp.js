/**
 * Central Craftguru WhatsApp helpers (store number + bulk enquiry links).
 * Change PHONE here once; guest widget and Bulk Buy buttons reuse it.
 */
(function (global) {
  "use strict";

  /** E.164 digits only (no +). Store WhatsApp Business. */
  var PHONE = "918824350056";

  var TOOLTIP = "Contact us for bulk orders and wholesale pricing.";

  var ICON_SVG =
    '<svg class="bulk-buy-btn__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>' +
    "</svg>";

  function escapeAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/'/g, "&#39;");
  }

  function absoluteUrl(pathOrUrl) {
    try {
      return new URL(String(pathOrUrl || ""), global.location.href).href;
    } catch (_) {
      return String(pathOrUrl || (global.location && global.location.href) || "");
    }
  }

  function buildUrl(text) {
    return "https://wa.me/" + PHONE + "?text=" + encodeURIComponent(String(text == null ? "" : text));
  }

  function bulkEnquiryMessage(opts) {
    opts = opts || {};
    var name = String(opts.productName != null ? opts.productName : opts.name || "product").trim() || "product";
    var id = String(opts.productId != null ? opts.productId : opts.id || "").trim();
    var url = absoluteUrl(opts.productUrl != null ? opts.productUrl : opts.url || (global.location && global.location.href) || "");
    return (
      "Hi, I'm interested in buying this product in bulk.\n\n" +
      "Product Name: " +
      name +
      "\n" +
      "Product ID: " +
      id +
      "\n" +
      "Product URL: " +
      url +
      "\n\n" +
      "Please share:\n" +
      "- Bulk pricing\n" +
      "- Minimum Order Quantity (MOQ)\n" +
      "- Delivery timeline\n" +
      "- Available stock"
    );
  }

  function bulkBuyUrl(opts) {
    return buildUrl(bulkEnquiryMessage(opts));
  }

  /** Opens WhatsApp app on mobile / WhatsApp Web on desktop via wa.me */
  function openBulkBuy(opts) {
    var u = bulkBuyUrl(opts);
    try {
      global.open(u, "_blank", "noopener,noreferrer");
    } catch (_) {
      global.location.href = u;
    }
  }

  function buttonHtml(opts) {
    opts = opts || {};
    var href = bulkBuyUrl(opts);
    var extra = opts.className ? " " + String(opts.className) : "";
    var idAttr = opts.id ? ' id="' + escapeAttr(opts.id) + '"' : "";
    return (
      '<a class="bulk-buy-btn' +
      extra +
      '"' +
      idAttr +
      ' href="' +
      escapeAttr(href) +
      '" target="_blank" rel="noopener noreferrer" title="' +
      escapeAttr(TOOLTIP) +
      '" aria-label="Bulk Buy. ' +
      escapeAttr(TOOLTIP) +
      '">' +
      ICON_SVG +
      '<span class="bulk-buy-btn__label">Bulk Buy</span></a>'
    );
  }

  function listingButtonHtml(opts) {
    opts = opts || {};
    opts.className = (opts.className ? opts.className + " " : "") + "bulk-buy-btn--card";
    return buttonHtml(opts);
  }

  function pdpButtonHtml(opts) {
    opts = opts || {};
    opts.className = (opts.className ? opts.className + " " : "") + "bulk-buy-btn--pdp";
    return buttonHtml(opts);
  }

  global.CRAFTGURU_WA = {
    PHONE: PHONE,
    TOOLTIP: TOOLTIP,
    ICON_SVG: ICON_SVG,
    buildUrl: buildUrl,
    absoluteUrl: absoluteUrl,
    bulkEnquiryMessage: bulkEnquiryMessage,
    bulkBuyUrl: bulkBuyUrl,
    openBulkBuy: openBulkBuy,
    buttonHtml: buttonHtml,
    listingButtonHtml: listingButtonHtml,
    pdpButtonHtml: pdpButtonHtml,
  };
})(typeof window !== "undefined" ? window : this);
