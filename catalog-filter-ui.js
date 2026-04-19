/**
 * Dual-thumb price range (two range inputs) synced to min/max fields + optional label.
 */
(function (global) {
  "use strict";

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function num(v, def) {
    var n = parseInt(String(v || ""), 10);
    return Number.isFinite(n) ? n : def;
  }

  /**
   * @param {object} o
   * @param {string} [o.rootId] - if set, guard duplicate wire via data-cg-dual-range
   * @param {string} o.rangeMinId
   * @param {string} o.rangeMaxId
   * @param {string} o.inputMinId
   * @param {string} o.inputMaxId
   * @param {string} [o.labelId]
   * @param {number} o.absMax - slider max (₹)
   * @param {number} [o.step]
   * @param {function} o.onCommit - called when user finishes a drag (change) or after input settle
   */
  function wireDualPriceRange(o) {
    var root = o.rootId ? document.getElementById(o.rootId) : null;
    if (root && root.getAttribute("data-cg-dual-range") === "1") return;
    if (root) root.setAttribute("data-cg-dual-range", "1");

    var rLo = document.getElementById(o.rangeMinId);
    var rHi = document.getElementById(o.rangeMaxId);
    var iLo = document.getElementById(o.inputMinId);
    var iHi = document.getElementById(o.inputMaxId);
    var lab = o.labelId ? document.getElementById(o.labelId) : null;
    if (!rLo || !rHi || !iLo || !iHi) return;

    var absMax = Math.max(100, Math.floor(Number(o.absMax) || 5000));
    var step = Math.max(1, Math.floor(Number(o.step) || 25));

    rLo.min = "0";
    rLo.max = String(absMax);
    rLo.step = String(step);
    rHi.min = "0";
    rHi.max = String(absMax);
    rHi.step = String(step);

    function readMinMax() {
      var rawMin = String(iLo.value || "").trim();
      var rawMax = String(iHi.value || "").trim();
      var mn = /^[0-9]+(\.[0-9]+)?$/.test(rawMin) ? Math.round(parseFloat(rawMin, 10)) : 0;
      var mx = /^[0-9]+(\.[0-9]+)?$/.test(rawMax) ? Math.round(parseFloat(rawMax, 10)) : absMax;
      mn = clamp(mn, 0, absMax);
      mx = clamp(mx, 0, absMax);
      if (mn > mx) {
        var t2 = mn;
        mn = mx;
        mx = t2;
      }
      return { mn: mn, mx: mx };
    }

    function syncSlidersFromInputs() {
      var x = readMinMax();
      var lo = x.mn;
      var hi = x.mx;
      if (!/^[0-9]+(\.[0-9]+)?$/.test(String(iLo.value || "").trim())) lo = 0;
      if (!/^[0-9]+(\.[0-9]+)?$/.test(String(iHi.value || "").trim())) hi = absMax;
      lo = clamp(lo, 0, absMax);
      hi = clamp(hi, 0, absMax);
      if (lo > hi) hi = lo;
      rLo.value = String(lo);
      rHi.value = String(hi);
      updateLabel(lo, hi);
    }

    function updateLabel(lo, hi) {
      if (!lab) return;
      var noMin = lo <= 0;
      var noMax = hi >= absMax;
      if (noMin && noMax) {
        lab.textContent = "Any price";
      } else if (noMin) {
        lab.textContent = "Up to ₹" + hi;
      } else if (noMax) {
        lab.textContent = "From ₹" + lo + "+";
      } else {
        lab.textContent = "₹" + lo + " – ₹" + hi;
      }
    }

    function commitInputsFromSliders() {
      var lo = num(rLo.value, 0);
      var hi = num(rHi.value, absMax);
      lo = clamp(lo, 0, absMax);
      hi = clamp(hi, 0, absMax);
      if (lo > hi) hi = lo;
      iLo.value = lo <= 0 ? "" : String(lo);
      iHi.value = hi >= absMax ? "" : String(hi);
      updateLabel(lo, hi);
      if (typeof o.onCommit === "function") o.onCommit();
    }

    function onLoInput() {
      var lo = num(rLo.value, 0);
      var hi = num(rHi.value, absMax);
      lo = clamp(lo, 0, absMax);
      hi = clamp(hi, 0, absMax);
      if (lo > hi) rHi.value = String(lo);
      updateLabel(num(rLo.value, 0), num(rHi.value, absMax));
    }

    function onHiInput() {
      var lo = num(rLo.value, 0);
      var hi = num(rHi.value, absMax);
      lo = clamp(lo, 0, absMax);
      hi = clamp(hi, 0, absMax);
      if (hi < lo) rLo.value = String(hi);
      updateLabel(num(rLo.value, 0), num(rHi.value, absMax));
    }

    function onChange() {
      commitInputsFromSliders();
    }

    rLo.addEventListener("input", onLoInput);
    rHi.addEventListener("input", onHiInput);
    rLo.addEventListener("change", onChange);
    rHi.addEventListener("change", onChange);

    syncSlidersFromInputs();

    return {
      reset: function () {
        iLo.value = "";
        iHi.value = "";
        syncSlidersFromInputs();
      },
      syncFromInputs: syncSlidersFromInputs,
      absMax: absMax,
    };
  }

  global.CraftguruCatalogFilterUi = {
    wireDualPriceRange: wireDualPriceRange,
  };
})(typeof window !== "undefined" ? window : this);
