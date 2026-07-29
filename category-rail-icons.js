/**
 * Shared premium category-rail icons (home + guest + RM/PF trees).
 * One design language: outline SVG + label + chevron — no thumbnails.
 */
(function (global) {
  "use strict";

  var ICONS = {
    "mini-resin-deshboard":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#1e8e84" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/></svg>',
    "resin-car-hanging":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#148f7f" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 14.5h15"/><path d="M6 14.5l1.4-4.2A2 2 0 019.3 9h5.4a2 2 0 011.9 1.3L18 14.5"/><circle cx="7.5" cy="16.5" r="1.4"/><circle cx="16.5" cy="16.5" r="1.4"/><path d="M5.5 14.5V13a1 1 0 011-1h11a1 1 0 011 1v1.5"/></svg>',
    "resin-clocks":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#26a69a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.8v4.4l3 1.8"/></svg>',
    "resin-coasters":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#0f766e" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="3"/><circle cx="12" cy="12" r="3.6"/><path d="M12 8.4v7.2M8.4 12h7.2"/></svg>',
    "resin-customised-frames":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#1e8e84" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1.5"/><rect x="7" y="8" width="10" height="8" rx="0.8"/></svg>',
    "resin-cutlery-and-tissue-holder":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#243656" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4v7a2 2 0 002 2v7"/><path d="M6.5 4v4.5M9.5 4v4.5"/><path d="M16 4c2.2 0 3.5 1.8 3.5 4S18.2 12 16 12v8"/><path d="M16 4v8"/></svg>',
    "resin-guruji-products":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#26a69a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19c-3.5-2.2-6-5.2-6-8.2A3.8 3.8 0 0112 7.2a3.8 3.8 0 016 3.6c0 3-2.5 6-6 8.2z"/><path d="M12 7.2V4.8M9.2 5.6l1.2 1.4M14.8 5.6l-1.2 1.4"/></svg>',
    "resin-key-holder":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#148f7f" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.2" cy="10" r="3.4"/><path d="M11.2 12.2L19 20"/><path d="M16.2 17.2l2.2-2.2M18 19l2.1-2.1"/></svg>',
    "resin-keychains":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#1a2b48" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="9.5" r="3.3"/><circle cx="15.5" cy="14.5" r="3.3"/><path d="M10.8 11.8l2.4 2.4"/></svg>',
    "resin-mantra-frame":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#148f7f" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.8l1.6 4.2 4.5.3-3.5 2.9 1.2 4.4L12 13.6 8.2 15.6l1.2-4.4-3.5-2.9 4.5-.3L12 3.8z"/><circle cx="12" cy="11.2" r="1.5"/></svg>',
    "resin-name-plates":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#26a69a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="17" height="10" rx="2"/><path d="M7 12h10M7 14.5h6"/></svg>',
    "resin-pooja-plate":
      '<svg viewBox="0 0 24 24" fill="none" stroke="#0f766e" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="13" rx="8" ry="5.5"/><path d="M12 7.5v3.2M10 8.2l2 1.2 2-1.2"/></svg>',
  };

  var FALLBACK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1a2b48" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 12h6"/></svg>';

  /** Extra shop links / RM taxonomy keys → icon key or inline stroke colour set */
  var ALIAS = {
    "raw-material-shop.html": "resin-coasters",
    "photo-frame-shop.html": "resin-customised-frames",
    "photo-frames.html": "resin-customised-frames",
    "return-gifts.html": "resin-keychains",
  };

  var RM_PALETTE = ["#1e8e84", "#148f7f", "#26a69a", "#0f766e", "#1e8e84", "#243656", "#1a2b48", "#148f7f", "#26a69a", "#0f766e"];

  function normalizeId(id) {
    return String(id == null ? "" : id)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
  }

  function iconSvgFor(idOrKey) {
    var key = normalizeId(idOrKey);
    if (ALIAS[key]) key = ALIAS[key];
    if (ICONS[key]) return ICONS[key];
    /* fuzzy: match known catalog id contained in key */
    var found = null;
    Object.keys(ICONS).some(function (k) {
      if (key.indexOf(k) >= 0 || k.indexOf(key) >= 0) {
        found = ICONS[k];
        return true;
      }
      return false;
    });
    return found || FALLBACK;
  }

  function iconHtml(idOrKey) {
    return '<span class="category-pill__icon" aria-hidden="true">' + iconSvgFor(idOrKey) + "</span>";
  }

  function chevronHtml() {
    return '<span class="category-pill__chev" aria-hidden="true">›</span>';
  }

  /** Fill an <a class="category-pill…"> with icon + label + chevron (no images). */
  function fillRailLink(anchor, opts) {
    opts = opts || {};
    if (!anchor) return;
    var id = opts.id || "";
    var label = opts.label != null ? String(opts.label) : id;
    anchor.textContent = "";
    var icon = document.createElement("span");
    icon.className = "category-pill__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = iconSvgFor(id || label);
    var lab = document.createElement("span");
    lab.className = "category-pill__label";
    lab.textContent = label;
    var chev = document.createElement("span");
    chev.className = "category-pill__chev";
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = "›";
    anchor.appendChild(icon);
    anchor.appendChild(lab);
    anchor.appendChild(chev);
  }

  /** HTML snippet for RM/PF tree icon slot (replaces thumbnail img). */
  function treeIconHtml(idOrName, index) {
    var svg = iconSvgFor(idOrName);
    /* tint fallback by index for variety when id unknown */
    if (!ICONS[normalizeId(idOrName)] && !ALIAS[normalizeId(idOrName)]) {
      var color = RM_PALETTE[(index || 0) % RM_PALETTE.length];
      svg = FALLBACK.replace('stroke="#1a2b48"', 'stroke="' + color + '"');
    }
    return '<span class="rm-nav-tree__ico rm-nav-tree__ico--svg category-pill__icon" aria-hidden="true">' + svg + "</span>";
  }

  global.CRAFT_RAIL_ICONS = {
    ICONS: ICONS,
    FALLBACK: FALLBACK,
    iconSvgFor: iconSvgFor,
    iconHtml: iconHtml,
    chevronHtml: chevronHtml,
    fillRailLink: fillRailLink,
    treeIconHtml: treeIconHtml,
  };
})(typeof window !== "undefined" ? window : this);
