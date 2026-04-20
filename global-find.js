/**
 * Top-right catalog search + sort (single control on every page).
 */
(function () {
  "use strict";

  var root;
  var trigger;
  var popover;
  var query;
  var sort;
  var wrap;
  var hint;
  var kicker;
  var mode = "home";

  function $(id) {
    return document.getElementById(id);
  }

  function fillSortOptions(m) {
    if (!sort) return;
    sort.innerHTML = "";
    var rows = [];
    if (m === "category") {
      rows = [
        ["name-asc", "Name · A → Z"],
        ["name-desc", "Name · Z → A"],
        ["price-asc", "From price · low → high"],
        ["price-desc", "From price · high → low"],
        ["relevance", "Curated mix"],
      ];
    } else if (m === "checkout") {
      rows = [
        ["default", "Cart order"],
        ["name-asc", "Name · A → Z"],
        ["name-desc", "Name · Z → A"],
        ["line-low", "Line total · low → high"],
        ["line-high", "Line total · high → low"],
      ];
    }
    rows.forEach(function (o) {
      var op = document.createElement("option");
      op.value = o[0];
      op.textContent = o[1];
      sort.appendChild(op);
    });
  }

  function setModeCopy(m) {
    if (!query || !kicker) return;
    if (m === "home") {
      kicker.textContent = "Studio index";
      query.placeholder = "Type any part of a name — matches as you type…";
      if (wrap) wrap.hidden = true;
      if (hint) hint.textContent = "";
    } else if (m === "category") {
      kicker.textContent = "This category";
      query.placeholder = "Any word fragment or digits — updates live…";
      if (wrap) wrap.hidden = true;
      if (hint) hint.textContent = "";
    } else if (m === "checkout") {
      kicker.textContent = "Order lens";
      query.placeholder = "Highlight lines by name, size, or ₹…";
      if (wrap) wrap.hidden = false;
      if (hint) hint.textContent = "";
    } else if (m === "product") {
      kicker.textContent = "Continue browsing";
      query.placeholder = "Search this line, then press Enter…";
      if (wrap) wrap.hidden = true;
      if (hint) hint.textContent = "Opens the category gallery with name & price filters.";
    } else if (m === "about") {
      kicker.textContent = "Catalog jump";
      query.placeholder = "Find on Home, then Enter…";
      if (wrap) wrap.hidden = true;
      if (hint) hint.textContent = "";
    } else if (m === "raw-material") {
      kicker.textContent = "Raw materials";
      query.placeholder = "Filter by name, SKU, or id…";
      if (wrap) wrap.hidden = true;
      if (hint) {
        hint.textContent =
          "Matches resin supplies only (not the main resin gift catalog). On the shop, this also narrows the grid below.";
      }
    }
  }

  function openPop() {
    if (!popover || !trigger) return;
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    requestAnimationFrame(function () {
      if (query) {
        try {
          query.focus({ preventScroll: true });
        } catch (_) {
          query.focus();
        }
      }
    });
  }

  function closePop() {
    if (!popover || !trigger) return;
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function togglePop() {
    if (!popover) return;
    if (popover.hidden) openPop();
    else closePop();
  }

  function onDocDown(e) {
    if (!root || !popover || popover.hidden) return;
    var t = e.target;
    if (root.contains(t)) return;
    closePop();
  }

  function boot() {
    root = $("globalFindRoot");
    if (!root) return;
    trigger = $("globalFindTrigger");
    popover = $("globalFindPopover");
    query = $("globalFindQuery");
    sort = $("globalFindSort");
    wrap = $("globalFindSortWrap");
    hint = $("globalFindHint");
    kicker = $("globalFindKicker");
    mode = root.getAttribute("data-find-mode") || "home";

    fillSortOptions(mode);
    setModeCopy(mode);

    if (trigger) {
      trigger.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        togglePop();
      });
    }

    document.addEventListener("mousedown", onDocDown);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePop();
    });

    if (mode === "about" && query) {
      query.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        var v = query.value.trim();
        if (!v) return;
        e.preventDefault();
        window.location.href = "index.html?q=" + encodeURIComponent(v) + "#categories";
      });
    }
  }

  window.GLOBAL_FIND = {
    setSortBlockVisible: function (show) {
      var w = $("globalFindSortWrap");
      if (w) w.hidden = !show;
    },
    open: openPop,
    close: closePop,
    getMode: function () {
      return mode;
    },
    clearHint: function () {
      var h = $("globalFindHint");
      if (h) h.textContent = "";
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
